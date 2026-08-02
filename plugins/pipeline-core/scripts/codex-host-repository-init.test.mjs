#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync, closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, renameSync, rmSync, symlinkSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { applyHostRepositoryInit, planHostRepositoryInit } from "./codex-host-repository-init.mjs";
import {
  CODEX_HOST_REPOSITORY_INIT_DIRECTORY,
  CODEX_HOST_REPOSITORY_INIT_INTENT,
  CODEX_HOST_REPOSITORY_INIT_MARKER,
  CODEX_HOST_REPOSITORY_INIT_PENDING_DIRECTORY,
  CODEX_HOST_REPOSITORY_INIT_RECEIPT,
  readCodexHostRepositoryInitAdmission,
} from "../lib/codex-host-layout.mjs";
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
    "pipeline.user.yaml": "schema: pipeline.user.v3\nlanguage:\n  human_facing: en\n  agent_facing: en\n",
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
    ".claude/pipeline.yaml": "schema: pipeline.manifest.v0\nlanguage:\n  human_facing: en\n",
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
    status: "host-repository-init-required",
    root,
    repository: { status: "host-managed", mode: "host-managed", gitVersion: null },
    runtime: {
      status: "plugin-managed-unattested",
      sourceSha256: "a".repeat(64),
      targetsSha256: null,
      barrierSha256: null,
      readbackSha256: null,
    },
    continuity: { status: "valid" },
    appServer: { required: false, status: "not-requested", code: null },
    nextAction: {
      kind: "command",
      executable: "node",
      argv: [fileURLToPath(new URL("./codex-host-repository-init.mjs", import.meta.url)), "plan", "--root", root],
      mutation: false,
      requiresConfirmation: false,
    },
  };
}

function completeGitInit(root) {
  const git = join(root, ".git");
  mkdirSync(join(git, "objects", "info"), { recursive: true });
  mkdirSync(join(git, "objects", "pack"), { recursive: true });
  mkdirSync(join(git, "refs", "heads"), { recursive: true });
  mkdirSync(join(git, "refs", "tags"), { recursive: true });
  writeFileSync(join(git, "HEAD"), "ref: refs/heads/main\n");
  writeFileSync(join(git, "config"), "[core]\n\trepositoryformatversion = 0\n\tbare = false\n");
}

test("plan binds only the exact non-ready host-managed plugin reservation", () => {
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
    CODEX_HOST_REPOSITORY_INIT_PENDING_DIRECTORY,
    CODEX_HOST_REPOSITORY_INIT_DIRECTORY,
    CODEX_HOST_REPOSITORY_INIT_INTENT,
    CODEX_HOST_REPOSITORY_INIT_RECEIPT,
    CODEX_HOST_REPOSITORY_INIT_MARKER,
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
        assert.equal(args[0], "init");
        assert.equal(args[1], "--initial-branch=main");
        assert.match(args[2], /^--template=/u);
        completeGitInit(options.cwd);
        return { status: 0, stdout: "", stderr: "" };
      },
    },
  });
  assert.equal(result.status, "restart-required");
  assert.equal(result.branch, "main");
  assert.equal(result.createsCommit, false);
  assert.equal(existsSync(join(root, ".git")), true);
  assert.equal(JSON.parse(readFileSync(join(root, ".claude/pipeline.json"), "utf8")).repositoryMode, "host-managed");
  assert.equal(readFileSync(join(root, "pipeline.user.yaml"), "utf8"), "schema: pipeline.user.v3\nlanguage:\n  human_facing: en\n  agent_facing: en\n");
  assert.equal(existsSync(join(root, ".git/agent-pipeline/onboarding/continuity-history.json")), true);
  assert.equal(existsSync(join(root, ".claude/.runtime/agent-pipeline/onboarding/continuity-history.json")), true);
  const receipt = JSON.parse(readFileSync(join(root, CODEX_HOST_REPOSITORY_INIT_RECEIPT), "utf8"));
  assert.equal(receipt.schema, "pipeline.codex-host-repository-init-receipt.v2");
  assert.equal(receipt.planSha256, plan.planSha256);
  assert.match(receipt.authoritySha256, /^[a-f0-9]{64}$/u);
  assert.equal(receipt.gitVersion, "2.40.1");
  assert.match(receipt.gitDevice, /^\d+$/u);
  assert.match(receipt.gitInode, /^\d+$/u);
  assert.match(receipt.gitTreeSha256, /^[a-f0-9]{64}$/u);
  assert.equal(receipt.branch, "main");
  const marker = JSON.parse(readFileSync(join(root, CODEX_HOST_REPOSITORY_INIT_MARKER), "utf8"));
  assert.equal(marker.schema, "pipeline.codex-host-repository-init-marker.v1");
  assert.equal(marker.planSha256, plan.planSha256);
  assert.match(marker.receiptSha256, /^[a-f0-9]{64}$/u);
  assert.deepEqual(
    readdirSync(join(root, CODEX_HOST_REPOSITORY_INIT_DIRECTORY)).sort(),
    ["intent.json", "marker.json", "receipt.json"],
  );
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

