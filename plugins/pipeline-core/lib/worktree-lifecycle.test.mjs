#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { isSuccessfulSpawn } from "./successful-spawn.mjs";
import { GIT_NULL_DEVICE } from "./git-null-device.mjs";

import {
  WorktreeLifecycleError,
  assureWindowsLocalDirectories,
  canonicalBranchTarget,
  canonicalDetachedTarget,
  checkSessionHygiene,
  classifyCanonicalWorktree,
  cleanupSession,
  createBranchWorktree,
  createDetachedWorktree,
  discoverRepository,
  ensurePrimaryBranchExclude,
  finalizeTemporaryResource,
  inspectTemporaryResource,
  inspectSessionClosure,
  inspectExternallyArchivedSession,
  inspectOrphanArchiveEligibility,
  inspectSessionOwnerRuntime,
  inspectSessionRetirement,
  migrateBranchWorktree,
  parseWorktreePorcelain,
  rawSha256,
  registerTemporaryIntent,
  runGit,
  loadSessionDescriptor,
  listActiveSessionDescriptors,
  retireSessionDescriptor,
  sealTemporaryResource,
  startSessionDescriptor,
} from "./worktree-lifecycle.mjs";
import { main as worktreeCreateMain } from "../scripts/worktree-create.mjs";
import { CONCURRENT_SESSION_WARNING_SCHEMA, observeConcurrentSessionWarning } from "../scripts/pipeline-start-preflight.mjs";

let passed = 0;
let failed = 0;
const fixtureRoots = [];

// This file runs plain check() calls, not node:test cases, so the runner's `--test-name-pattern <regex>` (forwarded to
// this file's own process by `node --test`, or given on the command line) would otherwise be ignored and a one-case
// iteration would execute the whole multi-minute file. With no pattern given, every check runs exactly as before.
const namePatterns = (() => {
  const argv = [...process.execArgv, ...process.argv.slice(2)];
  const patterns = [];
  argv.forEach((arg, index) => {
    const raw = arg === "--test-name-pattern" ? argv[index + 1] : arg.startsWith("--test-name-pattern=") ? arg.slice("--test-name-pattern=".length) : null;
    if (typeof raw !== "string" || raw === "") return;
    const slashed = /^\/(.*)\/([a-z]*)$/s.exec(raw);
    patterns.push(slashed ? new RegExp(slashed[1], slashed[2]) : new RegExp(raw));
  });
  return patterns;
})();

