#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

// NVA-PREPUSHOBSERVE-1: bootstrap-time observability for whether the
// `pre-push` git hook (installed by pre-push-hook-install.mjs, NVA-PREPUSH-1)
// is actually installed and current for the repository being inspected. This
// mirrors pipeline-start-preflight-antigravity-hard-enforcement.test.mjs's
// own structure: a not-installed hook is never fixed here -- only detected --
// and it fails closed (a distinct, exported non-ready status) rather than
// letting a session silently assume push enforcement exists.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { applyInstall } from "./pre-push-hook-install.mjs";
import {
  PRE_PUSH_HOOK_NOT_INSTALLED_STATUS,
  PRE_PUSH_HOOK_OBSERVATION_SCHEMA,
  observePipelineStartPreflight,
  observePrePushHookInstallation,
  pipelineStartPreflightExitCode,
} from "./pipeline-start-preflight.mjs";

const TEST_VERSION = "0.9.0+prepush-observe-test";
const manifest = JSON.stringify({ version: TEST_VERSION });
const pluginList = () => () => JSON.stringify({ installed: [], available: [] });

// Mirrors pipeline-start-preflight-antigravity-hard-enforcement.test.mjs's own
// `noSelfApplicationGitScriptUrl`: a synthetic scriptUrl under `root` so
// `pluginRootHasSelfApplicationGit` reads false (no `.git` two directories
// above the derived pluginRoot) and self-application attestation is skipped
// entirely -- decoupled from whether `root` ITSELF is a real git repository
// (it is, for every fixture below: `pluginRootHasSelfApplicationGit` looks
// two levels above `root`, never at `root` itself).
function noSelfApplicationGitScriptUrl(root) {
  return pathToFileURL(join(root, "scripts", "pipeline-start-preflight.mjs")).href;
}

/** A fresh, real git repository with one commit -- restore-before-yield: every
 * caller removes it in a `finally` block. Never this repository's own checkout. */
function freshRepo(prefix) {
  const dir = mkdtempSync(join(tmpdir(), `prepush-observe-${prefix}-`));
  const git = (args) => execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  git(["init", "--quiet", "--initial-branch=main"]);
  git(["config", "user.email", "goldfish@example.invalid"]);
  git(["config", "user.name", "Goldfish"]);
  writeFileSync(join(dir, "README.md"), "fixture\n");
  git(["add", "README.md"]);
  git(["commit", "--quiet", "-m", "init"]);
  return dir;
}

