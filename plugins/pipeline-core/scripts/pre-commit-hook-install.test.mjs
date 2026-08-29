#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * pre-commit-hook-install.test.mjs — NVA-W11-PRECOMMITGUARD. Covers: staged-path
 * enumeration (incl. the pre-first-commit empty-tree fallback), the fail-closed "cannot
 * evaluate" branch, refusal of a real `git commit` that stages a gate-strength- or
 * testpath-protected path with no consumed capability, an allow once a matching consumed
 * capability exists, a script-driven bypass of the PreToolUse layer still being blocked at
 * the commit boundary (the backlog item's own reported gap), a non-protected path staying
 * unaffected, install/removal safety, and decline recording.
 *
 * Run: node --test plugins/pipeline-core/scripts/pre-commit-hook-install.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  renderShim,
  renderImpl,
  planInstall,
  applyInstall,
  planRemoval,
  applyRemoval,
  planDecline,
  applyDecline,
  DECLINE_MARKER_SCHEMA,
} from "./pre-commit-hook-install.mjs";

const PLUGIN_ROOT = fileURLToPath(new URL("..", import.meta.url));
const PLUGIN_LIB_DIR = join(PLUGIN_ROOT, "lib");
const PLUGIN_HOOKS_DIR = join(PLUGIN_ROOT, "hooks");
const PLUGIN_SCRIPTS_DIR = join(PLUGIN_ROOT, "scripts");
const PLUGIN_DIRS = { pluginLibDir: PLUGIN_LIB_DIR, pluginHooksDir: PLUGIN_HOOKS_DIR, pluginScriptsDir: PLUGIN_SCRIPTS_DIR };

/** The generated impl.mjs is self-contained (it must run standalone against a real git repo),
 * so its pure exported helper (`stagedPaths`) is exercised by writing the REAL rendered output
 * to a temp file and importing it directly -- never a second, hand-copied implementation of the
 * same logic that could silently drift from what actually gets installed. */
let implModulePromise;
function implModule() {
  if (!implModulePromise) {
    const dir = mkdtempSync(join(tmpdir(), "pre-commit-hook-implmod-"));
    const file = join(dir, "impl.mjs");
    writeFileSync(file, renderImpl(PLUGIN_DIRS));
    implModulePromise = import(`file://${file}`);
  }
  return implModulePromise;
}

function freshRepo(prefix, { commitInitial = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), `pre-commit-hook-${prefix}-`));
  const git = (...args) => spawnSync("git", args, { cwd: dir, encoding: "utf8", timeout: 20000 });
  git("init", "-q", "-b", "main");
  git("config", "user.email", "goldfish@example.invalid");
  git("config", "user.name", "Goldfish");
  if (commitInitial) {
    writeFileSync(join(dir, "README.md"), "fixture\n");
    git("add", "README.md");
    git("commit", "-q", "-m", "init");
  }
  return { dir, git };
}

function commonDirOf(dir) {
  const res = spawnSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: dir, encoding: "utf8" });
  return res.stdout.trim();
}

/** Writes a `protectedTestPaths` guard-config entry the way this repo's own resolution does for
 * an unconfigured (no pipeline.yaml/pipeline.json) project: `.claude/guard-config.json`
 * (`resolveGuardConfigPath`'s legacy fallback). */
function writeTestPathConfig(dir, entries) {
  mkdirSync(join(dir, ".claude"), { recursive: true });
  writeFileSync(join(dir, ".claude", "guard-config.json"), JSON.stringify({ protectedTestPaths: entries }));
}

/** Writes a CONSUMED human-guard-override capability covering `eligiblePaths` exactly, in the
 * same storage layout `human-guard-override.mjs` writes and
 * `check-protected-path-integrity.mjs`'s `defaultHasConsumedCapabilityForPath` reads. */
function writeConsumedCapability(dir, eligiblePaths) {
  const commonDir = commonDirOf(dir);
  const capsDir = join(commonDir, "agent-pipeline", "human-guard-overrides", "capabilities");
  mkdirSync(capsDir, { recursive: true });
  writeFileSync(join(capsDir, "test-capability.json"), JSON.stringify({ status: "consumed", eligiblePaths }));
}

/** Installs the real hook into `dir`, then runs an actual `git commit` -- exactly the boundary
 * this hook exists to guard, not a direct invocation of the hook binary. */
