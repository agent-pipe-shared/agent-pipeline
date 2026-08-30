#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * Process-level first-use regression harness.
 *
 * This deliberately invokes the shipped CLI entry points against disposable
 * repositories instead of importing their library seams. A managed Codex
 * sandbox may reject nested Node processes with EPERM, so spawning a second
 * CLI process would test the sandbox rather than onboarding behavior.
 */
import assert from "node:assert/strict";
import { chmodSync, existsSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { main as onboardingCli } from "./project-onboarding-v3.mjs";
import { main as authorityCli } from "./v3-bootstrap-authority.mjs";
import { main as migrationCli } from "./runner-profile-migration-v3.mjs";
import { run as pipelineStateCli } from "./pipeline-state.mjs";
import { inspectRepositoryFreshness } from "./repository-freshness.mjs";
import { applyProjectOnboardingKickoffV4, planProjectOnboardingKickoffV4 } from "../lib/project-onboarding-v3.mjs";
import { PO_GATE_PRD_ACKNOWLEDGEMENT_MARKER } from "../lib/po-gate-authority.mjs";
import {
  consumeRuntimeReadback,
  issueLaunchTicket,
  readRestartBarrier,
  sha256,
} from "../lib/codex-onboarding-runtime.mjs";
import { ProjectOnboardingReadyError } from "../lib/project-onboarding-ready-gate.mjs";
import { applyHostRepositoryInit, planHostRepositoryInit } from "./codex-host-repository-init.mjs";
import { evaluateLifecycleReadyGuard } from "../hooks/guard-lifecycle-ready.mjs";
import {
  CODEX_HOST_REPOSITORY_INIT_DIRECTORY,
  CODEX_HOST_REPOSITORY_INIT_INTENT,
  CODEX_HOST_REPOSITORY_INIT_MARKER,
  CODEX_HOST_REPOSITORY_INIT_RECEIPT,
  observeCodexHostRepositoryInitAdmission,
  readCodexHostRepositoryInitAdmission,
} from "../lib/codex-host-layout.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const onboarding = join(here, "project-onboarding-v3.mjs");
const authority = join(here, "v3-bootstrap-authority.mjs");
const migration = join(here, "runner-profile-migration-v3.mjs");

// The shipped plugin cache is intentionally read-only. Keep disposable
// repositories in the platform temp directory so this process-level harness
// remains runnable from source checkouts and installed Linux, macOS and
// Windows plugin caches alike.
function root() { return mkdtempSync(join(tmpdir(), "pipeline onboarding e2e with spaces-")); }
function dispose(path) { rmSync(path, { recursive: true, force: true }); }
function cliGit(command, args, options = {}) {
  if (command !== "git") return { status: 1, stderr: "unexpected program" };
  const gitArgs = [...args];
  while (gitArgs[0] === "-c" && gitArgs.length >= 2) gitArgs.splice(0, 2);
  if (gitArgs[0] === "--version") return { status: 0, stdout: "git version 2.40.1\n", stderr: "" };
  if (gitArgs[0] === "rev-parse" && gitArgs[1] === "--path-format=absolute" && gitArgs[2] === "--git-common-dir") {
    const control = join(options.cwd, ".git");
    if (lstatSync(control).isFile()) {
      const gitDir = resolve(options.cwd, readFileSync(control, "utf8").trim().replace(/^gitdir:\s*/u, ""));
      const common = realpathSync(resolve(gitDir, readFileSync(join(gitDir, "commondir"), "utf8").trim()));
      return { status: 0, stdout: `${common}\n`, stderr: "" };
    }
    return { status: 0, stdout: `${control}\n`, stderr: "" };
  }
  if (gitArgs[0] === "worktree" && gitArgs[1] === "list") {
    const control = join(options.cwd, ".git");
    let primary = options.cwd;
    if (lstatSync(control).isFile()) {
      const gitDir = resolve(options.cwd, readFileSync(control, "utf8").trim().replace(/^gitdir:\s*/u, ""));
      const common = realpathSync(resolve(gitDir, readFileSync(join(gitDir, "commondir"), "utf8").trim()));
      primary = dirname(common);
    }
    const oid = "a".repeat(40);
    const records = [`worktree ${primary}\0HEAD ${oid}\0branch refs/heads/main\0\0`];
    if (realpathSync(options.cwd) !== realpathSync(primary)) {
      records.push(`worktree ${options.cwd}\0HEAD ${oid}\0branch refs/heads/linked-onboarding\0\0`);
    }
    return { status: 0, stdout: records.join(""), stderr: "" };
  }
  if (gitArgs[0] === "rev-parse" && gitArgs[1] === "--show-object-format") {
    return { status: 0, stdout: "sha1\n", stderr: "" };
  }
  if (gitArgs[0] === "init" && gitArgs[1] === "--initial-branch=main") {
    return spawnSync("git", gitArgs, options);
  }
  if (gitArgs[0] === "config") return spawnSync("git", gitArgs, options);
  if (gitArgs[0] === "rev-parse" && gitArgs[1] === "--is-inside-work-tree") return { status: 0, stdout: "true\n", stderr: "" };
  return { status: 1, stderr: "unexpected git arguments" };
}
function run(script, args, cwd) {
  let stdout = "";
  const main = script === onboarding
    ? onboardingCli
    : script === authority
      ? authorityCli
      : script === migration
        ? migrationCli
        : null;
  assert.ok(main, `unsupported CLI entry point: ${script}`);
  const status = main(args, {
    write: (chunk) => { stdout += chunk; },
    writePreview: () => {},
    // Isolated from the ambient session's own environment: the onboarding
    // CLI resolves its runner from CLAUDECODE when --runner is omitted
    // (project-onboarding-v3.mjs's resolveActiveRunner), and this harness
    // must exercise the historical Codex-shaped fixtures below regardless
    // of which runner happens to be executing this test process itself.
    env: {},
    deps: {
      spawnSync: cliGit,
      codexExecutable: process.execPath,
      readMachinePlane: () => ({
        status: "valid",
        plane: {
          schema: "pipeline.machine-plane.v1",
          poKeyDirectory: null,
          pushApprovalDefault: "signature",
          routing: null,
          language: null,
          session: null,
          usage: null,
          updatedAt: "2026-08-30T00:00:00.000Z",
        },
      }),
      observeOnboardingAppServer: ({ intent }) => intent === "onboarding"
        ? { required: false, status: "not-requested", code: null }
        : { required: true, status: "running", code: "CAS-READY" },
    },
  });
  return { status, stdout, json: stdout ? JSON.parse(stdout) : null };
}
function actionArgs(result) {
  assert.equal(result.nextAction?.kind, "command");
  return result.nextAction.argv.slice(1);
}

function explicitRunnerActionArgs(result, runner) {
  const args = actionArgs(result);
  const index = args.indexOf("--runner");
  assert.notEqual(index, -1, `generated ${args[0]} action must preserve the explicit runner`);
  assert.equal(args[index + 1], runner);
  return args;
}

function completeRuntimeReadback(path, now = 50_000) {
  const barrier = readRestartBarrier({ rootDir: path, spawn: cliGit });
  const issued = issueLaunchTicket({
    rootDir: path,
    barrierSha256: barrier.rawSha256,
    now,
    spawn: cliGit,
    codexExecutable: process.execPath,
  });
  consumeRuntimeReadback({
    rootDir: path,
    ticketId: issued.ticketId,
    token: issued.token,
    now: now + 1,
    spawn: cliGit,
    receipt: {
      schema: "pipeline.codex-project-runtime-readback.v1",
      barrierSha256: barrier.rawSha256,
      repositoryFingerprint: barrier.barrier.repositoryFingerprint,
      sourceSha256: barrier.barrier.sourceSha256,
      runtimeTargetsSha256: barrier.barrier.runtimeTargetsSha256,
      readerGenerationSha256: sha256(Buffer.alloc(32, 0xb6)),
      effectiveConfigSha256: sha256("e2e-effective"),
      validatedAgentsSha256: sha256("e2e-agents"),
      ticketId: issued.ticketId,
      observedAtEpochMs: now + 1,
    },
  });
}
function makeReady(path) {
  const portable = run(onboarding, ["plan", "--root", path], path);
  assert.equal(run(onboarding, actionArgs(portable.json), path).json.status, "runtime-initialization-required");
  const runtime = run(onboarding, ["plan-runtime", "--root", path], path);
  assert.equal(run(onboarding, actionArgs(runtime.json), path).json.status, "restart-required");
  completeRuntimeReadback(path);
  const goal = "Recover one governed project";
  // Matches the fixture's own CLI runner (run()'s isolated env resolves
  // "codex"): the kickoff entry points inspect as the caller's runner, so
  // a mismatch here would observe a different project state than the CLI
  // calls above just produced.
  const kickoff = planProjectOnboardingKickoffV4({
    rootDir: path,
    goal,
    runner: "codex",
    deps: { spawnSync: cliGit },
  });
  const ready = applyProjectOnboardingKickoffV4({
    rootDir: path,
    goal,
    runner: "codex",
    planSha256: kickoff.planSha256,
    activate: true,
    deps: { spawnSync: cliGit },
  });
  assert.equal(ready.status, "ready");
}
function git(args, cwd) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || `git ${args.join(" ")} failed`);
}

