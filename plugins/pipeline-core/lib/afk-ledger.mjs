// SPDX-License-Identifier: SUL-1.0
import { randomBytes } from "node:crypto";
import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

import {
  canonicalJson,
  canonicalJsonFile,
  sha256Canonical,
  sha256Raw,
  validateActivationReceipt,
} from "./afk-assumption-mode.mjs";
import { validateAfkWorkerRequest } from "./afk-capability-worker.mjs";
import { ensurePrivateDirectory } from "./private-boundary.mjs";
import { assessWindowsPrivatePath } from "./windows-private-state.mjs";

export const AFK_LEDGER_RECORD_SCHEMA = "pipeline.afk-ledger-record.v1";
export const AFK_LEDGER_ZERO_HASH = "0".repeat(64);
export const AFK_LEDGER_RECORD_TYPES = Object.freeze([
  "activation-intent",
  "activation-ready",
  "entry-intent",
  "entry-applied",
  "review-freeze",
  "review-intent",
  "promotion-applied",
  "entry-receipt",
  "review-complete",
  "lock-recovered",
  "blocked",
]);

const HEX32 = /^[0-9a-f]{32}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const SAFE_ID = /^[a-z0-9][a-z0-9._-]{0,127}$/u;
const GENERATION = /^(?<sequence>[0-9]{16})-(?<head>[0-9a-f]{64})\.afklog$/u;
const FRAME = /^(?<length>[0-9a-f]{8}) (?<hash>[0-9a-f]{64}) /u;
const LOCK_SCHEMA = "pipeline.afk-writer-lock.v1";
const MAX_GENERATION_BYTES = 64 * 1024 * 1024;

