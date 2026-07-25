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
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { main as onboardingCli } from "./project-onboarding-v3.mjs";
import { main as authorityCli } from "./v3-bootstrap-authority.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const onboarding = join(here, "project-onboarding-v3.mjs");
const authority = join(here, "v3-bootstrap-authority.mjs");

// Keep every disposable root below this checked-out test directory. Codex's
// workspace sandbox grants the test process its project tree, whereas a
// child whose cwd is an unrelated OS temp directory loses Git capability
// before the shipped CLI can exercise its own behavior.
function root() { return mkdtempSync(join(here, ".pipeline-onboarding-e2e-")); }
function dispose(path) { rmSync(path, { recursive: true, force: true }); }
function cliGit(command, args, options = {}) {
  if (command !== "git") return { status: 1, stderr: "unexpected program" };
  if (args[0] === "--version") return { status: 0, stdout: "git version 2.40.1\n", stderr: "" };
  if (args[0] === "init" && args[1] === "--initial-branch=main") {
    mkdirSync(join(options.cwd, ".git"));
    return { status: 0, stdout: "", stderr: "" };
  }
  if (args[0] === "rev-parse" && args[1] === "--is-inside-work-tree") return { status: 0, stdout: "true\n", stderr: "" };
  return { status: 1, stderr: "unexpected git arguments" };
}
function run(script, args, cwd) {
  let stdout = "";
  const main = script === onboarding ? onboardingCli : script === authority ? authorityCli : null;
  assert.ok(main, `unsupported CLI entry point: ${script}`);
  const status = main(args, { write: (chunk) => { stdout += chunk; }, deps: script === onboarding ? { spawnSync: cliGit } : undefined });
  return { status, stdout, json: stdout ? JSON.parse(stdout) : null };
}
function git(args, cwd) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || `git ${args.join(" ")} failed`);
}

test("fresh and existing-unmanaged roots complete the CLI transaction and read back ready", () => {
  const fresh = root(); const existing = root();
  try {
    for (const [path, isExisting] of [[fresh, false], [existing, true]]) {
      if (isExisting) writeFileSync(join(path, "README.md"), "existing project\n");
      const plan = run(onboarding, ["plan", "--root", path], path);
      assert.equal(plan.status, 0, plan.stdout);
      assert.equal(plan.json.status, "ready");
      assert.equal(plan.json.state, isExisting ? "existing-unmanaged" : "fresh");
      const applied = run(onboarding, ["apply", "--root", path, "--activate"], path);
      assert.equal(applied.status, 0);
      assert.equal(applied.json.status, "applied");
      const readback = run(authority, ["--root", path], path);
      assert.equal(readback.status, 0);
      assert.equal(readback.json.status, "ready");
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
    assert.equal(inspected.json.status, "fresh-host-managed");
    assert.equal(inspected.json.diagnostics[0].code, "host_managed_fresh_root");
    const planned = run(onboarding, ["plan", "--root", path], path);
    assert.equal(planned.status, 0);
    assert.equal(planned.json.git.mode, "host-managed");
    assert.deepEqual(planned.json.targets.map((target) => target.path), [
      ".claude/pipeline.json", ".claude/pipeline.yaml", ".claude/settings.json", "pipeline.user.yaml",
    ]);
    const applied = run(onboarding, ["apply", "--root", path, "--activate"], path);
    assert.equal(applied.status, 0);
    assert.equal(applied.json.authority.runtimeProjection, "host-managed-codex");
    assert.deepEqual(readdirSync(join(path, ".codex")), []);
    assert.deepEqual(readdirSync(join(path, ".git")), []);
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
    assert.equal(plan.json.state, "existing-unmanaged");
    assert.equal(plan.json.git.initializesGit, false);
    const applied = run(onboarding, ["apply", "--root", linked, "--activate"], linked);
    assert.equal(applied.status, 0);
    assert.equal(readFileSync(join(linked, ".git"), "utf8"), gitPointer);
    assert.equal(readFileSync(join(linked, "README.md"), "utf8"), "worktree project\n");
    const readback = run(authority, ["--root", linked], linked);
    assert.equal(readback.status, 0);
    assert.equal(readback.json.status, "ready");
  } finally { dispose(container); }
});
