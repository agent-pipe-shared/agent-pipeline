// SPDX-License-Identifier: SUL-1.0
import test from "node:test";
import assert from "node:assert/strict";

import { AFK_PROJECTION_SCHEMA } from "./afk-review.mjs";
import { classifyAfkWorkflowPreflight } from "./workflow-preflight.mjs";

const activationId = "a".repeat(32);
const ledger = {
  ok: true,
  activationId,
  sequence: 7,
  headSha256: "b".repeat(64),
};

function projection(status) {
  return {
    schema: AFK_PROJECTION_SCHEMA,
    activationId,
    status,
    ledgerSequence: ledger.sequence,
    ledgerHeadSha256: ledger.headSha256,
    privateRefOid: "c".repeat(40),
    updatedAt: "2026-07-18T21:00:00.000Z",
  };
}

test("default-off preserves the ordinary workflow", () => {
  for (const operation of ["dispatch", "git", "close", "push", "activate"]) {
    const result = classifyAfkWorkflowPreflight({ operation });
    assert.equal(result.allowed, true, operation);
    assert.equal(result.status, "off");
  }
});

test("active admits only worker and recovery operations", () => {
  for (const operation of ["dispatch", "git", "close", "push", "activate"]) {
    assert.equal(classifyAfkWorkflowPreflight({ projection: projection("active"), ledger, receipts: [], operation }).allowed,
      false, operation);
  }
  for (const operation of ["afk-worker", "afk-status", "afk-review", "afk-recover"]) {
    assert.equal(classifyAfkWorkflowPreflight({ projection: projection("active"), ledger, receipts: [], operation }).allowed,
      true, operation);
  }
});

test("expected but incomplete or mismatched authority is recovery-only", () => {
  for (const status of ["admitted", "review-required", "blocked"]) {
    assert.equal(classifyAfkWorkflowPreflight({ projection: projection(status), ledger, receipts: [], operation: "push" }).allowed,
      false, status);
    assert.equal(classifyAfkWorkflowPreflight({ projection: projection(status), ledger, receipts: [], operation: "afk-recover" }).allowed,
      true, status);
  }
  const missingProjection = classifyAfkWorkflowPreflight({ ledger, receipts: [], operation: "afk-status" });
  assert.equal(missingProjection.code, "AFK-GATE-AUTHORITY-MISMATCH");
  assert.equal(missingProjection.allowed, true);
  const mismatched = { ...ledger, headSha256: "d".repeat(64) };
  assert.equal(classifyAfkWorkflowPreflight({ projection: projection("active"), ledger: mismatched, receipts: [], operation: "close" }).allowed,
    false);
});

test("complete reopens ordinary gates while malformed receipts fail closed", () => {
  assert.equal(classifyAfkWorkflowPreflight({ projection: projection("complete"), ledger, receipts: [], operation: "push" }).allowed,
    true);
  const malformed = classifyAfkWorkflowPreflight({
    projection: projection("complete"), ledger, receipts: [{ approval: true }], operation: "push",
  });
  assert.equal(malformed.allowed, false);
  assert.equal(malformed.code, "AFK-GATE-RECEIPT-INVALID");
});
