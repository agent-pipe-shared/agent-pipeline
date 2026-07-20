// SPDX-License-Identifier: Apache-2.0

/**
 * HAW-E's pre-mutation release-version decision only.  It has no git, remote,
 * tag, publication, or plan-sealing operation: callers supply already-fetched
 * channel observations plus annotated-tag/ancestry proof.
 */
import { createHash, randomBytes } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

export const RELEASE_VERSION_DECISION_SCHEMA = "pipeline.release-version-decision.v1";
export const RELEASE_VERSION_PLAN_SCHEMA = "pipeline.release-version-plan.v1";
export const RELEASE_VERSION_JOURNAL_SCHEMA = "pipeline.release-version-journal.v1";
export const DECISION_MAX_AGE_MS = 15 * 60 * 1000;
export const CHANNEL_FETCH_SKEW_MS = 5 * 60 * 1000;

const SHA256 = /^[0-9a-f]{64}$/u;
const OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const STABLE_VERSION = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/u;
const SAFE_REF = /^refs\/(?:heads|tags)\/[A-Za-z0-9._/-]+$/u;
const SAFE_REPOSITORY_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.?$)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._@+\-/]+$/u;
const VERSION_SURFACES = Object.freeze(["versionFile", "codexPlugin", "claudePlugin", "codexMarketplaceResolved", "claudeMarketplaceResolved"]);
const VERSION_SURFACE_PATHS = Object.freeze({
  versionFile: "VERSION",
  codexPlugin: "plugins/pipeline-core/.codex-plugin/plugin.json",
  claudePlugin: "plugins/pipeline-core/.claude-plugin/plugin.json",
  codexMarketplaceResolved: "plugins/pipeline-core/.codex-plugin/plugin.json",
  claudeMarketplaceResolved: "plugins/pipeline-core/.claude-plugin/plugin.json",
});

export class ReleaseVersionDecisionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ReleaseVersionDecisionError";
    this.code = code;
  }
}

function fail(code, message) { throw new ReleaseVersionDecisionError(code, message); }
function isPlainObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
function exactKeys(value, keys, label) {
  if (!isPlainObject(value)) fail("RVD-SHAPE", `${label} must be an object`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) fail("RVD-SHAPE", `${label} has an unexpected field set`);
}

/** Repository-canonical JSON: recursively lexicographic keys and JSON scalar bytes. */
export function canonicalJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new TypeError("canonical JSON accepts safe integers only");
    return String(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (!isPlainObject(value)) throw new TypeError("canonical JSON accepts plain JSON values only");
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

export function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function timestamp(value, label) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value)) fail("RVD-TIME", `${label} must be canonical UTC date-time`);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) fail("RVD-TIME", `${label} is not a valid date-time`);
  return parsed;
}

function parseStableVersion(value, label) {
  if (typeof value !== "string") fail("RVD-SEMVER", `${label} must be a stable SemVer string`);
  const match = STABLE_VERSION.exec(value);
  if (!match) fail("RVD-SEMVER", `${label} must omit prerelease/build metadata and leading zeroes`);
  return match.slice(1).map((part) => BigInt(part));
}

export function compareStableVersions(left, right) {
  const a = parseStableVersion(left, "left version");
  const b = parseStableVersion(right, "right version");
  for (let index = 0; index < 3; index += 1) {
    if (a[index] < b[index]) return -1;
    if (a[index] > b[index]) return 1;
  }
  return 0;
}

export function nextMinorVersion(version) {
  const [major, minor] = parseStableVersion(version, "baseline version");
  return `${major}.${minor + 1n}.0`;
}

const CHANNEL_KEYS = ["repositoryFingerprint", "ref", "commit", "tree", "highestStableTag", "highestStableVersion", "peeledCommit", "fetchedAt"];
function validateChannel(channel, label) {
  exactKeys(channel, CHANNEL_KEYS, `${label} channel`);
  if (!SHA256.test(channel.repositoryFingerprint)) fail("RVD-FINGERPRINT", `${label} repository fingerprint is invalid`);
  if (typeof channel.ref !== "string" || !SAFE_REF.test(channel.ref) || channel.ref.includes("..") || channel.ref.includes("//")) fail("RVD-REF", `${label} ref is invalid`);
  for (const key of ["commit", "tree", "peeledCommit"]) if (typeof channel[key] !== "string" || !OID.test(channel[key])) fail("RVD-OID", `${label} ${key} is invalid`);
  const stable = parseStableVersion(channel.highestStableVersion, `${label} highest stable version`);
  if (channel.highestStableTag !== `v${stable.join(".")}`) fail("RVD-TAG", `${label} stable tag does not exactly match its SemVer`);
  return timestamp(channel.fetchedAt, `${label} fetchedAt`);
}