test("fresh and existing roots advance through portable seed and runtime initialization", () => {
  const fresh = root(); const existing = root();
  try {
    for (const [path, isExisting] of [[fresh, false], [existing, true]]) {
      if (isExisting) writeFileSync(join(path, "README.md"), "existing project\n");
      const plan = run(onboarding, ["plan", "--root", path], path);
      assert.equal(plan.status, 0, plan.stdout);
      assert.equal(plan.json.status, isExisting ? "adoption-required" : "portable-seed-required");
      const applied = run(onboarding, actionArgs(plan.json), path);
      assert.equal(applied.status, 0);
      assert.equal(applied.json.status, "runtime-initialization-required");
      const runtimePlan = run(onboarding, ["plan-runtime", "--root", path], path);
      assert.equal(runtimePlan.status, 0, runtimePlan.stdout);
      const initialized = run(onboarding, actionArgs(runtimePlan.json), path);
      assert.equal(initialized.status, 0, initialized.stdout);
      assert.equal(initialized.json.status, "restart-required");
      assert.equal(initialized.json.runtime.status, "restart-required");
      assert.equal(initialized.json.nextAction.kind, "restart-process");
      const readback = run(authority, ["--root", path], path);
      assert.equal(readback.status, 1);
      assert.equal(readback.json.status, "restart-required");
      if (isExisting) assert.equal(readFileSync(join(path, "README.md"), "utf8"), "existing project\n");
      for (const role of ["implementor", "critic"]) {
        assert.match(readFileSync(join(path, ".codex", "agents", `${role}.toml`), "utf8"), /developer_instructions\s*=/u);
      }
    }
  } finally { dispose(fresh); dispose(existing); }
});

