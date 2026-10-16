#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * Regression pin for backlog item
 * `pipeline.windows-os-temp-root-dacl-fails-private-state-assurance-for-test-fixtures` (AC-270).
 *
 * Acceptance points of the item (Description/Proposal):
 *   P1. Premise: on native Windows a fixture directory under os.tmpdir() is rated insecure by the private-state
 *       assurance because the inherited DACL grants non-owner principals.
 *   P2. Preferred fix, no security change: tests place fixtures under ONE hardened private root (owner-only,
 *       non-inheriting DACL) -- `privateTempRoot` / `privateMkdtemp` -- which the UNCHANGED assurance rates secure.
 *   P3. The assurance itself is not loosened: well-known system principals (SYSTEM, Administrators, ...) in a DACL
 *       still make a path insecure, and the helper does not change the verdict for an ordinary os.tmpdir() sibling.
 *   P4. Consumers: fixture suites actually use the helper (consumer mapping, not a v3 failure-count claim).
 *
 * Every scenario touching the real helper runs in a fresh child Node process (the root is memoized per process).
 * Our own fixtures and scratch mirrors live under the repository's scratch/ directory.
 *
 * Host limitation (PO decision K7): the POSIX 0700 branch needs directory mode bits unavailable on native Windows.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { assessWindowsPrivatePath, evaluateWindowsPrivateState } from "../windows-private-state.mjs";

const IS_WIN32 = process.platform === "win32";
const HERE = dirname(fileURLToPath(import.meta.url));
const LIB = resolve(HERE, "..");
const REPO_ROOT = resolve(LIB, "..", "..", "..");
const HELPER_PATH = join(LIB, "test-private-tmp.mjs");
const ADAPTER_PATH = join(LIB, "windows-private-state.mjs");
const HELPER_URL = pathToFileURL(HELPER_PATH).href;
const ADAPTER_URL = pathToFileURL(ADAPTER_PATH).href;
const SUCCESS_URL = pathToFileURL(join(LIB, "successful-spawn.mjs")).href;
const SCRATCH = join(REPO_ROOT, "scratch", `pin-os-temp-dacl-${randomUUID().slice(0, 8)}`);
const WIN_ONLY = IS_WIN32 ? false : "host-limitation: native Windows DACL semantics only; owner Coordinator, due 2026-10-19 (PO decision K7) for the Linux/WSL run";
const POSIX_ONLY = IS_WIN32
  ? "host-limitation: POSIX 0700 branch needs directory mode bits unavailable on native Windows; owner Coordinator, due 2026-10-19 (PO decision K7) for the Linux/WSL run"
  : false;

after(() => rmSync(SCRATCH, { recursive: true, force: true }));

function observation(principals, overrides = {}) {
  return { currentOwner: "HOST\\Tester", owner: "HOST\\Tester", reparsePoint: false, principals, ...overrides };
}

/** Scratch mirror of a production module; `mutate` edits its text. Fails loudly if the mutation did not apply. */
function mirror(name, sourcePath, rewrite, mutate) {
  mkdirSync(SCRATCH, { recursive: true });
  let text = readFileSync(sourcePath, "utf8");
  text = rewrite(text);
  if (mutate) {
    const mutated = mutate(text);
    assert.notEqual(mutated, text, "the mutation must change the mirror (otherwise the RED proves nothing)");
    text = mutated;
  }
  const path = join(SCRATCH, `${name}.mjs`);
  writeFileSync(path, text);
  return pathToFileURL(path).href;
}
const mirrorAdapter = (name, mutate) => mirror(name, ADAPTER_PATH,
  (text) => text.replace('from "./successful-spawn.mjs"', `from ${JSON.stringify(SUCCESS_URL)}`), mutate);
const mirrorHelper = (name, mutate) => mirror(name, HELPER_PATH,
  (text) => text.replace('from "./windows-private-state.mjs"', `from ${JSON.stringify(ADAPTER_URL)}`), mutate);

