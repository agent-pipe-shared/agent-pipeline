#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir, uptime } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { createLocalWorkerPool } from "../lib/local-worker-pool.mjs";
import {
  LOCAL_WORKER_SUPERVISOR_REQUEST_SCHEMA,
  cleanupLocalWorkerSupervisor,
  localWorkerSupervisorPackageSha256,
  localWorkerSupervisorSha256,
  localWorkerSupervisorWorkerRequestSha256,
  readLocalWorkerProcessIdentity,
} from "../lib/local-worker-supervisor.mjs";
import {
  repairLocalSupervisorState,
  resolveLocalSupervisorRoot,
} from "../lib/local-supervisor-state.mjs";

const CLI = realpathSync(fileURLToPath(new URL("./local-worker-supervisor.mjs", import.meta.url)));
const NODE = realpathSync(process.execPath);
const GIT = realpathSync("/usr/bin/git");
const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);
const D = "d".repeat(64);

function fileSha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function git(args, cwd) {
  return execFileSync(GIT, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      PATH: process.env.PATH,
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_TERMINAL_PROMPT: "0",
    },
  }).trim();
}

function capacity(effective = 5) {
  return {
    configured: { concurrentTasks: 8, required: true },
    operator: { concurrentTasks: 8, required: true },
    certified: { concurrentTasks: 8, required: true },
    observed: { concurrentTasks: 8, required: true },
    pressure: { concurrentTasks: 8, required: false },
    reserved: { elephant: 1, verify: 1, critic: 1 },
    effective: { status: "available", concurrentTasks: effective, reasonCodes: [] },
  };
}

function worker(subjectSha256, leaseId, writePath, evidenceSha256, stateRoot, now) {
  return {
    subjectSha256,
    workspaceLease: {
      leaseId,
      subjectSha256,
      repository: A,
      baseCommit: null,
      candidateCommit: null,
      worktreePathSha256: localWorkerSupervisorSha256(join(stateRoot, "workspaces", leaseId)),
      writePaths: [writePath],
      ownerNonce: `owner-${leaseId}`,
      issuedMonotonicMs: now,
      expiresMonotonicMs: now + 60_000,
      cleanupState: "active",
      evidenceSha256: C,
    },
    process: { identitySha256: evidenceSha256, separation: "observed", assuranceEvidenceSha256: C },
    heartbeat: { intervalMs: 1_000, orphanAfterMs: 3_000, lastObservedMonotonicMs: 1, evidenceSha256: C },
    state: "admitted",
    lastTransitionMonotonicMs: 1,
    stateEvidenceSha256: C,
  };
}

function createPool(commit, stateRoot, workerRequests, effective = 5) {
  const count = workerRequests.length;
  const now = Math.floor(uptime() * 1000);
  const allWorkers = [
    worker(A, "lease-a", workerRequests[0].writePaths[0], B, stateRoot, now),
    worker(B, "lease-b", count > 1 ? workerRequests[1].writePaths[0] : "src/b.txt", D, stateRoot, now),
  ].slice(0, count);
  for (const entry of allWorkers) {
    entry.workspaceLease.baseCommit = commit;
    entry.workspaceLease.candidateCommit = commit;
  }
  const admissions = [
    { taskId: "task-a", subjectSha256: A, requestSha256: localWorkerSupervisorWorkerRequestSha256(workerRequests[0]), baseCommit: commit, candidateCommit: commit, writePaths: workerRequests[0].writePaths, state: "admitted" },
    { taskId: "task-b", subjectSha256: B, requestSha256: count > 1 ? localWorkerSupervisorWorkerRequestSha256(workerRequests[1]) : D, baseCommit: commit, candidateCommit: commit, writePaths: count > 1 ? workerRequests[1].writePaths : ["src/b.txt"], state: "admitted" },
  ].slice(0, count);
  return createLocalWorkerPool({
    poolId: "pool-b1i",
    candidate: { repositorySha256: A, baseCommit: commit, candidateCommit: commit },
    queueRevision: 7,
    capacity: capacity(effective),
    workers: allWorkers,
    admissionSet: admissions,
    cleanupOwner: { subjectSha256: A, ownerNonce: "owner-lease-a", evidenceSha256: C },
    serialFallback: false,
  });
}

