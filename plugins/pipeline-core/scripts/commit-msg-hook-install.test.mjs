#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  applyInstall,
  applyRemoval,
  planInstall,
  planRemoval,
} from "./commit-msg-hook-install.mjs";

const PLUGIN_LIB_DIR = join(fileURLToPath(new URL("..", import.meta.url)), "lib");

function freshRepo(name) {
  const dir = mkdtempSync(join(tmpdir(), `commit-msg-hook-${name}-`));
  const git = (...args) => spawnSync("git", args, { cwd: dir, encoding: "utf8", timeout: 20_000 });
  assert.equal(git("init", "-q", "-b", "main").status, 0);
  assert.equal(git("config", "user.email", "fixture@example.invalid").status, 0);
  assert.equal(git("config", "user.name", "Fixture Human").status, 0);
  return { dir, git };
}

function hookPath(dir) {
  return spawnSync("git", ["rev-parse", "--path-format=absolute", "--git-path", "hooks/commit-msg"], {
    cwd: dir,
    encoding: "utf8",
  }).stdout.trim();
}

function commitWithMessage(dir, git, message) {
  writeFileSync(join(dir, "content.txt"), `${Math.random()}\n`, { flag: "a" });
  assert.equal(git("add", "content.txt").status, 0);
  const path = join(dir, "message.txt");
  writeFileSync(path, message);
  return git("commit", "-F", path);
}

function install(dir) {
  const result = applyInstall({ rootDir: dir, pluginLibDir: PLUGIN_LIB_DIR });
  assert.equal(result.status, "installed");
  return result;
}

function writeTrailerPolicy(dir, mode) {
  const configDir = join(dir, "project");
  mkdirSync(configDir, { recursive: true });
  writeFileSync(join(configDir, "guard-config.json"), `${JSON.stringify({ commitTrailerPolicy: mode }, null, 2)}\n`);
}

test("installed hook allows a valid contiguous Pipeline provenance block", () => {
  const { dir, git } = freshRepo("valid");
  install(dir);
  const result = commitWithMessage(dir, git, "feat: valid\n\nAI-Assisted: true\nDispatch: stage-0 (elephant)\n");
  assert.equal(result.status, 0, result.stderr);
});

test("installed shim treats shell syntax, apostrophes, whitespace and newlines in its path as literal bytes", () => {
  const dir = mkdtempSync(join(
    tmpdir(),
    "commit-msg path ' $(touch${IFS}SHIM_SENTINEL) `touch${IFS}BACKTICK_SENTINEL` $SHIM_EXPANSION line\nnext-",
  ));
  const git = (...args) => spawnSync("git", args, {
    cwd: dir,
    encoding: "utf8",
    timeout: 20_000,
    env: { ...process.env, SHIM_EXPANSION: "EXPANDED" },
  });
  assert.equal(git("init", "-q", "-b", "main").status, 0);
  assert.equal(git("config", "user.email", "fixture@example.invalid").status, 0);
  assert.equal(git("config", "user.name", "Fixture Human").status, 0);
  install(dir);

  const result = commitWithMessage(dir, git, "feat: literal shim path\n\nAI-Assisted: true\nDispatch: stage-0 (elephant)\n");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(join(dir, "SHIM_SENTINEL")), false, "dollar-paren substitution must not execute");
  assert.equal(existsSync(join(dir, "BACKTICK_SENTINEL")), false, "backtick substitution must not execute");
  assert.equal(existsSync(join(dir, "EXPANDED")), false, "shell variables in the path must not expand");
});

test("installed hook blocks provenance split by a blank line", () => {
  const { dir, git } = freshRepo("split");
  install(dir);
  const result = commitWithMessage(dir, git, "feat: split\n\nDispatch: stage-0 (elephant)\n\nAI-Assisted: true\n");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /GIT-03-DISPATCH-MISSING/);
});

for (const [name, message, expected] of [
  ["marker-only", "feat: marker\n\nAI-Assisted: true\n", /GIT-03-DISPATCH-MISSING/],
  ["dispatch-only", "feat: dispatch\n\nDispatch: stage-0 \(elephant\)\n", /GIT-03-MARKER-MISSING/],
]) {
  test(`installed hook blocks ${name} provenance`, () => {
    const { dir, git } = freshRepo(name);
    install(dir);
    const result = commitWithMessage(dir, git, message);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, expected);
  });
}

test("installed hook blocks provider and session correlation", () => {
  const { dir, git } = freshRepo("correlation");
  install(dir);
  const result = commitWithMessage(dir, git, "feat: leaked context\n\nSession-Id: private-run\nCo-Authored-By: Codex <bot@example.invalid>\n");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /GIT-03-CORRELATION-TRAILER/);
  assert.match(result.stderr, /GIT-03-PROVIDER-COAUTHOR/);
});

test("installed hook blocks an unprovenanced commit in a Pipeline-managed repository", () => {
  const { dir, git } = freshRepo("human");
  install(dir);
  const result = commitWithMessage(dir, git, "docs: written by a person\n");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /GIT-03-MARKER-MISSING/);
  assert.match(result.stderr, /GIT-03-DISPATCH-MISSING/);
});

