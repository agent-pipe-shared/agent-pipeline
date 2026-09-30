// SPDX-License-Identifier: SUL-1.0
/** Recoverable, exact-byte onboarding preference projection. */
import { createHash, randomBytes } from "node:crypto";
import { closeSync, constants, fstatSync, fsyncSync, linkSync, lstatSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const INITIAL_ANSWERS_PENDING_SCHEMA = "pipeline.onboarding-preference-projection-pending.v1";
const ROLES_BY_PURPOSE = Object.freeze({
  "first-answers": ["source", "machine", "receipt", "manifest"],
  "later-language": ["source", "machine", "receipt", "manifest"],
});
const LEGACY_ROLES = ["source", "machine", "receipt"];
const PURPOSES = new Set(["first-answers", "later-language"]);
const CAPABILITIES = new Set(["local", "host-managed"]);
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_MARKER_BYTES = 9 * MAX_FILE_BYTES;
const HEX = /^[a-f0-9]{64}$/u;
const TXID = /^[a-f0-9]{32}$/u;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const exactKeys = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");

function encode(bytes, mode) {
  if (bytes === null) return { status: "absent" };
  return { status: "present", bytesBase64: bytes.toString("base64"), sha256: sha256(bytes), mode };
}

function decode(value) {
  if (exactKeys(value, ["status"]) && value.status === "absent") return { bytes: null, mode: null };
  if (!exactKeys(value, ["status", "bytesBase64", "sha256", "mode"])
    || value.status !== "present" || typeof value.bytesBase64 !== "string"
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value.bytesBase64)
    || !HEX.test(value.sha256) || !Number.isInteger(value.mode)
    || value.mode < 0o400 || value.mode > 0o777) throw new Error("INITIAL-ANSWERS-JOURNAL-SHAPE");
  const bytes = Buffer.from(value.bytesBase64, "base64");
  if (bytes.length > MAX_FILE_BYTES || bytes.toString("base64") !== value.bytesBase64 || sha256(bytes) !== value.sha256) {
    throw new Error("INITIAL-ANSWERS-JOURNAL-DIGEST");
  }
  return { bytes, mode: value.mode };
}

function snapshot(path) {
  let stat;
  try { stat = lstatSync(path); }
  catch (error) {
    if (error?.code === "ENOENT") return { bytes: null, mode: null };
    throw error;
  }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > MAX_FILE_BYTES) {
    throw new Error("INITIAL-ANSWERS-TARGET-UNSAFE");
  }
  return { bytes: readFileSync(path), mode: stat.mode & 0o777 };
}

function sameBytes(actual, expected) {
  return actual.bytes === null ? expected.bytes === null
    : expected.bytes !== null && actual.mode === expected.mode && actual.bytes.equals(expected.bytes);
}

function validExpectedPre(value) {
  if (value === undefined) return true;
  if (value === null || typeof value !== "object") return false;
  if (value.bytes === null) return value.mode === null;
  return Buffer.isBuffer(value.bytes) && value.bytes.length <= MAX_FILE_BYTES
    && Number.isInteger(value.mode)
    && value.mode >= 0o400 && value.mode <= 0o777;
}

function markerSnapshot(path) {
  let stat;
  try { stat = lstatSync(path); }
  catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
  if (!stat.isFile() || stat.isSymbolicLink() || ![1, 2].includes(stat.nlink)
    || stat.size > MAX_MARKER_BYTES || (stat.mode & 0o077) !== 0) {
    throw new Error("INITIAL-ANSWERS-JOURNAL-UNSAFE");
  }
  const bytes = readFileSync(path);
  return { bytes, dev: stat.dev, ino: stat.ino, nlink: stat.nlink, digest: sha256(bytes) };
}

function syncParent(path) {
  let fd;
  try {
    fd = openSync(dirname(path), constants.O_RDONLY | (constants.O_DIRECTORY ?? 0));
    fsyncSync(fd);
  } catch (error) {
    // Some hosts cannot fsync directories. The completed file/link is still
    // available after a process crash; do not turn its publication into a
    // false success/failure ambiguity solely for this unsupported operation.
    if (!["EINVAL", "ENOTSUP", "EOPNOTSUPP", "EBADF"].includes(error?.code)
      && !(process.platform === "win32" && error?.code === "EPERM")) throw error;
  } finally { if (fd !== undefined) closeSync(fd); }
}