test("the bound receipt uses v2 and a pre-release unbound v1 shape is terminal invalid", () => {
  const root = fixture();
  const plan = planHostRepositoryInit({
    rootDir: root,
    deps: { inspectProjectOnboardingV3: () => readyInspection(root) },
  });
  assert.equal(applyHostRepositoryInit({
    rootDir: root,
    planSha256: plan.planSha256,
    activate: true,
    deps: {
      spawnSync(command, args, options) {
        if (args[0] === "--version") return { status: 0, stdout: "git version 2.40.1\n", stderr: "" };
        completeGitInit(options.cwd);
        return { status: 0, stdout: "", stderr: "" };
      },
    },
  }).status, "restart-required");
  const receiptPath = join(root, CODEX_HOST_REPOSITORY_INIT_RECEIPT);
  const markerPath = join(root, CODEX_HOST_REPOSITORY_INIT_MARKER);
  const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
  delete receipt.gitDevice;
  delete receipt.gitInode;
  delete receipt.gitTreeSha256;
  receipt.schema = "pipeline.codex-host-repository-init-receipt.v1";
  const receiptBytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  const marker = JSON.parse(readFileSync(markerPath, "utf8"));
  marker.receiptSha256 = createHash("sha256").update(receiptBytes).digest("hex");
  writeFileSync(receiptPath, receiptBytes, { mode: 0o600 });
  writeFileSync(markerPath, `${JSON.stringify(marker, null, 2)}\n`, { mode: 0o600 });
  assert.equal(readCodexHostRepositoryInitAdmission(root), null);
});

test("an interrupted admission publication resumes from the exact pending intent", () => {
  const root = fixture();
  const plan = planHostRepositoryInit({
    rootDir: root,
    deps: { inspectProjectOnboardingV3: () => readyInspection(root) },
  });
  const interrupted = applyHostRepositoryInit({
    rootDir: root,
    planSha256: plan.planSha256,
    activate: true,
    deps: {
      spawnSync(command, args, options) {
        assert.equal(command, "git");
        if (args[0] === "--version") return { status: 0, stdout: "git version 2.40.1\n", stderr: "" };
        completeGitInit(options.cwd);
        return { status: 0, stdout: "", stderr: "" };
      },
      faultInjector(point) {
        if (point === "before-host-init-admission-rename") {
          throw new Error("synthetic process interruption");
        }
        if (point === "before-host-init-cleanup-capture") {
          throw new Error("simulate process loss before rollback");
        }
      },
    },
  });
  assert.equal(interrupted.status, "rollback-failed");
  assert.equal(existsSync(join(root, ".git")), true);
  assert.equal(existsSync(join(root, CODEX_HOST_REPOSITORY_INIT_PENDING_DIRECTORY)), true);
  assert.equal(existsSync(join(root, CODEX_HOST_REPOSITORY_INIT_DIRECTORY)), false);

  const resumed = applyHostRepositoryInit({
    rootDir: root,
    planSha256: plan.planSha256,
    activate: true,
    deps: {
      spawnSync(command, args) {
        assert.equal(command, "git");
        assert.deepEqual(args, ["--version"]);
        return { status: 0, stdout: "git version 2.50.1\n", stderr: "" };
      },
    },
  });
  assert.equal(resumed.status, "restart-required");
  assert.equal(existsSync(join(root, CODEX_HOST_REPOSITORY_INIT_PENDING_DIRECTORY)), false);
  assert.deepEqual(readCodexHostRepositoryInitAdmission(root), {
    gitVersion: "2.40.1",
    gitDevice: String(lstatSync(join(root, ".git")).dev),
    gitInode: String(lstatSync(join(root, ".git")).ino),
    gitTreeSha256: JSON.parse(
      readFileSync(join(root, CODEX_HOST_REPOSITORY_INIT_RECEIPT), "utf8"),
    ).gitTreeSha256,
    planSha256: plan.planSha256,
    repositoryMode: "host-managed",
  });
});

test("completed replay requires the admitted Git identity and initialized tree", () => {
  const root = fixture();
  const plan = planHostRepositoryInit({
    rootDir: root,
    deps: { inspectProjectOnboardingV3: () => readyInspection(root) },
  });
  const initialized = applyHostRepositoryInit({
    rootDir: root,
    planSha256: plan.planSha256,
    activate: true,
    deps: {
      spawnSync(command, args, options) {
        if (args[0] === "--version") return { status: 0, stdout: "git version 2.40.1\n", stderr: "" };
        completeGitInit(options.cwd);
        return { status: 0, stdout: "", stderr: "" };
      },
    },
  });
  assert.equal(initialized.status, "restart-required");
  const replay = applyHostRepositoryInit({
    rootDir: root,
    planSha256: plan.planSha256,
    activate: true,
  });
  assert.equal(replay.status, "restart-required");

  writeFileSync(join(root, ".git", "foreign"), "foreign\n");
  const changedTree = applyHostRepositoryInit({
    rootDir: root,
    planSha256: plan.planSha256,
    activate: true,
  });
  assert.equal(changedTree.status, "host-preimage-changed");
  assert.deepEqual(changedTree.diagnostics, [{ code: "completed_git_control_drift" }]);
  rmSync(join(root, ".git", "foreign"));

  const originalGit = join(root, ".git.original");
  renameSync(join(root, ".git"), originalGit);
  mkdirSync(join(root, ".git"), { mode: 0o700 });
  completeGitInit(root);
  const replaced = applyHostRepositoryInit({
    rootDir: root,
    planSha256: plan.planSha256,
    activate: true,
  });
  assert.equal(replaced.status, "host-preimage-changed");
  assert.deepEqual(replaced.diagnostics, [{ code: "completed_git_control_drift" }]);
  assert.equal(existsSync(originalGit), true);
});

