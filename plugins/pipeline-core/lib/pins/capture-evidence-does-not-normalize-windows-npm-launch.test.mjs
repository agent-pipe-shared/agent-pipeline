// SPDX-License-Identifier: SUL-1.0
// Pin: pipeline.capture-evidence-does-not-normalize-windows-npm-launch (AC-122, ALF-C-P7-06).
//
// The original item body is not public (portable-original-requirements.json: association
// "unresolved"). The acceptance pinned here is the reconstruction in
// specs/sprint-alfred-epic/plans/acceptance-reconstruction/R2.md (AC-122), PO confirmation open:
//   P1 on Windows an npm command shim (npm / npm.cmd / explicit npm.cmd path) is normalized to the
//      platform launcher (cmd.exe /d /s /v:off /c) and runs through the real spawn result;
//   P2 on a non-Windows host, or a non-shim command, launch behaviour is unchanged;
//   P3 an un-normalizable launch is a typed CAPTURE-EVIDENCE-WINDOWS-* failure raised BEFORE any child
//      exists, never a fabricated exit code; the real child status passes through unchanged.
// Uses only the module's documented seams (platform, environment, lstatSyncFn, spawnSyncFn); no mocks of
// the behaviour under test. Native cmd/npm case runs only on a win32 host.
// RED proof: set CAPTURE_EVIDENCE_PIN_MODULE to a scratch mirror with the normalization removed.
import assert from "node:assert/strict";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const modulePath = process.env.CAPTURE_EVIDENCE_PIN_MODULE
  ?? resolve(here, "..", "..", "scripts", "capture-evidence.mjs");
const { planEvidenceCommandLaunch, spawnEvidenceCommand } = await import(pathToFileURL(modulePath).href);

const CWD = "C:\\work\\repo";
const SYSROOT = "C:\\Windows";
const CMD = "C:\\Windows\\System32\\cmd.exe";
const NPM_DIR = "C:\\tools\\node";

function fakeLstat(files, { symlinks = [] } = {}) {
  return (path) => {
    const key = path.toLowerCase();
    if (!files.map((f) => f.toLowerCase()).includes(key)) {
      const error = new Error("ENOENT");
      error.code = "ENOENT";
      throw error;
    }
    return { isFile: () => true, isSymbolicLink: () => symlinks.map((s) => s.toLowerCase()).includes(key) };
  };
}
const env = (extra = {}) => ({ PATH: NPM_DIR, PATHEXT: ".COM;.EXE;.BAT;.CMD", SystemRoot: SYSROOT, ...extra });
const win = (command, opts = {}) => planEvidenceCommandLaunch(command, {
  cwd: CWD, platform: "win32", environment: env(), lstatSyncFn: fakeLstat([`${NPM_DIR}\\npm.cmd`, CMD]), ...opts,
});
const typed = (suffix) => (error) => error.code === `CAPTURE-EVIDENCE-WINDOWS-${suffix}` && error.message === error.code;

test("P1: bare `npm` on win32 resolves npm.cmd via PATH/PATHEXT and launches through cmd.exe /d /s /v:off /c", () => {
  const plan = win(["npm", "install", "left-pad"]);
  assert.equal(plan.windowsBatch, true);
  assert.equal(plan.executable, CMD);
  assert.deepEqual(plan.args, ["/d", "/s", "/v:off", "/c", `""${NPM_DIR}\\npm.CMD" "install" "left-pad""`]);
});

test("P1: `npm.cmd` selector and an explicit npm.cmd path both normalize to the same cmd.exe launch", () => {
  const bySelector = win(["NPM.CMD", "--version"]);
  assert.equal(bySelector.executable, CMD);
  assert.equal(bySelector.windowsBatch, true);
  const explicit = win([".\\bin\\npm.cmd", "--version"], { lstatSyncFn: fakeLstat([`${CWD}\\bin\\npm.cmd`, CMD]) });
  assert.equal(explicit.executable, CMD);
  assert.match(explicit.args[4], /^""C:\\work\\repo\\bin\\npm\.cmd" "--version""$/u);
});

test("P1: an npm.exe resolved from PATH is launched directly, not wrapped in cmd.exe", () => {
  const plan = win(["npm", "-v"], {
    environment: env({ PATHEXT: ".EXE" }),
    lstatSyncFn: fakeLstat([`${NPM_DIR}\\npm.exe`, CMD]),
  });
  assert.deepEqual(plan, { executable: `${NPM_DIR}\\npm.EXE`, args: ["-v"], windowsBatch: false });
});

test("P2: a non-Windows host keeps the direct launch for npm (no normalization)", () => {
  for (const platform of ["linux", "darwin"]) {
    const plan = planEvidenceCommandLaunch(["npm", "test"], { cwd: "/repo", platform, environment: {} });
    assert.deepEqual(plan, { executable: "npm", args: ["test"], windowsBatch: false });
  }
});

test("P2: a non-shim command on win32 keeps the direct launch", () => {
  assert.deepEqual(win(["node", "--version"]), { executable: "node", args: ["--version"], windowsBatch: false });
  assert.deepEqual(win(["npx", "x"]), { executable: "npx", args: ["x"], windowsBatch: false });
});

