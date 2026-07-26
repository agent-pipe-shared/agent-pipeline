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
import { chmodSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { main as onboardingCli } from "./project-onboarding-v3.mjs";
import { main as authorityCli } from "./v3-bootstrap-authority.mjs";
import { inspectRepositoryFreshness } from "./repository-freshness.mjs";
import { applyProjectOnboardingKickoffV4, planProjectOnboardingKickoffV4 } from "../lib/project-onboarding-v3.mjs";
import { applyHostRepositoryInit, planHostRepositoryInit } from "./codex-host-repository-init.mjs";
import { evaluateLifecycleReadyGuard } from "../hooks/guard-lifecycle-ready.mjs";
import {
  CODEX_HOST_REPOSITORY_INIT_RECEIPT,
  readCodexHostRepositoryInitAdmission,
} from "../lib/codex-host-layout.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const onboarding = join(here, "project-onboarding-v3.mjs");
const authority = join(here, "v3-bootstrap-authority.mjs");

// Keep every disposable root below this checked-out test directory. Codex's
// workspace sandbox grants the test process its project tree, whereas a
// child whose cwd is an unrelated OS temp directory loses Git capability
// before the shipped CLI can exercise its own behavior.
function root() { return mkdtempSync(join(here, ".pipeline onboarding e2e with spaces-")); }
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
  if (gitArgs[0] === "rev-parse" && gitArgs[1] === "--is-inside-work-tree") return { status: 0, stdout: "true\n", stderr: "" };
  return { status: 1, stderr: "unexpected git arguments" };
}
function run(script, args, cwd) {
  let stdout = "";
  const main = script === onboarding ? onboardingCli : script === authority ? authorityCli : null;
  assert.ok(main, `unsupported CLI entry point: ${script}`);
  const status = main(args, {
    write: (chunk) => { stdout += chunk; },
    deps: { spawnSync: cliGit },
  });
  return { status, stdout, json: stdout ? JSON.parse(stdout) : null };
}
function actionArgs(result) {
  assert.equal(result.nextAction?.kind, "command");
  return result.nextAction.argv.slice(1);
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
    assert.equal(applied.json.status, "kickoff-required");
    assert.equal(applied.json.runtime.status, "plugin-managed");
    assert.equal(applied.json.nextAction.kind, "collect-input");
    const goal = "Build one small HTML game from the supplied design";
    const kickoff = planProjectOnboardingKickoffV4({
      rootDir: path,
      goal,
      deps: { spawnSync: cliGit },
    });
    const kickedOff = applyProjectOnboardingKickoffV4({
      rootDir: path,
      goal,
      planSha256: kickoff.planSha256,
      activate: true,
      deps: { spawnSync: cliGit },
    });
    assert.equal(kickedOff.status, "ready");
    const bootstrap = run(onboarding, ["inspect", "--root", path, "--intent", "bootstrap"], path);
    assert.equal(bootstrap.status, 0, bootstrap.stdout);
    assert.equal(bootstrap.json.status, "ready");
    assert.equal(bootstrap.json.repository.status, "host-managed");
    assert.equal(bootstrap.json.runtime.status, "plugin-managed");
    assert.equal(bootstrap.json.continuity.status, "valid");
    assert.deepEqual(bootstrap.json.appServer, { required: false, status: "not-requested", code: null });
    assert.equal(bootstrap.json.nextAction, null);
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
    assert.equal(readdirSync(join(path, ".claude/.runtime/agent-pipeline/onboarding")).sort().includes("host-repository-init.json"), true);
    assert.equal(evaluateLifecycleReadyGuard({
      tool_name: "Bash",
      tool_input: { command: "rg --files" },
    }, { projectDir: path }).exitCode, 0, "physical hook view accepts the bound host-init admission");
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
    const calibrationPath = join(path, ".claude", "pipeline.json");
    const localOnlyCalibration = JSON.parse(readFileSync(calibrationPath, "utf8"));
    localOnlyCalibration.repositoryMode = "local-only";
    writeFileSync(calibrationPath, `${JSON.stringify(localOnlyCalibration, null, 2)}\n`);
    assert.deepEqual(readCodexHostRepositoryInitAdmission(path), {
      gitVersion: "2.40.1",
      repositoryMode: "local-only",
    });
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

    writeFileSync(join(path, CODEX_HOST_REPOSITORY_INIT_RECEIPT), "{}\n", { mode: 0o600 });
    assert.equal(evaluateLifecycleReadyGuard({
      tool_name: "Bash",
      tool_input: { command: "rg --files" },
    }, { projectDir: path }).exitCode, 2);
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
