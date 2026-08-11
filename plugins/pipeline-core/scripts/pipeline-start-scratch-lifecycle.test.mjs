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
import { existsSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runBootstrapScratchLifecycle, SCRATCH_LIFECYCLE_SCHEMA } from "./pipeline-start-preflight.mjs";
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
  const result = runBootstrapScratchLifecycle({
    rootDir: root,
    env: {},
    deps: { ...ANONYMOUS_OWNER, isProcessAliveFn: () => false },
  });
  assert.equal(result.binding.status, "unbound-no-session-identity");
  assert.equal(result.sweep.retiredCount, 0);
  assert.deepEqual(result.faults, []);
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
