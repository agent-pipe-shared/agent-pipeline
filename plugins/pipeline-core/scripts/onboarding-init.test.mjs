#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * Process-level regression harness for onboarding-init.mjs, same idiom as
 * project-onboarding-e2e.test.mjs: this spawns the shipped CLI entry points against
 * disposable, real temporary directories rather than importing project-onboarding-v3.mjs's
 * library seams, so what is exercised is exactly what an agent invoking this driver would
 * get -- real `git`, real filesystem writes, real subprocess boundaries. Only the
 * non-converging step-cap scenario below uses a synthetic `run` responder: constructing a
 * genuinely infinite real onboarding chain is not a real repository shape, so mocking is
 * the more honest choice there.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { DEFAULT_STEP_CAP, SCHEMA, driveOnboardingInit } from "./onboarding-init.mjs";

function freshRoot() {
  return mkdtempSync(join(tmpdir(), "onboarding-init-test-"));
}

function dispose(path) {
  rmSync(path, { recursive: true, force: true });
}

// Every driver test below pins `runner` explicitly, and that is load-bearing rather than
// tidy. Without it the onboarding CLI resolves the lane from the ENVIRONMENT, so this suite
// asserted one thing under an agent (CLAUDECODE=1 -> claude -> a real collect-input
// question) and a different thing in an operator's own shell (no marker -> codex -> a Codex
// restart barrier the driver correctly refuses as `unsupported-next-action`). Measured
// 2026-08-28: eight green runs under an agent, and a deterministic double failure under
// `env -u CLAUDECODE`. A suite in the verify gate must not have two legitimate outcomes
// depending on who runs it.
test("driveOnboardingInit: the runner lane is the caller's, not the ambient environment's", () => {
  const root = freshRoot();
  try {
    // Pinned claude: a fresh repository reaches a genuine published question. Since
    // NVA-V3-PENDINGASKS, that is the pendingAsks stop published on the `apply-portable-seed`
    // command step (author identity/push-approval/verify-contract), reached before the
    // later intake-consent collect-input this test pinned pre-fix -- surfacing it earlier is
    // exactly this task's fix, not a regression here.
    const claude = driveOnboardingInit({ rootDir: root, runner: "claude" });
    assert.equal(claude.runner, "claude", "the resolved lane is reported, not left for the caller to assume");
    assert.equal(claude.outcome, "pending-asks");
    assert.equal(claude.steps[0].argv.includes("--runner"), true, "the pinned lane reaches the first inspect");

    // Pinned codex on the SAME fresh repository shape: pendingAsks itself is not
    // runner-specific (both lanes reach it here), but the pinned lane is still what decides
    // WHICH runner value is threaded through every constructed step -- reported and
    // asserted below rather than assumed. (The Codex restart barrier this test previously
    // distinguished the lanes by is reached LATER in the chain, past where pendingAsks now
    // stops the driver first -- NVA-V3-PENDINGASKS moved the first stop earlier.)
    const other = freshRoot();
    try {
      const codex = driveOnboardingInit({ rootDir: other, runner: "codex" });
      assert.equal(codex.runner, "codex");
      // The load-bearing assertion, and deliberately not `codex.runner !== claude.runner`,
      // which is true by construction of the two calls and would prove nothing: the pinned
      // lane must actually be THREADED into every step this driver constructs. Read the
      // value that follows `--runner` in each step's argv and require it to be this lane's,
      // on both sides -- so a driver that accepted the parameter and then inherited an
      // ambient runner anyway would fail here.
      const runnerValues = (result) => result.steps.map((step) => step.argv[step.argv.indexOf("--runner") + 1]);
      assert.deepEqual(new Set(runnerValues(codex)), new Set(["codex"]), "every codex-lane step carries the codex runner");
      assert.deepEqual(new Set(runnerValues(claude)), new Set(["claude"]), "every claude-lane step carries the claude runner");
    } finally {
      dispose(other);
    }

    // Omitting the runner stays the CLI's own environment resolution -- unchanged
    // behaviour, reported as null so a caller can tell it was never pinned. Only the
    // reported field is asserted: the OUTCOME of that path is environment-dependent by
    // construction, which is the very thing this test exists to keep out of the others.
    const ambient = freshRoot();
    try {
      assert.equal(driveOnboardingInit({ rootDir: ambient, runner: null }).runner, null);
    } finally {
      dispose(ambient);
    }
  } finally {
    dispose(root);
  }
});

