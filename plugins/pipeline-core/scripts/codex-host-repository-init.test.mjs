#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { applyHostRepositoryInit, planHostRepositoryInit } from "./codex-host-repository-init.mjs";
import { CODEX_HOST_REPOSITORY_INIT_RECEIPT } from "../lib/codex-host-layout.mjs";
import {
  applyOnboardingKickoff,
  classifyOnboardingContinuity,
  planOnboardingKickoff,
} from "../lib/onboarding-continuity.mjs";

const roots = [];

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "codex host repository init "));
  roots.push(root);
  mkdirSync(join(root, ".claude"), { recursive: true });
  mkdirSync(join(root, "docs"), { recursive: true });
  mkdirSync(join(root, "specs"), { recursive: true });
  const files = {
    "pipeline.user.yaml": "schema: pipeline.user.v3\n",
    ".claude/pipeline.json": `${JSON.stringify({
      repositoryMode: "host-managed",
      verify: "git diff --check",
      handover: "docs/state.md",
      autonomy: "gated",
      branchModel: "feature-branch",
      worktree: "optional",
      stakes: "standard",
      constraints: [],
    }, null, 2)}\n`,
    ".claude/pipeline.yaml": "schema: pipeline.manifest.v0\n",
    ".claude/settings.json": "{}\n",
  };
  for (const [path, bytes] of Object.entries(files)) writeFileSync(join(root, path), bytes);
  const kickoff = planOnboardingKickoff({
    rootDir: root,
    goal: "Build one small HTML game",
    repositoryCapability: "host-managed",
  });
  applyOnboardingKickoff({
    plan: kickoff,
    expectedPlanSha256: kickoff.planSha256,
    activate: true,
  });
  return root;
}

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function readyInspection(root) {
  return {
    status: "ready",
    root,
    repository: { status: "host-managed", mode: "host-managed", gitVersion: null },
    runtime: {
      status: "plugin-managed",
      sourceSha256: "a".repeat(64),
      targetsSha256: null,
      barrierSha256: null,
      readbackSha256: null,
    },
    continuity: { status: "valid" },
    appServer: { required: true, status: "running", code: "CAS-READY" },
    nextAction: null,
  };
}

test("plan binds only the exact ready host-managed plugin runtime", () => {
  const root = fixture();
  const plan = planHostRepositoryInit({
    rootDir: root,
    deps: { inspectProjectOnboardingV3: () => readyInspection(root) },
  });
  assert.equal(plan.status, "ready");
  assert.match(plan.planSha256, /^[a-f0-9]{64}$/u);
  assert.deepEqual(plan.changes, [
    ".git",
    ".git/agent-pipeline/onboarding/continuity-history.json",
    CODEX_HOST_REPOSITORY_INIT_RECEIPT,
  ]);
  assert.equal(plan.createsCommit, false);
  assert.equal(plan.applyAction.requiresHostBoundary, true);
  assert.equal(plan.applyAction.requiresConfirmation, true);
  assert.equal(plan.applyAction.argv.includes("--activate"), true);

  const denied = planHostRepositoryInit({
    rootDir: root,
    deps: { inspectProjectOnboardingV3: () => ({ ...readyInspection(root), runtime: { status: "readback-current" } }) },
  });
  assert.equal(denied.status, "not-applicable");
  assert.equal(denied.applyAction, null);
});

