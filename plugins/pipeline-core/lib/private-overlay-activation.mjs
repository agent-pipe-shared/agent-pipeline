// SPDX-License-Identifier: SUL-1.0

/**
 * Pure, read-only admission boundary for a slim private overlay.
 *
 * The caller supplies observations for the selected Public candidate and the
 * installed plugin. This module proves that the project-local lock names those
 * exact observations and that every admitted overlay input stays inside one
 * closed namespace boundary. Results are deliberately sanitized: raw bytes,
 * private relative names and machine-local paths never leave this module.
 */
import { createHash } from "node:crypto";
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
import { resolve, sep } from "node:path";
import { TextDecoder } from "node:util";

import { validatePipelineUserV3 } from "./runner-profiles-v3.mjs";
import {
  applyRunnerProfileMigrationV3,
  planRunnerProfileMigrationV3,
} from "./runner-profile-migration-v3.mjs";
import { parseYaml } from "./yaml-lite.mjs";

const LOCK_SCHEMA = "pipeline.core-lock.v1";
const EVIDENCE_SCHEMA = "pipeline.private-overlay-activation-evidence.v1";
const AUTHORITY_PLAN_SCHEMA = "pipeline.private-overlay-authority-update-plan.v1";
const AUTHORITY_APPLY_SCHEMA = "pipeline.private-overlay-authority-update-activation.v1";
const CLASSES = Object.freeze(["policies", "guidelines", "templates", "extensions"]);
const SHA256 = /^[0-9a-f]{64}$/u;
const OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const PLUGIN_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u;
const PLUGIN_VERSION = /^[A-Za-z0-9][A-Za-z0-9.+_-]{0,127}$/u;
const PROHIBITED_WORDS = new Set([
  "identity", "identities", "personal", "person", "owner", "username", "email",
  "secret", "secrets", "credential", "credentials", "token", "tokens",
  "password", "passwords", "passwd", "passphrase", "machine", "host", "receipt",
  "receipts", "cache", "evidence", "runtime",
]);
const PROHIBITED_SECRET_WORDS = new Set([
  "secret", "secrets", "credential", "credentials", "token", "tokens",
  "password", "passwords", "passwd", "passphrase", "passphrases",
]);
const PROHIBITED_COMPOUNDS = new Set([
  "apikey", "privatekey", "password", "passwords", "passphrase", "passphrases",
]);
const PRIVATE_KEY_BLOCK = /-----BEGIN(?: [A-Z0-9][A-Z0-9 -]{0,64})? PRIVATE KEY-----/u;
const UTF8 = new TextDecoder("utf-8", { fatal: true });
const AUTHENTICATED_ADMISSIONS = new WeakMap();
const AUTHENTICATED_AUTHORITY_UPDATE_PLANS = new WeakMap();

export const PRIVATE_OVERLAY_CLASSES = CLASSES;

class AdmissionError extends Error {
  constructor(code) {
    super(code);
    this.name = "PrivateOverlayAdmissionError";
    this.code = code;
  }
}

