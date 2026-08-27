#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * The BOOTSTRAP wiring of the scratch-descriptor lifecycle — the event, not the mechanism.
 *
 * `session-cleanup-binding.test.mjs` already covers bind/release/retire as functions. That
 * suite stayed green while nothing in a live flow called any of them, which is precisely how
 * the gap survived (backlog: 2026-08-08-the-scratch-cleanup-mechanism-exists-but-no-event-
 * calls-it.md). So these cases pin the wiring instead: that a bootstrap sweeps what a
 * PREVIOUS session's descriptor claims and nothing else, and that it never mints a session id
 * it was not given. A test exercising bind-then-release inside ONE session would reproduce
 * the close-path assumption the PO rejected, and is deliberately not written here.
 *
 * Run: node --test plugins/pipeline-core/scripts/pipeline-start-scratch-lifecycle.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  runBootstrapScratchLifecycle,
  runBootstrapWorktreeSweep,
  SCRATCH_LIFECYCLE_SCHEMA,
  WORKTREE_SWEEP_SCHEMA,
} from "./pipeline-start-preflight.mjs";
import { bindScratchDescriptor } from "../lib/session-cleanup-recovery.mjs";

/** A descriptor directory lives under the git common dir, so a fixture needs a real repo. */
function freshRepo() {
  const root = mkdtempSync(join(tmpdir(), "preflight-scratch-"));
  const init = spawnSync("git", ["init", "--quiet"], { cwd: root, encoding: "utf8" });
  assert.equal(init.status, 0, "fixture repository could not be initialised");
  return root;
}

// A recorded processIdentity of null keeps the liveness verdict on the injected
// isProcessAliveFn alone, instead of this machine's real boot-id for a pid it never owned.
const ANONYMOUS_OWNER = { processIdentityFn: () => null };

/** `git worktree add` needs a real commit to check out -- freshRepo() alone has none. */
function commitOne(root) {
  writeFileSync(join(root, "seed.txt"), "seed\n");
  const config1 = spawnSync("git", ["config", "user.email", "fixture@example.invalid"], { cwd: root, encoding: "utf8" });
  assert.equal(config1.status, 0);
  const config2 = spawnSync("git", ["config", "user.name", "Fixture"], { cwd: root, encoding: "utf8" });
  assert.equal(config2.status, 0);
  const add = spawnSync("git", ["add", "seed.txt"], { cwd: root, encoding: "utf8" });
  assert.equal(add.status, 0);
  const commit = spawnSync("git", ["commit", "--quiet", "-m", "seed"], { cwd: root, encoding: "utf8" });
  assert.equal(commit.status, 0, `fixture commit failed: ${commit.stderr}`);
}

test("a bootstrap retires exactly what a previous session's descriptor claims, then binds its own", () => {
  const root = freshRepo();
  const previous = bindScratchDescriptor({ rootDir: root, sessionId: "previous-session", deps: ANONYMOUS_OWNER });
  const previousDirectory = join(root, previous.scratchRelativePath);
  // A sibling under scratch/ that NO descriptor claims: the sweep runs against a tree whose
  // other contents it did not create, and must leave every one of them alone.
  const unclaimed = join(root, "scratch", "not-descriptor-bound");
  mkdirSync(unclaimed, { recursive: true });
  assert.equal(existsSync(previousDirectory), true);

  const result = runBootstrapScratchLifecycle({
    rootDir: root,
    env: { PIPELINE_SCRATCH_SESSION_ID: "current-session" },
    deps: { ...ANONYMOUS_OWNER, isProcessAliveFn: () => false },
  });

  assert.equal(result.schema, SCRATCH_LIFECYCLE_SCHEMA);
  assert.deepEqual(result.faults, []);
  assert.equal(result.sweep.retiredCount, 1);
  assert.equal(existsSync(previousDirectory), false, "the previous session's claimed directory survives the sweep");
  assert.equal(existsSync(unclaimed), true, "the sweep removed a directory no descriptor claimed");
  assert.equal(result.binding.status, "bound");
  assert.equal(existsSync(join(root, result.binding.scratchRelativePath)), true);
});

