// SPDX-License-Identifier: SUL-1.0
/**
 * Portable repository-public-safe governance event storage.
 *
 * Canonical events are individual immutable files.  `heads.json` is a
 * replaceable source-last projection and is deliberately never used as an
 * integrity authority.  This module does not implement the separate,
 * owner-authenticated restricted-machine-local profile; callers must never
 * route restricted data through this portable writer.
 */
import { mkdir, open, readFile, realpath, readdir, rename, unlink, lstat, stat } from "node:fs/promises";
import path from "node:path";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import {
  canonicalSha256,
  canonicalizeJson,
  parseStrictJson,
  sealGovernanceEvent,
  validateGovernanceEventEnvelope,
} from "./governance-event.mjs";
import { derivePoGateRepositoryFingerprint } from "./po-gate-authority.mjs";
import { discoverRepository } from "./worktree-lifecycle.mjs";

const REGISTRY_SCHEMA = "pipeline.governance-stream-registry.v1";
const HEADS_SCHEMA = "pipeline.governance-event-heads.v1";
const SHA256 = /^[a-f0-9]{64}$/u;
const EVENT_FILE = /^([1-9][0-9]*)-([A-Za-z0-9][A-Za-z0-9._:-]{0,127})\.json$/u;
const INTENT_OMITTED_FIELDS = new Set(["sequence", "previousEventDigest", "payloadDigest", "eventDigest"]);
const STREAMS = new Map([
  ["human", { origin: "human", authorityClass: "human-authority" }],
  ["agent", { origin: "agent", authorityClass: "non-authoritative" }],
  ["lifecycle", { origin: "lifecycle", authorityClass: "non-authoritative" }],
]);
const RESTRICTED_RECORD_SCHEMA = "pipeline.restricted-governance-record.v1";
const RESTRICTED_AUTHORITY = "restricted-store-operator";

export class GovernanceEventStoreError extends Error {
  constructor(code, message = "Governance event store operation failed.") {
    super(message);
    this.name = "GovernanceEventStoreError";
    this.code = code;
  }
}

function fail(code, message) { throw new GovernanceEventStoreError(code, message); }
function isRecord(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exactKeys(value, keys) { return isRecord(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); }
function repositoryPath(root, relative) {
  if (typeof relative !== "string" || relative.length === 0 || path.isAbsolute(relative)) fail("GES-PATH", "A repository-relative path is required.");
  const normalized = path.posix.normalize(relative.replaceAll("\\", "/"));
  if (normalized === "." || normalized === ".." || normalized.startsWith("../")) fail("GES-PATH", "The path escapes the repository.");
  const resolved = path.resolve(root, normalized);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) fail("GES-PATH", "The path escapes the repository.");
  return resolved;
}

async function lstatOrNull(target) {
  try { return await lstat(target); } catch (error) { if (error?.code === "ENOENT") return null; throw error; }
}

async function assertNoSymlink(target, { required = true, directory } = {}) {
  const entry = await lstatOrNull(target);
  if (!entry) {
    if (required) fail("GES-MISSING", "A required governance path is missing.");
    return null;
  }
  if (entry.isSymbolicLink()) fail("GES-SYMLINK", "Symbolic links are forbidden in governance storage.");
  if (directory === true && !entry.isDirectory()) fail("GES-NOT-DIRECTORY", "A governance directory was replaced by a non-directory.");
  if (directory === false && !entry.isFile()) fail("GES-NOT-FILE", "A governance file was replaced by a non-file.");
  return entry;
}

async function assertPhysicalRoot(repositoryRoot) {
  if (typeof repositoryRoot !== "string" || !path.isAbsolute(repositoryRoot)) fail("GES-ROOT", "repositoryRoot must be an absolute path.");
  const root = await realpath(repositoryRoot);
  await assertNoSymlink(root, { directory: true });
  let repository;
  try { repository = discoverRepository(root); } catch { fail("GES-REPOSITORY", "repositoryRoot is not a physical Git repository."); }
  return { root, fingerprint: derivePoGateRepositoryFingerprint({ gitCommonDir: repository.commonDir, primaryRoot: repository.primaryRoot }) };
}