test("driveOnboardingInit: stops at the first published ask (pendingAsks or collect-input) without inventing any of its values", () => {
  const root = freshRoot();
  try {
    const result = driveOnboardingInit({ rootDir: root, runner: "claude" });
    assert.equal(result.schema, SCHEMA);
    // A fresh repository's first stop is now the pendingAsks published on the
    // `apply-portable-seed` command step (author identity/push-approval/verify-contract) --
    // this is the earlier stop NVA-V3-PENDINGASKS introduces, reached before the later
    // intake-consent collect-input a pre-fix driver reached instead.
    assert.equal(result.outcome, "pending-asks");
    assert.equal(result.root, root);
    assert.ok(Array.isArray(result.pendingAsks) && result.pendingAsks.length > 0);
    // The pendingAsks array is carried through VERBATIM from the underlying onboarding
    // CLI's own final response -- never re-derived, never re-worded.
    assert.deepEqual(result.pendingAsks, result.final.nextAction.pendingAsks);
    // Never invented: this driver holds no field anywhere in its result that could carry a
    // fabricated answer for any of the asked inputs across all published asks.
    const askedNames = result.pendingAsks.flatMap((ask) => (ask.inputs ?? [ask.input]).map((input) => input.name));
    assert.ok(askedNames.length > 0, "at least one pending ask must name at least one input");
    for (const name of askedNames) {
      assert.equal(Object.prototype.hasOwnProperty.call(result, name), false, `must not have invented a top-level ${name}`);
    }
  } finally {
    dispose(root);
  }
});

test("driveOnboardingInit: executes a run of consecutive command actions before it has to stop", () => {
  const root = freshRoot();
  try {
    const result = driveOnboardingInit({ rootDir: root, runner: "claude" });
    // A fresh, empty repository needs several plan/apply steps (portable seed, runtime
    // init, ...) before the first genuine human question -- this exercises the CHAIN, not
    // just a single hop.
    assert.ok(result.stepsExecuted >= 3, `expected several chained command steps, got ${result.stepsExecuted}`);
    for (const step of result.steps) {
      assert.equal(step.faultCode, null, `step ${JSON.stringify(step.argv)} must not have faulted`);
      assert.equal(step.exitCode, 0, `step ${JSON.stringify(step.argv)} must have exited 0`);
    }
    // The FIRST step is always the bare inspect this driver bootstraps itself with; at
    // least one LATER step must be a genuinely different subcommand, proving the loop
    // actually followed nextAction rather than repeating the same call.
    const subcommands = result.steps.map((step) => step.argv[1]);
    assert.equal(subcommands[0], "inspect");
    assert.ok(subcommands.slice(1).some((name) => name !== "inspect"), "expected the chain to advance past inspect");
  } finally {
    dispose(root);
  }
});

test("driveOnboardingInit: is re-entrant -- a second run never repeats the already-executed command that published the ask", () => {
  const root = freshRoot();
  try {
    const first = driveOnboardingInit({ rootDir: root, runner: "claude" });
    assert.equal(first.outcome, "pending-asks");
    assert.ok(first.steps.some((step) => step.argv[1] === "apply-portable-seed"),
      "the pendingAsks are published as a side effect of this exact command's own response");

    // KNOWN LIMITATION, library-side and out of this driver's scope (confirmed by direct
    // measurement, 2026-08-28): `withPendingAsksSurfacedOnNextAction()`
    // (lib/project-onboarding-v3.mjs ~lines 5416/5418) is wired ONLY into the
    // apply-portable-seed activation call's own response, not into a later bare `inspect`
    // read of the same on-disk state. So a re-entrant run that neither answered nor
    // re-triggers that exact command does not see the SAME pendingAsks again -- it silently
    // continues past where they were, reaching whatever the chain's next genuine stop is.
    // This driver cannot close that gap without knowing WHICH command re-surfaces which
    // ask, which is exactly the domain knowledge it is built to hold none of; it is
    // reported here, not special-cased around. What IS guaranteed, and what this test pins,
    // is the property this driver actually owns: it never re-executes the already-applied
    // command a second time.
    const second = driveOnboardingInit({ rootDir: root, runner: "claude" });
    const secondSubcommands = second.steps.map((step) => step.argv[1]);
    assert.equal(secondSubcommands.filter((name) => name === "apply-portable-seed").length, 0,
      "must not double-apply the already-applied command");
  } finally {
    dispose(root);
  }
});

