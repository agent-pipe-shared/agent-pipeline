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

test("a receipt written before the rule still matches its minor-only verdict, a contradicting receipt does not", () => {
  const minors = verdict({ pass: false, findings: [finding("minor")] });
  assert.equal(receiptMatchesVerdict(false, minors), true);
  assert.equal(receiptMatchesVerdict(true, minors), true);
  const major = verdict({ pass: false, findings: [finding("major")] });
  assert.equal(receiptMatchesVerdict(false, major), true);
  assert.equal(receiptMatchesVerdict(true, major), false);
});
