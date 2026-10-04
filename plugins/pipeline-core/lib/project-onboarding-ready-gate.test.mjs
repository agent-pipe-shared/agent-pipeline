#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  PROJECT_ONBOARDING_CONTROLLING_NON_READY_STATUSES,
  PROJECT_ONBOARDING_READY_GATE_SCHEMA,
  ProjectOnboardingReadyError,
  requireProjectOnboardingReady,
  validForeignCleanupResidueWarning,
} from "./project-onboarding-ready-gate.mjs";
import { planOrphanDescriptorArchive } from "./session-cleanup-recovery.mjs";
import {
  expectedPipelineScriptsRunnerAllowlistEntries,
  inspectProjectOnboardingV3,
  PROJECT_ONBOARDING_BASE_RESULT_KEYS,
  PROJECT_ONBOARDING_READY_ONLY_RESULT_KEYS,
  PROJECT_ONBOARDING_VERIFY_COMMAND_PLACEHOLDER,
} from "./project-onboarding-v3.mjs";

function root() { return mkdtempSync(join(tmpdir(), "project-ready-gate-")); }

// pipeline.ready-gate-keys-derived-from-producer: this file's own fixture-shape stub used to
// hand-type the eleven base field names independently of both the gate's own hand-typed list
// AND the producer's actual construction site -- the "third copy" that let this suite stay
// green while the real producer shape drifted underneath it (backlog:
// pipeline.ready-gate-hand-maintained-shape-mirror, "Predicate note, 2026-08-29"). Iterating
// PROJECT_ONBOARDING_BASE_RESULT_KEYS (imported from the producer, same as the gate itself
// now imports) instead means: a key REMOVED from the producer's shape is simply no longer
// requested here (still correct); a key ADDED to the producer's shape has no entry in
// FIELD_PLACEHOLDER below and throws immediately, loudly, right here in this test file,
// rather than silently building an incomplete stub that happens to still satisfy a
// same-vintage gate list.
function fieldPlaceholder(key, rootDir, intent, runner) {
  switch (key) {
    case "schema": return "pipeline.project-onboarding.v4";
    case "status": return "ready";
    case "root": return realpathSync(rootDir);
    case "runner": return runner;
    case "intent": return intent;
    case "repository": return {};
    case "runtime": return {};
    case "continuity": return {};
    case "appServer": return {};
    case "runnerPermissions": return {
      target: ".claude/settings.local.json",
      status: "current",
      lanes: ["Bash", "PowerShell"],
      exactEntries: expectedPipelineScriptsRunnerAllowlistEntries(),
    };
    case "nextAction": return null;
    case "diagnostics": return [];
    default:
      throw new Error(
        `project-onboarding-ready-gate.test.mjs's readyResult() has no placeholder value wired `
        + `for producer-derived base key "${key}" -- the producer's shape changed; wire a value `
        + "here, do not guess.",
      );
  }
}

function readyResult(rootDir, intent, runner = "codex") {
  const result = {};
  for (const key of PROJECT_ONBOARDING_BASE_RESULT_KEYS) {
    result[key] = fieldPlaceholder(key, rootDir, intent, runner);
  }
  return result;
}

// NVA-T-READYKEYS: a real ready V4 observation carries two more fields than the base
// eleven -- project-onboarding-v3.mjs attaches pushApprovalMode/trustAnchorAvailability
// only to a `status: "ready"` result. readyResult() above stays the base shape (reused by
// the non-ready-status tests, where those two fields must NOT be present); this is the
// wider ready shape a real inspection actually returns, built the same derived way: any
// PROJECT_ONBOARDING_READY_ONLY_RESULT_KEYS name without a placeholder below throws.
function readyResultWithPushApprovalKeys(rootDir, intent, runner = "codex") {
  const result = readyResult(rootDir, intent, runner);
  for (const key of PROJECT_ONBOARDING_READY_ONLY_RESULT_KEYS) {
    if (key === "pushApprovalMode") { result[key] = "signature"; continue; }
    if (key === "trustAnchorAvailability") { result[key] = "present"; continue; }
    throw new Error(
      `project-onboarding-ready-gate.test.mjs's readyResultWithPushApprovalKeys() has no `
      + `placeholder value wired for producer-derived ready-only key "${key}".`,
    );
  }
  return result;
}

function implementationHandoverAction() {
  return {
    kind: "command",
    executable: "node",
    argv: ["/plugin/pipeline-state.mjs", "set-phase", "--phase", "implementation"],
    mutation: true,
    requiresConfirmation: true,
    expected: { schema: "pipeline.project-onboarding.v4", statuses: ["ready"] },
  };
}

function implementationVerifyHandoverAction() {
  return {
    kind: "collect-input",
    input: {
      name: "verifyCommand",
      encoding: "utf8",
      trim: true,
      minBytes: 1,
      maxBytes: 512,
      singleLine: true,
      rejectNul: true,
    },
    mutation: false,
    requiresConfirmation: false,
    guidance: "Ask the PO for the real verify command, bind it to the published apply action, and do not edit calibration directly.",
    applyAction: {
      kind: "command",
      executable: "node",
      argv: [
        "/plugin/pipeline-state.mjs", "set-phase", "--phase", "implementation",
        "--verify-command", PROJECT_ONBOARDING_VERIFY_COMMAND_PLACEHOLDER,
      ],
      mutation: true,
      requiresConfirmation: true,
      expected: { schema: "pipeline.project-onboarding.v4", statuses: ["ready"] },
    },
    expected: { schema: "pipeline.project-onboarding.v4", statuses: ["ready"] },
  };
}

const PIPELINE_STATE_SCRIPT = fileURLToPath(new URL("../scripts/pipeline-state.mjs", import.meta.url));

function planLifecycleInspectAction() {
  return {
    kind: "command",
    executable: "node",
    argv: [PIPELINE_STATE_SCRIPT, "inspect"],
    mutation: false,
    requiresConfirmation: false,
    expected: { schema: "pipeline.inspect.v1", statuses: ["draft", "awaiting-approval"] },
  };
}

function withClaudecode(value, run) {
  const had = Object.prototype.hasOwnProperty.call(process.env, "CLAUDECODE");
  const previous = process.env.CLAUDECODE;
  try {
    if (value === undefined) delete process.env.CLAUDECODE;
    else process.env.CLAUDECODE = value;
    run();
  } finally {
    if (had) process.env.CLAUDECODE = previous;
    else delete process.env.CLAUDECODE;
  }
}