function withFreshRepo(prefix, run) {
  const dir = freshRepo(prefix);
  try {
    run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function withPlainDir(prefix, run) {
  const dir = mkdtempSync(join(tmpdir(), `prepush-observe-${prefix}-`));
  try {
    run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---- observePrePushHookInstallation: the three main states -----------------

test("installed-and-current: a repo where this installer's own hook is present and unmodified", () => {
  withFreshRepo("installed", (dir) => {
    const install = applyInstall({ rootDir: dir });
    assert.equal(install.status, "installed", `precondition: install must succeed (${JSON.stringify(install)})`);
    const result = observePrePushHookInstallation({ rootDir: dir });
    assert.equal(result.schema, PRE_PUSH_HOOK_OBSERVATION_SCHEMA);
    assert.equal(result.state, "installed-and-current");
    assert.equal(result.installed, true);
    assert.equal(result.installCommand, null);
  });
});

test("absent: a real repository that never had the hook installed", () => {
  withFreshRepo("absent", (dir) => {
    const result = observePrePushHookInstallation({ rootDir: dir });
    assert.equal(result.state, "absent");
    assert.equal(result.installed, false);
    assert.ok(result.installCommand, "an absent hook must carry the exact install command");
  });
});

test("present-but-not-ours-or-modified: a foreign hook this installer never wrote (no marker at all)", () => {
  withFreshRepo("foreign", (dir) => {
    const hookPath = execFileSync(
      "git", ["rev-parse", "--path-format=absolute", "--git-path", "hooks/pre-push"],
      { cwd: dir, encoding: "utf8" },
    ).trim();
    mkdirSync(join(hookPath, ".."), { recursive: true });
    writeFileSync(hookPath, "#!/bin/sh\necho a human already had this\n");
    const result = observePrePushHookInstallation({ rootDir: dir });
    assert.equal(result.state, "present-but-not-ours-or-modified");
    assert.equal(result.installed, false);
    assert.ok(result.installCommand);
  });
});

test("present-but-not-ours-or-modified: our own hook was tampered with after install", () => {
  withFreshRepo("tampered", (dir) => {
    const install = applyInstall({ rootDir: dir });
    assert.equal(install.status, "installed");
    writeFileSync(install.hookPath, "#!/bin/sh\necho tampered\n");
    const result = observePrePushHookInstallation({ rootDir: dir });
    assert.equal(result.state, "present-but-not-ours-or-modified");
    assert.equal(result.installed, false);
    assert.match(result.detail ?? "", /modified/);
  });
});

// ---- DoD (d): three degenerate, non-crashing inputs -------------------------

test("degenerate (1): no git directory at all -> a defined, non-crashing result, never installCommand", () => {
  withPlainDir("no-git", (dir) => {
    const result = observePrePushHookInstallation({ rootDir: dir });
    assert.equal(result.schema, PRE_PUSH_HOOK_OBSERVATION_SCHEMA);
    assert.equal(result.state, "repository-unresolved");
    assert.equal(result.installed, false);
    assert.equal(result.installCommand, null);
  });
});

test("degenerate (2): an unreadable marker (a directory in its place) with the hook file present -> foreign, not a crash", () => {
  withFreshRepo("unreadable-marker", (dir) => {
    const install = applyInstall({ rootDir: dir });
    assert.equal(install.status, "installed");
    rmSync(install.markerPath, { force: true });
    mkdirSync(install.markerPath); // readFileSync on a directory always throws EISDIR
    const result = observePrePushHookInstallation({ rootDir: dir });
    assert.equal(result.state, "present-but-not-ours-or-modified");
    assert.equal(result.installed, false);
  });
});

test("degenerate (3): a malformed marker (not JSON) with the hook file present -> foreign, not a crash", () => {
  withFreshRepo("malformed-marker", (dir) => {
    const install = applyInstall({ rootDir: dir });
    assert.equal(install.status, "installed");
    writeFileSync(install.markerPath, "{not valid json at all");
    const result = observePrePushHookInstallation({ rootDir: dir });
    assert.equal(result.state, "present-but-not-ours-or-modified");
    assert.equal(result.installed, false);
  });
});

test("an injected planInstallFn failure folds into repository-unresolved rather than throwing", () => {
  const result = observePrePushHookInstallation({
    rootDir: "/does/not/matter",
    planInstallFn: () => { throw new Error("boom"); },
  });
  assert.equal(result.state, "repository-unresolved");
  assert.equal(result.installCommand, null);
});

// ---- never mutates ------------------------------------------------------------

test("observePrePushHookInstallation never mutates the repository it inspects", () => {
  withFreshRepo("no-mutate", (dir) => {
    const before = execFileSync("git", ["status", "--short"], { cwd: dir, encoding: "utf8" });
    observePrePushHookInstallation({ rootDir: dir }); // absent state
    const install = applyInstall({ rootDir: dir });
    const hookBefore = readFileSync(install.hookPath, "utf8");
    observePrePushHookInstallation({ rootDir: dir }); // installed-and-current state
    const hookAfter = readFileSync(install.hookPath, "utf8");
    const after = execFileSync("git", ["status", "--short"], { cwd: dir, encoding: "utf8" });
    assert.equal(hookAfter, hookBefore, "the hook file itself must be untouched by observation alone");
    assert.equal(after, before, "git status of the repo's own tracked/untracked files must be unaffected");
  });
});

// ---- DoD (c): the exact install command -----------------------------------

test("installCommand carries the installer's own documented --install verb, an absolute path to the real installer, and the inspected repo's own rootDir", () => {
  withFreshRepo("install-command", (dir) => {
    const result = observePrePushHookInstallation({ rootDir: dir });
    assert.equal(result.installCommand.kind, "command");
    assert.equal(result.installCommand.executable, "node");
    assert.deepEqual(result.installCommand.argv.slice(1), ["--install"]);
    assert.ok(existsSync(result.installCommand.argv[0]), "argv[0] must be the real installer script on disk");
    assert.match(result.installCommand.argv[0], /pre-push-hook-install\.mjs$/);
    assert.equal(result.installCommand.cwd, dir);
  });
});

// ---- wired into observePipelineStartPreflight, end to end -------------------

test("wired: the ready path is unchanged when the hook is installed-and-current", () => {
  withFreshRepo("wired-ready", (dir) => {
    const install = applyInstall({ rootDir: dir });
    assert.equal(install.status, "installed");
    const result = observePipelineStartPreflight({
      env: {},
      pluginList: pluginList(),
      read: () => manifest,
      cwd: dir,
      scriptUrl: noSelfApplicationGitScriptUrl(dir),
    });
    assert.equal(result.status, "ready");
    assert.ok(result.prePushHook);
    assert.equal(result.prePushHook.state, "installed-and-current");
    assert.equal(pipelineStartPreflightExitCode(result), 0);
  });
});

test("wired: an absent hook reaches the distinct non-ready status and exit code, and names the install command", () => {
  withFreshRepo("wired-absent", (dir) => {
    const result = observePipelineStartPreflight({
      env: {},
      pluginList: pluginList(),
      read: () => manifest,
      cwd: dir,
      scriptUrl: noSelfApplicationGitScriptUrl(dir),
    });
    assert.equal(result.status, PRE_PUSH_HOOK_NOT_INSTALLED_STATUS);
    assert.notEqual(result.status, "ready");
    assert.ok(result.prePushHook);
    assert.equal(result.prePushHook.state, "absent");
    assert.ok(result.prePushHook.installCommand);
    assert.equal(pipelineStartPreflightExitCode(result), 2);
  });
});

test("wired: a foreign/modified hook also reaches the distinct non-ready status", () => {
  withFreshRepo("wired-foreign", (dir) => {
    const hookPath = execFileSync(
      "git", ["rev-parse", "--path-format=absolute", "--git-path", "hooks/pre-push"],
      { cwd: dir, encoding: "utf8" },
    ).trim();
    mkdirSync(join(hookPath, ".."), { recursive: true });
    writeFileSync(hookPath, "#!/bin/sh\necho a human already had this\n");
    const result = observePipelineStartPreflight({
      env: {},
      pluginList: pluginList(),
      read: () => manifest,
      cwd: dir,
      scriptUrl: noSelfApplicationGitScriptUrl(dir),
    });
    assert.equal(result.status, PRE_PUSH_HOOK_NOT_INSTALLED_STATUS);
    assert.equal(result.prePushHook.state, "present-but-not-ours-or-modified");
  });
});

test("wired: a repository-unresolved cwd (this file's own pre-existing test fixtures' shape) never gates status and omits the field entirely, keeping the envelope's key set unchanged", () => {
  const cwd = "/projects/current";
  const result = observePipelineStartPreflight({
    env: {},
    pluginList: pluginList(),
    read: () => manifest,
    cwd,
    scriptUrl: noSelfApplicationGitScriptUrl(cwd),
  });
  assert.equal(Object.hasOwn(result, "prePushHook"), false,
    "the field must be entirely absent, not merely null, for an unresolvable repository");
  assert.equal(result.status, "ready");
  assert.equal(pipelineStartPreflightExitCode(result), 0);
});

test("wired: a Claude-runner session observes the same hook state as any other runner (not runner-gated)", () => {
  withFreshRepo("wired-claude", (dir) => {
    const result = observePipelineStartPreflight({
      env: { CLAUDECODE: "1" },
      pluginList: pluginList(),
      read: () => manifest,
      cwd: dir,
      scriptUrl: noSelfApplicationGitScriptUrl(dir),
    });
    assert.equal(result.status, PRE_PUSH_HOOK_NOT_INSTALLED_STATUS);
    assert.equal(result.prePushHook.state, "absent");
  });
});

test("wired: an injected observePrePushHookInstallationFn is honored, proving the call site actually forwards cwd rather than a hardcoded value", () => {
  const calls = [];
  const dir = "/some/repo/root";
  const result = observePipelineStartPreflight({
    env: {},
    pluginList: pluginList(),
    read: () => manifest,
    cwd: dir,
    scriptUrl: noSelfApplicationGitScriptUrl(dir),
    observePrePushHookInstallationFn: (options) => {
      calls.push(options);
      return { schema: PRE_PUSH_HOOK_OBSERVATION_SCHEMA, state: "installed-and-current", installed: true, installCommand: null };
    },
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].rootDir, dir);
  assert.equal(result.status, "ready");
  assert.equal(result.prePushHook.state, "installed-and-current");
});
