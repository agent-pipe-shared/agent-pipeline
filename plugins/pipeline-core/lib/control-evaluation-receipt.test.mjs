// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  createEvaluationReceipt,
  validateEvaluationReceipt,
} from "./control-evaluation-receipt.mjs";

function deepFreeze(v, seen = new Set()) {
  if (v && typeof v === "object" && !seen.has(v)) {
    seen.add(v);
    Object.values(v).forEach((x) => deepFreeze(x, seen));
    Object.freeze(v);
  }
  return v;
}

// A minimal, self-contained stand-in for CYB-1b's `resolvedControls` array
// shape — this test does not import security-policy-resolver.mjs; it only
// needs *some* array that createEvaluationReceipt passes through unchanged.
function sampleResolvedControls() {
  return [
    {
      id: "ctl.base.secrets.no-committed-secrets",
      control: { id: "ctl.base.secrets.no-committed-secrets", revision: 1 },
      contributingModule: null,
      applicability: "applicable",
      missingInputs: [],
    },
  ];
}

const SAMPLE_POLICY_DIGEST = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

// --- AC6: different candidateId (same policy/resolvedControls) -> different receiptDigest

{
  const resolvedControls = sampleResolvedControls();
  const receiptA = createEvaluationReceipt({
    candidateId: "candidate-a",
    policyDigest: SAMPLE_POLICY_DIGEST,
    resolvedControls,
    evaluatedAt: "2026-07-25T00:00:00.000Z",
  });
  const receiptB = createEvaluationReceipt({
    candidateId: "candidate-b",
    policyDigest: SAMPLE_POLICY_DIGEST,
    resolvedControls,
    evaluatedAt: "2026-07-25T00:00:00.000Z",
  });

  assert.notEqual(receiptA.candidateId, receiptB.candidateId);
  assert.equal(receiptA.policyDigest, receiptB.policyDigest);
  assert.notEqual(
    receiptA.receiptDigest,
    receiptB.receiptDigest,
    "two evaluations of different candidates against the identical policy must produce different receipt digests (AC6)",
  );
}

// --- AC6 companion: identical inputs -> identical receiptDigest AND identical full receipt (determinism)

{
  const resolvedControls = sampleResolvedControls();
  const input = {
    candidateId: "candidate-a",
    policyDigest: SAMPLE_POLICY_DIGEST,
    resolvedControls,
    evaluatedAt: "2026-07-25T00:00:00.000Z",
  };

  const run1 = createEvaluationReceipt(input);
  const run2 = createEvaluationReceipt(input);

  assert.equal(run1.receiptDigest, run2.receiptDigest);
  assert.deepEqual(run1, run2);
  assert.equal(JSON.stringify(run1), JSON.stringify(run2));

  // calling twice never mutates the shared input
  const before = JSON.stringify(input);
  createEvaluationReceipt(input);
  assert.equal(JSON.stringify(input), before);
}

// --- AC6: evaluatedAt is informative-only, never part of the receiptDigest payload

{
  const resolvedControls = sampleResolvedControls();
  const withTimestamp = createEvaluationReceipt({
    candidateId: "candidate-a",
    policyDigest: SAMPLE_POLICY_DIGEST,
    resolvedControls,
    evaluatedAt: "2026-07-25T00:00:00.000Z",
  });
  const withDifferentTimestamp = createEvaluationReceipt({
    candidateId: "candidate-a",
    policyDigest: SAMPLE_POLICY_DIGEST,
    resolvedControls,
    evaluatedAt: "2099-01-01T00:00:00.000Z",
  });
  const withoutTimestamp = createEvaluationReceipt({
    candidateId: "candidate-a",
    policyDigest: SAMPLE_POLICY_DIGEST,
    resolvedControls,
  });

  assert.equal(withTimestamp.receiptDigest, withDifferentTimestamp.receiptDigest);
  assert.equal(withTimestamp.receiptDigest, withoutTimestamp.receiptDigest);
  assert.equal(withoutTimestamp.evaluatedAt, null);
}

// --- AC6: rejects (typed error) when candidateId or policyDigest is missing/malformed