test("exact V4 ready is bound to the requested intent and returns one sanitized receipt", () => {
  const path = root();
  const calls = [];
  try {
    const result = requireProjectOnboardingReady({
      rootDir: path,
      intent: "dispatch",
      runner: "codex",
      inspect(options) {
        calls.push(options);
        return readyResultWithPushApprovalKeys(path, "dispatch");
      },
    });
    assert.deepEqual(calls, [{ rootDir: path, intent: "dispatch", runner: "codex" }]);
    assert.deepEqual(result, {
      schema: PROJECT_ONBOARDING_READY_GATE_SCHEMA,
      status: "ready",
      intent: "dispatch",
    });
    assert.equal(JSON.stringify(result).includes(path), false);
  } finally { rmSync(path, { recursive: true, force: true }); }
});

test("the gate never reads process.env; a missing runner fails closed as PORG-RUNNER even with CLAUDECODE=1 set (regression pin for ready-gate-env-var-runner-authority)", () => {
  const path = root();
  try {
    withClaudecode("1", () => {
      let calls = 0;
      assert.throws(() => requireProjectOnboardingReady({
        rootDir: path,
        intent: "dispatch",
        inspect() { calls += 1; return readyResult(path, "dispatch", "claude"); },
      }), (error) => {
        assert(error instanceof ProjectOnboardingReadyError);
        assert.equal(error.code, "PORG-RUNNER");
        assert.equal(error.intent, "dispatch");
        return true;
      });
      assert.equal(calls, 0);
    });

    withClaudecode(undefined, () => {
      let calls = 0;
      assert.throws(() => requireProjectOnboardingReady({
        rootDir: path,
        intent: "dispatch",
        inspect() { calls += 1; },
      }), (error) => error instanceof ProjectOnboardingReadyError && error.code === "PORG-RUNNER");
      assert.equal(calls, 0);
    });
  } finally { rmSync(path, { recursive: true, force: true }); }
});

test("an unknown or malformed runner string fails closed as PORG-RUNNER", () => {
  const path = root();
  try {
    for (const runner of [null, "", "Codex", "CLAUDE", "claude ", "windows", "claudecode", 42, {}, []]) {
      let calls = 0;
      assert.throws(() => requireProjectOnboardingReady({
        rootDir: path,
        intent: "dispatch",
        runner,
        inspect() { calls += 1; },
      }), (error) => {
        assert(error instanceof ProjectOnboardingReadyError);
        assert.equal(error.code, "PORG-RUNNER");
        assert.equal(error.intent, "dispatch");
        return true;
      });
      assert.equal(calls, 0);
    }
  } finally { rmSync(path, { recursive: true, force: true }); }
});

test("the gate accepts \"claude\" and \"codex\" explicitly and threads the exact caller-supplied value to inspection", () => {
  const path = root();
  try {
    for (const runner of ["claude", "codex"]) {
      let seenRunner = null;
      const result = requireProjectOnboardingReady({
        rootDir: path,
        intent: "dispatch",
        runner,
        inspect(options) {
          seenRunner = options.runner;
          return readyResultWithPushApprovalKeys(path, "dispatch", runner);
        },
      });
      assert.equal(seenRunner, runner);
      assert.equal(result.status, "ready");
    }
  } finally { rmSync(path, { recursive: true, force: true }); }
});

// NVA-T-READYKEYS DoD 1: this is the shape a real ready inspection produces (thirteen keys,
// including pushApprovalMode and trustAnchorAvailability). Before the fix, RESULT_KEYS
// listed exactly the eleven base names, so exactKeys() rejected precisely this shape --
// the only case the gate should otherwise pass -- as PORG-INVALID-OBSERVATION. This test
// fails before the fix and must pass after it.
test("a real V4 ready observation carrying pushApprovalMode/trustAnchorAvailability (thirteen keys) is accepted", () => {
  const path = root();
  try {
    const result = requireProjectOnboardingReady({
      rootDir: path,
      intent: "session",
      runner: "codex",
      inspect: () => readyResultWithPushApprovalKeys(path, "session"),
    });
    assert.deepEqual(result, {
      schema: PROJECT_ONBOARDING_READY_GATE_SCHEMA,
      status: "ready",
      intent: "session",
    });
  } finally { rmSync(path, { recursive: true, force: true }); }
});

test("ready gate keeps valid Claude cache drift optional while Codex and Antigravity stay settings-inapplicable", () => {
  const path = root();
  const settingsScript = fileURLToPath(new URL("../scripts/settings-allowlist-merge.mjs", import.meta.url));
  try {
    const claude = readyResultWithPushApprovalKeys(path, "session", "claude");
    claude.runnerPermissions = {
      ...claude.runnerPermissions,
      status: "drifted",
    };
    claude.runnerPermissions.optionalPlan = {
      kind: "command",
      executable: "node",
      argv: [settingsScript, "plan-runner-permissions", "--root", realpathSync(path)],
      mutation: false,
      requiresConfirmation: false,
      expected: {
        schema: "pipeline.settings-allowlist-merge-plan.v1",
        statuses: ["ready", "no-op", "unrepairable"],
      },
    };
    assert.deepEqual(requireProjectOnboardingReady({ rootDir: path, intent: "session", runner: "claude", inspect: () => claude }), {
      schema: "pipeline.project-onboarding-ready-gate.v1", status: "ready", intent: "session",
    });
    for (const status of ["drifted", "pending-runtime-initialization"]) {
      for (const nextAction of [null, implementationHandoverAction()]) {
        const offered = structuredClone(claude);
        offered.runnerPermissions.status = status;
        offered.nextAction = nextAction;
        assert.equal(requireProjectOnboardingReady({ rootDir: path, intent: "session", runner: "claude", inspect: () => offered }).status, "ready");
      }
    }
    for (const mutate of [
      (v) => { v.runnerPermissions.optionalPlan.argv[3] = "/wrong-root"; },
      (v) => { v.runnerPermissions.optionalPlan.argv[0] = "/wrong-script.mjs"; },
      (v) => { v.runnerPermissions.optionalPlan.mutation = true; },
      (v) => { v.runnerPermissions.optionalPlan.requiresConfirmation = true; },
      (v) => { v.runnerPermissions.optionalPlan.extra = true; },
      (v) => { v.runnerPermissions.optionalPlan.expected.statuses = ["ready"]; },
      (v) => { v.runnerPermissions.status = "current"; },
      (v) => { v.nextAction = v.runnerPermissions.optionalPlan; },
    ]) {
      const forged = structuredClone(claude);
      mutate(forged);
      assert.throws(() => requireProjectOnboardingReady({ rootDir: path, intent: "session", runner: "claude", inspect: () => forged }), { code: "PORG-INVALID-OBSERVATION" });
    }

    for (const runner of ["codex", "antigravity"]) {
      const inapplicable = readyResultWithPushApprovalKeys(path, "session", runner);
      inapplicable.runnerPermissions = {
        target: ".claude/settings.local.json", status: "not-applicable", lanes: [], exactEntries: [],
      };
      assert.deepEqual(requireProjectOnboardingReady({ rootDir: path, intent: "session", runner, inspect: () => inapplicable }), {
        schema: "pipeline.project-onboarding-ready-gate.v1", status: "ready", intent: "session",
      });
    }
  } finally { rmSync(path, { recursive: true, force: true }); }
});