function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, keys) {
  return object(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function fail(code, detail = null, mutation = "none") {
  return { ok: false, code, detail, mutation };
}

function safeId(value) {
  return typeof value === "string" && SAFE_ID.test(value);
}

function isoTime(value) {
  if (typeof value !== "string") return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value;
}

function oid(value) {
  return typeof value === "string" && OID.test(value);
}

function nullableOid(value) {
  return value === null || oid(value);
}

function validLockOwner(value) {
  return exactKeys(value, [
    "schema", "hostId", "bootId", "pid", "processStart", "activationId",
    "ownerNonce", "acquiredAt",
  ]) && value.schema === LOCK_SCHEMA
    && safeId(value.hostId) && safeId(value.bootId)
    && Number.isSafeInteger(value.pid) && value.pid > 0
    && typeof value.processStart === "string" && value.processStart.length > 0
    && value.processStart.length <= 128 && HEX32.test(value.activationId)
    && SHA256.test(value.ownerNonce) && isoTime(value.acquiredAt);
}

function validIdentity(value) {
  return exactKeys(value, ["name", "email"])
    && typeof value.name === "string" && value.name.length > 0 && value.name.length <= 128
    && !/[\0\r\n<>]/u.test(value.name)
    && typeof value.email === "string" && /^[^\s<>@]+@[^\s<>@]+$/u.test(value.email)
    && value.email.length <= 254;
}

function validEntryWrite(value) {
  if (!(exactKeys(value, [
    "operation", "path", "baseMode", "baseBlobOid", "resultMode",
    "resultContentBase64", "resultSha256", "resultBlobOid",
  ]) && new Set(["put", "delete"]).has(value.operation)
    && typeof value.path === "string" && value.path.length > 0 && value.path.length <= 4096
    && [null, "100644", "100755"].includes(value.baseMode)
    && nullableOid(value.baseBlobOid) && [null, "100644", "100755"].includes(value.resultMode)
    && (value.resultContentBase64 === null || typeof value.resultContentBase64 === "string")
    && (value.resultSha256 === null || SHA256.test(value.resultSha256))
    && nullableOid(value.resultBlobOid))) return false;
  if (value.operation === "delete") {
    return new Set(["100644", "100755"]).has(value.baseMode) && oid(value.baseBlobOid)
      && value.resultMode === null && value.resultContentBase64 === null
      && value.resultSha256 === null && value.resultBlobOid === null;
  }
  const validBase = (value.baseMode === null && value.baseBlobOid === null)
    || (new Set(["100644", "100755"]).has(value.baseMode) && oid(value.baseBlobOid));
  return validBase && new Set(["100644", "100755"]).has(value.resultMode)
    && typeof value.resultContentBase64 === "string" && SHA256.test(value.resultSha256)
    && oid(value.resultBlobOid);
}

function validProposal(value, request) {
  return exactKeys(value, [
    "activationId", "requestSha256", "sequence", "finding", "recommendation", "options", "writes", "resultSha256",
  ]) && value.activationId === request.activationId && value.requestSha256 === request.requestSha256
    && value.sequence === request.sequence && exactKeys(value.finding, ["id", "failureSignature"])
    && safeId(value.finding.id) && SHA256.test(value.finding.failureSignature)
    && safeId(value.recommendation) && Array.isArray(value.options) && Array.isArray(value.writes)
    && SHA256.test(value.resultSha256);
}

function validDisposition(value) {
  return exactKeys(value, ["entryId", "sequence", "decision"])
    && safeId(value.entryId) && Number.isSafeInteger(value.sequence) && value.sequence > 0
    && new Set(["accept", "reject"]).has(value.decision);
}

function validBody(type, body) {
  switch (type) {
    case "activation-intent":
      return exactKeys(body, ["receipt", "privateRef", "expectedPrivateRefOid"])
        && validateActivationReceipt(body.receipt).ok
        && body.privateRef === `refs/agent-pipeline/afk/${body.receipt.activationId}`
        && body.expectedPrivateRefOid === null;
    case "activation-ready":
      return exactKeys(body, ["receiptSha256", "privateRef", "privateRefOid"])
        && SHA256.test(body.receiptSha256) && typeof body.privateRef === "string" && oid(body.privateRefOid);
    case "entry-intent":
      return exactKeys(body, [
        "entryId", "request", "proposal", "requestSha256", "resultSha256", "parentCommit", "parentTree",
        "resultTree", "resultCommit", "objectFormat", "identity", "gitTimestamp",
        "message", "writes",
      ]) && safeId(body.entryId) && validateAfkWorkerRequest(body.request).ok
        && validProposal(body.proposal, body.request)
        && body.requestSha256 === body.request.requestSha256
        && body.resultSha256 === body.proposal.resultSha256
        && oid(body.parentCommit) && oid(body.parentTree) && oid(body.resultTree) && oid(body.resultCommit)
        && new Set(["sha1", "sha256"]).has(body.objectFormat)
        && body.objectFormat === body.request.current.objectFormat
        && body.parentCommit === body.request.current.commit && body.parentTree === body.request.current.tree
        && validIdentity(body.identity)
        && /^[0-9]+ \+0000$/u.test(body.gitTimestamp)
        && typeof body.message === "string" && body.message.length > 0 && body.message.length <= 4096
        && !body.message.includes("\0") && body.message.endsWith("\n")
        && Array.isArray(body.writes) && body.writes.every(validEntryWrite)
        && body.writes.every((entry, index) => index === 0 || body.writes[index - 1].path < entry.path);
    case "entry-applied":
      return exactKeys(body, ["entryId", "privateRef", "parentCommit", "resultCommit", "resultTree"])
        && safeId(body.entryId) && typeof body.privateRef === "string"
        && oid(body.parentCommit) && oid(body.resultCommit) && oid(body.resultTree);
    case "review-freeze":
      return exactKeys(body, [
        "reviewId", "cause", "ledgerSequence", "ledgerHeadSha256", "privateRefOid",
        "featureRef", "featureBaseOid", "frozenAt",
      ]) && safeId(body.reviewId) && new Set(["expiry", "revocation", "explicit-review"]).has(body.cause)
        && Number.isSafeInteger(body.ledgerSequence) && body.ledgerSequence > 0
        && SHA256.test(body.ledgerHeadSha256) && oid(body.privateRefOid)
        && typeof body.featureRef === "string" && oid(body.featureBaseOid) && isoTime(body.frozenAt);
    case "review-intent":
      return exactKeys(body, [
        "reviewId", "attributedBy", "reviewedAt", "freezeRecordSha256", "dispositions",
        "acceptedPrefixLength", "promotionOid", "reviewSha256",
      ]) && safeId(body.reviewId) && typeof body.attributedBy === "string"
        && body.attributedBy.length > 0 && body.attributedBy.length <= 256 && isoTime(body.reviewedAt)
        && SHA256.test(body.freezeRecordSha256) && Array.isArray(body.dispositions)
        && body.dispositions.every(validDisposition)
        && Number.isSafeInteger(body.acceptedPrefixLength) && body.acceptedPrefixLength >= 0
        && body.acceptedPrefixLength <= body.dispositions.length && oid(body.promotionOid)
        && SHA256.test(body.reviewSha256);
    case "promotion-applied":
      return exactKeys(body, ["reviewId", "featureRef", "baseOid", "promotionOid", "moved"])
        && safeId(body.reviewId) && typeof body.featureRef === "string"
        && oid(body.baseOid) && oid(body.promotionOid) && typeof body.moved === "boolean";
    case "entry-receipt":
      return exactKeys(body, ["reviewId", "entryId", "sequence", "decision", "entryCommit", "receiptSha256"])
        && safeId(body.reviewId) && safeId(body.entryId)
        && Number.isSafeInteger(body.sequence) && body.sequence > 0
        && new Set(["accept", "reject"]).has(body.decision) && oid(body.entryCommit)
        && SHA256.test(body.receiptSha256);
    case "review-complete":
      return exactKeys(body, ["reviewId", "reviewSha256", "promotionOid", "receiptSha256List"])
        && safeId(body.reviewId) && SHA256.test(body.reviewSha256) && oid(body.promotionOid)
        && Array.isArray(body.receiptSha256List) && body.receiptSha256List.every((entry) => SHA256.test(entry));
    case "lock-recovered":
      return exactKeys(body, ["oldOwner", "newOwner", "evidence"])
        && validLockOwner(body.oldOwner) && validLockOwner(body.newOwner)
        && exactKeys(body.evidence, ["sameHost", "sameBoot", "dead", "observedAt"])
        && body.evidence.sameHost === true && body.evidence.sameBoot === true
        && body.evidence.dead === true && isoTime(body.evidence.observedAt);
    case "blocked":
      return exactKeys(body, ["reasonCode"])
        && typeof body.reasonCode === "string" && /^AFK-[A-Z0-9-]{1,96}$/u.test(body.reasonCode);
    default:
      return false;
  }
}

export function validateAfkLedgerRecord(record) {
  if (!exactKeys(record, [
    "schema", "activationId", "sequence", "type", "previousHash", "recordedAt", "body",
  ]) || record.schema !== AFK_LEDGER_RECORD_SCHEMA || !HEX32.test(record.activationId)
    || !Number.isSafeInteger(record.sequence) || record.sequence < 1
    || !AFK_LEDGER_RECORD_TYPES.includes(record.type) || !SHA256.test(record.previousHash)
    || !isoTime(record.recordedAt) || !validBody(record.type, record.body)) {
    return fail("AFK-LEDGER-RECORD-INVALID");
  }
  return { ok: true, record, recordHash: sha256Canonical(record) };
}

export function encodeAfkLedgerFrame(record) {
  const checked = validateAfkLedgerRecord(record);
  if (!checked.ok) return checked;
  const payload = Buffer.from(canonicalJson(record), "utf8");
  if (payload.length > 0xffff_ffff) return fail("AFK-LEDGER-RECORD-TOO-LARGE");
  const prefix = `${payload.length.toString(16).padStart(8, "0")} ${checked.recordHash} `;
  return { ok: true, bytes: Buffer.concat([Buffer.from(prefix, "ascii"), payload, Buffer.from("\n")]), ...checked };
}

export function parseAfkLedgerGeneration(raw, expectedActivationId = null) {
  const bytes = Buffer.isBuffer(raw) ? raw : Buffer.from(raw ?? "");
  if (bytes.length === 0 || bytes.length > MAX_GENERATION_BYTES) return fail("AFK-LEDGER-GENERATION-INVALID");
  const frames = [];
  let offset = 0;
  let previousHash = AFK_LEDGER_ZERO_HASH;
  while (offset < bytes.length) {
    const headerEnd = offset + 8 + 1 + 64 + 1;
    if (headerEnd > bytes.length) return fail("AFK-LEDGER-FRAME-TORN");
    const header = bytes.subarray(offset, headerEnd).toString("ascii");
    const match = FRAME.exec(header);
    if (!match) return fail("AFK-LEDGER-FRAME-INVALID");
    const length = Number.parseInt(match.groups.length, 16);
    const payloadEnd = headerEnd + length;
    if (payloadEnd >= bytes.length || bytes[payloadEnd] !== 0x0a) return fail("AFK-LEDGER-FRAME-TORN");
    const payload = bytes.subarray(headerEnd, payloadEnd);
    if (sha256Raw(payload) !== match.groups.hash) return fail("AFK-LEDGER-FRAME-HASH-MISMATCH");
    let record;
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(payload);
      record = JSON.parse(text);
      if (canonicalJson(record) !== text) return fail("AFK-LEDGER-FRAME-NONCANONICAL");
    } catch {
      return fail("AFK-LEDGER-FRAME-INVALID");
    }
    const checked = validateAfkLedgerRecord(record);
    if (!checked.ok || checked.recordHash !== match.groups.hash
      || record.sequence !== frames.length + 1 || record.previousHash !== previousHash
      || (expectedActivationId !== null && record.activationId !== expectedActivationId)) {
      return fail("AFK-LEDGER-CHAIN-INVALID");
    }
    frames.push({ record, recordHash: checked.recordHash });
    previousHash = checked.recordHash;
    offset = payloadEnd + 1;
  }
  return { ok: true, frames, sequence: frames.length, headSha256: previousHash, bytes };
}

/**
 * Directory creation/hardening for the private ledger tree reuses
 * `ensurePrivateDirectory` (private-boundary.mjs) end to end: it walks from
 * the nearest existing ancestor down to the target in one call, verifies
 * physicality (no symlink-in-path) at every level, and -- on native Windows
 * -- applies the shared DACL/owner assurance (harden newly created
 * components, assess already-existing ones, fail closed otherwise) via
 * `assureWindowsPrivateDirectories`. This composes cleanly with the nested
 * agent-pipeline/afk/<activationId>/generations layout: no bespoke
 * per-level directory helper is needed here anymore.
 */
export function afkLedgerPaths(gitCommonDir, activationId) {
  if (!HEX32.test(activationId)) throw new Error("invalid activation ID");
  const generations = ensurePrivateDirectory(join(gitCommonDir, "agent-pipeline", "afk", activationId, "generations"));
  const root = dirname(generations);
  return {
    root,
    generations,
    writerLock: join(root, "writer.lock"),
    recoveryLock: join(root, "recovery.lock"),
  };
}

/**
 * Injectable IO seam for platform-specific assurance, resolved once per
 * exported entry point and threaded down to the internal helpers below.
 * Defaults are the real native primitives; tests override `platform`,
 * `assessWindowsPrivate`, and/or `syncDirectory` to exercise the
 * Windows-unsupported-directory-durability and DACL-insecure/-unavailable
 * paths deterministically, without depending on the actual host OS.
 */
function resolveIo(io = {}) {
  return {
    platform: io.platform ?? process.platform,
    assessWindowsPrivate: io.assessWindowsPrivate ?? assessWindowsPrivatePath,
    syncDirectory: io.syncDirectory ?? defaultFsyncDirectory,
  };
}

/**
 * A private regular file's "is this actually private" check is POSIX exact
 * mode 0600 on every non-Windows platform (unchanged invariant). Node
 * synthesizes `.mode` on native Windows from the read-only attribute alone
 * (group/other bits always mirror the owner bits, e.g. a writable file
 * always reports 0666 regardless of chmod), so an exact-0600 comparison is
 * meaningless there and was previously silently always-failing (or, if ever
 * accidentally true, providing false confidence). On win32 this instead
 * requires the shared native DACL/owner/reparse-point assurance -- for both
 * the file and its parent directory -- to report "secure"; any other status
 * (insecure, unavailable, unsupported) fails closed.
 */
function privateRegularFile(path, parentSecure, { platform, assessWindowsPrivate }) {
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink()) return false;
  if (platform === "win32") return parentSecure() && assessWindowsPrivate(path).status === "secure";
  return (info.mode & 0o777) === 0o600;
}

function chainPrefix(left, right) {
  if (left.frames.length > right.frames.length) return false;
  return left.frames.every((frame, index) => frame.recordHash === right.frames[index].recordHash);
}

export function loadAfkLedger(gitCommonDir, activationId, io = {}) {
  const resolved = resolveIo(io);
  let paths;
  try { paths = afkLedgerPaths(gitCommonDir, activationId); } catch { return fail("AFK-LEDGER-PATH-UNSAFE"); }
  // Assessed at most once per call (memoized), not once per generation file:
  // the generations directory itself does not change between iterations.
  let parentSecureCache;
  const parentSecure = () => {
    if (parentSecureCache === undefined) {
      parentSecureCache = resolved.assessWindowsPrivate(paths.generations).status === "secure";
    }
    return parentSecureCache;
  };
  const candidates = [];
  for (const name of readdirSync(paths.generations)) {
    if (name.includes(".tmp-")) continue;
    const matched = GENERATION.exec(name);
    if (!matched) return fail("AFK-LEDGER-GENERATION-NAME-INVALID", name);
    const path = join(paths.generations, name);
    if (!privateRegularFile(path, parentSecure, resolved)) {
      return fail("AFK-LEDGER-GENERATION-UNSAFE", name);
    }
    const parsed = parseAfkLedgerGeneration(readFileSync(path), activationId);
    if (!parsed.ok) return { ...parsed, detail: name };
    if (Number(matched.groups.sequence) !== parsed.sequence || matched.groups.head !== parsed.headSha256) {
      return fail("AFK-LEDGER-GENERATION-NAME-MISMATCH", name);
    }
    candidates.push({ ...parsed, name, path });
  }
  if (candidates.length === 0) {
    return { ok: true, paths, frames: [], sequence: 0, headSha256: AFK_LEDGER_ZERO_HASH, bytes: Buffer.alloc(0) };
  }
  candidates.sort((left, right) => left.sequence - right.sequence);
  for (let index = 1; index < candidates.length; index += 1) {
    if (!chainPrefix(candidates[index - 1], candidates[index])) {
      return fail("AFK-LEDGER-COMPETING-GENERATIONS");
    }
  }
  const current = candidates.at(-1);
  return { ok: true, paths, frames: current.frames, sequence: current.sequence, headSha256: current.headSha256, bytes: current.bytes };
}

/**
 * Regular-file durability is a hard requirement on every platform: any
 * fsync failure here must remain a hard, un-swallowed error. The temporary
 * file is reopened "r+" (read-write), not read-only: on native Windows, a
 * handle opened read-only has no write-back to flush, so `fsyncSync` fails
 * closed with EPERM even though this handle only syncs bytes this process
 * just wrote moments ago. "r+" is correct and portable -- it behaves like a
 * read-only reopen for fsync purposes on POSIX. Mirrors the identical fix
 * and rationale in advisory-receipt-assurance.mjs's `persistAdvisoryReceipt`.
 */
function fsyncFile(path) {
  const fd = openSync(path, "r+");
  try { fsyncSync(fd); } finally { closeSync(fd); }
}

/**
 * Directory-entry durability is a hard POSIX flush but is not portably
 * available on native Windows, where opening or fsync-ing a directory
 * handle raises EPERM/EINVAL/EISDIR/EACCES/ENOTSUP. The regular-file flush
 * that always precedes a directory-durability step is the hard durability
 * guarantee; parent-directory durability is therefore best-effort on
 * Windows, and its typed-unavailable outcome is not a failure. A genuinely
 * unexpected error is rethrown (never a blanket EPERM/EACCES catch).
 * Mirrors the identical `unsupportedDirectoryDurability`/`fsyncDirectory`
 * contract in private-boundary.mjs (not exported there, so reproduced here
 * narrowly with the exact same code set and win32-only gating).
 */
function unsupportedDirectoryDurability(error, platform) {
  return platform === "win32"
    && (error?.code === "EPERM" || error?.code === "EINVAL"
      || error?.code === "EISDIR" || error?.code === "EACCES"
      || error?.code === "ENOTSUP");
}

function defaultFsyncDirectory(path) {
  const fd = openSync(path, "r");
  try { fsyncSync(fd); } finally { closeSync(fd); }
}

function fsyncDirectory(path, { platform, syncDirectory }) {
  try {
    syncDirectory(path);
    return "confirmed";
  } catch (error) {
    if (unsupportedDirectoryDurability(error, platform)) return "unavailable";
    throw error;
  }
}

function generationName(sequence, head) {
  return `${String(sequence).padStart(16, "0")}-${head}.afklog`;
}

export function appendAfkLedgerRecord({
  gitCommonDir,
  activationId,
  type,
  body,
  recordedAt,
  expectedHeadSha256 = null,
  fault = null,
  io = {},
}) {
  const resolved = resolveIo(io);
  const loaded = loadAfkLedger(gitCommonDir, activationId, io);
  if (!loaded.ok) return loaded;
  if (expectedHeadSha256 !== null && loaded.headSha256 !== expectedHeadSha256) {
    return fail("AFK-LEDGER-HEAD-CONFLICT");
  }
  const record = {
    schema: AFK_LEDGER_RECORD_SCHEMA,
    activationId,
    sequence: loaded.sequence + 1,
    type,
    previousHash: loaded.headSha256,
    recordedAt,
    body,
  };
  const framed = encodeAfkLedgerFrame(record);
  if (!framed.ok) return framed;
  const bytes = Buffer.concat([loaded.bytes, framed.bytes]);
  const name = generationName(record.sequence, framed.recordHash);
  const destination = join(loaded.paths.generations, name);
  const temporary = join(loaded.paths.generations, `.${name}.tmp-${randomBytes(16).toString("hex")}`);
  try {
    writeFileSync(temporary, bytes, { flag: "wx", mode: 0o600 });
    chmodSync(temporary, 0o600);
    fsyncFile(temporary);
    fault?.("after-file-fsync", { temporary, destination, record });
    linkSync(temporary, destination);
    const directoryDurability = fsyncDirectory(loaded.paths.generations, resolved);
    fault?.("after-directory-fsync", { temporary, destination, record });
    unlinkSync(temporary);
    return {
      ok: true,
      mutation: "wal",
      record,
      recordHash: framed.recordHash,
      sequence: record.sequence,
      headSha256: framed.recordHash,
      generation: destination,
      ...(directoryDurability === "unavailable" ? { directoryDurability } : {}),
    };
  } catch (error) {
    return fail("AFK-LEDGER-PUBLISH-FAILED", error?.code ?? null, existsSync(destination) ? "wal" : "none");
  }
}

function parseLock(path, io = {}) {
  const resolved = resolveIo(io);
  const parentSecure = () => resolved.assessWindowsPrivate(dirname(path)).status === "secure";
  if (!privateRegularFile(path, parentSecure, resolved)) return null;
  const raw = readFileSync(path, "utf8");
  let value;
  try { value = JSON.parse(raw); } catch { return null; }
  return raw === canonicalJsonFile(value) && validLockOwner(value) ? { value, raw } : null;
}

function createExclusiveLock(path, owner, io = {}) {
  const resolved = resolveIo(io);
  writeFileSync(path, canonicalJsonFile(owner), { flag: "wx", mode: 0o600 });
  chmodSync(path, 0o600);
  fsyncFile(path);
  return fsyncDirectory(dirname(path), resolved);
}

export function acquireAfkWriterLock({
  gitCommonDir,
  activationId,
  owner,
  inspectOwner = null,
  appendRecoveryRecord = null,
  observedAt = null,
  io = {},
}) {
  if (!validLockOwner(owner) || owner.activationId !== activationId) return fail("AFK-WRITER-OWNER-INVALID");
  let paths;
  try { paths = afkLedgerPaths(gitCommonDir, activationId); } catch { return fail("AFK-LEDGER-PATH-UNSAFE"); }
  try {
    const directoryDurability = createExclusiveLock(paths.writerLock, owner, io);
    return { ok: true, mutation: "lock", owner, path: paths.writerLock, ...(directoryDurability === "unavailable" ? { directoryDurability } : {}) };
  } catch (error) {
    if (error?.code !== "EEXIST") return fail("AFK-WRITER-LOCK-FAILED");
  }
  const existing = parseLock(paths.writerLock, io);
  if (existing === null || typeof inspectOwner !== "function" || typeof appendRecoveryRecord !== "function") {
    return fail("AFK-WRITER-LOCK-AMBIGUOUS");
  }
  const evidence = inspectOwner(existing.value);
  if (!exactKeys(evidence, ["sameHost", "sameBoot", "dead"])
    || evidence.sameHost !== true || evidence.sameBoot !== true || evidence.dead !== true
    || !isoTime(observedAt)) return fail("AFK-WRITER-LOCK-LIVE-OR-FOREIGN");
  const recoveryOwner = { ...owner, ownerNonce: sha256Raw(Buffer.from(`${owner.ownerNonce}:recovery`, "utf8")) };
  try {
    createExclusiveLock(paths.recoveryLock, recoveryOwner, io);
  } catch {
    return fail("AFK-WRITER-RECOVERY-BUSY");
  }
  try {
    const current = parseLock(paths.writerLock, io);
    if (current === null || current.raw !== existing.raw) return fail("AFK-WRITER-LOCK-RACE");
    const tombstone = appendRecoveryRecord({
      oldOwner: existing.value,
      newOwner: owner,
      evidence: { ...evidence, observedAt },
    });
    if (!tombstone || tombstone.ok !== true) return fail("AFK-WRITER-RECOVERY-UNRECORDED");
    if (readFileSync(paths.writerLock, "utf8") !== existing.raw) return fail("AFK-WRITER-LOCK-RACE", null, "wal");
    unlinkSync(paths.writerLock);
    const directoryDurability = createExclusiveLock(paths.writerLock, owner, io);
    return { ok: true, mutation: "wal+lock", recovered: existing.value, owner, path: paths.writerLock, ...(directoryDurability === "unavailable" ? { directoryDurability } : {}) };
  } catch (error) {
    return fail(error?.code?.startsWith?.("AFK-") ? error.code : "AFK-WRITER-RECOVERY-FAILED", null, "unknown");
  } finally {
    try { unlinkSync(paths.recoveryLock); } catch { /* recovery owner is the only remover */ }
  }
}

export function releaseAfkWriterLock(lock, io = {}) {
  if (!lock?.ok || !validLockOwner(lock.owner) || typeof lock.path !== "string") return fail("AFK-WRITER-LOCK-INVALID");
  const resolved = resolveIo(io);
  try {
    const current = parseLock(lock.path, io);
    if (current === null || current.value.ownerNonce !== lock.owner.ownerNonce) return fail("AFK-WRITER-LOCK-OWNER-MISMATCH");
    unlinkSync(lock.path);
    const directoryDurability = fsyncDirectory(dirname(lock.path), resolved);
    return { ok: true, mutation: "lock-release", ...(directoryDurability === "unavailable" ? { directoryDurability } : {}) };
  } catch {
    return fail("AFK-WRITER-LOCK-RELEASE-FAILED");
  }
}

export function createAfkWriterOwner({ hostId, bootId, pid, processStart, activationId, acquiredAt, nonce = randomBytes(32) }) {
  const owner = {
    schema: LOCK_SCHEMA,
    hostId,
    bootId,
    pid,
    processStart,
    activationId,
    ownerNonce: Buffer.from(nonce).toString("hex"),
    acquiredAt,
  };
  return validLockOwner(owner) ? { ok: true, owner } : fail("AFK-WRITER-OWNER-INVALID");
}