test("read-only host-control paths receive portable host-managed onboarding", () => {
  const path = root();
  try {
    for (const name of [".agents", ".codex", ".git"]) {
      const target = join(path, name);
      mkdirSync(target);
      chmodSync(target, 0o555);
    }
    const inspected = run(onboarding, ["inspect", "--root", path], path);
    assert.equal(inspected.status, 0);
    assert.equal(inspected.json.status, "portable-seed-required");
    assert.equal(inspected.json.repository.status, "host-managed");
    const planned = run(onboarding, ["plan", "--root", path], path);
    assert.equal(planned.status, 0);
    assert.equal(planned.json.nextAction.argv[1], "apply-portable-seed");
    const applied = run(onboarding, actionArgs(planned.json), path);
    assert.equal(applied.status, 0);
    assert.equal(applied.json.status, "intake-required");
    assert.equal(applied.json.runtime.status, "plugin-managed-unattested");
    assert.equal(applied.json.nextAction.kind, "collect-input");
    const goal = "Build one small HTML game from the supplied design";
    // Matches the fixture's own CLI runner (run()'s isolated env resolves
    // "codex") -- see the comment on the equivalent call in makeReady().
    const kickoff = planProjectOnboardingKickoffV4({
      rootDir: path,
      goal,
      runner: "codex",
      deps: { spawnSync: cliGit },
    });
    const kickedOff = applyProjectOnboardingKickoffV4({
      rootDir: path,
      goal,
      runner: "codex",
      planSha256: kickoff.planSha256,
      activate: true,
      deps: { spawnSync: cliGit },
    });
    assert.equal(kickedOff.status, "host-repository-init-required");
    const bootstrap = run(onboarding, ["inspect", "--root", path, "--intent", "bootstrap"], path);
    assert.equal(bootstrap.status, 0, bootstrap.stdout);
    assert.equal(bootstrap.json.status, "host-repository-init-required");
    assert.equal(bootstrap.json.repository.status, "host-managed");
    assert.equal(bootstrap.json.runtime.status, "plugin-managed-unattested");
    assert.equal(bootstrap.json.continuity.status, "valid");
    assert.deepEqual(bootstrap.json.appServer, { required: false, status: "not-requested", code: null });
    assert.equal(bootstrap.json.nextAction.kind, "command");
    assert.equal(bootstrap.json.nextAction.argv[0].endsWith("codex-host-repository-init.mjs"), true);
    assert.deepEqual(bootstrap.json.nextAction.argv.slice(1), ["plan", "--root", path]);
    assert.deepEqual(readdirSync(join(path, ".codex")), []);
    assert.deepEqual(readdirSync(join(path, ".git")), []);

    const hostPlan = planHostRepositoryInit({
      rootDir: path,
      deps: { spawnSync: cliGit },
    });
    assert.equal(hostPlan.status, "ready");
    for (const name of [".agents", ".codex", ".git"]) {
      chmodSync(join(path, name), 0o700);
      rmSync(join(path, name), { recursive: true });
    }
    const initialized = applyHostRepositoryInit({
      rootDir: path,
      planSha256: hostPlan.planSha256,
      activate: true,
      deps: { spawnSync: cliGit },
    });
    assert.equal(initialized.status, "restart-required");
    assert.equal(initialized.gitVersion, "2.40.1");
    assert.equal(readdirSync(join(path, ".claude/.runtime/agent-pipeline/onboarding")).sort().includes("continuity-history.json"), true);
    assert.equal(readdirSync(join(path, ".claude/.runtime/agent-pipeline/onboarding")).sort().includes("host-repository-init"), true);
    assert.equal(existsSync(join(path, CODEX_HOST_REPOSITORY_INIT_DIRECTORY)), true);
    assert.equal(existsSync(join(path, CODEX_HOST_REPOSITORY_INIT_INTENT)), true);
    assert.equal(existsSync(join(path, CODEX_HOST_REPOSITORY_INIT_RECEIPT)), true);
    assert.equal(existsSync(join(path, CODEX_HOST_REPOSITORY_INIT_MARKER)), true);
    assert.equal(evaluateLifecycleReadyGuard({
      tool_name: "Bash",
      tool_input: { command: "rg --files" },
    }, { projectDir: path }).exitCode, 0, "physical hook view accepts the bound host-init admission");
    const crossViewDependencies = {
      projectDir: path,
      requireProjectOnboardingReadyFn() {
        throw new ProjectOnboardingReadyError(
          "PORG-NOT-READY",
          "protected Git view differs",
          { intent: "session", lifecycleStatus: "repository-control-path-invalid" },
        );
      },
    };
    assert.equal(evaluateLifecycleReadyGuard({
      tool_name: "Edit",
      tool_input: { file_path: "src/game.mjs" },
    }, crossViewDependencies).exitCode, 0, "exact cross-view failure accepts intact kickoff bindings");
    for (const relative of [
      "project/pipeline-state.json",
      "docs/state.md",
      kickoff.targets.prd.path,
      kickoff.targets.spec.path,
    ]) {
      const target = join(path, relative);
      const original = readFileSync(target);
      writeFileSync(target, Buffer.concat([original, Buffer.from("\ntampered\n")]));
      assert.equal(readCodexHostRepositoryInitAdmission(path), null, `${relative} drift invalidates admission`);
      assert.equal(evaluateLifecycleReadyGuard({
        tool_name: "Edit",
        tool_input: { file_path: "src/game.mjs" },
      }, crossViewDependencies).exitCode, 2, `${relative} drift stays blocked behind repository cross-view failure`);
      writeFileSync(target, original);
      assert.notEqual(readCodexHostRepositoryInitAdmission(path), null, `${relative} exact restore recovers admission`);
    }
    const physicalAuthority = run(authority, ["--root", path], path);
    assert.equal(physicalAuthority.status, 0, physicalAuthority.stdout);
    assert.equal(physicalAuthority.json.status, "ready");
    assert.equal(physicalAuthority.json.runtimeProjection, "plugin-managed");
    assert.equal(physicalAuthority.json.runtimeReadback, "plugin-provided");
    assert.equal(readdirSync(path).includes(".codex"), false, "authority planning does not materialize project-local Codex runtime");
    const physicalFreshness = inspectRepositoryFreshness(path, {
      runFetch: () => { throw new Error("host-managed freshness must not fetch"); },
      runDirect: () => { throw new Error("host-managed freshness must not inspect a remote"); },
    });
    assert.equal(physicalFreshness.exitCode, 0);
    assert.equal(physicalFreshness.result.status, "host-managed");
    assert.equal(physicalFreshness.result.reason, null);
    assert.equal(physicalFreshness.result.fetchAttempted, false);
    const calibrationPath = join(path, "project", "pipeline.json");
    const localOnlyCalibration = JSON.parse(readFileSync(calibrationPath, "utf8"));
    localOnlyCalibration.repositoryMode = "local-only";
    writeFileSync(calibrationPath, `${JSON.stringify(localOnlyCalibration, null, 2)}\n`);
    const localOnlyAdmission = readCodexHostRepositoryInitAdmission(path);
    assert.equal(localOnlyAdmission?.gitVersion, "2.40.1");
    assert.equal(localOnlyAdmission?.repositoryMode, "local-only");
    assert.match(localOnlyAdmission?.gitDevice ?? "", /^\d+$/u);
    assert.match(localOnlyAdmission?.gitInode ?? "", /^\d+$/u);
    assert.match(localOnlyAdmission?.gitTreeSha256 ?? "", /^[a-f0-9]{64}$/u);
    assert.match(localOnlyAdmission?.planSha256 ?? "", /^[a-f0-9]{64}$/u);
    const localOnlyAuthority = run(authority, ["--root", path], path);
    assert.equal(localOnlyAuthority.status, 0, localOnlyAuthority.stdout);
    assert.equal(localOnlyAuthority.json.status, "ready");
    assert.equal(localOnlyAuthority.json.runtimeProjection, "plugin-managed");
    const localOnlyFreshness = inspectRepositoryFreshness(path);
    assert.equal(localOnlyFreshness.result.status, "pre-head");
    assert.equal(localOnlyFreshness.result.repositoryMode, "local-only");

    // A fresh Codex process hides the physical host Git repository behind the
    // same empty protected mount used before initialization.
    rmSync(join(path, ".git"), { recursive: true });
    for (const name of [".codex", ".git"]) {
      mkdirSync(join(path, name));
      chmodSync(join(path, name), 0o555);
    }
    const session = run(onboarding, ["inspect", "--root", path, "--intent", "session"], path);
    assert.equal(session.status, 0, session.stdout);
    assert.equal(session.json.status, "ready");
    assert.equal(session.json.repository.gitVersion, "2.40.1");
    assert.equal(session.json.repository.sessionCapability, "passed");
    assert.equal(JSON.parse(readFileSync(calibrationPath, "utf8")).repositoryMode, "local-only");
    assert.equal(evaluateLifecycleReadyGuard({
      tool_name: "Bash",
      tool_input: { command: "rg --files" },
    }, { projectDir: path }).exitCode, 0);

    const receiptPath = join(path, CODEX_HOST_REPOSITORY_INIT_RECEIPT);
    const markerPath = join(path, CODEX_HOST_REPOSITORY_INIT_MARKER);
    const receiptBytes = readFileSync(receiptPath);
    const markerBytes = readFileSync(markerPath);
    writeFileSync(receiptPath, "{}\n", { mode: 0o600 });
    assert.deepEqual(observeCodexHostRepositoryInitAdmission(path), {
      status: "invalid",
      admission: null,
    });
    const invalidAdmission = run(onboarding, ["inspect", "--root", path, "--intent", "bootstrap"], path);
    assert.equal(invalidAdmission.status, 0, invalidAdmission.stdout);
    assert.equal(invalidAdmission.json.status, "projection-drift");
    assert.equal(invalidAdmission.json.runtime.status, "projection-drift");
    assert.equal(invalidAdmission.json.nextAction, null);
    assert.equal(invalidAdmission.json.diagnostics[0].code, "projection_drift");
    const invalidAuthority = run(authority, ["--root", path], path);
    assert.equal(invalidAuthority.status, 1, invalidAuthority.stdout);
    assert.equal(invalidAuthority.json.status, "projection-drift");
    assert.equal(invalidAuthority.json.runtimeProjection, "plugin-managed-invalid");
    assert.equal(invalidAuthority.json.runtimeReadback, "invalid");
    writeFileSync(receiptPath, receiptBytes, { mode: 0o600 });
    rmSync(markerPath);
    assert.equal(observeCodexHostRepositoryInitAdmission(path).status, "invalid",
      "a receipt without its marker is not a pristine pre-init state");
    writeFileSync(markerPath, markerBytes, { mode: 0o600 });
    rmSync(receiptPath);
    assert.equal(observeCodexHostRepositoryInitAdmission(path).status, "invalid",
      "a marker without its receipt is not a pristine pre-init state");
    assert.equal(evaluateLifecycleReadyGuard({
      tool_name: "Bash",
      tool_input: { command: "rg --files" },
    }, { projectDir: path }).exitCode, 0,
    "a damaged admission remains read-only diagnosable");
    assert.equal(evaluateLifecycleReadyGuard({
      tool_name: "Bash",
      tool_input: { command: "printf mutation > implementation.txt" },
    }, { projectDir: path }).exitCode, 2,
    "a damaged admission still blocks project mutation");
  } finally { dispose(path); }
});