test("a ready observation may carry the producer's helpful design-to-implementation handover without becoming PORG-INVALID-OBSERVATION", () => {
  const path = root();
  try {
    const observed = readyResultWithPushApprovalKeys(path, "session");
    observed.nextAction = implementationHandoverAction();
    const result = requireProjectOnboardingReady({
      rootDir: path,
      intent: "session",
      runner: "codex",
      inspect: () => observed,
    });
    assert.deepEqual(result, {
      schema: PROJECT_ONBOARDING_READY_GATE_SCHEMA,
      status: "ready",
      intent: "session",
    });
  } finally { rmSync(path, { recursive: true, force: true }); }
});

test("a ready observation may carry only the closed verify-command collect/apply handover when calibration is not configured", () => {
  const path = root();
  try {
    const observed = readyResultWithPushApprovalKeys(path, "session");
    observed.nextAction = implementationVerifyHandoverAction();
    const result = requireProjectOnboardingReady({
      rootDir: path,
      intent: "session",
      runner: "claude",
      inspect: () => ({ ...observed, runner: "claude" }),
    });
    assert.deepEqual(result, {
      schema: PROJECT_ONBOARDING_READY_GATE_SCHEMA,
      status: "ready",
      intent: "session",
    });
  } finally { rmSync(path, { recursive: true, force: true }); }
});

test("all runners admit the exact read-only plan-lifecycle inspect action for draft and awaiting-approval", () => {
  const path = root();
  try {
    for (const runner of ["claude", "codex", "antigravity"]) {
      const observed = readyResultWithPushApprovalKeys(path, "session", runner);
      observed.nextAction = planLifecycleInspectAction();
      const result = requireProjectOnboardingReady({
        rootDir: path,
        intent: "session",
        runner,
        inspect: () => observed,
      });
      assert.deepEqual(result, {
        schema: PROJECT_ONBOARDING_READY_GATE_SCHEMA,
        status: "ready",
        intent: "session",
      });
    }
  } finally { rmSync(path, { recursive: true, force: true }); }
});

test("the plan-lifecycle inspect exception rejects arbitrary paths, argv, mutation, and expected states", () => {
  const path = root();
  try {
    const valid = planLifecycleInspectAction();
    const invalidActions = [
      { ...valid, executable: process.execPath },
      { ...valid, argv: ["/other/pipeline-state.mjs", "inspect"] },
      { ...valid, argv: [valid.argv[0], "status"] },
      { ...valid, argv: [...valid.argv, "--runner", "codex"] },
      { ...valid, mutation: true },
      { ...valid, requiresConfirmation: true },
      { ...valid, expected: { schema: "pipeline.project-onboarding.v4", statuses: ["draft", "awaiting-approval"] } },
      { ...valid, expected: { schema: "pipeline.inspect.v1", statuses: ["awaiting-approval", "draft"] } },
      { ...valid, expected: { schema: "pipeline.inspect.v1", statuses: ["draft"] } },
      { ...valid, expected: { schema: "pipeline.inspect.v1", statuses: ["draft", "awaiting-approval", "approved"] } },
      { ...valid, unexpected: true },
    ];
    for (const nextAction of invalidActions) {
      const observed = readyResultWithPushApprovalKeys(path, "dispatch");
      observed.nextAction = nextAction;
      assert.throws(() => requireProjectOnboardingReady({
        rootDir: path,
        intent: "dispatch",
        runner: "codex",
        inspect: () => observed,
      }), (error) => error instanceof ProjectOnboardingReadyError && error.code === "PORG-INVALID-OBSERVATION");
    }
  } finally { rmSync(path, { recursive: true, force: true }); }
});

test("the ready handover exception remains closed to arbitrary or malformed actions", () => {
  const path = root();
  try {
    const valid = implementationHandoverAction();
    const invalidActions = [
      { ...valid, argv: ["/plugin/not-pipeline-state.mjs", ...valid.argv.slice(1)] },
      { ...valid, argv: [valid.argv[0], "set-phase", "--phase", "design"] },
      { ...valid, mutation: false },
      { ...valid, requiresConfirmation: false },
      { ...valid, unexpected: true },
      { ...valid, expected: { schema: valid.expected.schema, statuses: ["ready", "partial"] } },
    ];
    for (const nextAction of invalidActions) {
      const observed = readyResultWithPushApprovalKeys(path, "dispatch");
      observed.nextAction = nextAction;
      assert.throws(() => requireProjectOnboardingReady({
        rootDir: path,
        intent: "dispatch",
        runner: "codex",
        inspect: () => observed,
      }), (error) => error instanceof ProjectOnboardingReadyError && error.code === "PORG-INVALID-OBSERVATION");
    }
  } finally { rmSync(path, { recursive: true, force: true }); }
});

