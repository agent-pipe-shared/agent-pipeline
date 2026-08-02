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
import { spawn } from "node:child_process";
import path from "node:path";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import {
  canonicalSha256,
  canonicalizeJson,
  parseStrictJson,
  sealGovernanceEvent,
  validateGovernanceEventEnvelope,
} from "./governance-event.mjs";
import { derivePoGateRepositoryFingerprint } from "./po-gate-authority.mjs";
import { discoverRepository } from "./worktree-lifecycle.mjs";
import { validateHumanGovernanceDecision } from "./human-governance-decision.mjs";
import { validateLifecycleGovernanceEvent } from "./lifecycle-governance-events.mjs";
import { validateAgentDecisionEvent } from "./agent-decision-journal.mjs";

const REGISTRY_SCHEMA = "pipeline.governance-stream-registry.v1";
const HEADS_SCHEMA = "pipeline.governance-event-heads.v1";
const SHA256 = /^[a-f0-9]{64}$/u;
const EVENT_FILE = /^([1-9][0-9]*)-([A-Za-z0-9][A-Za-z0-9._:-]{0,127})\.json$/u;
const TEMPORARY_EVENT_FILE = /^\.([1-9][0-9]*-[A-Za-z0-9][A-Za-z0-9._:-]{0,127}\.json)\.[a-f0-9]{24}\.tmp$/u;
const STREAM_LOCK_GUARD_FILE = ".lock.guard";
const STREAM_LOCK_SCHEMA = "pipeline.governance-event-stream-lock.v1";
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

export function createRestrictedAuthorization({ key, repositoryFingerprint, operation, recordId = null, expectedRecordDigest = null } = {}) {
  const encryptionKey = assertEncryptionKey(key);
  if (!new Set(["put", "query", "erase", "destroy-key"]).has(operation) || (recordId !== null && !/^[a-f0-9]{32}$/u.test(recordId)) || (expectedRecordDigest !== null && !SHA256.test(expectedRecordDigest))) fail("GES-RESTRICTED-AUTHORIZATION", "Restricted authorization binding is invalid.");
  const binding = { authorityClass: RESTRICTED_AUTHORITY, repositoryFingerprint, operation, recordId, expectedRecordDigest };
  return Object.freeze({ ...binding, proof: createHmac("sha256", encryptionKey).update(canonicalizeJson(binding), "utf8").digest("hex") });
}

function assertRestrictedAuthorization(authorization, key, repositoryFingerprint, operation, recordId = null, expectedRecordDigest = null) {
  if (!exactKeys(authorization, ["authorityClass", "repositoryFingerprint", "operation", "recordId", "expectedRecordDigest", "proof"]) || authorization.authorityClass !== RESTRICTED_AUTHORITY
    || authorization.repositoryFingerprint !== repositoryFingerprint || authorization.operation !== operation || authorization.recordId !== recordId || authorization.expectedRecordDigest !== expectedRecordDigest || !SHA256.test(authorization.proof)) fail("GES-RESTRICTED-AUTHORIZATION", "Restricted authorization binding is invalid.");
  const expected = createRestrictedAuthorization({ key, repositoryFingerprint, operation, recordId, expectedRecordDigest }).proof;
  if (!timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(authorization.proof, "hex"))) fail("GES-RESTRICTED-AUTHORIZATION", "Restricted authorization proof is invalid.");
}

function restrictedRecordPath(storeRoot, recordId) {
  if (typeof recordId !== "string" || !/^[a-f0-9]{32}$/u.test(recordId)) fail("GES-RESTRICTED-ID", "A restricted record identifier is invalid.");
  return path.join(storeRoot, "records", `${recordId}.json`);
}

async function restrictedRecordsRoot(storeRoot, { create = true } = {}) {
  const recordsRoot = path.join(storeRoot, "records");
  if (create) await mkdir(recordsRoot, { recursive: true, mode: 0o700 });
  await assertNoSymlink(recordsRoot, { directory: true });
  const metadata = await stat(recordsRoot);
  if ((metadata.mode & 0o077) !== 0) fail("GES-RESTRICTED-PERMISSIONS", "Restricted records must not grant group or other access.");
  return recordsRoot;
}

async function restrictedAuxiliaryRoot(storeRoot, name) {
  const target = path.join(storeRoot, name);
  await mkdir(target, { recursive: true, mode: 0o700 });
  await assertNoSymlink(target, { directory: true });
  const metadata = await stat(target);
  if ((metadata.mode & 0o077) !== 0) fail("GES-RESTRICTED-PERMISSIONS", "Restricted auxiliary storage must not grant group or other access.");
  return target;
}

