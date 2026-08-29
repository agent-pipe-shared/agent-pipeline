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
import { assessWindowsPrivatePath } from "./windows-private-state.mjs";
import { readState as readSanctionedState } from "../scripts/continuity-status.mjs";
import {
  LEGACY_CALIBRATION,
  LEGACY_MANIFEST,
  LEGACY_STATE,
  NEUTRAL_CALIBRATION,
  NEUTRAL_MANIFEST,
  NEUTRAL_STATE,
  resolveProjectAuthorityPaths,
  validatePortablePipelineState,
} from "./project-authority.mjs";
import {
  PRD_ACKNOWLEDGEMENT_MARKER,
  PRD_LANGUAGE_MARKER,
  TECHNICAL_SPEC_MARKER,
  poGateProfileProjectionPaths,
  resolvePoGateRepositoryTopology,
  validatePoGateLanguageProjection,
} from "./po-gate-authority.mjs";
import { initializePoGateProfileReceipt } from "./po-gate-profile-publisher.mjs";
import {
  inspectSessionClosure,
  listActiveSessionDescriptors,
  loadSessionDescriptor,
} from "./worktree-lifecycle.mjs";
import { derivePlanLifecycle } from "./plan-spec-state-v2.mjs";

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
const HISTORY_BASENAME = "continuity-history.json";
const SESSION_CLEANUP_BINDING_BASENAME = "session-cleanup-binding.json";
const SESSION_CLEANUP_KEY_BASENAME = "session-cleanup-binding.key";
const SESSION_CLEANUP_RELEASE_RECEIPT_BASENAME = "session-cleanup-release-receipt.json";
const SESSION_CLEANUP_PRIVATIZATION_AUDIT_BASENAME = "session-cleanup-privatization-audit";
const SESSION_CLEANUP_PRIVATIZATION_CONFIRMATION_BASENAME = "session-cleanup-privatization-confirmation";
const SHA256_RE = /^[a-f0-9]{64}$/u;
// NVA-H-LASTBUILDERS: same `applyAction`/`nextAction` sibling convention as
// `PROMOTION_PLAN_KEYS` above and `intakeGenerateApplyAction` below -- the
// generic guided driver reads ONLY `nextAction`, never `applyAction`, so a
// goal-bound kickoff plan that carries a real apply command under the wrong
// name still stalls the driver dead. `nextAction` is attached AFTER
// `planSha256` is computed and is deliberately NOT part of `planBinding()`,
// so publishing it changes no plan digest.
const PLAN_KEYS = new Set([
  "schema", "root", "repositoryCapability", "goal", "goalSha256", "language", "calibration",
  "targets", "transactionSha256", "onboardingScript", "runner", "planSha256", "applyAction",
  "nextAction",
]);
const TARGET_KEYS = {
  state: new Set(["path", "beforeSha256", "afterSha256", "value"]),
  handover: new Set(["path", "beforeSha256", "afterSha256", "content"]),
  prd: new Set(["path", "beforeSha256", "afterSha256", "content"]),
  spec: new Set(["path", "beforeSha256", "afterSha256", "content"]),
  history: new Set(["path", "beforeSha256", "afterSha256", "value"]),
};
// NVA-F-PROMOTIONACTION: same `applyAction`/`nextAction` sibling convention as
// `intakeGenerateApplyAction` below (NVA-D-PLANACTION) -- the generic guided
// driver reads ONLY `nextAction`, never `applyAction`, so a promotion plan
// that carries a real apply command under the wrong name still stalls the
// driver dead. `nextAction` is attached AFTER `planSha256` is computed and is
// deliberately NOT part of `promotionBinding()`, so publishing it changes no
// plan digest.
const PROMOTION_PLAN_KEYS = new Set([
  "schema", "root", "repositoryCapability", "profile", "feature", "authority",
  "kickoff", "targets", "transactionSha256", "onboardingScript", "runner", "planSha256", "applyAction",
  "nextAction",
]);
const PROMOTION_TARGET_KEYS = {
  state: new Set(["path", "beforeSha256", "afterSha256", "value"]),
  history: new Set(["path", "beforeSha256", "afterSha256", "value"]),
  // Same shape as the kickoff's own handover target, deliberately: the kickoff
  // writes this file and the promotion supersedes everything it names, so the
  // transaction that supersedes it owns updating it. Before 2026-08-09 nothing
  // did -- `onboarding-continuity.mjs` is the only writer of that path in the
  // whole plugin, and the promotion had no handover target, so both of the PO's
  // greenfield repositories ended with a canonical handover describing the
  // provisional kickoff feature whose own directory the same transaction had
  // marked SUPERSEDED.md. The bootstrap reads that file first and treats it as
  // canonical for "where am I", so a resuming session was pointed at a
  // superseded anchor by the artifact that exists to prevent exactly that.
  handover: new Set(["path", "beforeSha256", "afterSha256", "content"]),
  cleanupBinding: new Set(["beforeSha256", "afterSha256"]),
};
const PROMOTION_PROFILES = new Set(["epic", "feature", "mini"]);
const SAFE_FEATURE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
// Downstream at push/signing time (`po-human-approval.mjs`, and every
// approval/proof intent builder that takes a featureId: `po-approval-proof.mjs`,
// `critical-action-approval-request.mjs`, `threat-model-approval-request.mjs`,
// `security-authority-proof.mjs`) a feature id is re-validated against this
// exact, strictly narrower shape. `SAFE_FEATURE_ID` above is permissive
// (uppercase, `.`, `_`, `:`, up to 128 chars) and stays that way for its other
// call sites; a feature id fixed at promotion time that satisfies only the
// permissive shape can still be rejected hours later at a push ceremony. This
// additional check catches that at the one point the id is still choosable.
const PROMOTION_FEATURE_ID_DOWNSTREAM = /^[a-z][a-z0-9-]{0,63}$/u;
// The approval subject is the PRD.  `activeFeature.planPath` is what the PO
// plan gate reads, and that gate accepts exactly one shape: a `prd_*.md` whose
// neighbouring `spec.md` it binds by digest.  Promotion therefore enforces the
// same two basenames, so a wrong document is refused where the operator can
// still act on it instead of two steps later at an unreachable gate.
const PROMOTION_PRD_BASENAME = /^prd_[^/\\]+\.md$/u;
const PROMOTION_SPEC_BASENAME = "spec.md";
const PROMOTION_DESIGN_INPUT_BASENAME = "design-input.md";
// The provisional kickoff PRD and Spec are not removed at promotion: they are
// named superseded.  See publishKickoffSupersession for why annotation is the
// only retirement this transaction can offer without weakening it.
const KICKOFF_SUPERSESSION_BASENAME = "SUPERSEDED.md";

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

function validDiscardedFeatureEntry(root, entry) {
  const expectedKeys = new Set(["id", "planPath", "phaseAtDiscard", "discardedAt", "discardedBy", "reason", "forCommit"]);
  if (!exactKeys(entry, expectedKeys)
    || typeof entry.id !== "string" || entry.id.length === 0
    || typeof entry.planPath !== "string" || entry.planPath.length === 0
    || !(entry.phaseAtDiscard === null || typeof entry.phaseAtDiscard === "string")
    || !canonicalIsoTimestamp(entry.discardedAt)
    || typeof entry.discardedBy !== "string" || entry.discardedBy.length === 0
    || typeof entry.reason !== "string" || entry.reason.length === 0
    || !(entry.forCommit === null || /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(entry.forCommit))) return false;
  try { safeRelativePath(entry.planPath, "discarded feature plan"); } catch { return false; }
  return true;
}