test("a replaced Git directory cannot borrow an interrupted transaction", () => {
  const root = fixture();
  const plan = planHostRepositoryInit({
    rootDir: root,
    deps: { inspectProjectOnboardingV3: () => readyInspection(root) },
  });
  const interrupted = applyHostRepositoryInit({
    rootDir: root,
    planSha256: plan.planSha256,
    activate: true,
    deps: {
      spawnSync(command, args, options) {
        assert.equal(command, "git");
        if (args[0] === "--version") return { status: 0, stdout: "git version 2.40.1\n", stderr: "" };
        completeGitInit(options.cwd);
        return { status: 0, stdout: "", stderr: "" };
      },
      faultInjector(point) {
        if (point === "before-host-init-admission-rename") throw new Error("synthetic interruption");
        if (point === "before-host-init-cleanup-capture") {
          throw new Error("simulate process loss before rollback");
        }
      },
    },
  });
  assert.equal(interrupted.status, "rollback-failed");
  const originalGit = join(root, ".git.original");
  renameSync(join(root, ".git"), originalGit);
  mkdirSync(join(root, ".git"), { mode: 0o700 });
  completeGitInit(root);
  const retried = applyHostRepositoryInit({
    rootDir: root,
    planSha256: plan.planSha256,
    activate: true,
    deps: {
      spawnSync(command, args) {
        assert.equal(command, "git");
        assert.deepEqual(args, ["--version"]);
        return { status: 0, stdout: "git version 2.40.1\n", stderr: "" };
      },
    },
  });
  assert.equal(retried.status, "host-preimage-changed");
  assert.deepEqual(retried.diagnostics, [{ code: "pending_git_control_drift" }]);
  assert.equal(existsSync(join(root, CODEX_HOST_REPOSITORY_INIT_DIRECTORY)), false);
  assert.equal(existsSync(originalGit), true);
});

test("admission publication rejects a directory replaced after validation", () => {
  const root = fixture();
  const plan = planHostRepositoryInit({
    rootDir: root,
    deps: { inspectProjectOnboardingV3: () => readyInspection(root) },
  });
  const pendingAdmission = join(
    root,
    CODEX_HOST_REPOSITORY_INIT_PENDING_DIRECTORY,
    "admission",
  );
  const capturedAdmission = `${pendingAdmission}.captured`;
  const result = applyHostRepositoryInit({
    rootDir: root,
    planSha256: plan.planSha256,
    activate: true,
    deps: {
      spawnSync(command, args, options) {
        assert.equal(command, "git");
        if (args[0] === "--version") return { status: 0, stdout: "git version 2.40.1\n", stderr: "" };
        completeGitInit(options.cwd);
        return { status: 0, stdout: "", stderr: "" };
      },
      faultInjector(point) {
        if (point === "before-host-init-admission-rename") {
          renameSync(pendingAdmission, capturedAdmission);
          mkdirSync(pendingAdmission, { mode: 0o700 });
          writeFileSync(join(pendingAdmission, "foreign"), "preserve\n");
        }
      },
    },
  });
  assert.equal(result.status, "rollback-failed");
  assert.equal(
    readFileSync(join(root, CODEX_HOST_REPOSITORY_INIT_DIRECTORY, "foreign"), "utf8"),
    "preserve\n",
  );
  assert.equal(existsSync(capturedAdmission), true);
});

test("admission read rejects a leaf replaced between lstat and descriptor open", () => {
  const root = fixture();
  const plan = planHostRepositoryInit({
    rootDir: root,
    deps: { inspectProjectOnboardingV3: () => readyInspection(root) },
  });
  const initialized = applyHostRepositoryInit({
    rootDir: root,
    planSha256: plan.planSha256,
    activate: true,
    deps: {
      spawnSync(command, args, options) {
        assert.equal(command, "git");
        if (args[0] === "--version") return { status: 0, stdout: "git version 2.40.1\n", stderr: "" };
        completeGitInit(options.cwd);
        return { status: 0, stdout: "", stderr: "" };
      },
    },
  });
  assert.equal(initialized.status, "restart-required");
  const receiptPath = join(root, CODEX_HOST_REPOSITORY_INIT_RECEIPT);
  const backupPath = `${receiptPath}.original`;
  let replaced = false;
  const admission = readCodexHostRepositoryInitAdmission(root, {
    open(path, flags, mode) {
      if (!replaced && path === receiptPath) {
        replaced = true;
        renameSync(receiptPath, backupPath);
        writeFileSync(receiptPath, "{}\n", { mode: 0o600 });
        const descriptor = openSync(path, flags, mode);
        rmSync(receiptPath);
        renameSync(backupPath, receiptPath);
        return descriptor;
      }
      return openSync(path, flags, mode);
    },
  });
  assert.equal(admission, null);
  assert.notEqual(readCodexHostRepositoryInitAdmission(root), null);
});

test("admission read rejects its private directory replaced after permission validation", () => {
  const root = fixture();
  const plan = planHostRepositoryInit({
    rootDir: root,
    deps: { inspectProjectOnboardingV3: () => readyInspection(root) },
  });
  const initialized = applyHostRepositoryInit({
    rootDir: root,
    planSha256: plan.planSha256,
    activate: true,
    deps: {
      spawnSync(command, args, options) {
        assert.equal(command, "git");
        if (args[0] === "--version") return { status: 0, stdout: "git version 2.40.1\n", stderr: "" };
        completeGitInit(options.cwd);
        return { status: 0, stdout: "", stderr: "" };
      },
    },
  });
  assert.equal(initialized.status, "restart-required");
  const admissionPath = join(root, CODEX_HOST_REPOSITORY_INIT_DIRECTORY);
  const backupPath = `${admissionPath}.original`;
  let replaced = false;
  const admission = readCodexHostRepositoryInitAdmission(root, {
    open(path, flags, mode) {
      if (!replaced && path === join(root, "pipeline.user.yaml")) {
        replaced = true;
        renameSync(admissionPath, backupPath);
        mkdirSync(admissionPath, { mode: 0o700 });
        for (const name of readdirSync(backupPath)) {
          writeFileSync(join(admissionPath, name), readFileSync(join(backupPath, name)), { mode: 0o600 });
        }
      }
      return openSync(path, flags, mode);
    },
  });
  assert.equal(admission, null);
  rmSync(admissionPath, { recursive: true });
  renameSync(backupPath, admissionPath);
  assert.notEqual(readCodexHostRepositoryInitAdmission(root), null);
});