function fail(code) {
  throw new AdmissionError(code);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function canonicalDigest(value) {
  return sha256(JSON.stringify(stable(value)));
}

function publicSignature(value) {
  const ancestors = new WeakSet();
  function encode(item) {
    if (item === null) return ["null"];
    if (["string", "boolean", "number", "undefined"].includes(typeof item)) return [typeof item, item];
    if (typeof item !== "object" || ancestors.has(item)) throw new Error("unsupported evidence value");
    const prototype = Object.getPrototypeOf(item);
    if (prototype !== Object.prototype && prototype !== Array.prototype) throw new Error("unsupported evidence prototype");
    if (Object.getOwnPropertySymbols(item).length > 0) throw new Error("unsupported evidence symbol");
    ancestors.add(item);
    const properties = Object.getOwnPropertyNames(item).sort().map((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(item, key);
      if (!descriptor || !("value" in descriptor)) throw new Error("unsupported evidence accessor");
      return [key, descriptor.enumerable, descriptor.configurable, descriptor.writable, encode(descriptor.value)];
    });
    ancestors.delete(item);
    return [Array.isArray(item) ? "array" : "object", properties];
  }
  return JSON.stringify(encode(value));
}

function exactObject(value, keys) {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

function validRepository(value) {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && url.username === ""
      && url.password === ""
      && url.search === ""
      && url.hash === ""
      && url.hostname.length > 0;
  } catch {
    return false;
  }
}

function validBranch(value) {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 255
    && !value.startsWith("/")
    && !value.endsWith("/")
    && !value.endsWith(".")
    && !value.endsWith(".lock")
    && !value.includes("..")
    && !value.includes("@{")
    && !/[\\\s~^:?*[\]]/u.test(value)
    && value.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

function validateObserved(selectedCandidate, installedPlugin) {
  if (!exactObject(selectedCandidate, ["repository", "branch", "commit", "tree"])) fail("SNT-A-CANDIDATE-SCHEMA");
  if (!validRepository(selectedCandidate.repository)) fail("SNT-A-CANDIDATE-REPOSITORY");
  if (!validBranch(selectedCandidate.branch)) fail("SNT-A-CANDIDATE-BRANCH");
  if (!OID.test(selectedCandidate.commit)) fail("SNT-A-CANDIDATE-COMMIT");
  if (!OID.test(selectedCandidate.tree)) fail("SNT-A-CANDIDATE-TREE");
  if (!exactObject(installedPlugin, ["name", "version", "manifestSha256", "contentSha256"])) fail("SNT-A-PLUGIN-SCHEMA");
  if (!PLUGIN_NAME.test(installedPlugin.name)) fail("SNT-A-PLUGIN-NAME");
  if (!PLUGIN_VERSION.test(installedPlugin.version)) fail("SNT-A-PLUGIN-VERSION");
  if (!SHA256.test(installedPlugin.manifestSha256)) fail("SNT-A-PLUGIN-MANIFEST");
  if (!SHA256.test(installedPlugin.contentSha256)) fail("SNT-A-PLUGIN-CONTENT");
}

function physicalRoot(overlayRoot) {
  if (typeof overlayRoot !== "string" || overlayRoot.length === 0 || overlayRoot.includes("\0")) fail("SNT-A-ROOT-INVALID");
  // On POSIX, "\" is an ordinary filename character, never a separator, so any
  // backslash in an overlay root is rejected outright as separator-confusion
  // shaped input. On native Windows "\" is the platform separator itself (every
  // real absolute path contains it), so the same literal ban would reject every
  // legitimate root. Windows instead splits on both separators and rejects only
  // genuine "." / ".." traversal segments -- the same acceptance boundary the
  // POSIX branch enforces, expressed in the native separator alphabet.
  const traversalSegments = process.platform === "win32" ? overlayRoot.split(/[\\/]/u) : overlayRoot.split("/");
  if ((process.platform !== "win32" && overlayRoot.includes("\\"))
    || traversalSegments.some((segment) => segment === "." || segment === "..")) fail("SNT-A-PATH-ESCAPE");
  const requested = resolve(overlayRoot);
  let info;
  try {
    info = lstatSync(requested);
    if (!info.isDirectory() || info.isSymbolicLink() || realpathSync(requested) !== requested) fail("SNT-A-ROOT-UNSAFE");
  } catch (error) {
    if (error instanceof AdmissionError) throw error;
    fail("SNT-A-ROOT-INVALID");
  }
  return requested;
}

function safeSegments(relativePath) {
  if (typeof relativePath !== "string" || relativePath.length === 0 || relativePath.includes("\\")) fail("SNT-A-PATH-ESCAPE");
  const segments = relativePath.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === ".." || segment.includes("/") || segment.includes("\0"))) {
    fail("SNT-A-PATH-ESCAPE");
  }
  return segments;
}