test("host apply initializes only Git and requires one restart", () => {
  const root = fixture();
  const plan = planHostRepositoryInit({
    rootDir: root,
    deps: { inspectProjectOnboardingV3: () => readyInspection(root) },
  });
  const result = applyHostRepositoryInit({
    rootDir: root,
    planSha256: plan.planSha256,
    activate: true,
    deps: {
      spawnSync(command, args, options) {
        assert.equal(command, "git");
        if (args[0] === "--version") return { status: 0, stdout: "git version 2.40.1\n", stderr: "" };
        assert.deepEqual(args, ["init", "--initial-branch=main"]);
        mkdirSync(join(options.cwd, ".git"));
        return { status: 0, stdout: "", stderr: "" };
      },
    },
  });
  assert.equal(result.status, "restart-required");
  assert.equal(result.branch, "main");
  assert.equal(result.createsCommit, false);
  assert.equal(existsSync(join(root, ".git")), true);
  assert.equal(JSON.parse(readFileSync(join(root, ".claude/pipeline.json"), "utf8")).repositoryMode, "host-managed");
  assert.equal(readFileSync(join(root, "pipeline.user.yaml"), "utf8"), "schema: pipeline.user.v3\n");
  assert.equal(existsSync(join(root, ".git/agent-pipeline/onboarding/continuity-history.json")), true);
  assert.equal(existsSync(join(root, ".claude/.runtime/agent-pipeline/onboarding/continuity-history.json")), true);
  const receipt = JSON.parse(readFileSync(join(root, CODEX_HOST_REPOSITORY_INIT_RECEIPT), "utf8"));
  assert.equal(receipt.schema, "pipeline.codex-host-repository-init-receipt.v1");
  assert.equal(receipt.planSha256, plan.planSha256);
  assert.match(receipt.authoritySha256, /^[a-f0-9]{64}$/u);
  assert.equal(receipt.gitVersion, "2.40.1");
  assert.equal(receipt.branch, "main");
  assert.equal(classifyOnboardingContinuity({
    rootDir: root,
    repositoryCapability: "local",
    spawn(command, args) {
      assert.equal(command, "git");
      assert.deepEqual(args, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
      return { status: 0, stdout: `${join(root, ".git")}\n`, stderr: "" };
    },
  }).status, "valid");
});

test("host apply rejects drift and any physical reserved host path before Git", () => {
  const drift = fixture();
  const plan = planHostRepositoryInit({
    rootDir: drift,
    deps: { inspectProjectOnboardingV3: () => readyInspection(drift) },
  });
  writeFileSync(join(drift, "docs/state.md"), "# changed\n");
  assert.equal(applyHostRepositoryInit({
    rootDir: drift,
    planSha256: plan.planSha256,
    activate: true,
  }).status, "host-preimage-changed");
  assert.equal(existsSync(join(drift, ".git")), false);

  const reserved = fixture();
  const reservedPlan = planHostRepositoryInit({
    rootDir: reserved,
    deps: { inspectProjectOnboardingV3: () => readyInspection(reserved) },
  });
  mkdirSync(join(reserved, ".codex"));
  assert.equal(applyHostRepositoryInit({
    rootDir: reserved,
    planSha256: reservedPlan.planSha256,
    activate: true,
  }).status, "host-preimage-changed");
  assert.equal(existsSync(join(reserved, ".git")), false);
});

test("the sandbox view cannot apply through its reserved .git control mount", (t) => {
  if (process.platform === "win32") return t.skip("POSIX control-mount fixture");
  const root = fixture();
  const plan = planHostRepositoryInit({
    rootDir: root,
    deps: { inspectProjectOnboardingV3: () => readyInspection(root) },
  });
  mkdirSync(join(root, ".git"));
  chmodSync(join(root, ".git"), 0o500);
  const result = applyHostRepositoryInit({
    rootDir: root,
    planSha256: plan.planSha256,
    activate: true,
  });
  assert.equal(result.status, "host-preimage-changed");
  chmodSync(join(root, ".git"), 0o700);
});

test("failed git init retains an unproven partial control path", () => {
  const root = fixture();
  const plan = planHostRepositoryInit({
    rootDir: root,
    deps: { inspectProjectOnboardingV3: () => readyInspection(root) },
  });
  const result = applyHostRepositoryInit({
    rootDir: root,
    planSha256: plan.planSha256,
    activate: true,
    deps: {
      spawnSync(command, args, options) {
        assert.equal(command, "git");
        if (args[0] === "--version") return { status: 0, stdout: "git version 2.40.1\n", stderr: "" };
        mkdirSync(join(options.cwd, ".git"));
        writeFileSync(join(options.cwd, ".git", "foreign"), "foreign\n");
        return { status: 1, stdout: "", stderr: "synthetic init failure" };
      },
    },
  });
  assert.equal(result.status, "apply-failed");
  assert.deepEqual(result.diagnostics, [{ code: "git_init_failed_partial_control_path_retained" }]);
  assert.equal(readFileSync(join(root, ".git", "foreign"), "utf8"), "foreign\n");
});

test("host rollback preserves a Git directory whose identity changed during binding", () => {
  const root = fixture();
  const plan = planHostRepositoryInit({
    rootDir: root,
    deps: { inspectProjectOnboardingV3: () => readyInspection(root) },
  });
  const nativeWrite = writeFileSync;
  const result = applyHostRepositoryInit({
    rootDir: root,
    planSha256: plan.planSha256,
    activate: true,
    deps: {
      spawnSync(command, args, options) {
        assert.equal(command, "git");
        if (args[0] === "--version") return { status: 0, stdout: "git version 2.40.1\n", stderr: "" };
        mkdirSync(join(options.cwd, ".git"));
        return { status: 0, stdout: "", stderr: "" };
      },
      writeFileSync(target, bytes, options) {
        if (target === join(root, CODEX_HOST_REPOSITORY_INIT_RECEIPT)) {
          rmSync(join(root, ".git"), { recursive: true, force: true });
          mkdirSync(join(root, ".git"));
          nativeWrite(join(root, ".git", "foreign"), "foreign\n");
          throw new Error("synthetic control-path identity race");
        }
        nativeWrite(target, bytes, options);
      },
    },
  });
  assert.equal(result.status, "rollback-failed");
  assert.deepEqual(result.diagnostics, [{ code: "host_init_identity_changed" }]);
  assert.equal(readFileSync(join(root, ".git", "foreign"), "utf8"), "foreign\n");
});