test("a live previous session is never swept out from under itself", () => {
  const root = freshRepo();
  const live = bindScratchDescriptor({ rootDir: root, sessionId: "live-session", deps: ANONYMOUS_OWNER });
  const result = runBootstrapScratchLifecycle({
    rootDir: root,
    env: {},
    deps: { ...ANONYMOUS_OWNER, isProcessAliveFn: () => true },
  });
  assert.equal(result.sweep.retiredCount, 0);
  assert.equal(result.sweep.retainedCount, 1);
  assert.equal(existsSync(join(root, live.scratchRelativePath)), true);
});

test("a bootstrap with no session identity sweeps and binds nothing, rather than minting an id", () => {
  const root = freshRepo();
  // This case exercises the "no session identity" path specifically, not the "scratch/ does
  // not exist yet" skip path pinned separately below -- so the fixture pre-creates scratch/.
  mkdirSync(join(root, "scratch"), { recursive: true });
  const result = runBootstrapScratchLifecycle({
    rootDir: root,
    env: {},
    deps: { ...ANONYMOUS_OWNER, isProcessAliveFn: () => false },
  });
  assert.equal(result.binding.status, "unbound-no-session-identity");
  assert.equal(result.sweep.retiredCount, 0);
  assert.deepEqual(result.faults, []);
});

test("a bootstrap skips the sweep entirely when scratch/ does not already exist, and creates nothing", () => {
  const root = freshRepo();
  const scratchPath = join(root, "scratch");
  assert.equal(existsSync(scratchPath), false);

  const result = runBootstrapScratchLifecycle({
    rootDir: root,
    env: { PIPELINE_SCRATCH_SESSION_ID: "current-session" },
    deps: { ...ANONYMOUS_OWNER, isProcessAliveFn: () => false },
  });

  assert.equal(result.schema, SCRATCH_LIFECYCLE_SCHEMA);
  assert.deepEqual(result.faults, []);
  assert.equal(result.sweep, null);
  assert.equal(result.binding.status, "skipped-no-scratch-directory");
  assert.equal(existsSync(scratchPath), false, "the bootstrap must not create scratch/ when it did not already exist");
  const status = spawnSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" });
  assert.equal(status.status, 0);
  assert.equal(status.stdout, "", "the bootstrap must not dirty the git tree when scratch/ did not already exist");
});

test("a bootstrap still sweeps and binds as before when scratch/ already exists", () => {
  const root = freshRepo();
  const previous = bindScratchDescriptor({ rootDir: root, sessionId: "previous-session", deps: ANONYMOUS_OWNER });
  const previousDirectory = join(root, previous.scratchRelativePath);
  assert.equal(existsSync(join(root, "scratch")), true);

  const result = runBootstrapScratchLifecycle({
    rootDir: root,
    env: { PIPELINE_SCRATCH_SESSION_ID: "current-session" },
    deps: { ...ANONYMOUS_OWNER, isProcessAliveFn: () => false },
  });

  assert.equal(result.schema, SCRATCH_LIFECYCLE_SCHEMA);
  assert.deepEqual(result.faults, []);
  assert.equal(result.sweep.retiredCount, 1);
  assert.equal(existsSync(previousDirectory), false, "the previous session's claimed directory survives the sweep");
  assert.equal(result.binding.status, "bound");
  assert.equal(existsSync(join(root, result.binding.scratchRelativePath)), true);
});

test("the lifecycle is fail-open: an unusable root is a typed fault, never a throw", () => {
  const result = runBootstrapScratchLifecycle({
    rootDir: join(tmpdir(), "preflight-scratch-does-not-exist-", `${process.pid}`),
    env: {},
  });
  assert.equal(result.schema, SCRATCH_LIFECYCLE_SCHEMA);
  assert.equal(result.sweep, null);
  assert.equal(result.faults.length, 1);
  // The code travels; the message and the path deliberately do not.
  assert.match(result.faults[0], /^sweep:[A-Za-z0-9_-]+$/u);
});

