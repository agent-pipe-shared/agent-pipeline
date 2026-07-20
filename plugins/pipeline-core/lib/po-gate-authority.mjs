// SPDX-License-Identifier: Apache-2.0

/**
 * Repository-scoped PO-language and single-PRD authority.
 *
 * The module is deliberately read-only. Setup owns receipt publication and the
 * state writer owns approval mutation; this module only constructs/serializes a
 * closed local receipt and validates an observed filesystem snapshot.
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from "node:fs";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { TextDecoder } from "node:util";

import { parseYaml } from "./yaml-lite.mjs";

export const PO_GATE_PROFILE_RECEIPT_SCHEMA = "pipeline.po-gate-profile-receipt.v1";
export const PO_GATE_AUTHORITY_EVIDENCE_SCHEMA = "pipeline.po-gate-authority-evidence.v1";
export const PO_GATE_AUTHORITY_EVIDENCE_V2_SCHEMA = "pipeline.po-gate-authority.v2";
export const PO_GATE_PROFILE_RECEIPT_RELATIVE_PATH = join(
  "agent-pipeline",
  "po-gate",
  "profile-receipt.json",
);
export const PO_GATE_PRD_LANGUAGE_MARKER = (language) => `<!-- po-language: ${language} -->`;

const SUPPORTED_LANGUAGES = new Set(["de", "en"]);
const SHA256 = /^[0-9a-f]{64}$/u;
const PRD_NAME = /^prd_[^/\\]+\.md$/u;
const PRD_LANGUAGE_MARKER = /^<!-- po-language: (de|en) -->$/gmu;
const TECHNICAL_SPEC_MARKER = /^<!-- technical-spec-sha256: ([0-9a-f]{64}) -->$/gmu;
const RECEIPT_KEYS = [
  "schema",
  "repositoryFingerprint",
  "canonicalPrimaryRoot",
  "sourceSha256",
  "runtimeSha256",
  "humanFacing",
  "updatedAt",
];
const PROFILE_REPAIR = "Run node setup.mjs --publish-po-profile from the canonical primary checkout, then retry.";
const PRD_REPAIR = "Repair activeFeature.planPath and the active feature directory; do not create child PRDs.";
const UTF8 = new TextDecoder("utf-8", { fatal: true });

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function decodeUtf8(value) {
  return UTF8.decode(Buffer.from(value));
}

function fail(code, reason, repair) {
  return { ok: false, code, reason, repair };
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value, expected) {
  return isPlainObject(value)
    && Object.keys(value).length === expected.length
    && expected.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function isCanonicalIso(value) {
  if (typeof value !== "string") return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value;
}

function normalizeAbsolute(path) {
  if (typeof path !== "string" || !isAbsolute(path) || path.includes("\0")) return null;
  const normalized = resolve(path);
  return normalized === path ? normalized : null;
}

function inside(root, candidate) {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

function assertPhysicalDirectory(path) {
  const absolute = normalizeAbsolute(path);
  if (absolute === null) throw new Error("unsafe directory");
  const info = lstatSync(absolute);
  if (!info.isDirectory() || info.isSymbolicLink() || realpathSync(absolute) !== absolute) {
    throw new Error("unsafe directory");
  }
  return absolute;
}

function physicalPath(root, relativePath, kind) {
  const rootReal = assertPhysicalDirectory(root);
  const normalized = normalizeRepositoryPath(relativePath);
  if (normalized === null) throw new Error("unsafe relative path");
  let cursor = rootReal;
  for (const component of normalized.split("/")) {
    cursor = join(cursor, component);
    const info = lstatSync(cursor);
    if (info.isSymbolicLink()) throw new Error("symlink is not allowed");
  }
  const real = realpathSync(cursor);
  if (!inside(rootReal, real) || real !== cursor) throw new Error("physical path escapes root");
  const info = lstatSync(cursor);
  if (kind === "file" && !info.isFile()) throw new Error("regular file required");
  if (kind === "directory" && !info.isDirectory()) throw new Error("directory required");
  return cursor;
}

function readPhysicalFile(root, relativePath) {
  const path = physicalPath(root, relativePath, "file");
  let descriptor;
  try {
    descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const before = fstatSync(descriptor);
    if (!before.isFile()) throw new Error("regular file required");
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    const lexicalAfter = lstatSync(path);
    if (
      lexicalAfter.isSymbolicLink()
      || !lexicalAfter.isFile()
      || before.dev !== after.dev
      || before.ino !== after.ino
      || before.mode !== after.mode
      || before.size !== after.size
      || before.mtimeMs !== after.mtimeMs
      || after.dev !== lexicalAfter.dev
      || after.ino !== lexicalAfter.ino
      || realpathSync(path) !== path
    ) throw new Error("file identity changed during read");
    return bytes;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function configuredLanguage(sourceBytes, runtimeBytes) {
  try {
    const source = parseYaml(decodeUtf8(sourceBytes));
    const runtime = parseYaml(decodeUtf8(runtimeBytes));
    const sourceLanguage = source?.language?.human_facing;
    const runtimeLanguage = runtime?.language?.human_facing;
    if (!SUPPORTED_LANGUAGES.has(sourceLanguage) || !SUPPORTED_LANGUAGES.has(runtimeLanguage)) return null;
    if (sourceLanguage !== runtimeLanguage) return null;
    return sourceLanguage;
  } catch {
    return null;
  }
}

/**
 * Validate only the PO-facing language pair. Runner schema, routing and profile
 * migration deliberately remain outside this narrow repository authority.
 */
