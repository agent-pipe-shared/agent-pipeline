#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
//
// backlog: 2026-08-08-the-guard-refuses-the-recovery-the-inspection-prescribes.md
// (Direction 4). The missing test level the three C1/C2/C3 findings all
// share: nothing asserted that a `nextAction` project-onboarding-v3.mjs
// hands an operator is one guard-lifecycle-ready.mjs actually admits. This
// suite drives the REAL, dependency-injected `inspectProjectOnboardingV3`
// (never a hand-typed result shape -- that is the exact anti-pattern that
// let the guard's `nextAction === null` clause stay dead against real state
// since 2026-08-02) and feeds its REAL output into the REAL guard.
//
// Scope (AC-9): this enumerates the PO-authority-rebind-unavailable family
// from `PO_AUTHORITY_REBIND_UNAVAILABLE_DIAGNOSTICS`, the exact table
// `project-onboarding-v3.mjs` reads to build these diagnostics -- a reason
// added to that table is covered here without anyone remembering to add a
// case. It does NOT enumerate every `nextAction` project-onboarding-v3.mjs
// can return anywhere in its ~4000 lines (kickoff, cleanup, manifest repair,
// remote adoption, ...): each of those surfaces has its own independently
// fixtured "reach this exact state" setup, and building a generic
// state-space walker for all of them was not achievable inside this
// dispatch's scope/budget. This is the one surface backlog item C1
// concerns, and the one this task fixed.
//
// Reusing the fixture used to cost 109 unrelated test cases: importing
// project-onboarding-v3.test.mjs ran its whole suite as an import side effect,
// so its output appeared above this one's -- noise and a false-attribution
// risk. Closed 2026-08-09: that file now guards its own `test()` behind
// `isDirectInvocation`, so an importer gets the exported helpers and nothing
// else, while running it directly is unchanged. Duplicating the fixture instead
// was never on the table -- it is the exact failure mode this file exists to
// prevent.

import assert from "node:assert/strict";
import test from "node:test";

import { evaluateLifecycleReadyGuard } from "./guard-lifecycle-ready.mjs";
import { ProjectOnboardingReadyError } from "../lib/project-onboarding-ready-gate.mjs";
import {
  inspectProjectOnboardingV3,
  PO_AUTHORITY_REBIND_UNAVAILABLE_DIAGNOSTICS,
} from "../lib/project-onboarding-v3.mjs";
import {
  clearRuntimeBarrier,
  completeKickoff,
  dispose,
  fakeDeps,
  initializeRestartRequiredRoot,
  PLUGIN_PIPELINE_STATE_SCRIPT,
  root,
} from "../lib/project-onboarding-v3.test.mjs";

function bash(command) { return { tool_name: "Bash", tool_input: { command } }; }
function deny() {
  throw new ProjectOnboardingReadyError("PORG-NOT-READY", "raw lifecycle message", {
    intent: "session",
    lifecycleStatus: "partial",
  });
}
function commandFor(action) {
  return `node '${action.argv[0]}' ${action.argv.slice(1).join(" ")}`;
}

test("every offered PO-authority-rebind-planner nextAction is admitted by the real guard", () => {
  const path = root();
  try {
    const barrier = initializeRestartRequiredRoot(path);
    clearRuntimeBarrier(path, barrier);
    completeKickoff(path);
    const observed = inspectProjectOnboardingV3({
      runner: "codex",
      rootDir: path,
      intent: "session",
      deps: {
        ...fakeDeps,
        validatePoGateAuthorityForRepository() {
          return { ok: false, code: "PO-GATE-PLAN-DIGEST-STALE" };
        },
      },
    });
    assert.equal(observed.status, "partial");
    assert.equal(observed.diagnostics[0]?.code, "po_authority_rebind_unavailable");
    assert.equal(observed.nextAction?.argv?.[1], "po-authority-rebind-plan");
    const offered = PO_AUTHORITY_REBIND_UNAVAILABLE_DIAGNOSTICS.filter((entry) => entry.offersPlannerRetry);
    assert.ok(offered.length > 0);
    for (const entry of offered) {
      // Same real `observed.nextAction` (proven authentic above) under each
      // typed code the producing table names -- the code is what the guard
      // gates on; the nextAction shape is a fixed literal shared by every
      // entry in this branch (verified directly against source in this
      // dispatch's report).
      const withCode = { ...observed, diagnostics: [{ ...observed.diagnostics[0], code: entry.code }] };
      const result = evaluateLifecycleReadyGuard(bash(commandFor(observed.nextAction)), {
        projectDir: path,
        requireProjectOnboardingReadyFn: deny,
        inspectProjectOnboardingV3Fn() { return withCode; },
      });
      assert.deepEqual(result, { exitCode: 0, stderr: "" }, entry.code);
    }
  } finally { dispose(path); }
});

test("the rejected-planner diagnostic offers, and the guard admits, no action (AC-6 branch b)", () => {
  const path = root();
  try {
    const barrier = initializeRestartRequiredRoot(path);
    clearRuntimeBarrier(path, barrier);
    completeKickoff(path);
    const rejected = inspectProjectOnboardingV3({
      runner: "codex",
      rootDir: path,
      intent: "session",
      deps: {
        ...fakeDeps,
        validatePoGateAuthorityForRepository() {
          return { ok: false, code: "PO-GATE-PRD-SPEC-MISMATCH" };
        },
        spawnSync(command, args, options) {
          if (command === process.execPath
            && JSON.stringify(args) === JSON.stringify([PLUGIN_PIPELINE_STATE_SCRIPT, "po-authority-rebind-plan"])) {
            return { status: 2, stderr: "closed preimage mismatch\n", stdout: "" };
          }
          return fakeDeps.spawnSync(command, args, options);
        },
      },
    });
    assert.equal(rejected.status, "partial");
    assert.equal(rejected.diagnostics[0]?.code, "po_authority_rebind_planner_rejected");
    assert.equal(rejected.nextAction, null);
    const entry = PO_AUTHORITY_REBIND_UNAVAILABLE_DIAGNOSTICS.find((row) => row.reason === "planner-rejected");
    assert.equal(entry.offersPlannerRetry, false);
    // No action was offered; prove the guard also refuses the command an
    // operator might still try, so this exact class (a code the guard
    // admits with no real route behind it) cannot regress silently.
    const stillTried = `node '${PLUGIN_PIPELINE_STATE_SCRIPT}' po-authority-rebind-plan`;
    const result = evaluateLifecycleReadyGuard(bash(stillTried), {
      projectDir: path,
      requireProjectOnboardingReadyFn: deny,
      inspectProjectOnboardingV3Fn() { return rejected; },
    });
    assert.equal(result.exitCode, 2);
  } finally { dispose(path); }
});
