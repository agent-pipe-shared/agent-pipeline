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
 *
 * NVA-W3-ONBOARDENV: every test below that spawns the real onboarding CLI (i.e. omits its
 * own synthetic `run`) threads `env: FIXTURE_ENV` -- `PIPELINE_ONBOARDING_HOMEDIR_OVERRIDE`
 * pointed at a disposable fixture home this suite owns, honoured by
 * `project-onboarding-v3.mjs`'s own `main()`. Before this, the same suite spawned that CLI
 * with no env override at all, so it read the REAL operator's `$HOME` machine-plane state
 * (`readMachinePlane()`/`detectExistingLocalTrustAnchor()`) -- a suite gating verify with two
 * legitimate outcomes depending on who ran it (backlog:
 * 2026-08-28-a-verify-gate-suite-reads-real-machine-state-through-a-subprocess.md).
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

import { DEFAULT_STEP_CAP, SCHEMA, driveOnboardingInit } from "./onboarding-init.mjs";

const PROJECT_ONBOARDING_SCRIPT_PATH = fileURLToPath(new URL("./project-onboarding-v3.mjs", import.meta.url));

function freshRoot() {
  return mkdtempSync(join(tmpdir(), "onboarding-init-test-"));
}

function freshHome() {
  return mkdtempSync(join(tmpdir(), "onboarding-init-test-home-"));
}

function dispose(path) {
  rmSync(path, { recursive: true, force: true });
}

// One disposable fixture home for the whole suite: none of the "real subprocess" tests
// below assert anything ABOUT the machine plane, they only need to never read the
// operator's real one. A single fresh, empty home (no `.agent-pipeline/machine.json`, no
// signing key) makes every one of them resolve the same "never been asked" onboarding path
// regardless of which machine or PO key state the suite happens to run under.
const FIXTURE_HOME = freshHome();
const FIXTURE_ENV = { ...process.env, PIPELINE_ONBOARDING_HOMEDIR_OVERRIDE: FIXTURE_HOME };
after(() => dispose(FIXTURE_HOME));

// NVA-CF-BL17-ONBOARDINIT (backlog: 2026-08-28-a-verify-gate-suite-reads-real-machine-
// state-through-a-subprocess.md, AC-1): a SECOND fixture home, pre-seeded with a signing
// key in exactly the shape `detectExistingLocalTrustAnchor()`
// (lib/project-onboarding-v3.mjs) expects -- `<home>/.agent-pipeline/machine.json`
// (schema `pipeline.machine-plane.v1`, `poKeyDirectory` pointing at a directory) whose
// `trust-policy.json` names a `keyReference` and a 64-hex `publicKeySha256`
// (`lib/machine-plane.mjs` field shapes). Both fixture homes are wired into the SAME
// driver via the SAME env seam, so the "with a PO key" and "without one" branches are
// each reached provably from a fixture rather than from whatever the real operator's
// `$HOME` happens to hold.
const FIXTURE_HOME_WITH_KEY = freshHome();
const FIXTURE_KEY_DIRECTORY = join(FIXTURE_HOME_WITH_KEY, "po-key-directory");
mkdirSync(FIXTURE_KEY_DIRECTORY, { recursive: true });
mkdirSync(join(FIXTURE_HOME_WITH_KEY, ".agent-pipeline"), { recursive: true });
const FIXTURE_PUBLIC_KEY_SHA256 = createHash("sha256").update("onboarding-init-test-fixture-key").digest("hex");
writeFileSync(
  join(FIXTURE_KEY_DIRECTORY, "trust-policy.json"),
  `${JSON.stringify({
    keyReference: "onboarding-init-test-fixture-key",
    publicKeySha256: FIXTURE_PUBLIC_KEY_SHA256,
    humanName: "Onboarding Init Test Fixture PO",
  }, null, 2)}\n`,
);
writeFileSync(
  join(FIXTURE_HOME_WITH_KEY, ".agent-pipeline", "machine.json"),
  `${JSON.stringify({
    schema: "pipeline.machine-plane.v1",
    poKeyDirectory: FIXTURE_KEY_DIRECTORY,
    pushApprovalDefault: "signature",
    routing: null,
    language: null,
    session: null,
    usage: null,
    updatedAt: new Date().toISOString(),
  }, null, 2)}\n`,
);
const FIXTURE_ENV_WITH_KEY = { ...process.env, PIPELINE_ONBOARDING_HOMEDIR_OVERRIDE: FIXTURE_HOME_WITH_KEY };
after(() => dispose(FIXTURE_HOME_WITH_KEY));