export function validatePoGateLanguageProjection(sourceBytes, runtimeBytes) {
  const humanFacing = configuredLanguage(sourceBytes, runtimeBytes);
  return humanFacing === null
    ? fail(
      "PO-PROFILE-PROJECTION-INVALID",
      "The canonical primary source/runtime PO-language projection is missing, unsupported or inconsistent.",
      PROFILE_REPAIR,
    )
    : { ok: true, code: "PO-PROFILE-PROJECTION-VALID", humanFacing };
}

/** Reject absolute, platform-specific, aliasing and traversal forms. */
export function normalizeRepositoryPath(value) {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.includes("\0")
    || value.includes("\\")
    || value.startsWith("/")
    || /^[A-Za-z]:/u.test(value)
  ) return null;
  const parts = value.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) return null;
  return parts.join("/");
}

/** Local fingerprint. Its path inputs are hashed and never returned as evidence. */
export function derivePoGateRepositoryFingerprint({ gitCommonDir, primaryRoot }) {
  const common = normalizeAbsolute(gitCommonDir);
  const primary = normalizeAbsolute(primaryRoot);
  if (common === null || primary === null) throw new TypeError("canonical absolute roots are required");
  return sha256(`pipeline.po-gate.repository.v1\0${common}\0${primary}`);
}

export function poGateProfileReceiptPath(gitCommonDir) {
  const common = normalizeAbsolute(gitCommonDir);
  if (common === null) throw new TypeError("canonical Git common directory is required");
  return join(common, PO_GATE_PROFILE_RECEIPT_RELATIVE_PATH);
}

export function validatePoGateProfileReceipt(receipt) {
  if (!hasExactKeys(receipt, RECEIPT_KEYS)) return false;
  return receipt.schema === PO_GATE_PROFILE_RECEIPT_SCHEMA
    && SHA256.test(receipt.repositoryFingerprint)
    && normalizeAbsolute(receipt.canonicalPrimaryRoot) !== null
    && SHA256.test(receipt.sourceSha256)
    && SHA256.test(receipt.runtimeSha256)
    && SUPPORTED_LANGUAGES.has(receipt.humanFacing)
    && isCanonicalIso(receipt.updatedAt);
}

