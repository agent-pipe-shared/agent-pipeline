// SPDX-License-Identifier: SUL-1.0

/**
 * Installed-plugin continuity classification and pristine kickoff transaction.
 *
 * This module intentionally does not import the Public-Core harness writer.
 * Kickoff is the one narrow installed-plugin initializer: it accepts only an
 * absent-pristine preimage, validates one closed revision-0 continuity state,
 * serializes against the ordinary State lock, atomically replaces three fixed
 * targets, and immediately projects the sanctioned continuity readback.
 */
import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
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
import { fileURLToPath } from "node:url";

import { projectReadContinuityStatus } from "./continuity-status.mjs";
import {
  bindContinuitySessionCleanup,
  releaseContinuitySessionCleanup,
  validateContinuityState,
} from "./continuity-state.mjs";
import { resolveOnboardingPrivateState } from "./codex-onboarding-runtime.mjs";
import { readState as readSanctionedState } from "../scripts/continuity-status.mjs";
import {
  LEGACY_CALIBRATION,
  LEGACY_STATE,
  NEUTRAL_CALIBRATION,
  NEUTRAL_STATE,
  resolveProjectAuthorityPaths,
  validatePortablePipelineState,
} from "./project-authority.mjs";
import {
  inspectSessionClosure,
  listActiveSessionDescriptors,
  loadSessionDescriptor,
} from "./worktree-lifecycle.mjs";

export const KICKOFF_PLAN_SCHEMA = "pipeline.codex-onboarding-kickoff-plan.v1";
export const KICKOFF_HISTORY_SCHEMA = "pipeline.codex-onboarding-continuity-history.v1";
export const KICKOFF_APPLY_SCHEMA = "pipeline.codex-onboarding-kickoff-apply.v1";
export const KICKOFF_PROMOTION_PLAN_SCHEMA = "pipeline.codex-onboarding-kickoff-promotion-plan.v1";
export const KICKOFF_PROMOTION_APPLY_SCHEMA = "pipeline.codex-onboarding-kickoff-promotion-apply.v1";
export const KICKOFF_GOAL_MAX_BYTES = 160;
export const CONTINUITY_REPAIR_PLAN_SCHEMA = "pipeline.codex-onboarding-continuity-repair-plan.v1";
export const CONTINUITY_REPAIR_APPLY_SCHEMA = "pipeline.codex-onboarding-continuity-repair-apply.v1";
export const SESSION_CLEANUP_BIND_SCHEMA = "pipeline.codex-onboarding-session-cleanup-bind.v1";
export const SESSION_CLEANUP_RELEASE_PROOF_SCHEMA = "pipeline.session-cleanup-release-proof.v1";
export const SESSION_CLEANUP_RELEASE_RECEIPT_SCHEMA = "pipeline.session-cleanup-release-receipt.v1";
export const PRIVATE_SESSION_CLEANUP_BINDING_SCHEMA = "pipeline.private-session-cleanup-binding.v1";
export const PRIVATE_SESSION_CLEANUP_RELEASE_RECEIPT_SCHEMA = "pipeline.private-session-cleanup-release-receipt.v1";
export const PRIVATE_SESSION_CLEANUP_RELEASE_QUARANTINE_SCHEMA = "pipeline.private-session-cleanup-release-quarantine.v1";
export const SESSION_CLEANUP_PRIVATIZATION_PLAN_SCHEMA = "pipeline.session-cleanup-privatization-plan.v1";
export const SESSION_CLEANUP_PRIVATIZATION_APPLY_SCHEMA = "pipeline.session-cleanup-privatization-apply.v1";
export const PRIVATE_SESSION_CLEANUP_PRIVATIZATION_AUDIT_SCHEMA = "pipeline.private-session-cleanup-privatization-audit.v1";
export const PRIVATE_SESSION_CLEANUP_PRIVATIZATION_CONFIRMATION_SCHEMA = "pipeline.private-session-cleanup-privatization-confirmation.v1";
export const SESSION_CLEANUP_PRIVATIZATION_CONFIRMATION_SCHEMA = "pipeline.session-cleanup-privatization-confirmation.v1";
export const KICKOFF_PROMOTION_CLEANUP_RECOVERY_PLAN_SCHEMA = "pipeline.kickoff-promotion-cleanup-recovery-plan.v1";
export const KICKOFF_PROMOTION_CLEANUP_RECOVERY_APPLY_SCHEMA = "pipeline.kickoff-promotion-cleanup-recovery-apply.v1";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ONBOARDING_SCRIPT = join(HERE, "..", "scripts", "project-onboarding-v3.mjs");
const DEFAULT_SESSION_CLEANUP_SCRIPT = join(HERE, "..", "scripts", "session-cleanup.mjs");
const STATE_RELATIVE_PATH = NEUTRAL_STATE;
const CALIBRATION_RELATIVE_PATH = NEUTRAL_CALIBRATION;
const INITIAL_PRD_RELATIVE_PATH = "specs/kickoff-initial-prd.md";
const INITIAL_SPEC_RELATIVE_PATH = "specs/kickoff-initial-spec.md";
const HISTORY_BASENAME = "continuity-history.json";
const SESSION_CLEANUP_BINDING_BASENAME = "session-cleanup-binding.json";
const SESSION_CLEANUP_KEY_BASENAME = "session-cleanup-binding.key";
const SESSION_CLEANUP_RELEASE_RECEIPT_BASENAME = "session-cleanup-release-receipt.json";
const SESSION_CLEANUP_PRIVATIZATION_AUDIT_BASENAME = "session-cleanup-privatization-audit";
const SESSION_CLEANUP_PRIVATIZATION_CONFIRMATION_BASENAME = "session-cleanup-privatization-confirmation";
const SHA256_RE = /^[a-f0-9]{64}$/u;
const PLAN_KEYS = new Set([
  "schema", "root", "repositoryCapability", "goal", "goalSha256", "calibration",
  "targets", "transactionSha256", "onboardingScript", "planSha256", "applyAction",
]);
const TARGET_KEYS = {
  state: new Set(["path", "beforeSha256", "afterSha256", "value"]),
  handover: new Set(["path", "beforeSha256", "afterSha256", "content"]),
  prd: new Set(["path", "beforeSha256", "afterSha256", "content"]),
  spec: new Set(["path", "beforeSha256", "afterSha256", "content"]),
  history: new Set(["path", "beforeSha256", "afterSha256", "value"]),
};
const PROMOTION_PLAN_KEYS = new Set([
  "schema", "root", "repositoryCapability", "profile", "feature", "authority",
  "kickoff", "targets", "transactionSha256", "onboardingScript", "planSha256", "applyAction",
]);
const PROMOTION_TARGET_KEYS = {
  state: new Set(["path", "beforeSha256", "afterSha256", "value"]),
  history: new Set(["path", "beforeSha256", "afterSha256", "value"]),
  cleanupBinding: new Set(["beforeSha256", "afterSha256"]),
};
const PROMOTION_PROFILES = new Set(["epic", "feature", "mini"]);
const SAFE_FEATURE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

function authorityPaths(root) {
  const authority = resolveProjectAuthorityPaths({ rootDir: root });
  if (authority.status === "ready") {
    return { state: authority.state, calibration: authority.calibration };
  }
  return {
    state: existsSync(join(root, NEUTRAL_STATE)) ? NEUTRAL_STATE : LEGACY_STATE,
    calibration: existsSync(join(root, NEUTRAL_CALIBRATION))
      ? NEUTRAL_CALIBRATION
      : LEGACY_CALIBRATION,
  };
}

export const KICKOFF_FAULT_STAGES = Object.freeze([
  "prd-temp-fsync",
  "spec-temp-fsync",
  "state-temp-fsync",
  "handover-temp-fsync",
  "history-temp-fsync",
  "prd-rename",
  "prd-directory-fsync",
  "spec-rename",
  "spec-directory-fsync",
  "handover-rename",
  "handover-directory-fsync",
  "history-rename",
  "history-directory-fsync",
  "state-rename",
  "state-directory-fsync",
]);

export class KickoffError extends Error {
  constructor(code, message, { committed = false } = {}) {
    super(message);
    this.name = "KickoffError";
    this.code = code;
    this.committed = committed;
  }
}

class SimulatedKickoffCrash extends Error {}

function fail(code, message, options = undefined) {
  throw new KickoffError(code, message, options);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, expected) {
  return isObject(value)
    && Object.keys(value).length === expected.size
    && Object.keys(value).every((key) => expected.has(key));
}

function canonicalIsoTimestamp(value) {
  return typeof value === "string"
    && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString() === value;
}

function validClosedFeatureEntry(root, entry) {
  const baseKeys = new Set(["id", "planPath", "phaseAtClose", "closedAt", "closedBy", "forCommit"]);
  const expectedKeys = new Set(baseKeys);
  if (entry?.continuityClose !== undefined) expectedKeys.add("continuityClose");
  if (entry?.coordinatorClose !== undefined) expectedKeys.add("coordinatorClose");
  if (!exactKeys(entry, expectedKeys)
    || typeof entry.id !== "string" || entry.id.length === 0
    || typeof entry.planPath !== "string" || entry.planPath.length === 0
    || !(entry.phaseAtClose === null || typeof entry.phaseAtClose === "string")
    || !canonicalIsoTimestamp(entry.closedAt)
    || typeof entry.closedBy !== "string" || entry.closedBy.length === 0
    || !(entry.forCommit === null || /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(entry.forCommit))) return false;
  try { safeRelativePath(entry.planPath, "closed feature plan"); } catch { return false; }
  if (entry.continuityClose !== undefined) {
    const close = entry.continuityClose;
    if (!exactKeys(close, new Set(["schema", "featureId", "expectedRevision", "result", "closeEvidence"]))
      || close.schema !== "pipeline.continuity-close.v0"
      || close.featureId !== entry.id
      || !Number.isSafeInteger(close.expectedRevision) || close.expectedRevision < 0
      || !exactKeys(close.result, new Set(["path", "sha256"]))
      || !exactKeys(close.closeEvidence, new Set(["path", "sha256"]))
      || !validateClosedArtifact(root, close.result)
      || !validateClosedArtifact(root, close.closeEvidence)) return false;
  }
  if (entry.coordinatorClose !== undefined) {
    const coordinator = entry.coordinatorClose;
    if (!exactKeys(coordinator, new Set(["schema", "lifecycleId", "stateSha256", "revision", "phase"]))
      || coordinator.schema !== "pipeline.close-coordinator-reference.v1"
      || !/^[A-Za-z0-9._-]{1,100}$/u.test(coordinator.lifecycleId ?? "")
      || !SHA256_RE.test(coordinator.stateSha256 ?? "")
      || coordinator.revision !== 2
      || coordinator.phase !== "feature-close-prepared") return false;
  }
  return true;
}

function validClosedTransitionState(root, state) {
  return isObject(state)
    && state.schema === "pipeline.state.v0"
    && state.activeFeature === undefined
    && state.continuity === undefined
    && state.planApproval === undefined
    && state.planRevocation === undefined
    && state.planApproved === false
    && canonicalIsoTimestamp(state.updatedAt)
    && Array.isArray(state.closedFeatures)
    && state.closedFeatures.length > 0
    && state.closedFeatures.every((entry) => validClosedFeatureEntry(root, entry))
    && state.closedFeatures.at(-1).closedAt === state.updatedAt;
}

function validDesignTransitionState(state) {
  const valid = isObject(state)
    && state.schema === "pipeline.state.v0"
    && exactKeys(state.activeFeature, new Set(["id", "planPath", "phase"]))
    && typeof state.activeFeature.id === "string" && state.activeFeature.id.length > 0
    && typeof state.activeFeature.planPath === "string" && state.activeFeature.planPath.length > 0
    && state.activeFeature.phase === "design"
    && state.continuity === undefined
    && state.planApproval === undefined
    && state.planRevocation === undefined
    && state.planApproved === false
    && canonicalIsoTimestamp(state.updatedAt);
  if (!valid) return false;
  try { safeRelativePath(state.activeFeature.planPath, "active feature plan"); } catch { return false; }
  return true;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalSha256(value) {
  return sha256(Buffer.from(canonicalJson(value), "utf8"));
}

function physicalRoot(rootDir) {
  let info;
  const requested = resolve(rootDir);
  try {
    info = lstatSync(requested);
  } catch {
    fail("KICKOFF-ROOT-UNAVAILABLE", "project root is unavailable");
  }
  if (!info.isDirectory() || info.isSymbolicLink()) {
    fail("KICKOFF-ROOT-UNSAFE", "project root must be a physical directory");
  }
  const actual = realpathSync(requested);
  if (actual !== requested) fail("KICKOFF-ROOT-UNSAFE", "project root must not resolve through a symlink");
  return actual;
}

function safeRelativePath(value, label) {
  if (typeof value !== "string" || value.length < 1 || value.length > 240
    || isAbsolute(value) || value.includes("\\") || value.includes("\0")) {
    fail("KICKOFF-PATH-UNSAFE", `${label} path is unsafe`);
  }
  const parts = value.split("/");
  if (parts.some((part) => part.length === 0 || part === "." || part === "..")) {
    fail("KICKOFF-PATH-UNSAFE", `${label} path is unsafe`);
  }
  return value;
}

function absoluteProjectPath(root, relativePath, label) {
  safeRelativePath(relativePath, label);
  const path = resolve(root, relativePath);
  const rel = relative(root, path);
  if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    fail("KICKOFF-PATH-UNSAFE", `${label} path escaped the project root`);
  }
  return path;
}

function assertPhysicalChain(root, path, { leafMayBeAbsent = true } = {}) {
  const rel = relative(root, path);
  if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    fail("KICKOFF-PATH-UNSAFE", "project target escaped its root");
  }
  let cursor = root;
  const parts = rel.split(sep);
  for (let index = 0; index < parts.length; index += 1) {
    cursor = join(cursor, parts[index]);
    if (!existsSync(cursor)) {
      if (leafMayBeAbsent) return;
      fail("KICKOFF-PATH-UNAVAILABLE", "required project path is absent");
    }
    const info = lstatSync(cursor);
    if (info.isSymbolicLink()) fail("KICKOFF-PATH-UNSAFE", "project path contains a symlink");
    if (index < parts.length - 1 && !info.isDirectory()) {
      fail("KICKOFF-PATH-UNSAFE", "project path parent is not a directory");
    }
  }
}

function readPhysicalFile(path, label) {
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink()) fail("KICKOFF-PATH-UNSAFE", `${label} is not a physical regular file`);
  if ((info.mode & 0o444) === 0) fail("KICKOFF-READ-UNAVAILABLE", `${label} is unreadable`);
  try {
    return readFileSync(path);
  } catch {
    fail("KICKOFF-READ-UNAVAILABLE", `${label} is unreadable`);
  }
}

function observeOptionalProjectFile(root, relativePath, label) {
  const path = absoluteProjectPath(root, relativePath, label);
  assertPhysicalChain(root, path);
  if (!existsSync(path)) return { status: "absent", path, raw: null, sha256: null };
  const raw = readPhysicalFile(path, label);
  return { status: "present", path, raw, sha256: sha256(raw) };
}

function observeOptionalAbsoluteFile(path, label) {
  if (!existsSync(path)) return { status: "absent", path, raw: null, sha256: null };
  const raw = readPhysicalFile(path, label);
  return { status: "present", path, raw, sha256: sha256(raw) };
}

function parseJsonObject(observation, label) {
  let value;
  try {
    value = JSON.parse(observation.raw.toString("utf8"));
  } catch {
    fail("KICKOFF-READ-MALFORMED", `${label} is malformed`);
  }
  if (!isObject(value)) fail("KICKOFF-READ-MALFORMED", `${label} is not a JSON object`);
  return value;
}

function validateHistory(value) {
  const kickoffEntryKeys = new Set([
    "kind", "transactionSha256", "goalSha256", "calibrationSha256",
    "stateSha256", "handoverSha256", "prdSha256", "specSha256",
  ]);
  const promotionEntryKeys = new Set([
    "kind", "transactionSha256", "previousTransactionSha256", "profile", "kickoffFeatureId", "featureId",
    "planPath", "prdSha256", "specSha256", "beforeStateSha256", "afterStateSha256",
  ]);
  const validKickoff = (entry) => exactKeys(entry, kickoffEntryKeys)
    && entry.kind === "kickoff"
    && [
      "transactionSha256", "goalSha256", "calibrationSha256", "stateSha256",
      "handoverSha256", "prdSha256", "specSha256",
    ].every((key) => SHA256_RE.test(entry[key]));
  const validPromotion = (entry, previous) => (exactKeys(entry, promotionEntryKeys)
      || exactKeys(entry, new Set([...promotionEntryKeys, "cleanupBinding"])))
    && entry.kind === "kickoff-promotion"
    && SHA256_RE.test(entry.transactionSha256)
    && entry.previousTransactionSha256 === previous?.transactionSha256
    && PROMOTION_PROFILES.has(entry.profile)
    && /^kickoff-[a-f0-9]{16}$/u.test(entry.kickoffFeatureId)
    && SAFE_FEATURE_ID.test(entry.featureId)
    && typeof entry.planPath === "string"
    && ["prdSha256", "specSha256", "beforeStateSha256", "afterStateSha256"]
      .every((key) => SHA256_RE.test(entry[key]))
    && (entry.cleanupBinding === undefined || (exactKeys(entry.cleanupBinding, new Set(["beforeSha256", "afterSha256"]))
      && SHA256_RE.test(entry.cleanupBinding.beforeSha256) && SHA256_RE.test(entry.cleanupBinding.afterSha256)));
  if (!exactKeys(value, new Set(["schema", "transactions"]))
    || value.schema !== KICKOFF_HISTORY_SCHEMA
    || !Array.isArray(value.transactions)
    || value.transactions.length < 1
    || !validKickoff(value.transactions[0])
    || !value.transactions.slice(1).every((entry, index) => validPromotion(entry, value.transactions[index]))) {
    fail("KICKOFF-HISTORY-MALFORMED", "private continuity history is malformed");
  }
  return true;
}

function defaultGitSpawn(executable, argv, options) {
  return spawnSync(executable, argv, options);
}

function resolvePrivate(root, repositoryCapability, {
  create = false,
  spawn = defaultGitSpawn,
  createdDirectories,
  createdDirectoryRecords,
} = {}) {
  try {
    return resolveOnboardingPrivateState(root, repositoryCapability, {
      create, spawn, createdDirectories, createdDirectoryRecords,
    });
  } catch {
    fail("KICKOFF-PRIVATE-UNAVAILABLE", "private onboarding state is unavailable");
  }
}

function observeDetailed({
  rootDir,
  repositoryCapability = "local",
  spawn = defaultGitSpawn,
} = {}) {
  const empty = {
    status: "unavailable",
    stateSha256: null,
    handoverSha256: null,
    historySha256: null,
  };
  let root;
  let stateObservation;
  let handoverObservation;
  let historyObservation;
  try {
    root = physicalRoot(rootDir);
    const selectedPaths = authorityPaths(root);
    const calibrationObservation = observeOptionalProjectFile(root, selectedPaths.calibration, "Pipeline calibration");
    if (calibrationObservation.status !== "present") return { continuity: empty };
    const calibration = parseJsonObject(calibrationObservation, "Pipeline calibration");
    const handoverPath = calibration.handover === undefined
      ? "docs/state.md"
      : safeRelativePath(calibration.handover, "configured handover");
    if ([selectedPaths.calibration, selectedPaths.state].includes(handoverPath)
      || handoverPath === ".git" || handoverPath.startsWith(".git/")) {
      fail("KICKOFF-PATH-UNSAFE", "configured handover collides with a control path");
    }

    stateObservation = observeOptionalProjectFile(root, selectedPaths.state, "Pipeline machine state");
    handoverObservation = observeOptionalProjectFile(root, handoverPath, "configured handover");
    const privatePaths = resolvePrivate(root, repositoryCapability, { spawn });
    if (existsSync(privatePaths.directory) && (lstatSync(privatePaths.directory).mode & 0o777) !== 0o700) {
      fail("KICKOFF-PRIVATE-UNAVAILABLE", "private onboarding state directory is not mode 0700");
    }
    const historyPath = join(privatePaths.directory, HISTORY_BASENAME);
    historyObservation = observeOptionalAbsoluteFile(historyPath, "private continuity history");

    let history = null;
    if (historyObservation.status === "present") {
      if ((lstatSync(historyPath).mode & 0o777) !== 0o600) {
        fail("KICKOFF-PRIVATE-UNAVAILABLE", "private continuity history is not mode 0600");
      }
      history = parseJsonObject(historyObservation, "private continuity history");
      validateHistory(history);
    }

    const hashes = {
      stateSha256: stateObservation.sha256,
      handoverSha256: handoverObservation.sha256,
      historySha256: historyObservation.sha256,
    };
    if (stateObservation.status === "absent") {
      const status = handoverObservation.status === "absent" && historyObservation.status === "absent"
        ? "absent-pristine"
        : "damaged";
      return {
        continuity: { status, ...hashes },
        root,
        repositoryCapability,
        calibration,
        calibrationSha256: calibrationObservation.sha256,
        handoverPath,
        stateObservation,
        handoverObservation,
        historyObservation,
        history,
        privatePaths,
      };
    }

    const state = parseJsonObject(stateObservation, "Pipeline machine state");
    if (state.schema !== "pipeline.state.v0") {
      fail("KICKOFF-READ-MALFORMED", "Pipeline machine state schema is malformed");
    }
    const projected = projectReadContinuityStatus({ status: "ok", state });
    let status;
    if (projected.code === "CS-STATUS-ACTIVE" && projected.continuity.status === "valid") {
      status = "valid";
    } else if (projected.code === "CS-STATUS-INACTIVE" && validClosedTransitionState(root, state)) {
      status = "valid";
    } else if (projected.code === "CS-STATUS-ACTIVE-NO-CONTINUITY" && validDesignTransitionState(state)) {
      status = "valid";
    } else if (new Set([
      "CS-STATUS-ACTIVE-NO-CONTINUITY",
      "CS-STATUS-CONTINUITY-INVALID",
      "CS-STATUS-ORPHAN-CONTINUITY",
      "CS-STATUS-ACTIVE-FEATURE-INVALID",
      "CS-STATUS-INACTIVE",
    ]).has(projected.code)) {
      status = "damaged";
    } else {
      status = "unavailable";
    }
    return {
      continuity: { status, ...hashes },
      root,
      repositoryCapability,
      calibration,
      calibrationRelativePath: selectedPaths.calibration,
      stateRelativePath: selectedPaths.state,
      calibrationSha256: calibrationObservation.sha256,
      handoverPath,
      stateObservation,
      handoverObservation,
      historyObservation,
      history,
      privatePaths,
      state,
      projected,
    };
  } catch (error) {
    if (!(error instanceof KickoffError)) throw error;
    let stateSha256 = stateObservation?.sha256 ?? null;
    let handoverSha256 = handoverObservation?.sha256 ?? null;
    let historySha256 = historyObservation?.sha256 ?? null;
    if (stateObservation === undefined) {
      try {
        if (root) {
          const state = observeOptionalProjectFile(root, authorityPaths(root).state, "Pipeline machine state");
          stateSha256 = state.sha256;
        }
      } catch { /* unavailable means unobserved */ }
    }
    return {
      continuity: { status: "unavailable", stateSha256, handoverSha256, historySha256 },
      error,
    };
  }
}

/** Classify exactly absent-pristine|valid|damaged|unavailable without writing. */
export function classifyOnboardingContinuity(options = {}) {
  return observeDetailed(options).continuity;
}

function repairArtifact(root, path, label) {
  const safe = safeRelativePath(path, label);
  const observed = observeOptionalProjectFile(root, safe, label);
  if (observed.status !== "present") {
    fail("CONTINUITY-REPAIR-UNSUPPORTED", `${label} is absent`);
  }
  return { path: safe, sha256: observed.sha256 };
}

