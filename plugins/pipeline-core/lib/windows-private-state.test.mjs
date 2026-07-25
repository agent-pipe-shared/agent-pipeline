#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assessWindowsPrivatePath,
  evaluateWindowsPrivateState,
  hardenWindowsPrivateDirectory,
  sanitizeChildEnvironment,
} from "./windows-private-state.mjs";
import { PrivateBoundaryError, assureWindowsPrivateDirectories } from "./private-boundary.mjs";

let passed = 0;
function check(name, fn) { fn(); passed += 1; process.stdout.write(`PASS WPS${String(passed).padStart(2, "0")} ${name}\n`); }
const secure = () => ({ currentOwner: "DESKTOP\\agent", owner: "DESKTOP\\agent", reparsePoint: false, principals: ["DESKTOP\\agent"] });
check("accepts only the concrete owner with no reparse point", () => assert.equal(evaluateWindowsPrivateState(secure()).status, "secure"));
check("rejects SYSTEM and Administrators as implicit exceptions", () => { for (const principal of ["SYSTEM", "BUILTIN\\Administrators", "Everyone", "DESKTOP\\other"]) { const value = secure(); value.principals.push(principal); assert.equal(evaluateWindowsPrivateState(value).status, "insecure"); } });
check("rejects owner drift and reparse points", () => { const owner = secure(); owner.owner = "SYSTEM"; assert.equal(evaluateWindowsPrivateState(owner).status, "insecure"); const link = secure(); link.reparsePoint = true; assert.equal(evaluateWindowsPrivateState(link).status, "insecure"); });
check("keeps malformed observations unavailable", () => { assert.equal(evaluateWindowsPrivateState(null).status, "unavailable"); assert.equal(evaluateWindowsPrivateState({}).status, "unavailable"); });
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
      `assessWindowsPrivatePath must not depend on the calling shell's own PSModulePath: ${JSON.stringify(assessed)}`,
    );
  } finally {
    rmSync(probeRoot, { recursive: true, force: true });
    rmSync(brokenModuleParent, { recursive: true, force: true });
  }
});
process.stdout.write(`${passed}/${passed} checks passed.\n`);