function physicalEntry(root, relativePath, expected) {
  const segments = safeSegments(relativePath);
  let cursor = root;
  for (const [index, segment] of segments.entries()) {
    cursor = resolve(cursor, segment);
    if (cursor !== root && !cursor.startsWith(`${root}${sep}`)) fail("SNT-A-PATH-ESCAPE");
    let info;
    try { info = lstatSync(cursor); } catch { fail(index === segments.length - 1 ? "SNT-A-INPUT-MISSING" : "SNT-A-TOPOLOGY-INVALID"); }
    if (info.isSymbolicLink()) fail("SNT-A-SYMLINK");
    if (index < segments.length - 1 && !info.isDirectory()) fail("SNT-A-TOPOLOGY-INVALID");
    if (index === segments.length - 1) {
      if (expected === "directory" && !info.isDirectory()) fail("SNT-A-TOPOLOGY-INVALID");
      if (expected === "file" && (!info.isFile() || info.nlink !== 1)) fail("SNT-A-NONREGULAR-INPUT");
      try { if (realpathSync(cursor) !== cursor) fail("SNT-A-SYMLINK"); } catch (error) {
        if (error instanceof AdmissionError) throw error;
        fail("SNT-A-TOPOLOGY-INVALID");
      }
    }
  }
  return cursor;
}

const IDENTITY_FIELDS = Object.freeze(["dev", "ino", "mode", "size", "mtimeNs", "ctimeNs"]);

function sameIdentity(left, right) {
  return IDENTITY_FIELDS.every((field) => left[field] === right[field]);
}

function physicalFileStat(path) {
  let info;
  try { info = lstatSync(path, { bigint: true }); } catch { fail("SNT-A-INPUT-CHANGED"); }
  if (info.isSymbolicLink()) fail("SNT-A-SYMLINK");
  if (!info.isFile() || info.nlink !== 1n) fail("SNT-A-NONREGULAR-INPUT");
  try { if (realpathSync(path) !== path) fail("SNT-A-SYMLINK"); } catch (error) {
    if (error instanceof AdmissionError) throw error;
    fail("SNT-A-INPUT-CHANGED");
  }
  return info;
}

function stablePhysicalRead(root, relativePath, afterOpen) {
  const path = physicalEntry(root, relativePath, "file");
  const pathBefore = physicalFileStat(path);
  let descriptor;
  try {
    descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  } catch (error) {
    if (error?.code === "ELOOP") fail("SNT-A-SYMLINK");
    fail("SNT-A-INPUT-UNREADABLE");
  }
  try {
    const descriptorBefore = fstatSync(descriptor, { bigint: true });
    if (!descriptorBefore.isFile() || descriptorBefore.nlink !== 1n || !sameIdentity(pathBefore, descriptorBefore)) fail("SNT-A-INPUT-CHANGED");
    if (afterOpen !== undefined) afterOpen();
    const bytes = readFileSync(descriptor);
    const descriptorAfter = fstatSync(descriptor, { bigint: true });
    const pathAfter = physicalFileStat(path);
    if (!sameIdentity(descriptorBefore, descriptorAfter)
      || !sameIdentity(descriptorAfter, pathAfter)
      || descriptorAfter.size !== BigInt(bytes.length)) fail("SNT-A-INPUT-CHANGED");
    return bytes;
  } catch (error) {
    if (error instanceof AdmissionError) throw error;
    fail("SNT-A-INPUT-UNREADABLE");
  } finally {
    closeSync(descriptor);
  }
}

function physicalDirectoryStat(path) {
  let info;
  try { info = lstatSync(path, { bigint: true }); } catch { fail("SNT-A-TOPOLOGY-CHANGED"); }
  if (info.isSymbolicLink()) fail("SNT-A-SYMLINK");
  if (!info.isDirectory()) fail("SNT-A-TOPOLOGY-CHANGED");
  try { if (realpathSync(path) !== path) fail("SNT-A-SYMLINK"); } catch (error) {
    if (error instanceof AdmissionError) throw error;
    fail("SNT-A-TOPOLOGY-CHANGED");
  }
  return info;
}

function assertDirectoryIdentity(path, expected) {
  if (!sameIdentity(expected, physicalDirectoryStat(path))) fail("SNT-A-TOPOLOGY-CHANGED");
}

