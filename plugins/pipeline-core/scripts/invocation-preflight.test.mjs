#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { createInvocationAttempt, createInvocationRequest } from "../lib/invocation-reliability.mjs";
import { canonicalJson, createSelectedSandboxDisposition, reduceSelectedSandboxDisposition } from "../lib/selected-sandbox-disposition.mjs";
import { createInvocationPreflightSession, createInvocationResolutionMemory, preflightInvocation } from "./invocation-preflight.mjs";

const A = "a".repeat(64); const B = "b".repeat(64); const C = "c".repeat(64); const D = "d".repeat(64);
let passed = 0; const failures = [];
function check(name, fn) { try { fn(); passed += 1; console.log(`PASS ${name}`); } catch (error) { failures.push(`${name}: ${error.message}`); console.error(`FAIL ${name} -- ${error.message}`); } }
function fingerprint(overrides = {}) { return { runnerSha256: A, hostBootSha256: B, platformClass: "linux", architectureClass: "x64", sandboxSha256: C, profileSha256: D, policySha256: A, duty: "advisory", contractVersion: "nova-a2-v1", ...overrides }; }
function sandbox(fingerprintOverrides = {}) {
  const selectedFingerprint = fingerprint(fingerprintOverrides); const duty = selectedFingerprint.duty;
  const subjectSha256 = createHash("sha256").update(canonicalJson(selectedFingerprint), "utf8").digest("hex");
  const initial = createSelectedSandboxDisposition({ dispositionId: "nova-a3-sandbox", duty, transport: "selected-network-open-read-only-v1", fingerprint: selectedFingerprint, assurance: { requested: "selected-sandbox", observed: "not-observed", evidenceSha256: null }, nowMonotonicMs: 1 });
  const probing = reduceSelectedSandboxDisposition(initial, { kind: "probe-start", attempt: { attemptId: "probe-01", index: 0, startedMonotonicMs: 1 }, challenge: { nonceSha256: C, bits: 256 } }).disposition;
  return reduceSelectedSandboxDisposition(probing, { kind: "probe-success", selectedChildIdSha256: D, observationReceiptSha256: D, childReceipt: { childIdSha256: D, attemptId: "probe-01", nonceSha256: C, duty, transport: "selected-network-open-read-only-v1", subjectSha256, assurance: "sandbox-read-only-except-coordinator-scratch-network-open", resultSha256: D, terminal: true } }).disposition;
}
function request(disposition, overrides = {}) { return createInvocationRequest({ invocationId: "nova-a3-invocation", subject: { kind: "dispatch", sha256: A }, route: { runner: "codex", adapterId: "selected-sandbox", adapterVersion: "v1", requestedModel: "gpt-5.6-sol" }, duty: "advisory", sandboxDispositionSha256: disposition.recordSha256, command: { contractId: "advisory-v1", executableSha256: C, arguments: [] }, inputDigests: [A], timeoutMs: 60_000, allowedOutputs: ["result"], privacyClass: "restricted", ...overrides }); }
function input(req, disposition, attemptId = "attempt-01", attempts = [], nowMonotonicMs = 5) { return { request: req, sandboxDisposition: disposition, attempts, attemptId, nowMonotonicMs }; }
function observation(ms) { return { source: "launcher", monotonicMs: ms, wallTime: null, rawSha256: A }; }
function completedAttempt(req, failureClass, overrides = {}) {
  return createInvocationAttempt({
    attemptId: "completed-01", invocationId: req.invocationId, index: 0, requestSha256: req.requestSha256,
    launchDecision: "launch", failureClass, started: observation(100), ended: observation(200),
    resultSha256: null, previousSha256: null, ...overrides,
  });
}
function unavailableSandbox(failure) {
  const selectedFingerprint = fingerprint();
  const initial = createSelectedSandboxDisposition({ dispositionId: `nova-a3-${failure}`, duty: selectedFingerprint.duty, transport: "selected-network-open-read-only-v1", fingerprint: selectedFingerprint, assurance: { requested: "selected-sandbox", observed: "not-observed", evidenceSha256: null }, nowMonotonicMs: 1 });
  const probing = reduceSelectedSandboxDisposition(initial, { kind: "probe-start", attempt: { attemptId: "probe-01", index: 0, startedMonotonicMs: 1 }, challenge: { nonceSha256: C, bits: 256 } }).disposition;
  return reduceSelectedSandboxDisposition(probing, { kind: "probe-failure", failure, observationReceiptSha256: D, nowMonotonicMs: 2 }).disposition;
}

