#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * pre-push-hook-install.test.mjs — NVA-PREPUSH-1. Covers: stdin ref-update parsing
 * (incl. the delete case), the fail-closed "cannot evaluate" branches of the generated
 * hook, a satisfied gate allowing the push, refusal to overwrite a foreign hook, and
 * the durable per-push record being written for both verdicts.
 *
 * Run: node plugins/pipeline-core/scripts/pre-push-hook-install.test.mjs
 * Exit: 0 = all cases pass · 1 = at least one case failed (failure list on stdout).
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
} from "./pre-push-hook-install.mjs";

const PLUGIN_LIB_DIR = fileURLToPath(new URL("../lib", import.meta.url));
const ZERO40 = "0".repeat(40);

/** The generated impl.mjs is self-contained (it must run standalone in a project that
 * never imported this installer), so its pure helpers (`parseRefUpdates`,
 * `checkEvidenceFreshness`) are exercised by writing the REAL rendered output to a temp
 * file and importing it directly -- never a second, hand-copied implementation of the
 * same logic that could silently drift from what actually gets installed. */
let implModulePromise;
function implModule() {
  if (!implModulePromise) {
    const dir = mkdtempSync(join(tmpdir(), "pre-push-hook-implmod-"));
    const file = join(dir, "impl.mjs");
    writeFileSync(file, renderImpl(PLUGIN_LIB_DIR));
    implModulePromise = import(`file://${file}`);
  }
  return implModulePromise;
}

function freshRepo(prefix) {
  const dir = mkdtempSync(join(tmpdir(), `pre-push-hook-${prefix}-`));
  const git = (...args) => spawnSync("git", args, { cwd: dir, encoding: "utf8" });
  git("init", "-q", "-b", "main");
  git("config", "user.email", "goldfish@example.invalid");
  git("config", "user.name", "Goldfish");
  writeFileSync(join(dir, "README.md"), "fixture\n");
  git("add", "README.md");
  git("commit", "-q", "-m", "init");
  const head = git("rev-parse", "HEAD").stdout.trim();
  return { dir, head, git };
}

function writeManifest(dir, { mode = "blocking", approval = "required", security = null } = {}) {
  mkdirSync(join(dir, ".claude"), { recursive: true });
  let y = `schema: pipeline.manifest.v0\ngates:\n  push:\n    mode: ${mode}\n    type: human\n    approval: ${approval}\n`;
  if (security) y += `  security:\n    mode: ${security}\n    type: automated\n`;
  writeFileSync(join(dir, ".claude", "pipeline.yaml"), y);
}
function writeState(dir, obj) {
  mkdirSync(join(dir, ".claude"), { recursive: true });
  writeFileSync(join(dir, ".claude", "pipeline-state.json"), typeof obj === "string" ? obj : JSON.stringify(obj));
}
function writeEvidence(dir, relPath, obj) {
  const full = join(dir, relPath);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, typeof obj === "string" ? obj : JSON.stringify(obj));
}

/** Installs the real hook into `dir` and runs it against a crafted stdin, exactly as
 * git would invoke it (cwd = repo root, argv = remote name/url). */
function runInstalledHook(dir, stdin, { remote = "origin", url = "https://example.invalid/repo.git" } = {}) {
  const install = applyInstall({ rootDir: dir, pluginLibDir: PLUGIN_LIB_DIR });
  assert.equal(install.status, "installed", `precondition: install must succeed (${JSON.stringify(install)})`);
  const result = spawnSync(install.hookPath, [remote, url], { cwd: dir, input: stdin, encoding: "utf8", timeout: 15000 });
  return { code: result.status, stderr: result.stderr ?? "", stdout: result.stdout ?? "" };
}

