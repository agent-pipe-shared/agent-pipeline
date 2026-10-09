#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir, devNull } from "node:os";
import { join } from "node:path";
import {
  assessWindowsPrivatePath,
  assessWindowsPrivatePaths,
  evaluateWindowsPrivatePathBatch,
  evaluateWindowsPrivateState,
  hardenWindowsPrivateDirectory,
  observeWindowsPrivatePath,
  sanitizeChildEnvironment,
} from "./windows-private-state.mjs";
import { hasExpectedSpawnStatus, isSuccessfulSpawn } from "./successful-spawn.mjs";
import { PrivateBoundaryError, assureWindowsPrivateDirectories } from "./private-boundary.mjs";
import { registerTestCaseCompletion } from "./test-case-completion.mjs";
import { openSync as openCompletionDescriptor } from "node:fs";

const completionCases = [];
function check(name, run) {
  const entry = { id: "WPS" + String(completionCases.length + 1).padStart(3, "0"), name, run };
  if (name.startsWith("invoke()") && process.platform !== "win32") entry.mode = "skip";
  completionCases.push(entry);
}
const secure = () => ({ currentOwner: "DESKTOP\\agent", owner: "DESKTOP\\agent", reparsePoint: false, principals: ["DESKTOP\\agent"] });
check("accepts only the concrete owner with no reparse point", () => assert.equal(evaluateWindowsPrivateState(secure()).status, "secure"));
check("rejects SYSTEM and Administrators as implicit exceptions", () => { for (const principal of ["SYSTEM", "BUILTIN\\Administrators", "Everyone", "DESKTOP\\other"]) { const value = secure(); value.principals.push(principal); assert.equal(evaluateWindowsPrivateState(value).status, "insecure"); } });
check("rejects owner drift and reparse points", () => { const owner = secure(); owner.owner = "SYSTEM"; assert.equal(evaluateWindowsPrivateState(owner).status, "insecure"); const link = secure(); link.reparsePoint = true; assert.equal(evaluateWindowsPrivateState(link).status, "insecure"); });
check("keeps malformed observations unavailable", () => { assert.equal(evaluateWindowsPrivateState(null).status, "unavailable"); assert.equal(evaluateWindowsPrivateState({}).status, "unavailable"); });
check("batched Windows observations preserve exact per-path owner and ACL policy", () => {
  const paths = ["C:/fixture/one", "C:/fixture/two"];
  const observations = [
    { path: paths[0], ...secure() },
    { path: paths[1], ...secure(), principals: ["DESKTOP\\agent", "BUILTIN\\Users"] },
  ];
  assert.deepEqual(evaluateWindowsPrivatePathBatch(paths, observations).map((row) => row.status), ["secure", "insecure"]);
});
check("batched Windows observations fail closed on reordered, missing, and malformed rows", () => {
  const paths = ["C:/fixture/one", "C:/fixture/two"];
  const first = { path: paths[0], ...secure() };
  const second = { path: paths[1], ...secure() };
  assert.deepEqual(evaluateWindowsPrivatePathBatch(paths, [second, first]).map((row) => row.status), ["unavailable", "unavailable"]);
  assert.deepEqual(evaluateWindowsPrivatePathBatch(paths, [first]).map((row) => row.status), ["unavailable", "unavailable"]);
  assert.deepEqual(evaluateWindowsPrivatePathBatch(paths, [first, { path: paths[1], error: true }]).map((row) => row.status), ["secure", "unavailable"]);
});
check("rejects malformed or oversized path batches before starting PowerShell", () => {
  assert.equal(assessWindowsPrivatePaths(["", "valid"]).every((row) => row.status === "unavailable"), true);
  assert.equal(assessWindowsPrivatePaths(Array(4097).fill("C:/fixture/path")).length, 4097);
});
check("accepts only the documented completed WSL EPERM shape", () => {
  const eperm = Object.assign(new Error("spawnSync git EPERM"), { code: "EPERM" });
  assert.equal(isSuccessfulSpawn({ status: 0, error: eperm, stdout: "ready\n" }), true);
  assert.equal(isSuccessfulSpawn({ status: 0, error: Object.assign(new Error("denied"), { code: "EACCES" }) }), false);
  assert.equal(isSuccessfulSpawn({ status: 1, error: eperm }), false);
  assert.equal(isSuccessfulSpawn({ status: null, error: eperm }), false);
  assert.equal(isSuccessfulSpawn({ status: 0, error: new Error("unknown") }), false);
});
check("requires callers to enumerate typed nonzero completion statuses", () => {
  const eperm = Object.assign(new Error("spawnSync session-power EPERM"), { code: "EPERM" });
  assert.equal(hasExpectedSpawnStatus({ status: 3, error: eperm }, [0, 3]), true);
  assert.equal(hasExpectedSpawnStatus({ status: 3, error: eperm }, [0]), false);
  assert.equal(hasExpectedSpawnStatus({ status: 3, error: Object.assign(new Error("denied"), { code: "EACCES" }) }, [0, 3]), false);
  assert.equal(hasExpectedSpawnStatus({ status: 5, error: eperm }, [0, 5]), true);
  assert.equal(hasExpectedSpawnStatus({ status: 5, error: Object.assign(new Error("denied"), { code: "EACCES" }) }, [0, 5]), false);
});
check("hardens every newly-created component of a recursive private directory", () => {
  const hardened = [];
  assureWindowsPrivateDirectories([
    { directory: "one", created: true },
    { directory: "one/two", created: true },
    { directory: "one/two/three", created: true },
  ], {
    harden: (directory) => { hardened.push(directory); return { status: "secure" }; },
    assess: () => { throw new Error("a newly-created directory must be hardened, not merely assessed"); },
  });
  assert.deepEqual(hardened, ["one", "one/two", "one/two/three"]);
});
check("assesses raced-in components and fails closed without DACL proof", () => {
  const assessed = [];
  assert.throws(() => assureWindowsPrivateDirectories([{ directory: "raced", created: false }], {
    harden: () => { throw new Error("a raced-in directory must not be hardened as owned"); },
    assess: (directory) => { assessed.push(directory); return { status: "unavailable" }; },
  }), (error) => error instanceof PrivateBoundaryError && error.code === "PB-WINDOWS-ASSURANCE");
  assert.deepEqual(assessed, ["raced"]);
});
check("sanitizeChildEnvironment strips PSModulePath in any casing and preserves everything else", () => {
  const input = {
    PSModulePath: "C:\\ps7-poisoned\\Modules",
    PSMODULEPATH: "C:\\also-poisoned\\Modules",
    psmodulepath: "C:\\poisoned-too\\Modules",
    PATH: "C:\\Windows",
    PIPELINE_PRIVATE_STATE_PATH: "should-survive",
  };
  const sanitized = sanitizeChildEnvironment(input);
  assert.equal(Object.keys(sanitized).some((key) => key.toLocaleLowerCase("en-US") === "psmodulepath"), false);
  assert.equal(sanitized.PATH, "C:\\Windows");
  assert.equal(sanitized.PIPELINE_PRIVATE_STATE_PATH, "should-survive");
});
check("invoke() stays independent of an inherited PS7-polluted PSModulePath (WIN-PSM-1 regression)", () => {
  if (process.platform !== "win32") return;
  const probeRoot = mkdtempSync(join(tmpdir(), "wps-psmodulepath-"));
  const brokenModuleParent = mkdtempSync(join(tmpdir(), "wps-poison-"));
  try {
    const target = join(probeRoot, "private");
    mkdirSync(target);
    const hardened = hardenWindowsPrivateDirectory(target);
    assert.equal(hardened.status, "secure", `fixture could not harden ${target}: ${JSON.stringify(hardened)}`);
    // The batch needs two paths that are both genuinely private. probeRoot itself sits in an unhardened TEMP directory
    // whose inherited DACL grants non-owner principals, which the module documents as insecure, so it cannot be a
    // "secure" row; harden a second sibling instead.
    const secondTarget = join(probeRoot, "private-second");
    mkdirSync(secondTarget);
    const secondHardened = hardenWindowsPrivateDirectory(secondTarget);
    assert.equal(secondHardened.status, "secure", `fixture could not harden the second directory: ${JSON.stringify(secondHardened)}`);

    // A synthetic module directory that reproduces the real PS7-ancestry defect
    // hermetically: it advertises Get-Acl/Set-Acl via manifest metadata (so the
    // legacy engine's autoloader matches it first) but throws on actual import,
    // exactly like a real .NET-Core-only Microsoft.PowerShell.Security module
    // loaded into legacy Windows PowerShell.
    const moduleDir = join(brokenModuleParent, "Microsoft.PowerShell.Security");
    mkdirSync(moduleDir);
    writeFileSync(join(moduleDir, "Microsoft.PowerShell.Security.psd1"), [
      "@{",
      "    ModuleVersion = '99.0'",
      "    GUID = '11111111-2222-3333-4444-555555555555'",
      "    RootModule = 'Microsoft.PowerShell.Security.psm1'",
      "    FunctionsToExport = @('Get-Acl','Set-Acl')",
      "    CmdletsToExport = @()",
      "}",
      "",
    ].join("\n"));
    writeFileSync(
      join(moduleDir, "Microsoft.PowerShell.Security.psm1"),
      "throw 'synthetic PS7-style module incompatibility for WIN-PSM-1 regression test'\n",
    );

    const legacySystemModules = "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\Modules";
    const pollutedEnvironment = { ...process.env, PSModulePath: `${brokenModuleParent};${legacySystemModules}` };

    const assessed = assessWindowsPrivatePath(target, { environment: pollutedEnvironment });
    assert.equal(
      assessed.status,
      "secure",
      "assessWindowsPrivatePath must not depend on the calling shell's own PSModulePath: " + JSON.stringify(assessed),
    );
    const batch = assessWindowsPrivatePaths([target, secondTarget], { environment: pollutedEnvironment });
    assert.deepEqual(batch.map((row) => row.status), ["secure", "secure"]);
  } finally {
    rmSync(probeRoot, { recursive: true, force: true });
    rmSync(brokenModuleParent, { recursive: true, force: true });
  }
});