test("driveOnboardingInit: the step cap fires on a chain that never converges", () => {
  // A synthetic responder that always reports a fresh "command" action pointing back at
  // itself -- there is no real onboarding chain shaped like this (every real subcommand
  // eventually settles), so this is the one scenario mocked rather than run for real.
  let calls = 0;
  const run = () => {
    calls += 1;
    return {
      status: 0,
      stdout: JSON.stringify({
        schema: "pipeline.synthetic-non-converging.v1",
        status: "in-progress",
        nextAction: {
          kind: "command",
          executable: "node",
          argv: ["--eval", `void ${calls}`],
          mutation: false,
          requiresConfirmation: false,
        },
      }),
      stderr: "",
    };
  };
  const root = freshRoot();
  try {
    const stepCap = 4;
    const result = driveOnboardingInit({ rootDir: root, stepCap, run });
    assert.equal(result.outcome, "step-cap-exceeded");
    assert.equal(result.stepCap, stepCap);
    assert.equal(result.stepsExecuted, stepCap);
    assert.equal(result.steps.length, stepCap);
    assert.equal(calls, stepCap);
  } finally {
    dispose(root);
  }
});

// The four tests below use a synthetic responder, same idiom as the non-converging
// step-cap test above: the re-anchor path needs an executed step to settle with no
// `nextAction` and a non-"ready" status, which is not a real onboarding-cli shape any
// still-supported subcommand currently produces on its own (the backlog item this task
// closes describes the gap being fixed, not a reproducible live example), so mocking the
// two resting responses is the honest choice, exactly as it already is for the
// non-converging chain.
function respond(body) {
  return { status: 0, stdout: JSON.stringify(body), stderr: "" };
}

test("driveOnboardingInit: re-anchors after an executed step settles with no nextAction, and completes", () => {
  const root = freshRoot();
  try {
    let inspectCalls = 0;
    const run = (executable, argv) => {
      const subcommand = argv[1];
      if (subcommand === "inspect") {
        inspectCalls += 1;
        if (inspectCalls === 1) {
          return respond({
            schema: "pipeline.synthetic.v1",
            status: "in-progress",
            nextAction: { kind: "command", executable: "node", argv: ["--eval", "0"] },
          });
        }
        // The re-anchor: a different, terminal state -- proves the driver actually
        // re-read the state rather than repeating the anchor blindly.
        return respond({ schema: "pipeline.synthetic.v1", status: "ready", nextAction: null });
      }
      // The one executed ("command") step: settles with no nextAction, not ready --
      // exactly the silent-success shape this task fixes.
      return respond({ schema: "pipeline.synthetic.v1", status: "in-progress", nextAction: null });
    };
    const result = driveOnboardingInit({ rootDir: root, run });
    assert.equal(result.outcome, "ready", JSON.stringify(result));
    assert.equal(inspectCalls, 2, "expected exactly one re-anchor inspect on top of the initial one");
    assert.equal(result.stepsExecuted, 3);
    assert.equal(result.steps[0].argv[1], "inspect");
    assert.notEqual(result.steps[1].argv[1], "inspect", "the middle step is the executed command, not another anchor");
    assert.equal(result.steps[2].argv[1], "inspect", "the driver re-anchored on inspect after the silent success");
  } finally {
    dispose(root);
  }
});

