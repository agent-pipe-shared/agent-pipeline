#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Regression pin: pipeline.windows-pre-push-installer-fsync-and-relative-action (AC-272).
 *
 * Original acceptance (backlog/items/2026-09-29-windows-pre-push-installer-fsync-and-relative-action.md):
 *   A. a Windows-compatible durable file-sync descriptor (fsync on a WRITABLE descriptor, never read-only)
 *   B. a typed refusal when durability is unavailable
 *   C. an absolute installer executable and script path with an explicit consumer cwd
 *   D. install, marker/readback, blocking push behaviour and removal prove out end to end
 *   E. foreign hooks are left untouched (and marker binding / removal ownership hold)
 *   F. macOS/Linux smoke coverage stays (mode bits) -- host-limited on native Windows
 *
 * Fixtures live under the repository's scratch/ (never the OS temp dir). Cases that need POSIX mode bits are
 * skipped on native Windows with a typed host-limitation reason (owner Coordinator, due 2026-10-19, PO decision K7).
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmodSync, closeSync, cpSync, existsSync, linkSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, statSync, fsyncSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const LIVE_PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO_ROOT = resolve(LIVE_PLUGIN_ROOT, "..", "..");
const SCRATCH = join(REPO_ROOT, "scratch");
mkdirSync(SCRATCH, { recursive: true });
const WORK = mkdtempSync(join(SCRATCH, "pp-fsync-pin-"));
after(() => { rmSync(WORK, { recursive: true, force: true, maxRetries: 3 }); });

// The installer snapshots the plugin root; a frozen copy keeps parallel writers from causing GHS-SOURCE-DRIFT.
const FROZEN = join(WORK, "plugin");
cpSync(LIVE_PLUGIN_ROOT, FROZEN, { recursive: true });
// RED-demonstration seam: PIN_PREFLIGHT_MIRROR names a scratch copy (e.g. `git show HEAD:<path>`) of
// pipeline-start-preflight.mjs that replaces the frozen copy's, so the pin can be run against old code.
if (process.env.PIN_PREFLIGHT_MIRROR) {
  cpSync(resolve(process.env.PIN_PREFLIGHT_MIRROR), join(FROZEN, "scripts", "pipeline-start-preflight.mjs"));
}
const PLUGIN_LIB_DIR = join(FROZEN, "lib");
const INSTALLER = join(FROZEN, "scripts", "pre-push-hook-install.mjs");
const installerMod = await import(pathToFileURL(INSTALLER).href);
const { applyInstall, applyRemoval, planInstall } = installerMod;
const { buildPrePushHookOfferAction } = await import(pathToFileURL(join(FROZEN, "scripts", "project-onboarding-v3.mjs")).href);
const { observePrePushHookInstallation } = await import(pathToFileURL(join(FROZEN, "scripts", "pipeline-start-preflight.mjs")).href);
const { createGovernanceScopeController } = await import(pathToFileURL(join(FROZEN, "lib", "governance-scope.mjs")).href);

const IS_WIN = process.platform === "win32";
const HOST_LIMIT = "host-limitation: POSIX mode bits unavailable on native Windows; owner Coordinator, due 2026-10-19, Linux/WSL run (PO decision K7)";
const sha256 = (b) => createHash("sha256").update(b).digest("hex");
let counter = 0;