check("A3P01 only a valid, matching available-attested selected transport admits a launch", () => {
  const disposition = sandbox(); const session = createInvocationPreflightSession(); const result = session.preflight(input(request(disposition), disposition));
  assert.equal(result.ok, true); assert.equal(result.decision, "launch"); assert.equal(result.attempt.failureClass, null); assert.equal(Object.isFrozen(result), true);
});

check("A3P02 concurrent duplicate callers join the atomically retained resolution", () => {
  const disposition = sandbox(); const req = request(disposition); const session = createInvocationPreflightSession();
  const first = session.preflight(input(req, disposition, "attempt-01")); const joined = session.preflight(input(req, disposition, "attempt-02"));
  assert.equal(first.decision, "launch"); assert.equal(joined.decision, "join"); assert.equal(joined.attempt.attemptId, "attempt-01"); assert.equal(session.resolutionCount(), 1);
});

check("A3P03 boot/profile/policy/binary/duty/subject drift gets a fresh resolution key", () => {
  const disposition = sandbox(); const req = request(disposition); const session = createInvocationPreflightSession();
  const first = session.preflight(input(req, disposition, "attempt-01"));
  for (const [index, field] of ["hostBootSha256", "profileSha256", "policySha256", "runnerSha256", "duty"].entries()) {
    const changed = sandbox({ [field]: field === "duty" ? "review" : [C, B, C, D][index] });
    const changedRequest = request(changed, { duty: changed.duty });
    const result = session.preflight(input(changedRequest, changed, `attempt-drift-${index}`));
    assert.equal(result.decision, "launch"); assert.notEqual(result.resolutionKey, first.resolutionKey);
  }
  const subjectDrift = request(disposition, { subject: { kind: "dispatch", sha256: B } });
  const second = session.preflight(input(subjectDrift, disposition, "attempt-03"));
  assert.equal(first.decision, "launch"); assert.equal(second.decision, "launch"); assert.notEqual(first.resolutionKey, second.resolutionKey);
});

check("A3P04 invalid requests are digest-suppressed and no no-child/fallback/self-report record authorizes a launch", () => {
  const disposition = sandbox(); const session = createInvocationPreflightSession(); const malformed = { schema: "pipeline.invocation-request.v1" };
  const one = session.preflight({ request: malformed, sandboxDisposition: disposition, attempts: [], attemptId: "x", nowMonotonicMs: 1 }); const two = session.preflight({ request: malformed, sandboxDisposition: disposition, attempts: [], attemptId: "y", nowMonotonicMs: 2 });
  assert.equal(one.failureClass, "request-invalid"); assert.strictEqual(one, two);
  const fallback = JSON.parse(JSON.stringify(disposition)); fallback.transport = "fallback";
  assert.equal(session.preflight(input(request(disposition), fallback, "attempt-fallback")).failureClass, "authority-invalid");
  const unverified = JSON.parse(JSON.stringify(disposition)); unverified.state = "probing";
  assert.equal(session.preflight(input(request(disposition), unverified, "attempt-unverified")).failureClass, "authority-invalid");
});

