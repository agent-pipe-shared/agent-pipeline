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
import { createHash, createPublicKey, generateKeyPairSync } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { main as onboardingCli } from "./project-onboarding-v3.mjs";
import { main as authorityCli } from "./v3-bootstrap-authority.mjs";
import { main as migrationCli } from "./runner-profile-migration-v3.mjs";
import { main as settingsAllowlistMergeCli } from "./settings-allowlist-merge.mjs";
import { readState as readPipelineState, run as pipelineStateCli } from "./pipeline-state.mjs";
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
import { derivePoGateRepositoryFingerprint, PO_GATE_PRD_ACKNOWLEDGEMENT_MARKER, resolvePoGateRepositoryTopology } from "../lib/po-gate-authority.mjs";
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
import { readCriticalHumanProofPolicy } from "../lib/critical-human-proof-policy.mjs";
import { materializeTestDesignWorkflowPackage } from "../lib/test-design-workflow-fixture.mjs";
import { buildAdvisoryEvidenceBundle } from "../lib/advisory-lifecycle-v2.mjs";
import { canonicalJson } from "../lib/codex-sandbox-compatibility.mjs";
import { resolveV3DutyRoute } from "../lib/critic-route-v3.mjs";
import { registeredRouting, RUNNER_PROFILES_V3_REGISTRY_SHA256, validatePipelineUserV3 } from "../lib/runner-profiles-v3.mjs";
import { parseYaml } from "../lib/yaml-lite.mjs";
import { designReadinessReportSha256, designReadinessRunnerSelectionSha256, validateDesignReadinessModelOutput, verifyDesignReadinessHostExecution } from "../lib/design-readiness-host-evidence.mjs";
import { createDesignReadinessRunnerHostStore } from "../lib/design-readiness-runner-host-store.mjs";
import { buildRunnerDesignReadinessPrompt } from "../lib/runner-readiness-request.mjs";
import { observeOnboardingBootstrapPlanApproval, readOnboardingIntakeCheckpoint, readOnboardingIntakeMaterialInput } from "../lib/onboarding-continuity.mjs";
import { inspectArchitectureDesign } from "../lib/architecture-design.mjs";
import { renderArchitectureDesignSkeleton } from "../lib/design-authoring.mjs";
// This fixture exercises historical v1 admission, not v2 initial provenance.
import { coordinateLegacyDesignAdvisory as coordinateDesignAdvisory } from "../lib/design-advisory-coordinator.mjs";
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
const resumeHint = join(here, "resume-hint.mjs");
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
function hostVisibleFixtureRoot() { return mkdtempSync(join(homedir(), "pipeline onboarding external inventory-")); }
function greenfieldRoot() {
  const candidates = [...new Set([tmpdir(), process.env.TMPDIR, process.env.TMP, process.env.TEMP, "/var/tmp", "/dev/shm"].filter(Boolean))];
  for (const candidate of candidates) {
    let cursor;
    try { cursor = realpathSync(candidate); if (!lstatSync(cursor).isDirectory()) continue; }
    catch { continue; }
    let clean = true;
    while (true) {
      try { lstatSync(join(cursor, ".git")); clean = false; break; }
      catch (error) { if (error.code !== "ENOENT") { clean = false; break; } }
      const parent = dirname(cursor);
      if (parent === cursor) break;
      cursor = parent;
    }
    if (clean) return mkdtempSync(join(realpathSync(candidate), "pipeline onboarding greenfield-"));
  }
  throw new Error("no writable temporary parent without an existing Git control is available for the greenfield contract");
}
function dispose(path) { rmSync(path, { recursive: true, force: true }); }
function stripGeneratedArchitectureTemplate(content, { required = false } = {}) {
  const template = renderArchitectureDesignSkeleton().trimEnd();
  const count = content.split(template).length - 1;
  assert.ok(count === 0 || count === 1, "generated PRD must contain at most one exact reserved architecture template");
  if (required) assert.equal(count, 1, "greenfield intake generation must include the reserved architecture template");
  const stripped = count === 1 ? content.replace(template, "") : content;
  assert.doesNotMatch(stripped, /```pipeline-architecture-design[\s\S]*?```/u,
    "removing the reserved template must leave no architecture block or alter unrelated PRD content");
  return stripped;
}
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
  // The canonical governance observer independently verifies physical Git
  // topology, so the fixture must create a real repository rather than a
  // directory-shaped imitation. Other Git observations remain doubled below.
  if (gitArgs[0] === "init" && gitArgs[1] === "--initial-branch=main") {
    return spawnSync(command, gitArgs, { ...options, encoding: "utf8", shell: false,
      env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null", LC_ALL: "C" } });
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
function run(script, args, cwd, overrides = {}) {
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
      ...overrides,
    },
  });
  return { status, stdout, json: stdout ? JSON.parse(stdout) : null };
}

