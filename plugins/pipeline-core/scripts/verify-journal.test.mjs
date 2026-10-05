#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { spawn as spawnChild, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, chmodSync, existsSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { constants as osConstants, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { digestJson } from "../lib/verify-resume.mjs";
import { applyOnboardingKickoff, bindEphemeralPrivateCleanup, planOnboardingKickoff, readOnboardingSessionCleanupBinding } from "../lib/onboarding-continuity.mjs";
import { listActiveSessionDescriptors, startSessionDescriptor } from "../lib/worktree-lifecycle.mjs";
import { compileVerifySuites, createVerifyRun, deriveVerifyExecutionMetrics, resolveDefaultConcurrency, resolveSuiteChildEnvironment, runVerifyJournal, sealVerifyCleanupRegistration, verifySuiteArtifactName } from "./verify-journal.mjs";
import whChildProcess, { execFileSync as whExecFileSync } from "node:child_process";
import { promisify } from "node:util";
import {
  WINDOWS_HIDE_WRAPPED,
  WINDOWS_VERIFY_CONCURRENCY_CAP,
  composeWindowsHideNodeOptions,
  installWindowsHide,
  resolveWindowsVerifyConcurrency,
  windowsHideImportOption,
} from "../lib/windows-hide-preload.mjs";

// The journal deliberately emits one bounded public progress line per state
// transition in production.  Most cases below exercise storage, scheduling,
// or resume semantics rather than that channel; letting those lines through
// makes a successful suite needlessly drown out its own assertion result.
// The dedicated progress-contract case still replaces this muted sink and
// asserts the real emitted values.
const originalConsoleLog = console.log;
test.before(() => { console.log = () => {}; });
test.after(() => { console.log = originalConsoleLog; });

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
const completionPolicy = { schema: "pipeline.verify-case-completion-policy.v1", caseIds: ["C01", "C02"], maxBytes: 4096 };
function snapshotFiles(root) {
  const files = {};
  const visit = (directory, prefix = "") => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path, relative);
      else files[relative] = readFileSync(path);
    }
  };
  visit(root);
  return files;
}
function sessionlessCheckout(prefix, goal) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  chmodSync(root, 0o700);
  const git = spawnSync("git", ["init", "-q"], { cwd: root, encoding: "utf8", shell: false });
  assert.equal(git.status, 0, git.stderr);
  mkdirSync(join(root, "project"), { recursive: true });
  writeFileSync(join(root, "project", "pipeline.yaml"), "schema: pipeline.project.v1\n");
  writeFileSync(join(root, "project", "pipeline.json"), `${JSON.stringify({
    project: "fixture", verify: "node verify.mjs", autonomy: "bounded",
    branchModel: "local", worktree: "supported", stakes: "high", constraints: [],
  }, null, 2)}\n`);
  const kickoff = planOnboardingKickoff({ rootDir: root, goal });
  applyOnboardingKickoff({ plan: kickoff, expectedPlanSha256: kickoff.planSha256, activate: true });
  return { root, common: join(root, ".git"), statePath: join(root, "project", "pipeline-state.json") };
}

test("execution metrics retain lane/reuse facts and reject malformed measurement inputs", () => {
  const metrics = deriveVerifyExecutionMetrics({
    steps: [
      { name: "pool", durationMs: 50, reused: false },
      { name: "serial", durationMs: 20, reused: true },
      { name: "exclusive", durationMs: 30, reused: false },
    ],
    startedAt: "2026-09-23T10:00:00.000Z",
    completedAt: "2026-09-23T10:00:00.100Z",
    concurrency: 2,
    // Exclusive deliberately also appears in the serial set: exclusive takes
    // precedence, matching the scheduler's lane selection.
    serialLaneSuites: new Set(["serial", "exclusive"]),
    exclusiveSuites: new Set(["exclusive"]),
  });
  assert.equal(metrics.executedSuiteDurationMs, 80);
  assert.equal(metrics.reusedSuiteDurationMs, 20);
  assert.deepEqual(metrics.executed, { pool: 1, serial: 0, exclusive: 1 });
  assert.deepEqual(metrics.reused, { pool: 0, serial: 1, exclusive: 0 });
  assert.equal(metrics.parallelWorkRatio, 0.8);

  const valid = { steps: [], startedAt: "2026-09-23T10:00:00.000Z", completedAt: "2026-09-23T10:00:00.001Z", concurrency: 1 };
  assert.throws(() => deriveVerifyExecutionMetrics({ ...valid, steps: [{ name: "bad", durationMs: -1, reused: false }] }), /duration/u);
  assert.throws(() => deriveVerifyExecutionMetrics({ ...valid, startedAt: "not-a-date" }), /timestamps/u);
  assert.throws(() => deriveVerifyExecutionMetrics({ ...valid, concurrency: Number.MAX_SAFE_INTEGER + 1 }), /concurrency/u);
});
function completionStream() {
  const ordered = [{ id: "C01", disposition: "pass" }, { id: "C02", disposition: "skip" }];
  return Buffer.from(`${[
    { schema: "pipeline.test-case-completion.v1", event: "DECLARED", caseIds: completionPolicy.caseIds, caseCount: 2, caseSetSha256: digestJson(completionPolicy.caseIds) },
    ...ordered.map((entry, ordinal) => ({ schema: "pipeline.test-case-completion.v1", event: "DISPOSED", id: entry.id, ordinal, disposition: entry.disposition })),
    { schema: "pipeline.test-case-completion.v1", event: "TERMINAL", declaredCount: 2, disposedCount: 2, caseIds: completionPolicy.caseIds, caseSetSha256: digestJson(completionPolicy.caseIds), dispositionsSha256: digestJson(ordered), counts: { pass: 1, fail: 0, skip: 1, todo: 0 } },
  ].map((entry) => JSON.stringify(entry)).join("\n")}\n`);
}

function makeClock(startMs = 1_700_000_000_000, stepMs = 25) {
  let ticks = 0;
  return () => startMs + (ticks++) * stepMs;
}

function currentProcessStartId() {
  if (process.platform !== "linux") return `pid-${process.pid}`;
  return readFileSync(`/proc/${process.pid}/stat`, "utf8").trim().split(" ")[21];
}

test("private journal writes bounded JSON progress and keeps complete logs off the channel", async () => {
  const f = fixture();
  const output = [];
  const original = console.log;
  console.log = (line) => output.push(line);
  try {
    const result = await runVerifyJournal({ gitCommonDir: f.common, repoRoot: f.root, candidate, suites: f.suites, policyInputs: { harness: "test" }, runId: "verify-one", spawn: spawnPass, registerRun });
    assert.equal(result.terminal.status, "passed");
    assert.deepEqual(result.execution.executed, { pool: 1, serial: 0, exclusive: 0 });
    assert.deepEqual(result.execution.reused, { pool: 0, serial: 0, exclusive: 0 });
    assert.equal(result.execution.schema, "pipeline.verify-execution-metrics.v1");
    assert.ok(result.execution.wallDurationMs >= 0);
    assert.equal(output.length, 2);
    assert.equal(output.some((line) => line.includes("complete private log")), false);
    for (const line of output) assert.equal(JSON.parse(line).schema, "pipeline.verify-progress.v1");
    assert.match(readFileSync(join(result.runDir, "logs", `${artifact}.log`), "utf8"), /complete private log/u);
    assert.equal(lstatSync(result.runDir).mode & 0o077, 0);
    assert.equal(lstatSync(join(result.runDir, "run.lock")).mode & 0o077, 0);
    assert.equal(JSON.parse(readFileSync(join(result.runDir, "run.lock"), "utf8")).status, "closed");
  } finally { console.log = original; rmSync(f.root, { recursive: true, force: true }); }
});

test("WSL EPERM after a zero suite exit remains successful; other error shapes stay closed", async () => {
  const epermFixture = fixture();
  const eperm = Object.assign(new Error("sandbox transport completed late"), { code: "EPERM" });
  try {
    const result = await runVerifyJournal({
      gitCommonDir: epermFixture.common, repoRoot: epermFixture.root, candidate, suites: epermFixture.suites,
      policyInputs: { harness: "test" }, runId: "verify-wsl-eperm", registerRun,
      spawn: () => ({ ...spawnPass(), error: eperm }),
    });
    assert.equal(result.terminal.status, "passed");
    assert.equal(result.steps[0].exitCode, 0);
    assert.doesNotMatch(readFileSync(join(result.runDir, "logs", `${artifact}.log`), "utf8"), /verify-runner-error/u);
  } finally { rmSync(epermFixture.root, { recursive: true, force: true }); }

  const rejectedFixture = fixture();
  try {
    const result = await runVerifyJournal({
      gitCommonDir: rejectedFixture.common, repoRoot: rejectedFixture.root, candidate, suites: rejectedFixture.suites,
      policyInputs: { harness: "test" }, runId: "verify-wsl-non-eperm", registerRun,
      spawn: () => ({ ...spawnPass(), error: Object.assign(new Error("real runner fault"), { code: "EIO" }) }),
    });
    assert.equal(result.terminal.status, "failed");
    assert.equal(result.steps[0].exitCode, 1);
  } finally { rmSync(rejectedFixture.root, { recursive: true, force: true }); }
});

