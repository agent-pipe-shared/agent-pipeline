// SPDX-License-Identifier: SUL-1.0
// CYB-3D -- topology-only SBOM discovery, derived public export and migration preview.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { validateFeatureTopology } from "./feature-package-topology.mjs";
import { validateSbomManifest } from "./sbom-manifest.mjs";

/** Resolve exactly one declared supply-chain artifact; no filesystem path is guessed. */
export function discoverSbom(rootDir, { featureId = null } = {}) {
  const root = resolve(rootDir); const checked = validateFeatureTopology(root);
  if (!checked.ok) return { ok: false, code: "SBOM-TOPOLOGY-INVALID", findings: checked.findings };
  const matches = checked.receipts.filter((receipt) => featureId === null || receipt?.featureId === featureId).flatMap((receipt) => {
    try {
      const manifest = JSON.parse(readFileSync(join(root, receipt.manifest), "utf8"));
      return manifest.artifacts.filter((artifact) => artifact.class === "supply-chain").map((artifact) => ({ featureId: receipt.featureId, candidate: receipt.candidate, path: artifact.path, sha256: artifact.sha256 }));
    } catch { return []; }
  });
  if (matches.length === 0) return { ok: false, code: "SBOM-NOT-REGISTERED" };
  if (matches.length !== 1) return { ok: false, code: "SBOM-AMBIGUOUS-REGISTRATION" };
  return { ok: true, artifact: matches[0] };
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