function check(name, fn) {
  if (namePatterns.length > 0 && !namePatterns.some((pattern) => pattern.test(name))) return;
  try {
    fn();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${name}: ${error.stack || error.message}`);
  }
}

function git(cwd, args, { allowNonzero = false } = {}) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    shell: false,
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: GIT_NULL_DEVICE, LC_ALL: "C" },
  });
  if (!isSuccessfulSpawn(result) && !(allowNonzero && typeof result.status === "number" && !result.error)) {
    throw result.error || new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result;
}

function repoFixture() {
  const fixture = mkdtempSync(join(tmpdir(), "worktree-lifecycle-test-"));
  fixtureRoots.push(fixture);
  const primary = join(fixture, "repo");
  mkdirSync(primary);
  git(primary, ["init", "--initial-branch=main"]);
  writeFileSync(join(primary, "README.md"), "fixture\n");
  git(primary, ["add", "README.md"]);
  git(primary, ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "fixture"]);
  return { fixture, primary, head: git(primary, ["rev-parse", "HEAD"]).stdout.trim() };
}

function branch(primary, name) {
  git(primary, ["branch", name]);
}

function linkFixtureDirectory(target, path) {
  symlinkSync(target, path, process.platform === "win32" ? "junction" : "dir");
}

function assertLifecycleError(fn, code) {
  assert.throws(fn, (error) => error instanceof WorktreeLifecycleError && error.code === code);
}

function nodeCli(script, args, env = {}) {
  const result = spawnSync(process.execPath, [script, ...args], {
    encoding: "utf8",
    shell: false,
    env: { ...process.env, ...env },
  });
  if (!isSuccessfulSpawn(result)) {
    throw result.error || new Error(`${script} failed (${result.status}): ${result.stderr}`);
  }
  return result;
}

function currentProcessStartId() {
  if (process.platform !== "linux") return `pid-${process.pid}`;
  return readFileSync(`/proc/${process.pid}/stat`, "utf8").trim().split(" ")[21];
}

function verifyLock(runId, { status = "closed", pid = process.pid, processStartId = currentProcessStartId() } = {}) {
  return {
    schema: "pipeline.verify-run-lock.v1",
    runId,
    pid,
    processStartId,
    owner: "current-os-user",
    status,
    closedAt: status === "closed" ? "2026-08-01T00:00:00.000Z" : null,
  };
}

check("D0-01 branch mapping is canonical and traversal is rejected", () => {
  const { primary } = repoFixture();
  assert.equal(canonicalBranchTarget(primary, "feat/x").target, join(resolve(primary), "branch", "feat", "x"));
  for (const invalid of ["../x", "feat//x", "feat/./x", "feat/../../x", "feat\\x", "feat/x.lock"]) {
    assertLifecycleError(() => canonicalBranchTarget(primary, invalid), "WT-INVALID-BRANCH");
  }
});

check("D0-02 detached mapping binds purpose and full OID", () => {
  const { primary, head } = repoFixture();
  const mapped = canonicalDetachedTarget(primary, "review", head);
  assert.equal(mapped.target, join(resolve(primary), "branch", "detached", `review-${head.slice(0, 12)}`));
  assertLifecycleError(() => canonicalDetachedTarget(primary, "Bad Purpose", head), "WT-INVALID-PURPOSE");
  assertLifecycleError(() => canonicalDetachedTarget(primary, "review", "a".repeat(12)), "WT-INVALID-OID");
});

check("D0-03 symlink parents and case-fold aliases fail before creation", () => {
  const { fixture, primary } = repoFixture();
  const branchRoot = join(primary, "branch");
  mkdirSync(branchRoot);
  mkdirSync(join(branchRoot, "Feat"));
  assertLifecycleError(() => canonicalBranchTarget(primary, "feat/x"), "WT-CASE-COLLISION");
  rmSync(join(branchRoot, "Feat"), { recursive: true });
  const outside = join(fixture, "outside");
  mkdirSync(outside);
  linkFixtureDirectory(outside, join(branchRoot, "linked"));
  assertLifecycleError(() => canonicalBranchTarget(primary, "linked/x"), "WT-SYMLINK-PARENT");
});

check("D0-04 branch creation records exact canonical state and one /branch/ exclusion", () => {
  const { primary } = repoFixture();
  branch(primary, "feat/x");
  const record = createBranchWorktree(primary, "feat/x");
  assert.equal(record.status, "ready");
  assert.equal(record.physicalPath, join(resolve(primary), "branch", "feat", "x"));
  assert.equal(git(record.physicalPath, ["symbolic-ref", "HEAD"]).stdout.trim(), "refs/heads/feat/x");
  const repo = discoverRepository(record.physicalPath);
  const first = ensurePrimaryBranchExclude(repo);
  const second = ensurePrimaryBranchExclude(repo);
  const exclude = readFileSync(first.path, "utf8");
  assert.equal(exclude.split("\n").filter((line) => line === "/branch/").length, 1);
  assert.equal(second.changed, false);
  assert.equal(git(primary, ["status", "--porcelain", "--untracked-files=all"]).stdout, "");
  const registryDir = join(repo.commonDir, "agent-pipeline", "worktrees");
  assert.equal(readdirJson(registryDir).length, 1);
  // Native Windows mode is a synthetic constant, not real POSIX permission bits; the
  // production write path enforces the equivalent owner-DACL assurance separately.
  if (process.platform !== "win32") assert.equal(statSync(join(registryDir, readdirJson(registryDir)[0])).mode & 0o777, 0o600);
});

check("D0-05 protected or sole-copy content cannot enter a cleanup manifest", () => {
  const { primary } = repoFixture();
  const scratch = mkdtempSync(join(tmpdir(), "worktree-protected-test-"));
  fixtureRoots.push(scratch);
  const common = {
    sessionId: "session-protected",
    ownerNonce: "owner-nonce-protected-0001",
    resourceId: "protected-resource",
    type: "scratch-directory",
    path: join(scratch, "owned"),
    cleanupPolicy: "remove-directory",
  };
  assertLifecycleError(() => registerTemporaryIntent(primary, { ...common, contentClass: "spec", soleCopy: false }), "WT-TEMP-CONTENT");
  assertLifecycleError(() => registerTemporaryIntent(primary, { ...common, contentClass: "scratch", soleCopy: true }), "WT-TEMP-SOLE-COPY");
});

check("D0-06 changed canary and same-prefix decoy remain untouched and block cleanup", () => {
  const { primary } = repoFixture();
  const scratch = mkdtempSync(join(tmpdir(), "worktree-cleanup-test-"));
  fixtureRoots.push(scratch);
  const owned = join(scratch, "owned");
  const decoy = join(scratch, "owned-decoy");
  const fields = {
    sessionId: "session-canary",
    ownerNonce: "owner-nonce-canary-000001",
    resourceId: "scratch-owned",
  };
  registerTemporaryIntent(primary, {
    ...fields,
    type: "scratch-directory",
    path: owned,
    contentClass: "scratch",
    soleCopy: false,
    cleanupPolicy: "remove-directory",
  });
  mkdirSync(owned);
  mkdirSync(decoy);
  writeFileSync(join(owned, "canary"), "original\n");
  writeFileSync(join(decoy, "canary"), "decoy\n");
  finalizeTemporaryResource(primary, { ...fields, canaryRelative: "canary" });
  sealTemporaryResource(primary, fields);
  writeFileSync(join(owned, "canary"), "changed\n");
  const blocked = cleanupSession(primary, fields);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.receipt.outcomes[0].code, "WT-CANARY-DRIFT");
  assert.equal(existsSync(owned), true);
  assert.equal(existsSync(decoy), true);
  writeFileSync(join(owned, "canary"), "original\n");
  const complete = cleanupSession(primary, fields);
  assert.equal(complete.ok, true);
  assert.equal(existsSync(owned), false);
  assert.equal(existsSync(decoy), true);
  assert.equal(JSON.stringify(complete.receipt).includes(scratch), false);
});

check("D0-06 sealed coordinator scratch may refresh its tree after an allowed child write", () => {
  const { primary } = repoFixture();
  const scratch = mkdtempSync(join(tmpdir(), "worktree-reseal-test-"));
  fixtureRoots.push(scratch);
  const owned = join(scratch, "owned");
  const fields = {
    sessionId: "session-reseal",
    ownerNonce: "owner-nonce-reseal-000001",
    resourceId: "scratch-reseal",
  };
  registerTemporaryIntent(primary, {
    ...fields,
    type: "scratch-directory",
    path: owned,
    contentClass: "scratch",
    soleCopy: false,
    cleanupPolicy: "remove-directory",
  });
  mkdirSync(owned);
  writeFileSync(join(owned, "canary"), "original\n");
  finalizeTemporaryResource(primary, { ...fields, canaryRelative: "canary" });
  sealTemporaryResource(primary, fields);
  assert.equal(inspectTemporaryResource(primary, fields).resource.physicalPath, owned);
  writeFileSync(join(owned, "child-output"), "allowed scratch output\n");
  assertLifecycleError(() => inspectTemporaryResource(primary, fields), "WT-RESOURCE-DRIFT");
  sealTemporaryResource(primary, fields, { refreshScratch: true });
  assert.equal(inspectTemporaryResource(primary, fields).resource.physicalPath, owned);
  const complete = cleanupSession(primary, fields);
  assert.equal(complete.ok, true);
  assert.equal(existsSync(owned), false);
});

check("D0-06 a registered but unmaterialized scratch intent drains after creator crash", () => {
  const { primary } = repoFixture();
  const scratch = mkdtempSync(join(tmpdir(), "worktree-creating-test-"));
  fixtureRoots.push(scratch);
  const fields = {
    sessionId: "session-creating",
    ownerNonce: "owner-nonce-creating-00001",
    resourceId: "scratch-creating",
  };
  const absent = join(scratch, "not-materialized");
  registerTemporaryIntent(primary, {
    ...fields,
    type: "scratch-directory",
    path: absent,
    contentClass: "scratch",
    soleCopy: false,
    cleanupPolicy: "remove-directory",
  });
  assert.equal(cleanupSession(primary, fields).ok, true);
  assert.equal(existsSync(absent), false);
});

check("D0-06 dirty detached worktree blocks, then exact cleanup drains its manifest", () => {
  const { primary, head } = repoFixture();
  const owner = { sessionId: "session-detached", ownerNonce: "owner-nonce-detached-0001" };
  const record = createDetachedWorktree(primary, "review", head, owner);
  const untracked = join(record.physicalPath, "untracked.txt");
  writeFileSync(untracked, "do not delete\n");
  const blocked = cleanupSession(primary, owner);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.receipt.outcomes[0].code, "WT-WORKTREE-DIRTY");
  assert.equal(existsSync(record.physicalPath), true);
  unlinkSync(untracked);
  const complete = cleanupSession(primary, owner);
  assert.equal(complete.ok, true);
  assert.equal(existsSync(record.physicalPath), false);
  assert.equal(existsSync(join(discoverRepository(primary).commonDir, "agent-pipeline", "session-cleanup", "active", `${owner.sessionId}.json`)), false);
});

check("D0-06 interrupted cleanup recovers from cleanup-intent without a second target", () => {
  const { primary } = repoFixture();
  const scratch = mkdtempSync(join(tmpdir(), "worktree-interrupt-test-"));
  fixtureRoots.push(scratch);
  const owned = join(scratch, "owned.txt");
  const fields = { sessionId: "session-interrupted", ownerNonce: "owner-nonce-interrupt-001", resourceId: "interrupt-file" };
  registerTemporaryIntent(primary, {
    ...fields,
    type: "scratch-file",
    path: owned,
    contentClass: "generated-output",
    soleCopy: false,
    cleanupPolicy: "unlink-file",
  });
  writeFileSync(owned, "temporary\n");
  finalizeTemporaryResource(primary, fields);
  assert.throws(() => cleanupSession(primary, fields, {
    faultInjector(step) { if (step === "resource-removed:interrupt-file") throw new Error("injected crash"); },
  }), /injected crash/);
  assert.equal(existsSync(owned), false);
  const recovered = cleanupSession(primary, fields);
  assert.equal(recovered.ok, true);
  assert.equal(recovered.receipt.counts.removed, 1);
});

check("D0-10 stale same-session writer lock recovers while a foreign lock blocks", () => {
  const { primary } = repoFixture();
  const scratch = mkdtempSync(join(tmpdir(), "worktree-stale-session-test-"));
  fixtureRoots.push(scratch);
  const owned = join(scratch, "owned.txt");
  const fields = { sessionId: "session-stale", ownerNonce: "owner-nonce-stale-0000001", resourceId: "stale-file" };
  registerTemporaryIntent(primary, {
    ...fields,
    type: "scratch-file",
    path: owned,
    contentClass: "scratch",
    soleCopy: false,
    cleanupPolicy: "unlink-file",
  });
  writeFileSync(owned, "temporary\n");
  finalizeTemporaryResource(primary, fields);
  const repo = discoverRepository(primary);
  const lockPath = join(repo.commonDir, "agent-pipeline", "session-cleanup", "active", `${fields.sessionId}.json.lock`);
  const stale = {
    schema: "pipeline.session-cleanup-lock.v1",
    sessionId: fields.sessionId,
    ownerNonceSha256: rawSha256(Buffer.from(fields.ownerNonce)),
    pid: 2_147_483_647,
    processStartId: "dead-process",
  };
  writeFileSync(lockPath, `${JSON.stringify(stale, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  const recovered = cleanupSession(primary, fields);
  assert.equal(recovered.ok, true);
  assert.equal(existsSync(lockPath), false);

  const second = { sessionId: "session-foreign", ownerNonce: "owner-nonce-foreign-0001", resourceId: "foreign-file" };
  const secondPath = join(scratch, "foreign.txt");
  registerTemporaryIntent(primary, {
    ...second,
    type: "scratch-file",
    path: secondPath,
    contentClass: "scratch",
    soleCopy: false,
    cleanupPolicy: "unlink-file",
  });
  writeFileSync(secondPath, "temporary\n");
  finalizeTemporaryResource(primary, second);
  const foreignLock = join(repo.commonDir, "agent-pipeline", "session-cleanup", "active", `${second.sessionId}.json.lock`);
  writeFileSync(foreignLock, `${JSON.stringify({ ...stale, sessionId: second.sessionId, ownerNonceSha256: "f".repeat(64) }, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  assertLifecycleError(() => cleanupSession(primary, second), "WT-MANIFEST-LOCK");
  assert.equal(existsSync(secondPath), true);
});

check("D0 Verify cleanup registration accepts only the private Git-common run root", () => {
  const { primary } = repoFixture();
  const session = startSessionDescriptor(primary, {
    sessionId: "session-verify-root",
    ownerNonce: "owner-nonce-verify-root-000001",
  });
  const outside = join(tmpdir(), "verify-outside-run");
  assertLifecycleError(() => registerTemporaryIntent(primary, {
    sessionId: session.sessionId,
    ownerNonce: session.ownerNonce,
    resourceId: "verify-outside",
    type: "verify-run-directory",
    path: outside,
    contentClass: "verify-recovery",
    soleCopy: false,
    cleanupPolicy: "remove-directory",
  }), "WT-VERIFY-ROOT");
});

check("D0 Verify cleanup removes one exact closed run and preserves an unregistered sibling", () => {
  const { primary } = repoFixture();
  const session = startSessionDescriptor(primary, {
    sessionId: "session-verify-closed",
    ownerNonce: "owner-nonce-verify-closed-0001",
  });
  const repo = discoverRepository(primary);
  const runs = join(repo.commonDir, "agent-pipeline", "verify", "runs");
  const runId = "verify-closed-run";
  const runPath = join(runs, runId);
  registerTemporaryIntent(primary, {
    sessionId: session.sessionId,
    ownerNonce: session.ownerNonce,
    resourceId: "verify-closed-resource",
    type: "verify-run-directory",
    path: runPath,
    contentClass: "verify-recovery",
    soleCopy: false,
    cleanupPolicy: "remove-directory",
  });
  mkdirSync(runPath, { mode: 0o700 });
  writeFileSync(join(runPath, "run.lock"), `${JSON.stringify(verifyLock(runId))}\n`, { mode: 0o600 });
  writeFileSync(join(runPath, "terminal.json"), "{}\n", { mode: 0o600 });
  finalizeTemporaryResource(primary, {
    sessionId: session.sessionId,
    ownerNonce: session.ownerNonce,
    resourceId: "verify-closed-resource",
    canaryRelative: "terminal.json",
  });
  const decoy = join(runs, "verify-unregistered-sibling");
  mkdirSync(decoy, { mode: 0o700 });
  const cleaned = cleanupSession(primary, session);
  assert.equal(cleaned.ok, true);
  assert.equal(existsSync(runPath), false);
  assert.equal(existsSync(decoy), true);
});

check("D0 Verify cleanup blocks a live writer but retires its exact stale creating run", () => {
  const { primary } = repoFixture();
  const session = startSessionDescriptor(primary, {
    sessionId: "session-verify-active",
    ownerNonce: "owner-nonce-verify-active-0001",
  });
  const repo = discoverRepository(primary);
  const runId = "verify-active-run";
  const runPath = join(repo.commonDir, "agent-pipeline", "verify", "runs", runId);
  registerTemporaryIntent(primary, {
    sessionId: session.sessionId,
    ownerNonce: session.ownerNonce,
    resourceId: "verify-active-resource",
    type: "verify-run-directory",
    path: runPath,
    contentClass: "verify-recovery",
    soleCopy: false,
    cleanupPolicy: "remove-directory",
  });
  mkdirSync(runPath, { mode: 0o700 });
  const lockPath = join(runPath, "run.lock");
  writeFileSync(lockPath, `${JSON.stringify(verifyLock(runId, { status: "active" }))}\n`, { mode: 0o600 });
  const live = cleanupSession(primary, session);
  assert.equal(live.ok, false);
  assert.equal(live.receipt.outcomes[0].code, "WT-VERIFY-RUN-ACTIVE");
  writeFileSync(lockPath, `${JSON.stringify(verifyLock(runId, { status: "active", pid: 2_147_483_647, processStartId: "2147483647" }))}\n`, { mode: 0o600 });
  const stale = cleanupSession(primary, session);
  assert.equal(stale.ok, true);
  assert.equal(existsSync(runPath), false);
});

check("D0 Verify cleanup fails closed for missing or malformed run ownership locks", () => {
  const { primary } = repoFixture();
  const session = startSessionDescriptor(primary, {
    sessionId: "session-verify-invalid",
    ownerNonce: "owner-nonce-verify-invalid-0001",
  });
  const repo = discoverRepository(primary);
  const runPath = join(repo.commonDir, "agent-pipeline", "verify", "runs", "verify-invalid-run");
  registerTemporaryIntent(primary, {
    sessionId: session.sessionId,
    ownerNonce: session.ownerNonce,
    resourceId: "verify-invalid-resource",
    type: "verify-run-directory",
    path: runPath,
    contentClass: "verify-recovery",
    soleCopy: false,
    cleanupPolicy: "remove-directory",
  });
  mkdirSync(runPath, { mode: 0o700 });
  const missing = cleanupSession(primary, session);
  assert.equal(missing.ok, false);
  assert.equal(missing.receipt.outcomes[0].code, "WT-VERIFY-RUN-LOCK");
  writeFileSync(join(runPath, "run.lock"), "{}\n", { mode: 0o600 });
  const malformed = cleanupSession(primary, session);
  assert.equal(malformed.ok, false);
  assert.equal(malformed.receipt.outcomes[0].code, "WT-VERIFY-RUN-LOCK");
  assert.equal(existsSync(runPath), true);
});

check("D0-07 hygiene reports only redacted classifications and rejects noncanonical registration", () => {
  const { fixture, primary } = repoFixture();
  branch(primary, "feat/outside");
  const outside = join(fixture, "outside-worktree");
  git(primary, ["worktree", "add", outside, "feat/outside"]);
  const receipt = checkSessionHygiene(primary, { sessionId: "session-hygiene" });
  assert.equal(receipt.ok, false);
  assert(receipt.reasons.includes("noncanonical-worktree"));
  assert.equal(JSON.stringify(receipt).includes(fixture), false);
});


check("D0-07 missing Git registration preserves session counts and independent noncanonical findings", () => {
  const { fixture, primary, head } = repoFixture();
  const session = { sessionId: "session-hygiene-missing", ownerNonce: "owner-hygiene-missing-0001" };
  const owned = createDetachedWorktree(primary, "hygiene-owned", head, session);
  branch(primary, "feat/hygiene-missing");
  const missing = join(fixture, "missing-registration");
  git(primary, ["worktree", "add", missing, "feat/hygiene-missing"]);
  // Remove only this disposable fixture directory; retain Git's registration.
  rmSync(missing, { recursive: true, force: true });
  const missingRecord = discoverRepository(primary).worktrees.find((record) => record.path === missing);
  assert(missingRecord);
  assertLifecycleError(() => classifyCanonicalWorktree(discoverRepository(primary), missingRecord), "WT-WORKTREE-MISSING");

  const registeredBefore = git(primary, ["worktree", "list", "--porcelain"]).stdout;
  const receipt = checkSessionHygiene(primary, session);
  assert.equal(receipt.ok, false);
  assert(receipt.reasons.includes("missing-worktree"));
  assert(receipt.reasons.includes("session-manifest-not-drained"));
  assert(receipt.reasons.includes("owned-temporary-worktree-remains"));
  assert.equal(receipt.reasons.includes("noncanonical-worktree"), false);
  assert.equal(receipt.counts.linkedWorktrees, 3);
  assert.equal(receipt.counts.missingWorktrees, 1);
  assert.equal(receipt.counts.noncanonicalWorktrees, 0);
  assert.equal(receipt.counts.activeSessionManifests, 1);
  assert.equal(receipt.counts.ownedTemporaryResidue, 1);

  const unbound = checkSessionHygiene(primary, { sessionId: "session-hygiene-unrelated" });
  assert.equal(unbound.ok, false);
  assert(unbound.reasons.includes("missing-worktree"));
  assert.equal(unbound.counts.activeSessionManifests, 0);
  assert.equal(unbound.counts.ownedTemporaryResidue, 0);
  assert.equal(git(primary, ["worktree", "list", "--porcelain"]).stdout, registeredBefore);
  assert.equal(existsSync(owned.physicalPath), true);
  assert.equal(JSON.stringify(receipt).includes(fixture), false);
  assert.equal(JSON.stringify(receipt).includes(session.ownerNonce), false);

  branch(primary, "feat/hygiene-noncanonical");
  const noncanonical = join(fixture, "existing-noncanonical");
  git(primary, ["worktree", "add", noncanonical, "feat/hygiene-noncanonical"]);
  const mixed = checkSessionHygiene(primary, session);
  assert.equal(mixed.ok, false);
  assert(mixed.reasons.includes("missing-worktree"));
  assert(mixed.reasons.includes("noncanonical-worktree"));
  assert.equal(mixed.counts.linkedWorktrees, 4);
  assert.equal(mixed.counts.missingWorktrees, 1);
  assert.equal(mixed.counts.noncanonicalWorktrees, 1);
  assert.equal(mixed.counts.activeSessionManifests, 1);
  assert.equal(mixed.counts.ownedTemporaryResidue, 1);
  assert.equal(existsSync(noncanonical), true);
});

check("D0-07 hygiene still throws an unsafe canonical-path error", () => {
  const { fixture, primary } = repoFixture();
  branch(primary, "feat/hygiene-unsafe");
  const existing = join(primary, "unsafe-registration");
  git(primary, ["worktree", "add", existing, "feat/hygiene-unsafe"]);
  mkdirSync(join(primary, "branch"));
  linkFixtureDirectory(fixture, join(primary, "branch", "feat"));
  assertLifecycleError(
    () => checkSessionHygiene(primary, { sessionId: "session-hygiene-unsafe" }),
    "WT-SYMLINK-PARENT",
  );
  assert.equal(existsSync(existing), true);
});

// NVA-HYGFIX-1 repro: a worktree whose ONLY unversioned/modified paths are the
// pipeline's own onboarding-flow output (project-onboarding-v3.mjs's own
// `freshBaselines()`/`planProjectOnboardingV3()` targets) must not be reported
// as `current-worktree-dirty` -- that reason exists for genuinely foreign
// dirty state, not for the scaffolding onboarding just generated on the
// project's own first run. Before the fix this reproduces RED (the raw
// `git status --porcelain` length check flags any change at all).
check("D0-07 hygiene ignores dirty state made only of onboarding-generated paths", () => {
  const { primary } = repoFixture();
  mkdirSync(join(primary, ".claude"), { mode: 0o700 });
  writeFileSync(join(primary, ".claude", "settings.json"), "{}\n");
  writeFileSync(join(primary, ".claude", "pipeline.json"), "{}\n");
  writeFileSync(join(primary, ".claude", "pipeline.yaml"), "language:\n  human_facing: en\n");
  mkdirSync(join(primary, "project"), { mode: 0o700 });
  writeFileSync(join(primary, "project", "pipeline.json"), "{}\n");
  writeFileSync(join(primary, "project", "resume-hint.json"), "{}\n");
  mkdirSync(join(primary, "specs", "kickoff-example"), { mode: 0o700, recursive: true });
  writeFileSync(join(primary, "specs", "kickoff-example", "spec.md"), "# example\n");
  writeFileSync(join(primary, "pipeline.user.yaml"), "schema: pipeline.user.v3\n");
  const receipt = checkSessionHygiene(primary, { sessionId: "session-hygiene-onboarding" });
  assert.equal(receipt.reasons.includes("current-worktree-dirty"), false);
});

// Regression coverage for the positive case the fix must not weaken: onboarding
// scaffolding sitting alongside one genuinely foreign/unexpected dirty file
// must still raise `current-worktree-dirty`.
check("D0-07 hygiene still flags current-worktree-dirty when a genuinely foreign path is dirty", () => {
  const { primary } = repoFixture();
  mkdirSync(join(primary, ".claude"), { mode: 0o700 });
  writeFileSync(join(primary, ".claude", "settings.json"), "{}\n");
  writeFileSync(join(primary, "pipeline.user.yaml"), "schema: pipeline.user.v3\n");
  writeFileSync(join(primary, "unexpected-foreign-file.txt"), "not onboarding output\n");
  const receipt = checkSessionHygiene(primary, { sessionId: "session-hygiene-foreign" });
  assert(receipt.reasons.includes("current-worktree-dirty"));
});

// NVA-WTLIFECYCLE-1: backlog-acceptance-matrix.md names "post-commit
// cleanliness" as a distinct, unproven dimension of the AC in
// prd_sentinel-epic.md:151-154 ("...cleaned safely in full and light close
// profiles"). Every prior dirty-worktree check (D0-06/D0-07) reaches its
// clean state by deleting an untracked file; none commits a real deliverable
// first. This proves the identical git-status-driven mechanism also holds
// for the actual close-block scenario: the session COMMITS its shipped work,
// hygiene reports clean git state but still flags the undrained scratch
// manifest, cleanup removes only the registered scratch resource, and the
// committed deliverable is left byte-identical and the worktree hygiene-clean
// afterward.
check("D0-09 post-commit cleanliness: cleanup drains session scratch after a real deliverable commit, leaving committed content untouched", () => {
  const { primary } = repoFixture();
  const sessionId = "session-post-commit";
  const ownerNonce = "owner-nonce-post-commit-0001";
  const deliverable = join(primary, "deliverable.txt");
  writeFileSync(deliverable, "shipped work\n");
  git(primary, ["add", "deliverable.txt"]);
  git(primary, ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "deliverable"]);
  const deliverableSha256 = rawSha256(readFileSync(deliverable));

  const scratch = mkdtempSync(join(tmpdir(), "worktree-post-commit-test-"));
  fixtureRoots.push(scratch);
  const evidence = join(scratch, "evidence.txt");
  const fields = { sessionId, ownerNonce, resourceId: "post-commit-evidence" };
  registerTemporaryIntent(primary, {
    ...fields,
    type: "scratch-file",
    path: evidence,
    contentClass: "scratch",
    soleCopy: false,
    cleanupPolicy: "unlink-file",
  });
  writeFileSync(evidence, "evidence\n");
  finalizeTemporaryResource(primary, fields);

  const beforeCleanup = checkSessionHygiene(primary, { sessionId });
  assert.equal(beforeCleanup.reasons.includes("current-worktree-dirty"), false);
  assert.equal(beforeCleanup.reasons.includes("session-manifest-not-drained"), true);

  const complete = cleanupSession(primary, fields);
  assert.equal(complete.ok, true);
  assert.equal(existsSync(evidence), false);
  assert.equal(existsSync(deliverable), true);
  assert.equal(rawSha256(readFileSync(deliverable)), deliverableSha256);

  const afterCleanup = checkSessionHygiene(primary, { sessionId });
  assert.equal(afterCleanup.ok, true);
});

check("D0-08 clean migration creates/verifies canonical copy before removing old registration", () => {
  const { fixture, primary, head } = repoFixture();
  branch(primary, "feat/move");
  const source = join(fixture, "legacy-worktree");
  git(primary, ["worktree", "add", source, "feat/move"]);
  const record = migrateBranchWorktree(primary, source, "feat/move");
  assert.equal(existsSync(source), false);
  assert.equal(record.physicalPath, join(resolve(primary), "branch", "feat", "move"));
  assert.equal(git(record.physicalPath, ["rev-parse", "HEAD"]).stdout.trim(), head);
  assert.equal(git(record.physicalPath, ["symbolic-ref", "HEAD"]).stdout.trim(), "refs/heads/feat/move");
});

for (const injectedStep of ["target-created", "target-verified", "source-removed", "branch-attached"]) {
  check(`D0-08 injected migration failure at ${injectedStep} retains an exact recoverable copy`, () => {
    const { fixture, primary, head } = repoFixture();
    branch(primary, "feat/recover");
    const source = join(fixture, "legacy-worktree");
    git(primary, ["worktree", "add", source, "feat/recover"]);
    assert.throws(() => migrateBranchWorktree(primary, source, "feat/recover", {
      faultInjector(step) { if (step === injectedStep) throw new Error(`fault:${step}`); },
    }), new RegExp(`fault:${injectedStep}`));
    const target = join(resolve(primary), "branch", "feat", "recover");
    const copies = [source, target].filter((path) => existsSync(path));
    assert(copies.length >= 1);
    assert(copies.some((path) => git(path, ["rev-parse", "HEAD"]).stdout.trim() === head));
  });
}

check("D0 worktree CLI denies unmanaged dispatch before creation while cleanup still drains owned scratch", () => {
  const { primary } = repoFixture();
  branch(primary, "feat/cli");
  const createScript = fileURLToPath(new URL("../scripts/worktree-create.mjs", import.meta.url));
  const cleanupScript = fileURLToPath(new URL("../scripts/session-cleanup.mjs", import.meta.url));
  const denied = spawnSync(process.execPath, [
    createScript, "branch", "--repo", primary, "--branch", "feat/cli",
  ], { encoding: "utf8", shell: false });
  assert.equal(denied.status, 2);
  assert.match(denied.stderr, /PORG-NOT-READY/);
  assert.equal(denied.stderr.includes(primary), false);
  assert.equal(existsSync(join(resolve(primary), "branch", "feat", "cli")), false);

  const scratch = mkdtempSync(join(tmpdir(), "worktree-cli-test-"));
  fixtureRoots.push(scratch);
  const owned = join(scratch, "owned.txt");
  const common = ["--repo", primary, "--session", "session-cli"];
  const env = { PIPELINE_SESSION_OWNER_NONCE: "owner-nonce-cli-00000001" };
  nodeCli(cleanupScript, [
    "register-intent", ...common, "--resource-id", "cli-resource", "--type", "scratch-file",
    "--path", owned, "--content-class", "generated-output", "--policy", "unlink-file",
  ], env);
  writeFileSync(owned, "temporary CLI output\n");
  nodeCli(cleanupScript, ["finalize", ...common, "--resource-id", "cli-resource"], env);
  const receipt = JSON.parse(nodeCli(cleanupScript, ["cleanup", ...common], env).stdout);
  assert.equal(receipt.status, "complete");
  assert.equal(existsSync(owned), false);
  assert.equal(JSON.stringify(receipt).includes(scratch), false);
});

check("D0 worktree CLI honors an explicit --runner over the CLAUDECODE-derived boundary default", () => {
  const { primary } = repoFixture();
  let seenRunner = null;
  worktreeCreateMain(["branch", "--repo", primary, "--branch", "feat/runner-flag"], { CLAUDECODE: "1" }, {
    requireProjectOnboardingReadyFn(options) { seenRunner = options.runner; },
    createBranchWorktreeFn: () => ({}),
    writeFn() {},
  });
  assert.equal(seenRunner, "claude", "absent --runner derives claude from CLAUDECODE=1");

  seenRunner = null;
  worktreeCreateMain(["branch", "--repo", primary, "--branch", "feat/runner-flag-2", "--runner", "codex"], { CLAUDECODE: "1" }, {
    requireProjectOnboardingReadyFn(options) { seenRunner = options.runner; },
    createBranchWorktreeFn: () => ({}),
    writeFn() {},
  });
  assert.equal(seenRunner, "codex", "explicit --runner wins even when CLAUDECODE=1 would derive claude");
});

check("D0 worktree CLI derives the boundary runner from an absent CLAUDECODE and fails closed on an invalid explicit --runner", () => {
  const { primary } = repoFixture();
  let seenRunner = null;
  worktreeCreateMain(["branch", "--repo", primary, "--branch", "feat/runner-default"], {}, {
    requireProjectOnboardingReadyFn(options) { seenRunner = options.runner; },
    createBranchWorktreeFn: () => ({}),
    writeFn() {},
  });
  assert.equal(seenRunner, "codex", "absent --runner and absent CLAUDECODE derives codex");

  let calls = 0;
  assert.throws(
    () => worktreeCreateMain(["branch", "--repo", primary, "--branch", "feat/runner-bad", "--runner", "windows"], {}, {
      requireProjectOnboardingReadyFn() { calls += 1; },
    }),
    /Invalid --runner/,
  );
  assert.equal(calls, 0, "an invalid explicit --runner must fail before readiness is ever inspected");
});

check("D0 session descriptor is private, bound to one common dir and retires only after cleanup", () => {
  const { primary } = repoFixture();
  const session = startSessionDescriptor(primary, { sessionId: "session-descriptor-test", ownerNonce: "owner-nonce-descriptor-000001" });
  // Native Windows mode is a synthetic constant, not real POSIX permission bits; the
  // production write path enforces the equivalent owner-DACL assurance separately.
  if (process.platform !== "win32") assert.equal(lstatSync(session.path).mode & 0o777, 0o600);
  const loaded = loadSessionDescriptor(primary, session.sessionId);
  assert.equal(loaded.ownerNonce, session.ownerNonce);
  assert.equal(loaded.descriptorSha256, session.descriptorSha256);
  assert.deepEqual(inspectSessionClosure(primary, session.sessionId, { expectedDescriptorSha256: session.descriptorSha256 }), { status: "active", closedAt: null });
  const scratch = mkdtempSync(join(tmpdir(), "worktree-descriptor-test-"));
  fixtureRoots.push(scratch);
  const owned = join(scratch, "owned.txt");
  registerTemporaryIntent(primary, {
    sessionId: session.sessionId,
    ownerNonce: session.ownerNonce,
    resourceId: "descriptor-resource",
    type: "scratch-file",
    path: owned,
    contentClass: "scratch",
    soleCopy: false,
    cleanupPolicy: "unlink-file",
  });
  assertLifecycleError(() => retireSessionDescriptor(primary, loaded), "WT-SESSION-ACTIVE");
  writeFileSync(owned, "temporary\n");
  finalizeTemporaryResource(primary, { ...loaded, resourceId: "descriptor-resource" });
  cleanupSession(primary, loaded);
  const retired = retireSessionDescriptor(primary, loaded);
  assert.equal(retired.sessionId, session.sessionId);
  assert.equal(existsSync(session.path), false);
  assert.equal(inspectSessionClosure(primary, session.sessionId).status, "closed");
  assertLifecycleError(() => loadSessionDescriptor(primary, session.sessionId), "WT-SESSION-MISSING");
});

check("D0 session owner runtime status is sanitized, detects PID reuse, and preserves legacy descriptors", () => {
  const { primary } = repoFixture();
  const session = startSessionDescriptor(primary, {
    sessionId: "session-owner-runtime",
    ownerNonce: "owner-nonce-runtime-000000001",
  });
  const live = inspectSessionOwnerRuntime(primary, session.sessionId);
  assert.equal(live.schema, "pipeline.session-owner-status.v1");
  assert.equal(live.status, process.platform === "linux" ? "live" : "unavailable");
  assert.equal(JSON.stringify(live).includes(session.ownerNonce), false);

  if (process.platform === "linux") {
    const descriptor = JSON.parse(readFileSync(session.path, "utf8"));
    descriptor.ownerRuntime.processStartId = `${Number(descriptor.ownerRuntime.processStartId) + 1}`;
    writeFileSync(session.path, `${JSON.stringify(descriptor, null, 2)}\n`, { mode: 0o600 });
    assert.equal(inspectSessionOwnerRuntime(primary, session.sessionId).status, "reused");
  }

  const unavailable = startSessionDescriptor(primary, {
    sessionId: "session-owner-unavailable",
    ownerNonce: "owner-nonce-unavailable-000001",
    ownerPid: -1,
  });
  assert.equal(inspectSessionOwnerRuntime(primary, unavailable.sessionId).status, "unavailable");

  const legacy = startSessionDescriptor(primary, {
    sessionId: "session-owner-legacy",
    ownerNonce: "owner-nonce-legacy-000000001",
  });
  const legacyDescriptor = JSON.parse(readFileSync(legacy.path, "utf8"));
  delete legacyDescriptor.ownerRuntime;
  legacyDescriptor.schema = "pipeline.session-descriptor.v1";
  writeFileSync(legacy.path, `${JSON.stringify(legacyDescriptor, null, 2)}\n`, { mode: 0o600 });
  assert.equal(inspectSessionOwnerRuntime(primary, legacy.sessionId).status, "unobserved");
});

// CSW-T (Ruling 117, backlog 2026-10-09-concurrent-session-warning-never-fires-on-native-windows). EL-18: a second live
// session in the same repository must be warned about on EVERY host. `localProcessStartIdentity` reads /proc and so
// returns null off Linux; the descriptor then carries `ownerRuntime: null`, the owner reads "unavailable", and the
// warning (which keys on a live owner) never fires on native Windows or macOS. These cases run on the real host
// platform and use the module's process seam (`ownerPid`): the owner recorded for the "second" session is this very
// test process, which is alive. No platform seam exists in the module, so a non-win32 host cannot synthesize the
// win32 branch; the pin is red on native win32 and green on Linux, and a fix that adds a platform seam may extend it.
check("CSW-T a live second session in the same repository fires the concurrent-session warning on this host platform", () => {
  const { primary } = repoFixture();
  const mine = startSessionDescriptor(primary, {
    sessionId: "session-csw-this-one",
    ownerNonce: "owner-nonce-csw-mine-00000001",
  });
  const other = startSessionDescriptor(primary, {
    sessionId: "session-csw-another-live",
    ownerNonce: "owner-nonce-csw-other-0000001",
    ownerPid: process.pid,
  });
  const warning = observeConcurrentSessionWarning({ startPath: primary, currentSessionId: mine.sessionId });
  assert.notEqual(
    warning,
    null,
    `no concurrent-session warning on platform ${process.platform}: the live second session's owner reads `
      + `"${inspectSessionOwnerRuntime(primary, other.sessionId).status}", and the warning fires only for a live owner`,
  );
  assert.equal(warning.sessionId, other.sessionId);
  assert.equal(warning.descriptorSha256, other.descriptorSha256);
});

check("CSW-T control: a second session whose owner pid does not exist never fires the concurrent-session warning", () => {
  const { primary } = repoFixture();
  const mine = startSessionDescriptor(primary, {
    sessionId: "session-csw-control-mine",
    ownerNonce: "owner-nonce-csw-control-mine-1",
  });
  startSessionDescriptor(primary, {
    sessionId: "session-csw-control-dead",
    ownerNonce: "owner-nonce-csw-control-dead-1",
    ownerPid: 2_147_483_647,
  });
  assert.equal(observeConcurrentSessionWarning({ startPath: primary, currentSessionId: mine.sessionId }), null);
});

// CSW-T2 (Ruling 162, CSW-F bullet; the landed fix is b0d1ff11d). The win32 branch of the probable-liveness check is
// driven on EVERY host through the injected seams (`platform`, `nowMs`, `uptimeSeconds`), so a Linux or macOS run exercises
// the same code a native Windows run does. `nowMs` is a multiple of 60 000 and `uptimeSeconds` a multiple of 60, so the
// boot minute is exact (floor((nowMs - uptimeSeconds * 1000) / 60 000) = 29 999 880) and a shift of whole minutes moves
// it by exactly that many. Registration, inspection and the warning all take the same seams.
const CSW_NOW_MS = 1_800_000_000_000;
const CSW_UPTIME_SECONDS = 7_200;
const CSW_BOOT_MINUTE = "29999880";
const CSW_SEAMS = { platform: "win32", nowMs: CSW_NOW_MS, uptimeSeconds: CSW_UPTIME_SECONDS };
const CSW_ABSENT_PID = 2_147_483_647;

function cswSession(primary, tag, seams = CSW_SEAMS, extra = {}) {
  return startSessionDescriptor(primary, {
    sessionId: `session-csw2-${tag}`,
    ownerNonce: `owner-nonce-csw2-${tag}-0000000001`,
    ownerPid: process.pid,
    ...seams,
    ...extra,
  });
}

function cswRecordedRuntime(session) {
  return JSON.parse(readFileSync(session.path, "utf8")).ownerRuntime;
}

function cswOwnerRead(primary, session, extra = {}) {
  return inspectSessionOwnerRuntime(primary, session.sessionId, { ...CSW_SEAMS, ...extra });
}

function cswVanishOwner(session) {
  const descriptor = JSON.parse(readFileSync(session.path, "utf8"));
  descriptor.ownerRuntime.pid = CSW_ABSENT_PID;
  writeFileSync(session.path, `${JSON.stringify(descriptor, null, 2)}\n`, { mode: 0o600 });
}

check("CSW-T2 a win32 registration records the owner pid and the host boot minute in the existing processStartId slot", () => {
  const { primary } = repoFixture();
  const runtime = cswRecordedRuntime(cswSession(primary, "register"));
  assert.equal(runtime.pid, process.pid);
  assert.equal(runtime.processStartId, CSW_BOOT_MINUTE);
  // The boot minute is floored: 59.999 s later is the same minute, one whole minute later is the next one.
  assert.equal(cswRecordedRuntime(cswSession(primary, "register-subminute", { ...CSW_SEAMS, nowMs: CSW_NOW_MS + 59_999 })).processStartId, CSW_BOOT_MINUTE);
  assert.equal(
    cswRecordedRuntime(cswSession(primary, "register-nextminute", { ...CSW_SEAMS, nowMs: CSW_NOW_MS + 60_000 })).processStartId,
    String(Number(CSW_BOOT_MINUTE) + 1),
  );
  // No owner runtime is recorded for an owner pid that does not exist, for any non-win32 platform, or for unusable clock inputs.
  assert.equal(cswRecordedRuntime(cswSession(primary, "register-absent", CSW_SEAMS, { ownerPid: CSW_ABSENT_PID })), null);
  assert.equal(cswRecordedRuntime(cswSession(primary, "register-darwin", { ...CSW_SEAMS, platform: "darwin" })), null);
  const unusable = [{ uptimeSeconds: -1 }, { uptimeSeconds: Number.NaN }, { nowMs: Number.NaN }, { nowMs: 1_000, uptimeSeconds: 0 }];
  unusable.forEach((inputs, index) => {
    assert.equal(
      cswRecordedRuntime(cswSession(primary, `register-unusable-${index}`, { ...CSW_SEAMS, ...inputs })),
      null,
      `unusable clock inputs ${JSON.stringify(inputs)} must record no owner runtime`,
    );
  });
});

check("CSW-T2 opt-in reads a win32 owner as probably live; the default read keeps the typed unavailable; other platforms stay unavailable", () => {
  const { primary } = repoFixture();
  const session = cswSession(primary, "optin");
  const byDefault = cswOwnerRead(primary, session);
  assert.equal(byDefault.status, "unavailable");
  assert.equal("probable" in byDefault, false);
  const optedIn = cswOwnerRead(primary, session, { probableLiveness: true, expectedDescriptorSha256: session.descriptorSha256 });
  assert.equal(optedIn.status, "live");
  assert.equal(optedIn.probable, true);
  assert.deepEqual(Object.keys(optedIn).sort(), ["descriptorSha256", "probable", "schema", "sessionId", "status"]);
  assert.equal(JSON.stringify(optedIn).includes(session.ownerNonce), false);
  // Only the literal boolean true opts in.
  for (const loose of [1, "true", {}, undefined, null, false]) {
    assert.equal(cswOwnerRead(primary, session, { probableLiveness: loose }).status, "unavailable", `probableLiveness ${JSON.stringify(loose)} must not opt in`);
  }
  // A platform that is neither Linux nor win32 stays unavailable, opted in or not, registered there or read there.
  const mac = cswSession(primary, "optin-darwin", { ...CSW_SEAMS, platform: "darwin" });
  const macRead = cswOwnerRead(primary, mac, { platform: "darwin", probableLiveness: true });
  assert.equal(macRead.status, "unavailable");
  assert.equal("probable" in macRead, false);
  assert.equal(cswOwnerRead(primary, session, { platform: "darwin", probableLiveness: true }).status, "unavailable");
});

check("CSW-T2 the boot-minute comparison tolerates exactly one minute either way and reads a larger gap as reused", () => {
  const { primary } = repoFixture();
  const session = cswSession(primary, "boundary");
  const read = (deltaMs) => cswOwnerRead(primary, session, { nowMs: CSW_NOW_MS + deltaMs, probableLiveness: true });
  // floor((delta) / 60 000) is the boot-minute offset: -1 minute and +1 minute are inside the tolerance, +-2 are outside.
  for (const deltaMs of [0, -1, -60_000, 59_999, 60_000, 119_999]) {
    const result = read(deltaMs);
    assert.equal(result.status, "live", `delta ${deltaMs} ms must still read as the same boot`);
    assert.equal(result.probable, true);
  }
  for (const deltaMs of [-60_001, -120_000, 120_000]) {
    const result = read(deltaMs);
    assert.equal(result.status, "reused", `delta ${deltaMs} ms is a different boot`);
    assert.equal("probable" in result, false);
  }
});

check("CSW-T2 a rebooted host reads a recorded win32 owner as reused and a vanished owner process as not-live, never as probably live", () => {
  const { primary } = repoFixture();
  const rebootedSession = cswSession(primary, "rebooted");
  // An hour later the host reports ten minutes of uptime: it booted again, 170 minutes after the recorded boot.
  const rebootedSeams = { nowMs: CSW_NOW_MS + 3_600_000, uptimeSeconds: 600 };
  const rebooted = cswOwnerRead(primary, rebootedSession, { ...rebootedSeams, probableLiveness: true });
  assert.equal(rebooted.status, "reused");
  assert.equal("probable" in rebooted, false);
  assert.equal(cswOwnerRead(primary, rebootedSession, rebootedSeams).status, "unavailable");
  // The same fixture with the owner process gone: not-live whether or not the caller opted in, with no probable marker.
  const goneSession = cswSession(primary, "gone");
  cswVanishOwner(goneSession);
  for (const probableLiveness of [true, false]) {
    const gone = cswOwnerRead(primary, goneSession, { probableLiveness });
    assert.equal(gone.status, "not-live");
    assert.equal("probable" in gone, false);
  }
});

check("CSW-T2 on this host the default read and the opted-in read follow the platform table", () => {
  const { primary } = repoFixture();
  const session = startSessionDescriptor(primary, {
    sessionId: "session-csw2-hostreal",
    ownerNonce: "owner-nonce-csw2-hostreal-0000001",
  });
  const byDefault = inspectSessionOwnerRuntime(primary, session.sessionId);
  const optedIn = inspectSessionOwnerRuntime(primary, session.sessionId, { probableLiveness: true });
  if (process.platform === "linux") {
    // Real process start ticks are authoritative: the opt-in changes nothing and nothing is marked probable.
    assert.equal(byDefault.status, "live");
    assert.equal(optedIn.status, "live");
    assert.equal("probable" in byDefault, false);
    assert.equal("probable" in optedIn, false);
  } else if (process.platform === "win32") {
    assert.equal(byDefault.status, "unavailable");
    assert.equal(optedIn.status, "live");
    assert.equal(optedIn.probable, true);
  } else {
    assert.equal(byDefault.status, "unavailable");
    assert.equal(optedIn.status, "unavailable");
  }
});

check("CSW-T2 the concurrent-session warning for a probably live win32 owner is marked probable and says probably live", () => {
  const { primary } = repoFixture();
  const mine = cswSession(primary, "warn-mine");
  const other = cswSession(primary, "warn-other");
  const seen = [];
  const inspectOwner = (startPath, sessionId, options) => {
    seen.push(options);
    return inspectSessionOwnerRuntime(startPath, sessionId, { ...options, ...CSW_SEAMS });
  };
  const warning = observeConcurrentSessionWarning({ startPath: primary, currentSessionId: mine.sessionId, inspectOwner });
  assert.notEqual(warning, null);
  assert.deepEqual(Object.keys(warning).sort(), ["descriptorSha256", "message", "probable", "schema", "sessionId", "status"]);
  assert.equal(warning.schema, CONCURRENT_SESSION_WARNING_SCHEMA);
  assert.equal(warning.sessionId, other.sessionId);
  assert.equal(warning.descriptorSha256, other.descriptorSha256);
  assert.equal(warning.status, "live");
  assert.equal(warning.probable, true);
  assert.match(warning.message, /probably live/u);
  const text = JSON.stringify(warning);
  assert.equal(text.includes(other.ownerNonce), false);
  assert.equal(text.includes("processStartId"), false);
  assert.equal(text.includes(CSW_BOOT_MINUTE), false);
  // The warning is the caller that opts in, and it pins the exact descriptor it inspects.
  assert.ok(seen.length >= 1);
  for (const options of seen) {
    assert.equal(options.probableLiveness, true);
    assert.match(options.expectedDescriptorSha256, /^[0-9a-f]{64}$/u);
  }
  // On a real Linux host the warning keeps its original four-key shape.
  if (process.platform === "linux") {
    const real = startSessionDescriptor(primary, { sessionId: "session-csw2-warn-real", ownerNonce: "owner-nonce-csw2-warn-real-000001" });
    const linuxWarning = observeConcurrentSessionWarning({
      startPath: primary,
      currentSessionId: mine.sessionId,
      listDescriptors: (startPath) => listActiveSessionDescriptors(startPath).filter((entry) => entry.sessionId === real.sessionId),
    });
    assert.deepEqual(Object.keys(linuxWarning).sort(), ["descriptorSha256", "schema", "sessionId", "status"]);
  }
});

check("CSW-T2 the warning fires one minute either side of the recorded boot minute and stays silent beyond it, after a reboot, and for a vanished owner", () => {
  const { primary } = repoFixture();
  const mine = cswSession(primary, "silent-mine");
  const other = cswSession(primary, "silent-other");
  const warnWith = (seams) => observeConcurrentSessionWarning({
    startPath: primary,
    currentSessionId: mine.sessionId,
    inspectOwner: (startPath, sessionId, options) => inspectSessionOwnerRuntime(startPath, sessionId, { ...options, ...CSW_SEAMS, ...seams }),
  });
  for (const deltaMs of [-60_000, -1, 0, 59_999, 60_000, 119_999]) {
    const warning = warnWith({ nowMs: CSW_NOW_MS + deltaMs });
    assert.notEqual(warning, null, `delta ${deltaMs} ms is inside the tolerance and must warn`);
    assert.equal(warning.sessionId, other.sessionId);
    assert.equal(warning.probable, true);
  }
  for (const deltaMs of [-120_000, -60_001, 120_000]) {
    assert.equal(warnWith({ nowMs: CSW_NOW_MS + deltaMs }), null, `delta ${deltaMs} ms is a different boot and must not warn`);
  }
  assert.equal(warnWith({ nowMs: CSW_NOW_MS + 3_600_000, uptimeSeconds: 600 }), null);
  cswVanishOwner(other);
  assert.equal(warnWith({}), null);
});

check("CSW-T2 retirement, external-archive and orphan-archive reads never act on a probably live owner and expose no probable marker", () => {
  const { primary } = repoFixture();
  const session = cswSession(primary, "retire");
  // These readers are called without the opt-in, exactly as every production caller does.
  const retirement = inspectSessionRetirement(primary, session.sessionId, CSW_SEAMS);
  assert.equal(retirement.ownerStatus, "unavailable");
  assert.equal(retirement.status, "owner-unavailable");
  const archived = inspectExternallyArchivedSession(primary, session.sessionId, CSW_SEAMS);
  assert.equal(archived.ownerStatus, "unavailable");
  assert.equal(archived.status, "owner-active");
  const orphan = inspectOrphanArchiveEligibility(primary, session.sessionId, { ...CSW_SEAMS, requesterSessionId: "session-csw2-requester" });
  assert.equal(orphan.ownerStatus, "unavailable");
  for (const result of [retirement, archived, orphan]) {
    assert.equal(JSON.stringify(result).includes("probable"), false, "no retirement-family result may carry the probable marker");
  }
});

check("CSW-T2 only the concurrent-session warning opts into probable liveness: no other production module passes probableLiveness", () => {
  const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const holders = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules") walk(full);
      } else if (entry.name.endsWith(".mjs") && !entry.name.endsWith(".test.mjs") && readFileSync(full, "utf8").includes("probableLiveness")) {
        holders.push(full.slice(pluginRoot.length + 1).replaceAll("\\", "/"));
      }
    }
  };
  for (const sub of ["lib", "scripts", "hooks"]) walk(join(pluginRoot, sub));
  assert.deepEqual(holders.sort(), ["lib/worktree-lifecycle.mjs", "scripts/pipeline-start-preflight.mjs"]);
});

