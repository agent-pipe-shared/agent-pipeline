// SPDX-License-Identifier: SUL-1.0
// K12: every taker of the session-authority registry lock waits a short, bounded time for a live holder and then
// fails typed (SDC-LOCK-HELD naming the holder, the wait spent and the retry command); a holder that is provably
// gone is not waited on; and retired-lock directories are bounded in number (newest N kept for forensics).
import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { devNull, hostname } from "node:os";
import { join } from "node:path";
import { observeLinuxProcess } from "./native-platform-process-observer.mjs";
import { createSessionAuthorityParticipantPorts } from "./session-authority-observers.mjs";
import * as registry from "./session-authority-registry.mjs";
import { inspectSignedDescriptorCustodyRepository } from "./worktree-lifecycle.mjs";
import { createGovernanceScopeController } from "./governance-scope.mjs";
import { nativeContractFixtureParent, prepareApprovedItemCourseFixture } from "./test-item-approved-course-fixture.mjs";

const { initializeSessionAuthorityRegistry, withSessionAuthorityBoundary } = registry;
const sha = (text) => createHash("sha256").update(text).digest("hex");

function fixture(run) {
  const parent = nativeContractFixtureParent();
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  const root = mkdtempSync(join(parent, "session-authority-lock-wait-"));
  try {
    mkdirSync(join(root, "evidence"), { mode: 0o700 });
    assert.equal(spawnSync("git", ["init", "-q", root]).status, 0);
    for (const [name, value] of [["user.name", "Fixture"], ["user.email", "fixture@example.invalid"], ["commit.gpgsign", "false"], ["core.hooksPath", devNull]]) assert.equal(spawnSync("git", ["-C", root, "config", name, value]).status, 0);
    assert.equal(spawnSync("git", ["-C", root, "commit", "--allow-empty", "-q", "-m", "fixture"]).status, 0);
    const controller = createGovernanceScopeController({ hostStateRoot: join(root, "fixture-host") });
    const plan = controller.planDecision({ rootDir: root, decision: "enroll", by: "fixture explicit course" });
    assert.equal(controller.applyDecision(plan, { activate: true, planSha256: plan.planSha256 }).state, "active");
    prepareApprovedItemCourseFixture({ root });
    const repository = inspectSignedDescriptorCustodyRepository(root);
    assert.equal(initializeSessionAuthorityRegistry({ repository }, createSessionAuthorityParticipantPorts({ repository })).status, "initialized");
    return run({ root, repository });
  } finally { rmSync(root, { recursive: true, force: true }); }
}

const lockPathOf = (repository) => join(repository.commonDir, "agent-pipeline/session-authority/registry.lock");
const abandonedOf = (repository) => join(repository.commonDir, "agent-pipeline/session-authority-abandoned");
const own = () => observeLinuxProcess(process.pid);
function writeLiveLock(repository) {
  const owner = { pid: process.pid, hostSha256: sha(hostname()), process: { start: own().start, bootSha256: own().bootSha256 }, acquiredAt: new Date().toISOString() };
  writeFileSync(lockPathOf(repository), JSON.stringify({ schema: "pipeline.session-authority-lock.v2", repositorySha256: "a".repeat(64), nonce: "d".repeat(64), owner }), { mode: 0o600, flag: "wx" });
}
/** A real second process that removes the lock file after `ms`; the caller blocks synchronously, as a hook does. */
function releaseLockLater(lockPath, ms) {
  const child = spawn(process.execPath, ["-e", `setTimeout(()=>{try{require('node:fs').unlinkSync(process.argv[1])}catch{}},${ms})`, lockPath], { stdio: "ignore", detached: true });
  child.unref();
  return child;
}
const linuxOnly = { skip: process.platform !== "linux" };

test("K12-1 a registry lock held by a live holder and released within the bound is waited out", linuxOnly, () => fixture(({ repository }) => {
  writeLiveLock(repository);
  releaseLockLater(lockPathOf(repository), 300);
  const started = Date.now();
  const result = withSessionAuthorityBoundary({ repository }, () => "entered");
  assert.equal(result, "entered");
  assert.ok(Date.now() - started >= 200, "it did wait for the holder rather than racing past it");
  assert.equal(existsSync(lockPathOf(repository)), false, "its own lock is released again");
}));