function installHook(dir) {
  const install = applyInstall({ rootDir: dir, ...PLUGIN_DIRS });
  assert.equal(install.status, "installed", `precondition: install must succeed (${JSON.stringify(install)})`);
  return install;
}

function commit(dir, message, { allowEmpty = false } = {}) {
  const args = ["commit", "-m", message];
  if (allowEmpty) args.push("--allow-empty");
  const result = spawnSync("git", args, { cwd: dir, encoding: "utf8", timeout: 20000 });
  return { code: result.status, stderr: result.stderr ?? "", stdout: result.stdout ?? "" };
}

// ---- staged-path enumeration (pure helper, real generated impl) -----------------------

test("stagedPaths: lists a newly staged file relative to HEAD", async () => {
  const { stagedPaths } = await implModule();
  const { dir, git } = freshRepo("staged-basic");
  writeFileSync(join(dir, "notes.txt"), "hello\n");
  git("add", "notes.txt");
  const paths = stagedPaths(dir);
  assert.deepEqual(paths, ["notes.txt"]);
});

test("stagedPaths: falls back to the empty-tree comparison before any commit exists", async () => {
  const { stagedPaths } = await implModule();
  const { dir, git } = freshRepo("staged-no-head", { commitInitial: false });
  writeFileSync(join(dir, "first.txt"), "hello\n");
  git("add", "first.txt");
  const paths = stagedPaths(dir);
  assert.deepEqual(paths, ["first.txt"]);
});

test("stagedPaths: nothing staged yields an empty array, not null", async () => {
  const { stagedPaths } = await implModule();
  const { dir } = freshRepo("staged-empty");
  assert.deepEqual(stagedPaths(dir), []);
});

// ---- end-to-end: fail-closed branch -----------------------------------------------------

test("installed hook impl: repository root unresolvable (invoked outside any git repo) -> BLOCK", () => {
  const dir = mkdtempSync(join(tmpdir(), "pre-commit-hook-e2e-no-repo-"));
  const implContent = renderImpl(PLUGIN_DIRS);
  const implFile = join(dir, "impl.mjs");
  writeFileSync(implFile, implContent);
  const result = spawnSync(process.execPath, [implFile], { cwd: dir, encoding: "utf8", timeout: 15000 });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /root\/common-dir could not be resolved/);
});

// ---- end-to-end: a real `git commit` staging a protected path -----------------------------

test("installed hook: staged gate-strength-protected path (pipeline.user.yaml, GS-1), no consumed capability -> commit refused", () => {
  const { dir, git } = freshRepo("e2e-gate-strength-block");
  installHook(dir);
  writeFileSync(join(dir, "pipeline.user.yaml"), "gates:\n  push_approval: chat\n");
  git("add", "pipeline.user.yaml");
  const { code, stderr } = commit(dir, "attempt gate-strength change");
  assert.notEqual(code, 0);
  assert.match(stderr, /BLOCKED \(agent-pipeline pre-commit hook\)/);
  assert.match(stderr, /GS-1/);
  assert.match(stderr, /pipeline\.user\.yaml/);
  assert.doesNotMatch(stderr, /--no-verify/);
  assert.match(stderr, /HUMAN OPERATOR ONLY/);
  assert.match(stderr, /agent MUST NOT/);
});

test("installed hook: staged testpath-protected path, no consumed capability -> commit refused", () => {
  const { dir, git } = freshRepo("e2e-testpath-block");
  writeTestPathConfig(dir, [{ pattern: "protected-suite\\.test\\.mjs$", reason: "fixture protected suite", id: "TP-1" }]);
  git("add", ".claude/guard-config.json");
  git("commit", "-q", "-m", "seed guard-config");
  installHook(dir);
  writeFileSync(join(dir, "protected-suite.test.mjs"), "// tampered\n");
  git("add", "protected-suite.test.mjs");
  const { code, stderr } = commit(dir, "attempt test-path change");
  assert.notEqual(code, 0);
  assert.match(stderr, /TP-1/);
  assert.match(stderr, /protected-suite\.test\.mjs/);
  assert.match(stderr, /fixture protected suite/);
});