/** Build the closed machine-local receipt after setup has validated its inputs. */
export function createPoGateProfileReceipt({
  repositoryFingerprint,
  primaryRoot,
  sourceBytes,
  runtimeBytes,
  updatedAt,
}) {
  const canonicalPrimaryRoot = normalizeAbsolute(primaryRoot);
  const projection = validatePoGateLanguageProjection(sourceBytes, runtimeBytes);
  const humanFacing = projection.ok ? projection.humanFacing : null;
  if (!SHA256.test(repositoryFingerprint) || canonicalPrimaryRoot === null || humanFacing === null || !isCanonicalIso(updatedAt)) {
    throw new TypeError("invalid PO-gate profile receipt input");
  }
  return {
    schema: PO_GATE_PROFILE_RECEIPT_SCHEMA,
    repositoryFingerprint,
    canonicalPrimaryRoot,
    sourceSha256: sha256(sourceBytes),
    runtimeSha256: sha256(runtimeBytes),
    humanFacing,
    updatedAt,
  };
}

export function serializePoGateProfileReceipt(receipt) {
  if (!validatePoGateProfileReceipt(receipt)) throw new TypeError("invalid PO-gate profile receipt");
  const ordered = Object.fromEntries(RECEIPT_KEYS.map((key) => [key, receipt[key]]));
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

/** Parse `git worktree list --porcelain -z` without exposing paths in errors. */
export function parseGitWorktreeList(raw) {
  if (typeof raw !== "string" || !raw.endsWith("\0")) return null;
  const records = raw.split("\0\0").filter((record) => record.length > 0);
  const entries = [];
  for (const record of records) {
    const fields = record.split("\0").filter(Boolean);
    if (!fields[0]?.startsWith("worktree ")) return null;
    const root = fields[0].slice("worktree ".length);
    if (normalizeAbsolute(root) === null) return null;
    const head = fields.find((field) => field.startsWith("HEAD "))?.slice(5);
    const branch = fields.find((field) => field.startsWith("branch "))?.slice(7) ?? null;
    const detached = fields.includes("detached");
    if (!/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/u.test(head ?? "") || (branch === null) === !detached) return null;
    entries.push({ root, head, branch, detached });
  }
  if (entries.length === 0 || new Set(entries.map(({ root }) => root)).size !== entries.length) return null;
  return entries;
}

export function selectPrimaryWorktree(entries) {
  return Array.isArray(entries) && entries.length > 0 ? entries[0] : null;
}

export function isSuccessfulGitEpermObservation(result) {
  return result?.status === 0
    && result?.error?.code === "EPERM"
    && typeof result.stdout === "string";
}

function gitObservation(root, args, spawn = spawnSync) {
  const result = spawn("git", args, {
    cwd: root,
    encoding: "utf8",
    shell: false,
    timeout: 5000,
    env: {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
      GIT_TERMINAL_PROMPT: "0",
    },
  });
  if (result.status !== 0 || (result.error && !isSuccessfulGitEpermObservation(result)) || typeof result.stdout !== "string") {
    throw new Error("Git topology unavailable");
  }
  return result.stdout;
}

/** Resolve the current/common/primary topology without trusting launch-directory aliases. */
export function resolvePoGateRepositoryTopology(repoRoot, deps = {}) {
  const start = assertPhysicalDirectory(realpathSync(resolve(repoRoot)));
  const observedRoot = assertPhysicalDirectory(realpathSync(gitObservation(start, ["rev-parse", "--show-toplevel"], deps.spawn).trim()));
  if (observedRoot !== start) throw new Error("repository root mismatch");
  const commonRaw = gitObservation(start, ["rev-parse", "--path-format=absolute", "--git-common-dir"], deps.spawn).trim();
  const gitCommonDir = assertPhysicalDirectory(realpathSync(isAbsolute(commonRaw) ? commonRaw : resolve(start, commonRaw)));
  const worktrees = parseGitWorktreeList(gitObservation(start, ["worktree", "list", "--porcelain", "-z"], deps.spawn));
  const primary = selectPrimaryWorktree(worktrees);
  if (worktrees === null || primary === null) throw new Error("Git worktree topology unavailable");
  const registeredWorktreeRoots = worktrees.map(({ root }) => assertPhysicalDirectory(realpathSync(root)));
  return {
    repoRoot: observedRoot,
    gitCommonDir,
    primaryRoot: assertPhysicalDirectory(realpathSync(primary.root)),
    registeredWorktreeRoots,
    worktrees,
  };
}

/** Production entry used by pipeline-start, Verify and the approval writer. */
export function validatePoGateAuthorityForRepository({
  repoRoot,
  expectedPlanSha256 = undefined,
  expectedSpecSha256 = undefined,
}, deps = {}) {
  let topology;
  try {
    topology = deps.topology ?? resolvePoGateRepositoryTopology(repoRoot, deps);
  } catch {
    return fail("PO-GATE-AUTHORITY-UNAVAILABLE", "Repository topology or authority inputs are unavailable.", PROFILE_REPAIR);
  }
  return validatePoGateAuthority({ ...topology, expectedPlanSha256, expectedSpecSha256 });
}

function loadReceipt(gitCommonDir) {
  const common = assertPhysicalDirectory(gitCommonDir);
  const path = poGateProfileReceiptPath(common);
  const parentRelative = relative(common, dirname(path)).split(sep).join("/");
  physicalPath(common, parentRelative, "directory");
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink() || realpathSync(path) !== path || (info.mode & 0o777) !== 0o600) {
    throw new Error("unsafe receipt");
  }
  const receiptRelative = relative(common, path).split(sep).join("/");
  const raw = decodeUtf8(readPhysicalFile(common, receiptRelative));
  if ((lstatSync(path).mode & 0o777) !== 0o600) throw new Error("unsafe receipt mode");
  const receipt = JSON.parse(raw);
  if (!validatePoGateProfileReceipt(receipt) || raw !== serializePoGateProfileReceipt(receipt)) {
    throw new Error("invalid receipt");
  }
  return { receipt, raw };
}

