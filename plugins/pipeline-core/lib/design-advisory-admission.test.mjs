// SPDX-License-Identifier: SUL-1.0
import test from "node:test";
import assert from "node:assert/strict";
import {
  DESIGN_ADVISORY_ADMISSION_SCHEMA,
  designAdvisoryDigest,
  evaluateDesignAdvisoryAdmission,
} from "./design-advisory-admission.mjs";

const workflow = {
  schema: DESIGN_ADVISORY_ADMISSION_SCHEMA, phase: "initial-design", dispatchId: "ALF-DESIGN-1",
  candidateCommit: "a".repeat(40), candidateTree: "b".repeat(40),
  designSha256: "c".repeat(64), evidenceSha256: "d".repeat(64),
};
function packet({ runner = "codex", nativeAvailable = false, status = "complete" } = {}) {
  const route = runner === "claude" && nativeAvailable ? "native" : "generic-consult";
  const advisor = {
    status, route, mode: "fresh-read-only", readOnly: true, dispatchId: workflow.dispatchId,
    candidateCommit: workflow.candidateCommit, candidateTree: workflow.candidateTree,
    designSha256: workflow.designSha256, evidenceSha256: workflow.evidenceSha256,
    receiptSha256: "e".repeat(64), failureCode: null,
  };
  const elephant = status === "complete" ? {
    decision: "accept", rationale: "bounded proposal is adopted", dispatchId: workflow.dispatchId,
    designSha256: workflow.designSha256, evidenceSha256: workflow.evidenceSha256,
    advisorReceiptSha256: advisor.receiptSha256,
  } : null;
  return { workflow, runner, nativeAvailable, advisor, elephant, finalException: null };
}

test("accepts fresh generic consultation and binds Elephant disposition", () => {
  const result = evaluateDesignAdvisoryAdmission(packet());
  assert.deepEqual(result, { ok: true, mode: "consulted", route: "generic-consult", consumesFinalException: false });
});

test("Claude selects native only when capability is explicitly available", () => {
  assert.equal(evaluateDesignAdvisoryAdmission(packet({ runner: "claude", nativeAvailable: true })).route, "native");
  assert.equal(evaluateDesignAdvisoryAdmission(packet({ runner: "claude", nativeAvailable: false })).route, "generic-consult");
  assert.equal(evaluateDesignAdvisoryAdmission(packet({ runner: "antigravity", nativeAvailable: true })).route, "generic-consult");
});

test("Codex and Antigravity both use the generic fresh route", () => {
  for (const runner of ["codex", "antigravity"]) {
    const result = evaluateDesignAdvisoryAdmission(packet({ runner, nativeAvailable: true }));
    assert.equal(result.ok, true);
    assert.equal(result.route, "generic-consult");
  }
  const invalid = packet(); invalid.nativeAvailable = "observed";
  assert.equal(evaluateDesignAdvisoryAdmission(invalid).code, "capability-unobserved");
});

test("rejects stale, writable, mismatched, and missing disposition evidence", () => {
  const stale = packet(); stale.advisor.designSha256 = "f".repeat(64);
  assert.equal(evaluateDesignAdvisoryAdmission(stale).code, "advisor-binding");
  const writable = packet(); writable.advisor.readOnly = false;
  assert.equal(evaluateDesignAdvisoryAdmission(writable).code, "advisor-not-fresh-read-only");
  const missing = packet(); missing.elephant = null;
  assert.equal(evaluateDesignAdvisoryAdmission(missing).code, "elephant-disposition-required");
});

test("allows only typed unavailable exception with one final PO approval", () => {
  const input = packet({ status: "unavailable" });
  input.advisor.failureCode = "capacity-unavailable";
  input.finalException = {
    kind: "advisor-unavailable", approval: "final", oneTime: true, approved: true,
    rationale: "bounded design can proceed with recorded failure", dispatchId: workflow.dispatchId,
    designSha256: workflow.designSha256, evidenceSha256: workflow.evidenceSha256,
    failureCode: "capacity-unavailable",
  };
  assert.equal(evaluateDesignAdvisoryAdmission(input).mode, "advisor-unavailable-exception");
  const ordinary = packet(); ordinary.finalException = { kind: "advisor-unavailable" };
  assert.equal(evaluateDesignAdvisoryAdmission(ordinary).code, "unavailable-exception-unexpected");
});

test("rejects forged unavailable bypass and malformed advisor status", () => {
  const forged = packet({ status: "unavailable" });
  forged.advisor.failureCode = "capacity-unavailable";
  forged.finalException = { kind: "advisor-unavailable", approval: "final", oneTime: false, approved: true,
    rationale: "x", dispatchId: workflow.dispatchId, designSha256: workflow.designSha256,
    evidenceSha256: workflow.evidenceSha256, failureCode: "capacity-unavailable" };
  assert.equal(evaluateDesignAdvisoryAdmission(forged).code, "final-unavailable-approval-required");
  const malformed = packet(); malformed.advisor.status = "answered";
  assert.equal(evaluateDesignAdvisoryAdmission(malformed).code, "advisor-unavailable-untyped");
});

test("digest helper is deterministic and does not retain transcript material", () => {
  assert.equal(designAdvisoryDigest({ a: 1 }), designAdvisoryDigest({ a: 1 }));
  assert.match(designAdvisoryDigest({ answer: "redacted" }), /^[a-f0-9]{64}$/);
});