function createRequest(sourceRoot, stateRoot, commit, options = {}) {
  const count = options.count ?? 2;
  const instructions = ["Edit only src/a.txt.", "Edit only src/b.txt."];
  const workers = [
    { taskId: "task-a", subjectSha256: A, leaseId: "lease-a", writePaths: ["src/a.txt"] },
    { taskId: "task-b", subjectSha256: B, leaseId: "lease-b", writePaths: [options.overlap ? "src/a.txt" : "src/b.txt"] },
  ].slice(0, count).map((entry, index) => ({
    ...entry,
    instruction: instructions[index],
    instructionSha256: localWorkerSupervisorSha256(instructions[index]),
    heartbeatIntervalMs: 1_000,
    orphanAfterMs: 3_000,
  }));
  const dispatch = { dispatchId: options.dispatchId ?? "dispatch-b1i", attempt: 1, queueRevision: 7, packageSha256: null };
  dispatch.packageSha256 = localWorkerSupervisorPackageSha256({ ...dispatch, workers });
  return {
    schema: LOCAL_WORKER_SUPERVISOR_REQUEST_SCHEMA,
    repository: {
      fingerprint: A,
      sourceRoot,
      sourceRootSha256: localWorkerSupervisorSha256(sourceRoot),
      baseCommit: commit,
      candidateCommit: commit,
      candidateSha256: localWorkerSupervisorSha256(commit),
    },
    dispatch,
    supervisor: {
      subject: "nova-b1i",
      ownerNonce: options.ownerNonce ?? "supervisor-owner",
      heartbeatMs: 1_000,
      orphanAfterMs: 3_000,
      cleanupLeaseMs: 60_000,
      recoveryReserve: options.recoveryReserve ?? 1,
    },
    git: { executable: GIT, executableSha256: fileSha256(GIT) },
    pool: createPool(commit, stateRoot, workers, options.effective ?? 5),
    runner: {
      kind: "fixture",
      executable: NODE,
      executableSha256: fileSha256(NODE),
      model: null,
      effort: null,
      timeoutMs: options.timeoutMs ?? 5_000,
      maxOutputBytes: 65_536,
      fixture: {
        delayMs: options.delayMs ?? 1_200,
        exitCode: options.exitCode ?? 0,
        behavior: options.behavior ?? ((options.write ?? true) ? "first-authorized" : "none"),
      },
    },
    workers,
  };
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "pipeline-b1i-"));
  const sourceRoot = join(root, "source");
  const stateBase = join(root, "state");
  mkdirSync(sourceRoot);
  mkdirSync(stateBase);
  git(["init", "-q"], sourceRoot);
  git(["config", "user.email", "fixture@example.invalid"], sourceRoot);
  git(["config", "user.name", "B1-I Fixture"], sourceRoot);
  mkdirSync(join(sourceRoot, "src"));
  writeFileSync(join(sourceRoot, "src", "a.txt"), "a\n", "utf8");
  writeFileSync(join(sourceRoot, "src", "b.txt"), "b\n", "utf8");
  writeFileSync(join(sourceRoot, ".gitignore"), ".pipeline-ignored/\n", "utf8");
  git(["add", ".gitignore", "src/a.txt", "src/b.txt"], sourceRoot);
  git(["commit", "-q", "-m", "fixture"], sourceRoot);
  const commit = git(["rev-parse", "HEAD"], sourceRoot);
  const resolved = resolveLocalSupervisorRoot({
    platform: "linux",
    env: { XDG_STATE_HOME: stateBase },
    repositoryFingerprint: A,
  });
  assert.equal(resolved.ok, true);
  const stateRoot = resolved.root;
  const repaired = repairLocalSupervisorState({
    root: stateRoot,
    repositoryFingerprint: A,
    candidate: localWorkerSupervisorSha256(commit),
    subject: "nova-b1i",
  });
  assert.equal(repaired.ok, true);
  return { root, sourceRoot: realpathSync(sourceRoot), stateBase, stateRoot, commit };
}