function readProjection(root) {
  const sourceBytes = readPhysicalFile(root, "pipeline.user.yaml");
  const runtimeBytes = readPhysicalFile(root, ".claude/pipeline.yaml");
  return {
    sourceBytes,
    runtimeBytes,
    sourceSha256: sha256(sourceBytes),
    runtimeSha256: sha256(runtimeBytes),
    humanFacing: configuredLanguage(sourceBytes, runtimeBytes),
  };
}

function activeFeatureState(repoRoot) {
  const raw = readPhysicalFile(repoRoot, ".claude/pipeline-state.json");
  const state = JSON.parse(decodeUtf8(raw));
  if (!Object.prototype.hasOwnProperty.call(state, "activeFeature")) return { status: "absent" };
  const active = state?.activeFeature;
  if (!isPlainObject(active) || typeof active.id !== "string" || active.id.trim() === "") return { status: "invalid" };
  const planPath = normalizeRepositoryPath(active.planPath);
  if (planPath === null || !PRD_NAME.test(basename(planPath))) return { status: "invalid" };
  return { status: "active", id: active.id, planPath };
}

function prdAuthority(repoRoot, active, expectedLanguage) {
  const featureDirectory = dirname(active.planPath).split(sep).join("/");
  let directory;
  try {
    directory = physicalPath(repoRoot, featureDirectory, "directory");
  } catch {
    return fail("PO-GATE-FEATURE-PATH-INVALID", "The active feature directory is not a physical repository directory.", PRD_REPAIR);
  }

  const listPrds = () => {
    const entries = readdirSync(directory, { withFileTypes: true })
      .filter(({ name }) => PRD_NAME.test(name))
      .sort((left, right) => left.name.localeCompare(right.name));
    if (entries.some((entry) => !entry.isFile() || entry.isSymbolicLink())) {
      throw new Error("unsafe PRD entry");
    }
    return entries.map(({ name }) => name);
  };
  let prds;
  try {
    prds = listPrds();
  } catch {
    return fail("PO-GATE-FEATURE-PATH-INVALID", "The active feature directory cannot be inspected safely.", PRD_REPAIR);
  }

  if (prds.length !== 1) {
    return fail("PO-GATE-PRD-CARDINALITY", "The active feature directory must contain exactly one prd_*.md file.", PRD_REPAIR);
  }
  const onlyPlanPath = `${featureDirectory}/${prds[0]}`;
  if (onlyPlanPath !== active.planPath) {
    return fail("PO-GATE-PLAN-PATH-MISMATCH", "The sole active PRD does not equal activeFeature.planPath.", PRD_REPAIR);
  }

  let planBytes;
  try {
    planBytes = readPhysicalFile(repoRoot, active.planPath);
    if (JSON.stringify(listPrds()) !== JSON.stringify(prds)) {
      return fail("PO-GATE-PRD-CARDINALITY", "The active PRD set changed while authority was inspected.", PRD_REPAIR);
    }
  } catch {
    return fail("PO-GATE-FEATURE-PATH-INVALID", "The active PRD is not a physical regular repository file.", PRD_REPAIR);
  }
  let text;
  try {
    text = decodeUtf8(planBytes);
  } catch {
    return fail("PO-GATE-PRD-LANGUAGE-MISMATCH", "The active PRD is not canonical UTF-8 text.", PRD_REPAIR);
  }
  const markers = [...text.matchAll(PRD_LANGUAGE_MARKER)].map((match) => match[1]);
  if (markers.length !== 1 || markers[0] !== expectedLanguage) {
    return fail("PO-GATE-PRD-LANGUAGE-MISMATCH", "The active PRD must declare the repository-scoped PO language exactly once.", PRD_REPAIR);
  }

  const specPath = `${featureDirectory}/spec.md`;
  let specBytes;
  try {
    specBytes = readPhysicalFile(repoRoot, specPath);
  } catch {
    return fail("PO-GATE-PRD-SPEC-MISMATCH", "The active PRD must bind the neighboring physical spec.md bytes exactly once.", PRD_REPAIR);
  }
  const specSha256 = sha256(specBytes);
  const specMarkers = [...text.matchAll(TECHNICAL_SPEC_MARKER)].map((match) => match[1]);
  if (specMarkers.length !== 1 || specMarkers[0] !== specSha256) {
    return fail("PO-GATE-PRD-SPEC-MISMATCH", "The active PRD technical Spec marker must exactly match the neighboring spec.md bytes.", PRD_REPAIR);
  }
  return {
    ok: true,
    planSha256: sha256(planBytes),
    specPath,
    specSha256,
  };
}