test("driveOnboardingInit: a nextAction-less result from the anchoring inspect itself does not re-anchor again", () => {
  const root = freshRoot();
  try {
    const run = () => respond({ schema: "pipeline.synthetic.v1", status: "in-progress", nextAction: null });
    const result = driveOnboardingInit({ rootDir: root, run });
    // No step was executed before this resting response -- it IS the (only) anchor call --
    // so re-anchoring must not fire, or this would spin forever on the identical command.
    assert.equal(result.outcome, "no-automatic-next-step");
    assert.equal(result.stepsExecuted, 1);
  } finally {
    dispose(root);
  }
});

test("driveOnboardingInit: a genuinely non-converging chain stops with its own outcome, not the step cap", () => {
  const root = freshRoot();
  try {
    let inspectCalls = 0;
    const run = (executable, argv) => {
      const subcommand = argv[1];
      if (subcommand === "inspect") {
        inspectCalls += 1;
        // Every inspect reports the identical state -- the executed step never actually
        // changes anything, the exact shape of the earlier `inspect` -> `bootstrap-bind-plan`
        // -> `inspect` -> ... defect this re-anchor must not reintroduce.
        return respond({
          schema: "pipeline.synthetic.v1",
          status: "in-progress",
          nextAction: { kind: "command", executable: "node", argv: ["--eval", "0"] },
        });
      }
      return respond({ schema: "pipeline.synthetic.v1", status: "in-progress", nextAction: null });
    };
    const stepCap = 50;
    const result = driveOnboardingInit({ rootDir: root, stepCap, run });
    assert.equal(result.outcome, "no-progress");
    // Caught after the first repeat (anchor, executed step, re-anchor) rather than after
    // burning the whole step cap.
    assert.equal(result.stepsExecuted, 3);
    assert.equal(inspectCalls, 2);
    assert.ok(result.stepsExecuted < stepCap);
  } finally {
    dispose(root);
  }
});

test("driveOnboardingInit: collect-input, ready, unsupported-next-action and error outcomes reached directly are unchanged", () => {
  const collectInputRoot = freshRoot();
  try {
    const collectInputAction = { kind: "collect-input", input: { name: "example" } };
    const collectInputRun = () => respond({ schema: "pipeline.synthetic.v1", status: "in-progress", nextAction: collectInputAction });
    const collectInputResult = driveOnboardingInit({ rootDir: collectInputRoot, run: collectInputRun });
    assert.equal(collectInputResult.outcome, "collect-input");
    assert.deepEqual(collectInputResult.collectInput, collectInputAction);
  } finally {
    dispose(collectInputRoot);
  }

  const readyRoot = freshRoot();
  try {
    const readyRun = () => respond({ schema: "pipeline.synthetic.v1", status: "ready", nextAction: null });
    const readyResult = driveOnboardingInit({ rootDir: readyRoot, run: readyRun });
    assert.equal(readyResult.outcome, "ready");
    assert.equal(readyResult.stepsExecuted, 1);
  } finally {
    dispose(readyRoot);
  }

  const unsupportedRoot = freshRoot();
  try {
    const unsupportedRun = () => respond({
      schema: "pipeline.synthetic.v1",
      status: "in-progress",
      nextAction: { kind: "restart-process" },
    });
    const unsupportedResult = driveOnboardingInit({ rootDir: unsupportedRoot, run: unsupportedRun });
    assert.equal(unsupportedResult.outcome, "unsupported-next-action");
  } finally {
    dispose(unsupportedRoot);
  }

  const errorRoot = freshRoot();
  try {
    const errorRun = () => ({ status: 1, stdout: "not json", stderr: "boom" });
    const errorResult = driveOnboardingInit({ rootDir: errorRoot, run: errorRun });
    assert.equal(errorResult.outcome, "error");
  } finally {
    dispose(errorRoot);
  }
});

// NVA-V3-PENDINGASKS: the library publishes side-channel `nextAction.pendingAsks` (author
// identity, push-approval mode, verify-contract, trust-anchor, project-ignore-gap --
// `withPendingAsksSurfacedOnNextAction()`, lib/project-onboarding-v3.mjs) and this driver
// previously branched only on `nextAction.kind`, dropping every one of them silently on the
// common `kind: "command"` path (backlog: 2026-08-28-push-approval-mode-is-not-chosen-at-
// onboarding.md). The four tests below pin the fix, generically -- no individual ask's
// meaning is ever asserted here, only that the protocol channel itself is surfaced.