check("D0 session-cleanup CLI accepts descriptor ownership without receiving the nonce", () => {
  const { primary } = repoFixture();
  const cleanupScript = fileURLToPath(new URL("../scripts/session-cleanup.mjs", import.meta.url));
  const started = startSessionDescriptor(primary, {
    sessionId: "session-cli-descriptor",
    ownerNonce: "owner-nonce-cli-descriptor-000001",
  });
  const scratch = mkdtempSync(join(tmpdir(), "worktree-cli-descriptor-test-"));
  fixtureRoots.push(scratch);
  const owned = join(scratch, "owned.txt");
  const common = ["--repo", primary, "--session-descriptor", started.sessionId, "--expected-descriptor-sha256", started.descriptorSha256];
  nodeCli(cleanupScript, [
    "register-intent", ...common, "--resource-id", "descriptor-cli-resource", "--type", "scratch-file",
    "--path", owned, "--content-class", "generated-output", "--policy", "unlink-file",
  ]);
  writeFileSync(owned, "temporary CLI output\n");
  nodeCli(cleanupScript, ["finalize", ...common, "--resource-id", "descriptor-cli-resource"]);
  const receipt = JSON.parse(nodeCli(cleanupScript, ["cleanup", ...common]).stdout);
  assert.equal(receipt.status, "complete");
  assert.equal(existsSync(owned), false);
  assertLifecycleError(() => loadSessionDescriptor(primary, started.sessionId), "WT-SESSION-MISSING");
});

