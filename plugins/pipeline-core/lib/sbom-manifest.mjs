// SPDX-License-Identifier: SUL-1.0
// CYB-3A -- pure, provider-neutral SBOM manifest boundary. No file, process or network I/O.
import { createHash } from "node:crypto";

export const SBOM_MANIFEST_SCHEMA = "pipeline.sbom-manifest.v1";
export const SBOM_FORMAT_PROFILES = Object.freeze({ "cyclonedx-json": "CycloneDX-1.6", "spdx-json": "SPDX-2.3" });
export const SBOM_LIFECYCLE_STATES = Object.freeze(["complete", "stale", "invalid", "partial", "unsupported", "unavailable", "not-applicable"]);
export const SBOM_LIFECYCLE_CODES = Object.freeze({
  complete: "SBOM-COMPLETE",
  candidateStale: "SBOM-CANDIDATE-STALE",
  sourceInputsStale: "SBOM-SOURCE-INPUTS-STALE",
  invalidFacts: "SBOM-LIFECYCLE-FACTS-INVALID",
  invalidRecord: "SBOM-RECORD-INVALID",
  partial: "SBOM-PARTIAL",
  unsupported: "SBOM-ADAPTER-UNSUPPORTED",
  unavailable: "SBOM-OBSERVATION-UNAVAILABLE",
  missing: "SBOM-MISSING",
  notApplicable: "SBOM-NOT-APPLICABLE",
});

const HEX = /^[a-f0-9]{64}$/;
const GIT_OBJECT = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const SPDX_ID = /^SPDXRef-[A-Za-z0-9.-]+$/;
const CYCLONEDX_COMPONENT_TYPES = new Set(["application", "container", "device", "device-driver", "file", "firmware", "framework", "library", "machine-learning-model", "operating-system", "platform"]);
const ROOT = ["schema", "candidate", "sourceInputs", "adapter", "formats", "components", "completeness", "freshness", "privacy", "payload", "lifecycle"];
const CANDIDATE = ["repositoryFingerprint", "commit", "tree"];
const ADAPTER = ["id", "version", "configSha256"];
const FORMAT = ["format", "profile", "payloadSha256"];
const COMPONENT = ["id", "scope", "provenance", "relationships"];
const COMPLETENESS = ["status", "declared", "observed"];
const FRESHNESS = ["status", "candidateMatches", "sourceInputsMatch"];
const PRIVACY = ["classification", "exportPolicy"];
const PAYLOAD = ["canonicalSha256", "formats"];
const LIFECYCLE = ["state", "code"];
const LIFECYCLE_CODE_BY_STATE = Object.freeze({
  complete: [SBOM_LIFECYCLE_CODES.complete],
  stale: [SBOM_LIFECYCLE_CODES.candidateStale, SBOM_LIFECYCLE_CODES.sourceInputsStale],
  invalid: [SBOM_LIFECYCLE_CODES.invalidFacts, SBOM_LIFECYCLE_CODES.invalidRecord],
  partial: [SBOM_LIFECYCLE_CODES.partial],
  unsupported: [SBOM_LIFECYCLE_CODES.unsupported],
  unavailable: [SBOM_LIFECYCLE_CODES.unavailable, SBOM_LIFECYCLE_CODES.missing],
  "not-applicable": [SBOM_LIFECYCLE_CODES.notApplicable],
});
const own = (value, fields) => value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === fields.length && fields.every((field) => Object.hasOwn(value, field));
const string = (value) => typeof value === "string" && value.trim() !== "";
const digest = (value) => createHash("sha256").update(value).digest("hex");
const objectsWith = (value, fields) => Array.isArray(value) && value.every((entry) => entry !== null && typeof entry === "object" && !Array.isArray(entry) && fields.every((field) => string(entry[field])));
const stringArray = (value) => Array.isArray(value) && value.length > 0 && value.every(string);
const unique = (values) => new Set(values).size === values.length;
const sameStrings = (left, right) => left.length === right.length && left.every((value) => right.includes(value));

/** Stable JSON encoding with lexicographically ordered object keys. */
export function canonicalJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("SBOM-CANONICAL-NONFINITE");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value === undefined || typeof value !== "object") throw new TypeError("SBOM-CANONICAL-TYPE");
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

