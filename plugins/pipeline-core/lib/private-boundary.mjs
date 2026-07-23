// SPDX-License-Identifier: SUL-1.0

/**
 * Small, dependency-free boundary for repository-private state.
 *
 * HAW-B records are security-sensitive control state.  Keeping the primitive
 * here makes the checks shared by the session-power starter and controller:
 * no symlinks, one link, private modes, atomic replacement and a physical
 * parent directory.  It deliberately does not invent a cross-platform ACL
 * claim; callers on native Windows must use the fixed DACL helper and treat a
 * missing proof as unavailable.
 */
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  linkSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { assessWindowsPrivatePath, hardenWindowsPrivateDirectory } from "./windows-private-state.mjs";

export class PrivateBoundaryError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "PrivateBoundaryError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new PrivateBoundaryError(code, message);
}

function physicalDirectory(path, label) {
  const resolved = resolve(path);
  const info = lstatSync(resolved);
  if (!info.isDirectory() || info.isSymbolicLink() || realpathSync(resolved) !== resolved) {
    fail("PB-DIRECTORY", `${label} must be a physical directory`);
  }
  return resolved;
}

function nearestExistingParent(path) {
  let cursor = dirname(resolve(path));
  while (!existsSync(cursor)) {
    const next = dirname(cursor);
    if (next === cursor) fail("PB-PARENT", "private path has no existing parent");
    cursor = next;
  }
  return cursor;
}

/**
 * Applies the Windows DACL contract to every private directory introduced by
 * one recursive creation. A raced-in component is never hardened as though
 * it were ours: it must already prove the same contract.
 */
export function assureWindowsPrivateDirectories(entries, {
  harden = hardenWindowsPrivateDirectory,
  assess = assessWindowsPrivatePath,
} = {}) {
  for (const { directory, created } of entries) {
    const state = created ? harden(directory) : assess(directory);
    if (state.status !== "secure") {
      fail("PB-WINDOWS-ASSURANCE", "private-state directory Windows assurance is " + state.status);
    }
  }
}

export function ensurePrivateDirectory(path) {
  const existing = nearestExistingParent(path);
  physicalDirectory(existing, "private-state parent");
  const target = resolve(path);
  const pending = [];
  for (let cursor = target; cursor !== existing; cursor = dirname(cursor)) {
    const parent = dirname(cursor);
    if (parent === cursor) fail("PB-PARENT", "private path escapes its existing parent");
    pending.push(cursor);
  }
  pending.reverse();
  const entries = [];
  for (const directory of pending) {
    let created = false;
    try {
      mkdirSync(directory, { mode: 0o700 });
      created = true;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
    }
    entries.push({ directory: physicalDirectory(directory, "private-state directory"), created });
  }
  const directory = physicalDirectory(target, "private-state directory");
  if (process.platform === "win32") {
    assureWindowsPrivateDirectories(entries.length > 0 ? entries : [{ directory, created: false }]);
  }
  return directory;
}

export function assertPrivateRegularFile(path, label = "private file") {
  const info = lstatSync(path);
  const posixModeViolation = process.platform !== "win32" && (info.mode & 0o077) !== 0;
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || posixModeViolation) {
    fail("PB-FILE", `${label} must be a mode-0600 single-link regular file`);
  }
  if (process.platform === "win32") {
    const fileState = assessWindowsPrivatePath(path);
    const parentState = assessWindowsPrivatePath(dirname(path));
    if (fileState.status !== "secure" || parentState.status !== "secure") {
      fail("PB-WINDOWS-ASSURANCE", `${label} Windows assurance is unavailable or insecure`);
    }
  }
  return info;
}

/**
 * Directory durability is a hard POSIX flush but is not portably available on
 * native Windows, where opening or fsync-ing a directory handle raises
 * EPERM/EINVAL. The regular-file flush that precedes every call is the hard
 * durability guarantee; parent-directory durability is therefore best-effort on
 * Windows, and its typed-unavailable outcome is not a failure. This mirrors the
 * `unsupported` directory-durability contract in advisory-receipt-assurance.
 */
function unsupportedDirectoryDurability(error) {
  return process.platform === "win32"
    && (error?.code === "EPERM" || error?.code === "EINVAL"
      || error?.code === "EISDIR" || error?.code === "EACCES"
      || error?.code === "ENOTSUP");
}

function fsyncDirectory(path) {
  let fd;
  try {
    fd = openSync(path, "r");
  } catch (error) {
    if (unsupportedDirectoryDurability(error)) return;
    throw error;
  }
  try {
    fsyncSync(fd);
  } catch (error) {
    if (unsupportedDirectoryDurability(error)) return;
    throw error;
  } finally {
    closeSync(fd);
  }
}

/** Atomically replace a private regular file and durably publish its parent. */
export function writePrivateFileAtomic(path, bytes) {
  const parent = ensurePrivateDirectory(dirname(path));
  const target = resolve(path);
  if (dirname(target) !== parent) fail("PB-PATH", "private path parent is not physical");
  if (existsSync(target)) assertPrivateRegularFile(target);
  const temporary = `${target}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
  const fd = openSync(temporary, "wx", 0o600);
  try {
    writeFileSync(fd, bytes);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(temporary, target);
  assertPrivateRegularFile(target);
  fsyncDirectory(parent);
}

/**
 * Atomically publish immutable private bytes without replacing an existing
 * record. `link(2)` is a same-directory no-replace commit point; the temporary
 * link is then removed so the final record is again single-link mode 0600.
 */
export function writePrivateFileNoReplaceAtomic(path, bytes) {
  const parent = ensurePrivateDirectory(dirname(path));
  const target = resolve(path);
  if (dirname(target) !== parent) fail("PB-PATH", "private path parent is not physical");
  if (existsSync(target)) {
    assertPrivateRegularFile(target);
    return { created: false };
  }
  const temporary = `${target}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
  const fd = openSync(temporary, "wx", 0o600);
  try {
    writeFileSync(fd, bytes);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  try {
    linkSync(temporary, target);
  } catch (error) {
    try { unlinkSync(temporary); } catch { /* preserve the conflict */ }
    if (error?.code === "EEXIST") {
      assertPrivateRegularFile(target);
      return { created: false };
    }
    throw error;
  }
  unlinkSync(temporary);
  assertPrivateRegularFile(target);
  fsyncDirectory(parent);
  return { created: true };
}

export function readPrivateFile(path, label = "private file") {
  assertPrivateRegularFile(path, label);
  return readFileSync(path, "utf8");
}

export function readPrivateJson(path, label = "private JSON") {
  try {
    return JSON.parse(readPrivateFile(path, label));
  } catch (error) {
    if (error instanceof PrivateBoundaryError) throw error;
    fail("PB-JSON", `${label} is malformed`);
  }
}

export function writePrivateJsonAtomic(path, value) {
  writePrivateFileAtomic(path, `${JSON.stringify(value, null, 2)}\n`);
}