check("D0 descriptor-only session closes cleanly without inventing a temporary manifest", () => {
  const { primary } = repoFixture();
  const cleanupScript = fileURLToPath(new URL("../scripts/session-cleanup.mjs", import.meta.url));
  const started = startSessionDescriptor(primary, {
    sessionId: "session-empty-descriptor",
    ownerNonce: "owner-nonce-empty-descriptor-0001",
  });
  const receipt = JSON.parse(nodeCli(cleanupScript, ["cleanup", "--repo", primary, "--session-descriptor", started.sessionId, "--expected-descriptor-sha256", started.descriptorSha256]).stdout);
  assert.equal(receipt.status, "complete");
  assert.deepEqual(receipt.counts, { registered: 0, removed: 0, blocked: 0 });
  assertLifecycleError(() => loadSessionDescriptor(primary, started.sessionId), "WT-SESSION-MISSING");
});

check("D0 descriptor digest drift blocks CLI cleanup before any registered resource is removed", () => {
  const { primary } = repoFixture();
  const cleanupScript = fileURLToPath(new URL("../scripts/session-cleanup.mjs", import.meta.url));
  const started = startSessionDescriptor(primary, {
    sessionId: "session-digest-drift",
    ownerNonce: "owner-nonce-digest-drift-000001",
  });
  const scratch = mkdtempSync(join(tmpdir(), "worktree-cli-digest-drift-"));
  fixtureRoots.push(scratch);
  const owned = join(scratch, "owned.txt");
  const common = ["--repo", primary, "--session-descriptor", started.sessionId, "--expected-descriptor-sha256", started.descriptorSha256];
  nodeCli(cleanupScript, ["register-intent", ...common, "--resource-id", "digest-resource", "--type", "scratch-file", "--path", owned, "--content-class", "scratch", "--policy", "unlink-file"]);
  writeFileSync(owned, "temporary\n");
  nodeCli(cleanupScript, ["finalize", ...common, "--resource-id", "digest-resource"]);
  const commonDir = discoverRepository(primary).commonDir;
  const descriptorPath = join(commonDir, "agent-pipeline", "session-descriptors", "active", `${started.sessionId}.json`);
  const descriptor = JSON.parse(readFileSync(descriptorPath, "utf8"));
  descriptor.createdAt = "2030-01-01T00:00:00.000Z";
  writeFileSync(descriptorPath, `${JSON.stringify(descriptor, null, 2)}\n`, { mode: 0o600 });
  const blocked = spawnSync(process.execPath, [cleanupScript, "cleanup", ...common], { encoding: "utf8", shell: false });
  assert.equal(blocked.status, 2);
  assert.match(blocked.stderr, /WT-SESSION-DIGEST/);
  assert.equal(existsSync(owned), true);
});