function assertAbsoluteOutsideRepository(repositoryRoot, storeRoot) {
  if (typeof storeRoot !== "string" || !path.isAbsolute(storeRoot)) fail("GES-RESTRICTED-ROOT", "Restricted storage must use an absolute machine-local path.");
  const target = path.resolve(storeRoot);
  if (target === repositoryRoot || target.startsWith(`${repositoryRoot}${path.sep}`)) fail("GES-RESTRICTED-IN-REPOSITORY", "Restricted storage must be outside the repository and Git history.");
  return target;
}

async function assertNoSymlinkAncestry(target) {
  const parsed = path.parse(target);
  const pieces = target.slice(parsed.root.length).split(path.sep).filter(Boolean);
  let current = parsed.root;
  for (const piece of pieces) {
    current = path.join(current, piece);
    const entry = await lstatOrNull(current);
    if (entry?.isSymbolicLink()) fail("GES-SYMLINK", "Symbolic links are forbidden in governance storage.");
  }
}

async function assertRestrictedRoot(repositoryRoot, storeRoot, { create = false } = {}) {
  const target = assertAbsoluteOutsideRepository(repositoryRoot, storeRoot);
  if (create) await mkdir(target, { recursive: true, mode: 0o700 });
  await assertNoSymlinkAncestry(target);
  await assertNoSymlink(target, { directory: true });
  const metadata = await stat(target);
  if ((metadata.mode & 0o077) !== 0) fail("GES-RESTRICTED-PERMISSIONS", "Restricted storage must not grant group or other access.");
  if (typeof process.getuid === "function" && metadata.uid !== process.getuid()) fail("GES-RESTRICTED-OWNER", "Restricted storage is not owned by this operator.");
  return target;
}

function assertEncryptionKey(key) {
  if (!(key instanceof Uint8Array) || key.byteLength !== 32) fail("GES-RESTRICTED-KEY", "Restricted storage requires a 32-byte externally protected encryption key.");
  return Buffer.from(key);
}

function assertRestrictedAuthorization(authorization, repositoryFingerprint) {
  if (!exactKeys(authorization, ["authorityClass", "repositoryFingerprint"]) || authorization.authorityClass !== RESTRICTED_AUTHORITY
    || authorization.repositoryFingerprint !== repositoryFingerprint) fail("GES-RESTRICTED-AUTHORIZATION", "A repository-bound restricted-store operator authorization is required.");
}

function restrictedRecordPath(storeRoot, recordId) {
  if (typeof recordId !== "string" || !/^[a-f0-9]{32}$/u.test(recordId)) fail("GES-RESTRICTED-ID", "A restricted record identifier is invalid.");
  return path.join(storeRoot, "records", `${recordId}.json`);
}

async function restrictedRecordsRoot(storeRoot) {
  const recordsRoot = path.join(storeRoot, "records");
  await mkdir(recordsRoot, { recursive: true, mode: 0o700 });
  await assertNoSymlink(recordsRoot, { directory: true });
  const metadata = await stat(recordsRoot);
  if ((metadata.mode & 0o077) !== 0) fail("GES-RESTRICTED-PERMISSIONS", "Restricted records must not grant group or other access.");
  return recordsRoot;
}

async function findRestrictedIdempotency(restrictedRoot, key, idempotencyKey) {
  const recordsRoot = await restrictedRecordsRoot(restrictedRoot);
  const entries = await readdir(recordsRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isSymbolicLink()) fail("GES-SYMLINK", "Symbolic links are forbidden in governance storage.");
    if (!entry.isFile() || !/^[a-f0-9]{32}\.json$/u.test(entry.name)) fail("GES-RESTRICTED-PATH", "Restricted storage contains an unsafe path.");
    const recordId = entry.name.slice(0, -5);
    const record = parseStrictJson(await readFile(restrictedRecordPath(restrictedRoot, recordId)));
    let event;
    try { event = decryptRestrictedRecord(record, key); } catch (error) {
      if (error?.code === "GES-RESTRICTED-EXPIRED") continue;
      throw error;
    }
    if (event.idempotencyKey === idempotencyKey) return { recordId, record, event };
  }
  return null;
}