function decisionPayload(decision) {
  return {
    private: decision.private,
    neutralPublic: decision.neutralPublic,
    targetVersion: decision.targetVersion,
    targetTag: decision.targetTag,
    observedAt: decision.observedAt,
  };
}

export function releaseVersionDecisionId(payload) {
  return sha256(`pipeline.release-version-decision.v1\0${canonicalJson(payload)}`);
}

function validateFreshness(decision, nowMs) {
  const observedMs = timestamp(decision.observedAt, "observedAt");
  const privateFetched = validateChannel(decision.private, "private");
  const neutralFetched = validateChannel(decision.neutralPublic, "neutral-public");
  if (privateFetched > observedMs || neutralFetched > observedMs) fail("RVD-TIME", "a fetched observation cannot be newer than observedAt");
  if (Math.abs(privateFetched - neutralFetched) > CHANNEL_FETCH_SKEW_MS) fail("RVD-FRESHNESS", "channel fetches exceed the allowed five-minute skew");
  for (const [label, value] of [["private fetchedAt", privateFetched], ["neutral-public fetchedAt", neutralFetched], ["observedAt", observedMs]]) {
    if (value > nowMs || nowMs - value > DECISION_MAX_AGE_MS) fail("RVD-FRESHNESS", `${label} is stale or in the future`);
  }
}

/** Validate the closed durable record and optionally re-check its freshness. */
export function validateReleaseVersionDecision(decision, { nowMs = null } = {}) {
  exactKeys(decision, ["schema", "decisionId", "private", "neutralPublic", "targetVersion", "targetTag", "observedAt"], "release version decision");
  if (decision.schema !== RELEASE_VERSION_DECISION_SCHEMA) fail("RVD-SCHEMA", "release version decision schema is invalid");
  if (typeof decision.decisionId !== "string" || !SHA256.test(decision.decisionId)) fail("RVD-ID", "release version decision ID is invalid");
  validateChannel(decision.private, "private");
  validateChannel(decision.neutralPublic, "neutral-public");
  parseStableVersion(decision.targetVersion, "target version");
  if (decision.targetTag !== `v${decision.targetVersion}`) fail("RVD-TAG", "target tag must exactly be v plus target version");
  const greaterBaseline = compareStableVersions(decision.private.highestStableVersion, decision.neutralPublic.highestStableVersion) >= 0
    ? decision.private.highestStableVersion
    : decision.neutralPublic.highestStableVersion;
  const expectedTarget = nextMinorVersion(greaterBaseline);
  if (decision.targetVersion !== expectedTarget || compareStableVersions(decision.targetVersion, decision.private.highestStableVersion) <= 0 || compareStableVersions(decision.targetVersion, decision.neutralPublic.highestStableVersion) <= 0) fail("RVD-TARGET", "target version must be the next minor above the greater channel baseline");
  if (decision.decisionId !== releaseVersionDecisionId(decisionPayload(decision))) fail("RVD-ID", "release version decision ID does not bind the complete observation");
  if (nowMs !== null) {
    if (!Number.isSafeInteger(nowMs) || nowMs < 0) fail("RVD-TIME", "observer clock is invalid");
    validateFreshness(decision, nowMs);
  }
  return true;
}

/**
 * Construct a decision from already-fetched facts.  The proof is deliberately
 * separate from the persisted closed record: it authorizes construction, but
 * neither proof prose nor a mutable Git response becomes release authority.
 */