function readLog(dir) {
  const res = spawnSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: dir, encoding: "utf8" });
  const commonDir = res.stdout.trim();
  const logPath = join(commonDir, "agent-pipeline", "pre-push-hook", "log.jsonl");
  if (!existsSync(logPath)) return [];
  return readFileSync(logPath, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

// ---- stdin parsing, including the delete case -----------------------------------------

test("parseRefUpdates: ordinary update line", async () => {
  const { parseRefUpdates } = await implModule();
  const [update] = parseRefUpdates("refs/heads/main abc123 refs/heads/main def456\n");
  assert.equal(update.localRef, "refs/heads/main");
  assert.equal(update.localSha, "abc123");
  assert.equal(update.remoteRef, "refs/heads/main");
  assert.equal(update.remoteSha, "def456");
  assert.equal(update.isDelete, false);
});

test("parseRefUpdates: delete case (local-sha all zeroes, 40-hex)", async () => {
  const { parseRefUpdates } = await implModule();
  const [update] = parseRefUpdates(`refs/heads/doomed ${ZERO40} refs/heads/doomed abc123\n`);
  assert.equal(update.isDelete, true);
});

test("parseRefUpdates: delete case (local-sha all zeroes, 64-hex/sha256 repo)", async () => {
  const { parseRefUpdates } = await implModule();
  const [update] = parseRefUpdates(`refs/heads/doomed ${"0".repeat(64)} refs/heads/doomed abc123\n`);
  assert.equal(update.isDelete, true);
});

test("parseRefUpdates: multiple lines, malformed lines ignored rather than fabricated", async () => {
  const { parseRefUpdates } = await implModule();
  const updates = parseRefUpdates("a b c d\nmalformed-line-with-too-few-fields\ne f g h\n");
  assert.equal(updates.length, 2);
  assert.equal(updates[0].localRef, "a");
  assert.equal(updates[1].localRef, "e");
});

test("parseRefUpdates: empty stdin yields no updates", async () => {
  const { parseRefUpdates } = await implModule();
  assert.deepEqual(parseRefUpdates(""), []);
});

// ---- checkEvidenceFreshness (pure) ------------------------------------------------------

test("checkEvidenceFreshness: missing file", async () => {
  const { checkEvidenceFreshness } = await implModule();
  const { dir } = freshRepo("evidence-missing");
  const failures = checkEvidenceFreshness(dir, "evidence/verify-latest.json", "deadbeef");
  assert.equal(failures.length, 1);
  assert.match(failures[0], /missing/);
});

test("checkEvidenceFreshness: corrupt JSON", async () => {
  const { checkEvidenceFreshness } = await implModule();
  const { dir } = freshRepo("evidence-corrupt");
  writeEvidence(dir, "evidence/verify-latest.json", "{not json");
  const failures = checkEvidenceFreshness(dir, "evidence/verify-latest.json", "deadbeef");
  assert.match(failures[0], /corrupted/);
});

test("checkEvidenceFreshness: stale commit binding", async () => {
  const { checkEvidenceFreshness } = await implModule();
  const { dir, head } = freshRepo("evidence-stale");
  writeEvidence(dir, "evidence/verify-latest.json", { exitCode: 0, commit: "not-the-head" });
  const failures = checkEvidenceFreshness(dir, "evidence/verify-latest.json", head);
  assert.ok(failures.some((f) => /stale/.test(f)));
});

test("checkEvidenceFreshness: fresh and exitCode 0 passes clean", async () => {
  const { checkEvidenceFreshness } = await implModule();
  const { dir, head } = freshRepo("evidence-fresh");
  writeEvidence(dir, "evidence/verify-latest.json", { exitCode: 0, commit: head });
  assert.deepEqual(checkEvidenceFreshness(dir, "evidence/verify-latest.json", head), []);
});

// ---- end-to-end: the installed hook, fail-closed branches -----------------------------

test("installed hook: no manifest at all -> allow (opt-in feature, not a 'cannot evaluate' case)", () => {
  const { dir, head } = freshRepo("e2e-no-manifest");
  const { code, stderr } = runInstalledHook(dir, `refs/heads/main ${head} refs/heads/main ${ZERO40}\n`);
  assert.equal(code, 0, stderr);
  const log = readLog(dir);
  assert.equal(log.at(-1).verdict, "allowed");
});

test("installed hook: push gate mode off -> allow", () => {
  const { dir, head } = freshRepo("e2e-mode-off");
  writeManifest(dir, { mode: "off" });
  const { code } = runInstalledHook(dir, `refs/heads/main ${head} refs/heads/main ${ZERO40}\n`);
  assert.equal(code, 0);
});

test("installed hook: manifest present but unparseable -> BLOCK (fail-closed, diverges from guard-push.mjs's WARN)", () => {
  const { dir, head } = freshRepo("e2e-bad-manifest");
  mkdirSync(join(dir, ".claude"), { recursive: true });
  writeFileSync(join(dir, ".claude", "pipeline.yaml"), "not: [valid: yaml: at all");
  const { code, stderr } = runInstalledHook(dir, `refs/heads/main ${head} refs/heads/main ${ZERO40}\n`);
  assert.equal(code, 1);
  assert.match(stderr, /could not be read/);
  const log = readLog(dir);
  assert.equal(log.at(-1).verdict, "blocked");
});

test("installed hook: verify evidence missing -> BLOCK", () => {
  const { dir, head } = freshRepo("e2e-verify-missing");
  writeManifest(dir, { approval: "standing-approved" });
  const { code, stderr } = runInstalledHook(dir, `refs/heads/main ${head} refs/heads/main ${ZERO40}\n`);
  assert.equal(code, 1);
  assert.match(stderr, /verify-latest\.json missing/);
});

test("installed hook: push approval state missing (approval required, not standing-approved) -> BLOCK", () => {
  const { dir, head } = freshRepo("e2e-approval-missing");
  writeManifest(dir, { approval: "required" });
  writeEvidence(dir, "evidence/verify-latest.json", { exitCode: 0, commit: head });
  const { code, stderr } = runInstalledHook(dir, `refs/heads/main ${head} refs/heads/main ${ZERO40}\n`);
  assert.equal(code, 1);
  assert.match(stderr, /push approval state .* is missing or unreadable/);
});

test("installed hook: repository root unresolvable (invoked outside any git repo) -> BLOCK", () => {
  const dir = mkdtempSync(join(tmpdir(), "pre-push-hook-e2e-no-repo-"));
  // No `git init` here at all -- deliberately not a repository, so `git rev-parse
  // --show-toplevel` fails and the hook must fail closed rather than guess a root.
  const implContent = renderImpl(PLUGIN_LIB_DIR);
  const implFile = join(dir, "impl.mjs");
  writeFileSync(implFile, implContent);
  const result = spawnSync(process.execPath, [implFile], { cwd: dir, input: "a b c d\n", encoding: "utf8", timeout: 15000 });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /root\/common-dir could not be resolved/);
});