test("the unconfigured-verify handover exception is exact about its input and placeholder-bound apply argv", () => {
  const path = root();
  try {
    const valid = implementationVerifyHandoverAction();
    const invalidActions = [
      { ...valid, input: { ...valid.input, name: "verify-command" } },
      { ...valid, input: { ...valid.input, unexpected: true } },
      { ...valid, guidance: null },
      { ...valid, applyAction: { ...valid.applyAction, executable: "bash" } },
      { ...valid, applyAction: { ...valid.applyAction, argv: ["/plugin/not-pipeline-state.mjs", ...valid.applyAction.argv.slice(1)] } },
      { ...valid, applyAction: { ...valid.applyAction, argv: [...valid.applyAction.argv.slice(0, -1), "npm test"] } },
      { ...valid, applyAction: { ...valid.applyAction, argv: valid.applyAction.argv.slice(0, -2) } },
      { ...valid, applyAction: { ...valid.applyAction, mutation: false } },
      { ...valid, unexpected: true },
    ];
    for (const nextAction of invalidActions) {
      const observed = readyResultWithPushApprovalKeys(path, "dispatch");
      observed.nextAction = nextAction;
      assert.throws(() => requireProjectOnboardingReady({
        rootDir: path,
        intent: "dispatch",
        runner: "antigravity",
        inspect: () => ({ ...observed, runner: "antigravity" }),
      }), (error) => error instanceof ProjectOnboardingReadyError && error.code === "PORG-INVALID-OBSERVATION");
    }
  } finally { rmSync(path, { recursive: true, force: true }); }
});

// ALFRED-W0-4 (backlog 2026-10-04-approved-lifecycle-state-refuses-its-own-recovery-and-backlog-writes):
// the `approved` and `implementing` lifecycle states publish two more closed nextAction shapes than the
// gate used to know -- the deterministic `materialize-architecture` command and the `reopen-design`
// collect-input/apply pair (designToImplementationHandoverAction() in project-onboarding-v3.mjs). A gate that
// does not know a shape the producer emits turns a recoverable lifecycle state into PORG-INVALID-OBSERVATION,
// a SHAPE verdict that carries no lifecycleStatus and so reaches none of the status-keyed recovery lanes.
// The fixtures below are the producer's literals (that function is module-private); the conformance test
// pins them against the producer's source text so a drifting producer fails here, loudly, not in the field.
const REOPEN_DESIGN_ACTOR_PLACEHOLDER = "<recovery actor's name>";
const REOPEN_STALE_GUIDANCE = "The current approval is stale. Collect the recovery actor, then execute the exact reopen-design action before editing the PRD and preparing one final design-workflow approval.";
const REOPEN_INVALID_EVIDENCE_GUIDANCE = "The approved PRD is immutable and its architecture evidence is invalid (ARCHITECTURE-DESIGN-PACKAGE-REQUIRED). Collect the recovery actor, then execute the exact reopen-design action; edit the PRD only after it is a draft and submit/present one complete package for one final approval.";
const FOREIGN_PLUGIN_SCRIPTS = join(tmpdir(), "foreign-plugin", "scripts");

function materializeArchitectureAction() {
  return {
    kind: "command",
    executable: "node",
    argv: [PIPELINE_STATE_SCRIPT, "materialize-architecture"],
    mutation: true,
    requiresConfirmation: false,
    expected: { schema: "pipeline.architecture-design-materialization.v1", statuses: ["materialized"] },
  };
}

function reopenDesignAction(guidance = REOPEN_STALE_GUIDANCE) {
  return {
    kind: "collect-input",
    inputs: [{ name: "by", encoding: "utf8", trim: true, minBytes: 1, maxBytes: 128, singleLine: true, rejectNul: true }],
    mutation: false,
    requiresConfirmation: false,
    guidance,
    applyAction: {
      kind: "command",
      executable: "node",
      argv: [PIPELINE_STATE_SCRIPT, "reopen-design", "--by", REOPEN_DESIGN_ACTOR_PLACEHOLDER],
      mutation: true,
      requiresConfirmation: true,
      expected: { schema: "pipeline.project-onboarding.v4", statuses: ["ready"] },
    },
  };
}

// What the producer publishes per lifecycle status (v3 :3041 stale approval, :3048 materialization required,
// :3055-3060 invalid architecture evidence; the last two only in `approved` / `implementing`).
const NEW_SHAPE_PRODUCER_CASES = [
  { lifecycleStatus: "approved", name: "materialization required", build: materializeArchitectureAction },
  { lifecycleStatus: "approved", name: "architecture evidence invalid", build: () => reopenDesignAction(REOPEN_INVALID_EVIDENCE_GUIDANCE) },
  { lifecycleStatus: "approved", name: "stale approval", build: () => reopenDesignAction() },
  { lifecycleStatus: "implementing", name: "materialization required", build: materializeArchitectureAction },
  { lifecycleStatus: "implementing", name: "architecture evidence invalid", build: () => reopenDesignAction(REOPEN_INVALID_EVIDENCE_GUIDANCE) },
];

function assertInvalidObservation(nextAction, label) {
  const path = root();
  try {
    const observed = readyResultWithPushApprovalKeys(path, "session", "claude");
    observed.nextAction = nextAction;
    assert.throws(() => requireProjectOnboardingReady({
      rootDir: path,
      intent: "session",
      runner: "claude",
      inspect: () => observed,
    }), (error) => error instanceof ProjectOnboardingReadyError
      && error.code === "PORG-INVALID-OBSERVATION"
      && error.lifecycleStatus === null, label);
  } finally { rmSync(path, { recursive: true, force: true }); }
}

test("the materialize-architecture and reopen-design shapes the producer publishes in approved and implementing are admitted", () => {
  const path = root();
  try {
    for (const { lifecycleStatus, name, build } of NEW_SHAPE_PRODUCER_CASES) {
      for (const runner of ["claude", "codex", "antigravity"]) {
        const observed = readyResultWithPushApprovalKeys(path, "session", runner);
        observed.nextAction = build();
        const result = requireProjectOnboardingReady({
          rootDir: path,
          intent: "session",
          runner,
          inspect: () => observed,
        });
        assert.deepEqual(result, {
          schema: PROJECT_ONBOARDING_READY_GATE_SCHEMA,
          status: "ready",
          intent: "session",
        }, `${lifecycleStatus} / ${name} / ${runner}`);
      }
    }
  } finally { rmSync(path, { recursive: true, force: true }); }
});

