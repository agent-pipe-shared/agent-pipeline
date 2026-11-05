// SPDX-License-Identifier: SUL-1.0
/**
 * Where the governed slice queue lives (AC-108, closest accepted criterion; PO decision 2026-11-05).
 *
 * The WORKING copy of the approved feature's queue lives under the Git common directory, so a dispatch binding, a queue
 * amendment, a rollback, a cancel and every slice-queue.mjs verb never make the working tree dirty and a branch switch never
 * drags the queue along. The tracked `specs/<feature>/slice-queue.json` is the HANDOVER copy: push-prepare exports the working
 * copy to it and commits it, and a machine with no working copy reads it byte-identical.
 *
 * Read rule (reads never write):
 *   working copy present        -> read it, unless the handover copy changed since the last import/export while the working
 *                                  copy did not (another machine pushed): then the handover bytes are read (handover wins)
 *   working copy absent         -> the handover bytes, byte-identical, never re-serialised (the digest the caller binds is the
 *                                  digest of these bytes)
 *   both absent                 -> an ENOENT error, as before
 *   both changed / no sidecar   -> the working copy wins and the result says `handoverConflict: true`
 * A writer publishes the NEW bytes as the working copy (temp file beside it + rename, after a compare-and-swap on the bytes it
 * read), which is the materialisation of a handover-only repository.
 *
 * Sidecar: next to the working copy, `<name>.sync.json` records the digest of the handover copy last imported or exported and the
 * digest of the working copy at that moment. It is the only thing that tells "the other machine pushed" from "this one wrote".
 *
 * Outside a Git repository (no common directory) the working copy IS the handover path: the legacy behaviour, with no sidecar.
 * Plain node:fs only; no new registry boundary.
 */
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { closeSync, constants, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, unlinkSync, writeSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export const SLICE_QUEUE_SYNC_SCHEMA = "pipeline.slice-queue-sync.v1";
const DEFAULT_MAX_BYTES = 16 * 1024 * 1024;
const HEX64 = /^[0-9a-f]{64}$/u;
export const sliceQueueDigest = (bytes) => createHash("sha256").update(bytes).digest("hex");

const commonDirs = new Map();
/** The real Git common directory of a repository root (a linked worktree has a .git FILE: git resolves it), or null. */
function gitCommonDir(root) {
  if (commonDirs.has(root)) return commonDirs.get(root);
  let found = null;
  const run = spawnSync("git", ["-C", root, "rev-parse", "--git-common-dir"], { encoding: "utf8", timeout: 5000, shell: false });
  if (run.status === 0 && typeof run.stdout === "string" && run.stdout.trim() !== "") {
    try { found = realpathSync(resolve(root, run.stdout.trim())); } catch { found = null; }
  }
  if (found !== null) commonDirs.set(root, found);
  return found;
}

/** `planDir` is the repository-relative directory of the approved plan (`.` for the root). */
export function sliceQueueLocation({ root, planDir }) {
  const dir = String(planDir ?? ".").replaceAll("\\", "/").replace(/^\.\/+/u, "").replace(/\/+$/u, "") || ".";
  const handoverPath = dir === "." ? "slice-queue.json" : `${dir}/slice-queue.json`;
  let base = resolve(root);
  try { base = realpathSync(base); } catch { /* a root that does not exist yet keeps its given spelling */ }
  const handoverAbs = resolve(base, handoverPath);
  const commonDir = gitCommonDir(base);
  if (commonDir === null) return { handoverPath, handoverAbs, workingPath: handoverAbs, sidecarPath: null, directory: dirname(handoverAbs), shared: false };
  const slug = dir.replace(/[^A-Za-z0-9._-]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 60) || "root";
  const name = `${slug}-${sliceQueueDigest(Buffer.from(dir)).slice(0, 12)}`;
  const directory = join(commonDir, "agent-pipeline", "slice-queues");
  return { handoverPath, handoverAbs, workingPath: join(directory, `${name}.json`), sidecarPath: join(directory, `${name}.sync.json`), directory, shared: true };
}

/** The location of an already known handover path (`governed.path`). */
export function sliceQueueLocationOf({ root, handoverPath }) {
  return sliceQueueLocation({ root, planDir: dirname(handoverPath) });
}

/** One bounded read of a regular, non-symlink file; throws the ENOENT error of a missing file. */
function readBoundedFile(path, maxBytes) {
  const info = lstatSync(path);
  if (info.isFile() && !info.isSymbolicLink() && info.size > maxBytes) throw Object.assign(new Error("too large"), { code: "SQ-DELIVERY-QUEUE-TOO-LARGE" });
  if (!info.isFile() || info.isSymbolicLink() || realpathSync(path) !== path) throw new Error("unsafe");
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const opened = fstatSync(fd), bytes = readFileSync(fd), after = fstatSync(fd), current = lstatSync(path);
    for (const key of ["dev", "ino", "mode", "nlink", "size", "mtimeMs", "ctimeMs"]) if (opened[key] !== info[key] || after[key] !== opened[key] || current[key] !== opened[key]) throw new Error("drift");
    if (bytes.length !== opened.size) throw new Error("size");
    return bytes;
  } finally { closeSync(fd); }
}
export { readBoundedFile };