function freshRepo(prefix) {
  const dir = join(WORK, `${prefix}-${++counter}`);
  mkdirSync(dir, { recursive: true });
  const git = (...args) => spawnSync("git", args, { cwd: dir, encoding: "utf8" });
  git("init", "-q", "-b", "main");
  git("config", "user.email", "goldfish@example.invalid");
  git("config", "user.name", "Goldfish");
  writeFileSync(join(dir, "README.md"), "fixture\n");
  git("add", "README.md");
  git("commit", "-q", "-m", "init");
  const head = git("rev-parse", "HEAD").stdout.trim();
  const fixtureHome = join(dir, ".git", "fixture-home");
  const controller = createGovernanceScopeController({ hostStateRoot: join(fixtureHome, ".local", "state", "agent-pipeline", "activation") });
  const plan = controller.planDecision({ rootDir: dir, decision: "enroll", by: "Fixture Owner" });
  controller.applyDecision(plan, { activate: true, planSha256: plan.planSha256 });
  const hookPath = git("rev-parse", "--path-format=absolute", "--git-path", "hooks/pre-push").stdout.trim();
  const commonDir = git("rev-parse", "--path-format=absolute", "--git-common-dir").stdout.trim();
  return { dir, head, git, fixtureHome, hookPath, commonDir };
}
function writeManifest(dir, approval) {
  mkdirSync(join(dir, ".claude"), { recursive: true });
  writeFileSync(join(dir, ".claude", "pipeline.yaml"), `schema: pipeline.manifest.v0\ngates:\n  push:\n    mode: blocking\n    type: human\n    approval: ${approval}\n`);
}
function writeEvidence(dir, obj) {
  mkdirSync(join(dir, "evidence"), { recursive: true });
  writeFileSync(join(dir, "evidence", "verify-latest.json"), JSON.stringify(obj));
}

// ---- A. writable-descriptor fsync -----------------------------------------------------------

test("A1 host fact: fsync on a read-only descriptor is the Windows EPERM defect; a writable descriptor syncs", () => {
  const file = join(WORK, "fsync-fact.txt");
  writeFileSync(file, "x");
  const ro = openSync(file, "r");
  try {
    if (IS_WIN) assert.throws(() => fsyncSync(ro), (e) => e.code === "EPERM");
  } finally { closeSync(ro); }
  const rw = openSync(file, "r+");
  try { fsyncSync(rw); } finally { closeSync(rw); }
});

function extractDurableWriter(mutate) {
  const src = readFileSync(INSTALLER, "utf8");
  const start = src.indexOf("function writeDurableInstallArtifact(");
  const end = src.indexOf("\n}\n", start);
  assert.ok(start > 0 && end > start, "writeDurableInstallArtifact must be extractable");
  const body = mutate(src.slice(start, end + 3));
  const file = join(WORK, `mirror-${++counter}.mjs`);
  writeFileSync(file, `import { closeSync, constants, fchmodSync, fstatSync, fsyncSync, ftruncateSync, lstatSync, openSync, readSync, writeFileSync } from "node:fs";\nexport ${body}`);
  return import(pathToFileURL(file).href).then((m) => m.writeDurableInstallArtifact);
}

test("A2 the production writer opens writable and syncs/reads back (mirror GREEN); a read-only-descriptor mirror is RED", async () => {
  const good = await extractDurableWriter((s) => s);
  const target = join(WORK, "durable-green.txt");
  good(target, "hello\n", 0o600);
  assert.equal(readFileSync(target, "utf8"), "hello\n");
  // RED: the same function opened read-only (the original defect) cannot be the durable writer.
  const bad = await extractDurableWriter((s) => s.replace("constants.O_RDWR", "constants.O_RDONLY"));
  assert.throws(() => bad(join(WORK, "durable-red.txt"), "hello\n", 0o600));
});

test("A3 a mirror that skips the readback comparison is RED against a corrupting write (readback is load-bearing)", async () => {
  const good = await extractDurableWriter((s) => s);
  // Custody refusal on a second hard link proves the custody gate is live in the production function.
  const a = join(WORK, "custody-a.txt");
  const b = join(WORK, "custody-b.txt");
  writeFileSync(a, "original");
  linkSync(a, b);
  assert.throws(() => good(a, "new", 0o600), /PRE-PUSH-INSTALL-ARTIFACT-CUSTODY/);
  assert.equal(readFileSync(b, "utf8"), "original", "custody refusal happens before any truncate");
});

// ---- B. typed refusal -------------------------------------------------------------------