function establishedContinuity(state, observed) {
  const authority = state.planApproval?.poGateAuthority;
  if (state.planApproved !== true
    || !isObject(authority)
    || !new Set([
      "pipeline.po-gate-authority-evidence.v1",
      "pipeline.po-gate-authority.v2",
    ]).has(authority.schema)
    || !new Set(["de", "en"]).has(authority.humanFacing)
    || typeof authority.planPath !== "string"
    || typeof authority.specPath !== "string") {
    fail("CONTINUITY-REPAIR-UNSUPPORTED", "legacy state has no established PO authority");
  }
  const prd = repairArtifact(observed.root, authority.planPath, "approved PRD");
  const spec = repairArtifact(observed.root, authority.specPath, "approved specification");
  const continuity = {
    schema: "pipeline.continuity.v0",
    featureId: state.activeFeature.id,
    revision: 0,
    runtime: {
      humanFacingLanguage: authority.humanFacing,
      activeDuty: "Coordinator",
      sessionCleanup: null,
    },
    authority: {
      prd,
      spec,
      result: null,
    },
    queueHead: {
      packageId: "continuity-adoption",
      actionId: "review-active-feature",
      nextAction: "review",
      productRetryCount: 0,
      environmentRerouteCount: 0,
      dispatch: null,
    },
    blocker: null,
    acknowledgedFinal: null,
    resume: {
      mode: "immediate",
      sourceRevision: 0,
      reasonCode: "active-turn",
    },
    recovery: null,
    decisionTxn: null,
    capacity: {
      concurrencyLimit: 4,
      reservedCriticSlots: 1,
      reservedRecoverySlots: 1,
      fallbackPolicy: "defer",
    },
  };
  if (!validateContinuityState(continuity, state.activeFeature.id).ok) {
    fail("CONTINUITY-REPAIR-UNSUPPORTED", "legacy continuity adoption is invalid");
  }
  return {
    reason: "adopt-established-state",
    state: { ...state, continuity },
    authority: { prd, spec },
  };
}

function normalizedContinuity(state, observed) {
  const current = state.continuity;
  if (!isObject(current)
    || current.resume?.mode !== "resume-on-next-turn"
    || current.resume?.reasonCode !== "active-turn") {
    fail("CONTINUITY-REPAIR-UNSUPPORTED", "damaged continuity has no bounded normalization");
  }
  const next = structuredClone(state);
  next.continuity.resume.mode = "immediate";
  if (!validateContinuityState(next.continuity, next.activeFeature?.id).ok) {
    fail("CONTINUITY-REPAIR-UNSUPPORTED", "damaged continuity has additional invalid fields");
  }
  const prd = repairArtifact(observed.root, next.continuity.authority.prd.path, "continuity PRD");
  const spec = repairArtifact(observed.root, next.continuity.authority.spec.path, "continuity specification");
  if (prd.sha256 !== next.continuity.authority.prd.sha256
    || spec.sha256 !== next.continuity.authority.spec.sha256) {
    fail("CONTINUITY-REPAIR-UNSUPPORTED", "continuity authority bytes do not match state");
  }
  if (observed.historyObservation.status !== "present") {
    fail("CONTINUITY-REPAIR-UNSUPPORTED", "kickoff continuity history is absent");
  }
  return {
    reason: "normalize-active-resume",
    state: next,
    authority: { prd, spec },
  };
}

function continuityRepairBinding(plan) {
  return {
    schema: plan.schema,
    root: plan.root,
    repositoryCapability: plan.repositoryCapability,
    reason: plan.reason,
    calibration: plan.calibration,
    handover: plan.handover,
    history: plan.history,
    authority: plan.authority,
    target: plan.target,
  };
}

/**
 * Plan only two bounded repairs:
 * - normalize the invalid resume-on-next-turn/active-turn pair; or
 * - add continuity to an established pre-continuity state carrying PO authority.
 *
 * Arbitrary malformed state, authority drift, and missing kickoff history are
 * never re-signed by this compatibility path.
 */
export function planOnboardingContinuityRepair({
  rootDir,
  repositoryCapability = "local",
  spawn = defaultGitSpawn,
} = {}) {
  let observed;
  try {
    observed = observeDetailed({ rootDir, repositoryCapability, spawn });
    if (observed.continuity.status !== "damaged"
      || observed.stateObservation?.status !== "present"
      || observed.handoverObservation?.status !== "present") {
      return { schema: CONTINUITY_REPAIR_PLAN_SCHEMA, status: "unsupported" };
    }
    let proposed;
    if (observed.projected?.code === "CS-STATUS-CONTINUITY-INVALID") {
      proposed = normalizedContinuity(observed.state, observed);
    } else if (observed.projected?.code === "CS-STATUS-ACTIVE-NO-CONTINUITY"
      && observed.historyObservation.status === "absent") {
      proposed = establishedContinuity(observed.state, observed);
    } else {
      return { schema: CONTINUITY_REPAIR_PLAN_SCHEMA, status: "unsupported" };
    }
    const stateBytes = expectedStateBytes(proposed.state);
    const binding = {
      schema: CONTINUITY_REPAIR_PLAN_SCHEMA,
      root: observed.root,
      repositoryCapability,
      reason: proposed.reason,
      calibration: {
        path: observed.calibrationRelativePath,
        sha256: observed.calibrationSha256,
      },
      handover: {
        path: observed.handoverPath,
        sha256: observed.handoverObservation.sha256,
      },
      history: {
        path: HISTORY_BASENAME,
        sha256: observed.historyObservation.sha256,
      },
      authority: proposed.authority,
      target: {
        path: observed.stateRelativePath,
        beforeSha256: observed.stateObservation.sha256,
        afterSha256: sha256(stateBytes),
        value: proposed.state,
      },
    };
    return {
      ...binding,
      status: "ready",
      planSha256: canonicalSha256(binding),
    };
  } catch (error) {
    if (error instanceof KickoffError) {
      return {
        schema: CONTINUITY_REPAIR_PLAN_SCHEMA,
        status: "unsupported",
        code: error.code,
      };
    }
    throw error;
  }
}

/**
 * Apply one state-only continuity repair under the existing State writer lock.
 * Kickoff history is an immutable precondition and is never rewritten here.
 */
export function applyOnboardingContinuityRepair({
  rootDir,
  repositoryCapability = "local",
  expectedPlanSha256,
  activate = false,
  deps = {},
} = {}) {
  if (activate !== true) {
    fail("CONTINUITY-REPAIR-ACTIVATION-REQUIRED", "continuity repair requires explicit activation");
  }
  const spawn = deps.spawn ?? defaultGitSpawn;
  const plan = planOnboardingContinuityRepair({ rootDir, repositoryCapability, spawn });
  if (plan.status !== "ready"
    || !SHA256_RE.test(expectedPlanSha256 ?? "")
    || plan.planSha256 !== expectedPlanSha256
    || canonicalSha256(continuityRepairBinding(plan)) !== expectedPlanSha256) {
    fail("CONTINUITY-REPAIR-PLAN-DIGEST", "continuity repair plan digest does not match");
  }
  const statePath = absoluteProjectPath(plan.root, plan.target.path, "Pipeline machine state");
  const token = `continuity-repair-${plan.planSha256.slice(0, 32)}`;
  const lock = acquireLock(
    `${statePath}.lock`,
    "pipeline.continuity-lock.v0",
    token,
    {
      nowMs: deps.nowMs ?? Date.now,
      lockStaleMs: deps.lockStaleMs ?? 30_000,
    },
  );
  let temporaryRecord;
  let committed = false;
  try {
    const current = planOnboardingContinuityRepair({ rootDir, repositoryCapability, spawn });
    if (current.status !== "ready" || current.planSha256 !== plan.planSha256) {
      fail("CONTINUITY-REPAIR-CAS-DRIFT", "continuity repair preimage changed");
    }
    const suffixSource = (deps.randomUUID ?? randomUUID)();
    if (typeof suffixSource !== "string" || !/^[a-f0-9-]{32,64}$/iu.test(suffixSource)) {
      fail("CONTINUITY-REPAIR-RANDOM-UNAVAILABLE", "continuity repair temporary-name source is invalid");
    }
    const temporary = join(
      dirname(statePath),
      `.${basename(statePath)}.continuity-repair-${suffixSource.replaceAll("-", "")}.tmp`,
    );
    const stateBytes = expectedStateBytes(plan.target.value);
    temporaryRecord = writeExclusiveSynced(temporary, stateBytes, 0o600);
    if (sha256(readPhysicalFile(statePath, "Pipeline machine state")) !== plan.target.beforeSha256) {
      fail("CONTINUITY-REPAIR-CAS-DRIFT", "continuity repair state preimage changed");
    }
    renameSync(temporary, statePath);
    temporaryRecord = null;
    committed = true;
    fsyncDirectory(dirname(statePath));
    const continuity = classifyOnboardingContinuity({
      rootDir: plan.root,
      repositoryCapability,
      spawn,
    });
    if (continuity.status !== "valid"
      || continuity.stateSha256 !== plan.target.afterSha256
      || continuity.handoverSha256 !== plan.handover.sha256
      || continuity.historySha256 !== plan.history.sha256) {
      fail("CONTINUITY-REPAIR-READBACK-INVALID", "continuity repair readback is invalid", {
        committed: true,
      });
    }
    return {
      schema: CONTINUITY_REPAIR_APPLY_SCHEMA,
      status: "applied",
      root: plan.root,
      reason: plan.reason,
      planSha256: plan.planSha256,
      continuity,
    };
  } catch (error) {
    if (!committed && temporaryRecord) {
      try { unlinkOwned(temporaryRecord); } catch {}
    }
    if (error instanceof KickoffError) throw error;
    fail("CONTINUITY-REPAIR-WRITE-FAILED", "continuity repair failed", { committed });
  } finally {
    releaseLock(lock);
  }
}

function privateCleanupPaths(root, { create = false, spawn = defaultGitSpawn } = {}) {
  const privateState = resolvePrivate(root, "local", { create, spawn });
  return {
    directory: privateState.directory,
    binding: join(privateState.directory, SESSION_CLEANUP_BINDING_BASENAME),
    key: join(privateState.directory, SESSION_CLEANUP_KEY_BASENAME),
    releaseReceipt: join(privateState.directory, SESSION_CLEANUP_RELEASE_RECEIPT_BASENAME),
    privatizationAudit: (planSha256) => join(
      privateState.directory,
      `${SESSION_CLEANUP_PRIVATIZATION_AUDIT_BASENAME}.${planSha256}.json`,
    ),
    privatizationConfirmation: (planSha256) => join(
      privateState.directory,
      `${SESSION_CLEANUP_PRIVATIZATION_CONFIRMATION_BASENAME}.${planSha256}.json`,
    ),
  };
}

function assertPrivateCleanupFile(path, label) {
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1
    || (process.platform !== "win32" && (info.mode & 0o777) !== 0o600)) {
    fail("SESSION-CLEANUP-PRIVATE-UNSAFE", `${label} is unsafe`);
  }
  return readFileSync(path);
}

function cleanupBindingCore(value) {
  return {
    schema: value.schema,
    featureId: value.featureId,
    sessionCleanup: value.sessionCleanup,
    boundAt: value.boundAt,
  };
}

function cleanupBindingMac(core, key) {
  return createHmac("sha256", key).update(canonicalJson(core)).digest("hex");
}

function readPrivateCleanupBinding(root, { spawn = defaultGitSpawn } = {}) {
  let paths;
  try { paths = privateCleanupPaths(root, { spawn }); }
  catch { fail("SESSION-CLEANUP-PRIVATE-UNAVAILABLE", "private cleanup binding storage is unavailable"); }
  if (!existsSync(paths.binding) && !existsSync(paths.key)) return { binding: null, paths };
  if (!existsSync(paths.binding) && existsSync(paths.key)) {
    const key = assertPrivateCleanupFile(paths.key, "private cleanup binding key");
    if (key.length !== 32) fail("SESSION-CLEANUP-PRIVATE-DAMAGED", "private cleanup binding key is malformed");
    return { binding: null, paths };
  }
  if (!existsSync(paths.key)) {
    fail("SESSION-CLEANUP-PRIVATE-DAMAGED", "private cleanup binding storage is incomplete");
  }
  const key = assertPrivateCleanupFile(paths.key, "private cleanup binding key");
  if (key.length !== 32) fail("SESSION-CLEANUP-PRIVATE-DAMAGED", "private cleanup binding key is malformed");
  let bytes;
  let value;
  try {
    bytes = assertPrivateCleanupFile(paths.binding, "private cleanup binding");
    value = JSON.parse(bytes.toString("utf8"));
  }
  catch (error) {
    if (error instanceof KickoffError) throw error;
    fail("SESSION-CLEANUP-PRIVATE-DAMAGED", "private cleanup binding is malformed");
  }
  if (!exactKeys(value, new Set(["schema", "featureId", "sessionCleanup", "boundAt", "mac"]))
    || value.schema !== PRIVATE_SESSION_CLEANUP_BINDING_SCHEMA
    || typeof value.featureId !== "string" || value.featureId.length === 0
    || !isObject(value.sessionCleanup)
    || typeof value.sessionCleanup.sessionId !== "string"
    || !SHA256_RE.test(value.sessionCleanup.descriptorSha256 ?? "")
    || !canonicalIsoTimestamp(value.boundAt)
    || !SHA256_RE.test(value.mac ?? "")) {
    fail("SESSION-CLEANUP-PRIVATE-DAMAGED", "private cleanup binding has an invalid closed shape");
  }
  const expected = Buffer.from(cleanupBindingMac(cleanupBindingCore(value), key), "hex");
  const actual = Buffer.from(value.mac, "hex");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    fail("SESSION-CLEANUP-PRIVATE-AUTH", "private cleanup binding authentication failed");
  }
  return { binding: value, paths, bytes, sha256: sha256(bytes), key };
}

function privateReleaseReceiptCore(value) {
  return {
    schema: value.schema,
    featureId: value.featureId,
    stateSha256: value.stateSha256,
    coordinatorCloseSha256: value.coordinatorCloseSha256,
    closureReceiptSha256: value.closureReceiptSha256,
    recoveryPlanSha256: value.recoveryPlanSha256,
    bindingSha256: value.bindingSha256,
    releasedAt: value.releasedAt,
  };
}

function privateReleaseQuarantineCore(value) {
  return {
    schema: value.schema,
    stateSha256: value.stateSha256,
    receiptSha256: value.receiptSha256,
    recoveryPlanSha256: value.recoveryPlanSha256,
    quarantinedAt: value.quarantinedAt,
  };
}

function parsePrivateReleaseQuarantine(bytes, key) {
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); } catch { return null; }
  if (!exactKeys(value, new Set([
    "schema", "stateSha256", "receiptSha256", "recoveryPlanSha256", "quarantinedAt", "mac",
  ]))
    || value.schema !== PRIVATE_SESSION_CLEANUP_RELEASE_QUARANTINE_SCHEMA
    || !SHA256_RE.test(value.stateSha256 ?? "")
    || !SHA256_RE.test(value.receiptSha256 ?? "")
    || !SHA256_RE.test(value.recoveryPlanSha256 ?? "")
    || !canonicalIsoTimestamp(value.quarantinedAt)
    || !SHA256_RE.test(value.mac ?? "")) return null;
  const expected = Buffer.from(cleanupBindingMac(privateReleaseQuarantineCore(value), key), "hex");
  const actual = Buffer.from(value.mac, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected) ? value : null;
}

function readPrivateCleanupReleaseReceipt(root, { spawn = defaultGitSpawn } = {}) {
  let paths;
  try { paths = privateCleanupPaths(root, { spawn }); }
  catch { fail("SESSION-CLEANUP-PRIVATE-UNAVAILABLE", "private cleanup receipt storage is unavailable"); }
  if (!existsSync(paths.releaseReceipt)) return { receipt: null, paths };
  if (!existsSync(paths.key)) fail("SESSION-CLEANUP-PRIVATE-DAMAGED", "private cleanup receipt key is missing");
  const key = assertPrivateCleanupFile(paths.key, "private cleanup binding key");
  if (key.length !== 32) fail("SESSION-CLEANUP-PRIVATE-DAMAGED", "private cleanup binding key is malformed");
  let value;
  try { value = JSON.parse(assertPrivateCleanupFile(paths.releaseReceipt, "private cleanup release receipt").toString("utf8")); }
  catch (error) {
    if (error instanceof KickoffError) throw error;
    fail("SESSION-CLEANUP-PRIVATE-DAMAGED", "private cleanup release receipt is malformed");
  }
  if (!exactKeys(value, new Set([
    "schema", "featureId", "stateSha256", "coordinatorCloseSha256", "closureReceiptSha256",
    "recoveryPlanSha256", "bindingSha256", "releasedAt", "mac",
  ]))
    || value.schema !== PRIVATE_SESSION_CLEANUP_RELEASE_RECEIPT_SCHEMA
    || typeof value.featureId !== "string" || value.featureId.length === 0
    || !SHA256_RE.test(value.stateSha256 ?? "")
    || !SHA256_RE.test(value.coordinatorCloseSha256 ?? "")
    || !SHA256_RE.test(value.closureReceiptSha256 ?? "")
    || !SHA256_RE.test(value.recoveryPlanSha256 ?? "")
    || !SHA256_RE.test(value.bindingSha256 ?? "")
    || !canonicalIsoTimestamp(value.releasedAt)
    || !SHA256_RE.test(value.mac ?? "")) {
    fail("SESSION-CLEANUP-PRIVATE-DAMAGED", "private cleanup release receipt has an invalid closed shape");
  }
  const expected = Buffer.from(cleanupBindingMac(privateReleaseReceiptCore(value), key), "hex");
  const actual = Buffer.from(value.mac, "hex");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    fail("SESSION-CLEANUP-PRIVATE-AUTH", "private cleanup release receipt authentication failed");
  }
  return { receipt: value, paths };
}

function observePrivateCleanupReleaseReceipt(root, { spawn = defaultGitSpawn } = {}) {
  let paths;
  try { paths = privateCleanupPaths(root, { spawn }); }
  catch { fail("SESSION-CLEANUP-PRIVATE-UNAVAILABLE", "private cleanup receipt storage is unavailable"); }
  if (!existsSync(paths.releaseReceipt)) {
    return { status: "absent", sha256: null, receipt: null, bytes: null, paths };
  }
  const bytes = assertPrivateCleanupFile(paths.releaseReceipt, "private cleanup release receipt");
  const receiptSha256 = sha256(bytes);
  if (existsSync(paths.key)) {
    const key = assertPrivateCleanupFile(paths.key, "private cleanup binding key");
    if (key.length !== 32) fail("SESSION-CLEANUP-PRIVATE-DAMAGED", "private cleanup binding key is malformed");
    const quarantine = parsePrivateReleaseQuarantine(bytes, key);
    if (quarantine !== null) {
      return {
        status: "quarantined",
        sha256: receiptSha256,
        receipt: null,
        quarantine,
        bytes,
        paths,
      };
    }
  }
  try {
    return {
      status: "valid",
      sha256: receiptSha256,
      receipt: readPrivateCleanupReleaseReceipt(root, { spawn }).receipt,
      bytes,
      paths,
    };
  } catch (error) {
    if (error instanceof KickoffError
      && new Set(["SESSION-CLEANUP-PRIVATE-AUTH", "SESSION-CLEANUP-PRIVATE-DAMAGED"]).has(error.code)) {
      return { status: "invalid", sha256: receiptSha256, receipt: null, bytes, paths };
    }
    throw error;
  }
}

function archiveObservedPrivateCleanupReleaseReceipt(observed, archiveId) {
  if (observed.status === "absent" || !SHA256_RE.test(archiveId ?? "")) {
    fail("SESSION-CLEANUP-PRIVATE-RECEIPT-ARCHIVE", "private cleanup release receipt archive request is invalid");
  }
  const archivePath = join(
    observed.paths.directory,
    `session-cleanup-release-receipt.${archiveId}.json`,
  );
  if (existsSync(archivePath)) {
    const archivedBytes = assertPrivateCleanupFile(archivePath, "private cleanup release receipt archive");
    if (archivedBytes.equals(observed.bytes) && !existsSync(observed.paths.releaseReceipt)) return archivePath;
    fail("SESSION-CLEANUP-PRIVATE-RECEIPT-ARCHIVE", "private cleanup release receipt archive already exists");
  }
  try {
    renameSync(observed.paths.releaseReceipt, archivePath);
    fsyncDirectory(observed.paths.directory);
  } catch {
    fail("SESSION-CLEANUP-PRIVATE-RECEIPT-ARCHIVE", "private cleanup release receipt could not be archived");
  }
  const archivedBytes = assertPrivateCleanupFile(archivePath, "private cleanup release receipt archive");
  if (!archivedBytes.equals(observed.bytes) || existsSync(observed.paths.releaseReceipt)) {
    fail("SESSION-CLEANUP-PRIVATE-RECEIPT-ARCHIVE", "private cleanup release receipt archive readback failed", {
      committed: true,
    });
  }
  return archivePath;
}

function archivePrivateCleanupReleaseReceipt(root, { spawn = defaultGitSpawn } = {}) {
  const observed = observePrivateCleanupReleaseReceipt(root, { spawn });
  if (observed.status === "absent") return null;
  if (!new Set(["valid", "quarantined"]).has(observed.status)) {
    fail("SESSION-CLEANUP-PRIVATE-RECEIPT-ARCHIVE", "invalid private cleanup release receipt requires recovery");
  }
  return archiveObservedPrivateCleanupReleaseReceipt(
    observed,
    observed.receipt?.recoveryPlanSha256 ?? observed.quarantine.recoveryPlanSha256,
  );
}

function writePrivateCleanupReleaseReceipt(root, receipt, { spawn = defaultGitSpawn } = {}) {
  const observed = readPrivateCleanupReleaseReceipt(root, { spawn });
  if (observed.receipt !== null) {
    const expectedCore = privateReleaseReceiptCore(receipt);
    const observedCore = privateReleaseReceiptCore(observed.receipt);
    delete expectedCore.releasedAt;
    delete observedCore.releasedAt;
    if (canonicalJson(observedCore) === canonicalJson(expectedCore)) return observed.receipt;
    fail("SESSION-CLEANUP-PRIVATE-RECEIPT-CAS", "private cleanup release receipt changed");
  }
  const key = assertPrivateCleanupFile(observed.paths.key, "private cleanup binding key");
  if (key.length !== 32) fail("SESSION-CLEANUP-PRIVATE-DAMAGED", "private cleanup binding key is malformed");
  const core = privateReleaseReceiptCore(receipt);
  const value = { ...core, mac: cleanupBindingMac(core, key) };
  let record = null;
  try {
    record = writeExclusiveSynced(
      observed.paths.releaseReceipt,
      Buffer.from(`${JSON.stringify(value)}\n`, "utf8"),
      0o600,
    );
    fsyncDirectory(observed.paths.directory);
  } catch {
    try { unlinkOwned(record); } catch {}
    fail("SESSION-CLEANUP-PRIVATE-WRITE", "private cleanup release receipt could not be persisted");
  }
  const readback = readPrivateCleanupReleaseReceipt(root, { spawn }).receipt;
  if (canonicalJson(readback) !== canonicalJson(value)) {
    fail("SESSION-CLEANUP-PRIVATE-READBACK", "private cleanup release receipt readback failed", { committed: true });
  }
  return readback;
}