function decode(bytes, malformedCode) {
  try { return UTF8.decode(bytes); } catch { fail(malformedCode); }
}

function parseIntent(bytes) {
  let intent;
  try { intent = parseYaml(decode(bytes, "SNT-A-SOURCE-MALFORMED")); } catch (error) {
    if (error instanceof AdmissionError) throw error;
    fail("SNT-A-SOURCE-MALFORMED");
  }
  const validation = validatePipelineUserV3(intent, { source: "pipeline.user.yaml" });
  if (!validation.ok) fail("SNT-A-SOURCE-INVALID-V3");
}

function parseLock(bytes) {
  let lock;
  try { lock = JSON.parse(decode(bytes, "SNT-A-LOCK-MALFORMED")); } catch (error) {
    if (error instanceof AdmissionError) throw error;
    fail("SNT-A-LOCK-MALFORMED");
  }
  if (!exactObject(lock, ["$schema", "source", "plugin"])
    || lock.$schema !== LOCK_SCHEMA
    || !exactObject(lock.source, ["repository", "branch", "commit", "tree"])
    || !exactObject(lock.plugin, ["name", "version", "manifest_sha256"])) fail("SNT-A-LOCK-SCHEMA");
  if (!validRepository(lock.source.repository) || !validBranch(lock.source.branch)
    || !OID.test(lock.source.commit) || !OID.test(lock.source.tree)
    || !PLUGIN_NAME.test(lock.plugin.name) || !PLUGIN_VERSION.test(lock.plugin.version)
    || !SHA256.test(lock.plugin.manifest_sha256)) fail("SNT-A-LOCK-SCHEMA");
  return lock;
}

function validateBindings(lock, selectedCandidate, installedPlugin) {
  if (lock.source.repository !== selectedCandidate.repository) fail("SNT-A-REPOSITORY-MISMATCH");
  if (lock.source.branch !== selectedCandidate.branch) fail("SNT-A-BRANCH-MISMATCH");
  if (lock.source.commit !== selectedCandidate.commit) fail("SNT-A-COMMIT-MISMATCH");
  if (lock.source.tree !== selectedCandidate.tree) fail("SNT-A-TREE-MISMATCH");
  if (lock.plugin.name !== installedPlugin.name) fail("SNT-A-PLUGIN-NAME-MISMATCH");
  if (lock.plugin.version !== installedPlugin.version) fail("SNT-A-PLUGIN-VERSION-MISMATCH");
  if (lock.plugin.manifest_sha256 !== installedPlugin.manifestSha256) fail("SNT-A-PLUGIN-MANIFEST-MISMATCH");
}

function lexical(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizedWords(value) {
  const separated = value.normalize("NFKC")
    .replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, "$1 $2")
    .replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu, "$1 $2");
  return separated.toLocaleLowerCase("en-US").split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

function hasProhibitedWords(words, { secretOnly = false } = {}) {
  const forbidden = secretOnly ? PROHIBITED_SECRET_WORDS : PROHIBITED_WORDS;
  if (words.some((word) => forbidden.has(word))) return true;
  for (let index = 0; index < words.length - 1; index += 1) {
    const pair = `${words[index]}${words[index + 1]}`;
    if (PROHIBITED_COMPOUNDS.has(pair)) return true;
  }
  return words.some((word) => PROHIBITED_COMPOUNDS.has(word)
    || /^(?:[\p{L}\p{N}]*(?:passwords?|passwd|passphrases?|apikey|privatekey))$/u.test(word));
}

function prohibitedSegment(segment) {
  return hasProhibitedWords(normalizedWords(segment));
}

function prohibitedContent(text) {
  const normalized = text.normalize("NFKC");
  if (PRIVATE_KEY_BLOCK.test(normalized.toUpperCase())) return true;
  for (const line of normalized.split(/\r?\n/u)) {
    const assignment = line.match(/^\s*(?:[-*+]\s+)?(?:export\s+)?(.{1,160}?)\s*[:=]\s*\S.*$/iu);
    if (assignment && hasProhibitedWords(normalizedWords(assignment[1]), { secretOnly: true })) return true;
  }
  return false;
}