// Child scenario: argv[1] = helper module URL (real or mirror), argv[2] = real adapter URL (the judge).
const SCENARIO = [
  'import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";',
  'import { tmpdir } from "node:os";',
  'import { join } from "node:path";',
  "const helper = await import(process.argv[1]);",
  "const adapter = await import(process.argv[2]);",
  "function attempt(run) { try { return { value: run(), code: null, message: null }; } catch (error) { return { value: null, code: error?.code ?? null, message: String(error?.message) }; } }",
  "const rootTry = attempt(() => helper.privateTempRoot());",
  "const out = { rootCode: rootTry.code, rootMessage: rootTry.message };",
  "if (rootTry.value !== null) {",
  "  const root = rootTry.value;",
  "  const child = helper.privateMkdtemp('pin-child-');",
  "  const file = join(child, 'f.txt');",
  "  writeFileSync(file, 'x');",
  "  const obs = adapter.observeWindowsPrivatePath(root).observation;",
  "  out.root = root;",
  "  out.rootStatus = adapter.assessWindowsPrivatePath(root).status;",
  "  out.childStatus = adapter.assessWindowsPrivatePath(child).status;",
  "  out.fileStatus = adapter.assessWindowsPrivatePath(file).status;",
  "  out.principals = obs.principals; out.currentOwner = obs.currentOwner; out.owner = obs.owner;",
  "  out.underOsTemp = root.toLowerCase().startsWith(tmpdir().toLowerCase());",
  "  const sibling = mkdtempSync(join(tmpdir(), 'pin-sibling-'));",
  "  out.siblingStatus = adapter.assessWindowsPrivatePath(sibling).status;",
  "  rmSync(sibling, { recursive: true, force: true });",
  "}",
  'process.stdout.write(JSON.stringify(out) + "\\n");',
].join("\n");

function runScenario(helperUrl) {
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", SCENARIO, helperUrl, ADAPTER_URL], {
    encoding: "utf8", timeout: 180_000, shell: false, windowsHide: true,
  });
  assert.equal(result.error, undefined, `child must start: ${result.error?.message}`);
  assert.equal(result.status, 0, `child must exit 0 (status=${result.status}): ${result.stderr}`);
  const lines = result.stdout.trim().split(/\r?\n/);
  return JSON.parse(lines[lines.length - 1]);
}

function assertHardenedFixtures(report, label) {
  assert.equal(report.rootCode, null, `${label}: the private root must be created (${report.rootCode}: ${report.rootMessage})`);
  assert.equal(report.rootStatus, "secure", `${label}: root must be rated secure by the unchanged assurance`);
  assert.equal(report.childStatus, "secure", `${label}: a privateMkdtemp child inherits the secure DACL`);
  assert.equal(report.fileStatus, "secure", `${label}: a file inside the child inherits the secure DACL`);
  assert.deepEqual(report.principals.map((p) => p.toLowerCase()), [report.currentOwner.toLowerCase()], `${label}: only the current principal holds an ACE`);
}

// ---- P3 (pure, any host): the assurance is not loosened -------------------------------------------------------------

test("AC-270 P3: a DACL granting SYSTEM, Administrators, Users or Everyone beside the owner is insecure (no system-principal allowance)", () => {
  assert.equal(evaluateWindowsPrivateState(observation(["HOST\\Tester"])).status, "secure");
  for (const extra of ["NT AUTHORITY\\SYSTEM", "BUILTIN\\Administrators", "NT-AUTORITÄT\\SYSTEM", "VORDEFINIERT\\Administratoren", "BUILTIN\\Users", "Everyone", "S-1-5-18"]) {
    const verdict = evaluateWindowsPrivateState(observation(["HOST\\Tester", extra]));
    assert.equal(verdict.status, "insecure", `${extra} must make the path insecure`);
    assert.match(verdict.reason, /non-owner principal/);
  }
});

test("AC-270 P3: owner mismatch, reparse point and empty DACL stay insecure (policy shape unchanged)", () => {
  assert.equal(evaluateWindowsPrivateState(observation(["HOST\\Tester"], { owner: "BUILTIN\\Administrators" })).status, "insecure");
  assert.equal(evaluateWindowsPrivateState(observation(["HOST\\Tester"], { reparsePoint: true })).status, "insecure");
  assert.equal(evaluateWindowsPrivateState(observation([])).status, "insecure");
  assert.equal(evaluateWindowsPrivateState(null).status, "unavailable");
});