function publicDriverRun(path, invocations, designWorkflowDeps = {}) {
  return (executable, argv) => {
    invocations.push({ executable, argv: [...argv] });
    const [script, ...args] = argv;
    if (script === onboarding) {
      const result = run(onboarding, args, path, designWorkflowDeps);
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
          ...designWorkflowDeps,
        });
        return { status, stdout: stdout.join("\n"), stderr: stderr.join("\n") };
      } finally {
        console.log = originalLog;
        console.error = originalError;
      }
    }
    if (typeof script === "string" && script.split(/[\\/]/u).at(-1) === "settings-allowlist-merge.mjs") {
      let stdout = "";
      let stderr = "";
      const status = settingsAllowlistMergeCli(args, {
        write: (chunk) => { stdout += chunk; },
        writeError: (chunk) => { stderr += chunk; },
      });
      return { status, stdout, stderr };
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
    const fixedGitConfig = [
      "-c", "core.hooksPath=/dev/null",
      "-c", "commit.gpgSign=false",
      "-c", "tag.gpgSign=false",
      "-c", "core.fsmonitor=false",
      "-c", "credential.helper=",
    ];
    let gitArgs = [...args];
    if (gitArgs[0] === "-c") {
      if (gitArgs.length < fixedGitConfig.length
        || fixedGitConfig.some((value, index) => gitArgs[index] !== value)) {
        return { status: 1, stdout: "", stderr: "unexpected Git config prefix" };
      }
      gitArgs = gitArgs.slice(fixedGitConfig.length);
    }
    const [flag, rootDir, ...rest] = gitArgs;
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
    const existingKey = value("--existing-key");
    const publicKey = createPublicKey(readFileSync(existingKey, "utf8"))
      .export({ format: "pem", type: "spki" });
    const publicKeySha256 = sha256(publicKey);
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, "po-public.pem"), publicKey, { mode: 0o600 });
    writeFileSync(join(directory, "trust-policy.json"), `${JSON.stringify({
      // A keyReference is a portable opaque identifier, never a host path.
      // The temp root deliberately contains spaces, so using its filename here
      // would create an invalid synthetic signer rather than an E2E fixture.
      keyReference: "fixture-po-key", publicKeySha256, humanName,
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

function advanceTypedOnboardingInput(path, result) {
  let current = result;
  const allowed = new Set(["text", "projectDescription", "gitAuthorName", "gitAuthorEmail", "language", "profile", "humanApprovalMode", "advisorExportConsent"]);
  const answers = new Map([
    ["<PO_INTAKE_GIT_AUTHOR_NAME>", "Onboarding E2E PO"],
    ["<PO_INTAKE_GIT_AUTHOR_EMAIL>", "onboarding-e2e@example.invalid"],
    ["<PO_INTAKE_LANGUAGE>", "en"], ["<PO_INTAKE_PROFILE>", "feature"],
    ["<PO_GIT_AUTHOR_NAME>", "Onboarding E2E PO"],
    ["<PO_GIT_AUTHOR_EMAIL>", "onboarding-e2e@example.invalid"],
    ["<signature|chat>", "signature"], ["<approved|declined>", "declined"], ["<de|en>", "en"],
  ]);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const action = current.json?.nextAction;
    if (action?.kind !== "collect-input") return current;
    const names = action.inputs?.map((input) => input.name) ?? (action.input ? [action.input.name] : []);
    assert.ok(names.length > 0 && names.every((name) => allowed.has(name)), `unhandled published input names: ${names.join(",")}`);
    assert.equal(action.applyAction?.kind, "command");
    assert.equal(action.applyAction.argv[0], onboarding);
    if (names.includes("projectDescription") || names.includes("text")) {
      mkdirSync(join(path, "scratch"), { recursive: true });
      writeFileSync(join(path, "scratch", "onboarding-intake.txt"),
        "Build a small local project from this original fixture request.\nKeep the result self-contained and locally verifiable.\n");
    }
    if (names.includes("projectDescription")) assert.equal(action.applyAction.argv.includes("--granted"), true, "the disposable fixture explicitly chooses local intake consent");
    const argv = action.applyAction.argv.map((value) => answers.get(value) ?? value);
    const applied = run(onboarding, argv.slice(1), path);
    assert.equal(applied.status, 0, applied.stdout);
    current = run(onboarding, ["inspect", "--root", path, "--runner", "codex"], path);
  }
  assert.notEqual(current.json?.nextAction?.kind, "collect-input", "the bounded fixture answer sequence must reach the next non-input step");
  return current;
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
  const seeded = run(onboarding, actionArgs(portable.json), path);
  assert.equal(advanceTypedOnboardingInput(path, seeded).json.status, "runtime-initialization-required");
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
  const permissionsDrift = run(onboarding, ["inspect", "--root", path], path);
  assert.equal(permissionsDrift.json.status, "ready");
  assert.equal(permissionsDrift.json.runnerPermissions.status, "not-applicable");
  assert.equal(Object.hasOwn(permissionsDrift.json.runnerPermissions, "optionalPlan"), false);
  assert.equal(run(onboarding, ["inspect", "--root", path], path).json.status, "ready");
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
      const afterCapture = advanceTypedOnboardingInput(path, applied);
      assert.equal(afterCapture.json.status, "runtime-initialization-required");
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
    assert.equal(applied.json.nextAction.kind, "command");
    assert.ok(applied.json.nextAction.pendingAsks?.some((ask) =>
      ask.inputs?.some((input) => input.name === "language")));
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
    const rawPlan = run(onboarding, ["plan", "--root", linked], linked);
    assert.equal(rawPlan.status, 0, rawPlan.stdout);
    assert.equal(rawPlan.json.status, "adoption-required");
    const plan = advanceTypedOnboardingInput(linked, rawPlan);
    const applied = run(onboarding, actionArgs(plan.json), linked);
    assert.equal(applied.status, 0);
    advanceTypedOnboardingInput(linked, applied);
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

test("in-process driver follows returned actions and preserves the Codex legacy-advisory approval boundary", async (testContext) => {
  const fixtures = [];
  const runners = ["codex", "claude", "antigravity"];
  const fixtureGit = (cwd, argv) => {
    const gitEnv = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_")));
    const result = spawnSync("git", argv, { cwd, env: gitEnv, encoding: "utf8", shell: false, maxBuffer: 16 * 1024 * 1024 });
    assert.equal(result.error ?? null, null, `${JSON.stringify(argv)}: ${result.error?.code ?? ""} ${result.error?.message ?? ""}`);
    assert.equal(result.signal, null);
    assert.equal(result.status, 0, `${JSON.stringify(argv)}: ${result.stderr}`);
    return result.stdout;
  };
  const candidateAtHead = (cwd) => {
    const candidate = { commit: fixtureGit(cwd, ["rev-parse", "HEAD"]).trim(), tree: fixtureGit(cwd, ["rev-parse", "HEAD^{tree}"]).trim() };
    assert.match(candidate.commit, /^[a-f0-9]{40}$/u);
    assert.match(candidate.tree, /^[a-f0-9]{40}$/u);
    return candidate;
  };
  const commitFixturePaths = (cwd, paths, subject, dispatch) => {
    assert.ok(paths.length > 0);
    const hooks = ["pre-commit", "commit-msg"].map((name) => {
      const path = join(cwd, ".git", "hooks", name);
      assert.equal(existsSync(path), true, `${name}: the real generated Git hook must be installed`);
      return { path, sha256: createHash("sha256").update(readFileSync(path)).digest("hex") };
    });
    fixtureGit(cwd, ["add", "--", ...paths]);
    fixtureGit(cwd, ["-c", "user.name=Greenfield E2E PO", "-c", "user.email=greenfield-e2e@example.invalid",
      "commit", "-m", subject, "--trailer", "AI-Assisted: true", "--trailer", `Dispatch: ${dispatch} (elephant)`]);
    for (const hook of hooks) assert.equal(createHash("sha256").update(readFileSync(hook.path)).digest("hex"), hook.sha256,
      "successful fixture commits preserve the enforcing generated hooks");
    return candidateAtHead(cwd);
  };
  const bindFixtureReadiness = (cwd, runner, designFixture) => {
    const packageFile = join(cwd, designFixture.packagePath);
    const designPackage = JSON.parse(readFileSync(packageFile, "utf8"));
    const originalReadiness = JSON.parse(readFileSync(join(cwd, designPackage.readiness.path), "utf8"));
    const candidate = candidateAtHead(cwd);
    assert.deepEqual(candidate, designPackage.candidate);
    // The v1 package admits a separate review runner. This local report-only
    // child is a fixture host producer, never a native provider consultation.
    // Codex's declined export decision remains unchanged throughout the test.
    const requestedReviewRunner = runner === "codex" ? "claude" : runner;
    const requestedRoute = resolveV3DutyRoute({ rootDir: cwd, dutyId: "readiness", runner: requestedReviewRunner, candidateCommit: candidate.commit });
    testContext.diagnostic(`${runner}: exact requested readiness route ${JSON.stringify({
      authoringRunner: runner, requestedRunner: requestedReviewRunner, route: requestedRoute,
      registeredCell: registeredRouting().duties.readiness[requestedReviewRunner], registrySha256: RUNNER_PROFILES_V3_REGISTRY_SHA256,
      reasonFieldPresent: Object.hasOwn(requestedRoute, "reason"),
      explanation: "The resolver returns the frozen registered candidate-bound duty cell state; it does not probe a live provider." })}`);
    let resolvedRoute = requestedRoute;
    if (runner === "antigravity") {
      assert.equal(requestedRoute.state, "unavailable");
      assert.equal(registeredRouting().duties.readiness.antigravity.state, "unavailable");
      const committedPolicy = fixtureGit(cwd, ["show", `${candidate.commit}:pipeline.user.yaml`]);
      assert.equal(sha256(committedPolicy), requestedRoute.sourceSha256);
      const policy = parseYaml(committedPolicy);
      assert.equal(validatePipelineUserV3(policy).ok, true);
      const spoofedPolicy = JSON.parse(JSON.stringify(policy));
      spoofedPolicy.routing.duties.readiness.antigravity.state = "default";
      const spoof = validatePipelineUserV3(spoofedPolicy);
      assert.equal(spoof.ok, false, "an unavailable duty cannot be promoted by fixture source edits");
      assert.ok(spoof.errors.some((error) => error.code === "frozen_mapping"
        && error.path === "$.routing.duties.readiness.antigravity.state"), JSON.stringify(spoof));
      // Historical v1 permits an independently selected readiness runner.
      // Assign its existing Claude route to this local report-only fixture,
      // as for Codex above; AGY's registered route remains unavailable.
      resolvedRoute = resolveV3DutyRoute({ rootDir: cwd, dutyId: "readiness", runner: "claude", candidateCommit: candidate.commit });
    }
    const reviewRunner = resolvedRoute.runner;
    assert.equal(resolvedRoute.state, "default");
    assert.equal(resolvedRoute.sourceSha256, requestedRoute.sourceSha256);
    assert.equal(resolvedRoute.candidateCommit, candidate.commit);
    assert.equal(reviewRunner, "claude");
    testContext.diagnostic(`${runner}: assigned local readiness host ${JSON.stringify({ authoringRunner: runner,
      reviewRunner, route: resolvedRoute, assignment: runner === "antigravity"
        ? "independent-v1-Claude-host; AGY-route-unavailable" : "existing-v1-local-host",
      nativeProviderAvailabilityClaim: false })}`);
    const route = Object.fromEntries(["model", "effort", "sourceSha256", "candidateCommit"].map((key) => [key, resolvedRoute[key]]));
    const sources = designPackage.sources;
    for (const source of Object.values(sources)) {
      assert.equal(fixtureGit(cwd, ["show", `${candidate.commit}:${source.path}`]), readFileSync(join(cwd, source.path), "utf8"));
    }
    const evidenceBundle = buildAdvisoryEvidenceBundle(cwd, Object.values(sources).map((source) => source.path).sort());
    const prompt = buildRunnerDesignReadinessPrompt({ runner: reviewRunner, dispatchId: originalReadiness.dispatchId,
      candidate, sources, evidenceBundle, route });
    const reviewRoot = mkdtempSync(join(tmpdir(), "pipeline-e2e-readiness-host-"));
    let child;
    let report;
    try {
      const childPath = join(reviewRoot, "report-only-fixture.mjs");
      writeFileSync(childPath, [
        "import { readFileSync } from 'node:fs';",
        "const input = JSON.parse(readFileSync(0, 'utf8'));",
        "const report = { schema: 'pipeline.design-readiness-receipt.v1', dispatchId: input.dispatchId, runner: input.runner,",
        "candidate: input.candidate, sources: input.sources, outcome: 'ready-for-po-review', findings: [], unresolvedChoices: [],",
        "summary: 'Disposable local fixture report for one final PO review; no provider consultation or approval.' };",
        "process.stdout.write(JSON.stringify(report) + '\\n');",
      ].join("\n") + "\n");
      child = spawnSync(process.execPath, [childPath], { cwd: reviewRoot, encoding: "utf8", shell: false,
        input: JSON.stringify({ dispatchId: originalReadiness.dispatchId, runner: reviewRunner, candidate, sources, prompt }),
        timeout: 10_000, maxBuffer: 1024 * 1024 });
      assert.equal(child.error ?? null, null);
      assert.equal(child.signal, null);
      assert.equal(child.status, 0, child.stderr);
      report = JSON.parse(child.stdout);
      assert.equal(validateDesignReadinessModelOutput(report).valid, true);
      assert.deepEqual(candidateAtHead(cwd), candidate);
      for (const source of Object.values(sources)) assert.equal(createHash("sha256").update(readFileSync(join(cwd, source.path))).digest("hex"), source.sha256);
    } finally {
      rmSync(reviewRoot, { recursive: true, force: true });
    }
    const topology = resolvePoGateRepositoryTopology(cwd);
    const repoFingerprint = derivePoGateRepositoryFingerprint({ gitCommonDir: topology.gitCommonDir, primaryRoot: topology.primaryRoot });
    const receiptId = `drh_${createHash("sha256").update(`${cwd}\0${report.dispatchId}`).digest("hex").slice(0, 32)}`;
    const record = {
      schema: "pipeline.design-readiness-runner-host-receipt.v1", receiptId, runner: reviewRunner,
      repoFingerprint, dispatchId: report.dispatchId, candidate, sources, route,
      executableSha256: createHash("sha256").update(readFileSync(process.execPath)).digest("hex"),
      requestSha256: createHash("sha256").update(prompt).digest("hex"),
      responseSha256: createHash("sha256").update(child.stdout).digest("hex"),
      dutyReceiptSha256: designReadinessReportSha256(report),
      child: { started: true, exitCode: child.status, signal: child.signal, stdoutStatus: "complete", writeToolsObserved: false },
      createdAt: "2026-09-27T10:00:00.000Z",
    };
    const store = createDesignReadinessRunnerHostStore({ gitCommonDir: topology.gitCommonDir, repoFingerprint });
    const saved = store.write(record);
    const readiness = { ...report, hostExecution: { schema: "pipeline.design-readiness-host-execution.v1", runner: reviewRunner,
      repoFingerprint, selectionId: receiptId, selectionSha256: designReadinessRunnerSelectionSha256(record),
      executionReceiptSha256: saved.sha256, dutyReceiptSha256: record.dutyReceiptSha256, route } };
    const readinessBytes = Buffer.from(canonicalJson(readiness));
    writeFileSync(join(cwd, designPackage.readiness.path), readinessBytes);
    designPackage.readiness.sha256 = createHash("sha256").update(readinessBytes).digest("hex");
    writeFileSync(packageFile, canonicalJson(designPackage));
    const sourceBytes = Object.fromEntries(Object.entries(sources).map(([name, source]) => [name, { path: source.path, bytes: readFileSync(join(cwd, source.path)) }]));
    const checked = verifyDesignReadinessHostExecution({ repoRoot: cwd, hostExecution: readiness.hostExecution,
      readinessReceipt: readiness, candidate, sources, sourceBytes });
    assert.equal(checked.ok, true, JSON.stringify(checked));
    assert.equal(checked.assurance, "host-observed-local");
    if (runner === "antigravity") {
      const unavailableRoute = Object.fromEntries(["model", "effort", "sourceSha256", "candidateCommit"].map((key) => [key, requestedRoute[key]]));
      const unavailableHost = { ...readiness.hostExecution, runner: "antigravity", route: unavailableRoute };
      const refused = verifyDesignReadinessHostExecution({ repoRoot: cwd, hostExecution: unavailableHost,
        readinessReceipt: { ...readiness, runner: "antigravity", hostExecution: unavailableHost }, candidate, sources, sourceBytes });
      assert.equal(refused.ok, false);
      assert.equal(refused.code, "DWP-READINESS-HOST-ROUTE-MISMATCH",
        "the actual verifier must still reject a claimed AGY host on the unavailable duty");
      assert.deepEqual(candidateAtHead(cwd), candidate);
      assert.equal(sha256(fixtureGit(cwd, ["show", `${candidate.commit}:pipeline.user.yaml`])), requestedRoute.sourceSha256);
      testContext.diagnostic(`${runner}: readiness route negatives ${JSON.stringify({
        frozenDefaultSpoofRejected: true, unavailableHostCode: refused.code, committedPolicyUnchanged: true })}`);
    }
    testContext.diagnostic(`${runner}: canonical fixture readiness ${JSON.stringify({ reviewRunner, candidate, selectionId: receiptId, assurance: checked.assurance, providerAttestation: false })}`);
  };
  const readFixtureState = (cwd) => {
    const readback = readPipelineState(cwd);
    assert.equal(readback.status, "ok", JSON.stringify(readback));
    return readback.state;
  };
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
  const generatedArchitectureDraftSeen = new Set();
  const freshDriver = (cwd, runner, env, signerPrivateKey, beforePlanApproval = null) => {
    const designWorkflowDeps = {};
    const run = publicDriverRun(cwd, [], designWorkflowDeps);
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
      const preSubmission = run("node", [stateScript, "inspect"]);
      assert.equal(preSubmission.status, 0, preSubmission.stderr);
      const preSubmissionResult = JSON.parse(preSubmission.stdout);
      if (preSubmissionResult.nextAction?.kind === "architecture-design-required") {
        const beforeRefusal = readFixtureState(cwd);
        assert.equal(beforeRefusal.planSubmission, undefined, `${runner}: architecture authoring precedes submission`);
        const prdFile = join(cwd, preSubmissionResult.nextAction.prdPath);
        const generatedPrd = readFileSync(prdFile, "utf8");
        assert.match(generatedPrd, /## Captured material input/u,
          `${runner}: the generated PRD retains the original intake material before authoring`);
        const technicalSpecDigest = generatedPrd.match(/technical-spec-sha256\s*:\s*([a-f0-9]{64})/iu)?.[1];
        assert.match(technicalSpecDigest ?? "", /^[a-f0-9]{64}$/u,
          `${runner}: generation supplied the bound Spec digest without a fixture-side replacement`);
        const draftTemplate = renderArchitectureDesignSkeleton().trimEnd();
        const draftCount = generatedPrd.split(draftTemplate).length - 1;
        assert.ok(draftCount === 0 || draftCount === 1,
          `${runner}: generated PRD contains at most one exact reserved architecture template`);
        if (!generatedArchitectureDraftSeen.has(cwd)) {
          assert.equal(draftCount, 1, `${runner}: generation publishes the shared architecture draft before authoring`);
          generatedArchitectureDraftSeen.add(cwd);
        }
        const missingArchitecturePrd = stripGeneratedArchitectureTemplate(generatedPrd, { required: draftCount === 1 });
        assert.match(missingArchitecturePrd, /## Captured material input/u);
        assert.equal(missingArchitecturePrd.match(/technical-spec-sha256\s*:\s*([a-f0-9]{64})/iu)?.[1], technicalSpecDigest,
          `${runner}: stripping only the reserved draft template leaves the generated Spec binding untouched`);
        writeFileSync(prdFile, missingArchitecturePrd);
        const refusedSubmit = run("node", submittedArgv);
        assert.equal(refusedSubmit.status, 2, `${runner}: submit-plan rejects a missing architecture block`);
        assert.match(refusedSubmit.stderr, /ARCHITECTURE-DESIGN-PACKAGE-REQUIRED/u);
        const afterRefusal = readFixtureState(cwd);
        assert.equal(afterRefusal.planSubmission, undefined, `${runner}: rejection records no submission`);
        assert.equal(afterRefusal.planPresentation, undefined, `${runner}: rejection creates no presentation or signature request`);
        assert.equal(readFileSync(prdFile, "utf8"), missingArchitecturePrd,
          `${runner}: the failed submission leaves the stripped but otherwise intact generated PRD unchanged`);
        return { outcome: "unsupported-next-action", final: preSubmissionResult,
          nextAction: preSubmissionResult.nextAction, pendingAsks: [], stepsExecuted: 0 };
      }
      const submitted = run("node", submittedArgv);
      assert.equal(submitted.status, 0, submitted.stderr);
      const submission = readFixtureState(cwd).planSubmission;
      const designFixture = materializeTestDesignWorkflowPackage({
        root: cwd, featureId: submission.featureId,
        planPath: submission.planPath, specPath: submission.specPath,
        candidate: candidateAtHead(cwd),
        signerPrivateKey, signerKeyReference: "fixture-po-key",
      });
      bindFixtureReadiness(cwd, runner, designFixture);
      Object.assign(designWorkflowDeps, designFixture.deps);
      designWorkflowDeps.gitCandidate = () => ({ ok: true, ...candidateAtHead(cwd) });
      designWorkflowDeps.verifyDesignReadinessHostExecution = verifyDesignReadinessHostExecution;
      designWorkflowDeps.inspectArchitectureDesign = (rootDir, scope) => inspectArchitectureDesign(rootDir, scope, {
        gitCandidate: designWorkflowDeps.gitCandidate,
        verifyReadinessExecution: designWorkflowDeps.verifyDesignReadinessHostExecution,
      });
      const bootstrapPolicy = readCriticalHumanProofPolicy(cwd);
      assert.equal(bootstrapPolicy.ok, true);
      designWorkflowDeps.readCriticalHumanProofPolicy = () => bootstrapPolicy;
      const presentedArgv = [stateScript, "present-plan", "--by", "Greenfield E2E PO", "--design-workflow-package", designFixture.packagePath];
      const presented = run("node", presentedArgv);
      assert.equal(presented.status, 0, presented.stderr);
      const presentation = readFixtureState(cwd).planPresentation;
      designFixture.signRequest(presentation.designWorkflowApprovalRequestPath);
      if (typeof beforePlanApproval === "function") beforePlanApproval({ cwd, presentation, designFixture });
      const promotedState = readFixtureState(cwd);
      assert.equal(promotedState.bootstrapAcknowledgementRequired, undefined,
        `${runner}: epic/feature must not ask for a second pre-course PO signature`);
      const stagingPrd = readFileSync(join(cwd, submission.planPath), "utf8");
      assert.doesNotMatch(stagingPrd, /PO_GATE_PRD_ACKNOWLEDGEMENT/u,
        `${runner}: the staging document remains an unapproved draft before Advisor/readiness`);
      assert.equal(existsSync(join(cwd, designFixture.packagePath)), true,
        `${runner}: the complete reviewed package is the final approval subject`);
      designWorkflowDeps.isattyFn = () => true;
      designWorkflowDeps.readLineFn = () => `approve-${presentation.designWorkflowPackageSha256.slice(0, 12)}`;
      const approvedArgv = [
        stateScript, "approve-plan",
        "--design-workflow-approval-request", presentation.designWorkflowApprovalRequestPath,
      ];
      const approved = run("node", approvedArgv);
      assert.equal(approved.status, 0, approved.stderr);
      const reentered = driveOnboardingInit({ rootDir: cwd, runner, run, env });
      driven = {
        ...reentered,
        designWorkflowDeps,
        steps: [
          ...driven.steps,
          { executable: "node", argv: submittedArgv, exitCode: submitted.status, faultCode: null },
          { executable: "node", argv: presentedArgv, exitCode: presented.status, faultCode: null },
          { executable: "node", argv: approvedArgv, exitCode: approved.status, faultCode: null },
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
      const path = greenfieldRoot();
      const home = root();
      const source = hostVisibleFixtureRoot();
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

      const originalRequest = "Build a locally playable mini HTML game.\nNo external dependencies.\n";
      const originalBytes = Buffer.from(originalRequest, "utf8");
      const originalSha256 = sha256(originalBytes);
      const originalFile = join(path, "scratch", "onboarding-intake.txt");
      const assertCapturedOriginal = () => {
        const held = readOnboardingIntakeCheckpoint({ rootDir: path });
        assert.equal(held.status, "present", `${runner}: original material needs a canonical checkpoint`);
        assert.equal(held.value.root, path);
        assert.equal(held.value.consent?.granted, true, `${runner}: description capture requires explicit prior consent`);
        assert.equal(new Date(held.value.consent.at).toISOString(), held.value.consent.at);
        assert.equal(held.value.materialInput.length, 1, `${runner}: the first description is captured once`);
        const entry = held.value.materialInput[0];
        assert.equal(entry.sha256, originalSha256);
        assert.equal(entry.byteLength, originalBytes.length);
        assert.equal(entry.evidencePath, `intake-checkpoint-evidence/${originalSha256}.txt`);
        assert.ok(Date.parse(entry.receivedAt) >= Date.parse(held.value.consent.at));
        const evidenceFile = join(held.paths.directory, entry.evidencePath);
        const evidenceInfo = lstatSync(evidenceFile);
        assert.equal(evidenceInfo.isFile() && !evidenceInfo.isSymbolicLink(), true);
        assert.deepEqual(readFileSync(evidenceFile), originalBytes);
        const material = readOnboardingIntakeMaterialInput({ rootDir: path });
        assert.equal(material.status, "present");
        assert.equal(material.chunks.length, 1);
        assert.deepEqual(material.chunks[0], { sha256: originalSha256, byteLength: originalBytes.length,
          receivedAt: entry.receivedAt, text: originalRequest });
        assert.deepEqual(readFileSync(originalFile), originalBytes, `${runner}: the supplied source remains byte-exact`);
        assert.equal(held.value.values.language, "en");
        assert.equal(held.value.values.profile, "feature");
        return held;
      };
      const assertConsentInputs = (action) => {
        const held = readOnboardingIntakeCheckpoint({ rootDir: path });
        assert.equal(held.status === "absent" || held.value.consent === null, true,
          `${runner}: this returned action requests consent before capturing material`);
        assert.equal(held.status === "absent" || held.value.materialInput.length === 0, true);
        const argv = action.applyAction.argv;
        assert.equal(argv[1], "intake-consent-apply");
        assert.equal(argv.includes("--granted"), true);
        assert.equal(argv.includes("--text-file"), runner !== "claude");
        assert.equal(argv.includes("--text-turn-ref"), false);
        assert.deepEqual(action.inputs.map((input) => input.name), runner === "claude"
          ? ["language", "profile"]
          : ["language", "profile", "projectDescription"]);
      };

      let first = freshDriver(path, runner, env, privateKey);
      if (runner === "codex" && first.outcome === "collect-input") {
        assert.deepEqual(first.collectInput.inputs.map((input) => input.name), ["gitAuthorName", "gitAuthorEmail", "language", "profile", "projectDescription"]);
        assert.equal(first.collectInput.applyAction.argv.includes("scratch/onboarding-intake.txt"), true);
        mkdirSync(join(path, "scratch"), { recursive: true });
        writeFileSync(originalFile, originalBytes);
        const firstIntake = invokeAction(first.collectInput.applyAction, new Map([
          ["<PO_INTAKE_GIT_AUTHOR_NAME>", "Greenfield E2E PO"],
          ["<PO_INTAKE_GIT_AUTHOR_EMAIL>", "greenfield-e2e@example.invalid"],
          ["<PO_INTAKE_LANGUAGE>", "en"],
          ["<PO_INTAKE_PROFILE>", "feature"],
        ]), path, env);
        assert.equal(firstIntake.json.status, "applied", JSON.stringify(firstIntake.json));
        assertCapturedOriginal();
        first = freshDriver(path, runner, env, privateKey);
      }
      assert.equal(first.outcome, "pending-asks", `${runner}: ${JSON.stringify(first)}`);
      assert.equal(first.pendingAsks.length, 1, `${runner}: initial PO round must be one action`);
      const initialAsk = first.pendingAsks[0];
      assert.equal(initialAsk.applyAction?.kind, "command");
      assert.deepEqual(initialAsk.inputs.map((input) => input.name), runner === "codex"
        ? ["gitAuthorName", "gitAuthorEmail", "humanApprovalMode", "advisorExportConsent"]
        : ["gitAuthorName", "gitAuthorEmail", "humanApprovalMode", "advisorExportConsent", "language"]);
      const initial = invokeAction(initialAsk.applyAction, new Map([
        ["<PO_GIT_AUTHOR_NAME>", "Greenfield E2E PO"],
        ["<PO_GIT_AUTHOR_EMAIL>", "greenfield-e2e@example.invalid"],
        ["<signature|chat>", "signature"],
        ["<approved|declined>", "declined"],
        ["<de|en>", "en"],
      ]), path, env);
      assert.equal(initial.json.initialAnswers?.code, "INITIAL-ANSWERS-APPLIED", `${runner}: ${JSON.stringify(initial.json)}`);
      assert.equal(initial.json.initialAnswers?.trustAnchor, "not-requested");
      const answersPath = join(path, ".git", "agent-pipeline", "onboarding-initial-answers.json");
      const answersBytes = readFileSync(answersPath, "utf8");
      const heldInitialAnswers = JSON.parse(answersBytes);
      assert.equal(heldInitialAnswers.root, path);
      assert.equal(heldInitialAnswers.gitAuthorName, "Greenfield E2E PO");
      assert.equal(heldInitialAnswers.gitAuthorEmail, "greenfield-e2e@example.invalid");
      assert.equal(heldInitialAnswers.language, "en");
      assert.equal(heldInitialAnswers.advisorExportConsent, "declined");
      assert.equal(fixtureGitConfig.has(`${path}\u0000user.name`), false);
      assert.equal(fixtureGitConfig.has(`${path}\u0000user.email`), false);
      const readback = run(onboarding, ["inspect", "--root", path, "--runner", runner], path);
      assert.equal(readback.status, 0, readback.stdout);
      const authorFields = (readback.json.authorIdentityAction?.inputs ?? []).map((input) => input.name);
      assert.equal(authorFields.includes("gitAuthorName"), false, `${runner}: complete receipt suppresses name re-ask`);
      assert.equal(authorFields.includes("gitAuthorEmail"), false, `${runner}: complete receipt suppresses email re-ask`);
      assert.equal(existsSync(answersPath), true);
      const initialPolicy = readFileSync(join(path, "pipeline.user.yaml"), "utf8");
      assert.match(initialPolicy, /^\s*human_approval:\s*"signature"\s*$/mu,
        `${runner}: initial decision records the shared human-approval policy`);
      assert.match(initialPolicy, /^\s*push_approval:\s*"signature"\s*$/mu,
        `${runner}: push remains aligned with the shared policy for existing push consumers`);
      assert.ok(initial.json.steps.some((step) => step.argv[0] === onboarding && step.argv[1] === "inspect"),
        `${runner}: the returned onboarding-init action must re-enter through its public inspect driver`);
      const anchorAsk = initial.json.pendingAsks?.find((ask) => ask.inputs?.some((input) => input.name === "trustAnchorSetupMode"))
        ?? freshDriver(path, runner, env, privateKey).pendingAsks?.find((ask) => ask.inputs?.some((input) => input.name === "trustAnchorSetupMode"));
      assert.ok(anchorAsk, `${runner}: signature re-entry reaches the separate trust-anchor action`);
      assert.equal(anchorAsk.applyAction.argv.includes("--push-approval"), false);
      const anchored = invokeAction(anchorAsk.applyAction, new Map([
        ["<existing|new>", "existing"],
        ["<absolute external key directory>", destination],
        ["<human attribution>", "Greenfield E2E PO"],
        ["<absolute existing key path|none>", existingKey],
      ]), path, env);
      assert.equal(anchored.json.bootstrap?.code, "TRUST-ANCHOR-BOOTSTRAP-COMPLETE");
      const proofPolicy = readCriticalHumanProofPolicy(path);
      assert.equal(proofPolicy.ok, true, `${runner}: ${JSON.stringify(proofPolicy)}`);

      if (runner === "codex") {
        const restart = anchored.json.final?.nextAction;
        assert.equal(anchored.json.outcome, "unsupported-next-action", JSON.stringify(anchored.json));
        assert.equal(restart?.kind, "restart-process");
        assert.equal(restart.launch?.argv?.[0]?.endsWith("codex-onboarding-launch.mjs"), true);
        assert.deepEqual(restart.launch.argv.slice(1, 3), ["--root", "."]);
        const prescribedReadback = evaluateLifecycleReadyGuard({
          tool_name: "Bash",
          tool_input: { command: `node '${resumeHint}' inspect --root '${path}'` },
        }, { projectDir: path, runner: "codex" });
        assert.deepEqual(prescribedReadback, { exitCode: 0, stderr: "" },
          "codex: restart-required must admit the prescribed resume-hint readback");
        // The returned restart action is asserted above. Complete its
        // readback handshake through the same in-process host seam used by
        // the other lifecycle tests; the launcher process contract is
        // exercised independently in codex-onboarding-launch.test.mjs.
        completeRuntimeReadback(path, 80_000);
      } else {
        // The complete root-bound initial-answer receipt already holds the
        // author values, so after anchoring the driver may expose the real
        // remaining intake request directly rather than wrapping it as a
        // second author-related pending-asks envelope.
        assert.equal(anchored.json.outcome, "collect-input", `${runner}: ${JSON.stringify(anchored.json)}`);
        assertConsentInputs(anchored.json.collectInput);
      }

      let intake = freshDriver(path, runner, env, privateKey);
      assert.equal(intake.outcome, "collect-input", `${runner}: ${JSON.stringify(intake)}`);
      if (runner === "codex" && intake.collectInput.input?.name === "answersJson") {
        // Codex's portable-seed route reaches the explicit intake-consent
        // action before initial-answer collection; the description was
        // already supplied through that returned action above.
        assertCapturedOriginal();
      } else {
        assertConsentInputs(intake.collectInput);
        assert.equal(intake.collectInput.applyAction.argv.includes("--git-author-name"), false);
        if (runner !== "claude") {
          mkdirSync(join(path, "scratch"), { recursive: true });
          writeFileSync(originalFile, originalBytes);
        }
        const consented = invokeAction(intake.collectInput.applyAction, new Map([
          ["<PO_INTAKE_LANGUAGE>", "en"],
          ["<PO_INTAKE_PROFILE>", "feature"],
        ]), path, env);
        assert.equal(consented.json.status, "applied", JSON.stringify(consented.json));
        if (runner === "claude") {
          const consent = readOnboardingIntakeCheckpoint({ rootDir: path });
          assert.equal(consent.status, "present");
          assert.equal(consent.value.consent?.granted, true);
          assert.equal(consent.value.transactionState, "collecting");
          assert.deepEqual(consent.value.materialInput, [],
            "claude: a consent-only action must not satisfy description readiness");
          const captureAsk = freshDriver(path, runner, env, privateKey);
          assert.equal(captureAsk.outcome, "collect-input", JSON.stringify(captureAsk));
          assert.equal(captureAsk.collectInput.input.name, "textTurnRef");
          assert.equal(captureAsk.collectInput.applyAction.argv.includes("--text-turn-ref"), true);
          // This fixture has no trusted native event reference. Supply the
          // still-required explicit description once through the returned
          // regular-file fallback, preserving source bytes and their digest.
          mkdirSync(join(path, "scratch"), { recursive: true });
          assert.equal(existsSync(originalFile), false);
          writeFileSync(originalFile, originalBytes);
          assert.equal(lstatSync(originalFile).isFile(), true);
          const captureAction = captureAsk.collectInput.existingFileApplyAction;
          assert.equal(captureAction.argv[1], "intake-capture-apply");
          assert.equal(captureAction.argv.includes("--text-turn-ref"), false);
          assert.equal(captureAction.argv.includes("--text-file-sha256"), true);
          const captured = invokeAction(captureAction, new Map([
            ["<existing-repository-file>", "scratch/onboarding-intake.txt"],
            ["<sha256-of-existing-file>", originalSha256],
          ]), path, env);
          assert.equal(captured.json.schema, "pipeline.onboarding-intake-capture-apply.v1");
          assert.equal(captured.json.root, path);
          assert.equal(captured.json.mutated, true);
          assert.deepEqual(captured.json.evidence, { sha256: originalSha256, byteLength: originalBytes.length, wrote: true });
          assert.deepEqual(captured.json.checkpoint, readOnboardingIntakeCheckpoint({ rootDir: path }).value);
        }
        assertCapturedOriginal();
      }
      const heldOriginal = assertCapturedOriginal();
      assert.equal(heldOriginal.value.transactionState, "design-questions-pending");
      testContext.diagnostic(`${runner}: verified original intake ${JSON.stringify({ sha256: originalSha256,
        byteLength: originalBytes.length, consentGranted: true, captureRoute: runner === "claude"
          ? "returned-existing-file-after-separate-consent" : "returned-consent-with-explicit-description", nativeReference: false })}`);

      // Capture the greenfield request before its first commit can make the
      // repository appear populated. Snapshot only bootstrap support, before
      // Feature activation, through both installed enforcing Git hooks.
      const bootstrapState = readPipelineState(path);
      assert.equal(bootstrapState.state?.activeFeature?.id ?? null, null,
        `${runner}: the bootstrap snapshot precedes Feature activation`);
      assert.equal(existsSync(join(path, "game.js")), false);
      const bootstrapPaths = fixtureGit(path, ["ls-files", "--cached", "--others", "--exclude-standard", "-z"])
        .split("\0").filter(Boolean);
      const bootstrapCandidate = commitFixturePaths(path, [...new Set(bootstrapPaths)],
        "test: snapshot greenfield onboarding support", "stage-0");
      testContext.diagnostic(`${runner}: real hooked bootstrap candidate ${JSON.stringify(bootstrapCandidate)}`);

      intake = freshDriver(path, runner, env, privateKey);
      assert.equal(intake.outcome, "collect-input", `${runner}: ${JSON.stringify(intake)}`);
      assert.equal(intake.collectInput.input.name, "answersJson");
      const answers = JSON.stringify([
        { question: "Primary goal?", answer: "A keyboard-playable local game." },
        { question: "Verification?", answer: "Run the repository verify script." },
      ]);
      invokeAction(intake.collectInput.applyAction, new Map([
        ["<PO_INTAKE_DESIGN_ANSWERS_JSON>", answers],
      ]), path, env);

      // Applying the answers leaves initialization on the returned driver
      // chain. Advance that chain to its explicit architecture authoring stop
      // before observing the state and generated PRD it actually materializes.
      const architectureAuthoring = freshDriver(path, runner, env, privateKey);
      assert.equal(architectureAuthoring.outcome, "unsupported-next-action",
        `${runner}: the returned driver stops for architecture authoring ${JSON.stringify(architectureAuthoring)}`);
      const architectureAuthoringAction = architectureAuthoring.final?.nextAction;
      assert.deepEqual({ kind: architectureAuthoringAction?.kind, code: architectureAuthoringAction?.code },
        { kind: "repair-required", code: "ARCHITECTURE-DESIGN-AUTHORING-INCOMPLETE" },
        `${runner}: returned architecture authoring readback ${JSON.stringify(architectureAuthoring)}`);
      assert.equal(architectureAuthoring.final.status, "draft");
      assert.equal(architectureAuthoring.final.planApproved, false);
      assert.deepEqual(architectureAuthoring.final.lifecycle,
        { ok: true, code: "PLAN-LIFECYCLE-CURRENT", status: "draft" },
        `${runner}: the unfinished architecture draft is anchored to the current lifecycle`);
      assert.equal(architectureAuthoring.steps.some((step) => ["submit-plan", "present-plan", "approve-plan"].includes(step.argv[1])), false,
        `${runner}: authoring is reached without an early submission, presentation or PO signature`);
      const architectureInspectStep = architectureAuthoring.steps.at(-1);
      assert.equal(architectureInspectStep?.argv?.[1], "inspect");
      const stateScript = architectureInspectStep.argv[0];
      assert.equal(stateScript.endsWith("pipeline-state.mjs"), true);
      const stateDriver = publicDriverRun(path, []);
      const beforeArchitectureSubmission = readFixtureState(path);
      assert.equal(beforeArchitectureSubmission.planSubmission, undefined,
        `${runner}: architecture is authored before plan submission`);
      assert.equal(beforeArchitectureSubmission.planPresentation, undefined,
        `${runner}: architecture authoring creates no presentation or signature request`);
      const prdPath = beforeArchitectureSubmission.activeFeature?.planPath;
      assert.equal(typeof prdPath, "string", "the initialized design state names its exact generated PRD");
      assert.equal(prdPath, architectureAuthoring.final.activeFeature?.planPath,
        `${runner}: the canonical state names the PRD anchored by the returned authoring readback`);
      const prdFile = join(path, prdPath);
      assert.equal(existsSync(prdFile), true, "the named generated PRD exists before it may be edited");
      const generatedPrdBeforeRefusal = readFileSync(prdFile, "utf8");
      assert.match(generatedPrdBeforeRefusal, /## Captured material input/u,
        `${runner}: the pre-submit refusal fixture retains the original intake material`);
      const refusalSpecDigest = generatedPrdBeforeRefusal.match(/technical-spec-sha256\s*:\s*([a-f0-9]{64})/iu)?.[1];
      assert.match(refusalSpecDigest ?? "", /^[a-f0-9]{64}$/u,
        `${runner}: the generated PRD already carries its Spec binding`);
      const untouchedDraftSubmit = stateDriver(architectureInspectStep.executable,
        [stateScript, "submit-plan", "--by", "Greenfield E2E PO", "--profile", "feature"]);
      assert.equal(untouchedDraftSubmit.status, 2,
        `${runner}: submit-plan rejects the untouched reserved architecture draft`);
      assert.match(untouchedDraftSubmit.stderr, /ARCHITECTURE-DESIGN-AUTHORING-INCOMPLETE/u);
      const afterUntouchedDraftSubmission = readFixtureState(path);
      assert.equal(afterUntouchedDraftSubmission.planSubmission, undefined,
        `${runner}: the untouched draft rejection records no submission`);
      assert.equal(afterUntouchedDraftSubmission.planPresentation, undefined,
        `${runner}: the untouched draft rejection creates no presentation or signature request`);
      assert.equal(readFileSync(prdFile, "utf8"), generatedPrdBeforeRefusal,
        `${runner}: rejection leaves the generated architecture draft unchanged`);
      const missingArchitecturePrd = stripGeneratedArchitectureTemplate(generatedPrdBeforeRefusal, { required: true });
      assert.equal(missingArchitecturePrd.match(/technical-spec-sha256\s*:\s*([a-f0-9]{64})/iu)?.[1], refusalSpecDigest,
        `${runner}: removing only the reserved draft leaves the generated Spec digest intact`);
      writeFileSync(prdFile, missingArchitecturePrd);
      const refusedSubmit = stateDriver(architectureInspectStep.executable,
        [stateScript, "submit-plan", "--by", "Greenfield E2E PO", "--profile", "feature"]);
      assert.equal(refusedSubmit.status, 2, `${runner}: submit-plan refuses the now-missing architecture block`);
      assert.match(refusedSubmit.stderr, /ARCHITECTURE-DESIGN-PACKAGE-REQUIRED/u);
      const afterRefusedSubmission = readFixtureState(path);
      assert.equal(afterRefusedSubmission.planSubmission, undefined, `${runner}: refusal records no submission`);
      assert.equal(afterRefusedSubmission.planPresentation, undefined, `${runner}: refusal creates no presentation or signature request`);
      assert.equal(readFileSync(prdFile, "utf8"), missingArchitecturePrd,
        `${runner}: refusal leaves the stripped but otherwise intact PRD unchanged`);
      assert.equal(existsSync(join(path, "architecture/baseline.json")), false);
      const contract = "docs/game-contract.md";
      const verification = "tests/game.test.mjs";
      mkdirSync(join(path, "docs"), { recursive: true });
      mkdirSync(join(path, "tests"), { recursive: true });
      writeFileSync(join(path, contract), "# Game contract\nExport playable=true from game.js after keyboard interaction is implemented.\n");
      writeFileSync(join(path, verification), "import assert from 'node:assert/strict';\nimport { playable } from '../game.js';\nassert.equal(playable, true);\n");
      const module = { id: "game", responsibility: "Local keyboard game and its acceptance contract.", nonResponsibilities: ["Network services"],
        ownedPaths: ["game.js", "docs/game-contract.md", "tests/game.test.mjs"], publicContracts: [contract], allowedDependencies: [],
        authorityEffects: [], verificationEntryPoints: [verification], adrReferences: [] };
      const architecture = { schema: "pipeline.architecture-design.v1", repositoryKind: "greenfield",
        disposition: { decision: "approved-scoped", scope: ["specs/", "architecture/", "game.js", "docs/game-contract.md", "tests/game.test.mjs"],
          rationale: "Approve this explicit local game design within the same complete PRD decision." },
        modules: [module], implementationSurface: ["game.js"],
        fitnessModel: { schema: "pipeline.fitness-model.v1", profileId: "local-game", revision: 1,
          modules: [{ id: module.id, ownedPaths: module.ownedPaths, allowedDependencies: [], authorityEffects: [], verificationEntryPoints: [verification] }],
          allowedBoundaryCrossings: [], antiFragmentationPolicy: { rejectTrivialFacades: true, rejectDuplicatedFacades: true, minStatementsPerModule: 1 } },
        baseline: { schema: "pipeline.architecture-baseline.v1", baselineRevision: 1, acceptedViolations: [],
          ratchetMetrics: { totalAcceptedViolations: 0, cycleCount: 0, boundaryCrossingsCount: 0 } } };
      const generatedPrdBeforeAuthoring = readFileSync(prdFile, "utf8");
      const generatedSpecDigest = generatedPrdBeforeAuthoring.match(/technical-spec-sha256\s*:\s*([a-f0-9]{64})/iu)?.[1];
      assert.match(generatedSpecDigest ?? "", /^[a-f0-9]{64}$/u,
        `${runner}: final authoring starts from the generated PRD's existing Spec binding`);
      assert.match(generatedPrdBeforeAuthoring, /## Captured material input/u,
        `${runner}: authoring preserves the complete original intake section`);
      const authoringBase = stripGeneratedArchitectureTemplate(generatedPrdBeforeAuthoring);
      assert.match(authoringBase, /## Captured material input/u);
      assert.equal(authoringBase.match(/technical-spec-sha256\s*:\s*([a-f0-9]{64})/iu)?.[1], generatedSpecDigest,
        `${runner}: authoring does not replace the generated Spec hash with a fixture constant`);
      const authoredArchitectureBlock = "```pipeline-architecture-design\n" + JSON.stringify(architecture, null, 2) + "\n```\n";
      writeFileSync(prdFile, authoringBase + "\n" + authoredArchitectureBlock);
      const authoredPrd = readFileSync(prdFile, "utf8");
      assert.equal((authoredPrd.match(/```pipeline-architecture-design/gu) ?? []).length, 1,
        `${runner}: the authored PRD replaces the reserved draft with exactly one architecture block`);
      assert.doesNotMatch(authoredPrd, /DRAFT TEMPLATE|REPLACE:/u,
        `${runner}: final authoring removes the reserved template markers before approval`);
      assert.equal(authoredPrd.match(/technical-spec-sha256\s*:\s*([a-f0-9]{64})/iu)?.[1], generatedSpecDigest);
      const sourceBase = dirname(prdPath);
      const featureId = beforeArchitectureSubmission.activeFeature.id;
      const fixtureSources = [
        [`${sourceBase}/design-input.md`, `Original request for ${featureId}.\n`],
        [`${sourceBase}/design.md`, `Revised design for ${featureId}.\n`],
        [`${sourceBase}/traceability.md`, `Requirements for ${featureId} are mapped.\n`],
      ];
      for (const [relativePath, bytes] of fixtureSources) writeFileSync(join(path, relativePath), bytes);
      const designSourcePaths = [fixtureSources[0][0], prdPath, `${sourceBase}/spec.md`, fixtureSources[1][0], fixtureSources[2][0]];
      const beforeSourceCommit = readFixtureState(path);
      assert.equal(beforeSourceCommit.planApproved, false);
      assert.equal(beforeSourceCommit.planSubmission, undefined);
      assert.equal(beforeSourceCommit.planPresentation, undefined);
      assert.equal(existsSync(join(path, "game.js")), false);
      const designCandidate = commitFixturePaths(path, designSourcePaths,
        "test: commit authored greenfield design sources", "stage-0");
      for (const relativePath of designSourcePaths) {
        assert.equal(fixtureGit(path, ["show", `${designCandidate.commit}:${relativePath}`]), readFileSync(join(path, relativePath), "utf8"),
          `${runner}: each source is present byte-for-byte in the real design candidate`);
      }
      testContext.diagnostic(`${runner}: real hooked five-source design candidate ${JSON.stringify(designCandidate)}`);
      const productProbe = () => {
        const verdict = devPlanGateVerdict({ filePath: "game.js", projectDir: path });
        return {
          status: verdict.verdict === "block" ? 2 : verdict.verdict === "warn" ? 1 : 0,
          stderr: verdict.reason ?? "",
        };
      };

      // Complete the authored package through the public driver. The late
      // legacy advisory diagnostic below is independent and cannot revoke
      // the separately signed final design-workflow approval.
      const preApproval = freshDriver(path, runner, env, privateKey, () => {
        assert.equal(productProbe().status, 2,
          `${runner}: implementation is blocked before the single final approve-plan transition`);
      });
      const preState = readFixtureState(path);
      assert.equal(preApproval.outcome, "ready", `${runner}: the final design-workflow approval must complete the lifecycle ${JSON.stringify(preApproval)}`);
      assert.equal(preState.planApproved, true);
      assert.equal(preState.activeFeature.phase, "implementation");
      assert.equal(preState.planApproval?.schema, "pipeline.plan-approval.v7");
      assert.equal(preState.planApproval?.poGateAuthority?.planPath, preState.activeFeature.planPath);
      assert.match(preState.planPresentation?.designWorkflowPackageSha256 ?? "", /^[a-f0-9]{64}$/u);
      assert.deepEqual(candidateAtHead(path), designCandidate,
        `${runner}: final approval remains bound to the committed five-source candidate`);
      testContext.diagnostic(`${runner}: real lifecycle gate after final approval ${JSON.stringify(productProbe())}`);

      let advisoryBridgeCalls = 0;
      const advisory = await coordinateDesignAdvisory({
        repoRoot: path,
        runtime: { runner, profile: "feature" },
        featureId: preState.activeFeature.id,
        planPath: preState.activeFeature.planPath,
        specPath: preState.planSubmission.specPath,
        disposition: { decision: "accept", rationale: "The independent design review is bounded and accepted." },
        invokeBridge: async ({ receiptPath, input }) => {
          advisoryBridgeCalls += 1;
          const selector = { kind: "model-id", value: runner === "claude" ? "claude-sonnet" : runner === "antigravity" ? "gemini-3-flash" : "gpt-5.6-sol" };
          const receipt = { schema: "pipeline.advisory-receipt.v1", receiptId: input.receiptId,
            dispatch: structuredClone(input.dispatch), duty: "advisory", profile: input.profile,
            configuredRoute: { runner, selector, effort: "high" }, adapter: "consult",
            observed: { status: "answered", identity: { provider: runner === "claude" ? "anthropic" : runner === "antigravity" ? "google" : "openai", modelId: selector.value, effort: "high" } },
            questionSha256: createHash("sha256").update(input.question).digest("hex"),
            answerSha256: createHash("sha256").update("Use a bounded review.").digest("hex"),
            fallback: { reason: "none", redactedErrorClass: null }, emittedAtMs: 1 };
          writeFileSync(receiptPath, JSON.stringify(receipt) + "\n", { mode: 0o600 });
          return 0;
        },
      });
      if (runner === "codex") {
        assert.equal(advisory.status, "unavailable-pending-final-approval");
        assert.equal(advisory.write, null);
        assert.equal(advisory.readback, null);
        assert.equal(advisory.routeSelection.code, "advisor-repository-export-declined");
        assert.equal(advisoryBridgeCalls, 0, "Codex with declined export consent must not invoke the legacy bridge");
        const privateReceipt = JSON.parse(readFileSync(advisory.bridge.target, "utf8"));
        const privateRoute = JSON.parse(readFileSync(advisory.routeSelection.path, "utf8"));
        assert.equal(privateReceipt.observed.status, "permission-denied");
        assert.equal(privateReceipt.observed.identity, null);
        assert.equal(privateReceipt.answerSha256, null);
        assert.equal(privateRoute.childStarted, false);
        assert.equal(privateRoute.attemptCount, 0);
        const afterLegacyDiagnostic = readFixtureState(path);
        assert.deepEqual(afterLegacyDiagnostic.planApproval, preState.planApproval,
          `${runner}: the late legacy diagnostic cannot revoke or replace the already-approved design package`);
        assert.equal(afterLegacyDiagnostic.planApproved, preState.planApproved);
        assert.equal(afterLegacyDiagnostic.activeFeature.phase, preState.activeFeature.phase);
      } else {
        assert.equal(advisory.status, "admitted", `${runner}: the legacy advisory receipt contract`);
      }

      const postApproval = freshDriver(path, runner, env, privateKey);
      const approval = {
        ...postApproval,
        steps: [...preApproval.steps, ...postApproval.steps],
      };
      assert.equal(approval.outcome, "ready", `${runner}: ${JSON.stringify(approval)}`);
      assert.equal(approval.final.status, "ready");
      const planSteps = approval.steps.map((step) => step.argv);
      assert.equal(planSteps.some((argv) => argv[1] === "plan-runner-permissions" || argv[1] === "apply-runner-permissions"), false,
        `${runner}: optional preauthorization must not enter the required lifecycle driver`);
      assert.ok(planSteps.some((argv) => argv[0]?.endsWith("pipeline-state.mjs") && argv[1] === "inspect"),
        `${runner}: ready must enter the returned public pipeline-state inspect driver`);
      assert.ok(planSteps.some((argv) => argv[1] === "submit-plan"),
        `${runner}: the returned inspect chain must execute submit-plan`);
      assert.ok(planSteps.some((argv) => argv[1] === "present-plan"),
        `${runner}: the returned inspect chain must execute present-plan`);
      assert.ok(planSteps.some((argv) => argv[1] === "approve-plan"
        && argv.includes("--design-workflow-approval-request")
        && !argv.includes("--bootstrap-acknowledgement-receipt")),
      `${runner}: the Epic/Feature approval must consume its signed design-workflow request without a bootstrap receipt`);
      assert.equal(planSteps.some((argv) => argv[1] === "approve-plan" && argv.includes("--by")), false,
        `${runner}: signature mode must not regress to the legacy --by approval route`);
      assert.equal(planSteps.filter((argv) => argv[1] === "approve-plan").length, 1,
        `${runner}: the authored design package receives exactly one downstream PO signature transition`);
      const state = readFixtureState(path);
      assert.equal(state.planApproved, true, `${runner}: the receipt must complete the one approved transition`);
      assert.equal(state.activeFeature.phase, "implementation");
      const inspectApprovedDesign = () => inspectArchitectureDesign(path, state.activeFeature.planPath, {
        gitCandidate: preApproval.designWorkflowDeps.gitCandidate,
        verifyReadinessExecution: preApproval.designWorkflowDeps.verifyDesignReadinessHostExecution,
      });
      const approvedDesign = inspectApprovedDesign();
      assert.equal(approvedDesign.ok, true, JSON.stringify(approvedDesign));
      assert.equal(approvedDesign.disposition, "approved-scoped");
      assert.ok(planSteps.some(argv => argv[1] === "materialize-architecture"));
      assert.equal(existsSync(join(path, "architecture/design-materialization.json")), true);
      testContext.diagnostic(`${runner}: returned-action architecture authoring and one signed final design approval passed`);
      assert.equal(existsSync(join(path, "architecture/adoption-state.json")), false,
        "The explicit disposition belongs to the approved PRD; no second approval is fabricated");
      const activePrd = join(path, state.activeFeature.planPath);
      const approvedBytes = readFileSync(activePrd, "utf8");
      writeFileSync(activePrd, approvedBytes + "\nUnapproved architecture change.\n");
      assert.equal(inspectApprovedDesign().ok, false, "PRD drift revokes architecture authority immediately");
      const staleApprovedInspect = run(onboarding, ["inspect", "--root", path, "--runner", runner], path,
        preApproval.designWorkflowDeps);
      assert.equal(staleApprovedInspect.status, 0, staleApprovedInspect.stdout);
      assert.ok(staleApprovedInspect.json.nextAction, JSON.stringify(staleApprovedInspect.json));
      assert.equal(staleApprovedInspect.json.nextAction.kind, "collect-input");
      assert.ok(staleApprovedInspect.json.nextAction.applyAction.argv.includes("reopen-design"),
        `${runner}: invalid already-approved architecture must be explicitly reopened before PRD edits`);
      assert.equal(readFixtureState(path).planApproved, true,
        `${runner}: read-only stale-design guidance does not silently revoke the approval`);
      writeFileSync(activePrd, approvedBytes);
      const receiptPath = join(path, "architecture/design-materialization.json");
      const receiptBytes = readFileSync(receiptPath, "utf8");
      writeFileSync(receiptPath, receiptBytes.replace('"designSha256": "', '"designSha256": "changed-'));
      assert.equal(inspectApprovedDesign().code, "ARCHITECTURE-DESIGN-RECEIPT-STALE");
      writeFileSync(receiptPath, receiptBytes);
      const deferredDesign = inspectApprovedDesign();
      assert.equal(deferredDesign.status, "materialized");
      assert.ok(deferredDesign.pendingPhysicalSurfaces.includes("game.js"),
        `${runner}: approved design authority must leave the uncreated implementation surface pending`);
      assert.equal(Object.hasOwn(deferredDesign, "fitness"), false,
        `${runner}: materialization does not claim architecture fitness before implementation exists`);

      const externalInventory = evaluateLifecycleReadyGuard({
        tool_name: "Bash",
        tool_input: { command: `ls -1 '${source}'` },
      }, { projectDir: path, runner });
      assert.equal(externalInventory.exitCode, 0,
        `${runner}: names-only passive inventory remains available in the supported host-visible root`);
      assert.equal(existsSync(existingKey), true,
        `${runner}: the external fixture contains a private key whose contents remain protected`);
      const externalSecretRead = evaluateLifecycleReadyGuard({
        tool_name: "Bash",
        tool_input: { command: `cat '${existingKey}'` },
      }, { projectDir: path, runner });
      assert.equal(externalSecretRead.exitCode, 2,
        `${runner}: names-only inventory must not authorize reading private key contents`);
      const projectInventory = evaluateLifecycleReadyGuard({
        tool_name: "Bash",
        tool_input: { command: "ls -1 project" },
      }, { projectDir: path, runner });
      assert.deepEqual(projectInventory, { exitCode: 0, stderr: "" },
        `${runner}: names-only passive inventory of the project remains available`);

      const implementing = approval;
      assert.equal(implementing.outcome, "ready", `${runner}: ${JSON.stringify(implementing)}`);
      assert.equal(implementing.final.status, "ready");
      assert.equal(implementing.final.nextAction, null);
      if (runner === "claude") {
        assert.equal(implementing.final.runnerPermissions.status, "pending-runtime-initialization");
        assert.equal(implementing.final.runnerPermissions.optionalPlan.argv[1], "plan-runner-permissions");
      }
      const admitted = productProbe();
      assert.equal(admitted.status, 0, `${runner}: ${admitted.stderr}`);
      writeFileSync(join(path, "game.js"), "export const playable = true;\n");
      const completedDesign = inspectApprovedDesign();
      assert.equal(completedDesign.status, "materialized");
      assert.equal(completedDesign.pendingPhysicalSurfaces.includes("game.js"), false,
        `${runner}: entry readiness resumes after the implementation file is physically present`);
      assert.equal(JSON.parse(readFileSync(join(path, "project", "pipeline.json"), "utf8")).verify, null,
        `${runner}: implementation may start on the shipped baseline without a PO-supplied command`);
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
      assert.equal(handover.outcome, "ready",
        `${runner}: baseline or configured verification must enter implementation without a PO question: ${JSON.stringify(handover)}`);
      assert.ok(driverInvocations.length >= 1, `${runner}: public driver must execute at least its own inspect`);

      const ready = run(onboarding, ["inspect", "--root", path, "--runner", runner], path);
      assert.equal(ready.status, 0, ready.stdout);
      assert.equal(ready.json.status, "ready", `${runner}: final inspection must remain ready`);
      assert.equal(ready.json.nextAction, null, `${runner}: implementation-ready must not point back into onboarding`);
      const calibration = JSON.parse(readFileSync(join(path, "project", "pipeline.json"), "utf8"));
      assert.equal(calibration.verify, runner === "claude" ? verifyCommand : null,
        `${runner}: only an explicitly configured project command is persisted`);
    }
  } finally {
    for (const path of paths) dispose(path);
  }
});
