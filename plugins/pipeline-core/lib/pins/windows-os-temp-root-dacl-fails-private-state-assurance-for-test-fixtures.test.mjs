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
 *   P5. State-authority fixtures: the prospective-materialization fixture creates its `.git/agent-pipeline` private
 *       root through the production-owned creator (owner-only, protected DACL), so the State authority is reachable,
 *       while an inheriting mkdirSync private root stays refused by the unchanged inspection.
 *
 * Every scenario touching the real helper runs in a fresh child Node process (the root is memoized per process).
 * Our own fixtures and scratch mirrors live under the repository's scratch/ directory.
 *
 * Host limitation (PO decision K7): the POSIX 0700 branch needs directory mode bits unavailable on native Windows.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { makeFixture, state } from "../architecture-prospective-materialization.fixture.mjs";
import { assessWindowsPrivatePath, evaluateWindowsPrivateState } from "../windows-private-state.mjs";
import { inspectWindowsOwnedAuthorityPath } from "../windows-owned-authority-backend.mjs";

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

// Child scenario for the POSIX branch: no Windows adapter observation exists off win32, so it reports mode bits instead.
const POSIX_SCENARIO = [
  'import { statSync, writeFileSync } from "node:fs";',
  'import { join } from "node:path";',
  "const helper = await import(process.argv[1]);",
  "const root = helper.privateTempRoot();",
  "const child = helper.privateMkdtemp('pin-posix-child-');",
  "const file = join(child, 'f.txt');",
  "writeFileSync(file, 'x');",
  "const out = { root, child, rootMode: statSync(root).mode & 0o777, childIsDir: statSync(child).isDirectory(), childInsideRoot: child.startsWith(root), fileSize: statSync(file).size };",
  'process.stdout.write(JSON.stringify(out) + "\\n");',
].join("\n");

test("AC-270 POSIX branch hardens with chmod 0700 (mode bits), executed unconditionally on POSIX", { skip: POSIX_ONLY }, () => {
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", POSIX_SCENARIO, HELPER_URL], {
    encoding: "utf8", timeout: 180_000, shell: false, windowsHide: true,
  });
  assert.equal(result.error, undefined, `child must start: ${result.error?.message}`);
  assert.equal(result.status, 0, `child must exit 0 (status=${result.status}): ${result.stderr}`);
  const lines = result.stdout.trim().split(/\r?\n/);
  const report = JSON.parse(lines[lines.length - 1]);
  assert.equal(report.rootMode, 0o700, "the private root is owner-only (0700)");
  assert.equal(report.childIsDir, true);
  assert.equal(report.childInsideRoot, true, "privateMkdtemp places the child inside the private root");
  assert.equal(report.fileSize, 1);
});

// ---- P2 (any host): the helper contract against a simulated Windows observation --------------------------------------
// An owner-only, non-inheriting DACL observation (what the helper's hardening produces) is rated secure by the
// UNCHANGED evaluator for root, child and file; the inherited os.tmpdir() shape (extra principals) is not.

test("AC-270 P2 (simulated observation): owner-only observations of root, child dir and file are rated secure; an inherited os-temp shape is not", () => {
  for (const kind of ["root", "child dir", "file"]) {
    assert.equal(evaluateWindowsPrivateState(observation(["HOST\\Tester"])).status, "secure", `${kind}: owner-only DACL is secure`);
  }
  const inherited = evaluateWindowsPrivateState(observation(["HOST\\Tester", "NT AUTHORITY\\SYSTEM", "BUILTIN\\Users"]));
  assert.equal(inherited.status, "insecure", "the inherited os.tmpdir() DACL shape stays insecure (P1 premise, no policy change)");
  assert.match(inherited.reason, /non-owner principal/);
});

// ---- P6 (win32): retention-parent check is platform-correct (ALF-C-P22-06H) ---------------------------------------------