function makeDurabilityFault(repo) {
  // impl.mjs pre-exists as a second hard link: the writer's custody check refuses it before touching bytes.
  // The private state directory must be created by the installer itself (hardened ACL on Windows), so a clean
  // install/removal cycle produces it; the fault is then planted inside it.
  assert.equal(applyInstall({ rootDir: repo.dir, pluginLibDir: PLUGIN_LIB_DIR }).status, "installed");
  assert.equal(applyRemoval({ rootDir: repo.dir }).status, "removed");
  const stateDir = join(repo.commonDir, "agent-pipeline", "pre-push-hook");
  const outside = join(WORK, `outside-${++counter}.txt`);
  writeFileSync(outside, "outside custody");
  linkSync(outside, join(stateDir, "impl.mjs"));
  return outside;
}

test("B1 applyInstall returns the typed durability refusal and claims no installation", () => {
  const repo = freshRepo("durability");
  const outside = makeDurabilityFault(repo);
  const result = applyInstall({ rootDir: repo.dir, pluginLibDir: PLUGIN_LIB_DIR });
  assert.deepEqual(result, { status: "durability-unavailable", code: "PRE-PUSH-INSTALL-DURABILITY-UNAVAILABLE" });
  assert.equal(existsSync(repo.hookPath), false, "no hook may be reported or left as installed");
  assert.equal(existsSync(join(repo.commonDir, "agent-pipeline", "pre-push-hook", "install-marker.json")), false);
  assert.equal(readFileSync(outside, "utf8"), "outside custody", "the foreign-linked bytes stay untouched");
});

test("B2 the --install CLI reports the typed refusal, exit 1", () => {
  const repo = freshRepo("durability-cli");
  makeDurabilityFault(repo);
  const r = spawnSync(process.execPath, [INSTALLER, "--install"], { cwd: repo.dir, encoding: "utf8", timeout: 90000 });
  assert.equal(r.status, 1, r.stderr);
  const payload = JSON.parse(r.stdout);
  assert.equal(payload.status, "durability-unavailable");
  assert.equal(payload.code, "PRE-PUSH-INSTALL-DURABILITY-UNAVAILABLE");
});

// ---- C. absolute action -------------------------------------------------------------------

test("C1 onboarding offer: absolute executable, absolute script, explicit consumer cwd; it installs into the consumer", () => {
  const repo = freshRepo("offer");
  writeManifest(repo.dir, "required");
  const offer = buildPrePushHookOfferAction({ rootDir: repo.dir });
  assert.equal(offer?.kind, "command");
  assert.equal(isAbsolute(offer.executable), true);
  assert.equal(isAbsolute(offer.argv[0]), true);
  assert.equal(offer.argv[0], INSTALLER);
  assert.deepEqual(offer.argv.slice(1), ["--install"]);
  assert.equal(offer.cwd, repo.dir);
  const run = spawnSync(offer.executable, offer.argv, { cwd: offer.cwd, encoding: "utf8", timeout: 90000 });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  assert.equal(JSON.parse(run.stdout).status, "installed");
  assert.equal(existsSync(repo.hookPath), true, "the hook lands in the consumer repository");
});

test("C2 preflight installCommand: absolute script path and explicit absolute consumer cwd; it installs from any caller cwd", () => {
  const repo = freshRepo("preflight-cmd");
  const { installCommand, state } = observePrePushHookInstallation({ rootDir: repo.dir, pluginLibDir: PLUGIN_LIB_DIR });
  assert.equal(state, "absent");
  assert.equal(installCommand.kind, "command");
  assert.equal(isAbsolute(installCommand.argv[0]), true);
  assert.equal(installCommand.argv[0], INSTALLER);
  assert.deepEqual(installCommand.argv.slice(1), ["--install"]);
  assert.equal(isAbsolute(installCommand.cwd), true);
  assert.equal(installCommand.cwd, resolve(repo.dir));
  // Like the onboarding offer (C1) and the other host actions, the executable is the absolute interpreter,
  // never a bare "node" resolved via PATH.
  assert.equal(isAbsolute(installCommand.executable), true, `executable must be absolute, got ${installCommand.executable}`);
  assert.equal(installCommand.executable, process.execPath);
  const run = spawnSync(process.execPath, installCommand.argv, { cwd: installCommand.cwd, encoding: "utf8", timeout: 90000 });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  assert.equal(existsSync(repo.hookPath), true);
});

