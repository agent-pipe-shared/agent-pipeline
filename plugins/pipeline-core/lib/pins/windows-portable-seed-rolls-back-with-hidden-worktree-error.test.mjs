#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * Pin for backlog item pipeline.windows-portable-seed-rolls-back-with-hidden-worktree-error
 * (Alfred AC-271). Every case runs the real module or CLI driver; the only seams used are
 * the modules' documented injection seams (`spawn` for the git topology probe, `deps` for
 * the seed write, `run` for the driver responder). Fixtures live under the repository's
 * scratch/ directory. Cases that need directory symlinks or mode bits are not used.
 *
 * Acceptance points:
 *  A1 worktree paths compare correctly irrespective of slash style / drive-letter case
 *  A2 a failed portable seed application surfaces rollback + diagnostic, non-success
 *  A3 an unexpected result outside nextAction.expected.statuses stops the driver with the
 *     observed status and a bounded repair action
 *  A4 synthetic path fixtures + fresh non-Git onboarding cover failure and progression
 *  A5 installed Claude candidate observed in a fresh Windows session: NOT verifiable here
 *     (manual, post-install step named in the item itself)
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { discoverRepository } from "../worktree-lifecycle.mjs";
import { observeGovernanceScope } from "../governance-scope.mjs";
import { applyProjectOnboardingLifecycleV4, planProjectOnboardingLifecycleV4 } from "../project-onboarding-v3.mjs";
import { driveOnboardingInit } from "../../scripts/onboarding-init.mjs";

const SCRATCH = resolve(fileURLToPath(new URL("../../../../scratch/", import.meta.url)));
mkdirSync(SCRATCH, { recursive: true });
const roots = [];
after(() => { for (const r of roots) rmSync(r, { recursive: true, force: true }); });

function freshDir(tag) {
  const dir = mkdtempSync(join(SCRATCH, `${tag}-`));
  roots.push(dir);
  return realpathSync(dir);
}

function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", shell: false, env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", LC_ALL: "C" } });
  assert.equal(result.status, 0, `git ${args.join(" ")}: ${result.stderr}`);
  return result;
}

function gitFixture() {
  const primary = join(freshDir("wps-git"), "repo");
  mkdirSync(primary);
  git(primary, ["init", "--initial-branch=main"]);
  writeFileSync(join(primary, "README.md"), "fixture\n");
  git(primary, ["add", "README.md"]);
  git(primary, ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "fixture"]);
  return primary;
}

// Re-emit the porcelain worktree rows in the representation Git for Windows uses.
function spawnWithPorcelain(rewrite) {
  return (cmd, args, options) => {
    const result = spawnSync("git", args, options);
    if (args.includes("--porcelain")) result.stdout = rewrite(String(result.stdout));
    return result;
  };
}

const slash = (p) => p.replaceAll("\\", "/");
const respond = (body) => ({ status: 0, stdout: JSON.stringify(body), stderr: "" });

test("A1 forward-slash porcelain rows are canonicalized to the native physical path", () => {
  const primary = gitFixture();
  const repo = discoverRepository(primary, { spawn: spawnWithPorcelain((s) => s.replaceAll(primary, slash(primary))) });
  assert.equal(repo.worktrees[0].path, resolve(primary));
  assert.equal(repo.worktrees[0].path, repo.primaryRoot);
});

test("A1 a differently-cased drive letter still resolves to the same physical primary", { skip: process.platform === "win32" ? false : "host-limitation: drive letters exist only on win32" }, () => {
  const primary = gitFixture();
  const flip = (p) => p[0].toLowerCase() + p.slice(1);
  const repo = discoverRepository(primary, { spawn: spawnWithPorcelain((s) => s.replaceAll(primary, flip(slash(primary)))) });
  assert.equal(repo.worktrees[0].path, resolve(primary));
});

test("A1 a nonexistent row is kept lexically native, not dropped or left slash-form", () => {
  const primary = gitFixture();
  const ghost = join(primary, "..", "ghost-worktree");
  const extra = `worktree ${slash(resolve(ghost))}\0HEAD ${"a".repeat(40)}\0detached\0\0`;
  const repo = discoverRepository(primary, { spawn: spawnWithPorcelain((s) => s + extra) });
  assert.ok(repo.worktrees.some((w) => w.path === resolve(ghost)));
});

