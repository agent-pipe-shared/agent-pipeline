// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { test } from "node:test";
import { criticRoundPassed, receiptMatchesVerdict } from "./critic-round-pass.mjs";

const finding = (severity) => ({ severity, gap: "gap", risk: "risk", evidence: "src/a.mjs:1", spec_ref: "AC-1" });
const verdict = (overrides = {}) => ({
  findings: [], deliberately_not_flagged: ["scope"], trajectory_verdict: "consistent",
  trajectory_evidence: "evidence bound to the candidate", briefing_violations: [], pass: true, ...overrides,
});

test("a round holding only minors has passed even when the Critic set pass false", () => {
  assert.equal(criticRoundPassed(verdict({ pass: false, findings: [finding("minor"), finding("minor")] })), true);
});

test("a clean pass and a pass with minors stay passes", () => {
  assert.equal(criticRoundPassed(verdict()), true);
  assert.equal(criticRoundPassed(verdict({ findings: [finding("minor")] })), true);
});

for (const severity of ["blocker", "major"]) {
  test(`a ${severity} finding fails the round whatever the pass flag says`, () => {
    assert.equal(criticRoundPassed(verdict({ pass: false, findings: [finding(severity), finding("minor")] })), false);
    assert.equal(criticRoundPassed(verdict({ pass: true, findings: [finding(severity)] })), false);
  });
}

test("a briefing violation fails a round that holds only minors", () => {
  assert.equal(criticRoundPassed(verdict({ pass: false, findings: [finding("minor")], briefing_violations: ["the range was widened"] })), false);
});

for (const trajectory of ["inconsistent", "not verifiable"]) {
  test(`a trajectory of ${trajectory} fails a round that holds only minors`, () => {
    assert.equal(criticRoundPassed(verdict({ pass: false, findings: [finding("minor")], trajectory_verdict: trajectory })), false);
  });
}

test("pass false without any finding stays a failure", () => {
  assert.equal(criticRoundPassed(verdict({ pass: false })), false);
});

test("a partial review that withheld its verdict is not a pass", () => {
  assert.equal(criticRoundPassed(verdict({ pass: false, findings: [finding("minor")], trajectory_evidence: "pass/fail withheld — partial review; src/b.mjs not reached" })), false);
  assert.equal(criticRoundPassed(verdict({ pass: false, findings: [finding("minor")], deliberately_not_flagged: ["partial review, categories 7-11 not reached"] })), false);
});

test("anything that is not a verdict fails closed", () => {
  for (const value of [null, undefined, "pass", {}, { pass: true }, { pass: true, findings: [] }]) assert.equal(criticRoundPassed(value), false);
});

// C28-CRITIC-TOIL (AC-108): a round's result is shown as three separate things, so a model pass:false with a passing policy decision cannot read as a failed round
// (live, Codex round 4: the Elephant ran an extra round). Imported inside the cases so the cases above keep running whatever this export does.
test("the display of a minor-only round with pass false keeps the model verdict, the policy decision and the remaining findings apart, and its next step follows the policy", async () => {
  const { criticRoundDisplay } = await import("./critic-round-pass.mjs");
  const display = criticRoundDisplay(verdict({ pass: false, findings: [finding("minor")] }));
  assert.deepEqual(display.modelVerdict, { pass: false });
  assert.equal(display.policyDecision.reviewPass, true);
  assert.match(display.policyDecision.reason, /minor/iu);
  assert.deepEqual(display.remainingFindings, { total: 1, blocker: 0, major: 0, minor: 1 });
  assert.match(display.nextStep, /passed by policy/u);
  assert.match(display.nextStep, /no further (?:Critic )?round/iu);
  assert.doesNotMatch(display.nextStep, /open the next round/u);
});

test("the display of a round with a major finding fails by policy and sends the next step to a correction round", async () => {
  const { criticRoundDisplay } = await import("./critic-round-pass.mjs");
  const display = criticRoundDisplay(verdict({ pass: true, findings: [finding("major"), finding("minor")] }));
  assert.deepEqual(display.modelVerdict, { pass: true });
  assert.equal(display.policyDecision.reviewPass, false);
  assert.deepEqual(display.remainingFindings, { total: 2, blocker: 0, major: 1, minor: 1 });
  assert.match(display.nextStep, /did not pass by policy/u);
  assert.match(display.nextStep, /open the next round/u);
});

test("the display of anything that is not a verdict fails closed and claims no model verdict", async () => {
  const { criticRoundDisplay } = await import("./critic-round-pass.mjs");
  for (const value of [null, undefined, "pass", {}]) {
    const display = criticRoundDisplay(value);
    assert.deepEqual([display.modelVerdict.pass, display.policyDecision.reviewPass, display.remainingFindings.total], [null, false, 0]);
  }
});

test("a receipt written before the rule still matches its minor-only verdict, a contradicting receipt does not", () => {
  const minors = verdict({ pass: false, findings: [finding("minor")] });
  assert.equal(receiptMatchesVerdict(false, minors), true);
  assert.equal(receiptMatchesVerdict(true, minors), true);
  const major = verdict({ pass: false, findings: [finding("major")] });
  assert.equal(receiptMatchesVerdict(false, major), true);
  assert.equal(receiptMatchesVerdict(true, major), false);
});
