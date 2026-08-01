#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { closeSync, chmodSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { digestJson } from "../lib/verify-resume.mjs";
import { createVerifyRun, runVerifyJournal, sealVerifyCleanupRegistration, verifySuiteArtifactName } from "./verify-journal.mjs";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "verify-journal-"));
  chmodSync(root, 0o700);
  const common = join(root, ".git");
  mkdirSync(common, { mode: 0o755 });
  const suiteFile = join(root, "fixture.test.mjs");
  writeFileSync(suiteFile, "process.stdout.write('complete private log\\n')\n", { mode: 0o600 });
  return { root, common, suiteFile, suites: [{ name: "fixture-suite", file: suiteFile }] };
}
const candidate = { commit: "1".repeat(40), tree: "2".repeat(40) };
const spawnPass = () => ({ status: 0, stdout: Buffer.from("complete private log\n"), stderr: Buffer.alloc(0), error: undefined });
const registerRun = (request) => sealVerifyCleanupRegistration({ status: "registered", runId: request.runId, runPath: request.runPath, sessionId: "test-session", descriptorSha256: "d".repeat(64), resourceId: `verify-${request.runId}`, registeredAt: "2026-08-01T00:00:00.000Z" });
const artifact = verifySuiteArtifactName("fixture-suite");

function currentProcessStartId() {
  if (process.platform !== "linux") return `pid-${process.pid}`;
  return readFileSync(`/proc/${process.pid}/stat`, "utf8").trim().split(" ")[21];
}

