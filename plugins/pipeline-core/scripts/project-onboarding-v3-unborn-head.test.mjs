#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const SCRIPT = fileURLToPath(new URL("./project-onboarding-v3.mjs", import.meta.url));

function run(command, args, { cwd, env }) {
  const result = spawnSync(command, args, { cwd, env, encoding: "utf8", shell: false });
  assert.equal(result.error, undefined, result.error?.message);
  return result;
}

function runOnboarding(args, fixture) {
  const result = run(process.execPath, [SCRIPT, ...args], fixture);
  let output = null;
  try { output = JSON.parse(result.stdout); } catch {}
  return { ...result, output };
}

function fixture(label) {
  const container = mkdtempSync(join(tmpdir(), `pipeline-unborn-head-${label}-`));
  const root = join(container, "project");
  const home = join(container, "home");
  mkdirSync(root);
  mkdirSync(home);
  const env = {
    ...process.env,
    // Deliberately contradictory ambient Claude signal: every row below must
    // retain its explicit --runner value at the public CLI boundary.
    CLAUDECODE: "1",
    HOME: home,
    USERPROFILE: home,
    PIPELINE_ONBOARDING_HOMEDIR_OVERRIDE: home,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
    LC_ALL: "C",
  };
  const initialized = run("git", ["init", "--quiet", "--initial-branch=main", root], { cwd: container, env });
  assert.equal(initialized.status, 0, initialized.stderr);
  return { container, root, home, cwd: root, env };
}

function assertUnbornHead(row) {
  const head = run("git", ["rev-parse", "--verify", "HEAD^{commit}"], row);
  assert.notEqual(head.status, 0, "fixture must still have no commit");
}

test("dispatch onboarding defers the worktree probe for every runner and feature/epic profile until HEAD exists", () => {
  for (const runner of ["claude", "codex", "antigravity"]) {
    for (const profile of ["feature", "epic"]) {
      const row = fixture(`${runner}-${profile}`);
      const userBytes = `user content for ${runner}/${profile}\n`;
      const userPath = join(row.root, "USER-NOTES.md");
      try {
        writeFileSync(userPath, userBytes);
        assertUnbornHead(row);

        const planned = runOnboarding(["plan", "--root", row.root, "--runner", runner], row);
        assert.equal(planned.status, 0, planned.stderr || planned.stdout);
        assert.equal(planned.output?.runner, runner);
        assert.equal(planned.output?.nextAction?.kind, "command");
        const applied = run(planned.output.nextAction.executable, planned.output.nextAction.argv, row);
        assert.equal(applied.status, 0, applied.stderr || applied.stdout);

        const consented = runOnboarding([
          "intake-consent-apply", "--root", row.root, "--granted",
          "--git-author-name", "Unborn Head Fixture",
          "--git-author-email", "unborn-head@example.invalid",
          "--language", "en", "--profile", profile,
          "--activate", "--runner", runner,
        ], row);
        assert.equal(consented.status, 0, consented.stderr || consented.stdout);
        assert.equal(consented.output?.checkpoint?.values?.profile, profile);
        assertUnbornHead(row);

        const observed = runOnboarding([
          "inspect", "--root", row.root, "--intent", "dispatch", "--runner", runner,
        ], row);
        assert.equal(observed.status, 0, observed.stderr || observed.stdout);
        assert.equal(observed.output?.runner, runner);
        assert.equal(observed.output?.intent, "dispatch");
        assert.notEqual(observed.output?.status, "worktree-capability-unavailable");
        assert.equal(observed.output?.repository?.status, "local-valid-writable");
        assert.equal(observed.output?.repository?.sessionCapability, "passed");
        assert.equal(observed.output?.repository?.worktreeCapability, "not-observed");
        assert.equal(readFileSync(userPath, "utf8"), userBytes, "onboarding must preserve existing user content");
        assertUnbornHead(row);
      } finally {
        rmSync(row.container, { recursive: true, force: true });
      }
    }
  }
});

test("the same CLI still performs the full worktree capability probe once HEAD exists", () => {
  for (const runner of ["claude", "codex", "antigravity"]) {
    const row = fixture(`committed-${runner}`);
    const readme = join(row.root, "README.md");
    try {
      writeFileSync(readme, `committed user content for ${runner}\n`);
      assert.equal(run("git", ["add", "README.md"], row).status, 0);
      const committed = run("git", [
        "-c", "user.name=Committed Fixture",
        "-c", "user.email=committed@example.invalid",
        "commit", "--quiet", "-m", "initial user commit",
      ], row);
      assert.equal(committed.status, 0, committed.stderr);

      const observed = runOnboarding([
        "inspect", "--root", row.root, "--intent", "dispatch", "--runner", runner,
      ], row);
      assert.equal(observed.status, 0, observed.stderr || observed.stdout);
      assert.equal(observed.output?.runner, runner);
      assert.equal(observed.output?.repository?.status, "local-valid-writable");
      assert.equal(observed.output?.repository?.sessionCapability, "passed");
      assert.equal(observed.output?.repository?.worktreeCapability, "passed");
      assert.equal(readFileSync(readme, "utf8"), `committed user content for ${runner}\n`);
    } finally {
      rmSync(row.container, { recursive: true, force: true });
    }
  }
});