function invoke(args, context) {
  const nonce = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const stdoutPath = join(context.root, `cli-${nonce}.stdout`);
  const stderrPath = join(context.root, `cli-${nonce}.stderr`);
  const stdoutDescriptor = openSync(stdoutPath, "wx", 0o600);
  const stderrDescriptor = openSync(stderrPath, "wx", 0o600);
  let result;
  try {
    result = spawnSync(NODE, [CLI, ...args], {
      cwd: context.sourceRoot,
      stdio: ["ignore", stdoutDescriptor, stderrDescriptor],
      timeout: 30_000,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        CODEX_HOME: process.env.CODEX_HOME,
        LANG: process.env.LANG,
        XDG_STATE_HOME: context.stateBase,
      },
    });
  } finally {
    closeSync(stdoutDescriptor);
    closeSync(stderrDescriptor);
  }
  const stdout = readFileSync(stdoutPath, "utf8");
  const stderr = readFileSync(stderrPath, "utf8");
  assert.equal(result.error, undefined);
  assert.equal(stdout.trim().startsWith("{"), true, JSON.stringify({
    status: result.status,
    signal: result.signal,
    error: result.error?.message ?? null,
    stdout,
    stderr,
  }));
  return { ...result, stdout, stderr, json: JSON.parse(stdout) };
}

function invokeAsync(args, context) {
  const nonce = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const stdoutPath = join(context.root, `cli-async-${nonce}.stdout`);
  const stderrPath = join(context.root, `cli-async-${nonce}.stderr`);
  const stdoutDescriptor = openSync(stdoutPath, "wx", 0o600);
  const stderrDescriptor = openSync(stderrPath, "wx", 0o600);
  const child = spawn(NODE, [CLI, ...args], {
    cwd: context.sourceRoot,
    stdio: ["ignore", stdoutDescriptor, stderrDescriptor],
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      CODEX_HOME: process.env.CODEX_HOME,
      LANG: process.env.LANG,
      XDG_STATE_HOME: context.stateBase,
    },
  });
  closeSync(stdoutDescriptor);
  closeSync(stderrDescriptor);
  const completed = new Promise((resolvePromise, rejectPromise) => {
    child.once("error", rejectPromise);
    child.once("close", (status, signal) => {
      const stdout = readFileSync(stdoutPath, "utf8");
      const stderr = readFileSync(stderrPath, "utf8");
      try {
        resolvePromise({ status, signal, stdout, stderr, json: JSON.parse(stdout) });
      } catch (error) {
        rejectPromise(new Error(`invalid async CLI output: ${error.message}; stdout=${stdout}; stderr=${stderr}`));
      }
    });
  });
  return { child, completed };
}

async function waitForRecord(context, predicate, timeoutMs = 10_000) {
  const recordPath = join(context.stateRoot, "supervisor.json");
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(recordPath)) {
      const record = JSON.parse(readFileSync(recordPath, "utf8"));
      if (predicate(record)) return record;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
  }
  throw new Error("record wait timed out");
}

function writeRequest(context, request, name = "request.json") {
  const path = join(context.root, name);
  writeFileSync(path, `${JSON.stringify(request)}\n`, { encoding: "utf8", mode: 0o600 });
  return path;
}

function plan(context, requestPath) {
  const result = invoke(["plan", "--request", requestPath, "--state-root", context.stateRoot], context);
  assert.equal(result.status, 0, result.stdout);
  return result.json;
}

function runWave(context, request, name = "request.json") {
  const requestPath = writeRequest(context, request, name);
  const planned = plan(context, requestPath);
  assert.equal(planned.code, "LWS-PLAN-READY");
  const run = invoke([
    "run",
    "--request", requestPath,
    "--state-root", context.stateRoot,
    "--plan-sha256", planned.plan.planSha256,
    "--activate",
  ], context);
  return { requestPath, planned, run };
}

function startWaveAsync(context, request, name = "request-async.json") {
  const requestPath = writeRequest(context, request, name);
  const planned = plan(context, requestPath);
  assert.equal(planned.code, "LWS-PLAN-READY");
  const active = invokeAsync([
    "run",
    "--request", requestPath,
    "--state-root", context.stateRoot,
    "--plan-sha256", planned.plan.planSha256,
    "--activate",
  ], context);
  return { requestPath, planned, ...active };
}

function cleanup(context, recordSha256) {
  return invoke([
    "cleanup",
    "--state-root", context.stateRoot,
    "--record-sha256", recordSha256,
    "--activate",
  ], context);
}

let passed = 0;
async function check(name, fn) {
  await fn();
  passed += 1;
  console.log(`PASS LWSC${String(passed).padStart(2, "0")} ${name}`);
}