test("installed hook blocks a shell-script-wrapped commit without Pipeline provenance", () => {
  const { dir, git } = freshRepo("script-bypass");
  install(dir);
  const script = join(dir, "bypass.sh");
  writeFileSync(script, "#!/bin/sh\ngit commit --allow-empty -m 'chore: bypass'\n");
  const result = spawnSync("bash", [script], { cwd: dir, encoding: "utf8", timeout: 20_000 });
  assert.notEqual(result.status, 0, result.stderr);
  assert.match(result.stderr, /GIT-03-MARKER-MISSING/);
  assert.match(result.stderr, /GIT-03-DISPATCH-MISSING/);
  assert.equal(git("log", "--format=%s", "-1").stdout.trim(), "", "the wrapper must not create a commit");
});

test("absent policy defaults to blocking incomplete signaled provenance", () => {
  const { dir, git } = freshRepo("default-blocking");
  install(dir);
  const result = commitWithMessage(dir, git, "feat: incomplete\n\nAI-Assisted: true\n");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /GIT-03-DISPATCH-MISSING/);
});

test("warn policy reports incomplete signaled provenance but allows the commit", () => {
  const { dir, git } = freshRepo("warn");
  writeTrailerPolicy(dir, "warn");
  install(dir);
  const result = commitWithMessage(dir, git, "feat: migrating\n\nAI-Assisted: true\n");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /WARN .*GIT-03-DISPATCH-MISSING.*commitTrailerPolicy is warn/s);
});

test("off policy does not produce provenance findings", () => {
  const { dir, git } = freshRepo("off");
  writeTrailerPolicy(dir, "off");
  install(dir);
  const result = commitWithMessage(dir, git, "feat: explicitly disabled\n\nAI-Assisted: true\n");
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stderr, /GIT-03-DISPATCH-MISSING|WARN/);
});

test("off policy still blocks provider and session correlation", () => {
  const { dir, git } = freshRepo("off-correlation");
  writeTrailerPolicy(dir, "off");
  install(dir);
  const result = commitWithMessage(dir, git, "feat: correlation is never configurable\n\nSession-Id: private-run\n");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /GIT-03-CORRELATION-TRAILER/);
});

test("applyInstall refuses a foreign commit-msg hook without changing it", () => {
  const { dir } = freshRepo("foreign");
  const path = hookPath(dir);
  mkdirSync(dirname(path), { recursive: true });
  const foreign = "#!/bin/sh\necho foreign\n";
  writeFileSync(path, foreign);
  chmodSync(path, 0o755);
  const result = applyInstall({ rootDir: dir, pluginLibDir: PLUGIN_LIB_DIR });
  assert.equal(result.status, "refused-foreign-hook");
  assert.equal(readFileSync(path, "utf8"), foreign);
});

test("install, managed upgrade and removal preserve ownership checks", () => {
  const { dir } = freshRepo("lifecycle");
  assert.equal(planInstall({ rootDir: dir }).status, "ready");
  const first = applyInstall({ rootDir: dir, pluginLibDir: PLUGIN_LIB_DIR });
  assert.equal(first.status, "installed");
  assert.equal(planInstall({ rootDir: dir }).status, "ready-to-upgrade");
  const second = applyInstall({ rootDir: dir, pluginLibDir: PLUGIN_LIB_DIR });
  assert.equal(second.status, "upgraded");
  assert.equal(planRemoval({ rootDir: dir }).status, "ready");
  assert.equal(applyRemoval({ rootDir: dir }).status, "removed");
  assert.equal(existsSync(first.hookPath), false);
  assert.equal(existsSync(first.implPath), false);
  assert.equal(planRemoval({ rootDir: dir }).status, "nothing-to-remove");
});

test("upgrade and removal refuse a modified managed hook", () => {
  const { dir } = freshRepo("modified");
  const installed = install(dir);
  writeFileSync(installed.hookPath, "#!/bin/sh\necho modified\n");
  const upgrade = applyInstall({ rootDir: dir, pluginLibDir: PLUGIN_LIB_DIR });
  assert.equal(upgrade.status, "refused-modified-or-unreadable-managed-install");
  const removal = applyRemoval({ rootDir: dir });
  assert.equal(removal.status, "refused-modified-or-unreadable-managed-install");
  assert.equal(existsSync(installed.hookPath), true);
  assert.equal(existsSync(installed.implPath), true);
});

test("upgrade and removal refuse a modified managed implementation", () => {
  const { dir } = freshRepo("modified-impl");
  const installed = install(dir);
  writeFileSync(installed.implPath, "throw new Error('changed');\n");
  assert.equal(
    applyInstall({ rootDir: dir, pluginLibDir: PLUGIN_LIB_DIR }).status,
    "refused-modified-or-unreadable-managed-install",
  );
  assert.equal(applyRemoval({ rootDir: dir }).status, "refused-modified-or-unreadable-managed-install");
  assert.equal(existsSync(installed.hookPath), true);
  assert.equal(existsSync(installed.implPath), true);
});

test("generated hook fails closed when Git's message file is unreadable", () => {
  const { dir } = freshRepo("unreadable-message");
  const installed = install(dir);
  const result = spawnSync(installed.hookPath, [join(dir, "missing-message.txt")], { cwd: dir, encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /could not be read/);
});

test("generated hook fails closed when its install-bound policy module is unavailable", () => {
  const { dir, git } = freshRepo("missing-policy");
  const absentLibDir = join(dir, "absent-plugin-lib");
  const installed = applyInstall({ rootDir: dir, pluginLibDir: absentLibDir });
  assert.equal(installed.status, "installed");
  const result = commitWithMessage(dir, git, "feat: cannot be evaluated\n");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /policy could not be loaded/);
});
