#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
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
  const cases = [
    [undefined, "RP-CALLBACK-ABSENT"],
    [() => undefined, "RP-ACK-MALFORMED"],
    [() => { throw new Error("callback failure"); }, "RP-CALLBACK-THREW"],
  ];
  for (const [callback, code] of cases) {
    const result = attestRecoveryPreviewDelivery({ invocation: INVOCATION, callback });
    assert.deepEqual(result, { ok: false, code, delivered: false });
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
  const values = [
    null,
    {},
    { ...ack(), extra: "not allowed" },
    { ...ack(), delivery: "" },
    { ...ack(), schema: "pipeline.recovery-preview-ack.v2" },
    { ...ack(), schema: undefined },
    { ...ack(), acknowledgementId: "ack 01" },
    { ...ack(), acknowledgementId: "" },
  ];
  for (const value of values) {
    const result = attestRecoveryPreviewDelivery({ invocation: INVOCATION, callback: () => value });
    assert.deepEqual(result, { ok: false, code: "RP-ACK-MALFORMED", delivered: false });
  }
});

test("a throwing acknowledgement getter is typed instead of escaping as an exception", () => {
  const getters = ["schema", "delivery", "acknowledgementId", "invocationId", "previewDigest"];
  for (const property of getters) {
    const acknowledgement = Object.defineProperty(ack(), property, {
      enumerable: true,
      configurable: true,
      get() { throw new Error("acknowledgement getter failure"); },
    });
    const result = attestRecoveryPreviewDelivery({ invocation: INVOCATION, callback: () => acknowledgement });
    assert.deepEqual(result, { ok: false, code: "RP-ACK-MALFORMED", delivered: false });
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

test("a duplicated used-acknowledgement id is rejected before the callback runs", () => {
  let invoked = false;
  for (const usedAcknowledgementIds of [["ack-00", "ack-00"], ["ack-00", "ack-01", "ack-00"]]) {
    const result = attestRecoveryPreviewDelivery({
      invocation: INVOCATION,
      callback: () => { invoked = true; return ack(); },
      usedAcknowledgementIds,
    });
    assert.deepEqual(result, { ok: false, code: "RP-USED-ACKS-INVALID", delivered: false });
  }
  assert.equal(invoked, false, "duplicate used-acknowledgement state never reaches the callback");
});

test("non-string ids and digests are rejected instead of being coerced by the regex", () => {
  assert.equal(createRecoveryPreviewInvocation({ invocationId: 12345, previewDigest: DIGEST }), null);
  assert.equal(createRecoveryPreviewInvocation({ invocationId: "preview-01", previewDigest: { toString: () => DIGEST } }), null);
  assert.equal(createRecoveryPreviewInvocation({ invocationId: ["preview-01"], previewDigest: DIGEST }), null);
  assert.equal(attestRecoveryPreviewDelivery({
    invocation: { schema: INVOCATION.schema, invocationId: 12345, previewDigest: DIGEST },
    callback: () => ack(),
  }).code, "RP-INVOCATION-INVALID");
  assert.deepEqual(attestRecoveryPreviewDelivery({
    invocation: INVOCATION,
    callback: () => ack({ acknowledgementId: 12345 }),
  }), { ok: false, code: "RP-ACK-MALFORMED", delivered: false });
  assert.deepEqual(attestRecoveryPreviewDelivery({
    invocation: INVOCATION,
    callback: () => ack(),
    usedAcknowledgementIds: [12345],
  }), { ok: false, code: "RP-USED-ACKS-INVALID", delivered: false });
});
