// SPDX-License-Identifier: SUL-1.0
import test from "node:test";
import assert from "node:assert/strict";
import {
  CRITIC_LIFECYCLE_ADMISSION_SCHEMA,
  criticLifecycleDigest,
  evaluateCriticLifecycleAdmission,
} from "./critic-lifecycle-admission.mjs";

const candidate = {
  commit: "a".repeat(40), tree: "b".repeat(40), diffSha256: "c".repeat(64), changedContent: true,
};
const baseReceipt = (overrides = {}) => ({
  schema: "pipeline.session-critic-receipt.v1", packetId: "d".repeat(32), packetDigest: "e".repeat(64),
  session: { id: "critic-session-1", freshContext: true, historyInherited: false, mayDelegate: false },
  candidate: { base: "f".repeat(40), commit: candidate.commit, tree: candidate.tree },
  reviewRange: { base: "f".repeat(40), commit: candidate.commit, diffSha256: candidate.diffSha256 },
  rulesetSha: "1".repeat(40), assurance: "functional-equivalent-read-only; OS isolation not asserted",
  verdictSha256: "2".repeat(64), findingCount: 0, reviewPass: true, ...overrides,
});
const receiptForCandidate = (current) => baseReceipt({
  candidate: { base: "f".repeat(40), commit: current.commit, tree: current.tree },
  reviewRange: { base: "f".repeat(40), commit: current.commit, diffSha256: current.diffSha256 },
});
const verifyReceiptForCandidate = (current, overrides = {}) => ({
  schema: "pipeline.verify-evidence.v0", project: "test", command: "node --test",
  commit: current.commit, tree: current.tree, candidate: { commit: current.commit, tree: current.tree },
  startedAt: "2026-09-19T00:00:00.000Z", finishedAt: "2026-09-19T00:00:01.000Z",
  steps: [], verifyRun: {}, selection: {}, coverage: "project-calibrated", exitCode: 0, ...overrides,
});
const packet = ({ receipt = null, priorCritic = null, verify = null, current = candidate } = {}) => ({
  candidate: current,
  critic: { receipt: receipt ?? receiptForCandidate(current), receiptSha256: criticLifecycleDigest(receipt ?? receiptForCandidate(current)) },
  priorCritic,
  verify: verify ?? (() => { const result = verifyReceiptForCandidate(current); return { receipt: result, receiptSha256: criticLifecycleDigest(result) }; })(),
});

test("requires a fresh content-bound Critic before final Verify admission", () => {
  const missing = packet(); missing.critic = null;
  assert.equal(evaluateCriticLifecycleAdmission(missing).code, "critic-required-before-verify");
  assert.equal(evaluateCriticLifecycleAdmission(packet()).ok, true);
});

test("fails closed for a current failed Critic even when a Verify receipt is green", () => {
  const failed = receiptForCandidate(candidate);
  failed.reviewPass = false;
  failed.findingCount = 1;
  assert.equal(evaluateCriticLifecycleAdmission(packet({ receipt: failed })).code, "critic-findings-unresolved");
});

test("validates actual session receipt shape and digest", () => {
  const invalid = packet({ receipt: { schema: "pipeline.critic-diagnostic.v1" } });
  assert.equal(evaluateCriticLifecycleAdmission(invalid).code, "critic-receipt-invalid");
  const tampered = packet(); tampered.critic.receiptSha256 = "4".repeat(64);
  assert.equal(evaluateCriticLifecycleAdmission(tampered).code, "critic-receipt-digest-mismatch");
});

test("rejects stale candidate and diff receipts", () => {
  const stale = packet(); stale.critic.receipt.candidate.commit = "5".repeat(40);
  stale.critic.receipt.reviewRange.commit = "5".repeat(40);
  stale.critic.receiptSha256 = criticLifecycleDigest(stale.critic.receipt);
  assert.equal(evaluateCriticLifecycleAdmission(stale).code, "critic-receipt-stale");
  const diff = packet(); diff.critic.receipt.reviewRange.diffSha256 = "6".repeat(64);
  diff.critic.receiptSha256 = criticLifecycleDigest(diff.critic.receipt);
  assert.equal(evaluateCriticLifecycleAdmission(diff).code, "critic-receipt-stale");
});

test("failed Critic requires a correction diff re-review", () => {
  const failed = baseReceipt({ reviewPass: false, findingCount: 1 });
  const same = packet({ priorCritic: { receipt: failed, receiptSha256: criticLifecycleDigest(failed) } });
  assert.equal(evaluateCriticLifecycleAdmission(same).code, "correction-review-required");
  const correction = "7".repeat(40);
  const correctedCandidate = { ...candidate, commit: correction, tree: "8".repeat(40), diffSha256: "9".repeat(64) };
  const correctedReceipt = { ...baseReceipt(), candidate: { base: "f".repeat(40), commit: correctedCandidate.commit, tree: correctedCandidate.tree }, reviewRange: { base: "f".repeat(40), commit: correctedCandidate.commit, diffSha256: correctedCandidate.diffSha256 } };
  const accepted = packet({ current: correctedCandidate, receipt: correctedReceipt, priorCritic: { receipt: failed, receiptSha256: criticLifecycleDigest(failed) } });
  assert.equal(evaluateCriticLifecycleAdmission(accepted).ok, true);
});

test("requires a real digest-bound Verify receipt, never caller supplied status", () => {
  const forged = packet();
  forged.verify = { status: "passed", candidate: { ...candidate }, receiptSha256: "3".repeat(64) };
  assert.equal(evaluateCriticLifecycleAdmission(forged).code, "verify-receipt-required");
  const tampered = packet(); tampered.verify.receiptSha256 = "3".repeat(64);
  assert.equal(evaluateCriticLifecycleAdmission(tampered).code, "verify-receipt-required");
  const stale = packet(); stale.verify.receipt.candidate.commit = "4".repeat(40);
  stale.verify.receiptSha256 = criticLifecycleDigest(stale.verify.receipt);
  assert.equal(evaluateCriticLifecycleAdmission(stale).code, "verify-receipt-stale");
});

test("unchanged non-content candidate still requires final Verify but not Critic", () => {
  const unchanged = { ...candidate, changedContent: false };
  const input = packet({ current: unchanged });
  input.critic = null;
  assert.equal(evaluateCriticLifecycleAdmission(input).code, "admitted-no-content-change");
});

test("digest helper is deterministic", () => {
  assert.equal(criticLifecycleDigest({ schema: CRITIC_LIFECYCLE_ADMISSION_SCHEMA }), criticLifecycleDigest({ schema: CRITIC_LIFECYCLE_ADMISSION_SCHEMA }));
});
