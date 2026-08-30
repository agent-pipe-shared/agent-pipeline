// SPDX-License-Identifier: SUL-1.0
/**
 * Portable repository-public-safe governance event storage.
 *
 * Canonical events are individual immutable files.  `heads.json` is a
 * replaceable source-last projection and is deliberately never used as an
 * integrity authority.  This module also implements, separately, the
 * owner-authenticated restricted-machine-local profile (the
 * `*RestrictedGovernance*` functions below); callers must never route
 * restricted data through the portable writer above, and must never route
 * portable-profile data through the restricted-machine-local functions.
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
import { criticalActionSubjectSha256, verifyCriticalActionApprovalRequest } from "./critical-action-approval-request.mjs";
import { USER_SOURCE_PATH, readCriticalHumanProofPolicy, readHumanApprovalMode } from "./critical-human-proof-policy.mjs";
import { discoverRepository } from "./worktree-lifecycle.mjs";
import { validateHumanGovernanceDecision } from "./human-governance-decision.mjs";
import { isHumanRoleExceptionDecision, validateHumanRoleExceptionDecision } from "./human-role-exception-decision.mjs";
import { validateLifecycleGovernanceEvent } from "./lifecycle-governance-events.mjs";
import { EVENT_CLASSES, representedEventClasses, validateAgentDecisionEvent } from "./agent-decision-journal.mjs";
import { assessWindowsPrivatePath, hardenWindowsPrivateDirectory } from "./windows-private-state.mjs";

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

const LOCAL_REPOSITORY_BINDING_SCHEMA = "pipeline.governance-event-repository-binding.v2";
const LOCAL_REPOSITORY_BINDING_SCHEMA_V1 = "pipeline.governance-event-repository-binding.v1";
const LOCAL_REPOSITORY_BINDING_SEGMENTS = ["agent-pipeline", "governance-events", "repository-binding.json"];

/**
 * NVA-REPOID-1: the identity itself is no longer a function of any absolute
 * path (AK14-direction.md). `derivePoGateRepositoryFingerprint` -- a hash of
 * `gitCommonDir + primaryRoot` -- answered "which path am I at", which is
 * exactly the quantity that differs when the identical checkout is reached
 * via `/mnt/c/...` (WSL) versus `C:\...` (native Windows): same bytes, two
 * path namespaces a single process can never unify with `realpath`. The
 * question this identity actually needs to answer is "am I the same
 * checkout this state was bound to" -- answered by a value generated once,
 * on first use, and persisted as local, untracked bytes under the git
 * common directory (`repository-binding.json`, parallel to
 * `po-gate-authority.mjs`'s profile-receipt pattern). Those bytes are
 * addressed differently by each path namespace but are the same bytes, so
 * every access path that resolves to this checkout's `.git` reads back the
 * same identity. A genuinely different physical repository has its own
 * binding file (or none yet) and therefore a different identity.
 */
async function discoverLegacyRepositoryFingerprints(root) {
  const aliases = new Set();
  for (const streamId of STREAMS.keys()) {
    const streamRoot = path.join(root, "governance", "events", streamId);
    const entry = await lstatOrNull(streamRoot);
    if (!entry || entry.isSymbolicLink() || !entry.isDirectory()) continue;
    let entries;
    try { entries = await readdir(streamRoot, { withFileTypes: true }); } catch { continue; }
    for (const dirEntry of entries) {
      if (!dirEntry.isFile() || dirEntry.isSymbolicLink() || !EVENT_FILE.test(dirEntry.name)) continue;
      let value;
      try { value = parseStrictJson(await readFile(path.join(streamRoot, dirEntry.name))); } catch { continue; }
      // Deliberately lenient: this is a one-time discovery pass over whatever
      // is currently checked out, not authoritative validation -- every real
      // read still goes through readEvent/readCandidateStreamEvent's full
      // checks. A file that fails to parse or lacks a SHA256-shaped
      // `repositoryFingerprint` simply contributes no alias; it is neither
      // trusted nor rejected here.
      if (isRecord(value) && typeof value.repositoryFingerprint === "string" && SHA256.test(value.repositoryFingerprint)) aliases.add(value.repositoryFingerprint);
    }
  }
  return [...aliases].sort();
}

/**
 * Bind-on-first-use: a checkout with no binding file yet (every fresh clone)
 * mints a fresh random identity and, in the same write, adopts whatever
 * `repositoryFingerprint` values are actually present in this checkout's own
 * already-committed events as legacy aliases -- exactly once, never
 * re-derived on a later call (GESBIND-legacy-finding.md). A previously
 * bound v1 file (written before legacy-alias support existed, by
 * NVA-GESBIND-1/dd50d386) is migrated in place: its already-bound identity
 * is kept fixed (an existing checkout's identity must never change under
 * it) and aliases are adopted now, once, exactly as a fresh bind would.
 * Once a v2 binding exists, it is read-only authority: there is no longer a
 * freshly-recomputable physical value to re-verify it against, and a v2
 * binding is never rewritten again.
 */
async function bindLocalRepositoryFingerprint(gitCommonDir, root) {
  const directory = path.join(gitCommonDir, ...LOCAL_REPOSITORY_BINDING_SEGMENTS.slice(0, -1));
  const target = path.join(gitCommonDir, ...LOCAL_REPOSITORY_BINDING_SEGMENTS);
  await assertNoSymlinkAncestry(target);
  const existing = await lstatOrNull(target);
  if (!existing) {
    const legacyAliases = await discoverLegacyRepositoryFingerprints(root);
    const generated = randomBytes(32).toString("hex");
    await mkdir(directory, { recursive: true, mode: 0o755 });
    await assertNoSymlink(directory, { directory: true });
    await writeAtomic(target, `${canonicalizeJson({ schema: LOCAL_REPOSITORY_BINDING_SCHEMA, repositoryFingerprint: generated, legacyAliases, boundAtEpochMs: Date.now() })}\n`);
    return { fingerprint: generated, legacyAliases };
  }
  await assertNoSymlink(target, { directory: false });
  let binding;
  try { binding = parseStrictJson(await readFile(target)); } catch { fail("GES-REPOSITORY-BINDING", "The local repository binding is not strict JSON."); }
  if (isRecord(binding) && binding.schema === LOCAL_REPOSITORY_BINDING_SCHEMA_V1
    && exactKeys(binding, ["schema", "repositoryFingerprint", "boundAtEpochMs"])
    && SHA256.test(binding.repositoryFingerprint) && Number.isInteger(binding.boundAtEpochMs) && binding.boundAtEpochMs >= 0) {
    const legacyAliases = await discoverLegacyRepositoryFingerprints(root);
    const migrated = { schema: LOCAL_REPOSITORY_BINDING_SCHEMA, repositoryFingerprint: binding.repositoryFingerprint, legacyAliases, boundAtEpochMs: binding.boundAtEpochMs };
    await writeAtomic(target, `${canonicalizeJson(migrated)}\n`);
    return { fingerprint: migrated.repositoryFingerprint, legacyAliases };
  }
  if (!exactKeys(binding, ["schema", "repositoryFingerprint", "legacyAliases", "boundAtEpochMs"]) || binding.schema !== LOCAL_REPOSITORY_BINDING_SCHEMA
    || !SHA256.test(binding.repositoryFingerprint) || !Array.isArray(binding.legacyAliases)
    || binding.legacyAliases.length !== new Set(binding.legacyAliases).size
    || binding.legacyAliases.some((value) => typeof value !== "string" || !SHA256.test(value) || value === binding.repositoryFingerprint)
    || !Number.isInteger(binding.boundAtEpochMs) || binding.boundAtEpochMs < 0) fail("GES-REPOSITORY-BINDING", "The local repository binding is invalid.");
  return { fingerprint: binding.repositoryFingerprint, legacyAliases: binding.legacyAliases };
}

