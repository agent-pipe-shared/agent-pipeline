#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir, devNull } from "node:os";
import { join } from "node:path";
import {
  assessWindowsPrivatePath,
  assessWindowsPrivatePaths,
  evaluateWindowsPrivatePathBatch,
  evaluateWindowsPrivateState,
  hardenWindowsPrivateDirectory,
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
    const batch = assessWindowsPrivatePaths([target, probeRoot], { environment: pollutedEnvironment });
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

if (completionCases.length !== 15) throw new Error("case completion count drift: expected 15, got " + completionCases.length);
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openCompletionDescriptor(devNull, "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: completionCases, fd: completionFd, maxBytes: 65536 });
