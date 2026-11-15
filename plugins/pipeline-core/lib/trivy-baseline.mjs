// SPDX-License-Identifier: SUL-1.0
/**
 * C29e T8b (PO tile 2026-11-14, ADR-0103): a Trivy finding blocks only when the feature introduced it.
 *
 * The base commit is the same one the Semgrep baseline uses (lib/semgrep-baseline.mjs `resolveSemgrepBaseline`: the start of
 * the active or last closed feature's range, read from the candidate snapshot, a commit and an ancestor of the candidate),
 * never a caller input. Trivy has no baseline mode of its own, so security-scan.mjs runs the same adapter, with the same
 * binary and the same neutral invocation, on a throwaway worktree of that base commit and compares the two finding sets.
 *
 * Identity of a finding: rule and scan-root-relative path, without the line (an edit above a finding moves its line). The
 * comparison counts: when the base had two DS-0002 findings in a Dockerfile and the candidate has three, two are existing
 * and one is new. A renamed or moved file is new. Anything that keeps the base pass from completing (no feature, no base,
 * a worktree that cannot be created, a base scan error) makes the record `unavailable`, and then every Trivy finding at a
 * blocking severity blocks. Unavailable is never "nothing is new".
 */
import { resolveSemgrepBaseline } from "./semgrep-baseline.mjs";

export const TRIVY_BASELINE_SCHEMA = "pipeline.trivy-baseline.v1";

/** The identity used for the base/candidate comparison: rule and path, no line. */
export function trivyFindingKey(finding) {
  return `${finding?.rule ?? ""}\u0000${finding?.path ?? ""}`;
}

/** The base commit of the feature range, with Trivy codes; the resolution itself is the Semgrep baseline's. */
export function resolveTrivyBaselineCommit(options) {
  const resolved = resolveSemgrepBaseline(options);
  return Object.freeze({
    schema: TRIVY_BASELINE_SCHEMA,
    status: resolved.status,
    code: typeof resolved.code === "string" ? resolved.code.replace(/^SEMGREP-BASELINE-/u, "TRIVY-BASELINE-") : null,
    reason: resolved.reason,
    featureId: resolved.featureId,
    commit: resolved.commit,
    source: resolved.source,
  });
}

/**
 * The candidate's blocking-severity Trivy findings that the base scan already had (counted per rule and path). Returns the
 * `existing` list (rule, path, line, severity) the evidence records; every other blocking-severity finding is new.
 */
export function existingTrivyFindings(candidateFindings, baseFindings, blockOn) {
  const blockOnSet = new Set(blockOn);
  const available = new Map();
  for (const finding of Array.isArray(baseFindings) ? baseFindings : []) {
    if (finding?.tool !== "trivy") continue;
    const key = trivyFindingKey(finding);
    available.set(key, (available.get(key) ?? 0) + 1);
  }
  const existing = [];
  for (const finding of Array.isArray(candidateFindings) ? candidateFindings : []) {
    if (finding?.tool !== "trivy" || !blockOnSet.has(finding.severity)) continue;
    const key = trivyFindingKey(finding);
    const left = available.get(key) ?? 0;
    if (left === 0) continue;
    available.set(key, left - 1);
    existing.push({ rule: finding.rule, path: finding.path, line: finding.line ?? null, severity: finding.severity });
  }
  return existing;
}

/**
 * A filter for the blocking findings: false for a Trivy finding the applied baseline record names as existing (each existing
 * entry exempts one finding with its rule and path). Without an applied record it keeps every finding. Create one per verdict.
 */
export function blockingTrivyFindingFilter(record) {
  const left = new Map();
  if (record?.status === "applied" && Array.isArray(record.existing)) {
    for (const finding of record.existing) left.set(trivyFindingKey(finding), (left.get(trivyFindingKey(finding)) ?? 0) + 1);
  }
  return (finding) => {
    if (finding?.tool !== "trivy") return true;
    const key = trivyFindingKey(finding);
    const count = left.get(key) ?? 0;
    if (count === 0) return true;
    left.set(key, count - 1);
    return false;
  };
}

/** The printed lines for a scan summary: existing findings listed and named non-blocking, or why every finding blocks. */
export function formatTrivyBaselineLines(record, { limit = 20 } = {}) {
  if (record?.status === "applied") {
    const existing = Array.isArray(record.existing) ? record.existing : [];
    const lines = [`Trivy baseline (${record.featureId}, start ${String(record.commit).slice(0, 12)}): ${existing.length} finding(s) at a blocking severity existed before the feature and are listed, not blocking; ${record.newCount ?? 0} are new and block.`];
    for (const finding of existing.slice(0, limit)) lines.push(`  existing ${finding.severity} ${finding.rule} ${finding.path}${finding.line ? `:${finding.line}` : ""}`);
    if (existing.length > limit) lines.push(`  ... ${existing.length - limit} more existing finding(s) in the evidence (execution.trivyBaseline.existing)`);
    return lines;
  }
  if (record?.status === "unavailable") return [`Trivy baseline unavailable (${record.code}): ${record.reason}. Every Trivy finding at a blocking severity blocks.`];
  return [];
}