// NVA-SCRATCHSWEEP-1: runBootstrapWorktreeSweep -- the bootstrap EVENT wiring for
// `.claude/worktrees/` (backlog: 2026-08-27-stale-worktree-directories-accumulate-with-no-
// sweep.md). Deliberately a separate function/schema from runBootstrapScratchLifecycle above
// so none of that function's own pinned assertions (immediately above) needed to change.
// The underlying safety predicate (never remove a git-known worktree; never remove a
// directory without a genuine worktree `.git` pointer) is unit-tested directly against
// `planOrphanWorktreeDirectories`/`retireOrphanWorktreeDirectories` in
// `lib/session-cleanup-recovery.test.mjs`; these cases pin only the bootstrap wiring itself.

test("runBootstrapWorktreeSweep retires exactly an orphaned worktree directory and reports zero faults", () => {
  const root = freshRepo();
  commitOne(root);
  const worktreePath = join(root, ".claude", "worktrees", "orphaned-one");
  const add = spawnSync("git", ["worktree", "add", "--detach", worktreePath], { cwd: root, encoding: "utf8" });
  assert.equal(add.status, 0, `fixture git worktree add failed: ${add.stderr}`);
  const pointerRaw = readFileSync(join(worktreePath, ".git"), "utf8");
  const pointerMatch = /^gitdir:\s*(.+)$/mu.exec(pointerRaw);
  assert.ok(pointerMatch, "fixture worktree must carry a gitdir pointer file");
  const adminDir = pointerMatch[1].trim();
  assert.equal(existsSync(adminDir), true);
  rmSync(adminDir, { recursive: true, force: true });
  assert.equal(existsSync(worktreePath), true, "the working directory itself must still be present");

  const result = runBootstrapWorktreeSweep({ rootDir: root });

  assert.equal(result.schema, WORKTREE_SWEEP_SCHEMA);
  assert.deepEqual(result.faults, []);
  assert.equal(result.sweep.retiredCount, 1);
  assert.equal(existsSync(worktreePath), false, "the orphaned worktree directory must be removed by the sweep");
});

test("runBootstrapWorktreeSweep never removes a worktree directory git still knows about", () => {
  const root = freshRepo();
  commitOne(root);
  const worktreePath = join(root, ".claude", "worktrees", "live-one");
  const add = spawnSync("git", ["worktree", "add", "--detach", worktreePath], { cwd: root, encoding: "utf8" });
  assert.equal(add.status, 0, `fixture git worktree add failed: ${add.stderr}`);

  const result = runBootstrapWorktreeSweep({ rootDir: root });

  assert.equal(result.schema, WORKTREE_SWEEP_SCHEMA);
  assert.deepEqual(result.faults, []);
  assert.equal(result.sweep.retiredCount, 0);
  assert.equal(existsSync(worktreePath), true, "a git-known worktree must survive the sweep");
});

test("runBootstrapWorktreeSweep is fail-open: an unusable root is a typed fault, never a throw -- proving a sweep failure cannot block bootstrap", () => {
  const result = runBootstrapWorktreeSweep({
    rootDir: join(tmpdir(), "preflight-worktree-sweep-does-not-exist-", `${process.pid}`),
  });
  assert.equal(result.schema, WORKTREE_SWEEP_SCHEMA);
  assert.equal(result.sweep, null);
  assert.equal(result.faults.length, 1);
  assert.match(result.faults[0], /^sweep:[A-Za-z0-9_-]+$/u);
});

test("runBootstrapWorktreeSweep does nothing and creates nothing when .claude/worktrees does not exist", () => {
  const root = freshRepo();
  const result = runBootstrapWorktreeSweep({ rootDir: root });
  assert.equal(result.schema, WORKTREE_SWEEP_SCHEMA);
  assert.deepEqual(result.faults, []);
  assert.equal(result.sweep.retiredCount, 0);
  assert.equal(existsSync(join(root, ".claude", "worktrees")), false);
});
