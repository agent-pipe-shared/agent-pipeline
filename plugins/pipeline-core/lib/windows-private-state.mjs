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
import { isSuccessfulSpawn } from "./successful-spawn.mjs";

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

const OBSERVE_BATCH_SCRIPT = [
  "$ErrorActionPreference='Stop'",
  "$utf8=[Text.UTF8Encoding]::new($false);[Console]::OutputEncoding=$utf8;$OutputEncoding=$utf8",
  "$payload=[Console]::In.ReadToEnd().Trim()",
  "$json=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($payload))",
  "$paths=ConvertFrom-Json -InputObject $json",
  "$rows=[System.Collections.Generic.List[object]]::new()",
  "foreach($p in @($paths)){try{$i=Get-Item -LiteralPath $p -Force;$a=Get-Acl -LiteralPath $p;$me=[System.Security.Principal.WindowsIdentity]::GetCurrent().Name;$principals=@($a.Access | ForEach-Object { $_.IdentityReference.Value });$rows.Add([pscustomobject]@{path=[string]$p;currentOwner=$me;owner=$a.Owner;reparsePoint=[bool]($i.Attributes -band [IO.FileAttributes]::ReparsePoint);principals=$principals})}catch{$rows.Add([pscustomobject]@{path=[string]$p;error=$true})}}",
  "ConvertTo-Json -InputObject @($rows.ToArray()) -Compress -Depth 5",
].join(";");

/**
 * Strip `PSModulePath` (any casing -- Windows env vars are case-insensitive,
 * plain JS objects are not) from a copy of `environment` so the spawned fixed
 * legacy `powershell.exe` computes its own untouched default module path
 * instead of inheriting whatever the calling process's own shell ancestry
 * set it to. A calling process descended from PowerShell 7 (pwsh) prefixes
 * PS7-specific module directories; the legacy engine's module autoloader can
 * then find an incompatible `Microsoft.PowerShell.Security` there first and
 * fail to load it, making `Get-Acl`/`Set-Acl` unavailable -- a false
 * negative in observation, not a real DACL/security finding.
 */
export function sanitizeChildEnvironment(environment) {
  const sanitized = { ...environment };
  for (const key of Object.keys(sanitized)) {
    if (key.toLocaleLowerCase("en-US") === "psmodulepath") delete sanitized[key];
  }
  return sanitized;
}

function invoke(path, script, { run = spawnSync, environment = process.env } = {}) {
  const executable = fixedPowerShell();
  if (executable === null) return unavailable("fixed Windows PowerShell is unavailable");
  const result = run(executable, ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script], {
    encoding: "utf8",
    timeout: 7_000,
    shell: false,
    windowsHide: true,
    env: { ...sanitizeChildEnvironment(environment), PIPELINE_PRIVATE_STATE_PATH: path },
  });
  if (!isSuccessfulSpawn(result)) return unavailable("native Windows DACL observation failed");
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

/** Evaluate exact per-path observations returned by the bounded native batch reader. */
export function evaluateWindowsPrivatePathBatch(paths, observations) {
  if (!Array.isArray(paths) || !Array.isArray(observations) || paths.length !== observations.length) {
    return (Array.isArray(paths) ? paths : []).map(() => unavailable("native Windows DACL batch is incomplete"));
  }
  return paths.map((path, index) => {
    const row = observations[index];
    const keys = ["currentOwner", "owner", "path", "principals", "reparsePoint"];
    if (typeof path !== "string" || !row || typeof row !== "object" || Array.isArray(row) || row.path !== path || row.error === true
      || Object.keys(row).length !== keys.length || keys.some((key) => !Object.hasOwn(row, key))) {
      return unavailable("native Windows DACL batch is malformed");
    }
    const observation = parseObservation(JSON.stringify(row));
    return observation === null ? unavailable("native Windows DACL output is malformed") : evaluateWindowsPrivateState(observation);
  });
}

/**
 * Assess every physical path with one fixed PowerShell process per bounded chunk.
 * Paths travel on stdin as JSON; no caller path is interpolated into a command.
 */
export function assessWindowsPrivatePaths(paths, options = {}) {
  if (!Array.isArray(paths) || paths.length > 4096
    || paths.some((path) => typeof path !== "string" || path.length === 0 || path.length > 32768)) {
    return (Array.isArray(paths) ? paths : []).map(() => unavailable("private path batch is invalid"));
  }
  const batchSize = Number.isInteger(options.batchSize) ? Math.max(1, Math.min(64, options.batchSize)) : 64;
  const results = [];
  for (let offset = 0; offset < paths.length; offset += batchSize) {
    const batch = paths.slice(offset, offset + batchSize);
    const executable = fixedPowerShell();
    if (executable === null) {
      results.push(...batch.map(() => unavailable("fixed Windows PowerShell is unavailable")));
      continue;
    }
    const run = options.run ?? spawnSync;
    const timeout = options.timeoutForBatch ? options.timeoutForBatch() : options.timeout ?? 7_000;
    if (timeout <= 0) {
      results.push(...batch.map(() => unavailable("native Windows DACL time budget expired")));
      continue;
    }
    const native = run(executable, [
      "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", OBSERVE_BATCH_SCRIPT,
    ], {
      input: Buffer.from(JSON.stringify(batch), "utf8").toString("base64") + "\n",
      encoding: "utf8",
      timeout,
      maxBuffer: 4 * 1024 * 1024,
      shell: false,
      windowsHide: true,
      env: sanitizeChildEnvironment(options.environment ?? process.env),
    });
    if (!isSuccessfulSpawn(native)) {
      results.push(...batch.map(() => unavailable("native Windows DACL batch failed")));
      continue;
    }
    let rows;
    try {
      rows = JSON.parse(String(native.stdout).trim());
      if (!Array.isArray(rows)) rows = [rows];
    } catch {
      rows = [];
    }
    results.push(...evaluateWindowsPrivatePathBatch(batch, rows));
  }
  return results;
}

/**
 * Harden a private directory, then re-observe it. `path` may be freshly
 * created by the caller or a pre-existing directory being auto-remediated
 * (worktree-lifecycle.mjs's `assureWindowsLocalDirectories` does the latter);
 * either way this only ever resets the DACL to the concrete current
 * principal, never loosens access or touches contents.
 */
export function hardenWindowsPrivateDirectory(path, options = {}) {
  const result = invoke(path, HARDEN_DIRECTORY_SCRIPT, options);
  if (result?.status) return result;
  return assessWindowsPrivatePath(path, options);
}
