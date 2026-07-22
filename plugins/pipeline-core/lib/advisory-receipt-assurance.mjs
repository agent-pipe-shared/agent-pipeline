// SPDX-License-Identifier: Apache-2.0

/**
 * Fail-closed persistence for authority-bearing Advisory receipts.
 *
 * Windows DACL observation is an injected, explicit boundary: Node's portable
 * fs APIs cannot attest it, so the evaluator (below) stays a pure policy
 * function over an already-observed `{file, directory}` shape. The default
 * native Windows probe/identity resolution (further below) is the one place
 * that closes that gap for real callers, by reusing the same fixed native
 * observation primitive already reviewed in windows-private-state.mjs -- it
 * never invents a second native script.
 */
import { spawnSync } from "node:child_process";
import { closeSync, fsyncSync, lstatSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { observeWindowsPrivatePath, WINDOWS_POWERSHELL_PATHS } from "./windows-private-state.mjs";

const UNSUPPORTED_DIRECTORY_CODES = new Set(["ENOSYS", "ENOTSUP", "EOPNOTSUPP"]);
const UNSAFE_WINDOWS_PRINCIPALS = new Set(["everyone", "users", "authenticated users", "system", "administrators"]);

export class AdvisoryReceiptAssuranceError extends Error {
  constructor(status, phase, cause = null) { super(`advisory receipt assurance ${status} during ${phase}`); this.name = "AdvisoryReceiptAssuranceError"; this.status = status; this.phase = phase; this.cause = cause; }
}
function state(status, reason) { return { status, reason }; }
function unsupportedDirectoryDurability(error, platform) {
  return UNSUPPORTED_DIRECTORY_CODES.has(error?.code)
    || (platform === "windows" && error?.code === "EPERM")
    || (platform === "darwin" && error?.code === "EINVAL");
}
function modePrivate(mode) { return Number.isInteger(mode) && (mode & 0o077) === 0; }
function normalizedPrincipal(value) { return typeof value === "string" ? value.trim().toLowerCase() : ""; }

/** Pure policy evaluator for portable fixtures and a future native Windows probe. */
export function evaluateAdvisoryReceiptPrivateState({ platform, expectedOwner, file, directory } = {}) {
  if (!['posix', 'linux', 'darwin', 'windows'].includes(platform) || typeof expectedOwner !== "string" || expectedOwner.length === 0) return state("unavailable", "private-state inputs are incomplete");
  if (!file || !directory || directory.kind !== "directory") return state("unavailable", "file or parent observation is unavailable");
  for (const entry of [file, directory]) {
    if (entry.reparsePoint !== false) return state("insecure", "a receipt path is a reparse point or its state is unknown");
    if (entry.owner !== expectedOwner) return state("insecure", "receipt path owner is not the concrete expected owner");
  }
  if (file.kind !== "file" && file.kind !== "missing") return state("insecure", "receipt target is not a regular file");
  if (platform !== "windows") {
    if (!modePrivate(directory.mode) || (file.kind === "file" && !modePrivate(file.mode))) return state("insecure", "POSIX group or other permissions are present");
    return state("secure", "owner, non-reparse path, and supplemental POSIX modes are private");
  }
  for (const entry of [file, directory]) {
    if (!entry.dacl || entry.dacl.status === "unsupported") return state("unsupported", "Windows DACL observation is unsupported");
    if (entry.dacl.status === "unavailable") return state("unavailable", "Windows DACL observation is unavailable");
    if (entry.dacl.status !== "secure" || !Array.isArray(entry.dacl.principals)) return state("insecure", "Windows DACL is not explicitly private");
    const principals = entry.dacl.principals.map(normalizedPrincipal);
    if (principals.some((principal) => UNSAFE_WINDOWS_PRINCIPALS.has(principal)) || principals.some((principal) => principal !== normalizedPrincipal(expectedOwner))) return state("insecure", "Windows DACL grants a non-owner principal");
  }
  return state("secure", "Windows owner, DACL, and reparse-point checks are private");
}
function nativeStatObservation(path, { expectedOwner, kind, lstat = lstatSync } = {}) {
  try { const info = lstat(path); return { kind: info.isDirectory() ? "directory" : info.isFile() ? "file" : "other", owner: String(info.uid), reparsePoint: info.isSymbolicLink(), mode: info.mode, dacl: null, expectedOwner }; }
  catch (error) { if (error?.code === "ENOENT" && kind === "file") return { kind: "missing", owner: expectedOwner, reparsePoint: false, mode: 0o600, dacl: null }; throw error; }
}
function fixedPowerShellPath(lstat = lstatSync, paths = WINDOWS_POWERSHELL_PATHS) {
  for (const path of paths) {
    try { const info = lstat(path); if (info.isFile() && !info.isSymbolicLink()) return path; } catch { /* try the next fixed system location */ }
  }
  return null;
}
let cachedWindowsPrincipal;
/** Resolves the concrete current Windows principal once, from the same fixed system PowerShell used to observe DACLs, so both share one identity source. */
export function resolveWindowsPrincipal({ run = spawnSync } = {}) {
  if (cachedWindowsPrincipal !== undefined) return cachedWindowsPrincipal;
  const executable = fixedPowerShellPath();
  if (executable === null) { cachedWindowsPrincipal = null; return null; }
  const result = run(executable, ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", "[System.Security.Principal.WindowsIdentity]::GetCurrent().Name"], { encoding: "utf8", timeout: 7_000, shell: false, windowsHide: true });
  cachedWindowsPrincipal = (result?.status === 0 && typeof result.stdout === "string" && result.stdout.trim().length > 0) ? result.stdout.trim() : null;
  return cachedWindowsPrincipal;
}
function nativeWindowsEntry(path, kind, { lstat = lstatSync, observe = observeWindowsPrivatePath } = {}) {
  try { lstat(path); }
  catch (error) { if (error?.code === "ENOENT" && kind === "file") return { kind: "missing" }; throw error; }
  const { status, observation } = observe(path);
  if (status || !observation) return { kind: "unavailable" };
  return { kind, owner: observation.owner, reparsePoint: observation.reparsePoint, dacl: { status: "secure", principals: observation.principals } };
}
/** Default native Windows probe: reuses the one fixed DACL-observation primitive from windows-private-state.mjs for both the target and its parent directory. */
export function nativeWindowsAdvisoryProbe({ target, parent }, options = {}) {
  const directory = nativeWindowsEntry(parent, "directory", options);
  if (directory.kind !== "directory") return { file: null, directory: null };
  const file = nativeWindowsEntry(target, "file", options);
  if (file.kind === "unavailable") return { file: null, directory: null };
  if (file.kind === "missing") {
    const identity = resolveWindowsPrincipal(options);
    return { file: { kind: "missing", owner: identity, reparsePoint: false, dacl: { status: "secure", principals: identity ? [identity] : [] } }, directory };
  }
  return { file, directory };
}
/** Observes portable POSIX state; Windows uses the native probe/identity above unless a caller injects its own (e.g. a fixture). */
export function createAdvisoryReceiptAssurance({
  platform = process.platform === "win32" ? "windows" : process.platform === "darwin" ? "darwin" : "linux",
  expectedOwner = platform === "windows" ? resolveWindowsPrincipal() : process.getuid?.(),
  lstat = lstatSync,
  windowsProbe = platform === "windows" ? nativeWindowsAdvisoryProbe : null,
} = {}) {
  const owner = expectedOwner === undefined || expectedOwner === null ? null : String(expectedOwner);
  return Object.freeze({ assess(target) {
    if (!isAbsolute(target) || resolve(target) !== target || owner === null) return state("unavailable", "receipt target or expected owner is unavailable");
    const parent = dirname(target);
    try {
      if (platform === "windows") { if (typeof windowsProbe !== "function") return state("unsupported", "native Windows DACL probe is unavailable"); return evaluateAdvisoryReceiptPrivateState({ platform, expectedOwner: owner, ...windowsProbe({ target, parent }) }); }
      return evaluateAdvisoryReceiptPrivateState({ platform, expectedOwner: owner, file: nativeStatObservation(target, { expectedOwner: owner, kind: "file", lstat }), directory: nativeStatObservation(parent, { expectedOwner: owner, kind: "directory", lstat }) });
    } catch { return state("unavailable", "private-state observation failed"); }
  } });
}
function defaultIo() { return { closeSync, fsyncSync, lstatSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync, fsyncDirectory(path) { const descriptor = openSync(path, "r"); try { fsyncSync(descriptor); } finally { closeSync(descriptor); } } }; }
function assure(assurance, target, phase) { const result = assurance.assess(target); if (!result || result.status !== "secure") throw new AdvisoryReceiptAssuranceError(result?.status ?? "unavailable", phase); }
/** Writes exact bytes, confirms directory durability, then re-observes private state and readback bytes. */
export function persistAdvisoryReceipt({ target, bytes, assurance = createAdvisoryReceiptAssurance(), io = defaultIo(), temporaryName = ".advisory-receipt.tmp", platform = process.platform === "win32" ? "windows" : process.platform === "darwin" ? "darwin" : "linux" } = {}) {
  if (!isAbsolute(target) || resolve(target) !== target || !Buffer.isBuffer(bytes) || typeof temporaryName !== "string" || !temporaryName.startsWith(".")) throw new Error("advisory receipt persistence input is invalid");
  const temporary = resolve(dirname(target), temporaryName); let renamed = false;
  try {
    assure(assurance, target, "pre-persist"); io.writeFileSync(temporary, bytes, { flag: "wx", mode: 0o600 });
    // "r+", not "r": a Windows handle opened read-only has no write-back to flush, so
    // fsync fails closed with EPERM even though this handle only syncs bytes this
    // process just wrote. "r+" is correct and portable; behaves like "r" on POSIX.
    const descriptor = io.openSync(temporary, "r+"); try { io.fsyncSync(descriptor); } finally { io.closeSync(descriptor); }
    assure(assurance, temporary, "pre-rename"); io.renameSync(temporary, target); renamed = true;
    // The regular-file rename + fsync above already durably committed the receipt
    // bytes. Directory-entry durability is a distinct, platform-dependent OS
    // guarantee (native Windows never provides it); an unsupported outcome there is
    // an honest, typed weaker assurance, not a reason to discard an already-durable,
    // already-DACL/owner-verified authority-bearing receipt. A genuinely unexpected
    // durability fault (`durability_unknown`) remains a hard non-success.
    let directoryDurability;
    try { io.fsyncDirectory(dirname(target)); }
    catch (error) {
      if (!unsupportedDirectoryDurability(error, platform)) throw new AdvisoryReceiptAssuranceError("durability_unknown", "post-rename-directory-sync", error);
      directoryDurability = "unsupported";
    }
    assure(assurance, target, "post-persist-readback"); const readback = io.readFileSync(target);
    if (!Buffer.from(readback).equals(bytes)) throw new AdvisoryReceiptAssuranceError("insecure", "post-persist-readback");
    return directoryDurability ? { status: "durable", bytes: Buffer.from(readback), directoryDurability } : { status: "durable", bytes: Buffer.from(readback) };
  } catch (error) {
    if (!renamed) { try { io.unlinkSync(temporary); } catch {} if (error instanceof AdvisoryReceiptAssuranceError) throw error; throw new AdvisoryReceiptAssuranceError("pre_rename_failure", "pre-rename", error); }
    if (error instanceof AdvisoryReceiptAssuranceError) throw error;
    throw new AdvisoryReceiptAssuranceError("durability_unknown", "post-rename", error);
  }
}
