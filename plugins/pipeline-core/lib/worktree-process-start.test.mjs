#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
//
// PROCSTART-T: pin the Linux process start-ticks parsing of worktree-lifecycle.mjs for a process whose comm contains
// spaces and parentheses. /proc/<pid>/stat prints the comm verbatim between parentheses, so a whitespace split of the
// whole line shifts every later field; the kernel starttime (field 22) is only found by splitting AFTER the final ")".
// The parser (`linuxProcessStartTicks`) is not exported, so it is observed through its two exported call routes:
//   - localProcessStartIdentity: startSessionDescriptor / loadSessionDescriptor / inspectSessionOwnerRuntime;
//   - processStartIdentity: cleanupSession over an active verify-run lock (processIdentityAlive).
// Linux-only: the identity is read from /proc. On win32 run this file under WSL.

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { GIT_NULL_DEVICE } from "./git-null-device.mjs";
import {
  SESSION_OWNER_RUNTIME_SCHEMA,
  cleanupSession,
  discoverRepository,
  inspectSessionOwnerRuntime,
  loadSessionDescriptor,
  registerTemporaryIntent,
  startSessionDescriptor,
} from "./worktree-lifecycle.mjs";

const SKIP = process.platform === "linux"
  ? false
  : "linux-only: the process start identity is read from /proc/<pid>/stat; on win32 run this file under WSL";

// A real comm with two spaces and a parenthesised word: the stat line reads `<pid> (a (b) c) S ...`.
const SPACED_COMM = "a (b) c";

const roots = [];
const children = [];

test.after(() => {
  for (const child of children) {
    try { child.kill("SIGKILL"); } catch { /* the sleeper already exited */ }
  }
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function privateTempDir(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  chmodSync(dir, 0o700);
  roots.push(dir);
  return dir;
}

function pause(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function git(cwd, args) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    shell: false,
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: GIT_NULL_DEVICE, LC_ALL: "C" },
  });
  if (result.error || result.status !== 0) {
    throw result.error || new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result;
}

function repoFixture() {
  const primary = join(privateTempDir("worktree-process-start-repo-"), "repo");
  mkdirSync(primary);
  git(primary, ["init", "--initial-branch=main"]);
  writeFileSync(join(primary, "README.md"), "fixture\n");
  git(primary, ["add", "README.md"]);
  git(primary, ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "fixture"]);
  return primary;
}

/** A long-lived real process whose kernel comm is SPACED_COMM: a symlink of that name onto the sleep binary. */
function spawnSpacedCommProcess(linkDir) {
  const link = join(linkDir, SPACED_COMM);
  if (!existsSync(link)) {
    const target = ["/bin/sleep", "/usr/bin/sleep"].find((candidate) => existsSync(candidate));
    assert(target, "no sleep binary found at /bin/sleep or /usr/bin/sleep");
    symlinkSync(target, link);
  }
  const child = spawn(link, ["60"], { stdio: "ignore" });
  child.on("error", () => {});
  child.unref();
  children.push(child);
  assert(Number.isSafeInteger(child.pid) && child.pid > 0, "the spaced-name process did not start");
  // libuv returns from spawn only after the exec succeeded, so the comm is already final; the bounded poll is insurance.
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (readFileSync(`/proc/${child.pid}/comm`, "utf8").trim() === SPACED_COMM) break;
    pause(20);
  }
  assert.equal(readFileSync(`/proc/${child.pid}/comm`, "utf8").trim(), SPACED_COMM);
  return child;
}

/** Kernel starttime (field 22) of a live process, read independently of the code under test. */
function observeKernelStartTicks(pid) {
  const stat = readFileSync(`/proc/${pid}/stat`, "utf8").trim();
  assert(stat.startsWith(`${pid} (${SPACED_COMM}) `), `unexpected stat head: ${stat.slice(0, 40)}`);
  const match = /^\d+ \(.*\) [A-Za-z] (.*)$/su.exec(stat);
  assert(match, "stat line has no `) <state> ` boundary");
  // The captured tail starts at kernel field 4, so field 22 is index 18.
  const ticks = match[1].split(" ")[18];
  assert.match(ticks, /^\d+$/u);
  // The fixture must bite: a whitespace split of the whole line (the pre-fix reading) lands on another field.
  const naive = stat.split(" ")[21];
  assert.notEqual(naive, ticks, "a whitespace split of this stat line must NOT yield the kernel starttime");
  return ticks;
}

