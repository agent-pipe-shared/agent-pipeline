// SPDX-License-Identifier: SUL-1.0
/**
 * Private, exclusive byte store for host-observed Agy evidence. A successful
 * read proves only that the private bytes match the supplied authored record;
 * consent, result and Git history must still be independently re-read before
 * local authorship can be admitted. This file is never a portable export.
 */
import { randomBytes, createHash } from "node:crypto";
import { basename, join, resolve } from "node:path";
import { closeSync, constants, existsSync, fstatSync, fsyncSync, linkSync, lstatSync,
  mkdirSync, openSync, readFileSync, realpathSync, statSync, unlinkSync, writeSync } from "node:fs";
import { isSafeTaskId } from "./dispatch-record.mjs";
import { parseStrictJson } from "./governance-event.mjs";
import { validateAgyHostObservedReceiptShape } from "./agy-host-observed-receipt.mjs";

const SUBDIRS = ["agent-pipeline", "run", "agy-host-observed"];
const MAX_BYTES = 16 * 1024;
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sameInode = (a, b) => String(a.dev) === String(b.dev) && String(a.ino) === String(b.ino);
const sameSnapshot = (a, b) => sameInode(a, b) && a.size === b.size
  && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;
const sameContentSnapshot = (a, b) => sameInode(a, b) && a.size === b.size && a.mtimeMs === b.mtimeMs;
function fail(code) { throw Object.assign(new Error(code), { code }); }

function parentFor(commonDir, create) {
  if (typeof commonDir !== "string" || !commonDir.startsWith("/")) fail("AGY-HOST-STORE-ROOT");
  let path = resolve(commonDir);
  const root = lstatSync(path);
  if (!root.isDirectory() || root.isSymbolicLink() || realpathSync(path) !== path) fail("AGY-HOST-STORE-ROOT");
  for (const part of SUBDIRS) {
    path = join(path, part);
    if (create) {
      try { mkdirSync(path, { mode: 0o700 }); }
      catch (error) { if (error?.code !== "EEXIST") throw error; }
    }
    const entry = lstatSync(path);
    if (!entry.isDirectory() || entry.isSymbolicLink() || realpathSync(path) !== path) fail("AGY-HOST-STORE-PARENT");
  }
  return path;
}

function inPinnedParent(parent, action) {
  const before = lstatSync(parent);
  if (!before.isDirectory() || before.isSymbolicLink()) fail("AGY-HOST-STORE-PARENT");
  const prior = process.cwd();
  process.chdir(parent);
  try {
    if (!sameInode(before, statSync("."))) fail("AGY-HOST-STORE-PARENT-RACE");
    return action();
  } finally { process.chdir(prior); }
}

function syncDirectory() {
  let fd;
  try { fd = openSync(".", constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)); fsyncSync(fd); }
  catch (error) {
    if (!["EPERM", "EINVAL", "EISDIR", "EACCES", "ENOTSUP", "EBADF"].includes(error?.code)) throw error;
  } finally { if (fd !== undefined) closeSync(fd); }
}

function completeWrite(fd, bytes) {
  let offset = 0;
  while (offset < bytes.length) {
    const written = writeSync(fd, bytes, offset, bytes.length - offset, offset);
    if (!Number.isSafeInteger(written) || written <= 0) fail("AGY-HOST-STORE-WRITE");
    offset += written;
  }
}

function admittedName(taskId) {
  if (!isSafeTaskId(taskId)) fail("AGY-HOST-STORE-TASK");
  return `${taskId}.json`;
}

/** The commonDir must come from the host's physical repository descriptor. */
export function persistAgyHostObservedReceipt({ commonDir, receipt, record, recordBytes } = {}) {
  if (!validateAgyHostObservedReceiptShape(receipt, { record, recordBytes })) {
    return { ok: false, code: "AGY-HOST-STORE-BINDING" };
  }
  const bytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  if (bytes.length > MAX_BYTES) return { ok: false, code: "AGY-HOST-STORE-SIZE" };
  let target;
  try {
    target = admittedName(receipt.dispatchId);
    const parent = parentFor(commonDir, true);
    inPinnedParent(parent, () => {
      if (existsSync(target)) fail("AGY-HOST-STORE-EXISTS");
      const temporary = `.${receipt.dispatchId}.${randomBytes(16).toString("hex")}.tmp`;
      let temporaryFd;
      let targetFd;
      try {
        temporaryFd = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL
          | (constants.O_NOFOLLOW ?? 0), 0o600);
        completeWrite(temporaryFd, bytes);
        fsyncSync(temporaryFd);
        const written = fstatSync(temporaryFd);
        linkSync(temporary, target);
        targetFd = openSync(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
        const linked = fstatSync(targetFd);
        if (!sameInode(written, linked) || linked.size !== bytes.length) fail("AGY-HOST-STORE-RACE");
        closeSync(temporaryFd); temporaryFd = undefined;
        unlinkSync(temporary);
        syncDirectory();
        const readback = readFileSync(targetFd);
        const after = fstatSync(targetFd);
        const pathStat = lstatSync(target);
        // Unlinking the temporary hard link changes ctime without changing
        // the published content. A descriptor read still checks size/mtime.
        if (!sameContentSnapshot(linked, after) || !sameInode(pathStat, after)
          || pathStat.isSymbolicLink() || !readback.equals(bytes)) fail("AGY-HOST-STORE-READBACK");
      } finally {
        if (temporaryFd !== undefined) closeSync(temporaryFd);
        if (targetFd !== undefined) closeSync(targetFd);
        try { if (existsSync(temporary)) unlinkSync(temporary); } catch {}
      }
    });
    return { ok: true, code: "AGY-HOST-RECEIPT-STORED", taskId: receipt.dispatchId,
      sha256: hash(bytes), relativePath: join(...SUBDIRS, basename(target)) };
  } catch (error) {
    return { ok: false, code: error?.code?.startsWith("AGY-HOST-") ? error.code : "AGY-HOST-STORE-UNAVAILABLE" };
  }
}

/** Physical local readback only; this is not a signature or provider attestation. */
export function readAgyHostObservedReceipt({ commonDir, taskId, record, recordBytes } = {}) {
  try {
    const target = admittedName(taskId);
    const parent = parentFor(commonDir, false);
    return inPinnedParent(parent, () => {
      const entry = lstatSync(target);
      if (!entry.isFile() || entry.isSymbolicLink() || entry.size === 0 || entry.size > MAX_BYTES) fail("AGY-HOST-STORE-TARGET");
      const fd = openSync(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      try {
        const before = fstatSync(fd);
        if (!sameInode(entry, before) || before.size !== entry.size) fail("AGY-HOST-STORE-RACE");
        const bytes = readFileSync(fd);
        const after = fstatSync(fd);
        if (!sameSnapshot(before, after) || bytes.length !== before.size) fail("AGY-HOST-STORE-RACE");
        const receipt = parseStrictJson(bytes);
        if (receipt.dispatchId !== taskId
          || !validateAgyHostObservedReceiptShape(receipt, { record, recordBytes })) fail("AGY-HOST-STORE-BINDING");
        return { ok: true, code: "AGY-HOST-RECEIPT-LOCAL-BYTES-BOUND", receipt,
          sha256: hash(bytes), authority: "not-yet-independently-verified" };
      } finally { closeSync(fd); }
    });
  } catch (error) {
    return { ok: false, code: error?.code?.startsWith("AGY-HOST-") ? error.code : "AGY-HOST-STORE-UNAVAILABLE" };
  }
}
