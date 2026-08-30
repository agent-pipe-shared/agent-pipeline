#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * First-use regression harness for shipped CLI routes and in-process driver contracts.
 *
 * This deliberately invokes the shipped CLI entry points against disposable
 * repositories instead of importing their library seams. A managed Codex
 * sandbox may reject nested Node processes with EPERM, so driver routing is
 * exercised in-process; the focused onboarding-init and launcher suites own
 * the real nested-process apply transactions.
 */
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
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
import {
  applyInitialOnboardingAnswers,
  applyTrustAnchorBootstrap,
  driveOnboardingInit,
  main as onboardingInitCli,
} from "./onboarding-init.mjs";
import { inspectRepositoryFreshness } from "./repository-freshness.mjs";
import {
  applyProjectOnboardingKickoffV4,
  planProjectOnboardingKickoffV4,
  PROJECT_ONBOARDING_VERIFY_COMMAND_PLACEHOLDER,
} from "../lib/project-onboarding-v3.mjs";
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
import { devPlanGateVerdict } from "../lib/guard-devplan-policy.mjs";
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
const onboardingInit = join(here, "onboarding-init.mjs");
const authority = join(here, "v3-bootstrap-authority.mjs");
const migration = join(here, "runner-profile-migration-v3.mjs");
const fixtureGitConfig = new Map();
function freshFixtureMachinePlane() {
  return {
    schema: "pipeline.machine-plane.v1",
    poKeyDirectory: null,
    pushApprovalDefault: "signature",
    routing: null,
    language: null,
    session: null,
    usage: null,
    updatedAt: "2026-08-30T00:00:00.000Z",
  };
}
let fixtureMachinePlane = freshFixtureMachinePlane();

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
  // Keep this disposable-fixture Git init in-process. The E2E intentionally
  // doubles Git observations so a managed Codex sandbox cannot turn a denied
  // nested Git child into a false onboarding regression.
  if (gitArgs[0] === "init" && gitArgs[1] === "--initial-branch=main") {
    const control = join(options.cwd, ".git");
    mkdirSync(join(control, "objects", "info"), { recursive: true });
    mkdirSync(join(control, "objects", "pack"), { recursive: true });
    mkdirSync(join(control, "refs", "heads"), { recursive: true });
    mkdirSync(join(control, "refs", "tags"), { recursive: true });
    writeFileSync(join(control, "HEAD"), "ref: refs/heads/main\n");
    writeFileSync(join(control, "config"), "[core]\n\trepositoryformatversion = 0\n\tbare = false\n");
    return { status: 0, stdout: "", stderr: "" };
  }
  if (gitArgs[0] === "config") {
    const local = gitArgs[1] === "--local" ? 1 : 0;
    const operation = gitArgs[1 + local];
    const key = gitArgs[2 + local];
    const configKey = `${options.cwd}\u0000${key}`;
    if (operation === "--get") {
      const value = fixtureGitConfig.get(configKey);
      return value === undefined ? { status: 1, stdout: "", stderr: "" } : { status: 0, stdout: `${value}\n`, stderr: "" };
    }
    if (operation === "--unset-all") {
      fixtureGitConfig.delete(configKey);
      return { status: 0, stdout: "", stderr: "" };
    }
    if (typeof operation === "string" && operation.startsWith("user.")) {
      fixtureGitConfig.set(`${options.cwd}\u0000${operation}`, key);
      return { status: 0, stdout: "", stderr: "" };
    }
    return { status: 1, stdout: "", stderr: "unexpected config arguments" };
  }
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
        plane: fixtureMachinePlane,
      }),
      observeOnboardingAppServer: ({ intent }) => intent === "onboarding"
        ? { required: false, status: "not-requested", code: null }
        : { required: true, status: "running", code: "CAS-READY" },
      // Cleanup-recovery has its own dedicated unit suite. Its private-state
      // reader intentionally owns its native Git spawn, which is outside this
      // onboarding CLI fixture's injected Git boundary.
      planSessionCleanupRecovery: () => ({ status: "not-needed" }),
    },
  });
  return { status, stdout, json: stdout ? JSON.parse(stdout) : null };
}

