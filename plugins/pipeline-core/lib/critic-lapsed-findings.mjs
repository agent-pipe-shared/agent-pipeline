// SPDX-License-Identifier: SUL-1.0
/**
 * C29 (Claude greenfield run 3, L1; PO tile 2026-11-13, mechanical route): a blocker or major of an earlier Critic round that a later
 * round marked fixed although no reviewed round after it changed product code or tests.
 *
 * The retained lineage marks every open finding of the parent "fixed" as soon as a later round passes (lib/critic-review-lineage.mjs).
 * A delta round over the Spec, the design text or evidence alone can pass, and the earlier blocker then read as fixed without any
 * correction of the code it named: the run closed a feature with two round-1 majors that no acceptance question named. This module
 * reads the same retained course and names those findings; it never rewrites the lineage (its records are immutable and validated).
 *
 * A carried blocker/major counts as corrected when the round that marked it fixed, or any reviewed round after it, changed at least one
 * product code or test path (lib/close-commit-split.mjs isProductCodePath). Otherwise it is LAPSED. A lapsed major is settled only by a
 * PO residual acceptance of its origin round with the uncorrectable-past-authorship reason class; a lapsed blocker never.
 *
 * Read-only. The close stops on a lapsed finding that is not settled; the acceptance question names the settled ones.
 */
import { isProductCodePath } from "./close-commit-split.mjs";
import { resolveRetainedCriticCourseRecords } from "./critic-course-admission.mjs";
import { loadResidualAcceptanceDepsForPacket } from "./critic-verify-readiness-read.mjs";
import { RESIDUAL_REASON_CLASS } from "./critic-verify-lifecycle.mjs";

export const CRITIC_LAPSED_FINDINGS_SCHEMA = "pipeline.critic-lapsed-findings.v1";
const SEVERITY = Object.freeze({ critical: "blocker", high: "major" });
const REVIEWED = new Set(["no-findings", "findings"]);
const ORIGIN = /^CRF-([a-f0-9]{32})-\d+$/u;

/**
 * Pure: the lapsed blocker/major findings of an ordered (oldest first) retained course.
 * @returns {Array<{findingId: string, severity: "blocker"|"major", originPacketId: string|null, evidenceSha256: string|null, markedFixedInReviewId: string}>}
 */
export function lapsedCriticFindings({ history, featureId }) {
  if (!Array.isArray(history)) return [];
  const codeRound = (record) => REVIEWED.has(record?.verdict?.status)
    && (record?.diff?.changedPaths ?? []).some((path) => isProductCodePath(path, featureId));
  const lapsed = [];
  for (let index = 1; index < history.length; index += 1) {
    const parent = new Map((history[index - 1]?.findings ?? []).map((finding) => [finding.id, finding]));
    for (const finding of history[index]?.findings ?? []) {
      const prior = finding?.priorFindingId === null || finding?.priorFindingId === undefined ? null : parent.get(finding.priorFindingId);
      if (finding?.status !== "fixed" || prior?.status !== "open" || !Object.hasOwn(SEVERITY, prior.severity)) continue;
      if (history.slice(index).some(codeRound)) continue;
      lapsed.push(Object.freeze({
        findingId: finding.id,
        severity: SEVERITY[prior.severity],
        originPacketId: ORIGIN.exec(finding.id)?.[1] ?? null,
        evidenceSha256: typeof finding.evidenceSha256 === "string" ? finding.evidenceSha256 : null,
        markedFixedInReviewId: history[index].reviewId,
      }));
    }
  }
  return lapsed;
}

/** True when a recorded PO residual acceptance of the finding's origin round settles it (a major with the reason class; a blocker never). */
export function lapsedFindingSettled(finding, { gitCommonDir, projectDir = null, loadFn = loadResidualAcceptanceDepsForPacket } = {}) {
  if (finding?.severity !== "major" || finding.originPacketId === null || finding.evidenceSha256 === null) return false;
  const deps = loadFn({ gitCommonDir, projectDir, criticPacketId: finding.originPacketId });
  const accepted = deps?.residualAcceptance;
  return accepted?.reasonClass === RESIDUAL_REASON_CLASS
    && Array.isArray(accepted.findings) && accepted.findings.some((row) => row?.id === finding.evidenceSha256);
}

/**
 * Read the retained course of `featureId` at `candidateCommit` and split its lapsed findings into open and settled.
 * A course that cannot be read is `unavailable` (the close keeps its own course-evidence checks); never throws.
 */
export function readLapsedCriticFindings({ repoRoot, featureId, candidateCommit, gitCommonDir, projectDir = null,
  resolveFn = resolveRetainedCriticCourseRecords, loadFn = loadResidualAcceptanceDepsForPacket } = {}) {
  let history;
  try { history = resolveFn({ repoRoot, featureId, candidateCommit }).history; } catch (error) {
    return Object.freeze({ schema: CRITIC_LAPSED_FINDINGS_SCHEMA, status: "unavailable", reason: String(error?.message ?? error).slice(0, 200), open: [], settled: [] });
  }
  const open = [];
  const settled = [];
  for (const finding of lapsedCriticFindings({ history, featureId })) {
    let ok = false;
    try { ok = lapsedFindingSettled(finding, { gitCommonDir, projectDir, loadFn }); } catch { ok = false; }
    (ok ? settled : open).push(finding);
  }
  return Object.freeze({ schema: CRITIC_LAPSED_FINDINGS_SCHEMA, status: open.length > 0 ? "open" : "clear", open, settled });
}

/** One sentence per finding, for a stop text or the acceptance question. */
export function describeLapsedFinding(finding) {
  return `${finding.severity} ${finding.findingId}${finding.originPacketId === null ? "" : ` (raised in Critic round ${finding.originPacketId})`}`;
}

/** The repair a close names for open lapsed findings. */
export function lapsedFindingsRepair({ open, stateWriter = "pipeline-state.mjs" }) {
  const majors = open.filter((finding) => finding.severity === "major" && finding.originPacketId !== null);
  const packets = [...new Set(majors.map((finding) => finding.originPacketId))];
  return `correct the named findings in the product code or tests through a dispatch and run a Critic delta round over that change; a later round that only changed the Spec, docs or evidence does not count as a correction. A blocker can never be accepted.${packets.length === 0 ? "" : ` A major that no commit can correct may instead be accepted by the PO in the PO's own attended step: ${packets.map((packet) => `node ${stateWriter} approve-residual-acceptance --by <name> --critic-packet ${packet} --reason-class ${RESIDUAL_REASON_CLASS}`).join("; ")}.`}`;
}