// ---- end-to-end: a satisfied gate allows the push --------------------------------------

test("installed hook: fresh verify evidence + standing-approved -> ALLOW, record written", () => {
  const { dir, head } = freshRepo("e2e-satisfied");
  writeManifest(dir, { approval: "standing-approved" });
  writeEvidence(dir, "evidence/verify-latest.json", { exitCode: 0, commit: head });
  const { code, stderr } = runInstalledHook(dir, `refs/heads/main ${head} refs/heads/main ${ZERO40}\n`);
  assert.equal(code, 0, stderr);
  const log = readLog(dir);
  assert.equal(log.at(-1).verdict, "allowed");
  assert.equal(log.at(-1).commit, head);
});

test("installed hook: fresh verify evidence + recorded approval (general mode) -> ALLOW", () => {
  const { dir, head } = freshRepo("e2e-approved");
  writeManifest(dir, { approval: "required" });
  writeEvidence(dir, "evidence/verify-latest.json", { exitCode: 0, commit: head });
  writeState(dir, { schema: "pipeline.state.v0", pushApproval: { lastApproved: { forCommit: head, destination: "refs/heads/main" } } });
  const { code, stderr } = runInstalledHook(dir, `refs/heads/main ${head} refs/heads/main ${ZERO40}\n`);
  assert.equal(code, 0, stderr);
});

// ---- delete case: allowed, not evaluated, still recorded -------------------------------

test("installed hook: ref deletion is allowed without evidence evaluation, and recorded", () => {
  const { dir, head } = freshRepo("e2e-delete");
  writeManifest(dir, { approval: "required" }); // no evidence written at all -- would BLOCK a normal push
  const { code } = runInstalledHook(dir, `refs/heads/doomed ${ZERO40} refs/heads/doomed ${head}\n`);
  assert.equal(code, 0);
  const log = readLog(dir);
  assert.equal(log.at(-1).verdict, "allowed");
  assert.match(log.at(-1).note, /deletion/);
});

// ---- install/removal safety -------------------------------------------------------------

test("applyInstall: refuses to overwrite a pre-existing foreign hook", () => {
  const { dir } = freshRepo("install-foreign");
  const res = spawnSync("git", ["rev-parse", "--path-format=absolute", "--git-path", "hooks/pre-push"], { cwd: dir, encoding: "utf8" });
  const hookPath = res.stdout.trim();
  mkdirSync(join(hookPath, ".."), { recursive: true });
  writeFileSync(hookPath, "#!/bin/sh\necho a human already had this\n");
  chmodSync(hookPath, 0o755);
  const before = readFileSync(hookPath, "utf8");
  const result = applyInstall({ rootDir: dir, pluginLibDir: PLUGIN_LIB_DIR });
  assert.equal(result.status, "refused-foreign-hook");
  assert.equal(readFileSync(hookPath, "utf8"), before, "foreign hook content must be untouched");
});

