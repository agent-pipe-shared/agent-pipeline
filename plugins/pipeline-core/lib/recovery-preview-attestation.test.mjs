#!/usr/bin/env node
import assert from "node:assert/strict";
import test from "node:test";
import {
  attestRecoveryPreviewDelivery,
  createRecoveryPreviewInvocation,
  RECOVERY_PREVIEW_ACK_SCHEMA,
} from "./recovery-preview-attestation.mjs";

const DIGEST = "a".repeat(64);
const INVOCATION = createRecoveryPreviewInvocation({ invocationId: "preview-01", previewDigest: DIGEST });
const ack = (overrides = {}) => ({
  schema: RECOVERY_PREVIEW_ACK_SCHEMA,
  invocationId: "preview-01",
  previewDigest: DIGEST,
  acknowledgementId: "ack-01",
  delivery: "delivered",
  ...overrides,
});
const waitFor = (milliseconds) => {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
};

test("accepts one exact acknowledgement and returns the consumed-id postimage", () => {
  const result = attestRecoveryPreviewDelivery({ invocation: INVOCATION, callback: () => ack() });
  assert.equal(result.code, "RP-DELIVERY-ATTESTED");
  assert.deepEqual(result.usedAcknowledgementIds, ["ack-01"]);
});

test("missing, empty, and throwing callbacks never claim delivery", () => {
  for (const callback of [undefined, () => undefined, () => { throw new Error("callback failure"); }]) {
    const result = attestRecoveryPreviewDelivery({ invocation: INVOCATION, callback });
    assert.equal(result.delivered, false);
    assert.notEqual(result.code, "RP-DELIVERY-ATTESTED");
  }
});

test("async callbacks are rejected rather than treated as delivered", () => {
  const result = attestRecoveryPreviewDelivery({ invocation: INVOCATION, callback: async () => ack() });
  assert.deepEqual(result, { ok: false, code: "RP-CALLBACK-ASYNC", delivered: false });
});

test("a callback that completes within the configured bound is accepted", () => {
  const result = attestRecoveryPreviewDelivery({
    invocation: INVOCATION,
    callback: () => ack(),
    callbackTimeoutMs: 1000,
  });
  assert.equal(result.code, "RP-DELIVERY-ATTESTED");
});

test("a callback that exceeds the configured bound is rejected without timing details", () => {
  const result = attestRecoveryPreviewDelivery({
    invocation: INVOCATION,
    callback: () => {
      waitFor(10);
      return ack();
    },
    callbackTimeoutMs: 1,
  });
  assert.deepEqual(result, { ok: false, code: "RP-CALLBACK-TIMEOUT", delivered: false });
});

test("callback timeout bounds are closed and invalid values do not invoke the callback", () => {
  let invoked = false;
  for (const callbackTimeoutMs of [-1, 60001, 1.5, Infinity, "1", null]) {
    const result = attestRecoveryPreviewDelivery({
      invocation: INVOCATION,
      callback: () => {
        invoked = true;
        return ack();
      },
      callbackTimeoutMs,
    });
    assert.deepEqual(result, { ok: false, code: "RP-CALLBACK-TIMEOUT-INVALID", delivered: false });
  }
  assert.equal(invoked, false);
});

test("malformed acknowledgements fail closed", () => {
  for (const value of [null, {}, { ...ack(), extra: "not allowed" }, { ...ack(), delivery: "" }]) {
    const result = attestRecoveryPreviewDelivery({ invocation: INVOCATION, callback: () => value });
    assert.equal(result.code, "RP-ACK-MALFORMED");
    assert.equal(result.delivered, false);
  }
});

test("invocation and digest drift cannot produce a delivery claim", () => {
  const invocation = attestRecoveryPreviewDelivery({ invocation: INVOCATION, callback: () => ack({ invocationId: "preview-02" }) });
  const digest = attestRecoveryPreviewDelivery({ invocation: INVOCATION, callback: () => ack({ previewDigest: "b".repeat(64) }) });
  assert.equal(invocation.code, "RP-INVOCATION-MISMATCH");
  assert.equal(digest.code, "RP-DIGEST-MISMATCH");
});

test("replayed acknowledgement is rejected without mutating the caller-held state", () => {
  const used = ["ack-01"];
  const result = attestRecoveryPreviewDelivery({ invocation: INVOCATION, callback: () => ack(), usedAcknowledgementIds: used });
  assert.equal(result.code, "RP-ACK-REPLAY");
  assert.deepEqual(used, ["ack-01"]);
});

test("invalid invocation and used-acknowledgement state fail closed", () => {
  assert.equal(attestRecoveryPreviewDelivery({ invocation: null, callback: () => ack() }).code, "RP-INVOCATION-INVALID");
  assert.equal(attestRecoveryPreviewDelivery({ invocation: INVOCATION, callback: () => ack(), usedAcknowledgementIds: ["bad id"] }).code, "RP-USED-ACKS-INVALID");
  assert.equal(createRecoveryPreviewInvocation({ invocationId: "", previewDigest: DIGEST }), null);
});