function enumerateClass(root, className, afterOpen) {
  const classRelative = `.agent-pipeline/${className}`;
  let classPath;
  try { classPath = physicalEntry(root, classRelative, "directory"); }
  catch (error) {
    if (error instanceof AdmissionError && error.code === "SNT-A-INPUT-MISSING") return [];
    throw error;
  }
  const admitted = [];
  function visit(directory, relativeParts) {
    const directoryIdentity = physicalDirectoryStat(directory);
    let names;
    try { names = readdirSync(directory).sort(lexical); } catch { fail("SNT-A-INPUT-UNREADABLE"); }
    assertDirectoryIdentity(directory, directoryIdentity);
    for (const name of names) {
      assertDirectoryIdentity(directory, directoryIdentity);
      if (name === "." || name === ".." || name.includes("/") || name.includes("\\") || name.includes("\0")) fail("SNT-A-PATH-ESCAPE");
      if (prohibitedSegment(name)) fail("SNT-A-PROHIBITED-MATERIAL");
      const parts = [...relativeParts, name];
      const relative = `.agent-pipeline/${className}/${parts.join("/")}`;
      const path = physicalEntry(root, relative, undefined);
      const info = lstatSync(path);
      if (info.isSymbolicLink()) fail("SNT-A-SYMLINK");
      if (info.isDirectory()) visit(path, parts);
      else if (info.isFile() && info.nlink === 1) {
        if (!name.endsWith(".md")) fail("SNT-A-INPUT-EXTENSION");
        const bytes = stablePhysicalRead(root, relative, afterOpen);
        const text = decode(bytes, "SNT-A-INPUT-NON-UTF8");
        if (prohibitedContent(text)) fail("SNT-A-PROHIBITED-MATERIAL");
        admitted.push({ className, privateName: parts.join("/"), sha256: sha256(bytes), byteLength: bytes.length, text });
      } else fail("SNT-A-NONREGULAR-INPUT");
      assertDirectoryIdentity(directory, directoryIdentity);
    }
    assertDirectoryIdentity(directory, directoryIdentity);
  }
  visit(classPath, []);
  return admitted.sort((left, right) => lexical(left.privateName, right.privateName));
}

function enumerateOverlay(root, rootIdentity, overlay, overlayIdentity, afterOpen) {
  assertDirectoryIdentity(overlay, overlayIdentity);
  let topLevel;
  try { topLevel = readdirSync(overlay).sort(lexical); } catch { fail("SNT-A-INPUT-UNREADABLE"); }
  assertDirectoryIdentity(root, rootIdentity);
  assertDirectoryIdentity(overlay, overlayIdentity);
  const allowed = new Set(["core.lock.json", ...CLASSES]);
  if (topLevel.some((name) => !allowed.has(name))) fail("SNT-A-UNDECLARED-NAMESPACE");
  const admitted = [];
  for (const className of CLASSES) {
    assertDirectoryIdentity(root, rootIdentity);
    assertDirectoryIdentity(overlay, overlayIdentity);
    admitted.push(...enumerateClass(root, className, afterOpen));
    assertDirectoryIdentity(overlay, overlayIdentity);
  }
  assertDirectoryIdentity(root, rootIdentity);
  return admitted;
}

function rejected(code) {
  return { schema: EVIDENCE_SCHEMA, status: "rejected", reasonCodes: [code] };
}

function resolveAdmissionDependencies(dependencies) {
  if (dependencies === null || typeof dependencies !== "object" || Array.isArray(dependencies)) fail("SNT-A-DEPENDENCY-SCHEMA");
  const hasAfterOpen = Object.hasOwn(dependencies, "afterOpen");
  if (!exactObject(dependencies, hasAfterOpen ? ["afterOpen"] : [])
    || (hasAfterOpen && typeof dependencies.afterOpen !== "function")) fail("SNT-A-DEPENDENCY-SCHEMA");
  return dependencies.afterOpen;
}