export function createReleaseVersionDecision(input, { nowMs = Date.now() } = {}) {
  exactKeys(input, ["private", "neutralPublic", "proofs", "observedAt"], "release version decision input");
  exactKeys(input.proofs, ["private", "neutralPublic"], "channel proofs");
  for (const channel of ["private", "neutralPublic"]) {
    exactKeys(input.proofs[channel], ["annotated", "peeledCommitAncestor"], `${channel} proof`);
    if (input.proofs[channel].annotated !== true || input.proofs[channel].peeledCommitAncestor !== true) fail("RVD-TAG-PROOF", `${channel} requires an annotated tag whose peeled commit is ancestral to the observed ref`);
  }
  const greaterBaseline = compareStableVersions(input.private.highestStableVersion, input.neutralPublic.highestStableVersion) >= 0
    ? input.private.highestStableVersion
    : input.neutralPublic.highestStableVersion;
  const targetVersion = nextMinorVersion(greaterBaseline);
  const candidate = {
    schema: RELEASE_VERSION_DECISION_SCHEMA,
    decisionId: "0".repeat(64),
    private: structuredClone(input.private),
    neutralPublic: structuredClone(input.neutralPublic),
    targetVersion,
    targetTag: `v${targetVersion}`,
    observedAt: input.observedAt,
  };
  candidate.decisionId = releaseVersionDecisionId(decisionPayload(candidate));
  validateReleaseVersionDecision(candidate, { nowMs });
  return candidate;
}

function assertPhysicalDirectory(path, label, { privateMode = false } = {}) {
  const resolved = resolve(path);
  const info = lstatSync(resolved);
  if (!info.isDirectory() || info.isSymbolicLink() || realpathSync(resolved) !== resolved) fail("RVD-STORAGE", `${label} must be a physical directory`);
  if (privateMode && ((info.mode & 0o077) !== 0 || (typeof process.getuid === "function" && info.uid !== process.getuid()))) fail("RVD-STORAGE", `${label} must be owner-only`);
  return resolved;
}

function ensurePrivateDirectory(path) {
  const resolved = resolve(path);
  const parent = dirname(resolved);
  if (!existsSync(parent)) ensurePrivateDirectory(parent);
  else assertPhysicalDirectory(parent, "private record parent", { privateMode: parent.includes(`${join("agent-pipeline", "releases")}`) });
  if (!existsSync(resolved)) mkdirSync(resolved, { mode: 0o700 });
  return assertPhysicalDirectory(resolved, "private record directory", { privateMode: true });
}

function assertPrivateFile(path) {
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || (info.mode & 0o077) !== 0 || (typeof process.getuid === "function" && info.uid !== process.getuid())) fail("RVD-STORAGE", "release decision record is not a private single-link file");
}

export function releaseVersionDecisionPath({ gitCommonDir, repoFingerprint, decisionId }) {
  if (typeof gitCommonDir !== "string" || !isAbsolute(gitCommonDir)) fail("RVD-STORAGE", "git common directory must be absolute");
  assertPhysicalDirectory(gitCommonDir, "git common directory");
  if (!SHA256.test(repoFingerprint) || !SHA256.test(decisionId)) fail("RVD-STORAGE", "release decision path identifiers are invalid");
  return join(resolve(gitCommonDir), "agent-pipeline", "releases", repoFingerprint, "decisions", `${decisionId}.json`);
}

function fsyncDirectory(path) {
  const fd = openSync(path, "r");
  try { fsyncSync(fd); } finally { closeSync(fd); }
}

