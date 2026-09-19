// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";

import { designAdvisoryDigest } from "./design-advisory-admission.mjs";
import { DESIGN_ADVISORY_RECORD_SCHEMA, evaluateDesignAdvisoryRecord } from "./design-advisory-enforcement.mjs";

const PLAN = "a".repeat(64);
const SPEC = "b".repeat(64);
const COMMIT = "c".repeat(40);
const TREE = "d".repeat(40);

function record({ unavailable = false } = {}) {
  const receipt = {
    schema: "pipeline.advisory-receipt.v1", receiptId: "advisor-1",
    dispatch: { dispatchId: "design-1", queueRevision: 0, candidateCommit: COMMIT, candidateTree: TREE },
    duty: "advisory", profile: "feature",
    configuredRoute: { runner: "codex", selector: { kind: "model-id", value: "gpt-5.6-sol" }, effort: "high" },
    adapter: "consult", observed: unavailable ? { status: "unavailable", identity: null } : { status: "answered", identity: { provider: "openai", modelId: "gpt-5.6-sol", effort: "high" } },
    questionSha256: PLAN, answerSha256: unavailable ? null : "e".repeat(64),
    fallback: unavailable ? { reason: "consult-unavailable", redactedErrorClass: "unavailable" } : { reason: "none", redactedErrorClass: null }, emittedAtMs: 1,
  };
  const advisor = {
    status: unavailable ? "unavailable" : "complete", route: "generic-consult", mode: "fresh-read-only", readOnly: true,
    dispatchId: "design-1", candidateCommit: COMMIT, candidateTree: TREE,
    designSha256: PLAN, evidenceSha256: SPEC, receiptSha256: designAdvisoryDigest(receipt),
    failureCode: unavailable ? "capacity-unavailable" : null,
  };
  return {
    schema: DESIGN_ADVISORY_RECORD_SCHEMA, featureId: "feature-1", planPath: "specs/feature-1/prd.md", specPath: "specs/feature-1/spec.md",
    admission: {
      workflow: { schema: "pipeline.design-advisory-admission.v1", phase: "initial-design", dispatchId: "design-1", candidateCommit: COMMIT, candidateTree: TREE, designSha256: PLAN, evidenceSha256: SPEC },
      runner: "codex", nativeAvailable: false, advisor, advisorReceipt: receipt,
      elephant: unavailable ? null : { decision: "accept", rationale: "keep bounded plan", dispatchId: "design-1", designSha256: PLAN, evidenceSha256: SPEC, advisorReceiptSha256: advisor.receiptSha256 },
      finalException: unavailable ? { kind: "advisor-unavailable", approval: "final", oneTime: true, approved: true, rationale: "receipt is unavailable", dispatchId: "design-1", designSha256: PLAN, evidenceSha256: SPEC, failureCode: "capacity-unavailable" } : null,
    },
  };
}

function evaluate(value, finalApprovalValid = false) {
  return evaluateDesignAdvisoryRecord({ record: value, featureId: "feature-1", planPath: "specs/feature-1/prd.md", specPath: "specs/feature-1/spec.md", planSha256: PLAN, specSha256: SPEC, finalApprovalValid });
}

test("accepts a fresh read-only Advisor with an Elephant disposition", () => {
  assert.deepEqual(evaluate(record()), { ok: true, mode: "consulted", route: "generic-consult" });
});

test("fails closed for no Advisor, forged receipt, and package drift", () => {
  assert.equal(evaluate(null).code, "design-advisor-record-shape");
  const forged = record(); forged.admission.advisorReceipt.dispatch.candidateTree = "f".repeat(40);
  assert.equal(evaluate(forged).code, "design-advisor-advisor-not-fresh-read-only");
  assert.equal(evaluate(record(), false).ok, true);
  assert.equal(evaluateDesignAdvisoryRecord({ record: record(), featureId: "feature-1", planPath: "specs/feature-1/prd.md", specPath: "specs/feature-1/spec.md", planSha256: "f".repeat(64), specSha256: SPEC }).code, "design-advisor-package-drift");
});

test("accepts an unavailable exception only when final PO approval has been independently verified", () => {
  assert.equal(evaluate(record({ unavailable: true })).code, "design-advisor-unavailable-final-approval-unverified");
  assert.deepEqual(evaluate(record({ unavailable: true }), true), { ok: true, mode: "advisor-unavailable-exception", route: "generic-consult" });
});