test("an existing linked Git worktree is adopted without replacing its .git pointer", () => {
  const container = root(); const source = join(container, "source"); const linked = join(container, "linked");
  try {
    mkdirSync(source);
    git(["init", "-q", "-b", "main"], source);
    git(["config", "user.name", "Onboarding Fixture"], source);
    git(["config", "user.email", "onboarding@example.invalid"], source);
    writeFileSync(join(source, "README.md"), "worktree project\n");
    git(["add", "README.md"], source);
    git(["commit", "-q", "-m", "base"], source);
    git(["worktree", "add", "-q", "-b", "linked-onboarding", linked], source);
    const gitPointer = readFileSync(join(linked, ".git"), "utf8");
    const plan = run(onboarding, ["plan", "--root", linked], linked);
    assert.equal(plan.status, 0, plan.stdout);
    assert.equal(plan.json.status, "adoption-required");
    const applied = run(onboarding, actionArgs(plan.json), linked);
    assert.equal(applied.status, 0);
    assert.equal(readFileSync(join(linked, ".git"), "utf8"), gitPointer);
    assert.equal(readFileSync(join(linked, "README.md"), "utf8"), "worktree project\n");
    const runtimePlan = run(onboarding, ["plan-runtime", "--root", linked], linked);
    const initialized = run(onboarding, actionArgs(runtimePlan.json), linked);
    assert.equal(initialized.json.status, "restart-required");
    const readback = run(authority, ["--root", linked], linked);
    assert.equal(readback.status, 1);
    assert.equal(readback.json.status, "restart-required");
  } finally { dispose(container); }
});

