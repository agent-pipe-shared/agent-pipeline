// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";
import { dualEvaluateDecisionReference, isDecisionReference, MIGRATION_COMPAT } from "./decision-reference-dual-evaluation.mjs";

const reference = {
  schema: "pipeline.human-decision-reference.v1",
  decisionId: "PHX-DEC-1",
  decisionDigest: "a".repeat(64),
  candidate: { commit: "b".repeat(40), tree: "c".repeat(40) },
  checkpoint: {
    repositoryFingerprint: "d".repeat(64),
    streamId: "human",
    sequence: 1,
    eventDigest: "e".repeat(64),
    candidateCommit: "b".repeat(40),
    candidateTree: "c".repeat(40),
  },
};

test("isDecisionReference validates the exact pipeline.human-decision-reference.v1 shape", () => {
  assert.equal(isDecisionReference(reference), true);
  assert.equal(isDecisionReference({ ...reference, extra: "x" }), false);
  assert.equal(isDecisionReference({ ...reference, schema: "other" }), false);
  assert.equal(isDecisionReference({ ...reference, decisionDigest: "not-hex" }), false);
  assert.equal(isDecisionReference(null), false);
  assert.equal(isDecisionReference("not-an-object"), false);
});

test("MIGRATION_COMPAT is a frozen { owner, expiresAtEpochMs } object", () => {
  assert.equal(Object.isFrozen(MIGRATION_COMPAT), true);
  assert.equal(typeof MIGRATION_COMPAT.owner, "string");
  assert.equal(Number.isSafeInteger(MIGRATION_COMPAT.expiresAtEpochMs), true);
});

test("no reference present: returns the old-path verdict unchanged, agreement null", () => {
  const result = dualEvaluateDecisionReference({ legacyOk: true, reference: undefined });
  assert.deepEqual(result, { ok: true, agreement: null, legacyOk: true, ledgerOk: null, compat: MIGRATION_COMPAT });
  assert.equal(Object.isFrozen(result), true);
  const resultNull = dualEvaluateDecisionReference({ legacyOk: false, reference: null });
  assert.equal(resultNull.ok, false);
  assert.equal(resultNull.agreement, null);
});

test("reference present and both readers agree true: ok", () => {
  const result = dualEvaluateDecisionReference({ legacyOk: true, reference, ledgerOk: true });
  assert.equal(result.ok, true);
  assert.equal(result.agreement, true);
});

test("reference present and both readers agree false: not ok, but agreement true (never silently trusted)", () => {
  const result = dualEvaluateDecisionReference({ legacyOk: false, reference, ledgerOk: false });
  assert.equal(result.ok, false);
  assert.equal(result.agreement, true);
});

test("reference present and readers disagree in either direction: fails closed", () => {
  assert.equal(dualEvaluateDecisionReference({ legacyOk: true, reference, ledgerOk: false }).ok, false);
  assert.equal(dualEvaluateDecisionReference({ legacyOk: false, reference, ledgerOk: true }).ok, false);
});

test("resolveReference callback is used only when ledgerOk is not already known", () => {
  let calls = 0;
  const resolveReference = (ref) => { calls++; assert.deepEqual(ref, reference); return true; };
  const result = dualEvaluateDecisionReference({ legacyOk: true, reference, resolveReference });
  assert.equal(result.ok, true);
  assert.equal(calls, 1);
  // ledgerOk pre-resolved -- resolveReference must never be invoked.
  dualEvaluateDecisionReference({ legacyOk: true, reference, ledgerOk: true, resolveReference: () => { throw new Error("must not be called"); } });
});

test("a malformed reference never resolves -- fails closed instead of crashing", () => {
  const malformed = { ...reference, decisionDigest: "not-hex" };
  const result = dualEvaluateDecisionReference({ legacyOk: true, reference: malformed, resolveReference: () => true });
  assert.equal(result.ok, false);
  assert.equal(result.ledgerOk, false);
  assert.equal(result.agreement, false);
});

test("legacyOk must be boolean; compat must be a closed { owner, expiresAtEpochMs } object", () => {
  assert.throws(() => dualEvaluateDecisionReference({ legacyOk: "yes", reference: undefined }), TypeError);
  assert.throws(() => dualEvaluateDecisionReference({ legacyOk: true, reference: undefined, compat: { owner: "pipeline" } }), TypeError);
  assert.throws(() => dualEvaluateDecisionReference({ legacyOk: true, reference: undefined, compat: { owner: "", expiresAtEpochMs: 1 } }), TypeError);
});

test("custom compat is carried through structurally on the result", () => {
  const compat = { owner: "custom-owner", expiresAtEpochMs: 12345 };
  const result = dualEvaluateDecisionReference({ legacyOk: true, reference: undefined, compat });
  assert.deepEqual(result.compat, compat);
});