function writePrivateCleanupBinding(root, featureId, sessionCleanup, {
  spawn = defaultGitSpawn,
  now = () => new Date().toISOString(),
  random = randomBytes,
} = {}) {
  const paths = privateCleanupPaths(root, { create: true, spawn });
  if (existsSync(paths.binding)) {
    fail("SESSION-CLEANUP-PRIVATE-CONFLICT", "private cleanup binding already exists");
  }
  archivePrivateCleanupReleaseReceipt(root, { spawn });
  let key;
  let createdKey = false;
  if (existsSync(paths.key)) {
    key = assertPrivateCleanupFile(paths.key, "private cleanup binding key");
    if (key.length !== 32) fail("SESSION-CLEANUP-PRIVATE-DAMAGED", "private cleanup binding key is malformed");
  } else {
    key = random(32);
    if (!Buffer.isBuffer(key) || key.length !== 32) {
      fail("SESSION-CLEANUP-PRIVATE-RANDOM", "private cleanup binding key generation failed");
    }
  }
  const core = {
    schema: PRIVATE_SESSION_CLEANUP_BINDING_SCHEMA,
    featureId,
    sessionCleanup: structuredClone(sessionCleanup),
    boundAt: now(),
  };
  const value = { ...core, mac: cleanupBindingMac(core, key) };
  try {
    if (!existsSync(paths.key)) {
      writeFileSync(paths.key, key, { mode: 0o600, flag: "wx" });
      createdKey = true;
    }
    writeFileSync(paths.binding, `${JSON.stringify(value)}\n`, { mode: 0o600, flag: "wx" });
    fsyncDirectory(paths.directory);
  } catch {
    try { if (existsSync(paths.binding)) unlinkSync(paths.binding); } catch {}
    try { if (createdKey && existsSync(paths.key)) unlinkSync(paths.key); } catch {}
    fail("SESSION-CLEANUP-PRIVATE-WRITE", "private cleanup binding could not be persisted");
  }
  const readback = readPrivateCleanupBinding(root, { spawn });
  if (canonicalJson(readback.binding) !== canonicalJson(value)) {
    fail("SESSION-CLEANUP-PRIVATE-READBACK", "private cleanup binding readback failed", { committed: true });
  }
  return readback.binding;
}

function promotedPrivateCleanupBinding(observed, featureId) {
  if (observed?.binding === null || !Buffer.isBuffer(observed?.key)
    || observed.key.length !== 32 || !SHA256_RE.test(observed.sha256 ?? "")
    || !SAFE_FEATURE_ID.test(featureId ?? "")) {
    fail("KICKOFF-PROMOTION-PRIVATE-BINDING", "private cleanup binding promotion input is invalid");
  }
  const core = {
    ...cleanupBindingCore(observed.binding),
    featureId,
  };
  return Buffer.from(`${JSON.stringify({ ...core, mac: cleanupBindingMac(core, observed.key) })}\n`, "utf8");
}

function replacePromotedPrivateCleanupBinding(root, observed, expectedBeforeSha256, expectedAfterBytes, {
  spawn = defaultGitSpawn,
  suffix,
} = {}) {
  if (!SHA256_RE.test(expectedBeforeSha256 ?? "") || !Buffer.isBuffer(expectedAfterBytes)) {
    fail("KICKOFF-PROMOTION-PRIVATE-BINDING", "private cleanup binding promotion target is invalid");
  }
  if (observed.binding === null || observed.sha256 !== expectedBeforeSha256) {
    fail("KICKOFF-PROMOTION-CAS-DRIFT", "private cleanup binding preimage drifted");
  }
  if (typeof suffix !== "string" || !/^[a-f0-9]{32,64}$/iu.test(suffix)) {
    fail("KICKOFF-PROMOTION-PRIVATE-BINDING", "private cleanup binding temporary name is invalid");
  }
  const temporary = `${observed.paths.binding}.promotion-${suffix}.tmp`;
  let record;
  try {
    record = writeExclusiveSynced(temporary, expectedAfterBytes, 0o600);
    const current = readPrivateCleanupBinding(root, { spawn });
    if (current.binding === null || current.sha256 !== expectedBeforeSha256
      || canonicalJson(current.binding) !== canonicalJson(observed.binding)) {
      fail("KICKOFF-PROMOTION-CAS-DRIFT", "private cleanup binding preimage drifted");
    }
    renameSync(temporary, observed.paths.binding);
    record = null;
    fsyncDirectory(observed.paths.directory);
    const readback = readPrivateCleanupBinding(root, { spawn });
    if (readback.binding === null || !readback.bytes.equals(expectedAfterBytes)) {
      fail("KICKOFF-PROMOTION-PRIVATE-READBACK", "private cleanup binding readback failed", { committed: true });
    }
    return readback;
  } catch (error) {
    try { unlinkOwned(record); } catch {}
    if (error instanceof KickoffError) throw error;
    fail("KICKOFF-PROMOTION-PRIVATE-WRITE", "private cleanup binding temporary write failed");
  }
}

function deletePrivateCleanupBinding(root, expected, { spawn = defaultGitSpawn } = {}) {
  const observed = readPrivateCleanupBinding(root, { spawn });
  if (observed.binding === null) return false;
  if (canonicalJson(observed.binding.sessionCleanup) !== canonicalJson(expected)) {
    fail("SESSION-CLEANUP-PRIVATE-CAS", "private cleanup binding changed");
  }
  unlinkSync(observed.paths.binding);
  fsyncDirectory(observed.paths.directory);
  return true;
}

function observeMachineState(rootDir, spawn = defaultGitSpawn, {
  allowNeutralCleanupLeak = false,
} = {}) {
  const root = physicalRoot(rootDir);
  const selectedState = authorityPaths(root).state;
  const path = absoluteProjectPath(root, selectedState, "Pipeline machine state");
  assertPhysicalChain(root, path, { leafMayBeAbsent: false });
  const raw = readPhysicalFile(path, "Pipeline machine state");
  let state;
  try {
    state = JSON.parse(raw.toString("utf8"));
  } catch {
    fail("SESSION-CLEANUP-STATE-MALFORMED", "Pipeline machine state is malformed");
  }
  if (!isObject(state) || state.schema !== "pipeline.state.v0") {
    fail("SESSION-CLEANUP-STATE-MALFORMED", "Pipeline machine state is malformed");
  }
  const neutral = selectedState === NEUTRAL_STATE;
  if (neutral) {
    const portability = validatePortablePipelineState(state);
    if (!portability.ok && !allowNeutralCleanupLeak) {
      fail("SESSION-CLEANUP-STATE-NONPORTABLE", "neutral Pipeline machine state contains private cleanup identity");
    }
  }
  const privateBindingObservation = neutral ? readPrivateCleanupBinding(root, { spawn }) : null;
  return {
    root,
    path,
    raw,
    state,
    stateSha256: sha256(raw),
    neutral,
    privateBinding: privateBindingObservation?.binding ?? null,
    privateBindingSha256: privateBindingObservation?.sha256 ?? null,
  };
}

function observeSessionCleanupPrivatization(rootDir, spawn = defaultGitSpawn) {
  const observed = observeMachineState(rootDir, spawn, { allowNeutralCleanupLeak: true });
  if (!observed.neutral) {
    fail("SESSION-CLEANUP-PRIVATIZE-NEUTRAL-REQUIRED", "cleanup privatization requires neutral project State");
  }
  const portable = validatePortablePipelineState(observed.state);
  if (portable.ok) {
    return {
      ...observed,
      status: "noop",
      featureId: observed.state.activeFeature?.id ?? null,
      leakedBinding: null,
      portableState: observed.state,
    };
  }
  const leakedBinding = observed.state?.continuity?.runtime?.sessionCleanup;
  if (portable.path !== "$.continuity.runtime.sessionCleanup"
    || !isObject(leakedBinding)
    || !exactKeys(leakedBinding, new Set(["sessionId", "descriptorSha256"]))
    || typeof leakedBinding.sessionId !== "string"
    || leakedBinding.sessionId.length === 0
    || !SHA256_RE.test(leakedBinding.descriptorSha256 ?? "")
    || typeof observed.state.activeFeature?.id !== "string"
    || observed.state.activeFeature.id.length === 0) {
    fail("SESSION-CLEANUP-PRIVATIZE-SHAPE", "neutral cleanup leakage is not the exact migratable binding shape");
  }
  const portableState = structuredClone(observed.state);
  portableState.continuity.runtime.sessionCleanup = null;
  const sanitized = validatePortablePipelineState(portableState);
  if (!sanitized.ok) {
    fail("SESSION-CLEANUP-PRIVATIZE-SHAPE", "neutral State contains additional private cleanup identity");
  }
  if (observed.privateBinding !== null
    && (observed.privateBinding.featureId !== observed.state.activeFeature.id
      || canonicalJson(observed.privateBinding.sessionCleanup) !== canonicalJson(leakedBinding))) {
    fail("SESSION-CLEANUP-PRIVATE-CAS", "private cleanup binding conflicts with portable migration input");
  }
  let descriptorObservation = "available";
  let descriptors;
  try {
    descriptors = listActiveSessionDescriptors(observed.root, { spawn });
    if (descriptors.length !== 1
      || descriptors[0].sessionId !== leakedBinding.sessionId
      || descriptors[0].descriptorSha256 !== leakedBinding.descriptorSha256) {
      fail(
        "SESSION-CLEANUP-PRIVATIZE-DESCRIPTOR",
        "cleanup privatization requires exactly the bound active descriptor",
      );
    }
    loadSessionDescriptor(observed.root, leakedBinding.sessionId, {
      spawn,
      expectedDescriptorSha256: leakedBinding.descriptorSha256,
    });
  } catch (error) {
    if (error instanceof KickoffError) throw error;
    // An unavailable descriptor is not an ownership proof.  It can enter the
    // exceptional Human recovery only when the private MAC binding already
    // proves the exact feature/tuple.  Missing, replaced, or multiple
    // descriptors above remain typed hard stops rather than being inferred.
    if (observed.privateBinding === null || !SHA256_RE.test(observed.privateBindingSha256 ?? "")) {
      fail(
        "SESSION-CLEANUP-PRIVATIZE-DESCRIPTOR",
        "cleanup privatization active descriptor is unavailable or inconsistent",
      );
    }
    descriptorObservation = "unavailable";
  }
  return {
    ...observed,
    status: "ready",
    featureId: observed.state.activeFeature.id,
    leakedBinding,
    portableState,
    mode: descriptorObservation === "unavailable" ? "owner-observation-recovery" : "ordinary",
  };
}

function sessionCleanupPrivatizationWriter(path) {
  if (typeof path !== "string" || !isAbsolute(path) || resolve(path) !== path) {
    fail("SESSION-CLEANUP-PRIVATIZE-WRITER", "cleanup privatization writer path is invalid");
  }
  let info;
  try {
    info = lstatSync(path);
  } catch {
    fail("SESSION-CLEANUP-PRIVATIZE-WRITER", "cleanup privatization writer is unavailable");
  }
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || realpathSync(path) !== path) {
    fail("SESSION-CLEANUP-PRIVATIZE-WRITER", "cleanup privatization writer is unsafe");
  }
  return path;
}

function sessionCleanupPrivatizationPlanCore(observed, sessionCleanupScript) {
  return {
    schema: SESSION_CLEANUP_PRIVATIZATION_PLAN_SCHEMA,
    status: observed.status,
    root: observed.root,
    statePath: NEUTRAL_STATE,
    stateSha256: observed.stateSha256,
    featureId: observed.featureId,
    privateBindingStatus: observed.privateBinding === null ? "unbound" : "bound",
    mode: observed.mode ?? "noop",
    sessionCleanupScript,
  };
}

function sessionCleanupPrivatizationApplyAction(sessionCleanupScript, root, planSha256, mode = "ordinary") {
  return {
    kind: "command",
    executable: "node",
    argv: [
      sessionCleanupScript,
      "apply-privatization",
      "--repo",
      root,
      "--plan-sha256",
      planSha256,
      "--activate",
    ],
    mutation: true,
    requiresConfirmation: true,
    executionBoundary: "host-authorized-wsl",
    expected: {
      schema: SESSION_CLEANUP_PRIVATIZATION_APPLY_SCHEMA,
      statuses: mode === "owner-observation-recovery" ? ["blocked"] : ["applied", "noop"],
    },
  };
}

function sessionCleanupPrivatizationConfirmationAction(sessionCleanupScript, root, planSha256) {
  return {
    kind: "command",
    executable: "node",
    argv: [
      sessionCleanupScript,
      "confirm-privatization",
      "--repo",
      root,
      "--plan-sha256",
      planSha256,
      "--accept",
    ],
    mutation: true,
    requiresConfirmation: true,
    executionBoundary: "host-authorized-wsl",
    expected: {
      schema: SESSION_CLEANUP_PRIVATIZATION_CONFIRMATION_SCHEMA,
      statuses: ["confirmed"],
    },
  };
}

/**
 * Construct a read-only, identifier-free plan for removing the one historical
 * neutral cleanup tuple. The State digest binds the exact private preimage
 * without projecting its session ID or descriptor digest into public output.
 */
export function planOnboardingSessionCleanupPrivatization({
  rootDir,
  spawn = defaultGitSpawn,
  sessionCleanupScript = DEFAULT_SESSION_CLEANUP_SCRIPT,
} = {}) {
  const observed = observeSessionCleanupPrivatization(rootDir, spawn);
  const writer = sessionCleanupPrivatizationWriter(sessionCleanupScript);
  const core = sessionCleanupPrivatizationPlanCore(observed, writer);
  const planSha256 = sha256(Buffer.from(canonicalJson(core)));
  return {
    ...core,
    planSha256,
    action: observed.status === "ready"
      ? {
        command: "apply-privatization",
        expectedPlanSha256: planSha256,
        requiresActivation: true,
      }
      : null,
    applyAction: observed.status !== "ready" ? null
      : observed.mode === "owner-observation-recovery"
        ? sessionCleanupPrivatizationConfirmationAction(writer, observed.root, planSha256)
        : sessionCleanupPrivatizationApplyAction(writer, observed.root, planSha256, observed.mode),
  };
}

function privatizationConfirmationCore({ planSha256, stateSha256, bindingSha256, acceptedAt }) {
  return {
    schema: PRIVATE_SESSION_CLEANUP_PRIVATIZATION_CONFIRMATION_SCHEMA,
    planSha256,
    stateSha256,
    bindingSha256,
    acceptedAt,
  };
}

function readPrivateCleanupPrivatizationConfirmation(root, planSha256, { spawn = defaultGitSpawn } = {}) {
  if (!SHA256_RE.test(planSha256 ?? "")) {
    fail("SESSION-CLEANUP-PRIVATIZE-CONFIRMATION", "cleanup recovery confirmation digest is invalid");
  }
  const observed = readPrivateCleanupBinding(root, { spawn });
  const path = observed.paths.privatizationConfirmation(planSha256);
  if (!existsSync(path)) return null;
  let value;
  try { value = JSON.parse(assertPrivateCleanupFile(path, "private cleanup privatization confirmation").toString("utf8")); }
  catch { fail("SESSION-CLEANUP-PRIVATIZE-CONFIRMATION", "cleanup recovery confirmation is malformed"); }
  if (!exactKeys(value, new Set(["schema", "planSha256", "stateSha256", "bindingSha256", "acceptedAt", "mac"]))
    || value.schema !== PRIVATE_SESSION_CLEANUP_PRIVATIZATION_CONFIRMATION_SCHEMA
    || value.planSha256 !== planSha256
    || !SHA256_RE.test(value.stateSha256 ?? "")
    || !SHA256_RE.test(value.bindingSha256 ?? "")
    || !canonicalIsoTimestamp(value.acceptedAt)
    || !SHA256_RE.test(value.mac ?? "")) {
    fail("SESSION-CLEANUP-PRIVATIZE-CONFIRMATION", "cleanup recovery confirmation has an invalid shape");
  }
  const core = privatizationConfirmationCore(value);
  const expected = Buffer.from(cleanupBindingMac(core, observed.key), "hex");
  const actual = Buffer.from(value.mac, "hex");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    fail("SESSION-CLEANUP-PRIVATIZE-CONFIRMATION", "cleanup recovery confirmation authentication failed");
  }
  return value;
}

function writePrivateCleanupPrivatizationConfirmation(root, observed, planSha256, {
  now = () => new Date().toISOString(),
  spawn = defaultGitSpawn,
} = {}) {
  if (observed.mode !== "owner-observation-recovery" || !SHA256_RE.test(observed.privateBindingSha256 ?? "")) {
    fail("SESSION-CLEANUP-PRIVATIZE-CONFIRMATION", "cleanup recovery confirmation has no eligible private binding");
  }
  const existing = readPrivateCleanupPrivatizationConfirmation(root, planSha256, { spawn });
  if (existing !== null) {
    if (existing.stateSha256 !== observed.stateSha256 || existing.bindingSha256 !== observed.privateBindingSha256) {
      fail("SESSION-CLEANUP-PRIVATIZE-CONFIRMATION", "cleanup recovery confirmation preimage changed");
    }
    return existing;
  }
  const binding = readPrivateCleanupBinding(root, { spawn });
  const core = privatizationConfirmationCore({
    planSha256,
    stateSha256: observed.stateSha256,
    bindingSha256: observed.privateBindingSha256,
    acceptedAt: now(),
  });
  if (!canonicalIsoTimestamp(core.acceptedAt)) {
    fail("SESSION-CLEANUP-PRIVATIZE-CONFIRMATION", "cleanup recovery confirmation timestamp is invalid");
  }
  const value = { ...core, mac: cleanupBindingMac(core, binding.key) };
  const path = binding.paths.privatizationConfirmation(planSha256);
  try {
    writeFileSync(path, `${JSON.stringify(value)}\n`, { mode: 0o600, flag: "wx" });
    fsyncDirectory(binding.paths.directory);
  } catch {
    fail("SESSION-CLEANUP-PRIVATIZE-CONFIRMATION", "cleanup recovery confirmation could not be persisted");
  }
  const readback = readPrivateCleanupPrivatizationConfirmation(root, planSha256, { spawn });
  if (canonicalJson(readback) !== canonicalJson(value)) {
    fail("SESSION-CLEANUP-PRIVATIZE-CONFIRMATION", "cleanup recovery confirmation readback failed", { committed: true });
  }
  return readback;
}

export function confirmOnboardingSessionCleanupPrivatization({
  rootDir,
  expectedPlanSha256,
  accept = false,
  deps = {},
  sessionCleanupScript = DEFAULT_SESSION_CLEANUP_SCRIPT,
} = {}) {
  if (accept !== true || !SHA256_RE.test(expectedPlanSha256 ?? "")) {
    fail("SESSION-CLEANUP-PRIVATIZE-CONFIRMATION", "cleanup recovery confirmation requires the exact plan digest and acceptance");
  }
  const spawn = deps.spawn ?? defaultGitSpawn;
  const plan = planOnboardingSessionCleanupPrivatization({ rootDir, spawn, sessionCleanupScript });
  if (plan.status !== "ready" || plan.mode !== "owner-observation-recovery" || plan.planSha256 !== expectedPlanSha256) {
    fail("SESSION-CLEANUP-PRIVATIZE-CONFIRMATION", "cleanup recovery confirmation preimage changed");
  }
  const observed = observeSessionCleanupPrivatization(rootDir, spawn);
  const confirmation = writePrivateCleanupPrivatizationConfirmation(observed.root, observed, expectedPlanSha256, {
    now: deps.now ?? (() => new Date().toISOString()),
    spawn,
  });
  return {
    schema: SESSION_CLEANUP_PRIVATIZATION_CONFIRMATION_SCHEMA,
    status: "confirmed",
    root: observed.root,
    planSha256: confirmation.planSha256,
    applyAction: sessionCleanupPrivatizationApplyAction(
      sessionCleanupScript,
      observed.root,
      expectedPlanSha256,
      "owner-observation-recovery",
    ),
  };
}

function writePrivateCleanupPrivatizationAudit(root, {
  planSha256,
  beforeStateSha256,
  afterStateSha256,
  bindingSha256,
  now = () => new Date().toISOString(),
  spawn = defaultGitSpawn,
} = {}) {
  if (![planSha256, beforeStateSha256, afterStateSha256, bindingSha256].every((value) => SHA256_RE.test(value ?? ""))) {
    fail("SESSION-CLEANUP-PRIVATIZE-AUDIT", "cleanup privatization audit input is invalid");
  }
  const observed = readPrivateCleanupBinding(root, { spawn });
  if (observed.binding === null || observed.sha256 !== bindingSha256) {
    fail("SESSION-CLEANUP-PRIVATIZE-AUDIT", "cleanup privatization binding changed before audit");
  }
  const auditPath = observed.paths.privatizationAudit(planSha256);
  const core = {
    schema: PRIVATE_SESSION_CLEANUP_PRIVATIZATION_AUDIT_SCHEMA,
    planSha256,
    beforeStateSha256,
    afterStateSha256,
    bindingSha256,
    appliedAt: now(),
  };
  if (!canonicalIsoTimestamp(core.appliedAt)) {
    fail("SESSION-CLEANUP-PRIVATIZE-AUDIT", "cleanup privatization audit timestamp is invalid");
  }
  const value = { ...core, mac: cleanupBindingMac(core, observed.key) };
  try {
    if (existsSync(auditPath)) {
      const existing = JSON.parse(assertPrivateCleanupFile(auditPath, "private cleanup privatization audit").toString("utf8"));
      if (canonicalJson(existing) === canonicalJson(value)) return sha256(Buffer.from(JSON.stringify(existing)));
      fail("SESSION-CLEANUP-PRIVATIZE-AUDIT", "cleanup privatization audit already differs");
    }
    writeFileSync(auditPath, `${JSON.stringify(value)}\n`, { mode: 0o600, flag: "wx" });
    fsyncDirectory(observed.paths.directory);
    const bytes = assertPrivateCleanupFile(auditPath, "private cleanup privatization audit");
    const readback = JSON.parse(bytes.toString("utf8"));
    const expected = Buffer.from(cleanupBindingMac(core, observed.key), "hex");
    const actual = Buffer.from(readback?.mac ?? "", "hex");
    if (canonicalJson(readback) !== canonicalJson(value)
      || actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      fail("SESSION-CLEANUP-PRIVATIZE-AUDIT", "cleanup privatization audit readback failed", { committed: true });
    }
    return sha256(bytes);
  } catch (error) {
    if (error instanceof KickoffError) throw error;
    fail("SESSION-CLEANUP-PRIVATIZE-AUDIT", "cleanup privatization audit could not be persisted", { committed: true });
  }
}

/**
 * Move the exact historical neutral tuple behind the authenticated private
 * boundary, then atomically replace portable State with the same shape and a
 * null cleanup slot. A private-prefix interruption is replayable: the next
 * apply accepts only the identical feature/descriptor tuple.
 */
