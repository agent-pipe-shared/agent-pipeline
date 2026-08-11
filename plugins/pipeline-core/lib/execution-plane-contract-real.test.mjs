#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Unit coverage for ADR-0062's real-outcome path (normalizeRealExecutionOutcome
 * / reduceRealExecutionState), added alongside execution-plane-contract.test.mjs
 * (frozen, unmodified). Uses mocked/synthetic-shaped "real" worker-record inputs
 * -- deterministic, no real child process here; the real end-to-end exercise is
 * plugins/pipeline-core/scripts/execution-plane-launch.mjs.
 */
import assert from "node:assert/strict";
import {
  createExecutionState,
  createExecutionSubject,
  normalizeRealExecutionOutcome,
  reduceExecutionState,
  reduceRealExecutionState,
} from "./execution-plane-contract.mjs";

const A = "a".repeat(64), B = "b".repeat(64), C = "c".repeat(64), D = "d".repeat(64), E = "e".repeat(64), F = "f".repeat(64);
const O = "1".repeat(40);

const subject = createExecutionSubject({
  repository: "self",
  baseCommit: O,
  baseTree: O,
  candidateCommit: O,
  candidateTree: O,
  packageId: "pkg",
  dispatchId: "dispatch",
  attempt: 0,
  queueRevision: 0,
  authorityDigests: [{ kind: "spec", sha256: A }],
  writePaths: ["lib/pkg.mjs"],
  resources: ["cpu"],
});
const syntheticOutcome = (kind) => ({ dispatchId: "dispatch", attempt: 0, candidateCommit: O, kind, evidenceSha256: B, result: null });

function runningState() {
  const created = createExecutionState(subject);
  const admitted = reduceExecutionState(created, syntheticOutcome("admitted")).state;
  return reduceExecutionState(admitted, syntheticOutcome("running")).state;
}

function recordWorker(overrides = {}) {
  return {
    taskId: "task-a",
    subjectSha256: A,
    leaseId: "lease-a",
    writePathsSha256: B,
    workspaceMember: "lease-a",
    workspacePathSha256: C,
    state: "completed",
    cleanupState: "cleanup-pending",
    process: { nonce: "n", pid: 1, processStartSha256: B, bootSha256: C, executableSha256: D },
    startedMonotonicMs: 10,
    completedMonotonicMs: 20,
    result: {
      schema: "pipeline.local-worker-supervisor-result.v1",
      taskId: "task-a",
      subjectSha256: A,
      candidateCommit: O,
      status: "completed",
      exitCode: 0,
      signal: null,
      changed: [{ path: "src/a.txt", kind: "modified", mode: "100644", bytes: 10, sha256: B }],
      changeManifestSha256: E,
      stdoutSha256: E,
      stderrSha256: E,
      startedMonotonicMs: 10,
      completedMonotonicMs: 20,
      resultSha256: F,
    },
    ...overrides,
  };
}
const realOutcome = (workerOverrides = {}, top = {}) => ({ dispatchId: "dispatch", attempt: 0, candidateCommit: O, worker: recordWorker(workerOverrides), ...top });

let passed = 0;
const check = (name, fn) => {
  fn();
  passed += 1;
  console.log(`PASS EPCR${String(passed).padStart(2, "0")} ${name}`);
};

check("normalizes a real completed worker as succeeded-unverified with real provenance", () => {
  const running = runningState();
  const result = reduceRealExecutionState(running, realOutcome());
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.state.state, "succeeded-unverified");
  assert.equal(result.state.result.resultSha256, F);
  assert.equal(result.state.result.bytes, 10);
  assert.equal(result.state.result.status, "delivered");
  assert.equal(result.state.observation.source, "local-worker-supervisor");
  assert.equal(Number.isSafeInteger(result.state.observation.monotonicMs), true);
  assert.equal(Number.isNaN(Date.parse(result.state.observation.wallTime)), false);
});

check("normalizes a real failed worker as failed and a timed-out worker as timed-out", () => {
  const running = runningState();
  const failed = reduceRealExecutionState(running, realOutcome({ state: "failed", result: { ...recordWorker().result, status: "failed", exitCode: 7 } }));
  assert.equal(failed.state.state, "failed");
  assert.equal(failed.state.result, null);
  const timedOut = reduceRealExecutionState(running, realOutcome({ state: "timed-out", result: { ...recordWorker().result, status: "timed-out" } }));
  assert.equal(timedOut.state.state, "timed-out");
});

check("drives the real cancel outcome through the same two-step handshake as the synthetic path", () => {
  const running = runningState();
  const cancelOutcome = realOutcome({ state: "cancelled", result: { ...recordWorker().result, status: "cancelled" } });
  const requested = reduceRealExecutionState(running, cancelOutcome);
  assert.equal(requested.state.state, "cancel-requested");
  const cancelled = reduceRealExecutionState(requested.state, cancelOutcome);
  assert.equal(cancelled.state.state, "cancelled");
});

check("splits recovery-required by result-null-ness into lost (identity-lost) vs completed-undelivered (untrusted result)", () => {
  const running = runningState();
  const identityLost = reduceRealExecutionState(running, realOutcome({ state: "recovery-required", result: null, cleanupState: "blocked", completedMonotonicMs: null }));
  assert.equal(identityLost.state.state, "lost");
  const untrustedResult = reduceRealExecutionState(running, realOutcome({ state: "recovery-required", result: { ...recordWorker().result, status: "recovery-required" } }));
  assert.equal(untrustedResult.state.state, "completed-undelivered");
});

check("rejects a stale real outcome and a malformed real worker shape without false success", () => {
  const running = runningState();
  assert.equal(normalizeRealExecutionOutcome(running, realOutcome({}, { dispatchId: "other" })).code, "STALE:outcome");
  assert.equal(normalizeRealExecutionOutcome(running, realOutcome({ state: "running" })).code, "SHAPE:real-worker-state");
  assert.equal(normalizeRealExecutionOutcome(running, realOutcome({ result: { status: "completed" } })).code, "SHAPE:real-worker-result");
});

console.log(`${passed}/5 checks passed.`);