check("D0 CLI reports a blocked cleanup with exit 2", () => {
  const { primary } = repoFixture();
  const cleanupScript = fileURLToPath(new URL("../scripts/session-cleanup.mjs", import.meta.url));
  const started = startSessionDescriptor(primary, {
    sessionId: "session-blocked-cleanup",
    ownerNonce: "owner-nonce-blocked-cleanup-001",
  });
  const scratch = mkdtempSync(join(tmpdir(), "worktree-cli-blocked-cleanup-"));
  fixtureRoots.push(scratch);
  const owned = join(scratch, "owned.txt");
  const common = ["--repo", primary, "--session-descriptor", started.sessionId, "--expected-descriptor-sha256", started.descriptorSha256];
  nodeCli(cleanupScript, ["register-intent", ...common, "--resource-id", "blocked-resource", "--type", "scratch-file", "--path", owned, "--content-class", "scratch", "--policy", "unlink-file"]);
  writeFileSync(owned, "original\n");
  nodeCli(cleanupScript, ["finalize", ...common, "--resource-id", "blocked-resource"]);
  writeFileSync(owned, "changed\n");
  const blocked = spawnSync(process.execPath, [cleanupScript, "cleanup", ...common], { encoding: "utf8", shell: false });
  assert.equal(blocked.status, 2);
  const receipt = JSON.parse(blocked.stdout);
  assert.equal(receipt.status, "blocked");
  assert.equal(existsSync(owned), true);
});

check("D0 parser accepts NUL porcelain without path guessing", () => {
  const parsed = parseWorktreePorcelain("worktree /repo\0HEAD " + "a".repeat(40) + "\0branch refs/heads/main\0\0");
  assert.deepEqual(parsed, [{ path: "/repo", HEAD: "a".repeat(40), branch: "refs/heads/main" }]);
});

check("Git worktree porcelain paths are native and physical at discovery", () => {
  const { primary } = repoFixture();
  const spy = (_cmd, args, options) => {
    const result = spawnSync("git", args, options);
    if (args.includes("--porcelain")) {
      // Git for Windows reports slash-separated paths even though Node uses
      // backslashes; this fixture forces that Git representation on Windows.
      const slashPath = primary.replaceAll("\\", "/");
      result.stdout = String(result.stdout).replaceAll(primary, slashPath);
    }
    return result;
  };
  const repo = discoverRepository(primary, { spawn: spy });
  assert.equal(repo.worktrees[0].path, resolve(primary));
  assert.equal(repo.worktrees[0].path, repo.start);
});

check("WT-LOCAL-WINDOWS-ASSURANCE auto-remediates a pre-existing insecure directory instead of only failing closed", () => {
  const base = mkdtempSync(join(tmpdir(), "wt-lifecycle-win-assure-"));
  fixtureRoots.push(base);
  const existing = resolve(base, "descriptors");
  const hardened = [];
  const assessed = [];
  assureWindowsLocalDirectories(existing, existing, "WT-LOCAL-WINDOWS-ASSURANCE", {
    assess: (directory) => { assessed.push(directory); return { status: "insecure" }; },
    harden: (directory) => { hardened.push(directory); return { status: "secure" }; },
  });
  assert.deepEqual(assessed, [existing]);
  assert.deepEqual(hardened, [existing]);
});

check("WT-LOCAL-WINDOWS-ASSURANCE still fails closed when a pre-existing directory cannot be remediated", () => {
  const base = mkdtempSync(join(tmpdir(), "wt-lifecycle-win-assure-"));
  fixtureRoots.push(base);
  const existing = resolve(base, "descriptors");
  assertLifecycleError(() => assureWindowsLocalDirectories(existing, existing, "WT-LOCAL-WINDOWS-ASSURANCE", {
    assess: () => ({ status: "insecure" }),
    harden: () => ({ status: "unavailable" }),
  }), "WT-LOCAL-WINDOWS-ASSURANCE");
});

