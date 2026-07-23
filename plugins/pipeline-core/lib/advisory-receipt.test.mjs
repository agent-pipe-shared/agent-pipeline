#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { ADVISORY_RECEIPT_SCHEMA, loadAdvisoryReceiptSchema, validateAdvisoryReceipt } from "./advisory-receipt.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const HASH = sha256("bound advisory content");
const BASE = Object.freeze({
  schema: ADVISORY_RECEIPT_SCHEMA,
  receiptId: "advisory-20260719-01",
  dispatch: {
    dispatchId: "dispatch-20260719-01",
    queueRevision: 7,
    candidateCommit: "a".repeat(40),
    candidateTree: "b".repeat(40),
  },
  duty: "advisory",
  profile: "epic",
  configuredRoute: {
    runner: "claude",
    selector: { kind: "alias", value: "fable" },
    effort: "max",
  },
  adapter: "native",
  observed: {
    status: "answered",
    identity: { provider: "anthropic", modelId: "claude-fable", effort: "max" },
  },
  questionSha256: HASH,
  answerSha256: sha256("sanitized advice"),
  fallback: { reason: "none", redactedErrorClass: null },
  emittedAtMs: 1_784_355_600_000,
});

function copy(value) {
  return structuredClone(value);
}

test("schema identifies the runner-neutral receipt and closes its fields", () => {
  const schema = loadAdvisoryReceiptSchema();
  assert.equal(schema.$id, ADVISORY_RECEIPT_SCHEMA);
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.properties.duty, { const: "advisory" });
  assert.deepEqual(schema.properties.adapter.enum, ["native", "consult"]);
});

test("accepts common native and fresh-consult success receipts", () => {
  assert.deepEqual(validateAdvisoryReceipt(copy(BASE)), { ok: true });
  const consult = copy(BASE);
  consult.profile = "feature";
  consult.configuredRoute = {
    runner: "codex",
    selector: { kind: "model-id", value: "gpt-5.6-sol" },
    effort: "xhigh",
  };
  consult.adapter = "consult";
  consult.observed.identity = { provider: "openai", modelId: "gpt-5.6-sol", effort: "xhigh" };
  assert.deepEqual(validateAdvisoryReceipt(consult), { ok: true });
});

test("a recorded native failure can bind a later consult fallback without a route switch", () => {
  const receipt = copy(BASE);
  receipt.adapter = "consult";
  receipt.fallback = { reason: "native-timeout", redactedErrorClass: "timeout" };
  assert.deepEqual(validateAdvisoryReceipt(receipt), { ok: true });
});

test("rejects raw question or answer fields and malformed content digests", () => {
  const rawQuestion = { ...copy(BASE), question: "please advise" };
  assert.equal(validateAdvisoryReceipt(rawQuestion).ok, false);
  const rawAnswer = { ...copy(BASE), answer: "do this" };
  assert.equal(validateAdvisoryReceipt(rawAnswer).ok, false);
  const malformed = { ...copy(BASE), answerSha256: "not-a-digest" };
  assert.equal(validateAdvisoryReceipt(malformed).ok, false);
});

test("rejects candidate/dispatch drift, wrong observed provider and unsupported profile", () => {
  const dispatchDrift = copy(BASE);
  dispatchDrift.dispatch.candidateTree = "not-an-object";
  assert.equal(validateAdvisoryReceipt(dispatchDrift).ok, false);
  const providerDrift = copy(BASE);
  providerDrift.observed.identity.provider = "openai";
  assert.deepEqual(validateAdvisoryReceipt(providerDrift), { ok: false, reason: "observed-runner-drift" });
  const profileDrift = copy(BASE);
  profileDrift.profile = "design";
  assert.equal(validateAdvisoryReceipt(profileDrift).ok, false);
});

test("failure receipts cannot invent an answer and fallback reasons bind redacted error class", () => {
  const failed = copy(BASE);
  failed.observed = { status: "timed-out", identity: null };
  failed.answerSha256 = null;
  failed.fallback = { reason: "consult-timeout", redactedErrorClass: "timeout" };
  assert.deepEqual(validateAdvisoryReceipt(failed), { ok: true });
  const answerOnFailure = copy(failed);
  answerOnFailure.answerSha256 = HASH;
  assert.deepEqual(validateAdvisoryReceipt(answerOnFailure), { ok: false, reason: "failure-answer" });
  const lyingFallback = copy(failed);
  lyingFallback.fallback.redactedErrorClass = "failure";
  assert.deepEqual(validateAdvisoryReceipt(lyingFallback), { ok: false, reason: "fallback-binding" });
});
