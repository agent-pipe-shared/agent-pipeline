#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * Process-level first-use regression harness.
 *
 * This deliberately invokes the shipped CLI against disposable repositories
 * instead of importing its library seams. Host/plugin-install evidence remains
 * a separate release gate, but every release can reuse this deterministic
 * baseline before attempting a bound-host session.
 */
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const onboarding = join(here, "project-onboarding-v3.mjs");
const authority = join(here, "v3-bootstrap-authority.mjs");

function root() { return mkdtempSync(join(tmpdir(), "pipeline-onboarding-e2e-")); }
function dispose(path) { rmSync(path, { recursive: true, force: true }); }
function run(script, args, cwd) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd, encoding: "utf8", timeout: 30_000 });
  return { ...result, json: result.stdout ? JSON.parse(result.stdout) : null };
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
      assert.equal(plan.status, 0);
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

test("read-only host-control paths are diagnosed and never initialized", () => {
  const path = root();
  try {
    for (const name of [".agents", ".codex", ".git"]) {
      const target = join(path, name);
      mkdirSync(target);
      chmodSync(target, 0o555);
    }
    const inspected = run(onboarding, ["inspect", "--root", path], path);
    assert.equal(inspected.status, 1);
    assert.equal(inspected.json.status, "host-layout-incompatible");
    assert.equal(inspected.json.diagnostics[0].code, "host_layout_incompatible");
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
    assert.equal(plan.status, 0);
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