test("installed hook: a spawned Node process writing directly to a protected path (never crossing any PreToolUse hook) is still refused at commit", () => {
  // This is the backlog item's own reported gap, reproduced without any Edit/Write tool call:
  // fs.writeFileSync from a plain spawned `node -e` process, exactly the shape the item names.
  const { dir, git } = freshRepo("e2e-spawned-bypass");
  installHook(dir);
  const target = join(dir, "project", "pipeline.json");
  mkdirSync(join(dir, "project"), { recursive: true });
  const bypass = spawnSync(process.execPath, ["-e", `require("fs").writeFileSync(${JSON.stringify(target)}, "{}\\n")`], { encoding: "utf8" });
  assert.equal(bypass.status, 0, "the bypass write itself must succeed -- it never crosses any PreToolUse hook");
  git("add", "project/pipeline.json");
  const { code, stderr } = commit(dir, "attempt via spawned bypass");
  assert.notEqual(code, 0);
  assert.match(stderr, /GS-10/);
});

test("installed hook: staged path with a matching CONSUMED capability -> commit ALLOWED", () => {
  const { dir, git } = freshRepo("e2e-consumed-allowed");
  installHook(dir);
  writeConsumedCapability(dir, ["pipeline.user.yaml"]);
  writeFileSync(join(dir, "pipeline.user.yaml"), "gates:\n  push_approval: chat\n");
  git("add", "pipeline.user.yaml");
  const { code, stderr } = commit(dir, "authorized gate-strength change");
  assert.equal(code, 0, stderr);
});

test("installed hook: staged NON-protected path is unaffected -> commit succeeds", () => {
  const { dir, git } = freshRepo("e2e-non-protected");
  installHook(dir);
  writeFileSync(join(dir, "notes.txt"), "an ordinary file\n");
  git("add", "notes.txt");
  const { code, stderr } = commit(dir, "ordinary change");
  assert.equal(code, 0, stderr);
});

test("installed hook: nothing staged (--allow-empty) -> commit succeeds", () => {
  const { dir } = freshRepo("e2e-empty-commit");
  installHook(dir);
  const { code, stderr } = commit(dir, "empty", { allowEmpty: true });
  assert.equal(code, 0, stderr);
});

// ---- install/removal safety (mirrors pre-push-hook-install.test.mjs) ----------------------

test("applyInstall: refuses to overwrite a pre-existing foreign hook", () => {
  const { dir } = freshRepo("install-foreign");
  const res = spawnSync("git", ["rev-parse", "--path-format=absolute", "--git-path", "hooks/pre-commit"], { cwd: dir, encoding: "utf8" });
  const hookPath = res.stdout.trim();
  mkdirSync(join(hookPath, ".."), { recursive: true });
  writeFileSync(hookPath, "#!/bin/sh\necho a human already had this\n");
  chmodSync(hookPath, 0o755);
  const before = readFileSync(hookPath, "utf8");
  const result = applyInstall({ rootDir: dir, ...PLUGIN_DIRS });
  assert.equal(result.status, "refused-foreign-hook");
  assert.equal(readFileSync(hookPath, "utf8"), before, "foreign hook content must be untouched");
});

test("applyInstall then applyRemoval: removes exactly what was installed", () => {
  const { dir } = freshRepo("install-remove-roundtrip");
  const install = applyInstall({ rootDir: dir, ...PLUGIN_DIRS });
  assert.equal(install.status, "installed");
  assert.ok(existsSync(install.hookPath));
  assert.ok(existsSync(install.implPath));
  const removal = applyRemoval({ rootDir: dir });
  assert.equal(removal.status, "removed");
  assert.equal(existsSync(install.hookPath), false);
  assert.equal(existsSync(install.implPath), false);
});

test("applyRemoval: refuses when the installed hook was modified after install", () => {
  const { dir } = freshRepo("remove-modified");
  const install = applyInstall({ rootDir: dir, ...PLUGIN_DIRS });
  assert.equal(install.status, "installed");
  writeFileSync(install.hookPath, "#!/bin/sh\necho tampered\n");
  const plan = planRemoval({ rootDir: dir });
  assert.equal(plan.status, "refused-modified-hook");
  const removal = applyRemoval({ rootDir: dir });
  assert.equal(removal.status, "refused-modified-hook");
  assert.ok(existsSync(install.hookPath), "tampered hook must not be silently deleted");
});

test("applyRemoval: nothing-to-remove when never installed", () => {
  const { dir } = freshRepo("remove-nothing");
  const removal = applyRemoval({ rootDir: dir });
  assert.equal(removal.status, "nothing-to-remove");
});

