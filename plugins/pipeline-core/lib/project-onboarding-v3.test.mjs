#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync, closeSync, existsSync, fstatSync, fsyncSync, lstatSync, mkdirSync, mkdtempSync,
  openSync, readFileSync, readdirSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  applyProjectOnboardingKickoffV4,
  applyProjectOnboardingLifecycleV4,
  applyProjectOnboardingV3,
  inspectProjectOnboardingV3,
  planProjectOnboardingKickoffV4,
  planProjectOnboardingLifecycleV4,
  planProjectOnboardingV3,
  renderProjectOnboardingAction,
} from "./project-onboarding-v3.mjs";
import { planRunnerProfileMigrationV3 } from "./runner-profile-migration-v3.mjs";
import { validateV3BootstrapAuthority } from "../scripts/v3-bootstrap-authority.mjs";
import { parseYaml } from "./yaml-lite.mjs";
import { validatePipelineUserV3 } from "./runner-profiles-v3.mjs";
import { main as onboardingCli } from "../scripts/project-onboarding-v3.mjs";
import {
  canonicalJson, CodexOnboardingRuntimeError, consumeRuntimeReadback, issueLaunchTicket, readCurrentRuntimeReadback, readRestartBarrier,
  removeRestartBarrierCas, sha256,
} from "./codex-onboarding-runtime.mjs";
import { observeOnboardingAppServer } from "./codex-onboarding-app-server.mjs";