test("the new-shape fixtures mirror the literals the producer publishes (drift of project-onboarding-v3.mjs fails here)", () => {
  const producer = readFileSync(fileURLToPath(new URL("./project-onboarding-v3.mjs", import.meta.url)), "utf8");
  for (const literal of [
    `const PO_AUTHORITY_REBIND_WRITER = fileURLToPath(new URL("../scripts/pipeline-state.mjs", import.meta.url));`,
    `const byToken = "${REOPEN_DESIGN_ACTOR_PLACEHOLDER}";`,
    `inputs: [{ name: "by", encoding: "utf8", trim: true, minBytes: 1, maxBytes: 128, singleLine: true, rejectNul: true }],`,
    `[PO_AUTHORITY_REBIND_WRITER, "reopen-design", "--by", byToken], true, true,`,
    `"pipeline.project-onboarding.v4", ["ready"]),`,
    `[PO_AUTHORITY_REBIND_WRITER, "materialize-architecture"],`,
    `"pipeline.architecture-design-materialization.v1",`,
    `["materialized"],`,
    REOPEN_STALE_GUIDANCE,
    REOPEN_INVALID_EVIDENCE_GUIDANCE.replace(" (ARCHITECTURE-DESIGN-PACKAGE-REQUIRED)", " (${architecture.code ?? \"ARCHITECTURE-DESIGN-INVALID\"})"),
  ]) {
    assert.ok(producer.includes(literal), `the producer no longer contains the literal this suite mirrors: ${literal.slice(0, 90)}`);
  }
});

test("the materialize-architecture exception is exact about its keys, argv, flags and expected result", () => {
  const mutations = [
    ["extra key", (a) => { a.pendingAsks = []; }],
    ["missing key", (a) => { delete a.expected; }],
    ["extra argv", (a) => { a.argv.push("--force"); }],
    ["wrong flag instead of the subcommand", (a) => { a.argv[1] = "--materialize-architecture"; }],
    ["other subcommand", (a) => { a.argv[1] = "approve-plan"; }],
    ["missing subcommand", (a) => { a.argv = [a.argv[0]]; }],
    ["non-node executable", (a) => { a.executable = "bash"; }],
    ["execPath instead of node", (a) => { a.executable = process.execPath; }],
    ["wrong script basename", (a) => { a.argv[0] = join(FOREIGN_PLUGIN_SCRIPTS, "not-pipeline-state.mjs"); }],
    ["same basename in a foreign directory", (a) => { a.argv[0] = join(FOREIGN_PLUGIN_SCRIPTS, "pipeline-state.mjs"); }],
    ["non-string script", (a) => { a.argv[0] = null; }],
    ["mutation false", (a) => { a.mutation = false; }],
    ["confirmation required", (a) => { a.requiresConfirmation = true; }],
    ["other expected schema", (a) => { a.expected.schema = "pipeline.other.v1"; }],
    ["extra expected status", (a) => { a.expected.statuses = ["materialized", "ready"]; }],
    ["empty expected statuses", (a) => { a.expected.statuses = []; }],
    ["extra expected key", (a) => { a.expected.extra = true; }],
    ["collect-input kind", (a) => { a.kind = "collect-input"; }],
  ];
  for (const [label, mutate] of mutations) {
    const action = materializeArchitectureAction();
    mutate(action);
    assertInvalidObservation(action, `materialize-architecture: ${label}`);
  }
});

test("the reopen-design exception is exact about its input, placeholder-bound apply argv, flags and confirmation", () => {
  const mutations = [
    ["extra key on the collect action", (a) => { a.unexpected = true; }],
    ["top-level expected on the collect action", (a) => { a.expected = { schema: "pipeline.project-onboarding.v4", statuses: ["ready"] }; }],
    ["extra key on the apply action", (a) => { a.applyAction.unexpected = true; }],
    ["missing apply action", (a) => { delete a.applyAction; }],
    ["empty guidance", (a) => { a.guidance = ""; }],
    ["non-string guidance", (a) => { a.guidance = null; }],
    ["collect action mutating", (a) => { a.mutation = true; }],
    ["collect action requiring confirmation", (a) => { a.requiresConfirmation = true; }],
    ["no inputs", (a) => { a.inputs = []; }],
    ["two inputs", (a) => { a.inputs.push({ ...a.inputs[0], name: "extra" }); }],
    ["input name", (a) => { a.inputs[0].name = "verifyCommand"; }],
    ["input upper bound", (a) => { a.inputs[0].maxBytes = 4096; }],
    ["input lower bound", (a) => { a.inputs[0].minBytes = 0; }],
    ["input trim", (a) => { a.inputs[0].trim = false; }],
    ["input extra key", (a) => { a.inputs[0].unexpected = true; }],
    ["apply subcommand", (a) => { a.applyAction.argv[1] = "set-phase"; }],
    ["apply wrong flag", (a) => { a.applyAction.argv[2] = "--actor"; }],
    ["apply forced flag", (a) => { a.applyAction.argv[2] = "--force"; }],
    ["apply extra argv", (a) => { a.applyAction.argv.push("--phase", "implementation"); }],
    ["apply without the placeholder", (a) => { a.applyAction.argv.pop(); }],
    ["apply with a concrete actor in place of the placeholder", (a) => { a.applyAction.argv[3] = "po"; }],
    ["apply with a reworded placeholder", (a) => { a.applyAction.argv[3] = "<recovery actor>"; }],
    ["apply with a padded placeholder", (a) => { a.applyAction.argv[3] = `${REOPEN_DESIGN_ACTOR_PLACEHOLDER} `; }],
    ["apply with an empty actor", (a) => { a.applyAction.argv[3] = ""; }],
    ["apply wrong script basename", (a) => { a.applyAction.argv[0] = join(FOREIGN_PLUGIN_SCRIPTS, "not-pipeline-state.mjs"); }],
    ["apply same basename in a foreign directory", (a) => { a.applyAction.argv[0] = join(FOREIGN_PLUGIN_SCRIPTS, "pipeline-state.mjs"); }],
    ["apply non-node executable", (a) => { a.applyAction.executable = "bash"; }],
    ["apply not mutating", (a) => { a.applyAction.mutation = false; }],
    ["apply without confirmation", (a) => { a.applyAction.requiresConfirmation = false; }],
    ["apply other expected schema", (a) => { a.applyAction.expected.schema = "pipeline.other.v1"; }],
    ["apply other expected statuses", (a) => { a.applyAction.expected.statuses = ["partial"]; }],
  ];
  for (const [label, mutate] of mutations) {
    const action = reopenDesignAction();
    mutate(action);
    assertInvalidObservation(action, `reopen-design: ${label}`);
  }
});

