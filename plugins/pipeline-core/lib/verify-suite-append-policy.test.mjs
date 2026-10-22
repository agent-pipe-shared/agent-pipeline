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
  // D103: a new row in front of a retained prior row is an insertion, no longer a rewrite.
  // Reordering rows that already existed stays refused (see the D103 test below).
  const reordered = [...next.suites, { name: "third-tests", file: "lib/third.test.mjs" }];
  reordered.splice(0, 2, reordered[1], reordered[0]);
  assert.equal(check(next, { ...next, suites: reordered }).code, "VSA-PRIOR-ENTRY-CHANGED");
  assert.equal(check(prior, { ...next, suites: [{ ...prior.suites[0], file: "lib/weakened.test.mjs" }, next.suites[1]] }).code,
    "VSA-PRIOR-ENTRY-CHANGED");
});

test("D103 admits insertion at any position while every prior row is retained unchanged", () => {
  const a = { name: "a-tests", file: "lib/a.test.mjs", invariantPinned: "a" };
  const b = { name: "b-tests", file: "lib/b.test.mjs" };
  const c = { name: "c-tests", file: "lib/c.test.mjs" };
  const x = { name: "x-tests", file: "lib/x.test.mjs" };
  const y = { name: "y-tests", file: "lib/y.test.mjs" };
  const before = { ...prior, suites: [a, b, c] };
  const after = (suites) => check(before, { ...before, suites });
  assert.deepEqual(after([x, a, b, c]), { ok: true, code: "VSA-APPEND", appended: 1 });
  assert.deepEqual(after([a, x, b, c]), { ok: true, code: "VSA-APPEND", appended: 1 });
  assert.deepEqual(after([a, b, x, y, c]), { ok: true, code: "VSA-APPEND", appended: 2 });
  assert.deepEqual(after([a, x, b, c, y]), { ok: true, code: "VSA-APPEND", appended: 2 });
  // Insertion never excuses a changed, removed, reordered or duplicate row.
  assert.equal(after([a, x, { ...b, invariantPinned: "weakened" }, c]).code, "VSA-PRIOR-ENTRY-CHANGED");
  assert.equal(after([a, x, y, c]).code, "VSA-PRIOR-ENTRY-CHANGED");
  assert.equal(after([a, x, c, b]).code, "VSA-PRIOR-ENTRY-CHANGED");
  assert.equal(after([a, b, c, x, { name: x.name, file: "lib/other.test.mjs" }]).code, "VSA-ENTRY");
  assert.equal(after([a, b, c, x, { name: "other", file: x.file }]).code, "VSA-ENTRY");
  assert.equal(after([a, b, c]).code, "VSA-NO-APPEND");
  assert.equal(after([a, b]).code, "VSA-NO-APPEND");
});

test("B2-ii rejects malformed, duplicate-key and duplicate-suite postimages", () => {
  assert.equal(evaluateVerifySuiteAppend({ beforeBytes: JSON.stringify(prior), afterBytes: '{"schema":"pipeline.verify-suites.v1","schema":"pipeline.verify-suites.v1","suites":[]}' }).code, "VSA-SHAPE");
  assert.equal(check(prior, { ...next, suites: [...next.suites, next.suites[1]] }).code, "VSA-ENTRY");
  assert.equal(check(prior, { ...next, suites: [...next.suites,
    { name: "other", file: next.suites[1].file }] }).code, "VSA-ENTRY");
});
