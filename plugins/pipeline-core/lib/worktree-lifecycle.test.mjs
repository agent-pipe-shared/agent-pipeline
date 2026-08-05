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
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  WorktreeLifecycleError,
  canonicalBranchTarget,
  canonicalDetachedTarget,
  checkSessionHygiene,
  cleanupSession,
  createBranchWorktree,
  createDetachedWorktree,
  discoverRepository,
  ensurePrimaryBranchExclude,
  finalizeTemporaryResource,
  inspectTemporaryResource,
  inspectSessionClosure,
  inspectSessionOwnerRuntime,
  migrateBranchWorktree,
  parseWorktreePorcelain,
  rawSha256,
  registerTemporaryIntent,
  loadSessionDescriptor,
  retireSessionDescriptor,
  sealTemporaryResource,
  startSessionDescriptor,
} from "./worktree-lifecycle.mjs";
import { main as worktreeCreateMain } from "../scripts/worktree-create.mjs";

let passed = 0;
let failed = 0;
const fixtureRoots = [];

function check(name, fn) {
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
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null", LC_ALL: "C" },
  });
  if (result.error || (!allowNonzero && result.status !== 0)) {
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
  if (result.error || result.status !== 0) {
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

function readdirJson(path) {
  if (!existsSync(path)) return [];
  assert.equal(lstatSync(path).isSymbolicLink(), false);
  return readdirSync(path).filter((name) => name.endsWith(".json")).sort();
}

for (const root of fixtureRoots) rmSync(root, { recursive: true, force: true });
console.log(`\n${passed}/${passed + failed} checks passed.`);
process.exit(failed === 0 ? 0 : 1);
