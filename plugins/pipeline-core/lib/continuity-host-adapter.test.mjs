import assert from "node:assert/strict";
import {
  CONTINUITY_FINAL_MAX_BYTES,
  CONTINUITY_HOST_CODES,
  computeContinuityFinalDigest,
  normalizeContinuityHostObservation,
} from "./continuity-host-adapter.mjs";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  process.stdout.write(`ok ${passed} - ${name}\n`);
}

const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);

function identity() {
  return {
    featureId: "v0.3-phase2.6-sdlc-throughput-hardening",
    queueRevision: 1,
    packageId: "P1",
    actionId: "continuity-host-smoke",
    dispatchId: "dispatch-p1-smoke-01",
    attemptId: "attempt-01",
    authorityDigests: { prdSha256: A, specSha256: B, resultSha256: C },
    routeRequestSha256: A,
    mayDelegate: false,
  };
}

function final(result = { verdict: "pass" }, outcome = "succeeded") {
  const resultJson = JSON.stringify(result);
  const envelope = {
    schema: "pipeline.continuity-final.v0",
    identity: identity(),
    outcome,
    resultJson,
    resultBytes: Buffer.byteLength(resultJson, "utf8"),
  };
  return { ...envelope, resultDigest: computeContinuityFinalDigest(envelope) };
}

function acknowledgement(delivered) {
  return {
    identity: structuredClone(delivered.identity),
    resultDigest: delivered.resultDigest,
    finalOutcome: delivered.outcome,
  };
}

function input(status, deliveredFinal = null, priorAcknowledgement = null) {
  return {
    expected: identity(),
    observation: { status, identity: identity(), final: deliveredFinal },
    priorAcknowledgement,
  };
}

check("running observation is closed and non-integrable", () => {
  assert.deepEqual(normalizeContinuityHostObservation(input("running")), {
    ok: true, code: "CHA-RUNNING", status: "running", finalDisposition: "none",
    integrable: false, retrievalRequired: false, resultDigest: null,
    resultBytes: null, finalOutcome: null,
  });
});

check("completed observation exposes only log-safe final metadata", () => {
  const delivered = final();
  const result = normalizeContinuityHostObservation(input("completed", delivered));
  assert.deepEqual(result, {
    ok: true, code: "CHA-FINAL-READY", status: "completed", finalDisposition: "ready",
    integrable: true, retrievalRequired: false, resultDigest: delivered.resultDigest,
    resultBytes: delivered.resultBytes, finalOutcome: "succeeded",
  });
  assert.equal(JSON.stringify(result).includes(delivered.resultJson), false);
});

for (const status of ["completed", "completed-but-undelivered"]) {
  check(`${status} without final requires retrieval`, () => {
    const result = normalizeContinuityHostObservation(input(status));
    assert.equal(result.code, "CHA-COMPLETED-UNDELIVERED");
    assert.equal(result.status, "completed-but-undelivered");
    assert.equal(result.retrievalRequired, true);
    assert.equal(result.integrable, false);
  });
}

check("retrieved undelivered final becomes integrable", () => {
  const result = normalizeContinuityHostObservation(input("completed-but-undelivered", final()));
  assert.equal(result.code, "CHA-FINAL-READY");
  assert.equal(result.integrable, true);
});

check("matching prior acknowledgement is a zero-mutation duplicate", () => {
  const delivered = final();
  const result = normalizeContinuityHostObservation(input("completed", delivered, acknowledgement(delivered)));
  assert.equal(result.code, "CHA-DUPLICATE-FINAL");
  assert.equal(result.ok, true);
  assert.equal(result.integrable, false);
  assert.equal(result.finalDisposition, "duplicate");
});

check("different prior acknowledgement fails closed", () => {
  const delivered = final();
  const priorAck = acknowledgement(delivered);
  priorAck.resultDigest = B;
  const result = normalizeContinuityHostObservation(input("completed", delivered, priorAck));
  assert.equal(result.code, "CHA-ACK-CONFLICT");
  assert.equal(result.ok, false);
  assert.equal(result.integrable, false);
});

check("failed host status is valid but non-integrable", () => {
  const result = normalizeContinuityHostObservation(input("failed"));
  assert.equal(result.code, "CHA-HOST-FAILED");
  assert.equal(result.ok, true);
  assert.equal(result.status, "failed");
});

for (const status of ["running", "failed"]) {
  check(`${status} with a delivered final is incompatible`, () => {
    const result = normalizeContinuityHostObservation(input(status, final()));
    assert.equal(result.code, "CHA-STATUS-FINAL-CONFLICT");
    assert.equal(result.integrable, false);
  });
}