await check("plans and runs two overlapping real child processes in separate no-hardlink Git clones", () => {
  const context = fixture();
  try {
    const { run } = runWave(context, createRequest(context.sourceRoot, context.stateRoot, context.commit));
    assert.equal(run.status, 0, run.stdout);
    assert.equal(run.json.code, "LWS-COMPLETED");
    assert.equal(run.json.record.workers.length, 2);
    const starts = run.json.record.workers.map((entry) => entry.startedMonotonicMs);
    const ends = run.json.record.workers.map((entry) => entry.completedMonotonicMs);
    assert.equal(Math.max(...starts) < Math.min(...ends), true, "workers did not overlap");
    assert.equal(new Set(run.json.record.workers.map((entry) => entry.process.pid)).size, 2);
    assert.equal(run.json.record.lease.lastHeartbeatMonotonicMs > Math.min(...starts), true);
    const objectId = git(["rev-parse", `${context.commit}^{tree}`], context.sourceRoot);
    const sourceObject = statSync(join(context.sourceRoot, ".git", "objects", objectId.slice(0, 2), objectId.slice(2)));
    for (const workerRecord of run.json.record.workers) {
      const workspace = join(context.stateRoot, "workspaces", workerRecord.workspaceMember);
      assert.equal(existsSync(workspace), true);
      assert.equal(existsSync(join(workspace, ".git", "objects")), true);
      const cloneObject = statSync(join(workspace, ".git", "objects", objectId.slice(0, 2), objectId.slice(2)));
      assert.equal(sourceObject.dev === cloneObject.dev && sourceObject.ino === cloneObject.ino, false, "clone object was hardlinked");
      assert.equal(workerRecord.result.status, "completed");
      assert.equal(workerRecord.result.changed.length, 1);
      assert.notEqual(
        workerRecord.result.stdoutSha256,
        localWorkerSupervisorSha256(Buffer.alloc(0)),
        `${workerRecord.taskId} produced empty captured stdout`,
      );
    }
    assert.equal(git(["status", "--porcelain"], context.sourceRoot), "");
    assert.equal(readFileSync(join(context.sourceRoot, "src", "a.txt"), "utf8"), "a\n");
    const inspected = invoke(["inspect", "--state-root", context.stateRoot], context);
    assert.equal(inspected.json.disposition, "cleanup-pending");
    const cleaned = cleanup(context, run.json.record.recordSha256);
    assert.equal(cleaned.status, 0, cleaned.stdout);
    assert.equal(cleaned.json.code, "LWS-CLEANED");
    assert.equal(cleaned.json.record.workers.every((entry) => entry.cleanupState === "cleaned"), true);
    assert.equal(existsSync(join(context.stateRoot, "workspaces", "lease-a")), false);
    assert.equal(existsSync(join(context.stateRoot, "workspaces", "lease-b")), false);
    assert.equal(existsSync(join(context.stateRoot, "supervisor.json")), false);
    const second = runWave(context, createRequest(context.sourceRoot, context.stateRoot, context.commit, {
      count: 1,
      dispatchId: "dispatch-b1i-second",
      delayMs: 200,
    }), "request-second.json");
    assert.equal(second.run.status, 0, second.run.stdout);
    assert.equal(second.run.json.code, "LWS-COMPLETED");
    assert.equal(cleanup(context, second.run.json.record.recordSha256).status, 0);
  } finally {
    rmSync(context.root, { recursive: true, force: true });
  }
});

await check("returns serial-fallback-required before creating a workspace when recovery reserve is exhausted", () => {
  const context = fixture();
  try {
    const request = createRequest(context.sourceRoot, context.stateRoot, context.commit, { recoveryReserve: 4 });
    const requestPath = writeRequest(context, request);
    const planned = plan(context, requestPath);
    assert.equal(planned.code, "LWS-SERIAL-FALLBACK-REQUIRED");
    assert.equal(planned.plan.status, "serial-fallback-required");
    assert.equal(existsSync(join(context.stateRoot, "workspaces")), false);
    const overlap = createRequest(context.sourceRoot, context.stateRoot, context.commit, {
      overlap: true,
      dispatchId: "dispatch-overlap",
    });
    const overlapPlan = plan(context, writeRequest(context, overlap, "request-overlap.json"));
    assert.equal(overlapPlan.code, "LWS-SERIAL-FALLBACK-REQUIRED");
    assert.match(overlapPlan.plan.planSha256, /^[a-f0-9]{64}$/u);
  } finally {
    rmSync(context.root, { recursive: true, force: true });
  }
});