test("A1 governance scope on a slash-form worktree row does not fail with GS-WORKTREE", () => {
  const primary = gitFixture();
  let text;
  try {
    text = JSON.stringify(observeGovernanceScope({
      rootDir: primary,
      topologyOptions: { spawn: spawnWithPorcelain((s) => s.replaceAll(primary, slash(primary))) },
    }));
  } catch (error) {
    text = `${error.code ?? ""} ${error.message}`;
  }
  assert.equal(text.includes("GS-WORKTREE"), false, text);
});

test("A2 a failed portable seed apply returns rolled-back with a diagnostic and leaves no Git control", () => {
  const root = freshDir("wps-seed");
  const plan = planProjectOnboardingLifecycleV4({ rootDir: root, runner: "claude", operation: "portable" });
  const argv = plan.nextAction.argv;
  const digest = argv[argv.indexOf("--plan-sha256") + 1];
  const result = applyProjectOnboardingLifecycleV4({
    rootDir: root, runner: "claude", operation: "portable", planSha256: digest, activate: true,
    deps: { writeFileSync: () => { throw new Error("synthetic seed write failure"); } },
  });
  assert.equal(result.status, "rolled-back");
  assert.notEqual(result.status, "runtime-initialization-required");
  assert.equal(result.diagnostics[0].code, "apply_failed");
  assert.match(result.diagnostics[0].message, /synthetic seed write failure/);
  assert.equal(existsSync(join(root, ".git")), false);
});

test("A3 the driver stops at the first unexpected mutation outcome with status and a repair action", () => {
  const root = freshDir("wps-drive");
  let calls = 0;
  const run = () => {
    calls += 1;
    if (calls === 1) return respond({
      schema: "pipeline.project-onboarding.v4",
      status: "portable-seed-required",
      nextAction: {
        kind: "command", executable: "node",
        argv: ["/plugin/scripts/project-onboarding-v3.mjs", "apply-portable-seed", "--root", root, "--plan-sha256", "a".repeat(64), "--activate"],
        mutation: true, requiresConfirmation: true,
        expected: { schema: "pipeline.project-onboarding.v4", statuses: ["runtime-initialization-required"] },
      },
    });
    return respond({
      schema: "pipeline.project-onboarding-plan.v3",
      status: "rolled-back",
      diagnostics: [{ path: "$.transaction", code: "apply_failed", message: "GS-WORKTREE", repair: "repair the root and run inspect then plan again" }],
    });
  };
  const result = driveOnboardingInit({ rootDir: root, runner: "claude", run });
  assert.equal(result.outcome, "error");
  assert.equal(result.error.faultCode, "unexpected-mutation-outcome");
  assert.equal(result.final.status, "rolled-back");
  assert.equal(result.blockedAction.diagnostics[0].code, "apply_failed");
  assert.equal(calls, 2, "the same plan/apply pair is not repeated");
});

test("A3/A4 real failed seed on a fresh non-Git root exposes a repair hint (bounded repair action)", () => {
  const root = freshDir("wps-repair");
  const plan = planProjectOnboardingLifecycleV4({ rootDir: root, runner: "claude", operation: "portable" });
  const digest = plan.nextAction.argv[plan.nextAction.argv.indexOf("--plan-sha256") + 1];
  const result = applyProjectOnboardingLifecycleV4({
    rootDir: root, runner: "claude", operation: "portable", planSha256: digest, activate: true,
    deps: { writeFileSync: () => { throw new Error("synthetic seed write failure"); } },
  });
  const text = JSON.stringify(result.diagnostics);
  assert.match(text, /repair/i);
});

test("A4 fresh non-Git root: the portable seed plan is a mutation whose expected status is the runtime-initialization step", () => {
  const root = freshDir("wps-progress");
  const plan = planProjectOnboardingLifecycleV4({ rootDir: root, runner: "claude", operation: "portable" });
  assert.equal(plan.nextAction.mutation, true);
  assert.ok(plan.nextAction.expected.statuses.includes("runtime-initialization-required"));
  assert.ok(!plan.nextAction.expected.statuses.includes("rolled-back"));
});

test("A5 installed Claude candidate observed in a fresh Windows session", { skip: "not verifiable: manual post-install observation (named in the item itself)" }, () => {});