test("a marker publication failure retains only the reserved retryable Git transaction", () => {
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
        completeGitInit(options.cwd);
        return { status: 0, stdout: "", stderr: "" };
      },
      faultInjector(point) {
        if (point === "before-host-init-marker-publication") {
          throw new Error("synthetic marker publication failure");
        }
      },
    },
  });
  assert.equal(result.status, "apply-failed");
  assert.equal(existsSync(join(root, CODEX_HOST_REPOSITORY_INIT_MARKER)), false);
  assert.equal(existsSync(join(root, CODEX_HOST_REPOSITORY_INIT_RECEIPT)), false);
  assert.equal(existsSync(join(root, ".git")), true);
  assert.equal(existsSync(join(root, CODEX_HOST_REPOSITORY_INIT_PENDING_DIRECTORY)), true);
});

test("successful cleanup preserves a pending artifact replaced after validation", () => {
  const root = fixture();
  const plan = planHostRepositoryInit({
    rootDir: root,
    deps: { inspectProjectOnboardingV3: () => readyInspection(root) },
  });
  const pendingIntent = join(root, CODEX_HOST_REPOSITORY_INIT_PENDING_DIRECTORY, "intent.json");
  const originalIntent = `${pendingIntent}.original`;
  const result = applyHostRepositoryInit({
    rootDir: root,
    planSha256: plan.planSha256,
    activate: true,
    deps: {
      spawnSync(command, args, options) {
        if (args[0] === "--version") return { status: 0, stdout: "git version 2.40.1\n", stderr: "" };
        completeGitInit(options.cwd);
        return { status: 0, stdout: "", stderr: "" };
      },
      faultInjector(point, context) {
        if (point === "before-host-init-cleanup-capture"
          && context?.path === pendingIntent && !existsSync(originalIntent)) {
          const bytes = readFileSync(pendingIntent);
          renameSync(pendingIntent, originalIntent);
          writeFileSync(pendingIntent, bytes, { mode: 0o600 });
        }
      },
    },
  });
  assert.equal(result.status, "restart-required");
  assert.deepEqual(result.diagnostics, [{ code: "pending_cleanup_retained" }]);
  assert.equal(existsSync(pendingIntent), true);
  assert.equal(existsSync(originalIntent), true);
});

test("successful cleanup preserves a pending directory replaced after validation", () => {
  const root = fixture();
  const plan = planHostRepositoryInit({
    rootDir: root,
    deps: { inspectProjectOnboardingV3: () => readyInspection(root) },
  });
  const template = join(
    root,
    CODEX_HOST_REPOSITORY_INIT_PENDING_DIRECTORY,
    "git-template",
  );
  const originalTemplate = `${template}.original`;
  const result = applyHostRepositoryInit({
    rootDir: root,
    planSha256: plan.planSha256,
    activate: true,
    deps: {
      spawnSync(command, args, options) {
        if (args[0] === "--version") return { status: 0, stdout: "git version 2.40.1\n", stderr: "" };
        completeGitInit(options.cwd);
        return { status: 0, stdout: "", stderr: "" };
      },
      faultInjector(point, context) {
        if (point === "before-host-init-cleanup-capture"
          && context?.path === template && !existsSync(originalTemplate)) {
          renameSync(template, originalTemplate);
          mkdirSync(template, { mode: 0o700 });
        }
      },
    },
  });
  assert.equal(result.status, "restart-required");
  assert.deepEqual(result.diagnostics, [{ code: "pending_cleanup_retained" }]);
  assert.equal(existsSync(template), true);
  assert.equal(existsSync(originalTemplate), true);
});

test("successful cleanup reports and preserves unexpected directory membership", () => {
  const root = fixture();
  const plan = planHostRepositoryInit({
    rootDir: root,
    deps: { inspectProjectOnboardingV3: () => readyInspection(root) },
  });
  const template = join(
    root,
    CODEX_HOST_REPOSITORY_INIT_PENDING_DIRECTORY,
    "git-template",
  );
  const foreign = join(template, "foreign");
  const result = applyHostRepositoryInit({
    rootDir: root,
    planSha256: plan.planSha256,
    activate: true,
    deps: {
      spawnSync(command, args, options) {
        if (args[0] === "--version") return { status: 0, stdout: "git version 2.40.1\n", stderr: "" };
        completeGitInit(options.cwd);
        return { status: 0, stdout: "", stderr: "" };
      },
      faultInjector(point, context) {
        if (point === "before-host-init-cleanup-capture"
          && context?.path === template && !existsSync(foreign)) {
          writeFileSync(foreign, "preserve\n");
        }
      },
    },
  });
  assert.equal(result.status, "restart-required");
  assert.deepEqual(result.diagnostics, [{ code: "pending_cleanup_retained" }]);
  assert.equal(readFileSync(foreign, "utf8"), "preserve\n");
});

test("successful cleanup retires captures without a final pathname unlink", () => {
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
        if (args[0] === "--version") return { status: 0, stdout: "git version 2.40.1\n", stderr: "" };
        completeGitInit(options.cwd);
        return { status: 0, stdout: "", stderr: "" };
      },
      rmSync() {
        assert.fail("captured paths must not be removed by pathname");
      },
      rmdirSync() {
        assert.fail("captured directories must not be removed by pathname");
      },
    },
  });
  assert.equal(result.status, "restart-required");
  assert.deepEqual(result.diagnostics, []);
  assert.equal(existsSync(join(root, CODEX_HOST_REPOSITORY_INIT_PENDING_DIRECTORY)), false);
  const quarantineParent = join(root, ".claude/.runtime/agent-pipeline");
  const quarantines = readdirSync(quarantineParent)
    .filter((name) => name.startsWith(".host-init-quarantine-"));
  assert.equal(quarantines.length, 5);
  for (const quarantine of quarantines) {
    assert.equal(readdirSync(join(quarantineParent, quarantine)).length, 1);
  }
});