test("applyInstall then applyRemoval: removes exactly what was installed", () => {
  const { dir } = freshRepo("install-remove-roundtrip");
  const install = applyInstall({ rootDir: dir, pluginLibDir: PLUGIN_LIB_DIR });
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
  const install = applyInstall({ rootDir: dir, pluginLibDir: PLUGIN_LIB_DIR });
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
  const first = applyInstall({ rootDir: dir, pluginLibDir: PLUGIN_LIB_DIR });
  assert.equal(first.status, "installed");
  const plan = planInstall({ rootDir: dir, pluginLibDir: PLUGIN_LIB_DIR });
  assert.equal(plan.status, "ready-to-upgrade");
  const second = applyInstall({ rootDir: dir, pluginLibDir: PLUGIN_LIB_DIR });
  assert.equal(second.status, "installed");
});

// ---- generated content sanity -----------------------------------------------------------

test("renderShim: execs the impl file with an absolute, JSON-quoted path", () => {
  const shim = renderShim("/abs/path/impl.mjs");
  assert.match(shim, /^#!\/bin\/sh/);
  assert.match(shim, /exec node "\/abs\/path\/impl\.mjs" "\$@"/);
});

test("renderImpl: names the --no-verify escape and states it cannot be recorded", () => {
  const impl = renderImpl("/abs/lib");
  assert.match(impl, /--no-verify/);
  assert.match(impl, /CANNOT record a bypass/);
  assert.match(impl, /never mode-gated/);
});

// ---- decline recording (NVA-PREPUSHOFFER-1) ---------------------------------------------

test("applyDecline: records a decline marker with a timestamp, no name/credential", () => {
  const { dir } = freshRepo("decline-record");
  const result = applyDecline({ rootDir: dir });
  assert.equal(result.status, "declined");
  assert.match(result.declinedAt, /^\d{4}-\d{2}-\d{2}T/);
  const res = spawnSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: dir, encoding: "utf8" });
  const commonDir = res.stdout.trim();
  const markerPath = join(commonDir, "agent-pipeline", "pre-push-hook", "decline-marker.json");
  assert.ok(existsSync(markerPath));
  const marker = JSON.parse(readFileSync(markerPath, "utf8"));
  assert.equal(marker.schema, DECLINE_MARKER_SCHEMA);
  assert.deepEqual(Object.keys(marker).sort(), ["declinedAt", "schema"]);
});

test("planDecline: read-only, repository-unresolved when no git repo present", () => {
  const dir = mkdtempSync(join(tmpdir(), "pre-push-hook-plandecline-norepo-"));
  const plan = planDecline({ rootDir: dir });
  assert.equal(plan.status, "repository-unresolved");
});

test("planInstall: reports 'declined' distinctly from 'ready' after a decline is recorded", () => {
  const { dir } = freshRepo("decline-then-plan");
  const before = planInstall({ rootDir: dir, pluginLibDir: PLUGIN_LIB_DIR });
  assert.equal(before.status, "ready");
  const decline = applyDecline({ rootDir: dir });
  assert.equal(decline.status, "declined");
  const after = planInstall({ rootDir: dir, pluginLibDir: PLUGIN_LIB_DIR });
  assert.equal(after.status, "declined");
  assert.equal(after.declinedAt, decline.declinedAt);
});

test("applyInstall: installing after a decline succeeds (declining is not a permanent refusal)", () => {
  const { dir } = freshRepo("decline-then-install");
  const decline = applyDecline({ rootDir: dir });
  assert.equal(decline.status, "declined");
  const install = applyInstall({ rootDir: dir, pluginLibDir: PLUGIN_LIB_DIR });
  assert.equal(install.status, "installed");
  assert.ok(existsSync(install.hookPath));
});

test("planInstall: a decline marker never suppresses an already-installed hook", () => {
  const { dir } = freshRepo("decline-does-not-suppress-installed");
  const install = applyInstall({ rootDir: dir, pluginLibDir: PLUGIN_LIB_DIR });
  assert.equal(install.status, "installed");
  // A stale decline record from before this install (or written by mistake
  // afterward) must not make planInstall report "declined" once the hook is
  // actually present -- hook-presence checks run first (see planInstall).
  const decline = applyDecline({ rootDir: dir });
  assert.equal(decline.status, "declined");
  const plan = planInstall({ rootDir: dir, pluginLibDir: PLUGIN_LIB_DIR });
  assert.equal(plan.status, "ready-to-upgrade");
  assert.notEqual(plan.status, "declined");
});
