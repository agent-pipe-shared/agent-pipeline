// SPDX-License-Identifier: SUL-1.0
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join as hostJoin, posix as posixPath, win32 as winPath } from "node:path";

export const TRUSTED_TOOL_ROOTS_SCHEMA = "pipeline.trusted-tool-roots.v1";
const TTR_MAX_ROOTS = 16;

/** Per-machine, user-profile trusted-root file; there is deliberately no environment override of this location. Tests inject `trustedRootsFile` or `homeDirectory`. */
export function trustedToolRootsFilePath(options = {}) {
  if (typeof options.trustedRootsFile === "string" && options.trustedRootsFile.length > 0) return options.trustedRootsFile;
  return hostJoin(typeof options.homeDirectory === "string" && options.homeDirectory.length > 0 ? options.homeDirectory : homedir(), ".config", "agent-pipeline", "trusted-tool-roots.json");
}

function configEnabled(options, platform) {
  if (typeof options.trustedRootsFile === "string" || typeof options.homeDirectory === "string") return true;
  // A mocked platform, filesystem or root list is a hermetic fixture and must not read this host's real profile file.
  return platform === process.platform && !options.fsOps && !options.windowsRoots;
}

function winKey(value) { return String(value).replaceAll("/", "\\").replace(/\\+$/u, "").toLowerCase(); }

function rejectRoot(diagnostics, root, reason) { diagnostics.push({ code: "TTR-ROOT-REJECTED", root: typeof root === "string" ? root : null, reason }); }