export function applyOnboardingSessionCleanupPrivatization({
  rootDir,
  expectedPlanSha256,
  activate = false,
  deps = {},
  sessionCleanupScript = DEFAULT_SESSION_CLEANUP_SCRIPT,
} = {}) {
  if (!SHA256_RE.test(expectedPlanSha256 ?? "") || activate !== true) {
    fail("SESSION-CLEANUP-PRIVATIZE-ACTIVATION", "cleanup privatization requires the exact plan digest and activation");
  }
  const spawn = deps.spawn ?? defaultGitSpawn;
  const writer = sessionCleanupPrivatizationWriter(sessionCleanupScript);
  const initial = observeSessionCleanupPrivatization(rootDir, spawn);
  const initialCore = sessionCleanupPrivatizationPlanCore(initial, writer);
  const actualPlanSha256 = sha256(Buffer.from(canonicalJson(initialCore)));
  if (actualPlanSha256 !== expectedPlanSha256) {
    fail("SESSION-CLEANUP-PRIVATIZE-CAS", "cleanup privatization plan is stale");
  }
  if (initial.status === "noop") {
    return {
      schema: SESSION_CLEANUP_PRIVATIZATION_APPLY_SCHEMA,
      status: "noop",
      root: initial.root,
      stateSha256: initial.stateSha256,
      planSha256: actualPlanSha256,
      portable: true,
      mutated: false,
    };
  }
  const confirmation = initial.mode === "owner-observation-recovery"
    ? readPrivateCleanupPrivatizationConfirmation(initial.root, expectedPlanSha256, { spawn })
    : null;
  if (initial.mode === "owner-observation-recovery"
    && (confirmation === null || confirmation.stateSha256 !== initial.stateSha256
      || confirmation.bindingSha256 !== initial.privateBindingSha256)) {
    fail("SESSION-CLEANUP-PRIVATIZE-CONFIRMATION", "cleanup recovery requires a separately persisted exact plan acceptance");
  }

  const lock = acquireLock(
    `${initial.path}.lock`,
    "pipeline.continuity-lock.v0",
    `session-cleanup-privatize-${initial.stateSha256.slice(0, 32)}`,
    {
      nowMs: deps.nowMs ?? Date.now,
      lockStaleMs: deps.lockStaleMs ?? 30_000,
    },
  );
  let temporaryRecord;
  let privateCommitted = initial.privateBinding !== null;
  let stateCommitted = false;
  try {
    const current = observeSessionCleanupPrivatization(initial.root, spawn);
    const currentPlanSha256 = sha256(Buffer.from(canonicalJson(
      sessionCleanupPrivatizationPlanCore(current, writer),
    )));
    if (current.status !== "ready" || currentPlanSha256 !== expectedPlanSha256) {
      fail("SESSION-CLEANUP-PRIVATIZE-CAS", "cleanup privatization preimage changed");
    }
    if (current.mode === "owner-observation-recovery") {
      const lockedConfirmation = readPrivateCleanupPrivatizationConfirmation(current.root, expectedPlanSha256, { spawn });
      if (lockedConfirmation === null || lockedConfirmation.stateSha256 !== current.stateSha256
        || lockedConfirmation.bindingSha256 !== current.privateBindingSha256) {
        fail("SESSION-CLEANUP-PRIVATIZE-CONFIRMATION", "cleanup recovery confirmation changed before apply");
      }
    }
    if (current.privateBinding === null) {
      writePrivateCleanupBinding(current.root, current.featureId, current.leakedBinding, {
        spawn,
        now: deps.now ?? (() => new Date().toISOString()),
        random: deps.randomBytes ?? randomBytes,
      });
      privateCommitted = true;
    }
    const stateBytes = expectedStateBytes(current.portableState);
    const suffixSource = (deps.randomUUID ?? randomUUID)();
    if (typeof suffixSource !== "string" || !/^[a-f0-9-]{32,64}$/iu.test(suffixSource)) {
      fail("SESSION-CLEANUP-PRIVATIZE-RANDOM", "cleanup privatization temporary-name source is invalid");
    }
    const temporary = join(
      dirname(current.path),
      `.${basename(current.path)}.session-cleanup-privatize-${suffixSource.replaceAll("-", "")}.tmp`,
    );
    temporaryRecord = writeExclusiveSynced(temporary, stateBytes, 0o600);
    if (sha256(readPhysicalFile(current.path, "Pipeline machine state")) !== current.stateSha256) {
      fail("SESSION-CLEANUP-PRIVATIZE-CAS", "cleanup privatization State preimage changed");
    }
    renameSync(temporary, current.path);
    temporaryRecord = null;
    stateCommitted = true;
    fsyncDirectory(dirname(current.path));

    const readback = observeMachineState(current.root, spawn);
    const privateReadback = readPrivateCleanupBinding(current.root, { spawn }).binding;
    if (readback.stateSha256 !== sha256(stateBytes)
      || !validatePortablePipelineState(readback.state).ok
      || privateReadback?.featureId !== current.featureId
      || canonicalJson(privateReadback?.sessionCleanup) !== canonicalJson(current.leakedBinding)) {
      fail("SESSION-CLEANUP-PRIVATIZE-READBACK", "cleanup privatization readback is invalid", { committed: true });
    }
    const auditSha256 = current.mode === "owner-observation-recovery"
      ? writePrivateCleanupPrivatizationAudit(current.root, {
        planSha256: actualPlanSha256,
        beforeStateSha256: current.stateSha256,
        afterStateSha256: readback.stateSha256,
        bindingSha256: current.privateBindingSha256,
        now: deps.now ?? (() => new Date().toISOString()),
        spawn,
      })
      : null;
    return {
      schema: SESSION_CLEANUP_PRIVATIZATION_APPLY_SCHEMA,
      status: "applied",
      root: readback.root,
      stateSha256: readback.stateSha256,
      planSha256: actualPlanSha256,
      portable: true,
      mutated: true,
      ...(auditSha256 === null ? {} : {
        recovery: "owner-observation-recovery",
        auditSha256,
      }),
    };
  } catch (error) {
    if (!stateCommitted && temporaryRecord) {
      try { unlinkOwned(temporaryRecord); } catch {}
    }
    if (error instanceof KickoffError) throw error;
    fail("SESSION-CLEANUP-PRIVATIZE-WRITE", "cleanup privatization failed", {
      committed: privateCommitted || stateCommitted,
    });
  } finally {
    releaseLock(lock);
  }
}

function validateClosedArtifact(root, binding) {
  if (!isObject(binding) || !SHA256_RE.test(binding.sha256 ?? "")) return false;
  try {
    const observed = observeOptionalProjectFile(root, binding.path, "closed continuity artifact");
    return observed.status === "present" && observed.sha256 === binding.sha256;
  } catch {
    return false;
  }
}

function closedReleaseProof(root, state, entry, entryIndex, spawn) {
  if (!isObject(entry)
    || typeof entry.id !== "string"
    || typeof entry.planPath !== "string"
    || !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(entry.forCommit ?? "")
    || !isObject(entry.continuityClose)
    || entry.continuityClose.schema !== "pipeline.continuity-close.v0"
    || entry.continuityClose.featureId !== entry.id
    || !Number.isSafeInteger(entry.continuityClose.expectedRevision)
    || !validateClosedArtifact(root, entry.continuityClose.result)
    || !validateClosedArtifact(root, entry.continuityClose.closeEvidence)) return null;
  let result = null;
  for (const statePath of [...new Set([
    authorityPaths(root).state,
    NEUTRAL_STATE,
    LEGACY_STATE,
  ])]) {
    const candidate = spawn(
      "git",
      ["show", `${entry.forCommit}:${statePath}`],
      { cwd: root, encoding: "utf8", shell: false, maxBuffer: 2 * 1024 * 1024 },
    );
    if (!candidate?.error && candidate?.status === 0) {
      result = candidate;
      break;
    }
  }
  if (result?.error || result?.status !== 0) return null;
  const raw = Buffer.from(String(result.stdout ?? ""), "utf8");
  let prior;
  try { prior = JSON.parse(raw); } catch { return null; }
  if (!isObject(prior)
    || prior.schema !== "pipeline.state.v0"
    || prior.activeFeature?.id !== entry.id
    || prior.activeFeature?.planPath !== entry.planPath
    || !isObject(prior.continuity)
    || prior.continuity.revision !== entry.continuityClose.expectedRevision
    || prior.continuity.authority?.result?.path !== entry.continuityClose.result.path
    || prior.continuity.authority?.result?.sha256 !== entry.continuityClose.result.sha256
    || !validateContinuityState(prior.continuity, entry.id).ok) return null;
  const sessionCleanup = prior.continuity.runtime.sessionCleanup ?? null;
  const closeRequestSha256 = canonicalSha256(entry.continuityClose);
  const closeEntrySha256 = canonicalSha256(entry);
  const proof = {
    schema: SESSION_CLEANUP_RELEASE_PROOF_SCHEMA,
    featureId: entry.id,
    continuityRevision: prior.continuity.revision,
    sessionCleanup: structuredClone(sessionCleanup),
    forCommit: entry.forCommit,
    preimageStateSha256: sha256(raw),
    closeRequestSha256,
    closeEntrySha256,
    closedEntryIndex: entryIndex,
  };
  return { prior, sessionCleanup, proof };
}

function sameReleaseProof(receipt, proof) {
  return isObject(receipt)
    && receipt.schema === SESSION_CLEANUP_RELEASE_RECEIPT_SCHEMA
    && receipt.featureId === proof.featureId
    && receipt.continuityRevision === proof.continuityRevision
    && canonicalJson(receipt.sessionCleanup) === canonicalJson(proof.sessionCleanup)
    && receipt.forCommit === proof.forCommit
    && receipt.preimageStateSha256 === proof.preimageStateSha256
    && receipt.closeRequestSha256 === proof.closeRequestSha256
    && receipt.closeEntrySha256 === proof.closeEntrySha256;
}

function observeSessionCleanupState(rootDir, spawn = defaultGitSpawn) {
  const observed = observeMachineState(rootDir, spawn);
  const { state } = observed;
  if (!isObject(state.activeFeature)
    || typeof state.activeFeature.id !== "string"
    || !isObject(state.continuity)) {
    if (isObject(state.activeFeature) && state.continuity === undefined) {
      if (!validDesignTransitionState(state)) {
        fail("SESSION-CLEANUP-STATE-MALFORMED", "Pipeline machine state cannot prove a cleanup descriptor");
      }
      if (observed.privateBinding !== null) {
        fail("SESSION-CLEANUP-PRIVATE-CAS", "private cleanup binding exists for a non-bindable design state");
      }
      return {
        ...observed,
        mode: "active",
        revision: null,
        activeFeatureId: state.activeFeature.id,
        sessionCleanup: null,
      };
    }
    if (!validClosedTransitionState(observed.root, state)) {
      fail("SESSION-CLEANUP-STATE-MALFORMED", "Pipeline machine state cannot prove a cleanup descriptor");
    }
    if (observed.neutral && observed.privateBinding !== null) {
      return {
        ...observed,
        mode: "closed",
        revision: null,
        activeFeatureId: observed.privateBinding.featureId,
        sessionCleanup: observed.privateBinding.sessionCleanup,
        releaseProof: null,
        released: false,
      };
    }
    const candidates = state.closedFeatures
      .map((entry, index) => closedReleaseProof(observed.root, state, entry, index, spawn))
      .filter((entry) => entry !== null);
    const bound = candidates.filter((entry) => entry.sessionCleanup !== null);
    if (bound.length > 1) {
      fail("SESSION-CLEANUP-RELEASE-AMBIGUOUS", "multiple closed cleanup bindings remain provable");
    }
    if (bound.length === 0) {
      return {
        ...observed,
        mode: "closed",
        revision: null,
        activeFeatureId: null,
        sessionCleanup: null,
        releaseProof: null,
        released: false,
      };
    }
    const candidate = bound[0];
    const receipts = Array.isArray(state.cleanupReleases) ? state.cleanupReleases : [];
    const releaseReceipt = receipts.find((receipt) => sameReleaseProof(receipt, candidate.proof)) ?? null;
    return {
      ...observed,
      mode: "closed",
      revision: candidate.prior.continuity.revision,
      activeFeatureId: candidate.prior.activeFeature.id,
      sessionCleanup: candidate.sessionCleanup,
      releaseProof: candidate.proof,
      released: releaseReceipt !== null,
      releaseReceipt,
    };
  }
  const validation = validateContinuityState(state.continuity, state.activeFeature.id);
  if (!validation.ok) {
    fail("SESSION-CLEANUP-CONTINUITY-INVALID", `continuity state rejected cleanup binding (${validation.code})`);
  }
  if (observed.privateBinding !== null
    && observed.privateBinding.featureId !== state.activeFeature.id) {
    fail("SESSION-CLEANUP-PRIVATE-CAS", "private cleanup binding names a different active feature");
  }
  return {
    ...observed,
    mode: "active",
    revision: state.continuity.revision,
    activeFeatureId: state.activeFeature.id,
    sessionCleanup: observed.neutral
      ? observed.privateBinding?.sessionCleanup ?? null
      : state.continuity.runtime.sessionCleanup ?? null,
  };
}

/**
 * Read the exact persisted cleanup tuple and its CAS preimage without writing.
 * The owner nonce remains solely in the repository-private descriptor.
 */
export function readOnboardingSessionCleanupBinding({ rootDir, spawn = defaultGitSpawn } = {}) {
  const observed = observeSessionCleanupState(rootDir, spawn);
  const privateReceiptObservation = observed.neutral
    ? observePrivateCleanupReleaseReceipt(observed.root, { spawn })
    : { status: "absent", sha256: null, receipt: null };
  const privateReleaseReceipt = privateReceiptObservation.receipt;
  const closedEntry = observed.mode === "closed" ? observed.state.closedFeatures?.at(-1) : undefined;
  const coordinatorClose = closedEntry?.coordinatorClose;
  const privateReceiptConflict = observed.neutral && observed.mode === "closed"
    && observed.privateBinding === null && privateReceiptObservation.status === "valid"
    && (privateReleaseReceipt.featureId !== closedEntry?.id
      || privateReleaseReceipt.stateSha256 !== observed.stateSha256
      || coordinatorClose === undefined
      || privateReleaseReceipt.coordinatorCloseSha256 !== canonicalSha256(coordinatorClose));
  const privateReceiptInvalid = privateReceiptObservation.status === "invalid" || privateReceiptConflict;
  const status = observed.mode === "active"
    ? (observed.revision === null
      ? "design-unbound"
      : observed.sessionCleanup === null ? "unbound" : "bound")
    : observed.neutral && observed.privateBinding === null && privateReceiptInvalid
      ? "closed-receipt-invalid"
    : observed.released
      ? "released"
      : observed.sessionCleanup === null
        ? "closed-unbound"
        : "closed-bound";
  return {
    schema: SESSION_CLEANUP_BIND_SCHEMA,
    status,
    root: observed.root,
    stateSha256: observed.stateSha256,
    revision: observed.revision,
    sessionCleanup: structuredClone(observed.sessionCleanup),
    ...(observed.releaseProof ? { releaseProof: structuredClone(observed.releaseProof) } : {}),
    ...(observed.releaseReceipt ? {
      releasePlanSha256: observed.releaseReceipt.recoveryPlanSha256,
      closureReceiptSha256: observed.releaseReceipt.closureReceiptSha256,
    } : {}),
    ...(privateReceiptObservation.status !== "absent" ? {
      privateReceiptStatus: privateReceiptInvalid
        ? "invalid"
        : privateReceiptObservation.status,
      privateReceiptSha256: privateReceiptObservation.sha256,
    } : {}),
    ...(privateReleaseReceipt && !privateReceiptInvalid ? {
      releasePlanSha256: privateReleaseReceipt.recoveryPlanSha256,
      closureReceiptSha256: privateReleaseReceipt.closureReceiptSha256,
    } : {}),
    ...(privateReceiptObservation.status === "quarantined" ? {
      releasePlanSha256: privateReceiptObservation.quarantine.recoveryPlanSha256,
    } : {}),
    ...(coordinatorClose ? { coordinatorCloseSha256: canonicalSha256(coordinatorClose) } : {}),
  };
}

function privateClosedReleaseContext(observed, closureReceiptSha256, recoveryPlanSha256, coordinatorCloseSha256) {
  const entry = observed.state.closedFeatures?.at(-1);
  if (!observed.neutral || observed.mode !== "closed" || !entry
    || observed.privateBinding === null
    || observed.privateBinding.featureId !== entry.id
    || entry.continuityClose === undefined
    || entry.coordinatorClose === undefined
    || entry.coordinatorClose.revision !== 2
    || entry.coordinatorClose.phase !== "feature-close-prepared"
    || canonicalSha256(entry.coordinatorClose) !== coordinatorCloseSha256
    || listActiveSessionDescriptors(observed.root).length !== 0) {
    fail("SESSION-CLEANUP-PRIVATE-RELEASE-CAS", "private closed cleanup release preimage changed");
  }
  const closure = inspectSessionClosure(observed.root, observed.privateBinding.sessionCleanup.sessionId, {
    expectedDescriptorSha256: observed.privateBinding.sessionCleanup.descriptorSha256,
  });
  if (closure.status !== "closed" || closure.receiptSha256 !== closureReceiptSha256) {
    fail("SESSION-CLEANUP-PRIVATE-RELEASE-CLOSURE", "private closed cleanup closure proof changed");
  }
  return {
    featureId: entry.id,
    stateSha256: observed.stateSha256,
    coordinatorCloseSha256,
    closureReceiptSha256,
    recoveryPlanSha256,
    bindingSha256: canonicalSha256(observed.privateBinding),
  };
}

function privateClosedReleaseReplay(root, expectedStateSha256, closureReceiptSha256, recoveryPlanSha256, coordinatorCloseSha256, spawn) {
  const observed = observeSessionCleanupState(root, spawn);
  const privateReceipt = observePrivateCleanupReleaseReceipt(observed.root, { spawn });
  const receipt = privateReceipt.status === "valid" ? privateReceipt.receipt : null;
  const entry = observed.state.closedFeatures?.at(-1);
  if (observed.mode !== "closed" || observed.stateSha256 !== expectedStateSha256
    || observed.privateBinding !== null || receipt === null
    || entry?.id !== receipt.featureId
    || entry?.coordinatorClose === undefined
    || canonicalSha256(entry?.coordinatorClose) !== coordinatorCloseSha256
    || receipt.stateSha256 !== expectedStateSha256
    || receipt.closureReceiptSha256 !== closureReceiptSha256
    || receipt.recoveryPlanSha256 !== recoveryPlanSha256
    || receipt.coordinatorCloseSha256 !== coordinatorCloseSha256) return null;
  return observed;
}

export function quarantineClosedPrivateCleanupReleaseReceipt({
  rootDir,
  expectedStateSha256,
  expectedReceiptSha256,
  recoveryPlanSha256,
  deps = {},
} = {}) {
  if (!SHA256_RE.test(expectedStateSha256 ?? "")
    || !SHA256_RE.test(expectedReceiptSha256 ?? "")
    || !SHA256_RE.test(recoveryPlanSha256 ?? "")) {
    fail("SESSION-CLEANUP-PRIVATE-RECEIPT-RECOVERY", "private cleanup receipt recovery request is invalid");
  }
  const spawn = deps.spawn ?? defaultGitSpawn;
  const initial = observeSessionCleanupState(rootDir, spawn);
  if (!initial.neutral || initial.mode !== "closed" || initial.stateSha256 !== expectedStateSha256
    || initial.privateBinding !== null || listActiveSessionDescriptors(initial.root).length !== 0) {
    fail("SESSION-CLEANUP-PRIVATE-RECEIPT-CAS", "private cleanup receipt recovery preimage changed");
  }
  const entry = initial.state.closedFeatures?.at(-1);
  if (entry?.coordinatorClose?.revision !== 2
    || entry.coordinatorClose.phase !== "feature-close-prepared") {
    fail("SESSION-CLEANUP-PRIVATE-RECEIPT-CAS", "private cleanup receipt recovery has no exact coordinator close");
  }
  const archiveId = canonicalSha256({
    kind: "quarantined-private-release-receipt",
    recoveryPlanSha256,
    receiptSha256: expectedReceiptSha256,
  });
  const archivePath = join(
    privateCleanupPaths(initial.root, { spawn }).directory,
    `session-cleanup-release-receipt.${archiveId}.json`,
  );
  const replay = () => {
    if (!existsSync(archivePath)) return null;
    const bytes = assertPrivateCleanupFile(archivePath, "private cleanup release receipt quarantine");
    if (sha256(bytes) !== expectedReceiptSha256) return null;
    const marker = observePrivateCleanupReleaseReceipt(initial.root, { spawn });
    if (marker.status !== "quarantined"
      || marker.quarantine.stateSha256 !== expectedStateSha256
      || marker.quarantine.receiptSha256 !== expectedReceiptSha256
      || marker.quarantine.recoveryPlanSha256 !== recoveryPlanSha256) return null;
    const current = observeSessionCleanupState(initial.root, spawn);
    return current.neutral && current.mode === "closed"
      && current.stateSha256 === expectedStateSha256 && current.privateBinding === null
      && listActiveSessionDescriptors(current.root).length === 0 ? current : null;
  };
  const replayed = replay();
  if (replayed !== null) {
    return {
      schema: SESSION_CLEANUP_BIND_SCHEMA,
      status: "closed-unbound",
      root: replayed.root,
      stateSha256: replayed.stateSha256,
      revision: replayed.revision,
      sessionCleanup: null,
      mutated: false,
      storage: "private-runtime-quarantine",
    };
  }
  const token = `session-cleanup-private-receipt-${expectedStateSha256.slice(0, 32)}`;
  const lock = acquireLock(`${initial.path}.lock`, "pipeline.continuity-lock.v0", token, {
    nowMs: deps.nowMs ?? Date.now,
    lockStaleMs: deps.lockStaleMs ?? 30_000,
  });
  let committed = false;
  try {
    const current = observeSessionCleanupState(initial.root, spawn);
    const receipt = observePrivateCleanupReleaseReceipt(current.root, { spawn });
    if (!current.neutral || current.mode !== "closed" || current.stateSha256 !== expectedStateSha256
      || current.privateBinding !== null || listActiveSessionDescriptors(current.root).length !== 0
      || receipt.status === "absent" || receipt.sha256 !== expectedReceiptSha256) {
      fail("SESSION-CLEANUP-PRIVATE-RECEIPT-CAS", "private cleanup receipt recovery preimage changed");
    }
    if (existsSync(archivePath)) {
      const archived = assertPrivateCleanupFile(archivePath, "private cleanup release receipt quarantine");
      if (!archived.equals(receipt.bytes)) {
        fail("SESSION-CLEANUP-PRIVATE-RECEIPT-CAS", "private cleanup receipt quarantine archive changed");
      }
    } else {
      writeExclusiveSynced(archivePath, receipt.bytes, 0o600);
      fsyncDirectory(receipt.paths.directory);
      const archived = assertPrivateCleanupFile(archivePath, "private cleanup release receipt quarantine");
      if (!archived.equals(receipt.bytes)) {
        fail("SESSION-CLEANUP-PRIVATE-RECEIPT-READBACK", "private cleanup receipt quarantine archive readback failed", {
          committed: true,
        });
      }
    }
    let key;
    if (existsSync(receipt.paths.key)) {
      key = assertPrivateCleanupFile(receipt.paths.key, "private cleanup binding key");
      if (key.length !== 32) fail("SESSION-CLEANUP-PRIVATE-DAMAGED", "private cleanup binding key is malformed");
    } else {
      key = randomBytes(32);
      writeExclusiveSynced(receipt.paths.key, key, 0o600);
      fsyncDirectory(receipt.paths.directory);
    }
    const core = {
      schema: PRIVATE_SESSION_CLEANUP_RELEASE_QUARANTINE_SCHEMA,
      stateSha256: expectedStateSha256,
      receiptSha256: expectedReceiptSha256,
      recoveryPlanSha256,
      quarantinedAt: (deps.now ?? (() => new Date().toISOString()))(),
    };
    if (!canonicalIsoTimestamp(core.quarantinedAt)) {
      fail("SESSION-CLEANUP-PRIVATE-RECEIPT-RECOVERY", "private cleanup receipt quarantine timestamp is invalid");
    }
    const marker = { ...core, mac: cleanupBindingMac(core, key) };
    const temporary = `${receipt.paths.releaseReceipt}.${process.pid}.${randomUUID()}.tmp`;
    let temporaryRecord = null;
    try {
      temporaryRecord = writeExclusiveSynced(
        temporary,
        Buffer.from(`${JSON.stringify(marker)}\n`, "utf8"),
        0o600,
      );
      renameSync(temporary, receipt.paths.releaseReceipt);
      fsyncDirectory(receipt.paths.directory);
    } catch (error) {
      try { unlinkOwned(temporaryRecord); } catch {}
      throw error;
    }
    committed = true;
    const readback = replay();
    if (readback === null) {
      fail("SESSION-CLEANUP-PRIVATE-RECEIPT-READBACK", "private cleanup receipt recovery readback failed", {
        committed: true,
      });
    }
    return {
      schema: SESSION_CLEANUP_BIND_SCHEMA,
      status: "closed-unbound",
      root: readback.root,
      stateSha256: readback.stateSha256,
      revision: readback.revision,
      sessionCleanup: null,
      mutated: true,
      storage: "private-runtime-quarantine",
    };
  } catch (error) {
    if (error instanceof KickoffError) throw error;
    fail("SESSION-CLEANUP-PRIVATE-RECEIPT-RECOVERY", "private cleanup receipt recovery failed", { committed });
  } finally {
    releaseLock(lock);
  }
}

