// ALF-C-LAT-01: the native Windows DACL observation is memoized per process, keyed by exact path
// AND lstat identity, never for failures, and never when a test seam (run/environment) is injected.
import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { appendFileSync, mkdirSync, mkdtempSync, renameSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const win32 = process.platform === "win32";
const modulePath = process.env.WPS_MODULE_UNDER_TEST ?? new URL("./windows-private-state.mjs", import.meta.url).href;

// Count real PowerShell spawns by wrapping the builtin before the module binds it.
const realSpawnSync = childProcess.spawnSync;
const state = { powershell: 0, failNext: false, failBatch: false, tamperRow: null };
const failed = { status: 1, signal: null, stdout: "", stderr: "", error: undefined, pid: 0, output: [null, "", ""] };
childProcess.spawnSync = function countingSpawnSync(file, ...rest) {
  if (/powershell/iu.test(String(file))) {
    state.powershell += 1;
    const isBatch = typeof rest[1]?.input === "string";
    if (state.failNext || (state.failBatch && isBatch)) {
      state.failNext = false;
      return failed;
    }
    if (isBatch && state.tamperRow !== null) {
      const result = realSpawnSync(file, ...rest);
      const rows = JSON.parse(String(result.stdout).trim()).map((row) => (row.path === state.tamperRow ? { path: row.path, error: true } : row));
      return { ...result, stdout: JSON.stringify(rows) };
    }
  }
  return realSpawnSync(file, ...rest);
};
syncBuiltinESMExports();
const { assessWindowsPrivatePath, evaluateWindowsPrivateState, hardenWindowsPrivateDirectory, observeWindowsPrivatePath } = await import(`${modulePath}?memo-test=${Date.now()}`);

const here = fileURLToPath(new URL(".", import.meta.url));
const scratchRoot = join(here, "..", "..", "..", "scratch");
mkdirSync(scratchRoot, { recursive: true });
const dir = mkdtempSync(join(scratchRoot, "wps-memo-"));
process.on("exit", () => {
  childProcess.spawnSync = realSpawnSync;
  rmSync(dir, { recursive: true, force: true });
});
let counter = 0;
function freshFile(content = "x") {
  const file = join(dir, `f${counter += 1}.txt`);
  writeFileSync(file, content);
  return file;
}

test("repeated assessment of an unchanged path spawns the native observer once", { skip: !win32 }, () => {
  const file = freshFile();
  const before = state.powershell;
  const first = assessWindowsPrivatePath(file);
  const second = assessWindowsPrivatePath(file);
  const third = observeWindowsPrivatePath(file);
  assert.equal(state.powershell - before, 1);
  assert.deepEqual(second, first);
  assert.equal(third.status, null);
});

// ALF-C-LAT-02 (PO decision A): the memo key is the stable object identity (path, dev, ino, type), so a content or
// timestamp change of the SAME object stays memoized, while a REPLACED object (new ino) or a type change is observed again.
test("a replaced object (new ino) and a type change force a new native observation", { skip: !win32 }, () => {
  const file = freshFile();
  assessWindowsPrivatePath(file);
  let before = state.powershell;
  appendFileSync(file, "more");
  utimesSync(file, new Date(1_000_000_000_000), new Date(1_000_000_000_000));
  assessWindowsPrivatePath(file);
  assert.equal(state.powershell - before, 0, "the same object with new content/timestamps stays memoized");
  // replacement: a second file exists concurrently, so its ino is certainly different
  const donor = freshFile("donor");
  renameSync(file, `${file}.old`);
  renameSync(donor, file);
  before = state.powershell;
  assessWindowsPrivatePath(file);
  assert.equal(state.powershell - before, 1, "a replaced object is observed natively again");
  // type change: file becomes a directory at the same path
  rmSync(file);
  mkdirSync(file);
  before = state.powershell;
  assessWindowsPrivatePath(file);
  assert.equal(state.powershell - before, 1, "a type change is observed natively again");
});

test("a directory whose mtime moves after an entry is added stays memoized", { skip: !win32 }, () => {
  const sub = join(dir, `d${counter += 1}`);
  mkdirSync(sub);
  assessWindowsPrivatePath(sub);
  writeFileSync(join(sub, "entry.txt"), "x");
  utimesSync(sub, new Date(1_000_000_000_000), new Date(1_000_000_000_000));
  const before = state.powershell;
  assessWindowsPrivatePath(sub);
  assert.equal(state.powershell - before, 0);
});

function privateTreeFixture() {
  const root = join(dir, `fx${counter += 1}`, ".git", "agent-pipeline");
  mkdirSync(join(root, "a", "b"), { recursive: true });
  mkdirSync(join(root, "onboarding"), { recursive: true });
  const files = [join(root, "a", "one.json"), join(root, "a", "b", "two.json"), join(root, "onboarding", "three.json")];
  for (const file of files) writeFileSync(file, "{}");
  return { root, files, dirs: [join(root, "a"), join(root, "a", "b"), join(root, "onboarding")] };
}

test("a miss inside <.git>/agent-pipeline observes the tree in one spawn; later lookups spawn zero times", { skip: !win32 }, () => {
  const tree = privateTreeFixture();
  const before = state.powershell;
  const first = observeWindowsPrivatePath(tree.files[0]);
  assert.equal(first.status, null);
  assert.equal(state.powershell - before, 1);
  const afterFirst = state.powershell;
  for (const path of [tree.root, ...tree.dirs, ...tree.files]) assert.equal(observeWindowsPrivatePath(path).status, null);
  assert.equal(state.powershell - afterFirst, 0);
  // the prefetched verdict equals the single-path verdict
  const single = observeWindowsPrivatePath(tree.files[1], { run: (...args) => realSpawnSync(...args) });
  // raw facts may differ cosmetically (account-name case and console code page of the cmdlet route); the verdict may not
  const prefetched = observeWindowsPrivatePath(tree.files[1]);
  assert.deepEqual(evaluateWindowsPrivateState(prefetched.observation), evaluateWindowsPrivateState(single.observation));
  assert.equal(prefetched.observation.reparsePoint, single.observation.reparsePoint);
  assert.equal(prefetched.observation.principals.length, single.observation.principals.length);
});

test("a batch row with error is not cached", { skip: !win32 }, () => {
  const tree = privateTreeFixture();
  state.tamperRow = tree.files[2];
  const before = state.powershell;
  assert.equal(observeWindowsPrivatePath(tree.files[0]).status, null);
  assert.equal(state.powershell - before, 1);
  state.tamperRow = null;
  const afterBatch = state.powershell;
  assert.equal(observeWindowsPrivatePath(tree.files[1]).status, null);
  assert.equal(state.powershell - afterBatch, 0);
  assert.equal(observeWindowsPrivatePath(tree.files[2]).status, null);
  assert.equal(state.powershell - afterBatch, 1, "the errored row was observed by the single-path route");
});

test("a failed batch falls back to the single-path observation for the missed path only", { skip: !win32 }, () => {
  const tree = privateTreeFixture();
  state.failBatch = true;
  const before = state.powershell;
  const result = assessWindowsPrivatePath(tree.files[0]);
  state.failBatch = false;
  assert.notEqual(result.status, "unavailable");
  assert.equal(state.powershell - before, 2, "one failed batch, then one single-path call");
  const afterFallback = state.powershell;
  assessWindowsPrivatePath(tree.files[0]);
  assert.equal(state.powershell - afterFallback, 0, "the missed path was memoized");
  observeWindowsPrivatePath(tree.files[2]);
  assert.ok(state.powershell - afterFallback >= 1, "no other entry was cached by the failed batch");
});

test("an injected run inside the agent-pipeline tree never batches or memoizes", { skip: !win32 }, () => {
  const tree = privateTreeFixture();
  const inputs = [];
  const run = (...args) => { inputs.push(args[2]?.input); return realSpawnSync(...args); };
  assessWindowsPrivatePath(tree.files[0], { run });
  assessWindowsPrivatePath(tree.files[0], { run });
  assert.deepEqual(inputs, [undefined, undefined]);
});

test("a failed or unavailable observation is never cached", { skip: !win32 }, () => {
  const file = freshFile();
  state.failNext = true;
  const failed = assessWindowsPrivatePath(file);
  assert.equal(failed.status, "unavailable");
  const before = state.powershell;
  const ok = assessWindowsPrivatePath(file);
  assert.notEqual(ok.status, "unavailable");
  assert.equal(state.powershell - before, 1);
  // a missing path has no lstat identity and is never memoized either
  const missing = join(dir, "does-not-exist.txt");
  const beforeMissing = state.powershell;
  assessWindowsPrivatePath(missing);
  assessWindowsPrivatePath(missing);
  assert.equal(state.powershell - beforeMissing, 2);
});

test("injected options.run or options.environment bypasses the memo", { skip: !win32 }, () => {
  const file = freshFile();
  assessWindowsPrivatePath(file);
  let calls = 0;
  const run = (...args) => { calls += 1; return realSpawnSync(...args); };
  assessWindowsPrivatePath(file, { run });
  assessWindowsPrivatePath(file, { run });
  assert.equal(calls, 2);
  const before = state.powershell;
  assessWindowsPrivatePath(file, { environment: process.env });
  assert.equal(state.powershell - before, 1);
});

// A guard that judges a path now (the dispatch-record claim reader) passes fresh: true: the memo cannot see an in-process DACL change of an
// object it already observed as private, so without the opt-out a loosened claim would keep its earlier "secure" verdict.
test("fresh: true bypasses the memo, sees an in-process DACL grant on an already-observed object and drops the stale entry", { skip: !win32 }, () => {
  const sub = join(dir, `h${counter += 1}`);
  mkdirSync(sub);
  assert.equal(hardenWindowsPrivateDirectory(sub).status, "secure");
  const file = join(sub, "claim.json");
  writeFileSync(file, "{}");
  assert.equal(assessWindowsPrivatePath(file).status, "secure");
  const grant = realSpawnSync("icacls", [file, "/grant", "*S-1-1-0:(M)"], { encoding: "utf8", windowsHide: true });
  assert.equal(grant.status, 0, String(grant.stderr || grant.stdout));
  assert.equal(assessWindowsPrivatePath(file).status, "secure", "the memoized verdict for the same object is kept (PO decision A)");
  const before = state.powershell;
  assert.equal(assessWindowsPrivatePath(file, { fresh: true }).status, "insecure");
  assert.equal(state.powershell - before, 1, "one single-path native observation, no batch");
  assert.equal(assessWindowsPrivatePath(file).status, "insecure", "the stale memo entry was dropped, so later memoized readers agree");
});

test("the verdict for a non-private path is unchanged by the memo", { skip: !win32 }, () => {
  const file = freshFile();
  const first = assessWindowsPrivatePath(file);
  const second = assessWindowsPrivatePath(file);
  assert.deepEqual(second, first);
  // an injected deterministic non-private observation still yields the evaluator's refusal, unmemoized
  const injected = assessWindowsPrivatePath(file, {
    run: () => ({ status: 0, signal: null, stdout: "not json", stderr: "" }),
  });
  assert.equal(injected.status, "unavailable");
});

test("pathToFileURL is available for mirror runs", () => {
  assert.ok(pathToFileURL(here).href.startsWith("file:"));
});