check("WT-LOCAL-WINDOWS-ASSURANCE closes the ancestor-skip gap: an insecure existing ancestor is remediated even when directories were created below it", () => {
  const base = mkdtempSync(join(tmpdir(), "wt-lifecycle-win-assure-"));
  fixtureRoots.push(base);
  const existing = resolve(base, "session-descriptors");
  const parent = resolve(existing, "active", "leaf");
  const hardened = [];
  const assessed = [];
  assureWindowsLocalDirectories(existing, parent, "WT-LOCAL-WINDOWS-ASSURANCE", {
    assess: (directory) => { assessed.push(directory); return { status: "insecure" }; },
    harden: (directory) => { hardened.push(directory); return { status: "secure" }; },
  });
  assert.deepEqual(assessed, [existing]);
  assert.deepEqual(hardened, [resolve(existing, "active"), parent, existing]);
});

check("WT-LOCAL-WINDOWS-ASSURANCE does not re-harden an already-secure existing ancestor", () => {
  const base = mkdtempSync(join(tmpdir(), "wt-lifecycle-win-assure-"));
  fixtureRoots.push(base);
  const existing = resolve(base, "session-descriptors");
  const parent = resolve(existing, "active");
  const hardened = [];
  assureWindowsLocalDirectories(existing, parent, "WT-LOCAL-WINDOWS-ASSURANCE", {
    assess: () => ({ status: "secure" }),
    harden: (directory) => { hardened.push(directory); return { status: "secure" }; },
  });
  assert.deepEqual(hardened, [parent]);
});

check("WT-LOCAL-WINDOWS-ASSURANCE still hardens every newly-created component outright, without assessing them first", () => {
  const base = mkdtempSync(join(tmpdir(), "wt-lifecycle-win-assure-"));
  fixtureRoots.push(base);
  const existing = resolve(base, "session-descriptors");
  const parent = resolve(existing, "active", "leaf");
  const assessed = [];
  const hardened = [];
  assureWindowsLocalDirectories(existing, parent, "WT-LOCAL-WINDOWS-ASSURANCE", {
    assess: (directory) => { assessed.push(directory); return { status: "secure" }; },
    harden: (directory) => { hardened.push(directory); return { status: "secure" }; },
  });
  assert.deepEqual(assessed, [existing]);
  assert.deepEqual(hardened, [resolve(existing, "active"), parent]);
});

// ---- PHX-2: runGit/discoverRepository timeout forwarding (WP5-phx2-implementation §2) ----
// worktree-lifecycle.mjs previously forwarded only cwd/env/encoding/maxBuffer/shell to
// spawnSync; no caller anywhere passed a timeout and none would have been honored. This is
// the disclosed small extension the design doc's §2 calls for, so `discoverRepository(...,
// { timeout: 5000 })` (guard-push.mjs's read side, pipeline-state.mjs's approve-push write
// side) actually bounds its git spawns.

check("D0-TO01 runGit forwards an explicit timeout to the underlying spawn call", () => {
  const { primary } = repoFixture();
  let seenOptions = null;
  const spy = (_cmd, _args, options) => {
    seenOptions = options;
    return spawnSync("git", _args, options);
  };
  runGit(primary, ["rev-parse", "HEAD"], { spawn: spy, timeout: 12345 });
  assert.equal(seenOptions.timeout, 12345);
});

check("D0-WSPAWN runGit accepts WSL EPERM only after status zero and keeps non-zero or missing status closed", () => {
  const { primary } = repoFixture();
  const eperm = Object.assign(new Error("sandbox transport completed late"), { code: "EPERM" });
  const accepted = { status: 0, stdout: "candidate\n", stderr: "", error: eperm };
  assert.equal(runGit(primary, ["rev-parse", "HEAD"], { spawn: () => accepted }), accepted);
  assertLifecycleError(() => runGit(primary, ["rev-parse", "HEAD"], { spawn: () => ({ status: 1, stdout: "", stderr: "failed" }) }), "WT-GIT-FAILED");
  assert.equal(
    runGit(primary, ["symbolic-ref", "-q", "HEAD"], { allowNonzero: true, spawn: () => ({ status: 1, stdout: "", stderr: "", error: eperm }) }).status,
    1,
  );
  assertLifecycleError(
    () => runGit(primary, ["symbolic-ref", "-q", "HEAD"], { allowNonzero: true, spawn: () => ({ status: 2, stdout: "", stderr: "bad", error: eperm }) }),
    "WT-GIT-SPAWN",
  );
  assertLifecycleError(() => runGit(primary, ["rev-parse", "HEAD"], { spawn: () => ({ status: null, stdout: "", stderr: "", error: new Error("ENOENT") }) }), "WT-GIT-SPAWN");
});

check("D0-TO02 runGit omits timeout entirely (stays undefined, not 0/null) when the caller passes none", () => {
  const { primary } = repoFixture();
  let seenOptions = null;
  const spy = (_cmd, _args, options) => {
    seenOptions = options;
    return spawnSync("git", _args, options);
  };
  runGit(primary, ["rev-parse", "HEAD"], { spawn: spy });
  assert.equal(seenOptions.timeout, undefined);
  assert.equal(Object.hasOwn(seenOptions, "timeout"), false);
});

check("D0-TO03 discoverRepository forwards its options.timeout down to every git spawn it makes", () => {
  const { primary } = repoFixture();
  const seenTimeouts = [];
  const spy = (_cmd, _args, options) => {
    seenTimeouts.push(options.timeout);
    return spawnSync("git", _args, options);
  };
  const repo = discoverRepository(primary, { spawn: spy, timeout: 5000 });
  assert.equal(repo.primaryRoot, resolve(primary));
  assert.ok(seenTimeouts.length > 0);
  assert.ok(seenTimeouts.every((t) => t === 5000));
});

check("D0-TMP-IGN listActiveSessionDescriptors ignores abandoned atomic write temporary files", () => {
  const { primary } = repoFixture();
  const started = startSessionDescriptor(primary, "test-active-tmp");
  const common = discoverRepository(primary).commonDir;
  const activeDir = join(common, "agent-pipeline", "session-descriptors", "active");
  writeFileSync(join(activeDir, ".capability-test.json.12345.abcdef.tmp"), "in-flight-bytes");
  const listed = listActiveSessionDescriptors(primary);
  assert.equal(listed.length, 1);
  assert.equal(listed[0].sessionId, started.sessionId);
  retireSessionDescriptor(primary, { sessionId: started.sessionId, ownerNonce: started.ownerNonce });
});

// RF2A (ALFRED-RF2A-20261004): typed, signature-free ARCHIVE of an orphaned
// zero-authority session descriptor. Namespace import keeps each new-API check
// individually reportable (a missing export fails one check, not the module).
import * as archiveApi from "./worktree-lifecycle.mjs";
import { linkSync } from "node:fs";

function archivePaths(primary, id, sha) {
  const dir = join(discoverRepository(primary).commonDir, "agent-pipeline", "session-descriptors");
  return { dir, archived: join(dir, "archived", `${id}.${sha}.json`), audit: join(dir, "orphan-archive-audit.jsonl") };
}

function orphanFixture(primary, id, { legacy = false } = {}) {
  const ownerNonce = `owner-nonce-${id}-000001`;
  startSessionDescriptor(primary, { sessionId: id, ownerNonce, ownerPid: -1 });
  const loaded = loadSessionDescriptor(primary, id);
  if (legacy) {
    const descriptor = JSON.parse(readFileSync(loaded.path, "utf8"));
    delete descriptor.ownerRuntime;
    descriptor.schema = "pipeline.session-descriptor.v1";
    writeFileSync(loaded.path, `${JSON.stringify(descriptor, null, 2)}\n`, { mode: 0o600 });
  }
  const reloaded = loadSessionDescriptor(primary, id);
  return { sessionId: id, ownerNonce, path: reloaded.path, sha: reloaded.descriptorSha256, bytes: readFileSync(reloaded.path) };
}

function archiveFields(d, extra = {}) {
  return { sessionId: d.sessionId, expectedDescriptorSha256: d.sha, by: "po-test", reason: "orphaned zero-authority descriptor", ...extra };
}

for (const [label, legacy, ownerStatus] of [["V2 null-owner", false, "unavailable"], ["V1 field-absent", true, "unobserved"]]) {
  check(`RF2A archive moves a ${label} descriptor byte-exactly to archived/<id>.<sha>.json with one audit record, deletes nothing, and a second run is a no-op`, () => {
    const { primary } = repoFixture();
    const d = orphanFixture(primary, legacy ? "rf2a-v1" : "rf2a-v2", { legacy });
    assert.equal(inspectSessionOwnerRuntime(primary, d.sessionId).status, ownerStatus);
    const result = archiveApi.archiveOrphanSessionDescriptor(primary, archiveFields(d));
    const paths = archivePaths(primary, d.sessionId, d.sha);
    assert.equal(result.status, "archived");
    assert.equal(result.ownerStatus, ownerStatus);
    assert.equal(result.mutated, true);
    assert.equal(existsSync(d.path), false);
    assert.deepEqual(readFileSync(paths.archived), d.bytes);
    assert.deepEqual(listActiveSessionDescriptors(primary), []);
    const lines = readFileSync(paths.audit, "utf8").split("\n").filter(Boolean);
    assert.equal(lines.length, 1);
    const audit = JSON.parse(lines[0]);
    assert.deepEqual(Object.keys(audit).sort(), ["archivedAt", "by", "descriptorSha256", "ownerStatus", "reason", "schema", "sessionId"]);
    assert.equal(audit.schema, "pipeline.session-orphan-archive-audit.v1");
    assert.equal(audit.sessionId, d.sessionId);
    assert.equal(audit.descriptorSha256, d.sha);
    assert.equal(audit.ownerStatus, ownerStatus);
    assert.equal(audit.by, "po-test");
    assert.equal(audit.reason, "orphaned zero-authority descriptor");
    assert.equal(Number.isNaN(Date.parse(audit.archivedAt)), false);
    assert.equal(lines[0].includes(d.ownerNonce), false);
    const again = archiveApi.archiveOrphanSessionDescriptor(primary, archiveFields(d));
    assert.equal(again.status, "already-archived");
    assert.equal(again.mutated, false);
    assert.equal(readFileSync(paths.audit, "utf8").split("\n").filter(Boolean).length, 1);
    assert.deepEqual(readFileSync(paths.archived), d.bytes);
    assert.deepEqual(readdirSync(join(paths.dir, "archived")), [`${d.sessionId}.${d.sha}.json`]);
  });
}

// RV-1 (RV-S1-T): V2 `ownerRuntime: null` is `unavailable`, V1 field-absent is `unobserved`; neither
// ever becomes `not-live`, and the orphan-archive gate treats both as eligible owner statuses.
// The reboot clause is not applicable to the current seam: `not-live` derives only from ESRCH on the
// recorded pid; no boot/reboot concept is consulted by inspectSessionOwnerRuntime.
for (const [label, legacy, ownerStatus] of [["V2 null-owner", false, "unavailable"], ["V1 field-absent", true, "unobserved"]]) {
  check(`RV-1: ${label} descriptor is ${ownerStatus}, never not-live, and the orphan-archive gate accepts it without inferring a dead owner`, () => {
    const { primary } = repoFixture();
    const d = orphanFixture(primary, legacy ? "rv1-v1" : "rv1-v2", { legacy });
    const onDisk = JSON.parse(readFileSync(d.path, "utf8"));
    if (legacy) assert.equal("ownerRuntime" in onDisk, false);
    else assert.equal(onDisk.ownerRuntime, null);
    const owner = inspectSessionOwnerRuntime(primary, d.sessionId);
    assert.equal(owner.status, ownerStatus);
    assert.notEqual(owner.status, "not-live");
    const eligibility = archiveApi.inspectOrphanArchiveEligibility(primary, d.sessionId);
    assert.equal(eligibility.ownerStatus, ownerStatus);
    assert.notEqual(eligibility.ownerStatus, "not-live");
    assert.notEqual(eligibility.code, "WT-ORPHAN-ARCHIVE-OWNER-OBSERVABLE");
    assert.equal(archiveApi.inspectOrphanArchiveEligibility(primary, d.sessionId).ownerStatus, ownerStatus);
  });
}