check("A3P05 byte-equivalent invalid requests are one suppressed outcome while a corrected request is independently admitted", () => {
  const disposition = sandbox(); const session = createInvocationPreflightSession();
  const malformed = { schema: "pipeline.invocation-request.v1", invocationId: "/home/private" };
  const first = session.preflight({ request: malformed, sandboxDisposition: disposition, attempts: [], attemptId: "bad-01", nowMonotonicMs: 1 });
  const unchanged = session.preflight({ request: JSON.parse(JSON.stringify(malformed)), sandboxDisposition: disposition, attempts: [], attemptId: "bad-02", nowMonotonicMs: 2 });
  assert.strictEqual(first, unchanged);
  assert.equal(first.failureClass, "request-invalid");
  const corrected = session.preflight(input(request(disposition), disposition, "corrected-01", [], 3));
  assert.equal(corrected.decision, "launch");
  assert.equal(session.resolutionCount(), 1);
});

check("A3P06 unavailable, denied, malformed and internal histories trip their owning non-retry circuit", () => {
  const disposition = sandbox();
  for (const failureClass of ["unavailable", "denied", "malformed-result", "internal-error"]) {
    const req = request(disposition, { invocationId: `history-${failureClass}` });
    const prior = completedAttempt(req, failureClass, { attemptId: `prior-${failureClass}` });
    const session = createInvocationPreflightSession();
    const result = session.preflight(input(req, disposition, `next-${failureClass}`, [prior], 10_000));
    assert.equal(result.decision, "suppressed", failureClass);
    assert.equal(result.failureClass, failureClass);
    assert.equal(result.attempt, null);
    assert.equal(result.requestSha256, req.requestSha256);
    assert.equal(session.resolutionCount(), 0);
  }
});

check("A3P07 transient history retries only under a declared bounded backoff and then opens its circuit", () => {
  const disposition = sandbox(); const req = request(disposition, { invocationId: "history-transient" });
  const prior = completedAttempt(req, "transport-transient", { attemptId: "transient-01" });
  const retryCourse = { failureClasses: ["host-pressure", "transport-transient"], baseBackoffMs: 1_000, maximumAttempts: 2 };
  const session = createInvocationPreflightSession({ memory: createInvocationResolutionMemory(), retryCourse });
  assert.equal(session.preflight(input(req, disposition, "transient-02", [prior], 1_199)).decision, "suppressed");
  assert.equal(session.preflight(input(req, disposition, "transient-02", [prior], 1_200)).decision, "launch");
  const circuitSession = createInvocationPreflightSession({ memory: createInvocationResolutionMemory(), retryCourse });
  const second = completedAttempt(req, "transport-transient", {
    attemptId: "transient-02", index: 1, started: observation(300), ended: observation(400), previousSha256: prior.recordSha256,
  });
  const circuit = circuitSession.preflight(input(req, disposition, "transient-03", [prior, second], 10_000));
  assert.equal(circuit.decision, "suppressed");
  assert.equal(circuit.failureClass, "transport-transient");
  assert.throws(() => createInvocationPreflightSession({
    memory: createInvocationResolutionMemory(),
    retryCourse: { failureClasses: ["denied"], baseBackoffMs: 1_000, maximumAttempts: 2 },
  }), /SHAPE:preflight-session-options/u);
});

check("A3P08 shared session memory atomically joins one resolution and fingerprint drift invalidates reuse", () => {
  const memory = createInvocationResolutionMemory();
  const firstFacade = createInvocationPreflightSession({ memory, retryCourse: null });
  const secondFacade = createInvocationPreflightSession({ memory, retryCourse: null });
  const disposition = sandbox(); const req = request(disposition);
  const first = firstFacade.preflight(input(req, disposition, "shared-01"));
  const joined = secondFacade.preflight(input(req, disposition, "shared-02"));
  assert.equal(first.decision, "launch");
  assert.equal(joined.decision, "join");
  assert.strictEqual(joined.attempt, first.attempt);
  assert.equal(firstFacade.resolutionCount(), 1);
  assert.equal(secondFacade.resolutionCount(), 1);
  const changed = sandbox({ policySha256: B });
  const invalidated = secondFacade.preflight(input(request(changed), changed, "shared-03"));
  assert.equal(invalidated.decision, "launch");
  assert.notEqual(invalidated.resolutionKey, first.resolutionKey);
  assert.equal(firstFacade.resolutionCount(), 2);
});

