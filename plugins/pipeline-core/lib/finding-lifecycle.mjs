// SPDX-License-Identifier: SUL-1.0
/** Candidate- and component-bound canonical security finding lifecycle. */
import { createHash } from "node:crypto";

export const FINDING_LIFECYCLE_SCHEMA = "pipeline.finding-record.v1";
export const RECORD_TYPES = Object.freeze(["raw-observation", "normalized-finding", "triage", "vex", "waiver", "remediation", "approval"]);
export const DRIFT_TRIGGERS = Object.freeze(["candidate", "component", "scanner-rule-data", "threat-control", "waiver-expiry", "exploitability", "recurrence"]);
const SHA256 = /^[0-9a-f]{64}$/u;
const TERMINAL_DISPOSITIONS = new Set(["false-positive", "not-affected", "accepted-risk", "waived", "verified-fixed"]);
const TRANSITIONS = Object.freeze({
  observed: ["needs-triage"],
  "needs-triage": ["confirmed"],
  confirmed: ["duplicate", "false-positive", "not-affected", "affected"],
  affected: ["under-remediation", "accepted-risk", "waived"],
  "under-remediation": ["mitigated", "fixed-awaiting-verification"],
  mitigated: ["fixed-awaiting-verification"],
  "fixed-awaiting-verification": ["verified-fixed"],
  "verified-fixed": ["superseded", "stale", "reopened"],
  duplicate: ["reopened", "stale"],
  "false-positive": ["reopened", "stale"],
  "not-affected": ["reopened", "stale"],
  "accepted-risk": ["reopened", "stale"],
  waived: ["reopened", "stale"],
  superseded: ["reopened", "stale"],
  stale: ["reopened"],
  reopened: ["needs-triage", "affected"],
});
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const validDigest = (value) => typeof value === "string" && SHA256.test(value);
const required = (value) => typeof value === "string" && value.length > 0;

/** Stable finding identity intentionally excludes scanner version and finding id. */
export function normalizeFinding({ component, vulnerability, location, candidateSha256 } = {}) {
  if (![component, vulnerability, location, candidateSha256].every(required)) return Object.freeze({ schema: FINDING_LIFECYCLE_SCHEMA, status: "invalid" });
  const identity = { component, vulnerability, location, candidateSha256 };
  return Object.freeze({ schema: FINDING_LIFECYCLE_SCHEMA, type: "normalized-finding", findingId: `fnd-${sha256(JSON.stringify(identity)).slice(0, 24)}`, ...identity });
}

/** Raw input remains immutable and is never used as a state/disposition record. */
export function createRawObservation({ scanner, payloadSha256, observedAt } = {}) {
  if (![scanner, payloadSha256, observedAt].every(required) || !validDigest(payloadSha256)) return Object.freeze({ schema: FINDING_LIFECYCLE_SCHEMA, status: "invalid" });
  return Object.freeze({ schema: FINDING_LIFECYCLE_SCHEMA, type: "raw-observation", scanner, payloadSha256, observedAt });
}

/** Every state transition is typed, timestamped, scoped and authority-bound. */
export function transitionFinding({ finding, to, authority, reason, at, candidateSha256, policySha256 } = {}) {
  if (!finding || !TRANSITIONS[finding.state]?.includes(to) || !required(authority) || !required(reason) || !required(at)
    || !validDigest(candidateSha256) || !validDigest(policySha256)) {
    return Object.freeze({ schema: FINDING_LIFECYCLE_SCHEMA, accepted: false, code: "FINDING-TRANSITION-INVALID" });
  }
  if (TERMINAL_DISPOSITIONS.has(to) && authority === "agent") return Object.freeze({ schema: FINDING_LIFECYCLE_SCHEMA, accepted: false, code: "FINDING-SELF-APPROVAL-DENIED" });
  return Object.freeze({ schema: FINDING_LIFECYCLE_SCHEMA, accepted: true, code: "FINDING-TRANSITION-RECORDED", record: { type: "triage", findingId: finding.id, from: finding.state, to, authority, reason, at, candidateSha256, policySha256 } });
}

/** VEX is positive, explicit evidence bound to exact component/SBOM/product identities. */
export function createVexRecord({ findingId, componentPurl, sbomSha256, productVersion, candidateSha256, disposition, authority } = {}) {
  if (![findingId, componentPurl, productVersion, candidateSha256, disposition, authority].every(required)
    || !validDigest(sbomSha256) || !["not-affected", "affected", "fixed"].includes(disposition)) {
    return Object.freeze({ schema: FINDING_LIFECYCLE_SCHEMA, accepted: false, code: "VEX-BINDING-INVALID" });
  }
  return Object.freeze({ schema: FINDING_LIFECYCLE_SCHEMA, accepted: true, record: { type: "vex", findingId, componentPurl, sbomSha256, productVersion, candidateSha256, disposition, authority } });
}

