// SPDX-License-Identifier: SUL-1.0
import { createHash } from "node:crypto";

export const ACTIVATION_SCHEMA = "pipeline.afk-activation.v1";
export const INSTRUCTION_SCHEMA = "pipeline.afk-activation-instruction.v1";
export const ATTRIBUTION_BOUNDARY = "process-attribution-only; not-authentication-or-product-approval";
export const FINAL_GATE = "po-review-required";
export const SUPPORTED_PROVIDER = "claude";
export const SUPPORTED_ADAPTER = "pipeline.afk-claude-worker.v1";
export const SUPPORTED_TOOLS = Object.freeze(["Glob", "Grep", "Read"]);
export const REQUIRED_DENY_SET = Object.freeze([
  "child-process",
  "general-command",
  "merge",
  "network-effect",
  "package-install",
  "push",
  "release",
  "remote-write",
  "secret-request",
  "tag",
]);

export function describeAfkProviderCapability(provider) {
  if (provider === SUPPORTED_PROVIDER) {
    return Object.freeze({ provider, status: "supported", code: null, mutation: "none" });
  }
  if (provider === "codex") {
    return Object.freeze({
      provider: "codex",
      status: "unavailable",
      code: "AFK-CODEX-CAPABILITY-UNAVAILABLE",
      mutation: "none",
    });
  }
  return Object.freeze({
    provider,
    status: "unsupported",
    code: "AFK-PROVIDER-SURFACE-UNSUPPORTED",
    mutation: "none",
  });
}

const SHA256 = /^[a-f0-9]{64}$/;
const ACTIVATION_ID = /^[a-f0-9]{32}$/;
const SAFE_ID = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,126}[A-Za-z0-9])?$/;
const REF = /^refs\/heads\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+$/;
const STATES = new Set(["off", "admitted", "active", "review-required", "blocked"]);