test("ready roots recover a missing manifest and a governed V3 registry checkout through shipped CLIs", () => {
  const path = root();
  try {
    makeReady(path);
    assert.equal(run(onboarding, ["inspect", "--root", path], path).json.status, "ready");

    const manifestPath = join(path, ".claude", "pipeline.yaml");
    unlinkSync(manifestPath);
    const missing = run(onboarding, ["inspect", "--root", path], path);
    assert.equal(missing.json.status, "runtime-initialization-required");
    assert.equal(missing.json.diagnostics[0].code, "runtime_missing");
    const runtimePlan = run(onboarding, actionArgs(missing.json), path);
    assert.equal(runtimePlan.json.status, "runtime-initialization-required");
    const runtimeApplied = run(onboarding, actionArgs(runtimePlan.json), path);
    assert.equal(runtimeApplied.json.status, "restart-required");
    completeRuntimeReadback(path, 60_000);
    assert.equal(run(onboarding, ["inspect", "--root", path], path).json.status, "ready");

    const sourcePath = join(path, "pipeline.user.yaml");
    const currentSource = readFileSync(sourcePath, "utf8");
    const governedCheckout = currentSource.replace(
      /^critic_export:\r?\n(?:[ \t].*(?:\r?\n|$))*/mu,
      "",
    );
    assert.notEqual(governedCheckout, currentSource);
    writeFileSync(sourcePath, governedCheckout);
    const stale = run(onboarding, ["inspect", "--root", path], path);
    assert.equal(stale.json.status, "migration-required");
    assert.equal(stale.json.diagnostics[0].code, "stale_generated_projection");
    assert.equal(stale.json.nextAction.argv[0], migration);
    assert.equal(stale.json.nextAction.argv[1], "plan");
    const migrationInspection = run(migration, ["inspect", "--root", path], path);
    assert.equal(migrationInspection.json.sourceKind, "v3-refresh");
    const migrationPlan = run(migration, actionArgs(stale.json), path);
    assert.equal(migrationPlan.json.status, "ready");
    const migrated = run(migration, ["apply", "--root", path, "--activate"], path);
    assert.equal(migrated.json.status, "applied");
    assert.equal(run(onboarding, ["inspect", "--root", path], path).json.status, "ready");
  } finally { dispose(path); }
});

