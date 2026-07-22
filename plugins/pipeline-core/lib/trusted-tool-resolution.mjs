// SPDX-License-Identifier: Apache-2.0
import { lstatSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join, win32 as winPath } from "node:path";

export const WINDOWS_SYSTEM_TOOL_ROOTS = Object.freeze(["C:\\Program Files\\Git\\cmd", "C:\\Program Files\\Git\\bin", "C:\\Program Files\\Git\\mingw64\\bin", "C:\\Windows\\System32"]);

function missing(error) { return error?.code === "ENOENT" || error?.code === "ENOTDIR"; }
function normalWinPath(value) { return String(value).replaceAll("/", "\\").replace(/\\+$/u, "").toLowerCase(); }
function withinWindowsRoots(path, roots) { const candidate = normalWinPath(path); return roots.some((root) => { const normalizedRoot = normalWinPath(root); return candidate === normalizedRoot || candidate.startsWith(`${normalizedRoot}\\`); }); }
function windowsCandidate(name) { return name.toLowerCase().endsWith(".exe") ? name : `${name}.exe`; }

/** Validates a candidate selected by a caller through the same authority. */
export function assessTrustedExecutablePath(path, { platform = process.platform, windowsRoots = WINDOWS_SYSTEM_TOOL_ROOTS, fsOps = { lstatSync, realpathSync } } = {}) {
  if (typeof path !== "string" || path.length === 0) return { ok: false, status: "probe_error" };
  if (platform === "win32" && (!path.toLowerCase().endsWith(".exe") || !withinWindowsRoots(path, windowsRoots))) return { ok: false, status: "untrusted_path" };
  let lexical; let resolved; let finalInfo;
  try { lexical = fsOps.lstatSync(path); resolved = fsOps.realpathSync(path); finalInfo = fsOps.lstatSync(resolved); } catch (error) { return { ok: false, status: missing(error) ? "binary_missing" : "probe_error" }; }
  if (!lexical.isFile() && !lexical.isSymbolicLink()) return { ok: false, status: platform === "win32" ? "untrusted_path" : "probe_error" };
  if (!finalInfo.isFile()) return { ok: false, status: platform === "win32" ? "untrusted_path" : "probe_error" };
  if (platform === "win32" && (!resolved.toLowerCase().endsWith(".exe") || !withinWindowsRoots(resolved, windowsRoots))) return { ok: false, status: "untrusted_path" };
  return { ok: true, path: resolved };
}

/** Resolves a Pipeline tool without consulting PATH and retains rejection provenance. */
export function resolveTrustedSystemExecutable(name, { platform = process.platform, homeDir = homedir(), windowsRoots = WINDOWS_SYSTEM_TOOL_ROOTS, fsOps = { lstatSync, realpathSync } } = {}) {
  if (typeof name !== "string" || name.length === 0 || /[\\/\0]/u.test(name)) return { ok: false, status: "probe_error" };
  if (platform !== "win32") {
    const paths = platform === "darwin" ? ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", join(homeDir, ".local", "bin"), join(homeDir, "go", "bin")] : ["/usr/local/bin", "/usr/bin", "/bin", join(homeDir, ".local", "bin"), join(homeDir, "go", "bin")];
    for (const root of paths) {
      const path = join(root, name);
      try { fsOps.lstatSync(path); } catch (error) { if (!missing(error)) return { ok: false, status: "probe_error" }; continue; }
      const assessed = assessTrustedExecutablePath(path, { platform, fsOps });
      if (assessed.ok) return assessed;
      if (assessed.status === "probe_error") return assessed;
    }
    return { ok: false, status: "binary_missing" };
  }
  let untrusted = false; let probeError = false; const executable = windowsCandidate(name);
  for (const root of windowsRoots) {
    const path = winPath.join(root, executable);
    try { fsOps.lstatSync(path); } catch (error) {
      if (!missing(error)) probeError = true;
      if (missing(error)) for (const extension of [".cmd", ".bat", ".ps1"]) { try { fsOps.lstatSync(winPath.join(root, `${name}${extension}`)); untrusted = true; } catch (wrapperError) { if (!missing(wrapperError)) probeError = true; } }
      continue;
    }
    const assessed = assessTrustedExecutablePath(path, { platform, windowsRoots, fsOps });
    if (assessed.ok) return assessed;
    if (assessed.status === "probe_error") probeError = true; else untrusted = true;
  }
  if (probeError) return { ok: false, status: "probe_error" };
  return { ok: false, status: untrusted ? "untrusted_path" : "binary_missing" };
}
export function resolveSystemExecutable(name, options) { const result = resolveTrustedSystemExecutable(name, options); return result.ok ? result.path : null; }