test("K12-2 a live holder past the bound gives SDC-LOCK-HELD naming the holder, the wait spent and the retry command", linuxOnly, () => fixture(({ root, repository }) => {
  writeLiveLock(repository);
  assert.ok(Number.isSafeInteger(registry.SESSION_AUTHORITY_LOCK_WAIT_MS) && registry.SESSION_AUTHORITY_LOCK_WAIT_MS > 0 && registry.SESSION_AUTHORITY_LOCK_WAIT_MS <= 3000, "the bound is a short exported constant, far below a 10 s hook timeout");
  const started = Date.now();
  let fault = null;
  try { withSessionAuthorityBoundary({ repository }, () => "entered"); } catch (error) { fault = error; }
  const spent = Date.now() - started;
  assert.ok(fault, "the boundary must refuse");
  assert.equal(fault.code, "SDC-LOCK-HELD");
  assert.equal(fault.lock.pid, process.pid); assert.equal(fault.lock.owner, "live");
  assert.ok(fault.lock.waitedMs >= registry.SESSION_AUTHORITY_LOCK_WAIT_MS - 100, `waited ${fault.lock.waitedMs}ms`);
  assert.ok(spent < registry.SESSION_AUTHORITY_LOCK_WAIT_MS + 1500, `the wait is bounded (${spent}ms)`);
  assert.match(fault.repair, / wait --root /u); assert.match(fault.repair, new RegExp(`pid ${process.pid}`, "u"));
  assert.equal(existsSync(lockPathOf(repository)), true, "a live holder's lock is never touched");
  assert.ok(root);
}));

test("K12-3 a holder that is provably gone is not waited on: its lock is retired at once", linuxOnly, () => fixture(({ repository }) => {
  const gone = spawnSync(process.execPath, ["-e", ""]).pid;
  const owner = { pid: gone, hostSha256: sha(hostname()), process: { start: "1", bootSha256: own().bootSha256 }, acquiredAt: new Date(Date.now() - 3600000).toISOString() };
  writeFileSync(lockPathOf(repository), JSON.stringify({ schema: "pipeline.session-authority-lock.v2", repositorySha256: "a".repeat(64), nonce: "c".repeat(64), owner }), { mode: 0o600, flag: "wx" });
  const started = Date.now();
  assert.equal(withSessionAuthorityBoundary({ repository }, () => "entered"), "entered");
  assert.ok(Date.now() - started < registry.SESSION_AUTHORITY_LOCK_WAIT_MS, "no wait for a dead owner");
}));

function seedRetired(repository, count) {
  const dir = abandonedOf(repository);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const names = [];
  for (let index = 0; index < count; index += 1) {
    const name = `2026010100${String(index).padStart(7, "0")}-${String(index).padStart(8, "a")}-registry-lock`;
    mkdirSync(join(dir, name), { mode: 0o700 });
    writeFileSync(join(dir, name, "registry.lock"), "{}", { mode: 0o600 });
    writeFileSync(join(dir, name, "retire.json"), "{}", { mode: 0o600 });
    names.push(name);
  }
  mkdirSync(join(dir, "20260101000000000-bbbbbbbb-drift-heal"), { mode: 0o700 });
  writeFileSync(join(dir, "20260101000000000-bbbbbbbb-drift-heal", "keep.json"), "{}", { mode: 0o600 });
  return names;
}
const retiredNames = (repository) => readdirSync(abandonedOf(repository)).filter((name) => name.endsWith("-registry-lock")).sort();

test("K12-4 retiring a dead lock sweeps old retired-lock directories beyond the retention and nothing else", linuxOnly, () => fixture(({ repository }) => {
  const kept = registry.SESSION_AUTHORITY_RETIRED_LOCKS_KEPT;
  assert.ok(Number.isSafeInteger(kept) && kept >= 5 && kept <= 100);
  const seeded = seedRetired(repository, kept + 15);
  const gone = spawnSync(process.execPath, ["-e", ""]).pid;
  const owner = { pid: gone, hostSha256: sha(hostname()), process: { start: "1", bootSha256: own().bootSha256 }, acquiredAt: new Date(Date.now() - 3600000).toISOString() };
  writeFileSync(lockPathOf(repository), JSON.stringify({ schema: "pipeline.session-authority-lock.v2", repositorySha256: "a".repeat(64), nonce: "c".repeat(64), owner }), { mode: 0o600, flag: "wx" });
  withSessionAuthorityBoundary({ repository }, () => "entered");
  const left = retiredNames(repository);
  assert.equal(left.length, kept, left.join(","));
  assert.equal(left.includes(seeded[0]), false, "the oldest were swept");
  assert.equal(left.includes(seeded[seeded.length - 1]), true, "the newest seeded one is kept");
  assert.equal(left.some((name) => !seeded.includes(name)), true, "the directory retired just now is kept");
  assert.equal(existsSync(join(abandonedOf(repository), "20260101000000000-bbbbbbbb-drift-heal", "keep.json")), true, "directories that hold registry content are never swept");
}));

test("K12-5 a live holder's lock and the retired directories are untouched when the wait times out", linuxOnly, () => fixture(({ repository }) => {
  const seeded = seedRetired(repository, registry.SESSION_AUTHORITY_RETIRED_LOCKS_KEPT + 5);
  writeLiveLock(repository);
  assert.throws(() => withSessionAuthorityBoundary({ repository }, () => "entered"), (error) => error.code === "SDC-LOCK-HELD");
  assert.deepEqual(retiredNames(repository), seeded.slice().sort(), "no sweep runs while a live holder keeps the lock");
}));