await check("times out and signals only the exact observed child, then permits exact cleanup", () => {
  const context = fixture();
  try {
    const request = createRequest(context.sourceRoot, context.stateRoot, context.commit, { count: 1, delayMs: 2_000, timeoutMs: 200, write: false });
    const { run } = runWave(context, request);
    assert.equal(run.status, 2);
    assert.equal(run.json.code, "LWS-CANCELLED");
    assert.equal(run.json.record.workers[0].state, "timed-out");
    assert.equal(run.json.record.workers[0].result.status, "timed-out");
    const cleaned = cleanup(context, run.json.record.recordSha256);
    assert.equal(cleaned.status, 0, cleaned.stdout);
    assert.equal(cleaned.json.code, "LWS-CLEANED");
  } finally {
    rmSync(context.root, { recursive: true, force: true });
  }
});

await check("accepts an exact cancellation intent, drains the owned child, and permits cleanup", async () => {
  const context = fixture();
  try {
    const request = createRequest(context.sourceRoot, context.stateRoot, context.commit, {
      count: 1,
      delayMs: 5_000,
      behavior: "none",
      dispatchId: "dispatch-cancel",
    });
    const active = startWaveAsync(context, request);
    const running = await waitForRecord(context, (record) => record.status === "running");
    const wrong = invoke([
      "cancel",
      "--state-root", context.stateRoot,
      "--record-sha256", A,
      "--activate",
    ], context);
    assert.equal(wrong.status, 2);
    assert.equal(wrong.json.code, "LWS-CANCEL-DENIED");
    const cancelled = invoke([
      "cancel",
      "--state-root", context.stateRoot,
      "--record-sha256", running.recordSha256,
      "--activate",
    ], context);
    assert.equal(cancelled.status, 0, cancelled.stdout);
    assert.equal(cancelled.json.code, "LWS-CANCEL-REQUESTED");
    assert.equal(cancelled.json.intent.recordSha256, running.recordSha256);
    const completed = await active.completed;
    assert.equal(completed.status, 2, completed.stdout);
    assert.equal(completed.json.code, "LWS-CANCELLED");
    assert.equal(completed.json.record.workers[0].state, "cancelled");
    assert.equal(cleanup(context, completed.json.record.recordSha256).status, 0);
  } finally {
    rmSync(context.root, { recursive: true, force: true });
  }
});

await check("keeps a failed real child attributable and does not convert nonzero exit into success", () => {
  const context = fixture();
  try {
    const request = createRequest(context.sourceRoot, context.stateRoot, context.commit, { count: 1, delayMs: 200, exitCode: 7, write: false });
    const { run } = runWave(context, request);
    assert.equal(run.status, 2);
    assert.equal(run.json.code, "LWS-DEGRADED");
    assert.equal(run.json.record.workers[0].state, "failed");
    assert.equal(run.json.record.workers[0].result.exitCode, 7);
    const expired = cleanupLocalWorkerSupervisor({
      stateRoot: context.stateRoot,
      expectedRecordSha256: run.json.record.recordSha256,
      activate: true,
      nowMonotonicMs: run.json.record.lease.cleanupExpiresMonotonicMs,
    });
    assert.equal(expired.code, "LWS-CLEANUP-DENIED");
    const cleaned = cleanup(context, run.json.record.recordSha256);
    assert.equal(cleaned.status, 0, cleaned.stdout);
  } finally {
    rmSync(context.root, { recursive: true, force: true });
  }
});

await check("classifies an ignored unauthorized write and source-checkout drift as recovery-required", async () => {
  const unauthorized = fixture();
  try {
    const request = createRequest(unauthorized.sourceRoot, unauthorized.stateRoot, unauthorized.commit, {
      count: 1,
      delayMs: 200,
      behavior: "ignored-unauthorized",
      dispatchId: "dispatch-ignored-write",
    });
    const { run } = runWave(unauthorized, request);
    assert.equal(run.status, 2);
    assert.equal(run.json.code, "LWS-RECOVERY-REQUIRED");
    assert.equal(run.json.record.workers[0].state, "recovery-required");
    assert.equal(run.json.record.workers[0].result.changed.length, 0);
  } finally {
    rmSync(unauthorized.root, { recursive: true, force: true });
  }

  const drifted = fixture();
  try {
    const request = createRequest(drifted.sourceRoot, drifted.stateRoot, drifted.commit, {
      count: 1,
      delayMs: 1_200,
      behavior: "none",
      dispatchId: "dispatch-source-drift",
    });
    const active = startWaveAsync(drifted, request);
    await waitForRecord(drifted, (record) => record.status === "running");
    writeFileSync(join(drifted.sourceRoot, "operator-drift.txt"), "drift\n", { encoding: "utf8", mode: 0o600 });
    const completed = await active.completed;
    assert.equal(completed.status, 2);
    assert.equal(completed.json.code, "LWS-RECOVERY-REQUIRED");
    assert.equal(completed.json.record.workers[0].result.status, "recovery-required");
  } finally {
    rmSync(drifted.root, { recursive: true, force: true });
  }
});