check("A3P09 unchanged terminal/transient selected-sandbox dispositions remain prelaunch suppressed", () => {
  for (const [state, expected] of [["terminal-unavailable", "selected-sandbox-terminal"], ["transient-unavailable", "selected-sandbox-transient"]]) {
    const disposition = unavailableSandbox(state); const req = request(disposition); const session = createInvocationPreflightSession();
    const first = session.preflight(input(req, disposition, `${state}-01`));
    const repeated = session.preflight(input(req, disposition, `${state}-02`, [], 500_000));
    assert.equal(first.decision, "suppressed");
    assert.equal(first.failureClass, expected);
    assert.equal(repeated.failureClass, expected);
    assert.equal(session.resolutionCount(), 0);
  }
});

check("A3P10 correlated completion atomically retires the single-flight reservation before history discipline", () => {
  const disposition = sandbox(); const req = request(disposition, { invocationId: "reservation-completion" });
  const session = createInvocationPreflightSession();
  const first = session.preflight(input(req, disposition, "reserved-01", [], 100));
  const completed = createInvocationAttempt({
    attemptId: first.attempt.attemptId, invocationId: first.attempt.invocationId, index: first.attempt.index,
    requestSha256: first.attempt.requestSha256, launchDecision: first.attempt.launchDecision,
    failureClass: "unavailable", started: first.attempt.started, ended: observation(200),
    resultSha256: null, previousSha256: first.attempt.previousSha256,
  });
  const closed = session.preflight(input(req, disposition, "reserved-02", [completed], 10_000));
  assert.equal(closed.decision, "suppressed");
  assert.equal(closed.failureClass, "unavailable");
  assert.equal(session.resolutionCount(), 0);

  const retrySession = createInvocationPreflightSession({
    memory: createInvocationResolutionMemory(),
    retryCourse: { failureClasses: ["transport-transient"], baseBackoffMs: 1_000, maximumAttempts: 2 },
  });
  const launched = retrySession.preflight(input(req, disposition, "retry-reserved-01", [], 100));
  const transient = createInvocationAttempt({
    attemptId: launched.attempt.attemptId, invocationId: launched.attempt.invocationId, index: launched.attempt.index,
    requestSha256: launched.attempt.requestSha256, launchDecision: launched.attempt.launchDecision,
    failureClass: "transport-transient", started: launched.attempt.started, ended: observation(200),
    resultSha256: null, previousSha256: launched.attempt.previousSha256,
  });
  assert.equal(retrySession.preflight(input(req, disposition, "retry-reserved-02", [transient], 1_199)).decision, "suppressed");
  assert.equal(retrySession.preflight(input(req, disposition, "retry-reserved-02", [transient], 1_200)).decision, "launch");
});

check("A3P11 convenience calls are stateless while explicit shared memory still joins one reservation", () => {
  const disposition = sandbox(); const req = request(disposition, { invocationId: "convenience-isolation" });
  const independentOne = preflightInvocation(input(req, disposition, "convenience-01"));
  const independentTwo = preflightInvocation(input(req, disposition, "convenience-02"));
  assert.equal(independentOne.decision, "launch");
  assert.equal(independentTwo.decision, "launch");
  assert.equal(independentOne.attempt.attemptId, "convenience-01");
  assert.equal(independentTwo.attempt.attemptId, "convenience-02");

  const memory = createInvocationResolutionMemory();
  const facadeOne = createInvocationPreflightSession({ memory, retryCourse: null });
  const facadeTwo = createInvocationPreflightSession({ memory, retryCourse: null });
  const sharedOne = facadeOne.preflight(input(req, disposition, "explicit-01"));
  const sharedTwo = facadeTwo.preflight(input(req, disposition, "explicit-02"));
  assert.equal(sharedOne.decision, "launch");
  assert.equal(sharedTwo.decision, "join");
  assert.strictEqual(sharedTwo.attempt, sharedOne.attempt);
});

console.log(`\ninvocation-preflight: ${passed}/${passed + failures.length} checks passed.`);
if (failures.length) process.exitCode = 1;