test("P3: an un-normalizable launch throws a typed CAPTURE-EVIDENCE-WINDOWS-* error, never a plan", () => {
  assert.throws(() => win(["npm", "i"], { lstatSyncFn: fakeLstat([CMD]) }), typed("NPM-LAUNCHER-MISSING"));
  assert.throws(() => win(["npm", "a&b"]), typed("NPM-ARGUMENT-UNSUPPORTED"));
  assert.throws(() => win(["npm", "a%PATH%"]), typed("NPM-ARGUMENT-UNSUPPORTED"));
  assert.throws(() => win(["npm", "dir\\"]), typed("NPM-ARGUMENT-UNSUPPORTED"));
  assert.throws(() => win(["npm", "x"], { environment: (() => { const e = env(); delete e.SystemRoot; return e; })() }), typed("CMD-UNAVAILABLE"));
  assert.throws(() => win(["npm", "x"], { lstatSyncFn: fakeLstat([`${NPM_DIR}\\npm.cmd`]) }), typed("CMD-UNAVAILABLE"));
  assert.throws(() => win(["npm", "x"], { cwd: "relative\\dir" }), typed("CWD-UNSUPPORTED"));
  assert.throws(() => win(["npm", "x"], { environment: env({ Path: "C:\\other" }) }), typed("ENVIRONMENT-UNSUPPORTED"));
  assert.throws(() => win(["npm", "x"], { environment: env({ PATHEXT: ".PS1" }) }), typed("ENVIRONMENT-UNSUPPORTED"));
  assert.throws(() => win(["npm", "x"], { lstatSyncFn: fakeLstat([`${NPM_DIR}\\npm.cmd`, CMD], { symlinks: [`${NPM_DIR}\\npm.cmd`] }) }),
    typed("NPM-LAUNCHER-UNSUPPORTED"));
});

test("P3: spawnEvidenceCommand passes the real child result through unchanged and spawns cmd.exe verbatim", () => {
  const calls = [];
  const real = { status: 7, stdout: "out", stderr: "err", signal: null };
  const result = spawnEvidenceCommand(["npm", "run", "x"], {
    cwd: CWD, platform: "win32", environment: env(),
    lstatSyncFn: fakeLstat([`${NPM_DIR}\\npm.cmd`, CMD]),
    spawnSyncFn: (executable, args, options) => { calls.push({ executable, args, options }); return real; },
  });
  assert.equal(result, real);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].executable, CMD);
  assert.equal(calls[0].options.shell, false);
  assert.equal(calls[0].options.windowsVerbatimArguments, true);
  assert.equal(calls[0].options.env.PATH, NPM_DIR);
});

test("P3: a launch failure happens before any child is spawned (spawn seam never called)", () => {
  let spawned = 0;
  assert.throws(() => spawnEvidenceCommand(["npm", "a|b"], {
    cwd: CWD, platform: "win32", environment: env(),
    lstatSyncFn: fakeLstat([`${NPM_DIR}\\npm.cmd`, CMD]),
    spawnSyncFn: () => { spawned += 1; return { status: 0 }; },
  }), typed("NPM-ARGUMENT-UNSUPPORTED"));
  assert.throws(() => spawnEvidenceCommand(["npm", "x"], {
    cwd: CWD, platform: "win32", environment: null, spawnSyncFn: () => { spawned += 1; return { status: 0 }; },
  }), typed("ENVIRONMENT-UNSUPPORTED"));
  assert.equal(spawned, 0);
});

test("P2: spawnEvidenceCommand on a non-Windows host or non-shim command keeps historical options (no env/shell injection)", () => {
  for (const [platform, command] of [["linux", ["npm", "x"]], ["win32", ["node", "x"]]]) {
    let seen;
    spawnEvidenceCommand(command, {
      cwd: CWD, platform, spawnSyncFn: (executable, args, options) => { seen = { executable, args, options }; return { status: 0 }; },
    });
    assert.equal(seen.executable, command[0]);
    assert.deepEqual(seen.args, command.slice(1));
    assert.equal("env" in seen.options, false);
    assert.equal("shell" in seen.options, false);
    assert.equal("windowsVerbatimArguments" in seen.options, false);
  }
});

const native = process.platform === "win32" ? test : (name, fn) => test(name, {
  skip: "host-limitation: native cmd/npm run needs a Windows host; owner Coordinator, due 2026-10-19 (Windows-only case; no Linux equivalent)",
}, fn);

native("P1 native win32 (stock host environment): bare `npm` is normalized under the host's own unmodified PATHEXT", () => {
  // The stock Windows PATHEXT lists .VBS;.JS;.WSF;... in addition to .COM;.EXE;.BAT;.CMD.
  // KNOWN RED (source defect): planEvidenceCommandLaunch rejects any non-.COM/.EXE/.BAT/.CMD
  // PATHEXT entry for bare `npm` as ENVIRONMENT-UNSUPPORTED, so the normal Windows environment
  // cannot launch `npm` through capture-evidence. Fix site: scripts/capture-evidence.mjs,
  // planEvidenceCommandLaunch (the `extensions.some(...)` throw at the PATHEXT check).
  const ok = spawnEvidenceCommand(["npm", "--version"], { cwd: process.cwd() });
  assert.equal(ok.error, undefined);
  assert.equal(ok.status, 0);
  assert.match(ok.stdout.trim(), /^\d+\.\d+\.\d+/u);
});

native("P1/P3 native win32: real `npm.cmd` runs through the normalized launch with the real status and output", () => {
  const ok = spawnEvidenceCommand(["npm.cmd", "--version"], { cwd: process.cwd() });
  assert.equal(ok.error, undefined);
  assert.equal(ok.status, 0);
  assert.match(ok.stdout.trim(), /^\d+\.\d+\.\d+/u);
  const bad = spawnEvidenceCommand(["npm.cmd", "run", "__pin_no_such_script__"], { cwd: process.cwd() });
  assert.equal(bad.error, undefined);
  assert.notEqual(bad.status, 0);
  assert.notEqual(bad.status, null);
});