function linkedTemporary(markerPath, value, marker) {
  if (marker.nlink === 1) return null;
  const temporary = `${markerPath}.tmp-${value.transactionId}`;
  const stat = lstatSync(temporary);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 2
    || stat.dev !== marker.dev || stat.ino !== marker.ino) {
    throw new Error("INITIAL-ANSWERS-JOURNAL-LINK-DRIFT");
  }
  return temporary;
}

export function readInitialAnswersJournal({ markerPath, root, runner, targets,
  purpose = "first-answers", repositoryCapability = "host-managed" }) {
  const roles = ROLES_BY_PURPOSE[purpose];
  const marker = markerSnapshot(markerPath);
  if (marker === null) return null;
  let value;
  try { value = JSON.parse(marker.bytes.toString("utf8")); }
  catch { throw new Error("INITIAL-ANSWERS-JOURNAL-SHAPE"); }
  if (!marker.bytes.equals(Buffer.from(`${JSON.stringify(value)}\n`, "utf8"))) {
    throw new Error("INITIAL-ANSWERS-JOURNAL-ENCODING");
  }
  if (!exactKeys(value, ["schema", "root", "purpose", "repositoryCapability", "runner", "transactionId", "answerSha256", "entries"])
    || value.schema !== INITIAL_ANSWERS_PENDING_SCHEMA || value.root !== root
    || !PURPOSES.has(purpose) || value.purpose !== purpose
    || !CAPABILITIES.has(repositoryCapability) || value.repositoryCapability !== repositoryCapability
    || value.runner !== runner
    || !TXID.test(value.transactionId) || !HEX.test(value.answerSha256)
    || !Array.isArray(value.entries) || ![LEGACY_ROLES.length, roles.length].includes(value.entries.length)
    || !Array.isArray(targets) || targets.length !== roles.length) {
    throw new Error("INITIAL-ANSWERS-JOURNAL-BINDING");
  }
  const legacy = value.entries.length === LEGACY_ROLES.length;
  const recordedRoles = legacy ? LEGACY_ROLES : roles;
  const entries = value.entries.map((entry, index) => {
    if (!exactKeys(entry, ["role", "path", "pre", "post"])
      || entry.role !== recordedRoles[index] || entry.path !== targets[index].path
      || targets[index].role !== recordedRoles[index]) throw new Error("INITIAL-ANSWERS-JOURNAL-BINDING");
    const pre = decode(entry.pre);
    const post = decode(entry.post);
    if (post.bytes === null) throw new Error("INITIAL-ANSWERS-JOURNAL-SHAPE");
    return { role: entry.role, path: entry.path, pre, post };
  });
  return { value, marker, entries, legacy, linkedTemporary: linkedTemporary(markerPath, value, marker) };
}