/** Store only at the fixed decision-ID path.  Exact replay is a zero-write; any other bytes conflict. */
export function storeReleaseVersionDecision({ gitCommonDir, repoFingerprint, decision }, { nowMs = Date.now() } = {}) {
  validateReleaseVersionDecision(decision, { nowMs });
  const path = releaseVersionDecisionPath({ gitCommonDir, repoFingerprint, decisionId: decision.decisionId });
  const directory = ensurePrivateDirectory(dirname(path));
  const bytes = canonicalJson(decision);
  if (existsSync(path)) {
    assertPrivateFile(path);
    if (readFileSync(path, "utf8") !== bytes) fail("RVD-CONFLICT", "release decision ID already names different bytes");
    return { status: "replay", path, sha256: sha256(bytes) };
  }
  const temporary = join(directory, `.${decision.decisionId}.${randomBytes(12).toString("hex")}.tmp`);
  const fd = openSync(temporary, "wx", 0o600);
  try {
    writeFileSync(fd, bytes, "utf8");
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  try {
    linkSync(temporary, path);
  } catch (error) {
    unlinkSync(temporary);
    if (error?.code === "EEXIST") return storeReleaseVersionDecision({ gitCommonDir, repoFingerprint, decision }, { nowMs });
    throw error;
  }
  unlinkSync(temporary);
  assertPrivateFile(path);
  fsyncDirectory(directory);
  return { status: "stored", path, sha256: sha256(bytes) };
}

function validateCandidate(candidate, label) {
  exactKeys(candidate, ["repositoryFingerprint", "commit", "tree"], `${label} product candidate`);
  if (!SHA256.test(candidate.repositoryFingerprint)) fail("RVP-CANDIDATE", `${label} product candidate fingerprint is invalid`);
  for (const key of ["commit", "tree"]) if (!OID.test(candidate[key] ?? "")) fail("RVP-CANDIDATE", `${label} product candidate ${key} is invalid`);
}

function validateExternalPrerequisite(value) {
  exactKeys(value, ["itemId", "closureCommit", "resultSha256", "transitionSha256", "privateLicenseGateSha256", "neutralPublicLicenseGateSha256"], "external prerequisite");
  if (value.itemId !== "pipeline.source-available-commercial-licensing") fail("RVP-PREREQUISITE", "external prerequisite item is invalid");
  if (!OID.test(value.closureCommit ?? "")) fail("RVP-PREREQUISITE", "external prerequisite closure commit is invalid");
  for (const key of ["resultSha256", "transitionSha256", "privateLicenseGateSha256", "neutralPublicLicenseGateSha256"]) if (!SHA256.test(value[key] ?? "")) fail("RVP-PREREQUISITE", `external prerequisite ${key} is invalid`);
}

function validateRecovery(value) {
  if (value === null) return;
  exactKeys(value, ["compensationId", "compensationSha256"], "recovery");
  if (!SHA256.test(value.compensationId ?? "") || !SHA256.test(value.compensationSha256 ?? "")) fail("RVP-RECOVERY", "recovery record is invalid");
}

function validateVersions(versions, targetVersion) {
  exactKeys(versions, VERSION_SURFACES, "release versions");
  for (const surface of VERSION_SURFACES) {
    parseStableVersion(versions[surface], `${surface} version`);
    if (versions[surface] !== targetVersion) fail("RVP-VERSION", `${surface} must equal targetVersion`);
  }
}

function validateSurfaceDigestRecord(record, label) {
  exactKeys(record, ["surface", "path", "sha256"], `${label} surface digest`);
  if (!VERSION_SURFACES.includes(record.surface)) fail("RVP-SURFACE", `${label} surface is invalid`);
  if (record.path !== VERSION_SURFACE_PATHS[record.surface] || !SAFE_REPOSITORY_PATH.test(record.path)) fail("RVP-SURFACE", `${label} surface path is invalid`);
  if (!SHA256.test(record.sha256 ?? "")) fail("RVP-SURFACE", `${label} surface digest is invalid`);
}

function validateSurfaceDigestChannel(records, label) {
  if (!Array.isArray(records) || records.length !== VERSION_SURFACES.length) fail("RVP-SURFACE", `${label} must have exactly five version surfaces`);
  const seen = new Set();
  for (const record of records) {
    validateSurfaceDigestRecord(record, label);
    if (seen.has(record.surface)) fail("RVP-SURFACE", `${label} duplicates a version surface`);
    seen.add(record.surface);
  }
  for (const surface of VERSION_SURFACES) if (!seen.has(surface)) fail("RVP-SURFACE", `${label} omits a version surface`);
}

function validateSurfaceDigests(surfaceDigests) {
  exactKeys(surfaceDigests, ["private", "neutralPublic"], "surface digests");
  validateSurfaceDigestChannel(surfaceDigests.private, "private");
  validateSurfaceDigestChannel(surfaceDigests.neutralPublic, "neutral-public");
}

function planPayload(plan) {
  return {
    decisionId: plan.decisionId,
    decisionSha256: plan.decisionSha256,
    evidenceRevision: plan.evidenceRevision,
    documentEvidenceSha256: plan.documentEvidenceSha256,
    externalPrerequisite: plan.externalPrerequisite,
    targetVersion: plan.targetVersion,
    targetTag: plan.targetTag,
    privateProductCandidate: plan.privateProductCandidate,
    neutralPublicProductCandidate: plan.neutralPublicProductCandidate,
    versions: plan.versions,
    surfaceDigests: plan.surfaceDigests,
    recovery: plan.recovery,
  };
}

export function releaseVersionPlanId(payload) {
  return sha256(`pipeline.release-version-plan.v1\0${canonicalJson(payload)}`);
}

/**
 * Derive the five exact release-version values and their channel-bound raw
 * digests.  Marketplace inputs are already resolved provider manifests; this
 * helper deliberately does not fetch, read a tree, or invoke a marketplace.
 */
export function deriveVersionSurfaceConsistency(versionSurfaces, targetVersion) {
  parseStableVersion(targetVersion, "target version");
  exactKeys(versionSurfaces, ["private", "neutralPublic"], "version surfaces");
  const derived = {};
  for (const channel of ["private", "neutralPublic"]) {
    const entries = versionSurfaces[channel];
    if (!Array.isArray(entries) || entries.length !== VERSION_SURFACES.length) fail("RVP-SURFACE", `${channel} must supply exactly five version surfaces`);
    const bySurface = new Map();
    for (const entry of entries) {
      exactKeys(entry, ["surface", "path", "bytes"], `${channel} version surface`);
      if (!VERSION_SURFACES.includes(entry.surface) || bySurface.has(entry.surface)) fail("RVP-SURFACE", `${channel} version surface set is invalid`);
      if (entry.path !== VERSION_SURFACE_PATHS[entry.surface] || !SAFE_REPOSITORY_PATH.test(entry.path) || typeof entry.bytes !== "string") fail("RVP-SURFACE", `${channel} version surface bytes/path are invalid`);
      bySurface.set(entry.surface, entry);
    }
    const records = [];
    for (const surface of VERSION_SURFACES) {
      const entry = bySurface.get(surface);
      if (!entry) fail("RVP-SURFACE", `${channel} omits ${surface}`);
      let version;
      if (surface === "versionFile") {
        if (entry.bytes !== `${targetVersion}\n`) fail("RVP-VERSION", "VERSION bytes must be exactly targetVersion plus newline");
        version = targetVersion;
      } else {
        let manifest;
        try { manifest = JSON.parse(entry.bytes); } catch { fail("RVP-VERSION", `${channel} ${surface} is not JSON`); }
        if (!isPlainObject(manifest) || typeof manifest.version !== "string") fail("RVP-VERSION", `${channel} ${surface} has no string version`);
        version = manifest.version;
      }
      parseStableVersion(version, `${channel} ${surface} version`);
      if (version !== targetVersion) fail("RVP-VERSION", `${channel} ${surface} does not equal targetVersion`);
      records.push({ surface, path: entry.path, sha256: sha256(entry.bytes) });
    }
    derived[channel] = { records, versionFileBytes: bySurface.get("versionFile").bytes };
  }
  if (derived.private.versionFileBytes !== derived.neutralPublic.versionFileBytes) fail("RVP-VERSION", "private and neutral-public VERSION bytes differ");
  return {
    versions: Object.fromEntries(VERSION_SURFACES.map((surface) => [surface, targetVersion])),
    surfaceDigests: { private: derived.private.records, neutralPublic: derived.neutralPublic.records },
  };
}

/** Validate the immutable sealed plan without dereferencing external evidence or licensing state. */
export function validateReleaseVersionPlan(plan, { decision = null, nowMs = null } = {}) {
  exactKeys(plan, ["schema", "planId", "decisionId", "decisionSha256", "evidenceRevision", "documentEvidenceSha256", "externalPrerequisite", "targetVersion", "targetTag", "privateProductCandidate", "neutralPublicProductCandidate", "versions", "surfaceDigests", "recovery", "status", "createdAt"], "release version plan");
  if (plan.schema !== RELEASE_VERSION_PLAN_SCHEMA || plan.status !== "sealed") fail("RVP-SCHEMA", "release version plan schema/status is invalid");
  if (!SHA256.test(plan.planId ?? "") || !SHA256.test(plan.decisionId ?? "") || !SHA256.test(plan.decisionSha256 ?? "") || !SHA256.test(plan.documentEvidenceSha256 ?? "")) fail("RVP-DIGEST", "release version plan digest is invalid");
  if (!Number.isSafeInteger(plan.evidenceRevision) || plan.evidenceRevision < 1) fail("RVP-EVIDENCE", "release version plan evidence revision is invalid");
  validateExternalPrerequisite(plan.externalPrerequisite);
  parseStableVersion(plan.targetVersion, "target version");
  if (plan.targetTag !== `v${plan.targetVersion}`) fail("RVP-VERSION", "target tag does not match target version");
  validateCandidate(plan.privateProductCandidate, "private");
  validateCandidate(plan.neutralPublicProductCandidate, "neutral-public");
  validateVersions(plan.versions, plan.targetVersion);
  validateSurfaceDigests(plan.surfaceDigests);
  validateRecovery(plan.recovery);
  timestamp(plan.createdAt, "plan createdAt");
  if (plan.planId !== releaseVersionPlanId(planPayload(plan))) fail("RVP-ID", "plan ID does not bind its complete sealed payload");
  if (decision === null) fail("RVP-DECISION", "a plan validator requires its fixed decision record");
  validateReleaseVersionDecision(decision, nowMs === null ? {} : { nowMs });
  if (plan.decisionId !== decision.decisionId || plan.decisionSha256 !== sha256(canonicalJson(decision)) || plan.targetVersion !== decision.targetVersion || plan.targetTag !== decision.targetTag) fail("RVP-DECISION", "plan does not bind the supplied current decision");
  if (plan.privateProductCandidate.repositoryFingerprint !== decision.private.repositoryFingerprint || plan.neutralPublicProductCandidate.repositoryFingerprint !== decision.neutralPublic.repositoryFingerprint) fail("RVP-CANDIDATE", "product candidate channel fingerprints do not bind the decision");
  return true;
}

/** Build a sealed plan from a current decision and caller-supplied immutable inputs. */
export function createReleaseVersionPlan(input, { nowMs = Date.now() } = {}) {
  exactKeys(input, ["decision", "evidenceRevision", "documentEvidenceSha256", "externalPrerequisite", "privateProductCandidate", "neutralPublicProductCandidate", "versionSurfaces", "recovery", "createdAt"], "release version plan input");
  validateReleaseVersionDecision(input.decision, { nowMs });
  if (!Number.isSafeInteger(input.evidenceRevision) || input.evidenceRevision < 1 || !SHA256.test(input.documentEvidenceSha256 ?? "")) fail("RVP-EVIDENCE", "plan evidence binding is invalid");
  validateExternalPrerequisite(input.externalPrerequisite);
  validateCandidate(input.privateProductCandidate, "private");
  validateCandidate(input.neutralPublicProductCandidate, "neutral-public");
  if (input.privateProductCandidate.repositoryFingerprint !== input.decision.private.repositoryFingerprint || input.neutralPublicProductCandidate.repositoryFingerprint !== input.decision.neutralPublic.repositoryFingerprint) fail("RVP-CANDIDATE", "product candidate fingerprint does not match its decision channel");
  validateRecovery(input.recovery);
  timestamp(input.createdAt, "plan createdAt");
  const consistent = deriveVersionSurfaceConsistency(input.versionSurfaces, input.decision.targetVersion);
  const plan = {
    schema: RELEASE_VERSION_PLAN_SCHEMA,
    planId: "0".repeat(64),
    decisionId: input.decision.decisionId,
    decisionSha256: sha256(canonicalJson(input.decision)),
    evidenceRevision: input.evidenceRevision,
    documentEvidenceSha256: input.documentEvidenceSha256,
    externalPrerequisite: structuredClone(input.externalPrerequisite),
    targetVersion: input.decision.targetVersion,
    targetTag: input.decision.targetTag,
    privateProductCandidate: structuredClone(input.privateProductCandidate),
    neutralPublicProductCandidate: structuredClone(input.neutralPublicProductCandidate),
    versions: consistent.versions,
    surfaceDigests: consistent.surfaceDigests,
    recovery: structuredClone(input.recovery),
    status: "sealed",
    createdAt: input.createdAt,
  };
  plan.planId = releaseVersionPlanId(planPayload(plan));
  validateReleaseVersionPlan(plan, { decision: input.decision, nowMs });
  return plan;
}

function releasePlanDirectory(gitCommonDir, repoFingerprint) {
  if (typeof gitCommonDir !== "string" || !isAbsolute(gitCommonDir)) fail("RVP-STORAGE", "git common directory must be absolute");
  assertPhysicalDirectory(gitCommonDir, "git common directory");
  if (!SHA256.test(repoFingerprint)) fail("RVP-STORAGE", "release plan repository fingerprint is invalid");
  return join(resolve(gitCommonDir), "agent-pipeline", "releases", repoFingerprint, "plans");
}

export function releaseVersionPlanPath({ gitCommonDir, repoFingerprint, planId }) {
  if (!SHA256.test(planId ?? "")) fail("RVP-STORAGE", "release plan ID is invalid");
  return join(releasePlanDirectory(gitCommonDir, repoFingerprint), `${planId}.json`);
}

export function releaseVersionPlanJournalPath({ gitCommonDir, repoFingerprint, planId }) {
  if (!SHA256.test(planId ?? "")) fail("RVP-STORAGE", "release plan ID is invalid");
  return join(releasePlanDirectory(gitCommonDir, repoFingerprint), `${planId}.journal.json`);
}

function canonicalUtcFromMs(nowMs) {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) fail("RVP-TIME", "journal observer clock is invalid");
  return new Date(nowMs).toISOString();
}