function encryptRestrictedRecord(event, key, keyGeneration, expiresAtEpochMs) {
  if (typeof keyGeneration !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(keyGeneration)) fail("GES-RESTRICTED-KEY-GENERATION", "A non-secret key generation identifier is required.");
  if (!Number.isSafeInteger(expiresAtEpochMs) || expiresAtEpochMs <= Date.now()) fail("GES-RESTRICTED-EXPIRY", "Restricted records require a future integer expiry.");
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const ciphertext = Buffer.concat([cipher.update(canonicalizeJson(event), "utf8"), cipher.final()]);
  return {
    schema: RESTRICTED_RECORD_SCHEMA,
    algorithm: "aes-256-gcm",
    keyGeneration,
    expiresAtEpochMs,
    nonce: nonce.toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
  };
}

function decryptRestrictedRecord(record, key) {
  if (!exactKeys(record, ["schema", "algorithm", "keyGeneration", "expiresAtEpochMs", "nonce", "ciphertext", "tag"])
    || record.schema !== RESTRICTED_RECORD_SCHEMA || record.algorithm !== "aes-256-gcm" || !Number.isSafeInteger(record.expiresAtEpochMs)) fail("GES-RESTRICTED-RECORD", "The restricted record shape is invalid.");
  if (record.expiresAtEpochMs <= Date.now()) fail("GES-RESTRICTED-EXPIRED", "The restricted record has expired.");
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(record.nonce, "base64url"));
    decipher.setAuthTag(Buffer.from(record.tag, "base64url"));
    return parseStrictJson(Buffer.concat([decipher.update(Buffer.from(record.ciphertext, "base64url")), decipher.final()]));
  } catch (error) {
    if (error instanceof GovernanceEventStoreError) throw error;
    fail("GES-RESTRICTED-DECRYPT", "Restricted record decryption or authentication failed.");
  }
}

async function ensureSafeDirectory(root, relative) {
  const pieces = relative.split("/");
  let current = root;
  for (const piece of pieces) {
    current = repositoryPath(root, path.posix.join(path.relative(root, current).replaceAll(path.sep, "/"), piece));
    const existing = await lstatOrNull(current);
    if (!existing) await mkdir(current, { mode: 0o755 });
    await assertNoSymlink(current, { directory: true });
  }
  return current;
}

function validateRegistry(registry) {
  const keys = ["schema", "repositoryFingerprint", "canonicalization", "digestAlgorithm", "eventDigestDomain", "storageRoot", "streams"];
  if (!exactKeys(registry, keys) || registry.schema !== REGISTRY_SCHEMA || !SHA256.test(registry.repositoryFingerprint)
    || registry.canonicalization !== "RFC8785" || registry.digestAlgorithm !== "sha-256"
    || registry.eventDigestDomain !== "pipeline.governance-event.v1\0" || registry.storageRoot !== "governance/events"
    || !Array.isArray(registry.streams) || registry.streams.length !== 3) fail("GES-REGISTRY", "The stream registry is invalid.");
  const seen = new Set();
  for (const stream of registry.streams) {
    const expected = STREAMS.get(stream?.streamId);
    if (!expected || seen.has(stream.streamId) || !exactKeys(stream, ["streamId", "origin", "authorityClass", "relativeRoot", "storageProfile", "genesis"])
      || stream.origin !== expected.origin || stream.authorityClass !== expected.authorityClass || stream.relativeRoot !== stream.streamId
      || stream.storageProfile !== "repository-public-safe" || !exactKeys(stream.genesis, ["sequence", "eventDigest"])
      || stream.genesis.sequence !== 0 || stream.genesis.eventDigest !== null) fail("GES-REGISTRY", "The stream registry is invalid.");
    seen.add(stream.streamId);
  }
  return registry;
}