test("the new shapes are bound to the plugin's own resolved pipeline-state.mjs, not to a basename in any directory", () => {
  const foreign = [
    join(FOREIGN_PLUGIN_SCRIPTS, "pipeline-state.mjs"),
    "/other/pipeline-state.mjs",
    "pipeline-state.mjs",
    "./scripts/pipeline-state.mjs",
  ];
  for (const script of foreign) {
    const materialize = materializeArchitectureAction();
    materialize.argv[0] = script;
    assertInvalidObservation(materialize, `materialize-architecture via ${script}`);
    const reopen = reopenDesignAction();
    reopen.applyAction.argv[0] = script;
    assertInvalidObservation(reopen, `reopen-design via ${script}`);
  }
});

// NVA-T-READYKEYS DoD 2: a genuinely unexpected extra key beyond the thirteen still fails
// closed -- proving the fix is a second, ready-only key LIST, never a switch to a subset
// check. exactKeys() stays exact either way.
test("a ready observation with an unexpected extra key beyond the thirteen is still rejected (not a subset check)", () => {
  const path = root();
  try {
    assert.throws(() => requireProjectOnboardingReady({
      rootDir: path,
      intent: "session",
      runner: "codex",
      inspect: () => ({ ...readyResultWithPushApprovalKeys(path, "session"), somethingUnexpected: true }),
    }), (error) => error instanceof ProjectOnboardingReadyError && error.code === "PORG-INVALID-OBSERVATION");
  } finally { rmSync(path, { recursive: true, force: true }); }
});

// NVA-T-READYKEYS DoD 3: the two ready-only fields showing up on a NON-ready observation
// must still fail closed -- the accepted shape is status-specific, not "eleven keys plus
// optionally two more no matter what status says".
test("a non-ready observation carrying the two ready-only fields is rejected (the shape stays status-specific)", () => {
  const path = root();
  try {
    assert.throws(() => requireProjectOnboardingReady({
      rootDir: path,
      intent: "session",
      runner: "codex",
      inspect: () => ({ ...readyResultWithPushApprovalKeys(path, "session"), status: "restart-required" }),
    }), (error) => error instanceof ProjectOnboardingReadyError && error.code === "PORG-INVALID-OBSERVATION");
  } finally { rmSync(path, { recursive: true, force: true }); }
});

test("every controlling non-ready lifecycle status is preserved and denied without forwarding diagnostics", () => {
  const path = root();
  try {
    assert.equal(PROJECT_ONBOARDING_CONTROLLING_NON_READY_STATUSES.length, 33);
    for (const status of ["enrollment-retirement-required", "enrollment-history-recovery-required", "enrollment-activation-required"]) {
      assert.equal(PROJECT_ONBOARDING_CONTROLLING_NON_READY_STATUSES.includes(status), true);
    }
    for (const status of PROJECT_ONBOARDING_CONTROLLING_NON_READY_STATUSES) {
      assert.throws(() => requireProjectOnboardingReady({
        rootDir: path,
        intent: "session",
        runner: "codex",
        inspect: () => ({
          ...readyResult(path, "session"),
          status,
          diagnostics: [{ message: "private/raw/diagnostic" }],
        }),
      }), (error) => {
        assert(error instanceof ProjectOnboardingReadyError);
        assert.equal(error.code, "PORG-NOT-READY");
        assert.equal(error.intent, "session");
        assert.equal(error.lifecycleStatus, status);
        assert.equal(error.message.includes("private/raw/diagnostic"), false);
        assert.equal(error.message.includes(path), false);
        return true;
      });
    }
  } finally { rmSync(path, { recursive: true, force: true }); }
});

test("session capability failure phase is preserved only for a valid matching non-ready observation", () => {
  const path = root();
  try {
    const readyWithPhase = {
      ...readyResult(path, "session", "codex"),
      repository: { sessionCapabilityFailurePhase: "descriptor-retirement" },
    };
    assert.throws(() => requireProjectOnboardingReady({ rootDir: path, intent: "session", runner: "codex", inspect: () => readyWithPhase }), (error) => error instanceof ProjectOnboardingReadyError && error.code === "PORG-INVALID-OBSERVATION");
    const phased = readyResult(path, "session", "codex");
    phased.status = "session-capability-unavailable";
    phased.repository = { sessionCapabilityFailurePhase: "descriptor-retirement" };
    assert.throws(() => requireProjectOnboardingReady({ rootDir: path, intent: "session", runner: "codex", inspect: () => phased }), (error) => {
      assert(error instanceof ProjectOnboardingReadyError);
      assert.equal(error.code, "PORG-NOT-READY");
      assert.equal(error.sessionCapabilityFailurePhase, "descriptor-retirement");
      return true;
    });
    const invalid = { ...phased, repository: { sessionCapabilityFailurePhase: "raw-error-must-not-escape" } };
    assert.throws(() => requireProjectOnboardingReady({ rootDir: path, intent: "session", runner: "codex", inspect: () => invalid }), (error) => error instanceof ProjectOnboardingReadyError && error.code === "PORG-INVALID-OBSERVATION");
    const nonSession = { ...phased, status: "worktree-capability-unavailable" };
    assert.throws(() => requireProjectOnboardingReady({ rootDir: path, intent: "session", runner: "codex", inspect: () => nonSession }), (error) => error instanceof ProjectOnboardingReadyError && error.code === "PORG-INVALID-OBSERVATION");
    const absent = { ...phased, repository: {} };
    assert.throws(() => requireProjectOnboardingReady({ rootDir: path, intent: "session", runner: "codex", inspect: () => absent }), (error) => error instanceof ProjectOnboardingReadyError && error.sessionCapabilityFailurePhase === null);
  } finally { rmSync(path, { recursive: true, force: true }); }
});

// NVA-BL-INTAKEBIND-1 (AC-2): the Wave 4 onboarding coordinator's three new
// v4Inspection statuses (design.md SSa.4) must be recognized as controlling
// non-ready statuses -- a repo observed at any of them must fail as
// PORG-NOT-READY with the matching lifecycleStatus, never fall through to the
// fail-closed-on-unknown-status PORG-INVALID-OBSERVATION branch.
test("intake-required, intake-design-questions-required, and bootstrap-binding-required fail closed as PORG-NOT-READY, not PORG-INVALID-OBSERVATION", () => {
  const path = root();
  try {
    for (const status of ["intake-required", "intake-design-questions-required", "bootstrap-binding-required"]) {
      assert(PROJECT_ONBOARDING_CONTROLLING_NON_READY_STATUSES.includes(status), status);
      assert.throws(() => requireProjectOnboardingReady({
        rootDir: path,
        intent: "session",
        runner: "codex",
        inspect: () => ({ ...readyResult(path, "session"), status }),
      }), (error) => {
        assert(error instanceof ProjectOnboardingReadyError);
        assert.equal(error.code, "PORG-NOT-READY");
        assert.equal(error.lifecycleStatus, status);
        return true;
      });
    }
  } finally { rmSync(path, { recursive: true, force: true }); }
});