function performAdmission({ overlayRoot, selectedCandidate, installedPlugin, authorityUpdate = false } = {}, dependencies = {}) {
  const afterOpen = resolveAdmissionDependencies(dependencies);
  validateObserved(selectedCandidate, installedPlugin);
  const root = physicalRoot(overlayRoot);
  const rootIdentity = physicalDirectoryStat(root);
  const sourceBytes = stablePhysicalRead(root, "pipeline.user.yaml", afterOpen);
  assertDirectoryIdentity(root, rootIdentity);
  parseIntent(sourceBytes);
  const overlay = physicalEntry(root, ".agent-pipeline", "directory");
  const overlayIdentity = physicalDirectoryStat(overlay);
  const lockBytes = stablePhysicalRead(root, ".agent-pipeline/core.lock.json", afterOpen);
  assertDirectoryIdentity(root, rootIdentity);
  assertDirectoryIdentity(overlay, overlayIdentity);
  const lock = parseLock(lockBytes);
  if (authorityUpdate) {
    if (lock.source.repository !== selectedCandidate.repository || lock.source.branch !== selectedCandidate.branch) {
      fail("SNT-A-AUTHORITY-UPDATE-SOURCE-MISMATCH");
    }
  } else validateBindings(lock, selectedCandidate, installedPlugin);
  const admitted = enumerateOverlay(root, rootIdentity, overlay, overlayIdentity, afterOpen);
  assertDirectoryIdentity(root, rootIdentity);
  const admittedDescriptors = admitted.map(({ className, privateName, sha256: digest, byteLength }) => ({
    className,
    privateName,
    sha256: digest,
    byteLength,
  }));
  const admittedCounts = Object.fromEntries(CLASSES.map((className) => [className, admitted.filter((entry) => entry.className === className).length]));
  admittedCounts.total = admitted.length;
  const result = {
    evidence: {
      schema: EVIDENCE_SCHEMA,
      status: "ready",
      reasonCodes: ["SNT-A-VALIDATED"],
      candidate: {
        repositorySha256: sha256(selectedCandidate.repository),
        branchSha256: sha256(selectedCandidate.branch),
        commit: selectedCandidate.commit,
        tree: selectedCandidate.tree,
      },
      plugin: {
        name: installedPlugin.name,
        version: installedPlugin.version,
        manifestSha256: installedPlugin.manifestSha256,
        contentSha256: installedPlugin.contentSha256,
      },
      inputs: {
        sourceSha256: sha256(sourceBytes),
        lockSha256: sha256(lockBytes),
        admittedSetSha256: canonicalDigest(admittedDescriptors),
        admittedFileSha256: admittedDescriptors.map((entry) => entry.sha256),
      },
      admittedCounts,
    },
    admitted,
  };
  if (authorityUpdate) result.lock = lock;
  return result;
}

/**
 * Validate one explicit overlay snapshot without writing or normalizing it.
 */
export function validatePrivateOverlayActivation({ overlayRoot, selectedCandidate, installedPlugin } = {}, dependencies = {}) {
  try {
    return performAdmission({ overlayRoot, selectedCandidate, installedPlugin }, dependencies).evidence;
  } catch (error) {
    return rejected(error instanceof AdmissionError ? error.code : "SNT-A-INTERNAL-ERROR");
  }
}

function renderedAuthorityLock(selectedCandidate, installedPlugin) {
  return `${JSON.stringify({
    $schema: LOCK_SCHEMA,
    source: {
      repository: selectedCandidate.repository,
      branch: selectedCandidate.branch,
      commit: selectedCandidate.commit,
      tree: selectedCandidate.tree,
    },
    plugin: {
      name: installedPlugin.name,
      version: installedPlugin.version,
      manifest_sha256: installedPlugin.manifestSha256,
    },
  }, null, 2)}\n`;
}

function authorityPlanRejection(code) {
  return { schema: AUTHORITY_PLAN_SCHEMA, status: "rejected", reasonCodes: [code] };
}

function authorityApplyRejection(code, planSha256 = undefined) {
  const result = { schema: AUTHORITY_APPLY_SCHEMA, status: "rejected", reasonCodes: [code] };
  if (planSha256 !== undefined) result.planSha256 = planSha256;
  return result;
}