let passed = 0; const failures = [];
function test(name, run) { try { run(); passed += 1; console.log(`PASS  ${name}`); } catch (error) { failures.push(`${name}: ${error.message}`); console.log(`FAIL  ${name} -- ${error.message}`); } }
function root() { return mkdtempSync(join(tmpdir(), "project onboarding v3 matrix with spaces-")); }
function spacedRoot() { return mkdtempSync(join(tmpdir(), "project onboarding v3 with spaces-")); }
function dispose(path) { rmSync(path, { recursive: true, force: true }); }
function fakeGit(command, args, options = {}) {
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
const fakeDeps = {
  spawnSync: fakeGit,
  observeCodexOnboardingCapabilities: fakeCapabilities,
  observeOnboardingAppServer: fakeAppServer,
  planSessionCleanupRecovery() {
    return {
      schema: "pipeline.session-cleanup-recovery-plan.v1",
      status: "not-needed",
    };
  },
};
const ONBOARDING_SCRIPT = fileURLToPath(new URL("../scripts/project-onboarding-v3.mjs", import.meta.url));
const MIGRATION_SCRIPT = fileURLToPath(new URL("../scripts/runner-profile-migration-v3.mjs", import.meta.url));
const HOST_REPOSITORY_INIT_SCRIPT = fileURLToPath(new URL("../scripts/codex-host-repository-init.mjs", import.meta.url));
const ONBOARDING_LAUNCH_SCRIPT = fileURLToPath(new URL("../scripts/codex-onboarding-launch.mjs", import.meta.url));
const APP_SERVER_HEALTH_SCRIPT = fileURLToPath(new URL("../scripts/codex-app-server-health.mjs", import.meta.url));
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

function initializeRestartRequiredRoot(path, deps = fakeDeps) {
  const portable = planProjectOnboardingV3({ rootDir: path, deps });
  assert.equal(applyProjectOnboardingV3(portable, { rootDir: path, activate: true, deps }).status, "applied");
  const runtime = planProjectOnboardingLifecycleV4({ rootDir: path, deps, operation: "runtime" });
  const digest = runtime.nextAction.argv[runtime.nextAction.argv.indexOf("--plan-sha256") + 1];
  const initialized = applyProjectOnboardingLifecycleV4({
    rootDir: path,
    deps,
    operation: "runtime",
    planSha256: digest,
    activate: true,
  });
  assert.equal(initialized.status, "restart-required");
  return readRestartBarrier({ rootDir: path, spawn: fakeGit });
}

function clearRuntimeBarrier(path, barrier) {
  const issued = issueLaunchTicket({
    rootDir: path,
    barrierSha256: barrier.rawSha256,
    now: 40_000,
    spawn: fakeGit,
  });
  consumeRuntimeReadback({
    rootDir: path,
    ticketId: issued.ticketId,
    token: issued.token,
    now: 40_001,
    spawn: fakeGit,
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

function completeKickoff(path, goal = "Build a safe project", deps = fakeDeps, expectedStatus = "ready") {
  const plan = planProjectOnboardingKickoffV4({ rootDir: path, goal, deps });
  assert.equal(plan.schema, "pipeline.codex-onboarding-kickoff-plan.v1");
  const result = applyProjectOnboardingKickoffV4({
    rootDir: path,
    goal,
    planSha256: plan.planSha256,
    activate: true,
    deps,
  });
  assert.equal(result.status, expectedStatus);
  assert.equal(result.continuity.status, "valid");
  return plan;
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

function assertBoundedRestartCopyCommand(action) {
  const copy = action?.launch?.copyCommand;
  assert.deepEqual(Object.keys(copy).sort(), ["maxColumns", "posix", "powershell"]);
  assert.equal(copy.maxColumns, 72);
  for (const command of [copy.posix, copy.powershell]) {
    assert.equal(typeof command, "string");
    assert.equal(command.split("\n").every((line) => line.length <= copy.maxColumns), true);
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
  return copy;
}

function assertDiagnostic(result, code) {
  assert.equal(result.diagnostics.length, 1);
  assert.deepEqual(Object.keys(result.diagnostics[0]).sort(), ["code", "guidance", "message", "path"]);
  assert.equal(result.diagnostics[0].code, code);
  for (const value of Object.values(result.diagnostics[0])) {
    assert.equal(typeof value, "string");
    assert.equal(/[\r\n]/u.test(value), false);
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
      const observed = inspectProjectOnboardingV3({
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
      assert.equal(observed.nextAction, null, componentStatus);
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
      const observed = inspectProjectOnboardingV3({
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
    const observed = inspectProjectOnboardingV3({ rootDir: path, intent: "dispatch" });
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
    const onboarding = inspectProjectOnboardingV3({
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
      const observed = inspectProjectOnboardingV3({
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
    const applyAction = {
      kind: "command",
      executable: "node",
      argv: [
        "/fixture/session-cleanup.mjs",
        "apply-recovery",
        "--repo",
        path,
        "--plan-sha256",
        "a".repeat(64),
        "--activate",
      ],
      mutation: true,
      requiresConfirmation: true,
      expected: {
        schema: "pipeline.session-cleanup-recovery-apply.v1",
        statuses: ["retired"],
      },
    };
    const observed = inspectProjectOnboardingV3({
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
            applyAction,
          };
        },
      },
    });
    assert.equal(observed.status, "partial");
    assert.equal(observed.runtime.status, "readback-current");
    assert.deepEqual(observed.nextAction, applyAction);
    assertDiagnostic(observed, "cleanup_recovery_required");

    const unavailable = inspectProjectOnboardingV3({
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
    assert.equal(unavailable.nextAction, null);
    assertDiagnostic(unavailable, "cleanup_recovery_unavailable");

    const unobserved = inspectProjectOnboardingV3({
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
    assert.equal(unobserved.nextAction, null);
    assertDiagnostic(unobserved, "cleanup_recovery_observation_unavailable");
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
      const observed = inspectProjectOnboardingV3({
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
    const repositoryFailure = inspectProjectOnboardingV3({
      rootDir: repositoryRoot,
      intent: "dispatch",
      deps: neverObserve,
    });
    assert.equal(repositoryFailure.status, "repository-control-path-invalid");
    assert.equal(calls, 0);

    const missingSource = inspectProjectOnboardingV3({
      rootDir: lifecycleRoot,
      intent: "bootstrap",
      deps: {
        ...neverObserve,
        observeCodexOnboardingCapabilities: () => repositoryCapability("local-valid-writable", "bootstrap"),
      },
    });
    assert.equal(missingSource.status, "portable-seed-required");
    assert.equal(calls, 0);

    const portable = planProjectOnboardingV3({ rootDir: lifecycleRoot, deps: fakeDeps });
    assert.equal(applyProjectOnboardingV3(portable, { rootDir: lifecycleRoot, activate: true, deps: fakeDeps }).status, "applied");
    const missingRuntime = inspectProjectOnboardingV3({
      rootDir: lifecycleRoot,
      intent: "bootstrap",
      deps: neverObserve,
    });
    assert.equal(missingRuntime.status, "runtime-initialization-required");
    assert.equal(calls, 0);

    const runtime = planProjectOnboardingLifecycleV4({
      rootDir: lifecycleRoot,
      deps: fakeDeps,
      operation: "runtime",
    });
    const digest = runtime.nextAction.argv[runtime.nextAction.argv.indexOf("--plan-sha256") + 1];
    assert.equal(applyProjectOnboardingLifecycleV4({
      rootDir: lifecycleRoot,
      deps: fakeDeps,
      operation: "runtime",
      planSha256: digest,
      activate: true,
    }).status, "restart-required");
    const restartRequired = inspectProjectOnboardingV3({
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
    const observed = inspectProjectOnboardingV3({
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

test("blank real root inspect and plan are read-only", () => {
  const path = root();
  try {
    const inspected = inspectProjectOnboardingV3({ rootDir: path });
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
    const plan = planProjectOnboardingV3({ rootDir: path, deps: fakeDeps });
    assert.equal(plan.status, "ready");
    assert.deepEqual(names(path), []);
    assert.deepEqual(plan.targets.map((target) => target.path), [
      ".claude/pipeline.json", ".claude/pipeline.yaml", ".claude/settings.json", "pipeline.user.yaml",
    ]);
  } finally { dispose(path); }
});

test("bootstrap inspection of a blank local root offers the portable seed instead of rejecting its absent Git control path", () => {
  const path = root();
  try {
    const inspected = inspectProjectOnboardingV3({ rootDir: path, intent: "bootstrap" });
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
  try {
    mkdirSync(join(path, ".git"));
    chmodSync(join(path, ".git"), 0o500);
    const portable = planProjectOnboardingLifecycleV4({ rootDir: path, operation: "portable" });
    const portableDigest = portable.nextAction.argv[portable.nextAction.argv.indexOf("--plan-sha256") + 1];
    assert.equal(applyProjectOnboardingLifecycleV4({ rootDir: path, operation: "portable", planSha256: portableDigest, activate: true }).status, "runtime-initialization-required");
    const runtime = planProjectOnboardingLifecycleV4({ rootDir: path, operation: "runtime" });
    const runtimeDigest = runtime.nextAction.argv[runtime.nextAction.argv.indexOf("--plan-sha256") + 1];
    assert.equal(applyProjectOnboardingLifecycleV4({ rootDir: path, operation: "runtime", planSha256: runtimeDigest, activate: true }).status, "restart-required");
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

    const inspected = invoke(["inspect", "--root", path]);
    assert.equal(inspected.code, 0); assert.equal(inspected.result.status, "portable-seed-required");
    const planned = invoke(["plan", "--root", path]);
    assert.equal(planned.code, 0); assert.equal(planned.result.status, "portable-seed-required");
    assert.deepEqual(names(path), []);
    const digest = planned.result.nextAction.argv[planned.result.nextAction.argv.indexOf("--plan-sha256") + 1];
    const applied = invoke(["apply-portable-seed", "--root", path, "--plan-sha256", digest, "--activate"]);
    assert.equal(applied.code, 0); assert.equal(applied.result.status, "runtime-initialization-required");
  } finally { dispose(path); }
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
    const portable = inspectProjectOnboardingV3({ rootDir: empty, deps: fakeDeps });
    assert.equal(portable.status, "portable-seed-required");
    assert.equal(portable.repository.status, "local-uninitialized");
    assertDiagnostic(portable, "portable_seed_missing");
    assertSingleLineAction(portable.nextAction, action(
      [ONBOARDING_SCRIPT, "plan", "--root", empty],
      ["portable-seed-required"],
    ));

    mkdirSync(join(existing, ".git", "objects"), { recursive: true });
    writeFileSync(join(existing, ".git", "HEAD"), "ref: refs/heads/main\n");
    writeFileSync(join(existing, "README.md"), "existing local Git project\n");
    const adoption = inspectProjectOnboardingV3({ rootDir: existing, deps: fakeDeps });
    assert.equal(adoption.status, "adoption-required");
    assert.equal(adoption.repository.status, "local-valid-writable");
    assertDiagnostic(adoption, "adoption_required");
    assertSingleLineAction(adoption.nextAction, action(
      [ONBOARDING_SCRIPT, "plan", "--root", existing],
      ["adoption-required"],
    ));

    writeFileSync(join(legacy, "pipeline.user.yaml"), yaml(v0Source()));
    const migration = inspectProjectOnboardingV3({ rootDir: legacy, deps: fakeDeps });
    assert.equal(migration.status, "migration-required");
    assertDiagnostic(migration, "migration_required");
    assertSingleLineAction(migration.nextAction, action(
      [MIGRATION_SCRIPT, "inspect", "--root", legacy],
      ["ready", "invalid-root", "recovery-required", "invalid-source"],
      "pipeline.runner-profile-migration-inspect.v3",
    ));

    const portablePlan = planProjectOnboardingV3({ rootDir: runtime, deps: fakeDeps });
    assert.equal(applyProjectOnboardingV3(portablePlan, {
      rootDir: runtime,
      activate: true,
      deps: fakeDeps,
    }).status, "applied");
    const missing = inspectProjectOnboardingV3({ rootDir: runtime, deps: fakeDeps });
    assert.equal(missing.status, "runtime-initialization-required");
    assert.equal(missing.runtime.status, "missing");
    assertDiagnostic(missing, "runtime_missing");
    assertSingleLineAction(missing.nextAction, action(
      [ONBOARDING_SCRIPT, "plan-runtime", "--root", runtime],
      ["runtime-initialization-required"],
    ));
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
    const portable = planProjectOnboardingLifecycleV4({
      rootDir: portableRoot,
      deps: fakeDeps,
      operation: "portable",
    });
    const portableDigest = portable.nextAction.argv[portable.nextAction.argv.indexOf("--plan-sha256") + 1];
    assert.match(assertSingleLineAction(portable.nextAction, applyAction(
      [ONBOARDING_SCRIPT, "apply-portable-seed", "--root", portableRoot, "--plan-sha256", portableDigest, "--activate"],
      ["runtime-initialization-required", "restart-required", "kickoff-required"],
    )), /'[^']*with spaces[^']*'/u);

    const seed = planProjectOnboardingV3({ rootDir: runtimeRoot, deps: fakeDeps });
    assert.equal(applyProjectOnboardingV3(seed, {
      rootDir: runtimeRoot,
      activate: true,
      deps: fakeDeps,
    }).status, "applied");
    const runtime = planProjectOnboardingLifecycleV4({
      rootDir: runtimeRoot,
      deps: fakeDeps,
      operation: "runtime",
    });
    const runtimeDigest = runtime.nextAction.argv[runtime.nextAction.argv.indexOf("--plan-sha256") + 1];
    assertSingleLineAction(runtime.nextAction, applyAction(
      [ONBOARDING_SCRIPT, "initialize-runtime", "--root", runtimeRoot, "--plan-sha256", runtimeDigest, "--activate"],
      ["restart-required"],
    ));
    assert.equal(applyProjectOnboardingLifecycleV4({
      rootDir: runtimeRoot,
      deps: fakeDeps,
      operation: "runtime",
      planSha256: runtimeDigest,
      activate: true,
    }).status, "restart-required");

    const implementor = join(runtimeRoot, ".codex", "agents", "implementor.toml");
    writeFileSync(implementor, readFileSync(implementor, "utf8").replace(/^model = ".*"$/mu, 'model = "repair-contract-drift"'));
    const repair = planProjectOnboardingLifecycleV4({
      rootDir: runtimeRoot,
      deps: fakeDeps,
      operation: "repair",
    });
    const repairDigest = repair.nextAction.argv[repair.nextAction.argv.indexOf("--plan-sha256") + 1];
    assertSingleLineAction(repair.nextAction, applyAction(
      [ONBOARDING_SCRIPT, "apply-repair", "--root", runtimeRoot, "--plan-sha256", repairDigest, "--activate"],
      ["restart-required", "kickoff-required", "ready"],
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

    const observed = inspectProjectOnboardingV3({ rootDir: path, deps: fakeDeps });
    assert.equal(observed.status, "runtime-attestation-required");
    assert.equal(observed.runtime.status, "projection-current");
    assertDiagnostic(observed, "restart_required");
    assert.deepEqual(observed.nextAction.argv, [ONBOARDING_SCRIPT, "plan-readback", "--root", path]);

    const planned = planProjectOnboardingLifecycleV4({
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
    ]);
    const beforeRuntime = treeSnapshot(join(path, ".codex"));
    const applied = applyProjectOnboardingLifecycleV4({
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

    const observed = inspectProjectOnboardingV3({ rootDir: path, deps: fakeDeps });
    assert.equal(observed.status, "runtime-attestation-required");
    assert.equal(observed.runtime.status, "projection-current");
    assertDiagnostic(observed, "restart_binding_drift");
    assert.deepEqual(observed.nextAction.argv, [
      ONBOARDING_SCRIPT,
      "plan-readback",
      "--root",
      path,
    ]);

    const planned = planProjectOnboardingLifecycleV4({
      rootDir: path,
      deps: fakeDeps,
      operation: "readback",
    });
    const digest = planned.nextAction.argv[planned.nextAction.argv.indexOf("--plan-sha256") + 1];
    const applied = applyProjectOnboardingLifecycleV4({
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
        const seed = planProjectOnboardingV3({ rootDir: path, deps: fakeDeps });
        assert.equal(applyProjectOnboardingV3(seed, {
          rootDir: path,
          activate: true,
          deps: fakeDeps,
        }).status, "applied");
        const before = treeSnapshot(path);
        const observed = inspectProjectOnboardingV3({
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
    const seed = planProjectOnboardingV3({ rootDir: path, deps: fakeDeps });
    assert.equal(applyProjectOnboardingV3(seed, {
      rootDir: path,
      activate: true,
      deps: fakeDeps,
    }).status, "applied");
    mkdirSync(join(path, ".codex"));
    symlinkSync(outside, join(path, ".codex", "agents"), "dir");
    const projectBefore = treeSnapshot(path);
    const outsideBefore = treeSnapshot(outside);
    const observed = inspectProjectOnboardingV3({ rootDir: path, deps: fakeDeps });
    assert.equal(observed.status, "runtime-target-read-only");
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
    const portablePlan = planProjectOnboardingLifecycleV4({
      rootDir: portableRoot,
      deps: fakeDeps,
      operation: "portable",
    });
    const portableDigest = portablePlan.nextAction.argv[portablePlan.nextAction.argv.indexOf("--plan-sha256") + 1];
    const portableApplied = applyProjectOnboardingLifecycleV4({
      rootDir: portableRoot,
      deps: fakeDeps,
      operation: "portable",
      planSha256: portableDigest,
      activate: true,
    });
    const portableBytes = treeSnapshot(portableRoot);
    const portableReplayed = applyProjectOnboardingLifecycleV4({
      rootDir: portableRoot,
      deps: fakeDeps,
      operation: "portable",
      planSha256: portableDigest,
      activate: true,
    });
    assert.deepEqual(portableReplayed, portableApplied);
    assert.deepEqual(treeSnapshot(portableRoot), portableBytes);

    const seed = planProjectOnboardingV3({ rootDir: runtimeRoot, deps: fakeDeps });
    assert.equal(applyProjectOnboardingV3(seed, {
      rootDir: runtimeRoot,
      activate: true,
      deps: fakeDeps,
    }).status, "applied");
    const runtimePlan = planProjectOnboardingLifecycleV4({
      rootDir: runtimeRoot,
      deps: fakeDeps,
      operation: "runtime",
    });
    const runtimeDigest = runtimePlan.nextAction.argv[runtimePlan.nextAction.argv.indexOf("--plan-sha256") + 1];
    const runtimeApplied = applyProjectOnboardingLifecycleV4({
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
          runtimeRoot,
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
    assert.match(assertSingleLineAction(runtimeApplied.nextAction, expectedRestart), /'[^']*with spaces[^']*'/u);
    const runtimeBytes = treeSnapshot(runtimeRoot);
    const runtimeReplayed = applyProjectOnboardingLifecycleV4({
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
    const observed = inspectProjectOnboardingV3({ rootDir: path, deps: fakeDeps });
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
      const seed = planProjectOnboardingV3({ rootDir: path, deps: fakeDeps });
      assert.equal(applyProjectOnboardingV3(seed, {
        rootDir: path,
        activate: true,
        deps: fakeDeps,
      }).status, "applied");
      const plan = planProjectOnboardingLifecycleV4({
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
      const observed = applyProjectOnboardingLifecycleV4({
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
    const seed = planProjectOnboardingV3({ rootDir: path, deps: fakeDeps });
    assert.equal(applyProjectOnboardingV3(seed, {
      rootDir: path,
      activate: true,
      deps: fakeDeps,
    }).status, "applied");
    const plan = planProjectOnboardingLifecycleV4({
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
    const mixed = inspectProjectOnboardingV3({
      rootDir: path,
      deps: runtimeProbeFailureDeps("create", "EACCES"),
    });
    assert.equal(mixed.status, "projection-drift");
    assert.equal(mixed.runtime.status, "projection-drift");
    assertDiagnostic(mixed, "projection_drift");
    assertSingleLineAction(mixed.nextAction, {
      kind: "command",
      executable: "node",
      argv: [ONBOARDING_SCRIPT, "plan-repair", "--root", path],
      mutation: false,
      requiresConfirmation: false,
      expected: {
        schema: "pipeline.project-onboarding.v4",
        statuses: ["projection-drift"],
      },
    });
    assert.deepEqual(treeSnapshot(path), mixedBefore);
    const observed = applyProjectOnboardingLifecycleV4({
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
      argv: [ONBOARDING_SCRIPT, "plan-repair", "--root", path],
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
      const seed = planProjectOnboardingV3({ rootDir: path, deps: fakeDeps });
      assert.equal(applyProjectOnboardingV3(seed, {
        rootDir: path,
        activate: true,
        deps: fakeDeps,
      }).status, "applied");
      const plan = planProjectOnboardingLifecycleV4({
        rootDir: path,
        deps: fakeDeps,
        operation: "runtime",
      });
      const digest = plan.nextAction.argv[plan.nextAction.argv.indexOf("--plan-sha256") + 1];
      const before = treeSnapshot(path);
      let injected = false;
      const observed = applyProjectOnboardingLifecycleV4({
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
  const invoke = (args) => {
    let output = "";
    stderr = "";
    const code = onboardingCli(args, {
      deps: fakeDeps,
      write: (chunk) => { output += chunk; },
      writeError: (chunk) => { stderr += chunk; },
    });
    return { code, result: output ? JSON.parse(output) : null };
  };
  try {
    const barrier = initializeRestartRequiredRoot(path);
    clearRuntimeBarrier(path, barrier);
    const pristine = inspectProjectOnboardingV3({ rootDir: path, deps: fakeDeps });
    assert.equal(pristine.status, "kickoff-required");
    assert.equal(pristine.continuity.status, "absent-pristine");
    assert.equal(pristine.nextAction.kind, "collect-input");

    const goal = "Ship safely; keep $(touch nope) as text";
    const planned = invoke(["kickoff", "plan", "--root", path, "--goal", goal]);
    assert.equal(planned.code, 0, stderr);
    assert.equal(planned.result.goal, goal);
    assert.deepEqual(planned.result.applyAction.argv, [
      ONBOARDING_SCRIPT,
      "kickoff", "apply", "--root", path, "--goal", goal,
      "--plan-sha256", planned.result.planSha256, "--activate",
    ]);
    assert.match(renderProjectOnboardingAction(planned.result.applyAction), /'Ship safely; keep \$\(touch nope\) as text'/u);
    assert.equal(existsSync(join(path, "nope")), false);
    assert.equal(inspectProjectOnboardingV3({ rootDir: path, deps: fakeDeps }).status, "kickoff-required");

    const changedGoal = invoke([
      "kickoff", "apply", "--root", path, "--goal", `${goal} changed`,
      "--plan-sha256", planned.result.planSha256, "--activate",
    ]);
    assert.equal(changedGoal.code, 2);
    assert.match(stderr, /KICKOFF-PLAN-DIGEST/u);
    assert.equal(inspectProjectOnboardingV3({ rootDir: path, deps: fakeDeps }).status, "kickoff-required");

    const wrongDigest = invoke([
      "kickoff", "apply", "--root", path, "--goal", goal,
      "--plan-sha256", "f".repeat(64), "--activate",
    ]);
    assert.equal(wrongDigest.code, 2);
    assert.match(stderr, /KICKOFF-PLAN-DIGEST/u);
    assert.equal(inspectProjectOnboardingV3({ rootDir: path, deps: fakeDeps }).status, "kickoff-required");

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

test("current runtime exposes closed continuity outcomes while required App Server failure keeps precedence", () => {
  const pristine = root(); const unavailable = root();
  try {
    for (const path of [pristine, unavailable]) {
      const barrier = initializeRestartRequiredRoot(path);
      clearRuntimeBarrier(path, barrier);
    }

    const kickoff = inspectProjectOnboardingV3({
      rootDir: pristine,
      intent: "onboarding",
      deps: fakeDeps,
    });
    assert.equal(kickoff.status, "kickoff-required");
    assert.equal(kickoff.continuity.status, "absent-pristine");
    assert.equal(kickoff.appServer.status, "not-requested");
    assert.equal(kickoff.nextAction.kind, "collect-input");

    const appServerFirst = inspectProjectOnboardingV3({
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
    const damaged = inspectProjectOnboardingV3({
      rootDir: pristine,
      intent: "onboarding",
      deps: fakeDeps,
    });
    assert.equal(damaged.status, "continuity-damaged");
    assert.equal(damaged.continuity.status, "damaged");
    const continuityAction = {
      kind: "command",
      executable: "node",
      argv: [ONBOARDING_SCRIPT, "plan-repair", "--root", pristine],
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
    assert.equal(JSON.parse(continuityOutput).status, "continuity-damaged");
    assert.equal(JSON.parse(continuityOutput).nextAction, null);
    assertDiagnostic(JSON.parse(continuityOutput), "continuity_repair_unavailable");
    const compound = inspectProjectOnboardingV3({
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

    writeFileSync(join(unavailable, ".claude", "pipeline-state.json"), "{broken", { flag: "wx" });
    const unreadable = inspectProjectOnboardingV3({
      rootDir: unavailable,
      intent: "onboarding",
      deps: fakeDeps,
    });
    assert.equal(unreadable.status, "continuity-observation-unavailable");
    assert.equal(unreadable.continuity.status, "unavailable");
    assert.equal(unreadable.nextAction, null);
  } finally { dispose(pristine); dispose(unavailable); }
});

test("portable seed is manifest-valid, then onboarding owns the runtime initialization transaction", () => {
  const path = root();
  try {
    const plan = planProjectOnboardingV3({ rootDir: path, deps: fakeDeps });
    assert.equal(applyProjectOnboardingV3(plan, { rootDir: path, activate: false, deps: fakeDeps }).status, "activation-required");
    const applied = applyProjectOnboardingV3(plan, { rootDir: path, activate: true, deps: fakeDeps });
    assert.equal(applied.status, "applied");
    assert.equal(existsSync(join(path, ".git")), true);
    assert.equal(existsSync(join(path, ".codex")), false);
    assert.equal(inspectProjectOnboardingV3({ rootDir: path, deps: fakeDeps }).status, "runtime-initialization-required");
    const runtimePlan = planProjectOnboardingLifecycleV4({ rootDir: path, deps: fakeDeps, operation: "runtime" });
    const digest = runtimePlan.nextAction.argv[runtimePlan.nextAction.argv.indexOf("--plan-sha256") + 1];
    const runtimeApplied = applyProjectOnboardingLifecycleV4({ rootDir: path, deps: fakeDeps, operation: "runtime", planSha256: digest, activate: true });
    assert.equal(runtimeApplied.status, "restart-required");
    assert.equal(runtimeApplied.runtime.status, "restart-required");
    assert.equal(runtimeApplied.nextAction.kind, "restart-process");
    const sameProcess = inspectProjectOnboardingV3({ rootDir: path, deps: fakeDeps });
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
    assert.equal(source.advisor_export.consent, "declined");
    assert.equal(source.autonomy.push_policy, "gated");
    assert.equal(source.autonomy.branch_model, "feature-branch");
    assert.equal(source.gates.security, "warn");
    const calibration = JSON.parse(readFileSync(join(path, ".claude/pipeline.json"), "utf8"));
    assert.equal(calibration.verify, "git diff --check");
    assert.equal(calibration.repositoryMode, "local-only");
    assert.equal(existsSync(join(path, "docs/state.md")), false, "handover stays a project decision; normal bootstrap deliberately remains F4 until it exists");
    const barrier = readRestartBarrier({ rootDir: path, spawn: fakeGit });
    const issued = issueLaunchTicket({
      rootDir: path, barrierSha256: barrier.rawSha256, now: 40_000, spawn: fakeGit,
    });
    consumeRuntimeReadback({
      rootDir: path,
      ticketId: issued.ticketId,
      token: issued.token,
      now: 40_001,
      spawn: fakeGit,
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
    const freshProcess = inspectProjectOnboardingV3({ rootDir: path, deps: fakeDeps, intent: "bootstrap" });
    assert.equal(freshProcess.status, "kickoff-required");
    assert.equal(freshProcess.runtime.status, "readback-current");
    assert.notEqual(freshProcess.runtime.barrierSha256, freshProcess.runtime.readbackSha256);
    const afterHostAuthority = validateV3BootstrapAuthority({ rootDir: path, deps: fakeDeps });
    assert.equal(afterHostAuthority.status, "ready", JSON.stringify(afterHostAuthority));
    completeKickoff(path);
    assert.equal(inspectProjectOnboardingV3({
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
    assert.equal(inspectProjectOnboardingV3({ rootDir: unrelated }).status, "adoption-required");
    assert.equal(planProjectOnboardingV3({ rootDir: unrelated, deps: fakeDeps }).status, "ready");
    assert.deepEqual(names(unrelated), ["README.md"]);
    mkdirSync(join(partial, ".codex")); writeFileSync(join(partial, ".codex/config.toml"), "existing\n");
    assert.equal(inspectProjectOnboardingV3({ rootDir: partial }).status, "partial");
    symlinkSync(linkedParent, join(unsafe, "linked"));
    assert.equal(inspectProjectOnboardingV3({ rootDir: unsafe }).status, "unsafe");
    assert.deepEqual(names(unsafe), ["linked"]);
    symlinkSync(linkedParent, join(unsafeClaude, ".claude"));
    assert.equal(inspectProjectOnboardingV3({ rootDir: unsafeClaude }).status, "unsafe");
    assert.equal(planProjectOnboardingV3({ rootDir: unsafeClaude, deps: fakeDeps }).status, "unsafe");
    assert.deepEqual(names(unsafeClaude), [".claude"]);
    symlinkSync(unrelated, alias, "dir");
    const rootAlias = inspectProjectOnboardingV3({ rootDir: alias, deps: fakeDeps });
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
    const inspected = inspectProjectOnboardingV3({ rootDir: path });
    assert.equal(inspected.status, "portable-seed-required");
    assert.equal(inspected.repository.status, "host-managed");
    assertDiagnostic(inspected, "portable_seed_missing");
    assertSingleLineAction(inspected.nextAction, {
      kind: "command",
      executable: "node",
      argv: [ONBOARDING_SCRIPT, "plan", "--root", path],
      mutation: false,
      requiresConfirmation: false,
      expected: {
        schema: "pipeline.project-onboarding.v4",
        statuses: ["portable-seed-required"],
      },
    });
    const planned = planProjectOnboardingV3({ rootDir: path, deps: fakeDeps });
    assert.equal(planned.status, "ready");
    assert.equal(planned.state, "fresh-host-managed");
    assert.equal(planned.git.mode, "host-managed");
    assert.equal(planned.git.initializesGit, false);
    assert.deepEqual(planned.targets.map((target) => target.path), [
      ".claude/pipeline.json", ".claude/pipeline.yaml", ".claude/settings.json", "pipeline.user.yaml",
    ]);
    const applied = applyProjectOnboardingV3(planned, { rootDir: path, activate: true, deps: fakeDeps });
    assert.equal(applied.status, "applied");
    assert.equal(applied.git.mode, "host-managed");
    assert.equal(applied.authority.runtimeProjection, "missing");
    const cleanupNotNeededDeps = {
      planSessionCleanupRecovery: fakeDeps.planSessionCleanupRecovery,
    };
    const postSeed = inspectProjectOnboardingV3({
      rootDir: path,
      deps: cleanupNotNeededDeps,
    });
    assert.equal(postSeed.status, "kickoff-required");
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
    const postKickoff = inspectProjectOnboardingV3({
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
    const afterHostGit = inspectProjectOnboardingV3({
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
    const inspected = inspectProjectOnboardingV3({ rootDir: path });
    assert.equal(inspected.status, "adoption-required");
    const plan = planProjectOnboardingV3({ rootDir: path, deps: fakeDeps });
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
    const plan = planProjectOnboardingV3({ rootDir: adopted, deps: fakeDeps });
    assert.equal(plan.status, "ready");
    assert.equal(plan.git.initializesGit, false);
    const applied = applyProjectOnboardingV3(plan, { rootDir: adopted, activate: true, deps: fakeDeps });
    assert.equal(applied.status, "applied");
    assert.equal(readFileSync(join(adopted, ".git", "HEAD"), "utf8"), "ref: refs/heads/main\n");

    writeFileSync(join(linked, "README.md"), "linked worktree project\n");
    writeFileSync(join(linked, ".git"), "gitdir: /outside/managed-worktree\n");
    const linkedPlan = planProjectOnboardingV3({ rootDir: linked, deps: fakeDeps });
    assert.equal(inspectProjectOnboardingV3({ rootDir: linked, deps: fakeDeps }).status, "adoption-required");
    assert.equal(linkedPlan.status, "ready");
    assert.equal(linkedPlan.git.initializesGit, false);
    const linkedApplied = applyProjectOnboardingV3(linkedPlan, { rootDir: linked, activate: true, deps: fakeDeps });
    assert.equal(linkedApplied.status, "applied");
    assert.equal(readFileSync(join(linked, ".git"), "utf8"), "gitdir: /outside/managed-worktree\n");

    writeFileSync(join(reserved, "README.md"), "existing project\n");
    mkdirSync(join(reserved, ".codex"));
    assert.equal(inspectProjectOnboardingV3({ rootDir: reserved }).status, "partial");
  } finally { dispose(adopted); dispose(linked); dispose(reserved); }
});

test("legacy V0 is migration-required and never receives a fresh fallback", () => {
  const path = root();
  try {
    writeFileSync(join(path, "pipeline.user.yaml"), yaml(v0Source()));
    assert.equal(inspectProjectOnboardingV3({ rootDir: path }).status, "migration-required");
    assert.equal(planProjectOnboardingV3({ rootDir: path, deps: fakeDeps }).status, "migration-required");
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
    const plan = planProjectOnboardingV3({ rootDir: path, deps: failing });
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
      unlinkSync(firstTarget);
      writeFileSync(firstTarget, "foreign bytes\n", { flag: "wx", mode: 0o600 });
      throw new Error("synthetic identity race");
    },
  };
  try {
    const plan = planProjectOnboardingV3({ rootDir: path, deps: racing });
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
    const plan = planProjectOnboardingV3({ rootDir: path, deps: racing });
    const applied = applyProjectOnboardingV3(plan, { rootDir: path, activate: true, deps: racing });
    assert.equal(applied.status, "rollback-failed");
    assert.equal(readFileSync(join(path, ".git", "foreign"), "utf8"), "foreign git bytes\n");
  } finally { dispose(path); }
});

test("a fresh portable seed remains non-ready until its missing Codex runtime is initialized", () => {
  const path = root();
  try {
    const plan = planProjectOnboardingV3({ rootDir: path, deps: fakeDeps });
    assert.equal(applyProjectOnboardingV3(plan, { rootDir: path, activate: true, deps: fakeDeps }).status, "applied");
    const inspected = inspectProjectOnboardingV3({ rootDir: path, deps: fakeDeps });
    assert.equal(inspected.schema, "pipeline.project-onboarding.v4");
    assert.equal(inspected.status, "runtime-initialization-required");
    assert.equal(inspected.runtime.status, "missing");
  } finally { dispose(path); }
});

test("Codex bootstrap accepts a dual-runner source whose default runner is Claude", () => {
  const path = root();
  try {
    const plan = planProjectOnboardingV3({ rootDir: path, deps: fakeDeps });
    assert.equal(applyProjectOnboardingV3(plan, {
      rootDir: path,
      activate: true,
      deps: fakeDeps,
    }).status, "applied");
    const sourcePath = join(path, "pipeline.user.yaml");
    const source = readFileSync(sourcePath, "utf8")
      .replace('  default: "codex"\n', '  default: "claude"\n');
    writeFileSync(sourcePath, source);
    const inspected = inspectProjectOnboardingV3({ rootDir: path, deps: fakeDeps });
    assert.equal(inspected.status, "runtime-initialization-required");
    assert.equal(inspected.runtime.status, "missing");
    assert.equal(inspected.runner, "codex");
  } finally { dispose(path); }
});

test("an invalid generated manifest is never accepted as a current fresh authority", () => {
  const path = root();
  try {
    const plan = planProjectOnboardingV3({ rootDir: path, deps: fakeDeps });
    assert.equal(applyProjectOnboardingV3(plan, { rootDir: path, activate: true, deps: fakeDeps }).status, "applied");
    writeFileSync(join(path, ".claude", "pipeline.yaml"), "not: a canonical pipeline manifest\n");
    const inspected = inspectProjectOnboardingV3({ rootDir: path, deps: fakeDeps });
    assert.equal(inspected.schema, "pipeline.project-onboarding.v4");
    assert.equal(inspected.status, "partial");
    assertDiagnostic(inspected, "manifest_invalid");
    assert.equal(inspected.nextAction, null);
  } finally { dispose(path); }
});

test("owned runtime drift and invalid V3 sources stay in closed lifecycle classifications", () => {
  const drifted = root(); const invalid = root();
  try {
    const seed = planProjectOnboardingV3({ rootDir: drifted, deps: fakeDeps });
    assert.equal(applyProjectOnboardingV3(seed, { rootDir: drifted, activate: true, deps: fakeDeps }).status, "applied");
    const runtime = planProjectOnboardingLifecycleV4({ rootDir: drifted, deps: fakeDeps, operation: "runtime" });
    const runtimeDigest = runtime.nextAction.argv[runtime.nextAction.argv.indexOf("--plan-sha256") + 1];
    assert.equal(applyProjectOnboardingLifecycleV4({ rootDir: drifted, deps: fakeDeps, operation: "runtime", planSha256: runtimeDigest, activate: true }).status, "restart-required");
    const implementor = join(drifted, ".codex", "agents", "implementor.toml");
    writeFileSync(implementor, readFileSync(implementor, "utf8").replace(/^model = ".*"$/mu, "model = \"drifted\""));
    const observedDrift = inspectProjectOnboardingV3({ rootDir: drifted, deps: fakeDeps });
    assert.equal(observedDrift.status, "projection-drift");
    assert.equal(observedDrift.runtime.status, "projection-drift");
    assertDiagnostic(observedDrift, "projection_drift");
    assertSingleLineAction(observedDrift.nextAction, {
      kind: "command",
      executable: "node",
      argv: [ONBOARDING_SCRIPT, "plan-repair", "--root", drifted],
      mutation: false,
      requiresConfirmation: false,
      expected: {
        schema: "pipeline.project-onboarding.v4",
        statuses: ["projection-drift"],
      },
    });

    writeFileSync(join(invalid, "pipeline.user.yaml"), "schema: pipeline.user.v3\n");
    const observedInvalid = inspectProjectOnboardingV3({ rootDir: invalid, deps: fakeDeps });
    assert.equal(observedInvalid.status, "invalid");
    assert.equal(observedInvalid.runner, null);
    assert.equal(observedInvalid.diagnostics[0].code, "source_invalid");
  } finally { dispose(drifted); dispose(invalid); }
});

console.log(`\nproject-onboarding-v3: ${passed} passed, ${failures.length} failed`);
if (failures.length) { console.error(failures.join("\n")); process.exitCode = 1; }
