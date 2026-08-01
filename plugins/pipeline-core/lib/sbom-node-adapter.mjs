// SPDX-License-Identifier: SUL-1.0
// CYB-3C -- deterministic Node reference adapter for already-observed graphs.
import { canonicalizeSbomPayload } from "./sbom-manifest.mjs";
import { createHash } from "node:crypto";

export const NODE_GRAPH_SCHEMA = "pipeline.sbom-node-graph.v1";
const own = (value, fields) => value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === fields.length && fields.every((field) => Object.hasOwn(value, field));
const string = (value) => typeof value === "string" && value.trim() !== "";
const spdxId = (componentId) => `SPDXRef-${createHash("sha256").update(componentId).digest("hex").slice(0, 32)}`;

/** Validate a closed normalized Node graph before producing either format view. */
export function validateNodeDependencyGraph(graph) {
  if (!own(graph, ["schema", "components"]) || graph.schema !== NODE_GRAPH_SCHEMA || !Array.isArray(graph.components) || graph.components.length === 0) return { valid: false, code: "SBOM-NODE-GRAPH-INVALID" };
  const ids = new Set();
  for (const component of graph.components) {
    if (!own(component, ["id", "scope", "name", "version", "dependencies"]) || !string(component.id) || !string(component.scope) || !string(component.name) || !string(component.version) || !Array.isArray(component.dependencies) || !component.dependencies.every(string) || ids.has(component.id)) return { valid: false, code: "SBOM-NODE-GRAPH-INVALID" };
    ids.add(component.id);
  }
  if (graph.components.some((component) => component.dependencies.some((id) => !ids.has(id)))) return { valid: false, code: "SBOM-NODE-TRANSITIVE-MISSING" };
  return { valid: true };
}

/** Produce equivalent pinned CycloneDX/SPDX views from one normalized graph. */
export function generateNodeSbom(graph) {
  const validation = validateNodeDependencyGraph(graph);
  if (!validation.valid) return validation;
  const components = [...graph.components].sort((left, right) => left.id.localeCompare(right.id));
  const spdxIds = new Map(components.map((component) => [component.id, spdxId(component.id)]));
  const cyclonedx = {
    bomFormat: "CycloneDX", specVersion: "1.6", version: 1,
    components: components.map((component) => ({ type: "library", "bom-ref": component.id, name: component.name, version: component.version, properties: [{ name: "pipeline.scope", value: component.scope }] })),
    dependencies: components.map((component) => ({ ref: component.id, dependsOn: [...component.dependencies].sort() })),
  };
  const spdx = {
    spdxVersion: "SPDX-2.3", dataLicense: "CC0-1.0", SPDXID: "SPDXRef-DOCUMENT", name: "node-dependency-graph", documentNamespace: "https://pipeline.invalid/sbom/node",
    creationInfo: { creators: ["Tool: pipeline-node-reference"], created: "1970-01-01T00:00:00Z" },
    packages: components.map((component) => ({ SPDXID: spdxIds.get(component.id), name: component.name, versionInfo: component.version, downloadLocation: "NOASSERTION", externalRefs: [{ referenceCategory: "PACKAGE-MANAGER", referenceType: "purl", referenceLocator: component.id }], annotations: [{ annotationType: "OTHER", annotator: "Tool: pipeline-node-reference", annotationDate: "1970-01-01T00:00:00Z", comment: `scope:${component.scope}` }] })),
    relationships: components.flatMap((component) => component.dependencies.sort().map((dependency) => ({ spdxElementId: spdxIds.get(component.id), relationshipType: "DEPENDS_ON", relatedSpdxElement: spdxIds.get(dependency) }))),
  };
  const cdx = canonicalizeSbomPayload("cyclonedx-json", cyclonedx);
  const spdxResult = canonicalizeSbomPayload("spdx-json", spdx);
  if (!cdx.valid || !spdxResult.valid) return { valid: false, code: "SBOM-NODE-PROFILE-INVALID" };
  return { valid: true, cyclonedx, spdx, digests: { "cyclonedx-json": cdx.sha256, "spdx-json": spdxResult.sha256 } };
}