{
  const resolvedControls = sampleResolvedControls();
  const base = { policyDigest: SAMPLE_POLICY_DIGEST, resolvedControls };

  assert.throws(() => createEvaluationReceipt({ ...base }), TypeError, "missing candidateId must throw");
  assert.throws(() => createEvaluationReceipt({ ...base, candidateId: "" }), TypeError, "empty-string candidateId must throw");
  assert.throws(() => createEvaluationReceipt({ ...base, candidateId: 42 }), TypeError, "non-string candidateId must throw");

  const baseWithCandidate = { candidateId: "candidate-a", resolvedControls };
  assert.throws(() => createEvaluationReceipt({ ...baseWithCandidate }), TypeError, "missing policyDigest must throw");
  assert.throws(() => createEvaluationReceipt({ ...baseWithCandidate, policyDigest: "" }), TypeError, "empty-string policyDigest must throw");
  assert.throws(() => createEvaluationReceipt({ ...baseWithCandidate, policyDigest: 42 }), TypeError, "non-string policyDigest must throw");

  assert.throws(
    () => createEvaluationReceipt({ candidateId: "candidate-a", policyDigest: SAMPLE_POLICY_DIGEST }),
    TypeError,
    "missing resolvedControls must throw",
  );
  assert.throws(
    () => createEvaluationReceipt({ candidateId: "candidate-a", policyDigest: SAMPLE_POLICY_DIGEST, resolvedControls: "not-an-array" }),
    TypeError,
    "non-array resolvedControls must throw",
  );
  assert.throws(() => createEvaluationReceipt(null), TypeError);
  assert.throws(() => createEvaluationReceipt("not-an-object"), TypeError);

  // an empty resolvedControls array is a legitimate zero-control resolution, not an error
  assert.doesNotThrow(() =>
    createEvaluationReceipt({ candidateId: "candidate-a", policyDigest: SAMPLE_POLICY_DIGEST, resolvedControls: [] }),
  );
}

// --- purity: no mutation of input, works against deeply frozen input --------

{
  const input = deepFreeze({
    candidateId: "candidate-a",
    policyDigest: SAMPLE_POLICY_DIGEST,
    resolvedControls: sampleResolvedControls(),
    evaluatedAt: "2026-07-25T00:00:00.000Z",
  });

  assert.doesNotThrow(() => createEvaluationReceipt(input));
  const receipt = createEvaluationReceipt(input);
  assert.equal(receipt.candidateId, "candidate-a");
}

// --- AC11: round-trip a valid receipt through validateEvaluationReceipt() -> accepted

{
  const receipt = createEvaluationReceipt({
    candidateId: "candidate-a",
    policyDigest: SAMPLE_POLICY_DIGEST,
    resolvedControls: sampleResolvedControls(),
    evaluatedAt: "2026-07-25T00:00:00.000Z",
  });

  const result = validateEvaluationReceipt(receipt);
  assert.deepEqual(result, { valid: true });

  // a receipt created WITHOUT evaluatedAt must also round-trip cleanly —
  // optional/informative fields are never grounds for rejection
  const receiptNoTimestamp = createEvaluationReceipt({
    candidateId: "candidate-a",
    policyDigest: SAMPLE_POLICY_DIGEST,
    resolvedControls: sampleResolvedControls(),
  });
  assert.deepEqual(validateEvaluationReceipt(receiptNoTimestamp), { valid: true });
}

// --- AC11: rejects a receipt missing one of the four required fields, with a field-naming typed error

{
  const validReceipt = createEvaluationReceipt({
    candidateId: "candidate-a",
    policyDigest: SAMPLE_POLICY_DIGEST,
    resolvedControls: sampleResolvedControls(),
  });

  for (const field of ["candidateId", "policyDigest", "resolvedControls", "receiptDigest"]) {
    const broken = { ...validReceipt };
    delete broken[field];
    const result = validateEvaluationReceipt(broken);
    assert.equal(result.valid, false, `receipt missing "${field}" must be rejected`);
    assert.ok(
      result.errors.some((e) => e.field === field),
      `rejection errors must name the missing field "${field}"`,
    );
  }

  // non-object input is rejected with a typed (field-naming) error too
  const nonObjectResult = validateEvaluationReceipt(null);
  assert.equal(nonObjectResult.valid, false);
  assert.ok(nonObjectResult.errors.length > 0);

  // malformed (wrong-type) required fields are rejected, not just missing ones
  const malformed = validateEvaluationReceipt({ ...validReceipt, resolvedControls: "not-an-array" });
  assert.equal(malformed.valid, false);
  assert.ok(malformed.errors.some((e) => e.field === "resolvedControls"));
}

// --- AC11: the top-of-file comment states the single-schema consumption contract

{
  const modulePath = fileURLToPath(new URL("./control-evaluation-receipt.mjs", import.meta.url));
  const source = readFileSync(modulePath, "utf8");
  assert.match(
    source,
    /pipeline\.control-catalog\.v1.{0,80}THIS receipt shape.{0,120}ONE, sole, normalized evaluation-receipt schema/s,
    "top-of-file comment must state the single receipt schema consumption contract",
  );
  assert.match(
    source,
    /No package may define a second, parallel policy\/result schema/,
    "top-of-file comment must explicitly forbid a second parallel policy/result schema (AC11)",
  );
}

console.log("control-evaluation-receipt: ok");
