// SPDX-License-Identifier: SUL-1.0
// Security properties of the git-hook runtime snapshot that the fast verification paths (batched native DACL read,
// below-root lstat walk, in-process verified memo of the DESTINATION) must keep. The SOURCE tree has no stat shortcut:
// it is re-read and hashed in full after the copy. Fixtures live under os.tmpdir(); everything planted (ACE, junction,
// tampered file, source edit) is removed before a test ends.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, symlinkSync, unlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

import { physicalFootprintPath } from "./git-hook-footprint.mjs";
import { publishGitHookRuntimeSnapshot, verifyGitHookRuntimeSnapshot } from "./git-hook-runtime-snapshot.mjs";
import { assessWindowsPrivatePaths, hardenWindowsPrivateDirectory } from "./windows-private-state.mjs";

const WIN = process.platform === "win32";
const WIN_ONLY = WIN ? false : "native Windows DACL observation exists only on win32";

function fixture(t) {
  const base = mkdtempSync(join(tmpdir(), "ghs-fast-"));
  const plugin = join(base, "plugin"), state = join(base, "state");
  for (const [path, body] of [
    ["lib/governance-scope.mjs", "export const scope = 1;\n"],
    ["lib/sub/inner.mjs", "export const inner = 'inner';\n"],
    ["hooks/h.mjs", "export const h = 2;\n"],
    ["scripts/s.mjs", "export const s = 3;\n"],
    ["config/c.json", "{\"c\":4}\n"],
    ["protected-baseline.json", "{\"b\":5}\n"],
  ]) {
    mkdirSync(join(plugin, path, ".."), { recursive: true });
    writeFileSync(join(plugin, path), body);
  }
  mkdirSync(state, { recursive: true, mode: 0o700 });
  t.after(() => rmSync(base, { recursive: true, force: true, maxRetries: 3 }));
  return { base, lib: join(plugin, "lib"), plugin, state };
}

const publish = (f) => publishGitHookRuntimeSnapshot({ pluginLibDir: f.lib, stateDir: f.state });
const codeOf = (fn) => { try { fn(); } catch (error) { return error?.code ?? String(error?.message); } return null; };
const tamper = (path) => writeFileSync(path, "x".repeat(readFileSync(path).length));

function verifyInFreshProcess(snapshot) {
  const url = pathToFileURL(join(import.meta.dirname, "git-hook-runtime-snapshot.mjs")).href;
  const code = `import {verifyGitHookRuntimeSnapshot} from ${JSON.stringify(url)};try{verifyGitHookRuntimeSnapshot({snapshotRoot:${JSON.stringify(snapshot.root)},manifestSha256:${JSON.stringify(snapshot.manifestSha256)}});console.log('OK');}catch(e){console.log('ERR:'+(e.code??e.message));}`;
  return spawnSync(process.execPath, ["--input-type=module", "-e", code], { encoding: "utf8" }).stdout.trim();
}

test("a published snapshot verifies, and a repeat verify in the same process stays verified", (t) => {
  const f = fixture(t), snapshot = publish(f);
  assert.equal(verifyGitHookRuntimeSnapshot({ snapshotRoot: snapshot.root, manifestSha256: snapshot.manifestSha256 }).status, "verified");
  assert.equal(verifyGitHookRuntimeSnapshot({ snapshotRoot: snapshot.root, manifestSha256: snapshot.manifestSha256 }).status, "verified");
  assert.equal(verifyInFreshProcess(snapshot), "OK");
});

test("tampered content in a reused snapshot is refused by a process that has not memo-verified it", (t) => {
  const f = fixture(t), snapshot = publish(f);
  tamper(join(snapshot.root, "lib", "sub", "inner.mjs"));
  assert.equal(verifyInFreshProcess(snapshot), "ERR:GHS-CONTENT");
});

test("tampered content is refused by the same process that memo-verified the snapshot (no stale memo)", (t) => {
  const f = fixture(t), snapshot = publish(f);
  assert.equal(verifyGitHookRuntimeSnapshot({ snapshotRoot: snapshot.root, manifestSha256: snapshot.manifestSha256 }).status, "verified");
  tamper(join(snapshot.root, "hooks", "h.mjs"));
  assert.equal(codeOf(() => verifyGitHookRuntimeSnapshot({ snapshotRoot: snapshot.root, manifestSha256: snapshot.manifestSha256 })), "GHS-CONTENT");
  // republishing over a tampered existing destination is refused as well (the existing-snapshot branch re-verifies)
  assert.equal(codeOf(() => publish(f)), "GHS-CONTENT");
});