function normalizedPayload(format, payload) {
  const copy = JSON.parse(JSON.stringify(payload));
  if (format === "cyclonedx-json") {
    delete copy.serialNumber;
    if (copy.metadata && typeof copy.metadata === "object") delete copy.metadata.timestamp;
    if (Array.isArray(copy.components)) copy.components.forEach((component) => { if (Array.isArray(component?.properties)) component.properties.sort((left, right) => left.name.localeCompare(right.name)); });
  } else if (copy.creationInfo && typeof copy.creationInfo === "object") delete copy.creationInfo.created;
  return copy;
}

/**
 * Check the required fields of the two pinned JSON interchange profiles before
 * a payload can be digested. The portable core deliberately accepts no
 * profile/version aliases: adapters must emit CycloneDX 1.6 or SPDX 2.3.
 */
export function validateSbomPayload(format, payload) {
  if (!Object.hasOwn(SBOM_FORMAT_PROFILES, format) || payload === null || typeof payload !== "object" || Array.isArray(payload)) return { valid: false, code: "SBOM-PAYLOAD-FORMAT" };
  if (format === "cyclonedx-json") {
    const refs = Array.isArray(payload.components) ? payload.components.map((component) => component?.["bom-ref"]) : [];
    const valid = payload.bomFormat === "CycloneDX" && payload.specVersion === "1.6" && Number.isInteger(payload.version) && payload.version >= 1
      && objectsWith(payload.components, ["type", "bom-ref", "name", "version"]) && payload.components.every((component) => CYCLONEDX_COMPONENT_TYPES.has(component.type))
      && unique(refs) && payload.components.every((component) => Array.isArray(component.properties) && component.properties.every((property) => own(property, ["name", "value"]) && string(property.name) && string(property.value)) && component.properties.filter((property) => property.name === "pipeline.scope").length === 1 && component.properties.filter((property) => property.name === "pipeline.provenance").length === 1)
      && Array.isArray(payload.dependencies) && payload.dependencies.length === payload.components.length
      && payload.dependencies.every((dependency) => own(dependency, ["ref", "dependsOn"]) && string(dependency.ref) && refs.includes(dependency.ref) && Array.isArray(dependency.dependsOn) && dependency.dependsOn.every((reference) => string(reference) && reference !== dependency.ref && refs.includes(reference)) && unique(dependency.dependsOn))
      && unique(payload.dependencies.map((dependency) => dependency.ref));
    return valid ? { valid: true } : { valid: false, code: "SBOM-CYCLONEDX-PROFILE" };
  }
  const packageIds = Array.isArray(payload.packages) ? payload.packages.map((pkg) => pkg?.SPDXID) : [];
  const packagePurls = Array.isArray(payload.packages) ? payload.packages.map((pkg) => pkg?.externalRefs?.filter((reference) => reference?.referenceType === "purl").map((reference) => reference.referenceLocator) ?? []) : [];
  const valid = payload.spdxVersion === "SPDX-2.3" && payload.dataLicense === "CC0-1.0" && payload.SPDXID === "SPDXRef-DOCUMENT" && string(payload.name) && string(payload.documentNamespace)
    && payload.creationInfo !== null && typeof payload.creationInfo === "object" && !Array.isArray(payload.creationInfo) && string(payload.creationInfo.created) && stringArray(payload.creationInfo.creators)
    && objectsWith(payload.packages, ["SPDXID", "name", "versionInfo", "downloadLocation"]) && packageIds.every((id) => SPDX_ID.test(id)) && unique(packageIds) && payload.packages.every((pkg, index) => string(pkg.downloadLocation) && packagePurls[index].length === 1 && string(packagePurls[index][0]) && pkg.externalRefs.every((reference) => own(reference, ["referenceCategory", "referenceType", "referenceLocator"]) && reference.referenceCategory === "PACKAGE-MANAGER" && reference.referenceType === "purl" && string(reference.referenceLocator)) && Array.isArray(pkg.annotations) && pkg.annotations.every((annotation) => own(annotation, ["annotationType", "annotator", "annotationDate", "comment"]) && annotation.annotationType === "OTHER" && string(annotation.annotator) && string(annotation.annotationDate) && string(annotation.comment)) && pkg.annotations.filter((annotation) => annotation.comment.startsWith("scope:") && string(annotation.comment.slice("scope:".length))).length === 1 && pkg.annotations.filter((annotation) => annotation.comment.startsWith("provenance:") && string(annotation.comment.slice("provenance:".length))).length === 1)
    && unique(packagePurls.map(([purl]) => purl))
    && Array.isArray(payload.relationships) && payload.relationships.every((relationship) => own(relationship, ["spdxElementId", "relationshipType", "relatedSpdxElement"]) && packageIds.includes(relationship.spdxElementId) && relationship.relationshipType === "DEPENDS_ON" && relationship.spdxElementId !== relationship.relatedSpdxElement && packageIds.includes(relationship.relatedSpdxElement))
    && unique(payload.relationships.map((relationship) => `${relationship.spdxElementId}\u0000${relationship.relatedSpdxElement}`));
  return valid ? { valid: true } : { valid: false, code: "SBOM-SPDX-PROFILE" };
}