async function loadRegistry(root, registryPath = "governance/events/registry.json") {
  const target = repositoryPath(root, registryPath);
  await assertNoSymlinkAncestry(target);
  await assertNoSymlink(target, { directory: false });
  let parsed;
  try { parsed = parseStrictJson(await readFile(target)); } catch (error) {
    if (error instanceof GovernanceEventStoreError) throw error;
    fail("GES-REGISTRY", "The stream registry is not strict JSON.");
  }
  return { registry: validateRegistry(parsed), path: target };
}

function streamFor(registry, streamId) {
  const stream = registry.streams.find((entry) => entry.streamId === streamId);
  if (!stream) fail("GES-STREAM", "The stream is not registered.");
  return stream;
}

function assertIntent(intent, stream, repositoryFingerprint) {
  if (!isRecord(intent)) fail("GES-INTENT", "A closed event intent is required.");
  if ([...INTENT_OMITTED_FIELDS].some((field) => Object.hasOwn(intent, field))) fail("GES-INTENT-FIELDS", "Writer-owned envelope fields must be omitted from an intent.");
  const candidate = {
    ...intent,
    sequence: 1,
    previousEventDigest: null,
    payloadDigest: "0".repeat(64),
    eventDigest: "0".repeat(64),
  };
  const validation = validateGovernanceEventEnvelope(candidate, { verifyDigests: false });
  if (!validation.valid || candidate.repositoryFingerprint !== repositoryFingerprint || candidate.streamId !== stream.streamId
    || candidate.origin !== stream.origin || candidate.authorityClass !== stream.authorityClass
    || candidate.storageProfile !== "repository-public-safe") fail("GES-INTENT", "The event intent is invalid for this repository stream.");
  if (!isRecord(candidate.candidate) || typeof candidate.candidate.commit !== "string" || typeof candidate.candidate.tree !== "string") {
    fail("GES-CANDIDATE", "Portable append requires an exact candidate commit and tree for its receipt checkpoint.");
  }
  return candidate;
}

function eventIntentDigest(event) {
  const intent = Object.fromEntries(Object.entries(event).filter(([key]) => !INTENT_OMITTED_FIELDS.has(key)));
  return canonicalSha256(intent);
}

function receipt(event, outcome, requestDigest) {
  const eventPath = `governance/events/${event.streamId}/${event.sequence}-${event.eventId}.json`;
  return Object.freeze({
    schema: "pipeline.governance-event-receipt.v1",
    operation: "append",
    outcome,
    repositoryFingerprint: event.repositoryFingerprint,
    eventId: event.eventId,
    idempotencyKey: event.idempotencyKey,
    requestDigest,
    eventDigest: event.eventDigest,
    eventPath,
    readbackDigest: canonicalSha256(event),
    checkpoint: Object.freeze({
      repositoryFingerprint: event.repositoryFingerprint,
      streamId: event.streamId,
      sequence: event.sequence,
      eventDigest: event.eventDigest,
      candidateCommit: event.candidate.commit,
      candidateTree: event.candidate.tree,
    }),
  });
}

async function readEvent(file) {
  await assertNoSymlink(file, { directory: false });
  let bytes;
  let value;
  try {
    bytes = await readFile(file);
    value = parseStrictJson(bytes);
  } catch { fail("GES-EVENT-JSON", "A canonical event is not strict JSON."); }
  const validation = validateGovernanceEventEnvelope(value);
  if (!validation.valid) fail("GES-EVENT-INVALID", "A canonical event failed envelope validation.");
  if (Buffer.from(`${canonicalizeJson(value)}\n`, "utf8").compare(bytes) !== 0) fail("GES-NONCANONICAL", "A canonical event does not contain exact canonical bytes.");
  return value;
}