export function beginInitialAnswersJournal({ markerPath, root, runner, answerSha256, targets,
  purpose = "first-answers", repositoryCapability = "host-managed" }) {
  const roles = ROLES_BY_PURPOSE[purpose];
  if (!PURPOSES.has(purpose) || !CAPABILITIES.has(repositoryCapability)
    || !HEX.test(answerSha256) || !Array.isArray(targets) || targets.length !== roles.length
    || targets.some((target, index) => target.role !== roles[index]
      || typeof target.path !== "string" || !Buffer.isBuffer(target.postBytes)
      || target.postBytes.length > MAX_FILE_BYTES || !Number.isInteger(target.postMode)
      || target.postMode < 0o400 || target.postMode > 0o777
      || !validExpectedPre(target.expectedPre))) {
    throw new Error("INITIAL-ANSWERS-JOURNAL-SHAPE");
  }
  if (markerSnapshot(markerPath) !== null) throw new Error("INITIAL-ANSWERS-JOURNAL-ALREADY-PENDING");
  const value = {
    schema: INITIAL_ANSWERS_PENDING_SCHEMA,
    root,
    purpose,
    repositoryCapability,
    runner,
    transactionId: randomBytes(16).toString("hex"),
    answerSha256,
    entries: targets.map((target) => {
      const pre = snapshot(target.path);
      // The writer computes postimages from a previously validated source and
      // machine preimage. Do not authorize those postimages if either input
      // changed before the durable journal was admitted.
      if (target.expectedPre !== undefined && !sameBytes(pre, target.expectedPre)) {
        throw new Error("INITIAL-ANSWERS-JOURNAL-PREIMAGE-DRIFT");
      }
      return { role: target.role, path: target.path,
        pre: encode(pre.bytes, pre.mode), post: encode(target.postBytes, target.postMode) };
    }),
  };
  const bytes = Buffer.from(`${JSON.stringify(value)}\n`, "utf8");
  if (bytes.length > MAX_MARKER_BYTES) throw new Error("INITIAL-ANSWERS-JOURNAL-SHAPE");
  // Build complete bytes under a transaction-specific temporary. Publishing
  // its hard link to the marker is exclusive; a crash during the write leaves
  // only an ignorable temporary, never a malformed authoritative marker.
  const temporary = `${markerPath}.tmp-${value.transactionId}`;
  let fd;
  let identity;
  let linked = false;
  try {
    fd = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
    identity = fstatSync(fd);
    writeFileSync(fd, bytes);
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
    linkSync(temporary, markerPath);
    linked = true;
    syncParent(markerPath);
    unlinkSync(temporary);
    syncParent(markerPath);
  } catch (error) {
    if (fd !== undefined) { try { closeSync(fd); } catch { /* preserve first failure */ } }
    if (!linked && identity) {
      try {
        const current = lstatSync(temporary);
        if (current.dev === identity.dev && current.ino === identity.ino) unlinkSync(temporary);
      } catch { /* unknown replacement is not ours to remove */ }
    }
    throw error;
  }
  // A readback binds both the exact marker inode and all derived target paths.
  return readInitialAnswersJournal({ markerPath, root, runner, targets, purpose, repositoryCapability });
}

export function completeInitialAnswersJournal({ markerPath, root, runner, answerSha256, targets, publish, completeLegacy = null,
  purpose = "first-answers", repositoryCapability = "host-managed" }) {
  const journal = readInitialAnswersJournal({ markerPath, root, runner, targets, purpose, repositoryCapability });
  if (journal === null) throw new Error("INITIAL-ANSWERS-JOURNAL-MISSING");
  if (journal.value.answerSha256 !== answerSha256) throw new Error("INITIAL-ANSWERS-JOURNAL-ANSWER-CONFLICT");
  if (typeof publish !== "function") throw new Error("INITIAL-ANSWERS-JOURNAL-PUBLISHER-MISSING");
  // Admit the complete set before the first write. Unknown bytes stop the
  // transaction without clobbering a later human or process edit.
  const states = journal.entries.map((entry) => {
    const actual = snapshot(entry.path);
    if (sameBytes(actual, entry.post)) return "post";
    if (sameBytes(actual, entry.pre)) return "pre";
    throw new Error("INITIAL-ANSWERS-JOURNAL-DRIFT");
  });
  for (let index = 0; index < journal.entries.length; index += 1) {
    if (states[index] === "post") continue;
    const entry = journal.entries[index];
    publish(entry.role, entry.path, entry.post.bytes, entry.post.mode);
    if (!sameBytes(snapshot(entry.path), entry.post)) throw new Error("INITIAL-ANSWERS-JOURNAL-READBACK");
  }
  if (journal.legacy) {
    if (typeof completeLegacy !== "function") throw new Error("INITIAL-ANSWERS-JOURNAL-LEGACY-RECOVERY-REQUIRED");
    completeLegacy();
  }
  const after = markerSnapshot(markerPath);
  if (after === null || after.dev !== journal.marker.dev || after.ino !== journal.marker.ino
    || after.digest !== journal.marker.digest) throw new Error("INITIAL-ANSWERS-JOURNAL-CHANGED");
  if (journal.linkedTemporary !== null) {
    const alias = linkedTemporary(markerPath, journal.value, after);
    if (alias !== journal.linkedTemporary) throw new Error("INITIAL-ANSWERS-JOURNAL-LINK-DRIFT");
    unlinkSync(alias);
  }
  unlinkSync(markerPath);
  syncParent(markerPath);
  return { status: states.every((state) => state === "post") ? "replayed" : "completed",
    ...(journal.legacy ? { legacy: true } : {}) };
}