test("a terminal matching receipt is reused and still produces complete current coverage", async () => {
  const f = fixture();
  let calls = 0;
  const spawn = () => { calls += 1; return spawnPass(); };
  try {
    const clock = makeClock();
    await runVerifyJournal({ gitCommonDir: f.common, repoRoot: f.root, candidate, suites: f.suites, policyInputs: { harness: "test" }, runId: "verify-one", spawn, registerRun, clock });
    const resumed = await runVerifyJournal({ gitCommonDir: f.common, repoRoot: f.root, candidate, suites: f.suites, policyInputs: { harness: "test" }, runId: "verify-two", spawn, registerRun, clock });
    assert.equal(calls, 1);
    assert.deepEqual(resumed.plan.reusable, ["fixture-suite"]);
    assert.equal(resumed.steps.length, 1);
    assert.equal(resumed.steps[0].reused, true);
    // The reused step's durationMs reflects the reuse operation's own receipt timing (near-zero,
    // bounded by the fixture clock's step), never a value borrowed from the original run.
    assert.equal(Number.isInteger(resumed.steps[0].durationMs), true);
    assert.ok(resumed.steps[0].durationMs >= 0);
    const reusedReceipt = JSON.parse(readFileSync(join(resumed.runDir, "receipts", `${artifact}.json`), "utf8"));
    assert.equal(resumed.steps[0].durationMs, Date.parse(reusedReceipt.completedAt) - Date.parse(reusedReceipt.startedAt));
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("a required case-completion descriptor is captured into receipt v2 and reused only with its attestation", async () => {
  const f = fixture();
  const suites = [{ ...f.suites[0], caseCompletion: completionPolicy }];
  let calls = 0;
  const spawn = (_command, _argv, options) => {
    calls += 1;
    assert.deepEqual(options.caseCompletion, completionPolicy);
    assert.equal(options.env.PIPELINE_VERIFY_CASE_COMPLETION_FD, "3");
    return { ...spawnPass(), caseCompletion: completionStream() };
  };
  try {
    const clock = makeClock();
    const first = await runVerifyJournal({ gitCommonDir: f.common, repoRoot: f.root, candidate, suites, policyInputs: { harness: "completion" }, runId: "verify-completion-one", spawn, registerRun, clock });
    const firstReceipt = JSON.parse(readFileSync(join(first.runDir, "receipts", `${artifact}.json`), "utf8"));
    assert.equal(firstReceipt.schema, "pipeline.verify-suite-receipt.v2");
    assert.equal(firstReceipt.caseCompletion.status, "complete");
    assert.deepEqual(firstReceipt.caseCompletion.counts, { pass: 1, fail: 0, skip: 1, todo: 0 });
    const resumed = await runVerifyJournal({ gitCommonDir: f.common, repoRoot: f.root, candidate, suites, policyInputs: { harness: "completion" }, runId: "verify-completion-two", spawn, registerRun, clock });
    assert.equal(calls, 1);
    assert.deepEqual(resumed.plan.reusable, ["fixture-suite"]);
    const reused = JSON.parse(readFileSync(join(resumed.runDir, "receipts", `${artifact}.json`), "utf8"));
    assert.deepEqual(reused.caseCompletion, firstReceipt.caseCompletion);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("a required suite with a missing completion terminal fails closed even when its process exits zero", async () => {
  const f = fixture();
  try {
    const result = await runVerifyJournal({
      gitCommonDir: f.common,
      repoRoot: f.root,
      candidate,
      suites: [{ ...f.suites[0], caseCompletion: completionPolicy }],
      policyInputs: { harness: "completion-missing" },
      runId: "verify-completion-missing",
      spawn: () => ({ ...spawnPass(), caseCompletion: completionStream().subarray(0, completionStream().lastIndexOf(0x0a, completionStream().length - 2) + 1) }),
      registerRun,
    });
    assert.equal(result.steps[0].exitCode, 1);
    assert.equal(result.terminal.status, "failed");
    const receipt = JSON.parse(readFileSync(join(result.runDir, "receipts", `${artifact}.json`), "utf8"));
    assert.equal(receipt.caseCompletion, null);
    assert.match(readFileSync(join(result.runDir, "logs", `${artifact}.log`), "utf8"), /VERIFY-CASE-COMPLETION-TERMINAL/u);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("the default async child transport inherits and captures the bounded completion descriptor", async () => {
  const f = fixture();
  try {
    const helper = readFileSync(new URL("../lib/test-case-completion.mjs", import.meta.url), "utf8");
    writeFileSync(join(f.root, "test-case-completion.mjs"), helper, { mode: 0o600 });
    writeFileSync(f.suiteFile, `import { registerTestCaseCompletion } from "./test-case-completion.mjs";
registerTestCaseCompletion({
  cases: [{ id: "C01", name: "first", run: () => {} }, { id: "C02", name: "second", mode: "skip", run: () => {} }],
  fd: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD),
  maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES),
});
`, { mode: 0o600 });
    const result = await runVerifyJournal({
      gitCommonDir: f.common,
      repoRoot: f.root,
      candidate,
      suites: [{ ...f.suites[0], caseCompletion: completionPolicy }],
      policyInputs: { harness: "completion-real-child" },
      runId: "verify-completion-real-child",
      registerRun,
    });
    assert.equal(result.steps[0].exitCode, 0);
    const receipt = JSON.parse(readFileSync(join(result.runDir, "receipts", `${artifact}.json`), "utf8"));
    assert.deepEqual(receipt.caseCompletion.counts, { pass: 1, fail: 0, skip: 1, todo: 0 });
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("reuseReceipts false re-executes a terminal matching receipt and records why", async () => {
  const f = fixture();
  let calls = 0;
  const spawn = () => { calls += 1; return spawnPass(); };
  try {
    const clock = makeClock();
    await runVerifyJournal({ gitCommonDir: f.common, repoRoot: f.root, candidate, suites: f.suites, policyInputs: { harness: "test" }, runId: "verify-fresh-one", spawn, registerRun, clock });
    const fresh = await runVerifyJournal({ gitCommonDir: f.common, repoRoot: f.root, candidate, suites: f.suites, policyInputs: { harness: "test" }, runId: "verify-fresh-two", spawn, registerRun, clock, reuseReceipts: false });
    assert.equal(calls, 2);
    assert.deepEqual(fresh.plan.reusable, []);
    assert.deepEqual(fresh.plan.reasons, [{ suite: "fixture-suite", code: "reuse-disabled", dependency: null }]);
    assert.equal(fresh.steps[0].reused, false);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("a freshly executed suite carries a durationMs derived from its own receipt timing", async () => {
  const f = fixture();
  try {
    const clock = makeClock();
    const result = await runVerifyJournal({ gitCommonDir: f.common, repoRoot: f.root, candidate, suites: f.suites, policyInputs: { harness: "test" }, runId: "verify-duration", spawn: spawnPass, registerRun, clock });
    assert.equal(result.steps[0].reused, false);
    assert.equal(Number.isInteger(result.steps[0].durationMs), true);
    assert.ok(result.steps[0].durationMs >= 0);
    const receipt = JSON.parse(readFileSync(join(result.runDir, "receipts", `${artifact}.json`), "utf8"));
    assert.equal(result.steps[0].durationMs, Date.parse(receipt.completedAt) - Date.parse(receipt.startedAt));
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("an interrupted run has no reusable receipt and reruns the partial suite", async () => {
  const f = fixture();
  try {
    const runPath = join(f.common, "agent-pipeline", "verify", "runs", "verify-partial");
    const cleanupRegistration = registerRun({ runId: "verify-partial", runPath });
    const partial = createVerifyRun({ gitCommonDir: f.common, runId: "verify-partial", candidate, policySha256: "a".repeat(64), suites: [{ id: "fixture-suite", implementationSha256: "a".repeat(64), inputs: { files: [{ path: "fixture.test.mjs", fileSha256: "a".repeat(64) }], nonFiles: [{ kind: "candidate-tree", path: null, sha256: "b".repeat(64) }] }, environmentContractSha256: "b".repeat(64), dependsOn: [] }], cleanupRegistration });
    closeSync(partial.lockFd);
    let calls = 0;
    const resumed = await runVerifyJournal({ gitCommonDir: f.common, repoRoot: f.root, candidate, suites: f.suites, policyInputs: { harness: "test" }, runId: "verify-after-interruption", spawn: () => { calls += 1; return spawnPass(); }, registerRun });
    assert.equal(calls, 1);
    assert.deepEqual(resumed.plan.rerun, ["fixture-suite"]);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("candidate and log drift invalidate reuse before execution", async () => {
  const f = fixture();
  try {
    const first = await runVerifyJournal({ gitCommonDir: f.common, repoRoot: f.root, candidate, suites: f.suites, policyInputs: { harness: "test" }, runId: "verify-one", spawn: spawnPass, registerRun });
    writeFileSync(join(first.runDir, "logs", `${artifact}.log`), "tampered\n", { mode: 0o600 });
    let calls = 0;
    const corrupt = await runVerifyJournal({ gitCommonDir: f.common, repoRoot: f.root, candidate, suites: f.suites, policyInputs: { harness: "test" }, runId: "verify-two", spawn: () => { calls += 1; return spawnPass(); }, registerRun });
    assert.equal(corrupt.plan.reasons[0].code, "corrupt-log");
    const drifted = await runVerifyJournal({ gitCommonDir: f.common, repoRoot: f.root, candidate: { commit: "3".repeat(40), tree: candidate.tree }, suites: f.suites, policyInputs: { harness: "test" }, runId: "verify-three", spawn: () => { calls += 1; return spawnPass(); }, registerRun });
    assert.equal(drifted.plan.reasons[0].code, "candidate-drift");
    assert.equal(calls, 2);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("permissive or symlinked prior run parents are ignored, never traversed", async () => {
  const f = fixture();
  try {
    const first = await runVerifyJournal({ gitCommonDir: f.common, repoRoot: f.root, candidate, suites: f.suites, policyInputs: { harness: "test" }, runId: "verify-one", spawn: spawnPass, registerRun });
    chmodSync(first.runDir, 0o755);
    const outside = join(f.root, "outside"); mkdirSync(outside, { mode: 0o700 });
    symlinkSync(outside, join(first.runsRoot ?? join(f.common, "agent-pipeline", "verify", "runs"), "verify-symlink"));
    let calls = 0;
    const result = await runVerifyJournal({ gitCommonDir: f.common, repoRoot: f.root, candidate, suites: f.suites, policyInputs: { harness: "test" }, runId: "verify-two", spawn: () => { calls += 1; return spawnPass(); }, registerRun });
    assert.equal(calls, 1);
    assert.deepEqual(result.plan.reusable, []);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("cleanup registration is required before any private run directory is created", async () => {
  const f = fixture();
  try {
    await assert.rejects(() => runVerifyJournal({ gitCommonDir: f.common, repoRoot: f.root, candidate, suites: f.suites, policyInputs: { harness: "test" }, runId: "verify-unregistered", spawn: spawnPass }), /VERIFY-CLEANUP-REGISTRATION-REQUIRED/u);
    assert.throws(() => lstatSync(join(f.common, "agent-pipeline", "verify")));
    assert.notEqual(verifySuiteArtifactName("suite:a"), verifySuiteArtifactName("suite_a"));
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("session-less passed and numeric failed terminals retain journal bytes, release only their created owner, and issue a fresh next owner", async () => {
  const root = mkdtempSync(join(tmpdir(), "verify-journal-sessionless-"));
  chmodSync(root, 0o700);
  const git = spawnSync("git", ["init", "-q"], { cwd: root, encoding: "utf8", shell: false });
  assert.equal(git.status, 0, git.stderr);
  mkdirSync(join(root, "project"), { recursive: true });
  writeFileSync(join(root, "project", "pipeline.yaml"), "schema: pipeline.project.v1\n");
  writeFileSync(join(root, "project", "pipeline.json"), `${JSON.stringify({
    project: "fixture", verify: "node verify.mjs", autonomy: "bounded",
    branchModel: "local", worktree: "supported", stakes: "high", constraints: [],
  }, null, 2)}\n`);
  const kickoff = planOnboardingKickoff({ rootDir: root, goal: "Exercise session-less Verify registration" });
  applyOnboardingKickoff({ plan: kickoff, expectedPlanSha256: kickoff.planSha256, activate: true });
  const statePath = join(root, "project", "pipeline-state.json");
  const beforeStateBytes = readFileSync(statePath);
  const common = join(root, ".git");
  const suiteFile = join(root, "fixture.test.mjs");
  writeFileSync(suiteFile, "process.stdout.write('complete private log\\n')\n", { mode: 0o600 });
  const sessionlessSuites = [{ name: "fixture-suite", file: suiteFile }];
  try {
    // No `registerRun` callback: this is the ordinary, automatic CLI path -- exactly what
    // harness/scripts/verify.mjs's own call site uses.
    const result = await runVerifyJournal({ gitCommonDir: common, repoRoot: root, candidate, suites: sessionlessSuites, policyInputs: { harness: "test" }, runId: "verify-sessionless-1" });
    assert.equal(result.terminal.status, "passed");
    assert.equal(result.steps.length, 1);
    const firstBytes = snapshotFiles(result.runDir);
    assert.deepEqual(readFileSync(statePath), beforeStateBytes);
    const binding = readOnboardingSessionCleanupBinding({ rootDir: root });
    assert.equal(binding.status, "unbound");
    assert.equal(binding.sessionCleanup, null);
    assert.equal(listActiveSessionDescriptors(root).length, 0);

    writeFileSync(suiteFile, "process.exitCode = 7\n", { mode: 0o600 });
    const failed = await runVerifyJournal({ gitCommonDir: common, repoRoot: root, candidate, suites: sessionlessSuites, policyInputs: { harness: "test" }, runId: "verify-sessionless-2", reuseReceipts: false });
    assert.equal(failed.terminal.status, "failed");
    assert.equal(failed.steps[0].exitCode, 7);
    const afterFailure = readOnboardingSessionCleanupBinding({ rootDir: root });
    assert.equal(afterFailure.status, "unbound");
    assert.equal(listActiveSessionDescriptors(root).length, 0);

    writeFileSync(suiteFile, "process.stdout.write('complete private log\\n')\n", { mode: 0o600 });
    const again = await runVerifyJournal({ gitCommonDir: common, repoRoot: root, candidate, suites: sessionlessSuites, policyInputs: { harness: "test" }, runId: "verify-sessionless-3", reuseReceipts: false });
    assert.equal(again.terminal.status, "passed");
    assert.notEqual(result.cleanupRegistration.sessionId, failed.cleanupRegistration.sessionId);
    assert.notEqual(failed.cleanupRegistration.sessionId, again.cleanupRegistration.sessionId);
    assert.notEqual(result.cleanupRegistration.descriptorSha256, again.cleanupRegistration.descriptorSha256);
    assert.deepEqual(snapshotFiles(result.runDir), firstBytes);
    assert.equal(readOnboardingSessionCleanupBinding({ rootDir: root }).status, "unbound");
    assert.equal(listActiveSessionDescriptors(root).length, 0);
    assert.deepEqual(readFileSync(statePath), beforeStateBytes);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// ALFRED-RDY3B-20261005 helpers for the run-record design. Bytes of a private session-state tree
// (descriptors, cleanup manifests) -- empty when the tree does not exist -- and the run-record files
// Verify keeps under <git-common-dir>/agent-pipeline/verify/run-records.
const sessionStateBytes = (common) => ({
  descriptors: existsSync(join(common, "agent-pipeline", "session-descriptors")) ? snapshotFiles(join(common, "agent-pipeline", "session-descriptors")) : {},
  cleanup: existsSync(join(common, "agent-pipeline", "session-cleanup")) ? snapshotFiles(join(common, "agent-pipeline", "session-cleanup")) : {},
});
const runRecordFiles = (common) => {
  try { return readdirSync(join(common, "agent-pipeline", "verify", "run-records")).filter((name) => name.endsWith(".json")).sort(); } catch { return []; }
};

// ALFRED-RDY3B-20261005 -- SUPERSEDED CONTRACT (PO decision "Readiness root fix", 2026-10-05, tracked in
// specs/sprint-alfred-epic/design/po-queue-2026-10-03.md). This case used to assert that a session-less
// Verify REFUSED (VERIFY-CLEANUP-REGISTRATION-REQUIRED) when another active session descriptor existed,
// because Verify created its own session descriptor + cleanup binding and could not do so beside a foreign
// one. Verify no longer creates or needs either: it records its cleanup duty in a private run record, so
// that refusal property no longer exists by design. What survives, and is asserted here, is the safety
// property underneath it: Verify never overrides, touches, retires or archives a foreign descriptor.
test("a session-less checkout with an already-active foreign session descriptor still runs Verify and leaves that descriptor byte-identical", async () => {
  const root = mkdtempSync(join(tmpdir(), "verify-journal-sessionless-conflict-"));
  chmodSync(root, 0o700);
  const git = spawnSync("git", ["init", "-q"], { cwd: root, encoding: "utf8", shell: false });
  assert.equal(git.status, 0, git.stderr);
  mkdirSync(join(root, "project"), { recursive: true });
  writeFileSync(join(root, "project", "pipeline.yaml"), "schema: pipeline.project.v1\n");
  writeFileSync(join(root, "project", "pipeline.json"), `${JSON.stringify({
    project: "fixture", verify: "node verify.mjs", autonomy: "bounded",
    branchModel: "local", worktree: "supported", stakes: "high", constraints: [],
  }, null, 2)}\n`);
  const kickoff = planOnboardingKickoff({ rootDir: root, goal: "Exercise Verify beside a foreign descriptor" });
  applyOnboardingKickoff({ plan: kickoff, expectedPlanSha256: kickoff.planSha256, activate: true });
  // A descriptor already exists with no continuity binding pointing at it (e.g. a prior, still-open
  // real session): foreign to Verify.
  const foreign = startSessionDescriptor(root, {});
  const common = join(root, ".git");
  const foreignBefore = sessionStateBytes(common);
  assert.ok(Object.keys(foreignBefore.descriptors).length > 0, "the foreign descriptor is on disk");
  const suiteFile = join(root, "fixture.test.mjs");
  writeFileSync(suiteFile, "process.stdout.write('complete private log\\n')\n", { mode: 0o600 });
  try {
    // The default async spawn (a real child) is required here: only it can PROVE the child closed, and an
    // unproven close deliberately keeps the run record (see the production-spawn-error case below), which
    // would turn this into a different property than the one under test.
    const result = await runVerifyJournal({ gitCommonDir: common, repoRoot: root, candidate, suites: [{ name: "fixture-suite", file: suiteFile }], policyInputs: { harness: "test" }, runId: "verify-sessionless-conflict" });
    assert.equal(result.terminal.status, "passed");
    assert.deepEqual(sessionStateBytes(common), foreignBefore, "no descriptor or cleanup-manifest byte changed");
    assert.deepEqual(listActiveSessionDescriptors(root), [{ sessionId: foreign.sessionId, descriptorSha256: foreign.descriptorSha256 }]);
    assert.equal(readOnboardingSessionCleanupBinding({ rootDir: root }).status, "unbound", "Verify created no cleanup binding");
    assert.deepEqual(runRecordFiles(common), [], "the run record was retired");
    assert.equal(existsSync(join(result.runDir, "terminal.json")), true, "the sealed run is retained evidence");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("an already-bound cleanup owner remains borrowed after passed and numeric failed terminals", async () => {
  const f = sessionlessCheckout("verify-journal-borrowed-", "Exercise borrowed Verify ownership");
  const started = startSessionDescriptor(f.root, {});
  const unbound = readOnboardingSessionCleanupBinding({ rootDir: f.root });
  const before = bindEphemeralPrivateCleanup({
    rootDir: f.root,
    sessionCleanup: { sessionId: started.sessionId, descriptorSha256: started.descriptorSha256 },
  });
  assert.equal(before.status, "bound");
  const stateBytes = readFileSync(f.statePath);
  const suiteFile = join(f.root, "fixture.test.mjs");
  writeFileSync(suiteFile, "process.stdout.write('complete private log\\n')\n", { mode: 0o600 });
  try {
    const passed = await runVerifyJournal({ gitCommonDir: f.common, repoRoot: f.root, candidate, suites: [{ name: "fixture-suite", file: suiteFile }], policyInputs: { harness: "borrowed" }, runId: "verify-borrowed-pass" });
    assert.equal(passed.terminal.status, "passed");
    writeFileSync(suiteFile, "process.exitCode = 7\n", { mode: 0o600 });
    const failed = await runVerifyJournal({ gitCommonDir: f.common, repoRoot: f.root, candidate, suites: [{ name: "fixture-suite", file: suiteFile }], policyInputs: { harness: "borrowed" }, runId: "verify-borrowed-fail", reuseReceipts: false });
    assert.equal(failed.terminal.status, "failed");
    const after = readOnboardingSessionCleanupBinding({ rootDir: f.root });
    assert.equal(after.status, "bound");
    assert.equal(after.stateSha256, before.stateSha256);
    assert.equal(after.revision, before.revision);
    assert.deepEqual(after.sessionCleanup, before.sessionCleanup);
    assert.deepEqual(listActiveSessionDescriptors(f.root), [{ sessionId: started.sessionId, descriptorSha256: started.descriptorSha256 }]);
    assert.deepEqual(readFileSync(f.statePath), stateBytes);
    assert.equal(unbound.status, "unbound");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("a normalized failed receipt after a production spawn error cannot release a newly-created owner", async () => {
  const f = sessionlessCheckout("verify-journal-null-close-", "Exercise unknown child-close ownership");
  const suiteFile = join(f.root, "fixture.test.mjs");
  writeFileSync(suiteFile, "process.stdout.write('never launched\\n')\n", { mode: 0o600 });
  const originalExecPath = Object.getOwnPropertyDescriptor(process, "execPath");
  let execPathReads = 0;
  Object.defineProperty(process, "execPath", {
    configurable: true,
    get() {
      execPathReads += 1;
      return execPathReads === 1 ? originalExecPath.value : join(f.root, "missing-node-executable");
    },
  });
  try {
    await assert.rejects(
      () => runVerifyJournal({ gitCommonDir: f.common, repoRoot: f.root, candidate, suites: [{ name: "fixture-suite", file: suiteFile }], policyInputs: { harness: "unknown-close" }, runId: "verify-sessionless-null" }),
      /VERIFY-OWNER-CLEANUP-REQUIRED:verify-sessionless-null/u,
    );
    assert.equal(execPathReads, 2);
    const runDir = join(f.common, "agent-pipeline", "verify", "runs", "verify-sessionless-null");
    const terminal = JSON.parse(readFileSync(join(runDir, "terminal.json"), "utf8"));
    const receipt = JSON.parse(readFileSync(join(runDir, "receipts", `${artifact}.json`), "utf8"));
    assert.equal(terminal.status, "failed");
    assert.equal(receipt.exitCode, 1);
    assert.equal(receipt.status, "completed");
    // ALFRED-RDY3B-20261005 (PO decision "Readiness root fix", 2026-10-05): the "owner" Verify creates is
    // now its private run record, never a session descriptor or a cleanup binding. The property is
    // unchanged: an unproven child close means the run's cleanup duty is NOT released. The record stays
    // registered for this live process and the sealed run is retained, so neither a sweep nor a later
    // Verify can settle or drain a run whose children may still be alive.
    assert.equal(readOnboardingSessionCleanupBinding({ rootDir: f.root }).status, "unbound", "no cleanup binding was ever created");
    assert.equal(listActiveSessionDescriptors(f.root).length, 0, "no session descriptor was ever created");
    assert.deepEqual(runRecordFiles(f.common), ["verify-sessionless-null.json"], "the run record is not released");
    const record = JSON.parse(readFileSync(join(f.common, "agent-pipeline", "verify", "run-records", "verify-sessionless-null.json"), "utf8"));
    assert.equal(record.pid, process.pid);
    assert.equal(record.runPath, runDir);
    const { sweepStaleVerifyRunRecords } = await import("../lib/verify-run-record.mjs");
    const swept = sweepStaleVerifyRunRecords({ gitCommonDir: f.common });
    assert.deepEqual(swept.settled, [], "a live owner's record is never settled by a sweep");
    assert.deepEqual(swept.retained, ["verify-sessionless-null"]);
    assert.equal(JSON.parse(readFileSync(join(runDir, "terminal.json"), "utf8")).status, "failed", "terminal evidence is not lost");
    assert.equal(JSON.parse(readFileSync(join(runDir, "run.lock"), "utf8")).status, "closed");
  } finally {
    Object.defineProperty(process, "execPath", originalExecPath);
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("SIGINT interruption terminates only its child group, seals distinct immutable evidence, and releases its exact automatic owner", async () => {
  const f = sessionlessCheckout("verify-journal-interrupted-", "Exercise signal-owned Verify cleanup");
  const marker = join(f.root, "child-started");
  const suiteFile = join(f.root, "fixture.test.mjs");
  writeFileSync(suiteFile, `import { spawn } from "node:child_process";\nimport { writeFileSync } from "node:fs";\nspawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });\nwriteFileSync(${JSON.stringify(marker)}, "started", { mode: 0o600 });\nsetInterval(() => {}, 1000);\n`, { mode: 0o600 });
  const controller = new AbortController();
  try {
    const running = runVerifyJournal({ gitCommonDir: f.common, repoRoot: f.root, candidate, suites: [{ name: "fixture-suite", file: suiteFile }], policyInputs: { harness: "interrupted" }, runId: "verify-interrupted", signal: controller.signal });
    const deadline = Date.now() + 5000;
    while (!existsSync(marker) && Date.now() < deadline) await new Promise((resolveDelay) => setTimeout(resolveDelay, 10));
    assert.equal(existsSync(marker), true, "actual Verify child started");
    controller.abort("SIGINT");
    const result = await running;
    assert.equal(result.status, "interrupted");
    assert.equal(result.interruption.status, "interrupted");
    assert.equal(result.interruption.signal, "SIGINT");
    assert.equal(result.interruption.children.length, 1);
    assert.equal(result.interruption.children[0].groupCloseProved, true);
    assert.equal(existsSync(join(result.runDir, "terminal.json")), false);
    assert.equal(existsSync(join(result.runDir, "receipts", `${artifact}.json`)), false);
    const interruptionPath = join(result.runDir, "interruption.json");
    const originalInterruption = readFileSync(interruptionPath);
    const originalSnapshot = snapshotFiles(result.runDir);
    assert.equal(readOnboardingSessionCleanupBinding({ rootDir: f.root }).status, "unbound");
    assert.equal(listActiveSessionDescriptors(f.root).length, 0);
    assert.deepEqual(snapshotFiles(result.runDir), originalSnapshot);
    assert.deepEqual(readFileSync(interruptionPath), originalInterruption);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("interruption keeps a borrowed descriptor and treats unknown child-group closure as unreleasable", async () => {
  const f = sessionlessCheckout("verify-journal-interrupted-borrowed-", "Exercise borrowed interrupted ownership");
  const started = startSessionDescriptor(f.root, {});
  const before = bindEphemeralPrivateCleanup({ rootDir: f.root, sessionCleanup: { sessionId: started.sessionId, descriptorSha256: started.descriptorSha256 } });
  const suiteFile = join(f.root, "fixture.test.mjs");
  writeFileSync(suiteFile, "process.stdout.write('not started\\n')\n", { mode: 0o600 });
  const controller = new AbortController();
  const unknownSpawn = (_command, _args, options) => new Promise((resolveSpawn) => {
    options.signal.addEventListener("abort", () => resolveSpawn({ status: null, signal: null, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), closeStatusProved: false, cancellation: { proven: false, method: "identity-unavailable", identity: null, remaining: null } }), { once: true });
  });
  try {
    const running = runVerifyJournal({ gitCommonDir: f.common, repoRoot: f.root, candidate, suites: [{ name: "fixture-suite", file: suiteFile }], policyInputs: { harness: "borrowed-interrupted" }, runId: "verify-interrupted-borrowed", signal: controller.signal, spawn: unknownSpawn });
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 10));
    controller.abort("SIGTERM");
    const result = await running;
    assert.equal(result.status, "interrupted");
    assert.equal(result.interruption.children[0].groupCloseProved, false);
    assert.equal(result.interruption.children[0].terminationMethod, "identity-unavailable");
    assert.equal(existsSync(join(result.runDir, "terminal.json")), false);
    const after = readOnboardingSessionCleanupBinding({ rootDir: f.root });
    assert.equal(after.status, "bound");
    assert.equal(after.stateSha256, before.stateSha256);
    assert.equal(after.revision, before.revision);
    assert.deepEqual(after.sessionCleanup, before.sessionCleanup);
    assert.deepEqual(listActiveSessionDescriptors(f.root), [{ sessionId: started.sessionId, descriptorSha256: started.descriptorSha256 }]);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("a caller-supplied registration callback has no automatic owner teardown authority", async () => {
  const f = sessionlessCheckout("verify-journal-callback-owner-", "Exercise injected registration authority");
  const suiteFile = join(f.root, "fixture.test.mjs");
  writeFileSync(suiteFile, "process.stdout.write('complete private log\\n')\n", { mode: 0o600 });
  try {
    const result = await runVerifyJournal({
      gitCommonDir: f.common,
      repoRoot: f.root,
      candidate,
      suites: [{ name: "fixture-suite", file: suiteFile }],
      policyInputs: { harness: "callback" },
      runId: "verify-callback-no-authority",
      spawn: spawnPass,
      registerRun,
    });
    assert.equal(result.terminal.status, "passed");
    assert.equal(readOnboardingSessionCleanupBinding({ rootDir: f.root }).status, "unbound");
    assert.equal(listActiveSessionDescriptors(f.root).length, 0);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

// ALFRED-RDY3B-20261005 (PO decision "Readiness root fix", 2026-10-05): Verify keeps a private run record,
// not a session descriptor. A descriptor created by a suite DURING the run is foreign: the run still
// completes, its terminal evidence is kept, and the foreign descriptor is never touched, retired or
// archived by Verify's own cleanup. (Formerly: such a descriptor made owner teardown refuse and the run
// reject with VERIFY-OWNER-CLEANUP-REQUIRED, because teardown shared the session machinery.)
test("a suite-created foreign descriptor is never touched by Verify cleanup and terminal evidence is kept", async () => {
  const f = sessionlessCheckout("verify-journal-foreign-descriptor-", "Exercise foreign descriptor safety");
  const suiteFile = join(f.root, "fixture.test.mjs");
  const marker = join(f.root, "foreign-descriptor.json");
  const lifecycleUrl = pathToFileURL(resolve(dirname(fileURLToPath(import.meta.url)), "../lib/worktree-lifecycle.mjs")).href;
  writeFileSync(suiteFile, `import { writeFileSync } from "node:fs";\nimport { startSessionDescriptor } from ${JSON.stringify(lifecycleUrl)};\nconst started = startSessionDescriptor(process.cwd(), {});\nwriteFileSync(${JSON.stringify(marker)}, JSON.stringify({ sessionId: started.sessionId, descriptorSha256: started.descriptorSha256 }));\n`, { mode: 0o600 });
  const stateBytes = readFileSync(f.statePath);
  try {
    const result = await runVerifyJournal({ gitCommonDir: f.common, repoRoot: f.root, candidate, suites: [{ name: "fixture-suite", file: suiteFile }], policyInputs: { harness: "foreign-descriptor" }, runId: "verify-foreign-descriptor" });
    assert.equal(result.terminal.status, "passed");
    const runDir = join(f.common, "agent-pipeline", "verify", "runs", "verify-foreign-descriptor");
    assert.equal(JSON.parse(readFileSync(join(runDir, "terminal.json"), "utf8")).status, "passed", "terminal evidence is kept");
    assert.equal(JSON.parse(readFileSync(join(runDir, "run.lock"), "utf8")).status, "closed");
    const foreign = JSON.parse(readFileSync(marker, "utf8"));
    assert.deepEqual(listActiveSessionDescriptors(f.root), [foreign], "exactly the suite-created descriptor, byte-identical (digest-bound), nothing retired or added");
    assert.equal(readOnboardingSessionCleanupBinding({ rootDir: f.root }).status, "unbound", "Verify created no cleanup binding");
    assert.deepEqual(runRecordFiles(f.common), [], "the run record was retired");
    assert.deepEqual(readFileSync(f.statePath), stateBytes);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

// ALFRED-RDY3B-20261005 (PO decision "Readiness root fix", 2026-10-05): the run record's only cleanup duty
// is "remove this invocation's own UNSEALED run directory". An extra resource -- one inside the sealed
// run directory or beside it -- must survive Verify's cleanup, and the journal and terminal evidence must
// stay intact. (Formerly: an extra resource registered under the session owner made retention refuse; no
// session owner exists any more, so the property is asserted against what Verify's cleanup can reach.)
test("an extra resource in or beside a sealed run directory survives Verify cleanup and the journal stays intact", async () => {
  const f = sessionlessCheckout("verify-journal-extra-resource-", "Exercise extra resource preservation");
  const suiteFile = join(f.root, "fixture.test.mjs");
  const runDir = join(f.common, "agent-pipeline", "verify", "runs", "verify-extra-resource");
  const extraInside = join(runDir, "extra-resource.txt");
  const extraBeside = join(f.root, "extra-registered-resource");
  writeFileSync(suiteFile, `import { mkdirSync, writeFileSync } from "node:fs";\nmkdirSync(${JSON.stringify(extraBeside)}, { mode: 0o700 });\nwriteFileSync(${JSON.stringify(extraInside)}, "not written by Verify\\n", { mode: 0o600 });\n`, { mode: 0o600 });
  const stateBytes = readFileSync(f.statePath);
  try {
    const result = await runVerifyJournal({ gitCommonDir: f.common, repoRoot: f.root, candidate, suites: [{ name: "fixture-suite", file: suiteFile }], policyInputs: { harness: "extra-resource" }, runId: "verify-extra-resource" });
    assert.equal(result.terminal.status, "passed");
    const terminal = JSON.parse(readFileSync(join(runDir, "terminal.json"), "utf8"));
    assert.equal(terminal.status, "passed");
    // The journal Verify writes is `progress.jsonl` (createVerifyRun); the sealed terminal binds its bytes.
    const journalBytes = readFileSync(join(runDir, "progress.jsonl"));
    assert.ok(journalBytes.length > 0, "the journal is present and non-empty");
    assert.equal(terminal.journalSha256, createHash("sha256").update(journalBytes).digest("hex"), "the journal is intact and matches the sealed terminal");
    assert.equal(readFileSync(extraInside, "utf8"), "not written by Verify\n", "the extra resource inside the sealed run is retained, never drained");
    assert.equal(lstatSync(extraBeside).isDirectory(), true, "the extra resource beside the run is untouched");
    assert.equal(readOnboardingSessionCleanupBinding({ rootDir: f.root }).status, "unbound");
    assert.equal(listActiveSessionDescriptors(f.root).length, 0);
    assert.deepEqual(runRecordFiles(f.common), [], "the run record was retired");
    assert.deepEqual(readFileSync(f.statePath), stateBytes);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("a completed receipt owned by a currently live exact writer is never reused", async () => {
  const f = fixture();
  let calls = 0;
  const spawn = () => { calls += 1; return spawnPass(); };
  try {
    const first = await runVerifyJournal({ gitCommonDir: f.common, repoRoot: f.root, candidate, suites: f.suites, policyInputs: { harness: "test" }, runId: "verify-live-source", spawn, registerRun });
    writeFileSync(join(first.runDir, "run.lock"), `${JSON.stringify({
      schema: "pipeline.verify-run-lock.v1",
      runId: "verify-live-source",
      pid: process.pid,
      processStartId: currentProcessStartId(),
      owner: "current-os-user",
      status: "active",
      closedAt: null,
    })}\n`, { mode: 0o600 });
    const next = await runVerifyJournal({ gitCommonDir: f.common, repoRoot: f.root, candidate, suites: f.suites, policyInputs: { harness: "test" }, runId: "verify-after-live", spawn, registerRun });
    assert.equal(calls, 2);
    assert.deepEqual(next.plan.reusable, []);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("ADR-0065: compileVerifySuites declares the repository root plus suite-dependencies, not a bare candidate-tree", () => {
  const f = fixture();
  try {
    const [registration] = compileVerifySuites({ repoRoot: f.root, suites: [{ name: "fixture-suite", file: f.suiteFile, dependsOn: [] }], candidateTree: candidate.tree });
    assert.deepEqual(registration.inputs.nonFiles.map((entry) => entry.kind), ["declared-tree:root", "suite-arguments", "suite-dependencies"]);
    assert.equal(registration.inputs.nonFiles.every((entry) => entry.path === null), true);
    // Same declaration recompiled from scratch digests identically (deterministic, no coupling to
    // any other suite in the registration list).
    const [same] = compileVerifySuites({ repoRoot: f.root, suites: [{ name: "fixture-suite", file: f.suiteFile, dependsOn: [] }], candidateTree: candidate.tree });
    assert.equal(digestJson(same.inputs), digestJson(registration.inputs));
    // A different dependsOn list changes only this suite's own inputs digest -- the mechanism
    // suite-dependencies exists to restore now that policySha256 no longer covers it.
    const [withDependency] = compileVerifySuites({ repoRoot: f.root, suites: [{ name: "fixture-suite", file: f.suiteFile, dependsOn: ["other-suite"] }], candidateTree: candidate.tree });
    assert.notEqual(digestJson(withDependency.inputs), digestJson(registration.inputs));
    // A different candidate tree changes the declared-tree:root digest -- the suite still
    // declares the whole repository root, so any tree movement is still caught.
    const [otherCandidate] = compileVerifySuites({ repoRoot: f.root, suites: [{ name: "fixture-suite", file: f.suiteFile, dependsOn: [] }], candidateTree: "9".repeat(40) });
    assert.notEqual(digestJson(otherCandidate.inputs), digestJson(registration.inputs));
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("ADR-0065: policySha256 no longer couples unrelated suites, and suite-dependencies restores its own dependsOn check", async () => {
  const f = fixture();
  const secondFile = join(f.root, "second.test.mjs");
  writeFileSync(secondFile, "process.stdout.write('second complete log\\n')\n", { mode: 0o600 });
  const suitesA = [{ name: "fixture-suite", file: f.suiteFile, dependsOn: [] }, { name: "second-suite", file: secondFile, dependsOn: [] }];
  const suitesB = [{ name: "fixture-suite", file: f.suiteFile, dependsOn: [] }, { name: "second-suite", file: secondFile, dependsOn: ["fixture-suite"] }];
  let calls = 0;
  const spawn = () => { calls += 1; return spawnPass(); };
  try {
    await runVerifyJournal({ gitCommonDir: f.common, repoRoot: f.root, candidate, suites: suitesA, policyInputs: { harness: "test" }, runId: "verify-one", spawn, registerRun });
    assert.equal(calls, 2);
    // second-suite's OWN registration changed (it now declares a dependsOn); fixture-suite's
    // registration is byte-identical to run one. Before this change, the old policySha256 --
    // digestJson({..., suites: registrations, ...}) -- covered every suite's registration, so
    // second-suite's change would have flipped policySha256 and invalidated fixture-suite too via
    // verify-policy-drift, even though nothing about fixture-suite itself moved. That coupling is
    // gone: fixture-suite is still reusable, and second-suite is invalidated by its OWN
    // declared-input-drift (via the new suite-dependencies input), never by verify-policy-drift.
    const next = await runVerifyJournal({ gitCommonDir: f.common, repoRoot: f.root, candidate, suites: suitesB, policyInputs: { harness: "test" }, runId: "verify-two", spawn, registerRun });
    assert.equal(calls, 3);
    assert.deepEqual(next.plan.reusable, ["fixture-suite"]);
    assert.deepEqual(next.plan.rerun, ["second-suite"]);
    assert.equal(next.plan.reasons.find((entry) => entry.suite === "second-suite").code, "declared-input-drift");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("a manifest with a drifted cleanup registration cannot authorize receipt reuse", async () => {
  const f = fixture();
  let calls = 0;
  const spawn = () => { calls += 1; return spawnPass(); };
  try {
    const first = await runVerifyJournal({ gitCommonDir: f.common, repoRoot: f.root, candidate, suites: f.suites, policyInputs: { harness: "test" }, runId: "verify-registration-source", spawn, registerRun });
    const manifestPath = join(first.runDir, "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.cleanupRegistration.receiptSha256 = "0".repeat(64);
    const { manifestSha256: omitted, ...body } = manifest;
    manifest.manifestSha256 = digestJson(body);
    writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`, { mode: 0o600 });
    const next = await runVerifyJournal({ gitCommonDir: f.common, repoRoot: f.root, candidate, suites: f.suites, policyInputs: { harness: "test" }, runId: "verify-after-registration-drift", spawn, registerRun });
    assert.equal(calls, 2);
    assert.deepEqual(next.plan.reusable, []);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("ADR-0065 candidate (b): a Tier-A suite spawns with no --permission flags at all (regression, bit-identical to before this change)", async () => {
  const f = fixture();
  let capturedArgv = null;
  const spawn = (command, argv) => { capturedArgv = argv; return spawnPass(); };
  try {
    await runVerifyJournal({ gitCommonDir: f.common, repoRoot: f.root, candidate, suites: f.suites, policyInputs: { harness: "test" }, runId: "verify-tier-a-argv", spawn, registerRun });
    assert.deepEqual(capturedArgv, [f.suiteFile]);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("ADR-0065 candidate (b): the real human-role-label-tests registration declares exactly its own two files, never the repository root", () => {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
  const suiteFile = join(repoRoot, "plugins", "pipeline-core", "lib", "human-role-labels.test.mjs");
  const [registration] = compileVerifySuites({ repoRoot, suites: [{ name: "human-role-label-tests", file: suiteFile, dependsOn: [] }], candidateTree: "9".repeat(40) });
  assert.deepEqual(registration.inputs.files.map((file) => file.path), [
    "plugins/pipeline-core/lib/human-role-labels.mjs",
    "plugins/pipeline-core/lib/human-role-labels.test.mjs",
  ]);
  for (const file of registration.inputs.files) assert.match(file.fileSha256, /^[a-f0-9]{64}$/u);
  // Never "declared-tree:root", and never any "declared-tree:<slug>" -- ADR-0065's own clarification
  // 1 that a two-leaf-file suite needs no subtree slug form at all.
  assert.deepEqual(registration.inputs.nonFiles.map((entry) => entry.kind), ["suite-arguments", "suite-dependencies"]);
  assert.equal(registration.inputs.nonFiles.some((entry) => entry.kind.startsWith("declared-tree:")), false);
  // A different, unrelated suite not named in the Tier-B table stays Tier A in the exact same call.
  const [other] = compileVerifySuites({ repoRoot, suites: [{ name: "some-other-suite", file: suiteFile, dependsOn: [] }], candidateTree: "9".repeat(40) });
  assert.equal(other.inputs.nonFiles.some((entry) => entry.kind === "declared-tree:root"), true);
});

test("ADR-0065 candidate (c): the real recovery-preview-attestation-tests registration declares exactly its own two files, never the repository root", () => {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
  const suiteFile = join(repoRoot, "plugins", "pipeline-core", "lib", "recovery-preview-attestation.test.mjs");
  const [registration] = compileVerifySuites({ repoRoot, suites: [{ name: "recovery-preview-attestation-tests", file: suiteFile, dependsOn: [] }], candidateTree: "9".repeat(40) });
  assert.deepEqual(registration.inputs.files.map((file) => file.path), [
    "plugins/pipeline-core/lib/recovery-preview-attestation.mjs",
    "plugins/pipeline-core/lib/recovery-preview-attestation.test.mjs",
  ]);
  for (const file of registration.inputs.files) assert.match(file.fileSha256, /^[a-f0-9]{64}$/u);
  assert.deepEqual(registration.inputs.nonFiles.map((entry) => entry.kind), ["suite-arguments", "suite-dependencies"]);
  assert.equal(registration.inputs.nonFiles.some((entry) => entry.kind.startsWith("declared-tree:")), false);
});

test("control-catalog-schema-tests remains Tier A after completion and child-process instrumentation", () => {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
  const suiteFile = join(repoRoot, "plugins", "pipeline-core", "lib", "control-catalog-schema.test.mjs");
  const [registration] = compileVerifySuites({ repoRoot, suites: [{ name: "control-catalog-schema-tests", file: suiteFile, dependsOn: [] }], candidateTree: "9".repeat(40) });
  assert.deepEqual(registration.inputs.files.map((file) => file.path), ["plugins/pipeline-core/lib/control-catalog-schema.test.mjs"]);
  for (const file of registration.inputs.files) assert.match(file.fileSha256, /^[a-f0-9]{64}$/u);
  assert.deepEqual(registration.inputs.nonFiles.map((entry) => entry.kind), ["declared-tree:root", "suite-arguments", "suite-dependencies"]);
});

test("ADR-0065 candidate (b): a Tier-B suite that reaches an undeclared path fails under the REAL Node permission model, not a mock", async () => {
  const f = fixture();
  const allowedFile = join(f.root, "tierb-allowed.mjs");
  writeFileSync(allowedFile, "export const allowed = true;\n", { mode: 0o600 });
  const undeclaredFile = join(f.root, "tierb-secret.txt");
  writeFileSync(undeclaredFile, "undeclared content\n", { mode: 0o600 });
  const suiteFile = join(f.root, "tierb-negative.test.mjs");
  writeFileSync(
    suiteFile,
    [
      "import { readFileSync } from 'node:fs';",
      "import './tierb-allowed.mjs';",
      `readFileSync(${JSON.stringify(undeclaredFile)});`,
      "process.stdout.write('should never be reached\\n');",
      "",
    ].join("\n"),
    { mode: 0o600 },
  );
  const tierBDeclarations = { "tierb-negative-suite": { reads: ["tierb-allowed.mjs"] } };
  const suites = [{ name: "tierb-negative-suite", file: suiteFile, dependsOn: [] }];
  try {
    // Real spawnSync, real Node --permission flags -- the exact same runVerifyJournal path
    // production uses, not a mocked spawn. This is the "negative corpus proving a suite fails
    // when an undeclared read is introduced" the ADR's Risk paragraph and Follow-up section
    // require before any suite is promoted to Tier B.
    const result = await runVerifyJournal({ gitCommonDir: f.common, repoRoot: f.root, candidate, suites, policyInputs: { harness: "test" }, runId: "verify-tierb-negative", spawn: spawnSync, registerRun, tierBDeclarations });
    assert.equal(result.terminal.status, "failed");
    assert.notEqual(result.steps[0].exitCode, 0);
    const artifactName = verifySuiteArtifactName("tierb-negative-suite");
    const log = readFileSync(join(result.runDir, "logs", `${artifactName}.log`), "utf8");
    // The real Node runtime's own denial shape, not a hand-written assertion string.
    assert.match(log, /ERR_ACCESS_DENIED/u);
    assert.match(log, /FileSystemRead/u);
    assert.equal(log.includes("should never be reached"), false);
    const receipt = JSON.parse(readFileSync(join(result.runDir, "receipts", `${artifactName}.json`), "utf8"));
    assert.deepEqual(receipt.inputs.files.map((file) => file.path), ["tierb-allowed.mjs", "tierb-negative.test.mjs"]);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("ADR-0065 candidate (b): a Tier-B suite whose declared reads are actually sufficient still passes under the REAL Node permission model", async () => {
  const f = fixture();
  const allowedFile = join(f.root, "tierb-ok-allowed.mjs");
  writeFileSync(allowedFile, "export const allowed = true;\n", { mode: 0o600 });
  const suiteFile = join(f.root, "tierb-ok.test.mjs");
  writeFileSync(suiteFile, "import { allowed } from './tierb-ok-allowed.mjs';\nprocess.stdout.write(`ok ${allowed}\\n`);\n", { mode: 0o600 });
  const tierBDeclarations = { "tierb-ok-suite": { reads: ["tierb-ok-allowed.mjs"] } };
  const suites = [{ name: "tierb-ok-suite", file: suiteFile, dependsOn: [] }];
  try {
    const result = await runVerifyJournal({ gitCommonDir: f.common, repoRoot: f.root, candidate, suites, policyInputs: { harness: "test" }, runId: "verify-tierb-positive", spawn: spawnSync, registerRun, tierBDeclarations });
    assert.equal(result.terminal.status, "passed");
    assert.equal(result.steps[0].exitCode, 0);
    const artifactName = verifySuiteArtifactName("tierb-ok-suite");
    const log = readFileSync(join(result.runDir, "logs", `${artifactName}.log`), "utf8");
    assert.match(log, /ok true/u);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

// ADR-0065 candidate (b) cross-candidate-reuse regression (Critic finding F1). Before this fix,
// verify-resume.mjs's firstDrift checked candidate-drift unconditionally for every suite, so a
// Tier-B suite whose own declared files were untouched was STILL invalidated the moment an
// unrelated commit changed overall candidate identity -- defeating candidate (b)'s entire purpose.
// This is the exact scenario the Elephant independently reproduced with a real script before
// dispatching this fix. Covers both directions: (a) unrelated candidate change, suite's own
// declared files unchanged -> reused; (b) suite's own declared files changed -> still invalidated.
//
// NVA-ADR65TIERFIX-2 (Critic finding F1 follow-up, blocker): that fix also made cross-candidate
// reuse structurally possible at all, which ADR-0065's own Follow-up section reserves for the PO's
// Decision 8 with an accepted conservative default (push/release-bound runs force `--no-reuse`).
// The mechanism below now only fires when the caller explicitly opts in via
// `allowCrossCandidateReuse: true` -- this test exercises that opted-in path to prove the
// mechanism itself still works; the paired test below it proves the opposite and more important
// thing, that the DEFAULT (unopted-in, matching harness/scripts/verify.mjs's real unmodified call
// shape) does NOT reuse.
test("ADR-0065 candidate (b) regression: a Tier-B suite whose own declared files are unchanged is reused across a candidate whose commit and tree both differ, WHEN allowCrossCandidateReuse: true is explicitly passed", async () => {
  const f = fixture();
  const allowedFile = join(f.root, "tierb-cross-allowed.mjs");
  writeFileSync(allowedFile, "export const allowed = true;\n", { mode: 0o600 });
  const suiteFile = join(f.root, "tierb-cross.test.mjs");
  writeFileSync(suiteFile, "import { allowed } from './tierb-cross-allowed.mjs';\nprocess.stdout.write(`ok ${allowed}\\n`);\n", { mode: 0o600 });
  const tierBDeclarations = { "tierb-cross-suite": { reads: ["tierb-cross-allowed.mjs"] } };
  const suites = [{ name: "tierb-cross-suite", file: suiteFile, dependsOn: [] }];
  let calls = 0;
  const spawn = (...args) => { calls += 1; return spawnSync(...args); };
  const candidateTwo = { commit: "3".repeat(40), tree: "4".repeat(40) };
  const candidateThree = { commit: "5".repeat(40), tree: "6".repeat(40) };
  try {
    await runVerifyJournal({ gitCommonDir: f.common, repoRoot: f.root, candidate, suites, policyInputs: { harness: "test" }, runId: "verify-tierb-cross-one", spawn, registerRun, tierBDeclarations, allowCrossCandidateReuse: true });
    assert.equal(calls, 1);
    // An unrelated commit lands: candidate identity (commit AND tree) moves, but the Tier-B
    // suite's own declared files (suiteFile, allowedFile) never change.
    const second = await runVerifyJournal({ gitCommonDir: f.common, repoRoot: f.root, candidate: candidateTwo, suites, policyInputs: { harness: "test" }, runId: "verify-tierb-cross-two", spawn, registerRun, tierBDeclarations, allowCrossCandidateReuse: true });
    assert.equal(calls, 1, "a Tier-B suite whose own declared files are unchanged must be reused, not re-executed, across an unrelated candidate change when the caller opted in");
    assert.equal(second.steps[0].reused, true);
    assert.deepEqual(second.plan.reusable, ["tierb-cross-suite"]);
    // Now the suite's OWN declared file changes -- this must still correctly invalidate it, even
    // though the check that fires is declared-input-drift rather than candidate-drift.
    writeFileSync(allowedFile, "export const allowed = false;\n", { mode: 0o600 });
    const third = await runVerifyJournal({ gitCommonDir: f.common, repoRoot: f.root, candidate: candidateThree, suites, policyInputs: { harness: "test" }, runId: "verify-tierb-cross-three", spawn, registerRun, tierBDeclarations, allowCrossCandidateReuse: true });
    assert.equal(calls, 2);
    assert.equal(third.steps[0].reused, false);
    assert.deepEqual(third.plan.rerun, ["tierb-cross-suite"]);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("NVA-ADR65TIERFIX-2: WITHOUT allowCrossCandidateReuse (the default, matching harness/scripts/verify.mjs's real unmodified call -- the flag is not passed at all here), a Tier-B suite whose own declared files are unchanged is NOT reused across a candidate change and is re-executed instead", async () => {
  const f = fixture();
  const allowedFile = join(f.root, "tierb-nodefault-allowed.mjs");
  writeFileSync(allowedFile, "export const allowed = true;\n", { mode: 0o600 });
  const suiteFile = join(f.root, "tierb-nodefault.test.mjs");
  writeFileSync(suiteFile, "import { allowed } from './tierb-nodefault-allowed.mjs';\nprocess.stdout.write(`ok ${allowed}\\n`);\n", { mode: 0o600 });
  const tierBDeclarations = { "tierb-nodefault-suite": { reads: ["tierb-nodefault-allowed.mjs"] } };
  const suites = [{ name: "tierb-nodefault-suite", file: suiteFile, dependsOn: [] }];
  let calls = 0;
  const spawn = (...args) => { calls += 1; return spawnSync(...args); };
  const candidateTwo = { commit: "3".repeat(40), tree: "4".repeat(40) };
  try {
    // Exact call shape of harness/scripts/verify.mjs's real, unmodified call: no
    // allowCrossCandidateReuse key present at all.
    await runVerifyJournal({ gitCommonDir: f.common, repoRoot: f.root, candidate, suites, policyInputs: { harness: "test" }, runId: "verify-tierb-nodefault-one", spawn, registerRun, tierBDeclarations });
    assert.equal(calls, 1);
    // An unrelated commit lands: candidate identity (commit AND tree) moves, but the Tier-B
    // suite's own declared files never change. Without the opt-in, this must still re-execute.
    const second = await runVerifyJournal({ gitCommonDir: f.common, repoRoot: f.root, candidate: candidateTwo, suites, policyInputs: { harness: "test" }, runId: "verify-tierb-nodefault-two", spawn, registerRun, tierBDeclarations });
    assert.equal(calls, 2, "without allowCrossCandidateReuse, a Tier-B suite must be re-executed (not reused) across a candidate change -- the safe default");
    assert.equal(second.steps[0].reused, false);
    assert.deepEqual(second.plan.rerun, ["tierb-nodefault-suite"]);
    assert.equal(second.plan.reasons[0].code, "candidate-drift");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

// ============================================================================================
// AGY-VERIFYTUNER-1: bounded async worker pool for the suite-execution loop.
// ============================================================================================

/** A spawn mock keyed by the suite's OWN file path (argv[0] for a Tier-A suite carries no
 * --permission flags, so it is always the last-but-args element -- here, with no suite.args,
 * argv[0] itself). Resolves after `delayMs(file)` via setTimeout, so suites genuinely overlap in
 * real wall-clock time under concurrency > 1 rather than merely interleaving on the microtask
 * queue -- proving real overlap, not simulated overlap. */
function delayedSpawn({ delayMs, onStart, onSettle } = {}) {
  return (command, argv) => {
    const file = argv[argv.length - 1];
    if (typeof onStart === "function") onStart(file);
    const wait = typeof delayMs === "function" ? delayMs(file) : (delayMs ?? 0);
    return new Promise((resolvePromise) => {
      setTimeout(() => {
        if (typeof onSettle === "function") onSettle(file);
        resolvePromise({ status: 0, stdout: Buffer.from(`ok:${file}\n`), stderr: Buffer.alloc(0), error: undefined });
      }, wait);
    });
  };
}

function twoSuiteFixture(names) {
  const f = fixture();
  const files = names.map((name) => {
    const file = join(f.root, `${name}.test.mjs`);
    writeFileSync(file, `process.stdout.write('${name} ok\\n')\n`, { mode: 0o600 });
    return file;
  });
  const suites = names.map((name, index) => ({ name, file: files[index], dependsOn: [] }));
  return { ...f, files, suites };
}

test("AGY-VERIFYTUNER-1: steps[] materializes in registration order regardless of real completion order", async () => {
  const f = twoSuiteFixture(["slow-suite", "fast-suite"]);
  const delays = new Map([[f.files[0], 60], [f.files[1], 5]]);
  try {
    // slow-suite is registered FIRST but finishes LAST (60ms vs 5ms); fast-suite is registered
    // SECOND but finishes FIRST. With concurrency 2 both are in flight at once.
    const result = await runVerifyJournal({
      gitCommonDir: f.common, repoRoot: f.root, candidate, suites: f.suites,
      policyInputs: { harness: "test" }, runId: "verify-order", registerRun, concurrency: 2,
      spawn: delayedSpawn({ delayMs: (file) => delays.get(file) }),
    });
    assert.deepEqual(result.steps.map((step) => step.name), ["slow-suite", "fast-suite"], "steps[] stays in registration order even though fast-suite's own child process completed first");
    assert.equal(result.steps.every((step) => step.exitCode === 0), true);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("AGY-VERIFYTUNER-1: a dependsOn suite does not START executing before its dependency's receipt exists, under concurrency > 1", async () => {
  const f = twoSuiteFixture(["dep-slow", "dep-fast"]);
  const suites = [
    { name: "dep-slow", file: f.files[0], dependsOn: [] },
    { name: "dep-fast", file: f.files[1], dependsOn: ["dep-slow"] },
  ];
  const runId = "verify-depends-on";
  const runsRoot = join(f.common, "agent-pipeline", "verify", "runs");
  const depSlowArtifact = verifySuiteArtifactName("dep-slow");
  let dependencyReceiptExistedWhenDependentStarted = null;
  const spawn = delayedSpawn({
    delayMs: (file) => (file === f.files[0] ? 40 : 0),
    onStart: (file) => {
      if (file !== f.files[1]) return;
      // Checked at the moment dep-fast's own child process is about to be spawned -- exactly the
      // "must not START executing" gate the briefing names, verified via the dependency's real
      // receipt file on disk, not via a timestamp comparison.
      try {
        readFileSync(join(runsRoot, runId, "receipts", `${depSlowArtifact}.json`));
        dependencyReceiptExistedWhenDependentStarted = true;
      } catch {
        dependencyReceiptExistedWhenDependentStarted = false;
      }
    },
  });
  try {
    // concurrency: 2 means nothing about the pool's own slot budget would block dep-fast from
    // starting immediately -- only the dependsOn gate can be holding it back.
    await runVerifyJournal({ gitCommonDir: f.common, repoRoot: f.root, candidate, suites, policyInputs: { harness: "test" }, runId, registerRun, concurrency: 2, spawn });
    assert.equal(dependencyReceiptExistedWhenDependentStarted, true, "dep-fast's spawn must never be invoked before dep-slow's receipt file exists on disk");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("AGY-VERIFYTUNER-1/2: explicit concurrency: 1 still matches the prior strictly-sequential behavior -- same steps[] content and order, same exit codes (explicit sequential stays available on request)", async () => {
  const f = twoSuiteFixture(["default-a", "default-b"]);
  let maxInFlight = 0;
  let inFlight = 0;
  const spawn = delayedSpawn({
    delayMs: 5,
    onStart: () => { inFlight += 1; maxInFlight = Math.max(maxInFlight, inFlight); },
    onSettle: () => { inFlight -= 1; },
  });
  try {
    const result = await runVerifyJournal({ gitCommonDir: f.common, repoRoot: f.root, candidate, suites: f.suites, policyInputs: { harness: "test" }, runId: "verify-default-concurrency", registerRun, spawn, concurrency: 1 });
    assert.equal(maxInFlight, 1, "explicit concurrency: 1 must never let two suites' child processes be in flight at once");
    assert.deepEqual(result.steps.map((step) => step.name), ["default-a", "default-b"]);
    assert.equal(result.steps.every((step) => step.exitCode === 0), true);
    assert.equal(result.terminal.status, "passed");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

// ============================================================================================
// AGY-VERIFYTUNER-2: default concurrency resolution (env var > project/pipeline.json calibration
// > DEFAULT_VERIFY_CONCURRENCY literal), and the serial/exclusive lanes.
// ============================================================================================

test("AGY-VERIFYTUNER-2: with no concurrency argument, no env override, and no calibration file, the resolved default is the hardcoded literal (> 1) -- real production concurrency, not the stage-1 mechanism default", async () => {
  const f = twoSuiteFixture(["resolved-a", "resolved-b"]);
  let maxInFlight = 0;
  let inFlight = 0;
  const spawn = delayedSpawn({
    delayMs: 20,
    onStart: () => { inFlight += 1; maxInFlight = Math.max(maxInFlight, inFlight); },
    onSettle: () => { inFlight -= 1; },
  });
  try {
    // No `concurrency` key -- exactly harness/scripts/verify.mjs's real call shape. `environment`
    // is explicitly emptied so this test never depends on (or leaks into) ambient process.env.
    const result = await runVerifyJournal({ gitCommonDir: f.common, repoRoot: f.root, candidate, suites: f.suites, policyInputs: { harness: "test" }, runId: "verify-resolved-default", registerRun, spawn, environment: {} });
    assert.equal(maxInFlight, 2, "the resolved default must allow both suites' child processes in flight at once (> 1)");
    assert.deepEqual(result.steps.map((step) => step.name), ["resolved-a", "resolved-b"]);
    assert.equal(result.terminal.status, "passed");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("AGY-VERIFYTUNER-2: PIPELINE_VERIFY_CONCURRENCY in the passed environment overrides the default", async () => {
  const f = twoSuiteFixture(["env-a", "env-b"]);
  let maxInFlight = 0;
  let inFlight = 0;
  const spawn = delayedSpawn({
    delayMs: 20,
    onStart: () => { inFlight += 1; maxInFlight = Math.max(maxInFlight, inFlight); },
    onSettle: () => { inFlight -= 1; },
  });
  try {
    const result = await runVerifyJournal({ gitCommonDir: f.common, repoRoot: f.root, candidate, suites: f.suites, policyInputs: { harness: "test" }, runId: "verify-env-concurrency", registerRun, spawn, environment: { PIPELINE_VERIFY_CONCURRENCY: "1" } });
    assert.equal(maxInFlight, 1, "PIPELINE_VERIFY_CONCURRENCY=1 must force strictly sequential execution even though the literal default is > 1");
    assert.equal(result.terminal.status, "passed");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("AGY-VERIFYTUNER-2: a project/pipeline.json verifyConcurrency field is read as a calibration override when no env var is present", async () => {
  const f = twoSuiteFixture(["cal-a", "cal-b"]);
  mkdirSync(join(f.root, "project"), { recursive: true });
  writeFileSync(join(f.root, "project", "pipeline.json"), JSON.stringify({ verifyConcurrency: 1 }), { mode: 0o600 });
  let maxInFlight = 0;
  let inFlight = 0;
  const spawn = delayedSpawn({
    delayMs: 20,
    onStart: () => { inFlight += 1; maxInFlight = Math.max(maxInFlight, inFlight); },
    onSettle: () => { inFlight -= 1; },
  });
  try {
    const result = await runVerifyJournal({ gitCommonDir: f.common, repoRoot: f.root, candidate, suites: f.suites, policyInputs: { harness: "test" }, runId: "verify-calibration-concurrency", registerRun, spawn, environment: {} });
    assert.equal(maxInFlight, 1, "the calibration file's verifyConcurrency: 1 must be honored when no env var overrides it");
    assert.equal(result.terminal.status, "passed");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("AGY-VERIFYTUNER-2: PIPELINE_VERIFY_CONCURRENCY takes precedence over a project/pipeline.json calibration value", async () => {
  const f = twoSuiteFixture(["prec-a", "prec-b"]);
  mkdirSync(join(f.root, "project"), { recursive: true });
  writeFileSync(join(f.root, "project", "pipeline.json"), JSON.stringify({ verifyConcurrency: 1 }), { mode: 0o600 });
  let maxInFlight = 0;
  let inFlight = 0;
  const spawn = delayedSpawn({
    delayMs: 20,
    onStart: () => { inFlight += 1; maxInFlight = Math.max(maxInFlight, inFlight); },
    onSettle: () => { inFlight -= 1; },
  });
  try {
    const result = await runVerifyJournal({ gitCommonDir: f.common, repoRoot: f.root, candidate, suites: f.suites, policyInputs: { harness: "test" }, runId: "verify-precedence-concurrency", registerRun, spawn, environment: { PIPELINE_VERIFY_CONCURRENCY: "2" } });
    assert.equal(maxInFlight, 2, "the env var (2) must win over the calibration file's value (1)");
    assert.equal(result.terminal.status, "passed");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("AGY-VERIFYTUNER-2: two suites named in serialLaneSuites never overlap each other, but a pool suite still overlaps a lane suite", async () => {
  const f = twoSuiteFixture(["lane-one", "lane-two"]);
  const poolFile = join(f.root, "pool-x.test.mjs");
  writeFileSync(poolFile, "process.stdout.write('pool-x ok\\n')\n", { mode: 0o600 });
  const suites = [...f.suites, { name: "pool-x", file: poolFile, dependsOn: [] }];
  let laneInFlight = 0;
  let maxLaneInFlight = 0;
  let anyOverlapBetweenPoolAndLane = false;
  let poolStarted = false;
  const spawn = delayedSpawn({
    delayMs: 30,
    onStart: (file) => {
      if (file === poolFile) { poolStarted = true; return; }
      laneInFlight += 1;
      maxLaneInFlight = Math.max(maxLaneInFlight, laneInFlight);
      if (poolStarted) anyOverlapBetweenPoolAndLane = true;
    },
    onSettle: (file) => { if (file !== poolFile) laneInFlight -= 1; },
  });
  try {
    const result = await runVerifyJournal({
      gitCommonDir: f.common, repoRoot: f.root, candidate, suites, policyInputs: { harness: "test" },
      runId: "verify-serial-lane", registerRun, spawn, concurrency: 4,
      serialLaneSuites: new Set(["lane-one", "lane-two"]), exclusiveSuites: new Set(),
    });
    assert.equal(maxLaneInFlight, 1, "lane-one and lane-two must never both have a child process in flight");
    assert.deepEqual(result.steps.map((step) => step.name), ["lane-one", "lane-two", "pool-x"]);
    assert.equal(result.steps.every((step) => step.exitCode === 0), true);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("AGY-VERIFYTUNER-2: an exclusiveSuites member runs alone -- nothing else is in flight while it runs, and it runs before the concurrent phase starts", async () => {
  const f = twoSuiteFixture(["solo", "concurrent-peer"]);
  let anyOverlapWithSolo = false;
  let soloRunning = false;
  let otherInFlight = 0;
  const spawn = delayedSpawn({
    delayMs: 25,
    onStart: (file) => {
      const isSolo = file.endsWith("solo.test.mjs");
      if (isSolo) { soloRunning = true; if (otherInFlight > 0) anyOverlapWithSolo = true; return; }
      otherInFlight += 1;
      if (soloRunning) anyOverlapWithSolo = true;
    },
    onSettle: (file) => { if (file.endsWith("solo.test.mjs")) soloRunning = false; else otherInFlight -= 1; },
  });
  try {
    const result = await runVerifyJournal({
      gitCommonDir: f.common, repoRoot: f.root, candidate, suites: f.suites, policyInputs: { harness: "test" },
      runId: "verify-exclusive-lane", registerRun, spawn, concurrency: 4,
      serialLaneSuites: new Set(), exclusiveSuites: new Set(["solo"]),
    });
    assert.equal(anyOverlapWithSolo, false, "no other suite may be in flight while the exclusive suite runs, and vice versa");
    assert.deepEqual(result.steps.map((step) => step.name), ["solo", "concurrent-peer"]);
    assert.equal(result.steps.every((step) => step.exitCode === 0), true);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("security-scan uses the default exclusive phase so sibling fixtures cannot race its cleanliness snapshot", async () => {
  const f = twoSuiteFixture(["security-scan", "concurrent-peer"]);
  let securityScanRunning = false;
  let peerInFlight = 0;
  let anyOverlap = false;
  const spawn = delayedSpawn({
    delayMs: 25,
    onStart: (file) => {
      if (file === f.files[0]) {
        securityScanRunning = true;
        if (peerInFlight > 0) anyOverlap = true;
        return;
      }
      peerInFlight += 1;
      if (securityScanRunning) anyOverlap = true;
    },
    onSettle: (file) => { if (file === f.files[0]) securityScanRunning = false; else peerInFlight -= 1; },
  });
  try {
    const result = await runVerifyJournal({
      gitCommonDir: f.common, repoRoot: f.root, candidate, suites: f.suites,
      policyInputs: { harness: "test" }, runId: "verify-security-snapshot-exclusive",
      registerRun, spawn, concurrency: 4,
    });
    assert.equal(anyOverlap, false, "security-scan must complete before any sibling suite starts, so transient fixture writes cannot change its cleanliness observation");
    assert.deepEqual(result.steps.map((step) => step.name), ["security-scan", "concurrent-peer"]);
    assert.equal(result.steps.every((step) => step.exitCode === 0), true);
    assert.equal(result.terminal.status, "passed");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("AGY-VERIFYTUNER-2: an exclusiveSuites member whose own dependsOn names a non-exclusive suite is rejected up front rather than deadlocking", async () => {
  const f = twoSuiteFixture(["excl-dep", "pool-dep"]);
  const suites = [
    { name: "excl-dep", file: f.files[0], dependsOn: ["pool-dep"] },
    { name: "pool-dep", file: f.files[1], dependsOn: [] },
  ];
  try {
    await assert.rejects(
      () => runVerifyJournal({ gitCommonDir: f.common, repoRoot: f.root, candidate, suites, policyInputs: { harness: "test" }, runId: "verify-exclusive-bad-dependency", registerRun, spawn: spawnPass, exclusiveSuites: new Set(["excl-dep"]), serialLaneSuites: new Set() }),
      /VERIFY-EXCLUSIVE-SUITE-DEPENDS-ON-POOL-SUITE:excl-dep->pool-dep/u,
    );
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("BUGFIX ALFRED-VERIFY-EXCL-B: the real validate-manifest -> security-scan pair resolves inside the exclusive set and does not throw", async () => {
  const { EXCLUSIVE_SUITES } = await import("./verify-journal.mjs");
  assert.ok(EXCLUSIVE_SUITES instanceof Set, "EXCLUSIVE_SUITES must be exported");
  const realPair = [
    { name: "validate-manifest", dependsOn: [] },
    { name: "security-scan", dependsOn: ["validate-manifest"] },
  ];
  for (const suite of realPair) {
    if (!EXCLUSIVE_SUITES.has(suite.name)) continue;
    for (const dep of suite.dependsOn) {
      assert.equal(EXCLUSIVE_SUITES.has(dep), true, `${suite.name} is exclusive, so its dependency ${dep} must be exclusive too`);
    }
  }
  assert.equal(EXCLUSIVE_SUITES.has("security-scan"), true, "security-scan must stay exclusive");
  const f = twoSuiteFixture(["validate-manifest", "security-scan"]);
  const suites = [
    { name: "validate-manifest", file: f.files[0], dependsOn: [] },
    { name: "security-scan", file: f.files[1], dependsOn: ["validate-manifest"] },
  ];
  try {
    const result = await runVerifyJournal({ gitCommonDir: f.common, repoRoot: f.root, candidate, suites, policyInputs: { harness: "test" }, runId: "verify-real-exclusive-pair", registerRun, spawn: spawnPass, serialLaneSuites: new Set() });
    assert.deepEqual(result.steps.map((step) => step.name), ["validate-manifest", "security-scan"]);
    assert.equal(result.steps.every((step) => step.exitCode === 0), true);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("BUGFIX ALFRED-VERIFY-EXCL-B: a synthetic exclusive suite depending on a pool suite still throws", async () => {
  const f = twoSuiteFixture(["synthetic-excl", "synthetic-pool"]);
  const suites = [
    { name: "synthetic-excl", file: f.files[0], dependsOn: ["synthetic-pool"] },
    { name: "synthetic-pool", file: f.files[1], dependsOn: [] },
  ];
  try {
    await assert.rejects(
      () => runVerifyJournal({ gitCommonDir: f.common, repoRoot: f.root, candidate, suites, policyInputs: { harness: "test" }, runId: "verify-synthetic-excl-bad", registerRun, spawn: spawnPass, exclusiveSuites: new Set(["synthetic-excl"]), serialLaneSuites: new Set() }),
      /VERIFY-EXCLUSIVE-SUITE-DEPENDS-ON-POOL-SUITE:synthetic-excl->synthetic-pool/u,
    );
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("AGY-VERIFYTUNER-1: concurrency > 1 genuinely overlaps suites' child processes in real wall-clock time", async () => {
  const f = twoSuiteFixture(["par-a", "par-b"]);
  let maxInFlight = 0;
  let inFlight = 0;
  const spawn = delayedSpawn({
    delayMs: 40,
    onStart: () => { inFlight += 1; maxInFlight = Math.max(maxInFlight, inFlight); },
    onSettle: () => { inFlight -= 1; },
  });
  try {
    const result = await runVerifyJournal({ gitCommonDir: f.common, repoRoot: f.root, candidate, suites: f.suites, policyInputs: { harness: "test" }, runId: "verify-parallel", registerRun, concurrency: 2, spawn });
    // The in-flight counter is the non-flaky proof of genuine overlap: it can only reach 2 if
    // par-b's spawn started (onStart) before par-a's spawn settled (onSettle) -- i.e. both were
    // genuinely in flight at the same real wall-clock instant. An absolute elapsed-time ceiling
    // was tried here first and was flaky: this file's real filesystem setup/teardown per run
    // (private-directory creation/validation, receipt sealing, fsync) dwarfs a 40ms artificial
    // spawn delay, so total wall-clock time is not a reliable concurrency signal in this fixture.
    assert.equal(maxInFlight, 2, "both suites' child processes must be in flight at once under concurrency: 2");
    assert.deepEqual(result.steps.map((step) => step.name), ["par-a", "par-b"]);
    assert.equal(result.steps.every((step) => step.exitCode === 0), true);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("AGY-VERIFYTUNER-1: reuseSuite's cache-hit result still lands in steps[] at the correct registration-order position under the async pool", async () => {
  const f = twoSuiteFixture(["reuse-a", "reuse-b"]);
  let calls = 0;
  const spawn = () => { calls += 1; return spawnPass(); };
  try {
    const clock = makeClock();
    await runVerifyJournal({ gitCommonDir: f.common, repoRoot: f.root, candidate, suites: f.suites, policyInputs: { harness: "test" }, runId: "verify-reuse-one", spawn, registerRun, clock, concurrency: 2 });
    const resumed = await runVerifyJournal({ gitCommonDir: f.common, repoRoot: f.root, candidate, suites: f.suites, policyInputs: { harness: "test" }, runId: "verify-reuse-two", spawn, registerRun, clock, concurrency: 2 });
    assert.equal(calls, 2, "neither suite should re-spawn on the second, fully-reusable run");
    assert.deepEqual(resumed.steps.map((step) => step.name), ["reuse-a", "reuse-b"]);
    assert.deepEqual(resumed.steps.map((step) => step.reused), [true, true]);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("AGY-VERIFYTUNER-1: a cyclic dependsOn is rejected up front (by the existing verify-resume.mjs assertAcyclic check, run before the pool ever starts) rather than deadlocking the pool", async () => {
  const f = twoSuiteFixture(["cycle-a", "cycle-b"]);
  const suites = [
    { name: "cycle-a", file: f.files[0], dependsOn: ["cycle-b"] },
    { name: "cycle-b", file: f.files[1], dependsOn: ["cycle-a"] },
  ];
  try {
    // createVerifyRun (called before runSuitePool) already runs planVerifyResume/assertAcyclic --
    // this proves the async pool never even gets a chance to hang on a cyclic dependsOn, without
    // needing its own separate cycle guard.
    await assert.rejects(
      () => runVerifyJournal({ gitCommonDir: f.common, repoRoot: f.root, candidate, suites, policyInputs: { harness: "test" }, runId: "verify-cycle", registerRun, spawn: spawnPass }),
      /Verify dependency cycle is invalid/u,
    );
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("AGY-VERIFYTUNER-1: an out-of-range concurrency value is rejected", async () => {
  const f = fixture();
  try {
    await assert.rejects(
      () => runVerifyJournal({ gitCommonDir: f.common, repoRoot: f.root, candidate, suites: f.suites, policyInputs: { harness: "test" }, runId: "verify-bad-concurrency", registerRun, spawn: spawnPass, concurrency: 0 }),
      /VERIFY-JOURNAL-CONCURRENCY/u,
    );
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("AGY-VERIFYTUNER-1: the new default async spawn (no explicit spawn passed) genuinely runs a real child process end to end", async () => {
  const f = fixture();
  try {
    // No `spawn` key at all -- exercises the production default (spawnAsync), never a mock, so
    // the new async child_process.spawn transport itself is proven, not just the pool plumbing
    // around it.
    const result = await runVerifyJournal({ gitCommonDir: f.common, repoRoot: f.root, candidate, suites: f.suites, policyInputs: { harness: "test" }, runId: "verify-real-default-spawn", registerRun });
    assert.equal(result.terminal.status, "passed");
    assert.equal(result.steps[0].exitCode, 0);
    assert.match(readFileSync(join(result.runDir, "logs", `${artifact}.log`), "utf8"), /complete private log/u);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("AGY-VERIFYTUNER-1: a Tier-B suite's --permission flags still apply correctly under the new default async spawn (real Node permission model, no mock)", async () => {
  const f = fixture();
  const allowedFile = join(f.root, "tierb-default-spawn-allowed.mjs");
  writeFileSync(allowedFile, "export const allowed = true;\n", { mode: 0o600 });
  const undeclaredFile = join(f.root, "tierb-default-spawn-secret.txt");
  writeFileSync(undeclaredFile, "undeclared content\n", { mode: 0o600 });
  const suiteFile = join(f.root, "tierb-default-spawn-negative.test.mjs");
  writeFileSync(
    suiteFile,
    [
      "import { readFileSync } from 'node:fs';",
      "import './tierb-default-spawn-allowed.mjs';",
      `readFileSync(${JSON.stringify(undeclaredFile)});`,
      "process.stdout.write('should never be reached\\n');",
      "",
    ].join("\n"),
    { mode: 0o600 },
  );
  const tierBDeclarations = { "tierb-default-spawn-negative-suite": { reads: ["tierb-default-spawn-allowed.mjs"] } };
  const suites = [{ name: "tierb-default-spawn-negative-suite", file: suiteFile, dependsOn: [] }];
  try {
    // No `spawn` key -- the production default (spawnAsync), proving tierBSpawnFlags' argv still
    // reaches the real Node permission model correctly through child_process.spawn.
    const result = await runVerifyJournal({ gitCommonDir: f.common, repoRoot: f.root, candidate, suites, policyInputs: { harness: "test" }, runId: "verify-tierb-default-spawn-negative", registerRun, tierBDeclarations });
    assert.equal(result.terminal.status, "failed");
    assert.notEqual(result.steps[0].exitCode, 0);
    const artifactName = verifySuiteArtifactName("tierb-default-spawn-negative-suite");
    const log = readFileSync(join(result.runDir, "logs", `${artifactName}.log`), "utf8");
    assert.match(log, /ERR_ACCESS_DENIED/u);
    assert.match(log, /FileSystemRead/u);
    assert.equal(log.includes("should never be reached"), false);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

// ============================================================================================
// ALFRED-WINHIDE2: native-Windows console-window containment. Part 1 pins the preload module
// (windows-hide-preload.mjs) itself; part 2 pins its wiring into the suite spawner. On a non-win32
// host the "this host" cases assert the INERT contract, so each platform proves its own half.
// ============================================================================================
const WH_NAMES = ["spawn", "spawnSync", "execFile", "execFileSync", "exec", "execSync", "fork"];
const WH_IS_WIN32 = process.platform === "win32";
const WH_WIN = { platform: "win32" };

function whInstallOnFake(platform = "win32") {
  const calls = [];
  const target = {};
  for (const name of WH_NAMES) target[name] = (...args) => { calls.push({ name, args }); return `${name}-result`; };
  const originals = { ...target };
  let syncCalls = 0;
  const result = installWindowsHide({ childProcess: target, platform, sync: () => { syncCalls += 1; } });
  return { target, calls, originals, result, syncCalls: () => syncCalls };
}

test("ALFRED-WINHIDE2: win32 wraps every spawn-family function and supplies windowsHide:true when the options do not state it", () => {
  const { target, calls, result, syncCalls } = whInstallOnFake();
  assert.deepEqual(result, { installed: true, wrapped: WH_NAMES });
  assert.equal(syncCalls(), 1, "ESM named exports are re-synced exactly once");
  assert.equal(target.spawn("git"), "spawn-result", "the original return value passes through");
  target.spawn("git", ["status"]);
  target.spawnSync("git", ["status"], { encoding: "utf8" });
  target.execFileSync("git", ["status"], { cwd: "." });
  target.fork("module.js", ["a"]);
  target.fork("module.js");
  target.execSync("echo hi");
  target.execSync("echo hi", { cwd: "." });
  assert.deepEqual(calls.map((call) => call.args), [
    ["git", { windowsHide: true }],
    ["git", ["status"], { windowsHide: true }],
    ["git", ["status"], { encoding: "utf8", windowsHide: true }],
    ["git", ["status"], { cwd: ".", windowsHide: true }],
    ["module.js", ["a"], { windowsHide: true }],
    ["module.js", { windowsHide: true }],
    ["echo hi", { windowsHide: true }],
    ["echo hi", { cwd: ".", windowsHide: true }],
  ]);
});

test("ALFRED-WINHIDE2: win32 callback-bearing signatures keep the callback last and the options in position", () => {
  const { target, calls } = whInstallOnFake();
  const callback = () => {};
  target.execFile("git", callback);
  target.execFile("git", ["status"], callback);
  target.execFile("git", ["status"], { cwd: "." }, callback);
  target.execFile("git", { cwd: "." }, callback);
  target.exec("echo hi", callback);
  target.exec("echo hi", { cwd: "." }, callback);
  target.spawn("git", null, { cwd: "." });
  assert.deepEqual(calls.map((call) => call.args), [
    ["git", { windowsHide: true }, callback],
    ["git", ["status"], { windowsHide: true }, callback],
    ["git", ["status"], { cwd: ".", windowsHide: true }, callback],
    ["git", { cwd: ".", windowsHide: true }, callback],
    ["echo hi", { windowsHide: true }, callback],
    ["echo hi", { cwd: ".", windowsHide: true }, callback],
    ["git", null, { cwd: ".", windowsHide: true }],
  ]);
});

test("ALFRED-WINHIDE2: an explicit windowsHide is respected and the caller's options object is never mutated", () => {
  const { target, calls } = whInstallOnFake();
  const visible = { windowsHide: false, stdio: "inherit" };
  const plain = { cwd: "." };
  target.spawnSync("git", ["status"], visible);
  target.spawnSync("git", ["status"], { windowsHide: true });
  target.spawnSync("git", ["status"], plain);
  assert.equal(calls[0].args[2], visible, "explicit false is passed through as the same object");
  assert.equal(calls[0].args[2].windowsHide, false);
  assert.equal(calls[1].args[2].windowsHide, true);
  assert.equal(calls[2].args[2].windowsHide, true);
  assert.deepEqual(plain, { cwd: "." }, "the caller's options object stays untouched");
});

test("ALFRED-WINHIDE2: an argument shape Node itself rejects is passed through unchanged", () => {
  const { target, calls } = whInstallOnFake();
  target.spawnSync();
  target.spawnSync("git", ["status"], null);
  target.spawnSync("git", ["status"], "not-options");
  assert.deepEqual(calls.map((call) => call.args), [[], ["git", ["status"], null], ["git", ["status"], "not-options"]]);
});

test("ALFRED-WINHIDE2: loading twice wraps once, and the marker identifies a wrapped function", () => {
  const { target, calls } = whInstallOnFake();
  const second = installWindowsHide({ childProcess: target, platform: "win32", sync: () => assert.fail("nothing left to sync") });
  assert.deepEqual(second, { installed: true, wrapped: [] });
  target.spawn("git");
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args, ["git", { windowsHide: true }]);
  for (const name of WH_NAMES) assert.equal(target[name][WINDOWS_HIDE_WRAPPED], true, name);
});

test("ALFRED-WINHIDE2: util.promisify(execFile) still resolves {stdout, stderr} and goes through the wrapper", async () => {
  const calls = [];
  const execFile = (...args) => { calls.push(args); args[args.length - 1](null, "out", "err"); };
  Object.defineProperty(execFile, promisify.custom, {
    value: (...args) => new Promise((resolvePromise) => { execFile(...args, (error, stdout, stderr) => resolvePromise({ stdout, stderr })); }),
  });
  const target = { execFile };
  installWindowsHide({ childProcess: target, platform: "win32", sync: () => {} });
  assert.deepEqual(await promisify(target.execFile)("git", ["status"]), { stdout: "out", stderr: "err" });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].slice(0, 3), ["git", ["status"], { windowsHide: true }]);
});

test("ALFRED-WINHIDE2: non-win32 platforms replace nothing and sync nothing", () => {
  for (const platform of ["linux", "darwin", "freebsd"]) {
    const { target, originals, result, syncCalls } = whInstallOnFake(platform);
    assert.deepEqual(result, { installed: false, wrapped: [] }, platform);
    assert.equal(syncCalls(), 0, platform);
    for (const name of WH_NAMES) assert.equal(target[name], originals[name], `${platform} ${name}`);
  }
});

test("ALFRED-WINHIDE2: this host's real child_process matches the platform contract and still round-trips", async () => {
  for (const name of WH_NAMES) assert.equal(whChildProcess[name][WINDOWS_HIDE_WRAPPED] === true, WH_IS_WIN32, `child_process.${name}`);
  assert.equal(spawnSync[WINDOWS_HIDE_WRAPPED] === true, WH_IS_WIN32, "the ESM named import sees the wrapper only on win32");
  const git = spawnSync("git", ["--version"], { encoding: "utf8" });
  assert.equal(git.status, 0);
  assert.match(git.stdout, /^git version /u);
  assert.equal(whExecFileSync(process.execPath, ["-e", "process.stdout.write('ok')"], { encoding: "utf8" }), "ok");
  const child = spawnChild(process.execPath, ["-e", "process.stdout.write('async-ok');process.stderr.write('err');process.exit(3)"], { stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const code = await new Promise((resolvePromise) => child.once("close", resolvePromise));
  assert.deepEqual({ code, stdout, stderr }, { code: 3, stdout: "async-ok", stderr: "err" });
});

const WH_MARKER_PROBE = [
  "const marker = Symbol.for('pipeline.windows-hide-preload.wrapped');",
  "const cp = require('node:child_process');",
  "const own = cp.spawnSync[marker] === true && cp.execFileSync[marker] === true;",
  "const grand = cp.execFileSync(process.execPath, ['-e', \"process.stdout.write(String(require('node:child_process').spawnSync[Symbol.for('pipeline.windows-hide-preload.wrapped')] === true))\"], { encoding: 'utf8' });",
  "process.stdout.write(JSON.stringify({ own, grand }));",
].join("\n");

test("ALFRED-WINHIDE2: a NODE_OPTIONS child, and its own node child, load the preload only on win32", () => {
  const env = { ...process.env, NODE_OPTIONS: composeWindowsHideNodeOptions(process.env.NODE_OPTIONS, WH_WIN) };
  const run = spawnSync(process.execPath, ["-e", WH_MARKER_PROBE], { encoding: "utf8", env });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(run.stdout), WH_IS_WIN32 ? { own: true, grand: "true" } : { own: false, grand: "false" });
});

test("ALFRED-WINHIDE2: a permission-model child is not broken by the NODE_OPTIONS entry", { skip: !process.allowedNodeEnvironmentFlags.has("--permission") }, () => {
  const env = { ...process.env, NODE_OPTIONS: composeWindowsHideNodeOptions(process.env.NODE_OPTIONS, WH_WIN) };
  const run = spawnSync(process.execPath, ["--permission", "-e", "process.stdout.write('ran')"], { encoding: "utf8", env });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout, "ran");
});

test("ALFRED-WINHIDE2: composeWindowsHideNodeOptions adds one gated --import entry, preserves existing options and is idempotent on win32", () => {
  const option = windowsHideImportOption();
  const composed = composeWindowsHideNodeOptions(undefined, WH_WIN);
  assert.equal(composed, option);
  assert.ok(option.startsWith("--import=data:text/javascript,"));
  assert.ok(!/\s/u.test(option), "a single NODE_OPTIONS token: no whitespace to mis-split or quote");
  assert.match(decodeURIComponent(option), /if\(!process\.permission\)await import\(/u);
  assert.equal(composeWindowsHideNodeOptions("--max-old-space-size=4096", WH_WIN), `--max-old-space-size=4096 ${option}`);
  assert.equal(composeWindowsHideNodeOptions("  --no-warnings --enable-source-maps  ", WH_WIN), `--no-warnings --enable-source-maps ${option}`);
  assert.equal(composeWindowsHideNodeOptions("", WH_WIN), option);
  const once = composeWindowsHideNodeOptions("--no-warnings", WH_WIN);
  assert.equal(composeWindowsHideNodeOptions(once, WH_WIN), once);
  const odd = composeWindowsHideNodeOptions(undefined, { ...WH_WIN, preloadUrl: "file:///C:/Some%20Dir/it's/windows-hide-preload.mjs" });
  assert.ok(!/[\s"]/u.test(odd), "a preload URL with spaces and quotes still yields one clean token");
  for (const platform of ["linux", "darwin", "freebsd"]) {
    assert.equal(composeWindowsHideNodeOptions(undefined, { platform }), undefined, platform);
    assert.equal(composeWindowsHideNodeOptions("--no-warnings", { platform }), "--no-warnings", platform);
  }
});

test("ALFRED-WINHIDE2: resolveWindowsVerifyConcurrency caps win32 unless a valid override is given, and leaves other platforms alone", () => {
  assert.equal(WINDOWS_VERIFY_CONCURRENCY_CAP, 2);
  assert.equal(resolveWindowsVerifyConcurrency({}, WH_WIN), 2);
  for (const override of ["1", "4", "8", " 6 ", "16"]) assert.equal(resolveWindowsVerifyConcurrency({ PIPELINE_VERIFY_CONCURRENCY: override }, WH_WIN), undefined, override);
  for (const override of ["", "   ", "0", "-3", "abc", "2.5", "NaN", "Infinity"]) assert.equal(resolveWindowsVerifyConcurrency({ PIPELINE_VERIFY_CONCURRENCY: override }, WH_WIN), 2, override);
  for (const platform of ["linux", "darwin", "freebsd"]) {
    assert.equal(resolveWindowsVerifyConcurrency({}, { platform }), undefined, platform);
    assert.equal(resolveWindowsVerifyConcurrency({ PIPELINE_VERIFY_CONCURRENCY: "6" }, { platform }), undefined, platform);
  }
});

test("ALFRED-WINHIDE2: resolveSuiteChildEnvironment composes NODE_OPTIONS on win32 and is the identity elsewhere", () => {
  const option = windowsHideImportOption();
  const base = { PATH: "p", NODE_OPTIONS: "--no-warnings", KEEP: "1" };
  assert.deepEqual(resolveSuiteChildEnvironment(undefined, { platform: "win32", base }), { PATH: "p", KEEP: "1", NODE_OPTIONS: `--no-warnings ${option}` });
  assert.equal(base.NODE_OPTIONS, "--no-warnings", "the base environment is never mutated");
  assert.deepEqual(resolveSuiteChildEnvironment(undefined, { platform: "win32", base: { PATH: "p" } }), { PATH: "p", NODE_OPTIONS: option });
  assert.deepEqual(resolveSuiteChildEnvironment({ A: "1" }, { platform: "win32", base }), { A: "1", NODE_OPTIONS: option }, "an explicit env (case-completion) is extended, not replaced by base");
  assert.deepEqual(resolveSuiteChildEnvironment({ Node_Options: "--no-warnings", X: "1" }, { platform: "win32", base }), { X: "1", NODE_OPTIONS: `--no-warnings ${option}` }, "a differently cased variable is folded into one key");
  const already = resolveSuiteChildEnvironment(undefined, { platform: "win32", base });
  assert.deepEqual(resolveSuiteChildEnvironment(already, { platform: "win32", base }), already, "composing twice adds nothing");
  const explicit = { A: "1" };
  for (const platform of ["linux", "darwin", "freebsd"]) {
    assert.equal(resolveSuiteChildEnvironment(explicit, { platform, base }), explicit, `${platform}: same object back`);
    assert.equal(resolveSuiteChildEnvironment(undefined, { platform, base }), undefined, `${platform}: inherit stays inherit`);
  }
});

test("ALFRED-WINHIDE2: resolveDefaultConcurrency caps win32 at 2 unless env or calibration say otherwise; other platforms keep 8", () => {
  const root = mkdtempSync(join(tmpdir(), "winhide-concurrency-"));
  try {
    assert.equal(resolveDefaultConcurrency(root, {}, WH_WIN), 2);
    assert.equal(resolveDefaultConcurrency(root, { PIPELINE_VERIFY_CONCURRENCY: "abc" }, WH_WIN), 2, "an unusable override does not lift the cap");
    assert.equal(resolveDefaultConcurrency(root, { PIPELINE_VERIFY_CONCURRENCY: "6" }, WH_WIN), 6);
    assert.equal(resolveDefaultConcurrency(root, { PIPELINE_VERIFY_CONCURRENCY: "1" }, WH_WIN), 1);
    for (const platform of ["linux", "darwin", "freebsd"]) {
      assert.equal(resolveDefaultConcurrency(root, {}, { platform }), 8, platform);
      assert.equal(resolveDefaultConcurrency(root, { PIPELINE_VERIFY_CONCURRENCY: "3" }, { platform }), 3, platform);
    }
    mkdirSync(join(root, "project"), { recursive: true });
    writeFileSync(join(root, "project", "pipeline.json"), JSON.stringify({ verifyConcurrency: 5 }), { mode: 0o600 });
    assert.equal(resolveDefaultConcurrency(root, {}, WH_WIN), 5, "an explicit calibration value is configuration, so it beats the win32 cap");
    assert.equal(resolveDefaultConcurrency(root, { PIPELINE_VERIFY_CONCURRENCY: "7" }, WH_WIN), 7);
    assert.equal(resolveDefaultConcurrency(root, {}, { platform: "linux" }), 5);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("ALFRED-WINHIDE2: runVerifyJournal hands each suite child this host's NODE_OPTIONS contract (mock spawn)", async () => {
  const f = fixture();
  const seen = [];
  const spawn = (command, argv, options) => { seen.push(options); return spawnPass(); };
  try {
    const result = await runVerifyJournal({ gitCommonDir: f.common, repoRoot: f.root, candidate, suites: f.suites, policyInputs: { harness: "test" }, runId: "verify-winhide-env", registerRun, spawn, environment: {} });
    assert.equal(result.terminal.status, "passed");
    assert.equal(seen.length, 1);
    if (WH_IS_WIN32) {
      assert.equal(seen[0].env.NODE_OPTIONS, composeWindowsHideNodeOptions(process.env.NODE_OPTIONS, WH_WIN));
      assert.ok(seen[0].env.NODE_OPTIONS.includes(windowsHideImportOption()));
    } else {
      assert.equal(seen[0].env, undefined, "non-win32: the spawn options are unchanged and the child inherits");
    }
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("ALFRED-WINHIDE2: the default pool width is 2 on win32 and 8 elsewhere, and an explicit env override wins on every host", async () => {
  for (const [override, expected] of [[undefined, WH_IS_WIN32 ? 2 : 4], ["3", 3]]) {
    const f = twoSuiteFixture(["wh-a", "wh-b", "wh-c", "wh-d"]);
    let inFlight = 0;
    let maxInFlight = 0;
    const spawn = delayedSpawn({ delayMs: 30, onStart: () => { inFlight += 1; maxInFlight = Math.max(maxInFlight, inFlight); }, onSettle: () => { inFlight -= 1; } });
    try {
      const result = await runVerifyJournal({ gitCommonDir: f.common, repoRoot: f.root, candidate, suites: f.suites, policyInputs: { harness: "test" }, runId: `verify-winhide-width-${override ?? "default"}`, registerRun, spawn, environment: override === undefined ? {} : { PIPELINE_VERIFY_CONCURRENCY: override } });
      assert.equal(result.terminal.status, "passed");
      assert.equal(maxInFlight, expected, `override ${override ?? "none"}`);
    } finally { rmSync(f.root, { recursive: true, force: true }); }
  }
});

test("ALFRED-WINHIDE2: a real suite run through the default spawn loads the preload only on win32, in the suite and in its own children", async () => {
  const f = fixture();
  const suiteFile = join(f.root, "winhide-probe.test.mjs");
  writeFileSync(suiteFile, [
    "import cp from 'node:child_process';",
    "const marker = Symbol.for('pipeline.windows-hide-preload.wrapped');",
    "const grand = cp.execFileSync(process.execPath, ['-e', \"process.stdout.write(String(require('node:child_process').spawnSync[Symbol.for('pipeline.windows-hide-preload.wrapped')] === true))\"], { encoding: 'utf8' });",
    "process.stdout.write(`probe own=${cp.spawnSync[marker] === true} grand=${grand}\\n`);",
    "",
  ].join("\n"), { mode: 0o600 });
  try {
    const result = await runVerifyJournal({ gitCommonDir: f.common, repoRoot: f.root, candidate, suites: [{ name: "winhide-probe-suite", file: suiteFile, dependsOn: [] }], policyInputs: { harness: "test" }, runId: "verify-winhide-real-probe", registerRun });
    assert.equal(result.terminal.status, "passed");
    assert.equal(result.steps[0].exitCode, 0);
    const log = readFileSync(join(result.runDir, "logs", `${verifySuiteArtifactName("winhide-probe-suite")}.log`), "utf8");
    assert.match(log, WH_IS_WIN32 ? /probe own=true grand=true/u : /probe own=false grand=false/u);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("ALFRED-WINHIDE2: a Tier-B (--permission) suite passes through the default spawn with the NODE_OPTIONS entry present", async () => {
  const f = fixture();
  writeFileSync(join(f.root, "tierb-winhide-allowed.mjs"), "export const allowed = true;\n", { mode: 0o600 });
  const suiteFile = join(f.root, "tierb-winhide-ok.test.mjs");
  writeFileSync(suiteFile, ["import './tierb-winhide-allowed.mjs';", "process.stdout.write('tierb winhide ok\\n');", ""].join("\n"), { mode: 0o600 });
  const tierBDeclarations = { "tierb-winhide-ok-suite": { reads: ["tierb-winhide-allowed.mjs"] } };
  try {
    const result = await runVerifyJournal({ gitCommonDir: f.common, repoRoot: f.root, candidate, suites: [{ name: "tierb-winhide-ok-suite", file: suiteFile, dependsOn: [] }], policyInputs: { harness: "test" }, runId: "verify-winhide-tierb", registerRun, tierBDeclarations });
    assert.equal(result.terminal.status, "passed");
    assert.equal(result.steps[0].exitCode, 0);
    assert.match(readFileSync(join(result.runDir, "logs", `${verifySuiteArtifactName("tierb-winhide-ok-suite")}.log`), "utf8"), /tierb winhide ok/u);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("ALFRED-WINHIDE2: the only non-test spawn site in the verify spawner and in the evidence producer passes windowsHide: true", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const file of ["verify-journal.mjs", "verify-evidence-producer.mjs"]) {
    const source = readFileSync(join(here, file), "utf8");
    const sites = [...source.matchAll(/\b(?:spawnSync|spawnChildProcess|execFileSync|execFile|execSync)\(/gu)];
    assert.equal(sites.length, 1, `${file}: exactly one spawn call site`);
    const block = source.slice(sites[0].index, source.indexOf("});", sites[0].index));
    assert.ok(block.includes("windowsHide: true"), `${file}: the spawn call passes windowsHide: true`);
  }
});

// ALFRED-RF1: a Verify run that created its OWN session descriptor + private binding (the
// session-less fallback) must retire exactly those on EVERY exit path. Every fixture below is an
// isolated `git init` repository under os.tmpdir(); nothing touches the real repository.
const RF1_NO_RESIDUE = { descriptors: 0, binding: "unbound", cleanupManifests: [], descriptorFiles: [] };
function rf1Residue(f) {
  const listDir = (...parts) => { try { return readdirSync(join(f.common, "agent-pipeline", ...parts)); } catch { return []; } };
  return {
    descriptors: listActiveSessionDescriptors(f.root).length,
    binding: readOnboardingSessionCleanupBinding({ rootDir: f.root }).status,
    cleanupManifests: listDir("session-cleanup", "active"),
    descriptorFiles: listDir("session-descriptors", "active"),
  };
}
function rf1Checkout(prefix) {
  const f = sessionlessCheckout(prefix, "Exercise owner retirement on every Verify exit path");
  const suiteFile = join(f.root, "fixture.test.mjs");
  writeFileSync(suiteFile, "process.stdout.write('complete private log\\n')\n", { mode: 0o600 });
  return { ...f, suiteFile, suites: [{ name: "fixture-suite", file: suiteFile }] };
}
const rf1Run = (f, runId, extra = {}) => runVerifyJournal({ gitCommonDir: f.common, repoRoot: f.root, candidate, suites: f.suites, policyInputs: { harness: "rf1" }, runId, ...extra });
const rf1RunDir = (f, runId) => join(f.common, "agent-pipeline", "verify", "runs", runId);

test("ALFRED-RF1: a passed and a numeric failed terminal leave no own descriptor, binding or intent", async () => {
  const f = rf1Checkout("verify-journal-rf1-terminal-");
  try {
    const passed = await rf1Run(f, "verify-rf1-passed");
    assert.equal(passed.terminal.status, "passed");
    assert.deepEqual(rf1Residue(f), RF1_NO_RESIDUE);
    writeFileSync(f.suiteFile, "process.exitCode = 7\n", { mode: 0o600 });
    const failed = await rf1Run(f, "verify-rf1-failed", { reuseReceipts: false });
    assert.equal(failed.terminal.status, "failed");
    assert.deepEqual(rf1Residue(f), RF1_NO_RESIDUE);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("ALFRED-RF1: a planning error after the owner exists (VERIFY-EXCLUSIVE-SUITE-DEPENDS-ON-POOL-SUITE) retires the exact own descriptor, binding and intent", async () => {
  const f = rf1Checkout("verify-journal-rf1-planning-");
  const poolFile = join(f.root, "pool-dep.test.mjs");
  writeFileSync(poolFile, "process.stdout.write('pool\\n')\n", { mode: 0o600 });
  f.suites = [{ name: "excl-dep", file: f.suiteFile, dependsOn: ["pool-dep"] }, { name: "pool-dep", file: poolFile, dependsOn: [] }];
  try {
    await assert.rejects(
      () => rf1Run(f, "verify-rf1-planning", { spawn: spawnPass, exclusiveSuites: new Set(["excl-dep"]), serialLaneSuites: new Set() }),
      /VERIFY-EXCLUSIVE-SUITE-DEPENDS-ON-POOL-SUITE:excl-dep->pool-dep/u,
    );
    assert.deepEqual(rf1Residue(f), RF1_NO_RESIDUE);
    assert.equal(existsSync(rf1RunDir(f, "verify-rf1-planning")), false, "the unsealed run directory this invocation created is drained with its intent");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("ALFRED-RF1: a failure raised while the private run is being created retires the owner too", async () => {
  const f = rf1Checkout("verify-journal-rf1-create-");
  const otherFile = join(f.root, "other.test.mjs");
  writeFileSync(otherFile, "process.stdout.write('other\\n')\n", { mode: 0o600 });
  f.suites = [{ name: "cycle-a", file: f.suiteFile, dependsOn: ["cycle-b"] }, { name: "cycle-b", file: otherFile, dependsOn: ["cycle-a"] }];
  try {
    await assert.rejects(() => rf1Run(f, "verify-rf1-create", { spawn: spawnPass }));
    assert.deepEqual(rf1Residue(f), RF1_NO_RESIDUE);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("ALFRED-RF1: an exception thrown from the suite spawn seam is rethrown unchanged and the owner is retired", async () => {
  const f = rf1Checkout("verify-journal-rf1-seam-");
  try {
    await assert.rejects(() => rf1Run(f, "verify-rf1-seam", { spawn: async () => { throw new Error("RF1-SEAM-BOOM"); } }), /RF1-SEAM-BOOM/u);
    assert.deepEqual(rf1Residue(f), RF1_NO_RESIDUE);
    assert.equal(existsSync(rf1RunDir(f, "verify-rf1-seam")), false);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

// ALFRED-RDY3C-20261005 (PO decision "Readiness root fix", 2026-10-05): Verify's own cleanup duty is its
// run record, not a session descriptor, so it can no longer collide with a foreign descriptor -- the old
// VERIFY-OWNER-CLEANUP-REQUIRED aggregate (Verify could not retire "its" descriptor beside a foreign one)
// has no cause left. What survives is the safety property underneath it: owner retirement never touches
// a descriptor it did not create. A descriptor appearing mid-run stays byte-identical, the original error
// reaches the caller unwrapped, and Verify's OWN unsealed run directory is drained wholesale (including a
// file the seam dropped into it) while the run record is retired.
test("ALFRED-RF1: owner retirement never touches a descriptor it did not create", async () => {
  const f = rf1Checkout("verify-journal-rf1-foreign-");
  const runId = "verify-rf1-foreign";
  const runDir = rf1RunDir(f, runId);
  let foreign = null;
  let foreignBytes = null;
  let failure = null;
  try {
    await assert.rejects(
      () => rf1Run(f, runId, { spawn: async () => {
        foreign = startSessionDescriptor(f.root, {});
        foreignBytes = sessionStateBytes(f.common);
        writeFileSync(join(runDir, "extra-in-unsealed-run.txt"), "dropped by the seam\n", { mode: 0o600 });
        throw new Error("RF1-SEAM-FOREIGN");
      } }),
      (error) => { failure = error; return true; },
    );
    assert.ok(foreign !== null && foreignBytes !== null, "the seam ran and created the foreign descriptor");
    assert.equal(failure.message, "RF1-SEAM-FOREIGN", "the original error is rethrown unwrapped");
    assert.equal(failure instanceof AggregateError, false);
    assert.equal(failure.cause, undefined);
    assert.deepEqual(sessionStateBytes(f.common), foreignBytes, "no descriptor or cleanup-manifest byte changed");
    assert.deepEqual(listActiveSessionDescriptors(f.root), [{ sessionId: foreign.sessionId, descriptorSha256: foreign.descriptorSha256 }], "exactly the foreign descriptor remains");
    assert.equal(readOnboardingSessionCleanupBinding({ rootDir: f.root }).status, "unbound", "Verify created no cleanup binding");
    assert.equal(existsSync(runDir), false, "Verify's own unsealed run directory is drained wholesale");
    assert.deepEqual(runRecordFiles(f.common), [], "the run record was retired");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("ALFRED-RF1: reusing the id of an existing retained run is refused before any owner exists and deletes nothing", async () => {
  const f = rf1Checkout("verify-journal-rf1-existing-");
  try {
    const first = await rf1Run(f, "verify-rf1-existing");
    assert.equal(first.terminal.status, "passed");
    const before = snapshotFiles(first.runDir);
    await assert.rejects(() => rf1Run(f, "verify-rf1-existing", { reuseReceipts: false }), /VERIFY-JOURNAL-RUN-EXISTS:verify-rf1-existing/u);
    assert.deepEqual(snapshotFiles(first.runDir), before);
    assert.deepEqual(rf1Residue(f), RF1_NO_RESIDUE);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

// Process-level exit paths run in a CHILD node process (the module registers process listeners and
// may end the process), always against a temp repository. A synthetic `process.emit(signal)` from
// inside the child exercises the real handler on every platform; real OS signal delivery to a
// child is only possible on POSIX (native Windows terminates the target without running handlers).
function rf1ChildScript(f, runId, seamBody) {
  const journalUrl = pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), "verify-journal.mjs")).href;
  const script = join(f.root, `${runId}.child.mjs`);
  writeFileSync(script, [
    'import { writeFileSync } from "node:fs";',
    'import { join } from "node:path";',
    `import { runVerifyJournal } from ${JSON.stringify(journalUrl)};`,
    `const root = ${JSON.stringify(f.root)};`,
    `const marker = ${JSON.stringify(join(f.root, `${runId}.marker`))};`,
    "const interrupted = (signal) => ({ status: null, signal, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), error: undefined, cancellation: { proven: true, method: \"test-seam\", identity: { pid: 1, startId: \"1\", pgrp: 1 }, remaining: 0 } });",
    `const spawn = (command, args, options) => { ${seamBody} };`,
    `await runVerifyJournal({ gitCommonDir: join(root, ".git"), repoRoot: root, candidate: { commit: ${JSON.stringify(candidate.commit)}, tree: ${JSON.stringify(candidate.tree)} }, suites: [{ name: "fixture-suite", file: ${JSON.stringify(f.suiteFile)} }], policyInputs: { harness: "rf1-child" }, runId: ${JSON.stringify(runId)}, spawn });`,
    'console.log("RF1-CHILD-RETURNED");',
    "",
  ].join("\n"), { mode: 0o600 });
  return script;
}
const rf1ChildEnv = { ...process.env };
const rf1Child = (f, script) => spawnSync(process.execPath, [script], { cwd: f.root, encoding: "utf8", shell: false, timeout: 60_000, env: rf1ChildEnv });

test("ALFRED-RF1: an uncaught exception that ends the process leaves no own descriptor, binding or intent", () => {
  const f = rf1Checkout("verify-journal-rf1-uncaught-");
  try {
    const script = rf1ChildScript(f, "verify-rf1-uncaught", 'setImmediate(() => { throw new Error("RF1-UNCAUGHT-BOOM"); }); return new Promise(() => {});');
    const child = rf1Child(f, script);
    assert.equal(child.status, 1, child.stderr);
    assert.match(child.stderr, /RF1-UNCAUGHT-BOOM/u);
    assert.deepEqual(rf1Residue(f), RF1_NO_RESIDUE);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

const RF1_SIGNALS = ["SIGINT", "SIGTERM", ...("SIGBREAK" in osConstants.signals ? ["SIGBREAK"] : [])];
for (const name of RF1_SIGNALS) {
  test(`ALFRED-RF1: ${name} stops the child group gracefully, retires the owner and exits with the conventional code`, () => {
    const f = rf1Checkout(`verify-journal-rf1-${name.toLowerCase()}-`);
    try {
      const runId = `verify-rf1-${name.toLowerCase()}`;
      const script = rf1ChildScript(f, runId, `return new Promise((resolve) => { const settle = () => resolve(interrupted(${JSON.stringify(name)})); options.signal.addEventListener("abort", settle, { once: true }); writeFileSync(marker, "started"); process.emit(${JSON.stringify(name)}, ${JSON.stringify(name)}); });`);
      const child = rf1Child(f, script);
      assert.equal(child.status, 128 + osConstants.signals[name], child.stderr);
      assert.equal(child.stdout.includes("RF1-CHILD-RETURNED"), false, "the process ends instead of continuing after the interrupted run");
      assert.equal(existsSync(join(f.root, `${runId}.marker`)), true);
      assert.deepEqual(rf1Residue(f), RF1_NO_RESIDUE);
      const interruption = JSON.parse(readFileSync(join(rf1RunDir(f, runId), "interruption.json"), "utf8"));
      assert.equal(interruption.signal, name);
    } finally { rmSync(f.root, { recursive: true, force: true }); }
  });
}

test("ALFRED-RF1: a second signal while the first is still being honored forces the exit and still retires the owner", () => {
  const f = rf1Checkout("verify-journal-rf1-forced-");
  try {
    const script = rf1ChildScript(f, "verify-rf1-forced", 'return new Promise(() => { writeFileSync(marker, "started"); process.emit("SIGINT", "SIGINT"); process.emit("SIGINT", "SIGINT"); });');
    const child = rf1Child(f, script);
    assert.equal(child.status, 128 + osConstants.signals.SIGINT, child.stderr);
    assert.deepEqual(rf1Residue(f), RF1_NO_RESIDUE);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("ALFRED-RF1: a real SIGINT delivered by the operating system retires the owner", { skip: process.platform === "win32" ? "native Windows terminates a process signalled via kill() without running its handlers, so OS-level SIGINT delivery cannot be exercised; the synthetic process.emit cases above cover the handler on every platform" : false }, async () => {
  const f = rf1Checkout("verify-journal-rf1-os-sigint-");
  try {
    const script = rf1ChildScript(f, "verify-rf1-os-sigint", 'return new Promise((resolve) => { options.signal.addEventListener("abort", () => resolve(interrupted("SIGINT")), { once: true }); writeFileSync(marker, "started"); });');
    const child = spawnChild(process.execPath, [script], { cwd: f.root, stdio: ["ignore", "pipe", "pipe"], env: rf1ChildEnv });
    const marker = join(f.root, "verify-rf1-os-sigint.marker");
    const deadline = Date.now() + 15_000;
    while (!existsSync(marker) && Date.now() < deadline) await new Promise((resolveDelay) => setTimeout(resolveDelay, 20));
    assert.equal(existsSync(marker), true, "the child reached its running suite");
    child.kill("SIGINT");
    const closed = await new Promise((resolveClose) => child.once("close", (code, signal) => resolveClose({ code, signal })));
    assert.equal(closed.code, 128 + osConstants.signals.SIGINT);
    assert.deepEqual(rf1Residue(f), RF1_NO_RESIDUE);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