test("planInstall then applyInstall: reinstalling over our OWN prior install upgrades cleanly", () => {
  const { dir } = freshRepo("reinstall-own");
  const first = applyInstall({ rootDir: dir, ...PLUGIN_DIRS });
  assert.equal(first.status, "installed");
  const plan = planInstall({ rootDir: dir, ...PLUGIN_DIRS });
  assert.equal(plan.status, "ready-to-upgrade");
  const second = applyInstall({ rootDir: dir, ...PLUGIN_DIRS });
  assert.equal(second.status, "installed");
});

// ---- generated content sanity -----------------------------------------------------------

test("renderShim: execs the impl file with an absolute, JSON-quoted path", () => {
  const shim = renderShim("/abs/path/impl.mjs");
  assert.match(shim, /^#!\/bin\/sh/);
  assert.match(shim, /exec node "\/abs\/path\/impl\.mjs" "\$@"/);
});

test("renderImpl: the agent-facing refusal marks any override as human-operator-only, without naming the bypass flag as an instruction", () => {
  const impl = renderImpl(PLUGIN_DIRS);
  const blockStart = impl.indexOf("function block(lines) {");
  const blockEnd = impl.indexOf("\n}\n", blockStart);
  assert.ok(blockStart !== -1 && blockEnd !== -1, "block()'s own function body must be present in the generated source");
  const printedRefusal = impl.slice(blockStart, blockEnd);
  assert.doesNotMatch(printedRefusal, /--no-verify/, "the printed refusal must never teach the exact bypass flag");
  assert.match(printedRefusal, /HUMAN OPERATOR ONLY/);
  assert.match(printedRefusal, /agent MUST NOT/);
});

// ---- decline recording --------------------------------------------------------------------

test("applyDecline: records a decline marker with a timestamp, no name/credential", () => {
  const { dir } = freshRepo("decline-record");
  const result = applyDecline({ rootDir: dir });
  assert.equal(result.status, "declined");
  assert.match(result.declinedAt, /^\d{4}-\d{2}-\d{2}T/);
  const commonDir = commonDirOf(dir);
  const markerPath = join(commonDir, "agent-pipeline", "pre-commit-hook", "decline-marker.json");
  assert.ok(existsSync(markerPath));
  const marker = JSON.parse(readFileSync(markerPath, "utf8"));
  assert.equal(marker.schema, DECLINE_MARKER_SCHEMA);
  assert.deepEqual(Object.keys(marker).sort(), ["declinedAt", "schema"]);
});

test("planDecline: read-only, repository-unresolved when no git repo present", () => {
  const dir = mkdtempSync(join(tmpdir(), "pre-commit-hook-plandecline-norepo-"));
  const plan = planDecline({ rootDir: dir });
  assert.equal(plan.status, "repository-unresolved");
});

test("planInstall: reports 'declined' distinctly from 'ready' after a decline is recorded", () => {
  const { dir } = freshRepo("decline-then-plan");
  const before = planInstall({ rootDir: dir, ...PLUGIN_DIRS });
  assert.equal(before.status, "ready");
  const decline = applyDecline({ rootDir: dir });
  assert.equal(decline.status, "declined");
  const after = planInstall({ rootDir: dir, ...PLUGIN_DIRS });
  assert.equal(after.status, "declined");
  assert.equal(after.declinedAt, decline.declinedAt);
});

test("applyInstall: installing after a decline succeeds (declining is not a permanent refusal)", () => {
  const { dir } = freshRepo("decline-then-install");
  const decline = applyDecline({ rootDir: dir });
  assert.equal(decline.status, "declined");
  const install = applyInstall({ rootDir: dir, ...PLUGIN_DIRS });
  assert.equal(install.status, "installed");
  assert.ok(existsSync(install.hookPath));
});

test("planInstall: a decline marker never suppresses an already-installed hook", () => {
  const { dir } = freshRepo("decline-does-not-suppress-installed");
  const install = applyInstall({ rootDir: dir, ...PLUGIN_DIRS });
  assert.equal(install.status, "installed");
  const decline = applyDecline({ rootDir: dir });
  assert.equal(decline.status, "declined");
  const plan = planInstall({ rootDir: dir, ...PLUGIN_DIRS });
  assert.equal(plan.status, "ready-to-upgrade");
  assert.notEqual(plan.status, "declined");
});