test("exceptions, malformed envelopes, intent/root mismatch, and false-ready actions fail closed", () => {
  const path = root();
  const malformed = [
    null,
    {},
    { ...readyResult(path, "dispatch"), schema: "pipeline.project-onboarding.v3" },
    readyResult(path, "session"),
    { ...readyResult(path, "dispatch"), root: `${path}-other` },
    { ...readyResult(path, "dispatch"), runner: null },
    { ...readyResultWithPushApprovalKeys(path, "dispatch"), runnerPermissions: { status: "current" } },
    { ...readyResultWithPushApprovalKeys(path, "dispatch"), runnerPermissions: {
      ...fieldPlaceholder("runnerPermissions", path, "dispatch", "codex"),
      status: "drifted",
    } },
    { ...readyResultWithPushApprovalKeys(path, "dispatch"), runnerPermissions: {
      ...fieldPlaceholder("runnerPermissions", path, "dispatch", "codex"),
      exactEntries: [...expectedPipelineScriptsRunnerAllowlistEntries(), "Bash(node \"/untrusted/scripts/anything.mjs\" *)"],
    } },
    { ...readyResult(path, "dispatch"), nextAction: { kind: "command" } },
    { ...readyResult(path, "dispatch"), diagnostics: [{ code: "false-ready" }] },
    { ...readyResult(path, "dispatch"), status: "future-unknown-status" },
  ];
  try {
    for (const value of malformed) {
      assert.throws(() => requireProjectOnboardingReady({
        rootDir: path,
        intent: "dispatch",
        runner: "codex",
        inspect: () => value,
      }), (error) => error instanceof ProjectOnboardingReadyError && error.code === "PORG-INVALID-OBSERVATION");
    }
    assert.throws(() => requireProjectOnboardingReady({
      rootDir: path,
      intent: "dispatch",
      runner: "codex",
      inspect: () => { throw new Error("secret absolute path /private/repo"); },
    }), (error) => {
      assert(error instanceof ProjectOnboardingReadyError);
      assert.equal(error.code, "PORG-OBSERVATION-UNAVAILABLE");
      assert.equal(error.message.includes("secret"), false);
      assert.equal(error.message.includes("/private/repo"), false);
      return true;
    });
  } finally { rmSync(path, { recursive: true, force: true }); }
});

test("unsupported or missing intents are rejected before inspection", () => {
  for (const intent of [undefined, "", "generic", "Dispatch"]) {
    let calls = 0;
    assert.throws(() => requireProjectOnboardingReady({
      rootDir: "/unused",
      intent,
      inspect() { calls += 1; },
    }), (error) => error instanceof ProjectOnboardingReadyError && error.code === "PORG-INTENT");
    assert.equal(calls, 0);
  }
});

// pipeline.ready-gate-keys-derived-from-producer, Direction option 2 fallback (backlog:
// pipeline.ready-gate-hand-maintained-shape-mirror): the accepted STATUS enumeration cannot
// be derived structurally the way the two key lists above now are (see the comment above
// PROJECT_ONBOARDING_CONTROLLING_NON_READY_STATUSES in project-onboarding-ready-gate.mjs for
// the concrete obstacle). This test drives the gate against a REAL, non-stubbed
// inspectProjectOnboardingV3() result instead -- a genuinely fresh, empty temp root, with no
// `inspect` override -- so at least one status is proven end to end against actual producer
// output, not an internally-consistent fixture that only agrees with itself.
test("a real, non-stubbed inspectProjectOnboardingV3() result is driven straight through the gate (Direction option 2 fallback)", () => {
  const path = root();
  try {
    const real = inspectProjectOnboardingV3({ rootDir: path, intent: "onboarding", runner: "codex" });
    // Pinned so this test fails loudly (not silently) if project-onboarding-v3.mjs ever
    // changes what a genuinely fresh, empty root observes -- the exact drift class this
    // item exists to catch, this time on the STATUS axis rather than the key axis.
    assert.equal(real.status, "portable-seed-required");
    assert(PROJECT_ONBOARDING_CONTROLLING_NON_READY_STATUSES.includes(real.status), real.status);
    assert.deepEqual(Object.keys(real).sort(), [...PROJECT_ONBOARDING_BASE_RESULT_KEYS].sort());
    assert.throws(() => requireProjectOnboardingReady({
      rootDir: path,
      intent: "onboarding",
      runner: "codex",
      inspect: () => real,
    }), (error) => {
      assert(error instanceof ProjectOnboardingReadyError);
      assert.equal(error.code, "PORG-NOT-READY");
      assert.equal(error.lifecycleStatus, "portable-seed-required");
      return true;
    });
    // The other half of Direction option 2: a status the gate does not know about -- standing
    // in for "the producer gained a new lifecycle status" -- built from this SAME real
    // observation with only `status` mutated, so every other field stays genuinely
    // producer-shaped rather than hand-typed. Must fail the check, never silently pass or
    // silently block every other write.
    assert.throws(() => requireProjectOnboardingReady({
      rootDir: path,
      intent: "onboarding",
      runner: "codex",
      inspect: () => ({ ...real, status: "a-status-this-gate-has-never-heard-of" }),
    }), (error) => error instanceof ProjectOnboardingReadyError && error.code === "PORG-INVALID-OBSERVATION");
  } finally { rmSync(path, { recursive: true, force: true }); }
});

// RF2B (ALFRED-RF2B2-20261004): the one diagnostic a ready observation may carry --
// the typed `cleanup_residue_foreign` warning. The two archive actions inside it are
// the producer's OWN, built here by the real planner over stubbed observation seams, so
// the gate's validator is pinned against actual producer output rather than a
// hand-typed copy that only agrees with itself; the read-only plan action is the one
// literal the producer does not export.
const SESSION_CLEANUP_SCRIPT = fileURLToPath(new URL("../scripts/session-cleanup.mjs", import.meta.url));

