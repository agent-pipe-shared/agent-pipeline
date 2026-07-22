// SPDX-License-Identifier: Apache-2.0

/**
 * Fail-closed persistence for authority-bearing Advisory receipts.
 *
 * Windows DACL observation is deliberately an injected, explicit boundary:
 * Node's portable fs APIs cannot attest it. The evaluator keeps the Windows
 * model testable without implying that this module closes that native gap.
 */
import { closeSync, fsyncSync, lstatSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

const UNSUPPORTED_DIRECTORY_CODES = new Set(["ENOSYS", "ENOTSUP", "EOPNOTSUPP"]);
const UNSAFE_WINDOWS_PRINCIPALS = new Set(["everyone", "users", "authenticated users", "system", "administrators"]);

export class AdvisoryReceiptAssuranceError extends Error {
  constructor(status, phase, cause = null) { super(`advisory receipt assurance ${status} during ${phase}`); this.name = "AdvisoryReceiptAssuranceError"; this.status = status; this.phase = phase; this.cause = cause; }
}
function state(status, reason) { return { status, reason }; }
function unsupportedDirectoryDurability(error, platform) {
  return UNSUPPORTED_DIRECTORY_CODES.has(error?.code)
    || (platform === "windows" && error?.code === "EPERM");
}
function modePrivate(mode) { return Number.isInteger(mode) && (mode & 0o077) === 0; }
function normalizedPrincipal(value) { return typeof value === "string" ? value.trim().toLowerCase() : ""; }

/** Pure policy evaluator for portable fixtures and a future native Windows probe. */
export function evaluateAdvisoryReceiptPrivateState({ platform, expectedOwner, file, directory } = {}) {
  if (!['posix', 'windows'].includes(platform) || typeof expectedOwner !== "string" || expectedOwner.length === 0) return state("unavailable", "private-state inputs are incomplete");
  if (!file || !directory || directory.kind !== "directory") return state("unavailable", "file or parent observation is unavailable");
  for (const entry of [file, directory]) {
    if (entry.reparsePoint !== false) return state("insecure", "a receipt path is a reparse point or its state is unknown");
    if (entry.owner !== expectedOwner) return state("insecure", "receipt path owner is not the concrete expected owner");
  }
  if (file.kind !== "file" && file.kind !== "missing") return state("insecure", "receipt target is not a regular file");
  if (platform === "posix") {
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
/** Observes portable POSIX state; Windows requires a supplied native probe. */
export function createAdvisoryReceiptAssurance({ platform = process.platform === "win32" ? "windows" : "posix", expectedOwner = process.getuid?.(), lstat = lstatSync, windowsProbe = null } = {}) {
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
export function persistAdvisoryReceipt({ target, bytes, assurance = createAdvisoryReceiptAssurance(), io = defaultIo(), temporaryName = ".advisory-receipt.tmp", platform = process.platform === "win32" ? "windows" : "posix" } = {}) {
  if (!isAbsolute(target) || resolve(target) !== target || !Buffer.isBuffer(bytes) || typeof temporaryName !== "string" || !temporaryName.startsWith(".")) throw new Error("advisory receipt persistence input is invalid");
  const temporary = resolve(dirname(target), temporaryName); let renamed = false;
  try {
    assure(assurance, target, "pre-persist"); io.writeFileSync(temporary, bytes, { flag: "wx", mode: 0o600 });
    const descriptor = io.openSync(temporary, "r"); try { io.fsyncSync(descriptor); } finally { io.closeSync(descriptor); }
    assure(assurance, temporary, "pre-rename"); io.renameSync(temporary, target); renamed = true;
    try { io.fsyncDirectory(dirname(target)); } catch (error) { throw new AdvisoryReceiptAssuranceError(unsupportedDirectoryDurability(error, platform) ? "unsupported" : "durability_unknown", "post-rename-directory-sync", error); }
    assure(assurance, target, "post-persist-readback"); const readback = io.readFileSync(target);
    if (!Buffer.from(readback).equals(bytes)) throw new AdvisoryReceiptAssuranceError("insecure", "post-persist-readback");
    return { status: "durable", bytes: Buffer.from(readback) };
  } catch (error) {
    if (!renamed) { try { io.unlinkSync(temporary); } catch {} if (error instanceof AdvisoryReceiptAssuranceError) throw error; throw new AdvisoryReceiptAssuranceError("pre_rename_failure", "pre-rename", error); }
    if (error instanceof AdvisoryReceiptAssuranceError) throw error;
    throw new AdvisoryReceiptAssuranceError("durability_unknown", "post-rename", error);
  }
}