// WIN-HARDEN-T (Ruling 148): hardenWindowsPrivateDirectory must be idempotent. Today the first call on a directory
// returns secure and every later call returns unavailable: the child PowerShell's Set-Acl throws
// PrivilegeNotHeldException on an already protected DACL and the module collapses that. Call 1 is the control (green
// today); these pins are red at call 2. Messages carry status and reason only, never a path.
const WINDOWS_ONLY_SKIP = "win32-native only: no seam for the fixed powershell.exe lookup";
function assertHardenerStaysSecure(target) {
  for (let call = 1; call <= 3; call += 1) {
    const hardened = hardenWindowsPrivateDirectory(target);
    const role = call === 1 ? "control, directory not yet hardened" : "directory already hardened by an earlier call";
    assert.equal(hardened.status, "secure", `hardenWindowsPrivateDirectory call ${call} of 3 (${role}) returned ${JSON.stringify(hardened)}`);
  }
  const assessed = assessWindowsPrivatePath(target);
  assert.equal(assessed.status, "secure", `assessWindowsPrivatePath after three hardener calls returned ${JSON.stringify(assessed)}`);
}
check(`hardenWindowsPrivateDirectory stays secure when called again on the same directory (${WINDOWS_ONLY_SKIP})`, (context) => {
  if (process.platform !== "win32") { context.skip(WINDOWS_ONLY_SKIP); return; }
  const root = mkdtempSync(join(tmpdir(), "wps-reharden-"));
  try {
    const target = join(root, "private");
    mkdirSync(target);
    assertHardenerStaysSecure(target);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
check(`hardenWindowsPrivateDirectory stays secure on repeat calls with a child file present (${WINDOWS_ONLY_SKIP})`, (context) => {
  if (process.platform !== "win32") { context.skip(WINDOWS_ONLY_SKIP); return; }
  const root = mkdtempSync(join(tmpdir(), "wps-reharden-child-"));
  try {
    const target = join(root, "private");
    mkdirSync(target);
    writeFileSync(join(target, "child.json"), "{}\n");
    assertHardenerStaysSecure(target);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// WIN-HARDEN-T2 (WIN-AP-S5-D slice 1, QG-04 test-only pin; red until WIN-HARDEN-F2): the pins above place their fixtures
// under os.tmpdir(), whose inherited DACL carries an explicit FullControl ACE for the current user. A directory on a
// data volume (this repository's checkout) inherits only a group grant of Modify, which lacks WRITE_OWNER. The shipped
// script persists the Owner section through SetOwner unconditionally, so on that ACL the Owner write is refused with an
// UnauthorizedAccessException (0x80070005; the hardener surfaces the exception TYPE name only, never the HRESULT) and the
// hardener returns unavailable. The premise is built by ACL, not by placement, so it holds on any win32 host: the parent
// is rebuilt with inheritance removed and Authenticated Users (well-known SID, no localized name) granted Modify only,
// and the child created below it inherits exactly that. The premise is confirmed from the child's own observed ACL (the
// current principal is the owner and no ACE names it); the pin never asserts that the hardener FAILS, so it turns green
// when the production fix lands. A premise the host cannot build is a typed skip, never a silent pass.
const INHERITED_MODIFY_ONLY_GRANT = "*S-1-5-11:(OI)(CI)M";
check(`hardenWindowsPrivateDirectory stays secure, twice in a row, under an inherited Modify-only ACL with no per-user ACE (${WINDOWS_ONLY_SKIP})`, (context) => {
  if (process.platform !== "win32") { context.skip(WINDOWS_ONLY_SKIP); return; }
  const systemRoot = process.env.SystemRoot;
  if (typeof systemRoot !== "string" || systemRoot.length === 0) { context.skip("premise unbuildable: SystemRoot is not set, so the fixed icacls cannot be located"); return; }
  const icacls = join(systemRoot, "System32", "icacls.exe");
  const runIcacls = (args) => spawnSync(icacls, args, { encoding: "utf8", shell: false, windowsHide: true, timeout: 20_000 });
  const scratchBase = join(import.meta.dirname, "..", "..", "..", "scratch");
  mkdirSync(scratchBase, { recursive: true });
  const parent = mkdtempSync(join(scratchBase, "wps-harden-t2-"));
  try {
    const rebuilt = runIcacls([parent, "/inheritance:r", "/grant", INHERITED_MODIFY_ONLY_GRANT]);
    if (rebuilt.status !== 0) { context.skip(`premise unbuildable: icacls could not rebuild the fixture parent ACL (exit ${rebuilt.status})`); return; }
    const target = join(parent, "private");
    mkdirSync(target, { mode: 0o700 });
    const observed = observeWindowsPrivatePath(target);
    if (observed.status !== null || observed.observation === null) { context.skip(`premise unobservable: the fixture directory ACL could not be read (${observed.status})`); return; }
    const { currentOwner, owner, principals } = observed.observation;
    if (owner !== currentOwner) { context.skip("premise unbuildable: the fresh fixture directory is not owned by the current principal"); return; }
    if (principals.length === 0 || principals.includes(currentOwner)) { context.skip("premise unbuildable: the fixture directory ACL is empty or names the current principal"); return; }
    for (let call = 1; call <= 2; call += 1) {
      const hardened = hardenWindowsPrivateDirectory(target);
      assert.equal(hardened.status, "secure", `hardenWindowsPrivateDirectory call ${call} of 2 under an inherited Modify-only ACL returned ${JSON.stringify(hardened)}`);
    }
    const assessed = assessWindowsPrivatePath(target);
    assert.equal(assessed.status, "secure", `assessWindowsPrivatePath after two hardener calls under an inherited Modify-only ACL returned ${JSON.stringify(assessed)}`);
  } finally {
    try {
      rmSync(parent, { recursive: true, force: true });
    } catch {
      // A hardened child or a rebuilt parent can refuse deletion; hand the whole tree back to inheritance, then remove it.
      runIcacls([parent, "/reset", "/T", "/C", "/Q"]);
      rmSync(parent, { recursive: true, force: true });
    }
  }
});

if (completionCases.length !== 16) throw new Error("case completion count drift: expected 16, got " + completionCases.length);
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openCompletionDescriptor(devNull, "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: completionCases, fd: completionFd, maxBytes: 65536 });
