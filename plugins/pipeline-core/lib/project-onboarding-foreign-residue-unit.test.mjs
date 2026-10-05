#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
//
// ALFRED-RDY-20261005: the decision "is this retained residue foreign?" against REAL session
// descriptors in a throw-away `git init` fixture under os.tmpdir() -- no onboarding fixture needed.
// The incident shapes (schema-v2 descriptor, `ownerRuntime: null`, plus the cleanup manifest a Verify
// run registers for its run directory) are rebuilt through the real descriptor API.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, openSync, realpathSync, rmSync } from "node:fs";
import { tmpdir, devNull } from "node:os";
import { join } from "node:path";
import { foreignDescriptorResidueWarning } from "./project-onboarding-v3.mjs";
import { validForeignCleanupResidueWarning } from "./project-onboarding-ready-gate.mjs";
import { registerTestCaseCompletion } from "./test-case-completion.mjs";
import {
  classifyActiveSessionDescriptors, listActiveSessionDescriptors, registerTemporaryIntent, startSessionDescriptor,
} from "./worktree-lifecycle.mjs";

const DEAD_PID = 2_147_483_646;
const KILLED_VERIFY = "session-4a4b3cc55b3eaefdac609226"; // killed Verify after a host crash
const STOPPED_VERIFY = "session-886584b7b8b438f5dfd1cb45"; // stopped Verify; plan-archive-orphan refused it (AUTHORITY)
const OWN = "session-0a0a0a0a0a0a0a0a0a0a0a0a";
const BARE = "session-0b0b0b0b0b0b0b0b0b0b0b0b";

// Cases are declared with stable ids and registered together through the completion protocol at the end of the file.
const cases = [];
function register(id, name, run) {
  cases.push({ id, name, run });
}

function fixture() {
  const path = realpathSync(mkdtempSync(join(tmpdir(), "rdy-foreign-residue-")));
  const init = spawnSync("git", ["init", "--quiet", path], { encoding: "utf8" });
  assert.equal(init.status, 0, "fixture git init");
  return path;
}

function seed(path, sessionId, { manifest }) {
  const started = startSessionDescriptor(path, { sessionId, ownerPid: DEAD_PID });
  if (manifest) {
    const runDirectory = join(started.repo.commonDir, "agent-pipeline", "verify", "runs", `${sessionId}-run`);
    // Owner-private (0700) on every created component: registerTemporaryIntent("verify-run-directory")
    // refuses a run root whose mode is group/other accessible on POSIX (ignored on native Windows,
    // where the production check hardens the DACL itself). The default 0777 & ~umask = 0755 failed
    // that check on Unix.
    mkdirSync(runDirectory, { recursive: true, mode: 0o700 });
    registerTemporaryIntent(path, {
      sessionId, ownerNonce: started.ownerNonce, resourceId: `verify-${sessionId.slice(-12)}`,
      type: "verify-run-directory", path: runDirectory, contentClass: "verify-recovery",
      soleCopy: false, cleanupPolicy: "remove-directory",
    });
  }
  return started;
}

const warningFor = (path, requesterOwnerNonce) => foreignDescriptorResidueWarning({ root: path, deps: { requesterOwnerNonce } });

register("PFRU01", "foreign descriptors (incident shapes, with and without resources) are a warning, never a lock", () => {
  const path = fixture();
  try {
    for (const [sessionId, manifest] of [[KILLED_VERIFY, true], [STOPPED_VERIFY, true], [BARE, false]]) {
      seed(path, sessionId, { manifest });
      const warning = warningFor(path, "");
      assert.notEqual(warning, null, `${sessionId} must be classified as foreign residue`);
      assert.equal(warning.code, "cleanup_residue_foreign");
      assert.equal(warning.severity, "warning");
      assert.equal(warning.nextAction.argv[1], "plan-archive-orphan");
      assert.equal(warning.nextAction.mutation, false);
      assert.equal(validForeignCleanupResidueWarning(warning, path), true, "the ready gate must admit the warning");
    }
    assert.equal(listActiveSessionDescriptors(path).length, 3, "classification must not touch any descriptor");
  } finally { rmSync(path, { recursive: true, force: true }); }
});

register("PFRU02", "the requester's own descriptor (matching owner nonce) keeps today's blocking behaviour", () => {
  const path = fixture();
  try {
    seed(path, KILLED_VERIFY, { manifest: true });
    const own = seed(path, OWN, { manifest: true });
    assert.deepEqual(classifyActiveSessionDescriptors(path, { requesterOwnerNonce: own.ownerNonce }).own.map((entry) => entry.sessionId), [OWN]);
    assert.equal(warningFor(path, own.ownerNonce), null, "own + foreign: no downgrade");
    assert.notEqual(warningFor(path, "someone-else"), null, "a different nonce owns nothing");
    assert.equal(listActiveSessionDescriptors(path).length, 2);
  } finally { rmSync(path, { recursive: true, force: true }); }
});

register("PFRU03", "no descriptor at all, or an unreadable inventory, yields no warning (fail closed)", () => {
  const path = fixture();
  try {
    assert.equal(warningFor(path, ""), null);
    assert.equal(foreignDescriptorResidueWarning({ root: path, deps: { requesterOwnerNonce: "", classifyActiveSessionDescriptors() { throw new Error("unreadable"); } } }), null);
  } finally { rmSync(path, { recursive: true, force: true }); }
});

assert.equal(cases.length, 3, "the complete foreign-residue unit corpus must register before execution");
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync(devNull, "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: cases, fd: completionFd, maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });
