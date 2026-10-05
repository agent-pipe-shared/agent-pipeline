// SPDX-License-Identifier: SUL-1.0
// Security properties of the git-hook runtime snapshot that the fast verification paths (batched native DACL read,
// below-root lstat walk, in-process verified memo of the DESTINATION) must keep. The SOURCE tree has no stat shortcut:
// it is re-read and hashed in full after the copy. Fixtures live under os.tmpdir(); everything planted (ACE, junction,
// tampered file, source edit) is removed before a test ends.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs, { mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, renameSync, rmSync, statSync, symlinkSync, unlinkSync, utimesSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir, devNull } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { physicalFootprintPath } from "./git-hook-footprint.mjs";
import { publishGitHookRuntimeSnapshot, verifyGitHookRuntimeSnapshot } from "./git-hook-runtime-snapshot.mjs";
import { registerTestCaseCompletion } from "./test-case-completion.mjs";
import { assessWindowsPrivatePaths, hardenWindowsPrivateDirectory } from "./windows-private-state.mjs";

const WIN = process.platform === "win32";
const WIN_ONLY = WIN ? false : "native Windows DACL observation exists only on win32";

// Cases are declared with stable ids and registered together through the completion protocol at the end of the file.
// `{ skip: reason }` is the node:test option; the completion protocol carries it as its closed `mode: "skip"` (the
// reason string itself is not carried, it stays documented in WIN_ONLY above).
const cases = [];
function register(id, name, optionsOrRun, maybeRun) {
  const [options, run] = typeof optionsOrRun === "function" ? [{}, optionsOrRun] : [optionsOrRun, maybeRun];
  cases.push(options.skip ? { id, name, run, mode: "skip" } : { id, name, run });
}

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

register("GHRSF01", "a published snapshot verifies, and a repeat verify in the same process stays verified", (t) => {
  const f = fixture(t), snapshot = publish(f);
  assert.equal(verifyGitHookRuntimeSnapshot({ snapshotRoot: snapshot.root, manifestSha256: snapshot.manifestSha256 }).status, "verified");
  assert.equal(verifyGitHookRuntimeSnapshot({ snapshotRoot: snapshot.root, manifestSha256: snapshot.manifestSha256 }).status, "verified");
  assert.equal(verifyInFreshProcess(snapshot), "OK");
});

register("GHRSF02", "tampered content in a reused snapshot is refused by a process that has not memo-verified it", (t) => {
  const f = fixture(t), snapshot = publish(f);
  tamper(join(snapshot.root, "lib", "sub", "inner.mjs"));
  assert.equal(verifyInFreshProcess(snapshot), "ERR:GHS-CONTENT");
});

register("GHRSF03", "tampered content is refused by the same process that memo-verified the snapshot (no stale memo)", (t) => {
  const f = fixture(t), snapshot = publish(f);
  assert.equal(verifyGitHookRuntimeSnapshot({ snapshotRoot: snapshot.root, manifestSha256: snapshot.manifestSha256 }).status, "verified");
  tamper(join(snapshot.root, "hooks", "h.mjs"));
  assert.equal(codeOf(() => verifyGitHookRuntimeSnapshot({ snapshotRoot: snapshot.root, manifestSha256: snapshot.manifestSha256 })), "GHS-CONTENT");
  // republishing over a tampered existing destination is refused as well (the existing-snapshot branch re-verifies)
  assert.equal(codeOf(() => publish(f)), "GHS-CONTENT");
});

register("GHRSF04", "an extra or a missing public file is refused after the snapshot was verified in-process", (t) => {
  const f = fixture(t), snapshot = publish(f), args = { snapshotRoot: snapshot.root, manifestSha256: snapshot.manifestSha256 };
  assert.equal(verifyGitHookRuntimeSnapshot(args).status, "verified");
  writeFileSync(join(snapshot.root, "lib", "extra.mjs"), "export const extra = 1;\n");
  assert.equal(codeOf(() => verifyGitHookRuntimeSnapshot(args)), "GHS-EXTRA");
  unlinkSync(join(snapshot.root, "lib", "extra.mjs"));
  assert.equal(verifyGitHookRuntimeSnapshot(args).status, "verified");
  unlinkSync(join(snapshot.root, "scripts", "s.mjs"));
  assert.equal(codeOf(() => verifyGitHookRuntimeSnapshot(args)), "GHS-CONTENT");
});

register("GHRSF05", "a link or junction planted below the snapshot root is refused, in-process and fresh", (t) => {
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

register("GHRSF06", "source drift while the snapshot is being published is refused", (t) => {
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

for (const [id, editPhase] of [["GHRSF07", "copy"], ["GHRSF08", "verify"]]) {
  register(id, `a same-size, same-mtime source edit during publish (${editPhase} phase) is refused as GHS-SOURCE-DRIFT`, (t) => {
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

// Counts every open() of a file below `root` made through node:fs by any module (the footprint reader opens each file it
// hashes exactly once per read). Installed through the builtin-module export sync, so production code needs no seam.
function countOpens(t, root) {
  const counts = new Map(), original = fs.openSync;
  fs.openSync = function (path, ...rest) {
    const name = String(path);
    if (name.startsWith(root)) counts.set(name, (counts.get(name) ?? 0) + 1);
    return original.call(this, path, ...rest);
  };
  syncBuiltinESMExports();
  t.after(() => { fs.openSync = original; syncBuiltinESMExports(); });
  return counts;
}

register("GHRSF09", "a publish reads and hashes the whole source tree exactly twice, fresh and on reuse", (t) => {
  const f = fixture(t), counts = countOpens(t, f.plugin);
  publish(f);
  assert.equal(counts.size, 6, "the six public source files of the fixture were read");
  for (const [path, reads] of counts) assert.equal(reads, 2, `${path}: inventory pass + post-copy pass`);
  counts.clear();
  publish(f);
  assert.equal(counts.size, 6);
  for (const [path, reads] of counts) assert.equal(reads, 2, `${path}: inventory pass + post-copy pass (existing snapshot reused)`);
});

register("GHRSF10", "an in-process memo hit still reads and hashes every snapshot file", (t) => {
  const f = fixture(t), snapshot = publish(f), args = { snapshotRoot: snapshot.root, manifestSha256: snapshot.manifestSha256 };
  const counts = countOpens(t, snapshot.root);
  assert.equal(verifyGitHookRuntimeSnapshot(args).status, "verified");
  assert.equal(counts.size, 7, "six public files and the manifest were read");
  for (const [path, reads] of counts) assert.equal(reads, 1, `${path} read in full exactly once`);
});

// The memo may skip only the native DACL read. An entry that is merely OLD (recorded long ago, untouched since) is no more
// trustworthy than a fresh one, so a memo hit reads and hashes every file in full at any age. A memo that trusted a stat
// fingerprint once an entry outlived a "racy clean" window (250 ms) would skip the read below, which the test above cannot
// see because it consults the memo right after publish. Both waits exceed the window: the snapshot files are older than it
// when the memo is recorded, and the recorded entry is older than it when the memo is consulted.
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

register("GHRSF11", "an aged in-process memo entry (older than a 250 ms racy window) still reads and hashes every snapshot file", async (t) => {
  const f = fixture(t), snapshot = publish(f), args = { snapshotRoot: snapshot.root, manifestSha256: snapshot.manifestSha256 };
  await sleep(350);
  assert.equal(verifyGitHookRuntimeSnapshot(args).status, "verified"); // the memo is recorded over files that are now older than the window
  await sleep(350);
  const counts = countOpens(t, snapshot.root);
  assert.equal(verifyGitHookRuntimeSnapshot(args).status, "verified");
  assert.equal(counts.size, 7, "six public files and the manifest were read although the memo entry is aged");
  for (const [path, reads] of counts) assert.equal(reads, 1, `${path} read in full exactly once on an aged memo hit`);
});

register("GHRSF12", "a same-size, same-mtime snapshot content change after an in-process verify is refused in the same process", (t) => {
  const f = fixture(t), snapshot = publish(f), args = { snapshotRoot: snapshot.root, manifestSha256: snapshot.manifestSha256 };
  assert.equal(verifyGitHookRuntimeSnapshot(args).status, "verified"); // the memo now holds this entry's recorded fingerprint
  const file = join(snapshot.root, "lib", "sub", "inner.mjs"), before = statSync(file), original = readFileSync(file, "utf8");
  const edited = original.replace("'inner'", "'innex'");
  assert.notEqual(edited, original);
  assert.equal(edited.length, original.length);
  writeFileSync(file, edited);
  utimesSync(file, before.atimeMs / 1000, before.mtimeMs / 1000);
  const after = statSync(file);
  assert.equal(after.size, before.size);
  assert.ok(Math.abs(after.mtimeMs - before.mtimeMs) < 2, "mtime is forged back to the recorded value");
  try {
    assert.equal(codeOf(() => verifyGitHookRuntimeSnapshot(args)), "GHS-CONTENT");
  } finally {
    writeFileSync(file, original);
  }
});

register("GHRSF13", "the install time budget is enforced", (t) => {
  const f = fixture(t);
  assert.equal(codeOf(() => publishGitHookRuntimeSnapshot({ pluginLibDir: f.lib, stateDir: f.state, timeBudgetMs: 0 })), "GHS-TIME-BUDGET");
  assert.equal(codeOf(() => publishGitHookRuntimeSnapshot({ pluginLibDir: f.lib, stateDir: f.state, timeBudgetMs: 80001 })), "GHS-TIME-BUDGET");
});

register("GHRSF14", "win32: a foreign ACE on a snapshot file is refused, in-process after memo and in a fresh process", { skip: WIN_ONLY }, (t) => {
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

register("GHRSF15", "win32: a foreign ACE on a snapshot subdirectory is refused", { skip: WIN_ONLY }, (t) => {
  const f = fixture(t), snapshot = publish(f), args = { snapshotRoot: snapshot.root, manifestSha256: snapshot.manifestSha256 };
  const dir = join(snapshot.root, "lib", "sub");
  execFileSync("icacls", [dir, "/grant", "*S-1-1-0:(R)"], { stdio: "ignore" });
  try {
    assert.equal(codeOf(() => verifyGitHookRuntimeSnapshot(args)), "GHS-MODE");
  } finally {
    execFileSync("icacls", [dir, "/remove", "*S-1-1-0"], { stdio: "ignore" });
  }
});

// The two memo-hit checks below plant a NON-inheriting grant (no (OI)/(CI)), so only the named object's own DACL changes.
// NTFS bumps its ctime, the memo's recorded fingerprint no longer matches, and the memo path must re-read that one DACL.
register("GHRSF16", "win32: a foreign ACE on the snapshot root is refused on a memo hit (GHS-MODE)", { skip: WIN_ONLY }, (t) => {
  const f = fixture(t), snapshot = publish(f), args = { snapshotRoot: snapshot.root, manifestSha256: snapshot.manifestSha256 };
  assert.equal(verifyGitHookRuntimeSnapshot(args).status, "verified"); // the memo now holds the root as private
  execFileSync("icacls", [snapshot.root, "/grant", "*S-1-1-0:(R)"], { stdio: "ignore" });
  try {
    assert.equal(codeOf(() => verifyGitHookRuntimeSnapshot(args)), "GHS-MODE");
  } finally {
    execFileSync("icacls", [snapshot.root, "/remove", "*S-1-1-0"], { stdio: "ignore" });
  }
  assert.equal(verifyGitHookRuntimeSnapshot(args).status, "verified", "the snapshot verifies again once the grant is removed");
});

register("GHRSF17", "win32: a foreign ACE on snapshot.json is refused on a memo hit (GHS-MANIFEST)", { skip: WIN_ONLY }, (t) => {
  const f = fixture(t), snapshot = publish(f), args = { snapshotRoot: snapshot.root, manifestSha256: snapshot.manifestSha256 };
  const manifest = join(snapshot.root, "snapshot.json");
  assert.equal(verifyGitHookRuntimeSnapshot(args).status, "verified"); // the memo now holds the manifest as private
  execFileSync("icacls", [manifest, "/grant", "*S-1-1-0:(R)"], { stdio: "ignore" });
  try {
    assert.equal(codeOf(() => verifyGitHookRuntimeSnapshot(args)), "GHS-MANIFEST");
  } finally {
    execFileSync("icacls", [manifest, "/remove", "*S-1-1-0"], { stdio: "ignore" });
  }
  assert.equal(verifyGitHookRuntimeSnapshot(args).status, "verified", "the snapshot verifies again once the grant is removed");
});

register("GHRSF18", "win32: disabled inheritance plus a foreign ACE on a descendant is refused", { skip: WIN_ONLY }, (t) => {
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

register("GHRSF19", "win32: the batched native reader returns one verdict per path in a single call and flags a foreign ACE", { skip: WIN_ONLY }, (t) => {
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

assert.equal(cases.length, 19, "the complete git-hook runtime snapshot fast-verify corpus must register before execution");
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync(devNull, "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: cases, fd: completionFd, maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });
