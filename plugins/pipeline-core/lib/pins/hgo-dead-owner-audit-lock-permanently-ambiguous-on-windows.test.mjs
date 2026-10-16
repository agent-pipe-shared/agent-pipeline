#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
//
// ALF-C-P8-04 / AC-200 regression pin for
// pipeline.hgo-dead-owner-audit-lock-permanently-ambiguous-on-windows.
//
// Original acceptance (backlog/items/2026-10-09-a-dead-owner-audit-lock-is-permanently-
// ambiguous-on-windows.md, "Correction and acceptance"):
//   P1 On win32 owner liveness comes from a platform-native process query (pid + start
//      identity); it fails closed only when the query fails or the identity does not match.
//   P2 A dead owner becomes recoverable through the existing closed recovery path.
//   P3 A live owner, a reused pid with a different start time, or an unverifiable owner
//      stays "ambiguous".
//   P4 Regression: win32-shaped fixture for dead / live / reused pid; a Linux control is
//      unchanged.
//   P5 If the lock blocks, the refusal names the attended recovery command, not opaque.
//
// Everything goes through the real module (acquireAuditLock / auditLockOwnerState /
// humanGuardRouteUnavailableReason) using its documented `auditLockHost` injection seam.
// Fixtures live under the repository's scratch/ directory.

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  HumanGuardOverrideError,
  humanGuardOverrideInternals,
  humanGuardRouteUnavailableReason,
} from "../human-guard-override.mjs";
import { hardenWindowsPrivateDirectory } from "../windows-private-state.mjs";

const { acquireAuditLock, releaseOwnedAuditLock, auditLockOwnerState } = humanGuardOverrideInternals;
const canonicalJson = humanGuardOverrideInternals.canonical;

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const SCRATCH = join(REPO_ROOT, "scratch");
const SECRET = Buffer.alloc(32, 0x5a);
const AMBIGUOUS = "HGO-AUDIT-LOCK-AMBIGUOUS";
const HOSTNAME = "ac200-win-host";
const NOW_MS = 1_800_000_030_000;
const UPTIME_S = 7_200;
const GONE_PID = 4_194_001;
const START_A = "win32-133800000000000000";
const START_B = "win32-133800000000000999";

// Typed host limitation (PO decision K7): the Linux control needs /proc and POSIX mode bits.
const LINUX_CONTROL_SKIP = process.platform === "linux"
  ? false
  : "host-limitation: the Linux control needs a Linux /proc host; owner Coordinator, due 2026-10-19 (Linux/WSL run, PO decision K7)";

const present = (pid, processStart = START_A) => ({ status: "present", pid, processStart });
const absent = (pid) => ({ status: "absent", pid });

function winHost(overrides = {}) {
  return {
    platform: "win32",
    hostname: HOSTNAME,
    nowMs: NOW_MS,
    uptimeSeconds: UPTIME_S,
    pidAlive: () => true,
    processIdentity: (pid) => present(pid),
    ...overrides,
  };
}
const seamed = (overrides) => ({ auditLockHost: winHost(overrides) });

