// SPDX-License-Identifier: SUL-1.0
// CYB-3D -- topology-only SBOM discovery, derived public export and migration preview.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { validateFeatureTopology } from "./feature-package-topology.mjs";
import { canonicalJson, validateSbomManifest } from "./sbom-manifest.mjs";

const own = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const SHA = /^[a-f0-9]{64}$/u;
const RELEASE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u;

function releaseReference(root, release) {
  if (!RELEASE.test(release ?? "")) return { ok: false, code: "SBOM-RELEASE-INVALID" };
  let value; try { value = JSON.parse(readFileSync(join(root, "docs", "releases", `${release}.json`), "utf8")); } catch { return { ok: false, code: "SBOM-RELEASE-NOT-REGISTERED" }; }
  if (!own(value, ["schema", "release", "featureId", "candidate", "sbomPath", "sbomSha256", "manifestSha256"])
    || value.schema !== "pipeline.sbom-release-reference.v1" || value.release !== release
    || typeof value.featureId !== "string" || !own(value.candidate, ["commit", "tree"])
    || !SHA.test(value.sbomSha256) || !SHA.test(value.manifestSha256) || typeof value.sbomPath !== "string") return { ok: false, code: "SBOM-RELEASE-INVALID" };
  return { ok: true, value };
}

/** Resolve exactly one declared supply-chain artifact; no filesystem path is guessed. */
export function discoverSbom(rootDir, { featureId = null, release = null } = {}) {
  const root = resolve(rootDir); const checked = validateFeatureTopology(root);
  if (!checked.ok) return { ok: false, code: "SBOM-TOPOLOGY-INVALID", findings: checked.findings };
  const selectedRelease = release === null ? null : releaseReference(root, release);
  if (selectedRelease !== null && !selectedRelease.ok) return selectedRelease;
  const artifacts = checked.receipts.filter((receipt) => featureId === null || receipt?.featureId === featureId).flatMap((receipt) => {
    try {
      const lifecycle = JSON.parse(readFileSync(join(root, receipt.manifest), "utf8"));
      return lifecycle.artifacts.filter((artifact) => artifact.class === "supply-chain").map((artifact) => ({ receipt, artifact }));
    } catch { return []; }
  });
  if (artifacts.length === 0) return { ok: false, code: "SBOM-NOT-REGISTERED" };
  const resolved = [];
  for (const { receipt, artifact } of artifacts) {
    let manifest;
    try { manifest = JSON.parse(readFileSync(join(root, artifact.path), "utf8")); }
    catch { return { ok: false, code: "SBOM-ARTIFACT-NOT-SBOM", path: artifact.path }; }
    if (!validateSbomManifest(manifest).valid) return { ok: false, code: "SBOM-ARTIFACT-NOT-SBOM", path: artifact.path };
    if (receipt.candidate === null || manifest.candidate.commit !== receipt.candidate.commit || manifest.candidate.tree !== receipt.candidate.tree) return { ok: false, code: "SBOM-ARTIFACT-UNBOUND", path: artifact.path };
    const bytes = readFileSync(join(root, artifact.path));
    if (createHash("sha256").update(bytes).digest("hex") !== artifact.sha256) return { ok: false, code: "SBOM-ARTIFACT-UNBOUND", path: artifact.path };
    const candidate = receipt.candidate;
    if (selectedRelease !== null && (selectedRelease.value.featureId !== receipt.featureId || selectedRelease.value.sbomPath !== artifact.path || selectedRelease.value.sbomSha256 !== artifact.sha256 || selectedRelease.value.manifestSha256 !== createHash("sha256").update(canonicalJson(manifest)).digest("hex") || selectedRelease.value.candidate.commit !== candidate.commit || selectedRelease.value.candidate.tree !== candidate.tree)) continue;
    resolved.push({ featureId: receipt.featureId, candidate, path: artifact.path, sha256: artifact.sha256, ...(selectedRelease === null ? {} : { release }) });
  }
  if (resolved.length !== 1) return { ok: false, code: selectedRelease === null ? "SBOM-AMBIGUOUS-REGISTRATION" : "SBOM-RELEASE-BINDING-MISMATCH" };
  return { ok: true, artifact: resolved[0] };
}

/** A derived view that removes private component names/coordinates; never mutates the canonical record. */
export function exportPublicSbom(manifest) {
  if (!validateSbomManifest(manifest).valid) return { ok: false, code: "SBOM-EXPORT-INVALID" };
  const redact = manifest.privacy.classification === "private" || manifest.privacy.exportPolicy === "public-redacted";
  const components = manifest.components.map((component) => redact
    ? { ...component, id: "redacted", scope: "redacted", provenance: "redacted", relationships: [] }
    : { ...component, relationships: [...component.relationships] });
  return { ok: true, schema: "pipeline.sbom-public-export.v1", authoritative: false, payloadDigest: manifest.payload.canonicalSha256, components };
}

/** Explicitly reports zero writes until a separately approved migration writer exists. */
export function previewSbomMigration(rootDir) {
  const checked = validateFeatureTopology(resolve(rootDir));
  return { schema: "pipeline.sbom-migration-preview.v1", status: checked.inventory.packages.length === 0 ? "not-applicable" : "manual-migration-required", writes: [], findingCount: checked.findings.length };
}
