#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { openSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { appendAsyncJournal, createAsyncExecutionState, createAsyncJournalEntry, reconcileSyntheticAsyncExecution, reconcileSyntheticAsyncWithLease } from "./async-execution.mjs";
import { createAssumptionSet, createCredentialLease } from "./credential-lease.mjs";
import { registerTestCaseCompletion } from "./test-case-completion.mjs";

const cases = [];
const injectedFailure = process.env.PIPELINE_AEX_TEST_INJECT_FAILURE ?? "";
const selfProbeChild = process.env.PIPELINE_AEX_TEST_SELF_PROBE_CHILD === "1";
function check(name, run) {
  const id = `AEX${String(cases.length + 1).padStart(2, "0")}`;
  cases.push({ id, name, run() { if (injectedFailure === id) assert.fail("intentional async execution case-completion failure"); return run(); } });
}

const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);
const job = { provider: "fake", jobIdSha256: A, adapterVersion: "v1" };
const obs = (kind, providerSequence, extra = {}) => ({ providerJob: job, subjectSha256: A, attemptId: "attempt", providerSequence, observationSha256: providerSequence % 2 ? A : B, kind, observedMonotonicMs: providerSequence + 1, pauseAcknowledged: false, ...extra });
const start = (leaseBinding = null) => reconcileSyntheticAsyncExecution(createAsyncExecutionState({ providerJob: job, subjectSha256: A, attemptId: "attempt", absoluteTimeoutMs: 100, maxPauseMs: 5, leaseBinding }), obs("queued", 0)).state;
const assumptions = () => createAssumptionSet({ assumptionSetId: "set", subjectSha256: A, assumptions: [{ name: "scope", value: "synthetic", source: "test" }], issuedBy: "test", issuedAt: 0, expiresAt: 100, stopConditions: ["authority-drift"], escalation: "po-gate", forbiddenAuthorities: ["approval", "credential-issuance", "delegation", "external-mutation", "merge", "release"] });
const lease = (disposition = "paused", leaseId = "lease", subjectSha256 = A, expiresAt = 200) => createCredentialLease({ leaseId, broker: "fake", subjectSha256, repository: B, operations: ["read"], targets: [A], issuedAt: 0, expiresAt, revocationHandleSha256: B, credentialClass: { kind: "synthetic", assumptions: assumptions(), assumptionDisposition: disposition }, status: "active", readbackSha256: B });
const binding = (value) => ({ leaseId: value.leaseId, broker: value.broker, subjectSha256: value.subjectSha256, repository: value.repository, operations: value.operations, targets: value.targets, readbackSha256: value.readbackSha256, recordSha256: value.recordSha256 });
const use = { subjectSha256: A, repository: B, operations: ["read"], targets: [A], atMs: 1 };

check("uses the exact journal root and rejects reordered, skipped, backward-time, or foreign history", () => {
  const one = createAsyncJournalEntry({ journalId: "attempt", providerJob: job, subject: A, providerSequence: 0, observationSha256: A, state: "admitted", reason: "test", observedAt: 1, previousSha256: null });
  const two = createAsyncJournalEntry({ journalId: "attempt", providerJob: job, subject: A, providerSequence: "not-provided", observationSha256: B, state: "running", reason: "test", observedAt: 2, previousSha256: one.entrySha256 });
  const skipped = createAsyncJournalEntry({ journalId: "attempt", providerJob: job, subject: A, providerSequence: 2, observationSha256: A, state: "running", reason: "test", observedAt: 3, previousSha256: two.entrySha256 });
  const backward = createAsyncJournalEntry({ journalId: "attempt", providerJob: job, subject: A, providerSequence: 1, observationSha256: C, state: "running", reason: "test", observedAt: 0, previousSha256: one.entrySha256 });
  const foreign = createAsyncJournalEntry({ journalId: "foreign", providerJob: job, subject: A, providerSequence: 1, observationSha256: B, state: "running", reason: "test", observedAt: 2, previousSha256: one.entrySha256 });
  const next = createAsyncJournalEntry({ journalId: "attempt", providerJob: job, subject: A, providerSequence: "not-provided", observationSha256: C, state: "running", reason: "test", observedAt: 3, previousSha256: foreign.entrySha256 });
  assert.equal(appendAsyncJournal([one, two], skipped).code, "CONFLICT:provider-sequence");
  assert.equal(appendAsyncJournal([one], backward).code, "AUTHORITY:journal-binding");
  assert.equal(appendAsyncJournal([one, foreign], next).code, "AUTHORITY:journal-binding");
  assert.equal(Object.keys(one).length, 11);
});

check("enforces the common transition graph", () => {
  let state = start();
  state = reconcileSyntheticAsyncExecution(state, obs("running", 1)).state;
  state = reconcileSyntheticAsyncExecution(state, obs("paused", 2, { pauseAcknowledged: true })).state;
  const requested = reconcileSyntheticAsyncExecution(state, obs("success", 3, { observedMonotonicMs: 20 })).state;
  assert.equal(requested.state, "cancel-requested");
  assert.equal(reconcileSyntheticAsyncExecution(requested, obs("running", 4, { observedMonotonicMs: 21 })).code, "CONFLICT:async-transition");
});