await check("reports a killed supervisor with a still-attributable worker as recovery-required", async () => {
  const context = fixture();
  try {
    const request = createRequest(context.sourceRoot, context.stateRoot, context.commit, {
      count: 1,
      delayMs: 30_000,
      behavior: "none",
      dispatchId: "dispatch-owner-crash",
    });
    const active = startWaveAsync(context, request);
    const running = await waitForRecord(context, (record) => record.status === "running");
    const ownerCompletion = active.completed.catch(() => null);
    assert.equal(active.child.kill("SIGKILL"), true);
    await ownerCompletion;
    const inspected = invoke(["inspect", "--state-root", context.stateRoot], context);
    assert.equal(inspected.status, 2);
    assert.equal(inspected.json.code, "LWS-RECOVERY-REQUIRED");
    assert.equal(inspected.json.disposition, "recovery-required");
    const identity = running.workers[0].process;
    const observed = readLocalWorkerProcessIdentity(identity.pid, identity.nonce);
    assert.equal(observed.ok, true);
    assert.deepEqual(observed.identity, identity);
    process.kill(identity.pid, "SIGTERM");
  } finally {
    rmSync(context.root, { recursive: true, force: true });
  }
});

await check("admits only one of two concurrent starts for the same exact plan", async () => {
  const context = fixture();
  try {
    const request = createRequest(context.sourceRoot, context.stateRoot, context.commit, {
      count: 1,
      delayMs: 1_200,
      dispatchId: "dispatch-concurrent-start",
    });
    const requestPath = writeRequest(context, request, "request-concurrent.json");
    const planned = plan(context, requestPath);
    const args = [
      "run",
      "--request", requestPath,
      "--state-root", context.stateRoot,
      "--plan-sha256", planned.plan.planSha256,
      "--activate",
    ];
    const first = invokeAsync(args, context);
    const second = invokeAsync(args, context);
    const completed = await Promise.all([first.completed, second.completed]);
    const winner = completed.find((entry) => entry.json.code === "LWS-COMPLETED");
    const denied = completed.find((entry) => ["LWS-BUSY", "LWS-RECORD-EXISTS"].includes(entry.json.code));
    assert.equal(winner?.status, 0);
    assert.equal(denied?.status, 2);
    assert.equal(cleanup(context, winner.json.record.recordSha256).status, 0);
  } finally {
    rmSync(context.root, { recursive: true, force: true });
  }
});

await check("denies replayed cleanup and foreign workspace marker without broad deletion", () => {
  const context = fixture();
  try {
    const request = createRequest(context.sourceRoot, context.stateRoot, context.commit, { count: 1, delayMs: 200 });
    const { run } = runWave(context, request);
    assert.equal(run.status, 0, run.stdout);
    const markerPath = join(context.stateRoot, "workspaces", "lease-a", ".git", "pipeline-local-worker-owner.json");
    const marker = JSON.parse(readFileSync(markerPath, "utf8"));
    marker.ownerNonce = "foreign-owner";
    writeFileSync(markerPath, `${JSON.stringify(marker)}\n`, "utf8");
    const denied = cleanup(context, run.json.record.recordSha256);
    assert.equal(denied.status, 2);
    assert.equal(denied.json.code, "LWS-CLEANUP-DENIED");
    assert.equal(existsSync(join(context.stateRoot, "workspaces", "lease-a")), true);
    const replay = cleanup(context, run.json.record.recordSha256);
    assert.equal(replay.status, 2);
    assert.equal(replay.json.code, "LWS-CLEANUP-DENIED");
  } finally {
    rmSync(context.root, { recursive: true, force: true });
  }
});

console.log(`${passed}/9 checks passed.`);