check("RF2A archive refuses a manifest, the requester's own session, digest drift, hardlink, symlink, an existing target, a placeholder operator and an observable owner, and never deletes", () => {
  const { fixture, primary } = repoFixture();
  const common = discoverRepository(primary).commonDir;
  const refused = (d, extra, code, signedRoute = false) => {
    assert.throws(
      () => archiveApi.archiveOrphanSessionDescriptor(primary, archiveFields(d, extra)),
      (error) => error instanceof WorktreeLifecycleError && error.code === code && (!signedRoute || /signed/u.test(error.message)),
    );
    assert.deepEqual(readFileSync(d.path), d.bytes);
    assert.equal(existsSync(archivePaths(primary, d.sessionId, d.sha).archived), false);
  };
  const manifest = orphanFixture(primary, "rf2a-manifest");
  mkdirSync(join(common, "agent-pipeline", "session-cleanup", "active"), { recursive: true });
  writeFileSync(join(common, "agent-pipeline", "session-cleanup", "active", "rf2a-manifest.json"), "{}\n");
  refused(manifest, {}, "WT-ORPHAN-ARCHIVE-AUTHORITY", true);
  const own = orphanFixture(primary, "rf2a-own");
  refused(own, { requesterOwnerNonce: own.ownerNonce }, "WT-ORPHAN-ARCHIVE-OWN-SESSION");
  refused(own, { requesterSessionId: own.sessionId }, "WT-ORPHAN-ARCHIVE-OWN-SESSION");
  const drift = orphanFixture(primary, "rf2a-drift");
  refused(drift, { expectedDescriptorSha256: "0".repeat(64) }, "WT-SESSION-DIGEST");
  const hard = orphanFixture(primary, "rf2a-hardlink");
  linkSync(hard.path, join(fixture, "rf2a-hardlink-copy"));
  refused(hard, {}, "WT-SESSION-DESCRIPTOR");
  const placeholder = orphanFixture(primary, "rf2a-placeholder");
  refused(placeholder, { by: "<operator>" }, "WT-ORPHAN-ARCHIVE-ARGUMENT");
  const target = orphanFixture(primary, "rf2a-target");
  const targetPaths = archivePaths(primary, target.sessionId, target.sha);
  mkdirSync(join(targetPaths.dir, "archived"), { recursive: true });
  writeFileSync(targetPaths.archived, "preexisting archive bytes");
  assert.throws(
    () => archiveApi.archiveOrphanSessionDescriptor(primary, archiveFields(target)),
    (error) => error instanceof WorktreeLifecycleError && error.code === "WT-ORPHAN-ARCHIVE-TARGET-EXISTS",
  );
  assert.deepEqual(readFileSync(target.path), target.bytes);
  assert.equal(readFileSync(targetPaths.archived, "utf8"), "preexisting archive bytes");
  if (process.platform === "linux") {
    startSessionDescriptor(primary, { sessionId: "rf2a-live", ownerNonce: "owner-nonce-rf2a-live-000001" });
    const live = loadSessionDescriptor(primary, "rf2a-live");
    refused({ sessionId: "rf2a-live", path: live.path, sha: live.descriptorSha256, bytes: readFileSync(live.path) }, {}, "WT-ORPHAN-ARCHIVE-OWNER-OBSERVABLE", true);
  }
  const symlinked = orphanFixture(primary, "rf2a-symlink");
  const real = join(fixture, "rf2a-symlink-real.json");
  writeFileSync(real, symlinked.bytes, { mode: 0o600 });
  unlinkSync(symlinked.path);
  let symlinkCreated = true;
  try { symlinkSync(real, symlinked.path); } catch { symlinkCreated = false; }
  if (symlinkCreated) refused(symlinked, {}, "WT-SESSION-DESCRIPTOR");
  assert.equal(readdirSync(join(common, "agent-pipeline", "session-descriptors", "archived")).every((name) => name.startsWith("rf2a-target.")), true);
  assert.equal(existsSync(join(common, "agent-pipeline", "session-descriptors", "orphan-archive-audit.jsonl")), false);
});

function readdirJson(path) {
  if (!existsSync(path)) return [];
  assert.equal(lstatSync(path).isSymbolicLink(), false);
  return readdirSync(path).filter((name) => name.endsWith(".json")).sort();
}

// FLAPW (ALFRED-FLAPW-20261005): a published session descriptor must never be reported as malformed,
// "not a private single-link regular file" or an unexpected entry merely because its owner retired it
// while another session was listing or loading it. The writer is already atomic (temp file + fsync +
// rename, temp names skipped by the lister), so the only observable race is a descriptor that vanishes
// between listing and load. `descriptorStageHook` retires it at the exact point a concurrent owner would.
function flapwActiveDir(primary) {
  return join(discoverRepository(primary).commonDir, "agent-pipeline", "session-descriptors", "active");
}

function flapwStart(primary, id) {
  return startSessionDescriptor(primary, { sessionId: id, ownerNonce: `owner-nonce-${id}-000001`, ownerPid: -1 });
}

function flapwRetireAt(wanted, id, { onNth = 1 } = {}) {
  let seen = 0;
  return (stage, path) => {
    if (stage !== wanted || !path.endsWith(`${id}.json`)) return;
    seen += 1;
    if (seen === onNth) unlinkSync(path);
  };
}

check("FLAPW list-all skips a descriptor retired between listing and its load and still returns the survivors", () => {
  const { primary } = repoFixture();
  flapwStart(primary, "flapw-list-a");
  flapwStart(primary, "flapw-list-b");
  const listed = listActiveSessionDescriptors(primary, { descriptorStageHook: flapwRetireAt("listed", "flapw-list-a") });
  assert.deepEqual(listed.map((entry) => entry.sessionId), ["flapw-list-b"]);
  assert.equal(existsSync(join(flapwActiveDir(primary), "flapw-list-a.json")), false);
});

for (const stage of ["before-check", "before-read"]) {
  check(`FLAPW list-all treats a descriptor that vanishes at ${stage} as absent, never as malformed or non-private`, () => {
    const { primary } = repoFixture();
    flapwStart(primary, `flapw-${stage}-a`);
    flapwStart(primary, `flapw-${stage}-b`);
    const listed = listActiveSessionDescriptors(primary, { descriptorStageHook: flapwRetireAt(stage, `flapw-${stage}-a`) });
    assert.deepEqual(listed.map((entry) => entry.sessionId), [`flapw-${stage}-b`]);
  });

  check(`FLAPW a required load of a descriptor that vanishes at ${stage} is still WT-SESSION-MISSING, never an absent result`, () => {
    const { primary } = repoFixture();
    flapwStart(primary, `flapw-req-${stage}`);
    assertLifecycleError(
      () => loadSessionDescriptor(primary, `flapw-req-${stage}`, { descriptorStageHook: flapwRetireAt(stage, `flapw-req-${stage}`) }),
      "WT-SESSION-MISSING",
    );
  });
}

check("FLAPW classifyActiveSessionDescriptors skips a descriptor retired between its listing pass and its classification load", () => {
  const { primary } = repoFixture();
  flapwStart(primary, "flapw-class-a");
  const kept = flapwStart(primary, "flapw-class-b");
  const result = archiveApi.classifyActiveSessionDescriptors(primary, {
    requesterOwnerNonce: kept.ownerNonce,
    descriptorStageHook: flapwRetireAt("before-read", "flapw-class-a", { onNth: 2 }),
  });
  assert.deepEqual(result.own.map((entry) => entry.sessionId), ["flapw-class-b"]);
  assert.deepEqual(result.foreign, []);
});

check("FLAPW a published descriptor that is still present fails closed when malformed, in the loader and in list-all", () => {
  const { primary } = repoFixture();
  const started = flapwStart(primary, "flapw-malformed");
  flapwStart(primary, "flapw-healthy");
  writeFileSync(started.path, "{\"schema\": \"pipeline.session-descr", { mode: 0o600 });
  const malformed = (error) => error instanceof WorktreeLifecycleError && error.code === "WT-SESSION-DESCRIPTOR" && /malformed/.test(error.message);
  assert.throws(() => loadSessionDescriptor(primary, "flapw-malformed"), malformed);
  assert.throws(() => listActiveSessionDescriptors(primary), malformed);
});

check("FLAPW a published descriptor that is still present fails closed when multi-linked, in the loader and in list-all", () => {
  const { primary } = repoFixture();
  const started = flapwStart(primary, "flapw-multilink");
  const extra = join(dirname(flapwActiveDir(primary)), "flapw-extra-link");
  linkSync(started.path, extra);
  try {
    const nonPrivate = (error) => error instanceof WorktreeLifecycleError && error.code === "WT-SESSION-DESCRIPTOR" && /single-link/.test(error.message);
    assert.throws(() => loadSessionDescriptor(primary, "flapw-multilink"), nonPrivate);
    assert.throws(() => listActiveSessionDescriptors(primary), nonPrivate);
  } finally {
    unlinkSync(extra);
  }
});

check("FLAPW an in-flight atomic-write temporary file holding partial bytes is never listed or loaded", () => {
  const { primary } = repoFixture();
  const started = flapwStart(primary, "flapw-inflight");
  writeFileSync(join(flapwActiveDir(primary), ".flapw-next.json.4242.0a1b2c3d4e5f.tmp"), "{\"schema\": \"pipeline.session-descr");
  assert.deepEqual(listActiveSessionDescriptors(primary).map((entry) => entry.sessionId), [started.sessionId]);
  assert.equal(archiveApi.classifyActiveSessionDescriptors(primary, {}).foreign.length, 1);
});

// R7-1a (Spec section 22.1, ALFRED R7-1A-T): Git for Windows 2.56.0.windows.1 rejects the `NUL` spelling of the
// null device (upstream git-for-windows/git#6449) and accepts `/dev/null` on every platform. RED BY DESIGN until
// R7-1A-F lands one shared `/dev/null` constant: the behavioural case fails on win32 today, the ratchet fails everywhere.
import { chmodSync } from "node:fs";
import { delimiter, relative, sep } from "node:path";

const R71A_STUB_TOKEN = "git version 2.99.0.r7-1a-stub";
// The stub mimics the regression: exit 128 with git's own message for any NUL-like null-device value in
// GIT_CONFIG_GLOBAL / GIT_CONFIG_SYSTEM or in a `-c` null-device config value; otherwise one fixed output line.
const R71A_STUB_SOURCE = String.raw`const nulLike = (value) => typeof value === "string" && /^(?:[\\/]{2}\.[\\/])?nul$/i.test(value.trim());
const nullValueKeys = ["core.hookspath", "core.attributesfile", "core.excludesfile", "core.askpass"];
const offenders = [];
for (const key of ["GIT_CONFIG_GLOBAL", "GIT_CONFIG_SYSTEM"]) if (nulLike(process.env[key])) offenders.push(process.env[key]);
const args = process.argv.slice(2);
for (let index = 0; index < args.length - 1; index += 1) {
  if (args[index] !== "-c") continue;
  const separator = args[index + 1].indexOf("=");
  if (separator > 0 && nullValueKeys.includes(args[index + 1].slice(0, separator).toLowerCase()) && nulLike(args[index + 1].slice(separator + 1))) offenders.push(args[index + 1].slice(separator + 1));
}
if (offenders.length > 0) {
  process.stderr.write("fatal: unable to access '" + offenders[0] + "': Invalid argument\n");
  process.exit(128);
}
process.stdout.write(` + JSON.stringify(`${R71A_STUB_TOKEN}\n`) + `);\n`;

function r71aInstallGitStub() {
  const dir = mkdtempSync(join(tmpdir(), "r7-1a-git-stub-"));
  fixtureRoots.push(dir);
  const script = join(dir, "git-stub.mjs");
  writeFileSync(script, R71A_STUB_SOURCE);
  writeFileSync(join(dir, "git"), `#!/bin/sh\nexec "${process.execPath}" "${script}" "$@"\n`);
  chmodSync(join(dir, "git"), 0o755);
  writeFileSync(join(dir, "git.cmd"), `@"${process.execPath}" "${script}" %*\r\n`);
  return { dir, script };
}

// The stub directory is first on the CHILD's PATH only (the env object handed to runGit); the test process's own PATH is untouched.
function r71aChildEnv(dir) {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) if (key.toLowerCase() !== "path") env[key] = value;
  env.PATH = [dir, process.env.PATH ?? ""].filter(Boolean).join(delimiter);
  return env;
}

// POSIX: runGit's default spawn resolves the `git` shim through the child's PATH. win32: spawnSync(shell:false) only
// searches `.com`/`.exe` (never `git.cmd`) and Node refuses to run a .cmd without a shell, so the PATH lookup is done
// here instead -- the shim directory must be the first PATH entry holding a git.cmd -- and the same Node stub script
// runs. Either way the child receives exactly the environment runGit builds, which is what this case pins.
function r71aPlatformSpawn(dir, script) {
  if (process.platform !== "win32") return undefined;
  return (command, args, options) => {
    assert.equal(command, "git");
    const firstShim = String(options.env.PATH).split(delimiter).find((entry) => entry && existsSync(join(entry, "git.cmd")));
    assert.equal(firstShim, dir, "the stub directory must be first on the child's PATH");
    return spawnSync(process.execPath, [script, ...args], options);
  };
}