test("Claude, Codex, and Antigravity complete the same fresh intake-to-implementation happy path", () => {
  const paths = [];
  const runners = ["claude", "codex", "antigravity"];
  const inputNames = (action) => [
    ...(action?.inputs ?? []),
    ...(action?.input ? [action.input] : []),
    ...((action?.pendingAsks ?? []).flatMap((ask) => [
      ...(ask?.inputs ?? []),
      ...(ask?.input ? [ask.input] : []),
    ])),
  ].map((input) => input?.name).filter(Boolean);
  try {
    for (const runner of runners) {
      const path = root();
      paths.push(path);

      const portablePlan = run(onboarding, ["plan", "--root", path, "--runner", runner], path);
      assert.equal(portablePlan.status, 0, portablePlan.stdout);
      const portableApplied = run(onboarding, explicitRunnerActionArgs(portablePlan.json, runner), path);
      assert.equal(portableApplied.status, 0, portableApplied.stdout);

      const runtimePlan = run(onboarding, ["plan-runtime", "--root", path, "--runner", runner], path);
      assert.equal(runtimePlan.status, 0, runtimePlan.stdout);
      const runtimeApplied = run(onboarding, explicitRunnerActionArgs(runtimePlan.json, runner), path);
      assert.equal(runtimeApplied.status, 0, runtimeApplied.stdout);
      if (runner === "codex") {
        assert.equal(runtimeApplied.json.status, "restart-required", "Codex must reach its truthful native-runtime readback boundary");
        completeRuntimeReadback(path, 70_000 + paths.length * 100);
      } else {
        assert.equal(runtimeApplied.json.status, "intake-required", `${runner}: plugin-native runtime continues directly to intake`);
      }

      const beforeIntake = run(onboarding, ["inspect", "--root", path, "--runner", runner], path);
      assert.equal(beforeIntake.status, 0, beforeIntake.stdout);
      assert.doesNotMatch(JSON.stringify(beforeIntake.json), /trustAnchor(?:Pointer|Policy)RepairAcknowledged/u,
        `${runner}: an intentionally empty machine plane is not a broken trust anchor`);

      const consented = run(onboarding, [
        "intake-consent-apply", "--root", path, "--granted",
        "--git-author-name", "Greenfield E2E PO",
        "--git-author-email", "greenfield-e2e@example.invalid",
        "--language", "en", "--profile", "feature", "--activate", "--runner", runner,
      ], path);
      assert.equal(consented.status, 0, consented.stdout);
      git(["config", "user.name", "Greenfield E2E PO"], path);
      git(["config", "user.email", "greenfield-e2e@example.invalid"], path);

      const captured = run(onboarding, [
        "intake-capture-apply", "--root", path,
        "--text", "Build a locally playable mini HTML game with no external dependencies.",
        "--activate", "--runner", runner,
      ], path);
      assert.equal(captured.status, 0, captured.stdout);
      const answers = JSON.stringify([
        { question: "What is the primary goal?", answer: "Ship a keyboard-playable local game." },
        { question: "How is it verified?", answer: "Run the repository verify script." },
      ]);
      const answered = run(onboarding, [
        "intake-design-questions-apply", "--root", path, "--answers-json", answers,
        "--activate", "--runner", runner,
      ], path);
      assert.equal(answered.status, 0, answered.stdout);

      const afterAnswers = run(onboarding, ["inspect", "--root", path, "--runner", runner], path);
      assert.equal(afterAnswers.status, 0, afterAnswers.stdout);
      const repeated = inputNames(afterAnswers.json.nextAction);
      for (const name of ["gitAuthorName", "gitAuthorEmail", "language", "profile"]) {
        assert.equal(repeated.includes(name), false, `${runner}: answered ${name} must not be asked again`);
      }

      const generatePlan = run(onboarding, ["intake-generate-plan", "--root", path, "--runner", runner], path);
      assert.equal(generatePlan.status, 0, generatePlan.stdout);
      const generated = run(onboarding, [
        "intake-generate-apply", "--root", path, "--plan-sha256", generatePlan.json.planSha256,
        "--activate", "--runner", runner,
      ], path);
      assert.equal(generated.status, 0, generated.stdout);
      const prdPath = join(path, generated.json.targets.prd.path);
      writeFileSync(prdPath, `${PO_GATE_PRD_ACKNOWLEDGEMENT_MARKER}\n${readFileSync(prdPath, "utf8")}`);

      const bindPlan = run(onboarding, ["bootstrap-bind-plan", "--root", path, "--runner", runner], path);
      assert.equal(bindPlan.status, 0, bindPlan.stdout);
      const bound = run(onboarding, [
        "bootstrap-bind-apply", "--root", path, "--plan-sha256", bindPlan.json.planSha256,
        "--activate", "--runner", runner,
      ], path);
      assert.equal(bound.status, 0, bound.stdout);
      assert.equal(bound.json.status, "applied", `${runner}: generated design package must bind without a recovery detour`);

      const state = (args) => {
        let stderr = "";
        const status = pipelineStateCli(args, {
          dir: path,
          now: () => "2026-08-30T12:00:00.000Z",
          writeError: (chunk) => { stderr += chunk; },
        });
        assert.equal(status, 0, `${runner}: pipeline-state ${args[0]} failed: ${stderr}`);
      };
      state(["submit-plan", "--by", "Greenfield E2E PO", "--profile", "feature"]);
      state(["present-plan", "--by", "Greenfield E2E PO"]);
      state(["approve-plan", "--by", "Greenfield E2E PO"]);
      const verifyCommand = `${process.execPath} -e "process.exit(0)"`;
      state(["set-phase", "--phase", "implementation", "--verify-command", verifyCommand]);

      const ready = run(onboarding, ["inspect", "--root", path, "--runner", runner], path);
      assert.equal(ready.status, 0, ready.stdout);
      assert.equal(ready.json.status, "ready", `${runner}: final inspection must remain ready`);
      assert.equal(ready.json.nextAction, null, `${runner}: implementation-ready must not point back into onboarding`);
      const calibration = JSON.parse(readFileSync(join(path, "project", "pipeline.json"), "utf8"));
      assert.equal(calibration.verify, verifyCommand, `${runner}: the real verify command is persisted at the transition`);
    }
  } finally {
    for (const path of paths) dispose(path);
  }
});
