// SPDX-License-Identifier: Apache-2.0

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

export function ensurePrivateDirectory(path) {
  const existing = nearestExistingParent(path);
  physicalDirectory(existing, "private-state parent");
  const existed = existsSync(path);
  mkdirSync(path, { recursive: true, mode: 0o700 });
  const directory = physicalDirectory(path, "private-state directory");
  if (process.platform === "win32") {
    const state = existed ? assessWindowsPrivatePath(directory) : hardenWindowsPrivateDirectory(directory);
    if (state.status !== "secure") fail("PB-WINDOWS-ASSURANCE", `private-state directory Windows assurance is ${state.status}`);
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

function fsyncDirectory(path) {
  const fd = openSync(path, "r");
  try { fsyncSync(fd); } finally { closeSync(fd); }
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