function privateNoReplace(path, bytes, label) {
  const directory = ensurePrivateDirectory(dirname(path));
  if (existsSync(path)) {
    assertPrivateFile(path);
    if (readFileSync(path, "utf8") !== bytes) fail("RVP-CONFLICT", `${label} path already names different bytes`);
    return false;
  }
  const temporary = join(directory, `.${randomBytes(12).toString("hex")}.tmp`);
  const fd = openSync(temporary, "wx", 0o600);
  try { writeFileSync(fd, bytes, "utf8"); fsyncSync(fd); } finally { closeSync(fd); }
  try {
    linkSync(temporary, path);
  } catch (error) {
    unlinkSync(temporary);
    if (error?.code === "EEXIST") return privateNoReplace(path, bytes, label);
    throw error;
  }
  unlinkSync(temporary);
  assertPrivateFile(path);
  fsyncDirectory(directory);
  return true;
}

function replacePrivateExact(path, beforeBytes, afterBytes, label) {
  assertPrivateFile(path);
  if (readFileSync(path, "utf8") !== beforeBytes) fail("RVP-RECOVERY", `${label} changed outside its journalled state`);
  const directory = ensurePrivateDirectory(dirname(path));
  const temporary = join(directory, `.${randomBytes(12).toString("hex")}.tmp`);
  const fd = openSync(temporary, "wx", 0o600);
  try { writeFileSync(fd, afterBytes, "utf8"); fsyncSync(fd); } finally { closeSync(fd); }
  try { renameSync(temporary, path); } catch (error) { try { unlinkSync(temporary); } catch {} throw error; }
  assertPrivateFile(path);
  fsyncDirectory(directory);
}