/**
 * Record that one exact historical close binding has a matching durable
 * closure receipt. This does not recreate continuity or authorize a new
 * descriptor; it only consumes the proof retained by close-feature.
 */
export function recordClosedOnboardingSessionCleanupRelease({
  rootDir,
  expectedStateSha256,
  releaseProof,
  closureReceiptSha256,
  recoveryPlanSha256,
  coordinatorCloseSha256 = null,
  privateReceiptRecoverySha256 = null,
  releasedAt = new Date().toISOString(),
  deps = {},
} = {}) {
  if (!SHA256_RE.test(expectedStateSha256 ?? "")
    || !SHA256_RE.test(closureReceiptSha256 ?? "")
    || !SHA256_RE.test(recoveryPlanSha256 ?? "")
    || !(privateReceiptRecoverySha256 === null || SHA256_RE.test(privateReceiptRecoverySha256))
    || typeof releasedAt !== "string"
    || Number.isNaN(Date.parse(releasedAt))) {
    fail("SESSION-CLEANUP-CLOSED-RELEASE-REQUEST", "closed cleanup release request is invalid");
  }
  const spawn = deps.spawn ?? defaultGitSpawn;
  if (releaseProof === null) {
    if (!SHA256_RE.test(coordinatorCloseSha256 ?? "")) {
      fail("SESSION-CLEANUP-CLOSED-RELEASE-REQUEST", "private closed cleanup release request is invalid");
    }
    const replay = privateClosedReleaseReplay(
      rootDir, expectedStateSha256, closureReceiptSha256, recoveryPlanSha256, coordinatorCloseSha256, spawn,
    );
    if (replay !== null) {
      return {
        schema: SESSION_CLEANUP_BIND_SCHEMA,
        status: "closed-unbound",
        root: replay.root,
        stateSha256: replay.stateSha256,
        revision: replay.revision,
        sessionCleanup: null,
        mutated: false,
        storage: "private-runtime",
      };
    }
    const initial = observeSessionCleanupState(rootDir, spawn);
    if (initial.stateSha256 !== expectedStateSha256) {
      fail("SESSION-CLEANUP-PRIVATE-RELEASE-CAS", "private closed cleanup release preimage changed");
    }
    const token = `session-cleanup-private-closed-release-${expectedStateSha256.slice(0, 32)}`;
    const lock = acquireLock(`${initial.path}.lock`, "pipeline.continuity-lock.v0", token, {
      nowMs: deps.nowMs ?? Date.now,
      lockStaleMs: deps.lockStaleMs ?? 30_000,
    });
    let committed = false;
    try {
      const current = observeSessionCleanupState(initial.root, spawn);
      const replayed = privateClosedReleaseReplay(
        current.root, expectedStateSha256, closureReceiptSha256, recoveryPlanSha256, coordinatorCloseSha256, spawn,
      );
      if (replayed !== null) {
        return {
          schema: SESSION_CLEANUP_BIND_SCHEMA, status: "closed-unbound", root: replayed.root,
          stateSha256: replayed.stateSha256, revision: replayed.revision, sessionCleanup: null,
          mutated: false, storage: "private-runtime",
        };
      }
      const core = privateClosedReleaseContext(
        current, closureReceiptSha256, recoveryPlanSha256, coordinatorCloseSha256,
      );
      const existingReceipt = observePrivateCleanupReleaseReceipt(current.root, { spawn });
      if (privateReceiptRecoverySha256 !== null) {
        if (existingReceipt.status === "absent"
          || existingReceipt.sha256 !== privateReceiptRecoverySha256) {
          fail("SESSION-CLEANUP-PRIVATE-RECEIPT-CAS", "private cleanup release receipt changed");
        }
        archiveObservedPrivateCleanupReleaseReceipt(
          existingReceipt,
          canonicalSha256({
            kind: "conflicting-private-release-receipt",
            recoveryPlanSha256,
            receiptSha256: privateReceiptRecoverySha256,
          }),
        );
      } else if (existingReceipt.status === "invalid") {
        fail("SESSION-CLEANUP-PRIVATE-RECEIPT-CAS", "invalid private cleanup release receipt requires a new recovery plan");
      }
      const receipt = writePrivateCleanupReleaseReceipt(current.root, {
        schema: PRIVATE_SESSION_CLEANUP_RELEASE_RECEIPT_SCHEMA,
        ...core,
        releasedAt,
      }, { spawn });
      committed = true;
      deps.afterReceiptWrite?.({ root: current.root, receipt: structuredClone(receipt) });
      deletePrivateCleanupBinding(current.root, current.privateBinding.sessionCleanup, { spawn });
      deps.afterBindingUnlink?.({ root: current.root });
      fsyncDirectory(readPrivateCleanupReleaseReceipt(current.root, { spawn }).paths.directory);
      const readback = privateClosedReleaseReplay(
        current.root, expectedStateSha256, closureReceiptSha256, recoveryPlanSha256, coordinatorCloseSha256, spawn,
      );
      if (readback === null || receipt.bindingSha256.length !== 64) {
        fail("SESSION-CLEANUP-PRIVATE-RELEASE-READBACK", "private closed cleanup release readback is invalid", { committed: true });
      }
      return {
        schema: SESSION_CLEANUP_BIND_SCHEMA, status: "closed-unbound", root: readback.root,
        stateSha256: readback.stateSha256, revision: readback.revision, sessionCleanup: null,
        mutated: true, storage: "private-runtime",
      };
    } catch (error) {
      if (error instanceof KickoffError) throw error;
      fail("SESSION-CLEANUP-PRIVATE-RELEASE-WRITE", "private closed cleanup release failed", { committed });
    } finally {
      releaseLock(lock);
    }
  }
  if (!isObject(releaseProof) || releaseProof.schema !== SESSION_CLEANUP_RELEASE_PROOF_SCHEMA) {
    fail("SESSION-CLEANUP-CLOSED-RELEASE-REQUEST", "closed cleanup release request is invalid");
  }
  const initial = observeSessionCleanupState(rootDir, spawn);
  if (initial.released
    && canonicalJson(initial.releaseProof) === canonicalJson(releaseProof)
    && initial.releaseReceipt.closureReceiptSha256 === closureReceiptSha256
    && initial.releaseReceipt.recoveryPlanSha256 === recoveryPlanSha256) {
    return {
      schema: SESSION_CLEANUP_BIND_SCHEMA,
      status: "released",
      root: initial.root,
      stateSha256: initial.stateSha256,
      revision: initial.revision,
      sessionCleanup: null,
      mutated: false,
    };
  }
  if (initial.mode !== "closed"
    || initial.stateSha256 !== expectedStateSha256
    || canonicalJson(initial.releaseProof) !== canonicalJson(releaseProof)) {
    fail("SESSION-CLEANUP-CLOSED-RELEASE-CAS", "closed cleanup release preimage changed");
  }
  const token = `session-cleanup-closed-release-${expectedStateSha256.slice(0, 32)}`;
  const lock = acquireLock(`${initial.path}.lock`, "pipeline.continuity-lock.v0", token, {
    nowMs: deps.nowMs ?? Date.now,
    lockStaleMs: deps.lockStaleMs ?? 30_000,
  });
  let temporaryRecord;
  let committed = false;
  try {
    const current = observeSessionCleanupState(initial.root, spawn);
    if (current.released
      && canonicalJson(current.releaseProof) === canonicalJson(releaseProof)
      && current.releaseReceipt.closureReceiptSha256 === closureReceiptSha256
      && current.releaseReceipt.recoveryPlanSha256 === recoveryPlanSha256) {
      return {
        schema: SESSION_CLEANUP_BIND_SCHEMA,
        status: "released",
        root: current.root,
        stateSha256: current.stateSha256,
        revision: current.revision,
        sessionCleanup: null,
        mutated: false,
      };
    }
    if (current.stateSha256 !== expectedStateSha256
      || canonicalJson(current.releaseProof) !== canonicalJson(releaseProof)) {
      fail("SESSION-CLEANUP-CLOSED-RELEASE-CAS", "closed cleanup release preimage changed");
    }
    const receipt = {
      schema: SESSION_CLEANUP_RELEASE_RECEIPT_SCHEMA,
      featureId: releaseProof.featureId,
      continuityRevision: releaseProof.continuityRevision,
      sessionCleanup: structuredClone(releaseProof.sessionCleanup),
      forCommit: releaseProof.forCommit,
      preimageStateSha256: releaseProof.preimageStateSha256,
      closeRequestSha256: releaseProof.closeRequestSha256,
      closeEntrySha256: releaseProof.closeEntrySha256,
      closureReceiptSha256,
      recoveryPlanSha256,
      releasedAt,
    };
    const next = structuredClone(current.state);
    next.cleanupReleases = [...(Array.isArray(next.cleanupReleases) ? next.cleanupReleases : []), receipt];
    const stateBytes = expectedStateBytes(next);
    const suffixSource = (deps.randomUUID ?? randomUUID)();
    const temporary = join(
      dirname(current.path),
      `.${basename(current.path)}.closed-cleanup-release-${suffixSource.replaceAll("-", "")}.tmp`,
    );
    temporaryRecord = writeExclusiveSynced(temporary, stateBytes, 0o600);
    if (sha256(readPhysicalFile(current.path, "Pipeline machine state")) !== expectedStateSha256) {
      fail("SESSION-CLEANUP-CLOSED-RELEASE-CAS", "closed cleanup release preimage changed");
    }
    renameSync(temporary, current.path);
    temporaryRecord = null;
    committed = true;
    fsyncDirectory(dirname(current.path));
    const readback = observeSessionCleanupState(current.root, spawn);
    if (!readback.released
      || readback.stateSha256 !== sha256(stateBytes)
      || readback.releaseReceipt.closureReceiptSha256 !== closureReceiptSha256
      || readback.releaseReceipt.recoveryPlanSha256 !== recoveryPlanSha256) {
      fail("SESSION-CLEANUP-CLOSED-RELEASE-READBACK", "closed cleanup release readback is invalid", { committed: true });
    }
    return {
      schema: SESSION_CLEANUP_BIND_SCHEMA,
      status: "released",
      root: readback.root,
      stateSha256: readback.stateSha256,
      revision: readback.revision,
      sessionCleanup: null,
      mutated: true,
    };
  } catch (error) {
    if (!committed && temporaryRecord) {
      try { unlinkOwned(temporaryRecord); } catch {}
    }
    if (error instanceof KickoffError) throw error;
    fail("SESSION-CLEANUP-CLOSED-RELEASE-WRITE", "closed cleanup release failed", { committed });
  } finally {
    releaseLock(lock);
  }
}

/**
 * Persist the first cleanup descriptor through one narrow, state-lock-bound CAS.
 * Existing bindings are replayable but immutable. No other state field may
 * change, and admitted dispatch/decision/close state rejects a late binding.
 */
export function bindOnboardingSessionCleanup({
  rootDir,
  expectedStateSha256,
  expectedRevision,
  sessionCleanup,
  deps = {},
} = {}) {
  if (!SHA256_RE.test(expectedStateSha256 ?? "")
    || !Number.isSafeInteger(expectedRevision)
    || expectedRevision < 0
    || !isObject(sessionCleanup)) {
    fail("SESSION-CLEANUP-BIND-REQUEST", "cleanup binding request is invalid");
  }
  const initial = observeSessionCleanupState(rootDir);
  if (initial.sessionCleanup !== null
    && canonicalJson(initial.sessionCleanup) === canonicalJson(sessionCleanup)) {
    return {
      schema: SESSION_CLEANUP_BIND_SCHEMA,
      status: "reused",
      root: initial.root,
      stateSha256: initial.stateSha256,
      revision: initial.revision,
      sessionCleanup: structuredClone(initial.sessionCleanup),
      mutated: false,
    };
  }
  if (initial.stateSha256 !== expectedStateSha256 || initial.revision !== expectedRevision) {
    fail("SESSION-CLEANUP-BIND-CAS", "cleanup binding preimage changed");
  }

  const token = `session-cleanup-bind-${expectedStateSha256.slice(0, 32)}`;
  const lock = acquireLock(
    `${initial.path}.lock`,
    "pipeline.continuity-lock.v0",
    token,
    {
      nowMs: deps.nowMs ?? Date.now,
      lockStaleMs: deps.lockStaleMs ?? 30_000,
    },
  );
  let temporaryRecord;
  let committed = false;
  try {
    const current = observeSessionCleanupState(initial.root);
    if (current.sessionCleanup !== null
      && canonicalJson(current.sessionCleanup) === canonicalJson(sessionCleanup)) {
      return {
        schema: SESSION_CLEANUP_BIND_SCHEMA,
        status: "reused",
        root: current.root,
        stateSha256: current.stateSha256,
        revision: current.revision,
        sessionCleanup: structuredClone(current.sessionCleanup),
        mutated: false,
      };
    }
    if (current.stateSha256 !== expectedStateSha256 || current.revision !== expectedRevision) {
      fail("SESSION-CLEANUP-BIND-CAS", "cleanup binding preimage changed");
    }
    if (current.neutral) {
      const persisted = writePrivateCleanupBinding(
        current.root,
        current.activeFeatureId,
        sessionCleanup,
        {
          spawn: deps.spawn ?? defaultGitSpawn,
          now: deps.now ?? (() => new Date().toISOString()),
          random: deps.randomBytes ?? randomBytes,
        },
      );
      committed = true;
      const readback = observeSessionCleanupState(current.root, deps.spawn ?? defaultGitSpawn);
      if (readback.stateSha256 !== expectedStateSha256
        || readback.revision !== expectedRevision
        || canonicalJson(readback.sessionCleanup) !== canonicalJson(persisted.sessionCleanup)) {
        fail("SESSION-CLEANUP-BIND-READBACK", "private cleanup binding readback is invalid", { committed: true });
      }
      return {
        schema: SESSION_CLEANUP_BIND_SCHEMA,
        status: "bound",
        root: readback.root,
        stateSha256: readback.stateSha256,
        revision: readback.revision,
        sessionCleanup: structuredClone(readback.sessionCleanup),
        mutated: true,
        storage: "private-runtime",
      };
    }
    const proposal = bindContinuitySessionCleanup(current.state.continuity, {
      expectedRevision,
      sessionCleanup,
    }, current.activeFeatureId);
    if (!proposal.ok) {
      fail(proposal.code, "continuity state rejected cleanup binding");
    }
    if (!proposal.mutated) {
      fail("SESSION-CLEANUP-BIND-REPLAY-INVALID", "cleanup binding replay was not observed in persisted state");
    }

    const next = structuredClone(current.state);
    next.continuity = proposal.state;
    const stateBytes = expectedStateBytes(next);
    const suffixSource = (deps.randomUUID ?? randomUUID)();
    if (typeof suffixSource !== "string" || !/^[a-f0-9-]{32,64}$/iu.test(suffixSource)) {
      fail("SESSION-CLEANUP-BIND-RANDOM", "cleanup binding temporary-name source is invalid");
    }
    const temporary = join(
      dirname(current.path),
      `.${basename(current.path)}.session-cleanup-${suffixSource.replaceAll("-", "")}.tmp`,
    );
    temporaryRecord = writeExclusiveSynced(temporary, stateBytes, 0o600);
    if (sha256(readPhysicalFile(current.path, "Pipeline machine state")) !== expectedStateSha256) {
      fail("SESSION-CLEANUP-BIND-CAS", "cleanup binding state preimage changed");
    }
    renameSync(temporary, current.path);
    temporaryRecord = null;
    committed = true;
    fsyncDirectory(dirname(current.path));

    const readback = observeSessionCleanupState(current.root);
    const expectedAfterSha256 = sha256(stateBytes);
    if (readback.stateSha256 !== expectedAfterSha256
      || readback.revision !== expectedRevision + 1
      || canonicalJson(readback.sessionCleanup) !== canonicalJson(sessionCleanup)) {
      fail("SESSION-CLEANUP-BIND-READBACK", "cleanup binding readback is invalid", { committed: true });
    }
    return {
      schema: SESSION_CLEANUP_BIND_SCHEMA,
      status: "bound",
      root: readback.root,
      stateSha256: readback.stateSha256,
      revision: readback.revision,
      sessionCleanup: structuredClone(readback.sessionCleanup),
      mutated: true,
    };
  } catch (error) {
    if (!committed && temporaryRecord) {
      try { unlinkOwned(temporaryRecord); } catch {}
    }
    if (error instanceof KickoffError) throw error;
    fail("SESSION-CLEANUP-BIND-WRITE", "cleanup binding write failed", { committed });
  } finally {
    releaseLock(lock);
  }
}

/**
 * Clear one exact persisted handle after the caller has proved that descriptor
 * closure completed. Unknown or different handles never rotate through this
 * routine.
 */
export function releaseOnboardingSessionCleanup({
  rootDir,
  expectedStateSha256,
  expectedRevision,
  sessionCleanup,
  deps = {},
} = {}) {
  if (!SHA256_RE.test(expectedStateSha256 ?? "")
    || !Number.isSafeInteger(expectedRevision)
    || expectedRevision < 0
    || !isObject(sessionCleanup)) {
    fail("SESSION-CLEANUP-RELEASE-REQUEST", "cleanup release request is invalid");
  }
  const initial = observeSessionCleanupState(rootDir);
  if (initial.sessionCleanup === null) {
    return {
      schema: SESSION_CLEANUP_BIND_SCHEMA,
      status: "released",
      root: initial.root,
      stateSha256: initial.stateSha256,
      revision: initial.revision,
      sessionCleanup: null,
      mutated: false,
    };
  }
  if (initial.stateSha256 !== expectedStateSha256
    || initial.revision !== expectedRevision
    || canonicalJson(initial.sessionCleanup) !== canonicalJson(sessionCleanup)) {
    fail("SESSION-CLEANUP-RELEASE-CAS", "cleanup release preimage changed");
  }
  const token = `session-cleanup-release-${expectedStateSha256.slice(0, 32)}`;
  const lock = acquireLock(
    `${initial.path}.lock`,
    "pipeline.continuity-lock.v0",
    token,
    {
      nowMs: deps.nowMs ?? Date.now,
      lockStaleMs: deps.lockStaleMs ?? 30_000,
    },
  );
  let temporaryRecord;
  let committed = false;
  try {
    const current = observeSessionCleanupState(initial.root);
    if (current.sessionCleanup === null) {
      return {
        schema: SESSION_CLEANUP_BIND_SCHEMA,
        status: "released",
        root: current.root,
        stateSha256: current.stateSha256,
        revision: current.revision,
        sessionCleanup: null,
        mutated: false,
      };
    }
    if (current.stateSha256 !== expectedStateSha256
      || current.revision !== expectedRevision
      || canonicalJson(current.sessionCleanup) !== canonicalJson(sessionCleanup)) {
      fail("SESSION-CLEANUP-RELEASE-CAS", "cleanup release preimage changed");
    }
    if (current.neutral) {
      const mutated = deletePrivateCleanupBinding(current.root, sessionCleanup, {
        spawn: deps.spawn ?? defaultGitSpawn,
      });
      committed = mutated;
      const readback = observeSessionCleanupState(current.root, deps.spawn ?? defaultGitSpawn);
      if (readback.stateSha256 !== expectedStateSha256
        || readback.revision !== expectedRevision
        || readback.sessionCleanup !== null) {
        fail("SESSION-CLEANUP-RELEASE-READBACK", "private cleanup release readback is invalid", { committed: true });
      }
      return {
        schema: SESSION_CLEANUP_BIND_SCHEMA,
        status: "released",
        root: readback.root,
        stateSha256: readback.stateSha256,
        revision: readback.revision,
        sessionCleanup: null,
        mutated,
        storage: "private-runtime",
      };
    }
    const proposal = releaseContinuitySessionCleanup(current.state.continuity, {
      expectedRevision,
      sessionCleanup,
    }, current.activeFeatureId);
    if (!proposal.ok || !proposal.mutated) {
      fail(proposal.code, "continuity state rejected cleanup release");
    }
    const next = structuredClone(current.state);
    next.continuity = proposal.state;
    const stateBytes = expectedStateBytes(next);
    const suffixSource = (deps.randomUUID ?? randomUUID)();
    if (typeof suffixSource !== "string" || !/^[a-f0-9-]{32,64}$/iu.test(suffixSource)) {
      fail("SESSION-CLEANUP-RELEASE-RANDOM", "cleanup release temporary-name source is invalid");
    }
    const temporary = join(
      dirname(current.path),
      `.${basename(current.path)}.session-cleanup-release-${suffixSource.replaceAll("-", "")}.tmp`,
    );
    temporaryRecord = writeExclusiveSynced(temporary, stateBytes, 0o600);
    if (sha256(readPhysicalFile(current.path, "Pipeline machine state")) !== expectedStateSha256) {
      fail("SESSION-CLEANUP-RELEASE-CAS", "cleanup release state preimage changed");
    }
    renameSync(temporary, current.path);
    temporaryRecord = null;
    committed = true;
    fsyncDirectory(dirname(current.path));
    const readback = observeSessionCleanupState(current.root);
    if (readback.stateSha256 !== sha256(stateBytes)
      || readback.revision !== expectedRevision + 1
      || readback.sessionCleanup !== null) {
      fail("SESSION-CLEANUP-RELEASE-READBACK", "cleanup release readback is invalid", { committed: true });
    }
    return {
      schema: SESSION_CLEANUP_BIND_SCHEMA,
      status: "released",
      root: readback.root,
      stateSha256: readback.stateSha256,
      revision: readback.revision,
      sessionCleanup: null,
      mutated: true,
    };
  } catch (error) {
    if (!committed && temporaryRecord) {
      try { unlinkOwned(temporaryRecord); } catch {}
    }
    if (error instanceof KickoffError) throw error;
    fail("SESSION-CLEANUP-RELEASE-WRITE", "cleanup release write failed", { committed });
  } finally {
    releaseLock(lock);
  }
}

/**
 * Derive the exact cleanup-release postimage without writing it. Composite
 * recovery journals bind this digest before retiring any private descriptor,
 * so a crash after the State rename cannot adopt arbitrary same-shape bytes.
 */