test("rollback preserves in-place byte replacements in published admission files", () => {
  for (const name of ["marker.json", "receipt.json", "intent.json"]) {
    const root = fixture();
    const plan = planHostRepositoryInit({
      rootDir: root,
      deps: { inspectProjectOnboardingV3: () => readyInspection(root) },
    });
    const foreignBytes = `foreign-${name}\n`;
    const pendingFile = join(
      root,
      CODEX_HOST_REPOSITORY_INIT_PENDING_DIRECTORY,
      "admission",
      name,
    );
    const result = applyHostRepositoryInit({
      rootDir: root,
      planSha256: plan.planSha256,
      activate: true,
      deps: {
        spawnSync(command, args, options) {
          if (args[0] === "--version") return { status: 0, stdout: "git version 2.40.1\n", stderr: "" };
          completeGitInit(options.cwd);
          return { status: 0, stdout: "", stderr: "" };
        },
        faultInjector(point) {
          if (point === "before-host-init-admission-rename") {
            writeFileSync(pendingFile, foreignBytes);
          }
        },
      },
    });
    assert.equal(result.status, "rollback-failed");
    assert.equal(
      readFileSync(join(root, CODEX_HOST_REPOSITORY_INIT_DIRECTORY, name), "utf8"),
      foreignBytes,
    );
  }
});

test("rollback preserves an in-place byte replacement of migrated continuity", () => {
  const root = fixture();
  const plan = planHostRepositoryInit({
    rootDir: root,
    deps: { inspectProjectOnboardingV3: () => readyInspection(root) },
  });
  const history = join(root, ".git/agent-pipeline/onboarding/continuity-history.json");
  const result = applyHostRepositoryInit({
    rootDir: root,
    planSha256: plan.planSha256,
    activate: true,
    deps: {
      spawnSync(command, args, options) {
        if (args[0] === "--version") return { status: 0, stdout: "git version 2.40.1\n", stderr: "" };
        completeGitInit(options.cwd);
        return { status: 0, stdout: "", stderr: "" };
      },
      faultInjector(point) {
        if (point === "before-host-init-marker-publication") {
          writeFileSync(history, "foreign-history\n");
          throw new Error("synthetic binding failure");
        }
      },
    },
  });
  assert.equal(result.status, "rollback-failed");
  assert.equal(readFileSync(history, "utf8"), "foreign-history\n");
});

test("initialized-tree read rejects a leaf replaced between lstat and descriptor open", () => {
  const root = fixture();
  const plan = planHostRepositoryInit({
    rootDir: root,
    deps: { inspectProjectOnboardingV3: () => readyInspection(root) },
  });
  const head = join(root, ".git", "HEAD");
  const originalHead = `${head}.original`;
  let replaced = false;
  const result = applyHostRepositoryInit({
    rootDir: root,
    planSha256: plan.planSha256,
    activate: true,
    deps: {
      spawnSync(command, args, options) {
        if (args[0] === "--version") return { status: 0, stdout: "git version 2.40.1\n", stderr: "" };
        completeGitInit(options.cwd);
        return { status: 0, stdout: "", stderr: "" };
      },
      openSync(path, flags, mode) {
        if (!replaced && path === head) {
          replaced = true;
          const bytes = readFileSync(head);
          renameSync(head, originalHead);
          writeFileSync(head, bytes, { mode: 0o600 });
        }
        return openSync(path, flags, mode);
      },
    },
  });
  assert.equal(result.status, "host-preimage-changed");
  assert.deepEqual(result.diagnostics, [{ code: "pending_git_control_drift" }]);
  assert.equal(existsSync(originalHead), true);
});

test("initialized-tree traversal rejects a directory replaced after its first identity observation", () => {
  const root = fixture();
  const plan = planHostRepositoryInit({
    rootDir: root,
    deps: { inspectProjectOnboardingV3: () => readyInspection(root) },
  });
  const objects = join(root, ".git", "objects");
  const originalObjects = `${objects}.original`;
  let replaced = false;
  const result = applyHostRepositoryInit({
    rootDir: root,
    planSha256: plan.planSha256,
    activate: true,
    deps: {
      spawnSync(command, args, options) {
        if (args[0] === "--version") return { status: 0, stdout: "git version 2.40.1\n", stderr: "" };
        completeGitInit(options.cwd);
        return { status: 0, stdout: "", stderr: "" };
      },
      readdirSync(path, options) {
        if (!replaced && path === objects) {
          replaced = true;
          renameSync(objects, originalObjects);
          mkdirSync(objects, { mode: 0o700 });
          mkdirSync(join(objects, "info"), { mode: 0o700 });
          mkdirSync(join(objects, "pack"), { mode: 0o700 });
        }
        return readdirSync(path, options);
      },
    },
  });
  assert.equal(result.status, "host-preimage-changed");
  assert.deepEqual(result.diagnostics, [{ code: "pending_git_control_drift" }]);
  assert.equal(existsSync(originalObjects), true);
});