// NVA-GF-GREENFIELD-3RUNNERDRIVER-1: one explicit runner x machine-key matrix replaces
// the former two-runner lane test plus Claude-only key comparison. Every cell is a real
// subprocess walk against a fresh root. The injected ambient marker deliberately names a
// DIFFERENT runner, so an omitted `--runner` on any generated step fails visibly instead
// of accidentally agreeing with the current test host.
const GREENFIELD_RUNNERS = ["claude", "codex", "antigravity"];
const GREENFIELD_MACHINE_STATES = [
  { name: "no-registered-key", env: FIXTURE_ENV, hasKey: false },
  { name: "valid-registered-key", env: FIXTURE_ENV_WITH_KEY, hasKey: true },
];

function withConflictingAmbientRunner(env, runner) {
  const conflicted = { ...env };
  for (const key of ["CLAUDECODE", "ANTIGRAVITY_AGENT", "AI_AGENT", "CODEX_SESSION_ID", "CODEX_THREAD_ID"]) delete conflicted[key];
  if (runner === "claude") conflicted.CODEX_THREAD_ID = "ambient-codex-fixture";
  else conflicted.CLAUDECODE = "1";
  return conflicted;
}

function actionInputNames(action) {
  if (!action || typeof action !== "object") return [];
  return (action.inputs ?? (action.input ? [action.input] : []))
    .map((input) => input?.name)
    .filter((name) => typeof name === "string");
}

function assertPinnedRunner(result, runner, label) {
  assert.equal(result.runner, runner, `${label}: the selected lane is reported`);
  for (const step of result.steps) {
    const indexes = step.argv.flatMap((value, index) => value === "--runner" ? [index] : []);
    assert.equal(indexes.length, 1, `${label}: every generated step has exactly one --runner`);
    assert.equal(step.argv[indexes[0] + 1], runner, `${label}: every generated step carries the selected runner`);
    assert.equal(step.faultCode, null, `${label}: ${JSON.stringify(step.argv)} must not fault`);
    assert.equal(step.exitCode, 0, `${label}: ${JSON.stringify(step.argv)} must exit zero`);
  }
}

function recordAnsweredOnboardingValues(root, runner, env) {
  const applied = spawnSync(process.execPath, [
    PROJECT_ONBOARDING_SCRIPT_PATH,
    "intake-consent-apply",
    "--root", root,
    "--granted",
    "--git-author-name", "Greenfield Matrix PO",
    "--git-author-email", "greenfield-matrix@example.invalid",
    "--language", "en",
    "--profile", "feature",
    "--activate",
    "--runner", runner,
  ], { encoding: "utf8", shell: false, env });
  assert.equal(applied.status, 0, applied.stderr);

  for (const [key, value] of [["user.name", "Greenfield Matrix PO"], ["user.email", "greenfield-matrix@example.invalid"]]) {
    const configured = spawnSync("git", ["config", key, value], { cwd: root, encoding: "utf8", shell: false, env });
    assert.equal(configured.status, 0, configured.stderr);
  }
}