export function previewOnboardingSessionCleanupRelease({
  rootDir,
  expectedStateSha256,
  expectedRevision,
  sessionCleanup,
} = {}) {
  if (!SHA256_RE.test(expectedStateSha256 ?? "")
    || !Number.isSafeInteger(expectedRevision)
    || expectedRevision < 0
    || !isObject(sessionCleanup)) {
    fail("SESSION-CLEANUP-RELEASE-REQUEST", "cleanup release preview request is invalid");
  }
  const current = observeSessionCleanupState(rootDir);
  if (current.stateSha256 !== expectedStateSha256
    || current.revision !== expectedRevision
    || canonicalJson(current.sessionCleanup) !== canonicalJson(sessionCleanup)) {
    fail("SESSION-CLEANUP-RELEASE-CAS", "cleanup release preview preimage changed");
  }
  if (current.neutral) {
    return {
      schema: SESSION_CLEANUP_BIND_SCHEMA,
      status: "previewed",
      root: current.root,
      stateSha256: current.stateSha256,
      revision: current.revision,
      sessionCleanup: null,
      mutated: false,
      storage: "private-runtime",
    };
  }
  const proposal = releaseContinuitySessionCleanup(current.state.continuity, {
    expectedRevision,
    sessionCleanup,
  }, current.activeFeatureId);
  if (!proposal.ok || !proposal.mutated) {
    fail(proposal.code, "continuity state rejected cleanup release preview");
  }
  const next = structuredClone(current.state);
  next.continuity = proposal.state;
  return {
    schema: SESSION_CLEANUP_BIND_SCHEMA,
    status: "previewed",
    root: current.root,
    stateSha256: sha256(expectedStateBytes(next)),
    revision: expectedRevision + 1,
    sessionCleanup: null,
    mutated: false,
  };
}

/** Trim and validate one goal as UTF-8 data, never as shell syntax. */
export function validateKickoffGoal(goal) {
  if (typeof goal !== "string" || goal.includes("\0")) {
    fail("KICKOFF-GOAL-INVALID", "goal must be NUL-free UTF-8 text");
  }
  const normalized = goal.trim();
  const bytes = Buffer.byteLength(normalized, "utf8");
  if (/[\r\n]/u.test(normalized)) {
    fail("KICKOFF-GOAL-INVALID", "goal must be a single line");
  }
  if (bytes < 1 || bytes > KICKOFF_GOAL_MAX_BYTES) {
    fail("KICKOFF-GOAL-INVALID", `goal must contain 1-${KICKOFF_GOAL_MAX_BYTES} UTF-8 bytes after trimming`);
  }
  return normalized;
}

function projectGoal(goal) {
  return goal.split("\n").map((line) => `> ${line}`).join("\n");
}

function initialPrdContent(goal, goalSha256) {
  return [
    "# Initial product requirements",
    "",
    "## Goal",
    "",
    projectGoal(goal),
    "",
    "## Goal binding",
    "",
    `SHA-256: \`${goalSha256}\``,
    "",
    "## Initial acceptance",
    "",
    "- Refine this sanctioned kickoff artifact through the normal reviewed planning lifecycle.",
    "- Preserve the bound goal unless the PO explicitly changes project intent.",
    "",
  ].join("\n");
}

function initialSpecContent(goalSha256, prdSha256) {
  return [
    "# Initial technical specification",
    "",
    "## Authority binding",
    "",
    `- Goal SHA-256: \`${goalSha256}\``,
    `- Initial PRD SHA-256: \`${prdSha256}\``,
    "",
    "## Initial implementation contract",
    "",
    "Review the initial PRD, establish bounded implementation packages, and replace this",
    "kickoff specification only through the sanctioned reviewed planning lifecycle.",
    "",
  ].join("\n");
}

function handoverContent(goal, featureId, prdPath, specPath) {
  return [
    "# Project state",
    "",
    "## Goal",
    "",
    projectGoal(goal),
    "",
    "## Current state",
    "",
    `Feature \`${featureId}\` is active in design.`,
    `Initial PRD: \`${prdPath}\`.`,
    `Initial specification: \`${specPath}\`.`,
    "",
    "## Next action",
    "",
    "Review the goal and establish the initial PRD and technical specification.",
    "",
  ].join("\n");
}

function initialContinuity({ featureId, prdSha256, specSha256 }) {
  return {
    schema: "pipeline.continuity.v0",
    featureId,
    revision: 0,
    runtime: {
      humanFacingLanguage: "en",
      activeDuty: "Coordinator",
      sessionCleanup: null,
    },
    authority: {
      prd: { path: INITIAL_PRD_RELATIVE_PATH, sha256: prdSha256 },
      spec: { path: INITIAL_SPEC_RELATIVE_PATH, sha256: specSha256 },
      result: null,
    },
    queueHead: {
      packageId: "initial-planning",
      actionId: "review-goal",
      nextAction: "review",
      productRetryCount: 0,
      environmentRerouteCount: 0,
      dispatch: null,
    },
    blocker: null,
    acknowledgedFinal: null,
    resume: {
      mode: "resume-on-next-turn",
      sourceRevision: 0,
      reasonCode: "host-no-background-wakeup",
    },
    recovery: null,
    decisionTxn: null,
    capacity: {
      concurrencyLimit: 4,
      reservedCriticSlots: 1,
      reservedRecoverySlots: 1,
      fallbackPolicy: "defer",
    },
  };
}

function applyAction(onboardingScript, root, goal, planSha256) {
  return {
    kind: "command",
    executable: "node",
    argv: [
      onboardingScript,
      "kickoff",
      "apply",
      "--root",
      root,
      "--goal",
      goal,
      "--plan-sha256",
      planSha256,
      "--activate",
    ],
    mutation: true,
    requiresConfirmation: true,
    expected: {
      schema: "pipeline.project-onboarding.v4",
      statuses: ["ready"],
    },
  };
}

function planBinding(plan) {
  return {
    schema: plan.schema,
    root: plan.root,
    repositoryCapability: plan.repositoryCapability,
    goal: plan.goal,
    goalSha256: plan.goalSha256,
    calibration: plan.calibration,
    targets: plan.targets,
    transactionSha256: plan.transactionSha256,
    onboardingScript: plan.onboardingScript,
  };
}

function expectedStateBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function expectedHistoryBytes(value) {
  return Buffer.from(canonicalJson(value), "utf8");
}

function validatePlan(plan) {
  const selectedAuthority = typeof plan?.root === "string"
    ? authorityPaths(plan.root)
    : { state: null, calibration: null };
  if (!exactKeys(plan, PLAN_KEYS)
    || plan.schema !== KICKOFF_PLAN_SCHEMA
    || !new Set(["local", "host-managed"]).has(plan.repositoryCapability)
    || !SHA256_RE.test(plan.goalSha256 ?? "")
    || !SHA256_RE.test(plan.transactionSha256 ?? "")
    || !SHA256_RE.test(plan.planSha256 ?? "")
    || !isAbsolute(plan.onboardingScript ?? "")
    || validateKickoffGoal(plan.goal) !== plan.goal
    || sha256(Buffer.from(plan.goal, "utf8")) !== plan.goalSha256
    || !exactKeys(plan.calibration, new Set(["path", "sha256"]))
    || plan.calibration.path !== selectedAuthority.calibration
    || !SHA256_RE.test(plan.calibration.sha256 ?? "")
    || !exactKeys(plan.targets, new Set(["state", "handover", "prd", "spec", "history"]))
    || !exactKeys(plan.targets.state, TARGET_KEYS.state)
    || !exactKeys(plan.targets.handover, TARGET_KEYS.handover)
    || !exactKeys(plan.targets.prd, TARGET_KEYS.prd)
    || !exactKeys(plan.targets.spec, TARGET_KEYS.spec)
    || !exactKeys(plan.targets.history, TARGET_KEYS.history)) {
    fail("KICKOFF-PLAN-INVALID", "kickoff plan is not closed and valid");
  }
  const root = physicalRoot(plan.root);
  if (root !== plan.root
    || plan.targets.state.path !== selectedAuthority.state
    || plan.targets.history.path !== HISTORY_BASENAME
    || plan.targets.prd.path !== INITIAL_PRD_RELATIVE_PATH
    || plan.targets.spec.path !== INITIAL_SPEC_RELATIVE_PATH
    || plan.targets.state.beforeSha256 !== null
    || plan.targets.handover.beforeSha256 !== null
    || plan.targets.prd.beforeSha256 !== null
    || plan.targets.spec.beforeSha256 !== null
    || plan.targets.history.beforeSha256 !== null) {
    fail("KICKOFF-PLAN-INVALID", "kickoff plan targets or preimages are invalid");
  }
  safeRelativePath(plan.targets.handover.path, "configured handover");
  const state = plan.targets.state.value;
  if (!exactKeys(state, new Set(["schema", "activeFeature", "planApproved", "continuity"]))
    || state.schema !== "pipeline.state.v0"
    || !exactKeys(state.activeFeature, new Set(["id", "planPath", "phase"]))
    || state.activeFeature.id !== state.continuity?.featureId
    || state.activeFeature.planPath !== plan.targets.spec.path
    || state.activeFeature.phase !== "design"
    || state.planApproved !== false
    || state.continuity.authority.prd.path !== plan.targets.prd.path
    || state.continuity.authority.prd.sha256 !== plan.targets.prd.afterSha256
    || state.continuity.authority.spec.path !== plan.targets.spec.path
    || state.continuity.authority.spec.sha256 !== plan.targets.spec.afterSha256
    || state.continuity.authority.prd.path === plan.targets.handover.path
    || state.continuity.authority.spec.path === plan.targets.handover.path
    || !validateContinuityState(state.continuity, state.activeFeature.id).ok) {
    fail("KICKOFF-PLAN-INVALID", "proposed Pipeline state is invalid");
  }
  const proposedReadback = projectReadContinuityStatus({ status: "ok", state });
  if (proposedReadback.code !== "CS-STATUS-ACTIVE" || proposedReadback.continuity.status !== "valid") {
    fail("KICKOFF-PLAN-INVALID", "proposed continuity does not pass sanctioned readback");
  }
  const stateBytes = expectedStateBytes(state);
  const handoverBytes = Buffer.from(plan.targets.handover.content, "utf8");
  const prdBytes = Buffer.from(plan.targets.prd.content, "utf8");
  const specBytes = Buffer.from(plan.targets.spec.content, "utf8");
  validateHistory(plan.targets.history.value);
  const historyBytes = expectedHistoryBytes(plan.targets.history.value);
  if (sha256(stateBytes) !== plan.targets.state.afterSha256
    || sha256(handoverBytes) !== plan.targets.handover.afterSha256
    || sha256(prdBytes) !== plan.targets.prd.afterSha256
    || sha256(specBytes) !== plan.targets.spec.afterSha256
    || sha256(historyBytes) !== plan.targets.history.afterSha256) {
    fail("KICKOFF-PLAN-INVALID", "kickoff postimage digest is invalid");
  }
  const transaction = {
    schema: "pipeline.codex-onboarding-kickoff-transaction.v1",
    root: plan.root,
    repositoryCapability: plan.repositoryCapability,
    goalSha256: plan.goalSha256,
    calibrationSha256: plan.calibration.sha256,
    prdSha256: plan.targets.prd.afterSha256,
    specSha256: plan.targets.spec.afterSha256,
    stateSha256: plan.targets.state.afterSha256,
    handoverSha256: plan.targets.handover.afterSha256,
  };
  if (canonicalSha256(transaction) !== plan.transactionSha256
    || plan.targets.history.value.transactions.length !== 1
    || canonicalJson(plan.targets.history.value.transactions[0]) !== canonicalJson({
      kind: "kickoff",
      transactionSha256: plan.transactionSha256,
      goalSha256: plan.goalSha256,
      calibrationSha256: plan.calibration.sha256,
      prdSha256: plan.targets.prd.afterSha256,
      specSha256: plan.targets.spec.afterSha256,
      stateSha256: plan.targets.state.afterSha256,
      handoverSha256: plan.targets.handover.afterSha256,
    })
    || canonicalSha256(planBinding(plan)) !== plan.planSha256) {
    fail("KICKOFF-PLAN-INVALID", "kickoff transaction binding is invalid");
  }
  if (canonicalJson(plan.applyAction) !== canonicalJson(
    applyAction(plan.onboardingScript, plan.root, plan.goal, plan.planSha256),
  )) {
    fail("KICKOFF-PLAN-INVALID", "kickoff apply action is invalid");
  }
  return {
    stateBytes,
    handoverBytes,
    prdBytes,
    specBytes,
    historyBytes,
    proposedReadback,
  };
}

/**
 * Produce one deterministic plan. The observation and construction path has no
 * mkdir, lock, temporary file, or private-state write.
 */
function buildOnboardingKickoffPlan({
  rootDir,
  goal,
  repositoryCapability = "local",
  onboardingScript = DEFAULT_ONBOARDING_SCRIPT,
  spawn = defaultGitSpawn,
  allowAppliedReplay = false,
} = {}) {
  const normalizedGoal = validateKickoffGoal(goal);
  if (!isAbsolute(onboardingScript)) fail("KICKOFF-PLAN-INVALID", "onboarding script must be absolute");
  const observed = observeDetailed({ rootDir, repositoryCapability, spawn });
  const selectedAuthority = authorityPaths(observed.root);
  const replay = allowAppliedReplay && observed.continuity.status === "valid";
  if (observed.continuity.status !== "absent-pristine" && !replay) {
    fail("KICKOFF-NOT-PRISTINE", "kickoff is permitted only for absent-pristine continuity");
  }
  const authorityObservations = Object.fromEntries([
    ["prd", INITIAL_PRD_RELATIVE_PATH, "initial PRD"],
    ["spec", INITIAL_SPEC_RELATIVE_PATH, "initial specification"],
  ].map(([key, path, label]) => [key, observeOptionalProjectFile(observed.root, path, label)]));
  if (!replay) {
    for (const [key, label] of [["prd", "initial PRD"], ["spec", "initial specification"]]) {
      if (authorityObservations[key].status !== "absent") {
      fail("KICKOFF-NOT-PRISTINE", `${label} target already exists`);
      }
    }
  }
  const goalSha256 = sha256(Buffer.from(normalizedGoal, "utf8"));
  const featureId = `kickoff-${goalSha256.slice(0, 16)}`;
  const prdContent = initialPrdContent(normalizedGoal, goalSha256);
  const prdSha256 = sha256(Buffer.from(prdContent, "utf8"));
  const specContent = initialSpecContent(goalSha256, prdSha256);
  const specSha256 = sha256(Buffer.from(specContent, "utf8"));
  const content = handoverContent(
    normalizedGoal,
    featureId,
    INITIAL_PRD_RELATIVE_PATH,
    INITIAL_SPEC_RELATIVE_PATH,
  );
  const handoverSha256 = sha256(Buffer.from(content, "utf8"));
  const continuity = initialContinuity({ featureId, prdSha256, specSha256 });
  const state = {
    schema: "pipeline.state.v0",
    activeFeature: {
      id: featureId,
      planPath: INITIAL_SPEC_RELATIVE_PATH,
      phase: "design",
    },
    planApproved: false,
    continuity,
  };
  const valid = validateContinuityState(continuity, featureId);
  if (!valid.ok) fail("KICKOFF-PLAN-INVALID", `initial continuity was rejected (${valid.code})`);
  const stateSha256 = sha256(expectedStateBytes(state));
  const transaction = {
    schema: "pipeline.codex-onboarding-kickoff-transaction.v1",
    root: observed.root,
    repositoryCapability,
    goalSha256,
    calibrationSha256: observed.calibrationSha256,
    prdSha256,
    specSha256,
    stateSha256,
    handoverSha256,
  };
  const transactionSha256 = canonicalSha256(transaction);
  const history = {
    schema: KICKOFF_HISTORY_SCHEMA,
    transactions: [{
      kind: "kickoff",
      transactionSha256,
      goalSha256,
      calibrationSha256: observed.calibrationSha256,
      prdSha256,
      specSha256,
      stateSha256,
      handoverSha256,
    }],
  };
  const targets = {
    state: {
      path: selectedAuthority.state,
      beforeSha256: null,
      afterSha256: stateSha256,
      value: state,
    },
    handover: {
      path: observed.handoverPath,
      beforeSha256: null,
      afterSha256: handoverSha256,
      content,
    },
    prd: {
      path: INITIAL_PRD_RELATIVE_PATH,
      beforeSha256: null,
      afterSha256: prdSha256,
      content: prdContent,
    },
    spec: {
      path: INITIAL_SPEC_RELATIVE_PATH,
      beforeSha256: null,
      afterSha256: specSha256,
      content: specContent,
    },
    history: {
      path: HISTORY_BASENAME,
      beforeSha256: null,
      afterSha256: sha256(expectedHistoryBytes(history)),
      value: history,
    },
  };
  const binding = {
    schema: KICKOFF_PLAN_SCHEMA,
    root: observed.root,
    repositoryCapability,
    goal: normalizedGoal,
    goalSha256,
    calibration: {
      path: selectedAuthority.calibration,
      sha256: observed.calibrationSha256,
    },
    targets,
    transactionSha256,
    onboardingScript,
  };
  const planSha256 = canonicalSha256(binding);
  const plan = {
    ...binding,
    planSha256,
    applyAction: applyAction(onboardingScript, observed.root, normalizedGoal, planSha256),
  };
  validatePlan(plan);
  if (replay) {
    const current = {
      state: observed.stateObservation,
      handover: observed.handoverObservation,
      prd: authorityObservations.prd,
      spec: authorityObservations.spec,
      history: observed.historyObservation,
    };
    if (Object.entries(current).some(([key, observation]) => (
      observation?.status !== "present" || observation.sha256 !== plan.targets[key].afterSha256
    ))) {
      fail("KICKOFF-CAS-DRIFT", "completed kickoff does not match the reconstructed goal-bound plan");
    }
  }
  return plan;
}

export function planOnboardingKickoff(options = {}) {
  return buildOnboardingKickoffPlan(options);
}

/**
 * Reconstruct the same closed goal-bound plan for public apply. Exact completed
 * postimages are accepted solely to make a digest-identical apply replayable.
 */
export function reconstructOnboardingKickoffPlan(options = {}) {
  return buildOnboardingKickoffPlan({ ...options, allowAppliedReplay: true });
}

function promotionApplyAction(onboardingScript, root, profile, featureId, planPath, prdPath, specPath, planSha256) {
  return {
    kind: "command",
    executable: "node",
    argv: [
      onboardingScript, "kickoff", "promote", "apply", "--root", root,
      "--profile", profile, "--id", featureId, "--plan-path", planPath,
      "--prd-path", prdPath, "--spec-path", specPath,
      "--plan-sha256", planSha256, "--activate",
    ],
    mutation: true,
    requiresConfirmation: true,
    expected: { schema: "pipeline.project-onboarding.v4", statuses: ["ready"] },
  };
}

function promotionBinding(plan) {
  return {
    schema: plan.schema,
    root: plan.root,
    repositoryCapability: plan.repositoryCapability,
    profile: plan.profile,
    feature: plan.feature,
    authority: plan.authority,
    kickoff: plan.kickoff,
    targets: plan.targets,
    transactionSha256: plan.transactionSha256,
    onboardingScript: plan.onboardingScript,
  };
}

function recognisedKickoff(observed, spawn = defaultGitSpawn) {
  const state = observed.state;
  const continuity = state?.continuity;
  const history = observed.history;
  if (!exactKeys(state, new Set(["schema", "activeFeature", "planApproved", "continuity"]))) return null;
  if (state.schema !== "pipeline.state.v0" || state.planApproved !== false
    || !exactKeys(state.activeFeature, new Set(["id", "planPath", "phase"]))) return null;
  if (!/^kickoff-[a-f0-9]{16}$/u.test(state.activeFeature.id)
    || state.activeFeature.planPath !== INITIAL_SPEC_RELATIVE_PATH
    || state.activeFeature.phase !== "design"
    || !validateContinuityState(continuity, state.activeFeature.id).ok
    || continuity.runtime.sessionCleanup !== null
    || continuity.authority.result !== null
    || continuity.authority.prd.path !== INITIAL_PRD_RELATIVE_PATH
    || continuity.authority.spec.path !== INITIAL_SPEC_RELATIVE_PATH
    || continuity.queueHead?.dispatch !== null
    || continuity.blocker !== null
    || continuity.acknowledgedFinal !== null
    || continuity.recovery !== null
    || continuity.decisionTxn !== null) return null;
  if (!history || history.transactions?.length !== 1 || history.transactions[0]?.kind !== "kickoff") return null;
  const entry = history.transactions[0];
  const prd = observeOptionalProjectFile(observed.root, INITIAL_PRD_RELATIVE_PATH, "initial PRD");
  const spec = observeOptionalProjectFile(observed.root, INITIAL_SPEC_RELATIVE_PATH, "initial specification");
  if (prd.status !== "present" || spec.status !== "present"
    || entry.calibrationSha256 !== observed.calibrationSha256
    || entry.handoverSha256 !== observed.handoverObservation.sha256
    || entry.prdSha256 !== continuity.authority.prd.sha256
    || entry.specSha256 !== continuity.authority.spec.sha256
    || entry.prdSha256 !== prd.sha256
    || entry.specSha256 !== spec.sha256) return null;

  let originalState = state;
  let cleanupBinding = null;
  if (continuity.revision === 1) {
    if (continuity.resume.mode !== "resume-on-next-turn"
      || continuity.resume.sourceRevision !== 0
      || continuity.resume.reasonCode !== "host-no-background-wakeup") return null;
    let privateBinding;
    try {
      cleanupBinding = readPrivateCleanupBinding(observed.root, { spawn });
      privateBinding = cleanupBinding.binding;
    } catch {
      return null;
    }
    if (privateBinding?.featureId !== state.activeFeature.id
      || !isObject(privateBinding.sessionCleanup)) return null;
    originalState = structuredClone(state);
    originalState.continuity.revision = 0;
  } else if (continuity.revision !== 0) {
    return null;
  }
  const originalStateSha256 = sha256(expectedStateBytes(originalState));
  const transaction = {
    schema: "pipeline.codex-onboarding-kickoff-transaction.v1",
    root: observed.root,
    repositoryCapability: observed.repositoryCapability,
    goalSha256: entry.goalSha256,
    calibrationSha256: entry.calibrationSha256,
    prdSha256: entry.prdSha256,
    specSha256: entry.specSha256,
    stateSha256: entry.stateSha256,
    handoverSha256: entry.handoverSha256,
  };
  if (entry.stateSha256 !== originalStateSha256
    || canonicalSha256(transaction) !== entry.transactionSha256) return null;
  return {
    state,
    originalState,
    continuity,
    history,
    revision: continuity.revision,
    transactionSha256: entry.transactionSha256,
    cleanupBinding,
  };
}

function promotionInput({ profile, featureId, planPath, prdPath, specPath }) {
  if (!PROMOTION_PROFILES.has(profile)) fail("KICKOFF-PROMOTION-INPUT", "promotion profile is invalid");
  if (!SAFE_FEATURE_ID.test(featureId ?? "") || featureId.startsWith("kickoff-")) {
    fail("KICKOFF-PROMOTION-INPUT", "promotion feature id is invalid");
  }
  for (const [value, label] of [[planPath, "plan"], [prdPath, "PRD"], [specPath, "specification"]]) {
    safeRelativePath(value, `promotion ${label}`);
  }
  if (planPath !== specPath || new Set([prdPath, specPath]).size !== 2) {
    fail("KICKOFF-PROMOTION-INPUT", "promotion plan and authority paths are inconsistent");
  }
  return { profile, featureId, planPath, prdPath, specPath };
}

function promotionArtifacts(root, input) {
  const prd = observeOptionalProjectFile(root, input.prdPath, "promotion PRD");
  const spec = observeOptionalProjectFile(root, input.specPath, "promotion specification");
  if (prd.status !== "present" || spec.status !== "present") {
    fail("KICKOFF-PROMOTION-AUTHORITY", "promotion PRD and specification must already exist");
  }
  if ([INITIAL_PRD_RELATIVE_PATH, INITIAL_SPEC_RELATIVE_PATH].includes(prd.path)
    || [INITIAL_PRD_RELATIVE_PATH, INITIAL_SPEC_RELATIVE_PATH].includes(spec.path)) {
    fail("KICKOFF-PROMOTION-AUTHORITY", "promotion authority must not reuse kickoff artifacts");
  }
  return {
    prd: { path: input.prdPath, sha256: prd.sha256 },
    spec: { path: input.specPath, sha256: spec.sha256 },
  };
}