// ---- D. install, marker/readback, blocking push, removal -------------------------------------

test("D1 install writes impl, shim and marker whose recorded hashes match the bytes on disk", () => {
  const repo = freshRepo("readback");
  const res = applyInstall({ rootDir: repo.dir, pluginLibDir: PLUGIN_LIB_DIR });
  assert.equal(res.status, "installed");
  const marker = JSON.parse(readFileSync(res.markerPath, "utf8"));
  assert.equal(marker.schema, "pipeline.pre-push-hook-install.v1");
  assert.equal(marker.hookSha256, sha256(readFileSync(res.hookPath)));
  assert.equal(marker.implSha256, sha256(readFileSync(res.implPath)));
  assert.equal(marker.hookPath, res.hookPath);
  assert.equal(marker.implPath, res.implPath);
  assert.equal(planInstall({ rootDir: repo.dir, pluginLibDir: PLUGIN_LIB_DIR }).status, "ready-to-upgrade");
});

function realPush(repo, remoteDir) {
  const bare = spawnSync("git", ["init", "-q", "--bare", remoteDir], { encoding: "utf8" });
  assert.equal(bare.status, 0, bare.stderr);
  repo.git("remote", "add", "origin", remoteDir);
  return spawnSync("git", ["push", "origin", "main"], {
    cwd: repo.dir, encoding: "utf8", timeout: 60000,
    env: { ...process.env, HOME: repo.fixtureHome, USERPROFILE: repo.fixtureHome },
  });
}
const remoteHas = (remoteDir) => spawnSync("git", ["--git-dir", remoteDir, "rev-parse", "--verify", "-q", "refs/heads/main"], { encoding: "utf8" }).status === 0;

test("D2 a real git push is BLOCKED by the installed hook when evidence is missing, and the remote stays empty", () => {
  const repo = freshRepo("push-blocked");
  writeManifest(repo.dir, "standing-approved");
  assert.equal(applyInstall({ rootDir: repo.dir, pluginLibDir: PLUGIN_LIB_DIR }).status, "installed");
  const remote = join(WORK, `remote-${++counter}.git`);
  const push = realPush(repo, remote);
  assert.notEqual(push.status, 0);
  assert.match(push.stderr, /BLOCKED \(agent-pipeline pre-push hook\)/);
  assert.match(push.stderr, /verify-latest\.json missing/);
  assert.equal(remoteHas(remote), false);
});

test("D3 the same real git push is ALLOWED when verify evidence binds the pushed commit (hook is live, not always-blocking)", () => {
  const repo = freshRepo("push-allowed");
  writeManifest(repo.dir, "standing-approved");
  writeEvidence(repo.dir, { exitCode: 0, commit: repo.head });
  assert.equal(applyInstall({ rootDir: repo.dir, pluginLibDir: PLUGIN_LIB_DIR }).status, "installed");
  const remote = join(WORK, `remote-${++counter}.git`);
  const push = realPush(repo, remote);
  assert.equal(push.status, 0, push.stderr);
  assert.equal(remoteHas(remote), true);
});

test("D4 removal deletes exactly the installed artifacts, and a later push is no longer gated", () => {
  const repo = freshRepo("removal");
  writeManifest(repo.dir, "standing-approved");
  const res = applyInstall({ rootDir: repo.dir, pluginLibDir: PLUGIN_LIB_DIR });
  assert.equal(res.status, "installed");
  const removed = applyRemoval({ rootDir: repo.dir });
  assert.equal(removed.status, "removed");
  for (const p of [res.hookPath, res.implPath, res.markerPath]) assert.equal(existsSync(p), false, p);
  const push = realPush(repo, join(WORK, `remote-${++counter}.git`));
  assert.equal(push.status, 0, push.stderr);
});

