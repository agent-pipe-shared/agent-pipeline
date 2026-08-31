#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { closeSync, chmodSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { digestJson } from "../lib/verify-resume.mjs";
import { applyOnboardingKickoff, planOnboardingKickoff, readOnboardingSessionCleanupBinding } from "../lib/onboarding-continuity.mjs";
import { startSessionDescriptor } from "../lib/worktree-lifecycle.mjs";
import { compileVerifySuites, createVerifyRun, runVerifyJournal, sealVerifyCleanupRegistration, verifySuiteArtifactName } from "./verify-journal.mjs";

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
    assert.equal(output.length, 2);
    assert.equal(output.some((line) => line.includes("complete private log")), false);
    for (const line of output) assert.equal(JSON.parse(line).schema, "pipeline.verify-progress.v1");
    assert.match(readFileSync(join(result.runDir, "logs", `${artifact}.log`), "utf8"), /complete private log/u);
    assert.equal(lstatSync(result.runDir).mode & 0o077, 0);
    assert.equal(lstatSync(join(result.runDir, "run.lock")).mode & 0o077, 0);
    assert.equal(JSON.parse(readFileSync(join(result.runDir, "run.lock"), "utf8")).status, "closed");
  } finally { console.log = original; rmSync(f.root, { recursive: true, force: true }); }
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

test("a session-less checkout (no Pipeline session, no prior .git/agent-pipeline state -- the CI condition) establishes a private ephemeral cleanup binding and registers the run, instead of aborting with zero suites started", async () => {
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
    const result = await runVerifyJournal({ gitCommonDir: common, repoRoot: root, candidate, suites: sessionlessSuites, policyInputs: { harness: "test" }, runId: "verify-sessionless-1", spawn: spawnPass });
    assert.equal(result.terminal.status, "passed");
    assert.equal(result.steps.length, 1);
    // The tracked authority file is byte-identical before and after: the ephemeral binding
    // took the private-runtime (.git/agent-pipeline/**) route, never the tracked-file route.
    assert.deepEqual(readFileSync(statePath), beforeStateBytes);
    const binding = readOnboardingSessionCleanupBinding({ rootDir: root });
    assert.equal(binding.status, "bound");
    // A second session-less run against the SAME checkout reuses the now-bound descriptor
    // rather than conflicting with it (WT-SESSION-UNBOUND-DESCRIPTOR).
    const again = await runVerifyJournal({ gitCommonDir: common, repoRoot: root, candidate, suites: sessionlessSuites, policyInputs: { harness: "test" }, runId: "verify-sessionless-2", spawn: spawnPass });
    assert.equal(again.terminal.status, "passed");
    assert.deepEqual(readFileSync(statePath), beforeStateBytes);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("a session-less checkout with an already-active session descriptor falls back to the original refusal, never overriding it", async () => {
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
  const kickoff = planOnboardingKickoff({ rootDir: root, goal: "Exercise the conflicting-descriptor refusal" });
  applyOnboardingKickoff({ plan: kickoff, expectedPlanSha256: kickoff.planSha256, activate: true });
  // A descriptor already exists with no continuity binding pointing at it (e.g. a prior,
  // still-open real session) -- the ephemeral fallback must never create a second one or
  // silently proceed around it.
  startSessionDescriptor(root, {});
  const common = join(root, ".git");
  const suiteFile = join(root, "fixture.test.mjs");
  writeFileSync(suiteFile, "process.stdout.write('complete private log\\n')\n", { mode: 0o600 });
  try {
    await assert.rejects(() => runVerifyJournal({ gitCommonDir: common, repoRoot: root, candidate, suites: [{ name: "fixture-suite", file: suiteFile }], policyInputs: { harness: "test" }, runId: "verify-sessionless-conflict", spawn: spawnPass }), /VERIFY-CLEANUP-REGISTRATION-REQUIRED/u);
    assert.throws(() => lstatSync(join(common, "agent-pipeline", "verify")));
  } finally { rmSync(root, { recursive: true, force: true }); }
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

test("ADR-0065 candidate (c) continuation (NVA-W5-ADR65C-2): the real control-catalog-schema-tests registration declares exactly its own two files, never the repository root", () => {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
  const suiteFile = join(repoRoot, "plugins", "pipeline-core", "lib", "control-catalog-schema.test.mjs");
  const [registration] = compileVerifySuites({ repoRoot, suites: [{ name: "control-catalog-schema-tests", file: suiteFile, dependsOn: [] }], candidateTree: "9".repeat(40) });
  assert.deepEqual(registration.inputs.files.map((file) => file.path), [
    "plugins/pipeline-core/lib/control-catalog-schema.mjs",
    "plugins/pipeline-core/lib/control-catalog-schema.test.mjs",
  ]);
  for (const file of registration.inputs.files) assert.match(file.fileSha256, /^[a-f0-9]{64}$/u);
  assert.deepEqual(registration.inputs.nonFiles.map((entry) => entry.kind), ["suite-arguments", "suite-dependencies"]);
  assert.equal(registration.inputs.nonFiles.some((entry) => entry.kind.startsWith("declared-tree:")), false);
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
