// SPDX-License-Identifier: SUL-1.0
/**
 * Whether one Critic round passed. The one rule every route that writes a Critic receipt applies (PO decision, 2026-11-10).
 *
 * A round with no blocker or major finding, a consistent trajectory and no briefing violation has passed, whatever the Critic set for
 * `pass`. Its minor findings stay in the verdict and stay open. Without this, a round holding only minors asks for another correction
 * and another review: the same Critic marked `pass: true` with four minors and `pass: false` with two.
 *
 * Still not a pass: `pass: false` with no finding at all (nothing says why it failed), and a partial review, which withholds its verdict
 * because part of the range was never read (`templates/prompts/critic-review.md`, closing handover).
 */
const PARTIAL_REVIEW = /pass\/fail withheld|partial review/iu;

function blocked(verdict) {
  return verdict.findings.some(({ severity }) => severity === "blocker" || severity === "major")
    || verdict.briefing_violations.length > 0
    || verdict.trajectory_verdict !== "consistent";
}

export function criticRoundPassed(verdict) {
  if (verdict === null || typeof verdict !== "object" || !Array.isArray(verdict.findings) || !Array.isArray(verdict.briefing_violations)) return false;
  if (blocked(verdict)) return false;
  if (verdict.pass === true) return true;
  if (verdict.findings.length === 0) return false;
  return !PARTIAL_REVIEW.test(`${verdict.trajectory_evidence ?? ""}\n${(verdict.deliberately_not_flagged ?? []).join("\n")}`);
}

/** A receipt written before this rule keeps the Critic's own flag, so a reader accepts either value for the same verdict. */
export function receiptMatchesVerdict(reviewPass, verdict) {
  return reviewPass === verdict.pass || reviewPass === criticRoundPassed(verdict);
}