function sandbox({ gitLayout = false } = {}) {
  mkdirSync(SCRATCH, { recursive: true });
  const root = mkdtempSync(join(SCRATCH, "ac200-"));
  const store = gitLayout ? join(root, ".git", "agent-pipeline", "human-guard-overrides") : root;
  mkdirSync(store, { recursive: true });
  if (process.platform === "win32") {
    assert.equal(hardenWindowsPrivateDirectory(store).status, "secure",
      "precondition: the sandbox directory must be owner-private");
  }
  return {
    paths: { auditLock: join(store, "audit.lock"), auditLockRecovery: join(store, "audit.lock.recover") },
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

// Publish a real lock (so the file carries the private DACL), then rewrite its owner with a valid MAC.
function plantLock(box, ownerPatch, dependencies = seamed()) {
  const live = acquireAuditLock(box.paths, SECRET, { ...dependencies, purpose: "existing" });
  const core = { schema: live.record.schema, purpose: "existing", owner: { ...live.record.owner, ...ownerPatch } };
  const record = { ...core, mac: createHmac("sha256", SECRET).update(canonicalJson(core)).digest("hex") };
  writeFileSync(box.paths.auditLock, `${JSON.stringify(record)}\n`);
  return live.record.owner;
}

function attempt(box, dependencies) {
  try {
    const lock = acquireAuditLock(box.paths, SECRET, dependencies);
    return { ok: true, lock, recovered: lock.recovered === true };
  } catch (error) {
    return { ok: false, code: error?.code, error };
  }
}

function expectReclaimed(box, label, dependencies) {
  const result = attempt(box, dependencies);
  try {
    assert.equal(result.ok && result.recovered, true,
      `${label}: expected reclaim, got ${result.ok ? "plain acquire" : result.code}`);
  } finally { if (result.ok) releaseOwnedAuditLock(result.lock); }
}

function expectAmbiguous(box, label, dependencies) {
  const result = attempt(box, dependencies);
  try {
    assert.equal(result.ok, false, `${label}: expected ${AMBIGUOUS}, but the lock was acquired`);
    assert.ok(result.error instanceof HumanGuardOverrideError, `${label}: typed error expected`);
    assert.equal(result.code, AMBIGUOUS, `${label}: expected ${AMBIGUOUS}, got ${result.code}`);
    assert.equal(existsSync(box.paths.auditLock), true, `${label}: an ambiguous lock must stay in place`);
  } finally { if (result.ok) releaseOwnedAuditLock(result.lock); }
  return result;
}

function deadPid() {
  for (let tries = 0; tries < 5; tries += 1) {
    const child = spawnSync(process.execPath, ["-e", "0"], { shell: false, stdio: "ignore" });
    try { process.kill(child.pid, 0); }
    catch (error) { if (error?.code === "ESRCH") return child.pid; throw error; }
  }
  return assert.fail("could not obtain a verifiably dead pid");
}

// A record as a win32 writer would have left it, for the pure owner-state function.
const ownerRecord = (patch = {}) => ({
  owner: { platform: "win32", hostId: HOSTNAME, bootId: "1", pid: GONE_PID, processStart: START_A, nonce: "0".repeat(32), ...patch },
});

// P1 + P2 ------------------------------------------------------------------------------
test("AC-200 P2: win32 dead owner (pid probe says gone) is reclaimed through the closed recovery path", () => {
  const box = sandbox();
  try {
    plantLock(box, { pid: GONE_PID, processStart: START_A });
    expectReclaimed(box, "pid gone", seamed({ pidAlive: () => false }));
  } finally { box.cleanup(); }
});

test("AC-200 P1/P2: win32 owner whose native identity query says absent is dead and reclaimed", () => {
  const box = sandbox();
  try {
    plantLock(box, { pid: GONE_PID, processStart: START_A });
    const queried = [];
    expectReclaimed(box, "identity absent", seamed({
      pidAlive: () => true,
      processIdentity: (pid) => { queried.push(pid); return pid === GONE_PID ? absent(pid) : present(pid); },
    }));
    assert.ok(queried.includes(GONE_PID), "the native query must be asked about the recorded owner pid");
  } finally { box.cleanup(); }
});

test("AC-200 P1: the lock a win32 writer publishes records the pid start identity from the native query", () => {
  const box = sandbox();
  try {
    const lock = acquireAuditLock(box.paths, SECRET, seamed({ processIdentity: (pid) => present(pid, START_B) }));
    try {
      assert.equal(lock.record.owner.platform, "win32");
      assert.equal(lock.record.owner.pid, process.pid);
      assert.equal(lock.record.owner.processStart, START_B);
    } finally { releaseOwnedAuditLock(lock); }
  } finally { box.cleanup(); }
});

test("AC-200 P1: a failed query at publish time records no fabricated identity", () => {
  const box = sandbox();
  try {
    const lock = acquireAuditLock(box.paths, SECRET, seamed({ processIdentity: () => { throw new Error("query broken"); } }));
    try { assert.equal(lock.record.owner.processStart, "unavailable"); } finally { releaseOwnedAuditLock(lock); }
  } finally { box.cleanup(); }
});

// P3 ------------------------------------------------------------------------------------
test("AC-200 P3: win32 live owner with matching start identity stays ambiguous (never reclaimed)", () => {
  const box = sandbox();
  try {
    plantLock(box, { pid: process.pid, processStart: START_A });
    expectAmbiguous(box, "live owner", seamed({ pidAlive: () => true, processIdentity: (pid) => present(pid, START_A) }));
  } finally { box.cleanup(); }
});

test("AC-200 P3: a pid reused with a different start time stays ambiguous (never reclaimed)", () => {
  const box = sandbox();
  try {
    plantLock(box, { pid: process.pid, processStart: START_A });
    expectAmbiguous(box, "reused pid", seamed({ pidAlive: () => true, processIdentity: (pid) => present(pid, START_B) }));
  } finally { box.cleanup(); }
});

test("AC-200 P3: an unverifiable win32 owner stays ambiguous for every failure shape of the query", () => {
  const shapes = [
    ["identity query throws", { processIdentity: () => { throw new Error("denied"); } }],
    ["identity for a different pid", { processIdentity: (pid) => present(pid + 1) }],
    ["malformed start identity", { processIdentity: (pid) => present(pid, "not-a-win32-start") }],
    ["extra keys on absent", { processIdentity: (pid) => ({ ...absent(pid), extra: 1 }) }],
    ["null result", { processIdentity: () => null }],
    ["unknown status", { processIdentity: (pid) => ({ status: "unknown", pid }) }],
    ["pid probe throws", { pidAlive: () => { throw new Error("denied"); } }],
    ["pid probe returns a non-boolean", { pidAlive: () => "maybe" }],
  ];
  for (const [label, overrides] of shapes) {
    const box = sandbox();
    try {
      plantLock(box, { pid: GONE_PID, processStart: START_A });
      expectAmbiguous(box, label, seamed(overrides));
    } finally { box.cleanup(); }
  }
});

test("AC-200 P3: owner state function: dead / live / reused / foreign host / foreign platform", () => {
  const host = (overrides) => resolveHost(overrides);
  assert.equal(auditLockOwnerState(ownerRecord(), host({ pidAlive: () => false })), "dead");
  assert.equal(auditLockOwnerState(ownerRecord(), host({ processIdentity: (p) => absent(p) })), "dead");
  assert.equal(auditLockOwnerState(ownerRecord(), host({ processIdentity: (p) => present(p, START_A) })), "ambiguous");
  assert.equal(auditLockOwnerState(ownerRecord(), host({ processIdentity: (p) => present(p, START_B) })), "ambiguous");
  assert.equal(auditLockOwnerState(ownerRecord({ hostId: "someone-else" }), host({ pidAlive: () => false })), "ambiguous");
  assert.equal(auditLockOwnerState(ownerRecord({ platform: "linux" }), host({ pidAlive: () => false })), "ambiguous");
});

function resolveHost(overrides) {
  return humanGuardOverrideInternals.resolveAuditLockHost(winHost(overrides));
}

// P4 Linux control ------------------------------------------------------------------------
test("AC-200 P4: Linux control is unchanged (dead owner reclaimed, live owner refused as locked)", { skip: LINUX_CONTROL_SKIP }, () => {
  const dead = sandbox();
  try {
    const first = acquireAuditLock(dead.paths, SECRET, { purpose: "existing" });
    const core = { schema: first.record.schema, purpose: "existing", owner: { ...first.record.owner, pid: deadPid() } };
    const record = { ...core, mac: createHmac("sha256", SECRET).update(canonicalJson(core)).digest("hex") };
    writeFileSync(dead.paths.auditLock, `${JSON.stringify(record)}\n`);
    expectReclaimed(dead, "linux dead owner", {});
  } finally { dead.cleanup(); }
  const live = sandbox();
  try {
    const held = acquireAuditLock(live.paths, SECRET, { purpose: "existing" });
    try {
      const result = attempt(live, {});
      assert.equal(result.ok, false);
      assert.equal(result.code, "HGO-AUDIT-LOCKED");
    } finally { releaseOwnedAuditLock(held); }
  } finally { live.cleanup(); }
});

// P5 --------------------------------------------------------------------------------------
test("AC-200 P5: an ambiguous refusal names the attended recovery file and command, and the route text renders it", () => {
  const box = sandbox({ gitLayout: true });
  try {
    plantLock(box, { pid: process.pid, processStart: START_A });
    const result = expectAmbiguous(box, "reused pid under .git", seamed({ processIdentity: (pid) => present(pid, START_B) }));
    const { recovery } = result.error;
    assert.deepEqual(Object.keys(recovery).sort(), ["command", "files"]);
    assert.deepEqual(recovery.files, [".git/agent-pipeline/human-guard-overrides/audit.lock"]);
    assert.ok(typeof recovery.command === "string" && recovery.command.includes("audit.lock"));
    const rendered = humanGuardRouteUnavailableReason("command", { error: result.error }, { platform: "win32" });
    assert.ok(rendered.split("\n").length === 3, "the route text must carry the recovery as a third line");
    assert.ok(rendered.includes("audit.lock"), "the recovery line must name the lock file");
  } finally { box.cleanup(); }
});

test("AC-200 P5: a foreign-host owner stays ambiguous regardless of pid state", () => {
  const box = sandbox();
  try {
    plantLock(box, { hostId: "other-host-ac200", pid: deadPid() });
    expectAmbiguous(box, "foreign host", seamed({ pidAlive: () => false }));
  } finally { box.cleanup(); }
});

test("AC-200 real host: native win32 default query classifies a gone pid dead and this live process ambiguous", { skip: process.platform === "win32" ? false : "host-limitation: native win32 only; owner Coordinator, due 2026-10-19 (Linux/WSL run does not apply)" }, () => {
  const dead = sandbox();
  try {
    plantLock(dead, { pid: deadPid() }, {});
    expectReclaimed(dead, "real host dead pid", {});
  } finally { dead.cleanup(); }
  const live = sandbox();
  try {
    plantLock(live, { pid: process.pid }, {});
    expectAmbiguous(live, "real host live pid", {});
  } finally { live.cleanup(); }
});
