#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { compareShadowRuns, classifyDivergence } from "./codex-critic-shadow.mjs";

const H = (digit) => digit.repeat(64);
test("shadow receipt schema parses and closes its root/case vocabulary", () => {
  const schema = JSON.parse(readFileSync(new URL("./codex-critic-shadow-receipt.schema.json", import.meta.url), "utf8"));
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.cases.items.additionalProperties, false);
});
function verdict({ pass, raw = "1", severity = "major", valid = true }) {
  return valid ? { valid: true, pass, findings: pass ? [] : [{ id: "seeded-gap", severity }], semanticSha256: H("a"), rawSha256: H(raw) }
    : { valid: false, pass: null, findings: [], semanticSha256: null, rawSha256: H(raw) };
}
function fixture() {
  const packets = { positive: H("b"), "seeded-negative": H("c") };
  const lane = (packetSha256, receipt, value) => ({ packetSha256, receiptSha256: H(receipt), verdict: value });
  return {
    shadowId: "shadow-1",
    cases: [
      { kind: "positive", packetSha256: packets.positive, current: lane(packets.positive, "1", verdict({ pass: true, raw: "2" })), sandbox: lane(packets.positive, "3", verdict({ pass: true, raw: "4" })) },
      { kind: "seeded-negative", packetSha256: packets["seeded-negative"], current: lane(packets["seeded-negative"], "5", verdict({ pass: false, raw: "6" })), sandbox: lane(packets["seeded-negative"], "7", verdict({ pass: false, raw: "8" })) },
    ],
    canaries: [{ id: "repo", beforeSha256: H("9"), afterSha256: H("9") }], emittedAtMs: 1_000,
  };
}

test("same-packet positive and seeded-negative cases can gate activation only", () => {
  const receipt = compareShadowRuns(fixture());
  assert.equal(receipt.gateEligible, true);
  assert.equal(receipt.productionCriticGateSatisfied, false);
  assert.deepEqual(receipt.cases.map(({ divergence }) => divergence), ["expected-wording", "expected-wording"]);
});

test("packet substitution blocks before comparison", () => {
  const input = fixture();
  input.cases[1].sandbox.packetSha256 = H("0");
  assert.throws(() => compareShadowRuns(input), { code: "F5-PACKET" });
});

test("finding set, severity and invalid results are distinct", () => {
  assert.equal(classifyDivergence(verdict({ pass: false }), verdict({ pass: false, severity: "critical" })), "finding-severity");
  assert.equal(classifyDivergence(verdict({ pass: true }), verdict({ pass: false })), "finding-set");
  assert.equal(classifyDivergence(verdict({ pass: true }), verdict({ pass: true, valid: false })), "invalid-result");
});

test("canary drift and a missed seeded gap fail the activation comparison", () => {
  const drift = fixture(); drift.canaries[0].afterSha256 = H("0");
  assert.equal(compareShadowRuns(drift).gateEligible, false);
  const missed = fixture(); missed.cases[1].sandbox.verdict = verdict({ pass: true });
  assert.equal(compareShadowRuns(missed).gateEligible, false);
});