const DDB_PATH = join(LIB, "design-decision-bindings.mjs");
const LIB_URL_PREFIX = pathToFileURL(LIB + "/").href;
/** Scratch mirror of design-decision-bindings.mjs exposing the two retention-parent helpers; `mutate` edits its text. */
function mirrorBindings(name, mutate) {
  return mirror(name, DDB_PATH,
    (text) => text.replace(/from (['"])\.\//g, (_m, q) => `from ${q}${LIB_URL_PREFIX}`)
      + "\nexport { evidenceDirectory as __evidenceDirectory, architectureReferenceDirectory as __architectureReferenceDirectory };\n",
    mutate);
}
const RETENTION_RE = /DDB-RETENTION-PARENT-UNSAFE/;
function refuses(run) {
  try { run(); } catch (error) { return RETENTION_RE.test(`${error?.code ?? ""} ${error?.message ?? ""}`); }
  return false;
}

test("AC-270 P6: the retention-parent checks admit an ordinary owned directory on win32 and still refuse a linked parent", { skip: WIN_ONLY }, async () => {
  const mod = await import(mirrorBindings("ddb-control", null));
  mkdirSync(SCRATCH, { recursive: true });
  const root = mkdtempSync(join(SCRATCH, "retention-ok-"));
  assert.equal(mod.__evidenceDirectory(root), join(root, "project", "design-approval-evidence"));
  assert.equal(mod.__architectureReferenceDirectory(root, true), join(root, "project", "aggregate-design-architecture-references"));

  const real = mkdtempSync(join(SCRATCH, "retention-real-"));
  const linked = mkdtempSync(join(SCRATCH, "retention-link-"));
  let linkMade = true;
  try { symlinkSync(real, join(linked, "project"), "junction"); } catch { linkMade = false; }
  if (linkMade) {
    assert.ok(refuses(() => mod.__evidenceDirectory(linked)), "a linked project parent must stay refused");
  }
});

test("AC-270 P6 RED: a scratch mirror with the original POSIX-only mode term refuses an ordinary owned directory on win32", { skip: WIN_ONLY }, async () => {
  const url = mirrorBindings("ddb-mutant-posix-mode", (text) => text.split("(process.platform === 'win32' || (stat.mode & 0o022n) === 0n), 'DDB-RETENTION-PARENT-UNSAFE'")
    .join("(stat.mode & 0o022n) === 0n, 'DDB-RETENTION-PARENT-UNSAFE'")
    .replace("&& (process.platform === 'win32' || (stat.mode & 0o022n) === 0n), 'DDB-RETENTION-PARENT-UNSAFE'", "&& (stat.mode & 0o022n) === 0n, 'DDB-RETENTION-PARENT-UNSAFE'"));
  const mod = await import(url);
  mkdirSync(SCRATCH, { recursive: true });
  const root = mkdtempSync(join(SCRATCH, "retention-red-"));
  assert.ok(refuses(() => mod.__evidenceDirectory(root)), "the original code refuses an ordinary directory on win32 (the defect)");
  const root2 = mkdtempSync(join(SCRATCH, "retention-red2-"));
  mkdirSync(join(root2, "project"), { mode: 0o700 });
  mkdirSync(join(root2, "project", "design-approval-evidence"), { mode: 0o700 });
  mkdirSync(join(root2, "project", "aggregate-design-architecture-references"), { mode: 0o700 });
  assert.ok(refuses(() => mod.__architectureReferenceDirectory(root2, false)), "the architecture-reference check is refused too");
});

// ---- P5 (win32): State-authority fixtures ---------------------------------------------------------------------------

/** Real shape of a backend observation: `nativeFacts` is a non-empty string and `nativeFactsSha256` its 64-hex digest. */
function carriesNativeFacts(observed) {
  return observed !== null && typeof observed === "object"
    && typeof observed.nativeFacts === "string" && observed.nativeFacts.length > 0
    && typeof observed.nativeFactsSha256 === "string" && /^[0-9a-f]{64}$/u.test(observed.nativeFactsSha256);
}

test("AC-270 P5: fixture set-feature reaches the State authority and the private root passes native DACL inspection", { skip: WIN_ONLY }, () => {
  const f = makeFixture("signature", { stage: "draft" });
  const observed = inspectWindowsOwnedAuthorityPath({ path: join(f.dir, ".git", "agent-pipeline"), directory: true });
  assert.ok(observed !== undefined && observed !== null, "native inspection must return an observation");
  assert.equal(carriesNativeFacts(observed), true, "the observation must carry native facts (non-empty string plus its sha256 digest)");
  assert.equal(typeof observed.committed, "boolean", "the backend observation reports a boolean committed flag");
  // Negative controls: stubs without real native facts must not satisfy the shape check.
  assert.equal(carriesNativeFacts({}), false, "a backend returning {} must fail the native-facts check");
  assert.equal(carriesNativeFacts({ committed: false }), false, "an observation omitting nativeFacts must fail the check");
  assert.equal(carriesNativeFacts({ nativeFacts: "", nativeFactsSha256: observed.nativeFactsSha256 }), false, "empty native facts must fail the check");
  // The fixture ran `set-feature --id e2e`; the State authority must report exactly that feature.
  const current = state(f);
  assert.equal(current.activeFeature?.id, "e2e", "the State read back after makeFixture must name the feature set by the fixture");
  assert.equal(current.activeFeature?.planPath, "specs/e2e/prd_e2e.md", "the State carries the plan path given to set-feature");
});

test("AC-270 P5: DACL assurance is not weakened -- an inheriting mkdirSync private root is still refused", { skip: WIN_ONLY }, () => {
  mkdirSync(SCRATCH, { recursive: true });
  const root = mkdtempSync(join(SCRATCH, "dacl-pin-"));
  const dir = join(root, "agent-pipeline");
  mkdirSync(dir, { mode: 0o700 });
  assert.throws(() => inspectWindowsOwnedAuthorityPath({ path: dir, directory: true }), (error) => error.reason === "WIN-AUTH-DACL" || error.reason === "WIN-AUTH-OWNER");
});