test("driveOnboardingInit: Claude, Codex, and Antigravity converge across fresh no-key/valid-key homes without ambient drift or repeated answered asks", () => {
  const roots = [];
  const firstShapes = [];
  try {
    for (const runner of GREENFIELD_RUNNERS) {
      for (const machine of GREENFIELD_MACHINE_STATES) {
        const root = freshRoot();
        roots.push(root);
        const label = `${runner}/${machine.name}`;
        const env = withConflictingAmbientRunner(machine.env, runner);
        const first = driveOnboardingInit({ rootDir: root, runner, env });

        assert.equal(first.schema, SCHEMA, label);
        assert.equal(first.outcome, "pending-asks", `${label}: first stable stop is genuine published human input`);
        assert.equal(first.final?.status, "runtime-initialization-required", `${label}: runner choice must not alter the stable boundary`);
        assert.equal(first.final?.nextAction?.kind, "command", `${label}: pending asks accompany the unchanged real next command`);
        assert.ok(first.pendingAsks.length > 0, `${label}: the boundary must carry real asks`);
        assertPinnedRunner(first, runner, label);
        firstShapes.push({ schema: first.schema, outcome: first.outcome, status: first.final.status, nextActionKind: first.final.nextAction.kind });

        const askNames = first.pendingAsks.flatMap(actionInputNames);
        assert.equal(askNames.includes("trustAnchorPointerRepairAcknowledged"), false, `${label}: a fresh or valid key is never a broken pointer`);
        assert.equal(askNames.includes("trustAnchorPolicyRepairAcknowledged"), false, `${label}: a valid policy is never an external repair failure`);
        if (machine.hasKey) {
          const policy = JSON.parse(readFileSync(join(root, "project", "critical-human-proof.json"), "utf8"));
          assert.equal(policy.schema, "pipeline.critical-human-proof-policy.v3", `${label}: the existing key is reusable`);
          assert.ok(policy.trustAnchors.some((anchor) => anchor.publicKeySha256 === FIXTURE_PUBLIC_KEY_SHA256), `${label}: the reusable key digest is materialized into the fresh policy`);
          assert.equal(askNames.includes("trustAnchorAbsentAcknowledged"), false, `${label}: a valid existing key is not reported absent`);
        } else {
          const policy = JSON.parse(readFileSync(join(root, "project", "critical-human-proof.json"), "utf8"));
          assert.equal(policy.schema, "pipeline.critical-human-proof-policy.v1", `${label}: the no-key home must not inherit an external anchor`);
          assert.equal(Object.prototype.hasOwnProperty.call(policy, "trustAnchors"), false, `${label}: the no-key policy carries no inherited anchors`);
        }

        // Record the values the first human round already supplied, then re-enter the SAME
        // root. Identity is fulfilled through the exact repository-local git-config route
        // its ask names; language/profile remain in the private intake checkpoint. None may
        // be asked again, while unrelated unresolved asks remain a truthful stopping point.
        recordAnsweredOnboardingValues(root, runner, env);
        const reentrant = driveOnboardingInit({ rootDir: root, runner, env });
        assert.equal(reentrant.outcome, "pending-asks", `${label}: unrelated genuine asks remain surfaced`);
        assertPinnedRunner(reentrant, runner, `${label}/reentrant`);
        const reentrantNames = [
          ...reentrant.pendingAsks.flatMap(actionInputNames),
          ...actionInputNames(reentrant.collectInput),
        ];
        for (const answered of ["gitAuthorName", "gitAuthorEmail", "language", "profile"]) {
          assert.equal(reentrantNames.includes(answered), false, `${label}: answered ${answered} must not be asked again`);
        }
      }
    }
    assert.equal(new Set(firstShapes.map((shape) => JSON.stringify(shape))).size, 1, "all six cells converge to one driver outcome shape");
  } finally {
    for (const root of roots) dispose(root);
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

test("driveOnboardingInit: re-anchors after a published command succeeds with plain human-facing output", () => {
  const root = freshRoot();
  try {
    let calls = 0;
    const run = () => {
      calls += 1;
      if (calls === 1) {
        return respond({
          schema: "pipeline.synthetic.v1",
          status: "ready",
          nextAction: {
            kind: "command",
            executable: "node",
            argv: ["/plugin/pipeline-state.mjs", "set-phase", "--phase", "implementation"],
          },
        });
      }
      if (calls === 2) return { status: 0, stdout: 'Phase set: "implementation"; lifecycle="implementing".\n', stderr: "" };
      return respond({ schema: "pipeline.synthetic.v1", status: "ready", nextAction: null });
    };
    const result = driveOnboardingInit({ rootDir: root, runner: "claude", run });
    assert.equal(result.outcome, "ready", JSON.stringify(result));
    assert.equal(result.stepsExecuted, 3);
    assert.equal(result.steps[1].faultCode, null);
    assert.equal(result.steps[1].outputKind, "plain-success");
    assert.equal(result.steps[2].argv[1], "inspect", "plain command success must re-enter only through public inspect");
  } finally {
    dispose(root);
  }
});

test("driveOnboardingInit: plain or malformed anchor output, JSON-shaped malformed command output, and nonzero command output remain errors", () => {
  for (const [name, run, expectedExitCode] of [
    ["plain-anchor", () => ({ status: 0, stdout: "not protocol json", stderr: "" }), 0],
    ["malformed-anchor", () => ({ status: 0, stdout: "{not-json", stderr: "" }), 0],
    ["malformed-command", (() => {
      let calls = 0;
      return () => {
        calls += 1;
        return calls === 1
          ? respond({ schema: "pipeline.synthetic.v1", status: "ready", nextAction: { kind: "command", executable: "node", argv: ["tool"] } })
          : { status: 0, stdout: "{not-json", stderr: "" };
      };
    })(), 0],
    ["nonzero-command", (() => {
      let calls = 0;
      return () => {
        calls += 1;
        return calls === 1
          ? respond({ schema: "pipeline.synthetic.v1", status: "ready", nextAction: { kind: "command", executable: "node", argv: ["tool"] } })
          : { status: 2, stdout: "command refused", stderr: "refused" };
      };
    })(), 2],
  ]) {
    const root = freshRoot();
    try {
      const result = driveOnboardingInit({ rootDir: root, run });
      assert.equal(result.outcome, "error", `${name}: ${JSON.stringify(result)}`);
      assert.equal(result.error.faultCode, "unparseable-output", name);
      assert.equal(result.error.exitCode, expectedExitCode, name);
    } finally {
      dispose(root);
    }
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