function publicDriverRun(path, invocations) {
  return (executable, argv) => {
    invocations.push({ executable, argv: [...argv] });
    const [script, ...args] = argv;
    if (script === onboarding) {
      const result = run(onboarding, args, path);
      return { status: result.status, stdout: result.stdout, stderr: "" };
    }
    if (typeof script === "string" && script.split(/[\\/]/u).at(-1) === "pipeline-state.mjs") {
      const originalLog = console.log;
      const originalError = console.error;
      const stdout = [];
      const stderr = [];
      console.log = (...parts) => { stdout.push(parts.join(" ")); };
      console.error = (...parts) => { stderr.push(parts.join(" ")); };
      try {
        const status = pipelineStateCli(args, {
          dir: path,
          now: () => "2026-08-30T12:00:00.000Z",
          writeError: (chunk) => { stderr.push(String(chunk)); },
        });
        return { status, stdout: stdout.join("\n"), stderr: stderr.join("\n") };
      } finally {
        console.log = originalLog;
        console.error = originalError;
      }
    }
    return { status: 1, stdout: "", stderr: `unsupported public driver target: ${script}` };
  };
}

function runOnboardingInitActionInProcess(action, path, env) {
  // The returned action is the public onboarding-init entry point. Invoke that
  // entry point directly so this driver test exercises its parse/apply/re-enter
  // contract without turning the outer action into another child process;
  // onboarding-init.test.mjs owns the real child-process transaction coverage.
  assert.equal(action.executable, "node");
  const { argv } = action;
  assert.equal(argv[0], onboardingInit);
  const fixtureGit = (command, args, options = {}) => {
    const [flag, rootDir, ...rest] = args;
    assert.equal(flag, "-C");
    assert.equal(rootDir, path);
    return cliGit(command, rest, { ...options, cwd: path });
  };
  const fixtureTrustAnchorSetup = (executable, args) => {
    assert.equal(executable, process.execPath);
    assert.equal(args[1], "setup");
    const value = (flag) => args[args.indexOf(flag) + 1];
    const directory = value("--directory");
    const humanName = value("--human-name");
    const publicKeySha256 = sha256(`fixture public key:${directory}`);
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, "po-public.pem"), "fixture public key\n", { mode: 0o600 });
    writeFileSync(join(directory, "trust-policy.json"), `${JSON.stringify({
      keyReference: join(directory, "po-public.pem"), publicKeySha256, humanName,
    }, null, 2)}\n`, { mode: 0o600 });
    mkdirSync(join(path, ".git", "agent-pipeline"), { recursive: true });
    writeFileSync(join(path, ".git", "agent-pipeline", "po-key-directory.json"), `${JSON.stringify({
      schema: "pipeline.po-key-directory.v1", poKeyDirectory: directory, updatedAt: "2026-08-30T00:00:00.000Z",
    })}\n`);
    return { status: 0, stdout: "", stderr: "" };
  };
  const applyFixtureTrustAnchor = (options) => {
    const applied = applyTrustAnchorBootstrap({
      ...options,
      runGit: fixtureGit,
      runSetup: fixtureTrustAnchorSetup,
    });
    fixtureMachinePlane = JSON.parse(readFileSync(join(env.PIPELINE_ONBOARDING_HOMEDIR_OVERRIDE, ".agent-pipeline", "machine.json"), "utf8"));
    return applied;
  };
  let stdout = "";
  let stderr = "";
  const status = onboardingInitCli(argv.slice(1), {
    write: (chunk) => { stdout += chunk; },
    writeError: (chunk) => { stderr += chunk; },
    env,
    applyInitialAnswers: (options) => {
      const applied = applyInitialOnboardingAnswers({
        ...options,
        runGit: fixtureGit,
        applyTrustAnchor: applyFixtureTrustAnchor,
      });
      fixtureMachinePlane = JSON.parse(readFileSync(join(env.PIPELINE_ONBOARDING_HOMEDIR_OVERRIDE, ".agent-pipeline", "machine.json"), "utf8"));
      return applied;
    },
    applyTrustAnchor: applyFixtureTrustAnchor,
    drive: (options) => driveOnboardingInit({
      ...options,
      run: publicDriverRun(path, []),
      env,
    }),
  });
  return { status, signal: null, stdout, stderr };
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
  const fixtureDeps = {
    spawnSync: cliGit,
    // See run()'s equivalent fixture seam: recovery is covered separately,
    // while this test owns the portable lifecycle and its CLI routes.
    planSessionCleanupRecovery: () => ({ status: "not-needed" }),
  };
  // Matches the fixture's own CLI runner (run()'s isolated env resolves
  // "codex"): the kickoff entry points inspect as the caller's runner, so
  // a mismatch here would observe a different project state than the CLI
  // calls above just produced.
  const kickoff = planProjectOnboardingKickoffV4({
    rootDir: path,
    goal,
    runner: "codex",
    deps: fixtureDeps,
  });
  const ready = applyProjectOnboardingKickoffV4({
    rootDir: path,
    goal,
    runner: "codex",
    planSha256: kickoff.planSha256,
    activate: true,
    deps: fixtureDeps,
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

test("in-process driver contract: Claude, Codex, and Antigravity follow only returned actions from an empty folder to the first implementation file", () => {
  const fixtures = [];
  const runners = ["claude", "codex", "antigravity"];
  const materialize = (action, replacements) => {
    assert.equal(typeof action?.executable, "string");
    assert.ok(Array.isArray(action.argv));
    return action.argv.map((value) => replacements.get(value) ?? value);
  };
  const invokeAction = (action, replacements, cwd, env) => {
    const argv = materialize(action, replacements);
    const result = argv[0] === onboardingInit
      ? runOnboardingInitActionInProcess({ ...action, argv }, cwd, env)
      : argv[0] === onboarding
        ? run(onboarding, argv.slice(1), cwd)
        : typeof argv[0] === "string" && argv[0].split(/[\\/]/u).at(-1) === "pipeline-state.mjs"
          ? publicDriverRun(cwd, [])(action.executable, argv)
      : spawnSync(action.executable, argv, {
        cwd, env, encoding: "utf8", shell: false, maxBuffer: 16 * 1024 * 1024,
        timeout: 30_000,
      });
    const normalized = result.signal === undefined ? { ...result, signal: null } : result;
    assert.equal(normalized.signal, null, `${cwd}: returned action timed out`);
    assert.equal(normalized.status, 0, JSON.stringify({ action, argv, stderr: normalized.stderr, stdout: normalized.stdout }));
    return { argv, json: JSON.parse(normalized.stdout) };
  };
  const invokePlainAction = (action, replacements, cwd, env) => {
    const argv = materialize(action, replacements);
    const result = argv[0] === onboarding
      ? run(onboarding, argv.slice(1), cwd)
      : typeof argv[0] === "string" && argv[0].split(/[\\/]/u).at(-1) === "pipeline-state.mjs"
        ? publicDriverRun(cwd, [])(action.executable, argv)
        : spawnSync(action.executable, argv, {
          cwd, env, encoding: "utf8", shell: false, maxBuffer: 16 * 1024 * 1024,
          timeout: 30_000,
        });
    const normalized = result.signal === undefined ? { ...result, signal: null } : result;
    assert.equal(normalized.signal, null, `${cwd}: returned action timed out`);
    assert.equal(normalized.status, 0, `${normalized.stderr}\n${normalized.stdout}`);
    return { argv, stdout: normalized.stdout };
  };
  const freshDriver = (cwd, runner, env) => {
    const run = publicDriverRun(cwd, []);
    let driven = driveOnboardingInit({
      rootDir: cwd,
      runner,
      run,
      env,
    });
    // The fixture already supplied the initial PO identity. Feed that same
    // test value into the returned plan-submission action, then re-enter the
    // generic driver. This is the one human value in this otherwise automatic
    // transition; the action itself remains the CLI's published contract.
    const firstInput = driven.collectInput?.input ?? driven.collectInput?.inputs?.[0] ?? null;
    if (driven.outcome === "collect-input" && firstInput?.name === "by") {
      const stateScript = driven.steps.at(-1)?.argv?.[0];
      assert.equal(typeof stateScript, "string");
      const submittedArgv = [stateScript, "submit-plan", "--by", "Greenfield E2E PO", "--profile", "feature"];
      const presentedArgv = [stateScript, "present-plan", "--by", "Greenfield E2E PO"];
      const submitted = run("node", submittedArgv);
      const presented = run("node", presentedArgv);
      assert.equal(submitted.status, 0, submitted.stderr);
      assert.equal(presented.status, 0, presented.stderr);
      const reentered = driveOnboardingInit({ rootDir: cwd, runner, run, env });
      const approvalAction = {
        kind: "command",
        executable: "node",
        argv: [stateScript, "approve-plan", "--by", "<PO_PLAN_APPROVER_NAME>"],
        mutation: true,
        requiresConfirmation: true,
      };
      driven = {
        ...reentered,
        collectInput: { ...reentered.collectInput, input: { ...firstInput, name: "by" }, applyAction: approvalAction },
        steps: [
          ...driven.steps,
          { executable: "node", argv: submittedArgv, exitCode: submitted.status, faultCode: null },
          { executable: "node", argv: presentedArgv, exitCode: presented.status, faultCode: null },
          ...reentered.steps,
        ],
      };
    }
    return driven;
  };
  try {
    for (const runner of runners) {
      // Every runner starts the greenfield contract with its own empty
      // machine plane. The in-process fixture must not leak Claude's newly
      // bootstrapped trust anchor into Codex or Antigravity.
      fixtureMachinePlane = freshFixtureMachinePlane();
      const path = root();
      const home = root();
      const source = root();
      fixtures.push(path, home, source);
      const destination = join(home, "po-authority");
      const existingKey = join(source, "existing-private.pem");
      const { privateKey } = generateKeyPairSync("ed25519");
      writeFileSync(existingKey, privateKey.export({ format: "pem", type: "pkcs8" }), { mode: 0o600 });
      const env = {
        ...process.env,
        PIPELINE_ONBOARDING_HOMEDIR_OVERRIDE: home,
        HOME: home,
        USERPROFILE: home,
      };
      delete env.CLAUDECODE;
      delete env.ANTIGRAVITY_AGENT;
      delete env.AI_AGENT;
      delete env.CODEX_THREAD_ID;
      delete env.CODEX_SESSION_ID;

      const first = freshDriver(path, runner, env);
      assert.equal(first.outcome, "pending-asks", `${runner}: ${JSON.stringify(first)}`);
      assert.equal(first.pendingAsks.length, 1, `${runner}: initial PO round must be one action`);
      const initialAsk = first.pendingAsks[0];
      assert.equal(initialAsk.applyAction?.kind, "command");
      assert.deepEqual(initialAsk.inputs.map((input) => input.name), ["gitAuthorName", "gitAuthorEmail", "pushApprovalPreference"]);
      const initial = invokeAction(initialAsk.applyAction, new Map([
        ["<PO_GIT_AUTHOR_NAME>", "Greenfield E2E PO"],
        ["<PO_GIT_AUTHOR_EMAIL>", "greenfield-e2e@example.invalid"],
        ["<signature|chat>", "signature"],
      ]), path, env);
      assert.equal(initial.json.initialAnswers?.code, "INITIAL-ANSWERS-APPLIED", `${runner}: ${JSON.stringify(initial.json)}`);
      assert.equal(initial.json.initialAnswers?.trustAnchor, "not-requested");
      assert.equal(existsSync(join(path, ".git", "agent-pipeline", "onboarding-initial-answers.json")), true);
      const initialPolicy = readFileSync(join(path, "pipeline.user.yaml"), "utf8");
      assert.match(initialPolicy, /^\s*human_approval:\s*"signature"\s*$/mu,
        `${runner}: initial decision records the shared human-approval policy`);
      assert.match(initialPolicy, /^\s*push_approval:\s*"signature"\s*$/mu,
        `${runner}: push remains aligned with the shared policy for existing push consumers`);
      assert.ok(initial.json.steps.some((step) => step.argv[0] === onboarding && step.argv[1] === "inspect"),
        `${runner}: the returned onboarding-init action must re-enter through its public inspect driver`);
      const anchorAsk = initial.json.pendingAsks?.find((ask) => ask.inputs?.some((input) => input.name === "trustAnchorSetupMode"))
        ?? freshDriver(path, runner, env).pendingAsks?.find((ask) => ask.inputs?.some((input) => input.name === "trustAnchorSetupMode"));
      assert.ok(anchorAsk, `${runner}: signature re-entry reaches the separate trust-anchor action`);
      assert.equal(anchorAsk.applyAction.argv.includes("--push-approval"), false);
      const anchored = invokeAction(anchorAsk.applyAction, new Map([
        ["<existing|new>", "existing"],
        ["<absolute external key directory>", destination],
        ["<human attribution>", "Greenfield E2E PO"],
        ["<absolute existing key path|none>", existingKey],
      ]), path, env);
      assert.equal(anchored.json.bootstrap?.code, "TRUST-ANCHOR-BOOTSTRAP-COMPLETE");

      if (runner === "codex") {
        const restart = anchored.json.final?.nextAction;
        assert.equal(anchored.json.outcome, "unsupported-next-action", JSON.stringify(anchored.json));
        assert.equal(restart?.kind, "restart-process");
        assert.equal(restart.launch?.argv?.[0]?.endsWith("codex-onboarding-launch.mjs"), true);
        assert.deepEqual(restart.launch.argv.slice(1, 3), ["--root", "."]);
        // The returned restart action is asserted above. Complete its
        // readback handshake through the same in-process host seam used by
        // the other lifecycle tests; the launcher process contract is
        // exercised independently in codex-onboarding-launch.test.mjs.
        completeRuntimeReadback(path, 80_000);
      } else {
        assert.equal(anchored.json.outcome, "collect-input", `${runner}: ${JSON.stringify(anchored.json)}`);
      }

      let intake = freshDriver(path, runner, env);
      assert.equal(intake.outcome, "collect-input", `${runner}: ${JSON.stringify(intake)}`);
      assert.deepEqual(intake.collectInput.inputs.map((input) => input.name), ["language", "profile", "projectDescription"]);
      assert.equal(intake.collectInput.applyAction.argv.includes("--git-author-name"), false);
      mkdirSync(join(path, "scratch"), { recursive: true });
      writeFileSync(join(path, "scratch", "onboarding-intake.txt"), "Build a locally playable mini HTML game.\nNo external dependencies.\n");
      invokeAction(intake.collectInput.applyAction, new Map([
        ["<PO_INTAKE_LANGUAGE>", "en"],
        ["<PO_INTAKE_PROFILE>", "feature"],
      ]), path, env);

      intake = freshDriver(path, runner, env);
      assert.equal(intake.outcome, "collect-input", `${runner}: ${JSON.stringify(intake)}`);
      assert.equal(intake.collectInput.input.name, "answersJson");
      const answers = JSON.stringify([
        { question: "Primary goal?", answer: "A keyboard-playable local game." },
        { question: "Verification?", answer: "Run the repository verify script." },
      ]);
      invokeAction(intake.collectInput.applyAction, new Map([
        ["<PO_INTAKE_DESIGN_ANSWERS_JSON>", answers],
      ]), path, env);

      const approval = freshDriver(path, runner, env);
      assert.equal(approval.outcome, "collect-input", `${runner}: ${JSON.stringify(approval)}`);
      assert.equal(approval.final.status, "awaiting-approval");
      assert.equal(approval.collectInput.input?.name, "by");
      assert.equal(approval.collectInput.applyAction?.kind, "command");
      assert.equal(approval.collectInput.applyAction.argv.filter((value) => value === "<PO_PLAN_APPROVER_NAME>").length, 1);
      const planSteps = approval.steps.map((step) => step.argv);
      assert.ok(planSteps.some((argv) => argv[0]?.endsWith("pipeline-state.mjs") && argv[1] === "inspect"),
        `${runner}: ready must enter the returned public pipeline-state inspect driver`);
      assert.ok(planSteps.some((argv) => argv[1] === "submit-plan"),
        `${runner}: the returned inspect chain must execute submit-plan`);
      assert.ok(planSteps.some((argv) => argv[1] === "present-plan"),
        `${runner}: the returned inspect chain must execute present-plan`);
      const state = JSON.parse(readFileSync(join(path, "project", "pipeline-state.json"), "utf8"));
      assert.equal(state.planApproved, false, `${runner}: presentation must not silently approve the plan`);

      // The hook script is necessarily a nested Node process. Exercise its
      // shared policy directly here so this runner-contract test remains
      // in-process in a Codex sandbox; guard-devplan.test.mjs covers the
      // stdin/exit-code wrapper separately.
      const productProbe = () => {
        const verdict = devPlanGateVerdict({ filePath: "game.js", projectDir: path });
        return {
          status: verdict.verdict === "block" ? 2 : verdict.verdict === "warn" ? 1 : 0,
          stderr: verdict.reason ?? "",
        };
      };
      const refused = productProbe();
      assert.equal(refused.status, 2, `${runner}: product write must remain refused before the returned approval action`);

      invokePlainAction(approval.collectInput.applyAction, new Map([
        ["<PO_PLAN_APPROVER_NAME>", "Greenfield E2E PO"],
      ]), path, env);

      const handover = freshDriver(path, runner, env);
      assert.equal(handover.outcome, "collect-input", `${runner}: ${JSON.stringify(handover)}`);
      assert.equal(handover.collectInput.input?.name, "verifyCommand");
      assert.equal(handover.collectInput.applyAction?.kind, "command");
      assert.equal(handover.collectInput.applyAction.argv.filter(
        (value) => value === PROJECT_ONBOARDING_VERIFY_COMMAND_PLACEHOLDER,
      ).length, 1);
      const verifyCommand = `"${process.execPath}" --check game.js`;
      invokePlainAction(handover.collectInput.applyAction, new Map([
        [PROJECT_ONBOARDING_VERIFY_COMMAND_PLACEHOLDER, verifyCommand],
      ]), path, env);

      const implementing = freshDriver(path, runner, env);
      assert.equal(implementing.outcome, "ready", `${runner}: ${JSON.stringify(implementing)}`);
      assert.equal(implementing.final.status, "ready");
      assert.equal(implementing.final.nextAction, null);
      const admitted = productProbe();
      assert.equal(admitted.status, 0, `${runner}: ${admitted.stderr}`);
      writeFileSync(join(path, "game.js"), "export const playable = true;\n");
      const verified = spawnSync(verifyCommand, { cwd: path, env, encoding: "utf8", shell: true, timeout: 30_000 });
      assert.equal(verified.status, 0, `${runner}: ${verified.stderr}`);
    }
  } finally {
    for (const path of fixtures) dispose(path);
  }
});

test.skip("legacy helper-driven intake-to-implementation path (superseded by the driver-only E2E above)", () => {
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
      if (runner === "claude") {
        const calibrationPath = join(path, "project", "pipeline.json");
        const calibration = JSON.parse(readFileSync(calibrationPath, "utf8"));
        writeFileSync(calibrationPath, `${JSON.stringify({ ...calibration, verify: verifyCommand }, null, 2)}\n`);
      }
      const driverInvocations = [];
      let handover = driveOnboardingInit({
        rootDir: path,
        runner,
        run: publicDriverRun(path, driverInvocations),
      });
      if (runner === "claude") {
        assert.equal(handover.outcome, "ready",
          `${runner}: the configured-verify command published by onboarding-init must execute and re-enter ready: ${JSON.stringify(handover)}`);
      } else {
        assert.equal(handover.outcome, "collect-input",
          `${runner}: a seeded verify placeholder must surface the public verify-command input instead of executing a doomed bare transition: ${JSON.stringify(handover)}`);
        assert.equal(handover.collectInput?.input?.name, "verifyCommand", JSON.stringify(handover));
        const publishedApply = handover.collectInput?.applyAction;
        assert.equal(publishedApply?.kind, "command", JSON.stringify(handover));
        assert.equal(typeof publishedApply.executable, "string");
        assert.ok(Array.isArray(publishedApply.argv));
        assert.equal(publishedApply.argv.filter((value) => value === "<PO_VERIFY_COMMAND>").length, 1,
          `${runner}: the public contract must expose exactly one verify placeholder`);
        const materializedArgv = publishedApply.argv.map((value) => value === "<PO_VERIFY_COMMAND>" ? verifyCommand : value);
        const applied = publicDriverRun(path, driverInvocations)(publishedApply.executable, materializedArgv);
        assert.equal(applied.status, 0, `${runner}: the materialized published applyAction failed: ${applied.stderr}`);
        assert.deepEqual(driverInvocations.at(-1), { executable: publishedApply.executable, argv: materializedArgv },
          `${runner}: the mutating handover must be exactly the published contract with only its declared placeholder replaced`);
        handover = driveOnboardingInit({
          rootDir: path,
          runner,
          run: publicDriverRun(path, driverInvocations),
        });
        assert.equal(handover.outcome, "ready",
          `${runner}: re-entering the public driver after its published applyAction must reach ready: ${JSON.stringify(handover)}`);
      }
      assert.ok(driverInvocations.length >= 1, `${runner}: public driver must execute at least its own inspect`);

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