test("private journal writes bounded JSON progress and keeps complete logs off the channel", () => {
  const f = fixture();
  const output = [];
  try {
    const result = runVerifyJournal({ gitCommonDir: f.common, repoRoot: f.root, candidate, suites: f.suites, policyInputs: { harness: "test" }, runId: "verify-one", spawn: spawnPass, registerRun, emit: (line) => output.push(line) });
    assert.equal(result.terminal.status, "passed");
    assert.equal(output.length, 2);
    assert.equal(output.some((line) => line.includes("complete private log")), false);
    for (const line of output) assert.equal(JSON.parse(line).schema, "pipeline.verify-progress.v1");
    assert.match(readFileSync(join(result.runDir, "logs", `${artifact}.log`), "utf8"), /complete private log/u);
    assert.equal(lstatSync(result.runDir).mode & 0o077, 0);
    assert.equal(lstatSync(join(result.runDir, "run.lock")).mode & 0o077, 0);
    assert.equal(JSON.parse(readFileSync(join(result.runDir, "run.lock"), "utf8")).status, "closed");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("a silent progress emitter retains the same durable journal and terminal receipt", () => {
  const f = fixture();
  try {
    const result = runVerifyJournal({ gitCommonDir: f.common, repoRoot: f.root, candidate, suites: f.suites, policyInputs: { harness: "test" }, runId: "verify-silent", spawn: spawnPass, registerRun, emit: () => {} });
    assert.equal(result.terminal.status, "passed");
    const journal = readFileSync(join(result.runDir, "progress.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line));
    assert.equal(journal.length, 2);
    assert.deepEqual(journal.map((entry) => entry.state), ["started", "completed"]);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("a terminal matching receipt is reused and still produces complete current coverage", () => {
  const f = fixture();
  let calls = 0;
  const spawn = () => { calls += 1; return spawnPass(); };
  try {
    runVerifyJournal({ gitCommonDir: f.common, repoRoot: f.root, candidate, suites: f.suites, policyInputs: { harness: "test" }, runId: "verify-one", spawn, registerRun });
    const resumed = runVerifyJournal({ gitCommonDir: f.common, repoRoot: f.root, candidate, suites: f.suites, policyInputs: { harness: "test" }, runId: "verify-two", spawn, registerRun });
    assert.equal(calls, 1);
    assert.deepEqual(resumed.plan.reusable, ["fixture-suite"]);
    assert.equal(resumed.steps.length, 1);
    assert.equal(resumed.steps[0].reused, true);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("an interrupted run has no reusable receipt and reruns the partial suite", () => {
  const f = fixture();
  try {
    const runPath = join(f.common, "agent-pipeline", "verify", "runs", "verify-partial");
    const cleanupRegistration = registerRun({ runId: "verify-partial", runPath });
    const partial = createVerifyRun({ gitCommonDir: f.common, runId: "verify-partial", candidate, policySha256: "a".repeat(64), suites: [{ id: "fixture-suite", implementationSha256: "a".repeat(64), inputs: { files: [{ path: "fixture.test.mjs", fileSha256: "a".repeat(64) }], nonFiles: [{ kind: "candidate-tree", path: null, sha256: "b".repeat(64) }] }, environmentContractSha256: "b".repeat(64), dependsOn: [] }], cleanupRegistration });
    closeSync(partial.lockFd);
    let calls = 0;
    const resumed = runVerifyJournal({ gitCommonDir: f.common, repoRoot: f.root, candidate, suites: f.suites, policyInputs: { harness: "test" }, runId: "verify-after-interruption", spawn: () => { calls += 1; return spawnPass(); }, registerRun });
    assert.equal(calls, 1);
    assert.deepEqual(resumed.plan.rerun, ["fixture-suite"]);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("candidate and log drift invalidate reuse before execution", () => {
  const f = fixture();
  try {
    const first = runVerifyJournal({ gitCommonDir: f.common, repoRoot: f.root, candidate, suites: f.suites, policyInputs: { harness: "test" }, runId: "verify-one", spawn: spawnPass, registerRun });
    writeFileSync(join(first.runDir, "logs", `${artifact}.log`), "tampered\n", { mode: 0o600 });
    let calls = 0;
    const corrupt = runVerifyJournal({ gitCommonDir: f.common, repoRoot: f.root, candidate, suites: f.suites, policyInputs: { harness: "test" }, runId: "verify-two", spawn: () => { calls += 1; return spawnPass(); }, registerRun });
    assert.equal(corrupt.plan.reasons[0].code, "corrupt-log");
    const drifted = runVerifyJournal({ gitCommonDir: f.common, repoRoot: f.root, candidate: { commit: "3".repeat(40), tree: candidate.tree }, suites: f.suites, policyInputs: { harness: "test" }, runId: "verify-three", spawn: () => { calls += 1; return spawnPass(); }, registerRun });
    assert.equal(drifted.plan.reasons[0].code, "candidate-drift");
    assert.equal(calls, 2);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("permissive or symlinked prior run parents are ignored, never traversed", () => {
  const f = fixture();
  try {
    const first = runVerifyJournal({ gitCommonDir: f.common, repoRoot: f.root, candidate, suites: f.suites, policyInputs: { harness: "test" }, runId: "verify-one", spawn: spawnPass, registerRun });
    chmodSync(first.runDir, 0o755);
    const outside = join(f.root, "outside"); mkdirSync(outside, { mode: 0o700 });
    symlinkSync(outside, join(first.runsRoot ?? join(f.common, "agent-pipeline", "verify", "runs"), "verify-symlink"));
    let calls = 0;
    const result = runVerifyJournal({ gitCommonDir: f.common, repoRoot: f.root, candidate, suites: f.suites, policyInputs: { harness: "test" }, runId: "verify-two", spawn: () => { calls += 1; return spawnPass(); }, registerRun });
    assert.equal(calls, 1);
    assert.deepEqual(result.plan.reusable, []);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("cleanup registration is required before any private run directory is created", () => {
  const f = fixture();
  try {
    assert.throws(() => runVerifyJournal({ gitCommonDir: f.common, repoRoot: f.root, candidate, suites: f.suites, policyInputs: { harness: "test" }, runId: "verify-unregistered", spawn: spawnPass }), /VERIFY-CLEANUP-REGISTRATION-REQUIRED/u);
    assert.throws(() => lstatSync(join(f.common, "agent-pipeline", "verify")));
    assert.notEqual(verifySuiteArtifactName("suite:a"), verifySuiteArtifactName("suite_a"));
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("a completed receipt owned by a currently live exact writer is never reused", () => {
  const f = fixture();
  let calls = 0;
  const spawn = () => { calls += 1; return spawnPass(); };
  try {
    const first = runVerifyJournal({ gitCommonDir: f.common, repoRoot: f.root, candidate, suites: f.suites, policyInputs: { harness: "test" }, runId: "verify-live-source", spawn, registerRun });
    writeFileSync(join(first.runDir, "run.lock"), `${JSON.stringify({
      schema: "pipeline.verify-run-lock.v1",
      runId: "verify-live-source",
      pid: process.pid,
      processStartId: currentProcessStartId(),
      owner: "current-os-user",
      status: "active",
      closedAt: null,
    })}\n`, { mode: 0o600 });
    const next = runVerifyJournal({ gitCommonDir: f.common, repoRoot: f.root, candidate, suites: f.suites, policyInputs: { harness: "test" }, runId: "verify-after-live", spawn, registerRun });
    assert.equal(calls, 2);
    assert.deepEqual(next.plan.reusable, []);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("a manifest with a drifted cleanup registration cannot authorize receipt reuse", () => {
  const f = fixture();
  let calls = 0;
  const spawn = () => { calls += 1; return spawnPass(); };
  try {
    const first = runVerifyJournal({ gitCommonDir: f.common, repoRoot: f.root, candidate, suites: f.suites, policyInputs: { harness: "test" }, runId: "verify-registration-source", spawn, registerRun });
    const manifestPath = join(first.runDir, "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.cleanupRegistration.receiptSha256 = "0".repeat(64);
    const { manifestSha256: omitted, ...body } = manifest;
    manifest.manifestSha256 = digestJson(body);
    writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`, { mode: 0o600 });
    const next = runVerifyJournal({ gitCommonDir: f.common, repoRoot: f.root, candidate, suites: f.suites, policyInputs: { harness: "test" }, runId: "verify-after-registration-drift", spawn, registerRun });
    assert.equal(calls, 2);
    assert.deepEqual(next.plan.reusable, []);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
