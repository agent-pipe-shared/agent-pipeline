#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

// NVA-PREPUSHOBSERVE-1: bootstrap-time observability for whether the
// `pre-push` git hook (installed by pre-push-hook-install.mjs, NVA-PREPUSH-1)
// is actually installed and current for the repository being inspected. This
// mirrors pipeline-start-preflight-antigravity-hard-enforcement.test.mjs's
// own structure: a not-installed hook is never fixed here -- only detected.
//
// NVA-PREPUSHVISIBLE-1 (2026-08-27) corrected the original design: the hook is an OFFER,
// not a requirement (a live bootstrap against a real repository reported the session
// non-ready and unworkable purely because the hook was not installed, which was wrong). No
// state this observation returns gates readiness any more -- every one, decline included, is
// carried in the result purely as advisory evidence for a human. This file also covers (c):
// comparing the current branch's remote-tracking ref against the hook's own durable log to
// surface a push the hook never evaluated, also purely advisory.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { applyDecline, applyInstall } from "./pre-push-hook-install.mjs";
import {
  PRE_PUSH_HOOK_OBSERVATION_SCHEMA,
  PRE_PUSH_HOOK_UNSEEN_REMOTE_PUSH_SCHEMA,
  observePipelineStartPreflight,
  observePrePushHookInstallation,
  observeUnseenPushToRemote,
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

// ---- helpers for DoD (c): observeUnseenPushToRemote fixtures ---------------

function commonDirOf(dir) {
  return execFileSync(
    "git", ["rev-parse", "--path-format=absolute", "--git-common-dir"],
    { cwd: dir, encoding: "utf8" },
  ).trim();
}

/** Fakes what a normal clone's remote-tracking ref looks like -- `git remote add` (for the
 * fetch refspec `@{u}` resolution actually needs) plus `git update-ref` to plant the exact
 * commit, never a real network fetch/push. */
function setUpstream(dir, remoteCommit) {
  execFileSync("git", ["remote", "add", "origin", "https://example.invalid/fixture.git"], { cwd: dir });
  execFileSync("git", ["update-ref", "refs/remotes/origin/main", remoteCommit], { cwd: dir });
  execFileSync("git", ["config", "branch.main.remote", "origin"], { cwd: dir });
  execFileSync("git", ["config", "branch.main.merge", "refs/heads/main"], { cwd: dir });
}

/** Writes the hook's own durable log directly (the SAME path/shape `recordLog` in the
 * generated impl.mjs writes -- see pre-push-hook-install.mjs), without needing to actually
 * install and run the hook for a given fixture. */
function writeHookLog(dir, entries) {
  const logDir = join(commonDirOf(dir), "agent-pipeline", "pre-push-hook");
  mkdirSync(logDir, { recursive: true });
  const lines = entries.map((entry) => JSON.stringify(entry)).join("\n");
  writeFileSync(join(logDir, "log.jsonl"), `${lines}\n`);
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

test("declined: a repository where a decline was recorded and no hook was ever installed", () => {
  withFreshRepo("declined", (dir) => {
    const decline = applyDecline({ rootDir: dir });
    assert.equal(decline.status, "declined");
    const result = observePrePushHookInstallation({ rootDir: dir });
    assert.equal(result.schema, PRE_PUSH_HOOK_OBSERVATION_SCHEMA);
    assert.equal(result.state, "declined");
    assert.equal(result.installed, false);
    assert.equal(result.declinedAt, decline.declinedAt);
    assert.ok(result.installCommand, "a declined repository still carries the install command");
  });
});

test("declined then installed: observePrePushHookInstallation returns to installed-and-current (declining is not a permanent refusal)", () => {
  withFreshRepo("declined-then-installed", (dir) => {
    const decline = applyDecline({ rootDir: dir });
    assert.equal(decline.status, "declined");
    const install = applyInstall({ rootDir: dir });
    assert.equal(install.status, "installed");
    const result = observePrePushHookInstallation({ rootDir: dir });
    assert.equal(result.state, "installed-and-current");
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

// NVA-PREPUSHVISIBLE-1: this assertion (and the two immediately following it) used to pin
// the exact defect a live bootstrap found -- a real repository was reported non-ready and
// unworkable purely because the hook was not installed, which was wrong: the hook is an
// offer, not a requirement. Deliberately inverted (per this task's coordinator correction)
// to assert the opposite: status/exit code stay ready/0 while the observation itself is
// still fully present and correct.
test("wired: an absent hook never gates readiness (NVA-PREPUSHVISIBLE-1) -- status/exit code stay ready/0, and the observation still names the install command", () => {
  withFreshRepo("wired-absent", (dir) => {
    const result = observePipelineStartPreflight({
      env: {},
      pluginList: pluginList(),
      read: () => manifest,
      cwd: dir,
      scriptUrl: noSelfApplicationGitScriptUrl(dir),
    });
    assert.equal(result.status, "ready");
    assert.ok(result.prePushHook);
    assert.equal(result.prePushHook.state, "absent");
    assert.ok(result.prePushHook.installCommand);
    assert.equal(pipelineStartPreflightExitCode(result), 0);
  });
});

test("wired: a declined repository is ready, and the result still shows the decline with its timestamp", () => {
  withFreshRepo("wired-declined", (dir) => {
    const decline = applyDecline({ rootDir: dir });
    assert.equal(decline.status, "declined");
    const result = observePipelineStartPreflight({
      env: {},
      pluginList: pluginList(),
      read: () => manifest,
      cwd: dir,
      scriptUrl: noSelfApplicationGitScriptUrl(dir),
    });
    assert.equal(result.status, "ready");
    assert.ok(result.prePushHook);
    assert.equal(result.prePushHook.state, "declined");
    assert.equal(result.prePushHook.declinedAt, decline.declinedAt);
    assert.equal(pipelineStartPreflightExitCode(result), 0);
  });
});

// NVA-PREPUSHVISIBLE-1: deliberately inverted, same reasoning as the "wired-absent" test above.
test("wired: a foreign/modified hook never gates readiness either (NVA-PREPUSHVISIBLE-1)", () => {
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
    assert.equal(result.status, "ready");
    assert.equal(result.prePushHook.state, "present-but-not-ours-or-modified");
    assert.equal(pipelineStartPreflightExitCode(result), 0);
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
  assert.equal(Object.hasOwn(result, "prePushHookUnseenRemotePush"), false,
    "the sibling DoD (c) field reuses the SAME omission condition and must be absent too");
  assert.equal(result.status, "ready");
  assert.equal(pipelineStartPreflightExitCode(result), 0);
});

// NVA-PREPUSHVISIBLE-1: deliberately inverted, same reasoning as the two tests above.
test("wired: a Claude-runner session observes the same hook state as any other runner (not runner-gated), and it never gates readiness either", () => {
  withFreshRepo("wired-claude", (dir) => {
    const result = observePipelineStartPreflight({
      env: { CLAUDECODE: "1" },
      pluginList: pluginList(),
      read: () => manifest,
      cwd: dir,
      scriptUrl: noSelfApplicationGitScriptUrl(dir),
    });
    assert.equal(result.status, "ready");
    assert.equal(result.prePushHook.state, "absent");
    assert.equal(pipelineStartPreflightExitCode(result), 0);
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

// ---- DoD (c): a push the hook never saw becomes visible ---------------------

test("observeUnseenPushToRemote: a remote-tracking ref with no matching log entry is reported unseen", () => {
  withFreshRepo("unseen", (dir) => {
    const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8" }).trim();
    setUpstream(dir, head);
    writeHookLog(dir, [
      { schema: "pipeline.pre-push-hook-log.v1", at: new Date().toISOString(), verdict: "allowed", commit: "0".repeat(40).replace(/0$/, "1"), localRef: "refs/heads/other", remoteRef: "refs/heads/other" },
    ]);
    const result = observeUnseenPushToRemote({ rootDir: dir });
    assert.equal(result.schema, PRE_PUSH_HOOK_UNSEEN_REMOTE_PUSH_SCHEMA);
    assert.equal(result.state, "unseen");
    assert.equal(result.commit, head);
    assert.match(result.remoteRef, /refs\/remotes\/origin\/main/);
  });
});

test("observeUnseenPushToRemote: a remote-tracking ref whose commit IS in the log is not reported (seen)", () => {
  withFreshRepo("seen", (dir) => {
    const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8" }).trim();
    setUpstream(dir, head);
    writeHookLog(dir, [
      { schema: "pipeline.pre-push-hook-log.v1", at: new Date().toISOString(), verdict: "allowed", commit: head, localRef: "refs/heads/main", remoteRef: "refs/heads/main" },
    ]);
    const result = observeUnseenPushToRemote({ rootDir: dir });
    assert.equal(result.state, "seen");
    assert.equal(result.commit, head);
  });
});

test("observeUnseenPushToRemote: a repository with no log at all reports nothing rather than reporting everything as a bypass", () => {
  withFreshRepo("no-log", (dir) => {
    const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8" }).trim();
    setUpstream(dir, head);
    // Deliberately no writeHookLog call at all -- no log.jsonl anywhere under commonDir.
    const result = observeUnseenPushToRemote({ rootDir: dir });
    assert.equal(result.state, "not-checked");
    assert.equal(Object.hasOwn(result, "commit"), false);
  });
});

test("observeUnseenPushToRemote: no remote-tracking ref at all reports nothing", () => {
  withFreshRepo("no-upstream", (dir) => {
    // Deliberately no setUpstream call -- @{u} has nothing to resolve.
    const result = observeUnseenPushToRemote({ rootDir: dir });
    assert.equal(result.state, "not-checked");
  });
});

test("observeUnseenPushToRemote: repository-unresolved (no git repo at all) reports nothing, never crashes", () => {
  withPlainDir("no-git-unseen", (dir) => {
    const result = observeUnseenPushToRemote({ rootDir: dir });
    assert.equal(result.state, "not-checked");
  });
});

// NVA-PREPUSHVISIBLE-1 (c): pinned explicitly, per the briefing, because it is the property
// most likely to be broken by a later change -- an unseen push is evidence for a human, never
// a gate on status or the exit code.
test("wired: an unseen push never gates readiness or the exit code, and is still visible in the result", () => {
  withFreshRepo("wired-unseen", (dir) => {
    const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8" }).trim();
    setUpstream(dir, head);
    writeHookLog(dir, [
      { schema: "pipeline.pre-push-hook-log.v1", at: new Date().toISOString(), verdict: "allowed", commit: "0".repeat(40).replace(/0$/, "1"), localRef: "refs/heads/other", remoteRef: "refs/heads/other" },
    ]);
    const result = observePipelineStartPreflight({
      env: {},
      pluginList: pluginList(),
      read: () => manifest,
      cwd: dir,
      scriptUrl: noSelfApplicationGitScriptUrl(dir),
    });
    assert.equal(result.status, "ready");
    assert.equal(pipelineStartPreflightExitCode(result), 0);
    assert.ok(result.prePushHookUnseenRemotePush);
    assert.equal(result.prePushHookUnseenRemotePush.state, "unseen");
    assert.equal(result.prePushHookUnseenRemotePush.commit, head);
  });
});

test("wired: a seen push (in the log) never gates readiness either, status/exit code unaffected", () => {
  withFreshRepo("wired-seen", (dir) => {
    const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8" }).trim();
    setUpstream(dir, head);
    writeHookLog(dir, [
      { schema: "pipeline.pre-push-hook-log.v1", at: new Date().toISOString(), verdict: "allowed", commit: head, localRef: "refs/heads/main", remoteRef: "refs/heads/main" },
    ]);
    const result = observePipelineStartPreflight({
      env: {},
      pluginList: pluginList(),
      read: () => manifest,
      cwd: dir,
      scriptUrl: noSelfApplicationGitScriptUrl(dir),
    });
    assert.equal(result.status, "ready");
    assert.equal(pipelineStartPreflightExitCode(result), 0);
    assert.equal(result.prePushHookUnseenRemotePush.state, "seen");
  });
});

test("wired: an injected observeUnseenPushToRemoteFn is honored, proving the call site actually forwards cwd rather than a hardcoded value", () => {
  const calls = [];
  const dir = "/some/repo/root";
  const result = observePipelineStartPreflight({
    env: {},
    pluginList: pluginList(),
    read: () => manifest,
    cwd: dir,
    scriptUrl: noSelfApplicationGitScriptUrl(dir),
    // The sibling observation is also injected here, as "not-repository-unresolved", purely
    // so this field's own omission condition (which reuses THAT observation's state -- see
    // the wiring comment in pipeline-start-preflight.mjs) does not hide the field for this
    // fake, never-resolvable `dir` -- unrelated to what this test is actually proving.
    observePrePushHookInstallationFn: () => ({ schema: PRE_PUSH_HOOK_OBSERVATION_SCHEMA, state: "installed-and-current", installed: true, installCommand: null }),
    observeUnseenPushToRemoteFn: (options) => {
      calls.push(options);
      return { schema: PRE_PUSH_HOOK_UNSEEN_REMOTE_PUSH_SCHEMA, state: "unseen", remoteRef: "refs/remotes/origin/main", commit: "deadbeef" };
    },
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].rootDir, dir);
  assert.equal(result.status, "ready");
  assert.equal(result.prePushHookUnseenRemotePush.state, "unseen");
});