check("binds the exact lease record before assumptions, preserves timeout priority, and never reopens cancellation", () => {
  const expected = lease(); let state = start(binding(expected));
  state = reconcileSyntheticAsyncExecution(state, obs("running", 1)).state;
  state = reconcileSyntheticAsyncExecution(state, obs("paused", 2, { pauseAcknowledged: true })).state;
  state = reconcileSyntheticAsyncExecution(state, obs("success", 3, { observedMonotonicMs: 20 })).state;
  assert.equal(reconcileSyntheticAsyncWithLease({ state, lease: expected, leaseUse: use, observation: obs("running", 4, { observedMonotonicMs: 21 }), assumptionControl: { atMs: 1, observedStopConditions: ["authority-drift"], evidenceSha256: B } }).code, "CONFLICT:async-transition");
  let active = start(binding(expected)); active = reconcileSyntheticAsyncExecution(active, obs("running", 1)).state;
  const timed = reconcileSyntheticAsyncWithLease({ state: active, lease: expected, leaseUse: use, observation: obs("running", 2, { observedMonotonicMs: 100 }), assumptionControl: { atMs: 1, observedStopConditions: ["authority-drift"], evidenceSha256: B } });
  assert.equal(timed.state.state, "timed-out"); assert.equal(timed.lease.status, "revoked");
  assert.equal(reconcileSyntheticAsyncWithLease({ state: active, lease: lease("paused", "foreign"), leaseUse: use, observation: obs("running", 2, { observedMonotonicMs: 100 }), assumptionControl: { atMs: 1, observedStopConditions: [], evidenceSha256: B } }).code, "AUTHORITY:lease-binding");
  assert.equal(reconcileSyntheticAsyncWithLease({ state: active, lease: lease("paused", "lease", A, 201), leaseUse: use, observation: obs("running", 2, { observedMonotonicMs: 100 }), assumptionControl: { atMs: 1, observedStopConditions: [], evidenceSha256: B } }).code, "AUTHORITY:lease-binding");
  assert.equal(reconcileSyntheticAsyncWithLease({ state: active, lease: expected, leaseUse: { ...use, atMs: -1 }, observation: obs("running", 2, { observedMonotonicMs: 100 }), assumptionControl: { atMs: 1, observedStopConditions: [], evidenceSha256: B } }).code, "SHAPE:lease-use");
});

check("requires typed monotonic assumption evidence and retains the observed journal", () => {
  const expected = lease(); let state = start(binding(expected)); state = reconcileSyntheticAsyncExecution(state, obs("running", 1)).state;
  assert.equal(reconcileSyntheticAsyncWithLease({ state, lease: expected, leaseUse: use, observation: obs("success", 2) }).code, "SHAPE:assumption-control");
  assert.equal(reconcileSyntheticAsyncWithLease({ state, lease: expected, leaseUse: use, observation: obs("success", 2), assumptionControl: { atMs: -1, observedStopConditions: [], evidenceSha256: B } }).code, "SHAPE:assumption-control");
  assert.equal(reconcileSyntheticAsyncWithLease({ state, lease: expected, leaseUse: use, observation: obs("running", 2), assumptionControl: { atMs: 2, observedStopConditions: ["authority-drift"], evidenceSha256: C } }).code, "AUTHORITY:journal-binding");
  const result = reconcileSyntheticAsyncWithLease({ state, lease: expected, leaseUse: use, observation: obs("success", 2), assumptionControl: { atMs: 3, observedStopConditions: [], evidenceSha256: B } });
  assert.equal(result.state.state, "succeeded-unverified"); assert.equal(result.lease.status, "revoked");
});

check("an early failed case still emits dispositions for the complete declared corpus", () => {
  if (selfProbeChild) return;
  const probe = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { encoding: "utf8", env: { ...process.env, PIPELINE_AEX_TEST_INJECT_FAILURE: "AEX02", PIPELINE_AEX_TEST_SELF_PROBE_CHILD: "1", PIPELINE_VERIFY_CASE_COMPLETION_FD: "3", PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES: "65536" }, shell: false, stdio: ["ignore", "pipe", "pipe", "pipe"], timeout: 30_000 });
  assert.notEqual(probe.status, 0, "the injected early case must fail");
  const records = String(probe.output[3]).trim().split("\n").map((line) => JSON.parse(line));
  const disposed = records.filter((record) => record.event === "DISPOSED");
  assert.equal(records[0].event, "DECLARED"); assert.equal(records[0].caseCount, 5); assert.equal(disposed.length, 5);
  assert.equal(disposed.find((record) => record.id === "AEX02")?.disposition, "fail");
  assert.equal(disposed.find((record) => record.id === "AEX05")?.disposition, "pass");
  assert.deepEqual(records.at(-1).counts, { pass: 4, fail: 1, skip: 0, todo: 0 });
  assert.equal(records.at(-1).declaredCount, 5); assert.equal(records.at(-1).disposedCount, 5);
});

assert.equal(cases.length, 5, "the complete async execution corpus must be registered before execution begins");
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined ? openSync(process.platform === "win32" ? "NUL" : "/dev/null", "w") : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: cases, fd: completionFd, maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });
