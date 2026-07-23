#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ALLOWED_PRE_VERDICT_CODES,
  INTERMEDIATE_LITERAL,
  WEAK_LITERAL,
  consumeT1PoOverride,
  createT1PoOverride,
  decideT1Fallback,
  validateT1PoOverride,
} from "./critic-t1-po-override.mjs";

const H = (digit) => digit.repeat(64);
function authorized(primaryDisposition = { compatibilityState: "intermediate-preflight-eligible", terminalCode: "ok" }) {
  return createT1PoOverride({
    overrideId: "batman-t1-candidate-1",
    scope: {
      featureId: "sprint-batman-epic", candidateCommit: "1".repeat(40), candidateTree: "2".repeat(40),
      candidateDiffSha256: H("3"), packetSha256: H("4"),
    },
    preflightReceiptSha256: H("5"),
    compatibilityProjectionSha256: H("8"),
    primaryDisposition,
    approval: { decisionId: "po-batman-t1-2026-07-18", attributedTo: "PO", attributionOnly: true, recordedAtMs: 100 },
  });
}

test("closed schema fixes bounded T1 assurance literals and route", () => {
  const schema = JSON.parse(readFileSync(new URL("./critic-t1-po-override.schema.json", import.meta.url), "utf8"));
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.route.additionalProperties, false);
  assert.equal(schema.properties.primary.properties.literal.const, INTERMEDIATE_LITERAL);
  assert.equal(schema.properties.fallback.properties.literal.const, WEAK_LITERAL);
  assert.deepEqual(schema.properties.fallback.properties.allowedPreVerdictCodes.const, ALLOWED_PRE_VERDICT_CODES);
});

test("authorization is exact-candidate, fresh-context, packet-only and PO-attributed", () => {
  const receipt = authorized();
  assert.equal(validateT1PoOverride(receipt), receipt);
  assert.deepEqual(receipt.route, {
    runnerId: "codex", dutyId: "critic_high_risk", selectorKind: "model-id",
    selectorValue: "gpt-5.6-sol", effort: "max", freshContext: true, packetOnly: true,
  });
  assert.deepEqual(receipt.prohibitions, {
    dangerFullAccessProhibited: true, crossRunnerSubstitutionProhibited: true,
    strongIsolationClaimProhibited: true, standingExceptionProhibited: true,
  });
  assert.throws(() => createT1PoOverride({
    overrideId: "bad", scope: { ...receipt.scope, featureId: "other", singleCandidateSingleReview: undefined },
    preflightReceiptSha256: H("5"), compatibilityProjectionSha256: H("8"), primaryDisposition: { compatibilityState: "intermediate-preflight-eligible", terminalCode: "ok" }, approval: receipt.approval,
  }), { code: "T1-OVERRIDE-SCHEMA" });
});

test("typed preflight unavailability authorizes only the matching direct weak fallback", () => {
  const receipt = authorized({ compatibilityState: "diagnostic-only", terminalCode: "child-stdio-error" });
  assert.equal(receipt.primary.availability, "unavailable");
  assert.equal(decideT1Fallback(receipt, { code: "child-stdio-error", verdictBytes: 0, cleanupAttempted: false }).action, "run-one-functional-equivalent");
  assert.equal(decideT1Fallback(receipt, { code: "sandbox-setup-error", verdictBytes: 0, cleanupAttempted: false }).action, "no-usable-review");
  assert.equal(decideT1Fallback(receipt, { code: "verdict-success", verdictBytes: 10, cleanupAttempted: false }).action, "no-usable-review");
  assert.throws(() => authorized({ compatibilityState: "diagnostic-only", terminalCode: "lifecycle-stall" }), { code: "T1-OVERRIDE-PRIMARY" });
});

test("only allowlisted technical failures before verdict and cleanup permit one weak fallback", () => {
  const receipt = authorized();
  for (const code of ALLOWED_PRE_VERDICT_CODES) {
    assert.deepEqual(decideT1Fallback(receipt, { code, verdictBytes: 0, cleanupAttempted: false }), {
      action: "run-one-functional-equivalent", assurance: WEAK_LITERAL,
    });
  }
  for (const observation of [
    { code: "lifecycle-stall", verdictBytes: 0, cleanupAttempted: false },
    { code: "timeout", verdictBytes: 0, cleanupAttempted: false },
    { code: "child-stdio-error", verdictBytes: 1, cleanupAttempted: false },
    { code: "sandbox-setup-error", verdictBytes: 0, cleanupAttempted: true },
  ]) assert.equal(decideT1Fallback(receipt, observation).action, "no-usable-review");
  assert.deepEqual(decideT1Fallback(receipt, { code: "verdict-success", verdictBytes: 50, cleanupAttempted: false }), { action: "consume-primary" });
});

test("consumption is single-use and cannot inherit a strong claim", () => {
  const receipt = consumeT1PoOverride(authorized(), {
    lane: "functional-equivalent", fallbackAttempts: 1, verdictStatus: "pass",
    verdictSha256: H("6"), receiptSha256: H("7"), consumedAtMs: 101,
  });
  assert.equal(receipt.status, "consumed");
  assert.equal(receipt.primary.strongIsolationAsserted, false);
  assert.throws(() => consumeT1PoOverride(receipt, receipt.consumption), { code: "T1-OVERRIDE-CONSUMED" });
  assert.throws(() => consumeT1PoOverride(authorized(), {
    lane: "functional-equivalent", fallbackAttempts: 0, verdictStatus: "pass",
    verdictSha256: H("6"), receiptSha256: H("7"), consumedAtMs: 101,
  }), { code: "T1-OVERRIDE-RESULT" });
});

test("missing verdict remains no usable review and cannot pass T1", () => {
  const receipt = consumeT1PoOverride(authorized(), {
    lane: "intermediate", fallbackAttempts: 0, verdictStatus: "no-usable-review",
    verdictSha256: null, receiptSha256: H("7"), consumedAtMs: 101,
  });
  assert.equal(receipt.consumption.verdictStatus, "no-usable-review");
  assert.throws(() => consumeT1PoOverride(authorized(), {
    lane: "intermediate", fallbackAttempts: 0, verdictStatus: "no-usable-review",
    verdictSha256: H("6"), receiptSha256: H("7"), consumedAtMs: 101,
  }), { code: "T1-OVERRIDE-RESULT" });
});