/**
 * Produce the only accepted write plan for a stale Slim Overlay lock.  It
 * deliberately admits the current lock's topology and source channel without
 * accepting its obsolete candidate binding, then derives the replacement only
 * from the observed Public candidate and installed plugin.
 */
export function planPrivateOverlayAuthorityUpdate({ overlayRoot, selectedCandidate, installedPlugin } = {}) {
  let admitted;
  try {
    admitted = performAdmission({ overlayRoot, selectedCandidate, installedPlugin, authorityUpdate: true });
  } catch (error) {
    return authorityPlanRejection(error instanceof AdmissionError ? error.code : "SNT-A-AUTHORITY-UPDATE-REJECTED");
  }
  const authorityLockBytes = renderedAuthorityLock(selectedCandidate, installedPlugin);
  let nativePlan;
  try {
    nativePlan = planRunnerProfileMigrationV3({
      rootDir: overlayRoot,
      initializeMissingRuntimeForSlimV3: true,
      authorityLockBytes,
    });
  } catch {
    return authorityPlanRejection("SNT-A-AUTHORITY-UPDATE-REJECTED");
  }
  if (!nativePlan || !["ready", "noop"].includes(nativePlan.status)) {
    return authorityPlanRejection("SNT-A-AUTHORITY-UPDATE-REJECTED");
  }
  const changed = nativePlan.targets?.filter((target) => target.changed) ?? [];
  if (!Array.isArray(nativePlan.targets)
    || changed.some((target) => target.path !== ".agent-pipeline/core.lock.json")) {
    return authorityPlanRejection("SNT-A-AUTHORITY-UPDATE-PROJECTION-DRIFT");
  }
  const lockTarget = nativePlan.targets.find((target) => target.path === ".agent-pipeline/core.lock.json");
  if (!lockTarget || lockTarget.kind !== "authority-lock") {
    return authorityPlanRejection("SNT-A-AUTHORITY-UPDATE-REJECTED");
  }
  const core = {
    schema: AUTHORITY_PLAN_SCHEMA,
    status: nativePlan.status,
    reasonCodes: [nativePlan.status === "noop" ? "SNT-A-AUTHORITY-UPDATE-NOOP" : "SNT-A-AUTHORITY-UPDATE-READY"],
    candidate: admitted.evidence.candidate,
    plugin: admitted.evidence.plugin,
    sourceSha256: admitted.evidence.inputs.sourceSha256,
    lock: {
      beforeSha256: lockTarget.before.sha256,
      afterSha256: lockTarget.after.sha256,
    },
    changeCount: changed.length,
    activation: { required: true },
  };
  const plan = { ...core, planSha256: canonicalDigest(core) };
  AUTHENTICATED_AUTHORITY_UPDATE_PLANS.set(plan, {
    signature: publicSignature(plan),
    overlayRoot,
    selectedCandidate: structuredClone(selectedCandidate),
    installedPlugin: structuredClone(installedPlugin),
    nativePlan,
    planSha256: plan.planSha256,
    used: false,
  });
  return plan;
}