function validateConfiguredRoot(root, platform, cfs, uid, diagnostics) {
  const pathMod = platform === "win32" ? winPath : posixPath;
  if (typeof root !== "string" || root.length === 0 || root.includes("\0")) return rejectRoot(diagnostics, root, "not-a-string");
  if (platform === "win32" ? !/^[A-Za-z]:[\\/]/u.test(root) : !root.startsWith("/")) return rejectRoot(diagnostics, root, "not-absolute");
  let info; let real;
  try { info = cfs.lstatSync(root); real = cfs.realpathSync(root); } catch (error) { return rejectRoot(diagnostics, root, missing(error) ? "missing" : "unreadable"); }
  if (info.isSymbolicLink()) return rejectRoot(diagnostics, root, "symlinked-root");
  if (!info.isDirectory()) return rejectRoot(diagnostics, root, "not-a-directory");
  const same = platform === "win32" ? winKey(real) === winKey(root) : real.replace(/\/+$/u, "") === root.replace(/\/+$/u, "");
  if (!same) return rejectRoot(diagnostics, root, "symlinked-root");
  if (platform !== "win32" && (info.uid !== uid || (info.mode & 0o022) !== 0)) return rejectRoot(diagnostics, root, "unsafe-ownership-or-mode");
  for (let dir = real; ;) {
    try { cfs.lstatSync(pathMod.join(dir, ".git")); return rejectRoot(diagnostics, root, "inside-git-repository"); } catch (error) { if (!missing(error)) return rejectRoot(diagnostics, root, "unreadable"); }
    const parent = pathMod.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return real;
}

/** Loads the additive per-machine roots; never throws and never widens trust on any defect. Absent file: silent. */
export function loadUserTrustedRoots(options = {}) {
  const platform = options.platform ?? process.platform;
  const file = trustedToolRootsFilePath(options);
  const result = { consulted: false, file, roots: [], diagnostics: [] };
  if (!configEnabled(options, platform)) return result;
  result.consulted = true;
  const cfs = options.configFsOps ?? { lstatSync, realpathSync, readFileSync };
  const invalid = (reason) => { result.roots = []; result.diagnostics.push({ code: "TTR-CONFIG-INVALID", file, reason }); return result; };
  const uid = options.uid ?? (typeof process.getuid === "function" ? process.getuid() : null);
  let info;
  try { info = cfs.lstatSync(file); } catch (error) { return missing(error) ? result : invalid("unreadable"); }
  if (info.isSymbolicLink()) return invalid("symlinked-file");
  if (!info.isFile()) return invalid("not-a-regular-file");
  if (platform !== "win32" && (info.uid !== uid || (info.mode & 0o022) !== 0)) return invalid("unsafe-ownership-or-mode");
  let parsed;
  try { parsed = JSON.parse(String(cfs.readFileSync(file, "utf8"))); } catch { return invalid("malformed-json"); }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return invalid("not-an-object");
  const keys = Object.keys(parsed).sort();
  if (keys.length !== 2 || keys[0] !== "roots" || keys[1] !== "schema") return invalid("unexpected-keys");
  if (parsed.schema !== TRUSTED_TOOL_ROOTS_SCHEMA) return invalid("wrong-schema");
  if (!Array.isArray(parsed.roots)) return invalid("roots-not-an-array");
  if (parsed.roots.length > TTR_MAX_ROOTS) return invalid("too-many-roots");
  for (const root of parsed.roots) { const accepted = validateConfiguredRoot(root, platform, cfs, uid, result.diagnostics); if (accepted && !result.roots.includes(accepted)) result.roots.push(accepted); }
  return result;
}

function withConfigNotes(result, config, name) {
  if (!config.consulted) return result;
  const notes = {};
  if (config.diagnostics.length > 0) notes.diagnostics = config.diagnostics;
  const out = Object.keys(notes).length > 0 ? { ...result, ...notes } : { ...result };
  // Non-enumerable on purpose: `{ ok:false, status:"binary_missing" }` stays the exact enumerable contract existing callers compare and serialize; read `result.hint` or call trustedToolRepairHint().
  if (!result.ok && result.status === "binary_missing") Object.defineProperty(out, "hint", { value: trustedToolRepairHint(name, config.file), enumerable: false });
  return out;
}

/** One-line repair hint naming the exact per-machine config file and its schema. */
export function trustedToolRepairHint(name, file = trustedToolRootsFilePath()) {
  return `Add the directory containing ${name} to ${file} as {"schema":"${TRUSTED_TOOL_ROOTS_SCHEMA}","roots":["<absolute directory>"]} (at most ${TTR_MAX_ROOTS} roots, additive to the built-in roots).`;
}

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
/** Win32 trusted roots plus `<home>\.local\bin` (symmetric to POSIX `~/.local/bin`); a mocked foreign platform never inherits this host's home directory. */
function effectiveWindowsRoots(platform, options) {
  const base = options.windowsRoots ?? WINDOWS_SYSTEM_TOOL_ROOTS;
  if (platform !== "win32") return base;
  const roots = Array.isArray(options.extraRoots) && options.extraRoots.length > 0 ? [...base, ...options.extraRoots] : base;
  const homeDir = options.homeDir ?? (platform === process.platform ? homedir() : undefined);
  return typeof homeDir === "string" ? [...roots, winPath.join(homeDir, ".local", "bin")] : roots;
}

/** Validates a candidate selected by a caller through the same authority. */
export function assessTrustedExecutablePath(path, options = {}) {
  const platform = options.platform ?? process.platform;
  const extraRoots = options.extraRoots ?? (platform === "win32" ? loadUserTrustedRoots(options).roots : []);
  const windowsRoots = effectiveWindowsRoots(platform, { ...options, extraRoots });
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
  const config = loadUserTrustedRoots({ ...options, platform });
  return withConfigNotes(resolveWithRoots(name, options, config.roots), config, name);
}

function resolveWithRoots(name, options, extraRoots) {
  const platform = options.platform ?? process.platform;
  const windowsRoots = options.windowsRoots ?? WINDOWS_SYSTEM_TOOL_ROOTS;
  const fsOps = options.fsOps ?? { lstatSync, realpathSync };
  // A mocked foreign-platform resolution must not inherit this host's home directory.
  const homeDir = options.homeDir ?? (platform === process.platform && platform !== "win32" ? homedir() : undefined);
  if (typeof name !== "string" || name.length === 0 || /[\\/\0]/u.test(name)) return { ok: false, status: "probe_error" };
  if (platform !== "win32") {
    const homePaths = typeof homeDir === "string" ? [posixPath.join(homeDir, ".local", "bin"), posixPath.join(homeDir, "go", "bin")] : [];
    const paths = platform === "darwin" ? ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", ...homePaths] : ["/usr/local/bin", "/usr/bin", "/bin", ...homePaths];
    paths.push(...extraRoots);
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
  for (const root of effectiveWindowsRoots(platform, { ...options, extraRoots })) {
    const path = winPath.join(root, executable);
    try { fsOps.lstatSync(path); } catch (error) {
      if (!missing(error)) probeError = true;
      if (missing(error)) for (const extension of [".cmd", ".bat", ".ps1"]) { try { fsOps.lstatSync(winPath.join(root, `${name}${extension}`)); untrusted = true; } catch (wrapperError) { if (!missing(wrapperError)) probeError = true; } }
      continue;
    }
    const assessed = assessTrustedExecutablePath(path, { platform, windowsRoots, homeDir: options.homeDir, extraRoots, fsOps });
    if (assessed.ok) return assessed;
    if (assessed.status === "probe_error") probeError = true; else untrusted = true;
  }
  if (probeError) return { ok: false, status: "probe_error" };
  return { ok: false, status: untrusted ? "untrusted_path" : "binary_missing" };
}
export function resolveSystemExecutable(name, options) { const result = resolveTrustedSystemExecutable(name, options); return result.ok ? result.path : null; }