function assertRestrictedIdempotencyKey(idempotencyKey) {
  if (typeof idempotencyKey !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(idempotencyKey)) fail("GES-RESTRICTED-IDEMPOTENCY", "Restricted mutations require a closed idempotency key.");
  return idempotencyKey;
}

function rawSha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }

async function readRestrictedRecord(storeRoot, recordId) {
  const target = restrictedRecordPath(storeRoot, recordId);
  await assertNoSymlink(target, { directory: false });
  let record;
  try { record = parseStrictJson(await readFile(target)); } catch { fail("GES-RESTRICTED-RECORD", "The restricted record is not strict JSON."); }
  return { target, record, digest: canonicalSha256(record) };
}

async function restrictedStatus(storeRoot) {
  const expectedRecordsRoot = path.join(storeRoot, "records");
  if (!await lstatOrNull(expectedRecordsRoot)) return { encryptedRecordCount: 0, expiredRecordCount: 0, keyGenerations: Object.freeze([]) };
  const recordsRoot = await restrictedRecordsRoot(storeRoot, { create: false });
  const entries = await readdir(recordsRoot, { withFileTypes: true });
  const keyGenerations = new Map();
  let expiredRecordCount = 0;
  for (const entry of entries) {
    if (entry.isSymbolicLink()) fail("GES-SYMLINK", "Symbolic links are forbidden in governance storage.");
    if (!entry.isFile() || !/^[a-f0-9]{32}\.json$/u.test(entry.name)) fail("GES-RESTRICTED-PATH", "Restricted storage contains an unsafe path.");
    const { record } = await readRestrictedRecord(storeRoot, entry.name.slice(0, -5));
    if (!exactKeys(record, ["schema", "algorithm", "keyGeneration", "expiresAtEpochMs", "nonce", "ciphertext", "tag"]) || record.schema !== RESTRICTED_RECORD_SCHEMA || record.algorithm !== "aes-256-gcm" || typeof record.keyGeneration !== "string" || !Number.isSafeInteger(record.expiresAtEpochMs)) fail("GES-RESTRICTED-RECORD", "The restricted record shape is invalid.");
    keyGenerations.set(record.keyGeneration, (keyGenerations.get(record.keyGeneration) ?? 0) + 1);
    if (record.expiresAtEpochMs <= Date.now()) expiredRecordCount += 1;
  }
  return { encryptedRecordCount: entries.length, expiredRecordCount, keyGenerations: Object.freeze([...keyGenerations.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([keyGeneration, recordCount]) => Object.freeze({ keyGeneration, recordCount }))) };
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

async function loadCapturePolicy(root) {
  const target = repositoryPath(root, "governance/events/capture-policy.json");
  await assertNoSymlinkAncestry(target); await assertNoSymlink(target, { directory: false });
  let policy;
  try { policy = parseStrictJson(await readFile(target)); } catch { fail("GES-CAPTURE-POLICY", "Capture policy is not strict JSON."); }
  if (!exactKeys(policy, ["schema", "policyId", "revision", "defaultAction", "streams", "sanitizedReceipt"])
    || policy.schema !== "pipeline.governance-capture-policy.v1" || policy.defaultAction !== "deny" || !Array.isArray(policy.streams) || policy.streams.length !== 3) fail("GES-CAPTURE-POLICY", "Capture policy is invalid.");
  return policy;
}

function assertPortablePayload(event, policy) {
  const stream = policy.streams.find((entry) => entry?.origin === event.origin);
  if (!stream || stream.storageProfile !== "repository-public-safe" || stream.personalIdentifiability !== "prohibited" || stream.contextualIdentifiability !== "prohibited") fail("GES-CAPTURE-DENIED", "Capture policy denies this portable event.");
  if (event.origin === "human") {
    const decision = validateHumanGovernanceDecision(event.payload);
    if (decision.scope.repositoryFingerprint !== event.repositoryFingerprint || decision.scope.candidate.commit !== event.candidate.commit || decision.scope.candidate.tree !== event.candidate.tree || event.eventType !== `human.${decision.event}`) fail("GES-PAYLOAD-SCHEMA", "Human decision payload does not bind its envelope.");
    if (typeof event.policy.capturePolicyDigest !== "string" || event.policy.capturePolicyDigest !== canonicalSha256(policy)) fail("GES-CAPTURE-POLICY-BINDING", "Event does not bind the effective capture policy.");
    return;
  }
  if (event.origin === "lifecycle") {
    let lifecycle;
    try { lifecycle = validateLifecycleGovernanceEvent(event.payload); }
    catch { fail("GES-PAYLOAD-SCHEMA", "Lifecycle payload is not closed or does not meet its schema."); }
    if (lifecycle.candidate.commit !== event.candidate.commit || lifecycle.candidate.tree !== event.candidate.tree
      || lifecycle.correlation.packageId !== event.correlation.packageId
      || event.eventType !== `lifecycle.${lifecycle.kind}`) fail("GES-PAYLOAD-SCHEMA", "Lifecycle payload does not bind its envelope.");
    if (typeof event.policy.capturePolicyDigest !== "string" || event.policy.capturePolicyDigest !== canonicalSha256(policy)) fail("GES-CAPTURE-POLICY-BINDING", "Event does not bind the effective capture policy.");
    return;
  }
  if (event.origin === "agent") {
    let journal;
    try { journal = validateAgentDecisionEvent(event.payload); }
    catch { fail("GES-PAYLOAD-SCHEMA", "Agent decision payload is not closed or valid."); }
    if (journal.candidateDigest !== canonicalSha256(event.candidate) || event.eventType !== `agent.${journal.kind}`) fail("GES-PAYLOAD-SCHEMA", "Agent decision payload does not bind its envelope.");
    if (typeof event.policy.capturePolicyDigest !== "string" || event.policy.capturePolicyDigest !== canonicalSha256(policy)) fail("GES-CAPTURE-POLICY-BINDING", "Event does not bind the effective capture policy.");
    return;
  }
  const allowed = ["kind", "code"];
  if (!exactKeys(event.payload, allowed) || Object.values(event.payload).some((value) => typeof value !== "string" || !/^[A-Za-z0-9._:-]{1,128}$/u.test(value))) fail("GES-PAYLOAD-SCHEMA", "Portable payload is not closed or contains unsafe text.");
  if (typeof event.policy.capturePolicyDigest !== "string" || event.policy.capturePolicyDigest !== canonicalSha256(policy)) fail("GES-CAPTURE-POLICY-BINDING", "Event does not bind the effective capture policy.");
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
    // The advisory acquisition guard is deliberately non-authoritative.  It
    // serializes lock acquisition and stale-lock recovery only; a lingering
    // regular guard file must never make a committed event prefix unreadable.
    if (entry.name === STREAM_LOCK_GUARD_FILE && entry.isFile()) continue;
    // A writer publishes only after rename.  Its own unlinked temporary bytes
    // are never authority and must not make a valid committed prefix unreadable.
    if (TEMPORARY_EVENT_FILE.test(entry.name) && entry.isFile()) continue;
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
  await unlink(lock).catch((error) => { if (error?.code !== "ENOENT") throw error; });
}

async function isRecoverableDeadLock(lock) {
  const entry = await lstatOrNull(lock);
  if (!entry || !entry.isFile()) return false;
  let owner;
  try { owner = parseStrictJson(await readFile(lock)); } catch { return false; }
  if (!exactKeys(owner, ["schema", "pid"]) || owner.schema !== STREAM_LOCK_SCHEMA || !Number.isInteger(owner.pid) || owner.pid < 1) return false;
  try { process.kill(owner.pid, 0); return false; }
  catch (error) { return error?.code === "ESRCH"; }
}

/**
 * Hold a host advisory lock only while inspecting/reclaiming `.lock` or
 * creating a replacement.  POSIX releases it if this process crashes, so a
 * dead recovery owner cannot strand the stream.  Every stream acquirer uses
 * this same guard; therefore a dead `.lock` can be unlinked only while no
 * competing acquirer can replace it.
 */
async function acquireStreamLockGuard(lock) {
  const guard = path.join(path.dirname(lock), STREAM_LOCK_GUARD_FILE);
  const entry = await lstatOrNull(guard);
  if (entry && (!entry.isFile() || entry.isSymbolicLink())) fail("GES-UNSAFE-PATH", "The stream contains an unsafe lock-guard path.");
  const command = nativeStreamLockGuardCommand(guard);
  return new Promise((resolve, reject) => {
    const child = spawn(command.file, command.args, { stdio: ["pipe", "pipe", "ignore"] });
    let ready = false;
    let output = "";
    let settled = false;
    const rejectOnce = (error) => { if (!settled) { settled = true; reject(error); } };
    const waitForExit = () => new Promise((done) => child.once("exit", () => done()));
    child.once("error", (error) => rejectOnce(new GovernanceEventStoreError("GES-LOCK-RUNTIME", error.message)));
    child.stdout.on("data", (chunk) => {
      output += chunk.toString("utf8");
      if (!ready && output.includes("ready\n")) {
        ready = true;
        settled = true;
        resolve(Object.freeze({ release: async () => { const exited = waitForExit(); child.kill(); await exited; } }));
      }
    });
    child.once("exit", (code) => {
      if (!ready) rejectOnce(new GovernanceEventStoreError(code === 1 ? "GES-LOCKED" : "GES-LOCK-RUNTIME"));
    });
  });
}

function nativeStreamLockGuardCommand(guard) {
  if (process.platform === "win32") {
    // A FileStream opened with FileShare.None is the Windows equivalent of a
    // non-blocking advisory guard.  The child owns it until stdin closes.
    const script = "$s=[System.IO.File]::Open($args[0],[System.IO.FileMode]::OpenOrCreate,[System.IO.FileAccess]::ReadWrite,[System.IO.FileShare]::None);[Console]::Out.WriteLine('ready');[Console]::In.ReadLine()|Out-Null;$s.Dispose()";
    return Object.freeze({ file: "powershell.exe", args: ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script, guard] });
  }
  if (process.platform === "darwin" || process.platform === "linux") {
    // Perl's built-in flock maps to the host POSIX advisory lock on both
    // declared Unix platforms, without depending on a Linux-only utility.
    const script = "$|=1; open my $fh, '+>>', $ARGV[0] or exit 2; flock($fh, 6) or exit 1; print \"ready\\n\"; <STDIN>; close $fh;";
    return Object.freeze({ file: "/usr/bin/perl", args: ["-e", script, guard] });
  }
  fail("GES-LOCK-PLATFORM", "The host platform has no configured native stream-lock guard.");
}