async function scanStream(root, registry, streamId) {
  const stream = streamFor(registry, streamId);
  const streamRoot = repositoryPath(root, `${registry.storageRoot}/${stream.relativeRoot}`);
  await assertNoSymlinkAncestry(streamRoot);
  const entry = await lstatOrNull(streamRoot);
  if (!entry) return { stream, streamRoot, events: [] };
  await assertNoSymlink(streamRoot, { directory: true });
  const entries = await readdir(streamRoot, { withFileTypes: true });
  const bySequence = new Map();
  const byIdempotency = new Map();
  const events = [];
  for (const entry of entries) {
    if (entry.name === ".lock") continue;
    if (entry.isSymbolicLink()) fail("GES-SYMLINK", "Symbolic links are forbidden in governance storage.");
    const match = EVENT_FILE.exec(entry.name);
    if (!match || !entry.isFile()) fail("GES-UNSAFE-PATH", "The stream contains an unsafe or unrecognized path.");
    const event = await readEvent(repositoryPath(root, `${registry.storageRoot}/${stream.relativeRoot}/${entry.name}`));
    const sequence = Number(match[1]);
    if (event.sequence !== sequence || event.eventId !== match[2] || event.streamId !== streamId
      || event.repositoryFingerprint !== registry.repositoryFingerprint) fail("GES-EVENT-PATH", "Event path and envelope binding disagree.");
    if (bySequence.has(sequence)) fail("GES-FORK", "Multiple records claim one sequence.");
    if (byIdempotency.has(event.idempotencyKey)) {
      const prior = byIdempotency.get(event.idempotencyKey);
      if (prior.eventDigest !== event.eventDigest) fail("GES-IDEMPOTENCY-CONFLICT", "One idempotency key identifies conflicting records.");
      fail("GES-DUPLICATE", "Duplicate canonical records are forbidden.");
    }
    bySequence.set(sequence, event); byIdempotency.set(event.idempotencyKey, event); events.push(event);
  }
  events.sort((left, right) => left.sequence - right.sequence || left.eventId.localeCompare(right.eventId));
  let previous = null;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (event.sequence !== index + 1 || event.previousEventDigest !== previous) fail("GES-CHAIN", "The canonical stream is not a contiguous hash chain.");
    previous = event.eventDigest;
  }
  return { stream, streamRoot, events };
}

async function writeAtomic(target, bytes) {
  const directory = path.dirname(target);
  await assertNoSymlink(directory, { directory: true });
  const temporary = path.join(directory, `.${path.basename(target)}.${randomBytes(12).toString("hex")}.tmp`);
  let handle;
  try {
    handle = await open(temporary, "wx", 0o644);
    await handle.writeFile(bytes, "utf8");
    await handle.sync();
    await handle.close(); handle = null;
    await rename(temporary, target);
    const directoryHandle = await open(directory, "r");
    try { await directoryHandle.sync(); } finally { await directoryHandle.close(); }
  } catch (error) {
    if (handle) await handle.close().catch(() => {});
    await unlink(temporary).catch(() => {});
    throw error;
  }
}

async function removeLock(lock) {
  // Node's rmdir is intentionally imported lazily only on the uncommon path.
  const { rmdir } = await import("node:fs/promises");
  await rmdir(lock).catch((error) => { if (error?.code !== "ENOENT") throw error; });
}

async function withExclusiveStreamLock(streamRoot, operation) {
  const lock = path.join(streamRoot, ".lock");
  try { await mkdir(lock, { mode: 0o700 }); } catch (error) {
    if (error?.code === "EEXIST") fail("GES-LOCKED", "The stream is already being written.");
    throw error;
  }
  try { return await operation(); } finally { await removeLock(lock); }
}

function checkpointMatches(event, checkpoint) {
  return checkpoint && exactKeys(checkpoint, ["repositoryFingerprint", "streamId", "sequence", "eventDigest", "candidateCommit", "candidateTree"])
    && event.repositoryFingerprint === checkpoint.repositoryFingerprint && event.streamId === checkpoint.streamId
    && event.sequence === checkpoint.sequence && event.eventDigest === checkpoint.eventDigest
    && isRecord(event.candidate) && event.candidate.commit === checkpoint.candidateCommit && event.candidate.tree === checkpoint.candidateTree;
}