test("an extra or a missing public file is refused after the snapshot was verified in-process", (t) => {
  const f = fixture(t), snapshot = publish(f), args = { snapshotRoot: snapshot.root, manifestSha256: snapshot.manifestSha256 };
  assert.equal(verifyGitHookRuntimeSnapshot(args).status, "verified");
  writeFileSync(join(snapshot.root, "lib", "extra.mjs"), "export const extra = 1;\n");
  assert.equal(codeOf(() => verifyGitHookRuntimeSnapshot(args)), "GHS-EXTRA");
  unlinkSync(join(snapshot.root, "lib", "extra.mjs"));
  assert.equal(verifyGitHookRuntimeSnapshot(args).status, "verified");
  unlinkSync(join(snapshot.root, "scripts", "s.mjs"));
  assert.equal(codeOf(() => verifyGitHookRuntimeSnapshot(args)), "GHS-CONTENT");
});

test("a link or junction planted below the snapshot root is refused, in-process and fresh", (t) => {
  const f = fixture(t), snapshot = publish(f), args = { snapshotRoot: snapshot.root, manifestSha256: snapshot.manifestSha256 };
  assert.equal(verifyGitHookRuntimeSnapshot(args).status, "verified");
  const real = join(f.base, "elsewhere");
  mkdirSync(real);
  writeFileSync(join(real, "inner.mjs"), readFileSync(join(snapshot.root, "lib", "sub", "inner.mjs")));
  renameSync(join(snapshot.root, "lib", "sub"), join(f.base, "moved-sub"));
  symlinkSync(real, join(snapshot.root, "lib", "sub"), "junction");
  try {
    assert.match(String(codeOf(() => verifyGitHookRuntimeSnapshot(args))), /^PU-/, "in-process verify must refuse the junction");
    assert.match(verifyInFreshProcess(snapshot), /^ERR:PU-/, "fresh-process verify must refuse the junction");
    assert.equal(codeOf(() => physicalFootprintPath(join(snapshot.root, "lib", "sub", "inner.mjs"), { within: snapshot.root })), "PU-ALIAS");
  } finally {
    unlinkSync(join(snapshot.root, "lib", "sub"));
  }
});

test("source drift while the snapshot is being published is refused", (t) => {
  const f = fixture(t);
  const drift = () => publishGitHookRuntimeSnapshot({
    pluginLibDir: f.lib,
    stateDir: f.state,
    onProgress: ({ phase }) => { if (phase === "copy") writeFileSync(join(f.lib, "sub", "inner.mjs"), "export const inner = 'drifted';\n"); },
  });
  assert.equal(codeOf(drift), "GHS-SOURCE-DRIFT");
});

// A same-size edit whose mtime is restored afterwards: size and mtime (the stat facts a shortcut would trust) are
// unchanged, only the bytes differ. Only the content hash of a full re-read can notice it. Errors thrown inside an
// onProgress callback are swallowed by the publisher, so the outcome is recorded and asserted after the publish.
function plantSameSizeSameMtimeEdit(path) {
  const before = statSync(path), original = readFileSync(path, "utf8"), edited = original.replace("'inner'", "'innex'");
  if (edited === original || edited.length !== original.length) return { planted: false };
  writeFileSync(path, edited);
  utimesSync(path, before.atimeMs / 1000, before.mtimeMs / 1000);
  const after = statSync(path);
  return { planted: true, sizeKept: after.size === before.size, mtimeKept: Math.abs(after.mtimeMs - before.mtimeMs) < 2, bytesChanged: readFileSync(path, "utf8") !== original };
}

for (const editPhase of ["copy", "verify"]) {
  test(`a same-size, same-mtime source edit during publish (${editPhase} phase) is refused as GHS-SOURCE-DRIFT`, (t) => {
    const f = fixture(t);
    // Temporary-tree cleanup fails closed unless the state directory itself is private (as an installed state dir is).
    if (WIN) assert.equal(hardenWindowsPrivateDirectory(f.state).status, "secure");
    let outcome = null;
    const drift = () => publishGitHookRuntimeSnapshot({
      pluginLibDir: f.lib,
      stateDir: f.state,
      onProgress: ({ phase }) => { if (phase === editPhase && outcome === null) outcome = plantSameSizeSameMtimeEdit(join(f.lib, "sub", "inner.mjs")); },
    });
    assert.equal(codeOf(drift), "GHS-SOURCE-DRIFT");
    assert.deepEqual(outcome, { planted: true, sizeKept: true, mtimeKept: true, bytesChanged: true });
    assert.deepEqual(readdirSync(f.state), [], "nothing was published and the exact owned temporary was removed");
  });
}

