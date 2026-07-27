#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";

import {
  INVOCATION_ATTEMPT_SCHEMA,
  INVOCATION_CHAIN_VERSION,
  INVOCATION_REQUEST_SCHEMA,
  createInvocationAttempt,
  createInvocationRequest,
  invocationAttemptDigest,
  invocationRequestDigest,
  isRetryableInvocationFailure,
  validateInvocationAttempt,
  validateInvocationChain,
  validateInvocationRequest,
} from "./invocation-reliability.mjs";

const A = "a".repeat(64); const B = "b".repeat(64); const C = "c".repeat(64);
let passed = 0; const failures = [];
function check(name, fn) { try { fn(); passed += 1; console.log(`PASS ${name}`); } catch (error) { failures.push(`${name}: ${error.message}`); console.error(`FAIL ${name} -- ${error.message}`); } }
function request(overrides = {}) {
  return createInvocationRequest({
    invocationId: "nova-a3-invocation-01", subject: { kind: "dispatch", sha256: A },
    route: { runner: "codex", adapterId: "selected-sandbox", adapterVersion: "v1", requestedModel: "gpt-5.6-sol" },
    duty: "advisory", sandboxDispositionSha256: B,
    command: { contractId: "advisory-v1", executableSha256: C, arguments: [{ type: "literal", value: "--read-only" }, { type: "digest-ref", value: A }] },
    inputDigests: [A, B], timeoutMs: 60_000, allowedOutputs: ["metrics", "receipt", "result"], privacyClass: "restricted", ...overrides,
  });
}
function observation(ms) { return { source: "preflight", monotonicMs: ms, wallTime: null, rawSha256: A }; }
function attempt(req, overrides = {}) {
  return createInvocationAttempt({ attemptId: "nova-a3-attempt-01", invocationId: req.invocationId, index: 0, requestSha256: req.requestSha256, launchDecision: "launch", failureClass: null, started: observation(1_000), ended: null, resultSha256: null, previousSha256: null, ...overrides });
}

check("A3R01 creates exact frozen canonical request and attempt records", () => {
  const req = request(); const item = attempt(req);
  assert.equal(INVOCATION_REQUEST_SCHEMA, "pipeline.invocation-request.v1"); assert.equal(INVOCATION_ATTEMPT_SCHEMA, "pipeline.invocation-attempt.v1"); assert.equal(INVOCATION_CHAIN_VERSION, "nova-a3-v1");
  assert.equal(Object.isFrozen(req), true); assert.equal(Object.isFrozen(item), true);
  assert.equal(invocationRequestDigest(req), req.requestSha256); assert.equal(invocationAttemptDigest(item), item.recordSha256);
  assert.deepEqual(validateInvocationRequest(req), { ok: true, code: null }); assert.deepEqual(validateInvocationAttempt(item), { ok: true, code: null });
});

check("A3R02 command arguments are typed argv tokens and request shape/digest are fail-closed", () => {
  const req = request(); const bad = JSON.parse(JSON.stringify(req)); bad.command.arguments[1].value = "not-a-digest";
  assert.equal(validateInvocationRequest(bad).ok, false);
  const drift = JSON.parse(JSON.stringify(req)); drift.timeoutMs = 1_000;
  assert.equal(validateInvocationRequest(drift).code, "CONFLICT:request-digest");
  assert.throws(() => request({ allowedOutputs: ["result", "result"] }), /SHAPE:request-input/u);
});

check("A3R03 chain links exact request and prior attempt digests with unique correlated indexes", () => {
  const req = request(); const first = attempt(req);
  const second = createInvocationAttempt({ attemptId: "nova-a3-attempt-02", invocationId: req.invocationId, index: 1, requestSha256: req.requestSha256, launchDecision: "launch", failureClass: "timeout", started: observation(2_000), ended: observation(3_000), resultSha256: null, previousSha256: first.recordSha256 });
  assert.deepEqual(validateInvocationChain(req, [first, second]), { ok: true, code: null });
  const duplicate = JSON.parse(JSON.stringify(second)); duplicate.attemptId = first.attemptId; duplicate.recordSha256 = invocationAttemptDigest(duplicate);
  assert.equal(validateInvocationChain(req, [first, duplicate]).ok, false);
});

check("A3R04 succeeded-unverified is a terminal class, not a success projection", () => {
  const req = request();
  const unverified = attempt(req, { failureClass: "succeeded-unverified", ended: observation(2_000), resultSha256: B });
  assert.deepEqual(validateInvocationAttempt(unverified), { ok: true, code: null });
  assert.equal(unverified.failureClass, "succeeded-unverified");
  assert.equal(isRetryableInvocationFailure("succeeded-unverified"), false);
  assert.equal(isRetryableInvocationFailure("transport-transient"), true);
});

console.log(`\ninvocation-reliability: ${passed}/${passed + failures.length} checks passed.`);
if (failures.length) process.exitCode = 1;