function readOrNull(path, maxBytes) {
  try { return readBoundedFile(path, maxBytes); } catch (error) { if (error?.code === "ENOENT") return null; throw error; }
}

function readSidecar(location) {
  if (location.sidecarPath === null) return null;
  try {
    const value = JSON.parse(readOrNull(location.sidecarPath, 4096)?.toString("utf8") ?? "null");
    const ok = (field) => value[field] === null || (typeof value[field] === "string" && HEX64.test(value[field]));
    return value && value.schema === SLICE_QUEUE_SYNC_SCHEMA && ok("handoverSha256") && ok("workingSha256") ? { handoverSha256: value.handoverSha256, workingSha256: value.workingSha256 } : null;
  } catch { return null; }
}

function atomicWrite(path, bytes, mode = 0o600) {
  const temp = join(dirname(path), `.slice-queue.${randomBytes(16).toString("hex")}.tmp`);
  let fd;
  try {
    fd = openSync(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), mode);
    let offset = 0;
    while (offset < bytes.length) { const written = writeSync(fd, bytes, offset, bytes.length - offset); if (written <= 0) throw new Error("short write"); offset += written; }
    fsyncSync(fd); closeSync(fd); fd = undefined;
    renameSync(temp, path);
  } finally { if (fd !== undefined) closeSync(fd); try { unlinkSync(temp); } catch { /* renamed or never created */ } }
}

function writeSidecar(location, handoverSha256, workingSha256) {
  if (location.sidecarPath === null) return;
  atomicWrite(location.sidecarPath, Buffer.from(`${JSON.stringify({ schema: SLICE_QUEUE_SYNC_SCHEMA, handoverSha256, workingSha256 })}\n`));
}

/**
 * The bytes a reader must use, with where they came from. Throws an ENOENT error when neither copy exists.
 * `{ bytes, sha256, source: 'working'|'handover', handoverConflict, handoverSha256, workingSha256 }`
 */
export function readSliceQueueSource(location, { maxBytes = DEFAULT_MAX_BYTES } = {}) {
  const handover = location.shared ? readOrNull(location.handoverAbs, maxBytes) : null;
  const working = readOrNull(location.workingPath, maxBytes);
  if (working === null && handover === null) throw Object.assign(new Error("slice queue absent"), { code: "ENOENT" });
  const handoverSha256 = handover === null ? null : sliceQueueDigest(handover), workingSha256 = working === null ? null : sliceQueueDigest(working);
  const answer = (bytes, source, handoverConflict) => ({ bytes, sha256: sliceQueueDigest(bytes), source, handoverConflict, handoverSha256, workingSha256 });
  if (!location.shared) return { ...answer(working, "working", false), handoverSha256: workingSha256 };
  if (working === null) return answer(handover, "handover", false);
  if (handover === null || handoverSha256 === workingSha256) return answer(working, "working", false);
  const side = readSidecar(location);
  if (side === null) return answer(working, "working", true);
  const handoverChanged = handoverSha256 !== side.handoverSha256, workingChanged = workingSha256 !== side.workingSha256;
  if (handoverChanged && !workingChanged) return answer(handover, "handover", false);
  return answer(working, "working", handoverChanged && workingChanged);
}

/**
 * Publishes `bytes` as the working copy after a compare-and-swap on what the caller read (`preimage`: the result of
 * readSliceQueueSource, or null when neither copy existed). `casError` builds the error thrown on a mismatch.
 */