/** Strip only prescribed volatile serial/timestamp values and bind the logical payload. */
export function canonicalizeSbomPayload(format, payload) {
  try {
    const profile = validateSbomPayload(format, payload);
    if (!profile.valid) return profile;
    const canonical = canonicalJson(normalizedPayload(format, payload));
    return { valid: true, canonical, sha256: digest(canonical) };
  } catch {
    return { valid: false, code: "SBOM-PAYLOAD-MALFORMED" };
  }
}

function closed(errors, value, fields, label) { if (!own(value, fields)) errors.push(`${label}: closed field set required`); }
function sha(value) { return typeof value === "string" && HEX.test(value); }
function candidateIdentity(value) { return own(value, CANDIDATE) && sha(value.repositoryFingerprint) && GIT_OBJECT.test(value.commit) && GIT_OBJECT.test(value.tree) && value.commit !== value.tree; }

/** A release candidate must be a syntactically valid Git identity and match the independently observed candidate exactly. */
export function validateSbomCandidateIdentity(candidate, observedCandidate) {
  return candidateIdentity(candidate) && candidateIdentity(observedCandidate) && CANDIDATE.every((field) => candidate[field] === observedCandidate[field]);
}

/** Validate the immutable closed manifest shape; malformed data never throws. */
export function validateSbomManifest(manifest) {
  const errors = [];
  closed(errors, manifest, ROOT, "$ ");
  if (!own(manifest, ROOT) || manifest.schema !== SBOM_MANIFEST_SCHEMA) errors.push("schema: expected pipeline.sbom-manifest.v1");
  closed(errors, manifest?.candidate, CANDIDATE, "candidate");
  if (!candidateIdentity(manifest?.candidate)) errors.push("candidate: repository fingerprint and distinct Git commit/tree identities required");
  if (!Array.isArray(manifest?.sourceInputs) || manifest.sourceInputs.length === 0 || !manifest.sourceInputs.every((entry) => own(entry, ["path", "sha256"]) && string(entry.path) && sha(entry.sha256))) errors.push("sourceInputs: non-empty closed digest list required");
  closed(errors, manifest?.adapter, ADAPTER, "adapter");
  if (!(string(manifest?.adapter?.id) && string(manifest?.adapter?.version) && sha(manifest?.adapter?.configSha256))) errors.push("adapter: id, version and config digest required");
  if (!Array.isArray(manifest?.formats) || manifest.formats.length !== 2 || !manifest.formats.every((entry) => own(entry, FORMAT) && SBOM_FORMAT_PROFILES[entry.format] === entry.profile && sha(entry.payloadSha256)) || Object.keys(SBOM_FORMAT_PROFILES).some((format) => !manifest.formats.some((entry) => entry.format === format))) errors.push("formats: exact pinned CycloneDX and SPDX bindings required");
  if (!Array.isArray(manifest?.components) || !manifest.components.every((entry) => own(entry, COMPONENT) && string(entry.id) && string(entry.scope) && string(entry.provenance) && Array.isArray(entry.relationships) && entry.relationships.every(string))) errors.push("components: closed component records required");
  closed(errors, manifest?.completeness, COMPLETENESS, "completeness");
  if (!(["complete", "partial", "unsupported"].includes(manifest?.completeness?.status) && Number.isInteger(manifest?.completeness?.declared) && Number.isInteger(manifest?.completeness?.observed) && manifest.completeness.declared >= manifest.completeness.observed && manifest.completeness.observed >= 0)) errors.push("completeness: invalid declaration");
  closed(errors, manifest?.freshness, FRESHNESS, "freshness");
  if (!(["fresh", "stale"].includes(manifest?.freshness?.status) && typeof manifest?.freshness?.candidateMatches === "boolean" && typeof manifest?.freshness?.sourceInputsMatch === "boolean")) errors.push("freshness: invalid declaration");
  if (manifest?.freshness?.status === "fresh" && (!manifest.freshness.candidateMatches || !manifest.freshness.sourceInputsMatch)) errors.push("freshness: fresh requires exact candidate and source-input matches");
  closed(errors, manifest?.privacy, PRIVACY, "privacy");
  if (!(["public", "private"].includes(manifest?.privacy?.classification) && ["public-redacted", "private-only"].includes(manifest?.privacy?.exportPolicy))) errors.push("privacy: invalid declaration");
  closed(errors, manifest?.payload, PAYLOAD, "payload");
  if (!(sha(manifest?.payload?.canonicalSha256) && own(manifest?.payload?.formats, Object.keys(SBOM_FORMAT_PROFILES)) && Object.entries(SBOM_FORMAT_PROFILES).every(([format, profile]) => manifest.payload.formats[format]?.profile === profile && sha(manifest.payload.formats[format]?.sha256)))) errors.push("payload: canonical and profile digests required");
  if (Array.isArray(manifest?.formats) && manifest?.payload?.formats && Object.keys(SBOM_FORMAT_PROFILES).some((format) => manifest.formats.find((entry) => entry.format === format)?.payloadSha256 !== manifest.payload.formats[format]?.sha256)) errors.push("payload: format digests must match manifest bindings");
  closed(errors, manifest?.lifecycle, LIFECYCLE, "lifecycle");
  if (!SBOM_LIFECYCLE_STATES.includes(manifest?.lifecycle?.state) || !LIFECYCLE_CODE_BY_STATE[manifest?.lifecycle?.state]?.includes(manifest?.lifecycle?.code)) errors.push("lifecycle: stable state and code required");
  if (manifest?.lifecycle?.state === "complete" && (manifest?.completeness?.status !== "complete" || manifest?.freshness?.status !== "fresh")) errors.push("lifecycle: complete requires complete and fresh inputs");
  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

/** Validate profile payloads, their per-format digests and the aggregate record digest. */
function equivalentProfiles(cyclonedx, spdxPayload) {
  const cdx = new Map(cyclonedx.components.map((component) => [component["bom-ref"], { name: component.name, version: component.version, scope: component.properties.find((property) => property.name === "pipeline.scope").value, provenance: component.properties.find((property) => property.name === "pipeline.provenance").value, dependencies: cyclonedx.dependencies.find((dependency) => dependency.ref === component["bom-ref"]).dependsOn }]));
  const spdxPurls = new Map(spdxPayload.packages.map((pkg) => [pkg.SPDXID, pkg.externalRefs.find((reference) => reference.referenceType === "purl").referenceLocator]));
  const spdx = new Map(spdxPayload.packages.map((pkg) => {
    const id = spdxPurls.get(pkg.SPDXID);
    const scope = pkg.annotations.find((annotation) => annotation.comment.startsWith("scope:")).comment.slice("scope:".length);
    const provenance = pkg.annotations.find((annotation) => annotation.comment.startsWith("provenance:")).comment.slice("provenance:".length);
    const dependencies = spdxPayload.relationships.filter((relationship) => relationship.spdxElementId === pkg.SPDXID).map((relationship) => spdxPurls.get(relationship.relatedSpdxElement));
    return [id, { name: pkg.name, version: pkg.versionInfo, scope, provenance, dependencies }];
  }));
  return cdx.size === spdx.size && [...cdx].every(([id, component]) => spdx.has(id) && component.name === spdx.get(id).name && component.version === spdx.get(id).version && component.scope === spdx.get(id).scope && component.provenance === spdx.get(id).provenance && sameStrings(component.dependencies, spdx.get(id).dependencies));
}

function equivalentManifestComponents(manifest, cyclonedx) {
  const payloadComponents = new Map(cyclonedx.components.map((component) => [component["bom-ref"], { scope: component.properties.find((property) => property.name === "pipeline.scope").value, provenance: component.properties.find((property) => property.name === "pipeline.provenance").value, relationships: cyclonedx.dependencies.find((dependency) => dependency.ref === component["bom-ref"]).dependsOn }]));
  return manifest.components.length === payloadComponents.size && manifest.components.every((component) => payloadComponents.has(component.id) && component.scope === payloadComponents.get(component.id).scope && component.provenance === payloadComponents.get(component.id).provenance && sameStrings(component.relationships, payloadComponents.get(component.id).relationships));
}

export function validateSbomRecord(manifest, payloads, observedCandidate) {
  const manifestResult = validateSbomManifest(manifest);
  if (!manifestResult.valid) return { valid: false, code: "SBOM-MANIFEST-INVALID", errors: manifestResult.errors };
  if (!validateSbomCandidateIdentity(manifest.candidate, observedCandidate)) return { valid: false, code: "SBOM-CANDIDATE-UNBOUND" };
  if (payloads === null || typeof payloads !== "object" || Array.isArray(payloads)) return { valid: false, code: "SBOM-PAYLOADS-INVALID" };
  const entries = [];
  for (const format of Object.keys(SBOM_FORMAT_PROFILES)) {
    const result = canonicalizeSbomPayload(format, payloads[format]);
    if (!result.valid) return { valid: false, code: result.code };
    const binding = manifest.formats.find((entry) => entry.format === format);
    if (result.sha256 !== binding.payloadSha256 || result.sha256 !== manifest.payload.formats[format].sha256) return { valid: false, code: "SBOM-PAYLOAD-DIGEST-MISMATCH" };
    entries.push(`${format}:${result.sha256}`);
  }
  if (!equivalentProfiles(payloads["cyclonedx-json"], payloads["spdx-json"])) return { valid: false, code: "SBOM-PROFILE-CROSS-FORMAT-MISMATCH" };
  if (!equivalentManifestComponents(manifest, payloads["cyclonedx-json"])) return { valid: false, code: "SBOM-MANIFEST-COMPONENT-MISMATCH" };
  const aggregate = digest(entries.sort().join("\n"));
  return aggregate === manifest.payload.canonicalSha256 ? { valid: true, digest: aggregate } : { valid: false, code: "SBOM-CANONICAL-DIGEST-MISMATCH" };
}

/**
 * Classify pre-observed SBOM facts without performing discovery or validation.
 * The input is deliberately closed so a missing observation cannot be mistaken
 * for an applicability exemption. Callers retain the returned reason code as
 * their stable, headless diagnostic.
 */
export function evaluateSbomLifecycle(facts) {
  if (!own(facts, ["applicability", "availability", "support", "record", "candidateMatches", "sourceInputsMatch", "completeness"])
    || !["applicable", "not-applicable"].includes(facts.applicability)
    || !["available", "unavailable"].includes(facts.availability)
    || !["supported", "unsupported"].includes(facts.support)
    || !["present", "missing", "invalid"].includes(facts.record)
    || typeof facts.candidateMatches !== "boolean"
    || typeof facts.sourceInputsMatch !== "boolean"
    || !["complete", "partial"].includes(facts.completeness)) return { state: "invalid", code: SBOM_LIFECYCLE_CODES.invalidFacts };
  if (facts.applicability === "not-applicable") return { state: "not-applicable", code: SBOM_LIFECYCLE_CODES.notApplicable };
  if (facts.availability === "unavailable") return { state: "unavailable", code: SBOM_LIFECYCLE_CODES.unavailable };
  if (facts.support === "unsupported") return { state: "unsupported", code: SBOM_LIFECYCLE_CODES.unsupported };
  if (facts.record === "missing") return { state: "unavailable", code: SBOM_LIFECYCLE_CODES.missing };
  if (facts.record === "invalid") return { state: "invalid", code: SBOM_LIFECYCLE_CODES.invalidRecord };
  if (!facts.candidateMatches) return { state: "stale", code: SBOM_LIFECYCLE_CODES.candidateStale };
  if (!facts.sourceInputsMatch) return { state: "stale", code: SBOM_LIFECYCLE_CODES.sourceInputsStale };
  if (facts.completeness === "partial") return { state: "partial", code: SBOM_LIFECYCLE_CODES.partial };
  return { state: "complete", code: SBOM_LIFECYCLE_CODES.complete };
}