async function createStreamLock(lock) {
  let handle;
  let created = false;
  try {
    handle = await open(lock, "wx", 0o600);
    created = true;
    await handle.writeFile(`${canonicalizeJson({ schema: STREAM_LOCK_SCHEMA, pid: process.pid })}\n`, "utf8");
    await handle.sync();
    await handle.close();
  } catch (error) {
    if (handle) await handle.close().catch(() => {});
    if (created) await removeLock(lock);
    throw error;
  }
}

async function acquireStreamLock(lock) {
  const guard = await acquireStreamLockGuard(lock);
  try {
    try { await createStreamLock(lock); return; }
    catch (error) {
      if (error?.code !== "EEXIST") throw error;
    }
    // No peer can acquire or replace `.lock` while this advisory guard is
    // held.  A live owner therefore fails closed; only an observed-dead owner
    // is reclaimed, and its pathname cannot be stolen between check/unlink.
    if (!(await isRecoverableDeadLock(lock))) fail("GES-LOCKED", "The stream is already being written.");
    await removeLock(lock);
    await createStreamLock(lock);
  } finally { await guard.release(); }
}

async function removeOrphanedTemporaryEvents(streamRoot) {
  const entries = await readdir(streamRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (TEMPORARY_EVENT_FILE.test(entry.name) && entry.isFile()) await unlink(path.join(streamRoot, entry.name));
  }
}