test("the install time budget is enforced", (t) => {
  const f = fixture(t);
  assert.equal(codeOf(() => publishGitHookRuntimeSnapshot({ pluginLibDir: f.lib, stateDir: f.state, timeBudgetMs: 0 })), "GHS-TIME-BUDGET");
  assert.equal(codeOf(() => publishGitHookRuntimeSnapshot({ pluginLibDir: f.lib, stateDir: f.state, timeBudgetMs: 80001 })), "GHS-TIME-BUDGET");
});

test("win32: a foreign ACE on a snapshot file is refused, in-process after memo and in a fresh process", { skip: WIN_ONLY }, (t) => {
  const f = fixture(t), snapshot = publish(f), args = { snapshotRoot: snapshot.root, manifestSha256: snapshot.manifestSha256 };
  assert.equal(verifyGitHookRuntimeSnapshot(args).status, "verified");
  const file = join(snapshot.root, "hooks", "h.mjs");
  execFileSync("icacls", [file, "/grant", "*S-1-1-0:(R)"], { stdio: "ignore" });
  try {
    assert.equal(codeOf(() => verifyGitHookRuntimeSnapshot(args)), "GHS-CONTENT");
    assert.equal(verifyInFreshProcess(snapshot), "ERR:GHS-CONTENT");
  } finally {
    execFileSync("icacls", [file, "/remove", "*S-1-1-0"], { stdio: "ignore" });
  }
  assert.equal(verifyInFreshProcess(snapshot), "OK");
});

test("win32: a foreign ACE on a snapshot subdirectory is refused", { skip: WIN_ONLY }, (t) => {
  const f = fixture(t), snapshot = publish(f), args = { snapshotRoot: snapshot.root, manifestSha256: snapshot.manifestSha256 };
  const dir = join(snapshot.root, "lib", "sub");
  execFileSync("icacls", [dir, "/grant", "*S-1-1-0:(R)"], { stdio: "ignore" });
  try {
    assert.equal(codeOf(() => verifyGitHookRuntimeSnapshot(args)), "GHS-MODE");
  } finally {
    execFileSync("icacls", [dir, "/remove", "*S-1-1-0"], { stdio: "ignore" });
  }
});

test("win32: disabled inheritance plus a foreign ACE on a descendant is refused", { skip: WIN_ONLY }, (t) => {
  const f = fixture(t), snapshot = publish(f), args = { snapshotRoot: snapshot.root, manifestSha256: snapshot.manifestSha256 };
  const file = join(snapshot.root, "config", "c.json");
  execFileSync("icacls", [file, "/inheritance:d"], { stdio: "ignore" });
  execFileSync("icacls", [file, "/grant", "*S-1-1-0:(R)"], { stdio: "ignore" });
  try {
    assert.equal(codeOf(() => verifyGitHookRuntimeSnapshot(args)), "GHS-CONTENT");
  } finally {
    execFileSync("icacls", [file, "/remove", "*S-1-1-0"], { stdio: "ignore" });
  }
});

test("win32: the batched native reader returns one verdict per path in a single call and flags a foreign ACE", { skip: WIN_ONLY }, (t) => {
  const f = fixture(t), dir = join(f.base, "acl");
  mkdirSync(dir);
  assert.equal(hardenWindowsPrivateDirectory(dir).status, "secure");
  const paths = [dir];
  for (let index = 0; index < 150; index += 1) { const path = join(dir, `f${index}.mjs`); writeFileSync(path, "x"); paths.push(path); }
  let rows = assessWindowsPrivatePaths(paths, { batchSize: 4096, timeoutForBatch: () => 60000 });
  assert.equal(rows.length, paths.length);
  assert.equal(rows.every((row) => row.status === "secure"), true);
  execFileSync("icacls", [paths[77], "/grant", "*S-1-1-0:(R)"], { stdio: "ignore" });
  try {
    rows = assessWindowsPrivatePaths(paths, { batchSize: 4096, timeoutForBatch: () => 60000 });
    assert.equal(rows[77].status, "insecure");
    assert.equal(rows.filter((row) => row.status !== "secure").length, 1);
  } finally {
    execFileSync("icacls", [paths[77], "/remove", "*S-1-1-0"], { stdio: "ignore" });
  }
});