function promotionResult(plan, status, mutated, spawn = defaultGitSpawn) {
  const readback = projectReadContinuityStatus(readSanctionedState(plan.root));
  if (readback.code !== "CS-STATUS-ACTIVE" || readback.continuity.status !== "valid") {
    fail("KICKOFF-PROMOTION-READBACK", "sanctioned continuity readback rejected promotion");
  }
  const continuity = classifyOnboardingContinuity({
    rootDir: plan.root,
    repositoryCapability: plan.repositoryCapability,
    spawn,
  });
  if (continuity.status !== "valid" || continuity.stateSha256 !== plan.targets.state.afterSha256
    || continuity.historySha256 !== plan.targets.history.afterSha256) {
    fail("KICKOFF-PROMOTION-READBACK", "promotion hashes did not validate immediately");
  }
  return {
    schema: KICKOFF_PROMOTION_APPLY_SCHEMA,
    status,
    root: plan.root,
    planSha256: plan.planSha256,
    mutated,
    continuity,
    readback,
  };
}

function validatePromotionPlan(plan) {
  if (!exactKeys(plan, PROMOTION_PLAN_KEYS) || plan.schema !== KICKOFF_PROMOTION_PLAN_SCHEMA
    || !new Set(["local", "host-managed"]).has(plan.repositoryCapability)
    || !isAbsolute(plan.onboardingScript ?? "") || !SHA256_RE.test(plan.planSha256 ?? "")
    || !SHA256_RE.test(plan.transactionSha256 ?? "")
    || !exactKeys(plan.feature, new Set(["id", "planPath"]))
    || !exactKeys(plan.authority, new Set(["prd", "spec"]))
    || !exactKeys(plan.authority.prd, new Set(["path", "sha256"]))
    || !exactKeys(plan.authority.spec, new Set(["path", "sha256"]))
    || !exactKeys(plan.kickoff, new Set(["featureId", "transactionSha256", "stateSha256", "historySha256", "revision"]))
    || !(exactKeys(plan.targets, new Set(["state", "history"]))
      || exactKeys(plan.targets, new Set(["state", "history", "cleanupBinding"])))
    || !exactKeys(plan.targets.state, PROMOTION_TARGET_KEYS.state)
    || !exactKeys(plan.targets.history, PROMOTION_TARGET_KEYS.history)
    || (plan.targets.cleanupBinding !== undefined && !exactKeys(plan.targets.cleanupBinding, PROMOTION_TARGET_KEYS.cleanupBinding))) {
    fail("KICKOFF-PROMOTION-PLAN", "promotion plan is not closed and valid");
  }
  const input = promotionInput({
    profile: plan.profile, featureId: plan.feature.id, planPath: plan.feature.planPath,
    prdPath: plan.authority.prd.path, specPath: plan.authority.spec.path,
  });
  const root = physicalRoot(plan.root);
  const selected = authorityPaths(root);
  if (root !== plan.root || plan.targets.state.path !== selected.state
    || plan.targets.history.path !== HISTORY_BASENAME
    || ![plan.authority.prd.sha256, plan.authority.spec.sha256, plan.kickoff.transactionSha256,
      plan.kickoff.stateSha256, plan.kickoff.historySha256, plan.targets.state.beforeSha256,
      plan.targets.state.afterSha256, plan.targets.history.beforeSha256, plan.targets.history.afterSha256]
      .every((value) => SHA256_RE.test(value ?? ""))) {
    fail("KICKOFF-PROMOTION-PLAN", "promotion plan bindings are invalid");
  }
  const state = plan.targets.state.value;
  if (!exactKeys(state, new Set(["schema", "activeFeature", "planApproved", "continuity"]))) {
    fail("KICKOFF-PROMOTION-PLAN", "promotion state postimage is invalid");
  }
  if (state.schema !== "pipeline.state.v0" || state.activeFeature.id !== input.featureId
    || state.activeFeature.planPath !== input.planPath || state.activeFeature.phase !== "design"
    || state.planApproved !== false || state.continuity.featureId !== input.featureId
    || state.continuity.authority.prd.path !== input.prdPath
    || state.continuity.authority.prd.sha256 !== plan.authority.prd.sha256
    || state.continuity.authority.spec.path !== input.specPath
    || state.continuity.authority.spec.sha256 !== plan.authority.spec.sha256
    || !Number.isSafeInteger(plan.kickoff.revision)
    || ![0, 1].includes(plan.kickoff.revision)
    || state.continuity.revision !== plan.kickoff.revision + 1
    || state.continuity.resume.sourceRevision !== state.continuity.revision
    || !validateContinuityState(state.continuity, input.featureId).ok) {
    fail("KICKOFF-PROMOTION-PLAN", "promotion continuity postimage is invalid");
  }
  validateHistory(plan.targets.history.value);
  const history = plan.targets.history.value.transactions;
  if (history.length !== 2 || history[1].kind !== "kickoff-promotion"
    || plan.kickoff.stateSha256 !== plan.targets.state.beforeSha256
    || plan.kickoff.historySha256 !== plan.targets.history.beforeSha256
    || history[0].transactionSha256 !== plan.kickoff.transactionSha256
    || history[1].previousTransactionSha256 !== plan.kickoff.transactionSha256
    || history[1].kickoffFeatureId !== plan.kickoff.featureId
    || history[1].profile !== plan.profile
    || history[1].transactionSha256 !== plan.transactionSha256
    || history[1].featureId !== input.featureId
    || history[1].planPath !== input.planPath
    || history[1].prdSha256 !== plan.authority.prd.sha256
    || history[1].specSha256 !== plan.authority.spec.sha256
    || history[1].beforeStateSha256 !== plan.targets.state.beforeSha256
    || history[1].afterStateSha256 !== plan.targets.state.afterSha256) {
    fail("KICKOFF-PROMOTION-PLAN", "promotion history postimage is invalid");
  }
  const cleanupBinding = plan.targets.cleanupBinding ?? null;
  if ((plan.kickoff.revision === 1) !== (cleanupBinding !== null)
    || (cleanupBinding !== null && (!SHA256_RE.test(cleanupBinding.beforeSha256)
      || !SHA256_RE.test(cleanupBinding.afterSha256)
      || canonicalJson(history[1].cleanupBinding) !== canonicalJson(cleanupBinding)))) {
    fail("KICKOFF-PROMOTION-PLAN", "promotion private cleanup binding target is invalid");
  }
  const stateBytes = expectedStateBytes(state);
  const historyBytes = expectedHistoryBytes(plan.targets.history.value);
  const kickoffHistoryBytes = expectedHistoryBytes({
    schema: KICKOFF_HISTORY_SCHEMA,
    transactions: [history[0]],
  });
  if (sha256(stateBytes) !== plan.targets.state.afterSha256 || sha256(historyBytes) !== plan.targets.history.afterSha256) {
    fail("KICKOFF-PROMOTION-PLAN", "promotion postimage digest is invalid");
  }
  if (sha256(kickoffHistoryBytes) !== plan.targets.history.beforeSha256) {
    fail("KICKOFF-PROMOTION-PLAN", "promotion kickoff history binding is invalid");
  }
  if (canonicalSha256(promotionBinding(plan)) !== plan.planSha256
    || canonicalJson(plan.applyAction) !== canonicalJson(promotionApplyAction(
      plan.onboardingScript, plan.root, input.profile, input.featureId, input.planPath,
      input.prdPath, input.specPath, plan.planSha256,
    ))) {
    fail("KICKOFF-PROMOTION-PLAN", "promotion action binding is invalid");
  }
  return { input, stateBytes, historyBytes };
}

function buildKickoffPromotionPlan({
  rootDir, profile, featureId, planPath, prdPath, specPath,
  repositoryCapability = "local", onboardingScript = DEFAULT_ONBOARDING_SCRIPT,
  spawn = defaultGitSpawn, allowAppliedReplay = false,
} = {}) {
  if (!isAbsolute(onboardingScript)) fail("KICKOFF-PROMOTION-PLAN", "onboarding script must be absolute");
  const input = promotionInput({ profile, featureId, planPath, prdPath, specPath });
  const observed = observeDetailed({ rootDir, repositoryCapability, spawn });
  if (observed.continuity.status !== "valid") fail("KICKOFF-PROMOTION-STATE", "promotion requires valid continuity");
  const kickoff = recognisedKickoff(observed, spawn);
  if (kickoff === null && allowAppliedReplay) {
    const entries = observed.history?.transactions;
    const entry = entries?.at(-1);
    const authority = promotionArtifacts(observed.root, input);
    if (entries?.length !== 2 || entry?.kind !== "kickoff-promotion"
      || entry.profile !== input.profile || entry.featureId !== input.featureId
      || entry.planPath !== input.planPath || entry.prdSha256 !== authority.prd.sha256
      || entry.specSha256 !== authority.spec.sha256 || entry.afterStateSha256 !== observed.stateObservation.sha256
      || observed.state?.activeFeature?.id !== input.featureId || observed.state?.activeFeature?.planPath !== input.planPath
      || observed.state?.continuity?.featureId !== input.featureId
      || observed.state?.continuity?.authority?.prd?.sha256 !== authority.prd.sha256
      || observed.state?.continuity?.authority?.spec?.sha256 !== authority.spec.sha256) {
      fail("KICKOFF-PROMOTION-REPLAY", "promotion replay does not match the exact completed postimage");
    }
    const historyBefore = { schema: KICKOFF_HISTORY_SCHEMA, transactions: [entries[0]] };
    const cleanupBinding = entry.cleanupBinding === undefined ? null : readPrivateCleanupBinding(observed.root, { spawn });
    if ((entry.cleanupBinding === undefined && observed.state.continuity.revision === 2 && observed.privateBinding !== null)
      || (entry.cleanupBinding !== undefined && (cleanupBinding.binding === null
        || cleanupBinding.binding.featureId !== input.featureId
        || cleanupBinding.sha256 !== entry.cleanupBinding.afterSha256))) {
      fail("KICKOFF-PROMOTION-REPLAY", "promotion private cleanup binding does not match the exact completed postimage");
    }
    const binding = {
      schema: KICKOFF_PROMOTION_PLAN_SCHEMA, root: observed.root, repositoryCapability, profile: input.profile,
      feature: { id: input.featureId, planPath: input.planPath }, authority,
      kickoff: {
        featureId: entry.kickoffFeatureId,
        transactionSha256: entries[0].transactionSha256,
        stateSha256: entry.beforeStateSha256,
        historySha256: sha256(expectedHistoryBytes(historyBefore)),
        revision: observed.state.continuity.revision - 1,
      },
      targets: {
        state: { path: authorityPaths(observed.root).state, beforeSha256: entry.beforeStateSha256, afterSha256: observed.stateObservation.sha256, value: observed.state },
        history: { path: HISTORY_BASENAME, beforeSha256: sha256(expectedHistoryBytes(historyBefore)), afterSha256: observed.historyObservation.sha256, value: observed.history },
        ...(entry.cleanupBinding === undefined ? {} : { cleanupBinding: structuredClone(entry.cleanupBinding) }),
      },
      transactionSha256: entry.transactionSha256, onboardingScript,
    };
    const planSha256 = canonicalSha256(binding);
    const plan = { ...binding, planSha256, applyAction: promotionApplyAction(onboardingScript, observed.root, input.profile, input.featureId, input.planPath, input.prdPath, input.specPath, planSha256) };
    validatePromotionPlan(plan);
    return plan;
  }
  if (kickoff === null) {
    fail("KICKOFF-PROMOTION-NOT-SEED", "promotion requires the exact unapproved kickoff seed");
  }
  const authority = promotionArtifacts(observed.root, input);
  const beforeStateSha256 = observed.stateObservation.sha256;
  const beforeHistorySha256 = observed.historyObservation.sha256;
  const next = structuredClone(kickoff.state);
  next.activeFeature = { id: input.featureId, planPath: input.planPath, phase: "design" };
  next.planApproved = false;
  next.continuity.featureId = input.featureId;
  next.continuity.revision = kickoff.revision + 1;
  next.continuity.authority = { prd: authority.prd, spec: authority.spec, result: null };
  next.continuity.queueHead = {
    packageId: "kickoff-promotion", actionId: "review-work", nextAction: "review",
    productRetryCount: 0, environmentRerouteCount: 0, dispatch: null,
  };
  next.continuity.blocker = null;
  next.continuity.acknowledgedFinal = null;
  next.continuity.resume = {
    mode: "immediate",
    sourceRevision: next.continuity.revision,
    reasonCode: "active-turn",
  };
  next.continuity.recovery = null;
  next.continuity.decisionTxn = null;
  if (!validateContinuityState(next.continuity, input.featureId).ok) {
    fail("KICKOFF-PROMOTION-PLAN", "promotion continuity transition is invalid");
  }
  const afterStateSha256 = sha256(expectedStateBytes(next));
  const cleanupBindingAfterBytes = kickoff.cleanupBinding === null
    ? null
    : promotedPrivateCleanupBinding(kickoff.cleanupBinding, input.featureId);
  const cleanupBindingTarget = cleanupBindingAfterBytes === null
    ? null
    : {
      beforeSha256: kickoff.cleanupBinding.sha256,
      afterSha256: sha256(cleanupBindingAfterBytes),
    };
  const transaction = {
    schema: "pipeline.codex-onboarding-kickoff-promotion-transaction.v1",
    root: observed.root, repositoryCapability, profile: input.profile, feature: { id: input.featureId, planPath: input.planPath },
    kickoffTransactionSha256: kickoff.transactionSha256, beforeStateSha256, afterStateSha256,
    prdSha256: authority.prd.sha256, specSha256: authority.spec.sha256,
  };
  const transactionSha256 = canonicalSha256(transaction);
  const history = {
    schema: KICKOFF_HISTORY_SCHEMA,
    transactions: [...kickoff.history.transactions, {
      kind: "kickoff-promotion", transactionSha256, previousTransactionSha256: kickoff.transactionSha256, kickoffFeatureId: kickoff.state.activeFeature.id,
      profile: input.profile, featureId: input.featureId, planPath: input.planPath,
      prdSha256: authority.prd.sha256, specSha256: authority.spec.sha256,
      beforeStateSha256, afterStateSha256,
      ...(cleanupBindingTarget === null ? {} : { cleanupBinding: cleanupBindingTarget }),
    }],
  };
  const binding = {
    schema: KICKOFF_PROMOTION_PLAN_SCHEMA, root: observed.root, repositoryCapability, profile: input.profile,
    feature: { id: input.featureId, planPath: input.planPath }, authority,
    kickoff: {
      featureId: kickoff.state.activeFeature.id,
      transactionSha256: kickoff.transactionSha256,
      stateSha256: beforeStateSha256,
      historySha256: beforeHistorySha256,
      revision: kickoff.revision,
    },
    targets: {
      state: { path: authorityPaths(observed.root).state, beforeSha256: beforeStateSha256, afterSha256: afterStateSha256, value: next },
      history: { path: HISTORY_BASENAME, beforeSha256: beforeHistorySha256, afterSha256: sha256(expectedHistoryBytes(history)), value: history },
      ...(cleanupBindingTarget === null ? {} : { cleanupBinding: cleanupBindingTarget }),
    },
    transactionSha256, onboardingScript,
  };
  const planSha256 = canonicalSha256(binding);
  const plan = {
    ...binding, planSha256,
    applyAction: promotionApplyAction(onboardingScript, observed.root, input.profile, input.featureId, input.planPath, input.prdPath, input.specPath, planSha256),
  };
  validatePromotionPlan(plan);
  return plan;
}

export function planOnboardingKickoffPromotion(options = {}) {
  return buildKickoffPromotionPlan(options);
}

export function reconstructOnboardingKickoffPromotionPlan(options = {}) {
  return buildKickoffPromotionPlan({ ...options, allowAppliedReplay: true });
}