async function withExclusiveStreamLock(streamRoot, operation) {
  const lock = path.join(streamRoot, ".lock");
  await acquireStreamLock(lock);
  try {
    await removeOrphanedTemporaryEvents(streamRoot);
    return await operation();
  } finally { await removeLock(lock); }
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

function assertRecoveryReceipt(value, recovery, streamId, checkpoint) {
  if (!exactKeys(value, ["schema", "idempotencyKey", "streamId", "checkpoint", "preimageDigest", "postimageDigest", "outcome"])
    || value.schema !== "pipeline.governance-event-recovery-receipt.v1" || value.idempotencyKey !== recovery.idempotencyKey
    || value.streamId !== streamId || canonicalizeJson(value.checkpoint) !== canonicalizeJson(checkpoint)
    || value.preimageDigest !== recovery.expectedHeadsDigest || value.postimageDigest !== recovery.requestedPostimageDigest
    || value.outcome !== "recovered") fail("GES-IDEMPOTENCY-CONFLICT", "Recovery idempotency key identifies a conflicting receipt.");
  return value;
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
export async function appendPortableGovernanceEvent({ repositoryRoot, registryPath, repositoryFingerprint, intent, assertAppend } = {}) {
  const { root, fingerprint } = await assertPhysicalRoot(repositoryRoot);
  const { registry } = await loadRegistry(root, registryPath);
  if (repositoryFingerprint !== fingerprint || registry.repositoryFingerprint !== fingerprint) fail("GES-CROSS-REPOSITORY", "The expected repository fingerprint does not match the physical repository.");
  const streamId = intent?.streamId;
  const stream = streamFor(registry, streamId);
  const template = assertIntent(intent, stream, repositoryFingerprint);
  assertPortablePayload(template, await loadCapturePolicy(root));
  const streamRoot = await ensureSafeDirectory(root, `${registry.storageRoot}/${stream.relativeRoot}`);
  return withExclusiveStreamLock(streamRoot, async () => {
    const scanned = await scanStream(root, registry, streamId);
    const existing = scanned.events.find((event) => event.idempotencyKey === template.idempotencyKey);
    if (existing) {
      if (eventIntentDigest(existing) !== canonicalSha256(intent)) fail("GES-IDEMPOTENCY-CONFLICT", "Idempotency replay conflicts with the committed event.");
      return receipt(existing, "idempotent-replay", canonicalSha256(intent));
    }
    // A caller may bind a domain-specific append precondition to this same
    // stream lock.  This is required for one-shot authority dispositions: a
    // separately queried grant must not be consumed twice in a race.
    if (assertAppend !== undefined) {
      if (typeof assertAppend !== "function") fail("GES-APPEND-ASSERTION", "Append assertion must be a function.");
      await assertAppend(Object.freeze(scanned.events.map((event) => Object.freeze({ ...event }))));
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
export async function recoverPortableGovernanceProjection({ repositoryRoot, registryPath, repositoryFingerprint, streamId, checkpoint, recovery } = {}) {
  if (!exactKeys(recovery, ["idempotencyKey", "expectedHeadsDigest", "requestedPostimageDigest"]) || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(recovery.idempotencyKey)
    || (recovery.expectedHeadsDigest !== null && !SHA256.test(recovery.expectedHeadsDigest)) || !SHA256.test(recovery.requestedPostimageDigest)) fail("GES-RECOVERY-REQUEST", "Recovery requires a closed idempotent preimage/postimage request.");
  const verification = await verifyPortableGovernanceStream({ repositoryRoot, registryPath, repositoryFingerprint, streamId, checkpoint });
  if (verification.integrity !== "valid") fail("GES-RECOVERY-CHECKPOINT", "Projection recovery requires a retained checkpoint.");
  const { root } = await assertPhysicalRoot(repositoryRoot);
  const { registry } = await loadRegistry(root, registryPath);
  const streamRoot = await ensureSafeDirectory(root, `${registry.storageRoot}/${streamId}`);
  return withExclusiveStreamLock(streamRoot, async () => {
    const rechecked = await scanStream(root, registry, streamId);
    const headsPath = repositoryPath(root, `${registry.storageRoot}/heads.json`);
    const receiptRoot = await ensureSafeDirectory(root, `${registry.storageRoot}/recovery`);
    const receiptPath = path.join(receiptRoot, `${recovery.idempotencyKey}.json`);
    const existingReceipt = await lstatOrNull(receiptPath);
    if (existingReceipt) {
      await assertNoSymlink(receiptPath, { directory: false });
      let receiptValue;
      try { receiptValue = parseStrictJson(await readFile(receiptPath)); } catch { fail("GES-RECOVERY-RECEIPT", "Recovery receipt is not strict JSON."); }
      const receipt = assertRecoveryReceipt(receiptValue, recovery, streamId, verification.checkpoint);
      const currentHeads = await lstatOrNull(headsPath) ? parseStrictJson(await readFile(headsPath)) : null;
      if ((currentHeads === null ? null : canonicalSha256(currentHeads)) !== receipt.postimageDigest) fail("GES-RECOVERY-READBACK", "Recovery receipt postimage is no longer present.");
      return Object.freeze({ status: "idempotent-replay", streamId, eventCount: rechecked.events.length, checkpoint: verification.checkpoint, receipt: Object.freeze(receipt) });
    }
    const existing = await lstatOrNull(headsPath) ? parseStrictJson(await readFile(headsPath)) : null;
    if ((existing === null ? null : canonicalSha256(existing)) !== recovery.expectedHeadsDigest) fail("GES-RECOVERY-PREIMAGE", "Recovery heads preimage differs from its request.");
    const journalRoot = await ensureSafeDirectory(root, `${registry.storageRoot}/recovery-journal`);
    const journalPath = path.join(journalRoot, `${recovery.idempotencyKey}.json`);
    const journal = { schema: "pipeline.governance-event-recovery-journal.v1", idempotencyKey: recovery.idempotencyKey, streamId, expectedHeadsDigest: recovery.expectedHeadsDigest, requestedPostimageDigest: recovery.requestedPostimageDigest };
    const existingJournal = await lstatOrNull(journalPath);
    if (existingJournal) {
      await assertNoSymlink(journalPath, { directory: false });
      let journalValue;
      try { journalValue = parseStrictJson(await readFile(journalPath)); } catch { fail("GES-RECOVERY-JOURNAL", "Recovery journal is not strict JSON."); }
      if (canonicalizeJson(journalValue) !== canonicalizeJson(journal)) fail("GES-IDEMPOTENCY-CONFLICT", "Recovery idempotency key identifies a conflicting journal.");
    } else await writeAtomic(journalPath, `${canonicalizeJson(journal)}\n`);
    await writeHeads(root, registry, streamId, rechecked.events);
    const rebuilt = parseStrictJson(await readFile(headsPath));
    const postimageDigest = canonicalSha256(rebuilt);
    if (postimageDigest !== recovery.requestedPostimageDigest) fail("GES-RECOVERY-POSTIMAGE", "Recovery postimage differs from its request.");
    const receipt = { schema: "pipeline.governance-event-recovery-receipt.v1", idempotencyKey: recovery.idempotencyKey, streamId, checkpoint: verification.checkpoint, preimageDigest: recovery.expectedHeadsDigest, postimageDigest, outcome: "recovered" };
    await writeAtomic(receiptPath, `${canonicalizeJson(receipt)}\n`);
    await unlink(journalPath);
    return Object.freeze({ status: "projection-rebuilt", streamId, eventCount: rechecked.events.length, checkpoint: verification.checkpoint, receipt: Object.freeze(receipt) });
  });
}

/**
 * Store one complete restricted event outside the repository.  The caller owns
 * key protection; no key, event ID, digest, or correlator is copied to the
 * portable tree or returned in the operational receipt.
 */
export async function putRestrictedGovernanceEvent({ repositoryRoot, storeRoot, repositoryFingerprint, authorization, key, keyGeneration, expiresAtEpochMs, event } = {}) {
  const { root, fingerprint } = await assertPhysicalRoot(repositoryRoot);
  if (repositoryFingerprint !== fingerprint) fail("GES-CROSS-REPOSITORY", "The expected repository fingerprint does not match the physical repository.");
  const restrictedRoot = await assertRestrictedRoot(root, storeRoot, { create: true });
  await restrictedRecordsRoot(restrictedRoot);
  const encryptionKey = assertEncryptionKey(key);
  assertRestrictedAuthorization(authorization, encryptionKey, repositoryFingerprint, "put");
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

/** Read-only planning/status boundary for the restricted operator namespace. */
export async function inspectRestrictedGovernanceStore({ repositoryRoot, storeRoot, repositoryFingerprint } = {}) {
  const { root, fingerprint } = await assertPhysicalRoot(repositoryRoot);
  if (repositoryFingerprint !== fingerprint) fail("GES-CROSS-REPOSITORY", "The expected repository fingerprint does not match the physical repository.");
  const restrictedRoot = await assertRestrictedRoot(root, storeRoot);
  return Object.freeze({ schema: "pipeline.governance-event-restricted-status.v1", repositoryFingerprint, store: "restricted-machine-local", ...(await restrictedStatus(restrictedRoot)) });
}

export async function planRestrictedGovernanceOperation({ repositoryRoot, storeRoot, repositoryFingerprint, operation, recordId = null, expectedRecordDigest = null, keyGeneration = null, expiresAtEpochMs = null, event = null, expectedKeyFileDigest = null, idempotencyKey } = {}) {
  if (!new Set(["put", "erase", "destroy-key"]).has(operation)) fail("GES-RESTRICTED-PLAN", "Restricted planning operation is invalid.");
  assertRestrictedIdempotencyKey(idempotencyKey);
  const { root, fingerprint } = await assertPhysicalRoot(repositoryRoot);
  if (repositoryFingerprint !== fingerprint) fail("GES-CROSS-REPOSITORY", "The expected repository fingerprint does not match the physical repository.");
  const restrictedRoot = await assertRestrictedRoot(root, storeRoot);
  const status = await restrictedStatus(restrictedRoot);
  if (operation === "put") {
    const validation = validateGovernanceEventEnvelope(event);
    if (!validation.valid || event.repositoryFingerprint !== repositoryFingerprint || event.storageProfile !== "restricted-machine-local"
      || event.classification !== "restricted" || event.retentionCompatibility !== "machine-local-expiring"
      || typeof keyGeneration !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(keyGeneration)
      || !Number.isSafeInteger(expiresAtEpochMs) || expiresAtEpochMs <= Date.now()) fail("GES-RESTRICTED-PLAN", "Restricted put planning requires a complete valid restricted event and future retention deadline.");
  }
  if (operation === "erase") {
    const { digest } = await readRestrictedRecord(restrictedRoot, recordId);
    if (!SHA256.test(expectedRecordDigest) || digest !== expectedRecordDigest) fail("GES-RESTRICTED-PREIMAGE", "The restricted erase preimage does not match.");
  }
  if (operation === "destroy-key") {
    if (typeof keyGeneration !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(keyGeneration) || !SHA256.test(expectedKeyFileDigest)) fail("GES-RESTRICTED-PLAN", "Key-destruction planning requires a key generation and exact key-file preimage.");
  }
  const plan = {
    schema: "pipeline.governance-event-restricted-plan.v1", operation, mutation: false, repositoryFingerprint,
    recordId, expectedRecordDigest, keyGeneration, expiresAtEpochMs, eventDigest: event?.eventDigest ?? null, expectedKeyFileDigest, idempotencyKey,
    encryptedRecordCount: status.encryptedRecordCount,
  };
  return Object.freeze({ ...plan, requestDigest: canonicalSha256(plan) });
}

/** Read one restricted event only with a repository-bound privileged authorization and its external key. */
export async function queryRestrictedGovernanceEvent({ repositoryRoot, storeRoot, repositoryFingerprint, authorization, key, recordId } = {}) {
  const { root, fingerprint } = await assertPhysicalRoot(repositoryRoot);
  if (repositoryFingerprint !== fingerprint) fail("GES-CROSS-REPOSITORY", "The expected repository fingerprint does not match the physical repository.");
  const encryptionKey = assertEncryptionKey(key);
  assertRestrictedAuthorization(authorization, encryptionKey, repositoryFingerprint, "query", recordId);
  const restrictedRoot = await assertRestrictedRoot(root, storeRoot);
  const target = restrictedRecordPath(restrictedRoot, recordId);
  await assertNoSymlink(target, { directory: false });
  let record;
  try { record = parseStrictJson(await readFile(target)); } catch { fail("GES-RESTRICTED-RECORD", "The restricted record is not strict JSON."); }
  const event = decryptRestrictedRecord(record, encryptionKey);
  const validation = validateGovernanceEventEnvelope(event);
  if (!validation.valid || event.repositoryFingerprint !== repositoryFingerprint || event.storageProfile !== "restricted-machine-local") fail("GES-RESTRICTED-EVENT", "The decrypted restricted event is invalid.");
  return Object.freeze({ event: Object.freeze({ ...event }), expiresAtEpochMs: record.expiresAtEpochMs, keyGeneration: record.keyGeneration });
}

/**
 * Erase one restricted ciphertext after exact encrypted-preimage binding. The
 * response deliberately proves only active-store absence, never backups or
 * unrelated key copies.
 */
export async function eraseRestrictedGovernanceEvent({ repositoryRoot, storeRoot, repositoryFingerprint, authorization, key, recordId, expectedRecordDigest } = {}) {
  const { root, fingerprint } = await assertPhysicalRoot(repositoryRoot);
  if (repositoryFingerprint !== fingerprint) fail("GES-CROSS-REPOSITORY", "The expected repository fingerprint does not match the physical repository.");
  const encryptionKey = assertEncryptionKey(key);
  const restrictedRoot = await assertRestrictedRoot(root, storeRoot);
  const target = restrictedRecordPath(restrictedRoot, recordId);
  await assertNoSymlink(target, { directory: false });
  const record = parseStrictJson(await readFile(target));
  if (!SHA256.test(expectedRecordDigest) || canonicalSha256(record) !== expectedRecordDigest) fail("GES-RESTRICTED-PREIMAGE", "The restricted erase preimage does not match.");
  assertRestrictedAuthorization(authorization, encryptionKey, repositoryFingerprint, "erase", recordId, expectedRecordDigest);
  await unlink(target);
  if (await lstatOrNull(target)) fail("GES-RESTRICTED-ERASE", "Restricted ciphertext remains in the active store.");
  return Object.freeze({ status: "erased-active-store", recordId, preimageDigest: expectedRecordDigest, backupDisclosure: "unknown" });
}

/**
 * Destroy exactly the caller-named local key file after an authenticated
 * preimage proof. This proves only that one active custodian file is gone; it
 * intentionally makes no claim about backups, copies, or memory remnants.
 */
export async function destroyRestrictedGovernanceKey({ repositoryRoot, storeRoot, repositoryFingerprint, authorization, key, keyGeneration, keyFile, expectedKeyFileDigest, idempotencyKey } = {}) {
  assertRestrictedIdempotencyKey(idempotencyKey);
  if (typeof keyGeneration !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(keyGeneration) || !SHA256.test(expectedKeyFileDigest)) fail("GES-RESTRICTED-DESTROY", "Key destruction requires a closed key generation and exact key-file preimage.");
  const { root, fingerprint } = await assertPhysicalRoot(repositoryRoot);
  if (repositoryFingerprint !== fingerprint) fail("GES-CROSS-REPOSITORY", "The expected repository fingerprint does not match the physical repository.");
  const restrictedRoot = await assertRestrictedRoot(root, storeRoot);
  const encryptionKey = assertEncryptionKey(key);
  assertRestrictedAuthorization(authorization, encryptionKey, repositoryFingerprint, "destroy-key", null, expectedKeyFileDigest);
  if (typeof keyFile !== "string" || !path.isAbsolute(keyFile)) fail("GES-RESTRICTED-KEY-FILE", "Key destruction requires an absolute local key file.");
  const resolvedKeyFile = path.resolve(keyFile);
  if (resolvedKeyFile === root || resolvedKeyFile.startsWith(`${root}${path.sep}`) || resolvedKeyFile === restrictedRoot || resolvedKeyFile.startsWith(`${restrictedRoot}${path.sep}`)) fail("GES-RESTRICTED-KEY-FILE", "Key material must be separately protected outside repository and restricted records.");
  await assertNoSymlinkAncestry(resolvedKeyFile);
  const receiptRoot = await restrictedAuxiliaryRoot(restrictedRoot, "receipts");
  const journalRoot = await restrictedAuxiliaryRoot(restrictedRoot, "key-destruction-journal");
  const receiptPath = path.join(receiptRoot, `${idempotencyKey}.json`);
  const receiptEntry = await lstatOrNull(receiptPath);
  if (receiptEntry) {
    await assertNoSymlink(receiptPath, { directory: false });
    const receipt = parseStrictJson(await readFile(receiptPath));
    if (!exactKeys(receipt, ["schema", "operation", "idempotencyKey", "repositoryFingerprint", "keyGeneration", "preimageDigest", "outcome", "backupDisclosure"])
      || receipt.schema !== "pipeline.restricted-governance-receipt.v1" || receipt.operation !== "destroy-key" || receipt.idempotencyKey !== idempotencyKey || receipt.repositoryFingerprint !== repositoryFingerprint || receipt.keyGeneration !== keyGeneration || receipt.preimageDigest !== expectedKeyFileDigest || receipt.outcome !== "key-file-unavailable") fail("GES-IDEMPOTENCY-CONFLICT", "Key destruction idempotency key identifies a conflicting receipt.");
    if (await lstatOrNull(resolvedKeyFile)) fail("GES-RESTRICTED-READBACK", "Destroyed key file is present again.");
    return Object.freeze({ status: "idempotent-replay", receipt: Object.freeze(receipt) });
  }
  const journalPath = path.join(journalRoot, `${idempotencyKey}.json`);
  const journal = { schema: "pipeline.restricted-governance-key-destruction-journal.v1", idempotencyKey, repositoryFingerprint, keyGeneration, expectedKeyFileDigest };
  const journalEntry = await lstatOrNull(journalPath);
  if (journalEntry) {
    await assertNoSymlink(journalPath, { directory: false });
    if (canonicalizeJson(parseStrictJson(await readFile(journalPath))) !== canonicalizeJson(journal)) fail("GES-IDEMPOTENCY-CONFLICT", "Key destruction idempotency key identifies a conflicting journal.");
    if (await lstatOrNull(resolvedKeyFile)) fail("GES-RESTRICTED-RECOVERY", "Key destruction journal exists but the key file is still present.");
  } else {
    await assertNoSymlink(resolvedKeyFile, { directory: false });
    const keyBytes = await readFile(resolvedKeyFile);
    if (rawSha256(keyBytes) !== expectedKeyFileDigest || !timingSafeEqual(Buffer.from(keyBytes), encryptionKey)) fail("GES-RESTRICTED-PREIMAGE", "Key destruction key-file preimage does not match.");
    await writeAtomic(journalPath, `${canonicalizeJson(journal)}\n`);
    await unlink(resolvedKeyFile);
  }
  if (await lstatOrNull(resolvedKeyFile)) fail("GES-RESTRICTED-ERASE", "Key file remains available after destruction.");
  const receipt = { schema: "pipeline.restricted-governance-receipt.v1", operation: "destroy-key", idempotencyKey, repositoryFingerprint, keyGeneration, preimageDigest: expectedKeyFileDigest, outcome: "key-file-unavailable", backupDisclosure: "unknown" };
  await writeAtomic(receiptPath, `${canonicalizeJson(receipt)}\n`);
  await unlink(journalPath);
  return Object.freeze({ status: "key-file-unavailable", receipt: Object.freeze(receipt) });
}
