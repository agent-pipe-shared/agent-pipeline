// SPDX-License-Identifier: SUL-1.0
import { lstatSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { posix as posixPath, win32 as winPath } from "node:path";

/** Fixed Windows roots; environment data must never expand the trust boundary. */
export const WINDOWS_SYSTEM_TOOL_ROOTS = Object.freeze([
  "C:\\Program Files\\Git\\cmd",
  "C:\\Program Files\\Git\\bin",
  "C:\\Program Files\\Git\\mingw64\\bin",
  "C:\\Program Files\\Gitleaks",
  "C:\\Program Files\\OSV-Scanner",
  "C:\\Program Files\\Semgrep",
  "C:\\Windows\\System32",
  "D:\\Program Files\\Git\\cmd",
  "D:\\Program Files\\Git\\bin",
  "D:\\Program Files\\Git\\mingw64\\bin",
  // PO exception 2026-07-24 (specs/2026-07-19-sprint-sentinel-epic/
  // windows-trusted-tool-resolution-user-path-exception.md): this host's real
  // Git install, not a general user-path allowance.
  "D:\\Dev\\Git\\Git\\cmd",
  "D:\\Dev\\Git\\Git\\bin",
  "D:\\Dev\\Git\\Git\\mingw64\\bin",
  "D:\\Program Files\\Gitleaks",
  "D:\\Program Files\\OSV-Scanner",
  "D:\\Program Files\\Semgrep",
  "D:\\Windows\\System32",
]);

/** Returns the immutable Windows executable allowlist. */
export function windowsSystemToolRoots() { return WINDOWS_SYSTEM_TOOL_ROOTS; }

function missing(error) { return error?.code === "ENOENT" || error?.code === "ENOTDIR"; }
function normalWinPath(value) { return String(value).replaceAll("/", "\\").replace(/\\+$/u, "").toLowerCase(); }
function withinWindowsRoots(path, roots) { const candidate = normalWinPath(path); return roots.some((root) => winPath.dirname(candidate) === normalWinPath(root)); }
function windowsCandidate(name) { return name.toLowerCase().endsWith(".exe") ? name : `${name}.exe`; }

/** Validates a candidate selected by a caller through the same authority. */
export function assessTrustedExecutablePath(path, options = {}) {
  const platform = options.platform ?? process.platform;
  const windowsRoots = options.windowsRoots ?? WINDOWS_SYSTEM_TOOL_ROOTS;
  const fsOps = options.fsOps ?? { lstatSync, realpathSync };
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
export function resolveTrustedSystemExecutable(name, options = {}) {
  const platform = options.platform ?? process.platform;
  const windowsRoots = options.windowsRoots ?? WINDOWS_SYSTEM_TOOL_ROOTS;
  const fsOps = options.fsOps ?? { lstatSync, realpathSync };
  // A mocked foreign-platform resolution must not inherit this host's home directory.
  const homeDir = options.homeDir ?? (platform === process.platform && platform !== "win32" ? homedir() : undefined);
  if (typeof name !== "string" || name.length === 0 || /[\\/\0]/u.test(name)) return { ok: false, status: "probe_error" };
  if (platform !== "win32") {
    const homePaths = typeof homeDir === "string" ? [posixPath.join(homeDir, ".local", "bin"), posixPath.join(homeDir, "go", "bin")] : [];
    const paths = platform === "darwin" ? ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", ...homePaths] : ["/usr/local/bin", "/usr/bin", "/bin", ...homePaths];
    for (const root of paths) {
      const path = posixPath.join(root, name);
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
