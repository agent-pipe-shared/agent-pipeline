#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";
import { digestJson } from "./verify-resume.mjs";
import { parseVerifyCaseCompletion, validateVerifyCaseCompletionAttestation, verifyCaseCompletionPolicySha256 } from "./verify-case-completion-receipt.mjs";

const policy = { schema: "pipeline.verify-case-completion-policy.v1", caseIds: ["C01", "C02"], maxBytes: 4096 };
function stream({ omitTerminal = false, reverse = false, disposition = "pass" } = {}) {
  const ordered = [{ id: "C01", disposition }, { id: "C02", disposition: "skip" }];
  const records = [
    { schema: "pipeline.test-case-completion.v1", event: "DECLARED", caseIds: policy.caseIds, caseCount: 2, caseSetSha256: digestJson(policy.caseIds) },
    ...ordered.map((entry, ordinal) => ({ schema: "pipeline.test-case-completion.v1", event: "DISPOSED", id: entry.id, ordinal, disposition: entry.disposition })),
    { schema: "pipeline.test-case-completion.v1", event: "TERMINAL", declaredCount: 2, disposedCount: 2, caseIds: policy.caseIds, caseSetSha256: digestJson(policy.caseIds), dispositionsSha256: digestJson(ordered), counts: { pass: disposition === "pass" ? 1 : 0, fail: disposition === "fail" ? 1 : 0, skip: 1, todo: 0 } },
  ];
  if (omitTerminal) records.pop();
  if (reverse) [records[1], records[2]] = [records[2], records[1]];
  return Buffer.from(`${records.map((entry) => JSON.stringify(entry)).join("\n")}\n`);
}

test("accepts one complete ordered bounded stream and binds the policy", () => {
  const receipt = parseVerifyCaseCompletion(stream(), policy);
  assert.equal(validateVerifyCaseCompletionAttestation(receipt), true);
  assert.equal(receipt.policySha256, verifyCaseCompletionPolicySha256(policy));
  assert.deepEqual(receipt.counts, { pass: 1, fail: 0, skip: 1, todo: 0 });
});

test("accepts a complete red case while preserving its failed disposition", () => {
  assert.deepEqual(parseVerifyCaseCompletion(stream({ disposition: "fail" }), policy).counts, { pass: 0, fail: 1, skip: 1, todo: 0 });
});

test("fails closed on missing terminal, order drift, malformed JSON and overflow", () => {
  assert.throws(() => parseVerifyCaseCompletion(stream({ omitTerminal: true }), policy), /TERMINAL/u);
  assert.throws(() => parseVerifyCaseCompletion(stream({ reverse: true }), policy), /DISPOSITION/u);
  assert.throws(() => parseVerifyCaseCompletion(Buffer.from("{}\nnot-json\n"), policy), /JSON/u);
  assert.throws(() => parseVerifyCaseCompletion(Buffer.alloc(policy.maxBytes + 1), policy), /BOUNDS/u);
});