function foreignResidueWarning(rootDir, sessionIds = ["foreign-a"]) {
  const offer = planOrphanDescriptorArchive({
    rootDir,
    scriptPath: SESSION_CLEANUP_SCRIPT,
    deps: {
      listActiveSessionDescriptorsFn: () => sessionIds.map((sessionId, index) => ({
        sessionId,
        descriptorSha256: String(index + 1).repeat(64),
      })),
      inspectOrphanArchiveEligibilityFn: () => ({ status: "eligible", ownerStatus: "unavailable", resume: false }),
      readOnboardingSessionCleanupBindingFn: () => ({ status: "unbound" }),
    },
  });
  assert.equal(offer.status, "ready");
  assert.equal(offer.candidates.length, sessionIds.length);
  return {
    path: "$.authority.sessionCleanup",
    code: "cleanup_residue_foreign",
    message: "retained cleanup residue belongs to a foreign session and carries no authority",
    guidance: "archive it with the exact digest-bound archive-orphan action when convenient; it does not block this session",
    severity: "warning",
    nextAction: {
      kind: "command",
      executable: "node",
      argv: [SESSION_CLEANUP_SCRIPT, "plan-archive-orphan", "--repo", rootDir],
      mutation: false,
      requiresConfirmation: false,
      expected: { schema: "pipeline.session-orphan-archive-plan.v1", statuses: ["ready"] },
    },
    archiveActions: offer.candidates.map((candidate) => candidate.action),
  };
}

test("validForeignCleanupResidueWarning accepts exactly the closed foreign-residue warning and rejects every tamper", () => {
  const path = root();
  try {
    const rootDir = realpathSync(path);
    const good = foreignResidueWarning(rootDir, ["foreign-a", "foreign-b"]);
    assert.equal(validForeignCleanupResidueWarning(good, rootDir), true);
    assert.equal(validForeignCleanupResidueWarning(foreignResidueWarning(rootDir), rootDir), true);

    const elsewhere = join(tmpdir(), "foreign-plugin", "scripts", "session-cleanup.mjs");
    const tampers = {
      "severity": (w) => { w.severity = "error"; },
      "extra top-level key": (w) => { w.extra = true; },
      "missing key": (w) => { delete w.guidance; },
      "wrong code": (w) => { w.code = "cleanup_recovery_required"; },
      "wrong path": (w) => { w.path = "$.runtime"; },
      "empty archiveActions": (w) => { w.archiveActions = []; },
      "archiveActions not an array": (w) => { w.archiveActions = w.archiveActions[0]; },
      "flipped mutation on the read-only plan action": (w) => { w.nextAction.mutation = true; },
      "flipped mutation on an archive action": (w) => { w.archiveActions[1].mutation = false; },
      "flipped confirmation on an archive action": (w) => { w.archiveActions[0].requiresConfirmation = true; },
      "wrong script path on the plan action (same basename, other directory)": (w) => { w.nextAction.argv[0] = elsewhere; },
      "wrong script path on an archive action (same basename, other directory)": (w) => { w.archiveActions[1].argv[0] = elsewhere; },
      "a different script": (w) => { w.archiveActions[0].argv[0] = SESSION_CLEANUP_SCRIPT.replace("session-cleanup.mjs", "pipeline-state.mjs"); },
      "wrong verb": (w) => { w.archiveActions[0].argv[1] = "release-orphan-binding"; },
      "other repository": (w) => { w.archiveActions[0].argv[3] = join(tmpdir(), "elsewhere"); },
      "malformed digest": (w) => { w.archiveActions[0].argv[7] = "not-a-digest"; },
      "pre-filled operator": (w) => { w.archiveActions[0].argv[9] = "mallory"; },
      "extra argv entry": (w) => { w.archiveActions[0].argv.push("--force"); },
      "wrong executable": (w) => { w.nextAction.executable = "bash"; },
      "wrong expected schema": (w) => { w.archiveActions[0].expected.schema = "pipeline.inspect.v1"; },
      "plan action carries an extra key": (w) => { w.nextAction.requiresInput = ["--by"]; },
    };
    for (const [label, tamper] of Object.entries(tampers)) {
      const tampered = structuredClone(good);
      tamper(tampered);
      assert.equal(validForeignCleanupResidueWarning(tampered, rootDir), false, label);
    }
    assert.equal(validForeignCleanupResidueWarning(good, join(tmpdir(), "another-root")), false, "bound to the observed root");
    for (const scalar of [null, undefined, "warning", [], 0]) {
      assert.equal(validForeignCleanupResidueWarning(scalar, rootDir), false, String(scalar));
    }
  } finally { rmSync(path, { recursive: true, force: true }); }
});

test("a ready observation carrying exactly the foreign-residue warnings passes the gate while any other diagnostic is still PORG-INVALID-OBSERVATION", () => {
  const path = root();
  try {
    const rootDir = realpathSync(path);
    const gate = (diagnostics) => requireProjectOnboardingReady({
      rootDir: path,
      intent: "session",
      runner: "claude",
      inspect: () => ({ ...readyResultWithPushApprovalKeys(path, "session", "claude"), diagnostics }),
    });
    for (const diagnostics of [[], [foreignResidueWarning(rootDir)], [foreignResidueWarning(rootDir, ["foreign-a", "foreign-b"])]]) {
      assert.deepEqual(gate(diagnostics), {
        schema: PROJECT_ONBOARDING_READY_GATE_SCHEMA,
        status: "ready",
        intent: "session",
      }, `${diagnostics.length} diagnostics`);
    }

    const otherDiagnostic = {
      path: "$.authority.sessionCleanup",
      code: "cleanup_recovery_required",
      message: "exact retained cleanup residue blocks authority completion",
      guidance: "apply only the descriptor- and digest-bound cleanup recovery action",
    };
    const invalid = {
      "a different diagnostic": [otherDiagnostic],
      "the warning next to a different diagnostic": [foreignResidueWarning(rootDir), otherDiagnostic],
      "a tampered severity": [{ ...foreignResidueWarning(rootDir), severity: "error" }],
      "an extra key": [{ ...foreignResidueWarning(rootDir), extra: true }],
      "a warning built for another root": [foreignResidueWarning(join(tmpdir(), "another-root"))],
      "a non-array": foreignResidueWarning(rootDir),
      "null": null,
    };
    for (const [label, diagnostics] of Object.entries(invalid)) {
      assert.throws(() => gate(diagnostics), (error) => error instanceof ProjectOnboardingReadyError
        && error.code === "PORG-INVALID-OBSERVATION"
        && error.lifecycleStatus === null, label);
    }
  } finally { rmSync(path, { recursive: true, force: true }); }
});