/** Apply only the exact in-process authority update plan and prove normal admission afterwards. */
export function activatePrivateOverlayAuthorityUpdate(plan, {
  overlayRoot,
  activate = false,
  expectedPlanSha256,
} = {}) {
  const state = plan !== null && typeof plan === "object" ? AUTHENTICATED_AUTHORITY_UPDATE_PLANS.get(plan) : undefined;
  if (!state || state.used) return authorityApplyRejection(state?.used ? "SNT-A-AUTHORITY-UPDATE-REPLAY" : "SNT-A-AUTHORITY-UPDATE-PLAN-INVALID");
  if (activate !== true) return authorityApplyRejection("SNT-A-AUTHORITY-UPDATE-ACTIVATION-REQUIRED");
  if (typeof expectedPlanSha256 !== "string" || !SHA256.test(expectedPlanSha256) || expectedPlanSha256 !== state.planSha256) {
    return authorityApplyRejection("SNT-A-AUTHORITY-UPDATE-DIGEST-MISMATCH");
  }
  try {
    if (overlayRoot !== state.overlayRoot || publicSignature(plan) !== state.signature
      || plan.planSha256 !== canonicalDigest(Object.fromEntries(Object.entries(plan).filter(([key]) => key !== "planSha256")))) {
      return authorityApplyRejection("SNT-A-AUTHORITY-UPDATE-PLAN-INVALID");
    }
  } catch {
    return authorityApplyRejection("SNT-A-AUTHORITY-UPDATE-PLAN-INVALID");
  }
  state.used = true;
  let applied;
  try { applied = applyRunnerProfileMigrationV3(state.nativePlan, { rootDir: state.overlayRoot, activate: true }); }
  catch { return authorityApplyRejection("SNT-A-AUTHORITY-UPDATE-APPLY-REJECTED", state.planSha256); }
  if (!applied || !["applied", "noop"].includes(applied.status)) {
    return authorityApplyRejection("SNT-A-AUTHORITY-UPDATE-APPLY-REJECTED", state.planSha256);
  }
  const readback = validatePrivateOverlayActivation({
    overlayRoot: state.overlayRoot,
    selectedCandidate: state.selectedCandidate,
    installedPlugin: state.installedPlugin,
  });
  if (readback.status !== "ready") {
    return authorityApplyRejection("SNT-A-AUTHORITY-UPDATE-READBACK-REJECTED", state.planSha256);
  }
  return {
    schema: AUTHORITY_APPLY_SCHEMA,
    status: "updated",
    reasonCodes: ["SNT-A-AUTHORITY-UPDATE-COMPLETE"],
    planSha256: state.planSha256,
    changeCount: plan.changeCount,
  };
}

/**
 * Admit one complete private-input snapshot and retain its bytes only behind
 * the exact returned evidence object. Unlike the public validator, this API
 * creates single-use in-process consume authority.
 */
export function admitPrivateOverlayActivation(input = {}, dependencies = {}) {
  try {
    const { evidence, admitted } = performAdmission(input, dependencies);
    AUTHENTICATED_ADMISSIONS.set(evidence, {
      signature: publicSignature(evidence),
      admitted: admitted.map(({ className, privateName, text }) => ({ className, privateName, text })),
      admittedCounts: { ...evidence.admittedCounts },
      used: false,
    });
    return evidence;
  } catch (error) {
    return rejected(error instanceof AdmissionError ? error.code : "SNT-A-INTERNAL-ERROR");
  }
}

/** Consume one exact admission synchronously without returning private data. */
export function consumePrivateOverlayAdmission(evidence, consumer) {
  const state = evidence !== null && typeof evidence === "object"
    ? AUTHENTICATED_ADMISSIONS.get(evidence)
    : undefined;
  if (!state) return rejected("SNT-A-ADMISSION-INVALID");
  if (state.used) return rejected("SNT-A-ADMISSION-REPLAY");
  if (typeof consumer !== "function") return rejected("SNT-A-CONSUMER-INVALID");
  try {
    if (publicSignature(evidence) !== state.signature) {
      state.used = true;
      return rejected("SNT-A-ADMISSION-MUTATED");
    }
  } catch {
    state.used = true;
    return rejected("SNT-A-ADMISSION-MUTATED");
  }

  state.used = true;
  const batch = Object.freeze(state.admitted.map((entry) => Object.freeze({
    className: entry.className,
    privateName: entry.privateName,
    text: entry.text,
  })));
  state.admitted = [];
  try {
    const result = consumer(batch);
    if (result !== null && (typeof result === "object" || typeof result === "function") && typeof result.then === "function") {
      return rejected("SNT-A-CONSUMER-ASYNC");
    }
  } catch {
    return rejected("SNT-A-CONSUMER-FAILED");
  }
  return {
    schema: EVIDENCE_SCHEMA,
    status: "consumed",
    reasonCodes: ["SNT-A-PRIVATE-INPUTS-CONSUMED"],
    admittedCounts: { ...state.admittedCounts },
  };
}
