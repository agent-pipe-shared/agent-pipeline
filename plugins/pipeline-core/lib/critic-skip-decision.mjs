// SPDX-License-Identifier: SUL-1.0
/** Runner-neutral Critic disposition primitives for dispatch-record v3. */

export const CRITIC_SKIP_SCHEMA = "pipeline.critic-skip-decision.v1";
export const CRITIC_EVIDENCE_SCHEMA = "pipeline.critic-evidence-reference.v1";

export function hasCriticSkipDecision(record) {
  return Boolean(record && typeof record === "object" && record.criticSkip && typeof record.criticSkip === "object" && !Array.isArray(record.criticSkip));
}

export function hasCriticEvidenceReference(record) {
  return Boolean(record && typeof record === "object" && record.criticEvidence && typeof record.criticEvidence === "object" && !Array.isArray(record.criticEvidence));
}

export function criticDisposition(record) {
  const skipped = hasCriticSkipDecision(record);
  const evidenced = hasCriticEvidenceReference(record);
  if (skipped === evidenced) return skipped ? "conflicting" : "missing";
  return skipped ? "skipped" : "evidenced";
}

export function countCriticSkipDecisions(records) {
  return Array.isArray(records) ? records.filter(hasCriticSkipDecision).length : 0;
}

export function evaluateCriticSkipCoverage({ dispatchedWorkCount, criticArtifactCount, skipRecordCount }) {
  const total = Number(dispatchedWorkCount) || 0;
  const evidenced = Number(criticArtifactCount) || 0;
  const skipped = Number(skipRecordCount) || 0;
  const covered = evidenced + skipped;
  if (total === 0) return { finding: false, reason: "no applicable dispatch records to evaluate" };
  if (covered === total) return { finding: false, reason: `${evidenced} evidenced and ${skipped} skipped dispatch record(s) cover all ${total} applicable record(s)` };
  return {
    finding: true,
    reason: `critic disposition missing or invalid: ${total - Math.min(covered, total)} of ${total} applicable dispatch record(s) are uncovered`,
  };
}

export function evaluateCriticSkipCoverageFromRecords({ records }) {
  const applicable = (Array.isArray(records) ? records : []).filter((record) => record?.schema === "pipeline.dispatch-record.v3");
  const skipRecordCount = applicable.filter((record) => criticDisposition(record) === "skipped").length;
  const criticArtifactCount = applicable.filter((record) => criticDisposition(record) === "evidenced").length;
  return evaluateCriticSkipCoverage({ dispatchedWorkCount: applicable.length, criticArtifactCount, skipRecordCount });
}