// ---- E. foreign hooks, marker binding, removal ownership ---------------------------------------

test("E1 a foreign hook is refused by the CLI install and left byte-identical, with no marker or impl written", () => {
  const repo = freshRepo("foreign");
  mkdirSync(dirname(repo.hookPath), { recursive: true });
  const foreign = "#!/bin/sh\necho a human already had this\n";
  writeFileSync(repo.hookPath, foreign);
  const r = spawnSync(process.execPath, [INSTALLER, "--install"], { cwd: repo.dir, encoding: "utf8", timeout: 90000 });
  assert.equal(r.status, 1, r.stderr);
  assert.equal(JSON.parse(r.stdout).status, "refused-foreign-hook");
  assert.equal(readFileSync(repo.hookPath, "utf8"), foreign);
  assert.equal(existsSync(join(repo.commonDir, "agent-pipeline", "pre-push-hook", "install-marker.json")), false);
  assert.equal(existsSync(join(repo.commonDir, "agent-pipeline", "pre-push-hook", "impl.mjs")), false);
  assert.equal(applyRemoval({ rootDir: repo.dir }).status, "nothing-to-remove");
  assert.equal(readFileSync(repo.hookPath, "utf8"), foreign, "removal must not touch a hook this installer never wrote");
});

test("E2 marker binding: a modified impl makes the install foreign; a modified shim blocks removal; neither is overwritten or deleted", () => {
  const repo = freshRepo("binding");
  const res = applyInstall({ rootDir: repo.dir, pluginLibDir: PLUGIN_LIB_DIR });
  assert.equal(res.status, "installed");
  const originalImpl = readFileSync(res.implPath, "utf8");
  writeFileSync(res.implPath, `${originalImpl}\n// tampered\n`);
  assert.equal(applyInstall({ rootDir: repo.dir, pluginLibDir: PLUGIN_LIB_DIR }).status, "refused-foreign-hook");
  assert.equal(readFileSync(res.implPath, "utf8"), `${originalImpl}\n// tampered\n`);
  writeFileSync(res.implPath, originalImpl);
  writeFileSync(res.hookPath, "#!/bin/sh\necho tampered\n");
  const removal = applyRemoval({ rootDir: repo.dir });
  assert.equal(removal.status, "refused-modified-hook");
  assert.equal(existsSync(res.hookPath), true);
  assert.equal(existsSync(res.implPath), true);
});

// ---- F. POSIX smoke (host-limited on native Windows) ---------------------------------------------

test("F1 POSIX: the shim is executable 0755, impl and marker are 0600, and git runs the shim directly",
  { skip: IS_WIN ? HOST_LIMIT : false }, () => {
    const repo = freshRepo("posix-modes");
    writeManifest(repo.dir, "standing-approved");
    const res = applyInstall({ rootDir: repo.dir, pluginLibDir: PLUGIN_LIB_DIR });
    assert.equal(res.status, "installed");
    assert.equal(statSync(res.hookPath).mode & 0o777, 0o755);
    assert.equal(statSync(res.implPath).mode & 0o777, 0o600);
    assert.equal(statSync(res.markerPath).mode & 0o777, 0o600);
    chmodSync(res.hookPath, 0o755);
    const run = spawnSync(res.hookPath, ["origin", "https://example.invalid/r.git"], {
      cwd: repo.dir, input: `refs/heads/main ${repo.head} refs/heads/main ${"0".repeat(40)}\n`, encoding: "utf8", timeout: 20000,
      env: { ...process.env, HOME: repo.fixtureHome },
    });
    assert.equal(run.status, 1);
    assert.match(run.stderr, /verify-latest\.json missing/);
  });
