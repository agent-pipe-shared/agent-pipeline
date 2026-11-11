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

const isVerdict = (verdict) => verdict !== null && typeof verdict === "object" && Array.isArray(verdict.findings) && Array.isArray(verdict.briefing_violations);
const count = (verdict, severity) => verdict.findings.filter((finding) => finding.severity === severity).length;

/**
 * C28-CRITIC-TOIL (AC-108): the three separate things a reader of a round's result is shown (live, Codex round 4: the model said pass false, the
 * receipt said reviewPass true with one minor, which is correct, and the Elephant ran an extra round). The verdict schema gets no field: this is a
 * projection of a verdict already in hand. A reader that holds only a receipt has `reviewPass` and `findingCount`, not the model's own `pass`.
 * `nextStep` follows the policy decision, never the model's flag.
 */
export function criticRoundDisplay(verdict) {
  if (!isVerdict(verdict)) {
    return { modelVerdict: { pass: null }, policyDecision: { reviewPass: false, reason: "no verdict is available" }, remainingFindings: { total: 0, blocker: 0, major: 0, minor: 0 },
      nextStep: "No verdict is available, so the round did not pass by policy; return the Critic's verdict as written and finalize it before deciding anything." };
  }
  const remainingFindings = { total: verdict.findings.length, blocker: count(verdict, "blocker"), major: count(verdict, "major"), minor: count(verdict, "minor") };
  const reviewPass = criticRoundPassed(verdict);
  const reasons = [];
  if (remainingFindings.blocker + remainingFindings.major > 0) reasons.push(`${remainingFindings.blocker + remainingFindings.major} blocker or major finding(s)`);
  if (verdict.briefing_violations.length > 0) reasons.push("a briefing violation");
  if (verdict.trajectory_verdict !== "consistent") reasons.push(`trajectory ${JSON.stringify(verdict.trajectory_verdict)}`);
  if (reasons.length === 0 && !reviewPass) reasons.push(verdict.findings.length === 0 ? "pass false without any finding" : "a partial review that withheld its verdict");
  const reason = reviewPass
    ? (remainingFindings.minor > 0 ? "no blocker, major finding, briefing violation or trajectory problem; a round holding only minor findings passes (PO rule)" : "no finding, briefing violation or trajectory problem")
    : reasons.join(" and ");
  const nextStep = reviewPass
    ? `The round passed by policy (${reason}). ${remainingFindings.total === 0 ? "No finding remains." : `${remainingFindings.total} finding(s) remain open in the record.`} No further Critic round is needed for them; the model's own pass flag (${verdict.pass}) does not change that.`
    : `The round did not pass by policy (${reason}); correct what the findings name and open the next round with a new packet id.`;
  return { modelVerdict: { pass: typeof verdict.pass === "boolean" ? verdict.pass : null }, policyDecision: { reviewPass, reason }, remainingFindings, nextStep };
}

/** A receipt written before this rule keeps the Critic's own flag, so a reader accepts either value for the same verdict. */
export function receiptMatchesVerdict(reviewPass, verdict) {
  return reviewPass === verdict.pass || reviewPass === criticRoundPassed(verdict);
}