async function writeHeads(root, registry, streamId, events) {
  const headsPath = repositoryPath(root, `${registry.storageRoot}/heads.json`);
  const current = await lstatOrNull(headsPath);
  if (current) await assertNoSymlink(headsPath, { directory: false });
  const head = events.at(-1) ?? null;
  const projection = {
    schema: HEADS_SCHEMA,
    repositoryFingerprint: registry.repositoryFingerprint,
    streams: Object.fromEntries(registry.streams.map((stream) => [stream.streamId, stream.streamId === streamId ? {
      sequence: head?.sequence ?? 0,
      eventDigest: head?.eventDigest ?? null,
    } : { sequence: 0, eventDigest: null }])),
  };
  // Preserve other stream heads only after strict parsing. They remain hints,
  // but carrying valid hints avoids needless projection loss.
  if (current) {
    try {
      const previous = parseStrictJson(await readFile(headsPath));
      if (previous?.schema === HEADS_SCHEMA && previous.repositoryFingerprint === registry.repositoryFingerprint && isRecord(previous.streams)) {
        for (const stream of registry.streams) if (stream.streamId !== streamId && isRecord(previous.streams[stream.streamId])) projection.streams[stream.streamId] = previous.streams[stream.streamId];
      }
    } catch { /* A corrupt projection is replaceable and intentionally rebuilt. */ }
  }
  await writeAtomic(headsPath, `${canonicalizeJson(projection)}\n`);
}

/** Read and validate the closed portable stream registry. */
export async function loadGovernanceEventRegistry({ repositoryRoot, registryPath } = {}) {
  const { root } = await assertPhysicalRoot(repositoryRoot);
  return (await loadRegistry(root, registryPath)).registry;
}

/**
 * Append one event intent. Writer-owned sequence/digests must be omitted from
 * `intent`; the returned receipt exposes only public metadata and checkpoint.
 */
export async function appendPortableGovernanceEvent({ repositoryRoot, registryPath, repositoryFingerprint, intent } = {}) {
  const { root, fingerprint } = await assertPhysicalRoot(repositoryRoot);
  const { registry } = await loadRegistry(root, registryPath);
  if (repositoryFingerprint !== fingerprint || registry.repositoryFingerprint !== fingerprint) fail("GES-CROSS-REPOSITORY", "The expected repository fingerprint does not match the physical repository.");
  const streamId = intent?.streamId;
  const stream = streamFor(registry, streamId);
  const template = assertIntent(intent, stream, repositoryFingerprint);
  const streamRoot = await ensureSafeDirectory(root, `${registry.storageRoot}/${stream.relativeRoot}`);
  return withExclusiveStreamLock(streamRoot, async () => {
    const scanned = await scanStream(root, registry, streamId);
    const existing = scanned.events.find((event) => event.idempotencyKey === template.idempotencyKey);
    if (existing) {
      if (eventIntentDigest(existing) !== canonicalSha256(intent)) fail("GES-IDEMPOTENCY-CONFLICT", "Idempotency replay conflicts with the committed event.");
      return receipt(existing, "idempotent-replay", canonicalSha256(intent));
    }
    const previous = scanned.events.at(-1) ?? null;
    const event = sealGovernanceEvent({ ...template, sequence: (previous?.sequence ?? 0) + 1, previousEventDigest: previous?.eventDigest ?? null });
    const filename = `${event.sequence}-${event.eventId}.json`;
    const target = repositoryPath(root, `${registry.storageRoot}/${stream.relativeRoot}/${filename}`);
    if (await lstatOrNull(target)) fail("GES-EVENT-COLLISION", "The allocated canonical event path already exists.");
    await writeAtomic(target, `${canonicalizeJson(event)}\n`);
    const readback = await readEvent(target);
    if (readback.eventDigest !== event.eventDigest || readback.previousEventDigest !== event.previousEventDigest) fail("GES-READBACK", "Published event readback differs from the sealed event.");
    await writeHeads(root, registry, streamId, [...scanned.events, readback]);
    return receipt(readback, "appended", canonicalSha256(intent));
  });
}