function journalRecordBytes(journal) {
  if (typeof journal?.recordBytesBase64 !== "string") fail("RVP-JOURNAL", "release plan journal bytes are missing");
  const bytes = Buffer.from(journal.recordBytesBase64, "base64");
  if (bytes.length === 0 || bytes.toString("base64") !== journal.recordBytesBase64 || sha256(bytes) !== journal.recordSha256) fail("RVP-JOURNAL", "release plan journal record bytes are invalid");
  return bytes.toString("utf8");
}

function validateReleaseVersionPlanJournal(journal, { gitCommonDir, repoFingerprint, planId, decision, nowMs = null }) {
  exactKeys(journal, ["schema", "repoFingerprint", "kind", "recordId", "recordPath", "recordBytesBase64", "recordSha256", "phase", "createdAt"], "release plan journal");
  if (journal.schema !== RELEASE_VERSION_JOURNAL_SCHEMA || journal.kind !== "plan" || journal.repoFingerprint !== repoFingerprint || journal.recordId !== planId || !["prepared", "record-durable", "complete"].includes(journal.phase)) fail("RVP-JOURNAL", "release plan journal identity or phase is invalid");
  timestamp(journal.createdAt, "journal createdAt");
  const expectedPath = releaseVersionPlanPath({ gitCommonDir, repoFingerprint, planId });
  if (journal.recordPath !== expectedPath || !SHA256.test(journal.recordSha256 ?? "")) fail("RVP-JOURNAL", "release plan journal path or digest is invalid");
  const bytes = journalRecordBytes(journal);
  let plan;
  try { plan = JSON.parse(bytes); } catch { fail("RVP-JOURNAL", "release plan journal bytes are not JSON"); }
  if (canonicalJson(plan) !== bytes || plan.planId !== planId) fail("RVP-JOURNAL", "release plan journal bytes are not canonical for the requested ID");
  validateReleaseVersionPlan(plan, { decision, nowMs });
  return { bytes, plan };
}