/** Waivers are time-bounded and stale as soon as their scope/policy drift. */
export function validateWaiver({ waiver, at, candidateSha256, policySha256 } = {}) {
  const valid = waiver && required(waiver.authority) && required(waiver.reason) && Array.isArray(waiver.compensatingControls)
    && waiver.compensatingControls.length > 0 && required(waiver.expiresAt) && validDigest(waiver.candidateSha256)
    && validDigest(waiver.policySha256);
  if (!valid) return Object.freeze({ schema: FINDING_LIFECYCLE_SCHEMA, status: "invalid", code: "WAIVER-INVALID" });
  const expired = waiver.expiresAt <= at;
  const drifted = waiver.candidateSha256 !== candidateSha256 || waiver.policySha256 !== policySha256;
  return Object.freeze({ schema: FINDING_LIFECYCLE_SCHEMA, status: expired || drifted ? "stale" : "current", code: expired ? "WAIVER-EXPIRED" : drifted ? "WAIVER-DRIFTED" : "WAIVER-CURRENT" });
}

/** A closure needs patch, original trigger replay, regression and independent confirmation. */
export function verifyClosure({ findingId, candidateSha256, patchSha256, replaySha256, regressionSha256, confirmedBy, authorId } = {}) {
  const complete = [findingId, candidateSha256, patchSha256, replaySha256, regressionSha256, confirmedBy].every(required)
    && [candidateSha256, patchSha256, replaySha256, regressionSha256].every(validDigest) && confirmedBy !== authorId;
  return Object.freeze({ schema: FINDING_LIFECYCLE_SCHEMA, accepted: complete, code: complete ? "FINDING-CLOSURE-VERIFIED" : "FINDING-CLOSURE-EVIDENCE-MISSING" });
}

/** Release evaluates canonical current records only; tracker dashboards are non-authoritative. */
export function evaluateReleaseGate({ findings = [], candidateSha256, policyRelevant = () => true } = {}) {
  const blockers = findings.filter((finding) => finding.candidateSha256 === candidateSha256 && policyRelevant(finding)
    && !["verified-fixed", "false-positive", "not-affected", "duplicate", "superseded"].includes(finding.state));
  return Object.freeze({ schema: FINDING_LIFECYCLE_SCHEMA, allowed: blockers.length === 0, blockers: blockers.map((finding) => finding.id), code: blockers.length ? "FINDING-RELEASE-BLOCKED" : "FINDING-RELEASE-CLEAR" });
}

/** Any specified drift deterministically reopens conclusions, except waiver expiry which stales them. */
export function reevaluateForDrift({ finding, trigger } = {}) {
  if (!finding || !DRIFT_TRIGGERS.includes(trigger)) return Object.freeze({ schema: FINDING_LIFECYCLE_SCHEMA, accepted: false, code: "FINDING-DRIFT-UNKNOWN" });
  return Object.freeze({ schema: FINDING_LIFECYCLE_SCHEMA, accepted: true, state: trigger === "waiver-expiry" ? "stale" : "reopened", trigger });
}

/** Projections are copies; external writes cannot mutate canonical authority. */
export function projectFinding(canonicalRecord, externalPatch = {}) {
  return Object.freeze({ schema: FINDING_LIFECYCLE_SCHEMA, projection: Object.freeze({ id: canonicalRecord.id, state: canonicalRecord.state }), canonicalUnchanged: true, rejectedExternalFields: Object.keys(externalPatch).filter((key) => key !== "displayUrl") });
}

/** Public metrics use counts/durations only and deliberately omit finding content. */
export function exportFindingMetrics({ triageHours = [], remediationHours = [], recurrenceCount = 0, waiverAgesDays = [], escapeCount = 0, completeEvidence = 0, totalEvidence = 0 } = {}) {
  const average = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  return Object.freeze({ schema: FINDING_LIFECYCLE_SCHEMA, timeToTriageHours: average(triageHours), timeToRemediateHours: average(remediationHours), recurrenceCount, waiverAgeDays: average(waiverAgesDays), escapeRate: totalEvidence ? escapeCount / totalEvidence : 0, evidenceCompleteness: totalEvidence ? completeEvidence / totalEvidence : 0 });
}
