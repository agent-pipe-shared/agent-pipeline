#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync, closeSync, copyFileSync, existsSync, fstatSync, fsyncSync, lstatSync, mkdirSync, mkdtempSync,
  openSync, readFileSync, readdirSync, renameSync, rmSync, symlinkSync, linkSync, unlinkSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  applyProjectOnboardingManifestRepairV4,
  applyProjectOnboardingKickoffV4,
  applyProjectOnboardingKickoffPromotionV4,
  applyProjectOnboardingLifecycleV4,
  applyProjectOnboardingManifestRepair,
  applyProjectOnboardingV3,
  inspectProjectOnboardingV3,
  planProjectOnboardingManifestRepair,
  planProjectOnboardingSourceRecovery,
  planProjectOnboardingKickoffV4,
  planProjectOnboardingKickoffPromotionV4,
  planProjectOnboardingLifecycleV4,
  planProjectOnboardingManifestRepairV4,
  planProjectOnboardingSourceRecoveryV4,
  planProjectOnboardingV3,
  freshManifestBytes,
  planProjectPartialAuthorityAdoption,
  applyProjectPartialAuthorityAdoption,
  applyProjectOnboardingReinstall,
  planProjectOnboardingReinstall,
  planProjectRemoteAdoptionV4,
  applyProjectRemoteAdoptionV4,
  renderProjectOnboardingAction,
  freshCriticalHumanProofPolicyBytes,
  freshSettingsJsonBytes,
  observeLocalTrustAnchorPointer,
  pipelineScriptsRunnerAllowlistEntries,
  PROJECT_ONBOARDING_VERIFY_COMMAND_PLACEHOLDER,
} from "./project-onboarding-v3.mjs";
import { readCriticalHumanProofPolicy } from "./critical-human-proof-policy.mjs";
import { planRunnerProfileMigrationV3 } from "./runner-profile-migration-v3.mjs";
import { planInstall as planPrePushHookInstall } from "../scripts/pre-push-hook-install.mjs";
import { validateV3BootstrapAuthority } from "../scripts/v3-bootstrap-authority.mjs";
import { parseYaml } from "./yaml-lite.mjs";
import { validatePipelineUserV3 } from "./runner-profiles-v3.mjs";
import { validCurrentPlanApproval, validPlanSubmission } from "./plan-spec-state-v2.mjs";
import { main as onboardingCli } from "../scripts/project-onboarding-v3.mjs";
import { driveOnboardingInit } from "../scripts/onboarding-init.mjs";
import { main as sessionCleanupCli } from "../scripts/session-cleanup.mjs";
import { run as pipelineStateRun } from "../scripts/pipeline-state.mjs";
import {
  canonicalJson, CodexOnboardingRuntimeError, consumeRuntimeReadback, issueLaunchTicket, persistRestartBarrier,
  prepareRuntimeRestartBinding, readCurrentRuntimeReadback, readRestartBarrier,
  removeRestartBarrierCas, requiresNativeRuntimeReadback, sha256,
} from "./codex-onboarding-runtime.mjs";
import { observeOnboardingAppServer } from "./codex-onboarding-app-server.mjs";
import {
  applyOnboardingBootstrapBind, applyOnboardingIntakeGenerate, observeBootstrapBindAcknowledgement,
  planOnboardingBootstrapBind, planOnboardingIntakeGenerate, readOnboardingSessionCleanupBinding,
} from "./onboarding-continuity.mjs";
import {
  cleanupSession, listActiveSessionDescriptors, retireSessionDescriptor, startSessionDescriptor,
} from "./worktree-lifecycle.mjs";
import {
  applyProjectAuthoritySessionCleanupRecovery,
  planProjectAuthoritySessionCleanupRecovery,
  readProjectAuthority,
} from "./project-authority.mjs";
import { gateConfig, loadManifest, validateManifest } from "./manifest.mjs";
import { captureResumeHint, discardResumeHint, inspectResumeHint } from "./resume-hint.mjs";
import { inspectObservationGovernanceBootstrap } from "./observation-governance-bootstrap.mjs";
import { PO_GATE_PRD_ACKNOWLEDGEMENT_MARKER, validatePoGateAuthorityForRepository } from "./po-gate-authority.mjs";
import { initializePoGateProfileReceipt as initializeActualPoGateProfileReceipt } from "./po-gate-profile-publisher.mjs";
import { isDirectInvocation } from "./entrypoint.mjs";
import { requireProjectOnboardingReady } from "./project-onboarding-ready-gate.mjs";

// This file is BOTH a 109-case suite and the fixture library other suites borrow
// (`root`, `dispose`, `fakeDeps`, ... are exported below). Until this guard, an
// importer paid for the whole suite as an import side effect: the lifecycle
// recovery contract test needed four helpers and ran 109 unrelated cases to get
// them, which is minutes of wall clock and a confusing double report.
//
// Guarding `test()` rather than extracting the fixtures is deliberate. The
// helpers are woven through the suite's own setup; lifting them into a separate
// module would mean moving code out of a 109-case file to save an import, and a
// mis-lift there is exactly the kind of change whose breakage looks like a
// fixture problem. This is two lines, changes nothing when the file is run
// directly, and fixes it for every importer that will ever exist.
const RUNNING_AS_SUITE = isDirectInvocation(import.meta.url);
let passed = 0; const failures = [];
function test(name, run) { if (!RUNNING_AS_SUITE) return; try { run(); passed += 1; console.log(`PASS  ${name}`); } catch (error) { failures.push(`${name}: ${error.message}`); console.log(`FAIL  ${name} -- ${error.message}`); } }
// `root`, `dispose`, `fakeDeps`, `fakeGit`, `initializeRestartRequiredRoot`,
// `clearRuntimeBarrier`, `completeKickoff` and `PLUGIN_PIPELINE_STATE_SCRIPT`
// are exported below so the contract suite
// (guard-lifecycle-recovery-contract.test.mjs) can drive the REAL,
// dependency-injected `inspectProjectOnboardingV3` through the same
// already-tested fixture this file uses, rather than duplicating ~150 lines
// of fixture setup or hand-typing a result shape (the exact anti-pattern
// backlog item 2026-08-08-the-guard-refuses-the-recovery-the-inspection-
// prescribes.md's AC-8 calls out).
export function root() { return mkdtempSync(join(tmpdir(), "project onboarding v3 matrix with spaces-")); }
function spacedRoot() { return mkdtempSync(join(tmpdir(), "project onboarding v3 with spaces-")); }
export function dispose(path) { rmSync(path, { recursive: true, force: true }); }
export function fakeGit(command, args, options = {}) {
  if (command !== "git") return { status: 1, stderr: "unexpected program" };
  if (args[0] === "--version") return { status: 0, stdout: "git version 2.40.1\n", stderr: "" };
  if (args[0] === "rev-parse" && args[1] === "--path-format=absolute" && args[2] === "--git-common-dir") return { status: 0, stdout: `${join(options.cwd, ".git")}\n`, stderr: "" };
  if (args[0] === "rev-parse" && args[1] === "--is-inside-work-tree") return { status: 0, stdout: "true\n", stderr: "" };
  if (args[0] === "init" && args[1] === "--initial-branch=main") { mkdirSync(join(options.cwd, ".git")); return { status: 0, stdout: "", stderr: "" }; }
  return { status: 1, stderr: "unexpected git arguments" };
}
function hostGit(rootDir, args) {
  const result = spawnSync("git", args, {
    cwd: rootDir,
    encoding: "utf8",
    shell: false,
    env: {
      ...process.env,
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
      LC_ALL: "C",
    },
  });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr || `git ${args[0]} failed`);
  return String(result.stdout).trim();
}
function fakeCapabilities({ rootDir, intent, willInitializeGit = false }) {
  const hasGit = existsSync(join(rootDir, ".git"));
  return {
    status: hasGit ? "local-valid-writable" : "local-uninitialized",
    mode: "local",
    gitVersion: "2.40.1",
    initializesGit: !hasGit && intent === "onboarding" && willInitializeGit,
    rootWritable: "passed",
    sessionCapability: ["onboarding", "bootstrap"].includes(intent) ? "not-required" : "passed",
    worktreeCapability: intent === "dispatch" ? "passed" : "not-required",
  };
}
function fakeAppServer({ intent }) {
  return intent === "onboarding"
    ? { required: false, status: "not-requested", code: null }
    : { required: true, status: "running", code: "CAS-READY" };
}
export const fakeDeps = {
  spawnSync: fakeGit,
  codexExecutable: process.execPath,
  observeCodexOnboardingCapabilities: fakeCapabilities,
  observeOnboardingAppServer: fakeAppServer,
  observePersistedPoAuthority() {
    return { status: "absent" };
  },
  // Deterministic "already asked" by default -- never falls through to the
  // REAL `~/.agent-pipeline/machine.json` on whatever machine the suite
  // happens to run on. Tests for the push-approval-setup ask (regression:
  // installing-consumer-is-never-asked-any-setup-decision.md) override this
  // explicitly to prove both the "unasked" and "already asked" cases.
  readMachinePlane() {
    return {
      status: "valid",
      plane: {
        schema: "pipeline.machine-plane.v1", poKeyDirectory: null, pushApprovalDefault: "signature",
        routing: null, language: null, session: null, usage: null, updatedAt: "2026-08-08T00:00:00.000Z",
      },
    };
  },
  initializePoGateProfileReceipt() {
    return {
      ok: true,
      code: "PO-PROFILE-RECEIPT-INITIALIZED",
      humanFacing: "en",
      receiptSha256: "0".repeat(64),
    };
  },
  planSessionCleanupRecovery() {
    return {
      schema: "pipeline.session-cleanup-recovery-plan.v1",
      status: "not-needed",
    };
  },
};
const ONBOARDING_SCRIPT = fileURLToPath(new URL("../scripts/project-onboarding-v3.mjs", import.meta.url));
const PROJECT_AUTHORITY_MIGRATION_SCRIPT = fileURLToPath(new URL("../scripts/project-authority-migration.mjs", import.meta.url));
const MIGRATION_SCRIPT = fileURLToPath(new URL("../scripts/runner-profile-migration-v3.mjs", import.meta.url));
const HOST_REPOSITORY_INIT_SCRIPT = fileURLToPath(new URL("../scripts/codex-host-repository-init.mjs", import.meta.url));
const ONBOARDING_LAUNCH_SCRIPT = fileURLToPath(new URL("../scripts/codex-onboarding-launch.mjs", import.meta.url));
const APP_SERVER_HEALTH_SCRIPT = fileURLToPath(new URL("../scripts/codex-app-server-health.mjs", import.meta.url));
const PIPELINE_STATE_SCRIPT = fileURLToPath(new URL("../scripts/pipeline-state.mjs", import.meta.url));
export const PLUGIN_PIPELINE_STATE_SCRIPT = fileURLToPath(new URL("../scripts/pipeline-state.mjs", import.meta.url));
const SESSION_CLEANUP_SCRIPT = fileURLToPath(new URL("../scripts/session-cleanup.mjs", import.meta.url));
const SESSION_CAPABILITY_DIAGNOSE_SCRIPT = fileURLToPath(new URL("../scripts/session-capability-diagnose.mjs", import.meta.url));
function names(path) { return readdirSync(path).sort(); }
function yaml(value, indent = "") {
  return Object.entries(value).map(([key, child]) => {
    if (child && typeof child === "object") return `${indent}${key}:\n${yaml(child, `${indent}  `)}`;
    return `${indent}${key}: ${typeof child === "string" ? child : String(child)}\n`;
  }).join("");
}
function v0Source() {
  const route = (model, effort) => ({ model, effort });
  return {
    language: { human_facing: "en", agent_facing: "en" }, agent_runtime: "other",
    worktypes: {
      design: { design_phase: route("opus-4.8", "high"), execution_phase: route("opus-4.8", "high"), advisor: "off" },
      feature: { design_phase: route("opus-4.8", "high"), execution_phase: route("sonnet-5", "high"), advisor: "opus-4.8" },
      mini: { design_phase: route("sonnet-5", "high"), execution_phase: route("sonnet-5", "high"), advisor: "opus-4.8" },
    },
    models: { implement: route("sonnet-5", "medium"), mechanic: route("sonnet-5", "low"), deep: route("sonnet-5", "xhigh"), review: route("sonnet-5", "max") },
    autonomy: { push_policy: "gated", branch_model: "feature-branch", wip_limit: 1 },
    gates: { dev_plan: "blocking", push: "blocking", security: "warn", claude_md_max_lines: 200 },
  };
}

function repositoryCapability(status, intent = "dispatch") {
  const local = !["unavailable", "host-managed"].includes(status);
  return {
    status,
    mode: status === "host-managed" ? "host-managed" : local ? "local" : "unknown",
    gitVersion: local && !["root-read-only", "control-path-invalid"].includes(status) ? "2.40.1" : null,
    initializesGit: false,
    rootWritable: status === "root-read-only" ? "failed" : status === "unavailable" ? "not-observed" : "passed",
    sessionCapability: status === "session-capability-unavailable" ? "failed"
      : status === "worktree-capability-unavailable" ? "passed"
        : intent === "onboarding" || intent === "bootstrap" ? "not-required" : "not-observed",
    worktreeCapability: status === "worktree-capability-unavailable" ? "failed"
      : intent === "dispatch" ? "not-observed" : "not-required",
  };
}

// `runner` defaults to the historical fixture identity ("codex") so every
// existing caller of this shared test setup keeps its exact prior behaviour
// -- this is a test-fixture default, not the library default this task
// removes; project-onboarding-v3.mjs itself never assumes one.
export function initializeRestartRequiredRoot(path, deps = fakeDeps, runner = "codex") {
  const portable = planProjectOnboardingV3({ rootDir: path, deps, runner });
  assert.equal(applyProjectOnboardingV3(portable, { rootDir: path, activate: true, deps }).status, "applied");
  const runtime = planProjectOnboardingLifecycleV4({ rootDir: path, deps, operation: "runtime", runner });
  const digest = runtime.nextAction.argv[runtime.nextAction.argv.indexOf("--plan-sha256") + 1];
  const initialized = applyProjectOnboardingLifecycleV4({
    rootDir: path,
    deps,
    operation: "runtime",
    planSha256: digest,
    activate: true,
    runner,
  });
  assert.equal(initialized.status, "restart-required");
  return readRestartBarrier({ rootDir: path, spawn: fakeGit });
}

function initializeRuntimeProjectionRoot(path, deps = fakeDeps, runner = "codex") {
  const barrier = initializeRestartRequiredRoot(path, deps, runner);
  clearRuntimeBarrier(path, barrier);
}

export function clearRuntimeBarrier(path, barrier) {
  const issued = issueLaunchTicket({
    rootDir: path,
    barrierSha256: barrier.rawSha256,
    now: 40_000,
    spawn: fakeGit,
    codexExecutable: process.execPath,
  });
  consumeRuntimeReadback({
    rootDir: path,
    ticketId: issued.ticketId,
    token: issued.token,
    now: 40_001,
    spawn: fakeGit,
    codexExecutable: process.execPath,
    receipt: {
      schema: "pipeline.codex-project-runtime-readback.v1",
      barrierSha256: barrier.rawSha256,
      repositoryFingerprint: barrier.barrier.repositoryFingerprint,
      sourceSha256: barrier.barrier.sourceSha256,
      runtimeTargetsSha256: barrier.barrier.runtimeTargetsSha256,
      readerGenerationSha256: sha256(Buffer.alloc(32, 0xa5)),
      effectiveConfigSha256: sha256("effective"),
      validatedAgentsSha256: sha256("agents"),
      ticketId: issued.ticketId,
      observedAtEpochMs: 40_001,
    },
  });
}

export function completeKickoff(path, goal = "Build a safe project", deps = fakeDeps, expectedStatus = "ready", runner = "codex") {
  const plan = planProjectOnboardingKickoffV4({ rootDir: path, goal, deps, runner });
  assert.equal(plan.schema, "pipeline.codex-onboarding-kickoff-plan.v1");
  const result = applyProjectOnboardingKickoffV4({
    rootDir: path,
    goal,
    planSha256: plan.planSha256,
    activate: true,
    deps,
    runner,
  });
  assert.equal(result.status, expectedStatus);
  assert.equal(result.continuity.status, "valid");
  return plan;
}

// Simulates the PO's own out-of-band act (never an agent's, per
// po-gate-authority.mjs's PO_GATE_PRD_ACKNOWLEDGEMENT_MARKER contract) of
// having personally read the active PRD and judged it content-sound and
// Spec-consistent, for a test that needs to reach submit-plan/approve-plan
// (an ACTIVE po-gate-authority validation) on a kickoff-generated PRD.
// Kickoff itself must never add this marker -- only a test simulating a
// completed human review does, deliberately, as a distinct step.
export function acknowledgePoGatePlan(rootDir, planPath) {
  const path = join(rootDir, planPath);
  writeFileSync(path, `${readFileSync(path, "utf8")}${PO_GATE_PRD_ACKNOWLEDGEMENT_MARKER}\n`);
}

function assertSingleLineAction(action, expected) {
  assert.deepEqual(action, expected);
  const rendered = renderProjectOnboardingAction(action);
  assert.equal(typeof rendered, "string");
  assert.equal(rendered.includes("\n"), false);
  assert.equal(rendered.includes("\r"), false);
  assert.ok(rendered.length > 0);
  return rendered;
}

function assertPlanLifecycleInspectAction(action) {
  return assertSingleLineAction(action, {
    kind: "command",
    executable: "node",
    argv: [PIPELINE_STATE_SCRIPT, "inspect"],
    mutation: false,
    requiresConfirmation: false,
    expected: { schema: "pipeline.inspect.v1", statuses: ["draft", "awaiting-approval"] },
  });
}

function assertBoundedRestartCopyCommand(action) {
  const copy = action?.launch?.copyCommand;
  assert.deepEqual(Object.keys(copy).sort(), ["cmd", "maxColumns", "posix", "powershell"]);
  assert.equal(copy.maxColumns, 72);
  for (const command of [copy.posix, copy.powershell, copy.cmd]) {
    assert.equal(typeof command, "string");
    assert.equal(command.split(/\r?\n/u).every((line) => line.length <= copy.maxColumns), true);
  }
  if (process.platform !== "win32") {
    const lines = copy.posix.split("\n");
    const assignments = lines.slice(0, -1).join("\n");
    assert.equal(lines.at(-1), 'node "$P" --root "$R" --barrier-sha256 "$B" --activate');
    assert.equal(lines.some((line) => line.endsWith("\\")), false);
    const probe = spawnSync("bash", ["-c", `${assignments}\nprintf '%s\\0%s\\0%s' "$P" "$R" "$B"`], {
      encoding: "buffer",
      shell: false,
    });
    assert.equal(probe.status, 0, String(probe.stderr));
    assert.deepEqual(probe.stdout.toString("utf8").split("\0"), [
      action.launch.argv[0],
      action.launch.argv[2],
      action.launch.argv[4],
    ]);
  }
  const powershellLines = copy.powershell.split("\n");
  assert.equal(powershellLines.at(-1), "& node $P --root $R --barrier-sha256 $B --activate");
  assert.equal(powershellLines.some((line) => line.endsWith("`")), false);
  const cmdLines = copy.cmd.split("\r\n");
  assert.equal(cmdLines.at(-1), 'node "%P%" --root "%R%" --barrier-sha256 "%B%" --activate');
  assert.equal(cmdLines.some((line) => line.endsWith("^")), false);
  return copy;
}

function assertDiagnostic(result, code, extraKeys = []) {
  assert.equal(result.diagnostics.length, 1);
  assert.deepEqual(Object.keys(result.diagnostics[0]).sort(), ["code", "guidance", "message", "path", ...extraKeys].sort());
  assert.equal(result.diagnostics[0].code, code);
  for (const [key, value] of Object.entries(result.diagnostics[0])) {
    if (extraKeys.includes(key)) continue;
    assert.equal(typeof value, "string");
    assert.equal(/[\r\n]/u.test(value), false);
  }
}

/**
 * NVA-SOURCERECOVERY-1, corrected by NVA-RECOVERYDEADEND-1: assert the typed
 * `repairCommand` field a source-recovery "unrepairable" diagnostic now
 * always carries. Every diagnostic this planner emits resolves to
 * `available: false` -- a reason distinct from the diagnostic's own `code`,
 * plus its own human-readable guidance, without duplicating the diagnostic's
 * message. The one route that used to name `plan-source-recovery` itself as
 * an `available: true` repair command was removed entirely
 * (NVA-RECOVERYDEADEND-1): that command is this planner's own single caller
 * (background fact in the briefing), so naming it as a repair pointed a
 * diagnostic at its own producer.
 */
function assertNoAutomatedRepairRoute(repairCommand) {
  assert.deepEqual(Object.keys(repairCommand).sort(), ["available", "guidance", "reason"]);
  assert.equal(repairCommand.available, false);
  assert.equal(repairCommand.reason, "no_automated_repair_route");
  assert.equal(typeof repairCommand.guidance, "string");
  assert.match(repairCommand.guidance, /no automated repair route applies/u);
}

/**
 * NVA-RECOVERYDEADEND-1: assert the additive `underlyingDiagnostics` field --
 * the actual validation diagnostics/errors already present on the
 * `inspectRunnerProfileMigrationV3` result the case-3 branch inspects,
 * carried through so a reader learns why the source was not recognized
 * instead of only that it wasn't. Checked structurally (same
 * `{path, code, message, repair}` shape `diagnostic()` in
 * runner-profile-migration-v3.mjs produces), never against a literal message
 * string, so unrelated wording changes in that module do not fail this test.
 */
function assertUnderlyingDiagnostics(underlyingDiagnostics) {
  assert.ok(Array.isArray(underlyingDiagnostics));
  assert.ok(underlyingDiagnostics.length > 0);
  for (const entry of underlyingDiagnostics) {
    assert.deepEqual(Object.keys(entry).sort(), ["code", "message", "path", "repair"]);
    for (const value of Object.values(entry)) assert.equal(typeof value, "string");
  }
}

function treeSnapshot(rootDir) {
  const output = {};
  const visit = (directory, prefix = "") => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        output[`${relative}/`] = "directory";
        visit(path, relative);
      } else if (entry.isFile()) {
        output[relative] = readFileSync(path).toString("base64");
      } else {
        output[relative] = `other:${lstatSync(path).mode}`;
      }
    }
  };
  visit(rootDir);
  return output;
}

function denied(code) {
  return Object.assign(new Error("synthetic runtime target permission denial"), { code });
}

function runtimeProbeFailureDeps(stage, code) {
  let probeFd;
  let probeClosed = false;
  let fstatFailed = false;
  let closeFailed = false;
  let renamed = false;
  let directoryFsyncFailed = false;
  const probePath = (value) => typeof value === "string" && value.includes(".pipeline-runtime-capability-");
  return {
    ...fakeDeps,
    openSync(path, flags, mode) {
      if (probePath(path) && stage === "create") throw denied(code);
      const fd = openSync(path, flags, mode);
      if (probePath(path)) probeFd = fd;
      return fd;
    },
    fstatSync(fd) {
      if (fd === probeFd && stage === "fstat" && !fstatFailed) {
        fstatFailed = true;
        throw denied(code);
      }
      return fstatSync(fd);
    },
    writeFileSync(target, ...args) {
      if (target === probeFd && stage === "write") throw denied(code);
      return writeFileSync(target, ...args);
    },
    fsyncSync(fd) {
      if (fd === probeFd && stage === "file-fsync") throw denied(code);
      if (renamed && probeClosed && stage === "directory-fsync" && !directoryFsyncFailed) {
        directoryFsyncFailed = true;
        throw denied(code);
      }
      return fsyncSync(fd);
    },
    closeSync(fd) {
      if (fd === probeFd) probeClosed = true;
      const result = closeSync(fd);
      if (fd === probeFd && stage === "close" && !closeFailed) {
        closeFailed = true;
        throw denied(code);
      }
      return result;
    },
    renameSync(source, target) {
      if (probePath(source) && stage === "rename") throw denied(code);
      const result = renameSync(source, target);
      if (probePath(source)) renamed = true;
      return result;
    },
    unlinkSync,
  };
}

test("repository capability failures map exactly and stop before source/runtime inspection", () => {
  const path = spacedRoot();
  const rows = [
    ["control-path-read-only", "repository-mount-read-only", "repository_control_path_read_only"],
    ["control-path-invalid", "repository-control-path-invalid", "repository_control_path_invalid"],
    ["git-unavailable", "git-capability-unavailable", "git_unavailable"],
    ["root-read-only", "project-root-read-only", "project_root_read_only"],
    ["session-capability-unavailable", "session-capability-unavailable", "session_capability_unavailable"],
    ["worktree-capability-unavailable", "worktree-capability-unavailable", "worktree_capability_unavailable"],
    ["unavailable", "repository-observation-unavailable", "repository_observation_unavailable"],
  ];
  try {
    for (const [componentStatus, aggregateStatus, diagnosticCode] of rows) {
      const repository = repositoryCapability(componentStatus);
      const observed = inspectProjectOnboardingV3({ runner: "codex",
        rootDir: path,
        intent: "dispatch",
        deps: {
          ...fakeDeps,
          observeCodexOnboardingCapabilities: () => repository,
          readdirSync: () => { throw new Error("later repository/source stage must not run"); },
        },
      });
      assert.equal(observed.status, aggregateStatus, componentStatus);
      assert.deepEqual(observed.repository, repository, componentStatus);
      assert.equal(observed.diagnostics.length, 1, componentStatus);
      assert.equal(observed.diagnostics[0].code, diagnosticCode, componentStatus);
      if (componentStatus === "session-capability-unavailable") {
        assertSingleLineAction(observed.nextAction, {
          kind: "command",
          executable: "node",
          argv: [SESSION_CAPABILITY_DIAGNOSE_SCRIPT, "--repo", path],
          mutation: true,
          requiresConfirmation: false,
          expected: {
            schema: "pipeline.session-capability-diagnosis.v1",
            statuses: ["ready", "unavailable", "precondition-unavailable"],
          },
        });
      } else {
        assert.equal(observed.nextAction, null, componentStatus);
      }
      assert.deepEqual(observed.continuity, {
        status: "unavailable",
        stateSha256: null,
        handoverSha256: null,
        historySha256: null,
      }, componentStatus);
      assert.deepEqual(observed.runtime, {
        status: "not-observed",
        sourceSha256: null,
        targetsSha256: null,
        barrierSha256: null,
        readbackSha256: null,
      }, componentStatus);
    }
  } finally { dispose(path); }
});

test("host-managed session and dispatch map to repository-mode-unsupported before later stages", () => {
  for (const intent of ["session", "dispatch"]) {
    const path = spacedRoot();
    try {
      const repository = repositoryCapability("host-managed", intent);
      const observed = inspectProjectOnboardingV3({ runner: "codex",
        rootDir: path,
        intent,
        deps: {
          ...fakeDeps,
          observeCodexOnboardingCapabilities: () => repository,
          readdirSync: () => { throw new Error("later repository/source stage must not run"); },
        },
      });
      assert.equal(observed.status, "repository-mode-unsupported", intent);
      assert.deepEqual(observed.repository, repository, intent);
      assert.equal(observed.diagnostics[0].code, "repository_mode_unsupported", intent);
      assert.equal(observed.nextAction, null, intent);
    } finally { dispose(path); }
  }
});

test("host-bound dispatch smoke observes and rolls back real session/worktree capability in a spaced root", () => {
  const path = spacedRoot();
  try {
    hostGit(path, ["init", "--initial-branch=main"]);
    writeFileSync(join(path, "README.md"), "host-bound integration smoke\n");
    hostGit(path, ["add", "README.md"]);
    hostGit(path, ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "fixture"]);
    const refsBefore = hostGit(path, ["for-each-ref", "--format=%(refname)%00%(objectname)"]);
    const worktreesBefore = hostGit(path, ["worktree", "list", "--porcelain", "-z"]);
    const observed = inspectProjectOnboardingV3({ runner: "codex", rootDir: path, intent: "dispatch" });
    assert.equal(observed.status, "adoption-required");
    assert.equal(observed.repository.status, "local-valid-writable");
    assert.equal(observed.repository.mode, "local");
    assert.equal(observed.repository.initializesGit, false);
    assert.equal(observed.repository.rootWritable, "passed");
    assert.equal(observed.repository.sessionCapability, "passed");
    assert.equal(observed.repository.worktreeCapability, "passed");
    assert.match(observed.repository.gitVersion, /^\d+\.\d+\.\d+/u);
    assert.equal(hostGit(path, ["for-each-ref", "--format=%(refname)%00%(objectname)"]), refsBefore);
    assert.equal(hostGit(path, ["worktree", "list", "--porcelain", "-z"]), worktreesBefore);
    assert.equal(existsSync(join(path, "branch")), false);
    assert.equal(existsSync(join(path, ".git", "agent-pipeline")), false);
  } finally { dispose(path); }
});

test("App Server is observed only on the ready path and exactly once for required intents", () => {
  const path = root();
  try {
    const barrier = initializeRestartRequiredRoot(path);
    clearRuntimeBarrier(path, barrier);
    completeKickoff(path);

    let onboardingCalls = 0;
    const onboarding = inspectProjectOnboardingV3({ runner: "codex",
      rootDir: path,
      intent: "onboarding",
      deps: {
        ...fakeDeps,
        observeOnboardingAppServer() {
          onboardingCalls += 1;
          throw new Error("onboarding must not request App Server");
        },
      },
    });
    assert.equal(onboarding.status, "ready");
    assert.deepEqual(onboarding.appServer, { required: false, status: "not-requested", code: null });
    assert.equal(onboardingCalls, 0);

    for (const intent of ["bootstrap", "session", "dispatch"]) {
      let calls = 0;
      const observed = inspectProjectOnboardingV3({ runner: "codex",
        rootDir: path,
        intent,
        deps: {
          ...fakeDeps,
          observeOnboardingAppServer(options) {
            calls += 1;
            assert.deepEqual(options, { intent });
            return { required: true, status: "running", code: "CAS-READY" };
          },
        },
      });
      assert.equal(observed.status, "ready", intent);
      assert.deepEqual(observed.appServer, { required: true, status: "running", code: "CAS-READY" }, intent);
      assert.equal(calls, 1, intent);
    }
  } finally { dispose(path); }
});

test("runtime-current bootstrap exposes cleanup recovery before App Server or session start", () => {
  const path = root();
  try {
    const barrier = initializeRestartRequiredRoot(path);
    clearRuntimeBarrier(path, barrier);
    completeKickoff(path);
    const humanRecoveryAction = {
      kind: "command",
      executable: "node",
      argv: [SESSION_CLEANUP_SCRIPT, "plan-human-recovery", "--repo", path],
      mutation: false,
      requiresConfirmation: false,
      expected: {
        schema: "pipeline.session-cleanup-human-recovery-plan.v1",
        statuses: ["decision-required"],
      },
    };
    // Per the PO's explicit 2026-08-18 decision (backlog item
    // pipeline.self-healing-local-cleanup-recovery), a "ready" typed plan is
    // now auto-applied rather than surfaced as a selection question.
    // Ordering (cleanup recovery precedes App Server) is proven here through
    // the apply-failure fallback: `observeOnboardingAppServer` throws if it
    // is ever reached, and it never is, because the auto-apply attempt
    // itself fails first and returns "partial" with the human recovery
    // action -- never the raw apply command.
    const observed = inspectProjectOnboardingV3({ runner: "codex",
      rootDir: path,
      intent: "bootstrap",
      deps: {
        ...fakeDeps,
        observeOnboardingAppServer() {
          throw new Error("cleanup recovery must precede App Server observation");
        },
        planSessionCleanupRecovery({ rootDir, scriptPath }) {
          assert.equal(rootDir, path);
          assert.equal(scriptPath.endsWith("/scripts/session-cleanup.mjs"), true);
          return {
            schema: "pipeline.session-cleanup-recovery-plan.v1",
            status: "ready",
            recovery: "retire-orphans",
            planSha256: "a".repeat(64),
          };
        },
        applySessionCleanupRecovery({ rootDir, expectedPlanSha256, activate, scriptPath }) {
          assert.equal(rootDir, path);
          assert.equal(expectedPlanSha256, "a".repeat(64));
          assert.equal(activate, true);
          assert.equal(scriptPath.endsWith("/scripts/session-cleanup.mjs"), true);
          throw new Error("simulated apply failure -- plan digest did not hold");
        },
      },
    });
    assert.equal(observed.status, "partial");
    assert.equal(observed.runtime.status, "readback-current");
    assert.deepEqual(observed.nextAction, humanRecoveryAction);
    assertDiagnostic(observed, "cleanup_recovery_apply_failed");

    // A "ready" plan whose auto-apply SUCCEEDS never surfaces any next
    // action or diagnostic at all -- it converges silently, at most a
    // completion note in the diagnostics, and the flow proceeds straight to
    // App Server exactly like "not-needed" -- never a selection question.
    let readyApplyCalls = 0;
    let readyAppServerCalls = 0;
    const readyAndApplied = inspectProjectOnboardingV3({ runner: "codex",
      rootDir: path,
      intent: "session",
      deps: {
        ...fakeDeps,
        observeOnboardingAppServer(options) {
          readyAppServerCalls += 1;
          return fakeAppServer(options);
        },
        planSessionCleanupRecovery() {
          return {
            schema: "pipeline.session-cleanup-recovery-plan.v1",
            status: "ready",
            recovery: "retire-orphans",
            planSha256: "b".repeat(64),
          };
        },
        applySessionCleanupRecovery({ expectedPlanSha256, activate }) {
          readyApplyCalls += 1;
          assert.equal(expectedPlanSha256, "b".repeat(64));
          assert.equal(activate, true);
          return {
            schema: "pipeline.session-cleanup-recovery-apply.v1",
            status: "retired",
            root: path,
            planSha256: "b".repeat(64),
          };
        },
      },
    });
    assert.equal(readyApplyCalls, 1);
    assert.equal(readyAppServerCalls, 1);
    assert.equal(readyAndApplied.status, "ready");
    assertPlanLifecycleInspectAction(readyAndApplied.nextAction);

    let activeSessionAppServerCalls = 0;
    const activeSession = inspectProjectOnboardingV3({ runner: "codex",
      rootDir: path,
      intent: "session",
      deps: {
        ...fakeDeps,
        observeOnboardingAppServer(options) {
          activeSessionAppServerCalls += 1;
          return fakeAppServer(options);
        },
        planSessionCleanupRecovery() {
          return {
            schema: "pipeline.session-cleanup-recovery-plan.v1",
            status: "cleanup-required",
          };
        },
      },
    });
    assert.equal(activeSession.status, "ready");
    assertPlanLifecycleInspectAction(activeSession.nextAction);
    assert.equal(activeSessionAppServerCalls, 1);

    const unavailable = inspectProjectOnboardingV3({ runner: "codex",
      rootDir: path,
      intent: "bootstrap",
      deps: {
        ...fakeDeps,
        observeOnboardingAppServer() {
          throw new Error("unavailable cleanup recovery must precede App Server observation");
        },
        planSessionCleanupRecovery() {
          return {
            schema: "pipeline.session-cleanup-recovery-plan.v1",
            status: "orphan-recovery-unavailable",
            activeDescriptorCount: 2,
          };
        },
      },
    });
    assert.equal(unavailable.status, "partial");
    assert.deepEqual(unavailable.nextAction, humanRecoveryAction);
    assertDiagnostic(unavailable, "cleanup_recovery_unavailable");

    const unobserved = inspectProjectOnboardingV3({ runner: "codex",
      rootDir: path,
      intent: "bootstrap",
      deps: {
        ...fakeDeps,
        observeOnboardingAppServer() {
          throw new Error("failed cleanup observation must precede App Server observation");
        },
        planSessionCleanupRecovery() {
          throw new Error("private cleanup state unreadable");
        },
      },
    });
    assert.equal(unobserved.status, "partial");
    assert.deepEqual(unobserved.nextAction, humanRecoveryAction);
    assertDiagnostic(unobserved, "cleanup_recovery_observation_unavailable");
  } finally { dispose(path); }
});

// End-to-end proof of the same 2026-08-18 PO decision, driven through the
// REAL `planSessionCleanupRecovery`/`applySessionCleanupRecovery` wiring
// against a real Git repository -- not a mocked plan/apply pair. A single
// unbound active descriptor (bind-orphan) is repaired by the top-level
// bootstrap inspection itself, with no next action ever asking anyone to
// pick a recovery (never `requiresConfirmation:true` anywhere in the
// result), at most a completion note.
test("a real orphaned descriptor is repaired automatically through the top-level bootstrap inspection, never as a selection question", () => {
  const path = root();
  try {
    hostGit(path, ["init", "--initial-branch=main"]);
    const barrier = initializeRestartRequiredRoot(path);
    clearRuntimeBarrier(path, barrier);
    completeKickoff(path);
    const orphan = startSessionDescriptor(path, { sessionId: "session-e2e-bind-orphan" });
    // Unset the suite-wide fakeDeps stub (which always reports "not-needed")
    // so this one test exercises the REAL cleanup-recovery module instead.
    const realCleanupDeps = { ...fakeDeps, planSessionCleanupRecovery: undefined };
    const observed = inspectProjectOnboardingV3({ runner: "codex",
      rootDir: path,
      intent: "session",
      deps: realCleanupDeps,
    });
    assert.equal(JSON.stringify(observed).includes('"requiresConfirmation":true'), false);
    assert.deepEqual(listActiveSessionDescriptors(path), [
      { sessionId: orphan.sessionId, descriptorSha256: orphan.descriptorSha256 },
    ]);
    assert.deepEqual(readOnboardingSessionCleanupBinding({ rootDir: path }).sessionCleanup, {
      sessionId: orphan.sessionId, descriptorSha256: orphan.descriptorSha256,
    });
  } finally { dispose(path); }
});

test("PRD/Spec drift exposes only the validated digest-bound PO rebind action", () => {
  const path = root();
  try {
    const barrier = initializeRestartRequiredRoot(path);
    clearRuntimeBarrier(path, barrier);
    completeKickoff(path);
    const writer = PLUGIN_PIPELINE_STATE_SCRIPT;
    const planSha256 = "b".repeat(64);
    const plannedAt = "2026-07-29T09:00:00.000Z";
    const applyArgv = [
      writer,
      "po-authority-rebind-apply",
      "--plan-sha256",
      planSha256,
      "--updated-at",
      plannedAt,
      "--activate",
      "--runner",
      "antigravity",
    ];
    const diagnosticAction = {
      kind: "command",
      executable: process.execPath,
      argv: [writer, "po-authority-rebind-plan"],
      mutation: false,
      requiresConfirmation: false,
      expected: { schema: "pipeline.po-authority-rebind-plan.v1" },
    };
    const observed = inspectProjectOnboardingV3({ runner: "antigravity",
      rootDir: path,
      intent: "dispatch",
      deps: {
        ...fakeDeps,
        validatePoGateAuthorityForRepository() {
          return { ok: false, code: "PO-GATE-PRD-SPEC-MISMATCH" };
        },
        spawnSync(command, args, options) {
          if (command === process.execPath
            && JSON.stringify(args) === JSON.stringify([writer, "po-authority-rebind-plan"])) {
            assert.equal(options.cwd, path);
            assert.equal(options.shell, false);
            assert.equal(options.env.ANTIGRAVITY_AGENT, "1");
            assert.equal(options.env.CLAUDECODE, undefined);
            return {
              status: 0,
              stderr: "",
              stdout: JSON.stringify({
                schema: "pipeline.po-authority-rebind-plan.v1",
                root: path,
                plannedAt,
                planSha256,
                applyAction: {
                  executable: process.execPath,
                  argv: applyArgv,
                  mutation: true,
                  requiresConfirmation: true,
                  requiresHostBoundary: true,
                },
              }),
            };
          }
          return fakeGit(command, args, options);
        },
      },
    });
    assert.equal(observed.status, "partial");
    assertDiagnostic(observed, "po_authority_rebind_required");
    assertSingleLineAction(observed.nextAction, {
      kind: "command",
      executable: process.execPath,
      argv: applyArgv,
      mutation: true,
      requiresConfirmation: true,
      expected: {
        schema: "pipeline.po-authority-rebind-apply.v1",
        statuses: ["applied"],
      },
    });

    const invalidPlan = inspectProjectOnboardingV3({ runner: "codex",
      rootDir: path,
      intent: "dispatch",
      deps: {
        ...fakeDeps,
        validatePoGateAuthorityForRepository() {
          return { ok: false, code: "PO-GATE-PRD-SPEC-MISMATCH" };
        },
        spawnSync(command, args, options) {
          if (command === process.execPath) {
            return { status: 0, stderr: "", stdout: JSON.stringify({
              schema: "pipeline.po-authority-rebind-plan.v1",
              root: path,
              plannedAt,
              planSha256,
              applyAction: {
                executable: process.execPath,
                argv: [...applyArgv, "--unexpected"],
                mutation: true,
                requiresConfirmation: true,
                requiresHostBoundary: true,
              },
            }) };
          }
          return fakeGit(command, args, options);
        },
      },
    });
    assert.equal(invalidPlan.status, "partial");
    assertSingleLineAction(invalidPlan.nextAction, diagnosticAction);
    assertDiagnostic(invalidPlan, "po_authority_rebind_planner_plan_invalid");

    const rejectedPlan = inspectProjectOnboardingV3({ runner: "codex",
      rootDir: path,
      intent: "dispatch",
      deps: {
        ...fakeDeps,
        validatePoGateAuthorityForRepository() {
          return { ok: false, code: "PO-GATE-PRD-SPEC-MISMATCH" };
        },
        spawnSync(command, args, options) {
          if (command === process.execPath
            && JSON.stringify(args) === JSON.stringify([writer, "po-authority-rebind-plan"])) {
            assert.equal(options.cwd, path);
            return { status: 2, stderr: "closed preimage mismatch\n", stdout: "" };
          }
          return fakeGit(command, args, options);
        },
      },
    });
    assert.equal(rejectedPlan.status, "partial");
    // backlog: 2026-08-08-the-guard-refuses-the-recovery-the-inspection-prescribes.md
    // (C1, AC-6 branch b). The planner was already run, as part of this same
    // inspection, and rejected; re-offering the identical command as a
    // `nextAction` would prescribe a route already proven to refuse. No action
    // is returned for this exact diagnostic.
    assert.equal(rejectedPlan.nextAction, null);
    assertDiagnostic(rejectedPlan, "po_authority_rebind_planner_rejected");
  } finally { dispose(path); }
});

test("unapproved kickoff state has no PO authority to rebind", () => {
  const path = root();
  try {
    const barrier = initializeRestartRequiredRoot(path);
    clearRuntimeBarrier(path, barrier);
    completeKickoff(path);
    const deps = { ...fakeDeps };
    delete deps.observePersistedPoAuthority;
    const observed = inspectProjectOnboardingV3({ runner: "codex", rootDir: path, intent: "session", deps });
    assert.equal(observed.status, "ready", JSON.stringify(observed.diagnostics));
    assertPlanLifecycleInspectAction(observed.nextAction);
    assert.equal(observed.diagnostics.length, 0);
    const statePath = join(path, "project/pipeline-state.json");
    const malformedApproved = JSON.parse(readFileSync(statePath, "utf8"));
    malformedApproved.planApproved = true;
    writeFileSync(statePath, `${JSON.stringify(malformedApproved, null, 2)}\n`);
    const rejected = inspectProjectOnboardingV3({ runner: "codex", rootDir: path, intent: "session", deps });
    assert.equal(rejected.status, "partial");
  } finally { dispose(path); }
});

test("V4 exposes only the read-only completed-cleanup recovery planner while authority is nonportable", () => {
  const path = root();
  try {
    const barrier = initializeRestartRequiredRoot(path);
    clearRuntimeBarrier(path, barrier);
    completeKickoff(path);
    const statePath = join(path, "project/pipeline-state.json");
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    state.continuity.runtime.sessionCleanup = {
      sessionId: "session-legacy-closed",
      descriptorSha256: "a".repeat(64),
    };
    writeFileSync(statePath, `${JSON.stringify(state)}\n`);
    const observed = inspectProjectOnboardingV3({ runner: "codex",
      rootDir: path,
      intent: "session",
      deps: {
        ...fakeDeps,
        planProjectAuthoritySessionCleanupRecovery() {
          return {
            schema: "pipeline.project-authority-recovery.v1",
            status: "ready",
            operation: "sanitize-completed-session-cleanup",
            targets: [{ path: "project/pipeline-state.json" }],
          };
        },
      },
    });
    assert.equal(observed.status, "invalid");
    assertDiagnostic(observed, "project_authority_invalid");
    assertSingleLineAction(observed.nextAction, {
      kind: "command",
      executable: "node",
      argv: [PROJECT_AUTHORITY_MIGRATION_SCRIPT, "recover", "--root", path],
      mutation: false,
      requiresConfirmation: false,
      expected: {
        schema: "pipeline.project-authority-recovery.v1",
        statuses: ["ready", "none", "recovery-unavailable", "recovery-required"],
      },
    });
  } finally { dispose(path); }
});

test("completed legacy cleanup recovery returns session V4 to ready after exact apply", () => {
  const path = root();
  try {
    hostGit(path, ["init", "-q"]);
    const barrier = initializeRestartRequiredRoot(path);
    clearRuntimeBarrier(path, barrier);
    completeKickoff(path);
    const descriptor = startSessionDescriptor(path, { sessionId: "session-v4-legacy-closed" });
    assert.equal(cleanupSession(path, {
      sessionId: descriptor.sessionId, ownerNonce: descriptor.ownerNonce,
    }, { allowAbsent: true }).ok, true);
    retireSessionDescriptor(path, {
      sessionId: descriptor.sessionId, ownerNonce: descriptor.ownerNonce, descriptorSha256: descriptor.descriptorSha256,
    });
    const statePath = join(path, "project/pipeline-state.json");
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    state.continuity.runtime.sessionCleanup = {
      sessionId: descriptor.sessionId,
      descriptorSha256: descriptor.descriptorSha256,
    };
    writeFileSync(statePath, `${JSON.stringify(state)}\n`);
    const blocked = inspectProjectOnboardingV3({ runner: "codex", rootDir: path, intent: "session", deps: fakeDeps });
    assert.equal(blocked.status, "invalid");
    assertSingleLineAction(blocked.nextAction, {
      kind: "command",
      executable: "node",
      argv: [PROJECT_AUTHORITY_MIGRATION_SCRIPT, "recover", "--root", path],
      mutation: false,
      requiresConfirmation: false,
      expected: {
        schema: "pipeline.project-authority-recovery.v1",
        statuses: ["ready", "none", "recovery-unavailable", "recovery-required"],
      },
    });
    const plan = planProjectAuthoritySessionCleanupRecovery({ rootDir: path });
    assert.equal(plan.status, "ready");
    assert.equal(applyProjectAuthoritySessionCleanupRecovery(plan, { rootDir: path, activate: true }).status, "recovered");
    const ready = inspectProjectOnboardingV3({ runner: "codex", rootDir: path, intent: "session", deps: fakeDeps });
    assert.equal(ready.status, "ready", JSON.stringify(ready.diagnostics));
    assertPlanLifecycleInspectAction(ready.nextAction);
  } finally { dispose(path); }
});

test("active historical cleanup binding exposes privatization and returns V4 to ready after confirmed apply", () => {
  const path = root();
  let output = "";
  const invokeCleanup = (args, dependencies = {}) => {
    output = "";
    const status = sessionCleanupCli(args, {}, {
      ...dependencies,
      writeFn(value) { output += value; },
    });
    assert.equal(status, 0);
    return JSON.parse(output);
  };
  try {
    hostGit(path, ["init", "-q"]);
    const barrier = initializeRestartRequiredRoot(path);
    clearRuntimeBarrier(path, barrier);
    completeKickoff(path);
    const descriptor = startSessionDescriptor(path, {
      sessionId: "session-v4-active-private",
      ownerNonce: "session-v4-active-private-owner",
    });
    const statePath = join(path, "project/pipeline-state.json");
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    state.continuity.runtime.sessionCleanup = {
      sessionId: descriptor.sessionId,
      descriptorSha256: descriptor.descriptorSha256,
    };
    writeFileSync(statePath, `${JSON.stringify(state)}\n`);

    const blocked = inspectProjectOnboardingV3({ runner: "codex",
      rootDir: path,
      intent: "session",
      deps: fakeDeps,
    });
    assert.equal(blocked.status, "invalid");
    assertSingleLineAction(blocked.nextAction, {
      kind: "command",
      executable: "node",
      argv: [SESSION_CLEANUP_SCRIPT, "plan-privatization", "--repo", path],
      mutation: false,
      requiresConfirmation: false,
      expected: {
        schema: "pipeline.session-cleanup-privatization-plan.v1",
        statuses: ["ready", "noop"],
      },
    });

    const plan = invokeCleanup(["plan-privatization", "--repo", path]);
    assert.equal(plan.status, "ready");
    assert.match(plan.planSha256, /^[a-f0-9]{64}$/u);
    assert.equal(JSON.stringify(plan).includes(descriptor.sessionId), false);
    assert.equal(JSON.stringify(plan).includes(descriptor.descriptorSha256), false);
    const applied = invokeCleanup(plan.applyAction.argv.slice(1));
    assert.equal(applied.status, "applied");
    const portable = JSON.parse(readFileSync(statePath, "utf8"));
    assert.equal(portable.continuity.runtime.sessionCleanup, null);
    assert.deepEqual(readOnboardingSessionCleanupBinding({ rootDir: path }).sessionCleanup, {
      sessionId: descriptor.sessionId,
      descriptorSha256: descriptor.descriptorSha256,
    });
    const ready = inspectProjectOnboardingV3({ runner: "codex",
      rootDir: path,
      intent: "session",
      deps: fakeDeps,
    });
    assert.equal(ready.status, "ready", JSON.stringify(ready.diagnostics));
    const reused = invokeCleanup(["start", "--repo", path], {
      requireProjectOnboardingReadyFn() {
        return {
          schema: "pipeline.project-onboarding-ready-gate.v1",
          status: "ready",
          intent: "session",
        };
      },
    });
    assert.equal(reused.code, "WT-SESSION-REUSED");
    assert.equal(reused.sessionId, descriptor.sessionId);
    assert.equal(reused.descriptorSha256, descriptor.descriptorSha256);
  } finally { dispose(path); }
});

test("nonportable cleanup authority keeps a null nextAction when privatization is unavailable", () => {
  const path = root();
  try {
    const barrier = initializeRestartRequiredRoot(path);
    clearRuntimeBarrier(path, barrier);
    completeKickoff(path);
    const statePath = join(path, "project/pipeline-state.json");
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    state.continuity.runtime.sessionCleanup = {
      sessionId: "session-without-descriptor",
      descriptorSha256: "b".repeat(64),
    };
    writeFileSync(statePath, `${JSON.stringify(state)}\n`);
    for (const privatization of [
      () => { throw new Error("malformed cleanup binding"); },
      () => ({ schema: "pipeline.session-cleanup-privatization-plan.v1", status: "unavailable" }),
    ]) {
      const observed = inspectProjectOnboardingV3({ runner: "codex",
        rootDir: path,
        intent: "session",
        deps: {
          ...fakeDeps,
          planProjectAuthoritySessionCleanupRecovery() {
            return { schema: "pipeline.project-authority-recovery.v1", status: "recovery-unavailable" };
          },
          planOnboardingSessionCleanupPrivatization: privatization,
        },
      });
      assert.equal(observed.status, "invalid");
      assert.equal(observed.nextAction, null);
    }
  } finally { dispose(path); }
});

test("exact revoke-plan v2 postimage keeps repeated PRD and Spec design edits writable", () => {
  const path = root();
  try {
    const barrier = initializeRestartRequiredRoot(path);
    clearRuntimeBarrier(path, barrier);
    completeKickoff(path);
    const statePath = join(path, "project/pipeline-state.json");
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    const planPath = state.activeFeature.planPath;
    const planSha256 = sha256(readFileSync(join(path, planPath)));
    const specPath = planPath.replace(/-prd\.md$/u, "-spec.md");
    const specSha256 = sha256(readFileSync(join(path, specPath)));
    const revokedAt = "2026-07-30T20:51:44.348Z";
    state.continuity.authority.prd = { path: planPath, sha256: planSha256 };
    state.continuity.authority.spec = { path: specPath, sha256: specSha256 };
    state.planApproved = false;
    state.updatedAt = revokedAt;
    state.planApproval = {
      schema: "pipeline.plan-approval.v2",
      approvedBy: "PO",
      approvedAt: "2026-07-29T06:42:02.837Z",
      specBoundBy: "PO",
      specBoundAt: "2026-07-29T17:35:13.045Z",
      poGateAuthority: {
        schema: "pipeline.po-gate-authority.v2",
        humanFacing: "en",
        sourceSha256: "a".repeat(64),
        runtimeSha256: "b".repeat(64),
        receiptSha256: "c".repeat(64),
        repositoryFingerprint: "d".repeat(64),
        planPath,
        planSha256,
        specPath,
        specSha256,
      },
    };
    state.planRevocation = {
      schema: "pipeline.plan-revocation.v2",
      planPath,
      planSha256,
      specPath,
      specSha256,
      revokedBy: "PO",
      revokedAt,
    };
    writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
    const deps = { ...fakeDeps };
    delete deps.observePersistedPoAuthority;
    const observed = inspectProjectOnboardingV3({ runner: "codex", rootDir: path, intent: "session", deps });
    assert.equal(observed.status, "ready", JSON.stringify(observed.diagnostics));
    assertPlanLifecycleInspectAction(observed.nextAction);
    assert.deepEqual(observed.diagnostics, []);

    writeFileSync(join(path, planPath), `${readFileSync(join(path, planPath), "utf8")}\nFirst revised product decision.\n`);
    const afterPrdEdit = inspectProjectOnboardingV3({ runner: "codex", rootDir: path, intent: "session", deps });
    assert.equal(afterPrdEdit.status, "ready", JSON.stringify(afterPrdEdit.diagnostics));
    writeFileSync(join(path, specPath), `${readFileSync(join(path, specPath), "utf8")}\nFirst revised technical contract.\n`);
    writeFileSync(join(path, planPath), `${readFileSync(join(path, planPath), "utf8")}\nSecond revised product decision.\n`);
    const afterRepeatedEdits = inspectProjectOnboardingV3({ runner: "codex", rootDir: path, intent: "session", deps });
    assert.equal(afterRepeatedEdits.status, "ready", JSON.stringify(afterRepeatedEdits.diagnostics));
    assertPlanLifecycleInspectAction(afterRepeatedEdits.nextAction);

    state.planRevocation.specSha256 = "e".repeat(64);
    writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
    const rejected = inspectProjectOnboardingV3({ runner: "codex", rootDir: path, intent: "session", deps });
    assert.equal(rejected.status, "partial");
    assertDiagnostic(rejected, "po_authority_rebind_unavailable");
  } finally { dispose(path); }
});

test("general PRD/Spec drift exposes the same neutral read-only decision plan for all intents", () => {
  const path = root();
  try {
    const barrier = initializeRestartRequiredRoot(path);
    clearRuntimeBarrier(path, barrier);
    completeKickoff(path);
    const writer = PLUGIN_PIPELINE_STATE_SCRIPT;
    const planSha256 = "c".repeat(64);
    const plannedAt = "2026-07-29T10:00:00.000Z";
    const selectionArgv = [
      writer,
      "po-authority-decision-select",
      "--plan-sha256",
      planSha256,
      "--planned-at",
      plannedAt,
      "--selection",
      "spec",
      "--runner",
      "claude",
    ];
    const deps = {
      ...fakeDeps,
      validatePoGateAuthorityForRepository() {
        return { ok: false, code: "PO-GATE-PRD-SPEC-MISMATCH" };
      },
      spawnSync(command, args, options) {
        if (command === process.execPath
          && JSON.stringify(args) === JSON.stringify([writer, "po-authority-rebind-plan"])) {
          return { status: 2, stderr: "narrow shape unavailable", stdout: "" };
        }
        if (command === process.execPath
          && JSON.stringify(args) === JSON.stringify([writer, "po-authority-decision-plan"])) {
          assert.equal(options.cwd, path);
          assert.equal(options.env.CLAUDECODE, "1");
          assert.equal(options.env.ANTIGRAVITY_AGENT, undefined);
          return {
            status: 0,
            stderr: "",
            stdout: JSON.stringify({
              schema: "pipeline.po-authority-decision-plan.v1",
              status: "planned",
              root: path,
              plannedAt,
              planSha256,
              candidates: [
                { id: "prd", role: "product-requirements", path: "specs/prd.md", sha256: "d".repeat(64) },
                { id: "spec", role: "technical-specification", path: "specs/spec.md", sha256: "e".repeat(64) },
              ],
              selectionActions: [
                { selectedCandidate: "prd", status: "unavailable", code: "PO-DECISION-REFERENCED-SPEC-BYTES-UNAVAILABLE", mutation: false },
                {
                  selectedCandidate: "spec",
                  status: "available",
                  executable: process.execPath,
                  argv: selectionArgv,
                  mutation: false,
                  requiresConfirmation: true,
                },
              ],
            }),
          };
        }
        return fakeGit(command, args, options);
      },
    };
    for (const intent of ["bootstrap", "session", "dispatch"]) {
      const observed = inspectProjectOnboardingV3({ runner: "claude", rootDir: path, intent, deps });
      assert.equal(observed.status, "partial", intent);
      assertDiagnostic(observed, "po_authority_decision_required");
      assert.deepEqual(observed.nextAction, {
        kind: "command",
        executable: process.execPath,
        argv: [writer, "po-authority-decision-plan"],
        mutation: false,
        requiresConfirmation: false,
        expected: {
          schema: "pipeline.po-authority-decision-plan.v1",
          statuses: ["planned"],
        },
      });
    }
  } finally { dispose(path); }
});

test("neutral PO decision apply requires all transactional V4 postimage readbacks to become ready", () => {
  const path = root();
  const profile = {
    schema: "pipeline.po-gate-authority-evidence.v1",
    humanFacing: "en",
    sourceSha256: "a".repeat(64),
    runtimeSha256: "b".repeat(64),
    receiptSha256: "c".repeat(64),
    repositoryFingerprint: "d".repeat(64),
  };
  const capture = (invoke) => {
    let stdout = ""; let stderr = "";
    const log = console.log; const error = console.error;
    console.log = (...values) => { stdout += `${values.join(" ")}\n`; };
    console.error = (...values) => { stderr += `${values.join(" ")}\n`; };
    try { return { exit: invoke(), stdout, stderr }; }
    finally { console.log = log; console.error = error; }
  };
  try {
    const barrier = initializeRestartRequiredRoot(path);
    clearRuntimeBarrier(path, barrier);
    completeKickoff(path);
    const featureDir = join(path, "specs", "nova-shaped");
    mkdirSync(featureDir, { recursive: true });
    const planPath = "specs/nova-shaped/prd_nova.md";
    const specPath = "specs/nova-shaped/spec.md";
    const oldSpecSha = sha256("# older Spec\n");
    writeFileSync(join(path, specPath), "# current Spec\n");
    const newSpecSha = sha256(readFileSync(join(path, specPath)));
    writeFileSync(join(path, planPath), `<!-- po-language: en -->\n<!-- technical-spec-sha256: ${newSpecSha} -->\n# Nova PRD\n\nReconciled scope.\n`);
    const planSha = sha256(readFileSync(join(path, planPath)));
    const continuity = {
      schema: "pipeline.continuity.v0", featureId: "nova-shaped", revision: 3,
      runtime: { humanFacingLanguage: "en", activeDuty: "Coordinator" },
      authority: { prd: { path: planPath, sha256: planSha }, spec: { path: specPath, sha256: oldSpecSha }, result: null },
      queueHead: { packageId: "nova", actionId: "decision", nextAction: "review", productRetryCount: 0, environmentRerouteCount: 0, dispatch: null },
      blocker: null, acknowledgedFinal: null, resume: { mode: "immediate", sourceRevision: 0, reasonCode: "active-turn" }, recovery: null, decisionTxn: null,
      capacity: { concurrencyLimit: 4, reservedCriticSlots: 1, reservedRecoverySlots: 1, fallbackPolicy: "defer" },
    };
    writeFileSync(join(path, "project/pipeline-state.json"), `${JSON.stringify({
      schema: "pipeline.state.v0", activeFeature: { id: "nova-shaped", planPath, phase: "design" }, planApproved: true,
      planApproval: { schema: "pipeline.plan-approval.v2", approvedBy: "PO", approvedAt: "2026-07-26T14:08:37.500Z", specBoundBy: "PO", specBoundAt: "2026-07-26T14:08:37.500Z", poGateAuthority: { ...profile, schema: "pipeline.po-gate-authority.v2", planPath, planSha256: planSha, specPath, specSha256: oldSpecSha } },
      continuity, updatedAt: "2026-07-26T14:08:37.500Z",
    }, null, 2)}\n`);
    const authority = ({ expectedPlanSha256, expectedSpecSha256 }) => expectedSpecSha256 === newSpecSha
      ? { ok: true, value: { ...profile, schema: "pipeline.po-gate-authority.v2", planPath, planSha256: expectedPlanSha256, specPath, specSha256: newSpecSha } }
      : { ok: false, code: "PO-GATE-AUTHORITY-STALE" };
    const writerDeps = {
      dir: path, now: () => "2026-07-30T10:00:00.000Z", ownerNonce: () => "postimage-red-0001",
      env: { CLAUDECODE: "1" },
      poGateProfile: () => ({ ok: true, value: profile }), poGateAuthority: authority,
    };
    const plan = JSON.parse(capture(() => pipelineStateRun(["po-authority-decision-plan"], writerDeps)).stdout);
    const selectionAction = plan.selectionActions.find((action) => action.selectedCandidate === "spec");
    const selection = JSON.parse(capture(() => pipelineStateRun(selectionAction.argv.slice(1), writerDeps)).stdout);
    const beforePrd = readFileSync(join(path, planPath), "utf8");
    const beforeState = readFileSync(join(path, "project/pipeline-state.json"), "utf8");
    const readbacks = [];
    let postimageEvidence = null;
    const v4Inspection = ({ rootDir, intent, runner, deps: transactionDeps }) => {
      const result = inspectProjectOnboardingV3({ runner,
        rootDir,
        intent,
        deps: {
          ...fakeDeps,
          observePersistedPoAuthority: undefined,
          validatePoGateAuthorityForRepository: authority,
          ...transactionDeps,
        },
      });
      readbacks.push({ intent, runner, status: result.status, predicate: result.diagnostics?.[0]?.code ?? null });
      return result;
    };
    const applied = capture(() => pipelineStateRun(selection.applyAction.argv.slice(1), {
      ...writerDeps,
      v4Inspection,
      observeRebindPostimageEvidence: (evidence) => { postimageEvidence = evidence; },
    }));
    const exact = JSON.stringify(readbacks);
    assert.equal(applied.exit, 0, `decision postimage must be V4-ready; observed ${exact}; writer stderr: ${applied.stderr.trim()}`);
    assert.deepEqual(readbacks, [
      { intent: "bootstrap", runner: "claude", status: "ready", predicate: null },
      { intent: "session", runner: "claude", status: "ready", predicate: null },
      { intent: "dispatch", runner: "claude", status: "ready", predicate: null },
    ]);
    assert.deepEqual(
      postimageEvidence.predicates.v4Intents.map(({ intent, ok, status }) => ({ intent, ok, status })),
      [
        { intent: "bootstrap", ok: true, status: "ready" },
        { intent: "session", ok: true, status: "ready" },
        { intent: "dispatch", ok: true, status: "ready" },
      ],
    );
    assert.equal(Object.values(postimageEvidence.predicates).flat().every((predicate) => predicate.ok), true);
    assert.equal(readFileSync(join(path, planPath), "utf8"), beforePrd);
    assert.notEqual(readFileSync(join(path, "project/pipeline-state.json"), "utf8"), beforeState);
  } finally { dispose(path); }
});

test("V4 authority drift reopens the historical approval instead of rebinding it", () => {
  const path = root();
  const profile = {
    schema: "pipeline.po-gate-authority-evidence.v1", humanFacing: "en",
    sourceSha256: "a".repeat(64), runtimeSha256: "b".repeat(64), receiptSha256: "c".repeat(64), repositoryFingerprint: "d".repeat(64),
  };
  const capture = (invoke) => {
    let stdout = ""; const log = console.log;
    console.log = (...values) => { stdout += `${values.join(" ")}\n`; };
    try { return { exit: invoke(), stdout }; } finally { console.log = log; }
  };
  try {
    mkdirSync(join(path, "project"), { recursive: true });
    const featureDir = join(path, "specs", "v4-drift"); mkdirSync(featureDir, { recursive: true });
    const planPath = "specs/v4-drift/prd_v4.md"; const specPath = "specs/v4-drift/spec.md";
    const oldSpecSha = sha256("# prior Spec\n"); writeFileSync(join(path, specPath), "# changed Spec\n");
    const currentSpecSha = sha256(readFileSync(join(path, specPath)));
    writeFileSync(join(path, planPath), `<!-- po-language: en -->\n<!-- technical-spec-sha256: ${oldSpecSha} -->\n# V4 PRD\n`);
    const planSha = sha256(readFileSync(join(path, planPath)));
    const historicalAuthority = { ...profile, schema: "pipeline.po-gate-authority.v2", planPath, planSha256: planSha, specPath, specSha256: oldSpecSha };
    const submission = { schema: "pipeline.plan-submission.v1", featureId: "v4-drift", planPath, planSha256: planSha, specPath, specSha256: oldSpecSha, profile: "epic", profileSha256: "e".repeat(64), submittedBy: "Coordinator", submittedAt: "2026-08-02T09:00:00.000Z" };
    const continuity = { schema: "pipeline.continuity.v0", featureId: "v4-drift", revision: 3, runtime: { humanFacingLanguage: "en", activeDuty: "Coordinator" }, authority: { prd: { path: planPath, sha256: planSha }, spec: { path: specPath, sha256: oldSpecSha }, result: null }, queueHead: { packageId: "v4", actionId: "review", nextAction: "review", productRetryCount: 0, environmentRerouteCount: 0, dispatch: null }, blocker: null, acknowledgedFinal: null, resume: { mode: "immediate", sourceRevision: 0, reasonCode: "active-turn" }, recovery: null, decisionTxn: null, capacity: { concurrencyLimit: 4, reservedCriticSlots: 1, reservedRecoverySlots: 1, fallbackPolicy: "defer" } };
    const approval = { schema: "pipeline.plan-approval.v4", approvedBy: "PO", approvedAt: "2026-08-02T09:05:00.000Z", submissionSha256: sha256(canonicalJson(submission)), profileSha256: submission.profileSha256, poGateAuthority: historicalAuthority, priorInvalidationSha256: null };
    assert.equal(validPlanSubmission(submission), true);
    assert.equal(validCurrentPlanApproval(approval), true);
    writeFileSync(join(path, "project/pipeline-state.json"), `${JSON.stringify({ schema: "pipeline.state.v0", activeFeature: { id: "v4-drift", planPath, phase: "implementation" }, planApproved: true, planSubmission: submission, planApproval: approval, continuity, updatedAt: "2026-08-02T09:06:00.000Z" }, null, 2)}\n`);
    const authority = ({ expectedPlanSha256, expectedSpecSha256 }) => expectedSpecSha256 === currentSpecSha
      ? { ok: true, value: { ...profile, schema: "pipeline.po-gate-authority.v2", planPath, planSha256: expectedPlanSha256, specPath, specSha256: currentSpecSha } }
      : { ok: false, code: "PO-GATE-AUTHORITY-STALE" };
    const writerDeps = {
      dir: path,
      now: () => "2026-08-02T10:00:00.000Z",
      ownerNonce: () => "v4-reopen-0001",
      env: { CLAUDECODE: "1" },
      poGateProfile: () => ({ ok: true, value: profile }),
      poGateAuthority: authority,
    };
    const result = capture(() => pipelineStateRun(["po-authority-decision-plan"], writerDeps));
    assert.equal(result.exit, 0);
    const plan = JSON.parse(result.stdout);
    const selectionAction = plan.selectionActions.find((action) => action.selectedCandidate === "spec");
    const selection = JSON.parse(capture(() => pipelineStateRun(selectionAction.argv.slice(1), writerDeps)).stdout);
    const observedRunners = [];
    const applied = capture(() => pipelineStateRun(selection.applyAction.argv.slice(1), {
      ...writerDeps,
      v4Inspection: ({ runner }) => { observedRunners.push(runner); return { status: "ready", diagnostics: [] }; },
    }));
    assert.equal(plan.status, "planned"); assert.equal(plan.transition.toPhase, "design");
    assert.equal(selection.selectedCandidate, "spec");
    assert.equal(applied.exit, 0, applied.stdout);
    assert.deepEqual(observedRunners, ["claude", "claude", "claude"]);
    assert.equal(plan.preimage.planApproval.schema, "pipeline.plan-approval.v4");
    const state = JSON.parse(readFileSync(join(path, "project/pipeline-state.json"), "utf8"));
    assert.equal(state.activeFeature.phase, "design");
    assert.equal(state.planApproved, false);
    assert.equal(state.planApproval.schema, "pipeline.plan-approval.v4");
    assert.equal(state.planApproval.poGateAuthority.specSha256, oldSpecSha);
    assert.equal(state.planInvalidation.reason, "reopen-design");
    assert.equal(state.continuity.revision, 4);
  } finally { dispose(path); }
});

test("coherent current documents with stale persisted authority require the same neutral decision for all intents", () => {
  const path = root();
  try {
    const barrier = initializeRestartRequiredRoot(path);
    clearRuntimeBarrier(path, barrier);
    completeKickoff(path);
    const writer = PLUGIN_PIPELINE_STATE_SCRIPT;
    const planSha256 = "8".repeat(64);
    const plannedAt = "2026-07-29T10:30:00.000Z";
    const selectionArgv = [
      writer,
      "po-authority-decision-select",
      "--plan-sha256",
      planSha256,
      "--planned-at",
      plannedAt,
      "--selection",
      "spec",
      "--runner",
      "codex",
    ];
    let validatedExpected = 0;
    const deps = {
      ...fakeDeps,
      observePersistedPoAuthority() {
        return {
          status: "observed",
          planSha256: "1".repeat(64),
          specSha256: "2".repeat(64),
        };
      },
      validatePoGateAuthorityForRepository(options) {
        assert.equal(options.expectedPlanSha256, "1".repeat(64));
        assert.equal(options.expectedSpecSha256, "2".repeat(64));
        validatedExpected += 1;
        return { ok: false, code: "PO-GATE-PLAN-DIGEST-STALE" };
      },
      spawnSync(command, args, options) {
        if (command === process.execPath
          && JSON.stringify(args) === JSON.stringify([writer, "po-authority-decision-plan"])) {
          assert.equal(options.cwd, path);
          assert.equal(options.env.CODEX_SESSION_ID, "project-onboarding-driver");
          return {
            status: 0,
            stderr: "",
            stdout: JSON.stringify({
              schema: "pipeline.po-authority-decision-plan.v1",
              status: "planned",
              root: path,
              plannedAt,
              planSha256,
              candidates: [
                { id: "prd", role: "product-requirements", path: "specs/prd.md", sha256: "3".repeat(64) },
                { id: "spec", role: "technical-specification", path: "specs/spec.md", sha256: "4".repeat(64) },
              ],
              selectionActions: [
                { selectedCandidate: "prd", status: "unavailable", code: "PO-DECISION-REFERENCED-SPEC-BYTES-UNAVAILABLE", mutation: false },
                {
                  selectedCandidate: "spec",
                  status: "available",
                  executable: process.execPath,
                  argv: selectionArgv,
                  mutation: false,
                  requiresConfirmation: true,
                },
              ],
            }),
          };
        }
        return fakeGit(command, args, options);
      },
    };
    for (const intent of ["bootstrap", "session", "dispatch"]) {
      const observed = inspectProjectOnboardingV3({ runner: "codex", rootDir: path, intent, deps });
      assert.equal(observed.status, "partial", intent);
      assertDiagnostic(observed, "po_authority_decision_required");
      assert.deepEqual(observed.nextAction?.argv, [writer, "po-authority-decision-plan"]);
    }
    assert.equal(validatedExpected, 3);
  } finally { dispose(path); }
});

test("required App-Server failures map to closed aggregates and exact bounded actions", () => {
  const path = root();
  const recover = {
    kind: "command",
    executable: "node",
    argv: [APP_SERVER_HEALTH_SCRIPT, "--recover"],
    mutation: true,
    requiresConfirmation: true,
    expected: {
      schema: "pipeline.codex-app-server-health.v1",
      statuses: ["ready", "unavailable", "stale"],
    },
  };
  const doctor = {
    kind: "command",
    executable: "node",
    argv: [APP_SERVER_HEALTH_SCRIPT, "--doctor"],
    mutation: false,
    requiresConfirmation: false,
    expected: {
      schema: "pipeline.codex-app-server-doctor.v1",
      statuses: ["completed", "failed"],
    },
  };
  const rows = [
    [
      { required: true, status: "execution-denied", code: "CAS-EXECUTION-UNAVAILABLE" },
      "app-server-execution-denied",
      null,
    ],
    [
      { required: true, status: "not-running", code: "CAS-DAEMON-UNREACHABLE" },
      "app-server-not-running",
      recover,
    ],
    [
      { required: true, status: "unavailable", code: "CAS-DAEMON-INVALID-OBSERVATION" },
      "app-server-unavailable",
      recover,
    ],
    [
      { required: true, status: "unavailable", code: "CAS-CODEX-UNAVAILABLE" },
      "app-server-unavailable",
      doctor,
    ],
    [
      { required: true, status: "unavailable", code: "CAS-FUTURE-UNKNOWN" },
      "app-server-unavailable",
      null,
    ],
  ];
  try {
    const barrier = initializeRestartRequiredRoot(path);
    clearRuntimeBarrier(path, barrier);
    completeKickoff(path);
    for (const [component, aggregate, nextAction] of rows) {
      let calls = 0;
      const observed = inspectProjectOnboardingV3({ runner: "codex",
        rootDir: path,
        intent: "bootstrap",
        deps: {
          ...fakeDeps,
          observeOnboardingAppServer({ intent }) {
            calls += 1;
            assert.equal(intent, "bootstrap");
            return component;
          },
        },
      });
      assert.equal(observed.status, aggregate, component.code);
      assert.notEqual(observed.status, "ready", component.code);
      assert.deepEqual(observed.appServer, component, component.code);
      assert.deepEqual(observed.nextAction, nextAction, component.code);
      assertDiagnostic(observed, aggregate === "app-server-execution-denied"
        ? "app_server_execution_denied"
        : aggregate === "app-server-not-running"
          ? "app_server_not_running"
          : "app_server_unavailable");
      if (nextAction !== null) assertSingleLineAction(observed.nextAction, nextAction);
      assert.equal(calls, 1, component.code);
    }
  } finally { dispose(path); }
});

test("repository, source, and runtime gates precede every required App-Server observation", () => {
  const repositoryRoot = root(); const lifecycleRoot = root();
  let calls = 0;
  const neverObserve = {
    ...fakeDeps,
    observeOnboardingAppServer() {
      calls += 1;
      throw new Error("App Server must remain after every earlier gate");
    },
  };
  try {
    const repositoryFailure = inspectProjectOnboardingV3({ runner: "codex",
      rootDir: repositoryRoot,
      intent: "dispatch",
      deps: neverObserve,
    });
    assert.equal(repositoryFailure.status, "repository-control-path-invalid");
    assert.equal(calls, 0);

    const missingSource = inspectProjectOnboardingV3({ runner: "codex",
      rootDir: lifecycleRoot,
      intent: "bootstrap",
      deps: {
        ...neverObserve,
        observeCodexOnboardingCapabilities: () => repositoryCapability("local-valid-writable", "bootstrap"),
      },
    });
    assert.equal(missingSource.status, "portable-seed-required");
    assert.equal(calls, 0);

    const portable = planProjectOnboardingV3({ runner: "codex", rootDir: lifecycleRoot, deps: fakeDeps });
    assert.equal(applyProjectOnboardingV3(portable, { rootDir: lifecycleRoot, activate: true, deps: fakeDeps }).status, "applied");
    const missingRuntime = inspectProjectOnboardingV3({ runner: "codex",
      rootDir: lifecycleRoot,
      intent: "bootstrap",
      deps: neverObserve,
    });
    assert.equal(missingRuntime.status, "runtime-initialization-required");
    assert.equal(calls, 0);

    const runtime = planProjectOnboardingLifecycleV4({ runner: "codex",
      rootDir: lifecycleRoot,
      deps: fakeDeps,
      operation: "runtime",
    });
    const digest = runtime.nextAction.argv[runtime.nextAction.argv.indexOf("--plan-sha256") + 1];
    assert.equal(applyProjectOnboardingLifecycleV4({ runner: "codex",
      rootDir: lifecycleRoot,
      deps: fakeDeps,
      operation: "runtime",
      planSha256: digest,
      activate: true,
    }).status, "restart-required");
    const restartRequired = inspectProjectOnboardingV3({ runner: "codex",
      rootDir: lifecycleRoot,
      intent: "bootstrap",
      deps: neverObserve,
    });
    assert.equal(restartRequired.status, "restart-required");
    assert.equal(calls, 0);
  } finally { dispose(repositoryRoot); dispose(lifecycleRoot); }
});

test("host-bound ready-path App-Server health smoke is read-only and typed", () => {
  const path = root();
  try {
    const barrier = initializeRestartRequiredRoot(path);
    clearRuntimeBarrier(path, barrier);
    completeKickoff(path);
    let calls = 0;
    const observed = inspectProjectOnboardingV3({ runner: "codex",
      rootDir: path,
      intent: "bootstrap",
      deps: {
        ...fakeDeps,
        observeOnboardingAppServer(options) {
          calls += 1;
          return observeOnboardingAppServer(options);
        },
      },
    });
    assert.equal(calls, 1);
    assert.equal(observed.appServer.required, true);
    assert.ok(["ready", "app-server-execution-denied", "app-server-not-running", "app-server-unavailable"].includes(observed.status));
    assert.ok(["running", "execution-denied", "not-running", "unavailable"].includes(observed.appServer.status));
  } finally { dispose(path); }
});

test("a Claude Code session never observes the Codex App-Server and reports not-applicable", () => {
  const path = root();
  try {
    const barrier = initializeRestartRequiredRoot(path);
    clearRuntimeBarrier(path, barrier);
    completeKickoff(path);
    let calls = 0;
    const observed = inspectProjectOnboardingV3({
      rootDir: path,
      intent: "bootstrap",
      runner: "claude",
      deps: {
        ...fakeDeps,
        observeOnboardingAppServer(options) {
          calls += 1;
          return observeOnboardingAppServer(options);
        },
      },
    });
    assert.equal(calls, 0);
    assert.equal(observed.runner, "claude");
    assert.equal(observed.status, "ready");
    assert.deepEqual(observed.appServer, { required: false, status: "not-applicable", code: null });
  } finally { dispose(path); }
});

// CONTRACT CHANGE, not a loosened pin. This test's predecessor of the same
// name asserted the opposite: that omitting `--runner` silently resolved to
// "codex" and kept the historical Codex App-Server requirement. That premise
// is the defect (backlog: absent-runner-flag-silently-defaults-to-codex,
// decision: candidate 1, fail closed) -- an absent runner must never be
// assumed, because that silent substitution is exactly how a Claude consumer
// once ended up with a Codex project. What is asserted here now is the
// decided replacement: omitting the runner is a caller error.
test("omitting --runner is a caller error, not a silent Codex default", () => {
  const path = root();
  try {
    const barrier = initializeRestartRequiredRoot(path);
    clearRuntimeBarrier(path, barrier);
    completeKickoff(path);
    assert.throws(() => inspectProjectOnboardingV3({
      rootDir: path,
      intent: "bootstrap",
      deps: fakeDeps,
    }), (error) => {
      assert.equal(error.code, "ONBOARDING-RUNNER-REQUIRED");
      assert.equal(error.caller, "inspectProjectOnboardingV3");
      return true;
    });
  } finally { dispose(path); }
});

// CONTRACT CORRECTION, not a loosened pin. The predecessor of this test
// asserted that a `claude` session still reached `restart-required` behind a
// published barrier, only with the restart rendered as manual guidance. That
// premise is the defect: the barrier's declared targets are frozen to
// `.codex/*` and it clears only through a Codex launch ticket, so the
// rendering was truthful about the launcher and untruthful about the outcome.
// The launcher-versus-manual-rendering concern it protected survives below in
// the unknown-runner case, which still receives the barrier and the manual
// action. What is asserted here now is the positive new contract.
test("a runner without a native runtime readback publishes no barrier and proceeds to the next real step", () => {
  const path = root();
  try {
    const bindings = [];
    const publications = [];
    const observingDeps = {
      ...fakeDeps,
      codexExecutable: join(path, "no-codex-executable-exists-here"),
      prepareRuntimeRestartBinding(options) { bindings.push(options); throw new Error("no Codex executable may be bound for this runner"); },
      persistRestartBarrier(options) { publications.push(options); throw new Error("no barrier may be published for this runner"); },
    };
    const portable = planProjectOnboardingV3({ rootDir: path, deps: observingDeps, runner: "claude" });
    assert.equal(applyProjectOnboardingV3(portable, { rootDir: path, activate: true, deps: observingDeps }).status, "applied");
    const plan = planProjectOnboardingLifecycleV4({ rootDir: path, deps: observingDeps, operation: "runtime", runner: "claude" });
    assert.equal(plan.status, "runtime-initialization-required");
    // The plan must not promise a state its own apply can never reach.
    assert.deepEqual(plan.nextAction.expected.statuses, ["kickoff-required", "intake-required", "intake-design-questions-required", "bootstrap-binding-required", "ready"]);
    const digest = plan.nextAction.argv[plan.nextAction.argv.indexOf("--plan-sha256") + 1];
    const initialized = applyProjectOnboardingLifecycleV4({
      rootDir: path, deps: observingDeps, operation: "runtime", planSha256: digest, activate: true, runner: "claude",
    });
    assert.equal(initialized.runner, "claude");
    assert.equal(initialized.status, "intake-required");
    // Structural, not textual: nothing was bound and nothing was published, so
    // there is no artifact a launch ticket could ever be required to clear.
    assert.deepEqual(bindings, []);
    assert.deepEqual(publications, []);
    const barrier = readRestartBarrier({ rootDir: path, spawn: fakeGit });
    assert.equal(barrier.status, "absent");
    assert.equal(existsSync(barrier.paths.barrier), false);
    assert.equal(existsSync(barrier.paths.tickets), false);
    assert.equal(existsSync(barrier.paths.currentReadback), false);
    assert.deepEqual(initialized.runtime, {
      status: "readback-not-applicable",
      sourceSha256: initialized.runtime.sourceSha256,
      targetsSha256: initialized.runtime.targetsSha256,
      barrierSha256: null,
      readbackSha256: null,
    });
    // The instruction the session receives is the one that actually advances
    // it -- never a restart it cannot make good on.
    assert.equal(initialized.nextAction.kind, "collect-input");
    assert.equal(initialized.nextAction.requiresCurrentProcessExit, undefined);
    assert.equal(Object.prototype.hasOwnProperty.call(initialized.nextAction, "launch"), false);
    const serialized = JSON.stringify(initialized);
    assert.equal(serialized.includes("codex-onboarding-launch"), false);
    assert.equal(serialized.includes("restart"), false);
    assert.equal(serialized.includes("ticket"), false);
    // ADR-0057 decision 2a's own test: the runtime targets really were written,
    // with no Codex executable resolvable anywhere on this machine.
    assert.equal(existsSync(join(path, ".claude", "settings.json")), true);
    assert.equal(existsSync(join(path, ".codex", "config.toml")), true);
    assert.equal(existsSync(observingDeps.codexExecutable), false);
  } finally { dispose(path); }
});

test("a pending Codex restart barrier never gates a Claude session, and that session leaves it untouched", () => {
  const path = root();
  try {
    const barrier = initializeRestartRequiredRoot(path);
    assert.equal(barrier.status, "present");
    const observed = inspectProjectOnboardingV3({ rootDir: path, deps: fakeDeps, runner: "claude" });
    assert.equal(observed.runner, "claude");
    assert.equal(observed.status, "intake-required");
    assert.equal(observed.runtime.status, "readback-not-applicable");
    assert.equal(observed.runtime.barrierSha256, null);
    assert.equal(observed.nextAction.kind, "collect-input");
    assert.equal(JSON.stringify(observed).includes("codex-onboarding-launch"), false);
    // The Codex artifact is not consumed, cleared or removed by the peer
    // runner: a Codex session in the same project still owes its readback.
    const after = readRestartBarrier({ rootDir: path, spawn: fakeGit });
    assert.equal(after.status, "present");
    assert.equal(after.rawSha256, barrier.rawSha256);
    assert.equal(inspectProjectOnboardingV3({ rootDir: path, deps: fakeDeps, runner: "codex" }).status, "restart-required");
  } finally { dispose(path); }
});

test("the codex runtime apply is unchanged: bound executable, frozen .codex digests, barrier durable before mutation", () => {
  const path = root();
  try {
    const bindings = [];
    const publications = [];
    const observingDeps = {
      ...fakeDeps,
      prepareRuntimeRestartBinding(options) {
        bindings.push({
          runtimeTargets: options.runtimeTargets,
          codexExecutable: options.codexExecutable,
          sourceSha256: options.sourceSha256,
        });
        return prepareRuntimeRestartBinding(options);
      },
      persistRestartBarrier(options) {
        // Durable BEFORE the target transaction: at publication time not one
        // runtime target byte may exist yet.
        publications.push({
          codexTargetWritten: existsSync(join(path, ".codex", "config.toml")),
          claudeTargetWritten: existsSync(join(path, ".claude", "settings.json")),
          runtimeTargetsSha256: options.binding.runtimeTargetsSha256,
        });
        return persistRestartBarrier(options);
      },
    };
    const seed = planProjectOnboardingV3({ rootDir: path, deps: observingDeps, runner: "codex" });
    assert.equal(applyProjectOnboardingV3(seed, { rootDir: path, activate: true, deps: observingDeps }).status, "applied");
    const plan = planProjectOnboardingLifecycleV4({ rootDir: path, deps: observingDeps, operation: "runtime", runner: "codex" });
    assert.deepEqual(plan.nextAction.expected.statuses, ["restart-required"]);
    const digest = plan.nextAction.argv[plan.nextAction.argv.indexOf("--plan-sha256") + 1];
    const initialized = applyProjectOnboardingLifecycleV4({
      rootDir: path, deps: observingDeps, operation: "runtime", planSha256: digest, activate: true, runner: "codex",
    });
    assert.equal(initialized.status, "restart-required");
    assert.equal(bindings.length, 1);
    assert.equal(publications.length, 1);
    assert.equal(bindings[0].codexExecutable, process.execPath);
    assert.deepEqual(bindings[0].runtimeTargets.map((target) => target.path), [
      ".codex/agents/consult-advisor.toml", ".codex/agents/critic.toml", ".codex/agents/implementor.toml", ".codex/config.toml",
    ]);
    assert.equal(publications[0].codexTargetWritten, false);
    assert.equal(publications[0].claudeTargetWritten, false);
    const stored = readRestartBarrier({ rootDir: path, spawn: fakeGit });
    assert.equal(stored.status, "present");
    assert.equal(stored.barrier.state, "restart-required");
    assert.equal(stored.barrier.runtimeTargetsSha256, publications[0].runtimeTargetsSha256);
    assert.equal(stored.barrier.codexExecutablePath, process.execPath);
    assert.equal(stored.rawSha256, initialized.runtime.barrierSha256);
    assert.equal(initialized.nextAction.kind, "restart-process");
    assert.equal(initialized.nextAction.launch.argv[0], ONBOARDING_LAUNCH_SCRIPT);
    // Still ticket-bound: the barrier clears only through the launch ticket.
    clearRuntimeBarrier(path, stored);
    assert.equal(inspectProjectOnboardingV3({ rootDir: path, deps: fakeDeps, runner: "codex" }).runtime.status, "readback-current");
  } finally { dispose(path); }
});

test("an unknown runner keeps the Codex-strength barrier and a manual action, never the Codex launcher", () => {
  const path = root();
  try {
    const barrier = initializeRestartRequiredRoot(path);
    assert.equal(barrier.status, "present");
    assert.equal(requiresNativeRuntimeReadback("some-future-runner"), true);
    // Fail-closed by construction: an unnamed runner does not silently lose the
    // barrier, it only loses the Codex-specific launcher rendering.
    const observed = inspectProjectOnboardingV3({ rootDir: path, deps: fakeDeps, runner: "some-future-runner" });
    assert.equal(observed.status, "restart-required");
    assert.equal(observed.runtime.barrierSha256, barrier.rawSha256);
    assert.equal(observed.nextAction.kind, "external-operator");
    assert.equal(observed.nextAction.requiresCurrentProcessExit, false);
    assert.equal(observed.nextAction.mutation, false);
    assert.equal(observed.nextAction.requiresConfirmation, true);
    assert.equal(typeof observed.nextAction.guidance, "string");
    assert.ok(observed.nextAction.guidance.length > 0);
    assert.deepEqual(Object.keys(observed.nextAction.expected).sort(), ["schema", "statuses"]);
    assert.equal(observed.nextAction.expected.schema, "pipeline.project-onboarding.v4");
    assert.ok(observed.nextAction.expected.statuses.includes("ready"));
    assert.equal(Object.prototype.hasOwnProperty.call(observed.nextAction, "launch"), false);
    assert.equal(JSON.stringify(observed.nextAction).includes("codex-onboarding-launch"), false);
  } finally { dispose(path); }
});

test("the barrier's runner exemption is the same set the V3 bootstrap authority already exempts", () => {
  const path = root();
  try {
    initializeRestartRequiredRoot(path);
    // Asserted behaviourally, not by reading a private constant: the two sets
    // are equal iff every runner that skips the barrier is exactly the runner
    // the authority reports `runtimeReadback: "not-applicable"` for.
    for (const runner of ["claude", "codex", "some-future-runner", "", null, undefined]) {
      const authority = validateV3BootstrapAuthority({ rootDir: path, deps: fakeDeps, runner });
      assert.equal(
        requiresNativeRuntimeReadback(runner),
        authority.runtimeReadback !== "not-applicable",
        `runner ${JSON.stringify(runner)} disagrees between the barrier exemption and the bootstrap authority`,
      );
    }
  } finally { dispose(path); }
});

test("restart action for the codex runner is unchanged: still the Codex launcher (regression pin)", () => {
  const path = root();
  try {
    const barrier = initializeRestartRequiredRoot(path);
    const observed = inspectProjectOnboardingV3({ rootDir: path, deps: fakeDeps, runner: "codex" });
    assert.equal(observed.status, "restart-required");
    assert.equal(observed.nextAction.kind, "restart-process");
    assert.equal(observed.nextAction.requiresCurrentProcessExit, true);
    assert.equal(observed.nextAction.launch.executable, "node");
    assert.equal(observed.nextAction.launch.argv[0], ONBOARDING_LAUNCH_SCRIPT);
    assert.ok(observed.nextAction.launch.argv.includes(barrier.rawSha256));
    assert.equal(observed.nextAction.launch.codexToolCallPermitted, false);
  } finally { dispose(path); }
});

test("a V3 source enabling only Claude admits a Claude Code session instead of hard-failing as Codex-disabled", () => {
  const path = root();
  try {
    const portable = planProjectOnboardingV3({ runner: "codex", rootDir: path, deps: fakeDeps });
    assert.equal(applyProjectOnboardingV3(portable, { rootDir: path, activate: true, deps: fakeDeps }).status, "applied");
    const sourcePath = join(path, "pipeline.user.yaml");
    const claudeOnlySource = readFileSync(sourcePath, "utf8")
      .replace(/enabled:\n(\s*-\s*"[^"]*"\n)+/u, 'enabled:\n    - "claude"\n')
      .replace(/default: "?codex"?/u, 'default: "claude"');
    writeFileSync(sourcePath, claudeOnlySource);
    const observedClaude = inspectProjectOnboardingV3({ rootDir: path, deps: fakeDeps, intent: "bootstrap", runner: "claude" });
    assert.notEqual(observedClaude.status, "invalid");
    assert.equal(observedClaude.status, "runtime-initialization-required");
    assert.equal(observedClaude.runner, "claude");
    assert.equal(observedClaude.diagnostics.every((entry) => entry.code !== "source_invalid"), true);
    // The same claude-only source still hard-fails an invoking Codex session:
    // admission is bound to the real invoking runner, not opened up generally.
    const observedCodex = inspectProjectOnboardingV3({ rootDir: path, deps: fakeDeps, intent: "bootstrap", runner: "codex" });
    assert.equal(observedCodex.status, "invalid");
    assert.equal(observedCodex.runner, "codex");
    assert.equal(observedCodex.diagnostics[0].code, "source_invalid");
    assert.equal(observedCodex.diagnostics[0].message, "codex is not enabled by the source authority");
  } finally { dispose(path); }
});

test("blank real root inspect and plan are read-only", () => {
  const path = root();
  try {
    const inspected = inspectProjectOnboardingV3({ runner: "codex", rootDir: path });
    assert.equal(inspected.status, "portable-seed-required");
    assert.deepEqual(inspected.repository, {
      status: "local-uninitialized",
      mode: "local",
      gitVersion: inspected.repository.gitVersion,
      initializesGit: true,
      rootWritable: "passed",
      sessionCapability: "not-required",
      worktreeCapability: "not-required",
    });
    assert.deepEqual(Object.keys(inspected).sort(), ["appServer", "continuity", "diagnostics", "intent", "nextAction", "repository", "root", "runner", "runtime", "schema", "status"]);
    const plan = planProjectOnboardingV3({ runner: "codex", rootDir: path, deps: fakeDeps });
    assert.equal(plan.status, "ready");
    assert.deepEqual(names(path), []);
    assert.deepEqual(plan.targets.map((target) => target.path), [
      ".gitignore", "pipeline.user.yaml", "project/critical-human-proof.json",
      "project/pipeline.json", "project/pipeline.yaml",
    ]);
  } finally { dispose(path); }
});

test("healthy legacy authority exposes one typed runner-neutral migration action", () => {
  const path = root();
  try {
    initializeRestartRequiredRoot(path);
    rmSync(join(path, "project"), { recursive: true, force: true });
    const inspected = inspectProjectOnboardingV3({ runner: "codex", rootDir: path, intent: "bootstrap", deps: fakeDeps });
    assert.equal(inspected.status, "migration-required");
    assertDiagnostic(inspected, "project_authority_migration_required");
    assertSingleLineAction(inspected.nextAction, {
      kind: "command",
      executable: "node",
      argv: [PROJECT_AUTHORITY_MIGRATION_SCRIPT, "plan", "--root", path],
      mutation: false,
      requiresConfirmation: false,
      expected: {
        schema: "pipeline.project-authority.v1",
        statuses: ["ready", "noop", "recovery-required", "invalid-source"],
      },
    });
  } finally { dispose(path); }
});

test("mixed authority without a vendored package copy is offered the sync, not a dead end", () => {
  const path = root();
  try {
    // The live shape: a neutral manifest beside a real legacy calibration the
    // neutral layer does not have yet, in a project that loads this plugin from
    // the marketplace and therefore has no local copy to prove provenance with.
    initializeRestartRequiredRoot(path);
    writeFileSync(join(path, ".claude/pipeline-state.json"), "{\"schema\":\"pipeline.state.v0\"}\n");
    assert.equal(readProjectAuthority({ rootDir: path }).status, "mixed");
    const inspected = inspectProjectOnboardingV3({ runner: "codex", rootDir: path, intent: "bootstrap", deps: fakeDeps });
    assert.equal(inspected.status, "migration-required");
    assertDiagnostic(inspected, "project_authority_vendor_sync_required");
    assertSingleLineAction(inspected.nextAction, {
      kind: "command",
      executable: "node",
      argv: [PROJECT_AUTHORITY_MIGRATION_SCRIPT, "vendor-sync", "--root", path],
      mutation: false,
      requiresConfirmation: false,
      expected: {
        schema: "pipeline.project-authority-vendor-sync.v1",
        statuses: ["ready", "noop"],
      },
    });
  } finally { dispose(path); }
});

test("bootstrap inspection of a blank local root offers the portable seed instead of rejecting its absent Git control path", () => {
  const path = root();
  try {
    const inspected = inspectProjectOnboardingV3({ runner: "codex", rootDir: path, intent: "bootstrap" });
    assert.equal(inspected.status, "portable-seed-required");
    assert.equal(inspected.repository.status, "local-uninitialized");
    assert.equal(inspected.repository.initializesGit, false);
    assert.equal(inspected.nextAction.kind, "command");
    assert.deepEqual(inspected.nextAction.expected.statuses, ["portable-seed-required"]);
  } finally { dispose(path); }
});

test("a git-only Codex control mount carries host-managed state through the restart barrier", (t) => {
  if (process.platform === "win32") return;
  const path = root();
  const runtimeDeps = { codexExecutable: process.execPath };
  try {
    mkdirSync(join(path, ".git"));
    chmodSync(join(path, ".git"), 0o500);
    const portable = planProjectOnboardingLifecycleV4({ runner: "codex", rootDir: path, operation: "portable", deps: runtimeDeps });
    const portableDigest = portable.nextAction.argv[portable.nextAction.argv.indexOf("--plan-sha256") + 1];
    assert.equal(applyProjectOnboardingLifecycleV4({ runner: "codex", rootDir: path, operation: "portable", planSha256: portableDigest, activate: true, deps: runtimeDeps }).status, "runtime-initialization-required");
    const runtime = planProjectOnboardingLifecycleV4({ runner: "codex", rootDir: path, operation: "runtime", deps: runtimeDeps });
    const runtimeDigest = runtime.nextAction.argv[runtime.nextAction.argv.indexOf("--plan-sha256") + 1];
    const initialized = applyProjectOnboardingLifecycleV4({ runner: "codex", rootDir: path, operation: "runtime", planSha256: runtimeDigest, activate: true, deps: runtimeDeps });
    assert.equal(initialized.status, "restart-required", JSON.stringify(initialized));
    assert.equal(readRestartBarrier({ rootDir: path, repositoryCapability: "host-managed" }).status, "present");
  } finally {
    try { chmodSync(join(path, ".git"), 0o700); } catch {}
    dispose(path);
  }
});

test("public CLI emits typed inspect, plan, and explicit-apply results", () => {
  const path = root();
  const invoke = (args) => {
    let output = "";
    const code = onboardingCli(args, { deps: fakeDeps, write: (chunk) => { output += chunk; } });
    return { code, result: JSON.parse(output) };
  };
  try {
    let aliasOutput = "";
    const aliasCode = onboardingCli(["apply", "--root", path, "--activate"], {
      deps: fakeDeps,
      write: (chunk) => { aliasOutput += chunk; },
    });
    assert.equal(aliasCode, 2);
    assert.match(aliasOutput, /unknown argument: apply/u);
    assert.deepEqual(names(path), []);

    const inspected = invoke(["inspect", "--root", path, "--runner", "codex"]);
    assert.equal(inspected.code, 0); assert.equal(inspected.result.status, "portable-seed-required");
    const planned = invoke(["plan", "--root", path, "--runner", "codex"]);
    assert.equal(planned.code, 0); assert.equal(planned.result.status, "portable-seed-required");
    assert.deepEqual(names(path), []);
    const digest = planned.result.nextAction.argv[planned.result.nextAction.argv.indexOf("--plan-sha256") + 1];
    const applied = invoke(["apply-portable-seed", "--root", path, "--plan-sha256", digest, "--activate", "--runner", "codex"]);
    assert.equal(applied.code, 0); assert.equal(applied.result.status, "runtime-initialization-required");
  } finally { dispose(path); }
});

// Regression for backlog 2026-08-10-git-identity-ask-step-unreachable-through-
// live-cli-path.md: GF-103's `collect-input` ask-step for a missing commit
// author was correct but unreachable through the real `apply-portable-seed
// --activate` CLI path, because `applyLifecycle()`'s "portable" branch
// discarded `applyProjectOnboardingV3()`'s return value and returned a fresh
// `v4Inspection()` instead. This drives the exact CLI entry point (not a
// direct `applyProjectOnboardingV3()` unit call) and proves the ask now
// surfaces there, additively, without changing the resting status a live
// caller already chains through.
test("apply-portable-seed --activate surfaces the missing-author-identity ask-step through the real CLI path", () => {
  const missing = root();
  const configured = root();
  const invoke = (args, deps) => {
    let output = "";
    const code = onboardingCli(args, { deps, write: (chunk) => { output += chunk; } });
    return { code, result: JSON.parse(output) };
  };
  try {
    // (a) Missing identity: the live CLI apply now carries the ask-step
    // alongside its unchanged resting status and unchanged primary nextAction.
    const planned = invoke(["plan", "--root", missing, "--runner", "codex"], fakeDeps);
    assert.equal(planned.code, 0);
    const digest = planned.result.nextAction.argv[planned.result.nextAction.argv.indexOf("--plan-sha256") + 1];
    const applied = invoke(["apply-portable-seed", "--root", missing, "--plan-sha256", digest, "--activate", "--runner", "codex"], fakeDeps);
    assert.equal(applied.code, 0);
    assert.equal(applied.result.status, "runtime-initialization-required",
      "the ask-step must never replace or change the lifecycle's own resting status");
    assert.equal(applied.result.nextAction.kind, "command",
      "the ask-step must never replace the primary chained nextAction");
    assert.equal(applied.result.authorIdentityAction.kind, "collect-input");
    assert.equal(applied.result.authorIdentityAction.mutation, false);
    const fieldNames = applied.result.authorIdentityAction.inputs.map((input) => input.name).sort();
    assert.deepEqual(fieldNames, ["gitAuthorEmail", "gitAuthorName"]);

    // A replay of the exact same apply call (zero-write, same digest) must
    // observe the identical ask-step -- this is the same invariant the
    // existing "portable and runtime apply replays are zero-write with
    // identical canonical responses" test already pins for the rest of the
    // envelope.
    const replayed = invoke(["apply-portable-seed", "--root", missing, "--plan-sha256", digest, "--activate", "--runner", "codex"], fakeDeps);
    assert.deepEqual(replayed.result, applied.result);

    // (b) A repository whose author identity IS resolved gets no ask-step at
    // all -- exactly current behavior, additive only.
    const knowsItsAuthor = {
      ...fakeDeps,
      spawnSync(command, args, options) {
        if (command === "git" && args[0] === "config" && args[1] === "--get") {
          return { status: 0, stdout: "configured\n", stderr: "" };
        }
        return fakeDeps.spawnSync(command, args, options);
      },
    };
    const quietPlanned = invoke(["plan", "--root", configured, "--runner", "codex"], knowsItsAuthor);
    const quietDigest = quietPlanned.result.nextAction.argv[quietPlanned.result.nextAction.argv.indexOf("--plan-sha256") + 1];
    const quietApplied = invoke(["apply-portable-seed", "--root", configured, "--plan-sha256", quietDigest, "--activate", "--runner", "codex"], knowsItsAuthor);
    assert.equal(quietApplied.code, 0);
    assert.equal(quietApplied.result.status, "runtime-initialization-required");
    assert.equal(Object.prototype.hasOwnProperty.call(quietApplied.result, "authorIdentityAction"), false,
      "a configured repository must not be asked");
  } finally { dispose(missing); dispose(configured); }
});

// Regression for backlog 2026-08-08-an-installing-consumer-is-never-asked-
// any-setup-decision.md and 2026-08-25-greenfield-onboarding-never-applies-
// the-machine-push-approval-preference.md: nothing in the install path ever
// asked how a push approval is cleared or told the installer a PO signing key
// exists at all -- every setting resolved silently to its strictest default,
// and even where the question WAS asked its answer was never applied to the
// generated file. This drives the real CLI `apply-portable-seed --activate`
// path (same shape as the author-identity regression above) and proves the
// ask surfaces for EVERY repository (`pipeline.user.yaml` is
// repository-scoped config, PO decision 2026-08-25): a first-time machine
// gets the full ceremony guidance (signing key included), a machine with an
// already-answered plane gets a short pre-filled confirm/override instead --
// and never in either case does the ask change the lifecycle's own resting
// status or primary chained nextAction.
test("apply-portable-seed --activate surfaces the push-approval-setup ask-step for every repository, pre-filled from the machine default", () => {
  const unasked = root();
  const asked = root();
  const invoke = (args, deps) => {
    let output = "";
    const code = onboardingCli(args, { deps, write: (chunk) => { output += chunk; } });
    return { code, result: JSON.parse(output) };
  };
  try {
    // (a) A machine with no configuration plane yet: the ask surfaces
    // alongside the unchanged resting status and unchanged primary nextAction.
    const neverAsked = { ...fakeDeps, readMachinePlane() { return { status: "absent", plane: null }; } };
    const planned = invoke(["plan", "--root", unasked, "--runner", "codex"], neverAsked);
    assert.equal(planned.code, 0);
    const digest = planned.result.nextAction.argv[planned.result.nextAction.argv.indexOf("--plan-sha256") + 1];
    const applied = invoke(["apply-portable-seed", "--root", unasked, "--plan-sha256", digest, "--activate", "--runner", "codex"], neverAsked);
    assert.equal(applied.code, 0);
    assert.equal(applied.result.status, "runtime-initialization-required",
      "the ask-step must never replace or change the lifecycle's own resting status");
    assert.equal(applied.result.nextAction.kind, "command",
      "the ask-step must never replace the primary chained nextAction");
    assert.equal(applied.result.pushApprovalSetupAction.kind, "collect-input");
    assert.equal(applied.result.pushApprovalSetupAction.mutation, false);
    assert.equal(applied.result.pushApprovalSetupAction.input.name, "pushApprovalPreference");
    assert.match(applied.result.pushApprovalSetupAction.guidance, /"signature"/u);
    assert.match(applied.result.pushApprovalSetupAction.guidance, /"chat"/u);
    assert.match(applied.result.pushApprovalSetupAction.guidance, /agent-pipeline-po/u,
      "must propose a default PO key directory, never demand one");
    assert.doesNotMatch(applied.result.pushApprovalSetupAction.guidance, /\bsetup\.mjs\b/u,
      "must never point an installing consumer at the script SETUP.md forbids them to use");
    assert.match(applied.result.pushApprovalSetupAction.guidance, /sibling trust-anchor setup question/u);
    assert.doesNotMatch(applied.result.pushApprovalSetupAction.guidance, /THEMSELVES|outside this session/u,
      "the happy path is the returned public-driver action, not manual terminal choreography");

    // A replay of the exact same apply call (zero-write, same digest) must
    // observe the identical ask-step.
    const replayed = invoke(["apply-portable-seed", "--root", unasked, "--plan-sha256", digest, "--activate", "--runner", "codex"], neverAsked);
    assert.deepEqual(replayed.result, applied.result);

    // (b) A machine whose configuration plane already exists (default
    // `fakeDeps`, `pushApprovalDefault: "signature"`): the ask still fires,
    // for THIS repository, but pre-filled with the machine default and no
    // signing-key ceremony repeated.
    const quietPlanned = invoke(["plan", "--root", asked, "--runner", "codex"], fakeDeps);
    const quietDigest = quietPlanned.result.nextAction.argv[quietPlanned.result.nextAction.argv.indexOf("--plan-sha256") + 1];
    const quietApplied = invoke(["apply-portable-seed", "--root", asked, "--plan-sha256", quietDigest, "--activate", "--runner", "codex"], fakeDeps);
    assert.equal(quietApplied.code, 0);
    assert.equal(quietApplied.result.status, "runtime-initialization-required");
    assert.equal(quietApplied.result.pushApprovalSetupAction.kind, "collect-input",
      "a repository onboarded on an already-answered machine is still asked, pre-filled");
    assert.match(quietApplied.result.pushApprovalSetupAction.guidance, /pre-filled/u);
    assert.match(quietApplied.result.pushApprovalSetupAction.guidance, /"signature"/u);
    assert.doesNotMatch(quietApplied.result.pushApprovalSetupAction.guidance, /po-human-approval\.mjs/u,
      "an already-answered machine must not repeat the signing-key ceremony");
  } finally { dispose(unasked); dispose(asked); }
});

// Regression for backlog pipeline.onboarding-must-elicit-the-real-verify-
// contract (NVA-D-VERIFYASK): onboarding never asked what a project's real
// verify command is, so the seeded UNCONFIGURED_VERIFY placeholder
// (deliberately failing) stayed in place unnoticed until the push gate
// discovered it, at push time, after a human had already been asked for a
// signature. Same shape as the author-identity/push-approval regressions
// above: drives the real CLI `apply-portable-seed --activate` path and
// proves the ask surfaces there, additively, without changing the resting
// status or the primary chained nextAction.
test("apply-portable-seed records the unresolved verify contract but defers its PO question to the implementation handover", () => {
  const withCandidate = root();
  const withoutCandidate = root();
  const invoke = (args, deps) => {
    let output = "";
    const code = onboardingCli(args, { deps, write: (chunk) => { output += chunk; } });
    return { code, result: JSON.parse(output) };
  };
  try {
    // (a) A project whose package.json names a real, distinctive test script:
    // the ask must offer THAT exact script, never a hardcoded default.
    writeFileSync(join(withCandidate, "package.json"), JSON.stringify({
      name: "sample", scripts: { test: "node --test test/onboarding-sample.test.mjs" },
    }, null, 2), "utf8");
    const planned = invoke(["plan", "--root", withCandidate, "--runner", "codex"], fakeDeps);
    assert.equal(planned.code, 0);
    const digest = planned.result.nextAction.argv[planned.result.nextAction.argv.indexOf("--plan-sha256") + 1];
    const applied = invoke(["apply-portable-seed", "--root", withCandidate, "--plan-sha256", digest, "--activate", "--runner", "codex"], fakeDeps);
    assert.equal(applied.code, 0);
    assert.equal(applied.result.status, "runtime-initialization-required",
      "the ask-step must never replace or change the lifecycle's own resting status");
    assert.equal(applied.result.nextAction.kind, "command",
      "the ask-step must never replace the primary chained nextAction");
    assert.equal(applied.result.verifyContractAction.kind, "collect-input");
    assert.equal(applied.result.verifyContractAction.mutation, false);
    assert.equal(applied.result.verifyContractAction.input.name, "verifyCommand");
    assert.match(applied.result.verifyContractAction.guidance, /node --test test\/onboarding-sample\.test\.mjs/u,
      "must offer the REAL detected script, not a hardcoded default");
    assert.match(applied.result.verifyContractAction.guidance, /"npm test"/u);
    assert.match(applied.result.verifyContractAction.guidance, /"defer"/u);
    assert.equal(applied.result.verifyContractStatus, "placeholder");
    assert.equal(applied.result.pushGateSatisfiable, false,
      "typed field, not prose: a caller must be able to branch on this directly");
    assert.equal(applied.result.nextAction.pendingAsks.some((ask) => ask.input?.name === "verifyCommand"), false,
      "the first setup round must not ask for a test command before the project design exists");

    // A replay of the exact same apply call (zero-write, same digest) must
    // observe the identical ask-step.
    const replayed = invoke(["apply-portable-seed", "--root", withCandidate, "--plan-sha256", digest, "--activate", "--runner", "codex"], fakeDeps);
    assert.deepEqual(replayed.result, applied.result);

    // (b) No obvious candidate anywhere: the ask still fires (unsatisfiable
    // stays visible), but never invents a command to offer.
    const noCandidatePlanned = invoke(["plan", "--root", withoutCandidate, "--runner", "codex"], fakeDeps);
    const noCandidateDigest = noCandidatePlanned.result.nextAction.argv[noCandidatePlanned.result.nextAction.argv.indexOf("--plan-sha256") + 1];
    const noCandidateApplied = invoke(["apply-portable-seed", "--root", withoutCandidate, "--plan-sha256", noCandidateDigest, "--activate", "--runner", "codex"], fakeDeps);
    assert.equal(noCandidateApplied.code, 0);
    assert.equal(noCandidateApplied.result.verifyContractAction.kind, "collect-input");
    assert.match(noCandidateApplied.result.verifyContractAction.guidance, /No obvious candidate/u);
    assert.equal(noCandidateApplied.result.pushGateSatisfiable, false);
  } finally { dispose(withCandidate); dispose(withoutCandidate); }
});

// Load-bearing (Acceptance criterion 3): proves the ask above can never
// become a way to fake a green push gate. Even though a real candidate was
// detected and OFFERED for confirmation, this library never applies it
// itself -- the seeded verify command stays the deliberately-failing
// UNCONFIGURED_VERIFY placeholder until a human actually edits
// project/pipeline.json, so running the SEEDED command exits non-zero.
test("a seeded configuration can never produce passing verify evidence without a real command having run", () => {
  const projectRoot = root();
  const invoke = (args, deps) => {
    let output = "";
    const code = onboardingCli(args, { deps, write: (chunk) => { output += chunk; } });
    return { code, result: JSON.parse(output) };
  };
  try {
    writeFileSync(join(projectRoot, "package.json"), JSON.stringify({
      name: "sample", scripts: { test: "node --test" },
    }, null, 2), "utf8");
    const planned = invoke(["plan", "--root", projectRoot, "--runner", "codex"], fakeDeps);
    const digest = planned.result.nextAction.argv[planned.result.nextAction.argv.indexOf("--plan-sha256") + 1];
    const applied = invoke(["apply-portable-seed", "--root", projectRoot, "--plan-sha256", digest, "--activate", "--runner", "codex"], fakeDeps);
    assert.equal(applied.code, 0);
    assert.equal(applied.result.verifyContractAction.kind, "collect-input",
      "a candidate was detected and offered, but never silently adopted");

    const calibrationPath = existsSync(join(projectRoot, "project", "pipeline.json"))
      ? join(projectRoot, "project", "pipeline.json")
      : join(projectRoot, ".claude", "pipeline.json");
    const calibration = JSON.parse(readFileSync(calibrationPath, "utf8"));
    assert.match(calibration.verify, /the verify contract of this project is not configured/u,
      "the offered candidate must never be silently applied to the seeded calibration");

    const run = spawnSync(calibration.verify, { shell: true, encoding: "utf8" });
    assert.notEqual(run.status, 0, "the seeded verify command must fail -- it never ran a real check");
  } finally { dispose(projectRoot); }
});

// NVA-V13-ASKWINDOW (backlog: the onboarding asks survive past the one call
// that publishes them): every ask above used to surface ONLY through the
// single `apply-portable-seed --activate` call that happened to publish it
// -- a plain, ordinary `inspect` at the exact same still-true status
// reported `pendingAsks: []`. This drives the real CLI `inspect` path (not a
// direct library call) and proves the regression is closed.
test("an ordinary inspect surfaces every pending ask whose condition is still true, not only the apply-portable-seed call", () => {
  const path = root();
  const invoke = (args, deps) => {
    let output = "";
    const code = onboardingCli(args, { deps, write: (chunk) => { output += chunk; } });
    return { code, result: JSON.parse(output) };
  };
  try {
    const planned = invoke(["plan", "--root", path, "--runner", "codex"], fakeDeps);
    assert.equal(planned.code, 0);
    const digest = planned.result.nextAction.argv[planned.result.nextAction.argv.indexOf("--plan-sha256") + 1];
    const applied = invoke(["apply-portable-seed", "--root", path, "--plan-sha256", digest, "--activate", "--runner", "codex"], fakeDeps);
    assert.equal(applied.code, 0);
    assert.equal(applied.result.status, "runtime-initialization-required");
    assert.ok(Array.isArray(applied.result.nextAction?.pendingAsks) && applied.result.nextAction.pendingAsks.length > 0,
      "fixture sanity: at least one ask must be pending after the apply");

    // Live evidence this dispatch closes: a SECOND, ordinary `inspect` at the
    // exact same still-true status must report the same pending asks, not an
    // empty array.
    const inspected = invoke(["inspect", "--root", path, "--runner", "codex"], fakeDeps);
    assert.equal(inspected.code, 0);
    assert.equal(inspected.result.status, "runtime-initialization-required");
    assert.ok(Array.isArray(inspected.result.nextAction?.pendingAsks),
      "an ordinary inspect must carry the same nextAction.pendingAsks channel a driver already reads");
    assert.ok(inspected.result.nextAction.pendingAsks.length > 0,
      "an ordinary inspect must surface every ask whose condition is still true");

    // Same set of asks the apply-portable-seed response published.
    const appliedSerialized = applied.result.nextAction.pendingAsks.map((ask) => JSON.stringify(ask)).sort();
    const inspectedSerialized = inspected.result.nextAction.pendingAsks.map((ask) => JSON.stringify(ask)).sort();
    assert.deepEqual(inspectedSerialized, appliedSerialized);

    // No duplicate entries within a single result, and re-running the SAME
    // ordinary inspect (a result passing through the composed wrapper a
    // second time) must be idempotent, never additive.
    assert.equal(new Set(inspectedSerialized).size, inspectedSerialized.length,
      "pendingAsks must carry no duplicate entries");
    const reinspected = invoke(["inspect", "--root", path, "--runner", "codex"], fakeDeps);
    assert.deepEqual(reinspected.result, inspected.result);

    // Ordinary inspect must never grow the raw per-field side channels --
    // those are the apply-portable-seed path's own established shape and are
    // NOT in project-onboarding-ready-gate.mjs's closed key sets; leaking
    // them here would fail every non-ready session closed
    // (PORG-INVALID-OBSERVATION) the moment any ask's condition is true.
    for (const key of ["authorIdentityAction", "pushApprovalSetupAction", "verifyContractAction", "verifyContractStatus", "pushGateSatisfiable", "trustAnchorGuidanceAction", "projectIgnoreGapAction"]) {
      assert.equal(Object.prototype.hasOwnProperty.call(inspected.result, key), false,
        `ordinary inspect must not carry the raw side channel "${key}"`);
    }
  } finally { dispose(path); }
});

// Sibling of the test immediately above: an ask whose underlying condition
// has actually been RESOLVED must stop appearing on the next ordinary
// inspect, not linger as a stale entry.
test("an ask whose condition has been resolved stops appearing on the next ordinary inspect", () => {
  const path = root();
  const invoke = (args, deps) => {
    let output = "";
    const code = onboardingCli(args, { deps, write: (chunk) => { output += chunk; } });
    return { code, result: JSON.parse(output) };
  };
  const knowsItsAuthor = {
    ...fakeDeps,
    spawnSync(command, args, options) {
      if (command === "git" && args[0] === "config" && args[1] === "--get") {
        return { status: 0, stdout: "configured\n", stderr: "" };
      }
      return fakeDeps.spawnSync(command, args, options);
    },
  };
  try {
    const planned = invoke(["plan", "--root", path, "--runner", "codex"], knowsItsAuthor);
    assert.equal(planned.code, 0);
    const digest = planned.result.nextAction.argv[planned.result.nextAction.argv.indexOf("--plan-sha256") + 1];
    const applied = invoke(["apply-portable-seed", "--root", path, "--plan-sha256", digest, "--activate", "--runner", "codex"], knowsItsAuthor);
    assert.equal(applied.code, 0);
    assert.equal(applied.result.status, "runtime-initialization-required");
    assert.equal(Object.prototype.hasOwnProperty.call(applied.result, "authorIdentityAction"), false,
      "fixture sanity: a resolved author identity must not be asked by the apply path either");

    const inspected = invoke(["inspect", "--root", path, "--runner", "codex"], knowsItsAuthor);
    assert.equal(inspected.code, 0);
    const names = (inspected.result.nextAction?.pendingAsks ?? [])
      .map((ask) => ask.input?.name ?? (ask.inputs ?? []).map((entry) => entry.name).join(","));
    assert.ok(!names.some((name) => name.includes("gitAuthorName")),
      "a resolved condition must not leave a stale ask behind on the next ordinary inspect");
  } finally { dispose(path); }
});

// The single highest-risk consequence of this dispatch (its own briefing's
// words): the "ready" status must be unaffected, checked against the REAL
// gate function -- an unliftable, fail-closed exactKeys() check. This fixture
// has a draft feature, so its one legitimate non-null action is the closed
// public plan-lifecycle inspect handoff.
test("the ready status observation is unaffected by the ask-window change, checked against the real ready gate", () => {
  const path = root();
  try {
    const barrier = initializeRestartRequiredRoot(path);
    clearRuntimeBarrier(path, barrier);
    completeKickoff(path);

    const observed = inspectProjectOnboardingV3({ rootDir: path, intent: "onboarding", runner: "codex", deps: fakeDeps });
    assert.equal(observed.status, "ready");
    assertPlanLifecycleInspectAction(observed.nextAction);

    const receipt = requireProjectOnboardingReady({
      rootDir: path,
      intent: "onboarding",
      runner: "codex",
      inspect: ({ rootDir: r, intent: i, runner: rn }) => inspectProjectOnboardingV3({ rootDir: r, intent: i, runner: rn, deps: fakeDeps }),
    });
    assert.equal(receipt.status, "ready");
    assert.equal(receipt.schema, "pipeline.project-onboarding-ready-gate.v1");
  } finally { dispose(path); }
});

// The composition itself (DoD: "expressed ONCE"): mechanically guards against
// a future re-inlining of the five-wrapper chain a second time, the exact
// drift this dispatch was told not to add.
test("the five-wrapper pending-asks composition is expressed exactly once in the library source", () => {
  const source = readFileSync(fileURLToPath(new URL("./project-onboarding-v3.mjs", import.meta.url)), "utf8");
  const composedChain = "withPendingAsksSurfacedOnNextAction(withPendingProjectIgnoreGapAsk(withPendingTrustAnchorGuidanceAsk(withPendingVerifyContractAsk(withPendingPushApprovalSetupAsk(withPendingAuthorIdentityAsk(";
  const occurrences = source.split(composedChain).length - 1;
  assert.equal(occurrences, 1,
    "the five-wrapper ask chain must be composed through one named helper, never hand-copied a second time");
});

// Regression for backlog 2026-08-18-po-key-trust-anchor-onboarding.md and
// 2026-08-28-onboarding-must-bootstrap-the-trust-anchor-once.md. A machine
// that already held a signing key used to leave every fresh project on it
// with no propagated trust anchor: the first human-override ceremony then
// discovered the absence as HGO-TRUST-ANCHOR-MISSING, a circularity nothing
// in the flow had explained. Onboarding now MATERIALIZES the anchor in the
// same transaction that writes the rest of the fresh baseline, and the older
// "here is a snippet, paste it yourself" guidance survives only for the one
// case the seed cannot reach -- a repository that already owns a policy file
// (every write site is create-only, `flag: "wx"`) without the anchor.
test("apply-portable-seed --activate seeds the machine's trust anchor into a fresh repository, and still guides one that already owns an anchorless policy", () => {
  const seeded = root();
  const preexisting = root();
  const keyDir = root();
  const invoke = (args, deps) => {
    let output = "";
    const code = onboardingCli(args, { deps, write: (chunk) => { output += chunk; } });
    return { code, result: JSON.parse(output) };
  };
  try {
    const publicKeySha256 = "a".repeat(64);
    writeFileSync(
      join(keyDir, "trust-policy.json"),
      `${JSON.stringify({ keyReference: "po-key-1", publicKeySha256, humanName: "André" }, null, 2)}\n`,
    );
    const machineHasKey = { ...fakeDeps, readMachinePlane() {
      return {
        status: "valid",
        plane: {
          schema: "pipeline.machine-plane.v1", poKeyDirectory: keyDir, pushApprovalDefault: "signature",
          routing: null, language: null, session: null, usage: null, updatedAt: "2026-08-08T00:00:00.000Z",
        },
      };
    } };

    // (a) A fresh repository on a machine that has a key: the anchor is
    // MATERIALIZED, not explained. Nothing is left to ask, so the guidance
    // stays silent -- and seeding it changes neither the lifecycle's own
    // resting status nor the primary chained nextAction.
    const planned = invoke(["plan", "--root", seeded, "--runner", "codex"], machineHasKey);
    const digest = planned.result.nextAction.argv[planned.result.nextAction.argv.indexOf("--plan-sha256") + 1];
    const applied = invoke(["apply-portable-seed", "--root", seeded, "--plan-sha256", digest, "--activate", "--runner", "codex"], machineHasKey);
    assert.equal(applied.code, 0);
    assert.equal(applied.result.status, "runtime-initialization-required",
      "seeding the anchor must never change the lifecycle's own resting status");
    assert.equal(applied.result.nextAction.kind, "command",
      "seeding the anchor must never replace the primary chained nextAction");
    const policyBytes = readFileSync(join(seeded, "project", "critical-human-proof.json"), "utf8");
    const policy = JSON.parse(policyBytes);
    assert.equal(policy.schema, "pipeline.critical-human-proof-policy.v3");
    assert.deepEqual(policy.requiredKinds, ["push"]);
    assert.deepEqual(policy.trustAnchors, [{ keyReference: "po-key-1", publicKeySha256 }]);
    assert.equal(policyBytes.includes(keyDir), false,
      "the seeded anchor carries the key's public digest and its own reference only -- never the key's filesystem location, which is machine-specific and not this project's to record");
    assert.equal(Object.prototype.hasOwnProperty.call(applied.result, "trustAnchorGuidanceAction"), false,
      "an anchor onboarding itself just materialized leaves nothing to ask about");
    assert.equal(applied.result.pushApprovalSetupAction.kind, "collect-input",
      "the per-repository push-approval confirm is orthogonal to the trust anchor and still fires");

    // (b) A repository that already owns an anchorless policy file. Every
    // write site for these bytes is create-only (`flag: "wx"`), so the seed
    // deliberately never rewrites one -- which is precisely the case the
    // older guidance still exists for. Onboard cleanly first (pre-seeding
    // project/ before "plan" runs confuses the planner into a different
    // repository state, not what this case means to test), then replace the
    // materialized file with an anchorless one and replay the identical
    // apply call (zero-write, same digest): v4Inspection re-reads the actual
    // file fresh each time, so the replay observes the edit exactly as a real
    // PO commit would be observed.
    const quietPlanned = invoke(["plan", "--root", preexisting, "--runner", "codex"], machineHasKey);
    const quietDigest = quietPlanned.result.nextAction.argv[quietPlanned.result.nextAction.argv.indexOf("--plan-sha256") + 1];
    const firstApplied = invoke(["apply-portable-seed", "--root", preexisting, "--plan-sha256", quietDigest, "--activate", "--runner", "codex"], machineHasKey);
    assert.equal(firstApplied.code, 0);
    writeFileSync(
      join(preexisting, "project", "critical-human-proof.json"),
      `${JSON.stringify({ schema: "pipeline.critical-human-proof-policy.v1", requiredKinds: ["push"] }, null, 2)}\n`,
    );
    const guided = invoke(["apply-portable-seed", "--root", preexisting, "--plan-sha256", quietDigest, "--activate", "--runner", "codex"], machineHasKey);
    assert.equal(guided.code, 0);
    assert.equal(guided.result.trustAnchorGuidanceAction.kind, "collect-input");
    assert.equal(guided.result.trustAnchorGuidanceAction.mutation, false);
    assert.match(guided.result.trustAnchorGuidanceAction.guidance, new RegExp(publicKeySha256, "u"));
    assert.match(guided.result.trustAnchorGuidanceAction.guidance, /po-key-1/u);
    assert.match(guided.result.trustAnchorGuidanceAction.guidance, /André/u);
    assert.match(guided.result.trustAnchorGuidanceAction.guidance, /trustAnchors/u);
    assert.match(guided.result.trustAnchorGuidanceAction.guidance, /guard-gate-strength\.mjs/u,
      "must disclose that GS-2 forbids any agent write to this file");

    // (c) That same repository once the matching anchor is on record: no
    // proposal, silence is correct.
    writeFileSync(
      join(preexisting, "project", "critical-human-proof.json"),
      `${JSON.stringify({ schema: "pipeline.critical-human-proof-policy.v3", requiredKinds: ["push"], waivedKinds: [], trustAnchors: [{ keyReference: "po-key-1", publicKeySha256 }] }, null, 2)}\n`,
    );
    const quietApplied = invoke(["apply-portable-seed", "--root", preexisting, "--plan-sha256", quietDigest, "--activate", "--runner", "codex"], machineHasKey);
    assert.equal(quietApplied.code, 0);
    assert.equal(Object.prototype.hasOwnProperty.call(quietApplied.result, "trustAnchorGuidanceAction"), false,
      "a repository that already committed the matching anchor must not be asked again");
  } finally { dispose(seeded); dispose(preexisting); dispose(keyDir); }
});

// NVA-V1-KEYDIRPTR (backlog: 2026-08-28-a-dead-key-directory-pointer-is-
// permanent-and-silent.md): observeLocalTrustAnchorPointer distinguishes a
// broken pointer (a directory IS recorded, but trust-policy.json does not
// resolve there -- the exact shape measured live on the development machine,
// scratch/probe-machine-plane.mjs) from a genuine no-key machine (no plane,
// or no directory recorded). These previously folded into ONE
// indistinguishable detectExistingLocalTrustAnchor() null.
// freshCriticalHumanProofPolicyBytes must keep seeding the bare v1 fallback
// in the genuine no-key case either way -- narrowing detection must never
// make an absent key look present.
test("NVA-V1-KEYDIRPTR: observeLocalTrustAnchorPointer distinguishes a broken pointer from a genuine no-key machine, and freshCriticalHumanProofPolicyBytes still seeds bare v1 for the genuine no-key case", () => {
  const deadDirectory = mkdtempSync(join(tmpdir(), "nva-v1-keydirptr-dead-"));
  rmSync(deadDirectory, { recursive: true, force: true }); // simulate the vanished pointer
  const liveDirectory = mkdtempSync(join(tmpdir(), "nva-v1-keydirptr-live-"));
  try {
    // Case 1: no machine plane at all -- genuine no-key.
    const noPlaneFs = { readMachinePlane: () => ({ status: "absent", plane: null }), existsSync, readFileSync };
    const noPlane = observeLocalTrustAnchorPointer(noPlaneFs);
    assert.equal(noPlane.status, "no-plane");
    assert.equal(noPlane.anchor, null);
    assert.equal(JSON.parse(freshCriticalHumanProofPolicyBytes(noPlaneFs)).schema, "pipeline.critical-human-proof-policy.v1");

    // Case 2: a valid plane, but no directory recorded -- also genuine no-key.
    const noDirFs = {
      readMachinePlane: () => ({
        status: "valid",
        plane: { schema: "pipeline.machine-plane.v1", poKeyDirectory: null, pushApprovalDefault: "signature", routing: null, language: null, session: null, usage: null, updatedAt: "2026-08-08T00:00:00.000Z" },
      }),
      existsSync, readFileSync,
    };
    const noDir = observeLocalTrustAnchorPointer(noDirFs);
    assert.equal(noDir.status, "no-directory");
    assert.equal(noDir.anchor, null);
    assert.equal(JSON.parse(freshCriticalHumanProofPolicyBytes(noDirFs)).schema, "pipeline.critical-human-proof-policy.v1");

    // Case 3: a directory IS recorded, but does not resolve -- a REPAIRABLE
    // FAULT, and it must not read as the same status as cases 1/2 above.
    const brokenFs = {
      readMachinePlane: () => ({
        status: "valid",
        plane: { schema: "pipeline.machine-plane.v1", poKeyDirectory: deadDirectory, pushApprovalDefault: "signature", routing: null, language: null, session: null, usage: null, updatedAt: "2026-08-08T00:00:00.000Z" },
      }),
      existsSync, readFileSync,
    };
    const broken = observeLocalTrustAnchorPointer(brokenFs);
    assert.equal(broken.status, "broken-pointer");
    assert.equal(broken.anchor, null);
    assert.notEqual(broken.status, noPlane.status, "a broken pointer must not read as the same status as a genuine no-key machine");
    assert.notEqual(broken.status, noDir.status, "a broken pointer must not read as the same status as a genuine no-key machine");
    // The seed itself is still the bare v1 fallback here too -- this task
    // narrows DETECTION; it never makes an absent key look present.
    assert.equal(JSON.parse(freshCriticalHumanProofPolicyBytes(brokenFs)).schema, "pipeline.critical-human-proof-policy.v1");

    // Case 4 ("found"): a real anchor at a directory that DOES resolve --
    // unchanged behaviour, still surfaced through the same function.
    const publicKeySha256 = "b".repeat(64);
    writeFileSync(join(liveDirectory, "trust-policy.json"), `${JSON.stringify({ keyReference: "po-key-live", publicKeySha256 }, null, 2)}\n`);
    const liveFs = {
      readMachinePlane: () => ({
        status: "valid",
        plane: { schema: "pipeline.machine-plane.v1", poKeyDirectory: liveDirectory, pushApprovalDefault: "signature", routing: null, language: null, session: null, usage: null, updatedAt: "2026-08-08T00:00:00.000Z" },
      }),
      existsSync, readFileSync,
    };
    const found = observeLocalTrustAnchorPointer(liveFs);
    assert.equal(found.status, "found");
    assert.equal(found.anchor.publicKeySha256, publicKeySha256);
    assert.equal(JSON.parse(freshCriticalHumanProofPolicyBytes(liveFs)).trustAnchors[0].publicKeySha256, publicKeySha256);
  } finally {
    rmSync(liveDirectory, { recursive: true, force: true });
  }
});

// NVA-V6-ANCHORREPORT (backlog: 2026-08-28-a-dead-key-directory-pointer-is-
// permanent-and-silent.md, Direction #1): the two dead-pointer statuses
// `observeLocalTrustAnchorPointer()` already distinguishes ("broken-pointer",
// "malformed-policy") must each raise their OWN ask through the real
// apply-portable-seed CLI flow -- not just be typed correctly in isolation
// (the test above), but actually reach `trustAnchorGuidanceAction` instead of
// being swallowed by the `anchor === null` branch a genuine no-key machine
// also takes.
//
// Part (c) below originally pinned "no-directory raises no ask at all" --
// NVA-V17-NOKEYASK (backlog: 2026-08-28-onboarding-must-bootstrap-the-trust-
// anchor-once.md) deliberately supersedes exactly that: a genuine no-key
// machine now raises its OWN distinct, informational ask too (see the
// dedicated NVA-V17-NOKEYASK test below for the full assertion set on that
// ask's shape and its "no-plane" sibling). Part (c) here is updated to match
// -- the two dead-pointer asks (a)/(b) above are untouched by this dispatch.
test("NVA-V6-ANCHORREPORT: a broken pointer and a malformed policy each raise their own distinct, informational ask; a genuine no-key machine now raises its own distinct ask too (NVA-V17-NOKEYASK)", () => {
  const brokenRoot = root();
  const malformedRoot = root();
  const noDirRoot = root();
  const brokenKeyDir = mkdtempSync(join(tmpdir(), "nva-v6-anchorreport-broken-"));
  rmSync(brokenKeyDir, { recursive: true, force: true }); // recorded, but vanished -- broken-pointer
  const malformedKeyDir = mkdtempSync(join(tmpdir(), "nva-v6-anchorreport-malformed-"));
  writeFileSync(join(malformedKeyDir, "trust-policy.json"), `${JSON.stringify({ notAKeyReference: true }, null, 2)}\n`);
  const invoke = (args, deps) => {
    let output = "";
    const code = onboardingCli(args, { deps, write: (chunk) => { output += chunk; } });
    return { code, result: JSON.parse(output) };
  };
  const depsWithKeyDir = (poKeyDirectory) => ({
    ...fakeDeps,
    readMachinePlane() {
      return {
        status: "valid",
        plane: {
          schema: "pipeline.machine-plane.v1", poKeyDirectory, pushApprovalDefault: "signature",
          routing: null, language: null, session: null, usage: null, updatedAt: "2026-08-08T00:00:00.000Z",
        },
      };
    },
  });
  const applyFresh = (rootDir, deps) => {
    const planned = invoke(["plan", "--root", rootDir, "--runner", "codex"], deps);
    const digest = planned.result.nextAction.argv[planned.result.nextAction.argv.indexOf("--plan-sha256") + 1];
    return invoke(["apply-portable-seed", "--root", rootDir, "--plan-sha256", digest, "--activate", "--runner", "codex"], deps);
  };
  try {
    // (a) broken-pointer: the directory is recorded but does not resolve.
    const broken = applyFresh(brokenRoot, depsWithKeyDir(brokenKeyDir));
    assert.equal(broken.code, 0);
    const brokenAction = broken.result.trustAnchorGuidanceAction;
    assert.equal(brokenAction.kind, "collect-input");
    assert.equal(brokenAction.mutation, false);
    assert.equal(Object.prototype.hasOwnProperty.call(brokenAction, "executable"), false,
      "informational only -- nothing agent-runnable to repair the pointer");
    assert.equal(Object.prototype.hasOwnProperty.call(brokenAction, "argv"), false,
      "informational only -- nothing agent-runnable to repair the pointer");
    assert.equal(brokenAction.guidance.includes(brokenKeyDir), true, "must name the recorded directory");
    assert.match(brokenAction.guidance, /no readable trust-policy\.json resolves there/u);
    assert.match(brokenAction.guidance, /PO repairs it themselves|repair it themselves/u);

    // (b) malformed-policy: the directory resolves and the file parses, but
    // its shape is invalid -- a DIFFERENT repair from (a), and the message
    // must say so distinctly rather than merging the two.
    const malformed = applyFresh(malformedRoot, depsWithKeyDir(malformedKeyDir));
    assert.equal(malformed.code, 0);
    const malformedAction = malformed.result.trustAnchorGuidanceAction;
    assert.equal(malformedAction.kind, "collect-input");
    assert.equal(malformedAction.mutation, false);
    assert.equal(Object.prototype.hasOwnProperty.call(malformedAction, "executable"), false,
      "informational only -- nothing agent-runnable to repair the policy");
    assert.equal(Object.prototype.hasOwnProperty.call(malformedAction, "argv"), false,
      "informational only -- nothing agent-runnable to repair the policy");
    assert.equal(malformedAction.guidance.includes(malformedKeyDir), true, "must name the recorded directory");
    assert.match(malformedAction.guidance, /do not parse into a valid trust anchor|malformed/u);

    // The two asks must not read as the same message, and must not share
    // their `collect-input` field name either.
    assert.notEqual(brokenAction.guidance, malformedAction.guidance,
      "a missing file and a broken file are different repairs and must not be merged into one message");
    assert.notEqual(brokenAction.input.name, malformedAction.input.name);

    // (c) no-directory: the genuine no-key case (pinned at the ASK level,
    // where the original bug actually lived -- observeLocalTrustAnchorPointer
    // was already typed correctly, this is the caller that used to collapse
    // it back into silence). NVA-V17-NOKEYASK: now raises its own distinct
    // ask, never the same message/input.name as (a)'s broken-pointer or
    // (b)'s malformed-policy ask above.
    const noDir = applyFresh(noDirRoot, depsWithKeyDir(null));
    assert.equal(noDir.code, 0);
    const noDirAction = noDir.result.trustAnchorGuidanceAction;
    assert.equal(noDirAction.kind, "collect-input");
    assert.equal(noDirAction.mutation, false);
    assert.equal(Object.prototype.hasOwnProperty.call(noDirAction, "executable"), false,
      "informational only -- nothing agent-runnable to create a key");
    assert.equal(Object.prototype.hasOwnProperty.call(noDirAction, "argv"), false,
      "informational only -- nothing agent-runnable to create a key");
    assert.match(noDirAction.guidance, /no recorded PO signing key/u);
    assert.equal(noDirAction.applyAction.kind, "command");
    const noDirNames = noDirAction.inputs.map((input) => input.name);
    assert.equal(noDirNames.includes(brokenAction.input.name), false);
    assert.equal(noDirNames.includes(malformedAction.input.name), false);
    assert.notEqual(noDirAction.guidance, brokenAction.guidance);
    assert.notEqual(noDirAction.guidance, malformedAction.guidance);
  } finally {
    dispose(brokenRoot); dispose(malformedRoot); dispose(noDirRoot);
    rmSync(malformedKeyDir, { recursive: true, force: true });
  }
});

// NVA-V17-NOKEYASK (backlog: 2026-08-28-onboarding-must-bootstrap-the-trust-
// anchor-once.md and 2026-08-28-a-v1-trust-anchor-makes-the-signature-push-
// route-functionless.md): a machine with no PO signing key at all -- neither
// status `observeLocalTrustAnchorPointer()` reports for a genuine absence
// ("no-plane": no valid machine plane; "no-directory": a valid plane with no
// poKeyDirectory recorded) -- used to reach `ready` having been told nothing
// about it: `freshCriticalHumanProofPolicyBytes` seeds a bare v1 policy with
// no trust anchor, `pushGateSatisfiable` stays false, and no ask fires. This
// closes that silence with one new informational ask, reachable on BOTH
// statuses and on both the apply-portable-seed and the ordinary inspect
// composition path.
test("NVA-V17-NOKEYASK: a machine with no PO signing key gets one structured public-driver bootstrap action on both absence states and composition paths", () => {
  const noPlaneRoot = root();
  const noDirRoot = root();
  const readyRoot = root();
  const invoke = (args, deps) => {
    let output = "";
    const code = onboardingCli(args, { deps, write: (chunk) => { output += chunk; } });
    return { code, result: JSON.parse(output) };
  };
  const applyFresh = (rootDir, deps) => {
    const planned = invoke(["plan", "--root", rootDir, "--runner", "codex"], deps);
    const digest = planned.result.nextAction.argv[planned.result.nextAction.argv.indexOf("--plan-sha256") + 1];
    return invoke(["apply-portable-seed", "--root", rootDir, "--plan-sha256", digest, "--activate", "--runner", "codex"], deps);
  };
  const noPlaneDeps = { ...fakeDeps, readMachinePlane() { return { status: "absent", plane: null }; } };
  try {
    // (a) no-plane: no valid machine plane at all.
    const noPlane = applyFresh(noPlaneRoot, noPlaneDeps);
    assert.equal(noPlane.code, 0);
    const noPlaneAction = noPlane.result.trustAnchorGuidanceAction;
    assert.ok(noPlaneAction, "a no-plane machine must raise the guided setup ask");
    assert.equal(noPlaneAction.kind, "collect-input");
    assert.equal(noPlaneAction.mutation, false, "collecting answers itself does not mutate");
    assert.deepEqual(noPlaneAction.inputs.map((input) => input.name), [
      "trustAnchorSetupMode", "trustAnchorDirectory", "trustAnchorHumanName", "trustAnchorExistingKeyPath",
    ]);
    assert.equal(noPlaneAction.applyAction.kind, "command");
    assert.equal(noPlaneAction.applyAction.requiresConfirmation, true,
      "the attended setup action cannot execute before the PO confirms its four answers");
    assert.equal(noPlaneAction.applyAction.expected.schema, "pipeline.onboarding-init.v1");
    assert.match(noPlaneAction.applyAction.argv[0], /onboarding-init\.mjs$/u);
    assert.equal(noPlaneAction.applyAction.argv.includes("po-human-approval.mjs"), false);
    assert.equal(noPlaneAction.applyAction.argv[noPlaneAction.applyAction.argv.indexOf("--root") + 1], noPlaneRoot);
    assert.equal(noPlaneAction.applyAction.argv[noPlaneAction.applyAction.argv.indexOf("--runner") + 1], "codex");
    for (const flag of ["--trust-anchor-mode", "--trust-anchor-directory", "--trust-anchor-human-name", "--trust-anchor-existing-key"]) {
      assert.ok(noPlaneAction.applyAction.argv.includes(flag), `${flag} is carried by the one bounded action`);
    }
    assert.doesNotMatch(noPlaneAction.guidance, /THEMSELVES|outside this session/u);
    assert.match(noPlaneAction.guidance, /existing.*new|new.*existing/u);

    // (b) no-directory: a valid plane, but no poKeyDirectory recorded --
    // fakeDeps's own default shape. The same "genuine absence" message, not
    // a distinct one per status: there is nothing status-specific to say.
    const noDir = applyFresh(noDirRoot, fakeDeps);
    assert.equal(noDir.code, 0);
    const noDirAction = noDir.result.trustAnchorGuidanceAction;
    assert.ok(noDirAction, "a no-directory machine must raise the new informational ask");
    assert.deepEqual(
      { ...noDirAction, applyAction: { ...noDirAction.applyAction, argv: noDirAction.applyAction.argv.map((value) => value === noDirRoot ? noPlaneRoot : value) } },
      noPlaneAction,
      "no-plane and no-directory differ only by the repository path bound into applyAction",
    );

    // Distinguishable from the two dead-pointer asks (own input.name).
    assert.equal(noDirAction.inputs.some((input) => input.name === "trustAnchorPointerRepairAcknowledged"), false);
    assert.equal(noDirAction.inputs.some((input) => input.name === "trustAnchorPolicyRepairAcknowledged"), false);

    // The ask reaches the ORDINARY inspect path too (NVA-V13-ASKWINDOW's
    // nextAction.pendingAsks channel), not only apply-portable-seed --
    // the path a re-entrant session actually uses, broken until cceafb06.
    const inspected = invoke(["inspect", "--root", noDirRoot, "--runner", "codex"], fakeDeps);
    assert.equal(inspected.code, 0);
    assert.equal(inspected.result.status, noDir.result.status);
    const pendingNames = (inspected.result.nextAction?.pendingAsks ?? []).flatMap((ask) => (ask.inputs ?? [ask.input]).map((input) => input?.name));
    assert.ok(pendingNames.includes("trustAnchorSetupMode"),
      "an ordinary inspect must surface the same no-key ask apply-portable-seed already published");
    const pendingAsk = inspected.result.nextAction.pendingAsks.find((ask) => ask.inputs?.some((input) => input.name === "trustAnchorSetupMode"));
    assert.equal(pendingAsk.mutation, false);
    assert.equal(pendingAsk.applyAction.kind, "command");

    // The `ready` status is unaffected -- checked against the REAL,
    // unliftable, fail-closed ready gate, not a hand-typed shape assumption.
    // fakeDeps's own default machine plane (poKeyDirectory: null) is exactly
    // the "no-directory" case this dispatch adds an ask for, so this also
    // proves a project with no signing key still reaches "ready" and exposes
    // only the closed inspect handoff for its draft feature.
    const barrier = initializeRestartRequiredRoot(readyRoot);
    clearRuntimeBarrier(readyRoot, barrier);
    completeKickoff(readyRoot);
    const readyObserved = inspectProjectOnboardingV3({ rootDir: readyRoot, intent: "onboarding", runner: "codex", deps: fakeDeps });
    assert.equal(readyObserved.status, "ready");
    assertPlanLifecycleInspectAction(readyObserved.nextAction);
    const readyReceipt = requireProjectOnboardingReady({
      rootDir: readyRoot,
      intent: "onboarding",
      runner: "codex",
      inspect: ({ rootDir: r, intent: i, runner: rn }) => inspectProjectOnboardingV3({ rootDir: r, intent: i, runner: rn, deps: fakeDeps }),
    });
    assert.equal(readyReceipt.status, "ready");
    assert.equal(readyReceipt.schema, "pipeline.project-onboarding-ready-gate.v1");

    // freshCriticalHumanProofPolicyBytes must keep seeding exactly the bare
    // v1 fallback for the genuine no-key case -- this dispatch adds a
    // message, it does not change what is seeded (pinned already by
    // NVA-V1-KEYDIRPTR; re-asserted here at this test's own fixtures too).
    assert.equal(JSON.parse(freshCriticalHumanProofPolicyBytes(noPlaneDeps)).schema, "pipeline.critical-human-proof-policy.v1");
    assert.equal(JSON.parse(freshCriticalHumanProofPolicyBytes(fakeDeps)).schema, "pipeline.critical-human-proof-policy.v1");
  } finally {
    dispose(noPlaneRoot); dispose(noDirRoot); dispose(readyRoot);
  }
});

// NVA-R24-TRUSTANCHOR (backlog: 2026-08-28-onboarding-must-bootstrap-the-trust-
// anchor-once.md): `trustAnchorAvailability` (READY_ONLY_RESULT_FIELD_BUILDERS
// above) is shape-pinned in project-onboarding-ready-gate.test.mjs, but its
// REAL computed value -- for a genuine fresh onboarding, not a hand-typed
// fixture -- was never exercised on either branch. This is the acceptance
// criterion itself: "a fresh repository ends init with either a working
// anchor or a recorded, reported absence".
test("NVA-R24-TRUSTANCHOR: trustAnchorAvailability reports the real absent/present state at the ready gate", () => {
  const noKeyRoot = root();
  const keyedRoot = root();
  const keyDir = root();
  try {
    // (a) absence branch: fakeDeps' own default machine plane has no
    // poKeyDirectory recorded -- the genuine no-key case.
    const noKeyBarrier = initializeRestartRequiredRoot(noKeyRoot);
    clearRuntimeBarrier(noKeyRoot, noKeyBarrier);
    completeKickoff(noKeyRoot);
    const absentObserved = inspectProjectOnboardingV3({ rootDir: noKeyRoot, intent: "onboarding", runner: "codex", deps: fakeDeps });
    assert.equal(absentObserved.status, "ready");
    assert.equal(absentObserved.trustAnchorAvailability, "absent");

    // (b) working-anchor branch: a machine that already holds a signing key.
    const publicKeySha256 = "c".repeat(64);
    writeFileSync(join(keyDir, "trust-policy.json"), `${JSON.stringify({ keyReference: "po-key-ready", publicKeySha256, humanName: "Ready Test" }, null, 2)}\n`);
    const machineHasKey = { ...fakeDeps, readMachinePlane() {
      return {
        status: "valid",
        plane: {
          schema: "pipeline.machine-plane.v1", poKeyDirectory: keyDir, pushApprovalDefault: "signature",
          routing: null, language: null, session: null, usage: null, updatedAt: "2026-08-08T00:00:00.000Z",
        },
      };
    } };
    const keyedBarrier = initializeRestartRequiredRoot(keyedRoot, machineHasKey);
    clearRuntimeBarrier(keyedRoot, keyedBarrier);
    completeKickoff(keyedRoot, "Build a safe project", machineHasKey);
    const presentObserved = inspectProjectOnboardingV3({ rootDir: keyedRoot, intent: "onboarding", runner: "codex", deps: machineHasKey });
    assert.equal(presentObserved.status, "ready");
    assert.equal(presentObserved.trustAnchorAvailability, "present");
  } finally {
    dispose(noKeyRoot); dispose(keyedRoot); dispose(keyDir);
  }
});

// NVA-R24-TRUSTANCHOR (backlog: 2026-08-28-onboarding-must-bootstrap-the-trust-
// anchor-once.md, Direction #1): "an existing key directory is detected and
// reused when present -- never silently overwritten". Every write site for
// `project/critical-human-proof.json` is create-only, so nothing in this
// codebase currently has a write path to `poKeyDirectory` at all -- this test
// pins that as an explicit, observable fact (byte-for-byte, full directory
// listing) rather than leaving it as an absence of a code path nobody
// measured.
test("NVA-R24-TRUSTANCHOR: a pre-existing key directory is reused byte-for-byte, never written to, by the onboarding transaction", () => {
  const keyedRoot = root();
  const keyDir = root();
  try {
    const publicKeySha256 = "d".repeat(64);
    const trustPolicyPath = join(keyDir, "trust-policy.json");
    const originalBytes = `${JSON.stringify({ keyReference: "po-key-byteforbyte", publicKeySha256, humanName: "Byte Test" }, null, 2)}\n`;
    writeFileSync(trustPolicyPath, originalBytes);
    const entriesBefore = readdirSync(keyDir).sort();

    const machineHasKey = { ...fakeDeps, readMachinePlane() {
      return {
        status: "valid",
        plane: {
          schema: "pipeline.machine-plane.v1", poKeyDirectory: keyDir, pushApprovalDefault: "signature",
          routing: null, language: null, session: null, usage: null, updatedAt: "2026-08-08T00:00:00.000Z",
        },
      };
    } };
    const barrier = initializeRestartRequiredRoot(keyedRoot, machineHasKey);
    clearRuntimeBarrier(keyedRoot, barrier);
    completeKickoff(keyedRoot, "Build a safe project", machineHasKey);
    const observed = inspectProjectOnboardingV3({ rootDir: keyedRoot, intent: "onboarding", runner: "codex", deps: machineHasKey });
    assert.equal(observed.status, "ready");
    assert.equal(observed.trustAnchorAvailability, "present",
      "the key directory must actually have been read and reused, not merely left untouched by accident");

    assert.deepEqual(readdirSync(keyDir).sort(), entriesBefore,
      "onboarding must never create or remove any file inside the reused key directory");
    assert.equal(readFileSync(trustPolicyPath, "utf8"), originalBytes,
      "onboarding must never modify the reused key directory's own trust-policy.json bytes");
  } finally {
    dispose(keyedRoot); dispose(keyDir);
  }
});

// NVA-R24-TRUSTANCHOR (backlog: 2026-08-28-onboarding-must-bootstrap-the-trust-
// anchor-once.md, acceptance criterion 3 / DoD check 5): closely simulates the
// exact circularity the item's "What happened" section describes -- the first
// human-override ceremony discovering the anchor's absence as
// HGO-TRUST-ANCHOR-MISSING (human-guard-override.mjs:3157-3168) only because
// `setup` never ran. `authorizeHumanGuardOverrideBySignature()` resolves its
// trust anchors through readCriticalHumanProofPolicy(rootDir) exactly as
// exercised here (human-guard-override.mjs's own resolution branch: a
// non-`ok` policy or an empty/absent `trustAnchors` set both fall straight
// through to that fail); a full signed ceremony additionally needs a real
// Ed25519 proof this test does not fabricate, so this pins the one precondition
// that previously made the ceremony unreachable regardless of proof validity.
//
// This is also the regression pin for the shape defect this dispatch found
// live (scratch/probe-trust-anchor-shape.mjs): the materialized v3 document
// omitted `waivedKinds`, which critical-human-proof-policy.mjs's own
// exactKeys() shape check requires on every v2/v3 document -- so the seeded
// anchor was rejected by its own consumer as CRITICAL-PROOF-POLICY-INVALID,
// reproducing the exact deadlock this function exists to prevent.
test("NVA-R24-TRUSTANCHOR: a freshly bootstrapped anchor is actually accepted by the same resolution the signed override ceremony uses -- no HGO-TRUST-ANCHOR-MISSING deadlock", () => {
  const keyedRoot = root();
  const keyDir = root();
  try {
    const publicKeySha256 = "e".repeat(64);
    writeFileSync(join(keyDir, "trust-policy.json"), `${JSON.stringify({ keyReference: "po-key-hgo", publicKeySha256, humanName: "HGO Test" }, null, 2)}\n`);
    const machineHasKey = { ...fakeDeps, readMachinePlane() {
      return {
        status: "valid",
        plane: {
          schema: "pipeline.machine-plane.v1", poKeyDirectory: keyDir, pushApprovalDefault: "signature",
          routing: null, language: null, session: null, usage: null, updatedAt: "2026-08-08T00:00:00.000Z",
        },
      };
    } };
    const barrier = initializeRestartRequiredRoot(keyedRoot, machineHasKey);
    clearRuntimeBarrier(keyedRoot, barrier);
    completeKickoff(keyedRoot, "Build a safe project", machineHasKey);

    // The exact same read authorizeHumanGuardOverrideBySignature() performs
    // before it would otherwise fail("HGO-TRUST-ANCHOR-MISSING", ...).
    const policy = readCriticalHumanProofPolicy(keyedRoot);
    assert.equal(policy.ok, true, "the seeded policy document must parse as valid, never CRITICAL-PROOF-POLICY-INVALID");
    assert.equal(Array.isArray(policy.trustAnchors) && policy.trustAnchors.length > 0, true,
      "a non-empty resolved trustAnchors set is exactly what keeps authorizeHumanGuardOverrideBySignature() out of the HGO-TRUST-ANCHOR-MISSING branch");
    assert.equal(policy.trustAnchors[0].publicKeySha256, publicKeySha256);
  } finally {
    dispose(keyedRoot); dispose(keyDir);
  }
});

test("shared command renderer derives one copy-safe line from exact argv in a spaced root", () => {
  const path = root();
  try {
    const action = {
      kind: "command",
      executable: "node",
      argv: [
        ONBOARDING_SCRIPT,
        "kickoff",
        "plan",
        "--root",
        path,
        "--goal",
        "Ship safely; keep $(touch nope) as inert text",
      ],
      mutation: false,
      requiresConfirmation: false,
      expected: {
        schema: "pipeline.project-onboarding.v4",
        statuses: ["kickoff-required"],
      },
    };
    assert.equal(renderProjectOnboardingAction(action), [
      "node",
      ONBOARDING_SCRIPT,
      "kickoff",
      "plan",
      "--root",
      `'${path}'`,
      "--goal",
      "'Ship safely; keep $(touch nope) as inert text'",
    ].join(" "));
    assert.equal(renderProjectOnboardingAction({
      ...action,
      argv: [ONBOARDING_SCRIPT, "--goal", "owner's goal"],
    }), `node ${ONBOARDING_SCRIPT} --goal 'owner'\"'\"'s goal'`);
    const multiline = renderProjectOnboardingAction({
      ...action,
      argv: [ONBOARDING_SCRIPT, "--goal", "line one\nline two"],
    });
    assert.equal(multiline, `node ${ONBOARDING_SCRIPT} --goal $'line one\\nline two'`);
    assert.equal(/[\r\n]/u.test(multiline), false);
    assert.equal(existsSync(join(path, "nope")), false);
  } finally { dispose(path); }
});

test("matrix source/runtime progress actions are exact, diagnostic-bound, and copy-safe", () => {
  const empty = root(); const existing = root(); const legacy = root(); const runtime = root();
  const action = (argv, statuses, schema = "pipeline.project-onboarding.v4") => ({
    kind: "command",
    executable: "node",
    argv,
    mutation: false,
    requiresConfirmation: false,
    expected: { schema, statuses },
  });
  try {
    const portable = inspectProjectOnboardingV3({ runner: "codex", rootDir: empty, deps: fakeDeps });
    assert.equal(portable.status, "portable-seed-required");
    assert.equal(portable.repository.status, "local-uninitialized");
    assertDiagnostic(portable, "portable_seed_missing");
    assertSingleLineAction(portable.nextAction, action(
      [ONBOARDING_SCRIPT, "plan", "--root", empty, "--runner", "codex"],
      ["portable-seed-required"],
    ));

    mkdirSync(join(existing, ".git", "objects"), { recursive: true });
    writeFileSync(join(existing, ".git", "HEAD"), "ref: refs/heads/main\n");
    writeFileSync(join(existing, "README.md"), "existing local Git project\n");
    const adoption = inspectProjectOnboardingV3({ runner: "codex", rootDir: existing, deps: fakeDeps });
    assert.equal(adoption.status, "adoption-required");
    assert.equal(adoption.repository.status, "local-valid-writable");
    assertDiagnostic(adoption, "adoption_required");
    assertSingleLineAction(adoption.nextAction, action(
      [ONBOARDING_SCRIPT, "plan", "--root", existing, "--runner", "codex"],
      ["adoption-required"],
    ));

    writeFileSync(join(legacy, "pipeline.user.yaml"), yaml(v0Source()));
    const migration = inspectProjectOnboardingV3({ runner: "codex", rootDir: legacy, deps: fakeDeps });
    assert.equal(migration.status, "migration-required");
    assertDiagnostic(migration, "migration_required");
    assertSingleLineAction(migration.nextAction, action(
      [MIGRATION_SCRIPT, "inspect", "--root", legacy],
      ["ready", "invalid-root", "recovery-required", "invalid-source"],
      "pipeline.runner-profile-migration-inspect.v3",
    ));

    const portablePlan = planProjectOnboardingV3({ runner: "codex", rootDir: runtime, deps: fakeDeps });
    assert.equal(applyProjectOnboardingV3(portablePlan, {
      rootDir: runtime,
      activate: true,
      deps: fakeDeps,
    }).status, "applied");
    const missing = inspectProjectOnboardingV3({ runner: "codex", rootDir: runtime, deps: fakeDeps });
    assert.equal(missing.status, "runtime-initialization-required");
    assert.equal(missing.runtime.status, "missing");
    assertDiagnostic(missing, "runtime_missing");
    // NVA-V13-ASKWINDOW: "runtime-initialization-required" is one of the
    // statuses an ordinary inspect now surfaces pending asks for (this
    // dispatch's own fix) -- the primary chained command below stays
    // byte-exact unchanged, but this still-unconfigured fixture's envelope
    // additionally carries nextAction.pendingAsks. The exact per-ask content
    // is pinned by the dedicated ask-step tests elsewhere in this file; this
    // assertion proves the primary command fields stay exact and the
    // pendingAsks channel is present, non-empty, and free of duplicates.
    const { pendingAsks, ...primaryNextAction } = missing.nextAction;
    assert.deepEqual(primaryNextAction, action(
      [ONBOARDING_SCRIPT, "plan-runtime", "--root", runtime, "--runner", "codex"],
      ["runtime-initialization-required"],
    ));
    assert.ok(Array.isArray(pendingAsks) && pendingAsks.length > 0,
      "a still-unconfigured fixture must carry at least one pending ask here");
    const askNames = pendingAsks.map((ask) => ask.input?.name ?? (ask.inputs ?? []).map((entry) => entry.name).join(","));
    assert.equal(new Set(askNames).size, askNames.length, "pendingAsks must carry no duplicate entries");
    const rendered = renderProjectOnboardingAction(missing.nextAction);
    assert.equal(typeof rendered, "string");
    assert.equal(rendered.includes("\n"), false);
    assert.ok(rendered.length > 0);
  } finally {
    dispose(empty); dispose(existing); dispose(legacy); dispose(runtime);
  }
});

test("every lifecycle plan exposes the exact digest-bound apply status contract and rendering", () => {
  const portableRoot = root(); const runtimeRoot = root();
  const applyAction = (argv, statuses) => ({
    kind: "command",
    executable: "node",
    argv,
    mutation: true,
    requiresConfirmation: true,
    expected: {
      schema: "pipeline.project-onboarding.v4",
      statuses,
    },
  });
  try {
    const portable = planProjectOnboardingLifecycleV4({ runner: "codex",
      rootDir: portableRoot,
      deps: fakeDeps,
      operation: "portable",
    });
    const portableDigest = portable.nextAction.argv[portable.nextAction.argv.indexOf("--plan-sha256") + 1];
    assert.match(assertSingleLineAction(portable.nextAction, applyAction(
      [ONBOARDING_SCRIPT, "apply-portable-seed", "--root", portableRoot, "--plan-sha256", portableDigest, "--activate", "--runner", "codex"],
      ["runtime-initialization-required", "restart-required", "kickoff-required", "intake-required", "intake-design-questions-required", "bootstrap-binding-required"],
    )), /'[^']*with spaces[^']*'/u);

    const seed = planProjectOnboardingV3({ runner: "codex", rootDir: runtimeRoot, deps: fakeDeps });
    assert.equal(applyProjectOnboardingV3(seed, {
      rootDir: runtimeRoot,
      activate: true,
      deps: fakeDeps,
    }).status, "applied");
    const runtime = planProjectOnboardingLifecycleV4({ runner: "codex",
      rootDir: runtimeRoot,
      deps: fakeDeps,
      operation: "runtime",
    });
    const runtimeDigest = runtime.nextAction.argv[runtime.nextAction.argv.indexOf("--plan-sha256") + 1];
    assertSingleLineAction(runtime.nextAction, applyAction(
      [ONBOARDING_SCRIPT, "initialize-runtime", "--root", runtimeRoot, "--plan-sha256", runtimeDigest, "--activate", "--runner", "codex"],
      ["restart-required"],
    ));
    assert.equal(applyProjectOnboardingLifecycleV4({ runner: "codex",
      rootDir: runtimeRoot,
      deps: fakeDeps,
      operation: "runtime",
      planSha256: runtimeDigest,
      activate: true,
    }).status, "restart-required");

    const implementor = join(runtimeRoot, ".codex", "agents", "implementor.toml");
    writeFileSync(implementor, readFileSync(implementor, "utf8").replace(/^model = ".*"$/mu, 'model = "repair-contract-drift"'));
    const repair = planProjectOnboardingLifecycleV4({ runner: "codex",
      rootDir: runtimeRoot,
      deps: fakeDeps,
      operation: "repair",
    });
    const repairDigest = repair.nextAction.argv[repair.nextAction.argv.indexOf("--plan-sha256") + 1];
    assertSingleLineAction(repair.nextAction, applyAction(
      [ONBOARDING_SCRIPT, "apply-repair", "--root", runtimeRoot, "--plan-sha256", repairDigest, "--activate", "--runner", "codex"],
      ["restart-required", "kickoff-required", "intake-required", "intake-design-questions-required", "bootstrap-binding-required", "ready"],
    ));
  } finally {
    dispose(portableRoot); dispose(runtimeRoot);
  }
});

test("a projection-current upgraded repository must establish a barrier before native readiness", () => {
  const path = root();
  try {
    const oldBarrier = initializeRestartRequiredRoot(path);
    removeRestartBarrierCas({
      rootDir: path,
      expectedRawSha256: oldBarrier.rawSha256,
      spawn: fakeGit,
    });
    assert.equal(validateV3BootstrapAuthority({ rootDir: path, deps: fakeDeps }).status, "projection-current");

    const observed = inspectProjectOnboardingV3({ runner: "codex", rootDir: path, deps: fakeDeps });
    assert.equal(observed.status, "runtime-attestation-required");
    assert.equal(observed.runtime.status, "projection-current");
    assertDiagnostic(observed, "restart_required");
    assert.deepEqual(observed.nextAction.argv, [ONBOARDING_SCRIPT, "plan-readback", "--root", path, "--runner", "codex"]);

    const planned = planProjectOnboardingLifecycleV4({ runner: "codex",
      rootDir: path,
      deps: fakeDeps,
      operation: "readback",
    });
    const digest = planned.nextAction.argv[planned.nextAction.argv.indexOf("--plan-sha256") + 1];
    assert.deepEqual(planned.nextAction.argv, [
      ONBOARDING_SCRIPT,
      "apply-readback",
      "--root",
      path,
      "--plan-sha256",
      digest,
      "--activate",
      "--runner",
      "codex",
    ]);
    const beforeRuntime = treeSnapshot(join(path, ".codex"));
    const applied = applyProjectOnboardingLifecycleV4({ runner: "codex",
      rootDir: path,
      deps: fakeDeps,
      operation: "readback",
      planSha256: digest,
      activate: true,
    });
    assert.equal(applied.status, "restart-required");
    assert.equal(applied.runtime.status, "restart-required");
    assert.deepEqual(treeSnapshot(join(path, ".codex")), beforeRuntime);
    assert.equal(validateV3BootstrapAuthority({ rootDir: path, deps: fakeDeps }).status, "restart-required");
  } finally {
    dispose(path);
  }
});

test("a stale pending restart binding yields a replaceable readback plan", () => {
  const path = root();
  try {
    const stale = initializeRestartRequiredRoot(path);
    const legacyBarrier = {
      ...stale.barrier,
      launcherSha256: "f".repeat(64),
    };
    delete legacyBarrier.codexExecutablePath;
    writeFileSync(stale.paths.barrier, canonicalJson(legacyBarrier));

    const observed = inspectProjectOnboardingV3({ runner: "codex", rootDir: path, deps: fakeDeps });
    assert.equal(observed.status, "runtime-attestation-required");
    assert.equal(observed.runtime.status, "projection-current");
    assertDiagnostic(observed, "restart_binding_drift");
    assert.deepEqual(observed.nextAction.argv, [
      ONBOARDING_SCRIPT,
      "plan-readback",
      "--root",
      path,
      "--runner",
      "codex",
    ]);

    const planned = planProjectOnboardingLifecycleV4({ runner: "codex",
      rootDir: path,
      deps: fakeDeps,
      operation: "readback",
    });
    const digest = planned.nextAction.argv[planned.nextAction.argv.indexOf("--plan-sha256") + 1];
    const applied = applyProjectOnboardingLifecycleV4({ runner: "codex",
      rootDir: path,
      deps: fakeDeps,
      operation: "readback",
      planSha256: digest,
      activate: true,
    });
    assert.equal(applied.status, "restart-required");
    const rebound = readRestartBarrier({ rootDir: path, spawn: fakeGit });
    assert.notEqual(rebound.rawSha256, stale.rawSha256);
    assert.notEqual(rebound.barrier.launcherSha256, "f".repeat(64));
    assert.equal(rebound.barrier.codexExecutablePath, stale.barrier.codexExecutablePath);
  } finally {
    dispose(path);
  }
});

test("runtime target preflight maps every reversible probe permission failure without residue", () => {
  for (const code of ["EACCES", "EPERM", "EROFS"]) {
    for (const stage of ["create", "fstat", "write", "file-fsync", "close", "rename", "directory-fsync"]) {
      const path = root();
      try {
        const seed = planProjectOnboardingV3({ runner: "codex", rootDir: path, deps: fakeDeps });
        assert.equal(applyProjectOnboardingV3(seed, {
          rootDir: path,
          activate: true,
          deps: fakeDeps,
        }).status, "applied");
        const before = treeSnapshot(path);
        const observed = inspectProjectOnboardingV3({ runner: "codex",
          rootDir: path,
          deps: runtimeProbeFailureDeps(stage, code),
        });
        assert.equal(observed.status, "runtime-target-read-only", `${code}/${stage}`);
        assert.deepEqual(observed.runtime, {
          status: "target-read-only",
          sourceSha256: null,
          targetsSha256: null,
          barrierSha256: null,
          readbackSha256: null,
        }, `${code}/${stage}`);
        assertDiagnostic(observed, "runtime_target_read_only");
        assert.equal(observed.nextAction, null);
        assert.equal(JSON.stringify(observed).includes("synthetic runtime target"), false);
        assert.deepEqual(treeSnapshot(path), before, `${code}/${stage}`);
        assert.equal(Object.keys(treeSnapshot(path)).some((entry) => entry.includes(".pipeline-runtime-capability-")), false);
      } finally { dispose(path); }
    }
  }
});

test("a symlinked runtime target parent fails closed without touching its destination", () => {
  const path = root(); const outside = root();
  try {
    const seed = planProjectOnboardingV3({ runner: "codex", rootDir: path, deps: fakeDeps });
    assert.equal(applyProjectOnboardingV3(seed, {
      rootDir: path,
      activate: true,
      deps: fakeDeps,
    }).status, "applied");
    mkdirSync(join(path, ".codex"));
    symlinkSync(outside, join(path, ".codex", "agents"), "dir");
    const projectBefore = treeSnapshot(path);
    const outsideBefore = treeSnapshot(outside);
    const observed = inspectProjectOnboardingV3({ runner: "codex", rootDir: path, deps: fakeDeps });
    assert.equal(observed.status, "runtime-target-read-only", JSON.stringify(observed));
    assertDiagnostic(observed, "runtime_target_read_only");
    assert.equal(observed.nextAction, null);
    assert.deepEqual(treeSnapshot(path), projectBefore);
    assert.deepEqual(treeSnapshot(outside), outsideBefore);
  } finally {
    dispose(path); dispose(outside);
  }
});

test("portable and runtime apply replays are zero-write with identical canonical responses", () => {
  const portableRoot = root(); const runtimeRoot = root();
  try {
    const portablePlan = planProjectOnboardingLifecycleV4({ runner: "codex",
      rootDir: portableRoot,
      deps: fakeDeps,
      operation: "portable",
    });
    const portableDigest = portablePlan.nextAction.argv[portablePlan.nextAction.argv.indexOf("--plan-sha256") + 1];
    const portableApplied = applyProjectOnboardingLifecycleV4({ runner: "codex",
      rootDir: portableRoot,
      deps: fakeDeps,
      operation: "portable",
      planSha256: portableDigest,
      activate: true,
    });
    const portableBytes = treeSnapshot(portableRoot);
    const portableReplayed = applyProjectOnboardingLifecycleV4({ runner: "codex",
      rootDir: portableRoot,
      deps: fakeDeps,
      operation: "portable",
      planSha256: portableDigest,
      activate: true,
    });
    assert.deepEqual(portableReplayed, portableApplied);
    assert.deepEqual(treeSnapshot(portableRoot), portableBytes);

    const seed = planProjectOnboardingV3({ runner: "codex", rootDir: runtimeRoot, deps: fakeDeps });
    assert.equal(applyProjectOnboardingV3(seed, {
      rootDir: runtimeRoot,
      activate: true,
      deps: fakeDeps,
    }).status, "applied");
    const runtimePlan = planProjectOnboardingLifecycleV4({ runner: "codex",
      rootDir: runtimeRoot,
      deps: fakeDeps,
      operation: "runtime",
    });
    const runtimeDigest = runtimePlan.nextAction.argv[runtimePlan.nextAction.argv.indexOf("--plan-sha256") + 1];
    const runtimeApplied = applyProjectOnboardingLifecycleV4({ runner: "codex",
      rootDir: runtimeRoot,
      deps: fakeDeps,
      operation: "runtime",
      planSha256: runtimeDigest,
      activate: true,
    });
    assert.equal(runtimeApplied.status, "restart-required");
    assert.equal(runtimeApplied.runtime.status, "restart-required");
    const expectedRestart = {
      kind: "restart-process",
      requiresCurrentProcessExit: true,
      launch: {
        executable: "node",
        argv: [
          ONBOARDING_LAUNCH_SCRIPT,
          "--root",
          ".",
          "--barrier-sha256",
          runtimeApplied.runtime.barrierSha256,
          "--activate",
        ],
        executionBoundary: "external-terminal",
        invocation: "user-copy-only",
        codexToolCallPermitted: false,
        copyCommand: assertBoundedRestartCopyCommand(runtimeApplied.nextAction),
      },
      mutation: true,
      requiresConfirmation: true,
      expectedStatuses: runtimeApplied.nextAction.expectedStatuses,
    };
    assertSingleLineAction(runtimeApplied.nextAction, expectedRestart);
    const runtimeBytes = treeSnapshot(runtimeRoot);
    const runtimeReplayed = applyProjectOnboardingLifecycleV4({ runner: "codex",
      rootDir: runtimeRoot,
      deps: fakeDeps,
      operation: "runtime",
      planSha256: runtimeDigest,
      activate: true,
    });
    assert.deepEqual(runtimeReplayed, runtimeApplied);
    assert.deepEqual(treeSnapshot(runtimeRoot), runtimeBytes);
  } finally {
    dispose(portableRoot); dispose(runtimeRoot);
  }
});

test("invalid current runtime readback maps exactly and exposes no action", () => {
  const path = root();
  try {
    const barrier = initializeRestartRequiredRoot(path);
    clearRuntimeBarrier(path, barrier);
    const current = readCurrentRuntimeReadback({ rootDir: path, spawn: fakeGit });
    const marker = JSON.parse(readFileSync(current.paths.currentReadback, "utf8"));
    marker.receiptSha256 = sha256("invalid receipt");
    writeFileSync(current.paths.currentReadback, JSON.stringify(marker));
    const observed = inspectProjectOnboardingV3({ runner: "codex", rootDir: path, deps: fakeDeps });
    assert.equal(observed.status, "runtime-readback-unavailable");
    assert.deepEqual(observed.runtime, {
      status: "readback-unavailable",
      sourceSha256: null,
      targetsSha256: null,
      barrierSha256: null,
      readbackSha256: null,
    });
    assertDiagnostic(observed, "native_runtime_readback_unavailable");
    assert.equal(observed.diagnostics[0].path, "$.runtime.native-runtime-readback");
    assert.equal(observed.nextAction, null);
  } finally { dispose(path); }
});

test("runtime initialization preserves the exact executable and private-state failure phase", () => {
  for (const failure of [
    {
      code: "runtime-executable-unavailable",
      phase: "runtime-executable-resolution",
      diagnostic: "runtime_executable_unavailable",
      inject: "prepareRuntimeRestartBinding",
    },
    {
      code: "private-state-assurance-unavailable",
      phase: "private-root-assurance",
      diagnostic: "private_state_assurance_unavailable",
      inject: "persistRestartBarrier",
    },
  ]) {
    const path = root();
    try {
      const seed = planProjectOnboardingV3({ runner: "codex", rootDir: path, deps: fakeDeps });
      assert.equal(applyProjectOnboardingV3(seed, {
        rootDir: path,
        activate: true,
        deps: fakeDeps,
      }).status, "applied");
      const plan = planProjectOnboardingLifecycleV4({ runner: "codex",
        rootDir: path,
        deps: fakeDeps,
        operation: "runtime",
      });
      const digest = plan.nextAction.argv[plan.nextAction.argv.indexOf("--plan-sha256") + 1];
      const injectedDeps = {
        ...fakeDeps,
        [failure.inject]() {
          throw new CodexOnboardingRuntimeError(failure.code, failure.phase, "private fixture detail");
        },
      };
      const observed = applyProjectOnboardingLifecycleV4({ runner: "codex",
        rootDir: path,
        deps: injectedDeps,
        operation: "runtime",
        planSha256: digest,
        activate: true,
      });
      assert.equal(observed.status, "runtime-readback-unavailable");
      assert.equal(observed.nextAction, null);
      assert.equal(observed.diagnostics.length, 1);
      assert.equal(observed.diagnostics[0].code, failure.diagnostic);
      assert.equal(observed.diagnostics[0].path, `$.runtime.${failure.phase}`);
      assert.equal(JSON.stringify(observed).includes("private fixture detail"), false);
      assert.equal(existsSync(join(path, ".git", "agent-pipeline", "onboarding", "restart-barrier.json")), false);
    } finally { dispose(path); }
  }
});

test("runtime plan preimage drift preserves external bytes and maps to exact projection repair", () => {
  const path = root();
  try {
    const seed = planProjectOnboardingV3({ runner: "codex", rootDir: path, deps: fakeDeps });
    assert.equal(applyProjectOnboardingV3(seed, {
      rootDir: path,
      activate: true,
      deps: fakeDeps,
    }).status, "applied");
    const plan = planProjectOnboardingLifecycleV4({ runner: "codex",
      rootDir: path,
      deps: fakeDeps,
      operation: "runtime",
    });
    const digest = plan.nextAction.argv[plan.nextAction.argv.indexOf("--plan-sha256") + 1];
    mkdirSync(join(path, ".codex", "agents"), { recursive: true });
    const external = 'model = "external-owner"\nmodel_reasoning_effort = "low"\n';
    const driftTarget = join(path, ".codex", "agents", "implementor.toml");
    writeFileSync(driftTarget, external);
    const mixedBefore = treeSnapshot(path);
    const mixed = inspectProjectOnboardingV3({ runner: "codex",
      rootDir: path,
      deps: runtimeProbeFailureDeps("create", "EACCES"),
    });
    assert.equal(mixed.status, "projection-drift");
    assert.equal(mixed.runtime.status, "projection-drift");
    assertDiagnostic(mixed, "projection_drift");
    assertSingleLineAction(mixed.nextAction, {
      kind: "command",
      executable: "node",
      argv: [ONBOARDING_SCRIPT, "plan-repair", "--root", path, "--runner", "codex"],
      mutation: false,
      requiresConfirmation: false,
      expected: {
        schema: "pipeline.project-onboarding.v4",
        statuses: ["projection-drift"],
      },
    });
    assert.deepEqual(treeSnapshot(path), mixedBefore);
    const observed = applyProjectOnboardingLifecycleV4({ runner: "codex",
      rootDir: path,
      deps: fakeDeps,
      operation: "runtime",
      planSha256: digest,
      activate: true,
    });
    assert.equal(observed.status, "projection-drift");
    assert.equal(observed.runtime.status, "projection-drift");
    assertDiagnostic(observed, "projection_drift");
    assertSingleLineAction(observed.nextAction, {
      kind: "command",
      executable: "node",
      argv: [ONBOARDING_SCRIPT, "plan-repair", "--root", path, "--runner", "codex"],
      mutation: false,
      requiresConfirmation: false,
      expected: {
        schema: "pipeline.project-onboarding.v4",
        statuses: ["projection-drift"],
      },
    });
    assert.equal(readFileSync(driftTarget, "utf8"), external);
    assert.equal(readRestartBarrier({ rootDir: path, spawn: fakeGit }).status, "absent");
  } finally { dispose(path); }
});

test("runtime apply permission races roll back every byte and remove the exact restart barrier", () => {
  for (const code of ["EACCES", "EPERM", "EROFS"]) {
    const path = root();
    try {
      const seed = planProjectOnboardingV3({ runner: "codex", rootDir: path, deps: fakeDeps });
      assert.equal(applyProjectOnboardingV3(seed, {
        rootDir: path,
        activate: true,
        deps: fakeDeps,
      }).status, "applied");
      const plan = planProjectOnboardingLifecycleV4({ runner: "codex",
        rootDir: path,
        deps: fakeDeps,
        operation: "runtime",
      });
      const digest = plan.nextAction.argv[plan.nextAction.argv.indexOf("--plan-sha256") + 1];
      const before = treeSnapshot(path);
      let injected = false;
      const observed = applyProjectOnboardingLifecycleV4({ runner: "codex",
        rootDir: path,
        operation: "runtime",
        planSha256: digest,
        activate: true,
        deps: {
          ...fakeDeps,
          beforeCommit({ target }) {
            if (!injected && target === ".codex/agents/implementor.toml") {
              injected = true;
              throw denied(code);
            }
          },
        },
      });
      assert.equal(injected, true, code);
      assert.equal(observed.status, "runtime-target-read-only", code);
      assert.deepEqual(observed.runtime, {
        status: "target-read-only",
        sourceSha256: null,
        targetsSha256: null,
        barrierSha256: null,
        readbackSha256: null,
      }, code);
      assertDiagnostic(observed, "runtime_target_read_only");
      assert.equal(observed.nextAction, null);
      assert.equal(JSON.stringify(observed).includes("synthetic runtime target"), false);
      assert.deepEqual(treeSnapshot(path), before, code);
      assert.equal(readRestartBarrier({ rootDir: path, spawn: fakeGit }).status, "absent");
    } finally { dispose(path); }
  }
});

test("public kickoff plan/apply carries goal as one argv element and reconstructs the bound plan", () => {
  const path = root();
  let stderr = "";
  // AGY-CHATADAPTER-2: every kickoff plan/apply call in this test uses
  // --language en, so a fixed attended-confirmation seam (isattyFn/readLineFn)
  // reused across all of them is the correct simulation of a human confirming
  // that same value each time -- not a weakening of the gate under test
  // elsewhere (see project-onboarding-v3-argv-closure.test.mjs).
  const invoke = (args) => {
    let output = "";
    stderr = "";
    const code = onboardingCli(args, {
      deps: { ...fakeDeps, isattyFn: () => true, readLineFn: () => "en" },
      write: (chunk) => { output += chunk; },
      writeError: (chunk) => { stderr += chunk; },
    });
    return { code, result: output ? JSON.parse(output) : null };
  };
  try {
    const barrier = initializeRestartRequiredRoot(path);
    clearRuntimeBarrier(path, barrier);
    const pristine = inspectProjectOnboardingV3({ runner: "codex", rootDir: path, deps: fakeDeps });
    assert.equal(pristine.status, "intake-required");
    assert.equal(pristine.continuity.status, "absent-pristine");
    assert.equal(pristine.nextAction.kind, "collect-input");

    const goal = "Ship safely; keep $(touch nope) as text";
    const planned = invoke(["kickoff", "plan", "--root", path, "--goal", goal, "--language", "en", "--runner", "codex"]);
    assert.equal(planned.code, 0, stderr);
    assert.equal(planned.result.goal, goal);
    const kickoffId = planned.result.targets.state.value.activeFeature.id;
    const expectedPrd = `specs/${kickoffId}/prd_${kickoffId}.md`;
    const expectedSpec = `specs/${kickoffId}/spec.md`;
    assert.equal(planned.result.targets.prd.path, expectedPrd);
    assert.equal(planned.result.targets.spec.path, expectedSpec);
    assert.equal(planned.result.targets.state.value.activeFeature.planPath, expectedPrd);
    assert.equal(planned.result.targets.state.value.continuity.authority.prd.path, expectedPrd);
    assert.equal(planned.result.targets.state.value.continuity.authority.spec.path, expectedSpec);
    assert.match(planned.result.targets.prd.content, /^<!-- po-language: en -->\n<!-- technical-spec-sha256: [a-f0-9]{64} -->/u);
    assert.equal(planned.result.targets.prd.content.includes(`technical-spec-sha256: ${planned.result.targets.spec.afterSha256}`), true);
    assert.equal(planned.result.targets.spec.content.includes("Initial PRD SHA-256"), false);
    assert.deepEqual(planned.result.applyAction.argv, [
      ONBOARDING_SCRIPT,
      "kickoff", "apply", "--root", path, "--goal", goal, "--language", "en",
      "--runner", "codex",
      "--plan-sha256", planned.result.planSha256, "--activate",
    ]);
    assert.match(renderProjectOnboardingAction(planned.result.applyAction), /'Ship safely; keep \$\(touch nope\) as text'/u);
    assert.equal(existsSync(join(path, "nope")), false);
    assert.equal(inspectProjectOnboardingV3({ runner: "codex", rootDir: path, deps: fakeDeps }).status, "intake-required");

    const changedGoal = invoke([
      "kickoff", "apply", "--root", path, "--goal", `${goal} changed`, "--language", "en",
      "--plan-sha256", planned.result.planSha256, "--activate",
    ]);
    assert.equal(changedGoal.code, 2);
    assert.match(stderr, /KICKOFF-PLAN-DIGEST/u);
    assert.equal(inspectProjectOnboardingV3({ runner: "codex", rootDir: path, deps: fakeDeps }).status, "intake-required");

    const wrongDigest = invoke([
      "kickoff", "apply", "--root", path, "--goal", goal, "--language", "en",
      "--plan-sha256", "f".repeat(64), "--activate",
    ]);
    assert.equal(wrongDigest.code, 2);
    assert.match(stderr, /KICKOFF-PLAN-DIGEST/u);
    assert.equal(inspectProjectOnboardingV3({ runner: "codex", rootDir: path, deps: fakeDeps }).status, "intake-required");

    const applied = invoke(planned.result.applyAction.argv.slice(1));
    assert.equal(applied.code, 0, stderr);
    assert.equal(applied.result.status, "ready");
    assert.equal(applied.result.continuity.status, "valid");

    const replayed = invoke(planned.result.applyAction.argv.slice(1));
    assert.equal(replayed.code, 0, stderr);
    assert.equal(replayed.result.status, "ready");
    assert.equal(replayed.result.continuity.status, "valid");
    assert.equal(existsSync(join(path, "nope")), false);
  } finally { dispose(path); }
});

test("a local kickoff provisions its PO profile inside the confirmed kickoff action", () => {
  const path = root();
  const calls = [];
  try {
    const barrier = initializeRestartRequiredRoot(path);
    clearRuntimeBarrier(path, barrier);
    completeKickoff(path, "Provision the first local profile", {
      ...fakeDeps,
      initializePoGateProfileReceipt(input) {
        calls.push(input);
        return {
          ok: true,
          code: "PO-PROFILE-RECEIPT-PUBLISHED",
          humanFacing: "en",
          receiptSha256: "1".repeat(64),
        };
      },
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].rootDir, path);
    assert.match(String(calls[0].userYamlText), /human_facing: "en"/u);
    assert.match(String(calls[0].runtimeYamlText), /human_facing: en/u);
  } finally { dispose(path); }
});

test("a real fresh local kickoff is immediately a valid canonical PO authority", () => {
  const path = root();
  try {
    hostGit(path, ["init", "--initial-branch=main"]);
    const localDeps = { ...fakeDeps, initializePoGateProfileReceipt: initializeActualPoGateProfileReceipt };
    const barrier = initializeRestartRequiredRoot(path, localDeps);
    clearRuntimeBarrier(path, barrier);
    completeKickoff(path, "Create one canonical fresh feature", localDeps);
    const authority = validatePoGateAuthorityForRepository({ repoRoot: path });
    assert.equal(authority.ok, true, JSON.stringify(authority));
    acknowledgePoGatePlan(path, JSON.parse(readFileSync(join(path, "project/pipeline-state.json"), "utf8")).activeFeature.planPath);
    const stderr = [];
    const exit = pipelineStateRun(["submit-plan", "--by", "coordinator", "--profile", "feature"], {
      dir: path,
      now: () => "2026-08-01T12:00:00.000Z",
      writeError: (value) => stderr.push(value),
    });
    assert.equal(exit, 0, stderr.join(""));
  } finally { dispose(path); }
});

// Regression for backlog: language-selection-scope-is-unclear-and-arrives-too-late
// (GF-079). Portable-seed always defaults pipeline.user.yaml/manifest language
// to "en" before any language question is asked; this reproduces the ordinary
// case where the PO's real first answer at kickoff legitimately differs from
// that silent default, and asserts the whole path reaches a consistent,
// PASSING authority in one kickoff-apply call -- without the
// PO-GATE-PRD-LANGUAGE-MISMATCH -> projection-drift two-tool repair chain
// that used to be required for this exact, ordinary case.
test("kickoff choosing a language different from the portable-seed default reaches a consistent authority without the mismatch/drift repair chain", () => {
  const path = root();
  try {
    hostGit(path, ["init", "--initial-branch=main"]);
    const localDeps = { ...fakeDeps, initializePoGateProfileReceipt: initializeActualPoGateProfileReceipt };
    const barrier = initializeRestartRequiredRoot(path, localDeps);
    clearRuntimeBarrier(path, barrier);
    const seededSource = parseYaml(readFileSync(join(path, "pipeline.user.yaml"), "utf8"));
    assert.equal(seededSource.language.human_facing, "en");
    const goal = "Ship the first German-language feature";
    const plan = planProjectOnboardingKickoffV4({ rootDir: path, goal, language: "de", deps: localDeps, runner: "codex" });
    assert.equal(plan.language, "de");
    const applied = applyProjectOnboardingKickoffV4({
      rootDir: path, goal, language: "de", planSha256: plan.planSha256, activate: true, deps: localDeps, runner: "codex",
    });
    assert.equal(applied.status, "ready");
    assert.equal(applied.continuity.status, "valid");
    const correctedSource = parseYaml(readFileSync(join(path, "pipeline.user.yaml"), "utf8"));
    assert.equal(correctedSource.language.human_facing, "de");
    assert.match(readFileSync(join(path, ".claude/pipeline.yaml"), "utf8"), /language:\n {2}human_facing: de\n/u);
    assert.match(readFileSync(join(path, "project/pipeline.yaml"), "utf8"), /language:\n {2}human_facing: de\n/u);
    const authority = validatePoGateAuthorityForRepository({ repoRoot: path });
    assert.equal(authority.ok, true, JSON.stringify(authority));
    // No projection-drift either: a subsequent lifecycle inspection must stay
    // "ready", not send the caller through plan-repair/apply-repair to
    // reconcile the runtime manifest the migration owned-keys table tracks.
    assert.equal(inspectProjectOnboardingV3({ rootDir: path, deps: localDeps, runner: "codex" }).status, "ready");
    acknowledgePoGatePlan(path, JSON.parse(readFileSync(join(path, "project/pipeline-state.json"), "utf8")).activeFeature.planPath);
    const stderr = [];
    const exit = pipelineStateRun(["submit-plan", "--by", "coordinator", "--profile", "feature"], {
      dir: path,
      now: () => "2026-08-01T12:00:00.000Z",
      writeError: (value) => stderr.push(value),
    });
    assert.equal(exit, 0, stderr.join(""));
  } finally { dispose(path); }
});

// Regression for backlog: what-the-claude-greenfield-run-adds-to-the-happy-
// path-findings, finding 1 (NVA-BL-70). Unlike the kickoff-time case above,
// here the PO's real answer arrives only at kickoff-design.md's SECOND,
// document-specific language question -- asked, by design, after kickoff --
// so the promoted PRD's own marker legitimately differs from what kickoff
// itself was answered. Before this fix, promotion learned the answer only
// into continuity.runtime.humanFacingLanguage (commit 29380a77); the config
// files PO-GATE-PRD-LANGUAGE-MISMATCH actually reads stayed on the kickoff
// value, so submit-plan still refused several steps after promotion had
// already bound the PRD's bytes. This asserts promotion itself now reaches a
// consistent, PASSING authority -- the mismatch never reaches submit-plan.
test("promoting a PRD whose language differs from kickoff's own answer reaches a consistent authority at promotion, not several steps later at submit-plan", () => {
  const path = root();
  try {
    hostGit(path, ["init", "--initial-branch=main"]);
    const localDeps = { ...fakeDeps, initializePoGateProfileReceipt: initializeActualPoGateProfileReceipt };
    const barrier = initializeRestartRequiredRoot(path, localDeps);
    clearRuntimeBarrier(path, barrier);
    completeKickoff(path, "Ship the operator-English feature whose document turns out German", localDeps, "ready", "codex");
    const seededSource = parseYaml(readFileSync(join(path, "pipeline.user.yaml"), "utf8"));
    assert.equal(seededSource.language.human_facing, "en");

    mkdirSync(join(path, "specs", "promo-lang"), { recursive: true });
    const prdPath = "specs/promo-lang/prd_promo-lang.md";
    const specPath = "specs/promo-lang/spec.md";
    const designInputPath = "specs/promo-lang/design-input.md";
    writeFileSync(join(path, specPath), "# Promo-lang technical specification\n");
    const specSha256 = sha256(readFileSync(join(path, specPath)));
    writeFileSync(join(path, prdPath), [
      "<!-- po-language: de -->",
      `<!-- technical-spec-sha256: ${specSha256} -->`,
      PO_GATE_PRD_ACKNOWLEDGEMENT_MARKER,
      "",
      "# Promo-lang product requirements",
      "",
    ].join("\n"));
    writeFileSync(join(path, designInputPath), "# Promo-lang design input\n");
    const promotion = {
      rootDir: path, profile: "feature", featureId: "promo-lang-work", planPath: prdPath,
      prdPath, specPath, designInputPath, runner: "codex", deps: localDeps,
    };
    const planned = planProjectOnboardingKickoffPromotionV4(promotion);
    const promoted = applyProjectOnboardingKickoffPromotionV4({
      runner: "codex", ...promotion, planSha256: planned.planSha256, activate: true,
    });
    assert.equal(promoted.status, "ready");
    assert.equal(promoted.continuity.status, "valid");

    const correctedSource = parseYaml(readFileSync(join(path, "pipeline.user.yaml"), "utf8"));
    assert.equal(correctedSource.language.human_facing, "de");
    assert.match(readFileSync(join(path, ".claude/pipeline.yaml"), "utf8"), /language:\n {2}human_facing: de\n/u);
    assert.match(readFileSync(join(path, "project/pipeline.yaml"), "utf8"), /language:\n {2}human_facing: de\n/u);

    const authority = validatePoGateAuthorityForRepository({ repoRoot: path });
    assert.equal(authority.ok, true, JSON.stringify(authority));
    const stderr = [];
    const exit = pipelineStateRun(["submit-plan", "--by", "coordinator", "--profile", "feature"], {
      dir: path,
      now: () => "2026-08-01T12:00:00.000Z",
      writeError: (value) => stderr.push(value),
    });
    assert.equal(exit, 0, stderr.join(""));
  } finally { dispose(path); }
});

// Regression for backlog: onboarding-produces-drift-it-then-has-to-repair
// (NVA-W9-DRIFTREPAIR). The two tests above already show a language switch
// alone reaches "ready" without drift. This one proves the OTHER half of the
// fix: when a runtime target UNRELATED to the language marker is ALSO
// drifted at the exact moment the language correction runs -- proven first,
// by asserting a real "projection-drift" status before the kickoff below --
// the SAME correction transaction repairs it too, atomically, rather than
// leaving the caller to discover it on the next inspection and route through
// a separate plan-repair/apply-repair.
test("a kickoff language switch that also finds a drifted runtime target repairs it atomically, without a separate plan-repair/apply-repair (NVA-W9-DRIFTREPAIR)", () => {
  const path = root();
  try {
    hostGit(path, ["init", "--initial-branch=main"]);
    const localDeps = { ...fakeDeps, initializePoGateProfileReceipt: initializeActualPoGateProfileReceipt };
    const barrier = initializeRestartRequiredRoot(path, localDeps);
    clearRuntimeBarrier(path, barrier);

    const goal = "Ship the first German-language feature alongside pre-existing drift";
    const plan = planProjectOnboardingKickoffV4({ rootDir: path, goal, language: "de", deps: localDeps, runner: "codex" });
    assert.equal(plan.language, "de");

    // Corrupt a runtime target the language correction's own narrow byte
    // patches never touch, so genuine drift exists for a reason completely
    // independent of the language switch this kickoff apply is about to
    // perform -- after the plan above (which is unaffected: it binds the
    // goal/state transaction, never these bytes), so kickoff apply itself
    // still has an admissible pre-drift status to start from.
    const advisorPath = join(path, ".codex", "agents", "consult-advisor.toml");
    const advisorBefore = readFileSync(advisorPath, "utf8");
    assert.match(advisorBefore, /model = "[^"]+"/u);
    writeFileSync(advisorPath, advisorBefore.replace(/model = "[^"]*"/u, 'model = "corrupted-drift-probe"'));
    assert.equal(
      inspectProjectOnboardingV3({ rootDir: path, deps: localDeps, runner: "codex" }).status,
      "projection-drift",
      "fixture setup must actually produce drift before the language switch runs",
    );

    const applied = applyProjectOnboardingKickoffV4({
      rootDir: path, goal, language: "de", planSha256: plan.planSha256, activate: true, deps: localDeps, runner: "codex",
    });
    assert.equal(applied.status, "ready");
    assert.equal(applied.continuity.status, "valid");

    // The unrelated corruption is gone -- repaired inside the same correction
    // transaction as the language switch, never surfaced as a separate ask.
    assert.doesNotMatch(readFileSync(advisorPath, "utf8"), /corrupted-drift-probe/u);
    const correctedSource = parseYaml(readFileSync(join(path, "pipeline.user.yaml"), "utf8"));
    assert.equal(correctedSource.language.human_facing, "de");
    assert.equal(inspectProjectOnboardingV3({ rootDir: path, deps: localDeps, runner: "codex" }).status, "ready");
  } finally { dispose(path); }
});

// Regression for backlog: onboarding-produces-drift-it-then-has-to-repair,
// 2026-08-29 re-investigation's one genuinely untried combination
// (NVA-CF-BL18-COORDINATORPATH). The two tests above already prove the
// legacy kickoff-time and promotion-time language-switch cases reach a
// consistent authority; this is the third, coordinator-sourced route:
// intake-consent-apply -> intake-capture-apply -> intake-design-questions-
// apply -> intake-generate -> bootstrap-bind-plan/apply. The generated PRD's
// own po-language marker (set from intake-consent's --language answer) is
// deliberately overwritten to differ from it, mirroring NVA-BL-70's exact
// technique on the legacy promotion path -- proving whether
// applyOnboardingBootstrapBind's own correctPromotedLanguage call (added for
// NVA-R5-LANGWIRE, onboarding-continuity.mjs) republishes the real,
// non-injectable PO-gate profile receipt after a coordinator-sourced
// mismatch exactly as the legacy path already does.
test("a coordinator-sourced bind whose generated PRD's po-language marker is edited to differ from intake consent's own language reaches a consistent authority at bind (NVA-CF-BL18-COORDINATORPATH)", () => {
  const path = root();
  let stderr = "";
  const localDeps = { ...fakeDeps, initializePoGateProfileReceipt: initializeActualPoGateProfileReceipt };
  const invoke = (args) => {
    let output = "";
    stderr = "";
    const code = onboardingCli(args, {
      deps: localDeps,
      write: (chunk) => { output += chunk; },
      writeError: (chunk) => { stderr += chunk; },
    });
    return { code, result: output ? JSON.parse(output) : null };
  };
  try {
    hostGit(path, ["init", "--initial-branch=main"]);
    const barrier = initializeRestartRequiredRoot(path, localDeps);
    clearRuntimeBarrier(path, barrier);

    const consented = invoke(["intake-consent-apply", "--root", path, "--granted", "--profile", "feature", "--language", "en", "--activate", "--runner", "codex"]);
    assert.equal(consented.code, 0, stderr);
    const captured = invoke(["intake-capture-apply", "--root", path, "--text", "Ship a safe project.", "--activate", "--runner", "codex"]);
    assert.equal(captured.code, 0, stderr);
    const answers = JSON.stringify([{ question: "What is the primary goal?", answer: "Ship safely." }]);
    const answered = invoke(["intake-design-questions-apply", "--root", path, "--answers-json", answers, "--activate", "--runner", "codex"]);
    assert.equal(answered.code, 0, stderr);

    const genPlan = planOnboardingIntakeGenerate({ rootDir: path, repositoryCapability: "local" });
    const genApplied = applyOnboardingIntakeGenerate({
      rootDir: path, repositoryCapability: "local", expectedPlanSha256: genPlan.planSha256, activate: true,
    });
    assert.equal(genApplied.checkpoint.transactionState, "generated");

    // Deliberately mismatch: the generated PRD's own po-language marker
    // (set from intake-consent's --language en above) is overwritten to
    // "de" -- NVA-BL-70's identical technique, applied to the
    // coordinator-sourced generated PRD instead of a hand-authored one.
    // Editing the bytes also means this draft is no longer the generator's
    // own unmodified playback, so the plan-acknowledgement marker is
    // appended too -- the same combination the NVA-D-ACKASK sibling test
    // above exercises once its own drift-probe edit lands.
    const observation = observeBootstrapBindAcknowledgement({ rootDir: path, repositoryCapability: "local" });
    const prdAbsolutePath = join(path, observation.prd.path);
    const prdBefore = readFileSync(prdAbsolutePath, "utf8");
    assert.ok(prdBefore.includes("<!-- po-language: en -->"));
    const prdMismatched = `${prdBefore.replace("<!-- po-language: en -->", "<!-- po-language: de -->")}\n${PO_GATE_PRD_ACKNOWLEDGEMENT_MARKER}\n`;
    writeFileSync(prdAbsolutePath, prdMismatched);

    const bindPlan = planOnboardingBootstrapBind({ rootDir: path, repositoryCapability: "local" });
    const bindApplied = applyOnboardingBootstrapBind({
      rootDir: path, repositoryCapability: "local", expectedPlanSha256: bindPlan.planSha256, activate: true,
    });
    assert.equal(bindApplied.status, "applied");

    const correctedSource = parseYaml(readFileSync(join(path, "pipeline.user.yaml"), "utf8"));
    assert.equal(correctedSource.language.human_facing, "de");
    assert.match(readFileSync(join(path, ".claude/pipeline.yaml"), "utf8"), /language:\n {2}human_facing: de\n/u);
    assert.match(readFileSync(join(path, "project/pipeline.yaml"), "utf8"), /language:\n {2}human_facing: de\n/u);

    const authority = validatePoGateAuthorityForRepository({ repoRoot: path });
    assert.equal(authority.ok, true, JSON.stringify(authority));
  } finally { dispose(path); }
});

// Regression for NVA-CF-ONBOARDKICKOFF: the test above only proves the
// repair happens when a language SWITCH occurs (seed "en" -> requested "de"),
// because that is the one branch that reaches
// correctSeededKickoffLanguage()'s regenerateRuntimeProjection() call.
// correctSeededKickoffLanguage() returns BEFORE ever reaching that call
// whenever the resolved kickoff language equals the already-seeded language
// -- which is "en", the fresh-seed default, and therefore the COMMON case.
// This test drives that exact common case: a kickoff requesting "en" (the
// seed default -- no language change at all) with genuine, unrelated
// pre-existing projection drift. Before the fix, "projection-drift" was
// admitted through apply with no repair ever running, and the drift survived
// uncorrected; this asserts it is actually repaired instead.
test("a kickoff with the seed-default (unchanged) language still repairs genuine pre-existing projection drift (NVA-CF-ONBOARDKICKOFF)", () => {
  const path = root();
  try {
    hostGit(path, ["init", "--initial-branch=main"]);
    const localDeps = { ...fakeDeps, initializePoGateProfileReceipt: initializeActualPoGateProfileReceipt };
    const barrier = initializeRestartRequiredRoot(path, localDeps);
    clearRuntimeBarrier(path, barrier);

    // "en" matches the fresh-seed default (v0Source() above) -- requesting it
    // explicitly here means correctSeededKickoffLanguage()'s own
    // seededLanguage === resolvedLanguage check is true, so ITS internal
    // regenerateRuntimeProjection() call is skipped. Any repair the test
    // observes below must come from applyProjectOnboardingKickoffV4's own
    // unconditional call, not as a side effect of a language switch.
    const goal = "Ship an English-language feature alongside pre-existing drift";
    const plan = planProjectOnboardingKickoffV4({ rootDir: path, goal, language: "en", deps: localDeps, runner: "codex" });
    assert.equal(plan.language, "en");
    const preKickoffSource = parseYaml(readFileSync(join(path, "pipeline.user.yaml"), "utf8"));
    assert.equal(preKickoffSource.language.human_facing, "en", "fixture setup must start from the seed-default language, not a switch");

    // Same drift-injection technique as the sibling test above: corrupt a
    // runtime target the language correction's own narrow byte patches never
    // touch, so genuine drift exists for a reason completely independent of
    // (and unaffected by) the language staying "en".
    const advisorPath = join(path, ".codex", "agents", "consult-advisor.toml");
    const advisorBefore = readFileSync(advisorPath, "utf8");
    assert.match(advisorBefore, /model = "[^"]+"/u);
    writeFileSync(advisorPath, advisorBefore.replace(/model = "[^"]*"/u, 'model = "corrupted-drift-probe-en"'));
    assert.equal(
      inspectProjectOnboardingV3({ rootDir: path, deps: localDeps, runner: "codex" }).status,
      "projection-drift",
      "fixture setup must actually produce drift before the unchanged-language kickoff apply runs",
    );

    const applied = applyProjectOnboardingKickoffV4({
      rootDir: path, goal, language: "en", planSha256: plan.planSha256, activate: true, deps: localDeps, runner: "codex",
    });
    assert.equal(applied.status, "ready");
    assert.equal(applied.continuity.status, "valid");

    // The unrelated corruption must be gone even though no language switch
    // ever ran the correction's own internal repair call -- this is the exact
    // gap NVA-CF-ONBOARDKICKOFF closes.
    assert.doesNotMatch(
      readFileSync(advisorPath, "utf8"),
      /corrupted-drift-probe-en/u,
      "genuine pre-existing drift must be repaired even when the kickoff language does not change",
    );
    const correctedSource = parseYaml(readFileSync(join(path, "pipeline.user.yaml"), "utf8"));
    assert.equal(correctedSource.language.human_facing, "en");
    assert.equal(inspectProjectOnboardingV3({ rootDir: path, deps: localDeps, runner: "codex" }).status, "ready");
  } finally { dispose(path); }
});

// The gate the fresh seed switches on has to be PASSABLE, and that is
// established by driving the whole path rather than by reading it. Both halves
// are the contract: a promoted `feature` whose plan nobody approved is REFUSED
// an implementation write (exit 2 -- exit 1 would let the write proceed, which
// is the reported defect: implementation beginning without the human ever being
// asked), and the exact same write is admitted once the plan is approved and
// the phase switched. A blocking gate with no path through it would be worse
// than the `warn` seed it replaces, so neither half may be dropped.
test("the seeded dev-plan gate refuses implementation before approval and admits it after", () => {
  const path = root();
  try {
    hostGit(path, ["init", "--initial-branch=main"]);
    const localDeps = { ...fakeDeps, initializePoGateProfileReceipt: initializeActualPoGateProfileReceipt };
    const barrier = initializeRestartRequiredRoot(path, localDeps);
    clearRuntimeBarrier(path, barrier);
    completeKickoff(path, "Ship one gated feature", localDeps);

    // A realistic design package: the PRD declares the repository PO language
    // once and binds the neighbouring spec.md digest once -- the two markers the
    // PO gate requires, and exactly what the kickoff seed itself writes.
    mkdirSync(join(path, "specs", "gated"), { recursive: true });
    const prdPath = "specs/gated/prd_gated.md";
    const specPath = "specs/gated/spec.md";
    const designInputPath = "specs/gated/design-input.md";
    writeFileSync(join(path, specPath), "# Gated technical specification\n");
    const specSha256 = sha256(readFileSync(join(path, specPath)));
    writeFileSync(join(path, prdPath), [
      "<!-- po-language: en -->",
      `<!-- technical-spec-sha256: ${specSha256} -->`,
      PO_GATE_PRD_ACKNOWLEDGEMENT_MARKER,
      "",
      "# Gated product requirements",
      "",
    ].join("\n"));
    writeFileSync(join(path, designInputPath), "# Gated design input\n");
    const promotion = {
      rootDir: path, profile: "feature", featureId: "gated-work", planPath: prdPath,
      prdPath, specPath, designInputPath, runner: "codex", deps: localDeps,
    };
    const planned = planProjectOnboardingKickoffPromotionV4(promotion);
    const promoted = applyProjectOnboardingKickoffPromotionV4({ runner: "codex", ...promotion, planSha256: planned.planSha256, activate: true });
    assert.equal(promoted.status, "ready");
    assert.equal(validatePoGateAuthorityForRepository({ repoRoot: path }).ok, true);

    const attemptWrite = (target) => spawnSync(
      process.execPath,
      [fileURLToPath(new URL("../hooks/guard-devplan.mjs", import.meta.url))],
      {
        cwd: path,
        encoding: "utf8",
        input: JSON.stringify({ tool_name: "Write", tool_input: { file_path: target } }),
        env: { ...process.env, CLAUDE_PROJECT_DIR: path },
      },
    );
    const refused = attemptWrite("src/index.html");
    assert.equal(refused.status, 2, `an unapproved plan must refuse implementation: ${refused.stderr}`);
    assert.match(String(refused.stderr), /lifecycle is "draft"/u);
    // The design package itself stays writable while the gate is closed --
    // refusing the plan the human is meant to review would be the same trap.
    assert.equal(attemptWrite(prdPath).status, 0, "the plan under review must stay writable");

    const state = (argv) => {
      const stderr = [];
      const code = pipelineStateRun(argv, {
        dir: path,
        now: () => "2026-08-01T12:00:00.000Z",
        writeError: (value) => stderr.push(String(value)),
      });
      return { code, stderr: stderr.join("") };
    };
    const submitted = state(["submit-plan", "--by", "po", "--profile", "feature"]);
    assert.equal(submitted.code, 0, submitted.stderr);
    assert.equal(attemptWrite("src/index.html").status, 2, "a submitted but unapproved plan still refuses implementation");
    const presented = state(["present-plan", "--by", "po"]);
    assert.equal(presented.code, 0, presented.stderr);
    const approved = state(["approve-plan", "--by", "po"]);
    assert.equal(approved.code, 0, approved.stderr);
    const phased = state(["set-phase", "--phase", "implementation", "--verify-command", `${process.execPath} -e "process.exit(0)"`]);
    assert.equal(phased.code, 0, phased.stderr);

    const admitted = attemptWrite("src/index.html");
    assert.equal(admitted.status, 0, `the approved plan must admit the same write: ${admitted.stderr}`);
  } finally { dispose(path); }
});

// backlog: 2026-08-08-no-design-to-implementation-handover-exists.md, PO
// decision 2026-08-17 (Q2, "Option A"). Before this fix, V4 inspection at
// `ready` returned `nextAction: null` even once the plan lifecycle reached
// `approved` -- the lifecycle stopped exactly at its most consequential
// handover, with nothing telling the operator or an automated caller what
// came next. This is a PROPOSAL, never a gate: `guard-devplan.mjs` (exercised
// directly above) is the sole mechanism that actually refuses implementation
// writes, and it is completely unaffected by whether this proposal exists or
// is ever acted on -- both halves are asserted below.
test("the public onboarding handover is executable for every runner with placeholder and configured verify", () => {
  const paths = [];
  const verifyCommand = `${process.execPath} -e "process.exit(0)"`;
  const verifyPlaceholder = PROJECT_ONBOARDING_VERIFY_COMMAND_PLACEHOLDER;
  try {
    for (const runner of ["claude", "codex", "antigravity"]) {
      const path = root();
      paths.push(path);
      hostGit(path, ["init", "--initial-branch=main"]);
      const localDeps = { ...fakeDeps, initializePoGateProfileReceipt: initializeActualPoGateProfileReceipt };

      const portable = planProjectOnboardingV3({ rootDir: path, deps: localDeps, runner });
      assert.equal(applyProjectOnboardingV3(portable, { rootDir: path, activate: true, deps: localDeps }).status, "applied");
      const runtime = planProjectOnboardingLifecycleV4({ rootDir: path, deps: localDeps, operation: "runtime", runner });
      const runtimeDigest = runtime.nextAction.argv[runtime.nextAction.argv.indexOf("--plan-sha256") + 1];
      const initialized = applyProjectOnboardingLifecycleV4({
        rootDir: path, deps: localDeps, operation: "runtime",
        planSha256: runtimeDigest, activate: true, runner,
      });
      if (initialized.status === "restart-required") clearRuntimeBarrier(path, readRestartBarrier({ rootDir: path, spawn: fakeGit }));
      else assert.ok(["kickoff-required", "intake-required"].includes(initialized.status), `${runner}: ${initialized.status}`);
      completeKickoff(path, `Ship one ${runner} handover feature`, localDeps, "ready", runner);

      mkdirSync(join(path, "specs", `handover-${runner}`), { recursive: true });
      const prdPath = `specs/handover-${runner}/prd_handover.md`;
      const specPath = `specs/handover-${runner}/spec.md`;
      const designInputPath = `specs/handover-${runner}/design-input.md`;
      writeFileSync(join(path, specPath), `# ${runner} handover technical specification\n`);
      const specSha256 = sha256(readFileSync(join(path, specPath)));
      writeFileSync(join(path, prdPath), [
        "<!-- po-language: en -->",
        `<!-- technical-spec-sha256: ${specSha256} -->`,
        PO_GATE_PRD_ACKNOWLEDGEMENT_MARKER,
        "",
        `# ${runner} handover product requirements`,
        "",
      ].join("\n"));
      writeFileSync(join(path, designInputPath), `# ${runner} handover design input\n`);
      const promotion = {
        rootDir: path, profile: "feature", featureId: `handover-${runner}`, planPath: prdPath,
        prdPath, specPath, designInputPath, runner, deps: localDeps,
      };
      const planned = planProjectOnboardingKickoffPromotionV4(promotion);
      const promoted = applyProjectOnboardingKickoffPromotionV4({ ...promotion, planSha256: planned.planSha256, activate: true });
      assert.equal(promoted.status, "ready");

      let tick = 0;
      const state = (argv) => {
        const stderr = [];
        tick += 1;
        const code = pipelineStateRun(argv, {
          dir: path,
          now: () => `2026-08-30T12:00:${String(tick).padStart(2, "0")}.000Z`,
          writeError: (value) => stderr.push(String(value)),
        });
        return { code, stderr: stderr.join("") };
      };
      const approve = () => {
        for (const argv of [
          ["submit-plan", "--by", "po", "--profile", "feature"],
          ["present-plan", "--by", "po"],
          ["approve-plan", "--by", "po"],
        ]) {
          const result = state(argv);
          assert.equal(result.code, 0, `${runner}: ${argv[0]}: ${result.stderr}`);
        }
      };
      const publicInspect = () => {
        let stdout = "";
        let stderr = "";
        const code = onboardingCli(["inspect", "--root", path, "--intent", "bootstrap", "--runner", runner], {
          deps: localDeps,
          env: { CLAUDECODE: "1" },
          write: (chunk) => { stdout += chunk; },
          writeError: (chunk) => { stderr += chunk; },
        });
        assert.equal(code, 0, `${runner}: public inspect: ${stderr || stdout}`);
        return JSON.parse(stdout);
      };
      const reenterDriver = () => driveOnboardingInit({
        rootDir: path,
        runner,
        run(executable, argv) {
          if (executable !== "node" || argv[0] !== ONBOARDING_SCRIPT) {
            return { status: 1, stdout: "{}", stderr: "unexpected driver command" };
          }
          let stdout = "";
          let stderr = "";
          const status = onboardingCli(argv.slice(1), {
            deps: localDeps,
            env: { CLAUDECODE: "1" },
            write: (chunk) => { stdout += chunk; },
            writeError: (chunk) => { stderr += chunk; },
          });
          return { status, stdout, stderr };
        },
      });

      // A ready onboarding envelope must hand draft/awaiting plan lifecycle
      // ownership to pipeline-state's existing public inspect driver.  The
      // action is exact and closed; onboarding does not reproduce any of the
      // submit/present/approve policy itself.
      const draftEntry = publicInspect();
      assert.equal(draftEntry.status, "ready");
      assert.equal(draftEntry.runner, runner);
      assert.deepEqual(draftEntry.nextAction, {
        kind: "command",
        executable: "node",
        argv: [PIPELINE_STATE_SCRIPT, "inspect"],
        mutation: false,
        requiresConfirmation: false,
        expected: { schema: "pipeline.inspect.v1", statuses: ["draft", "awaiting-approval"] },
      });
      const submitted = state(["submit-plan", "--by", "po", "--profile", "feature"]);
      assert.equal(submitted.code, 0, `${runner}: submit-plan: ${submitted.stderr}`);
      const awaitingEntry = publicInspect();
      assert.deepEqual(awaitingEntry.nextAction, draftEntry.nextAction,
        `${runner}: awaiting approval remains owned by the same public inspect driver`);
      const presented = state(["present-plan", "--by", "po"]);
      assert.equal(presented.code, 0, `${runner}: present-plan: ${presented.stderr}`);
      const approved = state(["approve-plan", "--by", "po"]);
      assert.equal(approved.code, 0, `${runner}: approve-plan: ${approved.stderr}`);

      // Fresh calibration still contains UNCONFIGURED_VERIFY. The public CLI
      // must publish one primary collect-input action whose nested apply argv
      // is the sanctioned atomic phase+verify transaction -- no raw config edit.
      const placeholder = publicInspect();
      assert.equal(placeholder.status, "ready");
      assert.equal(placeholder.runner, runner);
      assert.equal(placeholder.nextAction?.kind, "collect-input");
      assert.equal(placeholder.nextAction.input?.name, "verifyCommand");
      assert.equal(Object.hasOwn(placeholder.nextAction, "pendingAsks"), false, `${runner}: no duplicate verify ask`);
      assert.doesNotMatch(placeholder.nextAction.guidance, /edit .*pipeline\.json/iu);
      assert.deepEqual(placeholder.nextAction.applyAction.argv, [
        PIPELINE_STATE_SCRIPT, "set-phase", "--phase", "implementation",
        "--verify-command", verifyPlaceholder,
      ]);
      const materialized = placeholder.nextAction.applyAction.argv.map((part) => part === verifyPlaceholder ? verifyCommand : part);
      assert.equal(materialized.filter((part) => part === verifyCommand).length, 1);
      const firstPhase = state(materialized.slice(1));
      assert.equal(firstPhase.code, 0, `${runner}: placeholder apply: ${firstPhase.stderr}`);
      assert.equal(reenterDriver().outcome, "ready", `${runner}: placeholder re-entry`);

      // Return to design through the public writer, approve the unchanged plan
      // again, and prove configured verify retains the exact historical command.
      const reopened = state(["reopen-design", "--by", "po"]);
      assert.equal(reopened.code, 0, `${runner}: reopen: ${reopened.stderr}`);
      approve();
      const configured = publicInspect();
      assert.equal(configured.nextAction?.kind, "command");
      assert.equal(configured.nextAction.executable, "node");
      assert.deepEqual(configured.nextAction.argv, [PIPELINE_STATE_SCRIPT, "set-phase", "--phase", "implementation"]);
      assert.equal(configured.nextAction.mutation, true);
      assert.equal(configured.nextAction.requiresConfirmation, true);
      const secondPhase = state(configured.nextAction.argv.slice(1));
      assert.equal(secondPhase.code, 0, `${runner}: configured apply: ${secondPhase.stderr}`);
      assert.equal(reenterDriver().outcome, "ready", `${runner}: configured re-entry`);
    }
  } finally {
    for (const path of paths) dispose(path);
  }
});

// NVA-R40-PROJDRIFT (backlog/items/2026-08-29-projection-drift-fault-after-
// design-implementation-transition-forces-restart.md): a real design->
// implementation phase transition (`set-phase --phase implementation`), via
// the REAL code path in a genuine temp repo, does NOT by itself produce
// `projection-drift` -- this test reproduces the transition cleanly and
// asserts the status stays "ready" throughout, REFUTING the literal
// hypothesis that the transition itself is the trigger. It then reproduces
// the mechanism that actually DOES produce `projection-drift`: an untracked
// edit to `pipeline.user.yaml` (the V3 runtime-projection source) made
// without going through the regeneration/repair tool. The producing
// comparison is `legacyInspection()`'s `legacy.status === "partial"` handler
// in project-onboarding-v3.mjs, specifically the `runtimePlan.status ===
// "ready"` branch that assigns `status: initialize ? "runtime-
// initialization-required" : "projection-drift"` (project-onboarding-
// v3.mjs:3985, runtime built at :3960, diagnostic at :3993) -- reached when
// `planRunnerProfileMigrationV3()` (runner-profile-migration-v3.mjs) finds
// every runtime-projection target already present on disk (`missing` is
// false) but with bytes that no longer match a fresh render from the
// CURRENT `pipeline.user.yaml`. The real-world timing match (drift
// "immediately after" set-phase) is best explained by set-phase being the
// next natural readiness check after such an edit, not by set-phase causing
// it: this test shows the SAME untracked edit produces the identical
// "projection-drift"/"generated runtime bytes differ from the V3
// projection" diagnostic whether performed before or after set-phase.
// Finally, it exercises the documented narrower repair (`plan-repair`/
// `apply-repair`, closed by the 2026-08-09 kickoff-design item) for a
// runner requiring native runtime readback (Codex): even that repair still
// resolves to `restart-required`, not `ready` -- for this runner, "the only
// recovery is effectively a restart" is accurate downstream of the correct
// tool too, because Codex has no way to re-read its own runtime target
// bytes (AGENTS.md/config.toml-equivalent) without a fresh process (ADR-0057
// decision 2a); a narrower non-restart recovery is not available at this
// layer without changing that structural constraint, which is out of scope
// for this item.
test("NVA-R40-PROJDRIFT: set-phase --phase implementation does not itself cause projection-drift; an untracked pipeline.user.yaml edit does, at the very next inspection", () => {
  const path = root();
  try {
    hostGit(path, ["init", "--initial-branch=main"]);
    const runner = "codex";
    const localDeps = { ...fakeDeps, initializePoGateProfileReceipt: initializeActualPoGateProfileReceipt };
    const barrier = initializeRestartRequiredRoot(path, localDeps, runner);
    clearRuntimeBarrier(path, barrier);
    completeKickoff(path, "Ship one probe feature", localDeps, "ready", runner);

    mkdirSync(join(path, "specs", "projdrift"), { recursive: true });
    const prdPath = "specs/projdrift/prd_projdrift.md";
    const specPath = "specs/projdrift/spec.md";
    const designInputPath = "specs/projdrift/design-input.md";
    writeFileSync(join(path, specPath), "# Projdrift technical specification\n");
    const specSha256 = sha256(readFileSync(join(path, specPath)));
    writeFileSync(join(path, prdPath), [
      "<!-- po-language: en -->",
      `<!-- technical-spec-sha256: ${specSha256} -->`,
      PO_GATE_PRD_ACKNOWLEDGEMENT_MARKER,
      "",
      "# Projdrift product requirements",
      "",
    ].join("\n"));
    writeFileSync(join(path, designInputPath), "# Projdrift design input\n");
    const promotion = {
      rootDir: path, profile: "feature", featureId: "projdrift-work", planPath: prdPath,
      prdPath, specPath, designInputPath, runner, deps: localDeps,
    };
    const planned = planProjectOnboardingKickoffPromotionV4(promotion);
    const promoted = applyProjectOnboardingKickoffPromotionV4({ runner, ...promotion, planSha256: planned.planSha256, activate: true });
    assert.equal(promoted.status, "ready");

    const state = (argv) => {
      const stderr = [];
      const code = pipelineStateRun(argv, { dir: path, now: () => "2026-08-01T12:00:00.000Z", writeError: (v) => stderr.push(String(v)) });
      return { code, stderr: stderr.join("") };
    };
    assert.equal(state(["submit-plan", "--by", "po", "--profile", "feature"]).code, 0);
    assert.equal(state(["present-plan", "--by", "po"]).code, 0);
    assert.equal(state(["approve-plan", "--by", "po"]).code, 0);

    const inspect = () => inspectProjectOnboardingV3({ runner, rootDir: path, intent: "bootstrap", deps: localDeps });

    // 1. CLEAN transition: refute the literal "the transition is the trigger"
    // hypothesis directly.
    assert.equal(inspect().status, "ready");
    assert.equal(state(["set-phase", "--phase", "implementation", "--verify-command", `${process.execPath} -e "process.exit(0)"`]).code, 0);
    assert.equal(inspect().status, "ready", "a clean design->implementation transition must not itself produce projection-drift");

    // 2. The ACTUAL mechanism: an untracked edit to pipeline.user.yaml (the
    // runtime-projection source), performed without the regeneration tool,
    // reproduces the exact reported status and diagnostic.
    const sourcePath = join(path, "pipeline.user.yaml");
    const beforeEdit = readFileSync(sourcePath, "utf8");
    assert.match(beforeEdit, /human_facing: "en"/u, "fixture assumption: kickoff seeds an explicit quoted human_facing language");
    writeFileSync(sourcePath, beforeEdit.replace('human_facing: "en"', 'human_facing: "de"'));
    const drifted = inspect();
    assert.equal(drifted.status, "projection-drift");
    assert.deepEqual(drifted.diagnostics, [{
      path: "$.runtime",
      code: "projection_drift",
      message: "generated runtime bytes differ from the V3 projection",
      guidance: "review the lifecycle runtime plan",
    }]);

    // 3. The documented narrower repair for this runner still resolves to
    // restart-required, not ready -- Codex has no way to re-read its own
    // runtime targets without a fresh process.
    const repairPlan = planProjectOnboardingLifecycleV4({ rootDir: path, deps: localDeps, operation: "repair", runner });
    assert.equal(repairPlan.status, "projection-drift");
    const digestIndex = repairPlan.nextAction.argv.indexOf("--plan-sha256");
    const repairApplied = applyProjectOnboardingLifecycleV4({
      rootDir: path, deps: localDeps, operation: "repair",
      planSha256: repairPlan.nextAction.argv[digestIndex + 1], activate: true, runner,
    });
    assert.equal(repairApplied.status, "restart-required");
  } finally { dispose(path); }
});

// PUSHSEED-2. The same standard as the dev-plan test above, for the gate the
// 2026-08-09 seed switches on: the push the guard refuses must be admitted once
// the shipped commands have been run, and every one of those commands must be
// reachable in a project that configured nothing. This is the measurement that
// makes seeding `push: blocking` defensible; without it the seed would be the
// unsatisfiable gate the chapter comment forbids.
//
// The two halves are both the contract. Refusing forever is the deadlock; passing
// with nothing done is the defect the PO found -- a push that succeeded in a
// project whose own calibration said `push: blocking`.
test("the seeded push gate refuses an unapproved push and admits it after the shipped commands", () => {
  const path = root();
  try {
    hostGit(path, ["init", "--initial-branch=main"]);
    hostGit(path, ["config", "user.email", "po@example.invalid"]);
    hostGit(path, ["config", "user.name", "PO"]);
    // NVA-R33-SECGATEON: a real remote is required so security-scan.mjs (below) can
    // compute `candidate.repositorySha256` -- without one it stays null and the
    // security bucket refuses with "candidate repository identity is invalid" even
    // after a clean scan. This test's own concern is the PUSH bucket; the security
    // bucket now has to be driven green too since it is a second, independent
    // blocker on the same seeded gate chapter (see SECGATE-1 below for its own
    // dedicated satisfying-path proof).
    hostGit(path, ["remote", "add", "origin", "https://example.invalid/pipeline/fixture.git"]);
    const seed = planProjectOnboardingV3({ runner: "codex", rootDir: path, deps: fakeDeps });
    assert.equal(applyProjectOnboardingV3(seed, { rootDir: path, activate: true, deps: fakeDeps }).status, "applied");

    const attemptPush = () => spawnSync(
      process.execPath,
      [fileURLToPath(new URL("../hooks/guard-push.mjs", import.meta.url))],
      {
        cwd: path,
        encoding: "utf8",
        input: JSON.stringify({ tool_name: "Bash", tool_input: { command: "git push origin HEAD:refs/heads/feat/x" } }),
        env: { ...process.env, CLAUDE_PROJECT_DIR: path },
      },
    );
    const producer = fileURLToPath(new URL("../scripts/verify-evidence-producer.mjs", import.meta.url));
    const produceEvidence = () => spawnSync(process.execPath, [producer, "--root", path, "--out", "evidence/verify-latest.json"], {
      cwd: path, encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: path },
    });
    // NVA-R33-SECGATEON: the second, independent bucket the seeded gate chapter now
    // also demands -- see SECGATE-1 below for its own dedicated satisfying-path proof.
    const securityScanScript = fileURLToPath(new URL("../scripts/security-scan.mjs", import.meta.url));
    const produceSecurityEvidence = () => spawnSync(process.execPath, [securityScanScript, "--root", path], {
      cwd: path, encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: path },
    });
    // `approve-push`'s chat-mode challenge is written with `console.error`
    // directly (not the `writeError` dep), so this has to intercept the real
    // console method to see it -- same shape as `capturedStderr` in
    // pipeline-state.test.mjs.
    const state = (argv, deps = {}) => {
      const stderr = [];
      const originalError = console.error;
      console.error = (...values) => { stderr.push(values.join(" ")); };
      let code;
      try {
        code = pipelineStateRun(argv, { dir: path, writeError: (value) => stderr.push(String(value)), ...deps });
      } finally {
        console.error = originalError;
      }
      return { code, stderr: stderr.join("") };
    };
    // `gates.push_approval` is read from the COMMITTED bytes, so every step that
    // changes a tracked file has to be committed before the next one observes it.
    // NVA-R39-GENESISWIRE-RETRY (PO decision, 2026-08-29, backlog:
    // 2026-08-29-a-node-script-defeats-every-file-protection-guard.md): `--no-verify`
    // is the sanctioned escape ONLY for a later, already-tracked-file admin edit --
    // distinct from the genesis-commit first-appearance exemption above it, which the
    // FIRST `commit("seeded consumer")` call below still relies on unaided.
    const commit = (message, { noVerify = false } = {}) => {
      hostGit(path, ["add", "-A"]);
      hostGit(path, noVerify ? ["commit", "-q", "--no-verify", "-m", message] : ["commit", "-q", "-m", message]);
    };

    commit("seeded consumer");
    const refused = attemptPush();
    assert.equal(refused.status, 2, `the seeded gate must refuse an unapproved push: ${refused.stderr}`);
    assert.match(String(refused.stderr), /evidence\/verify-latest\.json missing/u);
    assert.match(String(refused.stderr), /Push approval missing/u);

    // (1) The seeded verify placeholder fails by design, so no evidence is written
    // -- the artifact can never claim a pass that did not happen.
    assert.notEqual(produceEvidence().status, 0, "an unconfigured verify contract must not yield passing evidence");
    assert.equal(existsSync(join(path, "evidence", "verify-latest.json")), false);

    // (2) The human configures a real verify command; the producer then writes
    // candidate-bound evidence. Both steps the calibration already demands.
    const calibrationPath = join(path, "project", "pipeline.json");
    const calibration = JSON.parse(readFileSync(calibrationPath, "utf8"));
    calibration.verify = `${JSON.stringify(process.execPath)} -e "process.exit(0)"`;
    writeFileSync(calibrationPath, `${JSON.stringify(calibration, null, 2)}\n`);

    // (3) The human chooses the repository-wide Chat attribution posture.  The
    // seeded global `human_approval: signature` owns the push gate too, so an
    // old push-local change alone must not silently weaken it.  Conversely, a
    // committed global `chat` intentionally needs neither a key nor a TTY.
    const userPath = join(path, "pipeline.user.yaml");
    writeFileSync(userPath, readFileSync(userPath, "utf8").replace(/human_approval: "?signature"?/u, 'human_approval: "chat"'));
    commit("configure verify and global human approval", { noVerify: true });

    // (4) The artifact the approval binds, from the plugin's shipped template.
    assert.equal(state(["materialize-push-threat-model"]).code, 0);
    commit("push threat model");
    assert.equal(produceEvidence().status, 0, "a configured, passing verify command must yield evidence");
    assert.equal(produceSecurityEvidence().status, 0, "a fresh consumer with no catalog must yield a clean, non-blocking security scan");

    // (5) Global Chat is explicitly non-attested: the recorded Chat answer is
    // enough, with no copy-back challenge and no terminal inspection.
    const approved = state(["approve-push", "--by", "po", "--remote", "origin", "--destination", "refs/heads/feat/x"], {
      isattyFn: () => { throw new Error("global chat must not inspect a terminal"); },
      readLineFn: () => { throw new Error("global chat must not read a terminal"); },
    });
    assert.equal(approved.code, 0, approved.stderr);

    const admitted = attemptPush();
    assert.equal(admitted.status, 0, `the approved push must be admitted: ${admitted.stderr}`);

    // And the approval is bound to THAT commit: one more commit re-closes the gate,
    // which is what stops an approval from becoming a standing licence.
    writeFileSync(join(path, "README.md"), "moved on\n");
    commit("a later commit");
    assert.equal(attemptPush().status, 2, "an approval must not travel to a commit nobody approved");
  } finally { dispose(path); }
});

// SECGATE-1 (NVA-R33-SECGATEON, backlog:
// 2026-08-28-seed-the-security-gate-on-now-that-its-satisfying-path-is-open.md): the
// security gate's own satisfying path, measured end to end in a real onboarded root,
// to the same standard PUSHSEED-2 above measures the push gate's. The push bucket is
// driven fully green FIRST so that whatever still refuses afterward can only be the
// SECURITY bucket -- proving it is a real, independent blocker rather than one that
// merely rides along on the push gate's own refusal. The scan itself is then run with
// an EMPTY environment (no PATH at all, so no external scanner binary is reachable --
// the same isolation shape security-scan.test.mjs's own NVA-R18-SCANBOOT fixture uses),
// establishing the no-external-scanner case by real subprocess measurement rather than
// by assuming the fixture-level proof generalizes to an actual onboarded root's layout.
//
// NOT measured here (disclosed rather than assumed): a true INSTALLED-PLUGIN-style
// deployment (no repo root above the plugin's own scripts/lib directories) for this
// specific push+onboarding flow -- that would need copying the whole onboarding/push/
// security-scan call graph into a rootless fixture tree, out of reach in this dispatch's
// budget. The narrower mechanism this satisfying path actually depends on -- gitleaks
// config resolution from an installed-plugin layout with no repo root at all -- IS
// already measured that way, in security-adapters/gitleaks.test.mjs ("run() resolves
// the plugin-shipped default config from an installed-plugin fixture with no repo root
// anywhere").
test("the seeded security gate refuses a push with missing security evidence and admits it after the shipped scan command runs (SECGATE-1)", () => {
  const path = root();
  try {
    hostGit(path, ["init", "--initial-branch=main"]);
    hostGit(path, ["config", "user.email", "po@example.invalid"]);
    hostGit(path, ["config", "user.name", "PO"]);
    // A real remote is required so security-scan.mjs can compute
    // `candidate.repositorySha256` -- without one it stays null and the gate
    // refuses with "candidate repository identity is invalid" even after a clean
    // scan (same reason PUSHSEED-2 above now needs one too).
    hostGit(path, ["remote", "add", "origin", "https://example.invalid/pipeline/fixture.git"]);
    const seed = planProjectOnboardingV3({ runner: "codex", rootDir: path, deps: fakeDeps });
    assert.equal(applyProjectOnboardingV3(seed, { rootDir: path, activate: true, deps: fakeDeps }).status, "applied");

    const attemptPush = () => spawnSync(
      process.execPath,
      [fileURLToPath(new URL("../hooks/guard-push.mjs", import.meta.url))],
      {
        cwd: path,
        encoding: "utf8",
        input: JSON.stringify({ tool_name: "Bash", tool_input: { command: "git push origin HEAD:refs/heads/feat/x" } }),
        env: { ...process.env, CLAUDE_PROJECT_DIR: path },
      },
    );
    const verifyProducer = fileURLToPath(new URL("../scripts/verify-evidence-producer.mjs", import.meta.url));
    const produceVerifyEvidence = () => spawnSync(process.execPath, [verifyProducer, "--root", path, "--out", "evidence/verify-latest.json"], {
      cwd: path, encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: path },
    });
    const securityScanScript = fileURLToPath(new URL("../scripts/security-scan.mjs", import.meta.url));
    const produceSecurityEvidenceNoScanners = () => spawnSync(process.execPath, [securityScanScript, "--root", path], {
      cwd: path, encoding: "utf8", env: {},
    });
    const state = (argv, deps = {}) => {
      const stderr = [];
      const originalError = console.error;
      console.error = (...values) => { stderr.push(values.join(" ")); };
      let code;
      try {
        code = pipelineStateRun(argv, { dir: path, writeError: (value) => stderr.push(String(value)), ...deps });
      } finally {
        console.error = originalError;
      }
      return { code, stderr: stderr.join("") };
    };
    // NVA-R39-GENESISWIRE-RETRY (PO decision, 2026-08-29, backlog:
    // 2026-08-29-a-node-script-defeats-every-file-protection-guard.md): `--no-verify`
    // is the sanctioned escape ONLY for a later, already-tracked-file admin edit --
    // distinct from the genesis-commit first-appearance exemption above it, which the
    // FIRST `commit("seeded consumer")` call below still relies on unaided.
    const commit = (message, { noVerify = false } = {}) => {
      hostGit(path, ["add", "-A"]);
      hostGit(path, noVerify ? ["commit", "-q", "--no-verify", "-m", message] : ["commit", "-q", "-m", message]);
    };

    commit("seeded consumer");
    const refused = attemptPush();
    assert.equal(refused.status, 2, `the seeded gate must refuse: ${refused.stderr}`);
    assert.match(String(refused.stderr), /evidence\/security-latest\.json missing/u,
      "the security gate's own missing-evidence finding is in the refusal");

    // Drive the PUSH bucket (verify evidence + approval) fully green first.
    const calibrationPath = join(path, "project", "pipeline.json");
    const calibration = JSON.parse(readFileSync(calibrationPath, "utf8"));
    calibration.verify = `${JSON.stringify(process.execPath)} -e "process.exit(0)"`;
    writeFileSync(calibrationPath, `${JSON.stringify(calibration, null, 2)}\n`);
    const userPath = join(path, "pipeline.user.yaml");
    writeFileSync(userPath, readFileSync(userPath, "utf8").replace(/human_approval: "?signature"?/u, 'human_approval: "chat"'));
    commit("configure verify and global human approval", { noVerify: true });
    assert.equal(state(["materialize-push-threat-model"]).code, 0);
    commit("push threat model");
    assert.equal(produceVerifyEvidence().status, 0, "a configured, passing verify command must yield evidence");
    const approved = state(["approve-push", "--by", "po", "--remote", "origin", "--destination", "refs/heads/feat/x"], {
      isattyFn: () => { throw new Error("global chat must not inspect a terminal"); },
      readLineFn: () => { throw new Error("global chat must not read a terminal"); },
    });
    assert.equal(approved.code, 0, approved.stderr);

    // The push bucket is fully satisfied now. Only the security bucket can still refuse.
    const stillRefused = attemptPush();
    assert.equal(stillRefused.status, 2, "the push gate is satisfied, but the security gate alone must still refuse");
    assert.match(String(stillRefused.stderr), /evidence\/security-latest\.json missing/u);
    assert.doesNotMatch(String(stillRefused.stderr), /Push approval missing/u, "only the security bucket should still be complaining");

    // The shipped command the manifest chapter names, run with NO scanner binary
    // reachable at all: a fresh consumer ships no governance/security-controls/
    // catalog.json, so the required-capability plan is empty and the verdict is
    // CLEAN regardless of which scanners are actually present.
    const scanResult = produceSecurityEvidenceNoScanners();
    assert.equal(scanResult.status, 0, `security-scan must exit 0 with no scanners reachable: ${scanResult.stderr}`);
    assert.equal(existsSync(join(path, "evidence", "security-latest.json")), true);
    assert.equal(existsSync(join(path, "evidence", "security-latest.v2.json")), true);
    assert.equal(existsSync(join(path, "evidence", "security-latest.v2.verdict.json")), true);

    const admitted = attemptPush();
    assert.equal(admitted.status, 0, `the fully-satisfied push must be admitted: ${admitted.stderr}`);
  } finally { dispose(path); }
});

// SECGATE-2 (NVA-CF-BL20-SECGATEINSTALLED, backlog:
// 2026-08-28-seed-the-security-gate-on-now-that-its-satisfying-path-is-open.md): SECGATE-1
// above measures the security gate's push-refusal/push-admission shape, but its own dedicated
// scan call runs with an EMPTY environment specifically so gitleaks is never reported
// "installed" -- resolveGitleaksConfigPath() is therefore never invoked at all by that test,
// from this checkout's own location or anywhere else (isInstalled() returns false before
// run() is ever called). That leaves the exact mechanism the backlog item's "Correction"
// section is about -- GITLEAKS_CONFIG_PATH's four-directory climb, which only finds a
// repo-root .gitleaks.toml when the adapter module's OWN on-disk location has one above it --
// entirely unmeasured for the security-scan.mjs orchestration this satisfying path actually
// runs (as opposed to the standalone gitleaks.mjs module, already covered by
// security-adapters/gitleaks.test.mjs's own "installed-plugin fixture" test cited in
// SECGATE-1's comment above).
//
// This test closes that gap: it copies the WHOLE transitive local-import closure of
// security-scan.mjs (traced by hand below, every local `import ... from "./..."` /
// `"../..."` statement followed to its own file, recursively; none of these files imports
// anything else local) into a fresh fixture tree shaped
// `plugins/pipeline-core/{scripts,lib,config,security}/...` with NO repo root anywhere above
// it -- modeling an installed-plugin (marketplace) deployment, the same shape
// gitleaks.test.mjs's own fixture models for the adapter alone. It then imports the FIXTURE's
// own copy of security-scan.mjs (never the real, checkout-resident one) and runs its exported
// `runSecurityScan()` against a real, plain git candidate root, with a stub gitleaks "binary"
// made installed via PIPELINE_GITLEAKS_PATH and trusted via the sanctioned
// `assessTrustedExecutablePath` test seam (mirrors security-scan.test.mjs's own
// mockAssessFixtureBinary) -- so the adapter's real run() path, and therefore its real
// resolveGitleaksConfigPath() call, actually executes from the fixture's own installed-plugin
// location.
//
// Transitive closure (traced 2026-08-29 by following every local import AND re-export
// statement, not only `import` lines -- tool-identity.mjs's own link to
// trusted-tool-resolution.mjs is a bare `export { ... } from "../lib/..."` re-export, caught
// only on a second, broader pass): scripts/security-scan.mjs, scripts/tool-identity.mjs,
// scripts/security-adapters/{gitleaks,osv-scanner,semgrep,license-check}.mjs,
// scripts/pipeline-manifest.schema.json (manifest.mjs's DEFAULT_SCHEMA_PATH, never actually
// read here -- the candidate carries no manifest at all -- copied for completeness),
// lib/manifest.mjs, lib/project-authority.mjs, lib/security-completeness-gate.mjs,
// lib/security-evidence-evaluator.mjs, lib/security-capability-plan-builder.mjs,
// lib/security-policy-resolver.mjs, lib/document-hooks.mjs, lib/yaml-lite.mjs,
// lib/schema-lite.mjs, lib/worktree-lifecycle.mjs, lib/windows-private-state.mjs,
// lib/trusted-tool-resolution.mjs, config/security/gitleaks-default.toml,
// config/security/license-allowlist.default.json, security/semgrep/pipeline.yml (the other two
// plugin-shipped scanner defaults -- copied for fixture completeness even though this test's
// own assertions are gitleaks-specific).
//
// NOT measured here (disclosed, same discipline as SECGATE-1's own comment): guard-push.mjs and
// the onboarding/push-approval machinery are NOT copied into the fixture -- guard-push.mjs only
// READS the evidence security-scan.mjs already wrote (SECGATE-1 proves that half end to end),
// and neither onboarding nor push-approval does any directory-walk-up config resolution of its
// own, so both are orthogonal to the installed-plugin gap this test exists to close.
test("the fixture's own security-scan.mjs call graph, deployed with no repo root above it (installed-plugin shape), resolves gitleaks to the plugin-shipped default config and completes a clean scan (SECGATE-2)", async () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "secgate-installed-fixture-"));
  const scanRootDir = root();
  try {
    hostGit(scanRootDir, ["init", "--initial-branch=main"]);
    hostGit(scanRootDir, ["config", "user.email", "po@example.invalid"]);
    hostGit(scanRootDir, ["config", "user.name", "PO"]);
    hostGit(scanRootDir, ["remote", "add", "origin", "https://example.invalid/pipeline/fixture.git"]);
    writeFileSync(join(scanRootDir, "README.md"), "installed-plugin security-scan fixture candidate\n");
    hostGit(scanRootDir, ["add", "-A"]);
    hostGit(scanRootDir, ["commit", "-q", "-m", "seed candidate"]);

    const COPY_MAP = [
      ["../scripts/security-scan.mjs", ["plugins", "pipeline-core", "scripts", "security-scan.mjs"]],
      ["../scripts/tool-identity.mjs", ["plugins", "pipeline-core", "scripts", "tool-identity.mjs"]],
      ["./trusted-tool-resolution.mjs", ["plugins", "pipeline-core", "lib", "trusted-tool-resolution.mjs"]],
      ["../scripts/security-adapters/gitleaks.mjs", ["plugins", "pipeline-core", "scripts", "security-adapters", "gitleaks.mjs"]],
      ["../scripts/security-adapters/osv-scanner.mjs", ["plugins", "pipeline-core", "scripts", "security-adapters", "osv-scanner.mjs"]],
      ["../scripts/security-adapters/semgrep.mjs", ["plugins", "pipeline-core", "scripts", "security-adapters", "semgrep.mjs"]],
      ["../scripts/security-adapters/license-check.mjs", ["plugins", "pipeline-core", "scripts", "security-adapters", "license-check.mjs"]],
      ["../scripts/pipeline-manifest.schema.json", ["plugins", "pipeline-core", "scripts", "pipeline-manifest.schema.json"]],
      ["./manifest.mjs", ["plugins", "pipeline-core", "lib", "manifest.mjs"]],
      ["./project-authority.mjs", ["plugins", "pipeline-core", "lib", "project-authority.mjs"]],
      ["./security-completeness-gate.mjs", ["plugins", "pipeline-core", "lib", "security-completeness-gate.mjs"]],
      ["./security-evidence-evaluator.mjs", ["plugins", "pipeline-core", "lib", "security-evidence-evaluator.mjs"]],
      ["./security-capability-plan-builder.mjs", ["plugins", "pipeline-core", "lib", "security-capability-plan-builder.mjs"]],
      ["./security-policy-resolver.mjs", ["plugins", "pipeline-core", "lib", "security-policy-resolver.mjs"]],
      ["./document-hooks.mjs", ["plugins", "pipeline-core", "lib", "document-hooks.mjs"]],
      ["./yaml-lite.mjs", ["plugins", "pipeline-core", "lib", "yaml-lite.mjs"]],
      ["./schema-lite.mjs", ["plugins", "pipeline-core", "lib", "schema-lite.mjs"]],
      ["./worktree-lifecycle.mjs", ["plugins", "pipeline-core", "lib", "worktree-lifecycle.mjs"]],
      ["./windows-private-state.mjs", ["plugins", "pipeline-core", "lib", "windows-private-state.mjs"]],
      ["../config/security/gitleaks-default.toml", ["plugins", "pipeline-core", "config", "security", "gitleaks-default.toml"]],
      ["../config/security/license-allowlist.default.json", ["plugins", "pipeline-core", "config", "security", "license-allowlist.default.json"]],
      ["../security/semgrep/pipeline.yml", ["plugins", "pipeline-core", "security", "semgrep", "pipeline.yml"]],
    ];
    for (const [sourceRel, destSegments] of COPY_MAP) {
      const sourcePath = fileURLToPath(new URL(sourceRel, import.meta.url));
      const destPath = join(fixtureRoot, ...destSegments);
      mkdirSync(join(fixtureRoot, ...destSegments.slice(0, -1)), { recursive: true });
      copyFileSync(sourcePath, destPath);
    }
    // Sanity: this fixture models a deployment with NO repo root at all above `plugins/` --
    // the exact shape GITLEAKS_CONFIG_PATH's four-directory climb must fail to find a
    // repo-root .gitleaks.toml in, forcing the plugin-shipped-default branch.
    assert.equal(existsSync(join(fixtureRoot, ".gitleaks.toml")), false, "sanity: fixture must carry no repo-root .gitleaks.toml");

    const fixtureSecurityScanUrl = pathToFileURL(join(fixtureRoot, "plugins", "pipeline-core", "scripts", "security-scan.mjs")).href;
    const fixtureSecurityScan = await import(fixtureSecurityScanUrl);

    const stubGitleaksBinary = join(fixtureRoot, "gitleaks-stub");
    writeFileSync(stubGitleaksBinary, "not a real binary -- fixtureSpawn below is fully substituted\n");

    let invokedConfigArg = "unset (spawnFn never reached --report-path)";
    const fixtureSpawn = (_cmd, args = []) => {
      const reportIdx = args.indexOf("--report-path");
      if (reportIdx === -1) return { status: 0, stdout: "", stderr: "", error: null };
      const configIdx = args.indexOf("--config");
      invokedConfigArg = configIdx === -1 ? null : args[configIdx + 1];
      writeFileSync(args[reportIdx + 1], "[]");
      return { status: 0, stdout: "", stderr: "", error: null };
    };

    const { evidence, exitCode } = await fixtureSecurityScan.runSecurityScan({
      rootDir: scanRootDir,
      env: { PIPELINE_GITLEAKS_PATH: stubGitleaksBinary },
      spawnFn: fixtureSpawn,
      timeoutMs: 20000,
      assessTrustedExecutablePath: () => ({ ok: true, path: stubGitleaksBinary }),
    });

    const expectedFixtureDefault = join(fixtureRoot, "plugins", "pipeline-core", "config", "security", "gitleaks-default.toml");
    assert.equal(invokedConfigArg, expectedFixtureDefault,
      "the fixture's own security-scan.mjs must resolve gitleaks's --config to ITS OWN copy of the plugin-shipped default, never a this-checkout path");
    const realRepoRoot = fileURLToPath(new URL("../../..", import.meta.url));
    assert.ok(!String(invokedConfigArg).startsWith(realRepoRoot),
      `the resolved config must not point back into this repository's real checkout (${realRepoRoot}) at all, got: ${invokedConfigArg}`);

    const gitleaksEntry = evidence.scanners.find((s) => s.tool === "gitleaks");
    assert.equal(gitleaksEntry?.status, "PASS", `gitleaks must actually run and pass from the installed-plugin fixture: ${JSON.stringify(gitleaksEntry)}`);
    assert.equal(exitCode, 0, `a clean scan from the installed-plugin fixture must exit 0: ${JSON.stringify(evidence.scanners)}`);
    assert.equal(existsSync(join(scanRootDir, "evidence", "security-latest.json")), true);
  } finally {
    dispose(scanRootDir);
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

// PUSHPROOF-1. Backlog:
// 2026-08-09-critical-human-proof-not-materialized-for-signature-mode. Before
// this seed existed, a fresh project had NO `project/critical-human-proof.json`
// at all, so the very first `approve-push` in `signature` mode -- this repo's
// own default, and the mode PUSHSEED-2 above does NOT exercise -- refused with
// `CRITICAL-PROOF-POLICY-KIND-REQUIRED` instead of reaching the proof-flag gate
// PUSHSEED-2 measures. The only way out was the full signed Human-Guard-Override
// ceremony just to create the one file that declares `push` as proof-requiring.
//
// Driven end to end in a REAL temporary root, the same standard as PUSHSEED-2,
// for BOTH `gates.push_approval` modes: onboarding must materialize the policy
// file regardless of which mode a project's operator later chooses, because
// that choice is made in `pipeline.user.yaml` -- editable at any point after
// onboarding -- not at onboarding time itself.
//
// `signature` half: `approve-push` in signature mode demands SIX flags
// (--by/--remote/--destination/--proof-request/--proof-authority/--proof) --
// `parseExactFlags` refuses BEFORE `verifyCriticalHumanProof` is ever reached
// if even one is missing, and with the policy file absent that earlier refusal
// fires regardless of this fix. All six MUST be supplied here so the command
// actually reaches the policy-kind check this test exists to pin; fewer flags
// only demonstrates the unrelated flag-parsing refusal and would pass
// unchanged whether or not this fix exists.
//
// `chat` half: the committed global `human_approval: chat` stand-down is read
// BEFORE `requiredKinds` is even consulted, so a chat-mode
// `approve-push` succeeds whether or not `project/critical-human-proof.json`
// exists -- there is no policy-kind refusal to reproduce here, pre- or
// post-fix. This half is therefore driven end to end (PUSHSEED-2's chat
// shape) as a regression guard: the seeded policy file must not break the
// already-satisfiable chat path.
test("onboarding materializes project/critical-human-proof.json declaring push, for both global human approval modes", () => {
  const signatureRoot = root();
  const chatRoot = root();
  try {
    for (const { path, mode } of [{ path: signatureRoot, mode: "signature" }, { path: chatRoot, mode: "chat" }]) {
      hostGit(path, ["init", "--initial-branch=main"]);
      hostGit(path, ["config", "user.email", "po@example.invalid"]);
      hostGit(path, ["config", "user.name", "PO"]);
      const seed = planProjectOnboardingV3({ runner: "codex", rootDir: path, deps: fakeDeps });
      assert.equal(applyProjectOnboardingV3(seed, { rootDir: path, activate: true, deps: fakeDeps }).status, "applied");

      // The file exists at onboarding, not after a manual follow-up command.
      const policyPath = join(path, "project", "critical-human-proof.json");
      assert.equal(existsSync(policyPath), true, `${mode}: critical-human-proof.json must be materialized at onboarding`);
      const policy = JSON.parse(readFileSync(policyPath, "utf8"));
      assert.equal(policy.schema, "pipeline.critical-human-proof-policy.v1");
      assert.deepEqual(policy.requiredKinds, ["push"]);

      // A REAL subprocess, not the in-process `run()` entry point: the CLI's
      // refusal text is written with `console.error` directly, which the
      // in-process call has no way to intercept, so pattern-matching the
      // refusal (the whole point of this half) needs the real stderr stream.
      const state = (...args) => spawnSync(process.execPath, [PIPELINE_STATE_SCRIPT, ...args], {
        cwd: path, encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: path },
      });
      // `gates.push_approval` is read from COMMITTED bytes (ADR-0056), same as
      // PUSHSEED-2 above.
      const commit = (message) => { hostGit(path, ["add", "-A"]); hostGit(path, ["commit", "-q", "-m", message]); };
      if (mode === "chat") {
        const userPath = join(path, "pipeline.user.yaml");
        writeFileSync(userPath, readFileSync(userPath, "utf8").replace(/human_approval: "?signature"?/u, 'human_approval: "chat"'));
      }
      commit(`seeded consumer (${mode})`);

      // The artifact `approve-push` binds, for both modes -- required before
      // either can reach its own next real gate (PUSHSEED-2's step (4)).
      assert.equal(state("materialize-push-threat-model").status, 0);
      commit(`push threat model (${mode})`);

      if (mode === "signature") {
        // Before this fix: refused with CRITICAL-PROOF-POLICY-KIND-REQUIRED,
        // because no policy file existed to declare `push` at all. All six
        // flags are supplied (see comment above the test) so the command
        // actually reaches `verifyCriticalHumanProof` rather than refusing
        // earlier at `parseExactFlags` for an unrelated reason. The proof
        // paths are deliberately unresolvable -- reaching the resulting
        // CRITICAL-PROOF-EXTERNAL-PATH refusal (rather than a completed
        // signed approval, which is out of this test's scope) is itself the
        // proof that the policy-kind check was satisfied and passed through.
        const attempted = state(
          "approve-push", "--by", "po", "--remote", "origin", "--destination", "refs/heads/feat/x",
          "--proof-request", "unused-request.json", "--proof-authority", "unused-authority.json", "--proof", "unused-proof.json",
        );
        assert.equal(attempted.status, 2, attempted.stderr);
        assert.doesNotMatch(String(attempted.stderr), /CRITICAL-PROOF-POLICY-KIND-REQUIRED/u,
          "a fresh signature-mode project must not be refused for an undeclared push policy");
        assert.match(String(attempted.stderr), /CRITICAL-PROOF-EXTERNAL-PATH/u,
          "the refusal must be the external-proof gate reached AFTER the policy-kind check, not the policy-kind refusal itself");
      } else {
        // Global `chat` stands the private-key proof down before `requiredKinds`
        // is even consulted, so this
        // half exercises `approve-push` to a genuine completed approval
        // (PUSHSEED-2's chat shape) rather than a proxy command: materializing
        // the policy file must not regress the already-satisfiable chat path.
        // No terminal/copy-back confirmation is permitted under this global
        // posture, so the real CLI subprocess must complete directly.
        const approved = state("approve-push", "--by", "po", "--remote", "origin", "--destination", "refs/heads/feat/x");
        assert.equal(approved.status, 0, `global chat approval must be terminal-free: ${approved.stderr}`);
      }
    }
  } finally { dispose(signatureRoot); dispose(chatRoot); }
});

// IGNORESEED-1. Both halves. The Pipeline tells every agent to write into
// `scratch/` and every evidence producer to write into `evidence/`, and ignored
// neither -- the bootstrap skill said so in its own text, which made it a
// documented gap rather than an unknown one. `evidence/` is the one that bites:
// `security-scan.mjs` refuses a dirty working tree, so the evidence the push gate
// demands is what makes the scan producing the rest of it impossible.
// `project/pipeline-state.json` bites the same way from the other direction: it
// changes on nearly every `pipeline-state.mjs` command (including `approve-push`
// itself), so leaving it trackable dirties the tree on every command and can
// invalidate an already-signed, commit-bound push approval if re-committed
// (`docs/state.md`, GF-084).
//
// The other half is the boundary: appending to a `.gitignore` a project already
// owns is a different decision with a different cost, and the seed does not take
// it unasked.
test("onboarding seeds ignore rules for the paths it writes into, and never touches a .gitignore the project owns", () => {
  const fresh = root();
  const owned = root();
  try {
    // A REAL repository, because the second half of this check is what Git itself
    // does with the rules -- an assertion about the file's text alone would not
    // have caught an unanchored rule reaching a nested directory.
    hostGit(fresh, ["init", "--initial-branch=main"]);
    const plan = planProjectOnboardingV3({ runner: "codex", rootDir: fresh, deps: fakeDeps });
    const freshApplied = applyProjectOnboardingV3(plan, { rootDir: fresh, activate: true, deps: fakeDeps });
    assert.equal(freshApplied.status, "applied");
    // DoD 3: a project with no .gitignore behaves exactly as today -- the
    // from-scratch seed already covers every required pattern, so the
    // owned-.gitignore ask below must never also fire here.
    assert.equal(Object.prototype.hasOwnProperty.call(freshApplied, "projectIgnoreGapAction"), false,
      "a freshly seeded .gitignore already satisfies every required pattern; no ask is needed");
    const seeded = readFileSync(join(fresh, ".gitignore"), "utf8");
    assert.match(seeded, /^\/scratch\/$/mu, "the directory the bootstrap skill sends every agent to");
    assert.match(seeded, /^\/evidence\/$/mu, "the directory the shipped evidence producers write to");
    assert.match(seeded, /^\/project\/pipeline-state\.json$/mu, "pipeline-state.mjs's own working-tree state file");
    // Anchored, so `backlog/evidence/` and friends are NOT swallowed. This exact
    // one-character omission already cost this repository its closure citations.
    assert.equal(seeded.includes("\nevidence/"), false, "the rule must be anchored, never bare `evidence/`");
    assert.equal(seeded.includes("\nscratch/"), false, "the rule must be anchored, never bare `scratch/`");
    // And it is a real ignore, not just a file: Git itself must agree. The seed
    // initializes the repository, so `git check-ignore` runs against the real thing.
    // `hostGit` asserts exit 0, so it cannot express a check whose non-zero exit
    // is the meaningful answer; `check-ignore` is exactly that shape.
    const checkIgnore = (candidate) => spawnSync("git", ["check-ignore", "-q", candidate],
      { cwd: fresh, encoding: "utf8" }).status;
    for (const candidate of [
      "scratch/note.md",
      "evidence/verify-latest.json",
      "project/pipeline-state.json",
      ".claude/worktrees/agent-abc123/note.md",
      ".claude/settings.local.json",
      ".claude/.usage-2026-08-29.json",
      ".claude/.stop-suggest-2026-08-29.json",
      ".claude/.pipeline-install-consent-2026-08-29.json",
      ".claude/.main-session-model-identity-2026-08-29.json",
    ]) {
      assert.equal(checkIgnore(candidate), 0, `git must ignore ${candidate}`);
    }
    // ...and it must NOT reach a nested evidence directory a project may own.
    assert.notEqual(checkIgnore("backlog/evidence/x.md"), 0,
      "an anchored rule must not swallow a nested evidence directory");
    // A dirty `.claude/` session-scratch subpath must never block verify's
    // tree-cleanliness check, but tracked config under `.claude/` (the config
    // this project's own onboarding wrote) must stay unaffected -- never
    // swallowed by a blanket `.claude/` ignore.
    assert.notEqual(checkIgnore(".claude/settings.json"), 0,
      "tracked .claude/ config must never be swallowed by the session-scratch entries");

    // GF-084 regression: the seed is USELESS if `project/pipeline-state.json` can
    // already be tracked before it takes effect. Investigation found no such
    // window in this module -- `pipeline-state.mjs` (out of scope here) is the
    // only writer of that file, and it can only run once onboarding's own
    // authority files exist, i.e. strictly after `applyProjectOnboardingV3` has
    // already written this exact `.gitignore` synchronously. This proves the
    // "in practice" half against a REAL repository rather than trusting that
    // reasoning alone: create the file the way it first appears in the wild (a
    // later writer, simulated directly since `pipeline-state.mjs` is not under
    // test here), then run the real `git add -A` a first commit would use, and
    // confirm the index never picked it up.
    writeFileSync(join(fresh, "project", "pipeline-state.json"), "{}\n");
    hostGit(fresh, ["add", "-A"]);
    const staged = spawnSync("git", ["ls-files", "project/pipeline-state.json"],
      { cwd: fresh, encoding: "utf8" }).stdout.trim();
    assert.equal(staged, "", "project/pipeline-state.json must never be staged by `git add -A` once it exists");

    // A project that already owns one keeps it byte for byte, and gets no target.
    const ownedBytes = "# mine\nnode_modules/\n";
    writeFileSync(join(owned, ".gitignore"), ownedBytes);
    const ownedPlan = planProjectOnboardingV3({ runner: "codex", rootDir: owned, deps: fakeDeps });
    assert.equal(ownedPlan.targets.some((target) => target.path === ".gitignore"), false,
      "a project-owned .gitignore is never a target");
    const ownedApplied = applyProjectOnboardingV3(ownedPlan, { rootDir: owned, activate: true, deps: fakeDeps });
    assert.equal(ownedApplied.status, "applied");
    assert.equal(readFileSync(join(owned, ".gitignore"), "utf8"), ownedBytes,
      "the project's own ignore file is untouched");

    // The boundary is never "rewrite the file", but it must not be silence
    // either (2026-08-28 backlog:
    // the-push-gate-is-unsatisfiable-in-any-installed-plugin-deployment.md):
    // an owned .gitignore missing these exact anchored entries gets a real
    // ask-step, additive alongside "applied" -- never a passive diagnostic
    // (that pattern was already tried once, for author identity, and found
    // insufficient) and never a mutation of the file it is asking about.
    assert.equal(ownedApplied.diagnostics.length, 0, "the ask-step replaces any passive diagnostic entirely");
    assert.equal(ownedApplied.projectIgnoreGapAction.kind, "collect-input");
    assert.equal(ownedApplied.projectIgnoreGapAction.mutation, false);
    assert.match(ownedApplied.projectIgnoreGapAction.guidance, /\/scratch\//u);
    assert.match(ownedApplied.projectIgnoreGapAction.guidance, /\/evidence\//u);
    assert.match(ownedApplied.projectIgnoreGapAction.guidance, /\/project\/pipeline-state\.json/u);
    assert.match(ownedApplied.projectIgnoreGapAction.guidance, /\/\.claude\/worktrees\//u);
    assert.match(ownedApplied.projectIgnoreGapAction.guidance, /\/\.claude\/settings\.local\.json/u);
    assert.equal(readFileSync(join(owned, ".gitignore"), "utf8"), ownedBytes,
      "the ask-step itself must never mutate the file it is asking about");

    // A project whose owned .gitignore already carries every required entry
    // (just interleaved with its own rules, never in the exact seed layout)
    // gets no ask at all -- the check is content-based, not byte-identity.
    const complete = root();
    try {
      const completeBytes = "# mine\nnode_modules/\n/scratch/\n/evidence/\n/project/pipeline-state.json\n/.claude/worktrees/\n/.claude/settings.local.json\n/.claude/.usage-*.json\n/.claude/.stop-suggest-*.json\n/.claude/.pipeline-install-consent-*.json\n/.claude/.main-session-model-identity-*.json\n";
      writeFileSync(join(complete, ".gitignore"), completeBytes);
      const completeApplied = applyProjectOnboardingV3(
        planProjectOnboardingV3({ runner: "codex", rootDir: complete, deps: fakeDeps }),
        { rootDir: complete, activate: true, deps: fakeDeps },
      );
      assert.equal(completeApplied.status, "applied");
      assert.equal(Object.prototype.hasOwnProperty.call(completeApplied, "projectIgnoreGapAction"), false,
        "an owned .gitignore that already covers every required pattern is never asked about");
      assert.equal(readFileSync(join(complete, ".gitignore"), "utf8"), completeBytes,
        "an already-complete owned .gitignore is untouched too");
    } finally { dispose(complete); }
  } finally { dispose(fresh); dispose(owned); }
});

// NVA-R9-PREPUSHHOOK (backlog:
// 2026-08-28-the-pre-push-hook-is-offered-not-installed-so-the-git-backstop-can-be-absent.md).
// The git-porcelain pre-push backstop gets the SAME treatment `.gitignore` seeding
// gets immediately above: installed unconditionally during the first real onboarding
// apply, never behind a separate confirmation step. Proven against a real repository
// (real `.git`, real `execFileSync("git", ...)` inside pre-push-hook-install.mjs's own
// `resolveGitPaths` -- that call is never routed through the injected `fakeDeps`), so a
// pass here means git itself, not just this suite's fixture, agrees the hook exists.
test("onboarding installs the pre-push git hook by default -- no confirmation, no separate offer step", () => {
  const path = root();
  try {
    hostGit(path, ["init", "--initial-branch=main"]);
    const plan = planProjectOnboardingV3({ runner: "codex", rootDir: path, deps: fakeDeps });
    const applied = applyProjectOnboardingV3(plan, { rootDir: path, activate: true, deps: fakeDeps });
    assert.equal(applied.status, "applied");
    // Never asked: `applyProjectOnboardingV3` above took no confirmation input at all,
    // yet the installer's OWN planner now reports a hook it wrote and can upgrade --
    // "ready-to-upgrade" is only reachable when a hook is present AND its content
    // hashes match this installer's own marker (pre-push-hook-install.mjs's
    // `planInstall`), so this is never satisfied by an unrelated file merely existing
    // at that path.
    const postInstallPlan = planPrePushHookInstall({ rootDir: path });
    assert.equal(postInstallPlan.status, "ready-to-upgrade", JSON.stringify(postInstallPlan));
    assert.equal(existsSync(join(path, ".git", "hooks", "pre-push")), true);
  } finally { dispose(path); }
});

test("a project that already owns a pre-push hook is never overwritten by onboarding", () => {
  const path = root();
  try {
    hostGit(path, ["init", "--initial-branch=main"]);
    const hooksDir = join(path, ".git", "hooks");
    mkdirSync(hooksDir, { recursive: true });
    const foreignHookPath = join(hooksDir, "pre-push");
    const foreignBytes = "#!/bin/sh\necho 'a human already owns this hook'\nexit 0\n";
    writeFileSync(foreignHookPath, foreignBytes, { mode: 0o755 });
    chmodSync(foreignHookPath, 0o755);
    const plan = planProjectOnboardingV3({ runner: "codex", rootDir: path, deps: fakeDeps });
    const applied = applyProjectOnboardingV3(plan, { rootDir: path, activate: true, deps: fakeDeps });
    // Onboarding itself must never fail just because a foreign hook already exists --
    // this is a best-effort backstop install, not a precondition for onboarding.
    assert.equal(applied.status, "applied");
    assert.equal(readFileSync(foreignHookPath, "utf8"), foreignBytes,
      "a project-owned pre-push hook must be byte-for-byte untouched by onboarding");
    const postPlan = planPrePushHookInstall({ rootDir: path });
    assert.equal(postPlan.status, "foreign-hook-present", JSON.stringify(postPlan));
  } finally { dispose(path); }
});

// DoD: "the hook, once installed, actually refuses a push that the gate would refuse,
// and admits one it would admit. A hook that installs but never fires is the same
// defect wearing a different hat." This spawns the EXACT hook file onboarding itself
// wrote -- never re-installed by the test -- with a real git pre-push stdin payload,
// exactly as git would invoke it, matching the technique
// pre-push-hook-install.test.mjs's own `runInstalledHook` already uses to prove this
// same generated hook fires correctly in isolation.
test("the hook onboarding installs actually fires: blocks a push the gate would refuse, allows one it would admit", () => {
  const path = root();
  try {
    hostGit(path, ["init", "--initial-branch=main"]);
    const plan = planProjectOnboardingV3({ runner: "codex", rootDir: path, deps: fakeDeps });
    const applied = applyProjectOnboardingV3(plan, { rootDir: path, activate: true, deps: fakeDeps });
    assert.equal(applied.status, "applied");
    const installed = planPrePushHookInstall({ rootDir: path });
    assert.equal(installed.status, "ready-to-upgrade");
    const hookPath = installed.hookPath;
    assert.equal(existsSync(hookPath), true);

    // gates.push: blocking, no verify evidence at all -- the gate would refuse this.
    mkdirSync(join(path, "project"), { recursive: true });
    writeFileSync(join(path, "project", "pipeline.yaml"), "schema: pipeline.manifest.v0\ngates:\n  push:\n    mode: blocking\n    type: human\n    approval: standing-approved\n");
    hostGit(path, ["add", "-A"]);
    hostGit(path, ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "manifest"]);
    const commit = hostGit(path, ["rev-parse", "HEAD"]);
    const stdin = `refs/heads/main ${commit} refs/heads/main ${"0".repeat(40)}\n`;
    const blocked = spawnSync(hookPath, ["origin", "https://example.invalid/repo.git"], { cwd: path, input: stdin, encoding: "utf8", timeout: 15000 });
    assert.notEqual(blocked.status, 0, `expected the installed hook to block; stderr=${blocked.stderr}`);
    assert.match(blocked.stderr, /BLOCKED/u);

    // Now satisfy the gate -- fresh verify evidence bound to this exact commit.
    mkdirSync(join(path, "evidence"), { recursive: true });
    writeFileSync(join(path, "evidence", "verify-latest.json"), JSON.stringify({ exitCode: 0, commit }));
    const allowed = spawnSync(hookPath, ["origin", "https://example.invalid/repo.git"], { cwd: path, input: stdin, encoding: "utf8", timeout: 15000 });
    assert.equal(allowed.status, 0, `expected the installed hook to allow; stderr=${allowed.stderr}`);
  } finally { dispose(path); }
});

// IGNORESEED-2 (2026-08-28 backlog:
// the-push-gate-is-unsatisfiable-in-any-installed-plugin-deployment.md,
// consumer HA). The ask-step above only NAMES the gap; this drives the
// actual state a push signature needs. HA's dead end happened in two acts:
// first `evidence/verify-latest.json` dirtied the tree, which was still
// escapable by a commit (the entry was missing, so it got added and
// committed BEFORE signing); then the security scan wrote three more
// artifacts AFTER the signature already existed, where no commit was
// permitted and there was no way back. This test fulfills the ask exactly as
// its own guidance says to (ordinary tools, onto the project's own file,
// never onboarding itself) and then drives the second act directly: the
// shipped producers' output shape, written as if a signature already
// existed, must never need a commit to become clean.
test("once an owned .gitignore's ask is fulfilled with ordinary tools, the evidence-circle can never reopen", () => {
  const path = root();
  try {
    hostGit(path, ["init", "--initial-branch=main"]);
    writeFileSync(join(path, ".gitignore"), "# mine\nnode_modules/\n");
    const plan = planProjectOnboardingV3({ runner: "codex", rootDir: path, deps: fakeDeps });
    const applied = applyProjectOnboardingV3(plan, { rootDir: path, activate: true, deps: fakeDeps });
    assert.equal(applied.status, "applied");
    assert.equal(applied.projectIgnoreGapAction.kind, "collect-input");

    // Fulfilling the ask: append, with ordinary tools, exactly the anchored
    // lines the ask's own guidance names (already pinned by the assertions
    // above) -- never a rewrite, an append onto the project's own bytes.
    const gitignorePath = join(path, ".gitignore");
    const beforeAppend = readFileSync(gitignorePath, "utf8");
    writeFileSync(gitignorePath, `${beforeAppend}\n/scratch/\n/evidence/\n/project/pipeline-state.json\n/.claude/worktrees/\n/.claude/settings.local.json\n/.claude/.usage-*.json\n/.claude/.stop-suggest-*.json\n/.claude/.pipeline-install-consent-*.json\n/.claude/.main-session-model-identity-*.json\n`);

    // A first commit -- the onboarding scaffold plus the now-repaired
    // .gitignore -- stands in for the candidate a push signature would bind.
    hostGit(path, ["add", "-A"]);
    hostGit(path, ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "onboarding scaffold"]);

    // Act two: the shipped evidence/security producers' output shape,
    // written as if that commit were already signed.
    mkdirSync(join(path, "scratch"), { recursive: true });
    writeFileSync(join(path, "scratch", "note.md"), "agent scratch\n");
    mkdirSync(join(path, "evidence"), { recursive: true });
    writeFileSync(join(path, "evidence", "verify-latest.json"), "{}\n");
    writeFileSync(join(path, "evidence", "security-latest.json"), "{}\n");
    writeFileSync(join(path, "project", "pipeline-state.json"), "{}\n");

    const checkIgnore = (candidate) => spawnSync("git", ["check-ignore", "-q", candidate],
      { cwd: path, encoding: "utf8" }).status;
    for (const candidate of ["scratch/note.md", "evidence/verify-latest.json", "evidence/security-latest.json", "project/pipeline-state.json"]) {
      assert.equal(checkIgnore(candidate), 0, `git must ignore ${candidate} once the ask is fulfilled`);
    }
    hostGit(path, ["add", "-A"]);
    const status = spawnSync("git", ["status", "--porcelain"], { cwd: path, encoding: "utf8" }).stdout;
    assert.equal(status, "", "the tree must never need a commit to become clean once the ask is fulfilled -- "
      + "this is the exact state that was a dead end after HA's signature already existed");
  } finally { dispose(path); }
});

// AUTHORID-1. Both 2026-08-09 greenfield runs lost a PO turn to `Author identity
// unknown` at their first commit. Onboarding initializes the repository and never
// looked at whether anything could commit into it, so the stop landed several
// steps later, mid-implementation, where only the human could answer. A
// warn-only diagnostic (2026-08-09) fixed the discovery timing but sat as one
// passive entry in the generic `diagnostics` array -- easy to miss, never a real
// ask. 2026-08-10 PO instruction: ask and set at setup time instead (backlog:
// 2026-08-10-git-identity-warn-only-diagnostic-does-not-meet-po-expectation.md).
//
// The seed still never configures an identity itself: an author identity is a
// claim about who a human is, and a seed inventing one would put a fabricated
// name in permanent history -- worse than the stop it prevents. Only the
// delivery mechanism changed, from a passive diagnostic to a real ask-step.
//
// AUTHORID-2 (2026-08-17 follow-on refinement, backlog:
// 2026-08-17-git-identity-must-be-set-immediately-before-first-commit-not-at-
// setup-time.md). A live Codex happy-path restart test showed the "ask early"
// half of AUTHORID-1 working as intended, but the agent then ran `git config`
// immediately, before onboarding readiness -- that is the part this refines.
// The ask still fires at the same point and still asks for both fields at
// once; only the guidance text changed, to explicitly defer the `git config`
// write until immediately before the repository's first commit.
test("onboarding asks for a commit author it cannot name, and never invents one", () => {
  const missing = root();
  const configured = root();
  try {
    const plan = planProjectOnboardingV3({ runner: "codex", rootDir: missing, deps: fakeDeps });
    const applied = applyProjectOnboardingV3(plan, { rootDir: missing, activate: true, deps: fakeDeps });
    // (a) missing identity now triggers a real ask-step, not only a diagnostic.
    assert.equal(applied.status, "applied", "the ask never fails the seed's own transaction");
    assert.equal(applied.diagnostics.length, 0, "the ask-step replaces the passive diagnostic entirely");
    assert.equal(applied.nextAction.kind, "collect-input");
    assert.equal(applied.nextAction.mutation, false);
    assert.equal(applied.nextAction.inputs.length, 2);
    const fieldNames = applied.nextAction.inputs.map((input) => input.name).sort();
    assert.deepEqual(fieldNames, ["gitAuthorEmail", "gitAuthorName"]);
    for (const input of applied.nextAction.inputs) {
      assert.equal(input.singleLine, true);
      assert.equal(input.rejectNul, true);
      assert.equal(input.minBytes, 1);
    }
    assert.match(applied.nextAction.guidance, /user\.(name|email)/u, "the guidance must name what is unset");
    assert.match(applied.nextAction.guidance, /git config user\.name/u);
    assert.match(applied.nextAction.guidance, /git config user\.email/u);
    assert.equal(/config\s+--global/u.test(applied.nextAction.guidance), false,
      "the guidance must never name a --global config command");
    assert.match(applied.nextAction.guidance, /never --global/u,
      "the guidance must explicitly rule global scope out");
    assert.match(applied.nextAction.guidance, /immediately before .*first commit/u,
      "the guidance must defer the git config write to immediately before the first commit, never sooner");
    // Asked, never written: the seed must not have configured an identity itself.
    assert.equal(existsSync(join(missing, ".git", "config")) === false
      || !readFileSync(join(missing, ".git", "config"), "utf8").includes("[user]"), true,
      "the seed must not invent an author identity in the repository it created");

    // (c) A repository that already knows its author is unaffected -- no new
    // prompt, no diagnostic, exactly current behavior. `fakeGit` answers nothing
    // for `config --get`, so the identity probe needs a stub that does --
    // otherwise this half would pass for the wrong reason.
    const knowsItsAuthor = {
      ...fakeDeps,
      spawnSync(command, args, options) {
        if (command === "git" && args[0] === "config" && args[1] === "--get") {
          return { status: 0, stdout: "configured\n", stderr: "" };
        }
        return fakeDeps.spawnSync(command, args, options);
      },
    };
    const quiet = applyProjectOnboardingV3(
      planProjectOnboardingV3({ runner: "codex", rootDir: configured, deps: knowsItsAuthor }),
      { rootDir: configured, activate: true, deps: knowsItsAuthor },
    );
    assert.equal(quiet.status, "applied");
    assert.equal(quiet.diagnostics.length, 0, "a configured repository is not warned");
    assert.equal(Object.prototype.hasOwnProperty.call(quiet, "nextAction"), false,
      "a configured repository is not asked");
  } finally { dispose(missing); dispose(configured); }
});

// (b) Once the PO answers the ask-step above, the values it names as the
// fulfillment mechanism (`git config user.name`/`git config user.email`, no
// `--activate`-shaped apply and no library write path exists for this --
// setting two git-config values is the whole mutation) land in the freshly
// created repository's LOCAL config only. `GIT_CONFIG_GLOBAL` is pointed at a
// throwaway path for the whole test so a regression that ever added `--global`
// is caught here rather than ever touching this machine's real global config.
// Uses a real Git repository (host `git init`, not the suite's `fakeGit` stub,
// whose `.git` is an empty placeholder directory) because the assertions below
// exercise real `git config` read/write semantics.
test("the PO's answered author identity is written to local git config only, never global", () => {
  const path = root();
  const globalConfig = join(path, ".would-be-global-config");
  try {
    hostGit(path, ["init", "--initial-branch=main"]);
    const env = {
      ...process.env,
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: globalConfig,
      LC_ALL: "C",
    };
    const name = "Test PO";
    const email = "test-po@example.invalid";
    // Exactly the two commands named in applied.nextAction.guidance -- no
    // `--global` anywhere.
    const setName = spawnSync("git", ["config", "user.name", name], { cwd: path, encoding: "utf8", env });
    assert.equal(setName.status, 0, setName.stderr);
    const setEmail = spawnSync("git", ["config", "user.email", email], { cwd: path, encoding: "utf8", env });
    assert.equal(setEmail.status, 0, setEmail.stderr);
    const readLocalName = spawnSync("git", ["config", "--local", "--get", "user.name"], { cwd: path, encoding: "utf8", env });
    assert.equal(readLocalName.status, 0);
    assert.equal(readLocalName.stdout.trim(), name);
    const readLocalEmail = spawnSync("git", ["config", "--local", "--get", "user.email"], { cwd: path, encoding: "utf8", env });
    assert.equal(readLocalEmail.status, 0);
    assert.equal(readLocalEmail.stdout.trim(), email);
    assert.equal(existsSync(globalConfig), false, "the answer must never be written to a global config file");
    const localConfig = readFileSync(join(path, ".git", "config"), "utf8");
    assert.match(localConfig, /\[user\]/u);
  } finally { dispose(path); }
});

// A runner without a native runtime readback is onboarded exactly as ADR-0057
// decision 2a describes: portable seed, runtime targets, no barrier, and the
// lifecycle standing at `kickoff-required`. This is the state from which the
// kickoff entry points below are exercised.
function initializeClaudeOnboardedRoot(path, deps = fakeDeps) {
  const portable = planProjectOnboardingV3({ rootDir: path, deps, runner: "claude" });
  assert.equal(applyProjectOnboardingV3(portable, { rootDir: path, activate: true, deps }).status, "applied");
  const runtime = planProjectOnboardingLifecycleV4({ rootDir: path, deps, operation: "runtime", runner: "claude" });
  const digest = runtime.nextAction.argv[runtime.nextAction.argv.indexOf("--plan-sha256") + 1];
  const initialized = applyProjectOnboardingLifecycleV4({
    rootDir: path, deps, operation: "runtime", planSha256: digest, activate: true, runner: "claude",
  });
  assert.equal(initialized.runner, "claude");
  assert.equal(initialized.status, "intake-required");
  return initialized;
}

test("a claude-onboarded root reaches a real kickoff plan instead of runtime-attestation-required", () => {
  const path = root();
  try {
    initializeClaudeOnboardedRoot(path);
    const goal = "Ship the Claude-onboarded project";
    const planned = planProjectOnboardingKickoffV4({ rootDir: path, goal, runner: "claude", deps: fakeDeps });
    assert.equal(planned.schema, "pipeline.codex-onboarding-kickoff-plan.v1");
    assert.notEqual(planned.status, "runtime-attestation-required");
    assert.match(planned.planSha256, /^[a-f0-9]{64}$/u);
    // The other half of the same contract: omission is never promoted to this
    // runner. Without the identity the entry point still inspects as Codex,
    // which on this root is the historical Codex-only dead end.
    const substituted = planProjectOnboardingKickoffV4({ runner: "codex", rootDir: path, goal, deps: fakeDeps });
    assert.equal(substituted.schema, "pipeline.project-onboarding.v4");
    assert.equal(substituted.runner, "codex");
    assert.equal(substituted.status, "runtime-attestation-required");
  } finally { dispose(path); }
});

test("a claude-onboarded root completes kickoff apply and becomes a ready lifecycle", () => {
  const path = root();
  try {
    initializeClaudeOnboardedRoot(path);
    const goal = "Ship the Claude-onboarded project";
    const planned = planProjectOnboardingKickoffV4({ rootDir: path, goal, runner: "claude", deps: fakeDeps });
    const applied = applyProjectOnboardingKickoffV4({
      rootDir: path, goal, runner: "claude", planSha256: planned.planSha256, activate: true, deps: fakeDeps,
    });
    assert.equal(applied.schema, "pipeline.project-onboarding.v4");
    assert.equal(applied.runner, "claude");
    assert.equal(applied.status, "ready");
    assert.equal(applied.continuity.status, "valid");
    assert.equal(applied.runtime.status, "readback-not-applicable");
    assert.equal(applied.runtime.barrierSha256, null);
    assert.equal(existsSync(join(path, "project", "pipeline-state.json")), true);
  } finally { dispose(path); }
});

test("codex kickoff plan and apply are unchanged whether the runner is omitted or explicit", () => {
  const path = root();
  try {
    const barrier = initializeRestartRequiredRoot(path); clearRuntimeBarrier(path, barrier);
    const goal = "Codex kickoff regression pin";
    const omitted = planProjectOnboardingKickoffV4({ runner: "codex", rootDir: path, goal, deps: fakeDeps });
    const explicit = planProjectOnboardingKickoffV4({ rootDir: path, goal, runner: "codex", deps: fakeDeps });
    assert.equal(omitted.schema, "pipeline.codex-onboarding-kickoff-plan.v1");
    assert.deepEqual(explicit, omitted);
    const applied = applyProjectOnboardingKickoffV4({
      rootDir: path, goal, runner: "codex", planSha256: omitted.planSha256, activate: true, deps: fakeDeps,
    });
    assert.equal(applied.status, "ready");
    assert.equal(applied.runner, "codex");
    assert.equal(applied.continuity.status, "valid");
  } finally { dispose(path); }
});

// CONTRACT CHANGE, not a loosened pin, mirroring the primary inversion above
// (backlog: absent-runner-flag-silently-defaults-to-codex, decision:
// candidate 1, fail closed). This test's predecessor of the same name pinned
// the opposite: that omitting `--runner` on the kickoff CLI silently resolved
// to Codex. `--runner` is now a caller-supplied requirement for kickoff plan;
// an explicit value still behaves exactly as before (asserted below), while
// an omitted one is now a caller error rather than an assumed identity.
// CONTRACT CORRECTION, not a loosened pin. The predecessor of this test
// asserted the kickoff CLI raised a caller error when --runner was omitted.
// That premise is the defect this dispatch closes: a CLI entry point is
// where "which runner is executing this process" and "which runner is this
// project for" legitimately coincide (see resolveActiveRunner in
// scripts/project-onboarding-v3.mjs), so an omitted --runner now resolves
// from the environment and threads through explicitly -- it never raises,
// and it never passes `undefined` onward to a library helper. Split into two
// tests (RUNDEFAULT-2 field 3, "two levels kept apart"): this one pins the
// non-Claude-Code resolution and keeps the explicit-runner mechanics the
// original test pinned; the sibling below pins the Claude Code resolution.
test("omitting --runner on the kickoff CLI resolves the historical Codex identity outside a Claude Code session, not a caller error", () => {
  const path = root();
  try {
    const barrier = initializeRestartRequiredRoot(path); clearRuntimeBarrier(path, barrier);
    const goal = "Codex kickoff CLI regression pin";
    // AGY-CHATADAPTER-2: every kickoff call in this test uses --language en, so
    // a fixed attended-confirmation seam simulates a human confirming that same
    // value each time.
    const invoke = (args, env = {}) => {
      let stdout = ""; let stderr = "";
      const code = onboardingCli(args, {
        deps: { ...fakeDeps, isattyFn: () => true, readLineFn: () => "en" },
        env,
        write: (chunk) => { stdout += chunk; },
        writeError: (chunk) => { stderr += chunk; },
      });
      return { code, stderr, result: stdout ? JSON.parse(stdout) : null };
    };
    const omitted = invoke(["kickoff", "plan", "--root", path, "--goal", goal, "--language", "en"]);
    assert.equal(omitted.code, 0, omitted.stderr);
    assert.equal(omitted.result.schema, "pipeline.codex-onboarding-kickoff-plan.v1");
    assert.deepEqual(omitted.result.applyAction.argv, [
      ONBOARDING_SCRIPT, "kickoff", "apply", "--root", path, "--goal", goal, "--language", "en",
      "--runner", "codex", "--plan-sha256", omitted.result.planSha256, "--activate",
    ]);
    const explicit = invoke(["kickoff", "plan", "--root", path, "--goal", goal, "--language", "en", "--runner", "codex"]);
    assert.deepEqual(explicit.result, omitted.result);
    const applied = invoke(explicit.result.applyAction.argv.slice(1));
    assert.equal(applied.code, 0, applied.stderr);
    assert.equal(applied.result.status, "ready");
    assert.equal(applied.result.runner, "codex");
  } finally { dispose(path); }
});

test("omitting --runner on the kickoff CLI resolves the active Claude identity inside a Claude Code session", () => {
  const path = root();
  try {
    initializeClaudeOnboardedRoot(path);
    const goal = "Claude kickoff CLI environment resolution";
    // AGY-CHATADAPTER-2: fixed attended-confirmation seam, see the sibling test above.
    const invoke = (args, env) => {
      let stdout = ""; let stderr = "";
      const code = onboardingCli(args, {
        deps: { ...fakeDeps, isattyFn: () => true, readLineFn: () => "en" },
        env,
        write: (chunk) => { stdout += chunk; },
        writeError: (chunk) => { stderr += chunk; },
      });
      return { code, stderr, result: stdout ? JSON.parse(stdout) : null };
    };
    const planned = invoke(["kickoff", "plan", "--root", path, "--goal", goal, "--language", "en"], { CLAUDECODE: "1" });
    assert.equal(planned.code, 0, planned.stderr);
    assert.equal(planned.result.schema, "pipeline.codex-onboarding-kickoff-plan.v1");
    assert.deepEqual(planned.result.applyAction.argv, [
      ONBOARDING_SCRIPT, "kickoff", "apply", "--root", path, "--goal", goal, "--language", "en",
      "--runner", "claude", "--plan-sha256", planned.result.planSha256, "--activate",
    ]);
  } finally { dispose(path); }
});

test("the kickoff CLI applies its closed runner value set: claude is honoured, unknown fails closed", () => {
  const path = root();
  try {
    initializeClaudeOnboardedRoot(path);
    const goal = "Closed runner value set";
    // AGY-CHATADAPTER-2: fixed attended-confirmation seam for the two kickoff
    // calls below that use --language en; the `refusing`-deps override further
    // down replaces `deps` wholesale and never reaches the gate (an unknown
    // --runner is refused at parse() before the gate runs).
    const invoke = (args, overrides = {}) => {
      let stdout = ""; let stderr = "";
      const code = onboardingCli(args, {
        deps: { ...fakeDeps, isattyFn: () => true, readLineFn: () => "en" },
        write: (chunk) => { stdout += chunk; },
        writeError: (chunk) => { stderr += chunk; },
        ...overrides,
      });
      return { code, stdout, stderr, result: stdout.startsWith("{") ? JSON.parse(stdout) : null };
    };
    const planned = invoke(["kickoff", "plan", "--root", path, "--goal", goal, "--language", "en", "--runner", "claude"]);
    assert.equal(planned.code, 0, planned.stderr);
    assert.equal(planned.result.schema, "pipeline.codex-onboarding-kickoff-plan.v1");
    const applied = invoke([
      "kickoff", "apply", "--root", path, "--goal", goal, "--language", "en",
      "--runner", "claude", "--plan-sha256", planned.result.planSha256, "--activate",
    ]);
    assert.equal(applied.code, 0, applied.stderr);
    assert.equal(applied.result.status, "ready");
    assert.equal(applied.result.runner, "claude");

    // An unknown runner is refused by the same closed value set the other
    // subcommands use, and refused before anything is observed: every dependency
    // this deps object exposes throws the moment it is merged.
    const refusing = {
      get spawnSync() { throw new Error("no inspection may happen for an unknown runner"); },
      get observeCodexOnboardingCapabilities() { throw new Error("no inspection may happen for an unknown runner"); },
      get observeOnboardingAppServer() { throw new Error("no inspection may happen for an unknown runner"); },
    };
    const before = names(path);
    for (const command of ["plan", "apply"]) {
      const refused = invoke(
        ["kickoff", command, "--root", path, "--goal", goal, "--runner", "gemini"],
        { deps: refusing },
      );
      assert.equal(refused.code, 2);
      assert.match(refused.stdout, /--runner must be claude or codex/u);
      assert.equal(refused.stderr, "");
      assert.equal(refused.result, null);
    }
    assert.deepEqual(names(path), before);
  } finally { dispose(path); }
});

// Mechanism A (backlog: kickoff-apply-action-drops-the-runner-the-plan-was-
// made-for). Before this fix neither promotion entry point took a `runner`
// at all and both inspected as the hardcoded default `codex`, so promotion
// was unreachable for every non-Codex runner: a Claude project was told it
// owed a Codex attestation and the promotion aborted before reading anything.
function claudePromotedRoot(path, deps = fakeDeps) {
  initializeClaudeOnboardedRoot(path, deps);
  const goal = "Promote under the claude identity";
  const planned = planProjectOnboardingKickoffV4({ rootDir: path, goal, runner: "claude", deps });
  applyProjectOnboardingKickoffV4({
    rootDir: path, goal, runner: "claude", planSha256: planned.planSha256, activate: true, deps,
  });
  mkdirSync(join(path, "specs", "claude-promoted"), { recursive: true });
  const prdPath = "specs/claude-promoted/prd_claude_promoted.md";
  const specPath = "specs/claude-promoted/spec.md";
  const designInputPath = "specs/claude-promoted/design-input.md";
  writeFileSync(join(path, specPath), "# Claude-promoted specification\n");
  const specSha256 = sha256(readFileSync(join(path, specPath)));
  writeFileSync(join(path, prdPath), [
    "<!-- po-language: en -->",
    `<!-- technical-spec-sha256: ${specSha256} -->`,
    PO_GATE_PRD_ACKNOWLEDGEMENT_MARKER,
    "",
    "# Claude-promoted product requirements",
    "",
  ].join("\n"));
  writeFileSync(join(path, designInputPath), "# Claude-promoted design input\n");
  return {
    rootDir: path, profile: "feature", featureId: "claude-promoted-work", planPath: prdPath,
    prdPath, specPath, designInputPath, deps,
  };
}

test("a claude-onboarded root completes kickoff promotion and observes the project as claude, not codex", () => {
  const path = root();
  try {
    const args = claudePromotedRoot(path);
    const plan = planProjectOnboardingKickoffPromotionV4({ ...args, runner: "claude" });
    assert.equal(plan.schema, "pipeline.codex-onboarding-kickoff-promotion-plan.v1");
    assert.equal(plan.runner, "claude");
    const runnerIndex = plan.applyAction.argv.indexOf("--runner");
    assert.notEqual(runnerIndex, -1);
    assert.equal(plan.applyAction.argv[runnerIndex + 1], "claude");
    const applied = applyProjectOnboardingKickoffPromotionV4({ ...args, runner: "claude", planSha256: plan.planSha256, activate: true });
    assert.equal(applied.status, "ready");
    assert.equal(applied.runner, "claude");
    assert.equal(applied.continuity.status, "valid");

    // The other half of the same contract, inverted by the later fail-closed
    // decision (backlog: absent-runner-flag-silently-defaults-to-codex):
    // omission is no longer promoted to Codex -- it is a caller error. Before
    // that decision, an omitted runner here silently observed as Codex, which
    // on this claude-onboarded root was the historical Codex-only dead end
    // that made mechanism A a blocker; now the omission itself is refused
    // before any such silent identity is assumed.
    assert.throws(() => planProjectOnboardingKickoffPromotionV4({ ...args, runner: undefined }), (error) => {
      assert.equal(error.code, "ONBOARDING-RUNNER-REQUIRED");
      return true;
    });
  } finally { dispose(path); }
});

// CONTRACT CORRECTION, not a loosened pin. The predecessor of this test
// asserted a direct library-level call with the runner omitted behaved
// identically to one with `runner: "codex"` explicit. That premise is the
// defect this dispatch closes: a library helper called directly with no
// runner now raises (ONBOARDING-RUNNER-REQUIRED), never silently assumes
// "codex". What is asserted here now is the positive new contract, and the
// explicit-runner mechanics the title originally pinned survive unchanged
// below it.
test("omitting the runner on a direct kickoff promotion call is a caller error, not a silent Codex default", () => {
  const path = root();
  try {
    const barrier = initializeRestartRequiredRoot(path); clearRuntimeBarrier(path, barrier);
    completeKickoff(path, "Codex promotion regression pin");
    mkdirSync(join(path, "specs", "codex-promoted"), { recursive: true });
    const prdPath = "specs/codex-promoted/prd_codex_promoted.md";
    const specPath = "specs/codex-promoted/spec.md";
    const designInputPath = "specs/codex-promoted/design-input.md";
    writeFileSync(join(path, specPath), "# Codex-promoted specification\n");
    const specSha256 = sha256(readFileSync(join(path, specPath)));
    writeFileSync(join(path, prdPath), [
      "<!-- po-language: en -->",
      `<!-- technical-spec-sha256: ${specSha256} -->`,
      PO_GATE_PRD_ACKNOWLEDGEMENT_MARKER,
      "",
      "# Codex-promoted product requirements",
      "",
    ].join("\n"));
    writeFileSync(join(path, designInputPath), "# Codex-promoted design input\n");
    const args = {
      rootDir: path, profile: "feature", featureId: "codex-promoted-work", planPath: prdPath,
      prdPath, specPath, designInputPath, deps: fakeDeps,
    };
    assert.throws(() => planProjectOnboardingKickoffPromotionV4(args), (error) => {
      assert.equal(error.code, "ONBOARDING-RUNNER-REQUIRED");
      assert.equal(error.caller, "planProjectOnboardingKickoffPromotionV4");
      return true;
    });
    const explicit = planProjectOnboardingKickoffPromotionV4({ ...args, runner: "codex" });
    assert.equal(explicit.schema, "pipeline.codex-onboarding-kickoff-promotion-plan.v1");
    const applied = applyProjectOnboardingKickoffPromotionV4({ runner: "codex", ...args, planSha256: explicit.planSha256, activate: true });
    assert.equal(applied.status, "ready");
    assert.equal(applied.runner, "codex");
  } finally { dispose(path); }
});

// Mechanism B / direction 1 (same backlog item): the runner now participates
// in the plan digest, so a plan produced for one runner cannot validate an
// apply reconstructed for another -- the digest mismatch is refused, not
// silently substituted.
test("a kickoff plan produced for one runner does not validate an apply for another", () => {
  const path = root();
  try {
    // A root onboarded natively as codex (barrier cleared) reaches
    // kickoff-required for both runners: codex through its own barrier,
    // claude because it never needed one. That makes this a genuine digest
    // comparison, not an earlier observation-layer refusal.
    const barrier = initializeRestartRequiredRoot(path); clearRuntimeBarrier(path, barrier);
    const goal = "Cross-runner kickoff digest mismatch";
    const claudePlanned = planProjectOnboardingKickoffV4({ rootDir: path, goal, runner: "claude", deps: fakeDeps });
    assert.equal(claudePlanned.schema, "pipeline.codex-onboarding-kickoff-plan.v1");
    assert.throws(() => applyProjectOnboardingKickoffV4({
      rootDir: path, goal, runner: "codex", planSha256: claudePlanned.planSha256, activate: true, deps: fakeDeps,
    }), /kickoff plan digest/u);
    assert.equal(inspectProjectOnboardingV3({ rootDir: path, deps: fakeDeps, runner: "claude" }).status, "intake-required");
    const applied = applyProjectOnboardingKickoffV4({
      rootDir: path, goal, runner: "claude", planSha256: claudePlanned.planSha256, activate: true, deps: fakeDeps,
    });
    assert.equal(applied.status, "ready");
    assert.equal(applied.runner, "claude");
  } finally { dispose(path); }
});

test("a promotion plan produced for one runner does not validate an apply for another", () => {
  const path = root();
  try {
    const barrier = initializeRestartRequiredRoot(path); clearRuntimeBarrier(path, barrier);
    completeKickoff(path, "Cross-runner promotion digest mismatch");
    mkdirSync(join(path, "specs", "cross-runner"), { recursive: true });
    const prdPath = "specs/cross-runner/prd_cross_runner.md";
    const specPath = "specs/cross-runner/spec.md";
    const designInputPath = "specs/cross-runner/design-input.md";
    writeFileSync(join(path, specPath), "# Cross-runner specification\n");
    const specSha256 = sha256(readFileSync(join(path, specPath)));
    writeFileSync(join(path, prdPath), [
      "<!-- po-language: en -->",
      `<!-- technical-spec-sha256: ${specSha256} -->`,
      PO_GATE_PRD_ACKNOWLEDGEMENT_MARKER,
      "",
      "# Cross-runner product requirements",
      "",
    ].join("\n"));
    writeFileSync(join(path, designInputPath), "# Cross-runner design input\n");
    const args = {
      rootDir: path, profile: "feature", featureId: "cross-runner-work", planPath: prdPath,
      prdPath, specPath, designInputPath, deps: fakeDeps,
    };
    const claudePlan = planProjectOnboardingKickoffPromotionV4({ ...args, runner: "claude" });
    assert.equal(claudePlan.schema, "pipeline.codex-onboarding-kickoff-promotion-plan.v1");
    assert.throws(() => applyProjectOnboardingKickoffPromotionV4({
      ...args, runner: "codex", planSha256: claudePlan.planSha256, activate: true,
    }), /promotion plan digest/u);
    const applied = applyProjectOnboardingKickoffPromotionV4({
      ...args, runner: "claude", planSha256: claudePlan.planSha256, activate: true,
    });
    assert.equal(applied.status, "ready");
    assert.equal(applied.runner, "claude");
  } finally { dispose(path); }
});

// Mechanism C (same backlog item): `runtime-attestation-required` after an
// apply-shaped command is a failed transaction (nothing was written), and
// must not exit 0 the way the same status legitimately does for inspect/plan.
test("an apply-shaped runtime-attestation-required exits non-zero; the same status stays a resting point for inspect/plan", () => {
  const path = root();
  try {
    initializeClaudeOnboardedRoot(path);
    const goal = "Exit-code split regression (RUNNERNEUT-1 mechanism C)";
    // AGY-CHATADAPTER-2: fixed attended-confirmation seam for the --language en
    // kickoff calls below.
    const invoke = (args) => {
      let stdout = ""; let stderr = "";
      const code = onboardingCli(args, {
        deps: { ...fakeDeps, isattyFn: () => true, readLineFn: () => "en" },
        write: (chunk) => { stdout += chunk; },
        writeError: (chunk) => { stderr += chunk; },
      });
      return { code, stderr, result: stdout ? JSON.parse(stdout) : null };
    };
    // Same precondition as the originally observed defect, now made explicit
    // rather than implicit (backlog: absent-runner-flag-silently-defaults-to-codex):
    // the CLI is explicitly given the codex identity on a claude-onboarded
    // root, and the apply aborts before writing anything.
    const applied = invoke(["kickoff", "apply", "--root", path, "--goal", goal, "--language", "en", "--plan-sha256", "0".repeat(64), "--activate", "--runner", "codex"]);
    assert.equal(applied.result.status, "runtime-attestation-required");
    assert.equal(applied.code, 1, "an apply that wrote nothing must not exit 0");

    const inspected = invoke(["inspect", "--root", path, "--runner", "codex"]);
    assert.equal(inspected.result.status, "runtime-attestation-required");
    assert.equal(inspected.code, 0, "the same status is still a legitimate resting point for inspect");

    const planned = invoke(["kickoff", "plan", "--root", path, "--goal", goal, "--language", "en", "--runner", "codex"]);
    assert.equal(planned.result.status, "runtime-attestation-required");
    assert.equal(planned.code, 0, "and for plan");
  } finally { dispose(path); }
});

test("kickoff promotion replaces only the exact unapproved seed and is replay-safe across profiles", () => {
  for (const profile of ["epic", "feature", "mini"]) {
    const path = root();
    try {
      const barrier = initializeRestartRequiredRoot(path); clearRuntimeBarrier(path, barrier);
      completeKickoff(path, `Promotion ${profile}`);
      mkdirSync(join(path, "specs", profile), { recursive: true });
      const prdPath = `specs/${profile}/prd_${profile}.md`;
      const specPath = `specs/${profile}/spec.md`;
      const designInputPath = `specs/${profile}/design-input.md`;
      writeFileSync(join(path, specPath), `# ${profile} Spec\n`);
      const specSha256 = sha256(readFileSync(join(path, specPath)));
      writeFileSync(join(path, prdPath), [
        "<!-- po-language: en -->",
        `<!-- technical-spec-sha256: ${specSha256} -->`,
        PO_GATE_PRD_ACKNOWLEDGEMENT_MARKER,
        "",
        `# ${profile} PRD`,
        "",
      ].join("\n"));
      writeFileSync(join(path, designInputPath), `# ${profile} design input\n`);
      const args = {
        rootDir: path, profile, featureId: `${profile}-work`, planPath: prdPath,
        prdPath, specPath, designInputPath, runner: "codex", deps: fakeDeps,
      };
      const plan = planProjectOnboardingKickoffPromotionV4(args);
      assert.equal(plan.schema, "pipeline.codex-onboarding-kickoff-promotion-plan.v1");
      assert.equal(plan.targets.state.value.planApproved, false);
      assert.equal(plan.targets.state.value.planSubmission, undefined);
      const applied = applyProjectOnboardingKickoffPromotionV4({ runner: "codex", ...args, planSha256: plan.planSha256, activate: true });
      assert.equal(applied.status, "ready");
      const state = JSON.parse(readFileSync(join(path, "project", "pipeline-state.json"), "utf8"));
      assert.equal(state.activeFeature.id, `${profile}-work`);
      assert.equal(state.activeFeature.planPath, prdPath);
      assert.equal(state.planApproved, false);
      assert.equal(state.planSubmission, undefined);
      assert.equal(state.planApproval, undefined);
      const replayed = applyProjectOnboardingKickoffPromotionV4({ runner: "codex", ...args, planSha256: plan.planSha256, activate: true });
      assert.equal(replayed.status, "ready");
    } finally { dispose(path); }
  }
});

test("kickoff promotion CLI requires a design-input path", () => {
  const path = root();
  const output = [];
  try {
    const code = onboardingCli([
      "kickoff", "promote", "plan", "--root", path,
      "--profile", "feature", "--id", "evidence-work",
      "--plan-path", "specs/evidence/spec.md", "--prd-path", "specs/evidence/prd.md",
      "--spec-path", "specs/evidence/spec.md",
    ], { write: (chunk) => output.push(chunk) });
    assert.equal(code, 2);
    assert.match(output.join(""), /--design-input-path/u);
  } finally { dispose(path); }
});

test("public cleanup privatization preserves the historical kickoff seed for CLI promotion", () => {
  const path = root();
  let onboardingOutput = "";
  let onboardingError = "";
  let cleanupOutput = "";
  // AGY-CHATADAPTER-2: every kickoff-promote call this closure drives below
  // uses --profile feature, so a fixed attended-confirmation seam simulates a
  // human confirming that same value each time.
  const invokeOnboarding = (args) => {
    onboardingOutput = "";
    onboardingError = "";
    const code = onboardingCli(args, {
      deps: { ...fakeDeps, isattyFn: () => true, readLineFn: () => "feature" },
      write: (chunk) => { onboardingOutput += chunk; },
      writeError: (chunk) => { onboardingError += chunk; },
    });
    return { code, result: onboardingOutput ? JSON.parse(onboardingOutput) : null };
  };
  const invokeCleanup = (args) => {
    cleanupOutput = "";
    const code = sessionCleanupCli(args, {}, {
      writeFn(value) { cleanupOutput += value; },
    });
    return { code, result: cleanupOutput ? JSON.parse(cleanupOutput) : null };
  };
  try {
    hostGit(path, ["init", "-q"]);
    const barrier = initializeRestartRequiredRoot(path);
    clearRuntimeBarrier(path, barrier);
    const kickoff = completeKickoff(path, "Promote the privatized historical kickoff");
    const descriptor = startSessionDescriptor(path, {
      sessionId: "session-kickoff-promote-private",
      ownerNonce: "session-kickoff-promote-private-owner",
    });
    const statePath = join(path, "project", "pipeline-state.json");
    const historical = JSON.parse(readFileSync(statePath, "utf8"));
    historical.continuity.revision = 1;
    historical.continuity.runtime.sessionCleanup = {
      sessionId: descriptor.sessionId,
      descriptorSha256: descriptor.descriptorSha256,
    };
    writeFileSync(statePath, `${JSON.stringify(historical)}\n`);

    const privatization = invokeCleanup(["plan-privatization", "--repo", path]);
    assert.equal(privatization.code, 0);
    assert.equal(privatization.result.status, "ready");
    const privatized = invokeCleanup(privatization.result.applyAction.argv.slice(1));
    assert.equal(privatized.code, 0);
    assert.equal(privatized.result.status, "applied");
    const seed = JSON.parse(readFileSync(statePath, "utf8"));
    assert.equal(seed.continuity.revision, 1);
    assert.equal(seed.continuity.runtime.sessionCleanup, null);
    assert.equal(seed.continuity.resume.mode, "resume-on-next-turn");
    assert.equal(seed.continuity.resume.sourceRevision, 0);
    const seedSha256 = sha256(readFileSync(statePath));

    mkdirSync(join(path, "specs", "post-private"), { recursive: true });
    const prdPath = "specs/post-private/prd_post_private.md";
    const specPath = "specs/post-private/spec.md";
    const designInputPath = "specs/post-private/design-input.md";
    writeFileSync(join(path, specPath), "# Post-private specification\n");
    const postPrivateSpecSha256 = sha256(readFileSync(join(path, specPath)));
    writeFileSync(join(path, prdPath), [
      "<!-- po-language: en -->",
      `<!-- technical-spec-sha256: ${postPrivateSpecSha256} -->`,
      PO_GATE_PRD_ACKNOWLEDGEMENT_MARKER,
      "",
      "# Post-private PRD",
      "",
    ].join("\n"));
    writeFileSync(join(path, designInputPath), "# Post-private design input\n");
    const promoteArgs = [
      "kickoff", "promote", "plan", "--root", path,
      "--profile", "feature", "--id", "post-private-work",
      "--plan-path", prdPath, "--prd-path", prdPath, "--spec-path", specPath,
      "--design-input-path", designInputPath,
    ];
    const planned = invokeOnboarding(promoteArgs);
    assert.equal(planned.code, 0, onboardingError);
    assert.equal(planned.result.schema, "pipeline.codex-onboarding-kickoff-promotion-plan.v1");
    assert.equal(planned.result.kickoff.revision, 1);
    assert.equal(planned.result.kickoff.transactionSha256, kickoff.transactionSha256);
    assert.equal(planned.result.targets.state.beforeSha256, seedSha256);
    assert.equal(planned.result.targets.state.value.continuity.revision, 2);
    assert.equal(planned.result.targets.state.value.continuity.resume.sourceRevision, 2);
    assert.equal(planned.result.targets.history.value.transactions[1].beforeStateSha256, seedSha256);
    assert.equal(planned.result.targets.history.value.transactions[1].previousTransactionSha256,
      kickoff.transactionSha256);

    const applied = invokeOnboarding(planned.result.applyAction.argv.slice(1));
    assert.equal(applied.code, 0, onboardingError);
    assert.equal(applied.result.status, "ready");
    assert.equal(applied.result.continuity.status, "valid");
    const after = readFileSync(statePath);
    const promoted = JSON.parse(after.toString("utf8"));
    assert.equal(promoted.activeFeature.id, "post-private-work");
    assert.equal(promoted.continuity.revision, 2);
    assert.equal(promoted.continuity.resume.sourceRevision, 2);

    const replayed = invokeOnboarding(planned.result.applyAction.argv.slice(1));
    assert.equal(replayed.code, 0, onboardingError);
    assert.equal(replayed.result.status, "ready");
    assert.equal(replayed.result.continuity.status, "valid");
    assert.deepEqual(readFileSync(statePath), after);
  } finally { dispose(path); }
});

test("kickoff promotion fails closed for authority drift, a real active feature, and plan replay mismatch", () => {
  const path = root();
  try {
    const barrier = initializeRestartRequiredRoot(path); clearRuntimeBarrier(path, barrier);
    completeKickoff(path, "Promotion failures");
    mkdirSync(join(path, "specs"), { recursive: true });
    writeFileSync(join(path, "specs", "spec.md"), "# Spec\n");
    const realSpecSha256 = sha256(readFileSync(join(path, "specs", "spec.md")));
    writeFileSync(join(path, "specs", "prd_real.md"), [
      "<!-- po-language: en -->",
      `<!-- technical-spec-sha256: ${realSpecSha256} -->`,
      PO_GATE_PRD_ACKNOWLEDGEMENT_MARKER,
      "",
      "# PRD",
      "",
    ].join("\n"));
    writeFileSync(join(path, "specs", "design-input.md"), "# Design input\n");
    const args = { rootDir: path, profile: "feature", featureId: "real-work", planPath: "specs/prd_real.md", prdPath: "specs/prd_real.md", specPath: "specs/spec.md", designInputPath: "specs/design-input.md", runner: "codex", deps: fakeDeps };
    const plan = planProjectOnboardingKickoffPromotionV4(args);
    writeFileSync(join(path, "specs", "spec.md"), "# changed\n");
    assert.throws(() => applyProjectOnboardingKickoffPromotionV4({ runner: "codex", ...args, planSha256: plan.planSha256, activate: true }), /promotion plan digest/u);
    writeFileSync(join(path, "specs", "spec.md"), "# Spec\n");
    const applied = applyProjectOnboardingKickoffPromotionV4({ runner: "codex", ...args, planSha256: plan.planSha256, activate: true });
    assert.equal(applied.status, "ready");
    assert.throws(() => planProjectOnboardingKickoffPromotionV4({ runner: "codex", ...args, featureId: "other-work" }), /exact unapproved kickoff seed/u);
  } finally { dispose(path); }
});

test("current runtime exposes closed continuity outcomes while required App Server failure keeps precedence", () => {
  const pristine = root(); const unavailable = root();
  try {
    for (const path of [pristine, unavailable]) {
      const barrier = initializeRestartRequiredRoot(path);
      clearRuntimeBarrier(path, barrier);
    }

    const kickoff = inspectProjectOnboardingV3({ runner: "codex",
      rootDir: pristine,
      intent: "onboarding",
      deps: fakeDeps,
    });
    assert.equal(kickoff.status, "intake-required");
    assert.equal(kickoff.continuity.status, "absent-pristine");
    assert.equal(kickoff.appServer.status, "not-requested");
    assert.equal(kickoff.nextAction.kind, "collect-input");

    const appServerFirst = inspectProjectOnboardingV3({ runner: "codex",
      rootDir: pristine,
      intent: "bootstrap",
      deps: {
        ...fakeDeps,
        observeOnboardingAppServer: () => ({
          required: true,
          status: "execution-denied",
          code: "CAS-EXECUTION-UNAVAILABLE",
        }),
      },
    });
    assert.equal(appServerFirst.status, "app-server-execution-denied");
    assert.equal(appServerFirst.continuity.status, "absent-pristine");
    assert.equal(appServerFirst.nextAction, null);

    mkdirSync(join(pristine, "docs"));
    writeFileSync(join(pristine, "docs", "state.md"), "manual handover\n", { flag: "wx" });
    const damaged = inspectProjectOnboardingV3({ runner: "codex",
      rootDir: pristine,
      intent: "onboarding",
      deps: fakeDeps,
    });
    assert.equal(damaged.status, "continuity-damaged");
    assert.equal(damaged.continuity.status, "damaged");
    const continuityAction = {
      kind: "command",
      executable: "node",
      argv: [ONBOARDING_SCRIPT, "plan-repair", "--root", pristine, "--runner", "codex"],
      mutation: false,
      requiresConfirmation: false,
      expected: {
        schema: "pipeline.project-onboarding.v4",
        statuses: ["continuity-damaged"],
      },
    };
    assert.match(assertSingleLineAction(damaged.nextAction, continuityAction), /'[^']*with spaces[^']*'/u);
    let continuityOutput = "";
    assert.equal(onboardingCli(continuityAction.argv.slice(1), {
      deps: fakeDeps,
      write: (chunk) => { continuityOutput += chunk; },
    }), 1);
    const continuityParsed = JSON.parse(continuityOutput);
    assert.equal(continuityParsed.status, "continuity-damaged");
    // This exact fixture (a real handover, an absent pipeline-state.json) is
    // the third repair case: `pipeline-state.json` itself is absent, so the
    // tool cannot derive which feature it belongs to on its own, and the plan
    // surfaces a real `collect-input` ask instead of the flat `nextAction:
    // null` dead end every other unrepairable continuity shape still returns.
    assert.equal(continuityParsed.nextAction.kind, "collect-input");
    assert.equal(continuityParsed.nextAction.mutation, false);
    assert.deepEqual(continuityParsed.nextAction.inputs.map((input) => input.name).sort(),
      ["featureId", "language", "planPath", "prdPath", "specPath"]);
    assert.equal(continuityParsed.diagnostics.length, 0,
      "the ask-step replaces the passive diagnostic entirely");
    const compound = inspectProjectOnboardingV3({ runner: "codex",
      rootDir: pristine,
      intent: "bootstrap",
      deps: {
        ...fakeDeps,
        observeOnboardingAppServer: () => ({
          required: true,
          status: "execution-denied",
          code: "CAS-EXECUTION-UNAVAILABLE",
        }),
      },
    });
    assert.equal(compound.status, "app-server-execution-denied");
    assert.equal(compound.continuity.status, "damaged");
    assert.equal(compound.nextAction, null);

    writeFileSync(join(unavailable, "project", "pipeline-state.json"), "{broken", { flag: "wx" });
    const unreadable = inspectProjectOnboardingV3({ runner: "codex",
      rootDir: unavailable,
      intent: "onboarding",
      deps: fakeDeps,
    });
    assert.equal(unreadable.status, "continuity-observation-unavailable");
    assert.equal(unreadable.continuity.status, "unavailable");
    assert.equal(unreadable.nextAction, null);
  } finally { dispose(pristine); dispose(unavailable); }
});

// Same third repair case as the fixture above (`pipeline-state.json` absent,
// a real configured handover), driven through the real CLI end to end: the
// bare ask, a caller error for a partial claim, and a full plan/apply cycle
// that threads --id/--plan-path/--prd-path/--spec-path/--language into
// `applyOnboardingContinuityRepair()`'s `operatorAuthority` argument.
test("operator-confirmed continuity repair is a real ask-step end to end through the CLI", () => {
  const path = root();
  try {
    const barrier = initializeRestartRequiredRoot(path);
    clearRuntimeBarrier(path, barrier);
    mkdirSync(join(path, "docs"), { recursive: true });
    writeFileSync(join(path, "docs", "state.md"), "manual handover\n");
    mkdirSync(join(path, "specs", "mature"), { recursive: true });
    writeFileSync(join(path, "specs", "mature", "prd_mature.md"), "# Mature PRD\n");
    writeFileSync(join(path, "specs", "mature", "spec.md"), "# Mature specification\n");

    let bareOutput = "";
    assert.equal(onboardingCli(["plan-repair", "--root", path, "--runner", "codex"], {
      deps: fakeDeps,
      write: (chunk) => { bareOutput += chunk; },
    }), 1);
    assert.equal(JSON.parse(bareOutput).nextAction.kind, "collect-input");

    const partial = onboardingCli(
      ["plan-repair", "--root", path, "--runner", "codex", "--id", "mature-feature"],
      { deps: fakeDeps, write: () => {} },
    );
    assert.equal(partial, 2, "a partial operator claim must be a caller error, never a silent no-op");

    const operatorFlags = [
      "--id", "mature-feature",
      "--plan-path", "specs/mature/prd_mature.md",
      "--prd-path", "specs/mature/prd_mature.md",
      "--spec-path", "specs/mature/spec.md",
      "--language", "en",
    ];
    let planOutput = "";
    assert.equal(onboardingCli(["plan-repair", "--root", path, "--runner", "codex", ...operatorFlags], {
      deps: fakeDeps,
      write: (chunk) => { planOutput += chunk; },
    }), 1);
    const planned = JSON.parse(planOutput);
    assert.equal(planned.status, "continuity-damaged");
    assert.equal(planned.nextAction.kind, "command");
    assert.match(planned.nextAction.argv.join(" "), /apply-repair/u);
    const digest = planned.nextAction.argv[planned.nextAction.argv.indexOf("--plan-sha256") + 1];

    let applyOutput = "";
    const applyArgv = ["apply-repair", "--root", path, "--plan-sha256", digest, "--activate", "--runner", "codex", ...operatorFlags];
    assert.equal(onboardingCli(applyArgv, {
      deps: fakeDeps,
      write: (chunk) => { applyOutput += chunk; },
    }), 0);
    const applied = JSON.parse(applyOutput);
    assert.equal(applied.status, "ready");
    assert.equal(applied.continuity.status, "valid");
    const state = JSON.parse(readFileSync(join(path, "project", "pipeline-state.json"), "utf8"));
    assert.equal(state.activeFeature.id, "mature-feature");
    assert.equal(state.continuity.authority.prd.path, "specs/mature/prd_mature.md");
    assert.equal(state.continuity.authority.spec.path, "specs/mature/spec.md");
  } finally { dispose(path); }
});

test("closed feature re-entry stays ready through the sanctioned set-feature transition", () => {
  const path = root();
  try {
    const barrier = initializeRestartRequiredRoot(path);
    clearRuntimeBarrier(path, barrier);
    for (const authorityPath of [
      join(path, ".claude", "pipeline-state.json"),
      join(path, "docs", "state.md"),
      join(path, ".git", "agent-pipeline", "onboarding", "continuity-history.json"),
    ]) {
      if (existsSync(authorityPath)) unlinkSync(authorityPath);
    }
    const runStateCommand = (...args) => spawnSync(process.execPath, [
      PIPELINE_STATE_SCRIPT,
      ...args,
    ], {
      cwd: path,
      encoding: "utf8",
      shell: false,
      env: { ...process.env, CLAUDE_PROJECT_DIR: path },
    });
    const startWithoutDescriptor = () => {
      let output = "";
      let descriptorStarts = 0;
      const status = sessionCleanupCli(["start", "--repo", path], {}, {
        requireProjectOnboardingReadyFn() {
          return {
            schema: "pipeline.project-onboarding-ready-gate.v1",
            status: "ready",
            intent: "session",
          };
        },
        readOnboardingSessionCleanupBindingFn(options) {
          return readOnboardingSessionCleanupBinding({ ...options, spawn: fakeGit });
        },
        listActiveSessionDescriptorsFn() { return []; },
        startSessionDescriptorFn() {
          descriptorStarts += 1;
          throw new Error("transition boundary must not create a descriptor");
        },
        writeFn(value) { output += value; },
      });
      assert.equal(status, 0);
      assert.equal(descriptorStarts, 0);
      return JSON.parse(output);
    };

    const initial = runStateCommand(
      "set-feature",
      "--id", "previous-feature",
      "--plan-path", "specs/previous/prd.md",
    );
    assert.equal(initial.status, 0, initial.stderr);
    const designBeforeClose = inspectProjectOnboardingV3({ runner: "codex",
      rootDir: path,
      intent: "bootstrap",
      deps: fakeDeps,
    });
    assert.equal(designBeforeClose.status, "ready");
    assert.equal(designBeforeClose.continuity.status, "valid");

    const closedByWriter = runStateCommand("close-feature", "--by", "PO");
    assert.equal(closedByWriter.status, 0, closedByWriter.stderr);
    const closed = inspectProjectOnboardingV3({ runner: "codex",
      rootDir: path,
      intent: "bootstrap",
      deps: fakeDeps,
    });
    assert.equal(closed.status, "ready");
    assert.equal(closed.continuity.status, "valid");
    assert.deepEqual(startWithoutDescriptor(), {
      ok: true,
      code: "WT-SESSION-NOT-REQUIRED",
      bindingStatus: "closed-unbound",
    });

    const selected = runStateCommand(
      "set-feature",
      "--id", "next-feature",
      "--plan-path", "specs/next/prd.md",
    );
    assert.equal(selected.status, 0, selected.stderr);
    const design = inspectProjectOnboardingV3({ runner: "codex",
      rootDir: path,
      intent: "bootstrap",
      deps: fakeDeps,
    });
    assert.equal(design.status, "ready");
    assert.equal(design.continuity.status, "valid");
    assert.deepEqual(startWithoutDescriptor(), {
      ok: true,
      code: "WT-SESSION-NOT-REQUIRED",
      bindingStatus: "design-unbound",
    });
  } finally {
    dispose(path);
  }
});

test("portable seed is manifest-valid, then onboarding owns the runtime initialization transaction", () => {
  const path = root();
  try {
    const plan = planProjectOnboardingV3({ runner: "codex", rootDir: path, deps: fakeDeps });
    assert.deepEqual(
      plan.targets.map((target) => target.path),
      [
        ".gitignore", "pipeline.user.yaml", "project/critical-human-proof.json",
        "project/pipeline.json", "project/pipeline.yaml",
      ],
      "fresh onboarding seeds the canonical project authority and the ignore rules for the paths it writes into; runtime targets are initialized later",
    );
    assert.equal(applyProjectOnboardingV3(plan, { rootDir: path, activate: false, deps: fakeDeps }).status, "activation-required");
    const applied = applyProjectOnboardingV3(plan, { rootDir: path, activate: true, deps: fakeDeps });
    assert.equal(applied.status, "applied");
    // The ignore rules are ANCHORED. An unanchored `evidence/` also matches
    // `<anything>/evidence/`, which is how this repository once silently broke the
    // closure citations its own backlog gate demands.
    const ignore = readFileSync(join(path, ".gitignore"), "utf8");
    assert.match(ignore, /^\/scratch\/$/mu);
    assert.match(ignore, /^\/evidence\/$/mu);
    assert.match(ignore, /^\/project\/pipeline-state\.json$/mu);
    assert.equal(existsSync(join(path, ".git")), true);
    assert.equal(existsSync(join(path, ".claude")), false, "portable seed must not create legacy Claude authority files");
    assert.equal(existsSync(join(path, ".codex")), false);
    assert.equal(inspectProjectOnboardingV3({ runner: "codex", rootDir: path, deps: fakeDeps }).status, "runtime-initialization-required");
    const runtimePlan = planProjectOnboardingLifecycleV4({ runner: "codex", rootDir: path, deps: fakeDeps, operation: "runtime" });
    const digest = runtimePlan.nextAction.argv[runtimePlan.nextAction.argv.indexOf("--plan-sha256") + 1];
    const runtimeApplied = applyProjectOnboardingLifecycleV4({ runner: "codex", rootDir: path, deps: fakeDeps, operation: "runtime", planSha256: digest, activate: true });
    assert.equal(runtimeApplied.status, "restart-required");
    assert.equal(runtimeApplied.runtime.status, "restart-required");
    assert.equal(runtimeApplied.nextAction.kind, "restart-process");
    const sameProcess = inspectProjectOnboardingV3({ runner: "codex", rootDir: path, deps: fakeDeps });
    assert.equal(sameProcess.status, "restart-required", "the writer process cannot clear its own runtime barrier");
    assert.equal(existsSync(join(path, ".codex/agents/implementor.toml")), true);
    assert.equal(existsSync(join(path, ".codex/agents/critic.toml")), true);
    assert.equal(existsSync(join(path, ".codex/agents/consult-advisor.toml")), true);
    assert.match(readFileSync(join(path, ".codex/agents/implementor.toml"), "utf8"), /developer_instructions\s*=/u);
    assert.match(readFileSync(join(path, ".codex/agents/critic.toml"), "utf8"), /developer_instructions\s*=/u);
    assert.equal(existsSync(join(path, "setup.mjs")), false);
    assert.equal(existsSync(join(path, ".agent-pipeline/core.lock.json")), false);
    assert.equal(validatePipelineUserV3(parseYaml(readFileSync(join(path, "pipeline.user.yaml"), "utf8"))).ok, true);
    assert.equal(validateV3BootstrapAuthority({ rootDir: path, deps: fakeDeps }).status, "restart-required");
    assert.equal(planRunnerProfileMigrationV3({ rootDir: path }).status, "noop");
    const source = parseYaml(readFileSync(join(path, "pipeline.user.yaml"), "utf8"));
    assert.deepEqual(source.runners, { enabled: ["claude", "codex"], default: "codex" });
    assert.equal(source.advisor_export.consent, "approved");
    assert.equal(source.autonomy.push_policy, "gated");
    assert.equal(source.autonomy.branch_model, "feature-branch");
    // NVA-R33-SECGATEON (2026-08-29): `blocking` is now what is true, and the manifest
    // carries a matching chapter (see the dedicated gate-agreement test below) -- the
    // prerequisites that used to make a seeded security gate unsatisfiable (dirty-tree
    // refusal caused by the push gate's own evidence, three external scanners, a
    // license allowlist at a Pipeline-only path, gitleaks config resolution in an
    // installed-plugin deployment) are all closed; see the seeding comment on
    // freshIntent()'s gates literal in project-onboarding-v3.mjs for the full chain.
    assert.equal(source.gates.security, "blocking");
    const calibration = JSON.parse(readFileSync(join(path, "project/pipeline.json"), "utf8"));
    // Contract correction: this pin used to assert the always-green placeholder
    // `git diff --check`. That value made a brand-new project report a satisfied
    // verification contract while owning no tests, so the pin encoded the defect
    // it was meant to guard. The contract is now "fails until configured".
    assert.match(calibration.verify, /not configured/);
    assert.equal(calibration.repositoryMode, "local-only");
    assert.equal(existsSync(join(path, "docs/state.md")), false, "handover stays a project decision; normal bootstrap deliberately remains F4 until it exists");
    const barrier = readRestartBarrier({ rootDir: path, spawn: fakeGit });
    const issued = issueLaunchTicket({
      rootDir: path, barrierSha256: barrier.rawSha256, now: 40_000, spawn: fakeGit, codexExecutable: process.execPath,
    });
    consumeRuntimeReadback({
      rootDir: path,
      ticketId: issued.ticketId,
      token: issued.token,
      now: 40_001,
      spawn: fakeGit,
      codexExecutable: process.execPath,
      receipt: {
        schema: "pipeline.codex-project-runtime-readback.v1",
        barrierSha256: barrier.rawSha256,
        repositoryFingerprint: barrier.barrier.repositoryFingerprint,
        sourceSha256: barrier.barrier.sourceSha256,
        runtimeTargetsSha256: barrier.barrier.runtimeTargetsSha256,
        readerGenerationSha256: sha256(Buffer.alloc(32, 0xa5)),
        effectiveConfigSha256: sha256("effective"),
        validatedAgentsSha256: sha256("agents"),
        ticketId: issued.ticketId,
        observedAtEpochMs: 40_001,
      },
    });
    const freshProcess = inspectProjectOnboardingV3({ runner: "codex", rootDir: path, deps: fakeDeps, intent: "bootstrap" });
    assert.equal(freshProcess.status, "intake-required");
    assert.equal(freshProcess.runtime.status, "readback-current");
    assert.notEqual(freshProcess.runtime.barrierSha256, freshProcess.runtime.readbackSha256);
    const afterHostAuthority = validateV3BootstrapAuthority({ rootDir: path, deps: fakeDeps });
    assert.equal(afterHostAuthority.status, "ready", JSON.stringify(afterHostAuthority));
    completeKickoff(path);
    assert.equal(inspectProjectOnboardingV3({ runner: "codex",
      rootDir: path,
      deps: fakeDeps,
      intent: "bootstrap",
    }).status, "ready");
  } finally { dispose(path); }
});

test("existing unmanaged projects plan read-only while partial and symlink roots fail closed", () => {
  const unrelated = root(); const partial = root(); const linkedParent = root(); const unsafe = root(); const unsafeClaude = root();
  const aliasParent = root(); const alias = join(aliasParent, "project-alias");
  try {
    writeFileSync(join(unrelated, "README.md"), "existing\n");
    assert.equal(inspectProjectOnboardingV3({ runner: "codex", rootDir: unrelated }).status, "adoption-required");
    assert.equal(planProjectOnboardingV3({ runner: "codex", rootDir: unrelated, deps: fakeDeps }).status, "ready");
    assert.deepEqual(names(unrelated), ["README.md"]);
    mkdirSync(join(partial, ".codex")); writeFileSync(join(partial, ".codex/config.toml"), "existing\n");
    assert.equal(inspectProjectOnboardingV3({ runner: "codex", rootDir: partial }).status, "partial");
    symlinkSync(linkedParent, join(unsafe, "linked"));
    assert.equal(inspectProjectOnboardingV3({ runner: "codex", rootDir: unsafe }).status, "unsafe");
    assert.deepEqual(names(unsafe), ["linked"]);
    symlinkSync(linkedParent, join(unsafeClaude, ".claude"));
    assert.equal(inspectProjectOnboardingV3({ runner: "codex", rootDir: unsafeClaude }).status, "unsafe");
    assert.equal(planProjectOnboardingV3({ runner: "codex", rootDir: unsafeClaude, deps: fakeDeps }).status, "unsafe");
    assert.deepEqual(names(unsafeClaude), [".claude"]);
    symlinkSync(unrelated, alias, "dir");
    const rootAlias = inspectProjectOnboardingV3({ runner: "codex", rootDir: alias, deps: fakeDeps });
    assert.equal(rootAlias.status, "unsafe");
    assert.equal(rootAlias.root, null);
    assert.equal(rootAlias.diagnostics[0].code, "root_symlink_rejected");
    assert.equal(rootAlias.repository.status, "unavailable");
  } finally { dispose(unrelated); dispose(partial); dispose(linkedParent); dispose(unsafe); dispose(unsafeClaude); dispose(aliasParent); }
});

test("a recognized read-only host control layout receives portable onboarding without an overwrite attempt", () => {
  const path = root();
  try {
    for (const name of [".codex", ".git"]) {
      const target = join(path, name);
      mkdirSync(target);
      chmodSync(target, 0o555);
    }
    const inspected = inspectProjectOnboardingV3({ runner: "codex", rootDir: path });
    assert.equal(inspected.status, "portable-seed-required");
    assert.equal(inspected.repository.status, "host-managed");
    assertDiagnostic(inspected, "portable_seed_missing");
    assertSingleLineAction(inspected.nextAction, {
      kind: "command",
      executable: "node",
      argv: [ONBOARDING_SCRIPT, "plan", "--root", path, "--runner", "codex"],
      mutation: false,
      requiresConfirmation: false,
      expected: {
        schema: "pipeline.project-onboarding.v4",
        statuses: ["portable-seed-required"],
      },
    });
    const planned = planProjectOnboardingV3({ runner: "codex", rootDir: path, deps: fakeDeps });
    assert.equal(planned.status, "ready");
    assert.equal(planned.state, "fresh-host-managed");
    assert.equal(planned.git.mode, "host-managed");
    assert.equal(planned.git.initializesGit, false);
    assert.deepEqual(planned.targets.map((target) => target.path), [
      ".gitignore", "pipeline.user.yaml", "project/critical-human-proof.json",
      "project/pipeline.json", "project/pipeline.yaml",
    ]);
    const applied = applyProjectOnboardingV3(planned, { rootDir: path, activate: true, deps: fakeDeps });
    assert.equal(applied.status, "applied");
    assert.equal(applied.git.mode, "host-managed");
    assert.equal(applied.authority.runtimeProjection, "missing");
    const cleanupNotNeededDeps = {
      planSessionCleanupRecovery: fakeDeps.planSessionCleanupRecovery,
    };
    const postSeed = inspectProjectOnboardingV3({ runner: "codex",
      rootDir: path,
      deps: cleanupNotNeededDeps,
    });
    assert.equal(postSeed.status, "intake-required");
    assert.equal(postSeed.runtime.status, "plugin-managed-unattested");
    assert.equal(postSeed.nextAction.kind, "collect-input");
    const kickoff = completeKickoff(
      path,
      "Build one small HTML game from the supplied design",
      cleanupNotNeededDeps,
      "host-repository-init-required",
    );
    assert.equal(kickoff.repositoryCapability, "host-managed");
    let appServerCalls = 0;
    const postKickoff = inspectProjectOnboardingV3({ runner: "codex",
      rootDir: path,
      intent: "bootstrap",
      deps: {
        ...cleanupNotNeededDeps,
        observeOnboardingAppServer() {
          appServerCalls += 1;
          throw new Error("pre-init App-Server observation must not run");
        },
      },
    });
    assert.equal(postKickoff.status, "host-repository-init-required");
    assert.equal(postKickoff.repository.status, "host-managed");
    assert.equal(postKickoff.runtime.status, "plugin-managed-unattested");
    assert.equal(postKickoff.continuity.status, "valid");
    assert.deepEqual(postKickoff.appServer, { required: false, status: "not-requested", code: null });
    assert.equal(appServerCalls, 0, "pre-init host handoff does not depend on sandbox App-Server reachability");
    assertSingleLineAction(postKickoff.nextAction, {
      kind: "command",
      executable: "node",
      argv: [HOST_REPOSITORY_INIT_SCRIPT, "plan", "--root", path],
      mutation: false,
      requiresConfirmation: false,
      expected: {
        schema: "pipeline.codex-host-repository-init-plan.v1",
        statuses: ["ready", "not-applicable"],
      },
    });
    assert.deepEqual(names(join(path, ".codex")), []);
    assert.deepEqual(names(join(path, ".git")), []);
    chmodSync(join(path, ".git"), 0o700);
    appServerCalls = 0;
    const afterHostGit = inspectProjectOnboardingV3({ runner: "codex",
      rootDir: path,
      intent: "session",
      deps: {
        ...cleanupNotNeededDeps,
        observeCodexOnboardingCapabilities: fakeCapabilities,
        classifyOnboardingContinuity: () => postKickoff.continuity,
        observeOnboardingAppServer() {
          appServerCalls += 1;
          throw new Error("unattested pre-init App-Server observation must not run");
        },
      },
    });
    assert.equal(afterHostGit.status, "host-repository-init-required");
    assert.equal(afterHostGit.repository.status, "local-valid-writable");
    assert.equal(afterHostGit.runtime.status, "plugin-managed-unattested");
    assert.equal(afterHostGit.repository.sessionCapability, "passed");
    assert.deepEqual(afterHostGit.appServer, { required: false, status: "not-requested", code: null });
    assert.equal(appServerCalls, 0, "unattested pre-init session does not observe App-Server health");
    const afterHostAuthority = validateV3BootstrapAuthority({ rootDir: path });
    assert.equal(afterHostAuthority.status, "host-init-required");
    assert.equal(afterHostAuthority.runtimeProjection, "plugin-managed-unattested");
  } finally { dispose(path); }
});

test("an existing unmanaged project receives an additive adoption plan", () => {
  const path = root();
  try {
    writeFileSync(join(path, "README.md"), "existing project\n");
    const inspected = inspectProjectOnboardingV3({ runner: "codex", rootDir: path });
    assert.equal(inspected.status, "adoption-required");
    const plan = planProjectOnboardingV3({ runner: "codex", rootDir: path, deps: fakeDeps });
    assert.equal(plan.status, "ready");
    assert.equal(plan.state, "existing-unmanaged");
    assert.equal(plan.git.initializesGit, true);
    const applied = applyProjectOnboardingV3(plan, { rootDir: path, activate: true, deps: fakeDeps });
    assert.equal(applied.status, "applied");
    assert.equal(readFileSync(join(path, "README.md"), "utf8"), "existing project\n");
    assert.equal(existsSync(join(path, "pipeline.user.yaml")), true);
    assert.equal(existsSync(join(path, ".git")), true);
  } finally { dispose(path); }
});

test("adoption preserves directory and linked-worktree Git metadata and blocks user-owned reserved paths", () => {
  const adopted = root(); const linked = root(); const reserved = root();
  try {
    writeFileSync(join(adopted, "README.md"), "existing project\n");
    mkdirSync(join(adopted, ".git", "objects"), { recursive: true });
    writeFileSync(join(adopted, ".git", "HEAD"), "ref: refs/heads/main\n");
    const plan = planProjectOnboardingV3({ runner: "codex", rootDir: adopted, deps: fakeDeps });
    assert.equal(plan.status, "ready");
    assert.equal(plan.git.initializesGit, false);
    const applied = applyProjectOnboardingV3(plan, { rootDir: adopted, activate: true, deps: fakeDeps });
    assert.equal(applied.status, "applied");
    assert.equal(readFileSync(join(adopted, ".git", "HEAD"), "utf8"), "ref: refs/heads/main\n");

    writeFileSync(join(linked, "README.md"), "linked worktree project\n");
    writeFileSync(join(linked, ".git"), "gitdir: /outside/managed-worktree\n");
    const linkedPlan = planProjectOnboardingV3({ runner: "codex", rootDir: linked, deps: fakeDeps });
    assert.equal(inspectProjectOnboardingV3({ runner: "codex", rootDir: linked, deps: fakeDeps }).status, "adoption-required");
    assert.equal(linkedPlan.status, "ready");
    assert.equal(linkedPlan.git.initializesGit, false);
    const linkedApplied = applyProjectOnboardingV3(linkedPlan, { rootDir: linked, activate: true, deps: fakeDeps });
    assert.equal(linkedApplied.status, "applied");
    assert.equal(readFileSync(join(linked, ".git"), "utf8"), "gitdir: /outside/managed-worktree\n");

    writeFileSync(join(reserved, "README.md"), "existing project\n");
    mkdirSync(join(reserved, ".codex"));
    assert.equal(inspectProjectOnboardingV3({ runner: "codex", rootDir: reserved }).status, "partial");
  } finally { dispose(adopted); dispose(linked); dispose(reserved); }
});

test("legacy V0 is migration-required and never receives a fresh fallback", () => {
  const path = root();
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), yaml(v0Source()));
    assert.equal(inspectProjectOnboardingV3({ runner: "codex", rootDir: path }).status, "migration-required");
    assert.equal(planProjectOnboardingV3({ runner: "codex", rootDir: path, deps: fakeDeps }).status, "migration-required");
    assert.deepEqual(names(path), ["pipeline.user.yaml"]);
  } finally { dispose(path); }
});

test("post-git failure rolls every generated preimage back", () => {
  const path = root(); let writes = 0;
  const failing = {
    ...fakeDeps,
    writeFileSync(target, bytes, options) {
      writes += 1;
      if (writes === 2) throw new Error("synthetic write failure");
      writeFileSync(target, bytes, options);
    },
  };
  try {
    const plan = planProjectOnboardingV3({ runner: "codex", rootDir: path, deps: failing });
    const applied = applyProjectOnboardingV3(plan, { rootDir: path, activate: true, deps: failing });
    assert.equal(applied.status, "rolled-back");
    assert.deepEqual(names(path), []);
  } finally { dispose(path); }
});

test("portable rollback preserves a target whose identity changed after exclusive creation", () => {
  const path = root(); let writes = 0; let firstTarget;
  const racing = {
    ...fakeDeps,
    writeFileSync(target, bytes, options) {
      writes += 1;
      if (writes === 1) {
        firstTarget = target;
        writeFileSync(target, bytes, options);
        return;
      }
      const foreign = `${firstTarget}.foreign`;
      writeFileSync(foreign, "foreign bytes\n", { flag: "wx", mode: 0o600 });
      renameSync(foreign, firstTarget);
      throw new Error("synthetic identity race");
    },
  };
  try {
    const plan = planProjectOnboardingV3({ runner: "codex", rootDir: path, deps: racing });
    const applied = applyProjectOnboardingV3(plan, { rootDir: path, activate: true, deps: racing });
    assert.equal(applied.status, "rollback-failed");
    assert.equal(readFileSync(firstTarget, "utf8"), "foreign bytes\n");
  } finally { dispose(path); }
});

test("portable rollback preserves foreign content added beneath its Git directory", () => {
  const path = root(); let injected = false;
  const racing = {
    ...fakeDeps,
    writeFileSync(target, bytes, options) {
      if (!injected) {
        injected = true;
        writeFileSync(join(path, ".git", "foreign"), "foreign git bytes\n");
        throw new Error("synthetic Git content race");
      }
      writeFileSync(target, bytes, options);
    },
  };
  try {
    const plan = planProjectOnboardingV3({ runner: "codex", rootDir: path, deps: racing });
    const applied = applyProjectOnboardingV3(plan, { rootDir: path, activate: true, deps: racing });
    assert.equal(applied.status, "rollback-failed");
    assert.equal(readFileSync(join(path, ".git", "foreign"), "utf8"), "foreign git bytes\n");
  } finally { dispose(path); }
});

test("a fresh portable seed remains non-ready until its missing Codex runtime is initialized", () => {
  const path = root();
  try {
    const plan = planProjectOnboardingV3({ runner: "codex", rootDir: path, deps: fakeDeps });
    assert.equal(applyProjectOnboardingV3(plan, { rootDir: path, activate: true, deps: fakeDeps }).status, "applied");
    const inspected = inspectProjectOnboardingV3({ runner: "codex", rootDir: path, deps: fakeDeps });
    assert.equal(inspected.schema, "pipeline.project-onboarding.v4");
    assert.equal(inspected.status, "runtime-initialization-required");
    assert.equal(inspected.runtime.status, "missing");
  } finally { dispose(path); }
});

test("Codex bootstrap accepts a dual-runner source whose default runner is Claude", () => {
  const path = root();
  try {
    const plan = planProjectOnboardingV3({ runner: "codex", rootDir: path, deps: fakeDeps });
    assert.equal(applyProjectOnboardingV3(plan, {
      rootDir: path,
      activate: true,
      deps: fakeDeps,
    }).status, "applied");
    const sourcePath = join(path, "pipeline.user.yaml");
    const source = readFileSync(sourcePath, "utf8")
      .replace('  default: "codex"\n', '  default: "claude"\n');
    writeFileSync(sourcePath, source);
    const inspected = inspectProjectOnboardingV3({ runner: "codex", rootDir: path, deps: fakeDeps });
    assert.equal(inspected.status, "runtime-initialization-required");
    assert.equal(inspected.runtime.status, "missing");
    assert.equal(inspected.runner, "codex");
  } finally { dispose(path); }
});

test("an invalid generated manifest is never accepted as a current fresh authority", () => {
  const path = root();
  try {
    const plan = planProjectOnboardingV3({ runner: "codex", rootDir: path, deps: fakeDeps });
    assert.equal(applyProjectOnboardingV3(plan, { rootDir: path, activate: true, deps: fakeDeps }).status, "applied");
    writeFileSync(join(path, "project", "pipeline.yaml"), "not: a canonical pipeline manifest\n");
    const inspected = inspectProjectOnboardingV3({ runner: "codex", rootDir: path, deps: fakeDeps });
    assert.equal(inspected.schema, "pipeline.project-onboarding.v4");
    assert.equal(inspected.status, "partial");
    assertDiagnostic(inspected, "manifest_invalid");
    assert.deepEqual(inspected.nextAction.argv, [
      ONBOARDING_SCRIPT,
      "plan-manifest-repair",
      "--root",
      path,
          "--runner",
      "codex",
    ]);
    const disposition = planProjectOnboardingManifestRepairV4({ rootDir: path, deps: fakeDeps, runner: "codex" });
    assert.equal(disposition.status, "unrepairable");
    assertDiagnostic(disposition, "canonical_manifest_requires_owner_repair");
  } finally { dispose(path); }
});

// Backlog: a-schema-less-project-pipeline-yaml-has-no-known-repair-path. loadManifest()'s
// own unit-level self-heal coverage lives here (project-onboarding-v3.test.mjs, already
// registered in harness/scripts/verify.mjs) rather than a new, separately-registered test
// file, since manifest.mjs otherwise has zero dedicated test coverage of its own.
test("validateManifest offers a repair for a schema-less-but-otherwise-valid manifest, and self-heals only when asked", () => {
  const schemaLess = { language: { human_facing: "en" }, modelRouting: { legacy: { model: "legacy", effort: "low" } } };

  const surfaced = validateManifest(schemaLess);
  assert.equal(surfaced.status, "invalid");
  assert.equal(surfaced.errors.some((e) => e.path === "schema"), true);
  assert.equal(surfaced.repair?.available, true);
  assert.equal(surfaced.repair.kind, "missing-schema-field");
  assert.equal(surfaced.repair.normalizedManifest.schema, "pipeline.manifest.v0");
  assert.equal(surfaced.repair.normalizedManifest.language.human_facing, "en");
  // Read-only offer: the object passed in is never mutated in place.
  assert.equal(Object.hasOwn(schemaLess, "schema"), false);

  const healed = validateManifest(schemaLess, { selfHeal: true });
  assert.equal(healed.status, "ok");
  assert.equal(healed.manifest.schema, "pipeline.manifest.v0");
  assert.equal(healed.errors.length, 0);
  assert.equal(healed.warnings.some((w) => typeof w === "string" && w.includes("schema")), true);
  assert.equal(healed.repair.available, true);
});

test("validateManifest never offers a repair when a second, unrelated defect survives adding schema", () => {
  const result = validateManifest({ not: "a canonical pipeline manifest" });
  assert.equal(result.status, "invalid");
  assert.equal(result.repair, undefined);

  const healedAttempt = validateManifest({ not: "a canonical pipeline manifest" }, { selfHeal: true });
  assert.equal(healedAttempt.status, "invalid");
  assert.equal(healedAttempt.repair, undefined);
});

test("loadManifest offers the same repair from an on-disk schema-less file, and plan-manifest-repair surfaces it instead of the generic dead end", () => {
  const path = root();
  try {
    const plan = planProjectOnboardingV3({ runner: "codex", rootDir: path, deps: fakeDeps });
    assert.equal(applyProjectOnboardingV3(plan, { rootDir: path, activate: true, deps: fakeDeps }).status, "applied");

    // Exactly the real generator's own output, minus its schema line -- the same class of
    // file the backlog item's traced repair chain produces (a byte-preserved legacy file
    // that never had `schema:` copied verbatim into project/pipeline.yaml).
    const schemaLessBytes = freshManifestBytes().replace("schema: pipeline.manifest.v0\n", "");
    assert.equal(schemaLessBytes.includes("schema:"), false);
    writeFileSync(join(path, "project", "pipeline.yaml"), schemaLessBytes);

    const readback = loadManifest(path, { manifestRelPath: join("project", "pipeline.yaml") });
    assert.equal(readback.status, "invalid");
    assert.equal(readback.repair?.available, true);

    const healed = loadManifest(path, { manifestRelPath: join("project", "pipeline.yaml"), selfHeal: true });
    assert.equal(healed.status, "ok");
    assert.equal(healed.manifest.schema, "pipeline.manifest.v0");

    const disposition = planProjectOnboardingManifestRepairV4({ rootDir: path, deps: fakeDeps, runner: "codex" });
    assert.equal(disposition.status, "unrepairable");
    assertDiagnostic(disposition, "canonical_manifest_schema_missing_repairable");
  } finally { dispose(path); }
});

test("manifest-only repair is source/preimage/plan bound, confirmed, and read back", () => {
  const path = root();
  try {
    initializeRuntimeProjectionRoot(path);
    const manifestPath = join(path, ".claude", "pipeline.yaml");
    unlinkSync(manifestPath);
    const invalid = inspectProjectOnboardingV3({ runner: "codex", rootDir: path, deps: fakeDeps });
    assert.equal(invalid.status, "runtime-initialization-required");

    const plan = planProjectOnboardingManifestRepairV4({ rootDir: path, deps: fakeDeps, runner: "codex" });
    assert.equal(plan.status, "ready", JSON.stringify(plan));
    assert.equal(plan.target.path, ".claude/pipeline.yaml");
    assert.equal(plan.target.preservation, "absent-target-only");
    assert.match(plan.planSha256, /^[a-f0-9]{64}$/u);
    assert.equal(plan.applyAction.mutation, true);
    assert.equal(plan.applyAction.requiresConfirmation, true);
    assert.deepEqual(plan.applyAction.argv, [
      ONBOARDING_SCRIPT,
      "apply-manifest-repair",
      "--root",
      path,
      "--plan-sha256",
      plan.planSha256,
      "--activate",
    ]);

    const wrong = applyProjectOnboardingManifestRepairV4({ runner: "codex",
      rootDir: path,
      planSha256: "0".repeat(64),
      activate: true,
      deps: fakeDeps,
    });
    assert.equal(wrong.status, "runtime-initialization-required");
    assert.equal(existsSync(manifestPath), false);

    writeFileSync(manifestPath, "foreign: manifest bytes\n");
    const drifted = applyProjectOnboardingManifestRepairV4({ runner: "codex",
      rootDir: path,
      planSha256: plan.planSha256,
      activate: true,
      deps: fakeDeps,
    });
    assert.equal(drifted.status, "partial");
    assert.equal(readFileSync(manifestPath, "utf8"), "foreign: manifest bytes\n");
    unlinkSync(manifestPath);

    const repaired = applyProjectOnboardingManifestRepairV4({ runner: "codex",
      rootDir: path,
      planSha256: plan.planSha256,
      activate: true,
      deps: fakeDeps,
    });
    assert.equal(repaired.status, "intake-required");
    assert.equal(readFileSync(manifestPath, "utf8").includes("human_facing: en"), true);
  } finally { dispose(path); }
});

test("manifest repair never claims ready when post-publication durability is unavailable", () => {
  const path = root();
  try {
    initializeRuntimeProjectionRoot(path);
    unlinkSync(join(path, ".claude", "pipeline.yaml"));
    const plan = planProjectOnboardingManifestRepairV4({ rootDir: path, deps: fakeDeps, runner: "codex" });
    const result = applyProjectOnboardingManifestRepairV4({ runner: "codex",
      rootDir: path,
      planSha256: plan.planSha256,
      activate: true,
      deps: {
        ...fakeDeps,
        fsyncDirectory() { throw new Error("synthetic durability failure"); },
      },
    });
    assert.equal(result.status, "partial");
    assertDiagnostic(result, "manifest_repair_durability_unavailable");
    assert.equal(existsSync(join(path, ".claude", "pipeline.yaml")), true);
  } finally { dispose(path); }
});

test("manifest repair rejects non-UTF-8 unowned bytes without rewriting them", () => {
  const path = root();
  try {
    initializeRuntimeProjectionRoot(path);
    const manifestPath = join(path, ".claude", "pipeline.yaml");
    const original = Buffer.concat([
      readFileSync(manifestPath),
      Buffer.from("# invalid-unowned-byte: ", "utf8"),
      Buffer.from([0xff]),
      Buffer.from("\n", "utf8"),
    ]);
    writeFileSync(manifestPath, original);
    const plan = planProjectOnboardingManifestRepairV4({ rootDir: path, deps: fakeDeps, runner: "codex" });
    assert.equal(plan.status, "unrepairable");
    assertDiagnostic(plan, "manifest_unowned_bytes_unpreservable");
    assert.equal(readFileSync(manifestPath).compare(original), 0);
  } finally { dispose(path); }
});

test("manifest repair rejects source drift before publication and leaves the manifest absent", () => {
  const path = root();
  try {
    initializeRuntimeProjectionRoot(path);
    const manifestPath = join(path, ".claude", "pipeline.yaml");
    const sourcePath = join(path, "pipeline.user.yaml");
    unlinkSync(manifestPath);
    const plan = planProjectOnboardingManifestRepairV4({ rootDir: path, deps: fakeDeps, runner: "codex" });
    let injected = false;
    const result = applyProjectOnboardingManifestRepairV4({ runner: "codex",
      rootDir: path,
      planSha256: plan.planSha256,
      activate: true,
      deps: {
        ...fakeDeps,
        openSync(target, ...args) {
          const fd = openSync(target, ...args);
          if (!injected && String(target).includes(".pipeline-manifest-repair-")) {
            injected = true;
            writeFileSync(sourcePath, `${readFileSync(sourcePath, "utf8")}# concurrent source drift\n`);
          }
          return fd;
        },
      },
    });
    assert.equal(result.status, "runtime-initialization-required");
    assert.equal(existsSync(manifestPath), false);
    assert.equal(injected, true);
  } finally { dispose(path); }
});

test("manifest repair stays inside its pinned parent when the pathname becomes a symlink", () => {
  const path = root();
  const outside = root();
  try {
    initializeRuntimeProjectionRoot(path);
    const parent = join(path, ".claude");
    const displaced = join(path, ".claude-displaced");
    unlinkSync(join(parent, "pipeline.yaml"));
    const plan = planProjectOnboardingManifestRepairV4({ rootDir: path, deps: fakeDeps, runner: "codex" });
    let injected = false;
    const result = applyProjectOnboardingManifestRepairV4({ runner: "codex",
      rootDir: path,
      planSha256: plan.planSha256,
      activate: true,
      deps: {
        ...fakeDeps,
        linkSync(source, target) {
          if (!injected && String(source).includes(".pipeline-manifest-repair-")) {
            injected = true;
            renameSync(parent, displaced);
            symlinkSync(outside, parent, "dir");
          }
          linkSync(source, target);
        },
      },
    });
    assert.equal(result.status, "partial");
    assertDiagnostic(result, "manifest_repair_parent_changed_after_commit");
    assert.equal(injected, true);
    assert.equal(existsSync(join(outside, "pipeline.yaml")), false);
    assert.equal(existsSync(join(displaced, "pipeline.yaml")), false);
    assert.equal(readdirSync(displaced).some((name) => name.startsWith(".pipeline-manifest-repair-quarantine-")), true);
  } finally { dispose(path); dispose(outside); }
});

test("manifest repair quarantines a publication-boundary source race", () => {
  const path = root();
  try {
    initializeRuntimeProjectionRoot(path);
    const manifestPath = join(path, ".claude", "pipeline.yaml");
    const sourcePath = join(path, "pipeline.user.yaml");
    unlinkSync(manifestPath);
    const plan = planProjectOnboardingManifestRepairV4({ rootDir: path, deps: fakeDeps, runner: "codex" });
    let injected = false;
    const result = applyProjectOnboardingManifestRepairV4({ runner: "codex",
      rootDir: path,
      planSha256: plan.planSha256,
      activate: true,
      deps: {
        ...fakeDeps,
        linkSync(source, target) {
          linkSync(source, target);
          if (!injected && String(source).includes(".pipeline-manifest-repair-")) {
            injected = true;
            writeFileSync(sourcePath, `${readFileSync(sourcePath, "utf8")}# publication-boundary drift\n`);
          }
        },
      },
    });
    assert.equal(result.status, "partial");
    assertDiagnostic(result, "manifest_repair_source_changed_after_commit");
    assert.equal(injected, true);
    assert.equal(existsSync(manifestPath), false);
  } finally { dispose(path); }
});

test("manifest repair retains its publication binding through final durability readback", () => {
  const path = root();
  try {
    initializeRuntimeProjectionRoot(path);
    const manifestPath = join(path, ".claude", "pipeline.yaml");
    const sourcePath = join(path, "pipeline.user.yaml");
    unlinkSync(manifestPath);
    const plan = planProjectOnboardingManifestRepairV4({ rootDir: path, deps: fakeDeps, runner: "codex" });
    let syncs = 0;
    const result = applyProjectOnboardingManifestRepairV4({ runner: "codex",
      rootDir: path,
      planSha256: plan.planSha256,
      activate: true,
      deps: {
        ...fakeDeps,
        fsyncDirectory() {
          syncs += 1;
          if (syncs === 2) {
            writeFileSync(sourcePath, `${readFileSync(sourcePath, "utf8")}# final-readback drift\n`);
          }
        },
      },
    });
    assert.equal(result.status, "partial");
    assertDiagnostic(result, "manifest_repair_source_changed_after_commit");
    assert.equal(syncs, 2);
    assert.equal(existsSync(manifestPath), false);
  } finally { dispose(path); }
});

test("manifest repair atomically preserves a target that appears at publication", () => {
  const path = root();
  try {
    initializeRuntimeProjectionRoot(path);
    const manifestPath = join(path, ".claude", "pipeline.yaml");
    unlinkSync(manifestPath);
    const plan = planProjectOnboardingManifestRepairV4({ rootDir: path, deps: fakeDeps, runner: "codex" });
    let injected = false;
    const result = applyProjectOnboardingManifestRepairV4({ runner: "codex",
      rootDir: path,
      planSha256: plan.planSha256,
      activate: true,
      deps: {
        ...fakeDeps,
        linkSync(source, target) {
          if (!injected && String(target).endsWith("/pipeline.yaml")) {
            injected = true;
            writeFileSync(manifestPath, "foreign: publication race\n", { flag: "wx" });
          }
          linkSync(source, target);
        },
      },
    });
    assert.equal(result.status, "partial");
    assert.equal(injected, true);
    assert.equal(readFileSync(manifestPath, "utf8"), "foreign: publication race\n");
  } finally { dispose(path); }
});

test("manifest repair never quarantines a foreign post-publication target", () => {
  const path = root();
  try {
    initializeRuntimeProjectionRoot(path);
    const manifestPath = join(path, ".claude", "pipeline.yaml");
    unlinkSync(manifestPath);
    const plan = planProjectOnboardingManifestRepairV4({ rootDir: path, deps: fakeDeps, runner: "codex" });
    let injected = false;
    const result = applyProjectOnboardingManifestRepairV4({ runner: "codex",
      rootDir: path,
      planSha256: plan.planSha256,
      activate: true,
      deps: {
        ...fakeDeps,
        linkSync(source, target) {
          linkSync(source, target);
          if (!injected && String(target).endsWith("/pipeline.yaml")) {
            injected = true;
            unlinkSync(target);
            writeFileSync(manifestPath, "foreign: post-publication swap\n", { flag: "wx" });
          }
        },
      },
    });
    assert.equal(result.status, "partial");
    assertDiagnostic(result, "manifest_repair_rollback_incomplete");
    assert.equal(injected, true);
    assert.equal(readFileSync(manifestPath, "utf8"), "foreign: post-publication swap\n");
    assert.equal(
      readdirSync(join(path, ".claude")).some((name) => name.startsWith(".pipeline-manifest-repair-quarantine-")),
      false,
    );
  } finally { dispose(path); }
});

test("source recovery planner distinguishes invalid authority and unsupported runner transitions", () => {
  const invalid = root(); const unsupported = root();
  try {
    writeFileSync(join(invalid, "pipeline.user.yaml"), "schema: pipeline.user.v3\n");
    const observedInvalid = inspectProjectOnboardingV3({ runner: "codex", rootDir: invalid, deps: fakeDeps });
    assert.equal(observedInvalid.status, "invalid");
    assert.deepEqual(observedInvalid.nextAction.argv, [
      ONBOARDING_SCRIPT,
      "plan-source-recovery",
      "--root",
      invalid,
          "--runner",
      "codex",
    ]);
    const invalidPlan = planProjectOnboardingSourceRecoveryV4({ rootDir: invalid, deps: fakeDeps });
    assert.equal(invalidPlan.status, "unrepairable");
    assert.equal(invalidPlan.category, "invalid-authority");
    assertDiagnostic(invalidPlan, "source_authority_unrepairable", ["repairCommand", "underlyingDiagnostics"]);
    // NVA-RECOVERYDEADEND-1: this is the exact live incident -- `invalid`'s
    // pipeline.user.yaml is v3-valid at the top level (recognized schema) but
    // fails a nested constraint, and the diagnostic this produces must not
    // point back at plan-source-recovery (its own single caller); it must
    // instead surface the real validation reason so a reader is not sent in
    // a circle.
    assertNoAutomatedRepairRoute(invalidPlan.diagnostics[0].repairCommand);
    // This diagnostic's own guidance must not point back at
    // plan-source-recovery -- its own single caller (background fact in the
    // briefing) -- unlike the unsupported-runner-transition guidance checked
    // a few lines below, which legitimately names it as a valid next step
    // once a human has externally fixed a *different* problem.
    assert.doesNotMatch(invalidPlan.diagnostics[0].repairCommand.guidance, /\bplan-source-recovery\b/u);
    assertUnderlyingDiagnostics(invalidPlan.diagnostics[0].underlyingDiagnostics);

    const seed = planProjectOnboardingV3({ runner: "codex", rootDir: unsupported, deps: fakeDeps });
    assert.equal(applyProjectOnboardingV3(seed, { rootDir: unsupported, activate: true, deps: fakeDeps }).status, "applied");
    const sourcePath = join(unsupported, "pipeline.user.yaml");
    writeFileSync(sourcePath, readFileSync(sourcePath, "utf8").replace(/default: "?codex"?/u, "default: \"claude\""));
    const observedUnsupported = inspectProjectOnboardingV3({ runner: "codex", rootDir: unsupported, deps: fakeDeps });
    assert.equal(observedUnsupported.status, "runtime-initialization-required");
    const unsupportedPlan = planProjectOnboardingSourceRecoveryV4({ rootDir: unsupported, deps: fakeDeps });
    assert.equal(unsupportedPlan.status, "unrepairable");
    assert.equal(unsupportedPlan.category, "unsupported-source-transition");
    assertDiagnostic(unsupportedPlan, "source_runner_transition_unsupported", ["repairCommand"]);
    // NVA-SOURCERECOVERY-1: this planner explicitly refuses to rewrite the
    // runner allowlist itself, so no plan-source-recovery command can help --
    // the typed "no automated route" shape must say so, not point in a circle.
    assertNoAutomatedRepairRoute(unsupportedPlan.diagnostics[0].repairCommand);
  } finally { dispose(invalid); dispose(unsupported); }
});

test("manifest repair admits a Claude-default, Claude-invoked V3 source (NVA-MANIFESTRUNNER-1)", () => {
  const path = root();
  try {
    initializeClaudeOnboardedRoot(path);
    unlinkSync(join(path, ".claude", "pipeline.yaml"));
    const plan = planProjectOnboardingManifestRepairV4({ rootDir: path, deps: fakeDeps, runner: "claude" });
    assert.equal(plan.status, "ready", JSON.stringify(plan));
  } finally { dispose(path); }
});

test("source recovery planner admits a Claude-default, Claude-invoked current V3 source (NVA-MANIFESTRUNNER-1)", () => {
  const path = root();
  try {
    const seed = planProjectOnboardingV3({ runner: "claude", rootDir: path, deps: fakeDeps });
    assert.equal(applyProjectOnboardingV3(seed, { rootDir: path, activate: true, deps: fakeDeps }).status, "applied");
    const plan = planProjectOnboardingSourceRecoveryV4({ rootDir: path, deps: fakeDeps, runner: "claude" });
    // Before the fix, `selectedRunnerIsCodex` unconditionally flagged this
    // source as unsupported (it required `default === "codex"`), even though
    // the source is genuinely current for the invoking Claude session.
    assert.equal(plan.status, "unrepairable");
    assert.equal(plan.category, "current-authority");
    assertDiagnostic(plan, "source_is_current", ["repairCommand"]);
    // NVA-SOURCERECOVERY-1: the source itself is fine here -- this planner is
    // not the controlling issue, so it must say plainly that no
    // plan-source-recovery command is the fix, not hand back a dead command.
    assertNoAutomatedRepairRoute(plan.diagnostics[0].repairCommand);
  } finally { dispose(path); }
});

test("NVA-SOURCERECOVERY-1: the recoverable source-recovery paths are unchanged by the repairCommand fix", () => {
  const legacy = root();
  try {
    writeFileSync(join(legacy, "pipeline.user.yaml"), yaml(v0Source()));
    const plan = planProjectOnboardingSourceRecoveryV4({ runner: "codex", rootDir: legacy, deps: fakeDeps });
    assert.equal(plan.status, "recoverable");
    assert.equal(plan.category, "unsupported-source-transition");
    assert.equal(plan.nextAction?.mutation, false);
    assertDiagnostic(plan, "legacy_source_transition_required");
  } finally { dispose(legacy); }
});

test("owned runtime drift and invalid V3 sources stay in closed lifecycle classifications", () => {
  const drifted = root(); const invalid = root();
  try {
    const seed = planProjectOnboardingV3({ runner: "codex", rootDir: drifted, deps: fakeDeps });
    assert.equal(applyProjectOnboardingV3(seed, { rootDir: drifted, activate: true, deps: fakeDeps }).status, "applied");
    const runtime = planProjectOnboardingLifecycleV4({ runner: "codex", rootDir: drifted, deps: fakeDeps, operation: "runtime" });
    const runtimeDigest = runtime.nextAction.argv[runtime.nextAction.argv.indexOf("--plan-sha256") + 1];
    assert.equal(applyProjectOnboardingLifecycleV4({ runner: "codex", rootDir: drifted, deps: fakeDeps, operation: "runtime", planSha256: runtimeDigest, activate: true }).status, "restart-required");
    const implementor = join(drifted, ".codex", "agents", "implementor.toml");
    writeFileSync(implementor, readFileSync(implementor, "utf8").replace(/^model = ".*"$/mu, "model = \"drifted\""));
    const observedDrift = inspectProjectOnboardingV3({ runner: "codex", rootDir: drifted, deps: fakeDeps });
    assert.equal(observedDrift.status, "projection-drift");
    assert.equal(observedDrift.runtime.status, "projection-drift");
    assertDiagnostic(observedDrift, "projection_drift");
    assertSingleLineAction(observedDrift.nextAction, {
      kind: "command",
      executable: "node",
      argv: [ONBOARDING_SCRIPT, "plan-repair", "--root", drifted, "--runner", "codex"],
      mutation: false,
      requiresConfirmation: false,
      expected: {
        schema: "pipeline.project-onboarding.v4",
        statuses: ["projection-drift"],
      },
    });

    writeFileSync(join(invalid, "pipeline.user.yaml"), "schema: pipeline.user.v3\n");
    const observedInvalid = inspectProjectOnboardingV3({ runner: "codex", rootDir: invalid, deps: fakeDeps });
    assert.equal(observedInvalid.status, "invalid");
    assert.equal(observedInvalid.runner, null);
    assert.equal(observedInvalid.diagnostics[0].code, "source_invalid");
    assert.equal(observedInvalid.nextAction.argv[1], "plan-source-recovery");
  } finally { dispose(drifted); dispose(invalid); }
});

test("H3 recovery planners are typed, read-only, and closed on invalid source evidence", () => {
  const path = root();
  try {
    const before = readdirSync(path);
    const source = planProjectOnboardingSourceRecovery({ runner: "codex", rootDir: path, deps: fakeDeps });
    assert.equal(source.schema, "pipeline.project-onboarding-source-recovery.v1");
    assert.equal(source.status, "unrepairable");
    assert.equal(source.category, "invalid-authority");
    assert.equal(source.nextAction, null);
    const manifest = planProjectOnboardingManifestRepair({ rootDir: path, deps: fakeDeps });
    assert.equal(manifest.schema, "pipeline.project-onboarding-manifest-repair-plan.v1");
    assert.equal(manifest.status, "unrepairable");
    assert.deepEqual(readdirSync(path), before);
  } finally { dispose(path); }
});

test("H3 manifest repair uses a real V3 authority fixture and returns ready readback", () => {
  const path = root();
  try {
    const barrier = initializeRestartRequiredRoot(path, fakeDeps);
    clearRuntimeBarrier(path, barrier);
    completeKickoff(path, "H3 manifest repair ready readback", fakeDeps);
    const ready = inspectProjectOnboardingV3({ runner: "codex", rootDir: path, deps: fakeDeps, intent: "bootstrap" });
    assert.equal(ready.status, "ready");
    unlinkSync(join(path, ".claude", "pipeline.yaml"));
    const before = names(path);
    const plan = planProjectOnboardingManifestRepair({ rootDir: path, deps: fakeDeps });
    assert.equal(plan.status, "ready");
    assert.deepEqual(names(path), before);
    const repeat = planProjectOnboardingManifestRepair({ rootDir: path, deps: fakeDeps });
    assert.equal(repeat.planSha256, plan.planSha256);
    const applied = applyProjectOnboardingManifestRepair({ runner: "codex", rootDir: path, planSha256: plan.planSha256, activate: true, deps: fakeDeps });
    assert.equal(applied.status, "ready", JSON.stringify(applied));
    assert.equal(applied.readback.status, "ready");
    assert.equal(inspectProjectOnboardingV3({ runner: "codex", rootDir: path, deps: fakeDeps, intent: "bootstrap" }).status, "ready");
  } finally { dispose(path); }
});

function readyManifestFixture() {
  const path = root();
  const barrier = initializeRestartRequiredRoot(path, fakeDeps);
  clearRuntimeBarrier(path, barrier);
  completeKickoff(path, "H3 manifest repair authority", fakeDeps);
  unlinkSync(join(path, ".claude", "pipeline.yaml"));
  return path;
}

test("H3 manifest repair rejects wrong digest and missing activation without writes", () => {
  const path = readyManifestFixture();
  try {
    const plan = planProjectOnboardingManifestRepair({ rootDir: path, deps: fakeDeps });
    const before = names(path);
    assert.equal(applyProjectOnboardingManifestRepair({ runner: "codex", rootDir: path, planSha256: "0".repeat(64), activate: true, deps: fakeDeps }).status, "invalid-plan");
    assert.equal(applyProjectOnboardingManifestRepair({ runner: "codex", rootDir: path, planSha256: plan.planSha256, activate: false, deps: fakeDeps }).status, "activation-required");
    assert.deepEqual(names(path), before);
  } finally { dispose(path); }
});

test("H3 manifest repair preserves absent target after source drift and target appearance races", () => {
  const drift = readyManifestFixture();
  try {
    const plan = planProjectOnboardingManifestRepair({ rootDir: drift, deps: fakeDeps });
    writeFileSync(join(drift, "pipeline.user.yaml"), `${readFileSync(join(drift, "pipeline.user.yaml"), "utf8")}\n# drift\n`);
    const result = applyProjectOnboardingManifestRepair({ runner: "codex", rootDir: drift, planSha256: plan.planSha256, activate: true, deps: fakeDeps });
    assert.equal(result.status, "invalid-plan");
    assert.equal(existsSync(join(drift, ".claude", "pipeline.yaml")), false);
  } finally { dispose(drift); }
  for (const kind of ["file", "symlink", "hardlink"]) {
    const path = readyManifestFixture();
    try {
      const plan = planProjectOnboardingManifestRepair({ rootDir: path, deps: fakeDeps });
      const target = join(path, ".claude", "pipeline.yaml");
      if (kind === "file") writeFileSync(target, "foreign\n");
      else if (kind === "symlink") symlinkSync(join(path, "pipeline.user.yaml"), target);
      else linkSync(join(path, "pipeline.user.yaml"), target);
      const result = applyProjectOnboardingManifestRepair({ runner: "codex", rootDir: path, planSha256: plan.planSha256, activate: true, deps: fakeDeps });
      assert.equal(result.status, "invalid-plan");
      assert.equal(lstatSync(target).isSymbolicLink(), kind === "symlink");
    } finally { dispose(path); }
  }
});

test("H3 manifest repair rolls back only owned output on fsync and publication races", () => {
  const fsyncRoot = readyManifestFixture();
  try {
    const plan = planProjectOnboardingManifestRepair({ rootDir: fsyncRoot, deps: fakeDeps });
    assert.equal(plan.status, "ready", JSON.stringify(plan));
    const failing = { ...fakeDeps, fsyncSync() { throw new Error("injected fsync failure"); } };
    const result = applyProjectOnboardingManifestRepair({ runner: "codex", rootDir: fsyncRoot, planSha256: plan.planSha256, activate: true, deps: failing });
    assert.equal(result.status, "rolled-back", JSON.stringify({
      result,
      planned: plan,
      replanned: planProjectOnboardingManifestRepair({ rootDir: fsyncRoot, deps: failing }),
    }));
    assert.equal(existsSync(join(fsyncRoot, ".claude", "pipeline.yaml")), false);
  } finally { dispose(fsyncRoot); }
  const raceRoot = readyManifestFixture();
  try {
    const plan = planProjectOnboardingManifestRepair({ rootDir: raceRoot, deps: fakeDeps });
    assert.equal(plan.status, "ready", JSON.stringify(plan));
    const nativeLink = linkSync; const nativeLstat = lstatSync; let linked = false; let swapped = false;
    const target = join(raceRoot, ".claude", "pipeline.yaml");
    const race = {
      ...fakeDeps,
      linkSync(temp, destination) { nativeLink(temp, destination); linked = true; },
      lstatSync(candidate) {
        const info = nativeLstat(candidate);
        if (linked && !swapped && candidate === target) {
          swapped = true;
          unlinkSync(candidate);
          writeFileSync(candidate, "foreign publication\n");
        }
        return info;
      },
    };
    const result = applyProjectOnboardingManifestRepair({ runner: "codex", rootDir: raceRoot, planSha256: plan.planSha256, activate: true, deps: race });
    assert.equal(result.status, "rolled-back", JSON.stringify({
      result,
      planned: plan,
      replanned: planProjectOnboardingManifestRepair({ rootDir: raceRoot, deps: race }),
    }));
    assert.equal(readFileSync(join(raceRoot, ".claude", "pipeline.yaml"), "utf8"), "foreign publication\n");
  } finally { dispose(raceRoot); }
});

// NVA-B-CIGREEN-1 regression. The publication race above is only detectable by
// `{dev, ino}` while the replacement file happens to get a DIFFERENT inode
// number. On tmpfs it always does (inode numbers come from a monotonic
// counter), on ext4 it commonly does not (the lowest free inode in the block
// group is reallocated immediately) -- which is why the test above passed on a
// tmpfs `/tmp` and failed on the CI runner with `ENOENT` on its own closing
// read: the rollback had deleted the foreign file. This test removes the
// filesystem from the question by injecting the reuse: the replacement is
// reported under the published file's inode number, so the identity check
// necessarily matches and ownership has to be decided on something else.
test("H3 manifest repair preserves foreign content when the published inode number is reused", () => {
  const reuseRoot = readyManifestFixture();
  try {
    const plan = planProjectOnboardingManifestRepair({ rootDir: reuseRoot, deps: fakeDeps });
    assert.equal(plan.status, "ready", JSON.stringify(plan));
    const nativeLink = linkSync; const nativeLstat = lstatSync;
    const target = join(reuseRoot, ".claude", "pipeline.yaml");
    let linked = false; let swapped = false; let publishedIno = null;
    const reuse = {
      ...fakeDeps,
      linkSync(temp, destination) { nativeLink(temp, destination); linked = true; },
      lstatSync(candidate) {
        const info = nativeLstat(candidate);
        if (!linked || candidate !== target) return info;
        if (!swapped) {
          swapped = true; publishedIno = info.ino;
          unlinkSync(candidate);
          writeFileSync(candidate, "foreign publication\n");
          return info;
        }
        return {
          dev: info.dev, ino: publishedIno, nlink: info.nlink, mode: info.mode, size: info.size,
          isSymbolicLink: () => info.isSymbolicLink(),
          isFile: () => info.isFile(),
          isDirectory: () => info.isDirectory(),
        };
      },
    };
    const result = applyProjectOnboardingManifestRepair({ runner: "codex", rootDir: reuseRoot, planSha256: plan.planSha256, activate: true, deps: reuse });
    assert.equal(swapped, true);
    assert.equal(result.status, "rolled-back", JSON.stringify(result));
    assert.equal(readFileSync(target, "utf8"), "foreign publication\n");
  } finally { dispose(reuseRoot); }
});

test("H3 manifest repair fails closed on V4 readback failure and physical-root symlink", () => {
  const path = readyManifestFixture();
  try {
    const plan = planProjectOnboardingManifestRepair({ rootDir: path, deps: fakeDeps });
    assert.equal(plan.status, "ready", JSON.stringify(plan));
    const failingReadback = { ...fakeDeps, inspectProjectOnboardingV3() { return { status: "partial", diagnostics: [] }; } };
    const result = applyProjectOnboardingManifestRepair({ runner: "codex", rootDir: path, planSha256: plan.planSha256, activate: true, deps: failingReadback });
    assert.equal(result.status, "rolled-back", JSON.stringify({
      result,
      planned: plan,
      replanned: planProjectOnboardingManifestRepair({ rootDir: path, deps: failingReadback }),
    }));
    assert.equal(existsSync(join(path, ".claude", "pipeline.yaml")), false);
  } finally { dispose(path); }
  const real = readyManifestFixture(); const link = `${real}-link`;
  try {
    symlinkSync(real, link);
    const result = planProjectOnboardingManifestRepair({ rootDir: link, deps: fakeDeps });
    assert.equal(result.status, "unrepairable");
  } finally { dispose(real); try { unlinkSync(link); } catch {} }
});

test("H3 source recovery exposes authentic invalid, unsupported, and current categories", () => {
  const invalid = root();
  try { assert.equal(planProjectOnboardingSourceRecovery({ runner: "codex", rootDir: invalid, deps: fakeDeps }).category, "invalid-authority"); } finally { dispose(invalid); }
  const unsupported = root();
  try {
    writeFileSync(join(unsupported, "pipeline.user.yaml"), yaml(v0Source()));
    assert.equal(planProjectOnboardingSourceRecovery({ runner: "codex", rootDir: unsupported, deps: fakeDeps }).category, "unsupported-source-transition");
  } finally { dispose(unsupported); }
  const current = root();
  try {
    const barrier = initializeRestartRequiredRoot(current, fakeDeps); clearRuntimeBarrier(current, barrier); completeKickoff(current, "H3 current authority", fakeDeps);
    assert.equal(planProjectOnboardingSourceRecovery({ runner: "codex", rootDir: current, deps: fakeDeps }).category, "current-authority");
  } finally { dispose(current); }
});

test("H3 source recovery distinguishes stale generated projection from unavailable evidence", () => {
  const stale = root();
  try {
    const barrier = initializeRestartRequiredRoot(stale, fakeDeps);
    clearRuntimeBarrier(stale, barrier);
    completeKickoff(stale, "H3 stale projection authority", fakeDeps);
    unlinkSync(join(stale, ".claude", "pipeline.yaml"));
    const inspected = inspectProjectOnboardingV3({ runner: "codex", rootDir: stale, deps: fakeDeps });
    assert.notEqual(inspected.status, "ready", JSON.stringify(inspected));
    const plan = planProjectOnboardingSourceRecovery({ runner: "codex", rootDir: stale, deps: fakeDeps });
    assert.equal(plan.category, "stale-generated-projection");
    assert.equal(plan.status, "ready");
    assert.equal(plan.nextAction?.mutation, false);
  } finally { dispose(stale); }

  const unavailable = root();
  try {
    const barrier = initializeRestartRequiredRoot(unavailable, fakeDeps);
    clearRuntimeBarrier(unavailable, barrier);
    completeKickoff(unavailable, "H3 unavailable evidence authority", fakeDeps);
    const unavailableDeps = {
      ...fakeDeps,
      classifyOnboardingContinuity: () => ({
        status: "damaged",
        stateSha256: null,
        handoverSha256: null,
        historySha256: null,
      }),
    };
    const inspected = inspectProjectOnboardingV3({ runner: "codex", rootDir: unavailable, deps: unavailableDeps });
    assert.equal(inspected.status, "continuity-damaged", JSON.stringify(inspected));
    const plan = planProjectOnboardingSourceRecovery({ runner: "codex", rootDir: unavailable, deps: unavailableDeps });
    assert.equal(plan.category, "unavailable-evidence");
    assert.equal(plan.status, "unrepairable");
    assert.equal(plan.nextAction, null);
  } finally { dispose(unavailable); }
});

function remoteAdoptionGitFixture({ includesCodex = false, includesAgents = false, failUpstreamBind = false } = {}) {
  const oid = "a".repeat(40); const calls = [];
  const spawn = (command, args, options = {}) => {
    calls.push({ command, args: [...args], cwd: options.cwd });
    if (command !== "git") return { status: 1, stderr: "unexpected program" };
    const cwd = options.cwd;
    if (args[0] === "ls-remote") return { status: 0, stdout: `${oid}\trefs/heads/remote-adoption\n`, stderr: "" };
    if (args[0] === "init") {
      mkdirSync(join(cwd, ".git", "objects"), { recursive: true });
      mkdirSync(join(cwd, ".git", "refs"), { recursive: true });
      writeFileSync(join(cwd, ".git", "HEAD"), "ref: refs/heads/main\n");
      writeFileSync(join(cwd, ".git", "config"), "");
      return { status: 0, stdout: "", stderr: "" };
    }
    if (args[0] === "remote" && args[1] === "add") {
      writeFileSync(join(cwd, ".git", "config"), `[remote \"origin\"]\n\turl = ${args[3]}\n`);
      return { status: 0, stdout: "", stderr: "" };
    }
    if (args[0] === "fetch") {
      mkdirSync(join(cwd, ".git", "refs", "remotes", "origin"), { recursive: true });
      writeFileSync(join(cwd, ".git", "refs", "remotes", "origin", "remote-adoption"), `${oid}\n`);
      return { status: 0, stdout: "", stderr: "" };
    }
    if (args[0] === "rev-parse" && args[1] === "--is-inside-work-tree") return { status: 0, stdout: "true\n", stderr: "" };
    if (args[0] === "rev-parse") return { status: 0, stdout: `${oid}\n`, stderr: "" };
    if (args[0] === "ls-tree") return { status: 0, stdout: includesCodex ? ".codex/config.toml\n" : includesAgents ? ".agents/implementor.toml\n" : "pipeline.user.yaml\n", stderr: "" };
    if (args[0] === "checkout") {
      mkdirSync(join(cwd, ".git", "refs", "heads"), { recursive: true });
      writeFileSync(join(cwd, ".git", "refs", "heads", "remote-adoption"), `${oid}\n`);
      writeFileSync(join(cwd, ".git", "HEAD"), "ref: refs/heads/remote-adoption\n");
      writeFileSync(join(cwd, "pipeline.user.yaml"), yaml(v0Source()));
      return { status: 0, stdout: "", stderr: "" };
    }
    if (args[0] === "branch" && args[1] === "--set-upstream-to") {
      if (failUpstreamBind) return { status: 1, stderr: "injected upstream failure" };
      writeFileSync(join(cwd, ".git", "config"), `${readFileSync(join(cwd, ".git", "config"), "utf8")}[branch \"remote-adoption\"]\n\tremote = origin\n\tmerge = refs/heads/remote-adoption\n`);
      return { status: 0, stdout: "", stderr: "" };
    }
    return { status: 1, stderr: `unexpected git ${args.join(" ")}` };
  };
  return { oid, calls, spawn };
}

test("remote branch adoption plans read-only, preserves .codex, and advances only to the branch authority migration", () => {
  const target = root(); const fixture = remoteAdoptionGitFixture();
  try {
    mkdirSync(join(target, ".codex"));
    writeFileSync(join(target, ".codex", "control.toml"), "reserved = true\n");
    mkdirSync(join(target, ".agents"));
    writeFileSync(join(target, ".agents", "control.toml"), "reserved = true\n");
    const beforeCodex = lstatSync(join(target, ".codex"));
    const beforeAgents = lstatSync(join(target, ".agents"));
    const remoteDeps = { ...fakeDeps, spawnSync: fixture.spawn };
    const plan = planProjectRemoteAdoptionV4({
      rootDir: target, remote: "https://example.test/governed.git", ref: "refs/heads/remote-adoption", deps: remoteDeps,
    });
    assert.equal(plan.schema, "pipeline.project-onboarding-remote-adoption-plan.v1");
    assert.equal(plan.status, "ready");
    assert.deepEqual(names(target), [".agents", ".codex"], "planning must not seed or initialize the target");
    assert.equal(plan.authority.status, "deferred-until-exact-branch-checkout");
    assert.equal(plan.applyAction.mutation, true);
    assert.equal(plan.applyAction.requiresConfirmation, true);
    assert.equal(plan.applyAction.requiresHostBoundary, true);
    const applied = applyProjectRemoteAdoptionV4({ runner: "codex",
      rootDir: target, remote: "https://example.test/governed.git", ref: "refs/heads/remote-adoption",
      planSha256: plan.planSha256, activate: true, deps: remoteDeps,
    });
    assert.equal(applied.status, "migration-required", JSON.stringify(applied));
    assert.equal(readFileSync(join(target, ".git", "refs", "heads", "remote-adoption"), "utf8"), `${fixture.oid}\n`);
    assert.match(readFileSync(join(target, ".git", "config"), "utf8"), /remote = origin/u);
    assert.match(readFileSync(join(target, ".git", "config"), "utf8"), /merge = refs\/heads\/remote-adoption/u);
    const afterCodex = lstatSync(join(target, ".codex"));
    assert.equal(String(afterCodex.dev), String(beforeCodex.dev));
    assert.equal(String(afterCodex.ino), String(beforeCodex.ino));
    assert.equal(readFileSync(join(target, ".codex", "control.toml"), "utf8"), "reserved = true\n");
    const afterAgents = lstatSync(join(target, ".agents"));
    assert.equal(String(afterAgents.dev), String(beforeAgents.dev));
    assert.equal(String(afterAgents.ino), String(beforeAgents.ino));
    assert.equal(readFileSync(join(target, ".agents", "control.toml"), "utf8"), "reserved = true\n");
    assert.equal(existsSync(join(target, "project", "state.json")), false);
    assert.equal(existsSync(join(target, ".claude", "pipeline.json")), false);
  } finally { dispose(target); }
});

test("remote adoption rejects a remote .agents and preserves the target control mount", () => {
  const target = root(); const fixture = remoteAdoptionGitFixture({ includesAgents: true });
  try {
    mkdirSync(join(target, ".agents"));
    writeFileSync(join(target, ".agents", "control.toml"), "reserved = true\n");
    const before = lstatSync(join(target, ".agents"));
    const remoteDeps = { ...fakeDeps, spawnSync: fixture.spawn };
    const plan = planProjectRemoteAdoptionV4({
      rootDir: target, remote: "https://example.test/governed.git", ref: "refs/heads/remote-adoption", deps: remoteDeps,
    });
    const applied = applyProjectRemoteAdoptionV4({ runner: "codex",
      rootDir: target, remote: "https://example.test/governed.git", ref: "refs/heads/remote-adoption",
      planSha256: plan.planSha256, activate: true, deps: remoteDeps,
    });
    assert.equal(applied.status, "remote-adoption-rolled-back", JSON.stringify(applied));
    assert.deepEqual(names(target), [".agents"]);
    const after = lstatSync(join(target, ".agents"));
    assert.equal(String(after.dev), String(before.dev));
    assert.equal(String(after.ino), String(before.ino));
    assert.equal(readFileSync(join(target, ".agents", "control.toml"), "utf8"), "reserved = true\n");
  } finally { dispose(target); }
});

test("remote adoption rejects a remote .codex and rolls back only its owned Git transaction", () => {
  const target = root(); const fixture = remoteAdoptionGitFixture({ includesCodex: true });
  try {
    mkdirSync(join(target, ".codex"));
    writeFileSync(join(target, ".codex", "control.toml"), "reserved = true\n");
    const remoteDeps = { ...fakeDeps, spawnSync: fixture.spawn };
    const plan = planProjectRemoteAdoptionV4({
      rootDir: target, remote: "https://example.test/governed.git", ref: "refs/heads/remote-adoption", deps: remoteDeps,
    });
    const applied = applyProjectRemoteAdoptionV4({ runner: "codex",
      rootDir: target, remote: "https://example.test/governed.git", ref: "refs/heads/remote-adoption",
      planSha256: plan.planSha256, activate: true, deps: remoteDeps,
    });
    assert.equal(applied.status, "remote-adoption-rolled-back", JSON.stringify(applied));
    assert.deepEqual(names(target), [".codex"]);
    assert.equal(readFileSync(join(target, ".codex", "control.toml"), "utf8"), "reserved = true\n");
  } finally { dispose(target); }
});

test("remote adoption rolls back the checked-out branch when its owned upstream bind fails", () => {
  const target = root(); const fixture = remoteAdoptionGitFixture({ failUpstreamBind: true });
  try {
    mkdirSync(join(target, ".codex"));
    writeFileSync(join(target, ".codex", "control.toml"), "reserved = true\n");
    const remoteDeps = { ...fakeDeps, spawnSync: fixture.spawn };
    const plan = planProjectRemoteAdoptionV4({
      rootDir: target, remote: "https://example.test/governed.git", ref: "refs/heads/remote-adoption", deps: remoteDeps,
    });
    const applied = applyProjectRemoteAdoptionV4({ runner: "codex",
      rootDir: target, remote: "https://example.test/governed.git", ref: "refs/heads/remote-adoption",
      planSha256: plan.planSha256, activate: true, deps: remoteDeps,
    });
    assert.equal(applied.status, "remote-adoption-rolled-back", JSON.stringify(applied));
    assert.deepEqual(names(target), [".codex"]);
    assert.equal(existsSync(join(target, "pipeline.user.yaml")), false);
  } finally { dispose(target); }
});

test("remote adoption refuses a normal initialized Git repository before remote observation", () => {
  const target = root(); const fixture = remoteAdoptionGitFixture();
  try {
    mkdirSync(join(target, ".git", "objects"), { recursive: true });
    mkdirSync(join(target, ".git", "refs"), { recursive: true });
    writeFileSync(join(target, ".git", "HEAD"), "ref: refs/heads/main\n");
    writeFileSync(join(target, ".git", "config"), "");
    const planned = planProjectRemoteAdoptionV4({
      rootDir: target, remote: "https://example.test/governed.git", ref: "refs/heads/remote-adoption",
      deps: { ...fakeDeps, spawnSync: fixture.spawn },
    });
    assert.equal(planned.status, "target-not-fresh");
    assert.equal(planned.diagnostics[0]?.code, "git_control_not_host_reserved");
    assert.equal(fixture.calls.some(({ args }) => args[0] === "ls-remote"), false);
  } finally { dispose(target); }
});

test("partial authority planner requires an explicit V3 selection and hashes preserved user projections", () => {
  const path = root();
  try {
    mkdirSync(join(path, ".claude"));
    writeFileSync(join(path, ".claude", "pipeline.json"), '{"project":"legacy"}\n');
    mkdirSync(join(path, ".agents"));
    writeFileSync(join(path, ".agents", "AGENTS.md"), "user-owned\n");
    const missing = planProjectPartialAuthorityAdoption({ runner: "codex", rootDir: path, deps: fakeDeps });
    assert.equal(missing.status, "selection-required");
    const planned = planProjectPartialAuthorityAdoption({ runner: "codex", rootDir: path, profile: "epic", source: "canonical-fresh-v3", deps: fakeDeps });
    assert.equal(planned.status, "ready");
    assert.match(planned.planSha256, /^[a-f0-9]{64}$/u);
    assert.deepEqual(planned.artifacts.map((entry) => entry.path), [".agents", ".claude"]);
    assert.equal(planned.mutation, false);
    // F1: this reconstruction route seeds the identical blocking `push` gate
    // chapter as the primary onboarding flow (freshGateChapter), so it must
    // also plan the matching proof policy -- otherwise a reconstructed
    // project's first `approve-push` refuses with
    // CRITICAL-PROOF-POLICY-KIND-REQUIRED, the exact defect this policy
    // exists to remove.
    assert.equal(planned.targets.some((target) => target.path === "project/critical-human-proof.json"), true,
      "the partial-authority plan must include the critical-human-proof policy target");
  } finally { dispose(path); }
});

test("partial authority apply creates only absent owned targets and preserves user projections", () => {
  const path = root();
  try {
    mkdirSync(join(path, ".claude"));
    writeFileSync(join(path, ".claude", "pipeline.json"), '{"project":"legacy"}\n');
    mkdirSync(join(path, ".agents"));
    writeFileSync(join(path, ".agents", "AGENTS.md"), "user-owned\n");
    mkdirSync(join(path, ".codex"));
    writeFileSync(join(path, ".codex", "hooks.json"), "user-owned\n");
    const plan = planProjectPartialAuthorityAdoption({ runner: "codex", rootDir: path, profile: "feature", source: "canonical-fresh-v3", deps: fakeDeps });
    const applied = applyProjectPartialAuthorityAdoption({ runner: "codex", rootDir: path, profile: "feature", source: "canonical-fresh-v3", planSha256: plan.planSha256, activate: true, deps: fakeDeps });
    assert.equal(applied.status, "applied", JSON.stringify(applied));
    assert.equal(existsSync(join(path, "pipeline.user.yaml")), true);
    assert.equal(existsSync(join(path, ".claude", "pipeline.yaml")), true);
    assert.equal(existsSync(join(path, "project", "pipeline.yaml")), true);
    assert.equal(readFileSync(join(path, ".claude", "pipeline.json"), "utf8"), '{"project":"legacy"}\n');
    assert.equal(readFileSync(join(path, ".agents", "AGENTS.md"), "utf8"), "user-owned\n");
    assert.equal(readFileSync(join(path, ".codex", "hooks.json"), "utf8"), "user-owned\n");
    // F1: materialized by activation, not merely planned, and with the same
    // shape (`requiredKinds: ["push"]`) the primary onboarding route seeds --
    // this route seeds the identical blocking `push` gate chapter, so the
    // reconstructed project's first `approve-push` must not refuse with
    // CRITICAL-PROOF-POLICY-KIND-REQUIRED.
    const policyPath = join(path, "project", "critical-human-proof.json");
    assert.equal(existsSync(policyPath), true, "critical-human-proof.json must be materialized by partial-authority activation");
    const policy = JSON.parse(readFileSync(policyPath, "utf8"));
    assert.equal(policy.schema, "pipeline.critical-human-proof-policy.v1");
    assert.deepEqual(policy.requiredKinds, ["push"]);
  } finally { dispose(path); }
});

test("reinstall quarantines only current V3 authority and leaves legacy calibration intact", () => {
  const path = root();
  try {
    assert.equal(spawnSync("git", ["init", "--initial-branch=main"], { cwd: path }).status, 0);
    const realDeps = { ...fakeDeps, spawnSync };
    const portable = planProjectOnboardingV3({ runner: "codex", rootDir: path, deps: realDeps });
    assert.equal(applyProjectOnboardingV3(portable, { rootDir: path, activate: true, deps: realDeps }).status, "applied");
    const runtime = planProjectOnboardingLifecycleV4({ runner: "codex", rootDir: path, deps: realDeps, operation: "runtime" });
    const runtimeDigest = runtime.nextAction.argv[runtime.nextAction.argv.indexOf("--plan-sha256") + 1];
    assert.equal(applyProjectOnboardingLifecycleV4({ runner: "codex", rootDir: path, deps: realDeps, operation: "runtime", planSha256: runtimeDigest, activate: true }).status, "restart-required");
    const legacy = readFileSync(join(path, ".claude", "pipeline.json"), "utf8");
    const plan = planProjectOnboardingReinstall({ rootDir: path, deps: realDeps });
    assert.equal(plan.status, "ready", JSON.stringify(plan));
    const applied = applyProjectOnboardingReinstall({ rootDir: path, planSha256: plan.planSha256, activate: true, deps: realDeps });
    assert.equal(applied.status, "applied", JSON.stringify(applied));
    assert.equal(existsSync(join(path, "pipeline.user.yaml")), false);
    assert.equal(existsSync(join(path, ".claude", "pipeline.yaml")), false);
    assert.equal(readFileSync(join(path, ".claude", "pipeline.json"), "utf8"), legacy);
    assert.equal(existsSync(join(path, ".git", "agent-pipeline", "reinstall-quarantine", plan.planSha256, "receipt.json")), true);
  } finally { dispose(path); }
});

test("resume hint is a post-seed, non-authoritative restart aid that fails open", () => {
  const path = root();
  const basis = { featureId: "kickoff-demo", planSha256: "a".repeat(64), specSha256: "b".repeat(64) };
  const context = {
    intent: "Build a two-level browser puzzle.",
    scope: ["Static browser game", "Two short puzzles"],
    constraints: ["No server or account", "Plugin installation is deferred"],
    questions: ["Should fog obscure part of level two?"],
  };
  try {
    assert.throws(() => captureResumeHint({ rootDir: path, context }), /RH-PROJECT-UNINITIALIZED/);
    mkdirSync(join(path, "project"));
    writeFileSync(join(path, "project", "pipeline.yaml"), "schema: pipeline.manifest.v0\n");
    const hint = captureResumeHint({ rootDir: path, context, basis, createdAt: "2026-08-01T12:00:00.000Z" });
    assert.equal(hint.nonAuthoritative, true);
    assert.equal(inspectResumeHint({ rootDir: path, basis, now: Date.parse("2026-08-02T12:00:00.000Z") }).status, "available");
    assert.equal(inspectResumeHint({ rootDir: path, basis: { ...basis, planSha256: "c".repeat(64) }, now: Date.parse("2026-08-02T12:00:00.000Z") }).status, "challenged-stale");
    writeFileSync(join(path, "project", "resume-hint.json"), "not json\n");
    assert.equal(inspectResumeHint({ rootDir: path, basis }).status, "ignored-invalid");
    assert.equal(discardResumeHint({ rootDir: path }).status, "discarded");
    assert.equal(discardResumeHint({ rootDir: path }).status, "absent");
    assert.throws(() => captureResumeHint({ rootDir: path, context: { ...context, intent: "User: paste every command" } }), /RH-SCHEMA/);
    assert.throws(() => captureResumeHint({ rootDir: path, context: { ...context, constraints: ["Use token sk-example"] } }), /RH-SCHEMA/);
    assert.throws(() => captureResumeHint({ rootDir: path, context: { ...context, scope: ["Open /home/operator/private"] } }), /RH-SCHEMA/);
    assert.throws(() => captureResumeHint({ rootDir: path, context: { ...context, scope: ["Review(/home/operator/private)"] } }), /RH-SCHEMA/);
    const awsLikeLongTermKeyId = ["AKIA", "IOSFODNN7EXAMPLE"].join("");
    const awsLikeTemporaryKeyId = ["ASIA", "IOSFODNN7EXAMPLE"].join("");
    assert.throws(() => captureResumeHint({ rootDir: path, context: { ...context, constraints: [awsLikeLongTermKeyId] } }), /RH-SCHEMA/);
    assert.throws(() => captureResumeHint({ rootDir: path, context: { ...context, constraints: [awsLikeTemporaryKeyId] } }), /RH-SCHEMA/);
    assert.throws(() => captureResumeHint({ rootDir: path, context: { ...context, constraints: ["xASIAAAAAAAAAAAAAAAAA"] } }), /RH-SCHEMA/);
    assert.throws(() => captureResumeHint({ rootDir: path, context: { ...context, questions: ["Use Ab9Qx2Lm8Vw4Ze7Rt1Yu?"] } }), /RH-SCHEMA/);
    const helper = fileURLToPath(new URL("../scripts/resume-hint.mjs", import.meta.url));
    const cardPath = join(path, "resume-card.json");
    writeFileSync(cardPath, JSON.stringify(context));
    const captured = spawnSync(process.execPath, [helper, "capture", "--root", path, "--card-file", cardPath], { encoding: "utf8" });
    assert.equal(captured.status, 0, captured.stderr);
    writeFileSync(cardPath, JSON.stringify({ ...context, constraints: ["Bearer sk-secret"] }));
    const rejected = spawnSync(process.execPath, [helper, "capture", "--root", path, "--card-file", cardPath], { encoding: "utf8" });
    assert.equal(rejected.status, 2);
    assert.match(rejected.stderr, /RH-SCHEMA/);
    assert.equal(rejected.stderr.includes("sk-secret"), false);
  } finally { dispose(path); }
});

test("observation governance applies only to the Pipeline source checkout, never a fresh consumer", () => {
  const consumer = root();
  try {
    assert.deepEqual(inspectObservationGovernanceBootstrap({ rootDir: consumer }), {
      schema: "pipeline.observation-governance-bootstrap.v1", status: "not-applicable", sourceCheckout: false, checker: null,
    });
    const source = fileURLToPath(new URL("../../..", import.meta.url));
    const observed = inspectObservationGovernanceBootstrap({ rootDir: source });
    assert.equal(observed.status, "required");
    assert.equal(observed.sourceCheckout, true);
    const helper = fileURLToPath(new URL("../scripts/observation-governance-bootstrap.mjs", import.meta.url));
    const invoked = spawnSync(process.execPath, [helper, "--root", consumer], { encoding: "utf8" });
    assert.equal(invoked.status, 0, invoked.stderr);
    assert.equal(JSON.parse(invoked.stdout).status, "not-applicable");
  } finally { dispose(consumer); }
});

test("a freshly seeded project is honest about its authority tier, its verify contract and its gates", () => {
  const path = root();
  const legacyPath = root();
  try {
    const seed = planProjectOnboardingV3({ runner: "codex", rootDir: path, deps: fakeDeps });
    assert.equal(applyProjectOnboardingV3(seed, { rootDir: path, activate: true, deps: fakeDeps }).status, "applied");

    // (a) The seed lands in the neutral authority tier and NOT in the legacy
    // compatibility tier a brand-new repository has no history to migrate from.
    assert.equal(existsSync(join(path, "project", "pipeline.json")), true, "the seed writes the neutral calibration");
    assert.equal(existsSync(join(path, ".claude", "pipeline.json")), false, "the seed never writes calibration into the legacy compatibility tier");
    const authority = readProjectAuthority({ rootDir: path });
    assert.equal(authority.status, "ready");
    assert.equal(authority.source, "neutral");
    assert.equal(authority.calibration, "project/pipeline.json");
    assert.equal(authority.manifest, "project/pipeline.yaml");

    // (b) A project that already carries the legacy tier keeps resolving
    // exactly as before: this is a change to what is newly written, never a
    // migration of what exists.
    mkdirSync(join(legacyPath, ".claude"));
    writeFileSync(join(legacyPath, ".claude", "pipeline.yaml"), "schema: pipeline.manifest.v0\n");
    writeFileSync(join(legacyPath, ".claude", "pipeline.json"), `${JSON.stringify({ project: "legacy", verify: "npm test" }, null, 2)}\n`);
    const legacyAuthority = readProjectAuthority({ rootDir: legacyPath });
    assert.equal(legacyAuthority.status, "ready");
    assert.equal(legacyAuthority.source, "legacy");
    assert.equal(legacyAuthority.calibration, ".claude/pipeline.json");
    assert.equal(JSON.parse(readFileSync(join(legacyPath, ".claude", "pipeline.json"), "utf8")).verify, "npm test");

    // (c) The seeded verify contract FAILS until a human configures it, and its
    // own output names what to replace and where. An unconfigured project is
    // distinguishable from a satisfied one by running verify.
    const calibration = JSON.parse(readFileSync(join(path, "project", "pipeline.json"), "utf8"));
    const verify = spawnSync(calibration.verify, { cwd: path, shell: true, encoding: "utf8" });
    assert.notEqual(verify.status, 0, "an unconfigured verify contract must not report success");
    assert.match(String(verify.stderr), /not configured/);
    assert.match(String(verify.stderr), /Replace the verify command in project\/pipeline\.json/);

    // (d) The seeded manifest carries a gate chapter, and it is a LIVE gate --
    // for the profile-neutral greenfield seed and for each of the three PO
    // profiles the kickoff flow collects.
    const seeded = parseYaml(readFileSync(join(path, "project", "pipeline.yaml"), "utf8"));
    assert.deepEqual(seeded.gates, {
      "dev-plan": { mode: "blocking", type: "human" },
      // The gate this test's own title claims: the calibration seeds
      // `gates.push: blocking`, so a manifest without a push chapter makes the
      // project DECLARE a gate that guard-push.mjs then never enforces (it reads
      // the manifest and exits 0 on an absent gate). That is what let a push
      // succeed unapproved in both 2026-08-09 greenfield runs. Seeded only once
      // the satisfying path was measured end to end -- see the chapter comment in
      // project-onboarding-v3.mjs and PUSHSEED-2 below.
      push: { mode: "blocking", type: "human" },
      // NVA-R33-SECGATEON (2026-08-29): same reasoning, same standard -- seeded only
      // once the satisfying path was measured end to end (see the dedicated
      // satisfying-path test below and the chapter comment in
      // project-onboarding-v3.mjs). `automated`, not `human`: there is no separate
      // approval step, only the scan itself.
      security: { mode: "blocking", type: "automated" },
    });
    for (const profile of ["epic", "feature", "mini"]) {
      for (const name of ["dev-plan", "push"]) {
        const gate = gateConfig(parseYaml(freshManifestBytes(profile)), name);
        assert.notEqual(gate, null, `${profile} seeds a ${name} gate`);
        assert.equal(gate.mode, "blocking", `${profile} seeds an ENFORCING ${name} gate`);
        assert.equal(gate.type, "human");
      }
      const securityGate = gateConfig(parseYaml(freshManifestBytes(profile)), "security");
      assert.notEqual(securityGate, null, `${profile} seeds a security gate`);
      assert.equal(securityGate.mode, "blocking", `${profile} seeds an ENFORCING security gate`);
      assert.equal(securityGate.type, "automated", `${profile} seeds an AUTOMATED security gate, not a human approval step`);
    }
    // The enforcing artifact names the command sequence out of its own refusal,
    // because the refusal reports the lifecycle state but not the whole path.
    const chapter = freshManifestBytes("feature");
    for (const command of ["submit-plan", "approve-plan", "set-phase --phase implementation",
      "verify-evidence-producer", "materialize-push-threat-model", "approve-push", "gates.push_approval",
      "security-scan"]) {
      assert.equal(chapter.includes(command), true, `the seeded gate names ${command}`);
    }
    // The calibration and the manifest must not disagree about the push gate:
    // the disagreement IS the defect, not a detail of it.
    const userIntent = readFileSync(join(path, "pipeline.user.yaml"), "utf8");
    assert.match(userIntent, /push: "?blocking"?/, "the calibration declares the push gate");
    assert.match(userIntent, /push_approval: "?signature"?/,
      "the calibration states how a human clears a push, so `chat` is discoverable without reading plugin source");
    // NVA-R33-SECGATEON: the calibration must not promise a gate nothing enforces, in
    // EITHER direction -- `warn` while the manifest carried none was the original
    // defect, and a calibration/manifest disagreement of any shape is the same defect
    // by construction. The prerequisites that used to make `blocking` unsatisfiable
    // (dirty-tree self-poisoning, three external scanners, a Pipeline-only license
    // allowlist path, gitleaks config resolution in an installed-plugin deployment)
    // are all closed -- see the seeding comment in project-onboarding-v3.mjs for the
    // full chain and the dedicated satisfying-path test below for the end-to-end proof.
    assert.match(userIntent, /security: "?blocking"?/,
      "the calibration declares the security gate live, matching the manifest chapter it now carries");
    const seededSecurityGate = gateConfig(parseYaml(freshManifestBytes()), "security");
    assert.notEqual(seededSecurityGate, null, "and the manifest must carry one too -- the two must agree");
    assert.equal(seededSecurityGate.mode, "blocking");

    // (e) guard-devplan.mjs no longer exits 0 by default, and no longer merely
    // reports: with the seeded gate chapter and an active feature whose design
    // was never approved, a write to a non-exempt implementation path is
    // REFUSED (exit 2, `blocking`). Exit 1 would leave the write to proceed,
    // which is the reported defect -- implementation beginning without the
    // human ever being asked. The satisfying path for this gate is measured
    // end to end by the dedicated test above; see the gate chapter comment in
    // project-onboarding-v3.mjs.
    writeFileSync(join(path, "project", "pipeline-state.json"), `${JSON.stringify({ activeFeature: { id: "F-001", planPath: "docs/plan.md" } }, null, 2)}\n`);
    const guard = spawnSync(process.execPath, [fileURLToPath(new URL("../hooks/guard-devplan.mjs", import.meta.url))], {
      cwd: path,
      encoding: "utf8",
      input: JSON.stringify({ tool_name: "Write", tool_input: { file_path: "src/index.js" } }),
      env: { ...process.env, CLAUDE_PROJECT_DIR: path },
    });
    assert.equal(guard.status, 2, `the seeded dev-plan gate must refuse, not merely report: ${guard.stderr}`);
    assert.match(String(guard.stderr), /guard-devplan/);
  } finally { dispose(path); dispose(legacyPath); }
});

test("an ordinary consumer project's runtime initialization never seeds the private overlay's own calibration", () => {
  const path = root();
  try {
    // Full greenfield order: portable seed, then runtime initialization --
    // the exact sequence the defect this pins was found in.
    initializeRestartRequiredRoot(path);
    const legacyCalibrationPath = join(path, ".claude", "pipeline.json");
    assert.equal(existsSync(legacyCalibrationPath), true, "runtime initialization must seed the legacy compatibility calibration");
    const bytes = readFileSync(legacyCalibrationPath, "utf8");
    // Pin, both ways: neither the private overlay's project identity nor its
    // always-green verify command may reach an ordinary consumer project.
    assert.equal(bytes.includes("agent-pipeline-private-overlay"), false, "a consumer project must never carry the private overlay's project identity");
    const calibration = JSON.parse(bytes);
    assert.notEqual(calibration.project, "agent-pipeline-private-overlay");
    assert.notEqual(calibration.verify, "git diff --check HEAD");
    const verifyRun = spawnSync(calibration.verify, { cwd: path, shell: true, encoding: "utf8" });
    assert.notEqual(verifyRun.status, 0, "an unconfigured verify contract must not report success on an arbitrary tree");
    assert.match(String(verifyRun.stderr), /not configured/);
    // Both tiers of one fresh project must agree the verify gate is unconfigured.
    const neutralCalibration = JSON.parse(readFileSync(join(path, "project", "pipeline.json"), "utf8"));
    assert.equal(calibration.verify, neutralCalibration.verify);
  } finally { dispose(path); }
});

// Backlog: greenfield-onboarding-writes-mixed-authority-tiers. Both prior
// regressions above prove PIECES of this in isolation -- that the seeded
// legacy manifest/calibration are honest, and (in runner-profile-migration-
// v3.test.mjs) that the two manifest tiers are byte-identical. Neither one
// asks the actual question the backlog item raised: once a fresh greenfield
// onboarding has populated BOTH tiers with live files, does the authority
// RESOLVER still read it as one coherent authority, or does it fall into the
// `mixed` status the resolver is designed to reject (project-authority.mjs,
// `readLayer`/`classify`)? This exercises the exact real sequence (portable
// seed, then runtime initialization) and asks the resolver directly, instead
// of inferring an answer from what got written.
test("a fresh greenfield onboarding populates both manifest tiers without ever reaching a mixed authority status", () => {
  const path = root();
  try {
    initializeClaudeOnboardedRoot(path);

    // Enumerate exactly what runtime initialization left under .claude/: the
    // two dual-owned authority mirrors (manifest, calibration) plus Claude
    // Code's own settings file, which project-authority.mjs never tracks at
    // all -- never the lifecycle State or guard files onboarding does not own.
    const legacyManifestPath = join(path, ".claude", "pipeline.yaml");
    const legacyCalibrationPath = join(path, ".claude", "pipeline.json");
    assert.equal(existsSync(legacyManifestPath), true);
    assert.equal(existsSync(legacyCalibrationPath), true);
    assert.equal(existsSync(join(path, ".claude", "settings.json")), true);
    assert.equal(existsSync(join(path, ".claude", "pipeline-state.json")), false, "onboarding must never write legacy lifecycle State");
    assert.equal(existsSync(join(path, ".claude", "guard-config.json")), false, "onboarding must never write the legacy guard config");
    assert.equal(existsSync(join(path, ".claude", "guard-override.log.jsonl")), false, "onboarding must never write the legacy guard audit log");

    // Both dual-owned files are byte-identical across tiers, not merely
    // present at both -- the actual invariant commit 7a99a18 protects.
    assert.equal(readFileSync(legacyManifestPath, "utf8"), readFileSync(join(path, "project", "pipeline.yaml"), "utf8"));
    assert.equal(readFileSync(legacyCalibrationPath, "utf8"), readFileSync(join(path, "project", "pipeline.json"), "utf8"));

    // The question this test exists to answer: the resolver, not an inference
    // from what got written.
    const authority = readProjectAuthority({ rootDir: path });
    assert.equal(authority.status, "ready");
    assert.equal(authority.source, "neutral");
    assert.equal(authority.manifest, "project/pipeline.yaml");
    assert.equal(authority.calibration, "project/pipeline.json");
  } finally { dispose(path); }
});

// Wave 4 onboarding coordinator, step 6 (design SSa.4/SSa.5/SSe;
// NVA-W5-COORD-STEP6-1). The four cases below are this dispatch's own DoD:
// the three new v4Inspection statuses a genuinely fresh repository now
// settles into, plus the two regressions design SSe requires (a mid-kickoff
// repository and an already-ready repository both completely unaffected).

test("v4Inspection routes a genuinely fresh repository through the full intake coordinator lifecycle (intake-required -> intake-design-questions-required -> bootstrap-binding-required)", () => {
  const path = root();
  let stderr = "";
  // onboarding-continuity.mjs's intake-checkpoint functions read `deps.spawn`
  // (singular), not `deps.spawnSync` -- the convention every OTHER call in
  // this file's own fakeDeps object satisfies. Without it, `deps.spawn` is
  // undefined and falls back to the real spawnSync, which fails against this
  // fixture's fake (mkdirSync-only) `.git` directory. Both names point at the
  // same fakeGit, so every other simulated git behaviour stays identical.
  const intakeDeps = { ...fakeDeps, spawn: fakeGit };
  const invoke = (args) => {
    let output = "";
    stderr = "";
    const code = onboardingCli(args, {
      deps: intakeDeps,
      write: (chunk) => { output += chunk; },
      writeError: (chunk) => { stderr += chunk; },
    });
    return { code, result: output ? JSON.parse(output) : null };
  };
  try {
    const barrier = initializeRestartRequiredRoot(path);
    clearRuntimeBarrier(path, barrier);

    // No checkpoint at all: intake-required, nextAction asks for consent.
    const fresh = inspectProjectOnboardingV3({ runner: "codex", rootDir: path, deps: fakeDeps });
    assert.equal(fresh.status, "intake-required");
    assert.equal(fresh.continuity.status, "absent-pristine");
    assert.equal(fresh.nextAction.kind, "collect-input");
    assert.deepEqual(fresh.nextAction.expected, { schema: "pipeline.project-onboarding.v4", statuses: ["intake-required"] });
    assert.ok(fresh.nextAction.inputs.some((input) => input.name === "gitAuthorName"));
    assert.deepEqual(fresh.nextAction.applyAction.argv, [
      ONBOARDING_SCRIPT, "intake-consent-apply", "--root", path, "--granted",
      "--git-author-name", "<PO_INTAKE_GIT_AUTHOR_NAME>",
      "--git-author-email", "<PO_INTAKE_GIT_AUTHOR_EMAIL>",
      "--language", "<PO_INTAKE_LANGUAGE>",
      "--profile", "<PO_INTAKE_PROFILE>",
      "--text-file", "scratch/onboarding-intake.txt", "--activate", "--runner", "codex",
    ]);
    assert.equal(fresh.nextAction.applyAction.argv.includes("--text"), false,
      "the multiline-safe returned action uses exactly one of --text/--text-file");

    // Consent recorded, no material captured yet: still intake-required, but
    // nextAction switches to intake-capture-apply.
    const consented = invoke(["intake-consent-apply", "--root", path, "--granted", "--activate", "--runner", "codex"]);
    assert.equal(consented.code, 0, stderr);
    const afterConsent = inspectProjectOnboardingV3({ runner: "codex", rootDir: path, deps: fakeDeps });
    assert.equal(afterConsent.status, "intake-required");
    assert.equal(afterConsent.nextAction.kind, "collect-input");
    assert.equal(afterConsent.nextAction.input.name, "text");
    assert.deepEqual(afterConsent.nextAction.applyAction.argv, [
      ONBOARDING_SCRIPT, "intake-capture-apply", "--root", path,
      "--text-file", "scratch/onboarding-intake.txt", "--activate", "--runner", "codex",
    ]);
    assert.equal(afterConsent.nextAction.applyAction.argv.includes("--text"), false);

    // First material chunk captured: intake-design-questions-required,
    // nextAction asks for the one bundled design-question round.
    const captured = invoke(["intake-capture-apply", "--root", path, "--text", "Ship a safe project.", "--activate", "--runner", "codex"]);
    assert.equal(captured.code, 0, stderr);
    const afterCapture = inspectProjectOnboardingV3({ runner: "codex", rootDir: path, deps: fakeDeps });
    assert.equal(afterCapture.status, "intake-design-questions-required");
    assert.equal(afterCapture.nextAction.kind, "collect-input");
    assert.equal(afterCapture.nextAction.input.name, "answersJson");
    assert.deepEqual(afterCapture.nextAction.applyAction.argv, [
      ONBOARDING_SCRIPT, "intake-design-questions-apply", "--root", path,
      "--answers-json", "<PO_INTAKE_DESIGN_ANSWERS_JSON>", "--activate", "--runner", "codex",
    ]);

    // Design questions answered: still intake-design-questions-required (SSa.4:
    // "until step 4 runs"), but nextAction is now a real, ready-to-run
    // intake-generate-plan command -- no PO input left to collect.
    const answers = JSON.stringify([{ question: "What is the primary goal?", answer: "Ship safely." }]);
    const answered = invoke(["intake-design-questions-apply", "--root", path, "--answers-json", answers, "--activate", "--runner", "codex"]);
    assert.equal(answered.code, 0, stderr);
    const afterAnswers = inspectProjectOnboardingV3({ runner: "codex", rootDir: path, deps: fakeDeps });
    assert.equal(afterAnswers.status, "intake-design-questions-required");
    assert.equal(afterAnswers.nextAction.kind, "command");
    assert.equal(afterAnswers.nextAction.argv[1], "intake-generate-plan");

    // Staging generated: bootstrap-binding-required, nextAction is the real
    // bootstrap-bind-plan command. Called directly (not through onboardingCli):
    // planOnboardingIntakeGenerate/applyOnboardingIntakeGenerate take `spawn`
    // as their own top-level parameter, never nested under `deps` -- the CLI
    // wrapper's `{ rootDir, deps }` call shape never actually threads a test's
    // injected spawn through to these two specific functions (harmless in real
    // usage, where the untouched default falls back to real git against a real
    // repository; this fixture's git is fakeGit-simulated, so the default's
    // real spawnSync fails against it). A CLI-level regression in this exact
    // wiring is separately covered by project-onboarding-v3-argv-closure.test.mjs.
    const genPlan = planOnboardingIntakeGenerate({ rootDir: path, repositoryCapability: "local", spawn: fakeGit });
    const genApplied = applyOnboardingIntakeGenerate({
      rootDir: path, repositoryCapability: "local", expectedPlanSha256: genPlan.planSha256, activate: true,
      deps: { spawn: fakeGit },
    });
    assert.equal(genApplied.checkpoint.transactionState, "generated");
    const afterGenerate = inspectProjectOnboardingV3({ runner: "codex", rootDir: path, deps: fakeDeps });
    assert.equal(afterGenerate.status, "bootstrap-binding-required");
    assert.equal(afterGenerate.continuity.status, "absent-pristine");
    assert.equal(afterGenerate.nextAction.kind, "command");
    assert.equal(afterGenerate.nextAction.argv[1], "bootstrap-bind-plan");
  } finally { dispose(path); }
});

test("all three runners execute the exact returned consent and design-question actions without repeating durable Git identity", () => {
  const paths = [];
  try {
    for (const runner of ["claude", "codex", "antigravity"]) {
      const path = root();
      paths.push(path);
      const barrier = initializeRestartRequiredRoot(path);
      clearRuntimeBarrier(path, barrier);
      const configuredGit = (command, args, options) => {
        if (command === "git" && args[0] === "config" && args[1] === "--get") {
          return { status: 0, stdout: args[2] === "user.name" ? "Durable PO\n" : "durable@example.invalid\n", stderr: "" };
        }
        return fakeGit(command, args, options);
      };
      const intakeDeps = { ...fakeDeps, spawnSync: configuredGit, spawn: configuredGit };
      const invokeReturned = (action, replacements) => {
        const materialized = action.applyAction.argv.map((value) => replacements.get(value) ?? value);
        assert.equal(materialized[0], ONBOARDING_SCRIPT);
        let output = "";
        let stderr = "";
        const code = onboardingCli(materialized.slice(1), {
          deps: intakeDeps,
          write: (chunk) => { output += chunk; },
          writeError: (chunk) => { stderr += chunk; },
        });
        assert.equal(code, 0, `${runner}: ${stderr}`);
        return JSON.parse(output);
      };

      const consent = inspectProjectOnboardingV3({ rootDir: path, runner, deps: intakeDeps }).nextAction;
      const consentNames = consent.inputs.map((input) => input.name);
      assert.equal(consentNames.includes("gitAuthorName"), false, `${runner}: local Git already resolved the name`);
      assert.equal(consentNames.includes("gitAuthorEmail"), false, `${runner}: local Git already resolved the email`);
      assert.deepEqual(consentNames, ["language", "profile", "projectDescription"]);
      assert.deepEqual(consent.applyAction.argv, [
        ONBOARDING_SCRIPT, "intake-consent-apply", "--root", path, "--granted",
        "--language", "<PO_INTAKE_LANGUAGE>", "--profile", "<PO_INTAKE_PROFILE>",
        "--text-file", "scratch/onboarding-intake.txt", "--activate", "--runner", runner,
      ]);
      mkdirSync(join(path, "scratch"));
      writeFileSync(join(path, "scratch", "onboarding-intake.txt"), "Build one local mini HTML game.\nKeyboard only.\n");
      invokeReturned(consent, new Map([
        ["<PO_INTAKE_LANGUAGE>", "en"],
        ["<PO_INTAKE_PROFILE>", "feature"],
      ]));

      const design = inspectProjectOnboardingV3({ rootDir: path, runner, deps: intakeDeps }).nextAction;
      assert.equal(design.kind, "collect-input");
      assert.equal(design.input.name, "answersJson");
      assert.deepEqual(design.applyAction.argv, [
        ONBOARDING_SCRIPT, "intake-design-questions-apply", "--root", path,
        "--answers-json", "<PO_INTAKE_DESIGN_ANSWERS_JSON>", "--activate", "--runner", runner,
      ]);
      const answers = JSON.stringify([{ question: "Controls?", answer: "Keyboard." }]);
      invokeReturned(design, new Map([["<PO_INTAKE_DESIGN_ANSWERS_JSON>", answers]]));
      const after = inspectProjectOnboardingV3({ rootDir: path, runner, deps: intakeDeps });
      assert.equal(after.nextAction.kind, "command");
      assert.equal(after.nextAction.argv[1], "intake-generate-plan");
    }
  } finally {
    for (const path of paths) dispose(path);
  }
});

test("NVA-D-ACKASK: bootstrap-binding-required asks the PO for the acknowledgement instead of naming a command that can only fail, then names bootstrap-bind-plan again once it is present and the bind succeeds", () => {
  const path = root();
  let stderr = "";
  const intakeDeps = { ...fakeDeps, spawn: fakeGit };
  const invoke = (args) => {
    let output = "";
    stderr = "";
    const code = onboardingCli(args, {
      deps: intakeDeps,
      write: (chunk) => { output += chunk; },
      writeError: (chunk) => { stderr += chunk; },
    });
    return { code, result: output ? JSON.parse(output) : null };
  };
  try {
    const barrier = initializeRestartRequiredRoot(path);
    clearRuntimeBarrier(path, barrier);
    // Unlike the lifecycle-routing test above, this fixture supplies a
    // --profile so a real bootstrap-bind-plan/apply can actually be
    // exercised below -- reproducing the exact "generated" state the
    // backlog measured, not merely a nextAction label.
    const consented = invoke(["intake-consent-apply", "--root", path, "--granted", "--profile", "feature", "--language", "en", "--activate", "--runner", "codex"]);
    assert.equal(consented.code, 0, stderr);
    const captured = invoke(["intake-capture-apply", "--root", path, "--text", "Ship a safe project.", "--activate", "--runner", "codex"]);
    assert.equal(captured.code, 0, stderr);
    const answers = JSON.stringify([{ question: "What is the primary goal?", answer: "Ship safely." }]);
    const answered = invoke(["intake-design-questions-apply", "--root", path, "--answers-json", answers, "--activate", "--runner", "codex"]);
    assert.equal(answered.code, 0, stderr);
    const genPlan = planOnboardingIntakeGenerate({ rootDir: path, repositoryCapability: "local", spawn: fakeGit });
    const genApplied = applyOnboardingIntakeGenerate({
      rootDir: path, repositoryCapability: "local", expectedPlanSha256: genPlan.planSha256, activate: true,
      deps: { spawn: fakeGit },
    });
    assert.equal(genApplied.checkpoint.transactionState, "generated");

    // NVA-V5-ACKEXEMPTASK: this fixture -- a freshly generated, unmodified staging
    // PRD with recorded consent -- is exactly what NVA-R-STAGINGACK exempts from the
    // marker. So the marker is absent AND not required, and the flow must NOT stop to
    // ask for it: asking would cost the PO a human round to certify a judgement nobody
    // is asking them to make, on bytes nobody authored. It names bootstrap-bind-plan,
    // and that plan succeeds rather than refusing.
    const exemptObservation = observeBootstrapBindAcknowledgement({ rootDir: path, repositoryCapability: "local", spawn: fakeGit });
    assert.equal(exemptObservation.acknowledged, false, "the marker is genuinely absent");
    assert.equal(exemptObservation.exempt, true, "and, on unmodified generator bytes, not required");
    const exemptInspect = inspectProjectOnboardingV3({ runner: "codex", rootDir: path, deps: fakeDeps });
    assert.equal(exemptInspect.status, "bootstrap-binding-required");
    assert.equal(exemptInspect.nextAction.kind, "command", "an exempt draft must not stop the PO for a marker it does not need");
    assert.equal(exemptInspect.nextAction.argv[1], "bootstrap-bind-plan");
    assert.doesNotThrow(() => planOnboardingBootstrapBind({ rootDir: path, repositoryCapability: "local", spawn: fakeGit }));

    // The exemption is narrow, and the ask is what must come back the moment it stops
    // holding. One appended line of prose nobody reviewed is enough: the bytes are no
    // longer the generator's own playback, so there IS now a human judgement to
    // certify, and every original DoD of this test applies again from here.
    const prdAbsolutePath = join(path, exemptObservation.prd.path);
    writeFileSync(prdAbsolutePath, `${readFileSync(prdAbsolutePath, "utf8")}\nOne line of prose nobody reviewed.\n`, "utf8");

    // DoD 1: while the marker is missing AND required, nextAction is the ask, never
    // the command that bootstrap-bind-plan's own refusal proves cannot succeed.
    const before = observeBootstrapBindAcknowledgement({ rootDir: path, repositoryCapability: "local", spawn: fakeGit });
    assert.equal(before.acknowledged, false);
    assert.equal(before.exempt, false, "a hand-edited draft is no longer exempt");
    const beforeAck = inspectProjectOnboardingV3({ runner: "codex", rootDir: path, deps: fakeDeps });
    assert.equal(beforeAck.status, "bootstrap-binding-required");
    assert.equal(beforeAck.nextAction.kind, "collect-input");
    // DoD 3: the ask names the artifacts by repository-relative path and by digest.
    assert.ok(beforeAck.nextAction.guidance.includes(before.prd.path));
    assert.ok(beforeAck.nextAction.guidance.includes(before.prd.sha256));
    assert.ok(beforeAck.nextAction.guidance.includes(before.spec.path));
    assert.ok(beforeAck.nextAction.guidance.includes(before.spec.sha256));
    // DoD 4: the ask states the exact marker line and that the PO adds it
    // themselves; this diff writes it nowhere.
    assert.ok(beforeAck.nextAction.guidance.includes(PO_GATE_PRD_ACKNOWLEDGEMENT_MARKER));
    assert.ok(/PO (adds|themselves)/u.test(beforeAck.nextAction.guidance));

    // DoD 5: bootstrap-bind-plan's own direct refusal for a caller that
    // skips the ask is unchanged -- still a hard exit 2, still the exact
    // KICKOFF-PROMOTION-PRD-ACKNOWLEDGEMENT-MARKER-MISSING code.
    assert.throws(
      () => planOnboardingBootstrapBind({ rootDir: path, repositoryCapability: "local", spawn: fakeGit }),
      (error) => error?.code === "KICKOFF-PROMOTION-PRD-ACKNOWLEDGEMENT-MARKER-MISSING",
    );

    // The PO's own act: append the marker line to the staging PRD directly
    // (never through a code path this diff adds).
    const prdBytes = readFileSync(prdAbsolutePath, "utf8");
    writeFileSync(prdAbsolutePath, `${prdBytes}\n${PO_GATE_PRD_ACKNOWLEDGEMENT_MARKER}\n`, "utf8");

    // DoD 2: once the marker is present, nextAction is bootstrap-bind-plan
    // exactly as today, and the bind succeeds.
    const after = observeBootstrapBindAcknowledgement({ rootDir: path, repositoryCapability: "local", spawn: fakeGit });
    assert.equal(after.acknowledged, true);
    const afterAck = inspectProjectOnboardingV3({ runner: "codex", rootDir: path, deps: fakeDeps });
    assert.equal(afterAck.status, "bootstrap-binding-required");
    assert.equal(afterAck.nextAction.kind, "command");
    assert.equal(afterAck.nextAction.argv[1], "bootstrap-bind-plan");
    const bindPlan = planOnboardingBootstrapBind({ rootDir: path, repositoryCapability: "local", spawn: fakeGit });
    // NVA-M-PORECEIPT: applyOnboardingBootstrapBind now also ensures a local
    // PO-gate profile receipt post-commit (onboarding-continuity.mjs). This
    // fixture's ".git" is fakeGit's own directory-only stand-in, not a real
    // repository real `git` can answer topology questions against -- exactly
    // what fakeDeps.initializePoGateProfileReceipt exists to stand in for
    // everywhere else in this suite, so it is injected here too rather than
    // exercising the concrete receipt publisher against a fixture it was
    // never meant to run against.
    const bindApplied = applyOnboardingBootstrapBind({
      rootDir: path, repositoryCapability: "local", expectedPlanSha256: bindPlan.planSha256, activate: true,
      deps: { spawn: fakeGit, initializePoGateProfileReceipt: fakeDeps.initializePoGateProfileReceipt },
    });
    assert.equal(bindApplied.status, "applied");
  } finally { dispose(path); }
});

test("regression: a repository recognisedKickoff() already recognizes as mid-kickoff is completely unaffected by the intake-coordinator routing", () => {
  const path = root();
  try {
    const args = claudePromotedRoot(path);
    // Immediately after kickoff-apply (before promotion), this is exactly the
    // mid-kickoff shape recognisedKickoff() (onboarding-continuity.mjs,
    // untouched by this dispatch) recognizes. v4Inspection reports it exactly
    // as it always has: continuity becomes "valid" the instant kickoff-apply
    // writes its provisional state, so it never reaches the absent-pristine
    // branch this dispatch changed at all -- "ready" here is pre-existing,
    // unchanged behaviour, not a new claim this dispatch introduces.
    const midKickoff = inspectProjectOnboardingV3({ rootDir: path, deps: args.deps, runner: "claude" });
    assert.equal(midKickoff.status, "ready");
    assert.equal(midKickoff.continuity.status, "valid");
    // recognisedKickoff() itself still recognizes this exact seed: proven by
    // driving the real (non-replay) kickoff-sourced promotion plan/apply
    // through to completion, which internally requires
    // recognisedKickoff() to succeed (buildKickoffPromotionPlan's
    // kickoff-sourced branch, onboarding-continuity.mjs).
    const plan = planProjectOnboardingKickoffPromotionV4({ ...args, runner: "claude" });
    assert.equal(plan.schema, "pipeline.codex-onboarding-kickoff-promotion-plan.v1");
    const applied = applyProjectOnboardingKickoffPromotionV4({ ...args, runner: "claude", planSha256: plan.planSha256, activate: true });
    assert.equal(applied.status, "ready");
    assert.equal(applied.continuity.status, "valid");
  } finally { dispose(path); }
});

test("regression: a repository already at ready (kickoff-apply's provisional authority) is completely unaffected by the intake-coordinator routing", () => {
  const path = root();
  try {
    const barrier = initializeRestartRequiredRoot(path);
    clearRuntimeBarrier(path, barrier);
    completeKickoff(path);
    const observed = inspectProjectOnboardingV3({ rootDir: path, deps: fakeDeps, runner: "codex" });
    assert.equal(observed.status, "ready");
    assert.equal(observed.continuity.status, "valid");
  } finally { dispose(path); }
});

test("pipelineScriptsRunnerAllowlistEntries() covers both runner lanes, and both path spellings whenever the two conversions actually differ", () => {
  // Windows-style input: contains a backslash, so both the forward-slash and
  // backslash spellings must appear, once per lane (Bash, PowerShell) --
  // exactly the gap disclosed in commit 5f5bbfac's own commit body.
  const windowsEntries = pipelineScriptsRunnerAllowlistEntries("D:\\Dev\\proj\\plugins\\pipeline-core\\scripts");
  assert.deepEqual(windowsEntries, [
    'Bash(node "D:/Dev/proj/plugins/pipeline-core/scripts/*")',
    'Bash(node "D:\\Dev\\proj\\plugins\\pipeline-core\\scripts\\*")',
    'PowerShell(node "D:/Dev/proj/plugins/pipeline-core/scripts/*")',
    'PowerShell(node "D:\\Dev\\proj\\plugins\\pipeline-core\\scripts\\*")',
  ]);
  assert.equal(windowsEntries.filter((entry) => entry.startsWith("Bash(")).length, 2);
  assert.equal(windowsEntries.filter((entry) => entry.startsWith("PowerShell(")).length, 2);
  assert.equal(windowsEntries.filter((entry) => entry.includes("/")).length, 2);
  assert.equal(windowsEntries.filter((entry) => entry.includes("\\")).length, 2);

  // No-separator input: neither "/" nor "\" appears anywhere, so the
  // forward-slash and backslash conversions are byte-identical and the
  // function collapses to exactly one spelling per lane (the only case the
  // real `forwardSlash === backslash` dedup check in
  // pipelineScriptsRunnerAllowlistEntries() actually fires on -- a plain
  // POSIX path such as "/home/dev/.../scripts" still yields BOTH spellings,
  // since converting its forward slashes to backslashes produces a distinct
  // string).
  const noSeparatorEntries = pipelineScriptsRunnerAllowlistEntries("scripts");
  assert.deepEqual(noSeparatorEntries, [
    'Bash(node "scripts/*")',
    'PowerShell(node "scripts/*")',
  ]);
  assert.equal(noSeparatorEntries.length, 2);
  assert.equal(noSeparatorEntries.filter((entry) => entry.startsWith("Bash(")).length, 1);
  assert.equal(noSeparatorEntries.filter((entry) => entry.startsWith("PowerShell(")).length, 1);

  // A plain POSIX absolute path (forward slashes, no backslash) is NOT the
  // dedup case: forwardSlash === trimmed but backslash is a distinct,
  // fully-backslashed string, so both spellings are still emitted.
  const posixEntries = pipelineScriptsRunnerAllowlistEntries("/home/dev/proj/plugins/pipeline-core/scripts");
  assert.deepEqual(posixEntries, [
    'Bash(node "/home/dev/proj/plugins/pipeline-core/scripts/*")',
    'Bash(node "\\home\\dev\\proj\\plugins\\pipeline-core\\scripts\\*")',
    'PowerShell(node "/home/dev/proj/plugins/pipeline-core/scripts/*")',
    'PowerShell(node "\\home\\dev\\proj\\plugins\\pipeline-core\\scripts\\*")',
  ]);
});

// NVA-B-ROUNDL-F4 regression, one test per remaining delete site. The
// ownership predicate `ownsPublishedOutput()` was wired into the manifest
// publication rollback only; three further sites still decided "this file is
// mine, delete it" from `{dev, ino}` alone. Identity alone cannot carry that
// decision: ext4 reallocates the lowest free inode number in the block group,
// so a file created immediately after an `unlink` commonly inherits the freed
// number, and the delete then destroys content the transaction never wrote.
// tmpfs draws inode numbers from a monotonic counter and never reuses one --
// which is exactly why this is invisible on a tmpfs `/tmp` and reproducible on
// the CI runner. Note what is NOT being tested here: two of these sites throw
// when the identity does not match, and that is no protection at all, because
// under reuse the identity DOES match. Each test therefore injects the reuse --
// the replacement file is reported under the inode number the transaction
// wrote -- so the identity check necessarily passes and ownership has to be
// decided on the bytes. Each test also pins the ordinary path: a file the site
// genuinely did write is still cleaned up, so the fix cannot trade a
// data-destruction bug for a leak.

test("F4 runtime probe cleanup preserves foreign content when the probe inode number is reused", () => {
  const path = root();
  try {
    const portable = planProjectOnboardingV3({ runner: "codex", rootDir: path, deps: fakeDeps });
    assert.equal(applyProjectOnboardingV3(portable, { rootDir: path, activate: true, deps: fakeDeps }).status, "applied");
    const runtime = planProjectOnboardingLifecycleV4({ rootDir: path, deps: fakeDeps, operation: "runtime", runner: "codex" });
    const digest = runtime.nextAction.argv[runtime.nextAction.argv.indexOf("--plan-sha256") + 1];
    const nativeLstat = lstatSync;
    let probePath = null; let swapped = false; let probeIno = null;
    const reuse = {
      ...fakeDeps,
      renameSync(from, to) {
        renameSync(from, to);
        if (probePath === null && typeof to === "string" && to.includes(".pipeline-runtime-capability-")) probePath = to;
      },
      lstatSync(candidate) {
        const info = nativeLstat(candidate);
        if (probePath === null || candidate !== probePath) return info;
        if (!swapped) {
          swapped = true; probeIno = info.ino;
          unlinkSync(candidate);
          writeFileSync(candidate, "foreign probe content\n");
          return info;
        }
        return {
          dev: info.dev, ino: probeIno, nlink: info.nlink, mode: info.mode, size: info.size,
          isSymbolicLink: () => info.isSymbolicLink(),
          isFile: () => info.isFile(),
          isDirectory: () => info.isDirectory(),
        };
      },
    };
    const observed = applyProjectOnboardingLifecycleV4({
      rootDir: path, deps: reuse, operation: "runtime", planSha256: digest, activate: true, runner: "codex",
    });
    assert.equal(swapped, true, "the inode-reuse injection never fired");
    assert.equal(existsSync(probePath), true,
      `the probe cleanup deleted foreign content it never wrote: ${JSON.stringify(observed)}`);
    assert.equal(readFileSync(probePath, "utf8"), "foreign probe content\n");
  } finally { dispose(path); }
  // Ordinary path: a probe file this transaction really did write is still
  // removed, in every selected runtime target parent.
  const owned = root();
  try {
    initializeRuntimeProjectionRoot(owned);
    for (const directory of [owned, join(owned, ".codex"), join(owned, ".claude")]) {
      if (!existsSync(directory)) continue;
      assert.deepEqual(readdirSync(directory).filter((entry) => entry.includes("pipeline-runtime-capability")), [],
        `a runtime capability probe leaked into ${directory.slice(owned.length) || "the project root"}`);
    }
  } finally { dispose(owned); }
});

test("F4 manifest repair temporary cleanup preserves foreign content when the temporary inode number is reused", () => {
  const repairTemporaries = (rootPath) => {
    const directory = join(rootPath, ".claude");
    if (!existsSync(directory)) return [];
    return readdirSync(directory)
      .filter((entry) => entry.includes(".pipeline-manifest-repair-") && entry.endsWith(".tmp")).sort();
  };
  const path = root();
  try {
    initializeRuntimeProjectionRoot(path);
    const manifestPath = join(path, ".claude", "pipeline.yaml");
    unlinkSync(manifestPath);
    const plan = planProjectOnboardingManifestRepairV4({ rootDir: path, deps: fakeDeps, runner: "codex" });
    assert.equal(plan.status, "ready", JSON.stringify(plan));
    const nativeLstat = lstatSync;
    let temporaryPath = null; let swapped = false; let temporaryIno = null;
    const reuse = {
      ...fakeDeps,
      openSync(target, ...args) {
        const fd = openSync(target, ...args);
        if (typeof target === "string" && target.includes(".pipeline-manifest-repair-") && target.endsWith(".tmp")) {
          temporaryPath = target;
        }
        return fd;
      },
      linkSync() {
        // The temporary is fully written and identity-bound at this point, so
        // the swap models a reuse race observed after the transaction's own
        // last write to it and before the failure path deletes it.
        swapped = true; temporaryIno = nativeLstat(temporaryPath).ino;
        unlinkSync(temporaryPath);
        writeFileSync(temporaryPath, "foreign temporary content\n");
        throw new Error("synthetic publication failure");
      },
      lstatSync(candidate) {
        const info = nativeLstat(candidate);
        if (!swapped || candidate !== temporaryPath) return info;
        return {
          dev: info.dev, ino: temporaryIno, nlink: info.nlink, mode: info.mode, size: info.size,
          isSymbolicLink: () => info.isSymbolicLink(),
          isFile: () => info.isFile(),
          isDirectory: () => info.isDirectory(),
        };
      },
    };
    const result = applyProjectOnboardingManifestRepairV4({
      runner: "codex", rootDir: path, planSha256: plan.planSha256, activate: true, deps: reuse,
    });
    // The publication temporary is addressed fd-relatively
    // (`/proc/self/fd/<n>/<name>`, see `boundDirectoryEntry`) and that
    // directory fd is closed before the call returns, so `temporaryPath` is
    // only usable DURING the transaction, for the injection above. Whether the
    // file survived is asked of the real directory instead -- a stale
    // fd-relative path answers "absent" for a file that is still on disk, and
    // would make this assertion pass no matter what the rollback did.
    assert.equal(swapped, true, "the inode-reuse injection never fired");
    const leftovers = repairTemporaries(path);
    assert.equal(leftovers.length, 1,
      `the temporary cleanup deleted foreign content it never wrote: ${JSON.stringify({ result, leftovers })}`);
    assert.equal(readFileSync(join(path, ".claude", leftovers[0]), "utf8"), "foreign temporary content\n");
    assert.equal(existsSync(manifestPath), false);
  } finally { dispose(path); }
  // Ordinary path: the same failure without the reuse still removes the
  // temporary this transaction wrote itself.
  const owned = root();
  try {
    initializeRuntimeProjectionRoot(owned);
    unlinkSync(join(owned, ".claude", "pipeline.yaml"));
    const plan = planProjectOnboardingManifestRepairV4({ rootDir: owned, deps: fakeDeps, runner: "codex" });
    let observed = false;
    const failing = {
      ...fakeDeps,
      openSync(target, ...args) {
        const fd = openSync(target, ...args);
        if (typeof target === "string" && target.includes(".pipeline-manifest-repair-") && target.endsWith(".tmp")) {
          observed = true;
        }
        return fd;
      },
      linkSync() { throw new Error("synthetic publication failure"); },
    };
    applyProjectOnboardingManifestRepairV4({
      runner: "codex", rootDir: owned, planSha256: plan.planSha256, activate: true, deps: failing,
    });
    assert.equal(observed, true, "the repair temporary was never observed");
    assert.deepEqual(repairTemporaries(owned), [],
      "the failure path must still delete the temporary it wrote itself");
  } finally { dispose(owned); }
});

test("F4 portable rollback preserves foreign content when a created target's inode number is reused", () => {
  const path = root();
  const nativeLstat = lstatSync;
  let writes = 0; let firstTarget = null; let firstIno = null; let swapped = false;
  const reuse = {
    ...fakeDeps,
    writeFileSync(target, bytes, options) {
      writes += 1;
      if (writes === 1) { firstTarget = target; writeFileSync(target, bytes, options); return; }
      firstIno = nativeLstat(firstTarget).ino;
      unlinkSync(firstTarget);
      writeFileSync(firstTarget, "foreign target bytes\n");
      swapped = true;
      throw new Error("synthetic inode-reuse race");
    },
    lstatSync(candidate) {
      const info = nativeLstat(candidate);
      if (!swapped || candidate !== firstTarget) return info;
      return {
        dev: info.dev, ino: firstIno, nlink: info.nlink, mode: info.mode, size: info.size,
        isSymbolicLink: () => info.isSymbolicLink(),
        isFile: () => info.isFile(),
        isDirectory: () => info.isDirectory(),
      };
    },
  };
  try {
    const plan = planProjectOnboardingV3({ runner: "codex", rootDir: path, deps: reuse });
    const applied = applyProjectOnboardingV3(plan, { rootDir: path, activate: true, deps: reuse });
    assert.equal(swapped, true, "the inode-reuse injection never fired");
    assert.equal(applied.status, "rollback-failed", JSON.stringify(applied));
    assert.equal(existsSync(firstTarget), true, "the rollback deleted foreign content it never wrote");
    assert.equal(readFileSync(firstTarget, "utf8"), "foreign target bytes\n");
  } finally { dispose(path); }
  // Ordinary path: a rollback over targets this transaction really did write
  // still removes every one of them. (`post-git failure rolls every generated
  // preimage back` above covers the same site from the other direction.)
  const ownedRoot = root(); let ownedWrites = 0;
  const failingLate = {
    ...fakeDeps,
    writeFileSync(target, bytes, options) {
      ownedWrites += 1;
      if (ownedWrites === 3) throw new Error("synthetic late write failure");
      writeFileSync(target, bytes, options);
    },
  };
  try {
    const plan = planProjectOnboardingV3({ runner: "codex", rootDir: ownedRoot, deps: failingLate });
    const applied = applyProjectOnboardingV3(plan, { rootDir: ownedRoot, activate: true, deps: failingLate });
    assert.equal(applied.status, "rolled-back", JSON.stringify(applied));
    assert.deepEqual(names(ownedRoot), [], "the rollback must still delete every target it wrote itself");
  } finally { dispose(ownedRoot); }
});

if (RUNNING_AS_SUITE) {
  console.log(`\nproject-onboarding-v3: ${passed} passed, ${failures.length} failed`);
  if (failures.length) { console.error(failures.join("\n")); process.exitCode = 1; }
}