function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, keys) {
  return object(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function nonEmptyString(value, max = 1024) {
  return typeof value === "string" && value.length > 0 && value.length <= max
    && value.trim() === value && !value.includes("\0") && !/[\r\n]/.test(value);
}

function sortedUnique(values, validate, { allowEmpty = false } = {}) {
  if (!Array.isArray(values) || (!allowEmpty && values.length === 0)) return false;
  return values.every((value, index) => validate(value)
    && (index === 0 || values[index - 1] < value));
}

export function isNormalizedRepoPath(value) {
  if (!nonEmptyString(value, 4096) || value.startsWith("/") || value.startsWith("./")
    || value.includes("\\") || /^[A-Za-z]:/.test(value)) return false;
  const parts = value.split("/");
  return parts.every((part) => part !== "" && part !== "." && part !== ".." && part.toLowerCase() !== ".git");
}

function canonicalValue(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalValue).join(",")}]`;
  if (object(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalValue(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function canonicalJson(value) {
  return canonicalValue(value);
}

export function canonicalJsonFile(value) {
  return `${canonicalJson(value)}\n`;
}

export function sha256Raw(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function sha256Canonical(value) {
  return sha256Raw(Buffer.from(canonicalJson(value), "utf8"));
}

function result(code, detail = null) {
  return { ok: false, code, detail, mutation: "none" };
}

function isoTime(value) {
  if (typeof value !== "string") return null;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value ? time : null;
}

function validObjectFormat(value) {
  return value === "sha1" || value === "sha256";
}

function validOid(value, objectFormat) {
  const length = objectFormat === "sha1" ? 40 : objectFormat === "sha256" ? 64 : 0;
  return typeof value === "string" && value.length === length && /^[a-f0-9]+$/.test(value);
}

function validArtifact(value) {
  return exactKeys(value, ["path", "sha256"])
    && isNormalizedRepoPath(value.path) && SHA256.test(value.sha256);
}

function validFeatureRef(value) {
  return REF.test(value) && !value.includes("..")
    && value.split("/").every((part) => !part.startsWith(".") && !part.endsWith(".") && !part.endsWith(".lock"));
}

function safeId(value) {
  return typeof value === "string" && value.length <= 128 && SAFE_ID.test(value);
}

function validInstructionShape(value) {
  if (!exactKeys(value, [
    "schema", "attributedBy", "expiresAt", "finalGate", "feature", "base",
    "statePreimageSha256", "authority", "packages", "pathAllowlist", "surface",
    "budgets", "deny",
  ])) return false;
  if (value.schema !== INSTRUCTION_SCHEMA || !nonEmptyString(value.attributedBy, 256)
    || isoTime(value.expiresAt) === null || value.finalGate !== FINAL_GATE
    || !SHA256.test(value.statePreimageSha256)) return false;
  if (!exactKeys(value.feature, ["id", "ref"]) || !safeId(value.feature.id)
    || !validFeatureRef(value.feature.ref)) return false;
  if (!exactKeys(value.base, ["commit", "tree", "objectFormat"])
    || !validObjectFormat(value.base.objectFormat)
    || !validOid(value.base.commit, value.base.objectFormat)
    || !validOid(value.base.tree, value.base.objectFormat)) return false;
  if (!exactKeys(value.authority, ["prd", "spec", "courseBrief"])
    || !validArtifact(value.authority.prd) || !validArtifact(value.authority.spec)
    || !validArtifact(value.authority.courseBrief)) return false;
  if (!sortedUnique(value.packages, safeId)) return false;
  if (!exactKeys(value.pathAllowlist, ["read", "write"])
    || !sortedUnique(value.pathAllowlist.read, isNormalizedRepoPath)
    || !sortedUnique(value.pathAllowlist.write, isNormalizedRepoPath)) return false;
  if (!exactKeys(value.surface, ["provider", "adapterId", "adapterSha256", "tools", "toolInventorySha256"])
    || !nonEmptyString(value.surface.provider, 64) || !nonEmptyString(value.surface.adapterId, 128)
    || !SHA256.test(value.surface.adapterSha256) || !SHA256.test(value.surface.toolInventorySha256)
    || !sortedUnique(value.surface.tools, (entry) => nonEmptyString(entry, 64))) return false;
  if (!exactKeys(value.budgets, ["entries", "files", "bytes"])
    || ![value.budgets.entries, value.budgets.files, value.budgets.bytes]
      .every((entry) => Number.isSafeInteger(entry) && entry > 0)) return false;
  return Array.isArray(value.deny) && canonicalJson(value.deny) === canonicalJson(REQUIRED_DENY_SET);
}

export function parseCanonicalInstruction(raw) {
  if (!Buffer.isBuffer(raw) && !(raw instanceof Uint8Array) && typeof raw !== "string") {
    return result("AFK-INSTRUCTION-INVALID");
  }
  const bytes = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
  if (bytes.length === 0 || bytes.length > 262_144 || bytes.includes(0)) return result("AFK-INSTRUCTION-INVALID");
  let value;
  try {
    const text = bytes.toString("utf8");
    if (Buffer.byteLength(text, "utf8") !== bytes.length) return result("AFK-INSTRUCTION-INVALID");
    value = JSON.parse(text);
    if (text !== canonicalJsonFile(value)) return result("AFK-INSTRUCTION-NONCANONICAL");
  } catch {
    return result("AFK-INSTRUCTION-INVALID");
  }
  if (!validInstructionShape(value)) return result("AFK-INSTRUCTION-INVALID");
  return { ok: true, value };
}

function validState(state, instruction) {
  return object(state) && state.schema === "pipeline.state.v0"
    && object(state.activeFeature)
    && state.activeFeature.id === instruction.feature.id
    && state.activeFeature.planPath === instruction.authority.prd.path
    && nonEmptyString(state.activeFeature.phase, 128);
}

function hasProjectedActivation(state) {
  if (!Object.hasOwn(state, "afk") || state.afk === null || state.afk === "off") return false;
  return true;
}

function validAuthorityObservations(authority, instruction) {
  if (!exactKeys(authority, ["prd", "spec", "courseBrief"])) return false;
  return ["prd", "spec", "courseBrief"].every((key) => {
    const observed = authority[key];
    return exactKeys(observed, ["path", "bytes"])
      && observed.path === instruction.authority[key].path
      && (Buffer.isBuffer(observed.bytes) || observed.bytes instanceof Uint8Array)
      && sha256Raw(observed.bytes) === instruction.authority[key].sha256;
  });
}

function validSurface(surface, instruction) {
  return exactKeys(surface, ["provider", "adapterId", "adapterBytes", "tools"])
    && surface.provider === instruction.surface.provider
    && surface.adapterId === instruction.surface.adapterId
    && (Buffer.isBuffer(surface.adapterBytes) || surface.adapterBytes instanceof Uint8Array)
    && sha256Raw(surface.adapterBytes) === instruction.surface.adapterSha256
    && canonicalJson(surface.tools) === canonicalJson(instruction.surface.tools)
    && surface.provider === SUPPORTED_PROVIDER
    && surface.adapterId === SUPPORTED_ADAPTER
    && canonicalJson(surface.tools) === canonicalJson(SUPPORTED_TOOLS)
    && instruction.surface.toolInventorySha256 === sha256Canonical(surface.tools);
}

function validGitObservation(git, instruction) {
  if (!exactKeys(git, [
    "objectFormat", "head", "tree", "indexTree", "worktreeTree", "detached", "clean",
    "featureRefCheckouts", "worktreeInventory", "worktreeCount",
  ])) return false;
  const format = instruction.base.objectFormat;
  return git.objectFormat === format
    && validOid(git.head, format) && validOid(git.tree, format)
    && validOid(git.indexTree, format) && validOid(git.worktreeTree, format)
    && git.head === instruction.base.commit && git.tree === instruction.base.tree
    && git.indexTree === instruction.base.tree && git.worktreeTree === instruction.base.tree
    && git.detached === true && git.clean === true && git.featureRefCheckouts === 0
    && (Buffer.isBuffer(git.worktreeInventory) || git.worktreeInventory instanceof Uint8Array)
    && git.worktreeInventory.length > 0
    && Number.isSafeInteger(git.worktreeCount) && git.worktreeCount > 0;
}

function receiptWithoutDigest(instruction, activationId, activatedAt, git) {
  return {
    schema: ACTIVATION_SCHEMA,
    activationId,
    attributedBy: instruction.attributedBy,
    attributionBoundary: ATTRIBUTION_BOUNDARY,
    activatedAt,
    expiresAt: instruction.expiresAt,
    lastWallClock: activatedAt,
    finalGate: instruction.finalGate,
    feature: instruction.feature,
    base: instruction.base,
    statePreimageSha256: instruction.statePreimageSha256,
    authority: instruction.authority,
    packages: instruction.packages,
    pathAllowlist: instruction.pathAllowlist,
    surface: instruction.surface,
    budgets: instruction.budgets,
    deny: instruction.deny,
    worktree: {
      inventorySha256: sha256Raw(git.worktreeInventory),
      count: git.worktreeCount,
      featureRefCheckouts: git.featureRefCheckouts,
      head: git.head,
      indexTree: git.indexTree,
      worktreeTree: git.worktreeTree,
      detached: git.detached,
      clean: git.clean,
    },
  };
}

export function validateActivationReceipt(value) {
  if (!exactKeys(value, [
    "schema", "activationId", "attributedBy", "attributionBoundary", "activatedAt", "expiresAt",
    "lastWallClock", "finalGate", "feature", "base", "statePreimageSha256", "authority",
    "packages", "pathAllowlist", "surface", "budgets", "deny", "worktree", "receiptSha256",
  ])) return result("AFK-RECEIPT-INVALID");
  const instruction = {
    schema: INSTRUCTION_SCHEMA,
    attributedBy: value.attributedBy,
    expiresAt: value.expiresAt,
    finalGate: value.finalGate,
    feature: value.feature,
    base: value.base,
    statePreimageSha256: value.statePreimageSha256,
    authority: value.authority,
    packages: value.packages,
    pathAllowlist: value.pathAllowlist,
    surface: value.surface,
    budgets: value.budgets,
    deny: value.deny,
  };
  if (value.schema !== ACTIVATION_SCHEMA || !ACTIVATION_ID.test(value.activationId)
    || value.attributionBoundary !== ATTRIBUTION_BOUNDARY || !validInstructionShape(instruction)
    || isoTime(value.activatedAt) === null || isoTime(value.lastWallClock) === null
    || isoTime(value.expiresAt) <= isoTime(value.activatedAt)
    || isoTime(value.lastWallClock) < isoTime(value.activatedAt)
    || !exactKeys(value.worktree, [
      "inventorySha256", "count", "featureRefCheckouts", "head", "indexTree", "worktreeTree", "detached", "clean",
    ]) || !SHA256.test(value.worktree.inventorySha256)
    || !Number.isSafeInteger(value.worktree.count) || value.worktree.count < 1
    || value.worktree.featureRefCheckouts !== 0
    || !validOid(value.worktree.head, value.base.objectFormat)
    || !validOid(value.worktree.indexTree, value.base.objectFormat)
    || !validOid(value.worktree.worktreeTree, value.base.objectFormat)
    || value.worktree.head !== value.base.commit || value.worktree.indexTree !== value.base.tree
    || value.worktree.worktreeTree !== value.base.tree || value.worktree.detached !== true
    || value.worktree.clean !== true || !SHA256.test(value.receiptSha256)) {
    return result("AFK-RECEIPT-INVALID");
  }
  const { receiptSha256, ...preceding } = value;
  if (receiptSha256 !== sha256Canonical(preceding)) return result("AFK-RECEIPT-DIGEST-MISMATCH");
  return { ok: true, value };
}

export function classifyActivationReplay(candidate, existingReceipt, existingState = "admitted") {
  const candidateValidation = validateActivationReceipt(candidate);
  if (!candidateValidation.ok) return candidateValidation;
  if (existingReceipt === null || existingReceipt === undefined) return { ok: true, action: "append-intent", mutation: "wal" };
  const existingValidation = validateActivationReceipt(existingReceipt);
  if (!existingValidation.ok || !STATES.has(existingState) || existingState === "blocked") {
    return result("AFK-AUTHORITY-CONFLICT");
  }
  if (canonicalJson(candidate) === canonicalJson(existingReceipt)) {
    return { ok: true, action: "duplicate", mutation: "none", receipt: existingReceipt };
  }
  if (candidate.activationId === existingReceipt.activationId) return result("AFK-ACTIVATION-IDENTITY-CONFLICT");
  return result("AFK-LIVE-ACTIVATION-EXISTS");
}

export function prepareAfkActivation({
  instruction,
  activationId,
  activatedAt,
  statePreimage,
  authority,
  surface,
  git,
  existingReceipt = null,
  existingState = "off",
}) {
  if (!validInstructionShape(instruction)) return result("AFK-INSTRUCTION-INVALID");
  if (!ACTIVATION_ID.test(activationId) || isoTime(activatedAt) === null) return result("AFK-ACTIVATION-IDENTITY-INVALID");
  const now = isoTime(activatedAt);
  if (isoTime(instruction.expiresAt) <= now) return result("AFK-ACTIVATION-EXPIRED");
  if (!Buffer.isBuffer(statePreimage) && !(statePreimage instanceof Uint8Array)) return result("AFK-STATE-PREIMAGE-INVALID");
  if (sha256Raw(statePreimage) !== instruction.statePreimageSha256) return result("AFK-STATE-PREIMAGE-STALE");
  let state;
  try {
    state = JSON.parse(Buffer.from(statePreimage).toString("utf8"));
  } catch {
    return result("AFK-STATE-PREIMAGE-INVALID");
  }
  if (!validState(state, instruction)) return result("AFK-STATE-PREIMAGE-INVALID");
  if (hasProjectedActivation(state)) return result("AFK-LIVE-ACTIVATION-EXISTS");
  if (!validAuthorityObservations(authority, instruction)) return result("AFK-AUTHORITY-DIGEST-STALE");
  const capability = describeAfkProviderCapability(instruction.surface.provider);
  if (capability.status !== "supported") return result(capability.code);
  if (!validSurface(surface, instruction)) return result("AFK-PROVIDER-SURFACE-UNSUPPORTED");
  if (!validGitObservation(git, instruction)) return result("AFK-WORKTREE-PRECONDITION");
  const preceding = receiptWithoutDigest(instruction, activationId, activatedAt, git);
  const receipt = { ...preceding, receiptSha256: sha256Canonical(preceding) };
  const replay = classifyActivationReplay(receipt, existingReceipt, existingState);
  if (!replay.ok) return replay;
  return {
    ok: true,
    action: replay.action,
    mutation: replay.mutation,
    receipt: replay.receipt ?? receipt,
    expectedStatePreimageSha256: instruction.statePreimageSha256,
  };
}

export function advanceAfkWallClock(receipt, wallClock) {
  const valid = validateActivationReceipt(receipt);
  const now = isoTime(wallClock);
  if (!valid.ok || now === null) return result("AFK-LIFECYCLE-INVALID");
  const last = isoTime(receipt.lastWallClock);
  if (now < last) return result("AFK-CLOCK-ROLLBACK");
  if (now === last) return { ok: true, receipt, mutation: "none" };
  const { receiptSha256: _old, ...preceding } = receipt;
  preceding.lastWallClock = wallClock;
  return {
    ok: true,
    receipt: { ...preceding, receiptSha256: sha256Canonical(preceding) },
    mutation: "clock",
  };
}

export function evaluateAfkLifecycle({
  receipt,
  projectedState,
  wallClock,
  revocation = null,
  explicitReview = false,
}) {
  const valid = validateActivationReceipt(receipt);
  if (!valid.ok || !STATES.has(projectedState) || typeof explicitReview !== "boolean") {
    return result("AFK-LIFECYCLE-INVALID");
  }
  const now = isoTime(wallClock);
  if (now === null || (revocation !== null && (!exactKeys(revocation, ["attributedBy", "revokedAt"])
    || !nonEmptyString(revocation.attributedBy, 256) || isoTime(revocation.revokedAt) === null
    || isoTime(revocation.revokedAt) < isoTime(receipt.activatedAt)
    || isoTime(revocation.revokedAt) > now))) return result("AFK-LIFECYCLE-INVALID");
  const advanced = advanceAfkWallClock(receipt, wallClock);
  if (!advanced.ok) return advanced;
  const expired = now >= isoTime(receipt.expiresAt);
  const review = expired || revocation !== null || explicitReview || projectedState === "review-required";
  if (projectedState === "blocked") {
    return { ok: true, state: "blocked", proposalsAllowed: false, preserveEntries: true, mutation: "none", receipt };
  }
  if (review) {
    return {
      ok: true,
      state: "review-required",
      reason: expired ? "expired" : revocation !== null ? "revoked" : "explicit-review",
      proposalsAllowed: false,
      preserveEntries: true,
      mutation: projectedState === "review-required" && advanced.mutation === "none" ? "none" : "projection",
      receipt: advanced.receipt,
      revocationAttribution: revocation?.attributedBy ?? null,
    };
  }
  return {
    ok: true,
    state: projectedState,
    proposalsAllowed: projectedState === "active",
    preserveEntries: true,
    mutation: advanced.mutation,
    receipt: advanced.receipt,
  };
}