async function assertPhysicalRoot(repositoryRoot) {
  if (typeof repositoryRoot !== "string" || !path.isAbsolute(repositoryRoot)) fail("GES-ROOT", "repositoryRoot must be an absolute path.");
  const root = await realpath(repositoryRoot);
  await assertNoSymlink(root, { directory: true });
  let repository;
  try { repository = discoverRepository(root); } catch { fail("GES-REPOSITORY", "repositoryRoot is not a physical Git repository."); }
  const { fingerprint, legacyAliases } = await bindLocalRepositoryFingerprint(repository.commonDir, root);
  return { root, fingerprint, acceptedFingerprints: new Set([fingerprint, ...legacyAliases]) };
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

/**
 * `create`/`create=false` selects harden-vs-assess exactly the way
 * `private-boundary.mjs`'s `ensurePrivateDirectory` tracks `created` per
 * directory: a freshly-created restricted root is hardened (we made it, so
 * we may fix its DACL); a pre-existing one is only assessed, never
 * hardened, so a raced-in or attacker-controlled directory is never
 * silently claimed as ours. `io` is an injectable dependency seam (default
 * real `process.platform`/`hardenWindowsPrivateDirectory`/
 * `assessWindowsPrivatePath`), mirroring `afk-ledger.mjs`'s `resolveIo`
 * pattern, so this win32-only branch is unit-testable on any host.
 */
export async function assertRestrictedRoot(repositoryRoot, storeRoot, { create = false } = {}, io = {}) {
  const target = assertAbsoluteOutsideRepository(repositoryRoot, storeRoot);
  if (create) await mkdir(target, { recursive: true, mode: 0o700 });
  await assertNoSymlinkAncestry(target);
  await assertNoSymlink(target, { directory: true });
  const metadata = await stat(target);
  const platform = io.platform ?? process.platform;
  const posixModeViolation = platform !== "win32" && (metadata.mode & 0o077) !== 0;
  if (posixModeViolation) fail("GES-RESTRICTED-PERMISSIONS", "Restricted storage must not grant group or other access.");
  if (platform !== "win32" && typeof process.getuid === "function" && metadata.uid !== process.getuid()) fail("GES-RESTRICTED-OWNER", "Restricted storage is not owned by this operator.");
  if (platform === "win32") {
    const harden = io.harden ?? hardenWindowsPrivateDirectory;
    const assess = io.assess ?? assessWindowsPrivatePath;
    const state = create ? harden(target) : assess(target);
    if (state.status !== "secure") fail("GES-RESTRICTED-WINDOWS-ASSURANCE", `Restricted storage Windows DACL assurance is ${state.status}.`);
  }
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
  // A-AC-07: additive to the pre-existing per-origin `materiality` concept on
  // `streams` (unchanged below) -- `mandatoryEventClasses` is a second, named
  // axis: which of the seven closed `EVENT_CLASSES` may never be silently
  // sampled/discarded, independent of which origin stream carried them.
  if (!exactKeys(policy, ["schema", "policyId", "revision", "defaultAction", "streams", "sanitizedReceipt", "mandatoryEventClasses"])
    || policy.schema !== "pipeline.governance-capture-policy.v1" || policy.defaultAction !== "deny" || !Array.isArray(policy.streams) || policy.streams.length !== 3
    || !Array.isArray(policy.mandatoryEventClasses) || new Set(policy.mandatoryEventClasses).size !== policy.mandatoryEventClasses.length
    || !policy.mandatoryEventClasses.every((entry) => EVENT_CLASSES.has(entry))) fail("GES-CAPTURE-POLICY", "Capture policy is invalid.");
  return policy;
}

/**
 * A-AC-07: the enforcement half of `mandatoryEventClasses`. A `captured`
 * decision is always admitted unchanged (today's only behavior, preserved).
 * A `sampled-out` decision -- an explicit caller choice not to durably
 * persist this event -- is admitted only for the `agent` origin (the sole
 * stream whose pre-existing `materiality` is `policy-selected` rather than
 * `required`; every other origin's events were never discardable and stay
 * that way), and only when none of the event's `representedEventClasses`
 * intersect the active policy's `mandatoryEventClasses`. A mandatory class
 * fails closed with a coded error rather than silently proceeding to drop
 * the event.
 */
function assertMandatoryCaptureNotSkipped(event, policy, captureDecision) {
  if (captureDecision !== "captured" && captureDecision !== "sampled-out") fail("GES-CAPTURE-DECISION", "An explicit captured or sampled-out capture decision is required.");
  if (captureDecision === "captured") return;
  if (event.origin !== "agent") fail("GES-MANDATORY-CAPTURE", "Only the policy-selected agent stream may ever be sampled out; this origin's events are never discardable.");
  let journal;
  try { journal = validateAgentDecisionEvent(event.payload); } catch { fail("GES-PAYLOAD-SCHEMA", "Agent decision payload is not closed or valid."); }
  const classes = representedEventClasses(journal);
  const hit = policy.mandatoryEventClasses.find((entry) => classes.has(entry));
  if (hit !== undefined) fail("GES-MANDATORY-CAPTURE", `Capture policy marks the ${hit} event class mandatory; it cannot be silently sampled out or discarded.`);
}

function assertPortablePayload(event, policy) {
  const stream = policy.streams.find((entry) => entry?.origin === event.origin);
  if (!stream || stream.storageProfile !== "repository-public-safe" || stream.personalIdentifiability !== "prohibited" || stream.contextualIdentifiability !== "prohibited") fail("GES-CAPTURE-DENIED", "Capture policy denies this portable event.");
  if (event.origin === "human") {
    // D-1's restricted attribution record can never reach this function at all:
    // assertIntent (the sole caller's precondition, governance-event-store.mjs:408)
    // already requires storageProfile === "repository-public-safe" for every
    // portable intent, and governance-event.mjs's envelope-shape check requires
    // the attribution schema to declare storageProfile === "restricted-machine-local".
    // The two are mutually exclusive, so an attribution-schema intent fails
    // GES-INTENT before assertPortablePayload ever runs; no guard is added here
    // (design §5.4 traces this and corrects an earlier draft that assumed a
    // second edit was needed).
    // The envelope's declared payload schema selects the validator, so a role
    // exception cannot be admitted through the plan-decision contract.
    const roleException = event.payloadSchema === "pipeline.human-role-exception-decision.v1";
    if (isHumanRoleExceptionDecision(event.payload) !== roleException) fail("GES-PAYLOAD-SCHEMA", "Human decision payload class does not match its declared envelope schema.");
    const decision = roleException ? validateHumanRoleExceptionDecision(event.payload) : validateHumanGovernanceDecision(event.payload);
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

/**
 * Validate one directory entry as a candidate canonical event for `stream`.
 * Shared by `scanStream` and `inspectStreamForForks` so every symlink,
 * path-safety, orphan-filtering, and envelope-path-binding check fires with
 * exactly one piece of code at any stream position, in either caller. Returns
 * null for an entry that is not a candidate event (lock/guard/orphaned temp
 * file); throws on any unsafe or invalid entry; otherwise returns the parsed
 * `{ sequence, event }` pair, unvalidated against sibling entries.
 */
async function readCandidateStreamEvent(root, registry, stream, streamId, entry, acceptedFingerprints) {
  if (entry.name === ".lock") return null;
  // The advisory acquisition guard is deliberately non-authoritative.  It
  // serializes lock acquisition and stale-lock recovery only; a lingering
  // regular guard file must never make a committed event prefix unreadable.
  if (entry.name === STREAM_LOCK_GUARD_FILE && entry.isFile()) return null;
  // A writer publishes only after rename.  Its own unlinked temporary bytes
  // are never authority and must not make a valid committed prefix unreadable.
  if (TEMPORARY_EVENT_FILE.test(entry.name) && entry.isFile()) return null;
  if (entry.isSymbolicLink()) fail("GES-SYMLINK", "Symbolic links are forbidden in governance storage.");
  const match = EVENT_FILE.exec(entry.name);
  if (!match || !entry.isFile()) fail("GES-UNSAFE-PATH", "The stream contains an unsafe or unrecognized path.");
  const event = await readEvent(repositoryPath(root, `${registry.storageRoot}/${stream.relativeRoot}/${entry.name}`));
  const sequence = Number(match[1]);
  if (event.sequence !== sequence || event.eventId !== match[2] || event.streamId !== streamId
    || !acceptedFingerprints.has(event.repositoryFingerprint)) fail("GES-EVENT-PATH", "Event path and envelope binding disagree.");
  return { sequence, event };
}

async function scanStream(root, registry, streamId, acceptedFingerprints) {
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
  for (const dirEntry of entries) {
    const candidate = await readCandidateStreamEvent(root, registry, stream, streamId, dirEntry, acceptedFingerprints);
    if (!candidate) continue;
    const { sequence, event } = candidate;
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
 * NVA-REPOID-2: the single caller-facing accessor for "what identity is this
 * checkout bound to" -- the question every other export above requires an
 * answer to before it can accept a caller-supplied `repositoryFingerprint`
 * (GES-CROSS-REPOSITORY otherwise). Bind-on-first-use: calling this against a
 * fresh checkout mints and persists the identity exactly as every other
 * physical-root export already does via `assertPhysicalRoot` -- this is not a
 * second code path or a second read of the binding file, only a narrower
 * return shape. A caller must read the identity here rather than recompute it
 * (`derivePoGateRepositoryFingerprint` answers a different, path-derived
 * question and is no longer this store's identity source, AK14-direction.md).
 */
export async function readLocalRepositoryFingerprint({ repositoryRoot } = {}) {
  const { fingerprint } = await assertPhysicalRoot(repositoryRoot);
  return fingerprint;
}

/**
 * Append one event intent. Writer-owned sequence/digests must be omitted from
 * `intent`; the returned receipt exposes only public metadata and checkpoint.
 */
export async function appendPortableGovernanceEvent({ repositoryRoot, registryPath, repositoryFingerprint, intent, assertAppend, captureDecision = "captured" } = {}) {
  const { root, fingerprint, acceptedFingerprints } = await assertPhysicalRoot(repositoryRoot);
  const { registry } = await loadRegistry(root, registryPath);
  if (repositoryFingerprint !== fingerprint) fail("GES-CROSS-REPOSITORY", "The expected repository fingerprint does not match the physical repository.");
  const streamId = intent?.streamId;
  const stream = streamFor(registry, streamId);
  const template = assertIntent(intent, stream, repositoryFingerprint);
  const policy = await loadCapturePolicy(root);
  assertPortablePayload(template, policy);
  assertMandatoryCaptureNotSkipped(template, policy, captureDecision);
  if (captureDecision === "sampled-out") {
    return Object.freeze({
      schema: "pipeline.governance-event-receipt.v1",
      operation: "append",
      outcome: "sampled-out",
      repositoryFingerprint: template.repositoryFingerprint,
      eventId: template.eventId,
      idempotencyKey: template.idempotencyKey,
      requestDigest: canonicalSha256(intent),
      eventDigest: null,
      eventPath: null,
      readbackDigest: null,
      checkpoint: null,
    });
  }
  const streamRoot = await ensureSafeDirectory(root, `${registry.storageRoot}/${stream.relativeRoot}`);
  return withExclusiveStreamLock(streamRoot, async () => {
    const scanned = await scanStream(root, registry, streamId, acceptedFingerprints);
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
  const { root, fingerprint, acceptedFingerprints } = await assertPhysicalRoot(repositoryRoot);
  const { registry } = await loadRegistry(root, registryPath);
  if (repositoryFingerprint !== fingerprint) fail("GES-CROSS-REPOSITORY", "The expected repository fingerprint does not match the physical repository.");
  const scanned = await scanStream(root, registry, streamId, acceptedFingerprints);
  if (!checkpoint) return Object.freeze({ integrity: "prefix-valid", completeness: "unknown", streamId, eventCount: scanned.events.length });
  const witness = scanned.events.find((event) => event.sequence === checkpoint.sequence);
  if (!witness || !checkpointMatches(witness, checkpoint)) fail("GES-CHECKPOINT", "The retained checkpoint is not present in this stream.");
  if (witness.sequence !== scanned.events.at(-1)?.sequence) return Object.freeze({ integrity: "prefix-valid", completeness: "unknown", streamId, eventCount: witness.sequence, checkpoint: Object.freeze({ ...checkpoint }) });
  return Object.freeze({ integrity: "valid", completeness: "verified", streamId, eventCount: scanned.events.length, checkpoint: Object.freeze({ ...checkpoint }) });
}

/** Query is a projection boundary: validation happens before any event is returned. */
export async function queryPortableGovernanceStream({ repositoryRoot, registryPath, repositoryFingerprint, streamId, checkpoint } = {}) {
  const verification = await verifyPortableGovernanceStream({ repositoryRoot, registryPath, repositoryFingerprint, streamId, checkpoint });
  const { root, acceptedFingerprints } = await assertPhysicalRoot(repositoryRoot);
  const { registry } = await loadRegistry(root, registryPath);
  const scanned = await scanStream(root, registry, streamId, acceptedFingerprints);
  const limit = verification.completeness === "verified" ? scanned.events.length : checkpoint?.sequence ?? scanned.events.length;
  return Object.freeze({ ...verification, events: Object.freeze(scanned.events.slice(0, limit).map((event) => Object.freeze({ ...event }))) });
}

/**
 * Query more than one closed portable stream in one call, keyed by streamId.
 * Composes the existing `queryPortableGovernanceStream` once per requested
 * stream, unchanged; each stream's own integrity/completeness/events (each
 * event still carrying its own origin/authorityClass/timeAssurance) is
 * preserved unflattened.
 */
export async function queryPortableGovernanceStreams({ repositoryRoot, registryPath, repositoryFingerprint, streamIds, checkpoints = {} } = {}) {
  if (!Array.isArray(streamIds) || streamIds.length === 0 || new Set(streamIds).size !== streamIds.length
    || streamIds.some((streamId) => !STREAMS.has(streamId))) fail("GES-MULTI-STREAM", "streamIds must be a non-empty array of unique closed-set stream identifiers.");
  if (!isRecord(checkpoints) || Object.keys(checkpoints).some((key) => !streamIds.includes(key))) fail("GES-MULTI-STREAM", "checkpoints must be a plain object whose keys are a subset of streamIds.");
  const results = [];
  for (const streamId of streamIds) {
    results.push(await queryPortableGovernanceStream({ repositoryRoot, registryPath, repositoryFingerprint, streamId, checkpoint: checkpoints[streamId] ?? null }));
  }
  return Object.freeze({
    schema: "pipeline.governance-multi-stream-query.v1",
    authority: "non-authoritative",
    streams: Object.freeze(Object.fromEntries(streamIds.map((streamId, index) => [streamId, results[index]]))),
  });
}

/**
 * Rebuild the replaceable heads projection from an already valid chain, OR —
 * when the stream is forked (K-AC-05) and the caller supplies `disposition`
 * — record the governed fork disposition itself. This IS the sanctioned
 * recovery operation for both cases; there is no separate operation living
 * beside it. Without `disposition`, an already-forked stream still fails
 * closed with `GES-FORK` exactly as every other operation does, and a normal
 * (non-forked) stream is recovered exactly as before this function grew a
 * `disposition` parameter. With `disposition`, `recovery` is unused: a
 * disposition is recorded (never `heads.json`, never either conflicting
 * canonical file) instead of a projection being rebuilt, and the outcome is
 * never "recovered"/"projection-rebuilt" — recording a disposition never
 * makes the stream normally writable/readable again.
 */
export async function recoverPortableGovernanceProjection({ repositoryRoot, registryPath, repositoryFingerprint, streamId, checkpoint, recovery, disposition } = {}) {
  if (disposition !== undefined) {
    const { root, fingerprint, acceptedFingerprints } = await assertPhysicalRoot(repositoryRoot);
    const { registry } = await loadRegistry(root, registryPath);
    if (repositoryFingerprint !== fingerprint) fail("GES-CROSS-REPOSITORY", "The expected repository fingerprint does not match the physical repository.");
    return recordGovernanceForkDisposition(root, registry, streamId, disposition, acceptedFingerprints);
  }
  if (!exactKeys(recovery, ["idempotencyKey", "expectedHeadsDigest", "requestedPostimageDigest"]) || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(recovery.idempotencyKey)
    || (recovery.expectedHeadsDigest !== null && !SHA256.test(recovery.expectedHeadsDigest)) || !SHA256.test(recovery.requestedPostimageDigest)) fail("GES-RECOVERY-REQUEST", "Recovery requires a closed idempotent preimage/postimage request.");
  const verification = await verifyPortableGovernanceStream({ repositoryRoot, registryPath, repositoryFingerprint, streamId, checkpoint });
  if (verification.integrity !== "valid") fail("GES-RECOVERY-CHECKPOINT", "Projection recovery requires a retained checkpoint.");
  const { root, acceptedFingerprints } = await assertPhysicalRoot(repositoryRoot);
  const { registry } = await loadRegistry(root, registryPath);
  const streamRoot = await ensureSafeDirectory(root, `${registry.storageRoot}/${streamId}`);
  return withExclusiveStreamLock(streamRoot, async () => {
    const rechecked = await scanStream(root, registry, streamId, acceptedFingerprints);
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

const FORK_DISPOSITION_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const FORK_DISPOSITION_TEMP_FILE = /^\.[1-9][0-9]*\.json\.[a-f0-9]{24}\.tmp$/u;

/**
 * Field-level shape checks shared by both the write-side validator
 * (`assertForkDisposition`, a caller-supplied intent) and the read-side
 * validator (`readForkDisposition`, an on-disk persisted record). `code` lets
 * each caller keep its own existing failure code — the write side already
 * used `GES-FORK-DISPOSITION` for a bad caller intent, and the read side
 * already used `GES-FORK-DISPOSITION-RECORD` for a structurally invalid
 * persisted record; this only removes the duplicated regex/array/integer
 * checks, it does not merge those two distinct failure identities.
 */
function assertForkDispositionFields(disposition, code) {
  if (typeof disposition.idempotencyKey !== "string" || !FORK_DISPOSITION_TOKEN.test(disposition.idempotencyKey)) fail(code, "A fork disposition requires a closed idempotency key.");
  if (!Number.isSafeInteger(disposition.sequence) || disposition.sequence < 1) fail(code, "A fork disposition requires the exact forked sequence number.");
  // The structural minimum is deliberately just "non-empty, unique, closed
  // tokens" — whether the named set actually has enough members to match a
  // real fork (always >= 2 conflicting entries) is a reality-binding
  // question, decided below in `recordGovernanceForkDisposition` against
  // `inspectStreamForForks`, not a shape question decided here.
  if (!Array.isArray(disposition.acknowledgedEventIds) || disposition.acknowledgedEventIds.length < 1
    || disposition.acknowledgedEventIds.some((eventId) => typeof eventId !== "string" || !FORK_DISPOSITION_TOKEN.test(eventId))
    || new Set(disposition.acknowledgedEventIds).size !== disposition.acknowledgedEventIds.length) fail(code, "A fork disposition requires the closed set of every conflicting event identifier.");
  if (typeof disposition.reasonCode !== "string" || !FORK_DISPOSITION_TOKEN.test(disposition.reasonCode)) fail(code, "A fork disposition requires a closed reason code.");
  if (!Number.isSafeInteger(disposition.disposedAtEpochMs) || disposition.disposedAtEpochMs < 0) fail(code, "A fork disposition requires an exact integer disposition timestamp.");
  return disposition;
}

function assertForkDisposition(disposition) {
  if (!exactKeys(disposition, ["idempotencyKey", "sequence", "acknowledgedEventIds", "reasonCode", "disposedAtEpochMs", "approval"])) fail("GES-FORK-DISPOSITION", "A closed fork disposition is required.");
  assertForkDispositionFields(disposition, "GES-FORK-DISPOSITION");
  assertForkDispositionAuthorization(disposition.approval);
  return disposition;
}

/* ------------------------------------------------------------------------ *
 * K-AC-05 / ADR-0072: a fork disposition requires a verified PO approval.
 *
 * Finding 1 was that the record above is self-mintable: any caller holding
 * library access could produce the exact shape this module then treated as
 * sufficient to end a stream's invalidity. The fix reuses the repository's
 * existing human-clearance primitive rather than inventing a second one --
 * `po-approval-proof.mjs` through `critical-action-approval-request.mjs`, the
 * same route push, GMW (ADR-0058) and HGO (ADR-0059) already take -- with
 * `"governance-fork-disposition"` added as the fourth CRITICAL_ACTION_KINDS
 * member. The strength setting is the repository's existing
 * `gates.push_approval` (ADR-0056); no disposition-specific config key exists.
 * ------------------------------------------------------------------------ */

const FORK_DISPOSITION_ACTION_KIND = "governance-fork-disposition";
const FORK_DISPOSITION_SUBJECT_SCHEMA = "pipeline.governance-fork-disposition-subject.v1";
const FORK_DISPOSITION_CANDIDATE_DOMAIN = "pipeline.governance-fork-disposition-candidate.v1";
const FORK_DISPOSITION_KEY_REFERENCE = /^[A-Za-z0-9._:@/-]{1,200}$/u;
const FORK_DISPOSITION_PLAN_LABEL = "pipeline.governance-fork-disposition-plan.v1";
const FORK_DISPOSITION_SPEC_LABEL = "pipeline.governance-fork-disposition-spec.v1";

/**
 * The fixed, public, content-independent inputs an offline signer needs to
 * rebuild the exact intent this module verifies -- exported so the CLI, an
 * external signer and the tests all read them from one definition instead of
 * copying the literals (the duplication class that produced earlier findings
 * in this neighbourhood).
 *
 * `planSha256`/`specSha256` are sentinel digests of their own descriptive
 * labels, exactly as `human-guard-override.mjs` does and for the same reason:
 * a fork disposition is a general store-level governance act, not one scoped
 * to a particular sprint's plan/spec documents, and fixed values keep the
 * intent reproducible offline with no repository file I/O by the signer. They
 * carry no security value of their own; the unique binding is `subjectSha256`.
 */
export const GOVERNANCE_FORK_DISPOSITION_APPROVAL = Object.freeze({
  kind: FORK_DISPOSITION_ACTION_KIND,
  featureId: FORK_DISPOSITION_ACTION_KIND,
  planLabel: FORK_DISPOSITION_PLAN_LABEL,
  specLabel: FORK_DISPOSITION_SPEC_LABEL,
  planSha256: createHash("sha256").update(FORK_DISPOSITION_PLAN_LABEL).digest("hex"),
  specSha256: createHash("sha256").update(FORK_DISPOSITION_SPEC_LABEL).digest("hex"),
  policyRevision: "critical-human-proof-v1",
});

function isIsoTimestamp(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

/**
 * A push is naturally bound to the commit/tree it would publish. A fork is
 * not: it exists independently of any one commit, so binding the proof to a
 * candidate commit would either let the proof outlive the fork state it was
 * signed for, or force re-signing on every unrelated commit (ADR-0072,
 * Alternatives). The primitive's `candidate` slot is nonetheless mandatory and
 * shape-checked (two distinct 40-64 hex identifiers), so it is filled with a
 * deterministic, domain-separated derivation of the disposition's OWN identity.
 *
 * This is a substitution, and it is deliberately not a git object: it adds no
 * independent binding of its own (it is a pure function of the subject that is
 * signed anyway), and it asserts no repository state that is not true. What it
 * does buy is that `verifyCriticalActionApprovalRequest` -- which compares the
 * request's candidate against the one the verifier rebuilds -- rejects any
 * request whose candidate was chosen by the requester instead of derived from
 * the exact stream position being dispositioned.
 */
function forkDispositionCandidate(subject) {
  const base = canonicalizeJson(subject);
  return Object.freeze({
    commit: createHash("sha256").update(`${FORK_DISPOSITION_CANDIDATE_DOMAIN}\0commit\0${base}`).digest("hex"),
    tree: createHash("sha256").update(`${FORK_DISPOSITION_CANDIDATE_DOMAIN}\0tree\0${base}`).digest("hex"),
  });
}

/**
 * The exact subject a PO signs to dispose of one forked stream position.
 *
 * Binds `repositoryFingerprint`, `streamId`, `sequence` and the sorted set of
 * the conflicting entries' `eventDigest` -- CONTENT digests, never `eventId`
 * strings (K-AC-05 Finding 5): two different records may not carry the same
 * content digest, while an `eventId` is merely a claimed identity that the
 * forking writer chose. A fork always has at least two conflicting entries, so
 * fewer than two digests can never describe a real one.
 *
 * Exported because an offline signer and the CLI must rebuild byte-identically
 * what this module rebuilds from reality at verification time.
 */
export function governanceForkDispositionApprovalSubject({ repositoryFingerprint, streamId, sequence, forkedEventDigests } = {}) {
  if (typeof repositoryFingerprint !== "string" || !SHA256.test(repositoryFingerprint)
    || typeof streamId !== "string" || !STREAMS.has(streamId)
    || !Number.isSafeInteger(sequence) || sequence < 1
    || !Array.isArray(forkedEventDigests) || forkedEventDigests.length < 2
    || forkedEventDigests.some((entry) => typeof entry !== "string" || !SHA256.test(entry))
    || new Set(forkedEventDigests).size !== forkedEventDigests.length) {
    fail("GES-FORK-DISPOSITION-APPROVAL-SUBJECT", "A fork disposition approval subject requires the exact repository, stream, sequence and conflicting content digests.");
  }
  const subject = Object.freeze({
    schema: FORK_DISPOSITION_SUBJECT_SCHEMA,
    repositoryFingerprint,
    streamId,
    sequence,
    forkedEventDigests: Object.freeze([...forkedEventDigests].sort()),
  });
  const candidate = forkDispositionCandidate(subject);
  return Object.freeze({
    subject,
    candidate,
    subjectSha256: criticalActionSubjectSha256({ kind: FORK_DISPOSITION_ACTION_KIND, candidate, subject }),
  });
}

/**
 * The caller-supplied authorization travelling WITH the write. Two closed
 * shapes, self-declaring by `mode`, mirroring ADR-0056's own two modes.
 * `signature` carries the public approval request plus the detached proof;
 * `chat` carries only an attribution, and is exactly as weak as push's chat
 * mode -- it is an attribution record, not evidence.
 */
function assertForkDispositionAuthorization(authorization) {
  if (!isRecord(authorization)) fail("GES-FORK-DISPOSITION-APPROVAL", "A fork disposition requires a closed approval.");
  if (authorization.mode === "signature") {
    if (!exactKeys(authorization, ["mode", "request", "proof"]) || !isRecord(authorization.request) || !isRecord(authorization.proof)) {
      fail("GES-FORK-DISPOSITION-APPROVAL", "A signature-mode fork disposition approval requires exactly an approval request and a detached proof.");
    }
    return authorization;
  }
  if (authorization.mode === "chat") {
    if (!exactKeys(authorization, ["mode", "clearedBy", "clearedAtEpochMs"])
      || typeof authorization.clearedBy !== "string" || !FORK_DISPOSITION_TOKEN.test(authorization.clearedBy)
      || !Number.isSafeInteger(authorization.clearedAtEpochMs) || authorization.clearedAtEpochMs < 0) {
      fail("GES-FORK-DISPOSITION-APPROVAL", "A chat-mode fork disposition approval requires exactly a closed attribution token and an exact integer clearance timestamp.");
    }
    return authorization;
  }
  fail("GES-FORK-DISPOSITION-APPROVAL", "A fork disposition approval must declare either signature or chat mode.");
}

/**
 * The DURABLE reference. The raw proof is deliberately not re-embedded: the
 * record references the verified approval by digest, mirroring how
 * `pushApproval.lastApproved` references an approval. Shared by the writer
 * (which builds it) and `readForkDisposition` (which re-validates it).
 *
 * What this validates: shape and format ONLY -- exact keys, that
 * `subjectSha256`/`intentSha256`/`proofSha256` are well-formed SHA-256 hex
 * digests, that `keyReference`/`clearedBy`/`source` match their closed token
 * grammars, and that `expiresAt`/`clearedAtEpochMs` are well-formed. It does
 * NOT authenticate `intentSha256`, `proofSha256`, `keyReference` or
 * `expiresAt` against anything; those fields are trusted verbatim once
 * well-formed. The only reality-bound cross-checks performed anywhere on read
 * are in `readForkDisposition` itself, which re-derives `subjectSha256` from
 * the fork as it stands now and re-derives `acknowledgedEventIds` from the
 * same fork -- not here. So a hand-edited record carrying a forged but
 * well-formed `intentSha256`/`proofSha256`/`keyReference`/`expiresAt`, paired
 * with the correct (publicly derivable) `subjectSha256`, passes every check
 * this function and `readForkDisposition` perform and is surfaced as a
 * trustworthy governed disposition (Critic round 3, F1; QG-05: this is the
 * blind spot, not a claim this function closes).
 *
 * A second, cheaper blind spot (Critic round 4, F-B): `approval.mode` itself
 * is not re-checked against configuration on read. The WRITE side
 * (`authorizeForkDisposition`) refuses a `chat`-mode approval unless
 * `gates.push_approval` resolves to `chat`; this function has no such check,
 * so a record hand-edited to `mode: "chat"` needs no forged digest at all --
 * only the closed `chat`-mode key set, which is public shape, not secret
 * material -- to be surfaced as governed.
 */
function assertForkDispositionApprovalReference(approval, code) {
  if (!isRecord(approval)) fail(code, "A recorded fork disposition requires a closed approval reference.");
  if (approval.mode === "signature") {
    if (!exactKeys(approval, ["mode", "subjectSha256", "intentSha256", "proofSha256", "keyReference", "expiresAt"])
      || !SHA256.test(approval.subjectSha256 ?? "") || !SHA256.test(approval.intentSha256 ?? "") || !SHA256.test(approval.proofSha256 ?? "")
      || typeof approval.keyReference !== "string" || !FORK_DISPOSITION_KEY_REFERENCE.test(approval.keyReference)
      || !isIsoTimestamp(approval.expiresAt)) fail(code, "The recorded signature-mode approval reference is invalid.");
    return approval;
  }
  if (approval.mode === "chat") {
    if (!exactKeys(approval, ["mode", "subjectSha256", "clearedBy", "clearedAtEpochMs", "source"])
      || !SHA256.test(approval.subjectSha256 ?? "")
      || typeof approval.clearedBy !== "string" || !FORK_DISPOSITION_TOKEN.test(approval.clearedBy)
      || !Number.isSafeInteger(approval.clearedAtEpochMs) || approval.clearedAtEpochMs < 0
      || typeof approval.source !== "string" || !FORK_DISPOSITION_TOKEN.test(approval.source)) fail(code, "The recorded chat-mode approval reference is invalid.");
    return approval;
  }
  if (approval.mode === "chat-attributed-unattested") {
    if (!exactKeys(approval, ["mode", "subjectSha256", "clearedBy", "clearedAtEpochMs", "source"])
      || !SHA256.test(approval.subjectSha256 ?? "")
      || typeof approval.clearedBy !== "string" || !FORK_DISPOSITION_TOKEN.test(approval.clearedBy)
      || !Number.isSafeInteger(approval.clearedAtEpochMs) || approval.clearedAtEpochMs < 0
      || approval.source !== USER_SOURCE_PATH) fail(code, "The recorded global chat attribution reference is invalid.");
    return approval;
  }
  fail(code, "A recorded fork disposition approval must declare either signature or chat mode.");
}

/**
 * Turn a caller-supplied authorization into the durable reference, or fail
 * closed. The subject is rebuilt from the fork this module observed itself --
 * never from anything the caller claimed -- so a proof signed for a different
 * stream, a different sequence, or a different set of conflicting records
 * cannot be replayed here.
 *
 * The trust anchor comes exclusively from the repository's own
 * `project/critical-human-proof.json`. No `trustPolicy` parameter is offered:
 * letting a caller hand in the anchor its own proof verifies against would
 * reinstate Finding 1 one layer up.
 *
 * Be exact about what protects that file, because this comment previously
 * credited a check that is not performed: it said "committed", but
 * `readCriticalHumanProofPolicy` reads the working-tree copy and compares
 * nothing against HEAD -- unlike its sibling `readPushApprovalMode`, which
 * genuinely does resolve a differing or absent working-tree copy to the
 * strongest mode. The protection comes from another layer: the file is
 * gate-strength write-protected (GS-2, `hooks/guard-gate-strength.mjs`), so an
 * agent cannot install an anchor of its own unilaterally -- every write lane
 * into it passes through a human authorization bound to that exact edit and
 * recorded in the override audit ledger. Treat it as human-gated and audited,
 * not as unwritable, and not as verified-committed here.
 */
function authorizeForkDisposition(root, registry, streamId, disposition, fork, now) {
  const { subjectSha256, candidate } = governanceForkDispositionApprovalSubject({
    repositoryFingerprint: registry.repositoryFingerprint,
    streamId,
    sequence: disposition.sequence,
    forkedEventDigests: fork.entries.map((entry) => entry.eventDigest),
  });
  const authorization = disposition.approval;
  const configured = readHumanApprovalMode(root, { legacyKind: "push" });
  const globalChat = configured.mode === "chat" && configured.scope === "global" && configured.source === USER_SOURCE_PATH;
  // Chat is admissible only where the human genuinely, committedly configured
  // it. Every other resolution -- default, invalid, unreadable, unsafe,
  // uncommitted -- is `signature`, which is what `readPushApprovalMode`
  // already guarantees; a signature-mode approval stays admissible under a
  // chat configuration because it is strictly stronger, never weaker.
  if (configured.mode !== "chat" && authorization.mode !== "signature") {
    fail("GES-FORK-DISPOSITION-APPROVAL-MODE", `A verified signature approval is required (gates.push_approval resolved to ${configured.mode} from ${configured.source}).`);
  }
  if (authorization.mode === "chat") {
    return Object.freeze({
      mode: globalChat ? "chat-attributed-unattested" : "chat",
      subjectSha256,
      clearedBy: authorization.clearedBy,
      clearedAtEpochMs: authorization.clearedAtEpochMs,
      source: configured.source,
    });
  }
  const policy = readCriticalHumanProofPolicy(root);
  if (!policy.ok) fail("GES-FORK-DISPOSITION-TRUST-ANCHOR", "project/critical-human-proof.json carries no usable trustAnchor, so no external approval can be verified.");
  // RW1-TRUSTANCHOR: mirrors the identical fix in `po-human-approval.mjs`'s
  // `verify-fork-disposition` (this function's caller-side predictor, per that
  // function's own doc comment) -- reading only the legacy singular `trustAnchor` made
  // this fail closed for every v3 policy. Same NON-EMPTY-v3-set-wins /
  // falls-through-to-legacy-singular / else-absent resolution as
  // `guard-maintenance-window.mjs` (NVA-GMWFIX-1/2); deliberately no "any well-formed
  // key" fallback for an absent set -- this ceremony must never become
  // self-serviceable by an agent holding no PO key at all.
  const anchors = Array.isArray(policy.trustAnchors) && policy.trustAnchors.length > 0
    ? policy.trustAnchors
    : (policy.trustAnchor !== null ? [policy.trustAnchor] : []);
  if (anchors.length === 0) fail("GES-FORK-DISPOSITION-TRUST-ANCHOR", "project/critical-human-proof.json carries no usable trustAnchor, so no external approval can be verified.");
  const action = authorization.request.action;
  if (!isRecord(action) || action.kind !== FORK_DISPOSITION_ACTION_KIND || action.subjectSha256 !== subjectSha256) {
    fail("GES-FORK-DISPOSITION-APPROVAL-SUBJECT", "The approval does not bind this exact stream, sequence and set of conflicting content digests.");
  }
  let verified;
  for (const trustPolicy of anchors) {
    verified = verifyCriticalActionApprovalRequest({
      request: authorization.request,
      trustPolicy,
      proof: authorization.proof,
      expectedCandidate: candidate,
      expectedAction: action,
      now,
    });
    if (verified.verified || verified.code !== "CRITICAL-ACTION-EXTERNAL-AUTHORITY-REQUIRED") break;
  }
  if (!verified.verified) fail("GES-FORK-DISPOSITION-APPROVAL-UNVERIFIED", `The fork disposition approval could not be verified (${verified.code}).`);
  // Pin the intent's own authority fields, exactly as `pipeline-state.mjs`
  // pins them for push: `verifyCriticalActionApprovalRequest` rebuilds the
  // intent from whatever featureId/plan/spec the request carries, so without
  // this an otherwise valid proof minted under a different feature context
  // would verify here.
  const intent = authorization.request.approvalIntent?.value;
  if (intent?.featureId !== GOVERNANCE_FORK_DISPOSITION_APPROVAL.featureId
    || intent?.planSha256 !== GOVERNANCE_FORK_DISPOSITION_APPROVAL.planSha256
    || intent?.specSha256 !== GOVERNANCE_FORK_DISPOSITION_APPROVAL.specSha256) {
    fail("GES-FORK-DISPOSITION-APPROVAL-AUTHORITY", "The approval intent was not issued for the fork-disposition authority.");
  }
  return Object.freeze({
    mode: "signature",
    subjectSha256,
    intentSha256: authorization.request.approvalIntent.sha256,
    proofSha256: verified.proofSha256,
    keyReference: authorization.proof.keyReference,
    expiresAt: action.expiresAt,
  });
}

/**
 * Read-only strict superset of `scanStream`'s detection (K-AC-05), sharing
 * `scanStream`'s own per-entry validation via `readCandidateStreamEvent`.
 * Every symlink, path-safety, orphan-filtering, and envelope-validation check
 * `scanStream` performs still fires with `scanStream`'s own code, at any
 * stream position; the ONLY condition tolerated instead of throwing
 * `GES-FORK` is more than one canonical file claiming the same sequence.
 * Every sequence strictly before the first such position is still required
 * to form a valid contiguous hash chain, exactly as `scanStream` requires for
 * the whole stream when no fork is present anywhere — so when the returned
 * fork list is empty, this function has enforced exactly what `scanStream`
 * would have enforced. It never weakens detection; it adds one capability.
 * `recoverPortableGovernanceProjection` uses this same helper internally to
 * decide whether a governed fork disposition applies — there is no separate
 * detection path for that decision either.
 */
async function inspectStreamForForks(root, registry, streamId, acceptedFingerprints) {
  const stream = streamFor(registry, streamId);
  const streamRoot = repositoryPath(root, `${registry.storageRoot}/${stream.relativeRoot}`);
  await assertNoSymlinkAncestry(streamRoot);
  const rootEntry = await lstatOrNull(streamRoot);
  const bySequence = new Map();
  if (rootEntry) {
    await assertNoSymlink(streamRoot, { directory: true });
    const entries = await readdir(streamRoot, { withFileTypes: true });
    const byIdempotency = new Map();
    for (const dirEntry of entries) {
      const candidate = await readCandidateStreamEvent(root, registry, stream, streamId, dirEntry, acceptedFingerprints);
      if (!candidate) continue;
      const { sequence, event } = candidate;
      if (!bySequence.has(sequence)) bySequence.set(sequence, []);
      bySequence.get(sequence).push(event);
    }
    // A genuine fork always makes scanStream throw GES-FORK strictly before a
    // second same-sequence entry's idempotency key could ever be compared, so
    // that comparison has no scanStream precedent at a forked position and is
    // deliberately skipped there; every singleton position is still checked,
    // exactly as scanStream checks it.
    for (const sequence of [...bySequence.keys()].sort((left, right) => left - right)) {
      const list = bySequence.get(sequence);
      if (list.length > 1) continue;
      const event = list[0];
      if (byIdempotency.has(event.idempotencyKey)) {
        const prior = byIdempotency.get(event.idempotencyKey);
        if (prior.eventDigest !== event.eventDigest) fail("GES-IDEMPOTENCY-CONFLICT", "One idempotency key identifies conflicting records.");
        fail("GES-DUPLICATE", "Duplicate canonical records are forbidden.");
      }
      byIdempotency.set(event.idempotencyKey, event);
    }
  }
  const sequences = [...bySequence.keys()].sort((left, right) => left - right);
  const forkSequences = sequences.filter((sequence) => bySequence.get(sequence).length > 1);
  const firstForkSequence = forkSequences.length > 0 ? forkSequences[0] : Infinity;
  const forks = forkSequences.map((sequence) => {
    const list = bySequence.get(sequence).slice().sort((left, right) => left.eventId.localeCompare(right.eventId));
    return Object.freeze({
      sequence,
      entries: Object.freeze(list.map((event) => Object.freeze({ eventId: event.eventId, eventDigest: event.eventDigest, envelope: Object.freeze({ ...event }) }))),
    });
  });
  const prefix = [];
  let previousDigest = null;
  let expectedSequence = 1;
  for (const sequence of sequences) {
    if (sequence >= firstForkSequence) break;
    const event = bySequence.get(sequence)[0];
    if (event.sequence !== expectedSequence || event.previousEventDigest !== previousDigest) fail("GES-CHAIN", "The canonical stream is not a contiguous hash chain.");
    prefix.push(Object.freeze({ ...event }));
    previousDigest = event.eventDigest;
    expectedSequence += 1;
  }
  return { stream, streamRoot, prefix, forks };
}

/**
 * Read one previously recorded governed fork disposition (K-AC-05), if any,
 * for `sequence` in `streamId` — purely additive read visibility over the
 * exact same durable record `recordGovernanceForkDisposition` writes. Never
 * touches `heads.json` or either conflicting canonical file, and never
 * changes whether the stream is otherwise readable/writable; it only answers
 * "has a governed disposition already been appended here." Returns `null`
 * when no disposition has been recorded at this sequence yet.
 */
async function readForkDisposition(root, registry, streamId, sequence, fork = null) {
  const target = repositoryPath(root, `${registry.storageRoot}/fork-disposition/${streamId}/${sequence}.json`);
  // K-AC-05 Finding 4: `inspectStreamForForks` guards its own stream root
  // against symlinked ancestry, and `ensureSafeDirectory` guards the write
  // side of this very path; the read side did not. A symlinked ancestor
  // directory could therefore serve a disposition from outside the governance
  // tree to every reader, including `inspectForkedGovernanceStream`.
  await assertNoSymlinkAncestry(target);
  const entry = await lstatOrNull(target);
  if (!entry) return null;
  await assertNoSymlink(target, { directory: false });
  let bytes;
  let record;
  try {
    bytes = await readFile(target);
    record = parseStrictJson(bytes);
  } catch { fail("GES-FORK-DISPOSITION-RECORD", "The recorded fork disposition is not strict JSON."); }
  if (!exactKeys(record, ["schema", "repositoryFingerprint", "streamId", "idempotencyKey", "sequence", "acknowledgedEventIds", "reasonCode", "disposedAtEpochMs", "approval"])
    || record.schema !== "pipeline.governance-fork-disposition.v1" || record.repositoryFingerprint !== registry.repositoryFingerprint
    || record.streamId !== streamId || record.sequence !== sequence) fail("GES-FORK-DISPOSITION-RECORD", "The recorded fork disposition shape is invalid.");
  // The four binding fields are checked above; every other persisted field
  // gets the same closed-token/deduplicated-array/safe-integer checks the
  // write side enforces on the way in (assertForkDispositionFields), so a
  // corrupted or hand-edited non-binding field fails closed here too instead
  // of being surfaced verbatim as a trustworthy governed disposition.
  assertForkDispositionFields(record, "GES-FORK-DISPOSITION-RECORD");
  assertForkDispositionApprovalReference(record.approval, "GES-FORK-DISPOSITION-RECORD");
  if (record.approval.mode === "chat-attributed-unattested") {
    const configured = readHumanApprovalMode(root, { legacyKind: "push" });
    if (configured.mode !== "chat" || configured.scope !== "global" || configured.source !== USER_SOURCE_PATH) {
      fail("GES-FORK-DISPOSITION-RECORD", "The recorded global chat attribution no longer matches a committed global human approval mode.");
    }
  }
  // Mirrors readEvent's own GES-NONCANONICAL check: a persisted disposition
  // whose on-disk bytes are not the exact canonical serialization of its own
  // parsed value is rejected rather than silently accepted.
  if (Buffer.from(`${canonicalizeJson(record)}\n`, "utf8").compare(bytes) !== 0) fail("GES-NONCANONICAL", "A recorded fork disposition does not contain exact canonical bytes.");
  // K-AC-05 Finding 3: the write side bound `acknowledgedEventIds` to the real
  // conflicting entries once, at write time. Nothing re-checked it afterwards,
  // so a disposition stayed readable as "governed" even after the reality it
  // named had changed -- a third conflicting record appended later, or the
  // named ones replaced. Whenever the caller has the actual fork in hand (the
  // exported read path always does), the identity set AND the signed content
  // binding are re-derived from that fork and compared. Canonical bytes prove
  // the record is intact; only this proves it still describes reality.
  if (fork !== null) {
    const actualEventIds = fork.entries.map((entry) => entry.eventId).slice().sort();
    const recordedEventIds = [...record.acknowledgedEventIds].sort();
    if (actualEventIds.length !== recordedEventIds.length || actualEventIds.some((eventId, index) => eventId !== recordedEventIds[index])) {
      fail("GES-FORK-DISPOSITION-MISMATCH", "The recorded disposition's acknowledged event identifiers no longer match the conflicting entries at this sequence.");
    }
    const { subjectSha256 } = governanceForkDispositionApprovalSubject({
      repositoryFingerprint: registry.repositoryFingerprint,
      streamId,
      sequence,
      forkedEventDigests: fork.entries.map((entry) => entry.eventDigest),
    });
    if (record.approval.subjectSha256 !== subjectSha256) {
      fail("GES-FORK-DISPOSITION-MISMATCH", "The recorded disposition's approved subject no longer matches the conflicting entries' content digests at this sequence.");
    }
  }
  return Object.freeze({
    idempotencyKey: record.idempotencyKey,
    sequence: record.sequence,
    acknowledgedEventIds: Object.freeze([...record.acknowledgedEventIds]),
    reasonCode: record.reasonCode,
    disposedAtEpochMs: record.disposedAtEpochMs,
    approval: Object.freeze({ ...record.approval }),
  });
}

/**
 * Exported read-only projection of `inspectStreamForForks` (K-AC-05); see
 * that function for the full detection contract. Each returned fork entry
 * also carries `disposition`: `null` when no explicit governed disposition
 * has been appended for that sequence yet, or the same content
 * `recordGovernanceForkDisposition` persisted when one has — so a caller can
 * learn "was this fork ever governed-disposed, by whom [reasonCode], when
 * [disposedAtEpochMs]" from this exported surface alone, without reading any
 * internal storage path. This is read-visibility only: it never restores
 * append/verify/query/plain-recovery availability for the stream.
 */
export async function inspectForkedGovernanceStream({ repositoryRoot, registryPath, repositoryFingerprint, streamId } = {}) {
  const { root, fingerprint, acceptedFingerprints } = await assertPhysicalRoot(repositoryRoot);
  const { registry } = await loadRegistry(root, registryPath);
  if (repositoryFingerprint !== fingerprint) fail("GES-CROSS-REPOSITORY", "The expected repository fingerprint does not match the physical repository.");
  const { prefix, forks } = await inspectStreamForForks(root, registry, streamId, acceptedFingerprints);
  const dispositionedForks = await Promise.all(forks.map(async (fork) => Object.freeze({
    ...fork,
    disposition: await readForkDisposition(root, registry, streamId, fork.sequence, fork),
  })));
  return Object.freeze({
    schema: "pipeline.governance-event-fork-inspection.v1",
    streamId,
    repositoryFingerprint: registry.repositoryFingerprint,
    prefix: Object.freeze(prefix),
    forks: dispositionedForks,
  });
}

async function removeOrphanedTemporaryForkDispositions(dispositionRoot) {
  const entries = await readdir(dispositionRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (FORK_DISPOSITION_TEMP_FILE.test(entry.name) && entry.isFile()) await unlink(path.join(dispositionRoot, entry.name));
  }
}

/**
 * Record one durable, append-only governed disposition over a forked stream
 * position (K-AC-05). Called only from inside `recoverPortableGovernanceProjection`
 * when a caller supplies `disposition` — this is that same sanctioned
 * recovery operation's fork-aware branch, never a second operation living
 * beside it. It never rescans with the raw `scanStream` helper (which still
 * throws `GES-FORK` on this same stream) and it never writes `heads.json`. It
 * binds the exact forked sequence and the exact set of conflicting event
 * identifiers to reality via `inspectStreamForForks` before writing, stores
 * the disposition once at a path neither conflicting canonical file
 * occupies, and never deletes, renames, or rewrites either of them.
 * Recording a disposition does not make the stream normally writable or
 * readable again — every other exported operation, and an ordinary recovery
 * call without a matching disposition, keeps failing closed with `GES-FORK`
 * exactly as before; restoring write availability afterward is a separate,
 * out-of-scope policy decision.
 */
async function recordGovernanceForkDisposition(root, registry, streamId, disposition, acceptedFingerprints, now = new Date().toISOString()) {
  const stream = streamFor(registry, streamId);
  assertForkDisposition(disposition);
  const streamRoot = await ensureSafeDirectory(root, `${registry.storageRoot}/${stream.relativeRoot}`);
  return withExclusiveStreamLock(streamRoot, async () => {
    const inspection = await inspectStreamForForks(root, registry, streamId, acceptedFingerprints);
    const fork = inspection.forks.find((entry) => entry.sequence === disposition.sequence);
    if (!fork) fail("GES-FORK-DISPOSITION-MISMATCH", "The disposition does not name a sequence that is actually forked in this stream.");
    const actualEventIds = fork.entries.map((entry) => entry.eventId).sort();
    const namedEventIds = [...disposition.acknowledgedEventIds].sort();
    if (actualEventIds.length !== namedEventIds.length || actualEventIds.some((eventId, index) => eventId !== namedEventIds[index])) {
      fail("GES-FORK-DISPOSITION-MISMATCH", "The disposition's acknowledged event identifiers do not exactly match the conflicting entries at this sequence.");
    }
    // ADR-0072: reality-binding above proves the disposition names the fork
    // that exists; this proves a human with the repository's declared external
    // authority approved disposing of exactly THAT fork. Verified inside the
    // stream's exclusive lock and against the inspection just performed, so
    // the approved content digests cannot drift between check and write.
    const approval = authorizeForkDisposition(root, registry, streamId, disposition, fork, now);
    // A separate top-level sibling of `recovery`/`recovery-journal`, never a
    // child of the stream's own event directory: scanStream lists that
    // directory's direct entries and hard-fails on anything it does not
    // recognize (GES-UNSAFE-PATH), so a disposition artifact must live
    // outside it or every later scan of this stream would break on an
    // unrelated path instead of on GES-FORK.
    const dispositionRoot = await ensureSafeDirectory(root, `${registry.storageRoot}/fork-disposition/${streamId}`);
    // Same cleanup contract as `withExclusiveStreamLock`'s own
    // `removeOrphanedTemporaryEvents(streamRoot)`: a crash mid-`writeAtomic`
    // can leave an orphaned `.tmp` file here too, and this directory is never
    // otherwise swept while under the stream's exclusive lock.
    await removeOrphanedTemporaryForkDispositions(dispositionRoot);
    const relativePath = `${registry.storageRoot}/fork-disposition/${streamId}/${disposition.sequence}.json`;
    const target = repositoryPath(root, relativePath);
    const record = Object.freeze({
      schema: "pipeline.governance-fork-disposition.v1",
      repositoryFingerprint: registry.repositoryFingerprint,
      streamId,
      idempotencyKey: disposition.idempotencyKey,
      sequence: disposition.sequence,
      acknowledgedEventIds: namedEventIds,
      reasonCode: disposition.reasonCode,
      disposedAtEpochMs: disposition.disposedAtEpochMs,
      // A REFERENCE to the verified approval, never the raw proof: the record
      // is repository-public-safe storage, and re-embedding the signature
      // would duplicate a verifiable artifact into a place nothing re-verifies
      // it from. `pushApproval.lastApproved` references an approval the same way.
      approval,
    });
    const existing = await lstatOrNull(target);
    if (existing) {
      await assertNoSymlink(target, { directory: false });
      let existingRecord;
      try { existingRecord = parseStrictJson(await readFile(target)); } catch { fail("GES-FORK-DISPOSITION-RECORD", "The recorded fork disposition is not strict JSON."); }
      if (canonicalizeJson(existingRecord) !== canonicalizeJson(record)) fail("GES-FORK-DISPOSITION-CONFLICT", "A different fork disposition is already recorded for this stream position.");
      return Object.freeze({ status: "fork-disposition-idempotent-replay", streamId, sequence: disposition.sequence, path: relativePath, disposition: Object.freeze({ ...existingRecord }) });
    }
    await writeAtomic(target, `${canonicalizeJson(record)}\n`);
    await assertNoSymlink(target, { directory: false });
    let persisted;
    try { persisted = parseStrictJson(await readFile(target)); } catch { fail("GES-FORK-DISPOSITION-RECORD", "The recorded fork disposition is not strict JSON."); }
    if (canonicalSha256(persisted) !== canonicalSha256(record)) fail("GES-FORK-DISPOSITION-READBACK", "Fork disposition readback differs from the written record.");
    return Object.freeze({ status: "fork-disposition-recorded", streamId, sequence: disposition.sequence, path: relativePath, disposition: Object.freeze({ ...persisted }) });
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
