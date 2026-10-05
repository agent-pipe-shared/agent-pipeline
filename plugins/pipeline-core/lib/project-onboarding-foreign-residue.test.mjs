#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
//
// ALFRED-RDY-20261005 (PO decision "Readiness root fix", 2026-10-05): session readiness depends only
// on the requesting session's own descriptor. A foreign descriptor -- any producer, live or dead, with
// or without resources, owner observable or not -- is a warning on a ready result, never `partial`.
//
// The two incident descriptors are rebuilt here in their real shape (a schema-v2 descriptor with
// `ownerRuntime: null`, i.e. an owner that can never be observed, plus the cleanup manifest a Verify
// run registers for its run directory) inside a throw-away fixture repository; nothing is read from or
// written to the real repository's private state.

import assert from "node:assert/strict";
import { mkdirSync, openSync } from "node:fs";
import { devNull } from "node:os";
import { join } from "node:path";
import { inspectProjectOnboardingV3 } from "./project-onboarding-v3.mjs";
import { validForeignCleanupResidueWarning } from "./project-onboarding-ready-gate.mjs";
import { registerTestCaseCompletion } from "./test-case-completion.mjs";
import { listActiveSessionDescriptors, registerTemporaryIntent, startSessionDescriptor } from "./worktree-lifecycle.mjs";
import {
  clearRuntimeBarrier, completeKickoff, dispose, fakeDeps, initializeRestartRequiredRoot, root,
} from "./project-onboarding-v3.test.mjs";

const DEAD_PID = 2_147_483_646;
const KILLED_VERIFY = "session-4a4b3cc55b3eaefdac609226"; // killed Verify after a host crash
const STOPPED_VERIFY = "session-886584b7b8b438f5dfd1cb45"; // stopped Verify; plan-archive-orphan refused it (AUTHORITY)
const OWN = "session-0a0a0a0a0a0a0a0a0a0a0a0a";
const BARE_ORPHAN = "session-0b0b0b0b0b0b0b0b0b0b0b0b";

// Cases are declared with stable ids and registered together through the completion protocol at the end of the file.
const cases = [];
function register(id, name, run) {
  cases.push({ id, name, run });
}

function seed(path, sessionId, { manifest }) {
  const started = startSessionDescriptor(path, { sessionId, ownerPid: DEAD_PID });
  if (manifest) {
    const runDirectory = join(started.repo.commonDir, "agent-pipeline", "verify", "runs", `${sessionId}-run`);
    // Owner-private (0700) on every created component: registerTemporaryIntent("verify-run-directory")
    // refuses a run root whose mode is group/other accessible on POSIX (same fix as the sibling
    // -unit fixture; ignored on native Windows, where the production check hardens the DACL).
    mkdirSync(runDirectory, { recursive: true, mode: 0o700 });
    registerTemporaryIntent(path, {
      sessionId, ownerNonce: started.ownerNonce, resourceId: `verify-${sessionId.slice(-12)}`,
      type: "verify-run-directory", path: runDirectory, contentClass: "verify-recovery",
      soleCopy: false, cleanupPolicy: "remove-directory",
    });
  }
  return started;
}

// The retained-binding state a Verify run's own descriptor produced: bound, active, no typed action.
function readiness(path) {
  return inspectProjectOnboardingV3({
    runner: "codex", rootDir: path, intent: "session",
    deps: {
      ...fakeDeps,
      planSessionCleanupRecovery() {
        return { schema: "pipeline.session-cleanup-recovery-plan.v1", status: "cleanup-required" };
      },
    },
  });
}

function assertForeignWarning(observed, path, label) {
  assert.equal(observed.status, "ready", `${label}: foreign residue must not lock readiness (${JSON.stringify(observed.diagnostics)})`);
  assert.equal(observed.diagnostics.length, 1, label);
  const [warning] = observed.diagnostics;
  assert.equal(warning.code, "cleanup_residue_foreign", label);
  assert.equal(warning.severity, "warning", label);
  assert.equal(warning.nextAction.argv[1], "plan-archive-orphan", label);
  assert.equal(warning.nextAction.mutation, false, label);
  assert.equal(validForeignCleanupResidueWarning(warning, observed.root), true, `${label}: the ready gate must admit the warning`);
}

// One case: the incident steps below are sequential and share one fixture root (each step seeds a further descriptor
// on top of the previous ones), so they are not independent scenarios.
register("PFR01", "foreign session descriptors never lock session readiness; the requester's own descriptor still does", () => {
  const previousNonce = process.env.PIPELINE_SESSION_OWNER_NONCE;
  delete process.env.PIPELINE_SESSION_OWNER_NONCE;
  const path = root();
  try {
    const barrier = initializeRestartRequiredRoot(path);
    clearRuntimeBarrier(path, barrier);
    completeKickoff(path);

    // Incident 1: killed Verify (host crash) -- descriptor with unobservable owner + retained run directory.
    seed(path, KILLED_VERIFY, { manifest: true });
    assertForeignWarning(readiness(path), path, "killed Verify descriptor");

    // Incident 2: stopped Verify -- the second descriptor on top of the first.
    seed(path, STOPPED_VERIFY, { manifest: true });
    assertForeignWarning(readiness(path), path, "both incident descriptors");

    // A bare zero-resource orphan beside them is equally foreign.
    seed(path, BARE_ORPHAN, { manifest: false });
    assertForeignWarning(readiness(path), path, "incidents plus a bare orphan");
    assert.equal(listActiveSessionDescriptors(path).length, 3, "readiness must not touch a foreign descriptor");

    // The requesting session's own descriptor (matching PIPELINE_SESSION_OWNER_NONCE) with retained
    // resources keeps today's non-ready result -- even though foreign descriptors are present too.
    const own = seed(path, OWN, { manifest: true });
    process.env.PIPELINE_SESSION_OWNER_NONCE = own.ownerNonce;
    const blocked = readiness(path);
    assert.equal(blocked.status, "partial");
    assert.equal(blocked.diagnostics[0].code, "cleanup_recovery_required");
    assert.equal(blocked.nextAction.argv[1], "plan-human-recovery");
    assert.equal(listActiveSessionDescriptors(path).length, 4, "readiness must not touch any descriptor");
  } finally {
    if (previousNonce === undefined) delete process.env.PIPELINE_SESSION_OWNER_NONCE;
    else process.env.PIPELINE_SESSION_OWNER_NONCE = previousNonce;
    dispose(path);
  }
});

assert.equal(cases.length, 1, "the complete foreign-residue corpus must register before execution");
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync(devNull, "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: cases, fd: completionFd, maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });
