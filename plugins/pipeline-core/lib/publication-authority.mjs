// SPDX-License-Identifier: Apache-2.0
/**
 * Durable, local projection for one publication-bundle transaction.
 *
 * This module deliberately performs no Git/network operation.  The sanctioned
 * state writer is expected to hold its writer lock first, then call this
 * projection.  A guard may only execute a push after it receives the exact
 * `push-authorized` reference produced here.
 */
import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync, closeSync, constants, existsSync, fsyncSync, lstatSync, mkdirSync,
  openSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import {
  approvePublication, authorizePublication, closePublication, observePublication,
  preparePublication, publicationDigest, rearmPublication, startReadback,
  validatePublication,
} from "./publication-bundle.mjs";

export const PUBLICATION_AUTHORITY_SCHEMA = "pipeline.publication-authority.v1";
export const PUBLICATION_AUTHORITY_REFERENCE_SCHEMA = "pipeline.publication-authority-reference.v1";
/** The only permitted nesting order when the state writer coordinates delivery. */
export const PUBLICATION_LOCK_ORDER = Object.freeze(["pipeline-state", "publication-authority", "publication-close"]);

const HEX64 = /^[0-9a-f]{64}$/;
const RECORD_KEYS = ["schema", "transactionId", "channel", "publication", "status", "block"];
const sha256 = (value) => createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : canonical(value)).digest("hex");
const canonical = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
};
const bytes = (value) => `${JSON.stringify(value, null, 2)}\n`;

function assertKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} invalid`);
  const actual = Object.keys(value).sort(), wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) throw new Error(`${label} keys invalid`);
}
function assertTransaction(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 200) throw new Error("transactionId invalid");
}
function assertLockContext(heldLocks = []) {
  if (!Array.isArray(heldLocks) || heldLocks.length > 1 || heldLocks.some((value, index) => value !== PUBLICATION_LOCK_ORDER[index])) throw new Error("publication lock order invalid");
}
function assertContained(root, candidate) {
  const rel = relative(root, candidate);
  if (rel.startsWith("..") || isAbsolute(rel)) throw new Error("publication authority path escaped");
}
function ensureDirectoryChain(root, parts) {
  let current = root;
  for (const part of parts) {
    current = join(current, part);
    if (!existsSync(current)) mkdirSync(current, { mode: 0o700 });
    const stat = lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("publication authority directory unsafe");
  }
  return current;
}
function syncDirectory(path) {
  const fd = openSync(path, constants.O_RDONLY);
  try { fsyncSync(fd); } finally { closeSync(fd); }
}

/** A transaction id is hashed before becoming a path component. */
export function publicationAuthorityPaths(gitCommonDir, transactionId) {
  if (!isAbsolute(gitCommonDir)) throw new Error("gitCommonDir must be absolute");
  assertTransaction(transactionId);
  const common = realpathSync(gitCommonDir);
  const key = sha256(transactionId);
  const directory = resolve(common, "agent-pipeline", "publication-authority", key);
  assertContained(common, directory);
  return {
    common, transactionId, key, directory,
    state: join(directory, "state.json"),
    lock: join(directory, "writer.lock"),
  };
}

export function validatePublicationAuthority(record) {
  assertKeys(record, RECORD_KEYS, "publication authority");
  if (record.schema !== PUBLICATION_AUTHORITY_SCHEMA || !["active", "blocked"].includes(record.status)) throw new Error("publication authority invalid");
  assertTransaction(record.transactionId);
  validatePublication(record.publication);
  if (record.channel !== record.publication.channel || record.transactionId !== record.publication.transactionId) throw new Error("publication authority binding invalid");
  if (record.status === "active") {
    if (record.block !== null) throw new Error("active authority block contamination");
  } else {
    assertKeys(record.block, ["reason", "reasonDigest", "blockedAt"], "publication block");
    if (typeof record.block.reason !== "string" || !/^[a-z0-9-]{1,80}$/.test(record.block.reason) || !HEX64.test(record.block.reasonDigest ?? "") || !Number.isSafeInteger(record.block.blockedAt)) throw new Error("publication block invalid");
  }
  return true;
}

export function publicationAuthorityReference(record, rawSha256) {
  validatePublicationAuthority(record);
  if (!HEX64.test(rawSha256 ?? "")) throw new Error("publication authority raw digest invalid");
  return {
    schema: PUBLICATION_AUTHORITY_REFERENCE_SCHEMA,
    transactionId: record.transactionId,
    channel: record.channel,
    phase: record.publication.phase,
    candidateOid: record.publication.candidateOid,
    candidateTree: record.publication.candidateTree,
    destinationRef: record.publication.destinationRef,
    projectionRawSha256: rawSha256,
    publicationStateSha256: publicationDigest(record.publication),
    receiptDigest: record.publication.receiptDigest,
  };
}

function withLock(paths, heldLocks, action) {
  assertLockContext(heldLocks);
  ensureDirectoryChain(paths.common, ["agent-pipeline", "publication-authority", paths.key]);
  let fd;
  let owner = null;
  try {
    fd = openSync(paths.lock, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
    owner = `${JSON.stringify({ pid: process.pid, nonce: randomBytes(16).toString("hex") })}\n`;
    writeFileSync(fd, owner); fsyncSync(fd); closeSync(fd); fd = undefined;
    return action();
  } finally {
    if (fd !== undefined) closeSync(fd);
    if (owner !== null && existsSync(paths.lock) && readFileSync(paths.lock, "utf8") === owner) unlinkSync(paths.lock);
  }
}
function readStored(paths) {
  const stat = lstatSync(paths.state);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o600) throw new Error("publication authority state permissions invalid");
  const raw = readFileSync(paths.state);
  let record;
  try { record = JSON.parse(raw); } catch { throw new Error("publication authority state torn or invalid JSON"); }
  validatePublicationAuthority(record);
  return { record, rawDigest: sha256(raw), raw };
}
function durableReplace(paths, record) {
  const content = bytes(record);
  const temporary = join(dirname(paths.state), `.state.${process.pid}.${randomBytes(12).toString("hex")}.tmp`);
  try {
    const fd = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
    try { writeFileSync(fd, content); fsyncSync(fd); } finally { closeSync(fd); }
    renameSync(temporary, paths.state); chmodSync(paths.state, 0o600); syncDirectory(dirname(paths.state));
    return sha256(content);
  } catch (error) {
    if (existsSync(temporary)) unlinkSync(temporary);
    throw error;
  }
}
function result(paths, record, rawDigest, written) {
  return { path: paths.state, record, rawDigest, reference: publicationAuthorityReference(record, rawDigest), written };
}
function requireCurrent(paths, expectedRawSha256, channel) {
  const current = readStored(paths);
  if (current.rawDigest !== expectedRawSha256) throw new Error("stale publication authority raw CAS");
  if (current.record.channel !== channel) throw new Error("publication authority channel substitution");
  if (current.record.status !== "active") throw new Error("publication authority blocked");
  return current;
}
function transition({ gitCommonDir, transactionId, channel, expectedRawSha256, heldLocks = [] }, action) {
  const paths = publicationAuthorityPaths(gitCommonDir, transactionId);
  return withLock(paths, heldLocks, () => {
    const current = requireCurrent(paths, expectedRawSha256, channel);
    const publication = action(current.record.publication);
    const record = { ...current.record, publication };
    validatePublicationAuthority(record);
    const rawDigest = durableReplace(paths, record);
    return result(paths, record, rawDigest, true);
  });
}

export function preparePublicationAuthority({ gitCommonDir, input, expectedRawSha256 = null, heldLocks = [] }) {
  const publication = preparePublication(input);
  const paths = publicationAuthorityPaths(gitCommonDir, publication.transactionId);
  return withLock(paths, heldLocks, () => {
    if (existsSync(paths.state)) {
      const current = readStored(paths);
      if (expectedRawSha256 !== current.rawDigest) throw new Error("stale publication authority raw CAS");
      if (canonical(current.record.publication) === canonical(publication) && current.record.status === "active") return result(paths, current.record, current.rawDigest, false);
      throw new Error("publication authority transaction replay");
    }
    if (expectedRawSha256 !== null) throw new Error("publication authority missing for CAS");
    const record = { schema: PUBLICATION_AUTHORITY_SCHEMA, transactionId: publication.transactionId, channel: publication.channel, publication, status: "active", block: null };
    validatePublicationAuthority(record);
    return result(paths, record, durableReplace(paths, record), true);
  });
}

export function approvePublicationAuthority(input) {
  return transition(input, (state) => approvePublication(state, pick(input, ["expectedRevision", "expectedStateSha256", "approvalId", "attribution", "approvedAt", "expiresAt"])));
}
export function authorizePublicationAuthority(input) {
  return transition(input, (state) => authorizePublication(state, pick(input, ["expectedRevision", "expectedStateSha256", "now", "command"])));
}
export function observePublicationAuthority(input) {
  return transition(input, (state) => observePublication(state, pick(input, ["expectedRevision", "expectedStateSha256", "observedOid", "observedAt", "status"])));
}
export function startPublicationReadback(input) {
  return transition(input, (state) => startReadback(state, pick(input, ["expectedRevision", "expectedStateSha256", "repositoryKind", "alternatesDisabled", "destinationRef"])));
}
export function closePublicationAuthority(input) {
  return transition(input, (state) => closePublication(state, pick(input, ["expectedRevision", "expectedStateSha256", "fetchedRef", "fetchedOid", "fetchedTree", "completedAt"])));
}
export function rearmPublicationAuthority(input) {
  return transition(input, (state) => rearmPublication(state, pick(input, ["expectedRevision", "expectedStateSha256", "freshPreimageOid", "candidateDescendsFromFreshPreimage", "attended", "priorUncertaintyDigest"])));
}

/** A local, attended fail-closed stop.  It never changes the publication tuple. */
export function blockPublicationAuthority({ gitCommonDir, transactionId, channel, expectedRawSha256, expectedRevision, expectedStateSha256, reason, reasonDigest, blockedAt, heldLocks = [] }) {
  const paths = publicationAuthorityPaths(gitCommonDir, transactionId);
  return withLock(paths, heldLocks, () => {
    const current = requireCurrent(paths, expectedRawSha256, channel);
    if (current.record.publication.revision !== expectedRevision || publicationDigest(current.record.publication) !== expectedStateSha256) throw new Error("stale publication CAS");
    if (typeof reason !== "string" || !/^[a-z0-9-]{1,80}$/.test(reason) || !HEX64.test(reasonDigest ?? "") || !Number.isSafeInteger(blockedAt)) throw new Error("publication block invalid");
    const record = { ...current.record, status: "blocked", block: { reason, reasonDigest, blockedAt } };
    validatePublicationAuthority(record);
    return result(paths, record, durableReplace(paths, record), true);
  });
}

export function readPublicationAuthority({ gitCommonDir, transactionId, channel = null }) {
  const paths = publicationAuthorityPaths(gitCommonDir, transactionId);
  const current = readStored(paths);
  if (channel !== null && current.record.channel !== channel) throw new Error("publication authority channel substitution");
  return result(paths, current.record, current.rawDigest, false);
}

function pick(value, keys) {
  const result = {};
  for (const key of keys) result[key] = value[key];
  return result;
}