/** Offline integrity verification. Without an independent checkpoint completeness remains unknown. */
export async function verifyPortableGovernanceStream({ repositoryRoot, registryPath, repositoryFingerprint, streamId, checkpoint } = {}) {
  const { root, fingerprint } = await assertPhysicalRoot(repositoryRoot);
  const { registry } = await loadRegistry(root, registryPath);
  if (repositoryFingerprint !== fingerprint || registry.repositoryFingerprint !== fingerprint) fail("GES-CROSS-REPOSITORY", "The expected repository fingerprint does not match the physical repository.");
  const scanned = await scanStream(root, registry, streamId);
  if (!checkpoint) return Object.freeze({ integrity: "prefix-valid", completeness: "unknown", streamId, eventCount: scanned.events.length });
  const witness = scanned.events.find((event) => event.sequence === checkpoint.sequence);
  if (!witness || !checkpointMatches(witness, checkpoint)) fail("GES-CHECKPOINT", "The retained checkpoint is not present in this stream.");
  if (witness.sequence !== scanned.events.at(-1)?.sequence) return Object.freeze({ integrity: "prefix-valid", completeness: "unknown", streamId, eventCount: witness.sequence, checkpoint: Object.freeze({ ...checkpoint }) });
  return Object.freeze({ integrity: "valid", completeness: "verified", streamId, eventCount: scanned.events.length, checkpoint: Object.freeze({ ...checkpoint }) });
}

/** Query is a projection boundary: validation happens before any event is returned. */
export async function queryPortableGovernanceStream({ repositoryRoot, registryPath, repositoryFingerprint, streamId, checkpoint } = {}) {
  const verification = await verifyPortableGovernanceStream({ repositoryRoot, registryPath, repositoryFingerprint, streamId, checkpoint });
  const { root } = await assertPhysicalRoot(repositoryRoot);
  const { registry } = await loadRegistry(root, registryPath);
  const scanned = await scanStream(root, registry, streamId);
  const limit = verification.completeness === "verified" ? scanned.events.length : checkpoint?.sequence ?? scanned.events.length;
  return Object.freeze({ ...verification, events: Object.freeze(scanned.events.slice(0, limit).map((event) => Object.freeze({ ...event }))) });
}

/** Rebuild only the replaceable heads projection from an already valid chain. */
export async function recoverPortableGovernanceProjection({ repositoryRoot, registryPath, repositoryFingerprint, streamId, checkpoint } = {}) {
  const verification = await verifyPortableGovernanceStream({ repositoryRoot, registryPath, repositoryFingerprint, streamId, checkpoint });
  if (verification.integrity !== "valid") fail("GES-RECOVERY-CHECKPOINT", "Projection recovery requires a retained checkpoint.");
  const { root } = await assertPhysicalRoot(repositoryRoot);
  const { registry } = await loadRegistry(root, registryPath);
  const scanned = await scanStream(root, registry, streamId);
  const streamRoot = await ensureSafeDirectory(root, `${registry.storageRoot}/${streamId}`);
  return withExclusiveStreamLock(streamRoot, async () => {
    const rechecked = await scanStream(root, registry, streamId);
    await writeHeads(root, registry, streamId, rechecked.events);
    return Object.freeze({ status: "projection-rebuilt", streamId, eventCount: rechecked.events.length, checkpoint: verification.checkpoint });
  });
}

/**
 * Store one complete restricted event outside the repository.  The caller owns
 * key protection; no key, event ID, digest, or correlator is copied to the
 * portable tree or returned in the operational receipt.
 */