test("driveOnboardingInit: a command nextAction carrying pendingAsks stops and surfaces them instead of executing straight past them", () => {
  const root = freshRoot();
  try {
    let calls = 0;
    const askEntry = { kind: "collect-input", input: { name: "examplePendingAsk" }, guidance: "example" };
    const run = () => {
      calls += 1;
      return respond({
        schema: "pipeline.synthetic.v1",
        status: "in-progress",
        nextAction: { kind: "command", executable: "node", argv: ["--eval", "0"], pendingAsks: [askEntry] },
      });
    };
    const result = driveOnboardingInit({ rootDir: root, run });
    assert.equal(result.outcome, "pending-asks", JSON.stringify(result));
    assert.deepEqual(result.pendingAsks, [askEntry]);
    assert.equal(calls, 1, "the command must not have been executed once a pending ask surfaced");
  } finally {
    dispose(root);
  }
});

test("driveOnboardingInit: a command nextAction with no pendingAsks (absent or empty) is unaffected", () => {
  for (const pendingAsks of [undefined, []]) {
    const root = freshRoot();
    try {
      let step = 0;
      const run = () => {
        step += 1;
        if (step === 1) {
          const nextAction = { kind: "command", executable: "node", argv: ["--eval", "0"] };
          if (pendingAsks !== undefined) nextAction.pendingAsks = pendingAsks;
          return respond({ schema: "pipeline.synthetic.v1", status: "in-progress", nextAction });
        }
        return respond({ schema: "pipeline.synthetic.v1", status: "ready", nextAction: null });
      };
      const result = driveOnboardingInit({ rootDir: root, run });
      assert.equal(result.outcome, "ready", JSON.stringify(result));
      assert.equal(step, 2, "the command must have been executed, exactly as before this change");
    } finally {
      dispose(root);
    }
  }
});

test("driveOnboardingInit: a collect-input nextAction that also carries pendingAsks surfaces both, neither lost", () => {
  const root = freshRoot();
  try {
    const askEntry = { kind: "collect-input", input: { name: "sideChannelAsk" } };
    const collectInputAction = { kind: "collect-input", input: { name: "primaryAsk" }, pendingAsks: [askEntry] };
    const run = () => respond({ schema: "pipeline.synthetic.v1", status: "in-progress", nextAction: collectInputAction });
    const result = driveOnboardingInit({ rootDir: root, run });
    assert.equal(result.outcome, "collect-input");
    assert.deepEqual(result.collectInput, collectInputAction, "the primary question must still be carried through verbatim");
    assert.deepEqual(result.pendingAsks, [askEntry], "the sibling ask must also be surfaced, not dropped");
  } finally {
    dispose(root);
  }
});

test("driveOnboardingInit: malformed pendingAsks does not crash the driver and is not silently swallowed", () => {
  for (const malformed of ["not-an-array", ["a string entry, not an object"], [{ noKindField: true }]]) {
    const root = freshRoot();
    try {
      let step = 0;
      const run = () => {
        step += 1;
        if (step === 1) {
          return respond({
            schema: "pipeline.synthetic.v1",
            status: "in-progress",
            nextAction: { kind: "command", executable: "node", argv: ["--eval", "0"], pendingAsks: malformed },
          });
        }
        return respond({ schema: "pipeline.synthetic.v1", status: "ready", nextAction: null });
      };
      const result = driveOnboardingInit({ rootDir: root, run });
      assert.equal(result.outcome, "ready", JSON.stringify(result));
      assert.equal(step, 2, "malformed metadata is not treated as a valid stop-worthy ask -- the command must still execute");
      assert.equal(result.steps[0].pendingAsksFault, "malformed-pending-asks-ignored",
        "the malformed field must be visible on the step record, not silently dropped");
    } finally {
      dispose(root);
    }
  }
});

test("DEFAULT_STEP_CAP is a small, positive constant", () => {
  assert.ok(Number.isInteger(DEFAULT_STEP_CAP));
  assert.ok(DEFAULT_STEP_CAP > 0);
  assert.ok(DEFAULT_STEP_CAP < 1000, "the cap must be a small constant, not effectively unbounded");
});
