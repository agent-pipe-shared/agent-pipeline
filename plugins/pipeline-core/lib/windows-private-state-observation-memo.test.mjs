// ALF-C-LAT-01: the native Windows DACL observation is memoized per process, keyed by exact path
// AND lstat identity, never for failures, and never when a test seam (run/environment) is injected.
import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const win32 = process.platform === "win32";
const modulePath = process.env.WPS_MODULE_UNDER_TEST ?? new URL("./windows-private-state.mjs", import.meta.url).href;

// Count real PowerShell spawns by wrapping the builtin before the module binds it.
const realSpawnSync = childProcess.spawnSync;
const state = { powershell: 0, failNext: false };
childProcess.spawnSync = function countingSpawnSync(file, ...rest) {
  if (/powershell/iu.test(String(file))) {
    state.powershell += 1;
    if (state.failNext) {
      state.failNext = false;
      return { status: 1, signal: null, stdout: "", stderr: "", error: undefined, pid: 0, output: [null, "", ""] };
    }
  }
  return realSpawnSync(file, ...rest);
};
syncBuiltinESMExports();
const { assessWindowsPrivatePath, observeWindowsPrivatePath } = await import(`${modulePath}?memo-test=${Date.now()}`);

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

test("a modified file (content or timestamp) is observed natively again", { skip: !win32 }, () => {
  const file = freshFile();
  assessWindowsPrivatePath(file);
  let before = state.powershell;
  appendFileSync(file, "more");
  assessWindowsPrivatePath(file);
  assert.equal(state.powershell - before, 1);
  before = state.powershell;
  utimesSync(file, new Date(1_000_000_000_000), new Date(1_000_000_000_000));
  assessWindowsPrivatePath(file);
  assert.equal(state.powershell - before, 1);
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