test("Git-control persistence failures keep their operational classification", () => {
  const root = fixture();
  const plan = planHostRepositoryInit({
    rootDir: root,
    deps: { inspectProjectOnboardingV3: () => readyInspection(root) },
  });
  let injected = false;
  const deps = {
    spawnSync(command, args, options) {
      if (args[0] === "--version") return { status: 0, stdout: "git version 2.40.1\n", stderr: "" };
      completeGitInit(options.cwd);
      return { status: 0, stdout: "", stderr: "" };
    },
    faultInjector(point) {
      if (point === "before-git-control-fsync" && !injected) {
        injected = true;
        const error = new Error("synthetic storage failure");
        error.code = "EIO";
        throw error;
      }
    },
    fsyncSync,
  };
  const result = applyHostRepositoryInit({
    rootDir: root,
    planSha256: plan.planSha256,
    activate: true,
    deps,
  });
  assert.equal(result.status, "apply-failed");
  assert.deepEqual(result.diagnostics, [{ code: "git_control_preparation_failed" }]);
  assert.equal(existsSync(join(root, CODEX_HOST_REPOSITORY_INIT_DIRECTORY)), false);
  const retried = applyHostRepositoryInit({
    rootDir: root,
    planSha256: plan.planSha256,
    activate: true,
    deps,
  });
  assert.equal(retried.status, "restart-required");
  assert.equal(existsSync(join(root, CODEX_HOST_REPOSITORY_INIT_DIRECTORY)), true);
});

test("path-identity observation failures remain operational after directory fsync", () => {
  const root = fixture();
  const plan = planHostRepositoryInit({
    rootDir: root,
    deps: { inspectProjectOnboardingV3: () => readyInspection(root) },
  });
  const pendingPath = join(root, CODEX_HOST_REPOSITORY_INIT_PENDING_DIRECTORY);
  let pendingDescriptor = null;
  let failNextPendingIdentityRead = false;
  const result = applyHostRepositoryInit({
    rootDir: root,
    planSha256: plan.planSha256,
    activate: true,
    deps: {
      openSync(path, flags, mode) {
        const descriptor = openSync(path, flags, mode);
        if (path === pendingPath) pendingDescriptor = descriptor;
        return descriptor;
      },
      fsyncSync(descriptor) {
        const result = fsyncSync(descriptor);
        if (descriptor === pendingDescriptor) failNextPendingIdentityRead = true;
        return result;
      },
      lstatSync(path) {
        if (path === pendingPath && failNextPendingIdentityRead) {
          failNextPendingIdentityRead = false;
          const error = new Error("synthetic identity read failure");
          error.code = "EIO";
          throw error;
        }
        return lstatSync(path);
      },
      closeSync(descriptor) {
        if (descriptor === pendingDescriptor) pendingDescriptor = null;
        return closeSync(descriptor);
      },
    },
  });
  assert.equal(result.status, "apply-failed");
  assert.deepEqual(result.diagnostics, [{ code: "git_control_preparation_failed" }]);
  assert.equal(existsSync(join(root, ".git")), false);
});

test("retry repeats a failed initialized-proof file fsync before admission", () => {
  const root = fixture();
  const plan = planHostRepositoryInit({
    rootDir: root,
    deps: { inspectProjectOnboardingV3: () => readyInspection(root) },
  });
  const initializedPath = join(
    root,
    CODEX_HOST_REPOSITORY_INIT_PENDING_DIRECTORY,
    "git-initialized.json",
  );
  let initializedDescriptor = null;
  let initializedSyncAttempts = 0;
  let failed = false;
  const deps = {
    spawnSync(command, args, options) {
      if (args[0] === "--version") return { status: 0, stdout: "git version 2.40.1\n", stderr: "" };
      completeGitInit(options.cwd);
      return { status: 0, stdout: "", stderr: "" };
    },
    openSync(path, flags, mode) {
      const descriptor = openSync(path, flags, mode);
      if (path === initializedPath) initializedDescriptor = descriptor;
      return descriptor;
    },
    fsyncSync(descriptor) {
      if (descriptor === initializedDescriptor) {
        initializedSyncAttempts += 1;
        if (!failed) {
          failed = true;
          const error = new Error("synthetic initialized-proof fsync failure");
          error.code = "EIO";
          throw error;
        }
      }
      return fsyncSync(descriptor);
    },
    closeSync(descriptor) {
      if (descriptor === initializedDescriptor) initializedDescriptor = null;
      return closeSync(descriptor);
    },
  };
  const first = applyHostRepositoryInit({
    rootDir: root,
    planSha256: plan.planSha256,
    activate: true,
    deps,
  });
  assert.equal(first.status, "apply-failed");
  assert.deepEqual(first.diagnostics, [{ code: "git_control_preparation_failed" }]);
  assert.equal(existsSync(initializedPath), true);
  const retried = applyHostRepositoryInit({
    rootDir: root,
    planSha256: plan.planSha256,
    activate: true,
    deps,
  });
  assert.equal(retried.status, "restart-required");
  assert.equal(initializedSyncAttempts, 2);
});

test("retry classifies a failed intent-file fsync as Git-control preparation failure", () => {
  const root = fixture();
  const plan = planHostRepositoryInit({
    rootDir: root,
    deps: { inspectProjectOnboardingV3: () => readyInspection(root) },
  });
  const interrupted = applyHostRepositoryInit({
    rootDir: root,
    planSha256: plan.planSha256,
    activate: true,
    deps: {
      spawnSync(command, args, options) {
        if (args[0] === "--version") return { status: 0, stdout: "git version 2.40.1\n", stderr: "" };
        completeGitInit(options.cwd);
        return { status: 0, stdout: "", stderr: "" };
      },
      faultInjector(point) {
        if (point === "before-host-init-admission-rename") {
          throw new Error("synthetic process interruption");
        }
        if (point === "before-host-init-cleanup-capture") {
          throw new Error("simulate process loss before rollback");
        }
      },
    },
  });
  assert.equal(interrupted.status, "rollback-failed");
  const intentPath = join(
    root,
    CODEX_HOST_REPOSITORY_INIT_PENDING_DIRECTORY,
    "intent.json",
  );
  let intentDescriptor = null;
  let failed = false;
  const retried = applyHostRepositoryInit({
    rootDir: root,
    planSha256: plan.planSha256,
    activate: true,
    deps: {
      openSync(path, flags, mode) {
        const descriptor = openSync(path, flags, mode);
        if (path === intentPath) intentDescriptor = descriptor;
        return descriptor;
      },
      fsyncSync(descriptor) {
        if (descriptor === intentDescriptor && !failed) {
          failed = true;
          const error = new Error("synthetic intent fsync failure");
          error.code = "EIO";
          throw error;
        }
        return fsyncSync(descriptor);
      },
      closeSync(descriptor) {
        if (descriptor === intentDescriptor) intentDescriptor = null;
        return closeSync(descriptor);
      },
    },
  });
  assert.equal(retried.status, "apply-failed");
  assert.deepEqual(retried.diagnostics, [{ code: "git_control_preparation_failed" }]);
  assert.equal(existsSync(join(root, CODEX_HOST_REPOSITORY_INIT_DIRECTORY)), false);
});

test("retry repeats pending and parent directory durability before Git preparation", () => {
  for (const relativeTarget of [
    CODEX_HOST_REPOSITORY_INIT_PENDING_DIRECTORY,
    ".claude/.runtime/agent-pipeline/onboarding",
  ]) {
    const root = fixture();
    const plan = planHostRepositoryInit({
      rootDir: root,
      deps: { inspectProjectOnboardingV3: () => readyInspection(root) },
    });
    const target = join(root, relativeTarget);
    let targetDescriptor = null;
    let targetSyncAttempts = 0;
    let failed = false;
    const deps = {
      spawnSync(command, args, options) {
        if (args[0] === "--version") return { status: 0, stdout: "git version 2.40.1\n", stderr: "" };
        completeGitInit(options.cwd);
        return { status: 0, stdout: "", stderr: "" };
      },
      openSync(path, flags, mode) {
        const descriptor = openSync(path, flags, mode);
        if (path === target) targetDescriptor = descriptor;
        return descriptor;
      },
      fsyncSync(descriptor) {
        if (descriptor === targetDescriptor) {
          targetSyncAttempts += 1;
          if (!failed) {
            failed = true;
            const error = new Error("synthetic transaction-directory fsync failure");
            error.code = "EIO";
            throw error;
          }
        }
        return fsyncSync(descriptor);
      },
      closeSync(descriptor) {
        if (descriptor === targetDescriptor) targetDescriptor = null;
        return closeSync(descriptor);
      },
    };
    const first = applyHostRepositoryInit({
      rootDir: root,
      planSha256: plan.planSha256,
      activate: true,
      deps,
    });
    assert.equal(first.status, "apply-failed");
    assert.deepEqual(first.diagnostics, [{ code: "git_control_preparation_failed" }]);
    assert.equal(existsSync(join(root, ".git")), false);
    const attemptsAfterFailure = targetSyncAttempts;
    assert.equal(attemptsAfterFailure, 1);
    const retried = applyHostRepositoryInit({
      rootDir: root,
      planSha256: plan.planSha256,
      activate: true,
      deps,
    });
    assert.equal(retried.status, "restart-required");
    assert.equal(targetSyncAttempts > attemptsAfterFailure, true);
  }
});

test("retry rejects an ABA replacement of each durability directory descriptor", () => {
  for (const relativeTarget of [
    CODEX_HOST_REPOSITORY_INIT_PENDING_DIRECTORY,
    ".claude/.runtime/agent-pipeline/onboarding",
  ]) {
    const root = fixture();
    const plan = planHostRepositoryInit({
      rootDir: root,
      deps: { inspectProjectOnboardingV3: () => readyInspection(root) },
    });
    const target = join(root, relativeTarget);
    let targetDescriptor = null;
    let failed = false;
    const first = applyHostRepositoryInit({
      rootDir: root,
      planSha256: plan.planSha256,
      activate: true,
      deps: {
        openSync(path, flags, mode) {
          const descriptor = openSync(path, flags, mode);
          if (path === target) targetDescriptor = descriptor;
          return descriptor;
        },
        fsyncSync(descriptor) {
          if (descriptor === targetDescriptor && !failed) {
            failed = true;
            const error = new Error("synthetic initial directory fsync failure");
            error.code = "EIO";
            throw error;
          }
          return fsyncSync(descriptor);
        },
        closeSync(descriptor) {
          if (descriptor === targetDescriptor) targetDescriptor = null;
          return closeSync(descriptor);
        },
      },
    });
    assert.equal(first.status, "apply-failed");
    assert.deepEqual(first.diagnostics, [{ code: "git_control_preparation_failed" }]);
    assert.equal(existsSync(join(root, ".git")), false);

    const original = `${target}.original`;
    const foreign = `${target}.foreign`;
    let swapped = false;
    const retried = applyHostRepositoryInit({
      rootDir: root,
      planSha256: plan.planSha256,
      activate: true,
      deps: {
        openSync(path, flags, mode) {
          if (path === target && !swapped) {
            swapped = true;
            renameSync(target, original);
            mkdirSync(target, { mode: 0o700 });
            const descriptor = openSync(target, flags, mode);
            renameSync(target, foreign);
            renameSync(original, target);
            return descriptor;
          }
          return openSync(path, flags, mode);
        },
      },
    });
    assert.equal(retried.status, "host-preimage-changed");
    assert.deepEqual(retried.diagnostics, [{ code: "pending_git_control_drift" }]);
    assert.equal(existsSync(join(root, ".git")), false);
    assert.equal(existsSync(target), true);
    assert.equal(existsSync(foreign), true);
  }
});