function fsyncDirectory(path) {
  let fd;
  try {
    fd = openSync(path, "r");
    fsyncSync(fd);
  } catch (error) {
    if (!(process.platform === "win32"
      && ["EPERM", "EINVAL", "EISDIR", "ENOTSUP", "EBADF"].includes(error?.code))) {
      throw error;
    }
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function sameDirectoryIdentity(record) {
  try {
    const info = lstatSync(record.path);
    return info.isDirectory() && !info.isSymbolicLink()
      && String(info.dev) === record.dev && String(info.ino) === record.ino;
  } catch { return false; }
}

function sameFileIdentity(record) {
  try {
    const info = lstatSync(record.path);
    return info.isFile() && !info.isSymbolicLink()
      && String(info.dev) === record.dev && String(info.ino) === record.ino
      && sha256(readFileSync(record.path)) === record.sha256;
  } catch { return false; }
}

function rollbackCreatedDirectories(records) {
  const failures = [];
  for (const record of [...records].reverse()) {
    try {
      if (!existsSync(record.path)) continue;
      if (!sameDirectoryIdentity(record) || readdirSync(record.path).length !== 0) {
        throw new Error("created kickoff directory changed before rollback");
      }
      rmdirSync(record.path);
      fsyncDirectory(dirname(record.path));
    } catch (error) { failures.push(error); }
  }
  if (failures.length) fail("KICKOFF-ROLLBACK-INDETERMINATE", "kickoff directory rollback disposition is indeterminate");
}

function ensurePhysicalParent(root, target, createdDirectories = []) {
  const rel = relative(root, dirname(target));
  if (rel === "" || rel === ".") return;
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    fail("KICKOFF-PATH-UNSAFE", "kickoff target parent escaped its root");
  }
  let cursor = root;
  for (const part of rel.split(sep)) {
    cursor = join(cursor, part);
    if (!existsSync(cursor)) {
      mkdirSync(cursor, { mode: 0o755 });
      const created = lstatSync(cursor);
      createdDirectories.push({ path: cursor, dev: String(created.dev), ino: String(created.ino) });
    }
    const info = lstatSync(cursor);
    if (!info.isDirectory() || info.isSymbolicLink()) {
      fail("KICKOFF-PATH-UNSAFE", "kickoff target parent is unsafe");
    }
  }
}

function writeExclusiveSynced(path, bytes, mode) {
  let fd;
  let identity;
  try {
    fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL
      | (constants.O_NOFOLLOW ?? 0), mode);
    const opened = fstatSync(fd);
    identity = { path, dev: String(opened.dev), ino: String(opened.ino), sha256: sha256(bytes) };
    writeFileSync(fd, bytes);
    fsyncSync(fd);
    return identity;
  } catch (error) {
    if (identity && existsSync(path) && sameFileIdentity(identity)) {
      try { unlinkSync(path); fsyncDirectory(dirname(path)); } catch {}
    }
    throw error;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function unlinkOwned(record) {
  if (!record || !existsSync(record.path)) return;
  if (!sameFileIdentity(record)) throw new Error("kickoff artifact identity changed before cleanup");
  unlinkSync(record.path);
  fsyncDirectory(dirname(record.path));
}

function lockRecord(schema, token, ownerNonce, acquiredAtMs) {
  return {
    schema,
    token,
    ownerNonce,
    acquiredAtMs,
  };
}

function parseLock(path, schema) {
  try {
    const value = JSON.parse(readPhysicalFile(path, "kickoff writer lock").toString("utf8"));
    if (!exactKeys(value, new Set(["schema", "token", "ownerNonce", "acquiredAtMs"]))
      || value.schema !== schema
      || typeof value.token !== "string"
      || typeof value.ownerNonce !== "string"
      || !Number.isSafeInteger(value.acquiredAtMs)
      || value.acquiredAtMs < 0) return null;
    return value;
  } catch {
    return null;
  }
}

function publishLock(path, record) {
  writeExclusiveSynced(path, Buffer.from(`${JSON.stringify(record)}\n`, "utf8"), 0o600);
  fsyncDirectory(dirname(path));
}

function acquireLock(path, schema, token, { nowMs = Date.now, lockStaleMs = 30_000 } = {}) {
  const clock = typeof nowMs === "function" ? nowMs : () => nowMs;
  const acquiredAtMs = clock();
  if (!Number.isSafeInteger(acquiredAtMs) || acquiredAtMs < 0
    || !Number.isSafeInteger(lockStaleMs) || lockStaleMs < 0) {
    fail("KICKOFF-LOCKED", "kickoff lock clock is invalid");
  }
  const ownerNonce = randomUUID();
  const record = lockRecord(schema, token, ownerNonce, acquiredAtMs);
  try {
    publishLock(path, record);
    return { path, record, recovered: false };
  } catch (error) {
    if (error?.code !== "EEXIST") fail("KICKOFF-LOCKED", "kickoff writer lock is unavailable");
  }

  const observed = parseLock(path, schema);
  if (observed === null
    || observed.token !== token
    || acquiredAtMs - observed.acquiredAtMs < lockStaleMs) {
    fail("KICKOFF-LOCKED", "kickoff writer lock is unavailable");
  }
  const recoveryPath = `${path}.recover`;
  try {
    publishLock(recoveryPath, record);
  } catch {
    fail("KICKOFF-LOCKED", "kickoff lock recovery is unavailable");
  }
  let recovered = false;
  try {
    const current = parseLock(path, schema);
    if (current === null
      || canonicalJson(current) !== canonicalJson(observed)
      || acquiredAtMs - current.acquiredAtMs < lockStaleMs) {
      fail("KICKOFF-LOCKED", "kickoff lock changed during recovery");
    }
    unlinkSync(path);
    fsyncDirectory(dirname(path));
    publishLock(path, record);
    recovered = true;
    unlinkSync(recoveryPath);
    fsyncDirectory(dirname(path));
    return { path, record, recovered: true };
  } finally {
    if (!recovered) {
      // A recovery guard with uncertain disposition deliberately remains. It
      // prevents either writer from claiming a second owner.
    }
  }
}

function releaseLock(lock) {
  let current;
  try {
    current = JSON.parse(readPhysicalFile(lock.path, "kickoff writer lock").toString("utf8"));
  } catch {
    return false;
  }
  if (canonicalJson(current) !== canonicalJson(lock.record)) return false;
  try {
    unlinkSync(lock.path);
    fsyncDirectory(dirname(lock.path));
    return true;
  } catch {
    return false;
  }
}

function currentTarget(path, expectedSha256) {
  if (!existsSync(path)) return { status: "absent", sha256: null };
  const raw = readPhysicalFile(path, "kickoff target");
  const actual = sha256(raw);
  return { status: actual === expectedSha256 ? "exact" : "conflict", sha256: actual };
}

function resultFromPersisted(plan, status, mutated, spawn = defaultGitSpawn) {
  const readback = projectReadContinuityStatus(readSanctionedState(plan.root));
  if (readback.code !== "CS-STATUS-ACTIVE" || readback.continuity.status !== "valid") {
    fail("KICKOFF-READBACK-INVALID", "sanctioned continuity readback rejected kickoff");
  }
  const continuity = classifyOnboardingContinuity({
    rootDir: plan.root,
    repositoryCapability: plan.repositoryCapability,
    spawn,
  });
  if (continuity.status !== "valid"
    || continuity.stateSha256 !== plan.targets.state.afterSha256
    || continuity.handoverSha256 !== plan.targets.handover.afterSha256
    || continuity.historySha256 !== plan.targets.history.afterSha256) {
    fail("KICKOFF-READBACK-INVALID", "kickoff hashes did not validate immediately");
  }
  return {
    schema: KICKOFF_APPLY_SCHEMA,
    status,
    root: plan.root,
    planSha256: plan.planSha256,
    mutated,
    continuity,
    readback,
  };
}

/**
 * Apply one closed plan. The public CLI reconstructs this object from the
 * separately validated goal argv element; this writer never invents or
 * recovers a goal from a digest, cache, environment variable, or file payload.
 */
export function applyOnboardingKickoff({
  plan,
  expectedPlanSha256,
  activate = false,
  deps = {},
} = {}) {
  if (activate !== true) fail("KICKOFF-ACTIVATION-REQUIRED", "kickoff apply requires explicit activation");
  if (!SHA256_RE.test(expectedPlanSha256 ?? "") || plan?.planSha256 !== expectedPlanSha256) {
    fail("KICKOFF-PLAN-DIGEST", "kickoff plan digest does not match");
  }
  const bytes = validatePlan(plan);
  if (canonicalSha256(planBinding(plan)) !== expectedPlanSha256) {
    fail("KICKOFF-PLAN-DIGEST", "kickoff plan digest does not authenticate the plan");
  }

  const privatePaths = resolvePrivate(plan.root, plan.repositoryCapability, {
    create: false,
    spawn: deps.spawn ?? defaultGitSpawn,
  });
  const paths = {
    state: absoluteProjectPath(plan.root, plan.targets.state.path, "Pipeline machine state"),
    handover: absoluteProjectPath(plan.root, plan.targets.handover.path, "configured handover"),
    prd: absoluteProjectPath(plan.root, plan.targets.prd.path, "initial PRD"),
    spec: absoluteProjectPath(plan.root, plan.targets.spec.path, "initial specification"),
    history: join(privatePaths.directory, HISTORY_BASENAME),
  };
  const token = `kickoff-${plan.planSha256.slice(0, 40)}`;
  const lockOptions = {
    nowMs: deps.nowMs ?? Date.now,
    lockStaleMs: deps.lockStaleMs ?? 30_000,
  };
  const stateLock = acquireLock(
    `${paths.state}.lock`,
    "pipeline.continuity-lock.v0",
    token,
    lockOptions,
  );
  let privateLock;
  let wroteTargets = false;
  let simulatedCrash = false;
  let rollbackAuthorized = false;
  let cleanupCreatedDirectories = false;
  const createdProjectDirectories = [];
  const createdPrivateDirectories = [];
  const temporaryRecords = {};
  const publishedRecords = {};
  const proposedBytes = {
    state: bytes.stateBytes,
    handover: bytes.handoverBytes,
    prd: bytes.prdBytes,
    spec: bytes.specBytes,
    history: bytes.historyBytes,
  };
  const proposedHashes = {
    state: plan.targets.state.afterSha256,
    handover: plan.targets.handover.afterSha256,
    prd: plan.targets.prd.afterSha256,
    spec: plan.targets.spec.afterSha256,
    history: plan.targets.history.afterSha256,
  };
  try {
    const createdPrivatePaths = resolvePrivate(plan.root, plan.repositoryCapability, {
      create: true,
      spawn: deps.spawn ?? defaultGitSpawn,
      createdDirectories: [],
      createdDirectoryRecords: createdPrivateDirectories,
    });
    if (createdPrivatePaths.directory !== privatePaths.directory) {
      fail("KICKOFF-PRIVATE-UNAVAILABLE", "private onboarding state changed during kickoff");
    }
    privateLock = acquireLock(
      join(privatePaths.directory, ".kickoff-writer.lock"),
      "pipeline.codex-onboarding-kickoff-lock.v1",
      token,
      lockOptions,
    );
    const targets = Object.fromEntries(Object.keys(paths).map((key) => [
      key,
      currentTarget(paths[key], proposedHashes[key]),
    ]));
    if (Object.values(targets).every((target) => target.status === "exact")) {
      return resultFromPersisted(plan, "replayed", false, deps.spawn ?? defaultGitSpawn);
    }
    if (Object.values(targets).some((target) => target.status === "conflict")) {
      fail("KICKOFF-CAS-DRIFT", "kickoff target preimage drifted");
    }
    const targetOrder = ["prd", "spec", "handover", "history", "state"];
    const exactCount = targetOrder.filter((key) => targets[key].status === "exact").length;
    const interruptedPrefix = targetOrder.every((key, index) => (
      index < exactCount ? targets[key].status === "exact" : targets[key].status === "absent"
    ));
    if (exactCount > 0 && (!interruptedPrefix || !stateLock.recovered || !privateLock.recovered)) {
      fail("KICKOFF-CAS-DRIFT", "kickoff target preimage drifted");
    }
    const observed = observeDetailed({
      rootDir: plan.root,
      repositoryCapability: plan.repositoryCapability,
      spawn: deps.spawn ?? defaultGitSpawn,
    });
    if (exactCount === 0 && (observed.continuity.status !== "absent-pristine"
      || observed.calibrationSha256 !== plan.calibration.sha256
      || observed.handoverPath !== plan.targets.handover.path)) {
      fail("KICKOFF-CAS-DRIFT", "kickoff continuity/calibration CAS drifted");
    }
    if (exactCount > 0 && observed.calibrationSha256 !== plan.calibration.sha256) {
      fail("KICKOFF-CAS-DRIFT", "kickoff calibration CAS drifted during recovery");
    }
    rollbackAuthorized = true;

    ensurePhysicalParent(plan.root, paths.handover, createdProjectDirectories);
    ensurePhysicalParent(plan.root, paths.prd, createdProjectDirectories);
    ensurePhysicalParent(plan.root, paths.spec, createdProjectDirectories);
    const suffixSource = (deps.randomUUID ?? randomUUID)();
    if (typeof suffixSource !== "string" || !/^[a-f0-9-]{32,64}$/iu.test(suffixSource)) {
      fail("KICKOFF-RANDOM-UNAVAILABLE", "kickoff temporary-name source is invalid");
    }
    const suffix = suffixSource.replaceAll("-", "");
    const temporary = {
      state: join(dirname(paths.state), `.${basename(paths.state)}.kickoff-${suffix}.tmp`),
      handover: join(dirname(paths.handover), `.${basename(paths.handover)}.kickoff-${suffix}.tmp`),
      prd: join(dirname(paths.prd), `.${basename(paths.prd)}.kickoff-${suffix}.tmp`),
      spec: join(dirname(paths.spec), `.${basename(paths.spec)}.kickoff-${suffix}.tmp`),
      history: join(dirname(paths.history), `.${basename(paths.history)}.kickoff-${suffix}.tmp`),
    };

    const fault = (point) => {
      if (deps.crashAt === point) throw new SimulatedKickoffCrash(point);
      (deps.fault ?? (() => {}))(point);
    };
    for (const key of ["prd", "spec", "state", "handover", "history"]) {
      if (targets[key].status === "exact") continue;
      temporaryRecords[key] = writeExclusiveSynced(
        temporary[key],
        proposedBytes[key],
        new Set(["state", "history"]).has(key) ? 0o600 : 0o644,
      );
      fault(`${key}-temp-fsync`);
    }
    for (const key of targetOrder) {
      if (targets[key].status === "exact") continue;
      if (existsSync(paths[key])) fail("KICKOFF-CAS-DRIFT", "kickoff target appeared before publication");
      renameSync(temporary[key], paths[key]);
      publishedRecords[key] = { ...temporaryRecords[key], path: paths[key] };
      wroteTargets = true;
      fault(`${key}-rename`);
      fsyncDirectory(dirname(paths[key]));
      fault(`${key}-directory-fsync`);
    }
    return resultFromPersisted(plan, "applied", true, deps.spawn ?? defaultGitSpawn);
  } catch (error) {
    if (error instanceof SimulatedKickoffCrash) {
      simulatedCrash = true;
      throw new KickoffError("KICKOFF-SIMULATED-CRASH", `simulated crash at ${error.message}`, {
        committed: wroteTargets ? null : false,
      });
    }
    cleanupCreatedDirectories = true;
    if (!rollbackAuthorized) throw error;
    let rollbackFailed = false;
    for (const key of ["state", "history", "handover", "spec", "prd"]) {
      try {
        unlinkOwned(publishedRecords[key]);
        unlinkOwned(temporaryRecords[key]);
      } catch {
        rollbackFailed = true;
      }
    }
    if (rollbackFailed) {
      fail("KICKOFF-ROLLBACK-INDETERMINATE", "kickoff rollback disposition is indeterminate", {
        committed: wroteTargets ? null : false,
      });
    }
    if (error instanceof KickoffError || /^KICKOFF-/u.test(error?.code ?? "")) throw error;
    fail("KICKOFF-WRITE-FAILED", "kickoff transaction failed before commit");
  } finally {
    if (!simulatedCrash && privateLock && !releaseLock(privateLock)) {
      // A retained lock fails the next writer closed. Never report it as a
      // successful unlock or steal it under a different plan.
    }
    if (!simulatedCrash && !releaseLock(stateLock)) {
      // Same fail-closed disposition as the private lock.
    }
    if (!simulatedCrash && cleanupCreatedDirectories) {
      rollbackCreatedDirectories([...createdPrivateDirectories, ...createdProjectDirectories]);
    }
  }
}

/**
 * Apply the public/private promotion under the same continuity locks as
 * kickoff. Publication order is history, private cleanup binding, then State:
 * a crash can only leave a recoverable prefix, never an un-audited identity.
 */
export function applyOnboardingKickoffPromotion({
  plan,
  expectedPlanSha256,
  activate = false,
  deps = {},
} = {}) {
  if (activate !== true) fail("KICKOFF-PROMOTION-ACTIVATION-REQUIRED", "promotion apply requires explicit activation");
  if (!SHA256_RE.test(expectedPlanSha256 ?? "") || plan?.planSha256 !== expectedPlanSha256) {
    fail("KICKOFF-PROMOTION-PLAN-DIGEST", "promotion plan digest does not match");
  }
  const bytes = validatePromotionPlan(plan);
  const privatePaths = resolvePrivate(plan.root, plan.repositoryCapability, {
    create: false, spawn: deps.spawn ?? defaultGitSpawn,
  });
  const paths = {
    state: absoluteProjectPath(plan.root, plan.targets.state.path, "Pipeline machine state"),
    history: join(privatePaths.directory, HISTORY_BASENAME),
    ...(plan.targets.cleanupBinding === undefined ? {} : {
      cleanupBinding: join(privatePaths.directory, SESSION_CLEANUP_BINDING_BASENAME),
    }),
  };
  const token = `kickoff-promotion-${plan.planSha256.slice(0, 32)}`;
  const lockOptions = { nowMs: deps.nowMs ?? Date.now, lockStaleMs: deps.lockStaleMs ?? 30_000 };
  const stateLock = acquireLock(`${paths.state}.lock`, "pipeline.continuity-lock.v0", token, lockOptions);
  let privateLock;
  let simulatedCrash = false;
  try {
    privateLock = acquireLock(join(privatePaths.directory, ".kickoff-writer.lock"), "pipeline.codex-onboarding-kickoff-lock.v1", token, lockOptions);
    const state = currentTarget(paths.state, plan.targets.state.afterSha256);
    const history = currentTarget(paths.history, plan.targets.history.afterSha256);
    const cleanupBinding = plan.targets.cleanupBinding === undefined
      ? { status: "exact" }
      : currentTarget(paths.cleanupBinding, plan.targets.cleanupBinding.afterSha256);
    if (state.status === "exact" && history.status === "exact" && cleanupBinding.status === "exact") {
      return promotionResult(plan, "replayed", false, deps.spawn ?? defaultGitSpawn);
    }
    const stateBefore = currentTarget(paths.state, plan.targets.state.beforeSha256);
    const historyBefore = currentTarget(paths.history, plan.targets.history.beforeSha256);
    const cleanupBindingBefore = plan.targets.cleanupBinding === undefined
      ? { status: "exact" }
      : currentTarget(paths.cleanupBinding, plan.targets.cleanupBinding.beforeSha256);
    const exactPreimage = stateBefore.status === "exact" && historyBefore.status === "exact"
      && cleanupBindingBefore.status === "exact";
    const recoverPrefix = stateBefore.status === "exact" && history.status === "exact"
      && (cleanupBinding.status === "exact" || cleanupBindingBefore.status === "exact")
      && stateLock.recovered === true && privateLock.recovered === true;
    if (!exactPreimage && !recoverPrefix) {
      fail("KICKOFF-PROMOTION-CAS-DRIFT", "promotion target preimage drifted");
    }
    if (exactPreimage) {
      const observed = observeDetailed({ rootDir: plan.root, repositoryCapability: plan.repositoryCapability, spawn: deps.spawn ?? defaultGitSpawn });
      const seed = recognisedKickoff(observed, deps.spawn ?? defaultGitSpawn);
      if (seed === null) fail("KICKOFF-PROMOTION-CAS-DRIFT", "promotion kickoff seed drifted");
    }
    const authority = promotionArtifacts(plan.root, {
      profile: plan.profile, featureId: plan.feature.id, planPath: plan.feature.planPath,
      prdPath: plan.authority.prd.path, specPath: plan.authority.spec.path,
    });
    if (authority.prd.sha256 !== plan.authority.prd.sha256 || authority.spec.sha256 !== plan.authority.spec.sha256) {
      fail("KICKOFF-PROMOTION-CAS-DRIFT", "promotion authority bytes drifted");
    }
    const suffix = (deps.randomUUID ?? randomUUID)().replaceAll("-", "");
    if (!/^[a-f0-9]{32,64}$/iu.test(suffix)) fail("KICKOFF-PROMOTION-RANDOM-UNAVAILABLE", "promotion temporary-name source is invalid");
    if (historyBefore.status === "exact") {
      const temp = join(dirname(paths.history), `.${HISTORY_BASENAME}.promotion-${suffix}.tmp`);
      writeExclusiveSynced(temp, bytes.historyBytes, 0o600);
      renameSync(temp, paths.history);
      fsyncDirectory(dirname(paths.history));
      if (deps.crashAt === "promotion-history-published") {
        simulatedCrash = true;
        throw new SimulatedKickoffCrash("promotion-history-published");
      }
    }
    if (plan.targets.cleanupBinding !== undefined && cleanupBindingBefore.status === "exact") {
      const observedBinding = readPrivateCleanupBinding(plan.root, { spawn: deps.spawn ?? defaultGitSpawn });
      const nextBindingBytes = promotedPrivateCleanupBinding(observedBinding, plan.feature.id);
      if (sha256(nextBindingBytes) !== plan.targets.cleanupBinding.afterSha256) {
        fail("KICKOFF-PROMOTION-CAS-DRIFT", "private cleanup binding postimage drifted");
      }
      replacePromotedPrivateCleanupBinding(plan.root, observedBinding, plan.targets.cleanupBinding.beforeSha256, nextBindingBytes, {
        spawn: deps.spawn ?? defaultGitSpawn,
        suffix,
      });
      if (deps.crashAt === "promotion-cleanup-binding-published") {
        simulatedCrash = true;
        throw new SimulatedKickoffCrash("promotion-cleanup-binding-published");
      }
    }
    const stateTemp = join(dirname(paths.state), `.${basename(paths.state)}.promotion-${suffix}.tmp`);
    writeExclusiveSynced(stateTemp, bytes.stateBytes, 0o600);
    renameSync(stateTemp, paths.state);
    fsyncDirectory(dirname(paths.state));
    if (deps.crashAt === "promotion-state-published") {
      simulatedCrash = true;
      throw new SimulatedKickoffCrash("promotion-state-published");
    }
    return promotionResult(plan, "applied", true, deps.spawn ?? defaultGitSpawn);
  } finally {
    if (!simulatedCrash && privateLock) releaseLock(privateLock);
    if (!simulatedCrash) releaseLock(stateLock);
  }
}

function kickoffPromotionCleanupRecoveryPlanCore(observed, binding, sessionCleanupScript) {
  const state = observed.state;
  const entry = observed.history?.transactions?.at(-1);
  if (observed.continuity.status !== "valid" || observed.stateRelativePath !== NEUTRAL_STATE || binding.binding === null
    || entry?.kind !== "kickoff-promotion" || entry.cleanupBinding !== undefined
    || observed.history.transactions.length !== 2 || state?.continuity?.revision !== 2
    || state.activeFeature?.id !== entry.featureId || state.activeFeature?.planPath !== entry.planPath
    || state.continuity.featureId !== entry.featureId || state.continuity.authority.result !== null
    || state.continuity.authority.prd?.sha256 !== entry.prdSha256
    || state.continuity.authority.spec?.sha256 !== entry.specSha256
    || entry.afterStateSha256 !== observed.stateObservation.sha256
    || !isObject(binding.binding.sessionCleanup)) return null;
  let beforeSha256;
  let afterSha256;
  if (binding.binding.featureId === entry.kickoffFeatureId) {
    beforeSha256 = binding.sha256;
    afterSha256 = sha256(promotedPrivateCleanupBinding(binding, entry.featureId));
  } else if (binding.binding.featureId === entry.featureId) {
    beforeSha256 = sha256(promotedPrivateCleanupBinding(binding, entry.kickoffFeatureId));
    afterSha256 = binding.sha256;
  } else return null;
  return {
    schema: KICKOFF_PROMOTION_CLEANUP_RECOVERY_PLAN_SCHEMA,
    root: observed.root,
    stateSha256: observed.stateObservation.sha256,
    historySha256: observed.historyObservation.sha256,
    revision: state.continuity.revision,
    feature: { from: entry.kickoffFeatureId, to: entry.featureId },
    binding: { beforeSha256, afterSha256 },
    sessionCleanupScript,
  };
}

function kickoffPromotionCleanupRecoveryAction(sessionCleanupScript, root, planSha256) {
  return {
    kind: "command",
    executable: "node",
    argv: [sessionCleanupScript, "apply-recovery", "--repo", root, "--plan-sha256", planSha256, "--activate"],
    mutation: true,
    requiresConfirmation: true,
    executionBoundary: "host-authorized-wsl",
    expected: { schema: KICKOFF_PROMOTION_CLEANUP_RECOVERY_APPLY_SCHEMA, statuses: ["applied", "replayed"] },
  };
}

export function planOnboardingKickoffPromotionCleanupRecovery({
  rootDir,
  sessionCleanupScript = DEFAULT_SESSION_CLEANUP_SCRIPT,
  spawn = defaultGitSpawn,
} = {}) {
  if (!isAbsolute(sessionCleanupScript)) fail("KICKOFF-PROMOTION-CLEANUP-RECOVERY", "cleanup recovery script must be absolute");
  const observed = observeDetailed({ rootDir, repositoryCapability: "local", spawn });
  const binding = readPrivateCleanupBinding(observed.root, { spawn });
  const core = kickoffPromotionCleanupRecoveryPlanCore(observed, binding, sessionCleanupScript);
  const featureMismatch = binding.binding !== null && observed.stateRelativePath === NEUTRAL_STATE
    && isObject(observed.state?.activeFeature) && isObject(observed.state?.continuity)
    && binding.binding.featureId !== observed.state.activeFeature.id;
  if (core === null) return {
    schema: KICKOFF_PROMOTION_CLEANUP_RECOVERY_PLAN_SCHEMA,
    status: featureMismatch
      ? "recovery-unavailable"
      : "not-applicable",
  };
  const planSha256 = canonicalSha256(core);
  return {
    ...core,
    status: "ready",
    planSha256,
    applyAction: kickoffPromotionCleanupRecoveryAction(sessionCleanupScript, observed.root, planSha256),
  };
}

export function applyOnboardingKickoffPromotionCleanupRecovery({
  rootDir,
  expectedPlanSha256,
  activate = false,
  sessionCleanupScript = DEFAULT_SESSION_CLEANUP_SCRIPT,
  deps = {},
} = {}) {
  if (activate !== true) fail("KICKOFF-PROMOTION-CLEANUP-RECOVERY", "cleanup recovery requires explicit activation");
  if (!SHA256_RE.test(expectedPlanSha256 ?? "")) fail("KICKOFF-PROMOTION-CLEANUP-RECOVERY", "cleanup recovery plan digest is invalid");
  const spawn = deps.spawn ?? defaultGitSpawn;
  const initial = planOnboardingKickoffPromotionCleanupRecovery({ rootDir, sessionCleanupScript, spawn });
  if (initial.status !== "ready" || initial.planSha256 !== expectedPlanSha256) {
    fail("KICKOFF-PROMOTION-CLEANUP-RECOVERY", "cleanup recovery preimage changed");
  }
  const privatePaths = resolvePrivate(initial.root, "local", { create: false, spawn });
  const lockOptions = { nowMs: deps.nowMs ?? Date.now, lockStaleMs: deps.lockStaleMs ?? 30_000 };
  const stateLock = acquireLock(
    `${absoluteProjectPath(initial.root, authorityPaths(initial.root).state, "Pipeline machine state")}.lock`,
    "pipeline.continuity-lock.v0",
    `kickoff-promotion-cleanup-recovery-${expectedPlanSha256.slice(0, 24)}`,
    lockOptions,
  );
  let privateLock;
  let simulatedCrash = false;
  try {
    privateLock = acquireLock(
      join(privatePaths.directory, ".kickoff-writer.lock"),
      "pipeline.codex-onboarding-kickoff-lock.v1",
      `kickoff-promotion-cleanup-recovery-${expectedPlanSha256.slice(0, 24)}`,
      lockOptions,
    );
    const current = planOnboardingKickoffPromotionCleanupRecovery({ rootDir: initial.root, sessionCleanupScript, spawn });
    if (current.status === "ready" && current.planSha256 === expectedPlanSha256) {
      const binding = readPrivateCleanupBinding(initial.root, { spawn });
      if (binding.binding !== null && binding.binding.featureId === current.feature.to
        && binding.sha256 === current.binding.afterSha256) {
        return {
          schema: KICKOFF_PROMOTION_CLEANUP_RECOVERY_APPLY_SCHEMA,
          status: "replayed",
          root: initial.root,
          planSha256: expectedPlanSha256,
          stateSha256: current.stateSha256,
          revision: current.revision,
          mutated: false,
        };
      }
      const afterBytes = promotedPrivateCleanupBinding(binding, current.feature.to);
      replacePromotedPrivateCleanupBinding(initial.root, binding, current.binding.beforeSha256, afterBytes, {
        spawn,
        suffix: (deps.randomUUID ?? randomUUID)().replaceAll("-", ""),
      });
      if (deps.crashAt === "kickoff-promotion-cleanup-recovery-binding-published") {
        simulatedCrash = true;
        throw new SimulatedKickoffCrash("kickoff-promotion-cleanup-recovery-binding-published");
      }
      const readback = readOnboardingSessionCleanupBinding({ rootDir: initial.root, spawn });
      if (readback.status !== "bound" || readback.stateSha256 !== current.stateSha256
        || readback.revision !== current.revision) {
        fail("KICKOFF-PROMOTION-CLEANUP-READBACK", "cleanup recovery readback is invalid", { committed: true });
      }
      return {
        schema: KICKOFF_PROMOTION_CLEANUP_RECOVERY_APPLY_SCHEMA,
        status: "applied",
        root: initial.root,
        planSha256: expectedPlanSha256,
        stateSha256: current.stateSha256,
        revision: current.revision,
        mutated: true,
      };
    }
    const observed = observeDetailed({ rootDir: initial.root, repositoryCapability: "local", spawn });
    const binding = readPrivateCleanupBinding(observed.root, { spawn });
    if (observed.continuity.status !== "valid" || observed.stateObservation.sha256 !== initial.stateSha256
      || observed.historyObservation.sha256 !== initial.historySha256 || binding.binding === null
      || binding.binding.featureId !== initial.feature.to || binding.sha256 !== initial.binding.afterSha256) {
      fail("KICKOFF-PROMOTION-CLEANUP-RECOVERY", "cleanup recovery postimage is invalid");
    }
    return {
      schema: KICKOFF_PROMOTION_CLEANUP_RECOVERY_APPLY_SCHEMA,
      status: "replayed",
      root: initial.root,
      planSha256: expectedPlanSha256,
      stateSha256: initial.stateSha256,
      revision: initial.revision,
      mutated: false,
    };
  } finally {
    if (!simulatedCrash && privateLock) releaseLock(privateLock);
    if (!simulatedCrash) releaseLock(stateLock);
  }
}
