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
const CODE = /^[A-Z][A-Z0-9-]{1,63}$/u;
// The closed gate vocabulary `gate-estimate.mjs` itself stores and projects
// (`validStoredGateEstimate`), mirrored rather than re-derived: this module
// imports no writer and computes no estimate of its own.
const GATE_NAMES = new Set(["prd", "security", "merge"]);
const GATE_OBSERVATION_STATES = new Set(["known", "unknown"]);
// "Nothing to estimate" and "could not be computed" are different answers and
// get different classes. `projectGateEstimate` returns CS-ETA-FEATURE when no
// active feature exists and CS-ETA-NO-NEXT-GATE when the active phase has no
// following gate -- both mean the estimate does not apply. Every other unknown
// code is a value the report wanted and failed to obtain: unavailable.
const GATE_NOT_APPLICABLE = new Set(["CS-ETA-FEATURE", "CS-ETA-NO-NEXT-GATE"]);

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
function unavailableExportStatus() { return frozen({ state: "unavailable", destinationProfile: null, cursor: null, lag: null, receipt: null, failureCount: null, quarantineCount: null, integrityGaps: null }); }
// E-AC-19: failure/quarantine counts and integrity gaps are additional
// shape-validated-only observations, admitted or refused exactly like the
// rest of this block (schema on shape alone, no digest, no canonical source
// record). A count is `null` when not observed (never silently defaulted to
// 0, which would misrepresent an absence as a checked zero) and a
// non-negative integer when it is. `integrityGaps` keeps the same
// null-vs-empty-array distinction K-AC-09 requires everywhere else in this
// repo: `null` means "not observed", `[]` means "checked, none found" -- the
// two are never conflated.
function nonNegativeCountOrNull(count) { return count === null || (Number.isSafeInteger(count) && count >= 0); }
function integrityGapsOrNull(gaps) { return gaps === null || (Array.isArray(gaps) && gaps.every((gap) => typeof gap === "string" && CODE.test(gap))); }
function exportStatus(value) {
  if (value === null || value === undefined) return unavailableExportStatus();
  if (!exact(value, ["schema", "destinationProfile", "state", "cursor", "lag", "receipt", "failureCount", "quarantineCount", "integrityGaps"]) || value.schema !== "pipeline.governance-export-view-status.v1" || typeof value.destinationProfile !== "string" || value.destinationProfile === "" || !EXPORT_STATES.has(value.state) || !Number.isSafeInteger(value.cursor) || value.cursor < 0 || !Number.isSafeInteger(value.lag) || value.lag < 0 || !(value.receipt === null || exact(value.receipt, ["batchId", "acknowledgementClass", "terminalDisposition"])) || !nonNegativeCountOrNull(value.failureCount) || !nonNegativeCountOrNull(value.quarantineCount) || !integrityGapsOrNull(value.integrityGaps)) fail("EVM-EXPORT");
  return frozen({ state: value.state, destinationProfile: value.destinationProfile, cursor: value.cursor, lag: value.lag, receipt: value.receipt === null ? null : frozen({ ...value.receipt }), failureCount: value.failureCount, quarantineCount: value.quarantineCount, integrityGaps: value.integrityGaps === null ? null : frozen([...value.integrityGaps]) });
}

function absentGateEstimate(code) { return frozen({ state: "not-applicable", featureId: null, gate: null, rangeMinutes: null, source: null, code }); }
function unresolvedGateEstimate(featureId, gate, code) { return frozen({ state: "unavailable", featureId, gate, rangeMinutes: null, source: null, code }); }
/**
 * Project a caller-supplied `projectGateEstimate` result into a distinctly
 * classed view value. An estimate is a projected range, never an observed
 * fact and never a commitment, so a resolved one is labelled `estimate`; an
 * unresolvable one stays `unavailable` and an inapplicable one
 * `not-applicable`.
 */
