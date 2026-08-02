// SPDX-License-Identifier: SUL-1.0
/**
 * Non-authoritative, offline Evidence Viewer projections.
 *
 * This module never writes authority and never turns a derived status into an
 * approval.  `buildEvidenceViewModelFromFeaturePackage` is deliberately the
 * only filesystem-facing entry point: it obtains the manifest through the
 * closed feature-package validator before exposing any artifact metadata.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { validateFeaturePackage } from "./feature-package-topology.mjs";

const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const SHA = /^[a-f0-9]{64}$/u;
const VIEW_STATUSES = new Set(["pass", "fail", "unknown", "tampered", "misplaced", "orphaned", "legacy", "invalid", "unavailable"]);
const ARTIFACT_STATES = new Set(["verified", "unknown", "tampered", "misplaced", "orphaned", "legacy", "invalid", "unavailable"]);
const PACKAGE_STATES = new Set(["draft", "awaiting-approval", "approved", "implementing", "verifying", "completed", "superseded", "abandoned", "retained"]);
const EXPORT_STATES = new Set(["unavailable", "pending", "delivered", "retryable-failure", "quarantined"]);

function fail(code) { const error = new Error("Evidence view input is invalid."); error.code = code; throw error; }
function record(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exact(value, keys) { return record(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); }
function frozen(value) { return Object.freeze(value); }
function candidate(value) { return exact(value, ["commit", "tree"]) && OID.test(value.commit) && OID.test(value.tree); }
function statusForPackage(state, hasCandidate) {
  if (state === "abandoned") return "fail";
  // A valid completed package is not itself a successful Verify receipt.  Do
  // not manufacture a pass/release claim until the verifier projection is a
  // canonical viewer input as well.
  if (state === "completed" && hasCandidate) return "unknown";
  return "unknown";
}
function publicPath(path, index, sharing) { return sharing === "redacted" ? `artifact-${index + 1}` : path; }
function notice(valueClass, code, message) { return frozen({ valueClass, code, message }); }
function unavailableCandidate() { return frozen({ state: "unavailable", commit: null, tree: null }); }
function boundCandidate(value) { return frozen({ state: "fact", commit: value.commit, tree: value.tree }); }
function unavailableExportStatus() { return frozen({ state: "unavailable", destinationProfile: null, cursor: null, lag: null, receipt: null }); }
function exportStatus(value) {
  if (value === null || value === undefined) return unavailableExportStatus();
  if (!exact(value, ["schema", "destinationProfile", "state", "cursor", "lag", "receipt"]) || value.schema !== "pipeline.governance-export-view-status.v1" || typeof value.destinationProfile !== "string" || value.destinationProfile === "" || !EXPORT_STATES.has(value.state) || !Number.isSafeInteger(value.cursor) || value.cursor < 0 || !Number.isSafeInteger(value.lag) || value.lag < 0 || !(value.receipt === null || exact(value.receipt, ["batchId", "acknowledgementClass", "terminalDisposition"]))) fail("EVM-EXPORT");
  return frozen({ state: value.state, destinationProfile: value.destinationProfile, cursor: value.cursor, lag: value.lag, receipt: value.receipt === null ? null : frozen({ ...value.receipt }) });
}

/** Backwards-compatible pure builder for explicitly supplied, already validated facts. */
export function buildEvidenceViewModel(input) {
  if (!exact(input, ["candidate", "status", "artifacts"]) || !candidate(input.candidate) || !VIEW_STATUSES.has(input.status) || !Array.isArray(input.artifacts)) fail("EVM-INPUT");
  for (const artifact of input.artifacts) {
    if (!exact(artifact, ["path", "sha256", "state"]) || typeof artifact.path !== "string" || !SHA.test(artifact.sha256) || !ARTIFACT_STATES.has(artifact.state)) fail("EVM-ARTIFACT");
  }
  return frozen({
    schema: "pipeline.evidence-view-model.v1",
    authority: "non-authoritative",
    candidate: frozen({ ...input.candidate }),
    status: input.status,
    artifacts: frozen(input.artifacts.map((artifact) => frozen({ ...artifact }))),
  });
}

/**
 * Build a canonical package projection. Invalid topology produces an explicit
 * invalid view instead of a deceptive success or a partially trusted report.
 */
export function buildEvidenceViewModelFromFeaturePackage({ rootDir = process.cwd(), manifestPath, sharing = "private", exportObservation = null } = {}) {
  if (typeof rootDir !== "string" || typeof manifestPath !== "string" || !["private", "redacted"].includes(sharing)) fail("EVM-REQUEST");
  const observedExport = exportStatus(exportObservation);
  const root = resolve(rootDir);
  const checked = validateFeaturePackage(root, manifestPath);
  if (!checked.ok || !checked.receipt) {
    return frozen({
      schema: "pipeline.evidence-view-model.v2",
      authority: "non-authoritative",
      source: frozen({ manifest: null, manifestSha256: null, topology: "invalid" }),
      feature: frozen({ id: null, lifecycleState: "unavailable" }),
      candidate: unavailableCandidate(),
      status: "invalid",
      sharing,
      exportStatus: observedExport,
      artifacts: frozen([]),
      notices: frozen([notice("invalid", "EVM-TOPOLOGY", "Canonical package validation failed; no approval or pass claim is rendered.")]),
    });
  }
  let manifest;
  try { manifest = JSON.parse(readFileSync(join(root, checked.receipt.manifest), "utf8")); }
  catch { return frozen({ schema: "pipeline.evidence-view-model.v2", authority: "non-authoritative", source: frozen({ manifest: null, manifestSha256: null, topology: "invalid" }), feature: frozen({ id: null, lifecycleState: "unavailable" }), candidate: unavailableCandidate(), status: "invalid", sharing, exportStatus: observedExport, artifacts: frozen([]), notices: frozen([notice("invalid", "EVM-MANIFEST", "Canonical manifest became unavailable after validation.")]) }); }
  const hasCandidate = candidate(manifest.candidate);
  const artifacts = manifest.artifacts.map((artifact, index) => frozen({
    id: `artifact-${index + 1}`,
    path: publicPath(artifact.path, index, sharing),
    sourcePath: sharing === "redacted" ? null : artifact.path,
    sha256: artifact.sha256,
    state: "verified",
    valueClass: "fact",
    lifecycleState: manifest.state,
    artifactClass: artifact.class,
  }));
  const notices = [notice("fact", "EVM-NONAUTHORITY", "This report is a derived, non-authoritative projection. It cannot grant, revoke, or alter authority.")];
  if (sharing === "redacted") notices.push(notice("redacted", "EVM-REDACTED", "Artifact paths are replaced deterministically; raw prompts, logs, credentials, private paths, and coordinates are excluded."));
  if (!hasCandidate) notices.push(notice("unavailable", "EVM-CANDIDATE", "No exact candidate binding is available; no derived pass, approval, or release claim is rendered."));
  return frozen({
    schema: "pipeline.evidence-view-model.v2",
    authority: "non-authoritative",
    source: frozen({ manifest: sharing === "redacted" ? null : checked.receipt.manifest, manifestSha256: checked.receipt.manifestSha256, topology: "valid" }),
    feature: frozen({ id: manifest.feature.id, lifecycleState: PACKAGE_STATES.has(manifest.state) ? manifest.state : "unavailable" }),
    candidate: hasCandidate ? boundCandidate(manifest.candidate) : unavailableCandidate(),
    status: statusForPackage(manifest.state, hasCandidate),
    sharing,
    exportStatus: observedExport,
    artifacts: frozen(artifacts),
    notices: frozen(notices),
  });
}