/** Two spaced-comm processes whose kernel start identities differ. */
function twoDistinctStartIdentities(linkDir) {
  const first = spawnSpacedCommProcess(linkDir);
  const firstTicks = observeKernelStartTicks(first.pid);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    pause(30);
    const second = spawnSpacedCommProcess(linkDir);
    const secondTicks = observeKernelStartTicks(second.pid);
    if (secondTicks !== firstTicks) return { first, firstTicks, second, secondTicks };
    second.kill("SIGKILL");
  }
  throw new Error("could not start two spaced-name processes with distinct start ticks");
}

test("PROCSTART-T-1 a session descriptor records and re-reads the exact kernel starttime of a spaced, parenthesised comm", { skip: SKIP }, () => {
  const linkDir = privateTempDir("worktree-process-start-link-");
  const owner = spawnSpacedCommProcess(linkDir);
  const expected = observeKernelStartTicks(owner.pid);
  const primary = repoFixture();
  const started = startSessionDescriptor(primary, {
    sessionId: "session-procstart-descriptor",
    ownerNonce: "owner-nonce-procstart-000001",
    ownerPid: owner.pid,
  });
  const loaded = loadSessionDescriptor(primary, started.sessionId);
  assert.deepEqual(loaded.ownerRuntime, {
    schema: SESSION_OWNER_RUNTIME_SCHEMA,
    pid: owner.pid,
    processStartId: expected,
  });
  // The inspection re-reads the live process through the same parser; a stable "live" needs the same exact identity.
  assert.equal(inspectSessionOwnerRuntime(primary, started.sessionId).status, "live");
});

test("PROCSTART-T-2 an active verify-run lock bound to a spaced-comm process is a live writer, and another spaced process's identity is stale", { skip: SKIP }, () => {
  const linkDir = privateTempDir("worktree-process-start-link-");
  const { first, firstTicks, secondTicks } = twoDistinctStartIdentities(linkDir);
  assert.notEqual(firstTicks, secondTicks);
  const primary = repoFixture();
  const session = startSessionDescriptor(primary, {
    sessionId: "session-procstart-lock",
    ownerNonce: "owner-nonce-procstart-000002",
  });
  const repo = discoverRepository(primary);
  const runId = "verify-procstart-run";
  const runPath = join(repo.commonDir, "agent-pipeline", "verify", "runs", runId);
  registerTemporaryIntent(primary, {
    sessionId: session.sessionId,
    ownerNonce: session.ownerNonce,
    resourceId: "verify-procstart-resource",
    type: "verify-run-directory",
    path: runPath,
    contentClass: "verify-recovery",
    soleCopy: false,
    cleanupPolicy: "remove-directory",
  });
  mkdirSync(runPath, { mode: 0o700 });
  const lockPath = join(runPath, "run.lock");
  const activeLock = (pid, processStartId) => `${JSON.stringify({
    schema: "pipeline.verify-run-lock.v1",
    runId,
    pid,
    processStartId,
    owner: "current-os-user",
    status: "active",
    closedAt: null,
  })}\n`;

  // The exact recorded identity of a live spaced-comm writer must be recognised: cleanup refuses to retire its run.
  writeFileSync(lockPath, activeLock(first.pid, firstTicks), { mode: 0o600 });
  const live = cleanupSession(primary, session);
  assert.equal(live.ok, false);
  assert.equal(live.receipt.outcomes[0].code, "WT-VERIFY-RUN-ACTIVE");
  assert.equal(existsSync(runPath), true);

  // The same PID bound to the start identity of a DIFFERENT spaced-comm process is a reused PID, not the writer.
  writeFileSync(lockPath, activeLock(first.pid, secondTicks), { mode: 0o600 });
  const reused = cleanupSession(primary, session);
  assert.equal(reused.ok, true);
  assert.equal(existsSync(runPath), false);
});