function gateEstimate(value, featureId) {
  if (value === null || value === undefined) return absentGateEstimate("EVM-ESTIMATE-ABSENT");
  if (!exact(value, ["schema", "featureId", "gate", "state", "rangeMinutes", "source", "code"])
    || value.schema !== "pipeline.gate-estimate-view-observation.v1"
    || !(value.featureId === null || (typeof value.featureId === "string" && value.featureId !== "" && value.featureId.length <= 240))
    || !(value.gate === null || GATE_NAMES.has(value.gate))
    || !GATE_OBSERVATION_STATES.has(value.state) || !CODE.test(value.code)) fail("EVM-ESTIMATE");
  if (value.state === "unknown") {
    if (value.rangeMinutes !== null || value.source !== null) fail("EVM-ESTIMATE");
    if (GATE_NOT_APPLICABLE.has(value.code)) return absentGateEstimate(value.code);
  } else if (value.featureId === null || value.gate === null
    || !exact(value.rangeMinutes, ["min", "max"]) || !Number.isSafeInteger(value.rangeMinutes.min) || value.rangeMinutes.min < 0
    || !Number.isSafeInteger(value.rangeMinutes.max) || value.rangeMinutes.max < value.rangeMinutes.min
    || !exact(value.source, ["path", "sha256"]) || typeof value.source.path !== "string" || value.source.path === ""
    || value.source.path.length > 240 || !SHA.test(value.source.sha256)) fail("EVM-ESTIMATE");
  // The estimate is rendered only against the exact feature this report
  // projects. No prefix, alias, namespace, or fallback match: a differing or
  // unverifiable id is refused as unavailable rather than correlated by a
  // match rule this module would have to invent.
  if (typeof featureId !== "string" || featureId === "" || value.featureId !== featureId) return unresolvedGateEstimate(value.featureId, value.gate, "EVM-ESTIMATE-FEATURE");
  if (value.state !== "known") return unresolvedGateEstimate(featureId, value.gate, value.code);
  return frozen({ state: "known", featureId, gate: value.gate, rangeMinutes: frozen({ min: value.rangeMinutes.min, max: value.rangeMinutes.max }), source: frozen({ path: value.source.path, sha256: value.source.sha256 }), code: value.code });
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
export function buildEvidenceViewModelFromFeaturePackage({ rootDir = process.cwd(), manifestPath, sharing = "private", exportObservation = null, gateEstimateObservation = null } = {}) {
  if (typeof rootDir !== "string" || typeof manifestPath !== "string" || !["private", "redacted"].includes(sharing)) fail("EVM-REQUEST");
  const observedExport = exportStatus(exportObservation);
  const suppliedExport = exportObservation !== null && exportObservation !== undefined;
  // Shape is refused up front, exactly like the delivery observation. Without a
  // validated manifest there is no feature id to correlate against, so the
  // invalid views below carry the uncorrelated result and never an estimate.
  const uncorrelatedEstimate = gateEstimate(gateEstimateObservation, null);
  const suppliedEstimate = gateEstimateObservation !== null && gateEstimateObservation !== undefined;
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
      gateEstimate: uncorrelatedEstimate,
      artifacts: frozen([]),
      notices: frozen([notice("invalid", "EVM-TOPOLOGY", "Canonical package validation failed; no approval or pass claim is rendered.")]),
    });
  }
  let manifest;
  try { manifest = JSON.parse(readFileSync(join(root, checked.receipt.manifest), "utf8")); }
  catch { return frozen({ schema: "pipeline.evidence-view-model.v2", authority: "non-authoritative", source: frozen({ manifest: null, manifestSha256: null, topology: "invalid" }), feature: frozen({ id: null, lifecycleState: "unavailable" }), candidate: unavailableCandidate(), status: "invalid", sharing, exportStatus: observedExport, gateEstimate: uncorrelatedEstimate, artifacts: frozen([]), notices: frozen([notice("invalid", "EVM-MANIFEST", "Canonical manifest became unavailable after validation.")]) }); }
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
  // V-AC-02: the delivery observation is the one input this projection cannot
  // verify. `exportStatus()` above admits it on shape alone -- no digest, no
  // canonical source record, no exact-candidate binding -- and the CLI reads it
  // from any operator-chosen JSON path. Every other value rendered as a `fact`
  // is digest-bound: feature-package-topology.mjs re-hashes each artifact and
  // the manifest against their own bytes. A premise the report carries but
  // cannot check is an assumption, so it is declared as one rather than
  // presented as an observed fact.
  if (suppliedExport) notices.push(notice("assumption", "EVM-EXPORT-ASSUMED", "Delivery observation values are a supplied premise: shape-validated only, with no digest, canonical source record, or exact-candidate binding, so they are labelled assumption rather than fact."));
  // V-AC-02: a gate estimate is a projected range recorded by the coordinator,
  // not something this report observed and not a commitment anyone owes. It is
  // therefore its own value class -- neither `fact` (nothing here is
  // digest-bound by this projection) nor `assumption` (it is a declared
  // projection about the future, not a premise the report relies on) -- and it
  // is rendered only when it correlates to this exact feature package.
  const projectedEstimate = gateEstimate(gateEstimateObservation, manifest.feature.id);
  if (suppliedEstimate) {
    notices.push(projectedEstimate.state === "known"
      ? notice("estimate", "EVM-GATE-ESTIMATE", "Time to the next gate is an estimate projected from a coordinator-recorded range; it is not an observed fact, a completion claim, or an approval.")
      : notice(projectedEstimate.state, "EVM-GATE-ESTIMATE-UNRESOLVED", `No gate estimate is rendered for this report (${projectedEstimate.code}).`));
  }
  return frozen({
    schema: "pipeline.evidence-view-model.v2",
    authority: "non-authoritative",
    source: frozen({ manifest: sharing === "redacted" ? null : checked.receipt.manifest, manifestSha256: checked.receipt.manifestSha256, topology: "valid" }),
    feature: frozen({ id: manifest.feature.id, lifecycleState: PACKAGE_STATES.has(manifest.state) ? manifest.state : "unavailable" }),
    candidate: hasCandidate ? boundCandidate(manifest.candidate) : unavailableCandidate(),
    status: statusForPackage(manifest.state, hasCandidate),
    sharing,
    exportStatus: observedExport,
    gateEstimate: projectedEstimate,
    artifacts: frozen(artifacts),
    notices: frozen(notices),
  });
}
