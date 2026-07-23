// SPDX-License-Identifier: SUL-1.0

/**
 * Native Windows private-state assurance.
 *
 * Node exposes POSIX-looking mode bits on Windows but cannot attest a DACL.
 * This narrow adapter therefore uses only fixed system PowerShell locations;
 * it never resolves a shell through PATH, user configuration, or a wrapper.
 */
import { spawnSync } from "node:child_process";
import { lstatSync } from "node:fs";

export const WINDOWS_POWERSHELL_PATHS = Object.freeze([
  "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
  "D:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
]);

function unavailable(reason) { return { status: "unavailable", reason }; }
function insecure(reason) { return { status: "insecure", reason }; }
function normalized(value) { return typeof value === "string" ? value.trim().toLocaleLowerCase("en-US") : ""; }
function fixedPowerShell(lstat = lstatSync, paths = WINDOWS_POWERSHELL_PATHS) {
  for (const path of paths) {
    try {
      const info = lstat(path);
      if (info.isFile() && !info.isSymbolicLink()) return path;
    } catch { /* try the next fixed system location */ }
  }
  return null;
}

function parseObservation(stdout) {
  try {
    const value = JSON.parse(String(stdout).trim());
    if (!value || typeof value !== "object" || Array.isArray(value)
      || typeof value.currentOwner !== "string" || typeof value.owner !== "string"
      || typeof value.reparsePoint !== "boolean" || !Array.isArray(value.principals)
      || value.principals.some((entry) => typeof entry !== "string" || entry.length === 0)) return null;
    return value;
  } catch { return null; }
}

/** Pure DACL policy: only the concrete current principal may hold an ACE. */
export function evaluateWindowsPrivateState(observation) {
  if (!observation || typeof observation !== "object") return unavailable("DACL observation is unavailable");
  const current = normalized(observation.currentOwner);
  const owner = normalized(observation.owner);
  if (!current || !owner) return unavailable("Windows owner observation is incomplete");
  if (observation.reparsePoint !== false) return insecure("private path is a reparse point or its state is unknown");
  if (owner !== current) return insecure("private path owner is not the concrete current principal");
  if (!Array.isArray(observation.principals) || observation.principals.length === 0) return insecure("private path DACL is empty or unavailable");
  if (observation.principals.map(normalized).some((principal) => principal !== current)) {
    return insecure("private path DACL grants a non-owner principal");
  }
  return { status: "secure", reason: "Windows owner, DACL, and reparse-point checks are private" };
}

const OBSERVE_SCRIPT = [
  "$ErrorActionPreference='Stop'",
  "$p=$env:PIPELINE_PRIVATE_STATE_PATH",
  "$i=Get-Item -LiteralPath $p -Force",
  "$a=Get-Acl -LiteralPath $p",
  "$me=[System.Security.Principal.WindowsIdentity]::GetCurrent().Name",
  "$principals=@($a.Access | ForEach-Object { $_.IdentityReference.Value })",
  "[pscustomobject]@{currentOwner=$me;owner=$a.Owner;reparsePoint=[bool]($i.Attributes -band [IO.FileAttributes]::ReparsePoint);principals=$principals}|ConvertTo-Json -Compress",
].join(";");

const HARDEN_DIRECTORY_SCRIPT = [
  "$ErrorActionPreference='Stop'",
  "$p=$env:PIPELINE_PRIVATE_STATE_PATH",
  "$me=[System.Security.Principal.WindowsIdentity]::GetCurrent().Name",
  "$a=Get-Acl -LiteralPath $p",
  "$a.SetAccessRuleProtection($true,$false)",
  "$a.SetOwner([System.Security.Principal.NTAccount]::new($me))",
  "$rule=[System.Security.AccessControl.FileSystemAccessRule]::new($me,[System.Security.AccessControl.FileSystemRights]::FullControl,[System.Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit',[System.Security.AccessControl.PropagationFlags]::None,[System.Security.AccessControl.AccessControlType]::Allow)",
  "$a.ResetAccessRule($rule)",
  "Set-Acl -LiteralPath $p -AclObject $a",
].join(";");

function invoke(path, script, { run = spawnSync, environment = process.env } = {}) {
  const executable = fixedPowerShell();
  if (executable === null) return unavailable("fixed Windows PowerShell is unavailable");
  const result = run(executable, ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script], {
    encoding: "utf8",
    timeout: 7_000,
    shell: false,
    windowsHide: true,
    env: { ...environment, PIPELINE_PRIVATE_STATE_PATH: path },
  });
  if (result?.error || result?.status !== 0) return unavailable("native Windows DACL observation failed");
  return result;
}

/**
 * Observe the raw native owner/DACL/reparse facts for one physical Windows path,
 * without applying policy. Returns `{ status: null, observation }` on a successful
 * native read, or `{ status: "unavailable"|..., observation: null }` otherwise --
 * lets a caller that needs the raw facts (e.g. a different policy evaluator) reuse
 * the one fixed native probe instead of re-implementing it.
 */
export function observeWindowsPrivatePath(path, options = {}) {
  if (typeof path !== "string" || path.length === 0) return { ...unavailable("private path is unavailable"), observation: null };
  const result = invoke(path, OBSERVE_SCRIPT, options);
  if (result?.status) return { ...result, observation: null };
  const observation = parseObservation(result.stdout);
  return observation === null ? { ...unavailable("native Windows DACL output is malformed"), observation: null } : { status: null, reason: null, observation };
}

/** Observe one physical Windows path against the concrete current principal. */
export function assessWindowsPrivatePath(path, options = {}) {
  const { status, reason, observation } = observeWindowsPrivatePath(path, options);
  if (status) return { status, reason };
  return evaluateWindowsPrivateState(observation);
}

/** Harden only a freshly created private directory, then re-observe it. */
export function hardenWindowsPrivateDirectory(path, options = {}) {
  const result = invoke(path, HARDEN_DIRECTORY_SCRIPT, options);
  if (result?.status) return result;
  return assessWindowsPrivatePath(path, options);
}