/** Build the exact journal before any release-plan record mutation. */
export function createReleaseVersionPlanJournal({ gitCommonDir, repoFingerprint, plan, decision, createdAt }) {
  validateReleaseVersionPlan(plan, { decision });
  const recordPath = releaseVersionPlanPath({ gitCommonDir, repoFingerprint, planId: plan.planId });
  const recordBytes = canonicalJson(plan);
  const journal = {
    schema: RELEASE_VERSION_JOURNAL_SCHEMA,
    repoFingerprint,
    kind: "plan",
    recordId: plan.planId,
    recordPath,
    recordBytesBase64: Buffer.from(recordBytes, "utf8").toString("base64"),
    recordSha256: sha256(recordBytes),
    phase: "prepared",
    createdAt,
  };
  validateReleaseVersionPlanJournal(journal, { gitCommonDir, repoFingerprint, planId: plan.planId, decision });
  return journal;
}

function advanceReleaseVersionPlanJournal(path, journal, phase, context) {
  const expected = journal.phase === "prepared" ? "record-durable" : journal.phase === "record-durable" ? "complete" : null;
  if (phase !== expected) fail("RVP-JOURNAL", "release plan journal phase is not adjacent");
  const next = { ...journal, phase };
  validateReleaseVersionPlanJournal(next, context);
  replacePrivateExact(path, canonicalJson(journal), canonicalJson(next), "release plan journal");
  return next;
}