export async function putRestrictedGovernanceEvent({ repositoryRoot, storeRoot, repositoryFingerprint, authorization, key, keyGeneration, expiresAtEpochMs, event } = {}) {
  const { root } = await assertPhysicalRoot(repositoryRoot);
  assertRestrictedAuthorization(authorization, repositoryFingerprint);
  const restrictedRoot = await assertRestrictedRoot(root, storeRoot, { create: true });
  await restrictedRecordsRoot(restrictedRoot);
  const encryptionKey = assertEncryptionKey(key);
  const validation = validateGovernanceEventEnvelope(event);
  if (!validation.valid || event.repositoryFingerprint !== repositoryFingerprint || event.storageProfile !== "restricted-machine-local"
    || event.classification !== "restricted" || event.retentionCompatibility !== "machine-local-expiring") fail("GES-RESTRICTED-EVENT", "Only a valid restricted envelope may enter machine-local storage.");
  const existing = await findRestrictedIdempotency(restrictedRoot, encryptionKey, event.idempotencyKey);
  if (existing) {
    if (existing.event.eventDigest !== event.eventDigest) fail("GES-IDEMPOTENCY-CONFLICT", "Idempotency replay conflicts with the existing restricted event.");
    return Object.freeze({ status: "replayed", recordId: existing.recordId, expiresAtEpochMs: existing.record.expiresAtEpochMs, keyGeneration: existing.record.keyGeneration });
  }
  const recordId = randomBytes(16).toString("hex");
  const record = encryptRestrictedRecord(event, encryptionKey, keyGeneration, expiresAtEpochMs);
  const target = restrictedRecordPath(restrictedRoot, recordId);
  await writeAtomic(target, `${canonicalizeJson(record)}\n`);
  await assertNoSymlink(target, { directory: false });
  const persisted = parseStrictJson(await readFile(target));
  if (canonicalSha256(persisted) !== canonicalSha256(record)) fail("GES-RESTRICTED-READBACK", "Restricted record readback differs from the encrypted postimage.");
  return Object.freeze({ status: "stored", recordId, expiresAtEpochMs, keyGeneration });
}

/** Read one restricted event only with a repository-bound privileged authorization and its external key. */
export async function queryRestrictedGovernanceEvent({ repositoryRoot, storeRoot, repositoryFingerprint, authorization, key, recordId } = {}) {
  const { root } = await assertPhysicalRoot(repositoryRoot);
  assertRestrictedAuthorization(authorization, repositoryFingerprint);
  const restrictedRoot = await assertRestrictedRoot(root, storeRoot);
  const target = restrictedRecordPath(restrictedRoot, recordId);
  await assertNoSymlink(target, { directory: false });
  let record;
  try { record = parseStrictJson(await readFile(target)); } catch { fail("GES-RESTRICTED-RECORD", "The restricted record is not strict JSON."); }
  const event = decryptRestrictedRecord(record, assertEncryptionKey(key));
  const validation = validateGovernanceEventEnvelope(event);
  if (!validation.valid || event.repositoryFingerprint !== repositoryFingerprint || event.storageProfile !== "restricted-machine-local") fail("GES-RESTRICTED-EVENT", "The decrypted restricted event is invalid.");
  return Object.freeze({ event: Object.freeze({ ...event }), expiresAtEpochMs: record.expiresAtEpochMs, keyGeneration: record.keyGeneration });
}

/**
 * Erase one restricted ciphertext after exact encrypted-preimage binding. The
 * response deliberately proves only active-store absence, never backups or
 * unrelated key copies.
 */
export async function eraseRestrictedGovernanceEvent({ repositoryRoot, storeRoot, repositoryFingerprint, authorization, recordId, expectedRecordDigest } = {}) {
  const { root } = await assertPhysicalRoot(repositoryRoot);
  assertRestrictedAuthorization(authorization, repositoryFingerprint);
  const restrictedRoot = await assertRestrictedRoot(root, storeRoot);
  const target = restrictedRecordPath(restrictedRoot, recordId);
  await assertNoSymlink(target, { directory: false });
  const record = parseStrictJson(await readFile(target));
  if (!SHA256.test(expectedRecordDigest) || canonicalSha256(record) !== expectedRecordDigest) fail("GES-RESTRICTED-PREIMAGE", "The restricted erase preimage does not match.");
  await unlink(target);
  if (await lstatOrNull(target)) fail("GES-RESTRICTED-ERASE", "Restricted ciphertext remains in the active store.");
  return Object.freeze({ status: "erased-active-store", recordId, preimageDigest: expectedRecordDigest, backupDisclosure: "unknown" });
}
