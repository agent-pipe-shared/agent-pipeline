#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";

import { createInvocationRequest } from "../lib/invocation-reliability.mjs";
import { createSelectedSandboxDisposition, reduceSelectedSandboxDisposition } from "../lib/selected-sandbox-disposition.mjs";
import { createInvocationPreflightSession } from "./invocation-preflight.mjs";

const A = "a".repeat(64); const B = "b".repeat(64); const C = "c".repeat(64); const D = "d".repeat(64);
let passed = 0; const failures = [];
function check(name, fn) { try { fn(); passed += 1; console.log(`PASS ${name}`); } catch (error) { failures.push(`${name}: ${error.message}`); console.error(`FAIL ${name} -- ${error.message}`); } }
function fingerprint(overrides = {}) { return { runnerSha256: A, hostBootSha256: B, platformClass: "linux", architectureClass: "x64", sandboxSha256: C, profileSha256: D, policySha256: A, duty: "advisory", contractVersion: "nova-a2-v1", ...overrides }; }
function sandbox(fingerprintOverrides = {}) {
  const selectedFingerprint = fingerprint(fingerprintOverrides); const duty = selectedFingerprint.duty;
  const initial = createSelectedSandboxDisposition({ dispositionId: "nova-a3-sandbox", duty, transport: "selected-network-open-read-only-v1", fingerprint: selectedFingerprint, assurance: { requested: "selected-sandbox", observed: "not-observed", evidenceSha256: null }, nowMonotonicMs: 1 });
  const probing = reduceSelectedSandboxDisposition(initial, { kind: "probe-start", attempt: { attemptId: "probe-01", index: 0, startedMonotonicMs: 1 }, challenge: { nonceSha256: C, bits: 256 } }).disposition;
  return reduceSelectedSandboxDisposition(probing, { kind: "probe-success", selectedChildIdSha256: D, observationReceiptSha256: D, childReceipt: { childIdSha256: D, attemptId: "probe-01", nonceSha256: C, duty, transport: "selected-network-open-read-only-v1", subjectSha256: selectedFingerprint.runnerSha256, assurance: "sandbox-read-only-except-coordinator-scratch-network-open", resultSha256: selectedFingerprint.hostBootSha256, terminal: true } }).disposition;
}
function request(disposition, overrides = {}) { return createInvocationRequest({ invocationId: "nova-a3-invocation", subject: { kind: "dispatch", sha256: A }, route: { runner: "codex", adapterId: "selected-sandbox", adapterVersion: "v1", requestedModel: "gpt-5.6-sol" }, duty: "advisory", sandboxDispositionSha256: disposition.recordSha256, command: { contractId: "advisory-v1", executableSha256: C, arguments: [] }, inputDigests: [A], timeoutMs: 60_000, allowedOutputs: ["result"], privacyClass: "restricted", ...overrides }); }
function input(req, disposition, attemptId = "attempt-01", attempts = [], nowMonotonicMs = 5) { return { request: req, sandboxDisposition: disposition, attempts, attemptId, nowMonotonicMs }; }

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

console.log(`\ninvocation-preflight: ${passed}/${passed + failures.length} checks passed.`);
if (failures.length) process.exitCode = 1;