test("AC-270 P3 RED: a scratch mirror that tolerates non-owner principals makes the SYSTEM/Administrators case fail", async () => {
  const url = mirrorAdapter("mutant-accept-system", (text) => text.replace(".some((principal) => principal !== current)", ".some(() => false)"));
  const mutant = await import(url);
  const verdict = mutant.evaluateWindowsPrivateState(observation(["HOST\\Tester", "NT AUTHORITY\\SYSTEM"]));
  assert.equal(verdict.status, "secure", "the mutant accepts a system principal");
  assert.throws(() => assert.equal(verdict.status, "insecure"), assert.AssertionError, "the P3 assertion goes red against the mutant");
});

// ---- P1 (win32): the defect premise is real on this host -------------------------------------------------------------

test("AC-270 P1: a fresh directory under os.tmpdir() is rated insecure for a non-owner principal in its inherited DACL", { skip: WIN_ONLY }, (context) => {
  mkdirSync(SCRATCH, { recursive: true });
  const dir = mkdtempSync(join(tmpdir(), "pin-os-temp-"));
  try {
    const verdict = assessWindowsPrivatePath(dir);
    if (verdict.status === "secure") { context.skip("premise not present on this host: os.tmpdir() inherits an owner-only DACL"); return; }
    assert.equal(verdict.status, "insecure");
    assert.match(verdict.reason, /non-owner principal/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---- P2 (win32): hardened private root makes fixtures secure with no policy change ----------------------------------

test("AC-270 P2: privateTempRoot/privateMkdtemp give a root, child dir and file the unchanged assurance rates secure", { skip: WIN_ONLY }, () => {
  const report = runScenario(HELPER_URL);
  assertHardenedFixtures(report, "production");
});

test("AC-270 P2/P3: the same process still rates an ordinary os.tmpdir() sibling by the unchanged policy (no bypass, no allowance)", { skip: WIN_ONLY }, (context) => {
  const report = runScenario(HELPER_URL);
  assert.equal(report.rootStatus, "secure");
  if (report.siblingStatus === "secure") { context.skip("premise not present on this host: os.tmpdir() siblings are already secure"); return; }
  assert.equal(report.siblingStatus, "insecure", "hardening one root must not change the verdict for other temp paths");
});

test("AC-270 P2 RED: a scratch mirror of the helper that skips hardening leaves the root insecure and is refused (hardening is what makes it secure)", { skip: WIN_ONLY }, () => {
  const control = runScenario(mirrorHelper("control", null));
  assertHardenedFixtures(control, "control mirror");
  const url = mirrorHelper("mutant-no-harden", (text) => text.replace("    harden(root);\n", ""));
  const report = runScenario(url);
  assert.equal(report.rootCode, "PRIVATE_TMP_ROOT_NOT_SECURE", "an unhardened os.tmpdir() root fails closed instead of degrading");
  assert.throws(() => assertHardenedFixtures(report, "mutant"), assert.AssertionError, "the pin goes red when hardening is removed");
});

// ---- P4: consumer mapping --------------------------------------------------------------------------------------------

test("AC-270 P4: the helper imports only the existing adapter (no second policy) and an existing fixture suite adopts it", () => {
  const helper = readFileSync(HELPER_PATH, "utf8");
  assert.match(helper, /from "\.\/windows-private-state\.mjs"/);
  assert.doesNotMatch(helper, /allowSystem|acceptSystem|SYSTEM|Administrators/i, "the helper must not carry its own principal allowance");
  const sweep = readFileSync(join(REPO_ROOT, "plugins", "pipeline-core", "scripts", "scratch-sweep.test.mjs"), "utf8");
  assert.match(sweep, /import \{ privateMkdtemp \} from '\.\.\/lib\/test-private-tmp\.mjs'/);
  const suites = readFileSync(join(REPO_ROOT, "harness", "verify-suites.json"), "utf8");
  assert.ok(suites.includes("plugins/pipeline-core/lib/test-private-tmp.test.mjs"), "the helper's own contract suite stays registered");
});

test("AC-270 host-limitation: POSIX branch hardens with chmod 0700 (mode bits)", { skip: POSIX_ONLY }, () => {
  const report = runScenario(HELPER_URL);
  assert.equal(report.rootCode, null);
});