check("R7-1a behavioural (RED on win32 today; may PASS on POSIX, which already uses /dev/null): runGit succeeds against a git that rejects NUL-like null devices", () => {
  const { dir, script } = r71aInstallGitStub();
  const direct = (value) => spawnSync(process.execPath, [script, "--version"], {
    encoding: "utf8",
    shell: false,
    env: { ...process.env, GIT_CONFIG_GLOBAL: value },
  });
  // Fixture self-check first, so a red result below is attributable to the production environment, not to the stub.
  const rejected = direct("NUL");
  assert.equal(rejected.status, 128, "fixture self-check: the stub must exit 128 for GIT_CONFIG_GLOBAL=NUL");
  assert.match(rejected.stderr, /unable to access 'NUL': Invalid argument/);
  assert.equal(direct("/dev/null").status, 0, "fixture self-check: the stub must accept GIT_CONFIG_GLOBAL=/dev/null");
  const result = runGit(dir, ["--version"], { env: r71aChildEnv(dir), spawn: r71aPlatformSpawn(dir, script) });
  assert.equal(result.stdout, `${R71A_STUB_TOKEN}\n`, "the stub, not another git, must have answered");
});

const R71A_GIT_NULL_KEYS = [
  "GIT_CONFIG_GLOBAL", "GIT_CONFIG_SYSTEM", "GIT_ASKPASS", "SSH_ASKPASS",
  "core.hooksPath", "core.attributesFile", "core.excludesFile", "core.askPass",
];
const R71A_NUL_LITERAL = /(["'`])NUL\1/i;
const R71A_NUL_EMBEDDED = /\bcore\.(?:hooksPath|attributesFile|excludesFile|askPass)=NUL\b/i;
// A win32 ternary: the "win32" literal followed (before any `;`) by a `?`. A NUL literal after it is a platform choice
// of the NUL spelling, whether the result lands directly in a git value or reaches one through a variable or helper.
const R71A_WIN32_TERNARY = /["'`]win32["'`][^;]*\?/;

// A line offends when it holds a quoted NUL literal (or an embedded `core.<key>=NUL` -c value) and either names one of
// the git null-device keys on the same line, or sits in a `process.platform === "win32"` ternary (the indirection shapes:
// a variable or helper returning NUL that is used as a git value later) -- or, for a wrapped ternary continuation line
// (`? "NUL"` / `: "NUL"`), the key or the win32 condition is within the two lines above it. Comment lines and text
// after a `//` are ignored.
function r71aNulOffences(source) {
  const lines = source.split(/\r?\n/);
  const hits = [];
  lines.forEach((text, index) => {
    if (/^\s*(?:\/\/|\/\*|\*)/.test(text)) return;
    const match = R71A_NUL_LITERAL.exec(text) ?? R71A_NUL_EMBEDDED.exec(text);
    if (!match || text.slice(0, match.index).includes("//")) return;
    const continuation = /^\s*(?:\?\?|\|\||\?|:)/.test(text);
    const above = continuation ? lines.slice(Math.max(0, index - 2), index) : [];
    const context = [text, ...above].join("\n");
    const inWin32Ternary = R71A_WIN32_TERNARY.test([...above, text.slice(0, match.index)].join("\n"));
    if (inWin32Ternary || R71A_GIT_NULL_KEYS.some((key) => context.includes(key))) hits.push({ line: index + 1, text });
  });
  return hits;
}

// Single source (Spec section 22.1, contract bullet 1): the null-device value of every git child comes from the shared
// GIT_NULL_DEVICE constant (lib/git-null-device.mjs), never from an inline "/dev/null" literal. Same key set and the
// same comment / wrapped-continuation handling as the NUL detector above; a line that holds only the literal (the
// value of a key named on the line above) is treated like a wrapped continuation.
const R71A_DEVNULL_LITERAL = /(["'`])\/dev\/null\1/;
const R71A_DEVNULL_EMBEDDED = /\bcore\.(?:hooksPath|attributesFile|excludesFile|askPass)=\/dev\/null(?![\w/.-])/;
const R71A_DEVNULL_VALUE_ONLY = /^\s*(["'`])\/dev\/null\1[\s,)\];}]*$/;

function r71aInlineDevNullOffences(source) {
  const lines = source.split(/\r?\n/);
  const hits = [];
  lines.forEach((text, index) => {
    if (/^\s*(?:\/\/|\/\*|\*)/.test(text)) return;
    const match = R71A_DEVNULL_LITERAL.exec(text) ?? R71A_DEVNULL_EMBEDDED.exec(text);
    if (!match || text.slice(0, match.index).includes("//")) return;
    const wrapped = /^\s*(?:\?\?|\|\||\?|:)/.test(text) || R71A_DEVNULL_VALUE_ONLY.test(text);
    const above = wrapped ? lines.slice(Math.max(0, index - 2), index) : [];
    const context = [text, ...above].join("\n");
    if (R71A_GIT_NULL_KEYS.some((key) => context.includes(key))) hits.push({ line: index + 1, text });
  });
  return hits;
}

// Production modules answer to both detectors (one hit per line, even when a win32 ternary trips both).
function r71aGitNullOffences(source) {
  const byLine = new Map();
  for (const hit of [...r71aNulOffences(source), ...r71aInlineDevNullOffences(source)]) if (!byLine.has(hit.line)) byLine.set(hit.line, hit);
  return [...byLine.values()].sort((a, b) => a.line - b.line);
}

// This file is itself a fixture the NUL ratchet scans, and the detector's positive controls must spell the offending
// forms. The NUL spelling is therefore assembled at run time so that no source line here matches the detector.
const R71A_NUL = ["N", "U", "L"].join("");
const r71aSample = (template) => template.replaceAll("@NUL@", R71A_NUL);

// Scan roots: the plugin's lib/, scripts/ and hooks/ trees (never harness/ -- a plugin test must stay consumer-safe).
const R71A_SCAN_ROOTS = ["lib", "scripts", "hooks"];

function r71aModules(root, { fixtures }) {
  const found = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules") continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith(".mjs") && entry.name.endsWith(".test.mjs") === fixtures) found.push(full);
    }
  };
  walk(root);
  return found.sort();
}

function r71aProductionModules(root) {
  return r71aModules(root, { fixtures: false });
}

function r71aFixtureModules(root) {
  return r71aModules(root, { fixtures: true });
}

// Scan one class of module (production or *.test.mjs fixtures) under every scan root with one detector.
function r71aScanOffences({ fixtures, detect }) {
  const libDir = dirname(fileURLToPath(import.meta.url));
  const pluginRoot = resolve(libDir, "..");
  const repoRoot = resolve(pluginRoot, "..", "..");
  const files = [];
  for (const name of R71A_SCAN_ROOTS) {
    const found = (fixtures ? r71aFixtureModules : r71aProductionModules)(resolve(pluginRoot, name));
    assert.ok(found.length > 0, `ratchet found no ${fixtures ? "fixture" : "production"} modules under ${name}/; the scan roots are wrong`);
    files.push(...found);
  }
  assert.ok(files.length > 20, `ratchet scanned only ${files.length} modules; the scan roots are wrong`);
  const offences = [];
  for (const file of files) {
    for (const hit of detect(readFileSync(file, "utf8"))) {
      offences.push(`${relative(repoRoot, file).split(sep).join("/")}:${hit.line}: ${hit.text.trim().slice(0, 140)}`);
    }
  }
  return offences;
}

check("R7-1a ratchet detector self-check: flags a win32 NUL ternary and an inline /dev/null for a git value, ignores look-alikes and the shared GIT_NULL_DEVICE constant", () => {
  assert.equal(r71aNulOffences(r71aSample('      GIT_CONFIG_GLOBAL: process.platform === "win32" ? "@NUL@" : "/dev/null",')).length, 1);
  assert.equal(r71aNulOffences(r71aSample("env.SSH_ASKPASS = '@NUL@';")).length, 1);
  assert.equal(r71aNulOffences(r71aSample('const args = ["-c", "core.hooksPath=@NUL@", "status"];')).length, 1);
  assert.equal(r71aNulOffences(r71aSample(['GIT_ASKPASS:', '  process.platform === "win32"', '    ? "@NUL@"', '    : "/bin/false",'].join("\n"))).length, 1);
  assert.equal(r71aNulOffences('      GIT_CONFIG_GLOBAL: "/dev/null",').length, 0);
  assert.equal(r71aNulOffences('const placeholder = "NUL";').length, 0);
  assert.equal(r71aNulOffences('const kind = "NULL"; // GIT_CONFIG_GLOBAL').length, 0);
  assert.equal(r71aNulOffences('// GIT_CONFIG_GLOBAL must never be "NUL" on win32').length, 0);
  assert.equal(r71aNulOffences('GIT_CONFIG_NOSYSTEM: "1",\n"x" ? y : "NUL"').length, 0);
  // Positive controls (exactly one hit each): the win32 ternary form and an inline "/dev/null" literal, each assigned to a
  // git environment value or a -c value, in every spelling the key set knows (wrapped values included).
  const flagged = [
    '      GIT_CONFIG_GLOBAL: process.platform === "win32" ? "@NUL@" : "/dev/null",',
    'const args = ["-c", `core.hooksPath=${process.platform === "win32" ? "@NUL@" : "/dev/null"}`, "status"];',
    'const nullDevice = process.platform === "win32" ? "@NUL@" : "/dev/null";',
    '      GIT_CONFIG_GLOBAL: "/dev/null",',
    '  GIT_CONFIG_SYSTEM: "/dev/null",',
    "env.GIT_ASKPASS = '/dev/null';",
    'env.SSH_ASKPASS = "/dev/null";',
    '  "-c", "core.hooksPath=/dev/null",',
    '  "-c", "core.attributesFile=/dev/null",',
    'runGit(dir, ["config", "--local", "core.hooksPath", "/dev/null"]);',
    ["GIT_CONFIG_GLOBAL:", '  "/dev/null",'].join("\n"),
    ["GIT_CONFIG_SYSTEM:", '  process.platform === "win32"', '    ? "@NUL@"', '    : "/dev/null",'].join("\n"),
  ];
  for (const sample of flagged) assert.equal(r71aGitNullOffences(r71aSample(sample)).length, 1, `must be flagged: ${sample}`);
  // Negative controls: the shared constant (its import and every use), non-git keys, comments and unrelated /dev/null checks.
  const clean = [
    'import { GIT_NULL_DEVICE } from "./git-null-device.mjs";',
    "      GIT_CONFIG_GLOBAL: GIT_NULL_DEVICE,",
    "  GIT_CONFIG_SYSTEM: GIT_NULL_DEVICE,",
    "env.GIT_ASKPASS = GIT_NULL_DEVICE;",
    'const args = ["-c", `core.hooksPath=${GIT_NULL_DEVICE}`, "status"];',
    '  "-c", `core.hooksPath=${GIT_NULL_DEVICE}`,',
    '      NPM_CONFIG_USERCONFIG: "/dev/null",',
    '  return fd === 2 && target === "/dev/null";',
    '// GIT_CONFIG_GLOBAL: "/dev/null" is the retired inline spelling',
    'const note = "GIT_CONFIG_GLOBAL"; // "/dev/null"',
    ["GIT_CONFIG_GLOBAL: GIT_NULL_DEVICE,", '      NPM_CONFIG_USERCONFIG: "/dev/null",'].join("\n"),
  ];
  for (const sample of clean) assert.equal(r71aGitNullOffences(r71aSample(sample)).length, 0, `must not be flagged: ${sample}`);
});

check("R7-1a ratchet: no production module (lib, scripts, hooks) assigns a \"NUL\" literal to a git environment or -c value", () => {
  const offences = r71aScanOffences({ fixtures: false, detect: r71aNulOffences });
  if (offences.length > 0) {
    assert.fail(`${offences.length} git null-device site(s) spell "NUL" (Git for Windows 2.56.0.windows.1 rejects it; use the shared GIT_NULL_DEVICE constant):\n  ${offences.join("\n  ")}`);
  }
});

check("R7-1a ratchet: no *.test.mjs fixture (lib, scripts, hooks) assigns a \"NUL\" literal to a git environment or -c value (fixtures may keep /dev/null)", () => {
  const offences = r71aScanOffences({ fixtures: true, detect: r71aNulOffences });
  if (offences.length > 0) {
    assert.fail(`${offences.length} fixture git null-device site(s) spell "NUL" (Git for Windows 2.56.0.windows.1 rejects it; fixtures keep /dev/null or use GIT_NULL_DEVICE):\n  ${offences.join("\n  ")}`);
  }
});

check("R7-1a single-source ratchet (RED until every site is converted): no production module (lib, scripts, hooks) spells an inline /dev/null git value; each takes GIT_NULL_DEVICE", () => {
  const offences = r71aScanOffences({ fixtures: false, detect: r71aInlineDevNullOffences });
  if (offences.length > 0) {
    assert.fail(`${offences.length} git null-device site(s) spell an inline /dev/null literal (Spec section 22.1: one shared constant; import GIT_NULL_DEVICE from lib/git-null-device.mjs):\n  ${offences.join("\n  ")}`);
  }
});

for (const root of fixtureRoots) rmSync(root, { recursive: true, force: true });
console.log(`\n${passed}/${passed + failed} checks passed.`);
process.exit(failed === 0 ? 0 : 1);
