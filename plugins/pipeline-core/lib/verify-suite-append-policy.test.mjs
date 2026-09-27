// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";
import { evaluateVerifySuiteAppend } from "./verify-suite-append-policy.mjs";

const prior = { schema: "pipeline.verify-suites.v1", suites: [
  { name: "existing-tests", file: "lib/existing.test.mjs", invariantPinned: "existing property" },
] };
const next = { ...prior, suites: [...prior.suites,
  { name: "new-tests", file: "lib/new.test.mjs", invariantPinned: "new property" }] };
const check = (before, after) => evaluateVerifySuiteAppend({ beforeBytes: JSON.stringify(before), afterBytes: JSON.stringify(after) });

test("B2-ii admits one append batch without rewriting previous registrations", () => {
  assert.deepEqual(check(prior, next), { ok: true, code: "VSA-APPEND", appended: 1 });
  assert.deepEqual(check(prior, { ...next, suites: [...next.suites,
    { name: "third-tests", file: "lib/third.test.mjs" }] }),
  { ok: true, code: "VSA-APPEND", appended: 2 });
});

test("B2-ii rejects deletion, reorder, changed coverage and presentation-only edits", () => {
  assert.equal(check(prior, prior).code, "VSA-NO-APPEND");
  assert.equal(check(next, prior).code, "VSA-NO-APPEND");
  assert.equal(check(prior, { ...next, suites: [next.suites[1], next.suites[0]] }).code, "VSA-PRIOR-ENTRY-CHANGED");
  assert.equal(check(prior, { ...next, suites: [{ ...prior.suites[0], file: "lib/weakened.test.mjs" }, next.suites[1]] }).code,
    "VSA-PRIOR-ENTRY-CHANGED");
});

test("B2-ii rejects malformed, duplicate-key and duplicate-suite postimages", () => {
  assert.equal(evaluateVerifySuiteAppend({ beforeBytes: JSON.stringify(prior), afterBytes: '{"schema":"pipeline.verify-suites.v1","schema":"pipeline.verify-suites.v1","suites":[]}' }).code, "VSA-SHAPE");
  assert.equal(check(prior, { ...next, suites: [...next.suites, next.suites[1]] }).code, "VSA-ENTRY");
  assert.equal(check(prior, { ...next, suites: [...next.suites,
    { name: "other", file: next.suites[1].file }] }).code, "VSA-ENTRY");
});
