#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * resume-hint.test.mjs -- test suite for lib/resume-hint.mjs.
 *
 * This file did not previously exist on this branch (sprint_phoenix); it is created
 * here under backlog item
 * `pipeline.resume-hint-opaque-token-rejects-hyphenated-english`'s diagnostic-half
 * fix (see that item's Triage, 2026-08-18). Coverage below is scoped to that fix:
 * `buildResumeHint`'s bare `RH-SCHEMA` used to give a caller nothing to act on when
 * `opaqueToken()`'s length-plus-alphabet heuristic false-positives on an ordinary
 * hyphenated English compound word -- a purpose-written probe script and a bisect
 * through twelve candidate strings was the cost of finding that
 * `documentation-reconciliation` and `checked-and-divergence-filed` (both 28
 * characters, no digit, no case mixing) tripped it. `resumeHintContextDetail()`
 * turns that bare code into one naming the offending field. `opaqueToken()`'s
 * detection heuristic itself is NOT touched or relaxed here (per that item's own
 * Proposal #2 and this dispatch's Prohibitions) -- both fixtures below are still,
 * correctly, rejected; only the diagnostic message improves.
 *
 * Run: node --test plugins/pipeline-core/lib/resume-hint.test.mjs
 */
import assert from "node:assert/strict";

import { buildResumeHint, RESUME_HINT_SCHEMA, resumeHintContextDetail, validateResumeHint } from "./resume-hint.mjs";

let passed = 0;
let failed = 0;
function check(name, callback) {
  try { callback(); console.log(`PASS ${name}`); passed += 1; }
  catch (error) { console.error(`FAIL ${name}: ${error.stack ?? error.message}`); failed += 1; }
}

const BASE = {
  intent: "Ship the resume-hint diagnostic-message fix.",
  scope: ["resume-hint module only"],
  constraints: ["diagnostic message improvement only, keep detection heuristic unchanged"],
  questions: [],
};

check("a well-formed card is accepted and self-validates", () => {
  const hint = buildResumeHint({ context: BASE, createdAt: "2026-08-18T09:00:00.000Z" });
  assert.equal(hint.schema, RESUME_HINT_SCHEMA);
  const checked = validateResumeHint(hint);
  assert.equal(checked.ok, true);
  assert.equal(checked.code, "RH-VALID");
});

// RH-SCHEMA-DIAG-1. The two confirmed false-positive strings from the backlog item
// (both ordinary hyphenated English compounds, 28 characters, no digit, no case
// mixing) must still be rejected -- but the rejection must now name the offending
// field rather than surface the bare four-character code.
check("RH-SCHEMA-DIAG-1a: 'documentation-reconciliation' in `intent` names the field, not a bare RH-SCHEMA", () => {
  const context = { ...BASE, intent: "documentation-reconciliation is the current focus" };
  assert.throws(() => buildResumeHint({ context }), (error) => {
    assert.notEqual(error.message, "RH-SCHEMA", "must not regress to the bare undifferentiated code");
    assert.match(error.message, /^RH-SCHEMA: /u, "the code stays the contract, followed by a detail clause");
    assert.match(error.message, /\bintent\b/u, "the message must name the offending field");
    return true;
  });
});

check("RH-SCHEMA-DIAG-1b: 'checked-and-divergence-filed' in `scope` names the field, not a bare RH-SCHEMA", () => {
  const context = { ...BASE, scope: ["checked-and-divergence-filed"] };
  assert.throws(() => buildResumeHint({ context }), (error) => {
    assert.notEqual(error.message, "RH-SCHEMA");
    assert.match(error.message, /^RH-SCHEMA: /u);
    assert.match(error.message, /\bscope\b/u, "the message must name the offending field");
    return true;
  });
});

check("resumeHintContextDetail never echoes the rejected value itself", () => {
  const detail = resumeHintContextDetail({ ...BASE, intent: "documentation-reconciliation is the current focus" });
  assert.match(detail, /\bintent\b/u);
  assert.doesNotMatch(detail, /documentation-reconciliation/u, "a diagnostic must not repeat a value flagged as secret-shaped");
});

check("a missing context key is distinguished from an unexpected one", () => {
  const { questions, ...missingQuestions } = BASE;
  assert.ok(questions);
  assert.throws(() => buildResumeHint({ context: missingQuestions }), /RH-SCHEMA: context keys must be exactly .*missing: questions/u);
  assert.throws(() => buildResumeHint({ context: { ...BASE, note: "extra" } }), /RH-SCHEMA: context keys must be exactly .*unexpected: note/u);
});

check("a schema failure unrelated to the context (e.g. wrong top-level shape) still returns the bare code", () => {
  const checked = validateResumeHint({ schema: RESUME_HINT_SCHEMA, nonAuthoritative: true, context: BASE, createdAt: "not-a-date", basis: null, contentSha256: "0".repeat(64) });
  assert.equal(checked.ok, false);
  assert.equal(checked.code, "RH-SCHEMA");
});

// RH-SCHEMA-DIAG-2. A fully-valid `context` with an invalid `createdAt` must NOT
// be blamed on context: resumeHintContextDetail() would find nothing wrong and
// fall through to its generic "context is not accepted in this shape", which is
// false -- context WAS accepted; createdAt was the actual problem.
check("RH-SCHEMA-DIAG-2: an invalid createdAt with a fully-valid context does not blame context", () => {
  assert.throws(() => buildResumeHint({ context: BASE, createdAt: "not-a-date" }), (error) => {
    assert.doesNotMatch(error.message, /context is not accepted in this shape/u, "must not falsely blame a valid context");
    assert.equal(error.message, "RH-SCHEMA", "falls back to the bare code since the cause is createdAt, not context");
    return true;
  });
});

console.log(`\nresume-hint: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