export function writeWorkingQueue(location, bytes, preimage, { maxBytes = DEFAULT_MAX_BYTES, casError } = {}) {
  let current = null;
  try { current = readSliceQueueSource(location, { maxBytes }); } catch (error) { if (error?.code !== "ENOENT") throw error; }
  if ((current?.sha256 ?? null) !== (preimage?.sha256 ?? null)) throw casError ? casError() : Object.assign(new Error("the slice queue changed since its read"), { code: "SQ-QUEUE-CAS" });
  if (location.shared) mkdirSync(location.directory, { recursive: true, mode: 0o700 });
  const side = readSidecar(location);
  atomicWrite(location.workingPath, bytes);
  // A handover copy adopted by this write is now the recorded import; otherwise the record is kept, so an unresolved conflict stays visible.
  const handoverSha256 = preimage?.source === "handover" ? preimage.handoverSha256
    : side !== null ? side.handoverSha256
      : preimage && preimage.handoverSha256 !== null && preimage.handoverSha256 === preimage.sha256 ? preimage.handoverSha256 : null;
  writeSidecar(location, handoverSha256, sliceQueueDigest(bytes));
  return { sha256: sliceQueueDigest(bytes) };
}

/** Rollback of a write: restores the exact prior working bytes, or removes the working copy (and its sidecar) when there was none. */
export function restoreWorkingQueue({ workingPath, sidecarPath = null }, bytes) {
  if (bytes === null) {
    unlinkSync(workingPath);
    if (sidecarPath !== null) { try { unlinkSync(sidecarPath); } catch { /* none recorded */ } }
    return;
  }
  const location = { workingPath, sidecarPath, shared: sidecarPath !== null };
  const side = readSidecar(location);
  atomicWrite(workingPath, bytes);
  writeSidecar(location, side?.handoverSha256 ?? null, sliceQueueDigest(bytes));
}

/** `import --take-handover`: the working copy becomes the handover bytes, byte-identical. The caller decides whether that may lose a live reservation. */
export function takeHandoverQueue(location, { maxBytes = DEFAULT_MAX_BYTES } = {}) {
  if (!location.shared) return { status: "unchanged", code: "SQ-IMPORT-NO-WORKING-COPY" };
  const handover = readOrNull(location.handoverAbs, maxBytes);
  if (handover === null) return { status: "refused", code: "SQ-IMPORT-NO-HANDOVER", repair: `there is no handover copy at ${location.handoverPath} in this checkout: pull or check out the branch that carries it, then run the import again` };
  const working = readOrNull(location.workingPath, maxBytes), handoverSha256 = sliceQueueDigest(handover);
  if (working !== null && sliceQueueDigest(working) === handoverSha256) { writeSidecar(location, handoverSha256, handoverSha256); return { status: "unchanged", code: "SQ-IMPORT-UNCHANGED", sha256: handoverSha256 }; }
  mkdirSync(location.directory, { recursive: true, mode: 0o700 });
  atomicWrite(location.workingPath, handover);
  writeSidecar(location, handoverSha256, handoverSha256);
  return { status: "taken", code: "SQ-IMPORT-TAKEN", sha256: handoverSha256 };
}

/**
 * push-prepare's export: the working copy is written to the handover path when it is the effective queue, is not in conflict and
 * differs from the handover copy. Never overwrites a handover copy that another machine changed (that is a conflict: left alone).
 */
export function exportHandoverQueue(location, { maxBytes = DEFAULT_MAX_BYTES } = {}) {
  if (!location.shared) return { status: "skipped", code: "SQ-EXPORT-NO-WORKING-COPY" };
  let read;
  try { read = readSliceQueueSource(location, { maxBytes }); } catch (error) { if (error?.code === "ENOENT") return { status: "skipped", code: "SQ-EXPORT-NO-QUEUE" }; throw error; }
  if (read.source !== "working") return { status: "skipped", code: "SQ-EXPORT-HANDOVER-CURRENT" };
  if (read.handoverConflict) return { status: "skipped", code: "SQ-EXPORT-CONFLICT" };
  if (read.handoverSha256 === read.sha256) { writeSidecar(location, read.sha256, read.sha256); return { status: "skipped", code: "SQ-EXPORT-UNCHANGED" }; }
  mkdirSync(dirname(location.handoverAbs), { recursive: true });
  atomicWrite(location.handoverAbs, read.bytes, 0o644);
  writeSidecar(location, read.sha256, read.sha256);
  return { status: "exported", code: "SQ-EXPORTED", path: location.handoverPath, sha256: read.sha256 };
}