for (const [name, mutate, code] of [
  ["unknown status", (value) => { value.observation.status = "queued"; }, "CHA-SCHEMA"],
  ["missing input key", (value) => { delete value.priorAcknowledgement; }, "CHA-SCHEMA"],
  ["extra input key", (value) => { value.hostError = "private raw error"; }, "CHA-SCHEMA"],
  ["delegating identity", (value) => { value.expected.mayDelegate = true; }, "CHA-SCHEMA"],
  ["queue mismatch", (value) => { value.observation.identity.queueRevision = 2; }, "CHA-IDENTITY-MISMATCH"],
  ["dispatch mismatch", (value) => { value.observation.identity.dispatchId = "dispatch-other"; }, "CHA-IDENTITY-MISMATCH"],
  ["attempt mismatch", (value) => { value.observation.identity.attemptId = "attempt-02"; }, "CHA-IDENTITY-MISMATCH"],
  ["final identity mismatch", (value) => { value.observation.final.identity.actionId = "other-action"; }, "CHA-IDENTITY-MISMATCH"],
  ["extra final key", (value) => { value.observation.final.rawError = "private raw error"; }, "CHA-FINAL-SCHEMA"],
  ["non-object result", (value) => {
    value.observation.final = final();
    value.observation.final.resultJson = "[]";
    value.observation.final.resultBytes = 2;
    value.observation.final.resultDigest = computeContinuityFinalDigest({
      schema: value.observation.final.schema,
      identity: value.observation.final.identity,
      outcome: value.observation.final.outcome,
      resultJson: value.observation.final.resultJson,
      resultBytes: value.observation.final.resultBytes,
    });
  }, "CHA-FINAL-SCHEMA"],
  ["bad result digest", (value) => { value.observation.final.resultDigest = A; }, "CHA-FINAL-DIGEST"],
  ["wrong byte count", (value) => { value.observation.final.resultBytes += 1; }, "CHA-FINAL-BOUNDS"],
]) {
  check(`${name} rejects without raw data`, () => {
    const value = input("completed", final());
    mutate(value);
    const result = normalizeContinuityHostObservation(value);
    assert.equal(result.code, code);
    assert.equal(result.integrable, false);
    assert.equal(JSON.stringify(result).includes("private raw error"), false);
  });
}

check("oversized final is rejected before integration", () => {
  const delivered = final({ data: "x".repeat(CONTINUITY_FINAL_MAX_BYTES) });
  const result = normalizeContinuityHostObservation(input("completed", delivered));
  assert.equal(result.code, "CHA-FINAL-BOUNDS");
  assert.equal(result.integrable, false);
});

check("acknowledgement without a current final is inconsistent", () => {
  const result = normalizeContinuityHostObservation(input("running", null, acknowledgement(final())));
  assert.equal(result.code, "CHA-ACK-STATUS-CONFLICT");
});

for (const [name, mutate] of [
  ["dispatch", (ack) => { ack.identity.dispatchId = "dispatch-other"; }],
  ["attempt", (ack) => { ack.identity.attemptId = "attempt-02"; }],
]) {
  check(`prior acknowledgement from another ${name} cannot dedupe`, () => {
    const delivered = final();
    const priorAck = acknowledgement(delivered);
    mutate(priorAck);
    const result = normalizeContinuityHostObservation(input("completed", delivered, priorAck));
    assert.equal(result.code, "CHA-ACK-IDENTITY-MISMATCH");
    assert.equal(result.integrable, false);
  });
}

check("outcome flip invalidates the full-final digest", () => {
  const delivered = final({ verdict: "pass" }, "succeeded");
  delivered.outcome = "failed";
  const result = normalizeContinuityHostObservation(input("completed", delivered));
  assert.equal(result.code, "CHA-FINAL-DIGEST");
  assert.equal(result.integrable, false);
});

check("ack outcome mismatch cannot dedupe an otherwise matching final", () => {
  const delivered = final();
  const priorAck = acknowledgement(delivered);
  priorAck.finalOutcome = "failed";
  const result = normalizeContinuityHostObservation(input("completed", delivered, priorAck));
  assert.equal(result.code, "CHA-ACK-CONFLICT");
  assert.equal(result.integrable, false);
});

check("product failure final remains an integrable structured result", () => {
  const result = normalizeContinuityHostObservation(input("completed", final({ blocker: "product" }, "failed")));
  assert.equal(result.code, "CHA-FINAL-READY");
  assert.equal(result.finalOutcome, "failed");
  assert.equal(result.integrable, true);
});

check("code vocabulary is closed and log-safe", () => {
  assert.equal(new Set(CONTINUITY_HOST_CODES).size, CONTINUITY_HOST_CODES.length);
  assert.equal(CONTINUITY_HOST_CODES.every((code) => /^CHA-[A-Z0-9-]+$/.test(code)), true);
});

process.stdout.write(`1..${passed}\n# pass ${passed}\n`);