// `discard-feature` (pipeline-state.mjs:5516) deliberately never writes to
// `closedFeatures` -- a discard is an honest record of abandonment, not a
// manufactured closure -- so this is a sibling of validClosedTransitionState,
// not a replacement for it. A project may carry BOTH arrays (one feature
// closed, a later one discarded, or the reverse): validity is decided by
// timestamp, not by which array happens to exist -- the last entry of
// whichever array carries `updatedAt` must be well-formed, and every entry of
// BOTH arrays must be individually well-formed.
function validDiscardedTransitionState(root, state) {
  if (!isObject(state)
    || state.schema !== "pipeline.state.v0"
    || state.activeFeature !== undefined
    || state.continuity !== undefined
    || state.planApproval !== undefined
    || state.planRevocation !== undefined
    || state.planApproved !== false
    || !canonicalIsoTimestamp(state.updatedAt)
    || !Array.isArray(state.discardedFeatures)
    || state.discardedFeatures.length === 0
    || !state.discardedFeatures.every((entry) => validDiscardedFeatureEntry(root, entry))
    || state.discardedFeatures.at(-1).discardedAt !== state.updatedAt) return false;
  if (state.closedFeatures !== undefined
    && (!Array.isArray(state.closedFeatures)
      || !state.closedFeatures.every((entry) => validClosedFeatureEntry(root, entry)))) return false;
  return true;
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

/**
 * Has the LIFECYCLE ITSELF sanctioned an edit to this feature's promoted design
 * package? `reopen-design` exists for exactly that, and records `planInvalidation`
 * when it does (`plan-spec-state-v2.mjs`); that record is durable across the
 * `submit-plan`/`approve-plan` that follow, so a package edited once stays
 * recognisable as edited-by-permission for the rest of the feature's life.
 *
 * Read narrowly and fail CLOSED: anything unreadable, unparseable, or not carrying
 * a plain `planInvalidation` object answers "no", which leaves the mutual promotion
 * binding below enforcing exactly as it did before. This is a read of a marker,
 * never a validation -- `validPlanInvalidation` in the state module owns that, and
 * duplicating it here would be a second source of truth for what an invalidation is.
 */
function promotedDesignReopened(stateObservation) {
  if (stateObservation?.status !== "present") return false;
  try {
    const state = JSON.parse(stateObservation.raw.toString("utf8"));
    return isObject(state) && isObject(state.planInvalidation);
  } catch {
    return false;
  }
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
  const promotionEvidenceEntryKeys = new Set([
    ...promotionEntryKeys, "designInputPath", "designInputSha256",
  ]);
  // `specPath` is the second half of the PRD/Spec pair.  It is optional on the
  // record so promotions written before the pair existed stay readable; new
  // promotions always carry it (validatePromotionPlan requires it).
  // `handover` is optional on the same terms and for the same reason as
  // `cleanupBinding`: a promotion written before that target existed carries no
  // handover record, and it stays readable. New promotions always carry it.
  const promotionEntryKeySets = [promotionEntryKeys, promotionEvidenceEntryKeys]
    .flatMap((base) => [base, new Set([...base, "specPath"])])
    .flatMap((base) => [base, new Set([...base, "cleanupBinding"])])
    .flatMap((base) => [base, new Set([...base, "handover"])]);
  const safePath = (value) => {
    try { safeRelativePath(value, "promotion authority"); return true; } catch { return false; }
  };
  const validKickoff = (entry) => exactKeys(entry, kickoffEntryKeys)
    && entry.kind === "kickoff"
    && [
      "transactionSha256", "goalSha256", "calibrationSha256", "stateSha256",
      "handoverSha256", "prdSha256", "specSha256",
    ].every((key) => SHA256_RE.test(entry[key]));
  const validPromotion = (entry, previous) => promotionEntryKeySets.some((keys) => exactKeys(entry, keys))
    && entry.kind === "kickoff-promotion"
    && SHA256_RE.test(entry.transactionSha256)
    && entry.previousTransactionSha256 === previous?.transactionSha256
    && PROMOTION_PROFILES.has(entry.profile)
    && /^kickoff-[a-f0-9]{16}$/u.test(entry.kickoffFeatureId)
    && SAFE_FEATURE_ID.test(entry.featureId)
    && typeof entry.planPath === "string"
    && ["prdSha256", "specSha256", "beforeStateSha256", "afterStateSha256"]
      .every((key) => SHA256_RE.test(entry[key]))
    && (entry.specPath === undefined || (typeof entry.specPath === "string"
      && entry.specPath !== entry.planPath && safePath(entry.planPath) && safePath(entry.specPath)))
    && (entry.designInputPath === undefined || (typeof entry.designInputPath === "string"
      && SHA256_RE.test(entry.designInputSha256)
      && (() => { try { safeRelativePath(entry.designInputPath, "promotion design input"); return true; } catch { return false; } })()))
    && (entry.cleanupBinding === undefined || (exactKeys(entry.cleanupBinding, new Set(["beforeSha256", "afterSha256"]))
      && SHA256_RE.test(entry.cleanupBinding.beforeSha256) && SHA256_RE.test(entry.cleanupBinding.afterSha256)))
    // `beforeSha256` admits null: an absent handover is a legitimate preimage for a
    // project whose calibration names a file the kickoff never wrote.
    && (entry.handover === undefined || (exactKeys(entry.handover, new Set(["path", "beforeSha256", "afterSha256"]))
      && typeof entry.handover.path === "string" && safePath(entry.handover.path)
      && (entry.handover.beforeSha256 === null || SHA256_RE.test(entry.handover.beforeSha256))
      && SHA256_RE.test(entry.handover.afterSha256)));
  // Wave 4 onboarding coordinator, step 5 (specs/wave4-onboarding-coordinator/design.md
  // SSc.3/SSa.5 point 5, NVA-W5-COORD-STEP5-1). A coordinator-sourced binding has no
  // kickoff predecessor by construction (SS0): the private history it writes has exactly
  // ONE entry, of a NEW kind ("bootstrap-binding") that carries what a "kickoff-promotion"
  // entry carries minus the fields that name a predecessor (`previousTransactionSha256`,
  // `kickoffFeatureId`, `beforeStateSha256`). `specPath`/`designInputPath`/`handover` are
  // NOT optional here (unlike the promotion-entry shape's legacy-replay allowances): every
  // coordinator-sourced binding this module ever writes carries all three, so the keyset is
  // closed rather than combinatorial.
  const bootstrapBindingEntryKeys = new Set([
    "kind", "transactionSha256", "profile", "featureId", "planPath", "specPath",
    "prdSha256", "specSha256", "designInputPath", "designInputSha256", "afterStateSha256", "handover",
  ]);
  const validBootstrapBinding = (entry) => exactKeys(entry, bootstrapBindingEntryKeys)
    && entry.kind === "bootstrap-binding"
    && SHA256_RE.test(entry.transactionSha256)
    && PROMOTION_PROFILES.has(entry.profile)
    && SAFE_FEATURE_ID.test(entry.featureId)
    && typeof entry.planPath === "string" && typeof entry.specPath === "string"
    && entry.specPath !== entry.planPath && safePath(entry.planPath) && safePath(entry.specPath)
    && ["prdSha256", "specSha256", "designInputSha256", "afterStateSha256"].every((key) => SHA256_RE.test(entry[key]))
    && typeof entry.designInputPath === "string"
    && (() => { try { safeRelativePath(entry.designInputPath, "promotion design input"); return true; } catch { return false; } })()
    && exactKeys(entry.handover, new Set(["path", "beforeSha256", "afterSha256"]))
    && typeof entry.handover.path === "string" && safePath(entry.handover.path)
    // Unlike the promotion-entry shape, `beforeSha256` is NEVER a real digest here: the
    // absent-pristine precondition (SSc.3) means the configured handover cannot already exist.
    && entry.handover.beforeSha256 === null
    && SHA256_RE.test(entry.handover.afterSha256);
  if (!exactKeys(value, new Set(["schema", "transactions"]))
    || value.schema !== KICKOFF_HISTORY_SCHEMA
    || !Array.isArray(value.transactions)
    || value.transactions.length < 1
    || !(validKickoff(value.transactions[0])
      || (value.transactions.length === 1 && validBootstrapBinding(value.transactions[0])))
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
  platform = process.platform,
  assessWindowsPrivate = assessWindowsPrivatePath,
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
    // Dual-shape `calibration.handover`, matching `handover-rotation.mjs`'s
    // `resolveHandoverConfig()`: a plain string names the path directly
    // (predating ADR-0066); an ADR-0066 Decision 5 `{ path, maxBytes }` object
    // names it via `.path` (`maxBytes` is not read here -- this call site only
    // ever needed the path). Anything else (including an object without a
    // usable `.path`) still reaches `safeRelativePath()` and fails closed with
    // `KICKOFF-PATH-UNSAFE`, same as before this fix.
    const handoverValue = calibration.handover;
    const handoverPathCandidate = handoverValue
      && typeof handoverValue === "object"
      && !Array.isArray(handoverValue)
      ? handoverValue.path
      : handoverValue;
    const handoverPath = handoverValue === undefined
      ? "docs/state.md"
      : safeRelativePath(handoverPathCandidate, "configured handover");
    if ([selectedPaths.calibration, selectedPaths.state].includes(handoverPath)
      || handoverPath === ".git" || handoverPath.startsWith(".git/")) {
      fail("KICKOFF-PATH-UNSAFE", "configured handover collides with a control path");
    }

    stateObservation = observeOptionalProjectFile(root, selectedPaths.state, "Pipeline machine state");
    handoverObservation = observeOptionalProjectFile(root, handoverPath, "configured handover");
    // Fresh host-managed projects intentionally seed only project authority.
    // Before runtime activation there is no `.claude` private-state parent
    // from which to observe a history, but absent State and handover already
    // prove the only safe classification: pristine and awaiting kickoff.
    // Do not generalize this to an existing or malformed private directory.
    if (repositoryCapability === "host-managed"
      && stateObservation.status === "absent"
      && handoverObservation.status === "absent"
      && !existsSync(join(root, ".claude"))) {
      return {
        continuity: {
          status: "absent-pristine",
          stateSha256: stateObservation.sha256,
          handoverSha256: handoverObservation.sha256,
          historySha256: null,
        },
        root,
        repositoryCapability,
        calibration,
        calibrationSha256: calibrationObservation.sha256,
        handoverPath,
        stateObservation,
        handoverObservation,
        historyObservation: { status: "absent", sha256: null },
        history: null,
        privatePaths: null,
      };
    }
    const privatePaths = resolvePrivate(root, repositoryCapability, { spawn });
    if (existsSync(privatePaths.directory)) {
      // Node synthesizes `.mode` on native Windows from the read-only attribute
      // alone (group/other bits mirror the owner bits), so an exact-0700
      // comparison is meaningless there and fails closed unconditionally,
      // regardless of the directory's real security. On win32 this defers to
      // the shared native DACL/owner/reparse-point assurance instead, mirroring
      // afk-ledger.mjs:336-340.
      const directorySecure = platform === "win32"
        ? assessWindowsPrivate(privatePaths.directory).status === "secure"
        : (lstatSync(privatePaths.directory).mode & 0o777) === 0o700;
      if (!directorySecure) fail("KICKOFF-PRIVATE-UNAVAILABLE", "private onboarding state directory is not mode 0700");
    }
    const historyPath = join(privatePaths.directory, HISTORY_BASENAME);
    historyObservation = observeOptionalAbsoluteFile(historyPath, "private continuity history");

    let history = null;
    if (historyObservation.status === "present") {
      const historySecure = platform === "win32"
        ? assessWindowsPrivate(historyPath).status === "secure"
        : (lstatSync(historyPath).mode & 0o777) === 0o600;
      if (!historySecure) fail("KICKOFF-PRIVATE-UNAVAILABLE", "private continuity history is not mode 0600");
      history = parseJsonObject(historyObservation, "private continuity history");
      validateHistory(history);
      // THE BINDING BELOW IS A RECORD OF A TRANSACTION, NOT A LIVE AUTHORITY, once
      // the lifecycle has released the documents for editing. `reopen-design`
      // exists to make a submitted plan workable again; the agent then edits
      // `spec.md`, which is the one action reopening the design exists to enable,
      // and until 2026-08-09 that edit broke the mutual promotion digests, threw
      // KICKOFF-PROMOTION-AUTHORITY-DRIFT, and reached the caller as
      // `continuity: unavailable` with `nextAction: null` -- a session that could
      // not act, whose only recorded escape was putting the old bytes back (on a
      // greenfield repository with no commits, there is no `git restore` to do that
      // with). Observed live in the PO's 2026-08-09 happy-path run; filed as
      // `backlog/items/2026-08-09-reopen-design-invites-the-edit-that-ends-the-session.md`.
      //
      // The live binding for an edited package is `continuity.authority` plus
      // `planApproval.poGateAuthority`, both re-established by `submit-plan` /
      // `approve-plan` and both checked elsewhere. Enforcing the promotion record
      // forever conflates history with authority, and the conflation is what made
      // a sanctioned edit terminal. Every state the lifecycle has NOT released --
      // which is every state that never reopened its design -- keeps the check.
      const reopened = promotedDesignReopened(stateObservation);
      for (const entry of history.transactions.slice(1)) {
        if (entry.designInputPath !== undefined && !reopened) {
          const evidence = observeOptionalProjectFile(root, entry.designInputPath, "promotion design input");
          if (evidence.status !== "present" || evidence.sha256 !== entry.designInputSha256) {
            fail("KICKOFF-PROMOTION-EVIDENCE-DRIFT", "promotion design input does not match its bound evidence");
          }
        }
        // A promoted feature carries the PRD as its plan and the Spec beside
        // it, and the transaction names both digests.  The two are therefore
        // mutually bound: editing either document breaks the recorded pair,
        // exactly as editing the bound design input does.  Promotions written
        // before the pair existed carry no `specPath`; that older record is
        // read-only history and is left exactly as it was written.
        if (entry.specPath === undefined || reopened) continue;
        for (const [path, expected, label] of [
          [entry.planPath, entry.prdSha256, "promotion PRD"],
          [entry.specPath, entry.specSha256, "promotion specification"],
        ]) {
          const bound = observeOptionalProjectFile(root, path, label);
          if (bound.status !== "present" || bound.sha256 !== expected) {
            fail("KICKOFF-PROMOTION-AUTHORITY-DRIFT", `${label} does not match its mutual digest binding`);
          }
        }
      }
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
        calibrationRelativePath: selectedPaths.calibration,
        stateRelativePath: selectedPaths.state,
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
    } else if (projected.code === "CS-STATUS-INACTIVE"
      && (validClosedTransitionState(root, state) || validDiscardedTransitionState(root, state))) {
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

/**
 * Validate the operator's own claim -- never derived, only checked -- that a
 * mature project's absent `pipeline-state.json` belongs to feature `featureId`
 * whose approved PRD lives at `planPath`/`prdPath` (the two must agree; the same
 * invariant `promotionInput()` enforces for kickoff promotion, "the approval
 * subject is the PRD") and whose neighbouring specification lives at `specPath`.
 * This function performs shape checks only; existence and digest binding are the
 * caller's job (`repairArtifact()`, exactly as `establishedContinuity()` uses it).
 */
function validateOperatorContinuityAuthority(operatorAuthority) {
  if (!isObject(operatorAuthority)
    || !exactKeys(operatorAuthority, new Set(["featureId", "planPath", "prdPath", "specPath", "language"]))) {
    fail("CONTINUITY-REPAIR-OPERATOR-AUTHORITY-INVALID", "operator-confirmed authority is not a closed shape");
  }
  const { featureId, planPath, prdPath, specPath, language } = operatorAuthority;
  if (!SAFE_FEATURE_ID.test(featureId ?? "")) {
    fail("CONTINUITY-REPAIR-OPERATOR-AUTHORITY-INVALID", "operator-confirmed feature id is invalid");
  }
  if (!new Set(["de", "en"]).has(language)) {
    fail("CONTINUITY-REPAIR-OPERATOR-AUTHORITY-INVALID", "operator-confirmed human-facing language must be de or en");
  }
  for (const [value, label] of [[planPath, "plan"], [prdPath, "PRD"], [specPath, "specification"]]) {
    safeRelativePath(value, `operator-confirmed ${label}`);
  }
  if (planPath !== prdPath) {
    fail("CONTINUITY-REPAIR-OPERATOR-AUTHORITY-INVALID", "operator-confirmed plan path must be exactly the PRD path");
  }
  if (planPath === specPath) {
    fail("CONTINUITY-REPAIR-OPERATOR-AUTHORITY-INVALID", "operator-confirmed plan is the specification, but the approval subject is the PRD");
  }
  return { featureId, planPath, specPath, language };
}

/**
 * The third repair case: `pipeline-state.json` itself is absent (never the two
 * cases above, which both require a PRESENT, merely-inconsistent state), while
 * the project's configured handover is real -- the exact shape of a mature
 * project mid-migration to V4, or one whose state file was lost outside this
 * tool's own transactions. Nothing here is inferred from repository content:
 * every one of featureId/planPath/prdPath/specPath/language is the operator's
 * own claim, captured by the caller through the `collect-input` ask this
 * function's caller (`planOnboardingContinuityRepair`) surfaces when
 * `operatorAuthority` is not yet supplied. Once supplied, the claim is
 * independently checked -- shape here, existence and digest binding via
 * `repairArtifact()`, exactly as `establishedContinuity()` checks its own
 * PO-gate-authority claim -- and finally reproved by the same sanctioned
 * readback every other repair case above already runs itself through, via the
 * closing `validateContinuityState`/`projectReadContinuityStatus` pair, before
 * this proposal is ever returned as a `status: "ready"` plan.
 */
function operatorConfirmedContinuity(observed, operatorAuthority) {
  const input = validateOperatorContinuityAuthority(operatorAuthority);
  const prd = repairArtifact(observed.root, input.planPath, "operator-confirmed PRD");
  const spec = repairArtifact(observed.root, input.specPath, "operator-confirmed specification");
  const continuity = {
    schema: "pipeline.continuity.v0",
    featureId: input.featureId,
    revision: 0,
    runtime: {
      humanFacingLanguage: input.language,
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
  if (!validateContinuityState(continuity, input.featureId).ok) {
    fail("CONTINUITY-REPAIR-UNSUPPORTED", "operator-confirmed continuity adoption is invalid");
  }
  // Deliberately re-enters the design phase rather than claiming an existing
  // PO-approval this operator input never evidenced: `establishedContinuity()`
  // requires a `planApproval.poGateAuthority` record already present in the
  // (present) state it repairs, which by construction cannot exist here --
  // `pipeline-state.json` itself is absent. Asserting `planApproved: true`
  // without that evidence would be exactly the fabrication this repair case is
  // forbidden from committing, so the synthesized state mirrors a fresh
  // kickoff's own resting point (`phase: "design"`, `planApproved: false`)
  // instead, and leaves re-approval to submit-plan/approve-plan.
  const state = {
    schema: "pipeline.state.v0",
    activeFeature: {
      id: input.featureId,
      planPath: input.planPath,
      phase: "design",
    },
    planApproved: false,
    continuity,
  };
  const readback = projectReadContinuityStatus({ status: "ok", state });
  if (readback.code !== "CS-STATUS-ACTIVE" || readback.continuity.status !== "valid") {
    fail("CONTINUITY-REPAIR-UNSUPPORTED", "operator-confirmed state does not pass sanctioned readback");
  }
  return {
    reason: "adopt-operator-confirmed-authority",
    state,
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
 * Plan three bounded repairs:
 * - normalize the invalid resume-on-next-turn/active-turn pair;
 * - add continuity to an established pre-continuity state carrying PO authority; or
 * - adopt operator-confirmed authority for a mature project whose
 *   `pipeline-state.json` is absent while its configured handover is real. This
 *   third case is never resolved automatically: absent `operatorAuthority` yields
 *   `status: "operator-authority-required"` instead of a plan, so the caller can
 *   surface a `collect-input` ask rather than the flat "unsupported" dead end
 *   every other unrepairable shape still returns.
 *
 * Arbitrary malformed state, authority drift, and missing kickoff history are
 * never re-signed by this compatibility path.
 */
export function planOnboardingContinuityRepair({
  rootDir,
  repositoryCapability = "local",
  spawn = defaultGitSpawn,
  operatorAuthority = null,
} = {}) {
  let observed;
  try {
    observed = observeDetailed({ rootDir, repositoryCapability, spawn });
    if (observed.continuity.status !== "damaged" || observed.handoverObservation?.status !== "present") {
      return { schema: CONTINUITY_REPAIR_PLAN_SCHEMA, status: "unsupported" };
    }
    let proposed;
    if (observed.stateObservation?.status === "absent") {
      if (operatorAuthority === null) {
        return { schema: CONTINUITY_REPAIR_PLAN_SCHEMA, status: "operator-authority-required" };
      }
      proposed = operatorConfirmedContinuity(observed, operatorAuthority);
    } else if (observed.stateObservation?.status !== "present") {
      return { schema: CONTINUITY_REPAIR_PLAN_SCHEMA, status: "unsupported" };
    } else if (observed.projected?.code === "CS-STATUS-CONTINUITY-INVALID") {
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
  operatorAuthority = null,
  deps = {},
} = {}) {
  if (activate !== true) {
    fail("CONTINUITY-REPAIR-ACTIVATION-REQUIRED", "continuity repair requires explicit activation");
  }
  const spawn = deps.spawn ?? defaultGitSpawn;
  const plan = planOnboardingContinuityRepair({ rootDir, repositoryCapability, spawn, operatorAuthority });
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
    const current = planOnboardingContinuityRepair({ rootDir, repositoryCapability, spawn, operatorAuthority });
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
    // `beforeSha256 === null` means the plan itself was built over an ABSENT
    // state file (the operator-confirmed-authority case): `readPhysicalFile`
    // would throw ENOENT rather than fail with a typed CONTINUITY-REPAIR code,
    // so absence is checked directly instead of read-and-hashed. Every other
    // repair case still always carries a real preimage digest here, unchanged.
    if (plan.target.beforeSha256 === null) {
      if (existsSync(statePath)) {
        fail("CONTINUITY-REPAIR-CAS-DRIFT", "continuity repair state preimage changed");
      }
    } else if (sha256(readPhysicalFile(statePath, "Pipeline machine state")) !== plan.target.beforeSha256) {
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
    // BOTH transition shapes, exactly as the projection's own check at the
    // other call site already accepts both. A `discard-feature` deliberately
    // never writes to `closedFeatures` (pipeline-state.mjs, and the comment on
    // validDiscardedTransitionState), so a discard as the MOST RECENT
    // transaction leaves `closedFeatures.at(-1).closedAt` pointing at some
    // earlier close while `updatedAt` carries the discard's own timestamp --
    // an equality validClosedTransitionState can never satisfy. Accepting only
    // the closed shape here therefore made a perfectly ordinary discard an
    // unrecoverable dead end: SESSION-CLEANUP-STATE-MALFORMED, readiness
    // `partial`, and every pipeline script on that repository refused --
    // including the recovery the refusal itself named. Confirmed live in a
    // consumer project 2026-08-28 (incident report S56, B6); the fix belongs
    // here at the call site, not in validClosedTransitionState, whose
    // narrowness is deliberate and is relied on elsewhere.
    if (!validClosedTransitionState(observed.root, state) && !validDiscardedTransitionState(observed.root, state)) {
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
    // `?? []`: a repository whose only transition is a discard carries no
    // `closedFeatures` array at all (validDiscardedTransitionState admits its
    // absence), and there is nothing to derive a release proof from -- an
    // empty candidate set, not a crash.
    const candidates = (state.closedFeatures ?? [])
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

/**
 * Validate one explicit kickoff language answer. Mirrors `validateKickoffGoal`
 * below: an explicit, structurally-required kickoff input gets its own
 * validator rather than an inline enum check, so a caller that passes a
 * malformed value fails here instead of silently corrupting the PRD language
 * marker or `continuity.runtime.humanFacingLanguage`.
 */
export function validateKickoffLanguage(language) {
  if (!["de", "en"].includes(language)) {
    fail("KICKOFF-LANGUAGE-INVALID", "language must be de or en");
  }
  return language;
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

function initialAuthorityPaths(featureId) {
  const directory = `specs/${featureId}`;
  return {
    prd: `${directory}/prd_${featureId}.md`,
    spec: `${directory}/spec.md`,
  };
}

// Fallback only: `buildOnboardingKickoffPlan` now accepts an explicit
// `language` argument (threaded from `--language` at the CLI, enforced there
// exactly like `--goal`; backlog:
// language-selection-scope-is-unclear-and-arrives-too-late). This function is
// consulted only when no explicit value was supplied -- the historical
// pristine-kickoff derivation for internal/test callers that have not been
// updated to pass one. It is never reached from the live onboarding CLI path,
// which now refuses to omit `--language`.
function kickoffLanguage(root) {
  const userPath = join(root, "pipeline.user.yaml");
  // `project/` is the canonical runner-neutral authority.  The legacy
  // `.claude/` projection remains a compatibility input only when a neutral
  // runtime manifest is absent.  Do not ask resolveProjectAuthorityPaths here:
  // a pristine kickoff intentionally has no State yet, so that resolver is not
  // ready even when its manifest is the selected authority.
  const neutralRuntimePath = join(root, NEUTRAL_MANIFEST);
  const legacyRuntimePath = join(root, LEGACY_MANIFEST);
  let userBytes = null;
  let runtimeBytes = null;
  try { userBytes = readFileSync(userPath); } catch (error) {
    if (error?.code !== "ENOENT") fail("KICKOFF-PLAN-INVALID", "kickoff PO-language projection is unavailable");
  }
  try { runtimeBytes = readFileSync(neutralRuntimePath); } catch (error) {
    if (error?.code !== "ENOENT") fail("KICKOFF-PLAN-INVALID", "kickoff PO-language projection is unavailable");
  }
  if (runtimeBytes === null) {
    try { runtimeBytes = readFileSync(legacyRuntimePath); } catch (error) {
      if (error?.code !== "ENOENT") fail("KICKOFF-PLAN-INVALID", "kickoff PO-language projection is unavailable");
    }
  }
  // The standalone continuity planner is also used before a portable source
  // exists.  Without that source there is no configured PO language to
  // preserve, even if a neutral pre-runtime fixture already has a manifest, so
  // retain the historical canonical English seed.  Once the source exists,
  // however, it must agree with the selected runtime projection.
  if (userBytes === null) return "en";
  if (runtimeBytes === null) {
    fail("KICKOFF-PLAN-INVALID", "kickoff PO-language projection is unavailable");
  }
  let projection;
  try {
    projection = validatePoGateLanguageProjection(
      userBytes,
      runtimeBytes,
    );
  } catch {
    fail("KICKOFF-PLAN-INVALID", "kickoff PO-language projection is unavailable");
  }
  if (!projection.ok) fail("KICKOFF-PLAN-INVALID", "kickoff PO-language projection is invalid");
  return projection.humanFacing;
}

function initialPrdContent(goal, goalSha256, language, specSha256) {
  return [
    `<!-- po-language: ${language} -->`,
    `<!-- technical-spec-sha256: ${specSha256} -->`,
    "",
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

function initialSpecContent(goalSha256, prdPath) {
  return [
    "# Initial technical specification",
    "",
    "## Authority binding",
    "",
    `- Goal SHA-256: \`${goalSha256}\``,
    `- Canonical PRD: \`${prdPath}\``,
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
    "This section is kept in sync by `pipeline-state.mjs` after every",
    "phase/approval-changing command (`syncStateMdNextAction`). Treat",
    "`project/pipeline-state.json` (or `pipeline-state.mjs continuity-status`) as",
    "the authoritative fallback only if this project predates that mechanism, or",
    "if the sync itself could not apply (a hand-edited section with no",
    "recognizable `## Next action` heading, or a calibration-configured handover",
    "path other than this file).",
    "",
  ].join("\n");
}

/**
 * The handover the PROMOTION writes, replacing the kickoff's.
 *
 * It names the durable design package -- PRD, Spec and, unlike the kickoff text,
 * the design input. That last line is the one that matters most across a session
 * boundary: the PO's report of the Codex run was that the runner "forgets the
 * input", and the input was never lost from disk. `design-input.md` held a full
 * brief -- context, goals, non-goals, chosen approach, scope, constraints, risks,
 * three open questions -- and nothing that survived the session pointed at it. The
 * handover carried a one-line kickoff goal and a superseded PRD path, and
 * `resume-hint.mjs inspect` returned absent. Naming the design input here gives a
 * re-grounding session one durable pointer to the actual brief.
 */
function promotionHandoverContent({ featureId, prdPath, specPath, designInputPath, profile }) {
  return [
    "# Project state",
    "",
    "## Current state",
    "",
    `Feature \`${featureId}\` is active in design (PO profile: \`${profile}\`).`,
    `PRD: \`${prdPath}\`.`,
    `Technical specification: \`${specPath}\`.`,
    `Design input this package was promoted from: \`${designInputPath}\`.`,
    "",
    "The provisional kickoff PRD and specification are superseded; their directory",
    "carries a `SUPERSEDED.md` naming this package as their successor.",
    "",
    "## Next action",
    "",
    "Review the PRD and specification, then submit the plan for PO approval:",
    "`pipeline-state submit-plan --by <name> --profile <epic|feature|mini>`.",
    "Implementation writes stay refused until the plan is approved and the phase is",
    "switched to `implementation`.",
    "",
    "This section is kept in sync by `pipeline-state.mjs` after every",
    "phase/approval-changing command (`syncStateMdNextAction`). Treat",
    "`project/pipeline-state.json` (or `pipeline-state.mjs continuity-status`) as",
    "the authoritative fallback only if this project predates that mechanism, or",
    "if the sync itself could not apply (a hand-edited section with no",
    "recognizable `## Next action` heading, or a calibration-configured handover",
    "path other than this file).",
    "",
  ].join("\n");
}

/**
 * The rendered body for each non-null `derivePlanLifecycle` status
 * (`PLAN_LIFECYCLE_STATUSES` in `plan-spec-state-v2.mjs`). Kept as a lookup
 * table, not a `switch`, so an added lifecycle status fails loudly here
 * (`undefined` body -> the generic fallback in `nextActionSection()`) instead
 * of silently falling through to the wrong text.
 */
const NEXT_ACTION_BODY_BY_STATUS = {
  draft: [
    "Review the PRD and specification, then submit the plan for PO approval:",
    "`pipeline-state submit-plan --by <name> --profile <epic|feature|mini>`.",
    "Implementation writes stay refused until the plan is approved and the phase is",
    "switched to `implementation`.",
  ],
  "awaiting-approval": [
    "The plan has been submitted and is awaiting PO approval:",
    "`pipeline-state approve-plan --by <name>`. Implementation writes stay refused",
    "until the plan is approved.",
  ],
  approved: [
    "The plan is approved. Switch the feature to implementation with",
    "`pipeline-state set-phase --phase implementation`, then proceed with the",
    "approved implementation packages.",
  ],
  implementing: [
    "The plan is approved and the feature is in implementation. Proceed with the",
    "approved implementation packages; reopen design only through",
    "`pipeline-state reopen-design --by <name>` if it must change.",
  ],
};

function nextActionBlock(bodyLines) {
  return ["## Next action", "", ...bodyLines, ""].join("\n");
}

/**
 * Render the CURRENT "## Next action" section of a project's `docs/state.md`
 * from the LIVE Pipeline state object (`pipeline-state.mjs`'s `readState()`
 * result), classified through the same `derivePlanLifecycle` projection every
 * other State reader uses. Called with no `observation` argument, that
 * projection reduces to state-only fields (`activeFeature`, `planSubmission`,
 * `planApproval`, `planInvalidation`, `planApproved`) -- exactly what a
 * doc section needs, and nothing this pure function has to fetch itself.
 *
 * Filed against
 * backlog/items/2026-08-09-docs-state-md-next-action-text-is-a-static-snapshot-with-no-live-sync.md:
 * `handoverContent()`/`promotionHandoverContent()` write this section once,
 * at kickoff/promotion, and it goes stale the moment a later command changes
 * phase or approval. `syncStateMdNextAction()` below calls this after every
 * state-changing `pipeline-state.mjs` command to keep the section current.
 */
export function nextActionSection(state) {
  const lifecycle = derivePlanLifecycle(state);
  if (lifecycle.code === "PLAN-LIFECYCLE-INACTIVE") {
    return nextActionBlock([
      "No feature is currently active. Start the next one with",
      "`pipeline-state set-feature --id <id> --plan-path <path>`, or review closed",
      "feature history in `project/pipeline-state.json` (`closedFeatures`).",
    ]);
  }
  if (!lifecycle.ok || lifecycle.status === null) {
    return nextActionBlock([
      `The recorded plan/approval state could not be classified (${lifecycle.code ?? "unknown"}).`,
      "Treat `project/pipeline-state.json` (or `pipeline-state.mjs continuity-status`)",
      "as the live, authoritative source until the state is repaired.",
    ]);
  }
  const body = NEXT_ACTION_BODY_BY_STATUS[lifecycle.status];
  if (body === undefined) {
    return nextActionBlock([
      `The recorded lifecycle status ("${lifecycle.status}") has no rendered text yet.`,
      "Treat `project/pipeline-state.json` (or `pipeline-state.mjs continuity-status`)",
      "as the live, authoritative source.",
    ]);
  }
  return nextActionBlock(body);
}

/**
 * Locate the "## Next action" section inside a `docs/state.md`-shaped
 * markdown string and replace it (heading through the line before the next
 * `## ` heading, or end of file) with `sectionText` (a `nextActionSection()`
 * return value, heading included). Everything outside that span -- every
 * other section, including "## Goal"/"## Current state" above it -- is
 * passed through byte-for-byte.
 *
 * Returns `null` -- never throws, never guesses -- when no exact
 * "## Next action" heading line is found, so a caller can fail closed rather
 * than corrupt a hand-edited file or one from an older onboarding shape.
 */
export function replaceNextActionSection(markdown, sectionText) {
  if (typeof markdown !== "string" || typeof sectionText !== "string") return null;
  const lines = markdown.split("\n");
  const headingIndex = lines.findIndex((line) => line.trim() === "## Next action");
  if (headingIndex === -1) return null;
  let endIndex = lines.length;
  for (let i = headingIndex + 1; i < lines.length; i += 1) {
    if (lines[i].startsWith("## ")) { endIndex = i; break; }
  }
  const before = lines.slice(0, headingIndex);
  const after = lines.slice(endIndex);
  // `sectionText` always ends with a blank-line terminator element once split
  // (see `nextActionBlock`), so no extra separator line is needed here.
  return [...before, ...sectionText.split("\n"), ...after].join("\n");
}

/**
 * Best-effort resync of `docs/state.md`'s "## Next action" section to the
 * CURRENT `state`, called after a `pipeline-state.mjs` command has already
 * committed its own write. Never throws; a caller MUST NOT let this gate
 * command success -- the state write is authoritative, this sync is
 * advisory (see the backlog item cited on `nextActionSection` above).
 *
 * Fails closed on anything it cannot safely handle: an absent/unreadable
 * handover file, or one with no recognizable "## Next action" heading (an
 * older project, or one that hand-edited the section), both skip the
 * rewrite rather than guess at a repair. The target path is resolved the
 * same way `projectReadContinuityStatus` resolves it above (`docs/state.md`
 * unless `calibration.handover` names something else); any failure while
 * resolving calibration falls back to the `docs/state.md` default rather
 * than throwing, since this sync is advisory and must never gate the
 * caller's already-committed State write.
 */
export function syncStateMdNextAction(dir, state) {
  let handoverPath = "docs/state.md";
  try {
    const root = physicalRoot(dir);
    const selectedPaths = authorityPaths(root);
    const calibrationObservation = observeOptionalProjectFile(root, selectedPaths.calibration, "Pipeline calibration");
    if (calibrationObservation.status === "present") {
      const calibration = parseJsonObject(calibrationObservation, "Pipeline calibration");
      // Dual-shape `calibration.handover`, matching `observeDetailed()` above
      // and `handover-rotation.mjs`'s `resolveHandoverConfig()`: a plain
      // string names the path directly (predating ADR-0066); an ADR-0066
      // Decision 5 `{ path, maxBytes }` object names it via `.path`
      // (`maxBytes` is not read here -- this call site only ever needed the
      // path). Anything else (including an object without a usable `.path`)
      // still reaches `safeRelativePath()`, whose failure is caught below
      // and falls back to the `docs/state.md` default, same as before this
      // fix.
      const handoverValue = calibration.handover;
      const handoverPathCandidate = handoverValue
        && typeof handoverValue === "object"
        && !Array.isArray(handoverValue)
        ? handoverValue.path
        : handoverValue;
      handoverPath = handoverValue === undefined
        ? "docs/state.md"
        : safeRelativePath(handoverPathCandidate, "configured handover");
    }
  } catch {
    handoverPath = "docs/state.md";
  }
  const path = join(dir, handoverPath);
  let markdown;
  try {
    markdown = readFileSync(path, "utf8");
  } catch {
    return { ok: false, reason: "docs/state.md is absent or unreadable" };
  }
  let sectionText;
  try {
    sectionText = nextActionSection(state);
  } catch (error) {
    return { ok: false, reason: `next-action rendering failed: ${error?.message ?? error}` };
  }
  const updated = replaceNextActionSection(markdown, sectionText);
  if (updated === null) {
    return { ok: false, reason: 'no recognizable "## Next action" heading' };
  }
  if (updated === markdown) {
    return { ok: true, changed: false };
  }
  try {
    writeFileSync(path, updated, "utf8");
  } catch (error) {
    return { ok: false, reason: `write failed: ${error?.message ?? error}` };
  }
  return { ok: true, changed: true };
}

/**
 * Rebuild an applied promotion's handover target from its recorded transaction.
 *
 * The content is never stored in the history -- it is a pure function of the
 * promotion's own inputs, all of which the entry already names. Reconstructing it
 * and checking the digest is therefore a real verification, not a restatement: if
 * the rebuilt bytes do not hash to what the transaction recorded, the entry and
 * the content generator disagree and the replay must fail rather than hand back a
 * plan whose target does not describe what was written.
 */
function replayHandoverTarget(entry, input, authority) {
  const content = promotionHandoverContent({
    featureId: input.featureId, prdPath: authority.prd.path, specPath: authority.spec.path,
    designInputPath: authority.designInput.path, profile: input.profile,
  });
  if (sha256(Buffer.from(content, "utf8")) !== entry.handover?.afterSha256) {
    fail("KICKOFF-PROMOTION-REPLAY", "promotion handover does not match the exact completed postimage");
  }
  return {
    path: entry.handover.path,
    beforeSha256: entry.handover.beforeSha256,
    afterSha256: entry.handover.afterSha256,
    content,
  };
}

function initialContinuity({ featureId, prdPath, prdSha256, specPath, specSha256, language }) {
  return {
    schema: "pipeline.continuity.v0",
    featureId,
    revision: 0,
    runtime: {
      humanFacingLanguage: language,
      activeDuty: "Coordinator",
      sessionCleanup: null,
    },
    authority: {
      prd: { path: prdPath, sha256: prdSha256 },
      spec: { path: specPath, sha256: specSha256 },
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

/**
 * The one construction site for a plan-bound apply action: every such action
 * re-invokes the onboarding-script CLI, verbatim, under whichever runner its
 * plan was produced for. `runner` is a required argument here, not a default,
 * so a caller that forgets to thread it through fails at construction time --
 * a hand-written argv literal copied for a new plan/apply pair cannot silently
 * inherit an omission the way `applyAction`/`promotionApplyAction` once did
 * (backlog: kickoff-apply-action-drops-the-runner-the-plan-was-made-for;
 * ADR-0051, ADR-0057 R1).
 */
function planBoundApplyAction(onboardingScript, commandArgv, optionArgv, runner, planSha256, schema) {
  if (typeof runner !== "string" || runner.length === 0) {
    fail("APPLY-ACTION-RUNNER-REQUIRED", "a plan-bound apply action cannot be constructed without the runner its plan was produced under");
  }
  return {
    kind: "command",
    executable: "node",
    argv: [
      onboardingScript,
      ...commandArgv,
      ...optionArgv,
      "--runner",
      runner,
      "--plan-sha256",
      planSha256,
      "--activate",
    ],
    mutation: true,
    requiresConfirmation: true,
    expected: {
      schema,
      statuses: ["ready"],
    },
  };
}

function applyAction(onboardingScript, root, goal, language, planSha256, runner) {
  return planBoundApplyAction(
    onboardingScript,
    ["kickoff", "apply"],
    ["--root", root, "--goal", goal, "--language", language],
    runner,
    planSha256,
    "pipeline.project-onboarding.v4",
  );
}

function planBinding(plan) {
  return {
    schema: plan.schema,
    root: plan.root,
    repositoryCapability: plan.repositoryCapability,
    goal: plan.goal,
    goalSha256: plan.goalSha256,
    language: plan.language,
    calibration: plan.calibration,
    targets: plan.targets,
    transactionSha256: plan.transactionSha256,
    onboardingScript: plan.onboardingScript,
    // Part of the binding, not just the applyAction argv: two plans that
    // differ only in which runner they were produced for must not collide on
    // the same digest, or an apply reconstructed under a different runner
    // would validate against a plan it does not match (RUNNERNEUT-1).
    runner: plan.runner,
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
    || typeof plan.runner !== "string" || plan.runner.length === 0
    || validateKickoffGoal(plan.goal) !== plan.goal
    || sha256(Buffer.from(plan.goal, "utf8")) !== plan.goalSha256
    || !new Set(["de", "en"]).has(plan.language)
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
    || state.activeFeature.planPath !== plan.targets.prd.path
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
  const canonicalPaths = initialAuthorityPaths(state.activeFeature.id);
  if (plan.targets.prd.path !== canonicalPaths.prd || plan.targets.spec.path !== canonicalPaths.spec) {
    fail("KICKOFF-PLAN-INVALID", "kickoff authority paths are not canonical");
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
  const expectedKickoffApplyAction = applyAction(
    plan.onboardingScript, plan.root, plan.goal, plan.language, plan.planSha256, plan.runner,
  );
  if (canonicalJson(plan.applyAction) !== canonicalJson(expectedKickoffApplyAction)
    // `nextAction` is the same command object, published under the name the
    // generic guided driver reads (NVA-H-LASTBUILDERS) -- validated the same
    // way `applyAction` already is: a plan whose `nextAction` disagrees with
    // its own re-derived apply action is refused.
    || canonicalJson(plan.nextAction) !== canonicalJson(expectedKickoffApplyAction)) {
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
  language,
  runner = "codex",
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
  const goalSha256 = sha256(Buffer.from(normalizedGoal, "utf8"));
  const featureId = `kickoff-${goalSha256.slice(0, 16)}`;
  const authority = initialAuthorityPaths(featureId);
  const authorityObservations = Object.fromEntries([
    ["prd", authority.prd, "initial PRD"],
    ["spec", authority.spec, "initial specification"],
  ].map(([key, path, label]) => [key, observeOptionalProjectFile(observed.root, path, label)]));
  if (!replay) {
    for (const [key, label] of [["prd", "initial PRD"], ["spec", "initial specification"]]) {
      if (authorityObservations[key].status !== "absent") {
      fail("KICKOFF-NOT-PRISTINE", `${label} target already exists`);
      }
    }
  }
  const resolvedLanguage = language === undefined
    ? kickoffLanguage(observed.root)
    : validateKickoffLanguage(language);
  const specContent = initialSpecContent(goalSha256, authority.prd);
  const specSha256 = sha256(Buffer.from(specContent, "utf8"));
  const prdContent = initialPrdContent(normalizedGoal, goalSha256, resolvedLanguage, specSha256);
  const prdSha256 = sha256(Buffer.from(prdContent, "utf8"));
  const content = handoverContent(
    normalizedGoal,
    featureId,
    authority.prd,
    authority.spec,
  );
  const handoverSha256 = sha256(Buffer.from(content, "utf8"));
  const continuity = initialContinuity({
    featureId,
    prdPath: authority.prd,
    prdSha256,
    specPath: authority.spec,
    specSha256,
    language: resolvedLanguage,
  });
  const state = {
    schema: "pipeline.state.v0",
    activeFeature: {
      id: featureId,
      planPath: authority.prd,
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
      path: authority.prd,
      beforeSha256: null,
      afterSha256: prdSha256,
      content: prdContent,
    },
    spec: {
      path: authority.spec,
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
    language: resolvedLanguage,
    calibration: {
      path: selectedAuthority.calibration,
      sha256: observed.calibrationSha256,
    },
    targets,
    transactionSha256,
    onboardingScript,
    runner,
  };
  const planSha256 = canonicalSha256(binding);
  const kickoffApplyAction = applyAction(
    onboardingScript, observed.root, normalizedGoal, resolvedLanguage, planSha256, runner,
  );
  const plan = {
    ...binding,
    planSha256,
    applyAction: kickoffApplyAction,
    nextAction: kickoffApplyAction,
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

// `coordinatorSourced`: the bootstrap-bind-apply CLI subcommand (Wave 4 onboarding
// coordinator step 5, design SSa.5 point 5) is a single flat argv token, mirroring
// intake-generate-apply, not the compound `kickoff promote apply` form -- and it
// takes NO --profile/--id/--*-path flags, because those are all derived from the
// intake checkpoint (deriveIntakeFeatureId, INTAKE_STAGING_DIRNAME) rather than
// caller-supplied. It calls applyOnboardingKickoffPromotion() directly (bypassing
// the v4Inspection wrapper), so its expected output shape is this module's own
// KICKOFF_PROMOTION_APPLY_SCHEMA, not "pipeline.project-onboarding.v4".
function promotionApplyAction(onboardingScript, root, profile, featureId, planPath, prdPath, specPath, designInputPath, planSha256, runner, coordinatorSourced = false) {
  if (coordinatorSourced) {
    return planBoundApplyAction(
      onboardingScript,
      ["bootstrap-bind-apply"],
      ["--root", root],
      runner,
      planSha256,
      KICKOFF_PROMOTION_APPLY_SCHEMA,
    );
  }
  return planBoundApplyAction(
    onboardingScript,
    ["kickoff", "promote", "apply"],
    [
      "--root", root, "--profile", profile, "--id", featureId, "--plan-path", planPath,
      "--prd-path", prdPath, "--spec-path", specPath, "--design-input-path", designInputPath,
    ],
    runner,
    planSha256,
    "pipeline.project-onboarding.v4",
  );
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
    // See planBinding's identical comment: a promotion plan and its apply must
    // not validate under a runner they were not produced for.
    runner: plan.runner,
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
    || state.activeFeature.phase !== "design"
    || !validateContinuityState(continuity, state.activeFeature.id).ok
    || continuity.runtime.sessionCleanup !== null
    || continuity.authority.result !== null
    || continuity.queueHead?.dispatch !== null
    || continuity.blocker !== null
    || continuity.acknowledgedFinal !== null
    || continuity.recovery !== null
    || continuity.decisionTxn !== null) return null;
  const authority = initialAuthorityPaths(state.activeFeature.id);
  if (state.activeFeature.planPath !== authority.prd
    || continuity.authority.prd.path !== authority.prd
    || continuity.authority.spec.path !== authority.spec) return null;
  if (!history || history.transactions?.length !== 1 || history.transactions[0]?.kind !== "kickoff") return null;
  const entry = history.transactions[0];
  const prd = observeOptionalProjectFile(observed.root, authority.prd, "initial PRD");
  const spec = observeOptionalProjectFile(observed.root, authority.spec, "initial specification");
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

function promotionInput({ profile, featureId, planPath, prdPath, specPath, designInputPath }) {
  if (!PROMOTION_PROFILES.has(profile)) fail("KICKOFF-PROMOTION-INPUT", "promotion profile is invalid");
  if (!SAFE_FEATURE_ID.test(featureId ?? "") || featureId.startsWith("kickoff-")) {
    fail("KICKOFF-PROMOTION-INPUT", "promotion feature id is invalid");
  }
  if (!PROMOTION_FEATURE_ID_DOWNSTREAM.test(featureId)) {
    fail("KICKOFF-PROMOTION-INPUT", "promotion feature id must be lowercase alphanumeric with hyphens, starting with a letter, max 64 characters -- it will later be rejected at push-approval otherwise");
  }
  for (const [value, label] of [[planPath, "plan"], [prdPath, "PRD"], [specPath, "specification"], [designInputPath, "design input"]]) {
    safeRelativePath(value, `promotion ${label}`);
  }
  // The Spec is presented beside the PRD and digest-bound to it, but it is
  // never the approval subject; equating the two is the inverted invariant and
  // keeps its own reason so the refusal stays legible.
  if (planPath === specPath) {
    fail("KICKOFF-PROMOTION-PLAN-IS-SPEC", "promotion plan is the specification, but the approval subject is the PRD");
  }
  if (planPath !== prdPath || !PROMOTION_PRD_BASENAME.test(basename(prdPath))) {
    fail("KICKOFF-PROMOTION-PLAN-NOT-PRD", "promotion plan must be exactly the promoted prd_*.md");
  }
  if (basename(specPath) !== PROMOTION_SPEC_BASENAME) {
    fail("KICKOFF-PROMOTION-SPEC-NOT-CANONICAL", "promotion specification must be the neighbouring spec.md");
  }
  if (new Set([prdPath, specPath, designInputPath]).size !== 3
    || dirname(prdPath) !== dirname(specPath) || dirname(designInputPath) !== dirname(specPath)
    || basename(designInputPath) !== PROMOTION_DESIGN_INPUT_BASENAME) {
    fail("KICKOFF-PROMOTION-INPUT", "promotion plan and authority paths are inconsistent");
  }
  return { profile, featureId, planPath, prdPath, specPath, designInputPath };
}

// checkMarkers distinguishes the two concerns this function used to conflate:
// plan-time ADMISSION (may this PRD be planned for promotion at all) versus
// apply-time IDENTITY (what are this package's current bytes). Admission
// belongs only to genuine plan-building (planOnboardingKickoffPromotion,
// checkMarkers left at its true default) -- never to reconstructing an
// existing plan from current bytes for apply-time digest comparison
// (reconstructOnboardingKickoffPromotionPlan, checkMarkers: false), because
// re-admitting against *current* bytes there can fire before the plan-digest
// comparison that should be the first refusal a drifted Spec gets. Apply
// still enforces admission unconditionally, once, in its own later call to
// this function (checkMarkers left at its true default) -- after the digest
// comparison, so a caller cannot use reconstruction's skipped admission to
// slip a marker-less PRD past this function altogether.
// NVA-R-STAGINGACK: `pureGeneratorPrdSha256`, when non-null, is the digest a
// caller has already established (via pureGeneratorPromotionPrdSha256 below)
// as what intake-generate-apply would currently derive for this exact
// checkpoint -- ONLY ever supplied by the two coordinator-sourced call sites
// (buildCoordinatorSourcedPromotionPlan, applyOnboardingKickoffPromotion's
// own coordinator branch). Every other caller, including every kickoff-
// sourced (`kickoff promote`) call, leaves it at its null default, so the
// acknowledgement-marker gate is completely unchanged for them.
function promotionArtifacts(root, input, { checkMarkers = true, pureGeneratorPrdSha256 = null } = {}) {
  const prd = observeOptionalProjectFile(root, input.prdPath, "promotion PRD");
  const spec = observeOptionalProjectFile(root, input.specPath, "promotion specification");
  const designInput = observeOptionalProjectFile(root, input.designInputPath, "promotion design input");
  if (prd.status !== "present" || spec.status !== "present" || designInput.status !== "present") {
    fail("KICKOFF-PROMOTION-AUTHORITY", "promotion PRD, specification, and design input must already exist");
  }
  if ([input.prdPath, input.specPath, input.designInputPath]
    .some((path) => path.startsWith("specs/kickoff-"))) {
    fail("KICKOFF-PROMOTION-AUTHORITY", "promotion authority must not reuse kickoff artifacts");
  }
  // The PO plan gate (po-gate-authority.mjs) will refuse a promoted PRD that
  // does not already carry both markers it requires. Checking here, before
  // anything is frozen, turns what used to be a session-bricking dead end --
  // the promotion binds the PRD's bytes, so adding a marker afterward breaks
  // the very binding this function just recorded -- into a one-line refusal
  // now, while the PRD is still freely editable. The grammars are imported
  // from po-gate-authority.mjs, never re-declared, so the two checks cannot
  // drift apart.
  // Parsed on EVERY path, refused only where markers are checked. The promoted
  // PRD's marker is the transaction's own answer to "what language is this
  // project", and the state transition writes it -- so the applied-replay path,
  // which deliberately re-decides no admissibility, still has to reconstruct the
  // same value or its comparison plan would differ from the plan that was applied.
  const prdText = prd.raw.toString("utf8");
  const languageMarkers = [...prdText.matchAll(PRD_LANGUAGE_MARKER)].map((match) => match[1]);
  if (checkMarkers) {
    if (languageMarkers.length !== 1) {
      fail(
        "KICKOFF-PROMOTION-PRD-LANGUAGE-MARKER-INVALID",
        "The promoted PRD must carry the PO-gate language marker exactly once, as"
          + " <!-- po-language: xx --> on its own line, where xx is any lowercase two-letter language code;"
          + " the PO plan gate will otherwise refuse it.",
      );
    }
    const specMarkers = [...prdText.matchAll(TECHNICAL_SPEC_MARKER)].map((match) => match[1]);
    if (specMarkers.length !== 1) {
      fail(
        "KICKOFF-PROMOTION-PRD-SPEC-MARKER-MISSING",
        "The promoted PRD must carry the technical Spec marker exactly once, as"
          + ` <!-- technical-spec-sha256: ${spec.sha256} --> on its own line; the PO plan gate will otherwise refuse it.`,
      );
    }
    if (specMarkers[0] !== spec.sha256) {
      fail(
        "KICKOFF-PROMOTION-PRD-SPEC-MARKER-MISMATCH",
        "The promoted PRD technical Spec marker does not match the neighboring spec.md; it must read exactly"
          + ` <!-- technical-spec-sha256: ${spec.sha256} -->; the PO plan gate will otherwise refuse it.`,
      );
    }
    // Third marker, same admission-time reasoning as the two above (NVA-W4-2B,
    // 2026-08-08-a-promotion-freezes-a-prd-the-po-gate-will-reject.md's own
    // Direction 1/2 extended to the acknowledgement marker added later by
    // 2026-08-07-a-promoted-feature-can-never-pass-the-plan-gate.md): a
    // promoted-but-unacknowledged PRD used to hit PO-GATE-PRD-ACKNOWLEDGEMENT-MISSING
    // with no sanctioned repair route once bound (po-gate-authority.mjs's own
    // ACKNOWLEDGEMENT_REPAIR text, before NVA-W4-2B added
    // po-authority-acknowledge-plan/apply). Refusing here, before anything is
    // frozen, keeps that dead end from being reachable via promotion.
    const acknowledgementMarkers = [...prdText.matchAll(PRD_ACKNOWLEDGEMENT_MARKER)];
    // NVA-R-STAGINGACK: the ONE narrow exemption from the marker below -- never
    // a second one, and never reachable for `kickoff promote` (pureGeneratorPrdSha256
    // is only ever non-null from the two coordinator-sourced call sites). A digest
    // match here means these exact CURRENT bytes (prd.sha256, read from disk just
    // above, never the banner's own embedded digest) are indistinguishable from
    // what intake-generate-apply would write today, straight from the intake
    // checkpoint's own recorded consent -- nothing here is a human judgement the
    // marker could be certifying, so demanding it would certify nothing. Any hand
    // edit, any checkpoint drift since generation, or consent never having been
    // recorded all fail this comparison (pureGeneratorPromotionPrdSha256 returns
    // null, or returns a digest that no longer matches) and fall straight through
    // to the unchanged refusal below.
    const pureGeneratorExempt = pureGeneratorPrdSha256 !== null && pureGeneratorPrdSha256 === prd.sha256;
    if (acknowledgementMarkers.length !== 1 && !pureGeneratorExempt) {
      fail(
        "KICKOFF-PROMOTION-PRD-ACKNOWLEDGEMENT-MARKER-MISSING",
        "The promoted PRD must carry the PO's plan acknowledgement marker exactly once, as"
          + " <!-- po-plan-acknowledged: content-sound-and-spec-consistent --> on its own line;"
          + " the PO plan gate will otherwise refuse it with no sanctioned repair route once bound.",
      );
    }
  }
  return {
    prd: { path: input.prdPath, sha256: prd.sha256 },
    spec: { path: input.specPath, sha256: spec.sha256 },
    designInput: { path: input.designInputPath, sha256: designInput.sha256 },
    // The language the state transition will project. Exactly one marker is
    // admitted where markers are checked, so a single value is the only shape
    // this can take; `null` is reachable only on the applied-replay path over a
    // PRD that never carried one, and the transition below leaves the kickoff
    // value untouched for it rather than inventing a language.
    poLanguage: languageMarkers.length === 1 ? languageMarkers[0] : null,
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
    || continuity.historySha256 !== plan.targets.history.afterSha256
    // The handover is read back like the other two, not written and forgotten.
    // `classifyOnboardingContinuity` already observes the calibrated handover on
    // every call, so this costs nothing and closes the case where the file was
    // written and then changed underneath the transaction before it committed.
    || (plan.targets.handover !== undefined && continuity.handoverSha256 !== plan.targets.handover.afterSha256)) {
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
  // Wave 4 onboarding coordinator, step 5 (design SSc.3): `plan.kickoff === null`
  // marks a coordinator-sourced binding -- no kickoff predecessor exists by
  // construction (SS0). This is an ADDITIVE alternative to the existing
  // kickoff-sourced shape below, never a replacement or a loosening of it.
  const coordinatorSourced = isObject(plan) && plan.kickoff === null;
  if (!exactKeys(plan, PROMOTION_PLAN_KEYS) || plan.schema !== KICKOFF_PROMOTION_PLAN_SCHEMA
    || !new Set(["local", "host-managed"]).has(plan.repositoryCapability)
    || !isAbsolute(plan.onboardingScript ?? "") || !SHA256_RE.test(plan.planSha256 ?? "")
    || !SHA256_RE.test(plan.transactionSha256 ?? "")
    || typeof plan.runner !== "string" || plan.runner.length === 0
    || !exactKeys(plan.feature, new Set(["id", "planPath"]))
    || !exactKeys(plan.authority, new Set(["prd", "spec", "designInput", "poLanguage"]))
    || !(plan.authority.poLanguage === null || /^[a-z]{2}$/u.test(plan.authority.poLanguage))
    || !exactKeys(plan.authority.prd, new Set(["path", "sha256"]))
    || !exactKeys(plan.authority.spec, new Set(["path", "sha256"]))
    || !exactKeys(plan.authority.designInput, new Set(["path", "sha256"]))
    || !(coordinatorSourced
      || exactKeys(plan.kickoff, new Set(["featureId", "transactionSha256", "stateSha256", "historySha256", "revision"])))
    // `handover` and `cleanupBinding` are each independently optional for a
    // kickoff-sourced plan (a promotion applied before either existed replays
    // without it); a coordinator-sourced plan always carries a handover target
    // (SSc.3: the binding IS the first write) and NEVER a cleanupBinding target
    // (no prior kickoff session-cleanup binding exists to promote).
    || !isObject(plan.targets)
    || plan.targets.state === undefined || plan.targets.history === undefined
    || Object.keys(plan.targets).some((key) => !["state", "history", "handover", "cleanupBinding"].includes(key))
    || (coordinatorSourced && plan.targets.handover === undefined)
    || (coordinatorSourced && plan.targets.cleanupBinding !== undefined)
    || !exactKeys(plan.targets.state, PROMOTION_TARGET_KEYS.state)
    || !exactKeys(plan.targets.history, PROMOTION_TARGET_KEYS.history)
    || (plan.targets.handover !== undefined && (!exactKeys(plan.targets.handover, PROMOTION_TARGET_KEYS.handover)
      || typeof plan.targets.handover.content !== "string" || plan.targets.handover.content.length === 0
      || !SHA256_RE.test(plan.targets.handover.afterSha256 ?? "")
      // An ABSENT handover is a legitimate preimage -- a project whose calibration
      // names a handover the kickoff never wrote -- so `null` is admitted here and
      // nowhere else. Any other non-digest value is a malformed plan. A
      // coordinator-sourced plan's handover is ALWAYS absent-before (no other
      // shape is reachable under the absent-pristine precondition, SSc.3).
      || !(plan.targets.handover.beforeSha256 === null || SHA256_RE.test(plan.targets.handover.beforeSha256 ?? ""))
      || (coordinatorSourced && plan.targets.handover.beforeSha256 !== null)
      || sha256(Buffer.from(plan.targets.handover.content, "utf8")) !== plan.targets.handover.afterSha256))
    || (plan.targets.cleanupBinding !== undefined && !exactKeys(plan.targets.cleanupBinding, PROMOTION_TARGET_KEYS.cleanupBinding))
    // A coordinator-sourced plan's state/history targets have no preimage at all
    // (the four CAS targets are absent, SSc.3) -- `beforeSha256: null` marks that,
    // in place of the kickoff-sourced shape's real prior-commit digest.
    || (coordinatorSourced && (plan.targets.state.beforeSha256 !== null || plan.targets.history.beforeSha256 !== null))
    || (!coordinatorSourced && !(SHA256_RE.test(plan.targets.state.beforeSha256 ?? "") && SHA256_RE.test(plan.targets.history.beforeSha256 ?? "")))) {
    fail("KICKOFF-PROMOTION-PLAN", "promotion plan is not closed and valid");
  }
  if (plan.targets.handover !== undefined) {
    // Same containment rules the kickoff applies to its own handover target, and
    // the same collision refusal: a handover that resolves onto the state or the
    // calibration would let this transaction overwrite its own authority.
    safeRelativePath(plan.targets.handover.path, "configured handover");
    const selectedPaths = authorityPaths(physicalRoot(plan.root));
    if ([selectedPaths.state, selectedPaths.calibration, plan.authority.prd.path, plan.authority.spec.path,
      plan.authority.designInput.path].includes(plan.targets.handover.path)
      || plan.targets.handover.path === ".git" || plan.targets.handover.path.startsWith(".git/")) {
      fail("KICKOFF-PROMOTION-PLAN", "promotion handover target collides with a bound artifact");
    }
  }
  const input = promotionInput({
    profile: plan.profile, featureId: plan.feature.id, planPath: plan.feature.planPath,
    prdPath: plan.authority.prd.path, specPath: plan.authority.spec.path,
    designInputPath: plan.authority.designInput.path,
  });
  const root = physicalRoot(plan.root);
  const selected = authorityPaths(root);
  if (root !== plan.root || plan.targets.state.path !== selected.state
    || plan.targets.history.path !== HISTORY_BASENAME) {
    fail("KICKOFF-PROMOTION-PLAN", "promotion plan bindings are invalid");
  }
  if (coordinatorSourced) {
    if (![plan.authority.prd.sha256, plan.authority.spec.sha256, plan.authority.designInput.sha256,
      plan.targets.state.afterSha256, plan.targets.history.afterSha256].every((value) => SHA256_RE.test(value ?? ""))) {
      fail("KICKOFF-PROMOTION-PLAN", "coordinator-sourced promotion plan bindings are invalid");
    }
  } else if (![plan.authority.prd.sha256, plan.authority.spec.sha256, plan.authority.designInput.sha256, plan.kickoff.transactionSha256,
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
    || !validateContinuityState(state.continuity, input.featureId).ok) {
    fail("KICKOFF-PROMOTION-PLAN", "promotion continuity postimage is invalid");
  }
  if (coordinatorSourced) {
    if (state.continuity.revision !== 0 || state.continuity.resume.mode !== "resume-on-next-turn"
      || state.continuity.resume.sourceRevision !== 0) {
      fail("KICKOFF-PROMOTION-PLAN", "coordinator-sourced continuity postimage is invalid");
    }
  } else if (!Number.isSafeInteger(plan.kickoff.revision)
    || ![0, 1].includes(plan.kickoff.revision)
    || state.continuity.revision !== plan.kickoff.revision + 1
    || state.continuity.resume.sourceRevision !== state.continuity.revision) {
    fail("KICKOFF-PROMOTION-PLAN", "promotion continuity postimage is invalid");
  }
  validateHistory(plan.targets.history.value);
  const history = plan.targets.history.value.transactions;
  if (coordinatorSourced) {
    if (history.length !== 1 || history[0].kind !== "bootstrap-binding"
      || history[0].transactionSha256 !== plan.transactionSha256
      || history[0].profile !== plan.profile
      || history[0].featureId !== input.featureId
      || history[0].planPath !== input.planPath
      || history[0].specPath !== input.specPath
      || history[0].prdSha256 !== plan.authority.prd.sha256
      || history[0].specSha256 !== plan.authority.spec.sha256
      || history[0].designInputPath !== input.designInputPath
      || history[0].designInputSha256 !== plan.authority.designInput.sha256
      || history[0].afterStateSha256 !== plan.targets.state.afterSha256) {
      fail("KICKOFF-PROMOTION-PLAN", "coordinator-sourced promotion history postimage is invalid");
    }
  } else if (history.length !== 2 || history[1].kind !== "kickoff-promotion"
    || plan.kickoff.stateSha256 !== plan.targets.state.beforeSha256
    || plan.kickoff.historySha256 !== plan.targets.history.beforeSha256
    || history[0].transactionSha256 !== plan.kickoff.transactionSha256
    || history[1].previousTransactionSha256 !== plan.kickoff.transactionSha256
    || history[1].kickoffFeatureId !== plan.kickoff.featureId
    || history[1].profile !== plan.profile
    || history[1].transactionSha256 !== plan.transactionSha256
    || history[1].featureId !== input.featureId
    || history[1].planPath !== input.planPath
    || history[1].specPath !== input.specPath
    || history[1].prdSha256 !== plan.authority.prd.sha256
    || history[1].specSha256 !== plan.authority.spec.sha256
    || history[1].designInputPath !== input.designInputPath
    || history[1].designInputSha256 !== plan.authority.designInput.sha256
    || history[1].beforeStateSha256 !== plan.targets.state.beforeSha256
    || history[1].afterStateSha256 !== plan.targets.state.afterSha256) {
    fail("KICKOFF-PROMOTION-PLAN", "promotion history postimage is invalid");
  }
  if (!coordinatorSourced) {
    const cleanupBinding = plan.targets.cleanupBinding ?? null;
    if ((plan.kickoff.revision === 1) !== (cleanupBinding !== null)
      || (cleanupBinding !== null && (!SHA256_RE.test(cleanupBinding.beforeSha256)
        || !SHA256_RE.test(cleanupBinding.afterSha256)
        || canonicalJson(history[1].cleanupBinding) !== canonicalJson(cleanupBinding)))) {
      fail("KICKOFF-PROMOTION-PLAN", "promotion private cleanup binding target is invalid");
    }
  }
  const stateBytes = expectedStateBytes(state);
  const historyBytes = expectedHistoryBytes(plan.targets.history.value);
  if (sha256(stateBytes) !== plan.targets.state.afterSha256 || sha256(historyBytes) !== plan.targets.history.afterSha256) {
    fail("KICKOFF-PROMOTION-PLAN", "promotion postimage digest is invalid");
  }
  if (!coordinatorSourced) {
    const kickoffHistoryBytes = expectedHistoryBytes({
      schema: KICKOFF_HISTORY_SCHEMA,
      transactions: [history[0]],
    });
    if (sha256(kickoffHistoryBytes) !== plan.targets.history.beforeSha256) {
      fail("KICKOFF-PROMOTION-PLAN", "promotion kickoff history binding is invalid");
    }
  }
  const expectedApplyAction = promotionApplyAction(
    plan.onboardingScript, plan.root, input.profile, input.featureId, input.planPath,
    input.prdPath, input.specPath, input.designInputPath, plan.planSha256, plan.runner, coordinatorSourced,
  );
  if (canonicalSha256(promotionBinding(plan)) !== plan.planSha256
    || canonicalJson(plan.applyAction) !== canonicalJson(expectedApplyAction)
    // `nextAction` is the same command object, published under the name the
    // generic guided driver reads (NVA-F-PROMOTIONACTION) -- validated the
    // same way `applyAction` already is: a plan whose `nextAction` disagrees
    // with its own re-derived apply action is refused.
    || canonicalJson(plan.nextAction) !== canonicalJson(expectedApplyAction)) {
    fail("KICKOFF-PROMOTION-PLAN", "promotion action binding is invalid");
  }
  return {
    input, stateBytes, historyBytes,
    handoverBytes: plan.targets.handover === undefined
      ? null
      : Buffer.from(plan.targets.handover.content, "utf8"),
  };
}

// Wave 4 onboarding coordinator, step 5 (design SSc.3/SSa.5 point 5). Builds the
// "coordinator-sourced, no kickoff predecessor" plan variant: no recognisedKickoff
// seed exists (SS0 -- the coordinator never writes a provisional kickoff at all),
// so the four CAS targets (state/history/handover; cleanupBinding never applies)
// are ABSENT rather than equal to a recognised kickoff's postimage. Mirrors
// buildOnboardingKickoffPlan's own "nothing exists yet" precondition
// (absent-pristine) and initialContinuity() helper -- the same "birth" shape,
// reused rather than re-derived, applied here to the promotion transaction's
// shape instead of the kickoff transaction's.
function buildCoordinatorSourcedPromotionPlan({
  input, observed, profile, runner, repositoryCapability, onboardingScript, allowAppliedReplay,
  spawn = defaultGitSpawn,
}) {
  const replay = allowAppliedReplay && observed.continuity.status === "valid";
  if (observed.continuity.status !== "absent-pristine" && !replay) {
    fail("KICKOFF-PROMOTION-NOT-PRISTINE", "coordinator-sourced binding is permitted only for absent-pristine continuity");
  }
  if (replay) {
    const entries = observed.history?.transactions;
    const entry = entries?.at(-1);
    const authority = promotionArtifacts(observed.root, input, { checkMarkers: false });
    if (entries?.length !== 1 || entry?.kind !== "bootstrap-binding"
      || entry.profile !== input.profile || entry.featureId !== input.featureId
      || entry.planPath !== input.planPath || entry.specPath !== input.specPath
      || entry.prdSha256 !== authority.prd.sha256
      || entry.specSha256 !== authority.spec.sha256 || entry.designInputPath !== input.designInputPath
      || entry.designInputSha256 !== authority.designInput.sha256 || entry.afterStateSha256 !== observed.stateObservation.sha256
      || observed.state?.activeFeature?.id !== input.featureId || observed.state?.activeFeature?.planPath !== input.planPath
      || observed.state?.continuity?.featureId !== input.featureId
      || observed.state?.continuity?.authority?.prd?.sha256 !== authority.prd.sha256
      || observed.state?.continuity?.authority?.spec?.sha256 !== authority.spec.sha256) {
      fail("KICKOFF-PROMOTION-REPLAY", "coordinator-sourced binding replay does not match the exact completed postimage");
    }
    const binding = {
      schema: KICKOFF_PROMOTION_PLAN_SCHEMA, root: observed.root, repositoryCapability, profile: input.profile,
      feature: { id: input.featureId, planPath: input.planPath }, authority,
      kickoff: null,
      targets: {
        state: { path: authorityPaths(observed.root).state, beforeSha256: null, afterSha256: observed.stateObservation.sha256, value: observed.state },
        history: { path: HISTORY_BASENAME, beforeSha256: null, afterSha256: observed.historyObservation.sha256, value: observed.history },
        handover: replayHandoverTarget(entry, input, authority),
      },
      transactionSha256: entry.transactionSha256, onboardingScript, runner,
    };
    const planSha256 = canonicalSha256(binding);
    const applyAction = promotionApplyAction(onboardingScript, observed.root, input.profile, input.featureId, input.planPath, input.prdPath, input.specPath, input.designInputPath, planSha256, runner, true);
    const plan = {
      ...binding, planSha256, applyAction, nextAction: applyAction,
    };
    validatePromotionPlan(plan);
    return plan;
  }
  // NVA-R-STAGINGACK: computed only when admission is actually being decided
  // (checkMarkers true, i.e. NOT allowAppliedReplay) -- the replay branch
  // above never reaches here, and applyOnboardingBootstrapBind's own
  // allowAppliedReplay: true reconstruction already skips marker admission
  // entirely (checkMarkers false), exactly as before this change.
  const checkMarkers = !allowAppliedReplay;
  const authority = promotionArtifacts(observed.root, input, {
    checkMarkers,
    pureGeneratorPrdSha256: checkMarkers
      ? pureGeneratorPromotionPrdSha256({ rootDir: observed.root, repositoryCapability, spawn })
      : null,
  });
  const featureId = input.featureId;
  // NVA-R1-LANGWIRE: a coordinator-sourced binding has no kickoff predecessor to
  // inherit an operator-facing default from (plan.kickoff === null; unlike the
  // kickoff-sourced sibling branch's `{...next.continuity.runtime, ...}` merge
  // below), so the humanFacingLanguage seed here mirrors the standalone kickoff
  // planner's own documented fallback (kickoffLanguage(): "no configured PO
  // language to preserve yet -- retain the historical canonical English seed").
  // The identical {de,en}-vs-else split the sibling branch already applies is
  // then layered on top, so a non-{de,en} PRD po-language marker lands in
  // documentLanguage instead of forcing an invalid humanFacingLanguage value.
  // Before this, initialContinuity's `language: authority.poLanguage` wrote a
  // non-{de,en} marker (e.g. "fr") straight into humanFacingLanguage, which
  // validateContinuityState rejects -- making the coordinator-sourced PLAN
  // itself unbuildable (KICKOFF-PROMOTION-PLAN) for a content-language-only PRD,
  // confirmed live with a repro before this fix.
  const continuity = initialContinuity({
    featureId, prdPath: authority.prd.path, prdSha256: authority.prd.sha256,
    specPath: authority.spec.path, specSha256: authority.spec.sha256,
    language: kickoffLanguage(observed.root),
  });
  if (new Set(["de", "en"]).has(authority.poLanguage)) {
    continuity.runtime = { ...continuity.runtime, humanFacingLanguage: authority.poLanguage };
  } else if (authority.poLanguage !== null) {
    continuity.runtime = { ...continuity.runtime, documentLanguage: authority.poLanguage };
  }
  const next = {
    schema: "pipeline.state.v0",
    activeFeature: { id: featureId, planPath: input.planPath, phase: "design" },
    planApproved: false,
    continuity,
  };
  const valid = validateContinuityState(next.continuity, featureId);
  if (!valid.ok) fail("KICKOFF-PROMOTION-PLAN", `coordinator-sourced continuity was rejected (${valid.code})`);
  const afterStateSha256 = sha256(expectedStateBytes(next));
  const handoverContentBytes = promotionHandoverContent({
    featureId, prdPath: authority.prd.path, specPath: authority.spec.path,
    designInputPath: authority.designInput.path, profile: input.profile,
  });
  const handoverTarget = {
    path: observed.handoverPath,
    beforeSha256: null,
    afterSha256: sha256(Buffer.from(handoverContentBytes, "utf8")),
    content: handoverContentBytes,
  };
  const transaction = {
    schema: "pipeline.codex-onboarding-bootstrap-binding-transaction.v1",
    root: observed.root, repositoryCapability, profile: input.profile, feature: { id: featureId, planPath: input.planPath },
    afterStateSha256,
    prdSha256: authority.prd.sha256, specPath: authority.spec.path, specSha256: authority.spec.sha256,
    designInputPath: authority.designInput.path, designInputSha256: authority.designInput.sha256,
    handover: { path: handoverTarget.path, beforeSha256: handoverTarget.beforeSha256, afterSha256: handoverTarget.afterSha256 },
  };
  const transactionSha256 = canonicalSha256(transaction);
  const history = {
    schema: KICKOFF_HISTORY_SCHEMA,
    transactions: [{
      kind: "bootstrap-binding", transactionSha256,
      profile: input.profile, featureId, planPath: input.planPath, specPath: input.specPath,
      prdSha256: authority.prd.sha256, specSha256: authority.spec.sha256,
      designInputPath: authority.designInput.path, designInputSha256: authority.designInput.sha256,
      afterStateSha256,
      handover: { path: handoverTarget.path, beforeSha256: handoverTarget.beforeSha256, afterSha256: handoverTarget.afterSha256 },
    }],
  };
  const binding = {
    schema: KICKOFF_PROMOTION_PLAN_SCHEMA, root: observed.root, repositoryCapability, profile: input.profile,
    feature: { id: featureId, planPath: input.planPath }, authority,
    kickoff: null,
    targets: {
      state: { path: authorityPaths(observed.root).state, beforeSha256: null, afterSha256: afterStateSha256, value: next },
      history: { path: HISTORY_BASENAME, beforeSha256: null, afterSha256: sha256(expectedHistoryBytes(history)), value: history },
      handover: handoverTarget,
    },
    transactionSha256, onboardingScript, runner,
  };
  const planSha256 = canonicalSha256(binding);
  const applyAction = promotionApplyAction(onboardingScript, observed.root, input.profile, featureId, input.planPath, input.prdPath, input.specPath, input.designInputPath, planSha256, runner, true);
  const plan = {
    ...binding, planSha256, applyAction, nextAction: applyAction,
  };
  validatePromotionPlan(plan);
  return plan;
}

function buildKickoffPromotionPlan({
  rootDir, profile, featureId, planPath, prdPath, specPath, designInputPath,
  runner = "codex",
  repositoryCapability = "local", onboardingScript = DEFAULT_ONBOARDING_SCRIPT,
  spawn = defaultGitSpawn, allowAppliedReplay = false, coordinatorSourced = false,
} = {}) {
  if (!isAbsolute(onboardingScript)) fail("KICKOFF-PROMOTION-PLAN", "onboarding script must be absolute");
  const input = promotionInput({ profile, featureId, planPath, prdPath, specPath, designInputPath });
  const observed = observeDetailed({ rootDir, repositoryCapability, spawn });
  if (coordinatorSourced) {
    return buildCoordinatorSourcedPromotionPlan({
      input, observed, profile: input.profile, runner, repositoryCapability, onboardingScript, allowAppliedReplay, spawn,
    });
  }
  if (observed.continuity.status !== "valid") fail("KICKOFF-PROMOTION-STATE", "promotion requires valid continuity");
  const kickoff = recognisedKickoff(observed, spawn);
  if (kickoff === null && allowAppliedReplay) {
    const entries = observed.history?.transactions;
    const entry = entries?.at(-1);
    // Reconstructing what an already-applied promotion's plan looked like is
    // never a new admission decision -- the PRD was admitted once, at its own
    // plan time, and that decision is not re-litigated by replaying history.
    const authority = promotionArtifacts(observed.root, input, { checkMarkers: false });
    if (entries?.length !== 2 || entry?.kind !== "kickoff-promotion"
      || entry.profile !== input.profile || entry.featureId !== input.featureId
      || entry.planPath !== input.planPath || entry.specPath !== input.specPath
      || entry.prdSha256 !== authority.prd.sha256
      || entry.specSha256 !== authority.spec.sha256 || entry.designInputPath !== input.designInputPath
      || entry.designInputSha256 !== authority.designInput.sha256 || entry.afterStateSha256 !== observed.stateObservation.sha256
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
        // Keyed off the recorded transaction, exactly like `cleanupBinding` beside
        // it, and for the same reason: a promotion applied before the handover
        // target existed recorded no handover, and reconstructing one for it would
        // change its plan digest and make its own replay fail. Only a promotion
        // that actually wrote a handover replays with one.
        ...(entry.handover === undefined ? {} : { handover: replayHandoverTarget(entry, input, authority) }),
        ...(entry.cleanupBinding === undefined ? {} : { cleanupBinding: structuredClone(entry.cleanupBinding) }),
      },
      transactionSha256: entry.transactionSha256, onboardingScript,
      runner,
    };
    const planSha256 = canonicalSha256(binding);
    const applyAction = promotionApplyAction(onboardingScript, observed.root, input.profile, input.featureId, input.planPath, input.prdPath, input.specPath, input.designInputPath, planSha256, runner);
    const plan = { ...binding, planSha256, applyAction, nextAction: applyAction };
    validatePromotionPlan(plan);
    return plan;
  }
  if (kickoff === null) {
    fail("KICKOFF-PROMOTION-NOT-SEED", "promotion requires the exact unapproved kickoff seed");
  }
  // This branch is shared by genuine plan-building (allowAppliedReplay false,
  // the plan-time admission decision Piece 1 exists to make) and by
  // reconstructing an apply-time comparison plan for a promotion that has not
  // happened yet (allowAppliedReplay true). Only the former is an admission
  // decision; the latter must compare against current bytes without
  // re-deciding admissibility, so a drifted Spec is reported as a stale plan
  // (KICKOFF-PROMOTION-PLAN-DIGEST, compared next in applyOnboardingKickoffPromotion)
  // rather than as a PRD defect that invites editing an already-bound PRD.
  const authority = promotionArtifacts(observed.root, input, { checkMarkers: !allowAppliedReplay });
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
  // THE PROMOTION IS THE TRANSACTION THAT LEARNS THE ANSWER. `kickoffLanguage()`
  // deliberately freezes the historical English seed, because at kickoff time no
  // portable source exists yet -- so a PO who answers "German" after the kickoff
  // has their answer land in the PROMOTED PRD's marker, which this transaction
  // binds, while `continuity.runtime` still carried the pre-answer default. One
  // transaction then emitted a PRD saying `de` and a state saying `en`, observed
  // in the PO's 2026-08-09 Claude greenfield run alongside a `pipeline.user.yaml`
  // and a `project/pipeline.yaml` that both already said `de`.
  //
  // The stored value being wrong is worse than a rendering being wrong: it is what
  // `planApproval.poGateAuthority.humanFacing` is later derived from, so a PO who
  // answered German was headed for an approval ceremony in English -- and it is
  // the near end of the chain whose far end refused `submit-plan` with
  // PO-GATE-PRD-LANGUAGE-MISMATCH in that same run.
  if (new Set(["de", "en"]).has(authority.poLanguage)) {
    next.continuity.runtime = { ...next.continuity.runtime, humanFacingLanguage: authority.poLanguage };
  } else if (authority.poLanguage !== null) {
    next.continuity.runtime = { ...next.continuity.runtime, documentLanguage: authority.poLanguage };
  }
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
  // The handover the promotion writes over the kickoff's. `null` before-digest is
  // an absent file, which the apply path treats exactly as the kickoff's own
  // handover target does. The content is a pure function of the plan's own inputs,
  // so the replay branch above can reconstruct it byte for byte from the recorded
  // transaction without storing prose in the history.
  const handoverContentBytes = promotionHandoverContent({
    featureId: input.featureId, prdPath: authority.prd.path, specPath: authority.spec.path,
    designInputPath: authority.designInput.path, profile: input.profile,
  });
  const handoverTarget = {
    path: observed.handoverPath,
    beforeSha256: observed.handoverObservation.sha256,
    afterSha256: sha256(Buffer.from(handoverContentBytes, "utf8")),
    content: handoverContentBytes,
  };
  const transaction = {
    schema: "pipeline.codex-onboarding-kickoff-promotion-transaction.v1",
    root: observed.root, repositoryCapability, profile: input.profile, feature: { id: input.featureId, planPath: input.planPath },
    kickoffTransactionSha256: kickoff.transactionSha256, beforeStateSha256, afterStateSha256,
    prdSha256: authority.prd.sha256, specPath: authority.spec.path, specSha256: authority.spec.sha256,
    designInputPath: authority.designInput.path, designInputSha256: authority.designInput.sha256,
    handover: { path: handoverTarget.path, beforeSha256: handoverTarget.beforeSha256, afterSha256: handoverTarget.afterSha256 },
  };
  const transactionSha256 = canonicalSha256(transaction);
  const history = {
    schema: KICKOFF_HISTORY_SCHEMA,
    transactions: [...kickoff.history.transactions, {
      kind: "kickoff-promotion", transactionSha256, previousTransactionSha256: kickoff.transactionSha256, kickoffFeatureId: kickoff.state.activeFeature.id,
      profile: input.profile, featureId: input.featureId, planPath: input.planPath,
      specPath: input.specPath,
      prdSha256: authority.prd.sha256, specSha256: authority.spec.sha256,
      designInputPath: authority.designInput.path, designInputSha256: authority.designInput.sha256,
      beforeStateSha256, afterStateSha256,
      handover: { path: handoverTarget.path, beforeSha256: handoverTarget.beforeSha256, afterSha256: handoverTarget.afterSha256 },
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
      handover: handoverTarget,
      ...(cleanupBindingTarget === null ? {} : { cleanupBinding: cleanupBindingTarget }),
    },
    transactionSha256, onboardingScript,
    runner,
  };
  const planSha256 = canonicalSha256(binding);
  const applyAction = promotionApplyAction(onboardingScript, observed.root, input.profile, input.featureId, input.planPath, input.prdPath, input.specPath, input.designInputPath, planSha256, runner);
  const plan = {
    ...binding, planSha256, applyAction, nextAction: applyAction,
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

// ---------------------------------------------------------------------------
// Intake checkpoint (Wave 4 onboarding coordinator, steps 1-3 --
// specs/wave4-onboarding-coordinator/design.md SSa.1/SSa.2/SSa.5/SSc.1).
//
// A private, restart-resilient checkpoint that records consent, restart-
// resilient values (git author/language/profile), lossless material-input
// evidence, and the one bundled design-question round -- BEFORE any
// provisional kickoff artifact is ever written. Lives beside
// continuity-history.json/session-cleanup-binding.json under the same
// resolvePrivate() directory, reuses the SAME writeExclusiveSynced() +
// acquireLock()/releaseLock() primitives this file already uses for those
// two files -- never a new atomicity mechanism (SSc.1).
//
// Scope: steps 1-3 only (intake-consent-apply, intake-capture-apply,
// intake-design-questions-apply -- NVA-W4-COORD-1). Steps 4-6 (staging
// generation, binding, v4Inspection wiring, CLI retirement) are a
// deliberate, separate follow-up: this module never reaches
// "generated"/"bound" and never touches applyOnboardingKickoffPromotion.
// NVA-W4-COORD-1 also found design SSb's claim that no
// guard-lifecycle-ready.mjs change is needed FALSE for these mutating
// commands (sanctionedOnboardingArgs() hand-lists every mutating onboarding
// subcommand's exact argv shape; GUARDDERIVE-1's derived admission only ever
// covers `mutates: false` commands) -- the guard admission gap is a named,
// separate open item for a follow-up dispatch, not fixed here.

export const INTAKE_CHECKPOINT_SCHEMA = "pipeline.onboarding-intake-checkpoint.v1";
export const INTAKE_CHECKPOINT_BASENAME = "intake-checkpoint.json";
export const INTAKE_CHECKPOINT_EVIDENCE_DIRNAME = "intake-checkpoint-evidence";
export const INTAKE_CONSENT_APPLY_SCHEMA = "pipeline.onboarding-intake-consent-apply.v1";
export const INTAKE_CAPTURE_APPLY_SCHEMA = "pipeline.onboarding-intake-capture-apply.v1";
export const INTAKE_DESIGN_QUESTIONS_APPLY_SCHEMA = "pipeline.onboarding-intake-design-questions-apply.v1";
const INTAKE_CHECKPOINT_LOCK_BASENAME = ".intake-checkpoint.lock";
const INTAKE_CHECKPOINT_LOCK_SCHEMA = "pipeline.onboarding-intake-checkpoint-lock.v1";
const INTAKE_TRANSACTION_STATES = new Set([
  "collecting", "design-questions-pending", "ready-to-generate", "generated", "bound",
]);
const INTAKE_LANGUAGES = new Set(["de", "en"]);
const INTAKE_PROFILES = new Set(["epic", "feature", "mini"]);
// Generous, not resume-hint's 4 KB cap: the checkpoint is private and never
// git-tracked (SSa.1), but a per-chunk ceiling still exists so a single
// malformed/runaway capture cannot grow the private directory unbounded.
const INTAKE_MAX_MATERIAL_BYTES = 1_000_000;

class SimulatedIntakeCrash extends Error {}

function validIntakeGitAuthor(value) {
  return value === null || (exactKeys(value, new Set(["name", "email"]))
    && typeof value.name === "string" && value.name.trim().length > 0
    && typeof value.email === "string" && value.email.trim().length > 0);
}

function validIntakeValues(value) {
  return exactKeys(value, new Set(["gitAuthor", "language", "profile"]))
    && validIntakeGitAuthor(value.gitAuthor)
    && (value.language === null || INTAKE_LANGUAGES.has(value.language))
    && (value.profile === null || INTAKE_PROFILES.has(value.profile));
}

function validIntakeConsent(value) {
  return value === null || (exactKeys(value, new Set(["granted", "at"]))
    && value.granted === true && canonicalIsoTimestamp(value.at));
}

function validIntakeMaterialInputEntry(entry) {
  return exactKeys(entry, new Set(["sha256", "evidencePath", "byteLength", "receivedAt"]))
    && SHA256_RE.test(entry.sha256)
    && entry.evidencePath === `${INTAKE_CHECKPOINT_EVIDENCE_DIRNAME}/${entry.sha256}.txt`
    && Number.isSafeInteger(entry.byteLength) && entry.byteLength >= 0
    && canonicalIsoTimestamp(entry.receivedAt);
}

function validIntakeDesignQuestionEntry(entry) {
  return exactKeys(entry, new Set(["question", "answer", "answeredAt"]))
    && typeof entry.question === "string" && entry.question.trim().length > 0
    && typeof entry.answer === "string" && entry.answer.trim().length > 0
    && canonicalIsoTimestamp(entry.answeredAt);
}

function validIntakeGenerated(value) {
  return value === null || (exactKeys(value, new Set(["designInputSha256", "prdSha256", "specSha256", "generatedAt"]))
    && SHA256_RE.test(value.designInputSha256) && SHA256_RE.test(value.prdSha256)
    && SHA256_RE.test(value.specSha256) && canonicalIsoTimestamp(value.generatedAt));
}

function validateIntakeCheckpoint(root, value) {
  if (!exactKeys(value, new Set([
    "schema", "root", "revision", "createdAt", "updatedAt", "consent", "values",
    "materialInput", "designQuestions", "transactionState", "generated", "contentSha256",
  ]))) return false;
  if (value.schema !== INTAKE_CHECKPOINT_SCHEMA || value.root !== root) return false;
  if (!Number.isSafeInteger(value.revision) || value.revision < 0) return false;
  if (!canonicalIsoTimestamp(value.createdAt) || !canonicalIsoTimestamp(value.updatedAt)) return false;
  if (!validIntakeConsent(value.consent) || !validIntakeValues(value.values)) return false;
  if (!Array.isArray(value.materialInput) || !value.materialInput.every(validIntakeMaterialInputEntry)) return false;
  if (value.designQuestions !== null && (!Array.isArray(value.designQuestions)
    || value.designQuestions.length === 0
    || !value.designQuestions.every(validIntakeDesignQuestionEntry))) return false;
  if (!INTAKE_TRANSACTION_STATES.has(value.transactionState)) return false;
  if (!validIntakeGenerated(value.generated)) return false;
  if (!SHA256_RE.test(value.contentSha256)) return false;
  const { contentSha256, ...unsigned } = value;
  return canonicalSha256(unsigned) === contentSha256;
}

function defaultIntakeCheckpoint(root, nowIso) {
  const unsigned = {
    schema: INTAKE_CHECKPOINT_SCHEMA,
    root,
    revision: 0,
    createdAt: nowIso,
    updatedAt: nowIso,
    consent: null,
    values: { gitAuthor: null, language: null, profile: null },
    materialInput: [],
    designQuestions: null,
    transactionState: "collecting",
    generated: null,
  };
  return { ...unsigned, contentSha256: canonicalSha256(unsigned) };
}

export function resolveIntakeCheckpointPaths({
  rootDir, repositoryCapability = "local", spawn = defaultGitSpawn, create = false,
} = {}) {
  const root = physicalRoot(rootDir);
  const privatePaths = resolvePrivate(root, repositoryCapability, { create, spawn });
  return {
    root,
    directory: privatePaths.directory,
    checkpoint: join(privatePaths.directory, INTAKE_CHECKPOINT_BASENAME),
    evidenceDirectory: join(privatePaths.directory, INTAKE_CHECKPOINT_EVIDENCE_DIRNAME),
    lock: join(privatePaths.directory, INTAKE_CHECKPOINT_LOCK_BASENAME),
  };
}

function readIntakeCheckpointRaw(path) {
  if (!existsSync(path)) return { status: "absent", value: null, sha256: null };
  const raw = readPhysicalFile(path, "intake checkpoint");
  let value;
  try {
    value = JSON.parse(raw.toString("utf8"));
  } catch {
    fail("INTAKE-CHECKPOINT-MALFORMED", "intake checkpoint is malformed");
  }
  return { status: "present", value, sha256: sha256(raw) };
}

export function readOnboardingIntakeCheckpoint({
  rootDir, repositoryCapability = "local", spawn = defaultGitSpawn,
} = {}) {
  const paths = resolveIntakeCheckpointPaths({ rootDir, repositoryCapability, spawn, create: false });
  const observed = readIntakeCheckpointRaw(paths.checkpoint);
  if (observed.status === "present" && !validateIntakeCheckpoint(paths.root, observed.value)) {
    fail("INTAKE-CHECKPOINT-MALFORMED", "intake checkpoint is malformed");
  }
  return { paths, ...observed };
}

/**
 * NVA-RESUMEVERBATIM-1: read-side companion to readOnboardingIntakeCheckpoint()
 * above -- resolves each captured material-input entry back to its actual
 * bytes via the checkpoint's own content-addressed evidence store
 * (writeIntakeCheckpointEvidence/readIntakeMaterialInputChunks below,
 * reused unchanged), re-verifying each blob's sha256 against the checkpoint
 * entry that references it. An absent checkpoint is not an error: mirrors
 * readOnboardingIntakeCheckpoint()'s own "status: absent" shape with an
 * empty chunk list, so a caller (scripts/resume-hint.mjs's `inspect`) can
 * call this unconditionally, including before any intake capture has ever
 * happened.
 */
export function readOnboardingIntakeMaterialInput({
  rootDir, repositoryCapability = "local", spawn = defaultGitSpawn,
} = {}) {
  const observed = readOnboardingIntakeCheckpoint({ rootDir, repositoryCapability, spawn });
  if (observed.status !== "present") return { status: observed.status, chunks: [] };
  return { status: "present", chunks: readIntakeMaterialInputChunks(observed.paths, observed.value) };
}

function ensureIntakeEvidenceDirectory(paths) {
  if (existsSync(paths.evidenceDirectory)) return;
  mkdirSync(paths.evidenceDirectory, { mode: 0o700 });
  fsyncDirectory(paths.directory);
}

/**
 * Content-addressed, single-target atomic write for one material-input
 * evidence blob. Idempotent by construction: identical bytes always resolve
 * to the identical path, so a retry after a crash (or a benign race with
 * another writer) converges on the same file rather than writing twice.
 */
function writeIntakeCheckpointEvidence(paths, bytes, deps = {}) {
  ensureIntakeEvidenceDirectory(paths);
  const digest = sha256(bytes);
  const target = join(paths.evidenceDirectory, `${digest}.txt`);
  const fault = (point) => {
    if (deps.crashAt === point) throw new SimulatedIntakeCrash(point);
    (deps.fault ?? (() => {}))(point);
  };
  if (existsSync(target)) {
    if (sha256(readPhysicalFile(target, "intake checkpoint evidence")) !== digest) {
      fail("INTAKE-EVIDENCE-CONFLICT", "intake checkpoint evidence content changed");
    }
    return { sha256: digest, byteLength: bytes.length, path: target, wrote: false };
  }
  const suffixSource = (deps.randomUUID ?? randomUUID)();
  if (typeof suffixSource !== "string" || !/^[a-f0-9-]{32,64}$/iu.test(suffixSource)) {
    fail("INTAKE-CHECKPOINT-RANDOM-UNAVAILABLE", "intake checkpoint temporary-name source is invalid");
  }
  const temporary = join(paths.evidenceDirectory, `.${digest}.intake-${suffixSource.replaceAll("-", "")}.tmp`);
  let temporaryRecord;
  let renamed = false;
  try {
    temporaryRecord = writeExclusiveSynced(temporary, bytes, 0o600);
    fault("evidence-temp-fsync");
    if (existsSync(target)) {
      try { unlinkOwned(temporaryRecord); } catch {}
      temporaryRecord = null;
      return { sha256: digest, byteLength: bytes.length, path: target, wrote: false };
    }
    renameSync(temporary, target);
    temporaryRecord = null;
    renamed = true;
    fault("evidence-rename");
    fsyncDirectory(paths.evidenceDirectory);
    fault("evidence-directory-fsync");
    return { sha256: digest, byteLength: bytes.length, path: target, wrote: true };
  } catch (error) {
    if (error instanceof SimulatedIntakeCrash) {
      throw new KickoffError("INTAKE-CHECKPOINT-SIMULATED-CRASH", `simulated crash at ${error.message}`, {
        committed: renamed ? true : (temporaryRecord ? null : false),
      });
    }
    if (temporaryRecord) { try { unlinkOwned(temporaryRecord); } catch {} }
    if (error instanceof KickoffError) throw error;
    fail("INTAKE-EVIDENCE-WRITE-FAILED", "intake checkpoint evidence write failed");
  }
}

/**
 * Single-target CAS write shared by every intake-checkpoint mutation. Reuses
 * writeExclusiveSynced()/fsyncDirectory()/acquireLock()/releaseLock()
 * unchanged (SSc.1); the only new thing is the fault-hook granularity
 * (temp-fsync/rename/directory-fsync per write call site) the crash-injection
 * tests assert against.
 *
 * `mutate(observed)` receives the freshest on-disk observation and returns
 * either `null` (nothing to change -- idempotent no-op, never writes) or the
 * next UNSIGNED record (no contentSha256). It is called TWICE: once unlocked
 * (to decide whether a lock is even worth acquiring) and once again under the
 * lock against a fresh re-observation, so a writer that mutates the checkpoint
 * between the two observations is caught as CAS drift rather than silently
 * overwritten.
 */
function applyIntakeCheckpointMutation({
  rootDir, repositoryCapability = "local", deps = {}, mutate,
} = {}) {
  const spawn = deps.spawn ?? defaultGitSpawn;
  const initialPaths = resolveIntakeCheckpointPaths({ rootDir, repositoryCapability, spawn, create: false });
  const initial = readIntakeCheckpointRaw(initialPaths.checkpoint);
  if (mutate(initial) === null) return { mutated: false, paths: initialPaths, value: initial.value };

  const paths = resolveIntakeCheckpointPaths({ rootDir, repositoryCapability, spawn, create: true });
  const lockOptions = { nowMs: deps.nowMs ?? Date.now, lockStaleMs: deps.lockStaleMs ?? 30_000 };
  const token = `intake-checkpoint-${sha256(Buffer.from(paths.checkpoint, "utf8")).slice(0, 32)}`;
  const lock = acquireLock(paths.lock, INTAKE_CHECKPOINT_LOCK_SCHEMA, token, lockOptions);
  const fault = (point) => {
    if (deps.crashAt === point) throw new SimulatedIntakeCrash(point);
    (deps.fault ?? (() => {}))(point);
  };
  let temporaryRecord;
  let committed = false;
  let simulatedCrash = false;
  try {
    fault("cas-recheck");
    const current = readIntakeCheckpointRaw(paths.checkpoint);
    if (current.status !== initial.status
      || (current.status === "present" && current.sha256 !== initial.sha256)) {
      fail("INTAKE-CHECKPOINT-CAS-DRIFT", "intake checkpoint preimage changed");
    }
    const next = mutate(current);
    if (next === null) return { mutated: false, paths, value: current.value };
    const record = { ...next, contentSha256: canonicalSha256(next) };
    if (!validateIntakeCheckpoint(paths.root, record)) {
      fail("INTAKE-CHECKPOINT-INVALID", "intake checkpoint write would be malformed");
    }
    const bytes = Buffer.from(`${JSON.stringify(record, null, 2)}\n`, "utf8");
    const suffixSource = (deps.randomUUID ?? randomUUID)();
    if (typeof suffixSource !== "string" || !/^[a-f0-9-]{32,64}$/iu.test(suffixSource)) {
      fail("INTAKE-CHECKPOINT-RANDOM-UNAVAILABLE", "intake checkpoint temporary-name source is invalid");
    }
    const temporary = join(
      paths.directory,
      `.${INTAKE_CHECKPOINT_BASENAME}.intake-${suffixSource.replaceAll("-", "")}.tmp`,
    );
    temporaryRecord = writeExclusiveSynced(temporary, bytes, 0o600);
    fault("temp-fsync");
    if (current.status === "present"
      ? sha256(readPhysicalFile(paths.checkpoint, "intake checkpoint")) !== current.sha256
      : existsSync(paths.checkpoint)) {
      fail("INTAKE-CHECKPOINT-CAS-DRIFT", "intake checkpoint preimage changed before publish");
    }
    renameSync(temporary, paths.checkpoint);
    temporaryRecord = null;
    committed = true;
    fault("rename");
    fsyncDirectory(paths.directory);
    fault("directory-fsync");
    const readback = readIntakeCheckpointRaw(paths.checkpoint);
    if (readback.status !== "present" || readback.sha256 !== sha256(bytes)
      || canonicalJson(readback.value) !== canonicalJson(record)) {
      fail("INTAKE-CHECKPOINT-READBACK-INVALID", "intake checkpoint readback is invalid", { committed: true });
    }
    return { mutated: true, paths, value: readback.value };
  } catch (error) {
    if (error instanceof SimulatedIntakeCrash) {
      simulatedCrash = true;
      throw new KickoffError(
        "INTAKE-CHECKPOINT-SIMULATED-CRASH",
        `simulated crash at ${error.message}`,
        { committed: committed ? true : (temporaryRecord ? null : false) },
      );
    }
    if (!committed && temporaryRecord) {
      try { unlinkOwned(temporaryRecord); } catch {}
    }
    if (error instanceof KickoffError) throw error;
    fail("INTAKE-CHECKPOINT-WRITE-FAILED", "intake checkpoint write failed before commit", { committed });
  } finally {
    if (!simulatedCrash && !releaseLock(lock)) {
      // A retained lock fails the next writer closed, same disposition as
      // every other lock in this file.
    }
  }
}

/**
 * Step 1: captures consent + any still-missing required values (git
 * author/language/profile) in one bundled ask. Idempotent: safe to re-run,
 * only fills fields still null (design SSa.5 point 1).
 *
 * NVA-V10B-INTAKEONEROUND: `text` is an additional, optional parameter -- the same already-
 * resolved material-input string `applyOnboardingIntakeCapture` accepts (resolution of
 * --text vs. --text-file, and the "never both" caller-error check, both stay CLI-side in
 * resolveIntakeCaptureText(), scripts/project-onboarding-v3.mjs; this function only ever sees
 * a single resolved string or nothing). Omitted (`null`/`undefined`), this function's
 * behaviour and returned shape are IDENTICAL to before this change. Supplied, the consent
 * mutation below still runs and commits FIRST -- required, because
 * applyOnboardingIntakeCapture refuses INTAKE-CAPTURE-CONSENT-REQUIRED until consent is
 * durably recorded -- and this function then calls applyOnboardingIntakeCapture itself
 * (reused, never reimplemented: same evidence-before-checkpoint ordering, same
 * content-addressed convergence) to append that first chunk in the same call. If the capture
 * step then throws, consent stays durably recorded (itself idempotent, so a retry re-running
 * consent is a harmless no-op) and nothing about the checkpoint is left inconsistent: a
 * retry -- whether a second call to this function with corrected text, or a plain
 * intake-capture-apply call -- converges exactly as it would have from two separate calls.
 */
export function applyOnboardingIntakeConsent({
  rootDir, repositoryCapability = "local", granted, gitAuthor = null, language = null,
  profile = null, text = null, activate = false, deps = {},
} = {}) {
  if (activate !== true) fail("INTAKE-CONSENT-ACTIVATION-REQUIRED", "intake consent apply requires explicit activation");
  if (granted !== true) fail("INTAKE-CONSENT-REQUIRED", "intake consent apply requires explicit affirmative consent");
  if (gitAuthor !== null && !validIntakeGitAuthor(gitAuthor)) fail("INTAKE-CONSENT-INVALID-GIT-AUTHOR", "candidate git author is invalid");
  if (language !== null && !INTAKE_LANGUAGES.has(language)) fail("INTAKE-CONSENT-INVALID-LANGUAGE", "candidate language is invalid");
  if (profile !== null && !INTAKE_PROFILES.has(profile)) fail("INTAKE-CONSENT-INVALID-PROFILE", "candidate profile is invalid");
  const nowIso = deps.now ? deps.now() : new Date().toISOString();
  const result = applyIntakeCheckpointMutation({
    rootDir, repositoryCapability, deps,
    mutate: (observed) => {
      const base = observed.status === "present" ? observed.value : defaultIntakeCheckpoint(physicalRoot(rootDir), nowIso);
      const nextConsent = base.consent ?? { granted: true, at: nowIso };
      const nextValues = {
        gitAuthor: base.values.gitAuthor ?? gitAuthor,
        language: base.values.language ?? language,
        profile: base.values.profile ?? profile,
      };
      if (observed.status === "present"
        && canonicalJson(nextConsent) === canonicalJson(base.consent)
        && canonicalJson(nextValues) === canonicalJson(base.values)) return null;
      const { contentSha256: dropSha, ...baseUnsigned } = base;
      void dropSha;
      return {
        ...baseUnsigned,
        revision: observed.status === "present" ? base.revision + 1 : base.revision,
        updatedAt: nowIso,
        consent: nextConsent,
        values: nextValues,
      };
    },
  });
  const consentOutput = { schema: INTAKE_CONSENT_APPLY_SCHEMA, root: result.paths.root, mutated: result.mutated, checkpoint: result.value };
  if (text === null || text === undefined) return consentOutput;
  const captureResult = applyOnboardingIntakeCapture({ rootDir, repositoryCapability, text, activate, deps });
  return {
    ...consentOutput,
    mutated: consentOutput.mutated || captureResult.mutated,
    checkpoint: captureResult.checkpoint,
    capture: { mutated: captureResult.mutated, evidence: captureResult.evidence },
  };
}

/**
 * Step 2: appends one material-input chunk as a new evidence file +
 * materialInput entry. Called once per PO message containing requirements;
 * restart-resilient by construction (design SSa.2/SSc.1). The FIRST accepted
 * capture also advances transactionState from "collecting" to
 * "design-questions-pending" (monotonic; never regresses a state that has
 * already moved past that point).
 */
export function applyOnboardingIntakeCapture({
  rootDir, repositoryCapability = "local", text, activate = false, deps = {},
} = {}) {
  if (activate !== true) fail("INTAKE-CAPTURE-ACTIVATION-REQUIRED", "intake capture apply requires explicit activation");
  if (typeof text !== "string" || text.length === 0) fail("INTAKE-CAPTURE-EMPTY", "intake capture requires non-empty material text");
  const bytes = Buffer.from(text, "utf8");
  if (bytes.length > INTAKE_MAX_MATERIAL_BYTES) fail("INTAKE-CAPTURE-TOO-LARGE", "intake capture chunk exceeds the per-chunk byte limit");
  const nowIso = deps.now ? deps.now() : new Date().toISOString();

  // Evidence is written BEFORE the checkpoint entry that references it: a
  // crash between the two leaves an orphaned-but-harmless evidence file,
  // never a checkpoint entry pointing at a missing one. Content-addressed, so
  // a retry converges rather than duplicating.
  const spawn = deps.spawn ?? defaultGitSpawn;
  const paths = resolveIntakeCheckpointPaths({ rootDir, repositoryCapability, spawn, create: true });
  const evidence = writeIntakeCheckpointEvidence(paths, bytes, deps);

  const result = applyIntakeCheckpointMutation({
    rootDir, repositoryCapability, deps,
    mutate: (observed) => {
      const base = observed.status === "present" ? observed.value : defaultIntakeCheckpoint(physicalRoot(rootDir), nowIso);
      if (base.consent === null) fail("INTAKE-CAPTURE-CONSENT-REQUIRED", "material input capture requires consent to already be recorded");
      if (base.materialInput.some((entry) => entry.sha256 === evidence.sha256)) return null;
      const entry = {
        sha256: evidence.sha256,
        evidencePath: `${INTAKE_CHECKPOINT_EVIDENCE_DIRNAME}/${evidence.sha256}.txt`,
        byteLength: evidence.byteLength,
        receivedAt: nowIso,
      };
      const { contentSha256: dropSha, ...baseUnsigned } = base;
      void dropSha;
      return {
        ...baseUnsigned,
        revision: observed.status === "present" ? base.revision + 1 : base.revision,
        updatedAt: nowIso,
        materialInput: [...base.materialInput, entry],
        transactionState: base.transactionState === "collecting" ? "design-questions-pending" : base.transactionState,
      };
    },
  });
  return {
    schema: INTAKE_CAPTURE_APPLY_SCHEMA,
    root: result.paths.root,
    mutated: result.mutated,
    evidence: { sha256: evidence.sha256, byteLength: evidence.byteLength, wrote: evidence.wrote },
    checkpoint: result.value,
  };
}

/**
 * Step 3: writes the ONE bundled design-question round's answers into
 * designQuestions, flips transactionState to "ready-to-generate" (design
 * SSa.5 point 3). Requires at least one captured material-input chunk
 * (transactionState already "design-questions-pending") and existing
 * consent. Idempotent only for an exact replay of the same already-answered
 * round; a different answer set after the round is already answered is
 * refused rather than silently overwritten -- the round is asked exactly
 * once.
 */
export function applyOnboardingIntakeDesignQuestions({
  rootDir, repositoryCapability = "local", answers, activate = false, deps = {},
} = {}) {
  if (activate !== true) fail("INTAKE-DESIGN-QUESTIONS-ACTIVATION-REQUIRED", "intake design-questions apply requires explicit activation");
  if (!Array.isArray(answers) || answers.length === 0) fail("INTAKE-DESIGN-QUESTIONS-EMPTY", "intake design-questions apply requires at least one question/answer pair");
  const nowIso = deps.now ? deps.now() : new Date().toISOString();
  const candidateEntries = answers.map((entry) => ({
    question: entry?.question,
    answer: entry?.answer,
    answeredAt: nowIso,
  }));
  if (!candidateEntries.every(validIntakeDesignQuestionEntry)) {
    fail("INTAKE-DESIGN-QUESTIONS-INVALID", "intake design-question entries are invalid");
  }
  const result = applyIntakeCheckpointMutation({
    rootDir, repositoryCapability, deps,
    mutate: (observed) => {
      if (observed.status !== "present") fail("INTAKE-DESIGN-QUESTIONS-PRECONDITION", "intake design questions require an existing checkpoint");
      const base = observed.value;
      if (base.consent === null) fail("INTAKE-DESIGN-QUESTIONS-CONSENT-REQUIRED", "intake design questions require consent to already be recorded");
      if (["ready-to-generate", "generated", "bound"].includes(base.transactionState)) {
        // Compare question/answer content only, never `answeredAt`: a genuine
        // replay call is issued at a DIFFERENT wall-clock time than the
        // original (a fresh `nowIso` per call, by construction), so comparing
        // the full entry -- timestamp included -- would make every real
        // replay look like a content change and wrongly refuse it.
        const sameContent = (a, b) => a.length === b.length
          && a.every((entry, index) => entry.question === b[index].question && entry.answer === b[index].answer);
        if (base.designQuestions !== null && sameContent(base.designQuestions, candidateEntries)) return null;
        fail("INTAKE-DESIGN-QUESTIONS-ALREADY-ANSWERED", "the one bundled design-question round was already answered with different content");
      }
      if (base.transactionState !== "design-questions-pending") {
        fail("INTAKE-DESIGN-QUESTIONS-PRECONDITION", "intake design questions require at least one captured material-input chunk first");
      }
      const { contentSha256: dropSha, ...baseUnsigned } = base;
      void dropSha;
      return {
        ...baseUnsigned,
        revision: base.revision + 1,
        updatedAt: nowIso,
        designQuestions: candidateEntries,
        transactionState: "ready-to-generate",
      };
    },
  });
  return { schema: INTAKE_DESIGN_QUESTIONS_APPLY_SCHEMA, root: result.paths.root, mutated: result.mutated, checkpoint: result.value };
}

// ---------------------------------------------------------------------------
// Intake staging generation (Wave 4 onboarding coordinator, step 4 --
// specs/wave4-onboarding-coordinator/design.md SSa.5 point 4 / SSc.2 --
// NVA-W4-COORD-2). Deterministically derives design-input.md/prd_<id>.md/
// spec.md staging bytes as a PURE function of the intake checkpoint's own
// already-durable content -- no enumerated fault-stage list is needed (SSc.2):
// a crash at any point still leaves a state from which the NEXT
// intake-generate-apply call safely re-derives the identical bytes and either
// no-ops (already matching) or converges (write-if-different corrects them).
// Staging is never authoritative; binding (step 5, bootstrap-bind-*) is a
// separate, later dispatch this module does not implement or call into.

export const INTAKE_GENERATE_PLAN_SCHEMA = "pipeline.onboarding-intake-generate-plan.v1";
export const INTAKE_GENERATE_APPLY_SCHEMA = "pipeline.onboarding-intake-generate-apply.v1";
// NVA-INTAKESPECS-1 (PO decision 2026-08-27). The generated design package is written
// straight into `specs/<featureId>/` -- the location ADR-0045 and roles/elephant.md already
// name -- instead of a separate `project/.onboarding-staging/` holding area.
//
// The holding area was not merely a misplaced directory. It created a second, parallel notion
// of "the design documents", which produced three defects at once, all observed live on
// 2026-08-27: the plan-approval route bound the pre-authority draft AS the authority while
// its own banner said it must not be (backlog:
// 2026-08-27-plan-approval-binds-a-staging-draft-as-project-authority.md); GS-15 then had to
// protect that directory from the very agent whose job was to author it, which deadlocked the
// greenfield happy path until NVA-GS15-1 stood the rule down again; and a promotion step
// existed on one route and not the other, so which route a project took decided whether the
// PRD/Spec quality bar applied at all. Writing to the real location from the start removes the
// distinction instead of adding a guard against getting it wrong.
export function intakeDesignDirname(featureId) {
  return `specs/${featureId}`;
}

// NVA-INTAKESPECS-1: nothing GENERATES here any more -- new projects get `specs/<featureId>/`
// from intakeDesignDirname() above. This constant is retained for projects onboarded BEFORE
// that change, which still carry their PRD/Spec at this path and may have it bound as project
// authority. GS-15 keeps protecting it and onboarding-staging-authoring.mjs keeps admitting the
// authoring write for it, so an existing project stays both defended and workable.
//
// It is therefore NOT dead code awaiting a sweep. Removing it, GS-15, and the legacy branch in
// onboarding-staging-authoring.mjs would leave every already-onboarded project's design package
// simultaneously unprotected and unwritable. Retire them only once no supported project can
// still carry the old layout -- which is a migration decision, not a cleanup.
export const INTAKE_STAGING_DIRNAME = "project/.onboarding-staging";
// Exported so guard-lifecycle-ready.mjs's narrow bootstrap-binding-required
// staging-authoring admission (NVA-BL-INTAKEBIND-1) can recognize a real
// `prd_<featureId>.md` target by the exact shape deriveIntakeFeatureId()
// below produces, without re-deriving or independently guessing it -- single
// source of truth for the shape, mirroring how INTAKE_STAGING_DIRNAME above
// is already shared the same way.
export const INTAKE_FEATURE_ID_PATTERN = /^onboarding-[a-f0-9]{12}$/u;
const INTAKE_GENERATE_READY_STATES = new Set(["ready-to-generate", "generated"]);

class SimulatedIntakeGenerateCrash extends Error {}

// Stable across every regeneration: createdAt is written once by
// defaultIntakeCheckpoint() and never rewritten by any mutation (SSa.1/SSa.2),
// so re-deriving the same checkpoint at any later revision always yields the
// same featureId -- staging never accumulates orphaned prd_<old-id>.md files
// as later captures/answers change the checkpoint's other fields. Design SSb
// names "prd_<id>.md" without resolving where <id> comes from; this
// derivation is the implementation-time design choice that resolves it
// (reported as a deviation, per the briefing's stop-condition guidance).
function deriveIntakeFeatureId(checkpoint) {
  return `onboarding-${sha256(Buffer.from(checkpoint.createdAt, "utf8")).slice(0, 12)}`;
}

// The staging plan/content must be a pure function of the fields that
// actually determine what gets rendered (consent/values/materialInput/
// designQuestions) -- NEVER checkpoint.contentSha256, .revision, or
// .updatedAt directly. Those three change as a side effect of recording
// `generated` on the checkpoint itself (applyOnboardingIntakeGenerate's own
// mutation bumps revision/updatedAt, which changes contentSha256), so basing
// the plan digest or the rendered banner on them would make the very act of
// applying a generate change what the next plan/apply computes -- an
// observer-effect bug that defeats "two calls against the same intake data
// always produce the identical plan" (this file's own stated invariant just
// above buildOnboardingIntakeGeneratePlan). This digest intentionally
// excludes revision/updatedAt/generated/transactionState for exactly that
// reason; transactionState is gated separately (INTAKE_GENERATE_READY_STATES)
// and does not affect rendered content.
function intakeDataSha256(checkpoint) {
  return canonicalSha256({
    consent: checkpoint.consent,
    values: checkpoint.values,
    materialInput: checkpoint.materialInput,
    designQuestions: checkpoint.designQuestions,
  });
}

function readIntakeMaterialInputChunks(paths, checkpoint) {
  return checkpoint.materialInput.map((entry) => {
    const absolute = join(paths.directory, entry.evidencePath);
    const bytes = readPhysicalFile(absolute, "intake checkpoint evidence");
    if (sha256(bytes) !== entry.sha256) {
      fail("INTAKE-GENERATE-EVIDENCE-MISMATCH", "intake checkpoint evidence content changed since capture");
    }
    return { sha256: entry.sha256, byteLength: entry.byteLength, receivedAt: entry.receivedAt, text: bytes.toString("utf8") };
  });
}

function renderIntakeMaterialInputSection(chunks) {
  if (chunks.length === 0) return "(no material input captured)\n";
  return chunks.map((chunk, index) => [
    `### Chunk ${index + 1} -- sha256:${chunk.sha256}, ${chunk.byteLength} bytes, received ${chunk.receivedAt}`,
    "",
    chunk.text.endsWith("\n") ? chunk.text : `${chunk.text}\n`,
  ].join("\n")).join("\n");
}

function renderIntakeDesignQuestionsSection(designQuestions) {
  if (!designQuestions || designQuestions.length === 0) return "(no design questions answered)\n";
  return designQuestions.map((entry, index) => [
    `### Q${index + 1}: ${entry.question}`,
    "",
    `A: ${entry.answer}`,
  ].join("\n")).join("\n\n");
}

// The banner and section headers below reference only the STABLE intake-data
// digest (intakeDataSha256) -- NEVER checkpoint.revision/.updatedAt directly,
// and never the apply call's own wall-clock time. Both would make every
// call's content differ from the last (revision/updatedAt shift as a side
// effect of the generate-apply's own checkpoint write; a fresh timestamp
// shifts on every call by construction), defeating write-if-different and
// turning a true no-op replay into a write every time.
function intakeStagingGeneratedBanner(checkpoint) {
  return [
    "<!-- GENERATED by intake-generate-apply from the onboarding intake checkpoint.",
    `     Pure function of intake data sha256:${intakeDataSha256(checkpoint)}.`,
    "     Regenerate via intake-generate-apply if the checkpoint changes; do not",
    "     hand-edit -- this staging file is NOT yet bound as project authority",
    "     (specs/wave4-onboarding-coordinator/design.md SSa.4). -->",
  ].join("\n");
}

function buildIntakeDesignInputContent(checkpoint, chunks) {
  return [
    intakeStagingGeneratedBanner(checkpoint),
    "",
    "# Design input",
    "",
    `- Intake data: sha256:${intakeDataSha256(checkpoint)}`,
    "",
    "## Captured material input (verbatim, in capture order)",
    "",
    renderIntakeMaterialInputSection(chunks),
  ].join("\n");
}

// NVA-BL-INTAKEBIND-1: the two mechanical PO-gate markers (po-language,
// technical-spec-sha256) are written on this content's first two lines,
// mirroring initialPrdContent()'s exact marker-line format/position, so a
// freshly-generated staging PRD -- no hand edit at all -- already carries
// valid values for both. `specSha256` must be the ALREADY-COMPUTED sha256 of
// the neighboring generated spec.md content (see
// buildOnboardingIntakeGeneratePlan, which computes spec content/sha256
// before calling this so the two never drift apart). The one marker that
// remains a genuine judgment call -- po-plan-acknowledged -- is deliberately
// NOT written here; see guard-lifecycle-ready.mjs's bootstrap-binding-required
// staging-authoring admission for the sanctioned real edit path that adds it.
function buildIntakePrdContent(checkpoint, featureId, chunks, specSha256) {
  return [
    `<!-- po-language: ${checkpoint.values.language} -->`,
    `<!-- technical-spec-sha256: ${specSha256} -->`,
    "",
    intakeStagingGeneratedBanner(checkpoint),
    "",
    `# PRD -- ${featureId} (staging draft)`,
    "",
    `- Intake data: sha256:${intakeDataSha256(checkpoint)}`,
    `- Profile: ${checkpoint.values.profile ?? "(not yet set)"}`,
    `- Language: ${checkpoint.values.language ?? "(not yet set)"}`,
    "",
    "## Captured material input (verbatim, in capture order)",
    "",
    renderIntakeMaterialInputSection(chunks),
    "## Design questions and answers",
    "",
    renderIntakeDesignQuestionsSection(checkpoint.designQuestions),
    "",
    "## Notes",
    "",
    "This is a deterministic staging draft: product framing (What/Why/Scope/",
    "Non-goals/Risks/Alternatives/DoD) has not been synthesized. Binding",
    "(bootstrap-bind-apply, step 5) does not require this framing to exist",
    "yet -- it must be authored and reviewed before the plan is submitted for",
    "PO approval (pipeline-state submit-plan).",
    "",
  ].join("\n");
}

function buildIntakeSpecContent(checkpoint, featureId, chunks) {
  return [
    intakeStagingGeneratedBanner(checkpoint),
    "",
    `# Spec -- ${featureId} (staging draft)`,
    "",
    `- Intake data: sha256:${intakeDataSha256(checkpoint)}`,
    "",
    "## Captured material input (verbatim, in capture order)",
    "",
    renderIntakeMaterialInputSection(chunks),
    "## Design questions and answers",
    "",
    renderIntakeDesignQuestionsSection(checkpoint.designQuestions),
    "",
    "## Notes",
    "",
    "This is a deterministic staging draft: acceptance criteria (EARS),",
    "detailed implementation, and alternatives have not been synthesized.",
    "Binding (bootstrap-bind-apply, step 5) does not require this to exist",
    "yet -- it must be authored and reviewed before the plan is submitted for",
    "PO approval (pipeline-state submit-plan).",
    "",
  ].join("\n");
}

/**
 * Pure, deterministic reconstruction -- no mkdir, lock, temporary file, or
 * write of any kind. Two calls against the SAME checkpoint content always
 * produce the identical plan (and therefore the identical planSha256),
 * whether across a plan/apply pair or a full regeneration replay.
 */
// NVA-D-PLANACTION: the generic guided driver (onboarding-init.mjs) is
// deliberately generic over the `nextAction` protocol and holds no domain
// knowledge -- it reads ONLY `nextAction`, never `applyAction` (the field
// name most other builders in this file already use). Without this, a plan
// carrying a real `planSha256` and a real apply command still stalled the
// driver dead, because nothing published it under the name the driver reads.
// Same shape as the existing `plan` -> `apply-portable-seed` convention
// (`commandAction()` in project-onboarding-v3.mjs): `kind: "command"` with a
// ready-to-run `{ executable, argv }`, the `--plan-sha256` already filled in
// from the SAME value the caller would otherwise have copied by hand.
function intakeGenerateApplyAction(root, planSha256) {
  return {
    kind: "command",
    executable: "node",
    argv: [DEFAULT_ONBOARDING_SCRIPT, "intake-generate-apply", "--root", root, "--plan-sha256", planSha256, "--activate"],
    mutation: true,
    requiresConfirmation: true,
  };
}

function buildOnboardingIntakeGeneratePlan({
  rootDir, repositoryCapability = "local", spawn = defaultGitSpawn,
} = {}) {
  const observed = readOnboardingIntakeCheckpoint({ rootDir, repositoryCapability, spawn });
  if (observed.status !== "present") {
    fail("INTAKE-GENERATE-PRECONDITION", "intake staging generation requires an existing checkpoint");
  }
  const checkpoint = observed.value;
  if (!INTAKE_GENERATE_READY_STATES.has(checkpoint.transactionState)) {
    fail("INTAKE-GENERATE-PRECONDITION", "intake staging generation requires transactionState ready-to-generate or generated");
  }
  const chunks = readIntakeMaterialInputChunks(observed.paths, checkpoint);
  const featureId = deriveIntakeFeatureId(checkpoint);
  const designInputContent = buildIntakeDesignInputContent(checkpoint, chunks);
  // NVA-BL-INTAKEBIND-1: spec content (and its sha256) must be computed BEFORE
  // the PRD, because the PRD's own technical-spec-sha256 marker (AC-1) must
  // bind to the real generated spec's bytes -- the same sha256 the spec
  // target below carries, never re-derived independently.
  const specContent = buildIntakeSpecContent(checkpoint, featureId, chunks);
  const specSha256 = sha256(Buffer.from(specContent, "utf8"));
  const prdContent = buildIntakePrdContent(checkpoint, featureId, chunks, specSha256);
  const designDirectory = intakeDesignDirname(featureId);
  const targets = {
    designInput: {
      path: `${designDirectory}/design-input.md`,
      afterSha256: sha256(Buffer.from(designInputContent, "utf8")),
      content: designInputContent,
    },
    prd: {
      path: `${designDirectory}/prd_${featureId}.md`,
      afterSha256: sha256(Buffer.from(prdContent, "utf8")),
      content: prdContent,
    },
    spec: {
      path: `${designDirectory}/spec.md`,
      afterSha256: specSha256,
      content: specContent,
    },
  };
  const binding = {
    schema: INTAKE_GENERATE_PLAN_SCHEMA,
    root: observed.paths.root,
    repositoryCapability,
    featureId,
    checkpointDataSha256: intakeDataSha256(checkpoint),
    targets,
  };
  const planSha256 = canonicalSha256(binding);
  return { ...binding, planSha256, nextAction: intakeGenerateApplyAction(binding.root, planSha256) };
}

export function planOnboardingIntakeGenerate(options = {}) {
  return buildOnboardingIntakeGeneratePlan(options);
}

// NVA-INTAKESPECS-1: `specs/` is the repository's own design-package root (ADR-0045) and,
// unlike the former `project/` precondition, is created here when absent rather than demanded
// of the caller -- a greenfield repository legitimately has no specs/ yet, and refusing to
// create it would reintroduce a dead end on the very first onboarding.
function ensureIntakeDesignDirectory(root, featureId) {
  const specsDirectory = join(root, "specs");
  if (!existsSync(specsDirectory)) {
    mkdirSync(specsDirectory, { mode: 0o755 });
    fsyncDirectory(root);
  }
  const designDirectory = join(root, ...intakeDesignDirname(featureId).split("/"));
  if (existsSync(designDirectory)) return designDirectory;
  mkdirSync(designDirectory, { mode: 0o755 });
  fsyncDirectory(specsDirectory);
  return designDirectory;
}

/**
 * Single-target, content-addressed write-if-different for one staging file.
 * Reuses writeExclusiveSynced()/fsyncDirectory()/unlinkOwned() unchanged
 * (SSc.1's building block, applied here to project/.onboarding-staging/
 * instead of the private checkpoint directory). `key` names the fault-hook
 * points ("designInput"/"prd"/"spec") independently of the target's actual
 * basename, which for the PRD varies with the derived featureId.
 */
function writeIntakeStagingTargetIfDifferent(root, stagingDirectory, key, target, deps = {}) {
  const absolute = join(root, target.path);
  const bytes = Buffer.from(target.content, "utf8");
  const fault = (point) => {
    if (deps.crashAt === point) throw new SimulatedIntakeGenerateCrash(point);
    (deps.fault ?? (() => {}))(point);
  };
  if (existsSync(absolute)) {
    const current = readPhysicalFile(absolute, "intake staging target");
    if (sha256(current) === target.afterSha256) return { path: target.path, wrote: false };
  }
  const suffixSource = (deps.randomUUID ?? randomUUID)();
  if (typeof suffixSource !== "string" || !/^[a-f0-9-]{32,64}$/iu.test(suffixSource)) {
    fail("INTAKE-CHECKPOINT-RANDOM-UNAVAILABLE", "intake staging temporary-name source is invalid");
  }
  const temporary = join(stagingDirectory, `.${basename(target.path)}.staging-${suffixSource.replaceAll("-", "")}.tmp`);
  let temporaryRecord;
  let renamed = false;
  try {
    temporaryRecord = writeExclusiveSynced(temporary, bytes, 0o644);
    fault(`${key}-temp-fsync`);
    renameSync(temporary, absolute);
    temporaryRecord = null;
    renamed = true;
    fault(`${key}-rename`);
    fsyncDirectory(stagingDirectory);
    fault(`${key}-directory-fsync`);
    return { path: target.path, wrote: true };
  } catch (error) {
    if (error instanceof SimulatedIntakeGenerateCrash) {
      throw new KickoffError("INTAKE-GENERATE-SIMULATED-CRASH", `simulated crash at ${error.message}`, {
        committed: renamed ? true : (temporaryRecord ? null : false),
      });
    }
    if (temporaryRecord) { try { unlinkOwned(temporaryRecord); } catch {} }
    if (error instanceof KickoffError) throw error;
    fail("INTAKE-GENERATE-WRITE-FAILED", "intake staging target write failed");
  }
}

/**
 * Step 4: reads the checkpoint, deterministically derives staging bytes, and
 * write-if-different's each of the three targets before recording `generated`
 * on the checkpoint (design SSa.5 point 4). Ordered like capture's own
 * evidence-before-entry discipline: staging bytes are written FIRST (harmless
 * if a crash strands the checkpoint update, since the very next call
 * recomputes the identical bytes and finds them already correct), the
 * checkpoint mutation is the sole commit point.
 */
export function applyOnboardingIntakeGenerate({
  rootDir, repositoryCapability = "local", expectedPlanSha256, activate = false, deps = {},
} = {}) {
  if (activate !== true) fail("INTAKE-GENERATE-ACTIVATION-REQUIRED", "intake staging generation requires explicit activation");
  const spawn = deps.spawn ?? defaultGitSpawn;
  const plan = buildOnboardingIntakeGeneratePlan({ rootDir, repositoryCapability, spawn });
  if (!SHA256_RE.test(expectedPlanSha256 ?? "") || plan.planSha256 !== expectedPlanSha256) {
    fail("INTAKE-GENERATE-PLAN-DIGEST", "intake staging generation plan digest does not match");
  }
  const stagingDirectory = ensureIntakeDesignDirectory(plan.root, plan.featureId);
  const targets = {
    designInput: writeIntakeStagingTargetIfDifferent(plan.root, stagingDirectory, "designInput", plan.targets.designInput, deps),
    prd: writeIntakeStagingTargetIfDifferent(plan.root, stagingDirectory, "prd", plan.targets.prd, deps),
    spec: writeIntakeStagingTargetIfDifferent(plan.root, stagingDirectory, "spec", plan.targets.spec, deps),
  };
  const nowIso = deps.now ? deps.now() : new Date().toISOString();
  const nextGenerated = {
    designInputSha256: plan.targets.designInput.afterSha256,
    prdSha256: plan.targets.prd.afterSha256,
    specSha256: plan.targets.spec.afterSha256,
    generatedAt: nowIso,
  };
  const result = applyIntakeCheckpointMutation({
    rootDir, repositoryCapability, deps,
    mutate: (observed) => {
      if (observed.status !== "present") fail("INTAKE-GENERATE-PRECONDITION", "intake staging generation requires an existing checkpoint");
      const base = observed.value;
      if (intakeDataSha256(base) !== plan.checkpointDataSha256) {
        fail("INTAKE-GENERATE-CAS-DRIFT", "intake checkpoint changed since the staging plan was built");
      }
      if (!INTAKE_GENERATE_READY_STATES.has(base.transactionState)) {
        fail("INTAKE-GENERATE-PRECONDITION", "intake staging generation requires transactionState ready-to-generate or generated");
      }
      // Compare content hashes only, never generatedAt: a genuine replay call
      // stamps a DIFFERENT wall-clock time than the original (fresh nowIso
      // per call), so comparing the full object would make every true replay
      // look like a change and defeat the "same revision -> true no-op"
      // requirement (design SSc.2).
      const sameGenerated = base.generated !== null
        && base.generated.designInputSha256 === nextGenerated.designInputSha256
        && base.generated.prdSha256 === nextGenerated.prdSha256
        && base.generated.specSha256 === nextGenerated.specSha256;
      if (base.transactionState === "generated" && sameGenerated) return null;
      const { contentSha256: dropSha, ...baseUnsigned } = base;
      void dropSha;
      return {
        ...baseUnsigned,
        revision: base.revision + 1,
        updatedAt: nowIso,
        generated: nextGenerated,
        transactionState: "generated",
      };
    },
  });
  return {
    schema: INTAKE_GENERATE_APPLY_SCHEMA,
    root: result.paths.root,
    mutated: result.mutated,
    featureId: plan.featureId,
    targets,
    checkpoint: result.value,
  };
}

// Wave 4 onboarding coordinator, step 5 (design SSa.5 point 5, SSc.3,
// NVA-W5-COORD-STEP5-1). `bootstrap-bind-plan`/`bootstrap-bind-apply`: a thin
// adapter over planOnboardingKickoffPromotion/applyOnboardingKickoffPromotion
// (SS0's central choice -- the binder is reused near-verbatim, never
// reimplemented). Every input (profile/featureId/planPath/prdPath/specPath/
// designInputPath) is DERIVED from the already-durable intake checkpoint and
// its step-4-generated staging paths -- never caller-supplied -- so the CLI
// surface is `--root [--runner] [--plan-sha256] [--activate]` only, mirroring
// intake-generate-plan/apply's own precedent rather than kickoff-promote's
// wider --profile/--id/--*-path flag set.
function resolveBootstrapBindInputs({ rootDir, repositoryCapability = "local", spawn = defaultGitSpawn } = {}) {
  const observed = readOnboardingIntakeCheckpoint({ rootDir, repositoryCapability, spawn });
  if (observed.status !== "present") {
    fail("BOOTSTRAP-BIND-PRECONDITION", "coordinator-sourced binding requires an existing intake checkpoint");
  }
  const checkpoint = observed.value;
  if (checkpoint.transactionState !== "generated") {
    fail("BOOTSTRAP-BIND-PRECONDITION", "coordinator-sourced binding requires transactionState generated (run intake-generate-apply first)");
  }
  if (!PROMOTION_PROFILES.has(checkpoint.values.profile)) {
    fail("BOOTSTRAP-BIND-PRECONDITION", "coordinator-sourced binding requires a profile already recorded on the checkpoint");
  }
  const featureId = deriveIntakeFeatureId(checkpoint);
  const designDirectory = intakeDesignDirname(featureId);
  const prdPath = `${designDirectory}/prd_${featureId}.md`;
  const specPath = `${designDirectory}/spec.md`;
  const designInputPath = `${designDirectory}/design-input.md`;
  return {
    root: observed.paths.root, profile: checkpoint.values.profile, featureId,
    planPath: prdPath, prdPath, specPath, designInputPath,
  };
}

// NVA-R-STAGINGACK: coordinator-sourced binding (bootstrap-bind-apply) is the
// only route where the promoted PRD can be PROVABLY the generator's own
// unmodified playback of already-durable intake data -- nobody has been asked
// to write a single word of it (buildIntakePrdContent's own closing note:
// "has not been synthesized ... must be authored and reviewed before the
// plan is submitted for PO approval"). Demanding the PO's plan-acknowledgement
// marker on THAT exact byte sequence would certify a judgement nobody made;
// the real acceptance gate for a document a human actually authors is
// `approve-plan`, later, entirely untouched by this (PO decision, see the
// task this implements).
// This function NEVER writes the marker and must never be extended to -- it
// only ever answers "would demanding it certify anything real right now".
//
// "Provably unmodified" is machine-checked, never assumed from the banner's
// own embedded provenance digest (an editor could leave that line intact
// while changing the surrounding prose): this re-derives the exact bytes
// intake-generate-apply would currently produce -- reusing its own single
// derivation, buildOnboardingIntakeGeneratePlan, never a second one -- and
// the caller (promotionArtifacts) compares the result against the PRD's
// actual current bytes, read fresh from disk. Consent must already be
// recorded -- the human act the PO actually performed
// (applyOnboardingIntakeConsent's own `consent: {granted, at}`) -- so an
// absent checkpoint or an unrecorded consent both return null (no exemption)
// before any derivation is even attempted; any other read or derive failure
// also returns null rather than risk a false positive.
function pureGeneratorPromotionPrdSha256({ rootDir, repositoryCapability, spawn }) {
  try {
    const observed = readOnboardingIntakeCheckpoint({ rootDir, repositoryCapability, spawn });
    if (observed.status !== "present" || observed.value.consent === null) return null;
    return buildOnboardingIntakeGeneratePlan({ rootDir, repositoryCapability, spawn }).targets.prd.afterSha256;
  } catch {
    return null;
  }
}

export function planOnboardingBootstrapBind({
  rootDir, runner = "codex", repositoryCapability = "local",
  onboardingScript = DEFAULT_ONBOARDING_SCRIPT, spawn = defaultGitSpawn,
} = {}) {
  const resolved = resolveBootstrapBindInputs({ rootDir, repositoryCapability, spawn });
  return buildKickoffPromotionPlan({
    rootDir: resolved.root, profile: resolved.profile, featureId: resolved.featureId,
    planPath: resolved.planPath, prdPath: resolved.prdPath, specPath: resolved.specPath,
    designInputPath: resolved.designInputPath, runner, repositoryCapability, onboardingScript, spawn,
    coordinatorSourced: true,
  });
}

// NVA-D-ACKASK (backlog:
// 2026-08-28-the-guided-init-ends-in-an-error-where-it-should-ask-the-po.md):
// buildKickoffPromotionPlan()'s KICKOFF-PROMOTION-PRD-ACKNOWLEDGEMENT-MARKER-MISSING
// refusal is the correct fail-closed floor for a caller that runs
// bootstrap-bind-plan directly, but a caller following v4Inspection's own
// nextAction protocol (project-onboarding-v3.mjs) needs to know BEFORE
// naming that command whether it can succeed -- the same reason every other
// human decision in that protocol arrives as a `collect-input` action instead
// of a raw refusal. This is the read-only observation that decides it: is the
// marker present, and if not, what artifact identity (path + digest) should
// the resulting ask name. It writes nothing, and must never be extended to --
// the marker is the PO's own act; po-gate-authority.mjs's own
// ACKNOWLEDGEMENT_REPAIR text draws exactly this line for the still-freely-
// editable, pre-bind case this observes.
export function observeBootstrapBindAcknowledgement({
  rootDir, repositoryCapability = "local", spawn = defaultGitSpawn,
} = {}) {
  const resolved = resolveBootstrapBindInputs({ rootDir, repositoryCapability, spawn });
  const prd = observeOptionalProjectFile(resolved.root, resolved.prdPath, "promotion PRD");
  if (prd.status !== "present") {
    fail("BOOTSTRAP-BIND-PRECONDITION", "coordinator-sourced binding requires an existing staging PRD");
  }
  const spec = observeOptionalProjectFile(resolved.root, resolved.specPath, "promotion specification");
  if (spec.status !== "present") {
    fail("BOOTSTRAP-BIND-PRECONDITION", "coordinator-sourced binding requires an existing staging specification");
  }
  const acknowledged = [...prd.raw.toString("utf8").matchAll(PRD_ACKNOWLEDGEMENT_MARKER)].length === 1;
  // NVA-V5-ACKEXEMPTASK: `acknowledged` states whether the marker is on the page and
  // nothing more, which is the right shape for a factual observation -- but a caller
  // deciding whether to STOP AND ASK the PO for it needs the other half too, because
  // NVA-R-STAGINGACK made the marker unnecessary for a provably unauthored generator
  // draft. Without this, the bind accepts those bytes while the observation still
  // reports "not acknowledged", so the flow asks the PO to certify a judgement that is
  // no longer required of them -- a human stop that buys nothing, on the path whose
  // whole point is to have as few as possible. Same single derivation the admission
  // itself uses, and the same fail-closed direction: any failure yields false.
  const exempt = pureGeneratorPromotionPrdSha256({ rootDir: resolved.root, repositoryCapability, spawn }) === prd.sha256;
  return {
    acknowledged,
    exempt,
    prd: { path: resolved.prdPath, sha256: prd.sha256 },
    spec: { path: resolved.specPath, sha256: spec.sha256 },
  };
}

export function applyOnboardingBootstrapBind({
  rootDir, repositoryCapability = "local", runner = "codex",
  onboardingScript = DEFAULT_ONBOARDING_SCRIPT, expectedPlanSha256, activate = false, deps = {},
} = {}) {
  if (activate !== true) fail("BOOTSTRAP-BIND-ACTIVATION-REQUIRED", "coordinator-sourced binding apply requires explicit activation");
  const spawn = deps.spawn ?? defaultGitSpawn;
  const resolved = resolveBootstrapBindInputs({ rootDir, repositoryCapability, spawn });
  // Mirrors applyProjectOnboardingKickoffPromotionV4's own convention exactly
  // (lib/project-onboarding-v3.mjs): apply ALWAYS reconstructs its comparison
  // plan with allowAppliedReplay: true, whether this is the first apply (falls
  // through to the ordinary build path, admission deferred to the direct
  // promotionArtifacts() call inside applyOnboardingKickoffPromotion itself) or
  // a replay of an already-committed binding.
  const plan = buildKickoffPromotionPlan({
    rootDir: resolved.root, profile: resolved.profile, featureId: resolved.featureId,
    planPath: resolved.planPath, prdPath: resolved.prdPath, specPath: resolved.specPath,
    designInputPath: resolved.designInputPath, runner, repositoryCapability, onboardingScript, spawn,
    coordinatorSourced: true, allowAppliedReplay: true,
  });
  return applyOnboardingKickoffPromotion({
    plan, expectedPlanSha256, activate, deps: { ...deps, spawn },
  });
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

function kickoffSupersessionBytes(plan) {
  return Buffer.from(`${[
    "<!-- pipeline.kickoff-supersession.v1 -->",
    "# Superseded: nothing in this directory is authoritative",
    "",
    "The PRD and the specification here were the provisional bootstrap anchors",
    `of kickoff \`${plan.kickoff.featureId}\`. That kickoff was promoted, and the`,
    "package below replaced them as the digest-bound authority. These files are",
    "stale copies: do not read, cite, or edit them as if they still governed.",
    "",
    `- Feature: \`${plan.feature.id}\``,
    `- Profile: \`${plan.profile}\``,
    `- PRD (the approval subject): \`${plan.authority.prd.path}\``,
    `- Specification: \`${plan.authority.spec.path}\``,
    `- Design input: \`${plan.authority.designInput.path}\``,
    `- Promotion transaction: \`${plan.transactionSha256}\``,
    "",
    "This marker is an advisory annotation written by the promotion transaction",
    "after it commits. No gate reads it, and no record binds it; deleting it",
    "only stops this directory from naming what replaced it.",
    "",
  ].join("\n")}`, "utf8");
}

/**
 * Retire the provisional kickoff anchors by naming their successor.
 *
 * Removal was the other route and this transaction cannot offer it honestly.
 * It has no rollback: publication is roll-forward from a recoverable prefix,
 * and the only rollback in this module belongs to the kickoff apply. A removal
 * placed before the commit point would therefore destroy the very seed a
 * failed promotion is recovered from — `recognisedKickoff` requires both files
 * present — and a removal placed after it is an unrecoverable delete of a
 * directory whose full contents the transaction never knew. Annotation is the
 * retirement that stays inside what the transaction can guarantee.
 *
 * Consequently this runs last, after the State publication and after every
 * fault point: any failure leaves the provisional location byte for byte as it
 * was. It also cannot fail the committed transaction — a marker that could
 * turn a durable promotion into a reported failure would be exactly the trade
 * this route exists to avoid — and it never overwrites: an absent directory
 * (already cleaned) and an existing marker (already retired) are both left
 * alone. The price is bounded and stated: a crash between the State
 * publication and this write is replayed as a completed promotion, and replay
 * is zero-write, so that one promotion stays unmarked.
 */
function publishKickoffSupersession(plan, suffix) {
  if (!/^kickoff-[a-f0-9]{16}$/u.test(plan.kickoff?.featureId ?? "")) return;
  let marker;
  try {
    const provisional = initialAuthorityPaths(plan.kickoff.featureId);
    marker = absoluteProjectPath(plan.root,
      `${dirname(provisional.prd)}/${KICKOFF_SUPERSESSION_BASENAME}`,
      "kickoff supersession marker");
    assertPhysicalChain(plan.root, marker);
  } catch {
    return;
  }
  const directory = dirname(marker);
  if (!existsSync(directory) || existsSync(marker)) return;
  const temporary = join(directory, `.${KICKOFF_SUPERSESSION_BASENAME}.promotion-${suffix}.tmp`);
  try {
    writeExclusiveSynced(temporary, kickoffSupersessionBytes(plan), 0o644);
    if (existsSync(marker)) throw new Error("supersession marker appeared before publication");
    renameSync(temporary, marker);
    fsyncDirectory(directory);
  } catch {
    try {
      if (existsSync(temporary)) unlinkSync(temporary);
    } catch { /* The transaction is committed; the annotation is not worth a throw. */ }
  }
}

// The receipt this publishes must bind exactly the two files the PO-gate
// authority reads back FOR THIS repository -- resolved through that
// authority (`poGateProfileProjectionPaths`), never named here locally. That
// exact shortcut is the recorded past defect po-gate-profile-publisher.mjs's
// callers guard against: a receipt that bound the wrong manifest tier while
// looking correct only because both tiers happened to be seeded
// byte-identical.
//
// Coordinator-sourced promotion (bootstrap-bind-apply) is the measured real
// terminal step of local onboarding and never went through kickoff-apply --
// the one and only site that used to publish this receipt
// (`initializeKickoffPoProfile`, project-onboarding-v3.mjs) -- so a project
// that reaches "ready" through it previously ended with NO receipt at all,
// permanently: `submit-plan` refuses with PO-PROFILE-RECEIPT-INVALID and
// there is no site downstream that ever publishes one. Placing the ensure
// call here, inside the promotion apply BOTH promotion callers share
// (kickoff-promote-apply and bootstrap-bind-apply), closes it at the one
// place every local "ready" project's apply path actually passes through,
// rather than only the measured one -- and is a safe no-op for the
// kickoff-sourced caller, which already has a valid receipt from kickoff by
// the time promotion runs (`initializePoGateProfileReceipt` below is a pure
// readback-and-skip when a receipt is already valid).
//
// `initializePoGateProfileReceipt` is idempotent by construction: a
// currently-valid receipt is left completely untouched (no write, no
// timestamp bump), and only a genuinely absent/invalid one is published --
// atomically, and only if no receipt appears concurrently (link-then-unlink,
// never a blind overwrite) -- so a promotion replay can never duplicate or
// corrupt it.
//
// Local-repository projects only: a plugin-managed or remote project has a
// different profile authority and must never have a receipt forced on it
// from here, mirroring the existing repositoryCapability guard at the
// kickoff site this mirrors.
//
// This runs AFTER the promotion transaction has already committed (or was
// found already committed, on replay): receipt publication failing here must
// never read as "the promotion itself failed to commit". It therefore uses
// the same `{ committed: true }` KickoffError convention every other
// post-commit readback failure in this module already uses (e.g.
// KICKOFF-PROMOTION-PRIVATE-READBACK) instead of a bare throw a caller could
// mistake for "nothing happened, safe to retry blindly without checking
// state" -- a committed promotion left behind a receipt error is a real,
// named outcome here, not an accident of copying the kickoff site's
// unconditional throw. The retry story stays simple regardless: the commit
// itself is already durable and this function is idempotent, so re-running
// the same apply call both replays the commit cleanly and reattempts the
// receipt.
//
// `deps.initializePoGateProfileReceipt` follows the exact same injection
// convention every other collaborator on this apply already uses
// (`deps.spawn ?? defaultGitSpawn`, `deps.randomUUID ?? randomUUID`): a
// caller of the shared `applyOnboardingKickoffPromotion`/
// `applyOnboardingBootstrapBind` apply may already inject a stub for this
// exact dependency (project-onboarding-v3.mjs's own `deps(overrides)` has
// carried an overridable `initializePoGateProfileReceipt` since before this
// function existed, for callers that stub out real Git-topology resolution
// entirely) -- hard-importing the concrete implementation here instead would
// silently reach past that injection and spawn real `git` against whatever
// the caller's own stub was standing in for.
function ensureLocalPromotionPoProfileReceipt(plan, deps = {}) {
  if (plan.repositoryCapability !== "local") return;
  const projection = poGateProfileProjectionPaths(plan.root);
  const source = observeOptionalProjectFile(plan.root, projection.source, "PO profile source");
  const runtime = observeOptionalProjectFile(plan.root, projection.manifest, "PO profile runtime manifest");
  // Both files are seeded early in the real onboarding flow (apply-portable-
  // seed, lib/project-onboarding-v3.mjs) well before any promotion can run,
  // so their absence here means this apply is exercising this module's
  // promotion machinery on its own (as this module's own unit tests do, and
  // as the kickoff-sourced caller's plan-building already requires elsewhere)
  // rather than a real project reaching "ready" -- there is nothing to
  // snapshot yet, and no defect to report from this layer: po-gate-
  // authority.mjs's own validator still fails closed on a missing receipt
  // exactly as it did before this function existed, so skipping here changes
  // no downstream outcome, only defers when the receipt is first attempted.
  if (source.status !== "present" || runtime.status !== "present") return;
  const initialize = deps.initializePoGateProfileReceipt ?? initializePoGateProfileReceipt;
  // Same reasoning, one layer down: the concrete `initializePoGateProfileReceipt`
  // resolves Git topology itself (real `git` by default), so its OWN
  // `resolveTopology` dependency must be pointed at this apply's already-
  // injected `deps.spawn` too -- otherwise an apply running under a fake or
  // stubbed `git` for every other collaborator would still shell out to a
  // real `git` binary here, against a fixture that was never meant to answer
  // one. A caller-supplied `initializePoGateProfileReceipt` stub (the other
  // half of this injection) ignores this second argument entirely, so
  // passing it is harmless when the concrete implementation is not in use.
  const initialized = initialize({
    rootDir: plan.root,
    userYamlText: source.raw,
    runtimeYamlText: runtime.raw,
  }, { resolveTopology: (rootDir) => resolvePoGateRepositoryTopology(rootDir, { spawn: deps.spawn ?? defaultGitSpawn }) });
  if (!initialized?.ok) {
    fail(
      "KICKOFF-PROMOTION-PO-PROFILE-RECEIPT",
      `PO profile receipt initialization failed (${initialized?.code ?? "unavailable"})`,
      { committed: true },
    );
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
    ...(plan.targets.handover === undefined ? {} : {
      handover: absoluteProjectPath(plan.root, plan.targets.handover.path, "configured handover"),
    }),
    ...(plan.targets.cleanupBinding === undefined ? {} : {
      cleanupBinding: join(privatePaths.directory, SESSION_CLEANUP_BINDING_BASENAME),
    }),
  };
  if (paths.handover !== undefined) assertPhysicalChain(plan.root, paths.handover);
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
    // A plan with no handover target behaves exactly as before: `{status:"exact"}`
    // is the neutral element of every conjunction below, so the three-target
    // algebra is unchanged for a promotion applied before this target existed.
    const handover = plan.targets.handover === undefined
      ? { status: "exact" }
      : currentTarget(paths.handover, plan.targets.handover.afterSha256);
    if (state.status === "exact" && history.status === "exact" && cleanupBinding.status === "exact"
      && handover.status === "exact") {
      const replayed = promotionResult(plan, "replayed", false, deps.spawn ?? defaultGitSpawn);
      ensureLocalPromotionPoProfileReceipt(plan, deps);
      return replayed;
    }
    const stateBefore = currentTarget(paths.state, plan.targets.state.beforeSha256);
    const historyBefore = currentTarget(paths.history, plan.targets.history.beforeSha256);
    const cleanupBindingBefore = plan.targets.cleanupBinding === undefined
      ? { status: "exact" }
      : currentTarget(paths.cleanupBinding, plan.targets.cleanupBinding.beforeSha256);
    const handoverBefore = plan.targets.handover === undefined
      ? { status: "exact" }
      : currentTarget(paths.handover, plan.targets.handover.beforeSha256);
    // Wave 4 onboarding coordinator, step 5 (design SSc.3): a coordinator-sourced
    // plan (`plan.kickoff === null`) has NO preimage at all -- the "before" state
    // of state/history/handover is genuinely absent, never a real prior digest, so
    // `currentTarget`'s "absent" status is what a not-yet-written target looks
    // like, in place of the kickoff-sourced shape's "exact" (matches a real
    // committed prior digest). Kickoff-sourced behaviour is UNCHANGED: for it this
    // reduces to exactly `before.status === "exact"`, the original expression.
    const notYetWritten = (before) => (plan.kickoff === null ? before.status === "absent" : before.status === "exact");
    const exactPreimage = notYetWritten(stateBefore) && notYetWritten(historyBefore)
      && cleanupBindingBefore.status === "exact" && notYetWritten(handoverBefore);
    // The handover joins the recoverable prefix on the same terms as the cleanup
    // binding: either it already carries the postimage (this step completed before
    // the crash) or it still carries the preimage (it did not). Anything else is a
    // third party having written the file, which is drift and must not roll
    // forward over it.
    const recoverPrefix = notYetWritten(stateBefore) && history.status === "exact"
      && (cleanupBinding.status === "exact" || cleanupBindingBefore.status === "exact")
      && (handover.status === "exact" || notYetWritten(handoverBefore))
      && stateLock.recovered === true && privateLock.recovered === true;
    if (!exactPreimage && !recoverPrefix) {
      fail("KICKOFF-PROMOTION-CAS-DRIFT", "promotion target preimage drifted");
    }
    if (exactPreimage && plan.kickoff !== null) {
      const observed = observeDetailed({ rootDir: plan.root, repositoryCapability: plan.repositoryCapability, spawn: deps.spawn ?? defaultGitSpawn });
      const seed = recognisedKickoff(observed, deps.spawn ?? defaultGitSpawn);
      if (seed === null) fail("KICKOFF-PROMOTION-CAS-DRIFT", "promotion kickoff seed drifted");
    }
    // NVA-R3-STAGINGACKAPPLY: this re-admission runs on every first real apply, and
    // it decides marker admission a second time -- so it must reach the same verdict
    // the plan did, or the plan-time exemption is computed and then thrown away.
    // Before this, it passed no options at all: `pureGeneratorPrdSha256` defaulted to
    // null, `pureGeneratorExempt` was unconditionally false here, and a marker-less
    // pure-generator PRD produced a plan that its own apply then always refused.
    //
    // The digest is RE-DERIVED here rather than carried across from the plan, and the
    // difference is the whole safety of it: the derivation reads the checkpoint and
    // the PRD's current bytes as they are NOW, so a hand edit or a checkpoint change
    // between plan and apply revokes the exemption at exactly this point instead of
    // being waved through by a value computed before the edit existed. Trusting a
    // plan-carried digest would make the plan a bearer token for its own admission.
    //
    // Gated on `plan.kickoff === null`, the same coordinator-sourced predicate
    // buildKickoffPromotionPlan uses: `kickoff promote` must not reach the exemption
    // from here any more than it can from the plan side.
    const authority = promotionArtifacts(plan.root, {
      profile: plan.profile, featureId: plan.feature.id, planPath: plan.feature.planPath,
      prdPath: plan.authority.prd.path, specPath: plan.authority.spec.path,
      designInputPath: plan.authority.designInput.path,
    }, {
      pureGeneratorPrdSha256: plan.kickoff === null
        ? pureGeneratorPromotionPrdSha256({
          rootDir: plan.root,
          repositoryCapability: plan.repositoryCapability,
          spawn: deps.spawn ?? defaultGitSpawn,
        })
        : null,
    });
    if (authority.prd.sha256 !== plan.authority.prd.sha256 || authority.spec.sha256 !== plan.authority.spec.sha256
      || authority.designInput.sha256 !== plan.authority.designInput.sha256) {
      fail("KICKOFF-PROMOTION-CAS-DRIFT", "promotion authority bytes drifted");
    }
    const suffix = (deps.randomUUID ?? randomUUID)().replaceAll("-", "");
    if (!/^[a-f0-9]{32,64}$/iu.test(suffix)) fail("KICKOFF-PROMOTION-RANDOM-UNAVAILABLE", "promotion temporary-name source is invalid");
    if (notYetWritten(historyBefore)) {
      const temp = join(dirname(paths.history), `.${HISTORY_BASENAME}.promotion-${suffix}.tmp`);
      writeExclusiveSynced(temp, bytes.historyBytes, 0o600);
      // SSc.4: the two earlier boundaries KICKOFF_FAULT_STAGES already tests for
      // applyOnboardingKickoff -- additive, "promotion-history-published" (the
      // directory-fsync boundary below) is unchanged and stays the name every
      // existing test pins.
      if (deps.crashAt === "promotion-history-temp-fsync") {
        simulatedCrash = true;
        throw new SimulatedKickoffCrash("promotion-history-temp-fsync");
      }
      renameSync(temp, paths.history);
      if (deps.crashAt === "promotion-history-rename") {
        simulatedCrash = true;
        throw new SimulatedKickoffCrash("promotion-history-rename");
      }
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
    // Before the State, deliberately. The State publication is the commit point of
    // this transaction -- `promotionResult` reads back only after it, and
    // `publishKickoffSupersession` runs only after that -- so a handover written
    // ahead of it can never be the artifact that survives a promotion which did
    // not complete. The reverse order would leave a crash between them showing a
    // promoted State beside a handover still naming the kickoff, which is the
    // exact state this target exists to prevent.
    if (plan.targets.handover !== undefined && notYetWritten(handoverBefore)) {
      mkdirSync(dirname(paths.handover), { recursive: true });
      const handoverTemp = join(dirname(paths.handover), `.${basename(paths.handover)}.promotion-${suffix}.tmp`);
      writeExclusiveSynced(handoverTemp, bytes.handoverBytes, 0o644);
      if (deps.crashAt === "promotion-handover-temp-fsync") {
        simulatedCrash = true;
        throw new SimulatedKickoffCrash("promotion-handover-temp-fsync");
      }
      renameSync(handoverTemp, paths.handover);
      if (deps.crashAt === "promotion-handover-rename") {
        simulatedCrash = true;
        throw new SimulatedKickoffCrash("promotion-handover-rename");
      }
      fsyncDirectory(dirname(paths.handover));
      if (deps.crashAt === "promotion-handover-published") {
        simulatedCrash = true;
        throw new SimulatedKickoffCrash("promotion-handover-published");
      }
    }
    const stateTemp = join(dirname(paths.state), `.${basename(paths.state)}.promotion-${suffix}.tmp`);
    writeExclusiveSynced(stateTemp, bytes.stateBytes, 0o600);
    if (deps.crashAt === "promotion-state-temp-fsync") {
      simulatedCrash = true;
      throw new SimulatedKickoffCrash("promotion-state-temp-fsync");
    }
    renameSync(stateTemp, paths.state);
    if (deps.crashAt === "promotion-state-rename") {
      simulatedCrash = true;
      throw new SimulatedKickoffCrash("promotion-state-rename");
    }
    fsyncDirectory(dirname(paths.state));
    if (deps.crashAt === "promotion-state-published") {
      simulatedCrash = true;
      throw new SimulatedKickoffCrash("promotion-state-published");
    }
    // The readback stays the last gate on the commit: the provisional anchors
    // are only named superseded once this promotion has validated itself.
    const result = promotionResult(plan, "applied", true, deps.spawn ?? defaultGitSpawn);
    publishKickoffSupersession(plan, suffix);
    ensureLocalPromotionPoProfileReceipt(plan, deps);
    return result;
  } finally {
    if (!simulatedCrash && privateLock) releaseLock(privateLock);
    if (!simulatedCrash) releaseLock(stateLock);
  }
}

function kickoffPromotionCleanupRecoveryPlanCore(observed, binding, sessionCleanupScript) {
  const state = observed.state;
  const entry = observed.history?.transactions?.at(-1);
  // `buildKickoffPromotionPlan`/`validatePromotionPlan` (~line 4044,
  // "![0, 1].includes(plan.kickoff.revision)") only ever admit a kickoff at
  // revision 0 or 1, and always set the promoted state's `continuity.revision`
  // to kickoff.revision + 1 -- so a genuinely completed kickoff-promotion's own
  // state postimage can only ever land on revision 1 (the ordinary first
  // kickoff->promotion, the single most common path) or revision 2 (a
  // re-kickoff promoted a second time). A bare `!== 2` here used to accept only
  // the second of those two legitimate outcomes, silently excluding
  // revision-0->1 -- the more common case -- from ever getting an in-session
  // recovery candidate.
  const promotedRevisions = [0, 1].map((kickoffRevision) => kickoffRevision + 1);
  if (observed.continuity.status !== "valid" || observed.stateRelativePath !== NEUTRAL_STATE || binding.binding === null
    || entry?.kind !== "kickoff-promotion" || entry.cleanupBinding !== undefined
    || observed.history.transactions.length !== 2 || !promotedRevisions.includes(state?.continuity?.revision)
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
  // NVA-H-LASTBUILDERS: same `applyAction`/`nextAction` sibling convention as
  // the kickoff and promotion plans above -- the generic guided driver reads
  // ONLY `nextAction`, never `applyAction`, so a recovery plan reaching
  // status "ready" with a real apply command under the wrong name still
  // stalls the driver dead. Computed once and published under both names;
  // attached AFTER `planSha256` is computed and deliberately not part of
  // `core`, so publishing it changes no plan digest. The non-ready branches
  // above (`recovery-unavailable`/`not-applicable`) return before this point
  // and stay untouched -- they carry neither `applyAction` nor `nextAction`.
  const recoveryApplyAction = kickoffPromotionCleanupRecoveryAction(sessionCleanupScript, observed.root, planSha256);
  return {
    ...core,
    status: "ready",
    planSha256,
    applyAction: recoveryApplyAction,
    nextAction: recoveryApplyAction,
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