/**
 * Recover one named plan only.  Absent/exact record bytes are the only accepted
 * states; a third byte sequence stops recovery before it can overwrite data.
 */
export function recoverReleaseVersionPlan({ gitCommonDir, repoFingerprint, planId, decision }, { nowMs = Date.now() } = {}) {
  const journalPath = releaseVersionPlanJournalPath({ gitCommonDir, repoFingerprint, planId });
  if (!existsSync(journalPath)) fail("RVP-RECOVERY", "release plan journal is absent; recovery will not scan or infer a record");
  assertPrivateFile(journalPath);
  let journal;
  try { journal = JSON.parse(readFileSync(journalPath, "utf8")); } catch { fail("RVP-RECOVERY", "release plan journal is malformed"); }
  const context = { gitCommonDir, repoFingerprint, planId, decision, nowMs };
  const { bytes, plan } = validateReleaseVersionPlanJournal(journal, context);
  const recordPath = releaseVersionPlanPath({ gitCommonDir, repoFingerprint, planId });
  let wroteRecord = false;
  if (!existsSync(recordPath)) wroteRecord = privateNoReplace(recordPath, bytes, "release plan record");
  else {
    assertPrivateFile(recordPath);
    if (readFileSync(recordPath, "utf8") !== bytes) fail("RVP-RECOVERY", "release plan record has third bytes");
  }
  if (journal.phase === "prepared") journal = advanceReleaseVersionPlanJournal(journalPath, journal, "record-durable", context);
  if (journal.phase === "record-durable") journal = advanceReleaseVersionPlanJournal(journalPath, journal, "complete", context);
  return { status: wroteRecord ? "stored" : "recovered", plan, path: recordPath, journalPath, recordSha256: sha256(bytes) };
}

/** Persist/replay one sealed plan through its explicit-ID journal. */
export function storeReleaseVersionPlan({ gitCommonDir, repoFingerprint, plan, decision }, { nowMs = Date.now() } = {}) {
  validateReleaseVersionPlan(plan, { decision, nowMs });
  const recordPath = releaseVersionPlanPath({ gitCommonDir, repoFingerprint, planId: plan.planId });
  const journalPath = releaseVersionPlanJournalPath({ gitCommonDir, repoFingerprint, planId: plan.planId });
  const bytes = canonicalJson(plan);
  if (!existsSync(journalPath)) {
    if (existsSync(recordPath)) fail("RVP-RECOVERY", "release plan record exists without its retained explicit-ID journal");
    const journal = createReleaseVersionPlanJournal({ gitCommonDir, repoFingerprint, plan, decision, createdAt: canonicalUtcFromMs(nowMs) });
    privateNoReplace(journalPath, canonicalJson(journal), "release plan journal");
  } else {
    assertPrivateFile(journalPath);
    let existing;
    try { existing = JSON.parse(readFileSync(journalPath, "utf8")); } catch { fail("RVP-RECOVERY", "release plan journal is malformed"); }
    const checked = validateReleaseVersionPlanJournal(existing, { gitCommonDir, repoFingerprint, planId: plan.planId, decision, nowMs });
    if (checked.bytes !== bytes) fail("RVP-CONFLICT", "release plan ID already has a different journalled record");
  }
  const result = recoverReleaseVersionPlan({ gitCommonDir, repoFingerprint, planId: plan.planId, decision }, { nowMs });
  return { ...result, status: result.status === "stored" ? "stored" : "replay" };
}