test("Git-tree read failures remain operational rather than preimage drift", () => {
  const root = fixture();
  const plan = planHostRepositoryInit({
    rootDir: root,
    deps: { inspectProjectOnboardingV3: () => readyInspection(root) },
  });
  const head = join(root, ".git", "HEAD");
  let headDescriptor = null;
  const result = applyHostRepositoryInit({
    rootDir: root,
    planSha256: plan.planSha256,
    activate: true,
    deps: {
      spawnSync(command, args, options) {
        if (args[0] === "--version") return { status: 0, stdout: "git version 2.40.1\n", stderr: "" };
        completeGitInit(options.cwd);
        return { status: 0, stdout: "", stderr: "" };
      },
      openSync(path, flags, mode) {
        const descriptor = openSync(path, flags, mode);
        if (path === head) headDescriptor = descriptor;
        return descriptor;
      },
      readFileSync(path, options) {
        if (path === headDescriptor) {
          const error = new Error("synthetic read failure");
          error.code = "EIO";
          throw error;
        }
        return readFileSync(path, options);
      },
    },
  });
  assert.equal(result.status, "apply-failed");
  assert.deepEqual(result.diagnostics, [{ code: "git_control_preparation_failed" }]);
});

test("continuity-directory ABA drift returns host-preimage-changed after rollback", () => {
  const root = fixture();
  const plan = planHostRepositoryInit({
    rootDir: root,
    deps: { inspectProjectOnboardingV3: () => readyInspection(root) },
  });
  const onboarding = join(root, ".git", "agent-pipeline", "onboarding");
  const original = join(root, ".host-init-onboarding-original");
  const foreign = join(root, ".host-init-onboarding-foreign");
  let swapped = false;
  const result = applyHostRepositoryInit({
    rootDir: root,
    planSha256: plan.planSha256,
    activate: true,
    deps: {
      spawnSync(command, args, options) {
        if (args[0] === "--version") return { status: 0, stdout: "git version 2.40.1\n", stderr: "" };
        completeGitInit(options.cwd);
        return { status: 0, stdout: "", stderr: "" };
      },
      openSync(path, flags, mode) {
        if (path === onboarding && !swapped) {
          swapped = true;
          renameSync(onboarding, original);
          mkdirSync(onboarding, { mode: 0o700 });
          const descriptor = openSync(onboarding, flags, mode);
          renameSync(onboarding, foreign);
          renameSync(original, onboarding);
          return descriptor;
        }
        return openSync(path, flags, mode);
      },
    },
  });
  assert.equal(result.status, "host-preimage-changed");
  assert.deepEqual(result.diagnostics, [{ code: "host_init_continuity_drift" }]);
  assert.equal(existsSync(join(root, CODEX_HOST_REPOSITORY_INIT_DIRECTORY)), false);
  assert.equal(existsSync(join(root, ".git", "agent-pipeline")), false);
  assert.equal(existsSync(foreign), true);
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

test("failed git init retains a reserved but unadmitted partial control path", () => {
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
        writeFileSync(join(options.cwd, ".git", "foreign"), "foreign\n");
        return { status: 1, stdout: "", stderr: "synthetic init failure" };
      },
    },
  });
  assert.equal(result.status, "apply-failed");
  assert.deepEqual(result.diagnostics, [{ code: "git_init_failed_reserved_control_path_retained" }]);
  assert.equal(readFileSync(join(root, ".git", "foreign"), "utf8"), "foreign\n");
  const retried = applyHostRepositoryInit({
    rootDir: root,
    planSha256: plan.planSha256,
    activate: true,
    deps: {
      spawnSync(command, args, options) {
        assert.equal(command, "git");
        if (args[0] === "--version") return { status: 0, stdout: "git version 2.40.1\n", stderr: "" };
        completeGitInit(options.cwd);
        return { status: 0, stdout: "", stderr: "" };
      },
    },
  });
  assert.equal(retried.status, "host-preimage-changed");
  assert.deepEqual(retried.diagnostics, [{ code: "pending_git_control_drift" }]);
  assert.equal(existsSync(join(root, CODEX_HOST_REPOSITORY_INIT_DIRECTORY)), false);
});

test("host rollback preserves a Git directory whose identity changed during binding", () => {
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
        completeGitInit(options.cwd);
        return { status: 0, stdout: "", stderr: "" };
      },
      faultInjector(point) {
        if (point === "before-host-init-marker-publication") {
          rmSync(join(root, ".git"), { recursive: true, force: true });
          mkdirSync(join(root, ".git"));
          writeFileSync(join(root, ".git", "foreign"), "foreign\n");
          throw new Error("synthetic control-path identity race");
        }
      },
    },
  });
  assert.equal(result.status, "rollback-failed");
  assert.deepEqual(result.diagnostics, [{ code: "host_init_identity_changed" }]);
  assert.equal(readFileSync(join(root, ".git", "foreign"), "utf8"), "foreign\n");
});

test("host rollback preserves foreign content added beneath the same Git directory", () => {
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
        completeGitInit(options.cwd);
        return { status: 0, stdout: "", stderr: "" };
      },
      faultInjector(point) {
        if (point === "before-host-init-marker-publication") {
          writeFileSync(join(root, ".git", "foreign"), "foreign\n");
          throw new Error("synthetic Git content race");
        }
      },
    },
  });
  assert.equal(result.status, "rollback-failed");
  assert.equal(readFileSync(join(root, ".git", "foreign"), "utf8"), "foreign\n");
});

test("host binding never follows a raced-in Git continuity symlink", (t) => {
  if (process.platform === "win32") return t.skip("POSIX symlink fixture");
  const root = fixture();
  const outside = mkdtempSync(join(tmpdir(), "codex host init outside "));
  roots.push(outside);
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
        completeGitInit(options.cwd);
        return { status: 0, stdout: "", stderr: "" };
      },
      mkdirSync(target, options) {
        if (target === join(root, ".git", "agent-pipeline")) {
          symlinkSync(outside, target, "dir");
          return;
        }
        mkdirSync(target, options);
      },
    },
  });
  assert.equal(result.status, "rollback-failed");
  assert.equal(existsSync(join(outside, "onboarding", "continuity-history.json")), false);
});