/**
 * Validate the repository-scoped authority from caller-resolved Git topology.
 * Returned failures and evidence intentionally contain no absolute path.
 */
export function validatePoGateAuthority({
  repoRoot,
  gitCommonDir,
  primaryRoot,
  registeredWorktreeRoots,
  expectedPlanSha256 = undefined,
  expectedSpecSha256 = undefined,
}) {
  let current;
  let common;
  let primary;
  try {
    current = assertPhysicalDirectory(repoRoot);
    common = assertPhysicalDirectory(gitCommonDir);
    primary = assertPhysicalDirectory(primaryRoot);
  } catch {
    return fail("PO-GATE-WORKTREE-INVALID", "The repository topology is not physical and canonical.", PROFILE_REPAIR);
  }
  if (
    !Array.isArray(registeredWorktreeRoots)
    || registeredWorktreeRoots.some((root) => normalizeAbsolute(root) === null)
    || !registeredWorktreeRoots.includes(current)
    || registeredWorktreeRoots[0] !== primary
  ) {
    return fail("PO-GATE-WORKTREE-UNREGISTERED", "The current or primary checkout is not the registered Git worktree authority.", PROFILE_REPAIR);
  }

  let loaded;
  try {
    loaded = loadReceipt(common);
  } catch {
    return fail("PO-PROFILE-RECEIPT-INVALID", "The common PO profile receipt is missing, unsafe, noncanonical or malformed.", PROFILE_REPAIR);
  }
  const { receipt, raw: receiptRaw } = loaded;
  let expectedFingerprint;
  try {
    expectedFingerprint = derivePoGateRepositoryFingerprint({ gitCommonDir: common, primaryRoot: primary });
  } catch {
    return fail("PO-PROFILE-RECEIPT-INVALID", "The repository fingerprint cannot be derived safely.", PROFILE_REPAIR);
  }
  if (
    receipt.repositoryFingerprint !== expectedFingerprint
    || receipt.canonicalPrimaryRoot !== primary
  ) {
    return fail("PO-PROFILE-RECEIPT-STALE", "The common PO profile receipt does not bind the current primary checkout.", PROFILE_REPAIR);
  }

  let primaryProjection;
  try {
    primaryProjection = readProjection(primary);
  } catch {
    return fail("PO-PROFILE-RECEIPT-STALE", "The canonical primary profile cannot be read safely.", PROFILE_REPAIR);
  }
  if (
    primaryProjection.humanFacing === null
    || primaryProjection.humanFacing !== receipt.humanFacing
    || primaryProjection.sourceSha256 !== receipt.sourceSha256
    || primaryProjection.runtimeSha256 !== receipt.runtimeSha256
  ) {
    return fail("PO-PROFILE-RECEIPT-STALE", "The common PO profile receipt no longer matches the canonical primary profile.", PROFILE_REPAIR);
  }

  let active;
  try {
    active = activeFeatureState(current);
  } catch {
    active = { status: "invalid" };
  }
  if (active.status === "invalid") {
    return fail("PO-GATE-ACTIVE-FEATURE-INVALID", "The active feature and planPath are missing or unsafe.", PRD_REPAIR);
  }
  const profileEvidence = {
    schema: PO_GATE_AUTHORITY_EVIDENCE_SCHEMA,
    humanFacing: receipt.humanFacing,
    sourceSha256: primaryProjection.sourceSha256,
    runtimeSha256: primaryProjection.runtimeSha256,
    receiptSha256: sha256(receiptRaw),
    repositoryFingerprint: receipt.repositoryFingerprint,
  };
  if (active.status === "absent") {
    if (expectedPlanSha256 !== undefined || expectedSpecSha256 !== undefined) {
      return fail("PO-GATE-PLAN-DIGEST-STALE", "The active PRD authority no longer exists.", PRD_REPAIR);
    }
    return { ok: true, code: "PO-GATE-AUTHORITY-VALID", value: profileEvidence };
  }
  const prd = prdAuthority(current, active, receipt.humanFacing);
  if (!prd.ok) return prd;
  if (expectedPlanSha256 !== undefined && (!SHA256.test(expectedPlanSha256) || expectedPlanSha256 !== prd.planSha256)) {
    return fail("PO-GATE-PLAN-DIGEST-STALE", "The active PRD changed after the authority snapshot was taken.", PRD_REPAIR);
  }
  if (expectedSpecSha256 !== undefined && (!SHA256.test(expectedSpecSha256) || expectedSpecSha256 !== prd.specSha256)) {
    return fail("PO-GATE-PRD-SPEC-MISMATCH", "The active Spec changed after the authority snapshot was taken.", PRD_REPAIR);
  }

  const evidence = {
    schema: PO_GATE_AUTHORITY_EVIDENCE_V2_SCHEMA,
    humanFacing: profileEvidence.humanFacing,
    sourceSha256: profileEvidence.sourceSha256,
    runtimeSha256: profileEvidence.runtimeSha256,
    receiptSha256: profileEvidence.receiptSha256,
    repositoryFingerprint: profileEvidence.repositoryFingerprint,
    planPath: active.planPath,
    planSha256: prd.planSha256,
    specPath: prd.specPath,
    specSha256: prd.specSha256,
  };
  return { ok: true, code: "PO-GATE-AUTHORITY-VALID", value: evidence };
}
