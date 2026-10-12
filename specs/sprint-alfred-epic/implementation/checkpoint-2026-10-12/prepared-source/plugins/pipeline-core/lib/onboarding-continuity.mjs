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
  createPublicKey,
  sign,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { spawnSync } from "node:child_process";
import { isSuccessfulSpawn } from "./successful-spawn.mjs";
import {inspectSourceOwnedControlledMethodDispatchHandle} from "./controlled-continuity-method-dispatch.mjs";
import {executeSourceOwnedAfkHostTransaction,readSourceOwnedAfkProjectionSettlementSelector,readSourceOwnedAfkProjectionSettlement,isCurrentSourceOwnedAfkProjectionAttempt} from "./afk-transaction-host.mjs";
import {parseAfkLedgerGeneration,createAfkLedgerAuthorityProducerPort} from "./afk-ledger.mjs";
import {observeAfkGitAuthority} from "./afk-git-adapter.mjs";
import * as continuityExerciseCustody from "./afk-isolated-repository-custody.mjs";
import {
  chmodSync,
  fchmodSync,
  linkSync,
  writeSync,
  closeSync,
  constants,
  existsSync,
  fstatSync,
  ftruncateSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
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
import { fileURLToPath,pathToFileURL } from "node:url";
import {readBoundConsumedCriticReceipt} from "./critic-verify-lifecycle.mjs";

import { projectReadContinuityStatus } from "./continuity-status.mjs";
import {
  bindContinuitySessionCleanup,
  releaseContinuitySessionCleanup,
  validateContinuityState,
} from "./continuity-state.mjs";
import { resolveOnboardingPrivateState, resolveOnboardingIntakeScope } from "./codex-onboarding-runtime.mjs";
import {observeGovernanceScope} from "./governance-scope.mjs";
import {validateRetirementJournal} from "./enrollment-retirement-coordinator.mjs";
import { assessWindowsPrivatePath } from "./windows-private-state.mjs";
import { applyBoundDesignLineEndings, planBoundDesignLineEndings } from "./bound-design-line-endings.mjs";
import { parseArchitectureDesign } from "./architecture-design.mjs";
import { renderArchitectureDesignSkeleton, renderDesignTraceabilitySkeleton } from "./design-authoring.mjs";
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
  PO_GATE_PRD_ACKNOWLEDGEMENT_MARKER,
  PO_GATE_PRD_LANGUAGE_MARKER,
  PRD_ACKNOWLEDGEMENT_MARKER,
  PRD_LANGUAGE_MARKER,
  TECHNICAL_SPEC_MARKER,
  poGateProfileProjectionPaths,
  resolvePoGateRepositoryTopology,
  validatePoGateLanguageProjection,
} from "./po-gate-authority.mjs";
import { initializePoGateProfileReceipt, publishPoGateProfileReceipt } from "./po-gate-profile-publisher.mjs";
import { correctPromotedLanguage } from "./onboarding-language-correction.mjs";
import {
  inspectSessionClosure,
  inspectSessionOwnerRuntime,
  listActiveSessionDescriptors,
  loadSessionDescriptor,
  observeOwnedSessionDescriptorOwnerHandle,
  observeOwnedSessionDescriptorClosureHandle,
} from "./worktree-lifecycle.mjs";
import {
  derivePlanLifecycle,
  validPlanCancellation,
  validPlanMixedStateRecovery,
} from "./plan-spec-state-v2.mjs";
import { readHumanApprovalMode, readCriticalHumanProofPolicy, verifyAgainstTrustAnchors } from "./critical-human-proof-policy.mjs";
import { readMachinePlane } from "./machine-plane.mjs";
import { inspectSignedDescriptorCustodyRepository } from "./worktree-lifecycle.mjs";
import { readSourceOwnedAuthorityContext, createSignedCleanupRequesterObserver,
  inspectSourceOwnedCurrentAuthorityContext, inspectSourceOwnedRequesterInvocation, withSourceOwnedRetiredOwnerTerminalContext,
  inspectSourceOwnedRetiredOwnerTerminalContext } from "./session-requester-bridge.mjs";
import { withSessionAuthorityBoundary, advanceSessionAuthorityMember, reserveSessionAuthorityMember, releaseSessionAuthorityMember,
  inspectSourceOwnedSessionAuthorityProducerRecord, inspectSourceOwnedSessionAuthorityMemberRecord,
  inspectSourceOwnedSessionAuthorityStateRefresh, inspectSourceOwnedSessionAuthorityCompanionRefresh,
  executeSourceOwnedControlledContinuityTicketProbe } from "./session-authority-registry.mjs";
import { isOwnedStateAuthorityWriteHandle, observeStateAuthorityWrite,
  observeStateAuthorityWriteTerminal, isOwnedStateAuthorityCompanionWriteHandle,
  observeStateAuthorityCompanionWrite, observeStateAuthorityCompanionWriteTerminal,
  getOwnedStateAuthorityCompanionContextHandle, readState as readSanctionedPlanState,
  readAcceptedDeliveryContract as readSanctionedAcceptedContract,
  statePath as statePathForMethod, run as runSanctionedCompanionState,
  inspectOwnedContinuityStateWriterLock } from "../scripts/pipeline-state.mjs";
import { AsyncLocalStorage } from "node:async_hooks";
import {inspectSourceOwnedSessionAuthorityMember} from "./session-authority-registry.mjs";
import {sameProcess as sameOwnedVerificationProcess} from "./codex-host-process-journal.mjs";
import {inspectSourceOwnedContinuityVerificationRequesterFloor,
  spawnSourceOwnedContinuityVerificationChild,inspectSourceOwnedContinuityVerificationExchange,publishSourceOwnedControlledMethodVerificationStage} from "./session-requester-bridge.mjs";
import {OWNED_VERIFICATION_CODES,ownedVerificationFail,ownedVerificationExact,
  ownedVerificationDigest,ownedVerificationCanonical,ownedVerificationFreeze,ownedVerificationSameProcess,readOwnedVerificationPhysicalFile,
  recheckOwnedVerificationPhysicalRefs,readOwnedVerificationRegistration,collectOwnedVerificationSourceModules,
  inspectSourceOwnedTaskVerificationPreparation} from "./owned-continuity-verification.mjs";
import { createDesignReviewReceipt } from "./design-review-receipt.mjs";
import { compileDecisionSummary } from "../scripts/architecture-baseline.mjs";
import { validateFeaturePackage } from "./feature-package-topology.mjs";

import { resolveRepoScopedDirectory } from "./po-key-directory.mjs";

export const KICKOFF_PLAN_SCHEMA = "pipeline.codex-onboarding-kickoff-plan.v1";
export const KICKOFF_HISTORY_SCHEMA = "pipeline.codex-onboarding-continuity-history.v1";
export const KICKOFF_APPLY_SCHEMA = "pipeline.codex-onboarding-kickoff-apply.v1";
export const KICKOFF_PROMOTION_PLAN_SCHEMA = "pipeline.codex-onboarding-kickoff-promotion-plan.v1";
export const KICKOFF_PROMOTION_APPLY_SCHEMA = "pipeline.codex-onboarding-kickoff-promotion-apply.v1";
export const KICKOFF_GOAL_MAX_BYTES = 160;
export const CONTINUITY_REPAIR_PLAN_SCHEMA = "pipeline.codex-onboarding-continuity-repair-plan.v1";
export const CONTINUITY_REPAIR_APPLY_SCHEMA = "pipeline.codex-onboarding-continuity-repair-apply.v1";
export const CONTINUITY_REPAIR_DIAGNOSIS_SCHEMA = "pipeline.continuity-repair-diagnosis.v1";
export const STATE_REPAIR_RECORD_SCHEMA = "pipeline.state-repair-record.v1";
export const SESSION_CLEANUP_BIND_SCHEMA = "pipeline.codex-onboarding-session-cleanup-bind.v1";
export const SESSION_CLEANUP_RELEASE_PROOF_SCHEMA = "pipeline.session-cleanup-release-proof.v1";
export const SESSION_CLEANUP_RELEASE_RECEIPT_SCHEMA = "pipeline.session-cleanup-release-receipt.v1";
export const PRIVATE_SESSION_CLEANUP_BINDING_SCHEMA = "pipeline.private-session-cleanup-binding.v1";
export const PRIVATE_SESSION_CLEANUP_RELEASE_RECEIPT_SCHEMA = "pipeline.private-session-cleanup-release-receipt.v1";
export const PRIVATE_SESSION_CLEANUP_ORPHAN_RELEASE_RECEIPT_SCHEMA = "pipeline.private-session-cleanup-orphan-release-receipt.v1";
export const SESSION_CLEANUP_ORPHAN_RELEASE_PLAN_SCHEMA = "pipeline.session-cleanup-orphan-release-plan.v1";
export const PRIVATE_SESSION_CLEANUP_RELEASE_QUARANTINE_SCHEMA = "pipeline.private-session-cleanup-release-quarantine.v1";
export const SESSION_CLEANUP_PRIVATIZATION_PLAN_SCHEMA = "pipeline.session-cleanup-privatization-plan.v1";
export const SESSION_CLEANUP_PRIVATIZATION_APPLY_SCHEMA = "pipeline.session-cleanup-privatization-apply.v1";
export const PRIVATE_SESSION_CLEANUP_PRIVATIZATION_AUDIT_SCHEMA = "pipeline.private-session-cleanup-privatization-audit.v1";
export const PRIVATE_SESSION_CLEANUP_PRIVATIZATION_CONFIRMATION_SCHEMA = "pipeline.private-session-cleanup-privatization-confirmation.v1";
export const SESSION_CLEANUP_PRIVATIZATION_CONFIRMATION_SCHEMA = "pipeline.session-cleanup-privatization-confirmation.v1";
export const KICKOFF_PROMOTION_CLEANUP_RECOVERY_PLAN_SCHEMA = "pipeline.kickoff-promotion-cleanup-recovery-plan.v1";
export const KICKOFF_PROMOTION_CLEANUP_RECOVERY_APPLY_SCHEMA = "pipeline.kickoff-promotion-cleanup-recovery-apply.v1";
// A generated PRD which has subsequently been authored is no longer eligible
// for the generator exemption.  This is the runner-neutral, detached-proof
// route that records the PO's judgement without asking them to edit markup.
export const BOOTSTRAP_ACKNOWLEDGEMENT_PLAN_SCHEMA = "pipeline.bootstrap-plan-acknowledgement-plan.v1";
export const BOOTSTRAP_ACKNOWLEDGEMENT_APPLY_SCHEMA = "pipeline.bootstrap-plan-acknowledgement-apply.v1";
export const BOOTSTRAP_ACKNOWLEDGEMENT_REQUEST_SCHEMA = "pipeline.bootstrap-plan-acknowledgement-request.v1";
// The acknowledgement marker is only an artefact transition.  This receipt is
// the durable bridge from the one human decision over the staging PRD/spec to
// the later, mechanically separate submit/present/approve-plan sequence.
// Without it a signature-mode project either asked the PO twice or quietly
// fell back to an unauthenticated `--by` approval.
export const BOOTSTRAP_ACKNOWLEDGEMENT_RECEIPT_SCHEMA = "pipeline.bootstrap-plan-acknowledgement-receipt.v1";

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

const CLOSE_EVIDENCE_POINTER = /^\/closedFeatures\/(?:0|[1-9][0-9]*)\/continuityClose\/closeEvidence$/u;

function validStateRepairRecord(record) {
  if (!exactKeys(record, new Set([
    "schema", "reason", "sourceUpdatedAt", "planSha256", "stateBeforeSha256",
    "evidence", "preservedClaimant", "quarantinedAssertions", "affectedFeatureIds",
  ]))
    || record.schema !== STATE_REPAIR_RECORD_SCHEMA
    || record.reason !== "shared-close-evidence-path"
    || !canonicalIsoTimestamp(record.sourceUpdatedAt)
    || !SHA256_RE.test(record.planSha256 ?? "")
    || !SHA256_RE.test(record.stateBeforeSha256 ?? "")
    || !exactKeys(record.evidence, new Set(["artifactKind", "path", "observedSha256"]))
    || record.evidence.artifactKind !== "closeEvidence"
    || !SHA256_RE.test(record.evidence.observedSha256 ?? "")
    || !exactKeys(record.preservedClaimant, new Set(["featureId", "jsonPointer", "expectedSha256"]))
    || typeof record.preservedClaimant.featureId !== "string" || record.preservedClaimant.featureId.length === 0
    || !CLOSE_EVIDENCE_POINTER.test(record.preservedClaimant.jsonPointer ?? "")
    || !SHA256_RE.test(record.preservedClaimant.expectedSha256 ?? "")
    || !Array.isArray(record.quarantinedAssertions) || record.quarantinedAssertions.length < 1
    || !record.quarantinedAssertions.every((entry) => exactKeys(entry, new Set([
      "featureId", "jsonPointer", "formerAssertion",
    ]))
      && typeof entry.featureId === "string" && entry.featureId.length > 0
      && CLOSE_EVIDENCE_POINTER.test(entry.jsonPointer ?? "")
      && exactKeys(entry.formerAssertion, new Set(["schema", "featureId", "expectedRevision", "result", "closeEvidence"]))
      && entry.formerAssertion.schema === "pipeline.continuity-close.v0"
      && entry.formerAssertion.featureId === entry.featureId
      && Number.isSafeInteger(entry.formerAssertion.expectedRevision)
      && entry.formerAssertion.expectedRevision >= 0
      && exactKeys(entry.formerAssertion.result, new Set(["path", "sha256"]))
      && SHA256_RE.test(entry.formerAssertion.result.sha256 ?? "")
      && exactKeys(entry.formerAssertion.closeEvidence, new Set(["path", "sha256"]))
      && entry.formerAssertion.closeEvidence.path === record.evidence.path
      && SHA256_RE.test(entry.formerAssertion.closeEvidence.sha256 ?? "")
      && entry.formerAssertion.closeEvidence.sha256 !== record.evidence.observedSha256)
    || !Array.isArray(record.affectedFeatureIds)
    || record.affectedFeatureIds.length !== record.quarantinedAssertions.length + 1
    || new Set(record.affectedFeatureIds).size !== record.affectedFeatureIds.length
    || record.affectedFeatureIds[0] !== record.preservedClaimant.featureId
    || record.quarantinedAssertions.some((entry, index) => entry.featureId !== record.affectedFeatureIds[index + 1])
    || new Set([record.preservedClaimant.jsonPointer, ...record.quarantinedAssertions.map((entry) => entry.jsonPointer)]).size
      !== record.affectedFeatureIds.length) return false;
  try {
    safeRelativePath(record.evidence.path, "State repair evidence");
    for (const entry of record.quarantinedAssertions) {
      safeRelativePath(entry.formerAssertion.result.path, "quarantined Result binding");
    }
  } catch { return false; }
  return record.preservedClaimant.expectedSha256 === record.evidence.observedSha256;
}

function validStateRepairRecords(state) {
  if (state.evidenceRepins !== undefined) {
    if (!Array.isArray(state.evidenceRepins) || !state.evidenceRepins.every(validEvidenceRepinEntry)) return false;
  }
  if (state.stateRepairs === undefined) return true;
  if (!Array.isArray(state.stateRepairs) || !state.stateRepairs.every(validStateRepairRecord)) return false;
  if (state.stateRepairs.length === 0) return true;
  if (!Array.isArray(state.closedFeatures)
    || new Set(state.closedFeatures.map((entry) => entry?.id)).size !== state.closedFeatures.length) return false;

  // The record describes assertions on these exact append-only closed-feature
  // entries. An internally coherent record is insufficient: its pointers and
  // IDs must resolve to the same live entries, and another record cannot claim
  // the same preserved or removed assertion again.
  const featureIds = new Set();
  const pointers = new Set();
  for (const record of state.stateRepairs) {
    for (const claimant of [record.preservedClaimant, ...record.quarantinedAssertions]) {
      const index = Number(claimant.jsonPointer.split("/")[2]);
      if (!Number.isSafeInteger(index)
        || featureIds.has(claimant.featureId) || pointers.has(claimant.jsonPointer)) return false;
      const entry = state.closedFeatures[index];
      if (!closedEntryStaticShape(entry) || entry.id !== claimant.featureId) return false;
      featureIds.add(claimant.featureId);
      pointers.add(claimant.jsonPointer);
      if (claimant === record.preservedClaimant) {
        if (entry.continuityClose === undefined
          || entry.continuityClose.closeEvidence.path !== record.evidence.path
          || entry.continuityClose.closeEvidence.sha256 !== claimant.expectedSha256) return false;
      } else if (entry.continuityClose !== undefined) return false;
    }
  }
  return true;
}

function validClosedFeatureEntry(root, entry) {
  if (!closedEntryStaticShape(entry)) return false;
  if (entry.continuityClose !== undefined) {
    const close = entry.continuityClose;
    if (!validateClosedArtifact(root, close.result)
      || !validateClosedArtifact(root, close.closeEvidence)) return false;
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
    && validStateRepairRecords(state)
    && state.closedFeatures.at(-1).closedAt === state.updatedAt;
}

function validDiscardedFeatureEntry(root, entry) {
  const expectedKeys = new Set(["id", "planPath", "phaseAtDiscard", "discardedAt", "discardedBy", "reason", "forCommit"]);
  if (entry?.planCancellation !== undefined) expectedKeys.add("planCancellation");
  if (entry?.planMixedStateRecovery !== undefined) expectedKeys.add("planMixedStateRecovery");
  if (!exactKeys(entry, expectedKeys)
    || typeof entry.id !== "string" || entry.id.length === 0
    || (entry.planCancellation !== undefined && (!validPlanCancellation(entry.planCancellation) || entry.planCancellation.featureId !== entry.id))
    || (entry.planMixedStateRecovery !== undefined && (!validPlanMixedStateRecovery(entry.planMixedStateRecovery) || entry.planMixedStateRecovery.featureId !== entry.id))
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
    || state.discardedFeatures.at(-1).discardedAt !== state.updatedAt
    || !validStateRepairRecords(state)) return false;
  if (state.closedFeatures !== undefined
    && (!Array.isArray(state.closedFeatures)
      || !state.closedFeatures.every((entry) => validClosedFeatureEntry(root, entry)))) return false;
  return true;
}

function closedEntryStaticShape(entry) {
  const baseKeys = new Set(["id", "planPath", "phaseAtClose", "closedAt", "closedBy", "forCommit"]);
  const expectedKeys = new Set(baseKeys);
  if (entry?.planCancellation !== undefined) expectedKeys.add("planCancellation");
  if (entry?.planMixedStateRecovery !== undefined) expectedKeys.add("planMixedStateRecovery");
  if (entry?.architectureImpact !== undefined) expectedKeys.add("architectureImpact");
  if (entry?.continuityClose !== undefined) expectedKeys.add("continuityClose");
  if (entry?.coordinatorClose !== undefined) expectedKeys.add("coordinatorClose");
  if (entry?.auditReference !== undefined) expectedKeys.add("auditReference");
  if (!exactKeys(entry, expectedKeys)
    || typeof entry.id !== "string" || entry.id.length === 0
    || (entry.planCancellation !== undefined && (!validPlanCancellation(entry.planCancellation) || entry.planCancellation.featureId !== entry.id))
    || (entry.planMixedStateRecovery !== undefined && (!validPlanMixedStateRecovery(entry.planMixedStateRecovery) || entry.planMixedStateRecovery.featureId !== entry.id))
    || typeof entry.planPath !== "string" || entry.planPath.length === 0
    || !(entry.phaseAtClose === null || typeof entry.phaseAtClose === "string")
    || !(entry.architectureImpact === undefined || [
      "architecture-conforms",
      "architecture-decision-added",
      "architecture-decision-superseded",
      "architecture-summary-updated",
      "no-architecture-impact",
    ].includes(entry.architectureImpact))
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
      || !SHA256_RE.test(close.result.sha256 ?? "")
      || !SHA256_RE.test(close.closeEvidence.sha256 ?? "")) return false;
    try {
      safeRelativePath(close.result.path, "closed Result artifact");
    } catch { return false; }
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
  if (entry.auditReference !== undefined) {
    const audit = entry.auditReference;
    if (!exactKeys(audit, new Set([
      "schema", "auditPlanSha256", "auditReceiptSha256", "criticVerifyLifecycleId",
      "criticVerifyLifecycleReceiptSha256", "outputPath",
    ]))
      || audit.schema !== "pipeline.feature-close-audit-reference.v1"
      || !SHA256_RE.test(audit.auditPlanSha256 ?? "")
      || !SHA256_RE.test(audit.auditReceiptSha256 ?? "")
      || !SHA256_RE.test(audit.criticVerifyLifecycleId ?? "")
      || !SHA256_RE.test(audit.criticVerifyLifecycleReceiptSha256 ?? "")
      || typeof audit.outputPath !== "string"
      || !/^audit-bundles\/[a-z][a-z0-9-]{2,63}\/(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(audit.outputPath)) return false;
  }
  return true;
}

/**
 * Diagnose the one legacy corruption shape this module can repair without
 * changing evidence: several closed features asserted one close-evidence path,
 * while the current bytes match exactly one of them. Every unrelated state
 * field and artifact must already be valid.
 */
function diagnoseSharedCloseEvidencePath(root, state) {
  const refused = (code, details = {}) => ({
    ...details,
    schema: CONTINUITY_REPAIR_DIAGNOSIS_SCHEMA,
    status: "refused",
    code,
  });
  if (!isObject(state)
    || state.schema !== "pipeline.state.v0"
    || state.activeFeature !== undefined
    || state.continuity !== undefined
    || state.planApproval !== undefined
    || state.planRevocation !== undefined
    || state.planApproved !== false
    || !canonicalIsoTimestamp(state.updatedAt)
    || !Array.isArray(state.closedFeatures) || state.closedFeatures.length < 2
    || new Set(state.closedFeatures.map((entry) => entry?.id)).size !== state.closedFeatures.length
    || state.closedFeatures.at(-1)?.closedAt !== state.updatedAt
    || !state.closedFeatures.every(closedEntryStaticShape)
    || !validStateRepairRecords(state)
    || (state.discardedFeatures !== undefined
      && (!Array.isArray(state.discardedFeatures)
        || !state.discardedFeatures.every((entry) => validDiscardedFeatureEntry(root, entry))))) {
    return refused("CONTINUITY-REPAIR-UNRELATED-STATE-INVALID");
  }

  const claimants = [];
  const evidenceObservations = new Map();
  for (let index = 0; index < state.closedFeatures.length; index += 1) {
    const entry = state.closedFeatures[index];
    if (entry.continuityClose === undefined) continue;
    if (!validateClosedArtifact(root, entry.continuityClose.result)) {
      return refused("CONTINUITY-REPAIR-UNRELATED-ARTIFACT-INVALID", {
        jsonPointer: `/closedFeatures/${index}/continuityClose/result`,
        featureId: entry.id,
        artifactKind: "result",
        path: entry.continuityClose.result.path,
        expectedSha256: entry.continuityClose.result.sha256,
      });
    }
    let observed;
    try {
      const path = entry.continuityClose.closeEvidence.path;
      observed = evidenceObservations.get(path);
      if (observed === undefined) {
        observed = observeOptionalProjectFile(root, path, "closed continuity evidence");
        evidenceObservations.set(path, observed);
      }
    } catch (error) {
      return refused("CONTINUITY-REPAIR-EVIDENCE-PATH-UNSAFE", {
        jsonPointer: `/closedFeatures/${index}/continuityClose/closeEvidence`,
        featureId: entry.id,
        artifactKind: "closeEvidence",
        path: entry.continuityClose.closeEvidence.path,
        causeCode: error instanceof KickoffError ? error.code : "KICKOFF-PATH-UNSAFE",
      });
    }
    if (observed.status !== "present") {
      return refused("CONTINUITY-REPAIR-EVIDENCE-MISSING", {
        jsonPointer: `/closedFeatures/${index}/continuityClose/closeEvidence`,
        featureId: entry.id,
        artifactKind: "closeEvidence",
        path: entry.continuityClose.closeEvidence.path,
        expectedSha256: entry.continuityClose.closeEvidence.sha256,
        observedSha256: null,
      });
    }
    claimants.push({
      jsonPointer: `/closedFeatures/${index}/continuityClose/closeEvidence`,
      entryIndex: index,
      featureId: entry.id,
      artifactKind: "closeEvidence",
      path: entry.continuityClose.closeEvidence.path,
      expectedSha256: entry.continuityClose.closeEvidence.sha256,
      observedSha256: observed.sha256,
      status: entry.continuityClose.closeEvidence.sha256 === observed.sha256 ? "matching" : "mismatching",
    });
  }
  const groups = new Map();
  for (const claimant of claimants) {
    const group = groups.get(claimant.path) ?? [];
    group.push(claimant);
    groups.set(claimant.path, group);
  }
  const collisionGroups = [...groups.values()].filter((group) => group.length > 1);
  if (collisionGroups.length !== 1) {
    return refused("CONTINUITY-REPAIR-SHARED-PATH-AMBIGUOUS", {
      sharedPathCount: collisionGroups.length,
    });
  }
  const selected = collisionGroups[0];
  const selectedPath = selected[0].path;
  for (const claimant of claimants) {
    if (claimant.path !== selectedPath && claimant.status !== "matching") {
      return refused("CONTINUITY-REPAIR-UNRELATED-ARTIFACT-INVALID", claimant);
    }
  }
  const matching = selected.filter((claimant) => claimant.status === "matching");
  if (matching.length !== 1) {
    return refused("CONTINUITY-REPAIR-CLAIMANT-AMBIGUOUS", {
      artifactKind: "closeEvidence",
      path: selectedPath,
      observedSha256: selected[0].observedSha256,
      claimants: selected.map(({ entryIndex: _entryIndex, ...claimant }) => claimant),
    });
  }
  return {
    schema: CONTINUITY_REPAIR_DIAGNOSIS_SCHEMA,
    status: "repairable",
    code: "CONTINUITY-SHARED-CLOSE-EVIDENCE-PATH",
    artifactKind: "closeEvidence",
    path: selectedPath,
    observedSha256: selected[0].observedSha256,
    affectedFeatureIds: selected.map((claimant) => claimant.featureId),
    claimants: selected.map(({ entryIndex: _entryIndex, ...claimant }) => claimant),
  };
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
    const drifts = detectClosedEvidenceDrift(root, state);
    let status;
    if (!validStateRepairRecords(state)) {
      status = "damaged";
    } else if (projected.code === "CS-STATUS-ACTIVE" && projected.continuity.status === "valid") {
      status = "valid";
    } else if (projected.code === "CS-STATUS-INACTIVE"
      && (validClosedTransitionState(root, state) || validDiscardedTransitionState(root, state))) {
      status = drifts.length > 0 ? "damaged" : "valid";
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
    const diagnosis = status === "damaged"
      ? diagnoseSharedCloseEvidencePath(root, state)
      : null;
    return {
      continuity: {
        status,
        ...hashes,
        ...(diagnosis === null ? {} : { diagnosis }),
        ...(drifts.length > 0 ? { diagnostics: drifts } : {}),
      },
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

function repairedSharedCloseEvidenceState(state, observed, diagnosis) {
  if (diagnosis?.status !== "repairable"
    || diagnosis.code !== "CONTINUITY-SHARED-CLOSE-EVIDENCE-PATH") {
    fail("CONTINUITY-REPAIR-DIAGNOSIS-INVALID", "shared close-evidence diagnosis is not repairable");
  }
  const matching = diagnosis.claimants.filter((claimant) => claimant.status === "matching");
  const mismatching = diagnosis.claimants.filter((claimant) => claimant.status === "mismatching");
  if (matching.length !== 1 || mismatching.length < 1) {
    fail("CONTINUITY-REPAIR-CLAIMANT-AMBIGUOUS", "shared close-evidence claimant set is ambiguous");
  }
  const next = structuredClone(state);
  const mismatchingPointers = new Set(mismatching.map((claimant) => claimant.jsonPointer));
  for (let index = 0; index < next.closedFeatures.length; index += 1) {
    if (mismatchingPointers.has(`/closedFeatures/${index}/continuityClose/closeEvidence`)) {
      delete next.closedFeatures[index].continuityClose;
    }
  }
  const record = {
    schema: STATE_REPAIR_RECORD_SCHEMA,
    reason: "shared-close-evidence-path",
    // Planning and applying must recompute byte-identically without accepting
    // an unbound clock value. The damaged State's own canonical timestamp is
    // therefore the provenance timestamp carried into this immutable record;
    // it is deliberately not represented as the repair's wall-clock time.
    sourceUpdatedAt: state.updatedAt,
    planSha256: "0".repeat(64),
    stateBeforeSha256: observed.stateObservation.sha256,
    evidence: {
      artifactKind: "closeEvidence",
      path: diagnosis.path,
      observedSha256: diagnosis.observedSha256,
    },
    preservedClaimant: {
      featureId: matching[0].featureId,
      jsonPointer: matching[0].jsonPointer,
      expectedSha256: matching[0].expectedSha256,
    },
    quarantinedAssertions: mismatching.map((claimant) => ({
      featureId: claimant.featureId,
      jsonPointer: claimant.jsonPointer,
      formerAssertion: structuredClone(state.closedFeatures.find((entry) => entry.id === claimant.featureId)?.continuityClose),
    })),
    affectedFeatureIds: [matching[0].featureId, ...mismatching.map((claimant) => claimant.featureId)],
  };
  next.stateRepairs = [...(next.stateRepairs ?? []), record];
  if (!validStateRepairRecords(next)) {
    fail("CONTINUITY-REPAIR-AUDIT-CONFLICT", "proposed continuity repair conflicts with recorded claimant bindings");
  }
  return {
    reason: "repair-shared-close-evidence-path",
    state: next,
    authority: null,
    diagnosis,
  };
}

function continuityRepairBinding(plan) {
  const binding = {
    schema: plan.schema,
    root: plan.root,
    repositoryCapability: plan.repositoryCapability,
    reason: plan.reason,
    calibration: plan.calibration,
    handover: plan.handover,
    history: plan.history,
    authority: plan.authority,
    target: plan.target,
    ...(plan.diagnosis === undefined ? {} : { diagnosis: plan.diagnosis }),
  };
  if (plan.reason === "repair-shared-close-evidence-path") {
    binding.target = structuredClone(plan.target);
    const records = binding.target.value.stateRepairs;
    records.at(-1).planSha256 = "0".repeat(64);
    binding.target.afterSha256 = sha256(expectedStateBytes(binding.target.value));
  }
  return binding;
}

/**
 * Plan four bounded repairs:
 * - quarantine mismatching assertions on one shared close-evidence path;
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
      return {
        schema: CONTINUITY_REPAIR_PLAN_SCHEMA,
        status: "unsupported",
        ...(observed.error?.code === undefined ? {} : { code: observed.error.code }),
      };
    }
    let proposed;
    if (observed.stateObservation?.status === "absent") {
      if (operatorAuthority === null) {
        return { schema: CONTINUITY_REPAIR_PLAN_SCHEMA, status: "operator-authority-required" };
      }
      proposed = operatorConfirmedContinuity(observed, operatorAuthority);
    } else if (observed.stateObservation?.status !== "present") {
      return { schema: CONTINUITY_REPAIR_PLAN_SCHEMA, status: "unsupported" };
    } else if (!validStateRepairRecords(observed.state)) {
      return {
        schema: CONTINUITY_REPAIR_PLAN_SCHEMA,
        status: "unsupported",
        code: "CONTINUITY-REPAIR-UNRELATED-STATE-INVALID",
        diagnosis: observed.continuity.diagnosis,
      };
    } else if (observed.continuity.diagnosis?.status === "repairable") {
      proposed = repairedSharedCloseEvidenceState(observed.state, observed, observed.continuity.diagnosis);
    } else if (observed.projected?.code === "CS-STATUS-CONTINUITY-INVALID") {
      proposed = normalizedContinuity(observed.state, observed);
    } else if (observed.projected?.code === "CS-STATUS-ACTIVE-NO-CONTINUITY"
      && observed.historyObservation.status === "absent") {
      proposed = establishedContinuity(observed.state, observed);
    } else {
      return {
        schema: CONTINUITY_REPAIR_PLAN_SCHEMA,
        status: "unsupported",
        ...(observed.continuity.diagnosis?.code === undefined ? {} : {
          code: observed.continuity.diagnosis.code,
          diagnosis: observed.continuity.diagnosis,
        }),
      };
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
      ...(proposed.diagnosis === undefined ? {} : { diagnosis: proposed.diagnosis }),
    };
    const planSha256 = canonicalSha256(binding);
    if (proposed.reason === "repair-shared-close-evidence-path") {
      binding.target.value.stateRepairs.at(-1).planSha256 = planSha256;
      binding.target.afterSha256 = sha256(expectedStateBytes(binding.target.value));
    }
    return {
      ...binding,
      status: "ready",
      planSha256,
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
    if (typeof deps.beforeCasRecheck === "function") deps.beforeCasRecheck(plan);
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
    if (typeof deps.beforeStateReplace === "function") deps.beforeStateReplace(plan);
    // Recheck the complete binding after temporary-file preparation, including
    // evidence and physical path safety. A State-only hash would miss evidence
    // drift between the first CAS check and the replacement.
    const beforeReplace = planOnboardingContinuityRepair({ rootDir, repositoryCapability, spawn, operatorAuthority });
    if (beforeReplace.status !== "ready" || beforeReplace.planSha256 !== plan.planSha256) {
      fail("CONTINUITY-REPAIR-CAS-DRIFT", "continuity repair preimage changed before replacement");
    }
    renameSync(temporary, statePath);
    temporaryRecord = null;
    committed = true;
    fsyncDirectory(dirname(statePath));
    if (typeof deps.beforeReadback === "function") deps.beforeReadback(plan);
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
    if (error instanceof KickoffError) {
      fail(error.code, error.message, { committed: committed || error.committed });
    }
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
  if (value.schema === PRIVATE_SESSION_CLEANUP_ORPHAN_RELEASE_RECEIPT_SCHEMA) {
    return {
      schema: value.schema,
      featureId: value.featureId,
      stateSha256: value.stateSha256,
      bindingSha256: value.bindingSha256,
      by: value.by,
      reason: value.reason,
      releasedAt: value.releasedAt,
    };
  }
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
  if (value.schema === PRIVATE_SESSION_CLEANUP_ORPHAN_RELEASE_RECEIPT_SCHEMA) {
    if (!exactKeys(value, new Set([
      "schema", "featureId", "stateSha256", "bindingSha256", "by", "reason", "releasedAt", "mac",
    ]))
      || typeof value.featureId !== "string" || value.featureId.length === 0
      || !SHA256_RE.test(value.stateSha256 ?? "")
      || !SHA256_RE.test(value.bindingSha256 ?? "")
      || typeof value.by !== "string" || value.by.trim().length === 0
      || typeof value.reason !== "string" || value.reason.trim().length === 0
      || !canonicalIsoTimestamp(value.releasedAt)
      || !SHA256_RE.test(value.mac ?? "")) {
      fail("SESSION-CLEANUP-PRIVATE-DAMAGED", "private cleanup release receipt has an invalid orphan shape");
    }
  } else if (!exactKeys(value, new Set([
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
    observed.receipt?.schema === PRIVATE_SESSION_CLEANUP_ORPHAN_RELEASE_RECEIPT_SCHEMA
      ? observed.sha256
      : observed.receipt?.recoveryPlanSha256 ?? observed.quarantine.recoveryPlanSha256,
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


function validEvidenceRepinEntry(entry) {
  return isObject(entry)
    && typeof entry.featureId === "string" && entry.featureId.length > 0
    && typeof entry.artifactPath === "string" && entry.artifactPath.length > 0
    && SHA256_RE.test(entry.oldSha256 ?? "")
    && SHA256_RE.test(entry.newSha256 ?? "")
    && canonicalIsoTimestamp(entry.repinnedAt)
    && typeof entry.by === "string" && entry.by.length > 0;
}

export function detectClosedEvidenceDrift(root, state) {
  if (!isObject(state) || !Array.isArray(state.closedFeatures)) return [];
  const drifts = [];
  for (let index = 0; index < state.closedFeatures.length; index += 1) {
    const entry = state.closedFeatures[index];
    if (!isObject(entry) || entry.continuityClose === undefined) continue;
    const close = entry.continuityClose;
    if (isObject(close.result) && typeof close.result.path === "string") {
      let observed;
      try {
        observed = observeOptionalProjectFile(root, close.result.path, "closed continuity artifact");
      } catch {
        observed = { status: "missing", sha256: null };
      }
      if (observed.status !== "present" || observed.sha256 !== close.result.sha256) {
        drifts.push({
          code: "CLOSED-EVIDENCE-DRIFT",
          featureId: entry.id,
          artifact: close.result.path,
          path: close.result.path,
          artifactKind: "result",
          expectedSha256: close.result.sha256,
          observedSha256: observed.status === "present" ? observed.sha256 : null,
          status: observed.status === "present" ? "modified" : "missing",
        });
      }
    }
    if (isObject(close.closeEvidence) && typeof close.closeEvidence.path === "string") {
      let observed;
      try {
        observed = observeOptionalProjectFile(root, close.closeEvidence.path, "closed continuity evidence");
      } catch {
        observed = { status: "missing", sha256: null };
      }
      if (observed.status !== "present" || observed.sha256 !== close.closeEvidence.sha256) {
        drifts.push({
          code: "CLOSED-EVIDENCE-DRIFT",
          featureId: entry.id,
          artifact: close.closeEvidence.path,
          path: close.closeEvidence.path,
          artifactKind: "closeEvidence",
          expectedSha256: close.closeEvidence.sha256,
          observedSha256: observed.status === "present" ? observed.sha256 : null,
          status: observed.status === "present" ? "modified" : "missing",
        });
      }
    }
  }
  return drifts;
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
    if (isSuccessfulSpawn(candidate)) {
      result = candidate;
      break;
    }
  }
  if (!isSuccessfulSpawn(result)) return null;
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

export function observeSessionCleanupState(rootDir, spawn = defaultGitSpawn) {
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
        const discardedEntry = Array.isArray(state.discardedFeatures)
          ? state.discardedFeatures.find((entry) => entry.id === observed.privateBinding.featureId)
          : undefined;
        if (!discardedEntry) {
          fail("SESSION-CLEANUP-PRIVATE-CAS", "private cleanup binding exists for a non-bindable design state");
        }
        return {
          ...observed,
          mode: "active",
          revision: null,
          activeFeatureId: state.activeFeature.id,
          sessionCleanup: null,
          orphanBinding: observed.privateBinding,
          discardedEntry,
        };
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
    if (state.continuity?.runtime?.sessionCleanup === null) {
      const discardedEntry = Array.isArray(state.discardedFeatures)
        ? state.discardedFeatures.find((entry) => entry.id === observed.privateBinding.featureId)
        : undefined;
      if (discardedEntry) {
        return {
          ...observed,
          mode: "active",
          revision: state.continuity.revision,
          activeFeatureId: state.activeFeature.id,
          sessionCleanup: null,
          orphanBinding: observed.privateBinding,
          discardedEntry,
        };
      }
    }
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
  const isOrphanReceipt = privateReleaseReceipt?.schema === PRIVATE_SESSION_CLEANUP_ORPHAN_RELEASE_RECEIPT_SCHEMA;
  const matchingDiscarded = isOrphanReceipt
    ? observed.state.discardedFeatures?.find((entry) => entry.id === privateReleaseReceipt.featureId)
    : undefined;
  const orphanReceiptConflict = isOrphanReceipt
    && observed.neutral
    && (matchingDiscarded === undefined || privateReleaseReceipt.stateSha256 !== observed.stateSha256);
  const closedReceiptConflict = !isOrphanReceipt && observed.neutral && observed.mode === "closed"
    && observed.privateBinding === null && privateReceiptObservation.status === "valid"
    && (privateReleaseReceipt.featureId !== closedEntry?.id
      || privateReleaseReceipt.stateSha256 !== observed.stateSha256
      || coordinatorClose === undefined
      || privateReleaseReceipt.coordinatorCloseSha256 !== canonicalSha256(coordinatorClose));
  const privateReceiptConflict = isOrphanReceipt ? orphanReceiptConflict : closedReceiptConflict;
  const privateReceiptInvalid = privateReceiptObservation.status === "invalid" || privateReceiptConflict;
  const status = observed.mode === "active"
    ? (observed.orphanBinding
      ? "orphan-bound"
      : (observed.revision === null
        ? "design-unbound"
        : observed.sessionCleanup === null ? "unbound" : "bound"))
    : observed.neutral && observed.privateBinding === null && privateReceiptInvalid
      ? "closed-receipt-invalid"
    : (isOrphanReceipt && !orphanReceiptConflict && observed.privateBinding === null)
      ? "released"
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
    ...(observed.orphanBinding ? { orphanBinding: structuredClone(observed.orphanBinding) } : {}),
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
function bindOnboardingSessionCleanupInternal({
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
 * A narrower, refusal-biased sibling of bindOnboardingSessionCleanup for a
 * caller that has no Pipeline session to bind against at all (a session-less
 * checkout -- e.g. a CI runner, which discards the entire checkout including
 * `.git` when the job ends, so nothing this binds can ever leak). This is
 * NOT a general-purpose bind entrypoint: it refuses -- never falling through
 * to the tracked-authority-file write path bindOnboardingSessionCleanup takes
 * for a non-neutral continuity state -- whenever the resolved authority tier
 * is not neutral, or the continuity state is not a plain bindable "unbound"
 * active state (any other status -- bound, closed, released, design-unbound,
 * a malformed/invalid observation -- is a caller error, never silently
 * retried here). A caller unable to satisfy this narrow precondition gets a
 * typed refusal and falls back to its own prior behavior; it never receives
 * a forged or unsealed receipt.
 */
export function bindEphemeralPrivateCleanup({ rootDir, sessionCleanup, deps = {} } = {}) {
  if (!isObject(sessionCleanup)) {
    fail("SESSION-CLEANUP-EPHEMERAL-REQUEST", "ephemeral cleanup binding request is invalid");
  }
  const observed = observeSessionCleanupState(rootDir, deps.spawn ?? defaultGitSpawn);
  if (!observed.neutral || observed.mode !== "active" || observed.revision === null || observed.sessionCleanup !== null) {
    fail("SESSION-CLEANUP-EPHEMERAL-NOT-APPLICABLE", "ephemeral private cleanup binding is not applicable to this continuity state");
  }
  const bound = bindOnboardingSessionCleanup({
    rootDir,
    expectedStateSha256: observed.stateSha256,
    expectedRevision: observed.revision,
    sessionCleanup,
    deps,
  });
  if (bound.storage !== "private-runtime") {
    fail("SESSION-CLEANUP-EPHEMERAL-STORAGE", "ephemeral cleanup binding unexpectedly targeted tracked authority state");
  }
  return bound;
}

/**
 * Release an orphan private session cleanup binding belonging to a discarded feature.
 * Writes an authenticated private release receipt before unlinking the binding.
 */
function backupPrivateFile(commonDir, label, filePath, deps = {}) {
  if (typeof deps.backupBeforeMutation === "function") {
    return deps.backupBeforeMutation(commonDir, deps, label, filePath);
  }
  let info;
  try {
    info = lstatSync(filePath);
  } catch (err) {
    if (err?.code === "ENOENT") return null;
    throw err;
  }
  if (!info.isFile() || info.isSymbolicLink()) {
    fail("SESSION-CLEANUP-ORPHAN-RELEASE-BACKUP", "backup source is unsafe");
  }
  const bytes = readFileSync(filePath);
  const backupDir = join(commonDir, "agent-pipeline", "session-cleanup-recovery", "backups");
  mkdirSync(backupDir, { recursive: true, mode: 0o700 });
  try { chmodSync(backupDir, 0o700); } catch {}
  const backupPath = join(backupDir, `${label}.bak`);
  const tempPath = `${backupPath}.tmp-${Date.now()}`;
  writeFileSync(tempPath, bytes, { mode: 0o600 });
  renameSync(tempPath, backupPath);
  fsyncDirectory(backupDir);
  return backupPath;
}

function sameOrphanReleaseReceipt(receipt, expected) {
  return receipt?.schema === PRIVATE_SESSION_CLEANUP_ORPHAN_RELEASE_RECEIPT_SCHEMA
    && canonicalSha256(privateReleaseReceiptCore(receipt)) === canonicalSha256(expected);
}

function observeOrphanReleaseDescriptor(root, privateBinding, deps) {
  const listDescriptors = deps.listActiveSessionDescriptorsFn
    ?? deps.listActiveSessionDescriptors
    ?? listActiveSessionDescriptors;
  const activeDescriptors = listDescriptors(root);
  const matchingDescriptors = activeDescriptors.filter(
    (entry) => entry.sessionId === privateBinding.sessionCleanup.sessionId,
  );
  const unrelatedDescriptors = activeDescriptors.filter(
    (entry) => entry.sessionId !== privateBinding.sessionCleanup.sessionId,
  );
  if (unrelatedDescriptors.length > 0 || matchingDescriptors.length > 1) {
    fail("SESSION-CLEANUP-ORPHAN-RELEASE-DESCRIPTOR-ACTIVE", "cannot release orphan cleanup binding while unrelated session descriptors are active");
  }
  if (matchingDescriptors.length === 0) return null;
  const matching = matchingDescriptors[0];
  if (matching.descriptorSha256 !== privateBinding.sessionCleanup.descriptorSha256) {
    fail("SESSION-CLEANUP-ORPHAN-RELEASE-DESCRIPTOR-ACTIVE", "session descriptor digest does not match the private cleanup binding");
  }
  const inspectOwner = deps.inspectSessionOwnerRuntimeFn
    ?? deps.inspectSessionOwnerRuntime
    ?? inspectSessionOwnerRuntime;
  const owner = inspectOwner(root, matching.sessionId, {
    expectedDescriptorSha256: matching.descriptorSha256,
  });
  if (!isObject(owner)
    || owner.schema !== "pipeline.session-owner-status.v1"
    || owner.sessionId !== matching.sessionId
    || owner.descriptorSha256 !== matching.descriptorSha256
    || !new Set(["live", "not-live", "reused", "unavailable", "unobserved"]).has(owner.status)) {
    fail("SESSION-CLEANUP-ORPHAN-RELEASE-DESCRIPTOR-ACTIVE", "session owner status readback is invalid");
  }
  if (owner.status !== "not-live") {
    fail("SESSION-CLEANUP-ORPHAN-RELEASE-DESCRIPTOR-ACTIVE", `cannot release orphan cleanup binding while its session descriptor is ${owner.status}`);
  }
  return {
    sessionId: matching.sessionId,
    descriptorSha256: matching.descriptorSha256,
  };
}

function orphanReleasePlanBinding(plan) {
  const { planSha256: _planSha256, ...binding } = plan;
  return binding;
}

/** Read-only exact plan for releasing one private binding after public discard. */
export function planOrphanSessionCleanupBindingRelease({
  rootDir,
  by,
  reason,
  featureId = null,
  expectedStateAfterSha256 = null,
  deps = {},
} = {}) {
  if (typeof by !== "string" || by.trim() === ""
    || typeof reason !== "string" || reason.trim() === ""
    || (featureId !== null && (typeof featureId !== "string" || featureId.length === 0))
    || (expectedStateAfterSha256 !== null && !SHA256_RE.test(expectedStateAfterSha256))) {
    fail("SESSION-CLEANUP-ORPHAN-RELEASE-REQUEST", "orphan cleanup release plan request is invalid");
  }
  const spawn = deps.spawn ?? defaultGitSpawn;
  const initial = observeMachineState(rootDir, spawn);
  const privateBinding = initial.privateBinding;
  // Legacy .claude state has no private cleanup binding model.  Do not probe a
  // private Git area that cannot exist there: this makes an honest legacy discard
  // needlessly impossible while modern neutral state remains fully fail-closed.
  const receiptObservation = initial.neutral
    ? observePrivateCleanupReleaseReceipt(initial.root, { spawn })
    : { status: "absent", receipt: null };
  const inferredFeatureId = featureId
    ?? privateBinding?.featureId
    ?? (receiptObservation.receipt?.schema === PRIVATE_SESSION_CLEANUP_ORPHAN_RELEASE_RECEIPT_SCHEMA
      ? receiptObservation.receipt.featureId
      : null);
  if (privateBinding !== null && privateBinding.featureId !== inferredFeatureId) {
    fail("SESSION-CLEANUP-PRIVATE-CAS", "private cleanup binding names a different feature");
  }
  const discardedEntry = inferredFeatureId === null ? undefined : initial.state.discardedFeatures?.find(
    (entry) => entry.id === inferredFeatureId,
  );
  const activeTarget = inferredFeatureId !== null && initial.state.activeFeature?.id === inferredFeatureId;
  if (privateBinding !== null && !discardedEntry && !activeTarget) {
    fail("SESSION-CLEANUP-ORPHAN-RELEASE-NOT-DISCARDED", "orphan cleanup release targets neither the active transition feature nor a discarded feature");
  }
  if (activeTarget && expectedStateAfterSha256 === null) {
    fail("SESSION-CLEANUP-ORPHAN-RELEASE-POSTIMAGE", "active-feature release planning requires the exact discarded State postimage digest");
  }
  const stateAfterSha256 = expectedStateAfterSha256 ?? initial.stateSha256;
  if (discardedEntry && expectedStateAfterSha256 !== null
    && expectedStateAfterSha256 !== initial.stateSha256) {
    fail("SESSION-CLEANUP-ORPHAN-RELEASE-POSTIMAGE", "discarded-feature recovery must bind the current State digest");
  }

  if (privateBinding === null) {
    if (receiptObservation.status !== "absent") {
      const receipt = receiptObservation.receipt;
      if (receiptObservation.status !== "valid"
        || receipt?.schema !== PRIVATE_SESSION_CLEANUP_ORPHAN_RELEASE_RECEIPT_SCHEMA
        || (inferredFeatureId !== null && receipt.featureId !== inferredFeatureId)
        || receipt.stateSha256 !== stateAfterSha256
      ) {
        fail("SESSION-CLEANUP-PRIVATE-CAS", "private cleanup release receipt conflicts with the release plan");
      }
    }
    const plan = {
      schema: SESSION_CLEANUP_ORPHAN_RELEASE_PLAN_SCHEMA,
      status: "not-needed",
      root: initial.root,
      featureId: inferredFeatureId,
      by,
      reason,
      stateBeforeSha256: initial.stateSha256,
      stateAfterSha256,
      binding: null,
      descriptor: null,
      receipt: receiptObservation.receipt === null
        ? null
        : privateReleaseReceiptCore(receiptObservation.receipt),
    };
    return { ...plan, planSha256: canonicalSha256(plan) };
  }

  const descriptor = observeOrphanReleaseDescriptor(initial.root, privateBinding, deps);
  let receipt;
  if (receiptObservation.status === "absent") {
    const releasedAt = deps.now ? deps.now() : new Date().toISOString();
    if (!canonicalIsoTimestamp(releasedAt)) {
      fail("SESSION-CLEANUP-ORPHAN-RELEASE-REQUEST", "orphan cleanup release timestamp is invalid");
    }
    receipt = {
      schema: PRIVATE_SESSION_CLEANUP_ORPHAN_RELEASE_RECEIPT_SCHEMA,
      featureId: inferredFeatureId,
      stateSha256: stateAfterSha256,
      bindingSha256: initial.privateBindingSha256,
      by,
      reason,
      releasedAt,
    };
  } else {
    receipt = receiptObservation.receipt === null
      ? null
      : privateReleaseReceiptCore(receiptObservation.receipt);
    const expected = receipt === null ? null : {
      ...receipt,
      schema: PRIVATE_SESSION_CLEANUP_ORPHAN_RELEASE_RECEIPT_SCHEMA,
      featureId: inferredFeatureId,
      stateSha256: stateAfterSha256,
      bindingSha256: initial.privateBindingSha256,
    };
    if (receiptObservation.status !== "valid" || receipt === null
      || !sameOrphanReleaseReceipt(receiptObservation.receipt, expected)) {
      fail("SESSION-CLEANUP-PRIVATE-CAS", "private cleanup release receipt conflicts with the release plan");
    }
  }
  const plan = {
    schema: SESSION_CLEANUP_ORPHAN_RELEASE_PLAN_SCHEMA,
    status: "ready",
    root: initial.root,
    featureId: inferredFeatureId,
    by,
    reason,
    stateBeforeSha256: initial.stateSha256,
    stateAfterSha256,
    binding: {
      sha256: initial.privateBindingSha256,
      sessionCleanup: structuredClone(privateBinding.sessionCleanup),
    },
    descriptor,
    receipt,
  };
  return { ...plan, planSha256: canonicalSha256(plan) };
}

/** Apply one exact plan after the public discarded State is durable. */
export function applyOrphanSessionCleanupBindingRelease({
  plan,
  expectedPlanSha256,
  stateLockHeld = false,
  deps = {},
} = {}) {
  if (!isObject(plan)
    || plan.schema !== SESSION_CLEANUP_ORPHAN_RELEASE_PLAN_SCHEMA
    || !new Set(["ready", "not-needed"]).has(plan.status)
    || !SHA256_RE.test(plan.planSha256 ?? "")
    || expectedPlanSha256 !== plan.planSha256
    || canonicalSha256(orphanReleasePlanBinding(plan)) !== plan.planSha256
    || !SHA256_RE.test(plan.stateBeforeSha256 ?? "")
    || !SHA256_RE.test(plan.stateAfterSha256 ?? "")
    || typeof stateLockHeld !== "boolean") {
    fail("SESSION-CLEANUP-ORPHAN-RELEASE-PLAN", "orphan cleanup release plan is invalid or changed");
  }
  const spawn = deps.spawn ?? defaultGitSpawn;
  const execute = () => {
    let committed = false;
    try {
      const current = observeMachineState(plan.root, spawn);
      if (current.stateSha256 !== plan.stateAfterSha256) {
        fail("SESSION-CLEANUP-RELEASE-CAS", "discarded State postimage does not match the orphan release plan");
      }
      if (plan.featureId !== null
        && !current.state.discardedFeatures?.some((entry) => entry.id === plan.featureId)) {
        fail("SESSION-CLEANUP-ORPHAN-RELEASE-NOT-DISCARDED", "orphan cleanup release postimage does not contain the discarded feature");
      }
      const currentBindingObs = {
        binding: current.privateBinding,
        sha256: current.privateBindingSha256,
      };
      const currentReceiptObs = observePrivateCleanupReleaseReceipt(current.root, { spawn });
      const receiptMatches = currentReceiptObs.status === "valid"
        && sameOrphanReleaseReceipt(currentReceiptObs.receipt, plan.receipt);
      if (plan.status === "not-needed") {
        if (currentBindingObs.binding !== null
          || (plan.receipt === null
            ? currentReceiptObs.status !== "absent"
            : !receiptMatches)) {
          fail("SESSION-CLEANUP-PRIVATE-CAS", "no-write orphan release plan preimage changed");
        }
        return {
          schema: SESSION_CLEANUP_BIND_SCHEMA,
          status: "released",
          root: current.root,
          stateSha256: current.stateSha256,
          featureId: plan.featureId,
          mutated: false,
        };
      }
      if (currentBindingObs.binding !== null
        && (currentBindingObs.sha256 !== plan.binding.sha256
          || currentBindingObs.binding.featureId !== plan.featureId
          || canonicalSha256(currentBindingObs.binding.sessionCleanup)
            !== canonicalSha256(plan.binding.sessionCleanup))) {
        fail("SESSION-CLEANUP-PRIVATE-CAS", "private cleanup binding changed after release planning");
      }
      if (currentBindingObs.binding === null && !receiptMatches) {
        fail("SESSION-CLEANUP-PRIVATE-CAS", "private cleanup binding disappeared without the planned receipt");
      }
      if (currentBindingObs.binding !== null) {
        const descriptorBeforeCommit = observeOrphanReleaseDescriptor(current.root, currentBindingObs.binding, deps);
        if (canonicalSha256(descriptorBeforeCommit) !== canonicalSha256(plan.descriptor)) {
          fail("SESSION-CLEANUP-ORPHAN-RELEASE-DESCRIPTOR-ACTIVE", "session descriptor changed after release planning");
        }
      }
      if (!receiptMatches) {
        if (currentReceiptObs.status !== "absent") {
          fail("SESSION-CLEANUP-PRIVATE-CAS", "private cleanup release receipt changed after planning");
        }
        writePrivateCleanupReleaseReceipt(current.root, plan.receipt, { spawn });
        committed = true;
        deps.afterReceiptWrite?.({ root: current.root, receipt: structuredClone(plan.receipt) });
      } else {
        committed = true;
      }

      if (currentBindingObs.binding !== null) {
        const descriptorNow = observeOrphanReleaseDescriptor(current.root, currentBindingObs.binding, deps);
        if (descriptorNow !== null) {
          if (plan.descriptor === null
            || canonicalSha256(descriptorNow) !== canonicalSha256(plan.descriptor)) {
            fail("SESSION-CLEANUP-ORPHAN-RELEASE-DESCRIPTOR-ACTIVE", "session descriptor changed after release planning");
          }
          const loadDescriptor = deps.loadSessionDescriptorFn ?? deps.loadSessionDescriptor ?? loadSessionDescriptor;
          const loaded = loadDescriptor(current.root, descriptorNow.sessionId, {
            expectedDescriptorSha256: descriptorNow.descriptorSha256,
          });
          const commonDir = loaded.repo.commonDir;
          const manifestPath = join(commonDir, "agent-pipeline", "session-cleanup", "active", `${loaded.sessionId}.json`);
          if (existsSync(manifestPath)) {
            backupPrivateFile(commonDir, `session-cleanup-manifest.${loaded.sessionId}`, manifestPath, deps);
            unlinkSync(manifestPath);
            fsyncDirectory(dirname(manifestPath));
          }
          backupPrivateFile(commonDir, `session-descriptor.${loaded.sessionId}`, loaded.path, deps);
          unlinkSync(loaded.path);
          fsyncDirectory(dirname(loaded.path));
          deps.afterDescriptorRetire?.({ root: current.root, sessionId: loaded.sessionId });
        }
        const bindingBeforeDelete = readPrivateCleanupBinding(current.root, { spawn });
        if (bindingBeforeDelete.binding !== null) {
          if (bindingBeforeDelete.sha256 !== plan.binding.sha256) {
            fail("SESSION-CLEANUP-PRIVATE-CAS", "private cleanup binding changed during release");
          }
          deletePrivateCleanupBinding(current.root, plan.binding.sessionCleanup, { spawn });
          deps.afterBindingUnlink?.({ root: current.root });
        }
      }
      const finalBinding = readPrivateCleanupBinding(current.root, { spawn });
      const finalReceipt = observePrivateCleanupReleaseReceipt(current.root, { spawn });
      if (finalBinding.binding !== null
        || finalReceipt.status !== "valid"
        || !sameOrphanReleaseReceipt(finalReceipt.receipt, plan.receipt)) {
        fail("SESSION-CLEANUP-ORPHAN-RELEASE-READBACK", "orphan cleanup release readback is invalid", { committed: true });
      }
      fsyncDirectory(finalReceipt.paths.directory);
      return {
        schema: SESSION_CLEANUP_BIND_SCHEMA,
        status: "released",
        root: current.root,
        stateSha256: current.stateSha256,
        featureId: plan.featureId,
        receipt: finalReceipt.receipt,
        mutated: true,
        storage: "private-runtime",
      };
    } catch (error) {
      if (error instanceof KickoffError) {
        fail(error.code, error.message, { committed: committed || error.committed });
      }
      fail("SESSION-CLEANUP-ORPHAN-RELEASE-WRITE", "orphan cleanup release failed", { committed });
    }
  };
  if (stateLockHeld) return execute();
  const token = `session-cleanup-orphan-release-${plan.planSha256.slice(0, 32)}`;
  const lock = acquireLock(
    `${join(plan.root, authorityPaths(plan.root).state)}.lock`,
    "pipeline.continuity-lock.v0",
    token,
    { nowMs: deps.nowMs ?? Date.now, lockStaleMs: deps.lockStaleMs ?? 30_000 },
  );
  try { return execute(); } finally { releaseLock(lock); }
}

export function releaseOrphanSessionCleanupBinding({
  rootDir,
  by,
  reason,
  featureId = null,
  deps = {},
} = {}) {
  const plan = planOrphanSessionCleanupBindingRelease({
    rootDir,
    by,
    reason,
    featureId,
    deps,
  });
  return applyOrphanSessionCleanupBindingRelease({
    plan,
    expectedPlanSha256: plan.planSha256,
    deps,
  });
}

/**
 * Clear one exact persisted handle after the caller has proved that descriptor
 * closure completed. Unknown or different handles never rotate through this
 * routine.
 */
function releaseOnboardingSessionCleanupInternal({
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
    "This tracked handover is a design snapshot. Run `pipeline-state inspect`",
    "for the current typed next action; canonical pipeline state owns lifecycle",
    "authority. Git-backed runtime transitions publish an advisory private",
    "handover projection without rewriting this tracked file.",
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
function promotionHandoverContent({ featureId, prdPath, specPath, designInputPath, profile, hasKickoffPredecessor }) {
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
    ...(hasKickoffPredecessor ? [
      "This active package replaces the provisional kickoff PRD and specification.",
      "",
    ] : []),
    "## Next action",
    "",
    "Review the PRD and specification, then submit the plan for PO approval:",
    "`pipeline-state submit-plan --by <name> --profile <epic|feature|mini>`.",
    "Implementation writes stay refused until the plan is approved and the phase is",
    "switched to `implementation`.",
    "",
    "This tracked handover is a design snapshot. Run `pipeline-state inspect`",
    "for the current typed next action; canonical pipeline state owns lifecycle",
    "authority. Git-backed runtime transitions publish an advisory private",
    "handover projection without rewriting this tracked file.",
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
    "The submitted plan is immutable. Run `pipeline-state inspect` and follow",
    "its typed next action. Feature and epic designs complete Advisor and readiness",
    "before one final PO approval; implementation stays refused until approval.",
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
    hasKickoffPredecessor: entry.kind === "kickoff-promotion",
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
function planBoundApplyAction(onboardingScript, commandArgv, optionArgv, runner, planSha256, schema, statuses = ["ready"]) {
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
      statuses,
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
      ["applied"],
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
  if (!SAFE_FEATURE_ID.test(featureId ?? "")) fail("KICKOFF-PROMOTION-INPUT", "promotion feature id is invalid");
  if (featureId.startsWith("kickoff-")) {
    fail("KICKOFF-PROMOTION-INPUT", "promotion feature id must not start with reserved prefix \"kickoff-\"; choose a new lowercase feature slug");
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
function promotionArtifacts(root, input, { checkMarkers = true, checkAcknowledgement = true } = {}) {
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
    // A generated draft can be expanded by the runner before it is submitted.
    // Letting the pristine generated bytes bind without an acknowledgement
    // created a gap: that later authored plan reached `approve-plan --by` even
    // under the repository's signature policy.  There is therefore no
    // generator exemption at the authority boundary.  The policy-selected
    // acknowledgement always certifies the exact PRD/Spec pair that becomes
    // bindable authority.
    if (checkAcknowledgement && acknowledgementMarkers.length !== 1) {
      let nextAction;
      try { parseArchitectureDesign(prdText); } catch (error) {
        nextAction = { kind: "architecture-design-required", mutation: false, requiresConfirmation: false,
          schema: "pipeline.architecture-design-remediation.v1", code: error.message,
          prdPath: input.prdPath, specPath: input.specPath,
          guidance: "Author and review the staging architecture design before the single PO approval." };
      }
      const refusal = new KickoffError(
        "KICKOFF-PROMOTION-PRD-ACKNOWLEDGEMENT-MARKER-MISSING",
        "The promoted PRD must carry the PO's plan acknowledgement marker exactly once, as"
          + " <!-- po-plan-acknowledged: content-sound-and-spec-consistent --> on its own line;"
          + " the PO plan gate will otherwise refuse it with no sanctioned repair route once bound.",
      );
      if (nextAction) refusal.nextAction = nextAction;
      throw refusal;
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
  const stateKeys = new Set(["schema", "activeFeature", "planApproved", "continuity"]);
  if (state.bootstrapAcknowledgementRequired !== undefined) stateKeys.add("bootstrapAcknowledgementRequired");
  if (!exactKeys(state, stateKeys)) {
    fail("KICKOFF-PROMOTION-PLAN", "promotion state postimage is invalid");
  }
  if (state.schema !== "pipeline.state.v0" || state.activeFeature.id !== input.featureId
    || state.activeFeature.planPath !== input.planPath || state.activeFeature.phase !== "design"
    || state.planApproved !== false || state.continuity.featureId !== input.featureId
    || state.continuity.authority.prd.path !== input.prdPath
    || state.continuity.authority.prd.sha256 !== plan.authority.prd.sha256
    || state.continuity.authority.spec.path !== input.specPath
    || state.continuity.authority.spec.sha256 !== plan.authority.spec.sha256
    || !(state.bootstrapAcknowledgementRequired === undefined || state.bootstrapAcknowledgementRequired === true)
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
  // Epic/feature onboarding defers the PO decision until the complete v2
  // design-workflow package has Advisor and readiness evidence. Requiring a
  // separately signed PRD marker here would create a second PO approval before
  // the design course. Mini/legacy profiles retain the established marker.
  const checkMarkers = !allowAppliedReplay;
  const checkAcknowledgement = !new Set(["epic", "feature"]).has(input.profile);
  const authority = promotionArtifacts(observed.root, input, { checkMarkers, checkAcknowledgement });
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
  // Every coordinator-sourced PRD now carries the policy-selected
  // acknowledgement marker before promotion.  Persist that requirement so a
  // later plan approval can never silently downgrade to `--by` attribution.
  const acknowledgement = observeBootstrapBindAcknowledgement({
    rootDir: observed.root, repositoryCapability, spawn,
  });
  if (acknowledgement.acknowledged === true && !new Set(["epic", "feature"]).has(input.profile)) {
    next.bootstrapAcknowledgementRequired = true;
  }
  const valid = validateContinuityState(next.continuity, featureId);
  if (!valid.ok) fail("KICKOFF-PROMOTION-PLAN", `coordinator-sourced continuity was rejected (${valid.code})`);
  const afterStateSha256 = sha256(expectedStateBytes(next));
  const handoverContentBytes = promotionHandoverContent({
    featureId, prdPath: authority.prd.path, specPath: authority.spec.path,
    designInputPath: authority.designInput.path, profile: input.profile,
    hasKickoffPredecessor: false,
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
  // A generated coordinator checkpoint is a one-way routing boundary.  The
  // legacy kickoff-promotion ceremony has an attended-chat profile prompt of
  // its own and therefore cannot stand in for the configured shared
  // signature acknowledgement.  Without this check an agent could discard an
  // incomplete coordinator state, hand-write the marker, and re-enter through
  // `kickoff promote plan` -- exactly the Claude/Antigravity bypass observed
  // in greenfield testing.  Completed legacy-promotion replay remains
  // readable; only a NEW legacy promotion is refused.
  if (!allowAppliedReplay) {
    const checkpoint = readOnboardingIntakeCheckpoint({ rootDir: observed.root, repositoryCapability, spawn });
    if (checkpoint.status === "present" && checkpoint.value.transactionState === "generated") {
      fail("KICKOFF-PROMOTION-COORDINATOR-REQUIRED",
        "a generated onboarding checkpoint requires the configured bootstrap acknowledgement and bind route; kickoff promotion cannot replace its human-approval ceremony");
    }
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
    hasKickoffPredecessor: true,
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
    ...(Object.hasOwn(value, "retiredEnrollmentGenerationSha256") ? ["retiredEnrollmentGenerationSha256"] : []),
  ])) || (Object.hasOwn(value, "retiredEnrollmentGenerationSha256") && !SHA256_RE.test(value.retiredEnrollmentGenerationSha256))) return false;
  if (value.schema !== INTAKE_CHECKPOINT_SCHEMA || value.root !== root) return false;
  if (!Number.isSafeInteger(value.revision) || value.revision < 0) return false;
  if (!canonicalIsoTimestamp(value.createdAt) || !canonicalIsoTimestamp(value.updatedAt)) return false;
  if (!validIntakeConsent(value.consent) || !validIntakeValues(value.values)) return false;
  if (!Array.isArray(value.materialInput) || !value.materialInput.every(validIntakeMaterialInputEntry)) return false;
  if (value.designQuestions !== null && (!Array.isArray(value.designQuestions)
    || !value.designQuestions.every(validIntakeDesignQuestionEntry)
    || (value.designQuestions.length === 0 && !["ready-to-generate", "generated", "bound"].includes(value.transactionState)))) return false;
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

export function resolveIntakeCheckpointPaths({rootDir,repositoryCapability='local',spawn=defaultGitSpawn,create=false,forceScoped=false}={}) {
 const root=physicalRoot(rootDir),selected=resolveOnboardingIntakeScope(root,repositoryCapability,{create:false,spawn});
 const scoped=intakePathsForDirectory(root,selected.directory),legacy=intakePathsForDirectory(root,selected.legacyDirectory);
 const current=readIntakeCheckpointRaw(scoped.checkpoint);
 if(current.status==='present'){if(!validateIntakeCheckpoint(root,current.value))fail('INTAKE-CHECKPOINT-MALFORMED','selected intake is malformed');return scoped;}
 const prior=readIntakeCheckpointRaw(legacy.checkpoint);
 if(prior.status==='present'){
  if(!validateIntakeCheckpoint(prior.value?.root,prior.value))fail('INTAKE-CHECKPOINT-MALFORMED','legacy intake is unresolved');
  if(prior.value.root===root&&!forceScoped)return legacy;
 }
 if(create)resolveOnboardingIntakeScope(root,repositoryCapability,{create:true,spawn});return scoped;
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

/** Read-only first-enrollment boundary; missing history never creates a retirement generation. */
export function observeOnboardingEnrollmentHistory({rootDir,repositoryCapability="local",spawn=defaultGitSpawn}={}) {
  const root=physicalRoot(rootDir),paths=[];
  for(const path of [NEUTRAL_STATE,LEGACY_STATE,"pipeline.user.yaml",NEUTRAL_MANIFEST,".claude/pipeline.yaml",".claude/pipeline.json",".agent-pipeline/onboarding-consent.json",".agent-pipeline/enrollment-git-creation-barrier.json",".agent-pipeline/enrollment-git-creation.json",".claude/.runtime/agent-pipeline/onboarding"]){
    const full=absoluteProjectPath(root,path,"enrollment history");assertPhysicalChain(root,full);
    if(existsSync(full)){const info=lstatSync(full);if(info.isSymbolicLink()||(!info.isFile()&&!info.isDirectory()))fail("ER-HISTORY-UNSAFE","retained enrollment history is not physical");paths.push(path);}
  }
  // A common Git directory can retain other worktrees' intake. Only this
  // selected physical root's checkpoint/journal counts as its history.
  if(repositoryCapability==="local"&&existsSync(join(root,".git"))){
    const selected=resolveOnboardingIntakeScope(root,"local",{spawn,create:false});
    const intake=readOnboardingIntakeCheckpoint({rootDir:root,spawn});
    if(intake.status==="present")paths.push(intake.paths.checkpoint);
    for(const name of ["enrollment-retirement.json","enrollment-retirement-archives"]){const path=join(selected.directory,name);if(existsSync(path)){const info=lstatSync(path);if(info.isSymbolicLink()||(!info.isFile()&&!info.isDirectory()))fail("ER-HISTORY-UNSAFE","retained retirement history is not physical");paths.push(path);}}
    const scope=observeGovernanceScope({rootDir:root});
    if(["declined","unverifiable-active"].includes(scope.state))paths.push("selected-governance-"+scope.state);
  }
  return {root,retained:paths.length>0,paths};
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
  if(deps.retirementOwnerLock!==undefined&&(!RETIREMENT_INTAKE_LOCKS.has(deps.retirementOwnerLock)||deps.retirementOwnerLock.root!==physicalRoot(rootDir)))fail("ER-INTAKE-LOCK","invalid sealed owner lock");
  const initialPaths = resolveIntakeCheckpointPaths({ rootDir, repositoryCapability, spawn, create: false, forceScoped: deps.retirementOwnerLock!==undefined });
  const initial = readIntakeCheckpointRaw(initialPaths.checkpoint);
  if(deps.retirementOwnerLock===undefined){
    const pendingPath=join(resolveOnboardingIntakeScope(rootDir,repositoryCapability,{spawn}).directory,"enrollment-retirement.json");
    if(existsSync(pendingPath)){const pending=JSON.parse(readPhysicalFile(pendingPath,"enrollment retirement coordinator").toString("utf8"));
      if(pending.root!==physicalRoot(rootDir)||!validateRetirementJournal(pending))fail("ER-INTAKE-JOURNAL","invalid retirement coordinator");
      if(!["pending","active"].includes(pending.phase))fail("ER-INTAKE-RETIREMENT-BUSY","retirement must resume before fresh intake");
    }
  }
  const lockOptions = { nowMs: deps.nowMs ?? Date.now, lockStaleMs: deps.lockStaleMs ?? 30_000 };
  const token = `intake-checkpoint-${sha256(Buffer.from(initialPaths.checkpoint, "utf8")).slice(0, 32)}`;
  if (mutate(initial) === null) {
    // A crash after the atomic rename leaves valid checkpoint bytes plus its
    // writer lock.  An identical retry is otherwise a safe no-op, but leaving
    // that stale, deterministic lock behind turns the *next* real intake
    // change into KICKOFF-LOCKED.  Probe only when the lock path already
    // exists: acquireLock() reclaims only this schema/token after its normal
    // stale-age check.  A live, foreign, malformed, or otherwise unrecoverable
    // lock remains untouched and must not make an idempotent read path fail.
    if (deps.retirementOwnerLock===undefined && existsSync(initialPaths.lock)) {
      let recoveredLock = null;
      try {
        recoveredLock = acquireLock(initialPaths.lock, INTAKE_CHECKPOINT_LOCK_SCHEMA, token, lockOptions);
      } catch {
        // No-op replay preserves its established success semantics when this
        // is a live or non-recoverable lock.  acquireLock() has not removed it.
      } finally {
        if (recoveredLock !== null) releaseLock(recoveredLock);
      }
    }
    return { mutated: false, paths: initialPaths, value: initial.value };
  }

  const paths = resolveIntakeCheckpointPaths({ rootDir, repositoryCapability, spawn, create: true, forceScoped: deps.retirementOwnerLock!==undefined });
  const lock = deps.retirementOwnerLock?.lock ?? acquireLock(paths.lock, INTAKE_CHECKPOINT_LOCK_SCHEMA, token, lockOptions);
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
    if (deps.retirementOwnerLock===undefined && !simulatedCrash && !releaseLock(lock)) {
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
  const consentOutput = { schema: INTAKE_CONSENT_APPLY_SCHEMA, status: "applied", root: result.paths.root, mutated: result.mutated, checkpoint: result.value };
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
 * Step 3: writes the ONE bundled design-question round's answers, or the
 * PO's explicit no-open-questions disposition, into
 * designQuestions, flips transactionState to "ready-to-generate" (design
 * SSa.5 point 3). Requires at least one captured material-input chunk
 * (transactionState already "design-questions-pending") and existing
 * consent. Idempotent for an exact replay. A different answer set requires
 * the explicit replacement command and is accepted only while the checkpoint
 * is still "ready-to-generate". Once staging has been generated or bound,
 * this writer stays closed and the normal document amendment path owns
 * corrections.
 */
export function applyOnboardingIntakeDesignQuestions({
  rootDir, repositoryCapability = "local", answers, replace = false, activate = false, deps = {},
} = {}) {
  if (activate !== true) fail("INTAKE-DESIGN-QUESTIONS-ACTIVATION-REQUIRED", "intake design-questions apply requires explicit activation");
  const noneOpen = exactKeys(answers, new Set(["disposition"]))
    && answers.disposition === "no-open-questions";
  if (!noneOpen && (!Array.isArray(answers) || answers.length === 0)) {
    fail("INTAKE-DESIGN-QUESTIONS-EMPTY", "intake design-questions apply requires answered questions or an explicit no-open-questions disposition");
  }
  const nowIso = deps.now ? deps.now() : new Date().toISOString();
  const candidateEntries = (noneOpen ? [] : answers).map((entry) => ({
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
        if (base.transactionState === "ready-to-generate" && replace === true) {
          const { contentSha256: dropSha, ...baseUnsigned } = base;
          void dropSha;
          return {
            ...baseUnsigned,
            revision: base.revision + 1,
            updatedAt: nowIso,
            designQuestions: candidateEntries,
          };
        }
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

// NVA-GF-GREENFIELD-INTAKEPROJ-1: the checkpoint/evidence store above is the
// lossless private source. Git-tracked design artifacts receive a derived
// projection instead. Keep this deliberately path-shaped and narrow: it is
// not a credential scanner, capture gate, quarantine state, or reason to
// discard the rest of a material-input chunk.
const INTAKE_TRACKED_LOCAL_PATH_MARKER = "[REDACTED LOCAL PATH]";
const INTAKE_TRACKED_LOCAL_PATH_PATTERNS = [
  // WSL and ordinary UNC host/share paths.
  /\\\\(?:wsl(?:\.localhost|\$)?|[A-Za-z0-9._-]+)\\[^\s"'<>|]+/giu,
  // Windows drive-rooted paths, accepting either native or POSIX separators.
  /\b[A-Za-z]:[\\/][^\s"'<>|]+/gu,
  // POSIX home roots (including WSL-mounted Windows homes) and shell home.
  /(?:~|\/(?:home|Users)\/[A-Za-z0-9._~-]+|\/root|\/mnt\/[A-Za-z])\/[^\s"'<>|]+/gu,
  // Other local POSIX system roots.  Limit this to host-specific roots so
  // ordinary absolute-looking prose such as an HTTP route (`/v1/items`) is
  // not projected as a private host path.
  /(?<![A-Za-z0-9._:/\\-])\/(?:private\/)?(?:var|tmp)\/[^\s"'<>|]+/gu,
];
const INTAKE_TRACKED_PATH_TRAILING_PUNCTUATION = /[),.;:!?\]}]+$/u;

function trackedIntakeProjectionText(text) {
  return INTAKE_TRACKED_LOCAL_PATH_PATTERNS.reduce((projected, pattern) => (
    projected.replace(pattern, (matched) => {
      const trailing = matched.match(INTAKE_TRACKED_PATH_TRAILING_PUNCTUATION)?.[0] ?? "";
      return INTAKE_TRACKED_LOCAL_PATH_MARKER + trailing;
    })
  ), text);
}

function projectIntakeMaterialInputChunks(chunks) {
  return chunks.map((chunk) => {
    const text = trackedIntakeProjectionText(chunk.text);
    return text === chunk.text ? chunk : { ...chunk, text, trackedProjection: "local-path-redacted" };
  });
}

function renderIntakeMaterialInputSection(chunks) {
  if (chunks.length === 0) return "(no material input captured)\n";
  return chunks.map((chunk, index) => [
    ...(chunk.trackedProjection === "local-path-redacted" ? [
      "> Tracked projection: local/private host paths were replaced with "
        + INTAKE_TRACKED_LOCAL_PATH_MARKER + "; private intake evidence remains unchanged.",
      "",
    ] : []),
    `<a id="intake-chunk-${index + 1}"></a>`,
    `### Chunk ${index + 1} -- sha256:${chunk.sha256}, ${chunk.byteLength} bytes, received ${chunk.receivedAt}`,
    "",
    chunk.text.endsWith("\n") ? chunk.text : `${chunk.text}\n`,
  ].join("\n")).join("\n");
}

function renderIntakeDesignQuestionsSection(designQuestions) {
  if (designQuestions === null) return "(design questions not yet answered)\n";
  if (designQuestions.length === 0) return "No open design questions were affirmed at intake.\n";
  return designQuestions.map((entry, index) => [
    `<a id="intake-question-${index + 1}"></a>`,
    `### Q${index + 1}: ${entry.question}`,
    "",
    `A: ${entry.answer}`,
  ].join("\n")).join("\n\n");
}

// The generated-artifact banner and section headers below reference only the STABLE intake-data
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
    "     hand-edit -- canonical authority binding is recorded separately by",
    "     bootstrap-bind-apply after this generated draft is reviewed.",
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
    "## Design questions and answers",
    "",
    renderIntakeDesignQuestionsSection(checkpoint.designQuestions),
    "",
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
// NOT written here. The policy-selected acknowledgement writer (attended chat
// or detached signature) adds it; ordinary staging authoring is explicitly
// forbidden from adding it by guard-lifecycle-ready.mjs.
// Store captured material and answers once; derived drafts bind the whole source
// and every stable section. No synthesis, truncation or authority acknowledgement.
function renderIntakeSourceReferences(checkpoint, chunks, designInputSha256) {
  const questions = checkpoint.designQuestions ?? [];
  if (chunks.length > 256 || questions.length > 256) {
    fail("INTAKE-GENERATE-REFERENCE-BOUND", "intake source index exceeds its bounded section count; original evidence is retained");
  }
  return [
    "## Captured source and answer coverage",
    "",
    `Read [design-input.md](design-input.md), sha256:${designInputSha256}, before reviewing this draft. It contains every captured source chunk and design answer in capture order.`,
    "The private evidence retains original bytes; the tracked source uses the existing local-path projection.",
    "",
    ...chunks.map((chunk, index) => `- [Chunk ${index + 1}](design-input.md#intake-chunk-${index + 1}): original sha256:${chunk.sha256}; ${chunk.byteLength} original bytes; tracked section sha256:${sha256(Buffer.from(chunk.text, "utf8"))}.`),
    ...(chunks.length === 0 ? ["- No material input captured."] : []),
    ...questions.map((entry, index) => `- [Question/answer ${index + 1}](design-input.md#intake-question-${index + 1}): sha256:${canonicalSha256({ question: entry.question, answer: entry.answer })}.`),
    ...(checkpoint.designQuestions === null ? ["- Design questions not yet answered."] : questions.length === 0 ? ["- No open design questions were affirmed at intake."] : []),
    "",
  ].join("\n");
}

function buildIntakePrdContent(checkpoint, featureId, chunks, specSha256, designInputSha256) {
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
    renderIntakeSourceReferences(checkpoint, chunks, designInputSha256),
    "",
    "## Notes",
    "",
    "This is a deterministic staging draft: product framing (What/Why/Scope/",
    "Non-goals/Risks/Alternatives/DoD) has not been synthesized. Binding",
    "(bootstrap-bind-apply, step 5) does not require this framing to exist",
    "yet -- it must be authored and reviewed before the plan is submitted for",
    "PO approval (pipeline-state submit-plan).",
    "",
    renderArchitectureDesignSkeleton().trimEnd(),
    "",
  ].join("\n");
}

function buildIntakeSpecContent(checkpoint, featureId, chunks, designInputSha256) {
  return [
    intakeStagingGeneratedBanner(checkpoint),
    "",
    `# Spec -- ${featureId} (staging draft)`,
    "",
    `- Intake data: sha256:${intakeDataSha256(checkpoint)}`,
    "",
    renderIntakeSourceReferences(checkpoint, chunks, designInputSha256),
    "",
    "## Notes",
    "",
    "This is a deterministic staging draft: acceptance criteria (EARS),",
    "detailed implementation, and alternatives have not been synthesized.",
    "Binding (bootstrap-bind-apply, step 5) does not require this to exist",
    "yet -- it must be authored and reviewed before the plan is submitted for",
    "PO approval (pipeline-state submit-plan).",
    "",
    renderDesignTraceabilitySkeleton().trimEnd(),
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
function intakeGenerateApplyAction(root, planSha256, runner) {
  return {
    kind: "command",
    executable: "node",
    argv: [DEFAULT_ONBOARDING_SCRIPT, "intake-generate-apply", "--root", root, "--plan-sha256", planSha256, "--activate", ...(runner === undefined ? [] : ["--runner", runner])],
    mutation: true,
    requiresConfirmation: true,
  };
}

function buildOnboardingIntakeGeneratePlan({
  rootDir, runner, repositoryCapability = "local", spawn = defaultGitSpawn,
} = {}) {
  const observed = readOnboardingIntakeCheckpoint({ rootDir, repositoryCapability, spawn });
  if (observed.status !== "present") {
    fail("INTAKE-GENERATE-PRECONDITION", "intake staging generation requires an existing checkpoint");
  }
  const checkpoint = observed.value;
  if (!INTAKE_GENERATE_READY_STATES.has(checkpoint.transactionState)) {
    fail("INTAKE-GENERATE-PRECONDITION", "intake staging generation requires transactionState ready-to-generate or generated");
  }
  // One projection, shared by design-input.md, PRD and spec. The private
  // source chunks remain untouched and are still returned verbatim by
  // readOnboardingIntakeMaterialInput() across a restart.
  const chunks = projectIntakeMaterialInputChunks(readIntakeMaterialInputChunks(observed.paths, checkpoint));
  const featureId = deriveIntakeFeatureId(checkpoint);
  const designInputContent = buildIntakeDesignInputContent(checkpoint, chunks);
  const designInputSha256 = sha256(Buffer.from(designInputContent, "utf8"));
  // NVA-BL-INTAKEBIND-1: spec content (and its sha256) must be computed BEFORE
  // the PRD, because the PRD's own technical-spec-sha256 marker (AC-1) must
  // bind to the real generated spec's bytes -- the same sha256 the spec
  // target below carries, never re-derived independently.
  const specContent = buildIntakeSpecContent(checkpoint, featureId, chunks, designInputSha256);
  const specSha256 = sha256(Buffer.from(specContent, "utf8"));
  const prdContent = buildIntakePrdContent(checkpoint, featureId, chunks, specSha256, designInputSha256);
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
  return { ...binding, planSha256, nextAction: intakeGenerateApplyAction(binding.root, planSha256, runner) };
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
  let plan = buildOnboardingIntakeGeneratePlan({ rootDir, repositoryCapability, spawn });
  if (!SHA256_RE.test(expectedPlanSha256 ?? "") || plan.planSha256 !== expectedPlanSha256) {
    fail("INTAKE-GENERATE-PLAN-DIGEST", "intake staging generation plan digest does not match");
  }
  // Normalize the exact target paths before the authoritative plan is
  // re-derived and its generated-document hashes are consumed by the writer.
  // This is deliberately local to an activated apply; read-only planning and
  // inspection never changes repository configuration.
  const lineEndingRequest = {
    projectDir: plan.root,
    filePaths: Object.values(plan.targets).map((target) => target.path),
  };
  // Tests with an injected Git/process dependency may provide the matching
  // preparer seam. The CLI has no flag or environment route to this seam; its
  // default path always plans and applies the real repo-local Git setting.
  // A host-managed root has no writable repository configuration to prepare:
  // the host owns Git and the root's `.git` is an empty read-only directory by
  // design, so the probe would fail closed on a repository that does not
  // exist. The preparation runs only for a local repository capability.
  const lineEndingApplied = plan.repositoryCapability !== "local"
    ? { ok: true, skipped: true }
    : typeof deps.prepareBoundDesignLineEndings === "function"
      ? deps.prepareBoundDesignLineEndings(lineEndingRequest)
      : (() => {
        const lineEndingPlan = planBoundDesignLineEndings(lineEndingRequest);
        if (!lineEndingPlan.ok) return lineEndingPlan;
        return applyBoundDesignLineEndings(lineEndingPlan);
      })();
  if (!lineEndingApplied.ok) fail("INTAKE-GENERATE-LINE-ENDINGS-REFUSED",
    `design document line-ending preparation failed: ${lineEndingApplied.code}`);
  plan = buildOnboardingIntakeGeneratePlan({ rootDir, repositoryCapability, spawn });
  if (plan.planSha256 !== expectedPlanSha256) {
    fail("INTAKE-GENERATE-PLAN-DRIFT", "intake staging plan changed after repository line-ending preparation");
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
function specMarkerFile(root, relativePath) {
  const path = absoluteProjectPath(root, relativePath, "staging marker document");
  assertPhysicalChain(root, path, { leafMayBeAbsent: false });
  const identity = (info) => ({ dev: String(info.dev), ino: String(info.ino), mode: info.mode,
    nlink: info.nlink, size: info.size, mtimeMs: info.mtimeMs, ctimeMs: info.ctimeMs });
  const before = lstatSync(path);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1
    || before.size > 16 * 1024 * 1024) fail("INTAKE-SPEC-MARKER-FILE", "staging document is not a bounded single-link regular file");
  let fd;
  try {
    fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const opened = fstatSync(fd);
    if (!opened.isFile() || canonicalJson(identity(opened)) !== canonicalJson(identity(before))) {
      fail("INTAKE-SPEC-MARKER-IDENTITY", "staging document changed before read");
    }
    const buffer = Buffer.alloc(before.size + 1);
    let used = 0;
    while (used < buffer.length) {
      const count = readSync(fd, buffer, used, buffer.length - used, used);
      if (count === 0) break;
      used += count;
    }
    const bytes = buffer.subarray(0, used);
    assertPhysicalChain(root, path, { leafMayBeAbsent: false });
    if (bytes.length !== before.size || canonicalJson(identity(fstatSync(fd))) !== canonicalJson(identity(before))
      || canonicalJson(identity(lstatSync(path))) !== canonicalJson(identity(before))) {
      fail("INTAKE-SPEC-MARKER-IDENTITY", "staging document changed during read");
    }
    let text;
    try { text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes); }
    catch { fail("INTAKE-SPEC-MARKER-ENCODING", "staging document is not valid UTF-8"); }
    return {path: relativePath, sha256: sha256(bytes), identity: identity(before), bytes, text};
  } finally { if (fd !== undefined) closeSync(fd); }
}

function specMarkerObservation(options) {
  const detailed = observeDetailed(options);
  if (detailed.continuity.status !== "absent-pristine") {
    fail("INTAKE-SPEC-MARKER-AUTHORITY", "mechanical staging repair requires absent-pristine continuity");
  }
  const resolved = resolveBootstrapBindInputs(options);
  const checkpoint = readOnboardingIntakeCheckpoint(options);
  const selected = authorityPaths(resolved.root);
  const calibration = specMarkerFile(resolved.root, selected.calibration);
  const prd = specMarkerFile(resolved.root, resolved.prdPath);
  const spec = specMarkerFile(resolved.root, resolved.specPath);
  if ([...prd.text.matchAll(PRD_ACKNOWLEDGEMENT_MARKER)].length !== 0) {
    fail("INTAKE-SPEC-MARKER-ACKNOWLEDGED", "mechanical repair cannot alter an acknowledged staging PRD");
  }
  const matches = [...prd.text.matchAll(TECHNICAL_SPEC_MARKER)];
  const declarations = [...prd.text.matchAll(/<!--\s*technical-spec-sha256\s*:/gu)];
  if (matches.length !== 1 || declarations.length !== 1) {
    fail("INTAKE-SPEC-MARKER-GRAMMAR", "staging PRD requires exactly one valid technical Spec marker");
  }
  const match = matches[0], offset = match.index + match[0].indexOf(match[1]);
  const next = Buffer.from(prd.text.slice(0, offset) + spec.sha256 + prd.text.slice(offset + 64), "utf8");
  const publicFile = file => ({path: file.path, sha256: file.sha256, identity: file.identity});
  const binding = {schema: "pipeline.onboarding-intake-spec-marker-plan.v1", root: resolved.root,
    repositoryCapability: options.repositoryCapability ?? "local", featureId: resolved.featureId,
    checkpoint: {revision: checkpoint.value.revision, sha256: checkpoint.sha256},
    continuity: detailed.continuity, calibration: publicFile(calibration),
    prd: {...publicFile(prd), postSha256: sha256(next)}, spec: publicFile(spec)};
  return {binding, planSha256: canonicalSha256(binding), next, checkpointPaths: checkpoint.paths};
}

export function planOnboardingIntakeSpecMarker(options = {}) {
  const observed = specMarkerObservation(options);
  const repair = observed.binding.prd.sha256 !== observed.binding.prd.postSha256;
  const argv = [DEFAULT_ONBOARDING_SCRIPT, "intake-spec-marker-apply", "--root", observed.binding.root,
    "--plan-sha256", observed.planSha256, "--activate"];
  if (options.runner !== undefined) {
    if (!["codex", "claude", "antigravity"].includes(options.runner)) fail("INTAKE-SPEC-MARKER-RUNNER", "marker action runner is invalid");
    argv.push("--runner", options.runner);
  }
  if (options.intent !== undefined && options.intent !== "onboarding") {
    if (!["bootstrap", "session", "dispatch"].includes(options.intent)) fail("INTAKE-SPEC-MARKER-INTENT", "marker action intent is invalid");
    argv.push("--intent", options.intent);
  }
  return {...observed.binding, planSha256: observed.planSha256,
    status: repair ? "repair-required" : "already-current",
    nextAction: repair ? {kind: "command", executable: process.execPath, argv, mutation: true,
      requiresConfirmation: false, executionBoundary: "local-process", invocation: "agent-tool-call",
      expected: {schema: "pipeline.onboarding-intake-spec-marker-apply.v1", statuses: ["applied", "already-current"]}} : null};
}

export function applyOnboardingIntakeSpecMarker({rootDir, expectedPlanSha256, activate = false,
  repositoryCapability = "local", spawn = defaultGitSpawn, deps = {}} = {}) {
  if (activate !== true) fail("INTAKE-SPEC-MARKER-ACTIVATION", "mechanical repair requires explicit activation");
  if (!SHA256_RE.test(expectedPlanSha256 ?? "")) fail("INTAKE-SPEC-MARKER-PLAN", "mechanical repair requires a valid plan digest");
  const options = {rootDir, repositoryCapability, spawn};
  const initial = specMarkerObservation(options);
  if (initial.planSha256 !== expectedPlanSha256) fail("INTAKE-SPEC-MARKER-PLAN-DRIFT", "the marker repair plan is stale");
  const root = initial.binding.root, selected = authorityPaths(root);
  const state = absoluteProjectPath(root, selected.state, "Pipeline State");
  assertPhysicalChain(root, state);
  const lockOptions = {nowMs: deps.nowMs ?? Date.now, lockStaleMs: deps.lockStaleMs ?? 30000};
  const token = "intake-spec-marker-" + expectedPlanSha256.slice(0,32);
  const locks = [];
  let temporaryRecord, committed = false;
  try {
    locks.push(acquireLock(state + ".lock", "pipeline.continuity-lock.v0", token, lockOptions));
    locks.push(acquireLock(join(initial.checkpointPaths.directory, ".kickoff-writer.lock"),
      "pipeline.codex-onboarding-kickoff-lock.v1", token, lockOptions));
    locks.push(acquireLock(initial.checkpointPaths.lock, INTAKE_CHECKPOINT_LOCK_SCHEMA, token, lockOptions));
    const current = specMarkerObservation(options);
    if (current.planSha256 !== expectedPlanSha256) fail("INTAKE-SPEC-MARKER-PLAN-DRIFT", "the marker repair plan changed under writer locks");
    if (current.binding.prd.sha256 !== current.binding.prd.postSha256) {
      const target = absoluteProjectPath(root, current.binding.prd.path, "staging PRD");
      const temporary = join(dirname(target), "." + basename(target) + ".spec-marker-" + randomUUID() + ".tmp");
      temporaryRecord = writeExclusiveSynced(temporary, current.next, current.binding.prd.identity.mode & 0o777);
      (deps.fault ?? (() => {}))("before-publish");
      if (specMarkerObservation(options).planSha256 !== expectedPlanSha256) {
        fail("INTAKE-SPEC-MARKER-PLAN-DRIFT", "the marker repair preimage changed before publication");
      }
      renameSync(temporary, target); temporaryRecord = null; committed = true;
      fsyncDirectory(dirname(target));
    }
    (deps.fault ?? (() => {}))("before-readback");
    const after = specMarkerObservation(options);
    const expected = {...current.binding, prd: after.binding.prd};
    if (after.binding.prd.sha256 !== current.binding.prd.postSha256
      || after.binding.prd.postSha256 !== current.binding.prd.postSha256
      || canonicalJson(after.binding) !== canonicalJson(expected)) {
      fail("INTAKE-SPEC-MARKER-READBACK", "marker repair readback changed", {committed});
    }
    return {schema: "pipeline.onboarding-intake-spec-marker-apply.v1",
      status: committed ? "applied" : "already-current", mutated: committed,
      root, featureId: current.binding.featureId, planSha256: expectedPlanSha256,
      prd: {path: after.binding.prd.path, sha256: after.binding.prd.sha256},
      spec: {path: after.binding.spec.path, sha256: after.binding.spec.sha256}};
  } catch (error) {
    if (committed) error.committed = true;
    throw error;
  } finally {
    if (temporaryRecord) { try { unlinkOwned(temporaryRecord); } catch {} }
    for (const lock of locks.reverse()) releaseLock(lock);
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
  return {
    acknowledged,
    // Kept as an explicit false for old callers that read the field.  A
    // generated draft is no longer exempt: the acknowledgement binds the
    // exact design artefacts that may enter implementation.
    exempt: false,
    prd: { path: resolved.prdPath, sha256: prd.sha256 },
    spec: { path: resolved.specPath, sha256: spec.sha256 },
  };
}

function bootstrapAcknowledgementPlan({ rootDir, repositoryCapability = "local", spawn = defaultGitSpawn } = {}) {
  let resolved;
  try {
    resolved = resolveBootstrapBindInputs({ rootDir, repositoryCapability, spawn });
  } catch (error) {
    if (error?.code === "BOOTSTRAP-BIND-PRECONDITION") {
      fail("BOOTSTRAP-ACK-PRECONDITION", "signature acknowledgement requires an existing generated intake checkpoint");
    }
    throw error;
  }
  const checkpoint = readOnboardingIntakeCheckpoint({ rootDir: resolved.root, repositoryCapability, spawn });
  if (checkpoint.status !== "present" || checkpoint.value.transactionState !== "generated") {
    fail("BOOTSTRAP-ACK-PRECONDITION", "signature acknowledgement requires a generated intake checkpoint");
  }
  const prd = observeOptionalProjectFile(resolved.root, resolved.prdPath, "staging PRD");
  const spec = observeOptionalProjectFile(resolved.root, resolved.specPath, "staging specification");
  if (prd.status !== "present" || spec.status !== "present") {
    fail("BOOTSTRAP-ACK-PRECONDITION", "signature acknowledgement requires the generated staging PRD and specification");
  }
  const prdText = decodeBootstrapAcknowledgementPrd(prd.raw);
  if (prdText === null) fail("BOOTSTRAP-ACK-PRD-ENCODING", "the staging PRD is not valid UTF-8");
  const specText = decodeBootstrapAcknowledgementPrd(spec.raw);
  if (specText === null) fail("BOOTSTRAP-ACK-SPEC-ENCODING", "the staging specification is not valid UTF-8");
  const unfinished = (text) => text.includes("<!-- DRAFT TEMPLATE: replace every REPLACE value and all example paths.")
    || /^\s*[-|].*REPLACE: (?:input reference|requirement|test path and case)/mu.test(text)
    || /"(?:responsibility|rationale|profileId)"\s*:\s*"REPLACE: /u.test(text)
    || /^- AC-01: WHEN <trigger>, the system SHALL <observable result>\.$/mu.test(text);
  if (unfinished(prdText) || unfinished(specText)) {
    fail("BOOTSTRAP-ACK-PLACEHOLDER-CONTENT", "complete the generated PRD and specification before acknowledgement");
  }
  const markers = [...prdText.matchAll(PRD_ACKNOWLEDGEMENT_MARKER)];
  if (markers.length !== 0) fail("BOOTSTRAP-ACK-ALREADY-ACKNOWLEDGED", "the staging PRD already carries an acknowledgement marker");
  const action = {
    kind: "bootstrap-plan-acknowledgement",
    decision: "content-sound-and-spec-consistent",
    root: resolved.root,
    featureId: resolved.featureId,
    checkpoint: { revision: checkpoint.value.revision, sha256: checkpoint.sha256 },
    prd: { path: resolved.prdPath, sha256: prd.sha256 },
    spec: { path: resolved.specPath, sha256: spec.sha256 },
  };
  const intentSha256 = canonicalSha256(action);
  const requestPath = `scratch/bootstrap-plan-acknowledgement-request-${intentSha256}.json`;
  const proofPath = `scratch/bootstrap-plan-acknowledgement-proof-${intentSha256}.json`;
  const receiptPath = `scratch/bootstrap-plan-acknowledgement-receipt-${intentSha256}.json`;
  const request = { schema: BOOTSTRAP_ACKNOWLEDGEMENT_REQUEST_SCHEMA, intentSha256, action };
  return { root: resolved.root, action, intentSha256, requestPath, proofPath, receiptPath, request };
}

function decodeBootstrapAcknowledgementPrd(bytes) {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { return null; }
}

function appendBootstrapAcknowledgementMarker(bytes) {
  const current = decodeBootstrapAcknowledgementPrd(bytes);
  if (current === null || [...current.matchAll(PRD_ACKNOWLEDGEMENT_MARKER)].length !== 0) return null;
  // The signed preimage is the exact staging PRD, including every terminal
  // newline. Preserve it verbatim so receipt readback can reconstruct its
  // digest after binding; normalizing `\n+` here made valid acknowledgements
  // with two or more final newlines permanently unrecoverable.
  return Buffer.from(`${current}\n\n${PO_GATE_PRD_ACKNOWLEDGEMENT_MARKER}\n`, "utf8");
}

function safeBootstrapAcknowledgementScratch(root, relativePath) {
  const target = absoluteProjectPath(root, relativePath, "signature acknowledgement request");
  const parent = dirname(target);
  ensurePhysicalParent(root, target);
  assertPhysicalChain(root, parent, { leafMayBeAbsent: false });
  return target;
}

function readExactBootstrapAcknowledgementRequest(root, plan) {
  const observed = readBootstrapAcknowledgementRequestByIntent(root, plan.intentSha256);
  if (observed.status !== "present") return observed;
  return canonicalJson(observed.value) === canonicalJson(plan.request)
    ? observed
    : { status: "invalid", path: observed.path };
}

function readBootstrapAcknowledgementRequestByIntent(root, intentSha256) {
  const requestPath = `scratch/bootstrap-plan-acknowledgement-request-${intentSha256}.json`;
  const path = absoluteProjectPath(root, requestPath, "signature acknowledgement request");
  if (!existsSync(path)) return { status: "absent", path };
  assertPhysicalChain(root, path, { leafMayBeAbsent: false });
  const raw = readPhysicalFile(path, "signature acknowledgement request");
  let value;
  try { value = JSON.parse(raw.toString("utf8")); } catch { return { status: "invalid", path }; }
  if (value?.schema !== BOOTSTRAP_ACKNOWLEDGEMENT_REQUEST_SCHEMA || value?.intentSha256 !== intentSha256
    || value?.action === null || typeof value?.action !== "object" || Array.isArray(value.action)
    || canonicalSha256(value.action) !== intentSha256) return { status: "invalid", path };
  return { status: "present", path, value };
}

function onlyBootstrapAcknowledgementPrdDrift(expectedAction, currentAction) {
  if (expectedAction?.prd?.sha256 === currentAction?.prd?.sha256) return false;
  const withoutPrdSha = (action) => ({ ...action, prd: { ...action.prd, sha256: "<PRD_SHA256>" } });
  return canonicalJson(withoutPrdSha(expectedAction)) === canonicalJson(withoutPrdSha(currentAction));
}

function writeBootstrapAcknowledgementRequest(root, plan) {
  const target = safeBootstrapAcknowledgementScratch(root, plan.requestPath);
  const bytes = Buffer.from(`${JSON.stringify(plan.request, null, 2)}\n`, "utf8");
  if (existsSync(target)) {
    const existing = readExactBootstrapAcknowledgementRequest(root, plan);
    if (existing.status !== "present") fail("BOOTSTRAP-ACK-REQUEST-DRIFT", "an existing signature acknowledgement request differs from the current plan");
    return { path: target, written: false };
  }
  try {
    writeExclusiveSynced(target, bytes, 0o600);
    fsyncDirectory(dirname(target));
    return { path: target, written: true };
  } catch {
    fail("BOOTSTRAP-ACK-REQUEST-WRITE", "the signature acknowledgement request could not be written safely");
  }
}

function bootstrapAcknowledgementReceipt(plan, verified, attendedChat) {
  return {
    schema: BOOTSTRAP_ACKNOWLEDGEMENT_RECEIPT_SCHEMA,
    intentSha256: plan.intentSha256,
    action: plan.action,
    acknowledgementMode: attendedChat ? "chat" : "signature",
    proofSha256: attendedChat ? null : verified?.proofSha256 ?? null,
    signer: attendedChat ? null : verified?.signer ?? null,
  };
}

function readExactBootstrapAcknowledgementReceipt(root, plan, receipt) {
  const path = safeBootstrapAcknowledgementScratch(root, plan.receiptPath);
  if (!existsSync(path)) return { status: "absent", path };
  let value;
  try { value = JSON.parse(readPhysicalFile(path, "bootstrap acknowledgement receipt").toString("utf8")); } catch { return { status: "invalid", path }; }
  if (canonicalJson(value) !== canonicalJson(receipt)) return { status: "invalid", path };
  return { status: "present", path, value };
}

function writeBootstrapAcknowledgementReceipt(root, plan, receipt) {
  const target = safeBootstrapAcknowledgementScratch(root, plan.receiptPath);
  if (existsSync(target)) {
    const existing = readExactBootstrapAcknowledgementReceipt(root, plan, receipt);
    if (existing.status !== "present") fail("BOOTSTRAP-ACK-RECEIPT-DRIFT", "an existing acknowledgement receipt differs from the signed plan");
    return { path: target, written: false };
  }
  try {
    writeExclusiveSynced(target, Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, "utf8"), 0o600);
    fsyncDirectory(dirname(target));
    return { path: target, written: true };
  } catch {
    fail("BOOTSTRAP-ACK-RECEIPT-WRITE", "the acknowledgement receipt could not be written safely");
  }
}

function configuredPoKeyDirectory(root, deps = {}) {
  // Match po-human-approval.mjs's resolution order. `setup --directory`
  // intentionally persists its pointer in this repository's Git-common-dir,
  // not in the machine plane, so consulting only the latter would deadlock the
  // ordinary successful setup path.
  const repoScope = resolveRepoScopedDirectory(root, deps);
  if (repoScope.status === "invalid") return { status: "invalid-repo-scope", directory: null };
  if (repoScope.status === "valid" && typeof repoScope.directory === "string" && repoScope.directory.length > 0) {
    return { status: "present", directory: repoScope.directory, source: "repo-scope" };
  }
  const plane = (deps.readMachinePlane ?? readMachinePlane)();
  if (plane.status === "invalid") return { status: "invalid-machine-plane", directory: null };
  const machineDirectory = plane.status === "valid" ? plane.plane?.poKeyDirectory : null;
  if (typeof machineDirectory === "string" && machineDirectory.length > 0) {
    return { status: "present", directory: machineDirectory, source: "machine-plane" };
  }
  const environmentDirectory = deps.poApprovalDirectory ?? process.env.PIPELINE_PO_APPROVAL_DIRECTORY;
  if (typeof environmentDirectory === "string" && environmentDirectory.length > 0) {
    return { status: "present", directory: environmentDirectory, source: "environment" };
  }
  return { status: "absent", directory: null };
}

// An external key directory may offer a signing action only when its public
// identity is already declared by this project's trust policy. This avoids
// sending a PO through a signature ceremony which apply would deterministically
// reject. Apply remains the fail-closed authority boundary if the directory
// changes after this availability read.
function observeConfiguredPoTrustAnchor(directory, deps = {}) {
  if (typeof deps.readConfiguredPoTrustAnchor === "function") return deps.readConfiguredPoTrustAnchor(directory);
  const path = join(directory, "trust-policy.json");
  let before; let raw; let after;
  try {
    before = lstatSync(path);
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > 65_536) return { status: "unsafe" };
    raw = readFileSync(path, "utf8");
    after = lstatSync(path);
    if (!after.isFile() || after.isSymbolicLink() || after.nlink !== 1 || after.dev !== before.dev || after.ino !== before.ino) return { status: "unsafe" };
  } catch { return { status: "unavailable" }; }
  let value;
  try { value = JSON.parse(raw); } catch { return { status: "invalid" }; }
  if (typeof value?.keyReference !== "string" || value.keyReference.length === 0
    || typeof value?.publicKeySha256 !== "string" || !SHA256_RE.test(value.publicKeySha256)) {
    return { status: "invalid" };
  }
  return { status: "present", anchor: { keyReference: value.keyReference, publicKeySha256: value.publicKeySha256 } };
}

function projectTrustAnchors(policy) {
  return Array.isArray(policy?.trustAnchors)
    ? policy.trustAnchors
    : (policy?.trustAnchor === null || policy?.trustAnchor === undefined ? [] : [policy.trustAnchor]);
}

function configuredSignerMatchesProjectTrust(directory, policy, deps = {}) {
  const observed = observeConfiguredPoTrustAnchor(directory, deps);
  if (observed?.status !== "present" || observed.anchor === null || typeof observed.anchor !== "object") {
    return { status: "unavailable" };
  }
  const anchors = projectTrustAnchors(policy);
  // An empty v3 trust-anchor list deliberately means that the project accepts
  // any otherwise well-formed Ed25519 proof. The planner must mirror the
  // verifier's contract: the configured signer still has to expose a safe,
  // readable identity, but it need not match a deliberately unrestricted set.
  if (anchors.length === 0) return { status: "matched" };
  const matches = anchors.some((anchor) => anchor?.keyReference === observed.anchor.keyReference
    && anchor?.publicKeySha256 === observed.anchor.publicKeySha256);
  return matches ? { status: "matched" } : { status: "mismatch" };
}

function observeBootstrapAcknowledgementProofVerification(plan, deps = {}) {
  const proof = observeOptionalProjectFile(plan.root, plan.proofPath, "signature acknowledgement proof");
  if (proof.status !== "present") return { proof, status: proof.status };
  let value;
  try { value = JSON.parse(proof.raw.toString("utf8")); } catch { return { proof, status: "invalid" }; }
  const policy = (deps.readCriticalHumanProofPolicy ?? readCriticalHumanProofPolicy)(plan.root);
  if (!policy.ok) return { proof, status: "invalid" };
  try {
    const verified = (deps.verifyAgainstTrustAnchors ?? verifyAgainstTrustAnchors)({
      intent: { sha256: plan.intentSha256 }, anchors: projectTrustAnchors(policy), proof: value,
    });
    return { proof, status: verified.verified ? "verified" : "invalid" };
  } catch {
    return { proof, status: "invalid" };
  }
}

function bootstrapAcknowledgementSignAction(plan) {
  return {
    kind: "external-operator",
    executionBoundary: "attended-external-tool",
    invocation: "user-copy-only",
    mutation: true,
    requiresConfirmation: true,
    executable: process.execPath,
    argv: [join(dirname(DEFAULT_ONBOARDING_SCRIPT), "po-human-approval.mjs"), "sign-intent", "--repo-root", plan.root, "--request", plan.requestPath],
    expected: { schema: "pipeline.po-approval-proof.v1", intentSha256: plan.intentSha256 },
  };
}

function bootstrapAcknowledgementChatAction(plan) {
  return {
    // `human_approval: chat` is explicitly the non-attested policy.  The PO's
    // chat response is the one human decision; asking them to retype a derived
    // token in a terminal both duplicates that decision and makes Codex, Claude
    // and Antigravity behave differently.  The returned action is deliberately
    // still digest-bound to the reviewed staging bytes, but is run by the agent
    // after it receives that response.
    kind: "command",
    executionBoundary: "local-process",
    invocation: "agent-tool-call",
    mutation: true,
    requiresConfirmation: false,
    executable: process.execPath,
    argv: [DEFAULT_ONBOARDING_SCRIPT, "bootstrap-acknowledge-chat-apply", "--root", plan.root,
      "--plan-sha256", plan.intentSha256, "--activate"],
    expected: { schema: BOOTSTRAP_ACKNOWLEDGEMENT_APPLY_SCHEMA, statuses: ["applied"] },
  };
}

// Chat-mode acknowledgement has the same PRD/spec and digest binding as the
// signature route.  Its boundary is the PO's explicit in-chat answer, as
// selected by `gates.human_approval: chat`; it never creates a second terminal
// ceremony.
export function planOnboardingBootstrapAcknowledgementChat({
  rootDir, repositoryCapability = "local", spawn = defaultGitSpawn,
} = {}) {
  const plan = bootstrapAcknowledgementPlan({ rootDir, repositoryCapability, spawn });
  return {
    schema: "pipeline.bootstrap-plan-acknowledgement-chat-plan.v1",
    status: "confirmation-required",
    root: plan.root,
    intentSha256: plan.intentSha256,
    prd: plan.action.prd,
    spec: plan.action.spec,
    nextAction: bootstrapAcknowledgementChatAction(plan),
  };
}

export function planOnboardingBootstrapAcknowledgement({
  rootDir, runner = "codex", repositoryCapability = "local", spawn = defaultGitSpawn, deps = {},
} = {}) {
  const plan = bootstrapAcknowledgementPlan({ rootDir, repositoryCapability, spawn });
  const configuredDirectory = configuredPoKeyDirectory(plan.root, deps);
  if (configuredDirectory.status !== "present") fail("BOOTSTRAP-ACK-TRUST-ANCHOR-UNAVAILABLE", "signature acknowledgement requires a valid configured PO signing-key directory");
  const directory = configuredDirectory.directory;
  const policy = (deps.readCriticalHumanProofPolicy ?? readCriticalHumanProofPolicy)(plan.root);
  if (!policy.ok) fail("BOOTSTRAP-ACK-TRUST-POLICY", "signature acknowledgement requires a valid project trust policy before signing");
  const signer = configuredSignerMatchesProjectTrust(directory, policy, deps);
  if (signer.status === "unavailable") fail("BOOTSTRAP-ACK-SIGNER-POLICY-UNAVAILABLE", "the configured PO signing-key directory has no readable valid trust-policy.json");
  if (signer.status !== "matched") fail("BOOTSTRAP-ACK-SIGNER-TRUST-MISMATCH", "the configured PO signing key is not declared by this project's trust policy");
  const request = writeBootstrapAcknowledgementRequest(plan.root, plan);
  return {
    schema: BOOTSTRAP_ACKNOWLEDGEMENT_PLAN_SCHEMA,
    status: "signature-required",
    root: plan.root,
    runner,
    intentSha256: plan.intentSha256,
    prd: plan.action.prd,
    spec: plan.action.spec,
    requestPath: plan.requestPath,
    proofPath: plan.proofPath,
    requestWritten: request.written,
    nextAction: bootstrapAcknowledgementSignAction(plan),
  };
}

export function observeOnboardingBootstrapAcknowledgementSignature({
  rootDir, repositoryCapability = "local", spawn = defaultGitSpawn, deps = {},
} = {}) {
  const plan = bootstrapAcknowledgementPlan({ rootDir, repositoryCapability, spawn });
  const request = readExactBootstrapAcknowledgementRequest(plan.root, plan);
  const proofVerification = observeBootstrapAcknowledgementProofVerification(plan, deps);
  const configuredDirectory = configuredPoKeyDirectory(plan.root, deps);
  const directory = configuredDirectory.directory;
  const policy = (deps.readCriticalHumanProofPolicy ?? readCriticalHumanProofPolicy)(plan.root);
  const signer = configuredDirectory.status !== "present" || !policy.ok
    ? { status: "unavailable" }
    : configuredSignerMatchesProjectTrust(directory, policy, deps);
  return {
    ...plan,
    requestStatus: request.status,
    proofStatus: proofVerification.proof.status,
    proofVerificationStatus: proofVerification.status,
    signAction: request.status === "present" && configuredDirectory.status === "present" && signer.status === "matched"
      ? bootstrapAcknowledgementSignAction(plan)
      : null,
  };
}

export function applyOnboardingBootstrapAcknowledgement({
  rootDir, expectedPlanSha256, proofPath, attendedChat = false, activate = false, repositoryCapability = "local", spawn = defaultGitSpawn, deps = {},
} = {}) {
  if (activate !== true) fail("BOOTSTRAP-ACK-ACTIVATION-REQUIRED", "plan acknowledgement apply requires explicit activation");
  const plan = bootstrapAcknowledgementPlan({ rootDir, repositoryCapability, spawn });
  if (expectedPlanSha256 !== plan.intentSha256) {
    const expectedRequest = typeof expectedPlanSha256 === "string" && /^[a-f0-9]{64}$/u.test(expectedPlanSha256)
      ? readBootstrapAcknowledgementRequestByIntent(plan.root, expectedPlanSha256)
      : { status: "invalid" };
    if (expectedRequest.status === "present" && onlyBootstrapAcknowledgementPrdDrift(expectedRequest.value.action, plan.action)) {
      fail("BOOTSTRAP-ACK-PRD-DRIFT", "the staging PRD changed after the signature plan was created");
    }
    fail("BOOTSTRAP-ACK-PLAN-DRIFT", "the signature acknowledgement plan is no longer current");
  }
  let verified = null;
  if (!attendedChat) {
    if (proofPath !== plan.proofPath) fail("BOOTSTRAP-ACK-PROOF-PATH", "the signature acknowledgement proof path is not the plan-bound scratch path");
    if (readExactBootstrapAcknowledgementRequest(plan.root, plan).status !== "present") fail("BOOTSTRAP-ACK-REQUEST-DRIFT", "the signature acknowledgement request is absent or changed");
    const proof = observeOptionalProjectFile(plan.root, plan.proofPath, "signature acknowledgement proof");
    if (proof.status !== "present") fail("BOOTSTRAP-ACK-PROOF-UNAVAILABLE", "the signed acknowledgement proof is unavailable");
    let proofValue;
    try { proofValue = JSON.parse(proof.raw.toString("utf8")); } catch { fail("BOOTSTRAP-ACK-PROOF-INVALID", "the signed acknowledgement proof is malformed"); }
    const policy = (deps.readCriticalHumanProofPolicy ?? readCriticalHumanProofPolicy)(plan.root);
    if (!policy.ok) fail("BOOTSTRAP-ACK-TRUST-POLICY", "the project trust policy is unavailable");
    const anchors = policy.trustAnchors ?? (policy.trustAnchor === null ? [] : [policy.trustAnchor]);
    verified = (deps.verifyAgainstTrustAnchors ?? verifyAgainstTrustAnchors)({ intent: { sha256: plan.intentSha256 }, anchors, proof: proofValue });
    if (!verified.verified) fail("BOOTSTRAP-ACK-PROOF-INVALID", "the signed acknowledgement proof does not verify for this exact plan");
  }
  // Persist the exact human-decision evidence *before* changing the PRD.  A
  // failed replacement can then be retried against the same receipt; a
  // successful replacement can later carry the one proof into approve-plan.
  // This is intentionally not an authority on its own: every later consumer
  // rechecks the signed request, the proof and the currently authoritative
  // PRD/spec identities.
  const receipt = bootstrapAcknowledgementReceipt(plan, verified, attendedChat);
  const persistedReceipt = writeBootstrapAcknowledgementReceipt(plan.root, plan, receipt);
  const target = absoluteProjectPath(plan.root, plan.action.prd.path, "staging PRD");
  assertPhysicalChain(plan.root, target, { leafMayBeAbsent: false });
  const current = readPhysicalFile(target, "staging PRD");
  if (sha256(current) !== plan.action.prd.sha256) fail("BOOTSTRAP-ACK-PRD-DRIFT", "the staging PRD changed after the signature plan was created");
  const next = appendBootstrapAcknowledgementMarker(current);
  if (next === null) fail("BOOTSTRAP-ACK-PRD-MARKER", "the staging PRD cannot safely receive one acknowledgement marker");
  let fd;
  let temporaryRecord;
  let committed = false;
  try {
    fd = openSync(target, constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0));
    const opened = fstatSync(fd);
    const before = lstatSync(target);
    if (!opened.isFile() || before.isSymbolicLink() || opened.dev !== before.dev || opened.ino !== before.ino) fail("BOOTSTRAP-ACK-PRD-IDENTITY", "the staging PRD identity changed before acknowledgement");
    const suffixSource = (deps.randomUUID ?? randomUUID)();
    if (typeof suffixSource !== "string" || !/^[a-f0-9-]{32,64}$/iu.test(suffixSource)) {
      fail("BOOTSTRAP-ACK-RANDOM-UNAVAILABLE", "signature acknowledgement temporary-name source is invalid");
    }
    const temporary = join(
      dirname(target),
      `.${basename(target)}.bootstrap-ack-${suffixSource.replaceAll("-", "")}.tmp`,
    );
    // The marker is a human-authorized transition. Never truncate its signed
    // preimage in place: a failed write must leave the original document and
    // its plan digest retryable. The same-directory replace is atomic.
    temporaryRecord = writeExclusiveSynced(temporary, next, opened.mode & 0o777);
    assertPhysicalChain(plan.root, target, { leafMayBeAbsent: false });
    if (sha256(readPhysicalFile(target, "staging PRD")) !== plan.action.prd.sha256) {
      fail("BOOTSTRAP-ACK-PRD-DRIFT", "the staging PRD changed before acknowledgement replacement");
    }
    // Windows cannot replace a pathname while this process still holds the
    // target descriptor open.  The descriptor was used only for identity
    // validation (not locking); close it after the final physical-chain and
    // digest readback, before the same-directory atomic replacement.  Keeping
    // it open made every otherwise valid Windows signature acknowledgement
    // collapse into the generic BOOTSTRAP-ACK-WRITE error.
    closeSync(fd);
    fd = undefined;
    renameSync(temporary, target);
    temporaryRecord = null;
    committed = true;
    fsyncDirectory(dirname(target));
  } catch (error) {
    if (error?.code?.startsWith("BOOTSTRAP-ACK-")) throw error;
    fail("BOOTSTRAP-ACK-WRITE", "the staging PRD acknowledgement could not be written safely");
  } finally {
    if (fd !== undefined) closeSync(fd);
    if (!committed && temporaryRecord) {
      try { unlinkOwned(temporaryRecord); } catch {}
    }
  }
  return {
    schema: BOOTSTRAP_ACKNOWLEDGEMENT_APPLY_SCHEMA,
    status: "applied",
    root: plan.root,
    intentSha256: plan.intentSha256,
    prd: { ...plan.action.prd, postSha256: sha256(next) },
    spec: plan.action.spec,
    signer: verified?.signer ?? null,
    proofSha256: verified?.proofSha256 ?? null,
    acknowledgementMode: attendedChat ? "chat" : "signature",
    receiptPath: plan.receiptPath,
    receiptWritten: persistedReceipt.written,
  };
}

function acknowledgementReceiptCandidates(root) {
  const scratch = absoluteProjectPath(root, "scratch", "bootstrap acknowledgement scratch directory");
  if (!existsSync(scratch)) return [];
  try {
    assertPhysicalChain(root, scratch, { leafMayBeAbsent: false });
    const names = readdirSync(scratch);
    // A repository may retain old acknowledgements, but an unbounded directory
    // walk is never an approval primitive.
    if (names.length > 256) return [];
    return names
      .filter((name) => /^bootstrap-plan-acknowledgement-receipt-[a-f0-9]{64}\.json$/u.test(name))
      .map((name) => {
        const path = join(scratch, name);
        try {
          const stat = lstatSync(path);
          if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 65_536) return null;
          return { path, value: JSON.parse(readPhysicalFile(path, "bootstrap acknowledgement receipt").toString("utf8")) };
        } catch { return null; }
      })
      .filter((entry) => entry !== null);
  } catch {
    return [];
  }
}

function validBootstrapAcknowledgementReceipt(value, root) {
  if (!exactKeys(value, new Set(["schema", "intentSha256", "action", "acknowledgementMode", "proofSha256", "signer"]))
    || value.schema !== BOOTSTRAP_ACKNOWLEDGEMENT_RECEIPT_SCHEMA
    || !SHA256_RE.test(value.intentSha256 ?? "")
    || !isObject(value.action)
    || canonicalSha256(value.action) !== value.intentSha256
    || value.action.kind !== "bootstrap-plan-acknowledgement"
    || value.action.root !== root
    || !exactKeys(value.action, new Set(["kind", "decision", "root", "featureId", "checkpoint", "prd", "spec"]))
    || !isObject(value.action.prd) || !isObject(value.action.spec)
    || typeof value.action.prd.path !== "string" || !SHA256_RE.test(value.action.prd.sha256 ?? "")
    || typeof value.action.spec.path !== "string" || !SHA256_RE.test(value.action.spec.sha256 ?? "")
    || !new Set(["chat", "signature"]).has(value.acknowledgementMode)) return false;
  if (value.acknowledgementMode === "chat") return value.proofSha256 === null && value.signer === null;
  return SHA256_RE.test(value.proofSha256 ?? "")
    && exactKeys(value.signer, new Set(["keyReference", "publicKeySha256"]))
    && typeof value.signer.keyReference === "string" && value.signer.keyReference.length > 0
    && SHA256_RE.test(value.signer.publicKeySha256 ?? "");
}

function acknowledgedPreimageMatches(authorityPrd, expectedSha256) {
  const text = decodeBootstrapAcknowledgementPrd(authorityPrd);
  if (text === null || [...text.matchAll(PRD_ACKNOWLEDGEMENT_MARKER)].length !== 1) return false;
  const suffix = `\n\n${PO_GATE_PRD_ACKNOWLEDGEMENT_MARKER}\n`;
  if (!text.endsWith(suffix)) return false;
  // appendBootstrapAcknowledgementMarker preserves the staging preimage byte
  // for byte. Removing its fixed suffix therefore recovers every valid source
  // shape, including one with any number of terminal newlines.
  const prefix = text.slice(0, -suffix.length);
  return sha256(Buffer.from(prefix, "utf8")) === expectedSha256;
}

/**
 * Re-observe the one bootstrap acknowledgement after promotion.  The caller
 * cannot nominate an arbitrary proof: only a receipt whose request, proof,
 * current authority PRD and current authority spec all coincide is usable.
 */
export function observeOnboardingBootstrapPlanApproval({
  rootDir, authority, repositoryCapability = "local", deps = {},
} = {}) {
  let root;
  try { root = physicalRoot(rootDir); } catch { return { status: "unavailable" }; }
  if (!isObject(authority) || typeof authority.planPath !== "string" || typeof authority.specPath !== "string") {
    return { status: "unavailable" };
  }
  const prd = observeOptionalProjectFile(root, authority.planPath, "authoritative PRD");
  const spec = observeOptionalProjectFile(root, authority.specPath, "authoritative specification");
  if (prd.status !== "present" || spec.status !== "present") return { status: "unavailable" };
  const matches = acknowledgementReceiptCandidates(root)
    .filter(({ value }) => validBootstrapAcknowledgementReceipt(value, root));
  const matching = matches.filter(({ value }) => value.action.prd?.path === authority.planPath
    && value.action.spec?.path === authority.specPath
    && value.action.spec?.sha256 === sha256(spec.raw)
    && acknowledgedPreimageMatches(prd.raw, value.action.prd.sha256));
  if (matching.length !== 1) return { status: matching.length === 0 ? "unavailable" : "ambiguous" };
  const { path: receiptPath, value: receipt } = matching[0];
  const proofPath = `scratch/bootstrap-plan-acknowledgement-proof-${receipt.intentSha256}.json`;
  if (receipt.acknowledgementMode === "chat") {
    return { status: "chat", receiptPath: relative(root, receiptPath).split(sep).join("/"), intentSha256: receipt.intentSha256 };
  }
  const proof = observeOptionalProjectFile(root, proofPath, "bootstrap acknowledgement proof");
  if (proof.status !== "present") return { status: "unavailable" };
  let proofValue;
  try { proofValue = JSON.parse(proof.raw.toString("utf8")); } catch { return { status: "invalid" }; }
  const policy = (deps.readCriticalHumanProofPolicy ?? readCriticalHumanProofPolicy)(root);
  if (!policy.ok) return { status: "invalid" };
  const anchors = policy.trustAnchors ?? (policy.trustAnchor === null ? [] : [policy.trustAnchor]);
  const verified = (deps.verifyAgainstTrustAnchors ?? verifyAgainstTrustAnchors)({ intent: { sha256: receipt.intentSha256 }, anchors, proof: proofValue });
  if (!verified.verified || verified.proofSha256 !== receipt.proofSha256
    || canonicalJson(verified.signer) !== canonicalJson(receipt.signer)) return { status: "invalid" };
  return {
    status: "verified",
    proofPath,
    receiptPath: relative(root, receiptPath).split(sep).join("/"),
    intentSha256: receipt.intentSha256,
    signer: verified.signer,
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
  const result = applyOnboardingKickoffPromotion({
    plan, expectedPlanSha256, activate, deps: { ...deps, spawn },
  });
  // pipeline.po-language-propagated-to-configured-pair (NVA-R5-LANGWIRE): this
  // apply used to return here, leaving language.human_facing (the pair
  // configuredLanguage()/po-gate-authority.mjs reads) on its seeded default
  // even when the PO's real answer was {de, en} -- applyOnboardingKickoffPromotion
  // (shared with the legacy kickoff-promotion wrapper) never touches it, only
  // ensureLocalPromotionPoProfileReceipt's receipt snapshot above, which
  // snapshots whatever those files ALREADY say. The legacy wrapper
  // (applyProjectOnboardingKickoffPromotionV4, lib/project-onboarding-v3.mjs)
  // already closes this with the SAME correction after its own promotion
  // call; this is the identical fix for the coordinator-sourced path. The
  // correction's own {de,en}-vs-else early return (unmodified, see that
  // module) is what keeps a non-{de,en} content language -- documentLanguage,
  // already written correctly by buildCoordinatorSourcedPromotionPlan -- out
  // of this pair entirely.
  //
  // Gated on "local" exactly like the legacy wrapper's own
  // `if (observed.repository.mode === "local")` guard, and additionally on
  // both files actually being present -- the same precondition
  // ensureLocalPromotionPoProfileReceipt already applies immediately above,
  // for the identical reason (this module's own unit tests exercise the
  // promotion machinery on its own, without a real project's early
  // apply-portable-seed having run yet; nothing to correct there).
  if (repositoryCapability === "local") {
    const projection = poGateProfileProjectionPaths(plan.root);
    const source = observeOptionalProjectFile(plan.root, projection.source, "PO profile source");
    const runtime = observeOptionalProjectFile(plan.root, projection.manifest, "PO profile runtime manifest");
    if (source.status === "present" && runtime.status === "present") {
      correctPromotedLanguage(plan.root, plan.authority.poLanguage, {
        readFileSync, writeFileSync, existsSync, lstatSync, openSync, fstatSync, closeSync, constants,
        publishPoGateProfileReceipt,
      });
    }
  }
  return result;
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
    // Re-admit marker policy at apply time against the current authority bytes
    // for mini/legacy profiles. Epic/feature uses the final complete DWP as its
    // single PO decision and remains unapproved after this mechanical bind.
    const authority = promotionArtifacts(plan.root, {
      profile: plan.profile, featureId: plan.feature.id, planPath: plan.feature.planPath,
      prdPath: plan.authority.prd.path, specPath: plan.authority.spec.path,
      designInputPath: plan.authority.designInput.path,
    }, { checkMarkers: !new Set(["epic", "feature"]).has(plan.profile) });
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

/** Owner-derived exact consumed intake snapshot; material evidence stays retained. */
export function observeEnrollmentRetirementIntake({rootDir}={}) {
 const observed=readOnboardingIntakeCheckpoint({rootDir});
 if(observed.status==='absent')return {path:observed.paths.checkpoint,bytes:null,identity:null,value:null,sha256:null};
 readIntakeMaterialInputChunks(observed.paths,observed.value);
 const bytes=readPhysicalFile(observed.paths.checkpoint,'enrollment retirement intake'),st=lstatSync(observed.paths.checkpoint);
 return {path:observed.paths.checkpoint,bytes,identity:{dev:String(st.dev),ino:String(st.ino)},value:observed.value,sha256:sha256(bytes)};
}
/** This owner retires only an exact archived checkpoint into the pending generation. */
export function retireEnrollmentIntake({rootDir,generationSha256,expectedSha256,at,capability}={}) {
 migrateOwnedRetirementIntake({rootDir,expectedSha256,capability});
 if(!SHA256_RE.test(generationSha256??'')||!(expectedSha256===null||SHA256_RE.test(expectedSha256??''))||!canonicalIsoTimestamp(at))fail('ER-INTAKE-REQUEST','invalid retirement intake request');
 const reset=defaultIntakeCheckpoint(physicalRoot(rootDir),at);
 const unsigned={...reset,retiredEnrollmentGenerationSha256:generationSha256};delete unsigned.contentSha256;
 const result=applyIntakeCheckpointMutation({rootDir,deps:{retirementOwnerLock:capability},mutate:observed=>{
  if(observed.status==='present'&&observed.value.retiredEnrollmentGenerationSha256===generationSha256){
   const expected={...unsigned,contentSha256:canonicalSha256(unsigned)};
   if(canonicalJson(observed.value)!==canonicalJson(expected))fail('ER-INTAKE-FRESH-DRIFT','fresh intake must never be cleared by retirement replay');
   return null;
  }
  if((observed.status==='absent'?null:observed.sha256)!==expectedSha256)fail('ER-INTAKE-CAS','archived intake changed');
  return unsigned;
 }});
 const readback=observeEnrollmentRetirementIntake({rootDir});
 if(readback.value?.retiredEnrollmentGenerationSha256!==generationSha256||readback.value.consent!==null)fail('ER-INTAKE-READBACK','retirement reset mismatch');
 return {sha256:readback.sha256,mutated:result.mutated};
}

const RETIREMENT_INTAKE_LOCKS=new WeakSet();
function intakePathsForDirectory(root,directory){return {root,directory,checkpoint:join(directory,INTAKE_CHECKPOINT_BASENAME),evidenceDirectory:join(directory,INTAKE_CHECKPOINT_EVIDENCE_DIRNAME),lock:join(directory,INTAKE_CHECKPOINT_LOCK_BASENAME)};}
/** Config lock is held by the canonical coordinator before this owner takes intake locks. */
export function withEnrollmentRetirementIntakeLock({rootDir},operation){
 const scope=observeGovernanceScope({rootDir});
 if(scope.root!==physicalRoot(rootDir))fail('ER-INTAKE-DECLINED','physical root differs');
 if(scope.state!=='declined'){const selected=resolveOnboardingIntakeScope(rootDir,'local'),path=join(selected.directory,'enrollment-retirement.json');
  const pending=existsSync(path)?JSON.parse(readPhysicalFile(path,'enrollment retirement coordinator').toString('utf8')):null;
  if(scope.state!=='active'||!validateRetirementJournal(pending)||!['pending','active'].includes(pending.phase)||pending.activeScopeSha256===null||pending.activeScopeSha256!==scope.provenance.refs[0]?.sha256)fail('ER-INTAKE-DECLINED','durable physical decline or exact activation resume is required');
 }
 const selected=resolveOnboardingIntakeScope(rootDir,'local',{create:true}),legacy=intakePathsForDirectory(selected.root,selected.legacyDirectory),current=intakePathsForDirectory(selected.root,selected.directory),held=[];
 try{
  for(const paths of [legacy,current])held.push(acquireLock(paths.lock,INTAKE_CHECKPOINT_LOCK_SCHEMA,`intake-checkpoint-${sha256(Buffer.from(paths.checkpoint,'utf8')).slice(0,32)}`,{nowMs:Date.now,lockStaleMs:30000}));
  const capability={root:selected.root,paths:current,legacyPaths:legacy,lock:held[1]};RETIREMENT_INTAKE_LOCKS.add(capability);
  try{return operation(capability);}finally{RETIREMENT_INTAKE_LOCKS.delete(capability);}
 }finally{for(const lock of held.reverse())releaseLock(lock);}
}
function migrateOwnedRetirementIntake({rootDir,expectedSha256,capability}){
 if(!RETIREMENT_INTAKE_LOCKS.has(capability)||capability.root!==physicalRoot(rootDir))fail('ER-INTAKE-LOCK','intake migration needs its sealed owner lock');
 const destination=readIntakeCheckpointRaw(capability.paths.checkpoint);
 if(destination.status==='present'){
  if(destination.sha256!==expectedSha256&&destination.value?.retiredEnrollmentGenerationSha256===undefined)fail('ER-INTAKE-MIGRATION-COLLISION','selected checkpoint differs');
  const old=readIntakeCheckpointRaw(capability.legacyPaths.checkpoint);
  if(old.status==='present'&&old.value?.root===capability.root){if(old.sha256!==expectedSha256)fail('ER-INTAKE-MIGRATION-CAS','owned legacy checkpoint drifted');unlinkSync(capability.legacyPaths.checkpoint);fsyncDirectory(capability.legacyPaths.directory);}return;
 }
 const prior=readIntakeCheckpointRaw(capability.legacyPaths.checkpoint);
 if(prior.status==='absent')return;
 if(!validateIntakeCheckpoint(prior.value?.root,prior.value))fail('ER-INTAKE-LEGACY-MALFORMED','legacy intake is malformed');
 if(prior.value.root!==capability.root)return; // Foreign consent stays in its original slot.
 if(prior.sha256!==expectedSha256)fail('ER-INTAKE-MIGRATION-CAS','owned legacy intake differs from the archived bytes');
 const bytes=readPhysicalFile(capability.legacyPaths.checkpoint,'owned legacy intake migration');
 readIntakeMaterialInputChunks(capability.legacyPaths,prior.value);
 for(const chunk of prior.value.materialInput){
  const bytes=readPhysicalFile(join(capability.legacyPaths.directory,chunk.evidencePath),'retained intake material');
  if(sha256(bytes)!==chunk.sha256||bytes.length!==chunk.byteLength)fail('ER-INTAKE-MATERIAL-CAS','material evidence differs');
  const evidence=writeIntakeCheckpointEvidence(capability.paths,bytes);
  if(!prior.value.materialInput.some(e=>e.sha256===evidence.sha256&&e.byteLength===evidence.byteLength))fail('ER-INTAKE-EVIDENCE','material byte identity changed');
 }
 if(readIntakeCheckpointRaw(capability.legacyPaths.checkpoint).sha256!==prior.sha256)fail('ER-INTAKE-MIGRATION-CAS','legacy intake changed under lock');
 const temporary=join(capability.paths.directory,'.intake-migration-'+randomUUID()+'.tmp');
 const owned=writeExclusiveSynced(temporary,bytes,0o600);
 try{
  if(existsSync(capability.paths.checkpoint))fail('ER-INTAKE-MIGRATION-COLLISION','selected checkpoint appeared');
  renameSync(temporary,capability.paths.checkpoint);fsyncDirectory(capability.paths.directory);
 }catch(e){try{unlinkOwned(owned);}catch{}throw e;}
 if(readIntakeCheckpointRaw(capability.paths.checkpoint).sha256!==prior.sha256)fail('ER-INTAKE-MIGRATION-READBACK','selected intake readback differs');
 // Legacy bytes remain retained in the archive and evidence store; only the exact owned current slot moves.
 if(readIntakeCheckpointRaw(capability.legacyPaths.checkpoint).sha256!==prior.sha256)fail('ER-INTAKE-MIGRATION-CAS','legacy intake changed before retirement');
 unlinkSync(capability.legacyPaths.checkpoint);fsyncDirectory(capability.legacyPaths.directory);
}

// Source-owned basic continuity authority. Controlled transitions requiring an
// accepted plan, consumed review and audited close are separate prerequisites.
const continuityAuthorityPorts = new WeakMap();
const continuityAuthorityOperations = new WeakMap();
const continuityAuthorityExecutions = new WeakMap();
const continuityAuthorityTerminals = new WeakMap();

function continuityAuthorityUnavailable(reason) {
  return Object.freeze({status:'unavailable',code:'SDC-AUTHORITY-UNAVAILABLE',reason});
}
function continuityAuthorityEqual(a,b) { return canonicalJson(a) === canonicalJson(b); }
function continuityAuthorityHandle(map, value) {
  const handle = Object.freeze({}); map.set(handle,value); return handle;
}
function continuityAuthorityRepository(repository) {
  const actual = inspectSignedDescriptorCustodyRepository(repository?.primaryRoot);
  if (!continuityAuthorityEqual(actual,repository))
    fail('SDC-ROOT','continuity authority repository changed');
  return actual;
}
function continuityAuthorityFact(path, namespaceId, semantic) {
  const before = lstatSync(path);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1
      || before.size > 1048576 || (typeof process.getuid === 'function' && before.uid !== process.getuid()))
    fail('SDC-AUTHORITY-UNAVAILABLE','continuity source file unsafe');
  const fd = openSync(path,constants.O_RDONLY | constants.O_NOFOLLOW);
  let bytes;
  try {
    const opened = fstatSync(fd); bytes = readFileSync(fd);
    if (opened.dev !== before.dev || opened.ino !== before.ino || opened.mode !== before.mode)
      fail('SDC-AUTHORITY-CAS','continuity source replaced');
  } finally { closeSync(fd); }
  const after = lstatSync(path);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (before.dev !== after.dev || before.ino !== after.ino || before.mode !== after.mode
      || bytes.length !== after.size || sha256 !== createHash('sha256').update(readFileSync(path)).digest('hex'))
    fail('SDC-AUTHORITY-CAS','continuity source changed');
  return Object.freeze({namespaceId,pathSha256:canonicalSha256(path),sha256,size:bytes.length,
    identity:Object.freeze({dev:String(after.dev),ino:String(after.ino),mode:after.mode,nlink:1}),
    semanticSha256:canonicalSha256(semantic)});
}
function continuityAuthorityPrivateRef(repository,path) {
  const rel = relative(repository.commonDir,path).split(sep).join('/');
  if (!rel.startsWith('agent-pipeline/') || rel.split('/').some(p=>!p || p==='.' || p==='..'))
    fail('SDC-PRIVATE-PATH','continuity reference outside common directory');
  const bytes = assertPrivateCleanupFile(path,'continuity authority source');
  return Object.freeze({path:`.git/${rel}`,sha256:createHash('sha256').update(bytes).digest('hex'),size:bytes.length});
}
// Observe real absence without manufacturing storage or an owning lifetime.
// An absence is accepted only below the currently validated physical common
// directory; every existing ancestor and actual entry set is read twice.
function continuityAuthorityObservePrivateNamespace(repository,directory) {
  const common=repository.commonDir;
  if(directory!==join(common,'agent-pipeline','onboarding')
      ||realpathSync(common)!==common)
    fail('SDC-PRIVATE-PATH','continuity private namespace topology changed');
  const ancestry=[];
  function observeDirectory(path,privateMode) {
    const before=lstatSync(path);
    if(!before.isDirectory()||before.isSymbolicLink()||realpathSync(path)!==path
        ||(typeof process.getuid==='function'&&before.uid!==process.getuid())
        ||(privateMode&&process.platform!=='win32'&&(before.mode&0o077)!==0))
      fail('SDC-PRIVATE-PATH','continuity private namespace ancestor unsafe');
    const identity=stat=>({dev:String(stat.dev),ino:String(stat.ino),mode:stat.mode,
      nlink:stat.nlink,uid:stat.uid});
    // Windows does not expose the POSIX directory-open flags. Keep physical
    // lstat/realpath and repeated membership CAS there; native qualification is
    // separate from this source-only portable read policy.
    const fd=process.platform==='win32'?null:
      openSync(path,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
    let names;
    try {
      if(fd!==null&&!continuityAuthorityEqual(identity(before),identity(fstatSync(fd))))
        fail('SDC-AUTHORITY-CAS','continuity namespace ancestor replaced on open');
      names=readdirSync(path).sort();
      if(names.length>4096)
        fail('SDC-AUTHORITY-UNAVAILABLE','continuity namespace ancestor entry bound');
      if((fd!==null&&!continuityAuthorityEqual(identity(before),identity(fstatSync(fd))))
          ||!continuityAuthorityEqual(identity(before),identity(lstatSync(path)))
          ||realpathSync(path)!==path)
        fail('SDC-AUTHORITY-CAS','continuity namespace ancestor changed during read');
    }finally{if(fd!==null)closeSync(fd);}
    ancestry.push(Object.freeze({pathSha256:canonicalSha256(path),identity:Object.freeze(identity(before)),
      entrySetSha256:canonicalSha256(names),entryCount:names.length}));
    return names;
  }
  let current=common,names=observeDirectory(common,false);
  for(const component of ['agent-pipeline','onboarding']) {
    const child=join(current,component);
    let stat;
    try{stat=lstatSync(child);}catch(error){
      if(error?.code!=='ENOENT')
        fail('SDC-AUTHORITY-UNAVAILABLE','continuity namespace ancestor cannot be observed');
      if(names.includes(component))
        fail('SDC-AUTHORITY-CAS','continuity namespace disappeared after parent read');
      return Object.freeze({schema:'pipeline.continuity-private-namespace-observation.v1',
        status:'absent',pathSha256:canonicalSha256(directory),missingPathSha256:canonicalSha256(child),
        ancestry:Object.freeze(ancestry),entries:Object.freeze([])});
    }
    if(!names.includes(component)||!stat.isDirectory()||stat.isSymbolicLink())
      fail('SDC-PRIVATE-PATH','continuity namespace ancestor is aliased or not a directory');
    current=child;names=observeDirectory(current,true);
  }
  return Object.freeze({schema:'pipeline.continuity-private-namespace-observation.v1',
    status:'present',pathSha256:canonicalSha256(directory),missingPathSha256:null,
    ancestry:Object.freeze(ancestry),entries:Object.freeze(names)});
}

function continuityAuthoritySnapshot(repository) {
  continuityAuthorityRepository(repository);
  const observed = observeSessionCleanupState(repository.primaryRoot);
  const stateLockPath = `${observed.path}.lock`;
  const stateLockExists = existsSync(stateLockPath);
  const stateLockWitness = continuityAuthorityCurrentStateWriterLock(repository, observed);
  if (stateLockExists && !stateLockWitness) fail('SDC-LOCK-HELD','continuity State lock held');
  if (!stateLockExists && stateLockWitness) fail('SDC-AUTHORITY-CAS','owned continuity State lock disappeared');
  const stateNamespaceNames = readdirSync(dirname(observed.path));
  if (stateNamespaceNames.some(name=>name.startsWith(basename(observed.path)+'.')
      && !(stateLockWitness && name === basename(stateLockPath))))
    fail('SDC-AUTHORITY-UNAVAILABLE','continuity State namespace has unresolved temporary entries');
  if (stateLockWitness && !continuityAuthoritySameStateWriterLock(repository, observed, stateLockWitness))
    fail('SDC-AUTHORITY-CAS','owned continuity State lock physical image changed');
  const paths = privateCleanupPaths(repository.primaryRoot);
  const privateRel = relative(repository.commonDir,paths.directory);
  if (!privateRel || privateRel.startsWith(`..${sep}`) || isAbsolute(privateRel))
    fail('SDC-PRIVATE-PATH','continuity private namespace outside common directory');
  const namespaceWitness=continuityAuthorityObservePrivateNamespace(repository,paths.directory);
  const first = namespaceWitness.entries;
  if (first.length > 4096) fail('SDC-AUTHORITY-UNAVAILABLE','continuity namespace entry bound');
  const binding = readPrivateCleanupBinding(repository.primaryRoot);
  const release = observePrivateCleanupReleaseReceipt(repository.primaryRoot);
  if (!['absent','valid'].includes(release.status))
    fail('SDC-AUTHORITY-UNAVAILABLE','continuity release receipt unresolved');
  if(first.length===0&&(binding.binding!==null||release.status!=='absent'
      ||observed.sessionCleanup||observed.orphanBinding))
    fail('SDC-AUTHORITY-HELD','empty continuity namespace retains declared cleanup authority');
  const selected = [continuityAuthorityFact(observed.path,'selected-state',observed.state)];
  const cleanup = [], released = [];
  const allowed = new Set([basename(paths.binding),basename(paths.key),basename(paths.releaseReceipt)]);
  for (const name of first) {
    const ownJournal = /^continuity-authority-(execution|terminal)-[a-f0-9]{32}\.json$/.test(name);
    const privatization = name.startsWith(SESSION_CLEANUP_PRIVATIZATION_AUDIT_BASENAME+'.')
      || name.startsWith(SESSION_CLEANUP_PRIVATIZATION_CONFIRMATION_BASENAME+'.');
    if (!allowed.has(name) && !ownJournal && !privatization) {
      if (name.startsWith('session-cleanup-') || name.startsWith('continuity-authority-'))
        fail('SDC-AUTHORITY-UNAVAILABLE','unknown continuity private namespace entry');
      continue; // Other intake namespaces have their own owners.
    }
    const path = join(paths.directory,name);
    const bytes = assertPrivateCleanupFile(path,'continuity namespace entry');
    let semantic;
    if (path === paths.key) semantic = {kind:'private-mac-key',sha256:createHash('sha256').update(bytes).digest('hex')};
    else {
      try { semantic = JSON.parse(bytes.toString('utf8')); }
      catch { fail('SDC-AUTHORITY-UNAVAILABLE','continuity private entry malformed'); }
      if (ownJournal && (semantic.schema !== 'pipeline.continuity-authority-observation.v1'
          || !['execution','terminal'].includes(semantic.stage) || semantic.repositorySha256 !== canonicalSha256(repository)))
        fail('SDC-AUTHORITY-CAS','continuity authority journal binding');
    }
    const namespaceId = path === paths.releaseReceipt || name.startsWith('continuity-authority-terminal-')
      ? 'cleanup-release' : 'cleanup-binding';
    (namespaceId === 'cleanup-release' ? released : cleanup).push(continuityAuthorityFact(path,namespaceId,semantic));
  }
  if (!continuityAuthorityEqual(namespaceWitness,
      continuityAuthorityObservePrivateNamespace(repository,paths.directory)))
    fail('SDC-AUTHORITY-CAS','continuity namespace changed during read');
  if (stateLockWitness && !continuityAuthoritySameStateWriterLock(repository, observed, stateLockWitness))
    fail('SDC-AUTHORITY-CAS','owned continuity State lock physical image changed');
  const memberships = [['selected-state',dirname(observed.path),selected],
    ['cleanup-binding',paths.directory,cleanup],['cleanup-release',paths.directory,released]]
    .map(([namespaceId,root,facts])=>Object.freeze({namespaceId,rootSha256:canonicalSha256(root),
      entrySetSha256:canonicalSha256(facts),entryCount:facts.length,sourceFacts:Object.freeze(facts)}));
  return {observed,binding,release,paths,memberships,namespaceWitness,sourceFacts:memberships.flatMap(m=>m.sourceFacts)};
}
function continuityAuthorityCurrent(data,requesterHandle) {
  const terminal=continuityRetiredOwnerScope.getStore();
  if(terminal){
    if(terminal.operation.data!==data||terminal.operation.requesterHandle!==requesterHandle)
      fail('SDC-AUTHORITY-CAS','foreign continuity terminal requester');
    return continuityReadRetiredOwner(terminal.operation);
  }
  const context = readSourceOwnedAuthorityContext({repository:data.repository});
  if (context.status !== 'bound' || context.requesterHandle !== requesterHandle)
    fail('SDC-AUTHORITY-UNAVAILABLE','continuity current requester unavailable');
  const read = createSignedCleanupRequesterObserver({repository:data.repository,requesterHandle});
  const actual = read({repository:data.repository});
  if (actual.status !== 'bound') fail('SDC-AUTHORITY-UNAVAILABLE','continuity requester readback unavailable');
  return actual.requester;
}
function continuityAuthorityOperation(data,handle) {
  const operation = continuityAuthorityOperations.get(handle);
  if (!operation || operation.data !== data) fail('SDC-AUTHORITY-CAS','unowned continuity operation');
  return operation;
}
function continuityAuthorityJournal(operation,stage,value) {
  const paths = privateCleanupPaths(operation.data.repository.primaryRoot);
  const path = join(paths.directory,`continuity-authority-${stage}-${operation.id}.json`);
  const body = {schema:'pipeline.continuity-authority-observation.v1',stage,
    repositorySha256:canonicalSha256(operation.data.repository),bindingSha256:operation.bindingSha256,
    association:operation.association,source:value};
  const fd = openSync(path,constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,0o600);
  try { writeFileSync(fd,canonicalJson(body)); fsyncSync(fd); } finally { closeSync(fd); }
  const ref = continuityAuthorityPrivateRef(operation.data.repository,path);
  operation.journalRefs.push(ref);
  return ref;
}
function continuityAuthorityCheckJournals(operation) {
  for (const expected of operation.journalRefs) {
    const path = join(operation.data.repository.commonDir,expected.path.slice(5));
    if (!continuityAuthorityEqual(expected,continuityAuthorityPrivateRef(operation.data.repository,path)))
      fail('SDC-AUTHORITY-CAS','continuity immutable journal changed');
  }
}
/** Empty private writer parent, prepared only by Registry initialization before baselines. */
export function prepareOnboardingContinuityAuthorityParent(input) {
  if (arguments.length !== 1 || !exactKeys(input, new Set(['repository'])))
    fail('SDC-AUTHORITY-UNAVAILABLE','continuity initializer parent input');
  const repository = continuityAuthorityRepository(input.repository);
  return withSessionAuthorityBoundary({repository}, () => {
    const expected = join(repository.commonDir,'agent-pipeline','onboarding');
    const before = privateCleanupPaths(repository.primaryRoot);
    if (before.directory !== expected)
      fail('SDC-PRIVATE-PATH','continuity initializer parent binding');
    // The original physical/private resolver creates directories only: no key,
    // binding, descriptor, runtime owner, selected State or authority journal.
    const after = privateCleanupPaths(repository.primaryRoot,{create:true});
    if (after.directory !== before.directory)
      fail('SDC-PRIVATE-PATH','continuity initializer parent changed');
    return Object.freeze({status:'prepared'});
  });
}

export function createOnboardingContinuityAuthorityProducerPort({repository}) {
  const actualRepository=continuityAuthorityRepository(repository);
  const cacheKey=canonicalSha256(actualRepository);
  const retained=continuityAuthorityPortCache.get(cacheKey);
  if (retained) return retained;
  if (continuityAuthorityPortCache.size>=4096)
    fail('SDC-AUTHORITY-UNAVAILABLE','continuity source port lifetime bound');
  const data = {repository:actualRepository,assurance:'physical-readback',
    legacy:new Map(),operations:new Set()};
  let port;
  const methods = {
    readAssurance:()=>data.assurance,
    observeSharedStateWrite:(handle,context)=>continuityObserveSharedStateWrite(data,port,methods,handle,context),
    verifySharedStateWrite:(handle,witness)=>continuityVerifySharedStateWrite(data,port,methods,handle,witness),
    refreshSharedStateMemberRefs:(handle,witness,context)=>continuityRefreshSharedStateMemberRefs(data,port,handle,witness,context),
    observeCompanionStateWrite:(handle,context)=>continuityObserveCompanionStateWrite(data,port,methods,handle,context),
    verifyCompanionStateWrite:(handle,witness)=>continuityVerifyCompanionStateWrite(data,port,methods,handle,witness),
    refreshCompanionStateMemberRefs:(handle,witness,context)=>continuityRefreshCompanionStateMemberRefs(data,port,handle,witness,context),
    readBaseline:()=>{
      const snapshot = continuityAuthoritySnapshot(data.repository);
      continuityRefreshCompanionKnownOwnerAlias(data,snapshot);
      const tuple = snapshot.observed.orphanBinding?.sessionCleanup ?? snapshot.observed.sessionCleanup;
      const legacyOperations = [];
      if (tuple !== null && tuple !== undefined) {
        const key = continuitySharedStateLogicalLegacyKey(data,snapshot,tuple);
        let handle = data.legacy.get(key);
        if (!handle) {
          handle = continuityAuthorityHandle(continuityAuthorityOperations,{data,legacy:true,
            association:{state:'unbound',target:null},phase:'armed',bindingSha256:key,journalRefs:[]});
          continuityAuthorityOperations.get(handle).operationHandle=handle;
          data.legacy.set(key,handle);
        }
        legacyOperations.push(handle); // Unknown requester origin is held globally, never absent.
      }
      return {memberships:snapshot.memberships,legacyOperations};
    },
    reconcile:()=>continuityAuthoritySnapshot(data.repository).memberships,
    observeOperation:handle=>{
      const operation = continuityAuthorityOperation(data,handle);
      continuityAuthorityCheckJournals(operation);
      const snapshot = continuityAuthoritySnapshot(data.repository);
      return {association:operation.association,kinds:['continuity'],phase:operation.phase,
        bindingSha256:operation.bindingSha256,sourceFacts:snapshot.sourceFacts};
    },
    observeTerminal:handle=>{
      const terminal = continuityAuthorityTerminals.get(handle);
      if (!terminal || terminal.operation.data !== data)
        fail('SDC-AUTHORITY-CAS','unowned continuity terminal');
      continuityAuthorityCheckJournals(terminal.operation);
      const snapshot = continuityAuthoritySnapshot(data.repository);
      if (snapshot.observed.sessionCleanup !== null || snapshot.observed.orphanBinding
          || !continuityAuthorityEqual(snapshot.memberships,terminal.memberships))
        fail('SDC-AUTHORITY-HELD','continuity terminal readback changed');
      return {terminal:'continuity-released',sourceFacts:snapshot.sourceFacts};
    },
    prepareOperation:({requesterHandle,entry,input})=>{
      try {
        if (entry !== 'bind' || !exactKeys(input,new Set(['expectedStateSha256','expectedRevision'])))
          fail('SDC-AUTHORITY-UNAVAILABLE','unsupported continuity operation');
        if (data.legacy.size>=4096) fail('SDC-AUTHORITY-UNAVAILABLE','continuity legacy lifetime bound');
        const requester = continuityAuthorityCurrent(data,requesterHandle);
        const snapshot = continuityAuthoritySnapshot(data.repository);
        if (snapshot.observed.stateSha256 !== input.expectedStateSha256
            || snapshot.observed.revision !== input.expectedRevision || snapshot.observed.sessionCleanup !== null
            || snapshot.observed.orphanBinding)
          fail('SDC-AUTHORITY-CAS','continuity bind preimage changed');
        const target = {sessionId:requester.sessionId,descriptorSha256:requester.descriptorSha256,
          ownerNonceSha256:requester.ownerNonceSha256};
        const operation = {data,id:randomBytes(16).toString('hex'),requesterHandle,input:{...input},
          association:{state:'bound',target},phase:'reserved',journalRefs:[],
          bindingSha256:canonicalSha256({repository:data.repository,target,input,sourceFacts:snapshot.sourceFacts})};
        const operationHandle = continuityAuthorityHandle(continuityAuthorityOperations,operation);
        operation.operationHandle = operationHandle;
        retainContinuityControlledOwnerInvocation(operation);
        data.operations.add(operation);
        data.assurance = requester.assurance;
        return {status:'prepared',operationHandle,inputSha256:canonicalSha256(input),preimageRefs:[]};
      } catch (error) { return continuityAuthorityUnavailable(error.code ?? 'continuity-prepare'); }
    },
    executeOperation:async request=>continuityAuthorityExecute(data,port,request),
    executeAfkTransaction:request=>continuityExecuteAfkTransaction(data,port,request),
    executeCompanionOperation:request=>continuityExecuteCompanionOperation(data,port,request),
    finishOperation:async request=>continuityAuthorityFinish(data,port,request),
    recoverOperation:({memberRef})=>{
      try {
        const operation = [...data.operations].find(value=>value.memberPath===memberRef?.path);
        if (!operation || !operation.executionHandle)
          fail('SDC-AUTHORITY-UNAVAILABLE','continuity current execution recovery required');
        continuityAuthorityCurrent(data,operation.requesterHandle);
        continuityAuthorityCheckJournals(operation);
        const path = join(data.repository.commonDir,memberRef.path.slice(5));
        if (!continuityAuthorityEqual(memberRef,continuityAuthorityPrivateRef(data.repository,path)))
          fail('SDC-AUTHORITY-CAS','continuity recovery member ref changed');
        const member = JSON.parse(assertPrivateCleanupFile(path,'continuity member'));
        const observed = methods.observeOperation(operation.operationHandle);
        if (member.producerId !== 'onboarding-continuity' || member.phase !== observed.phase
            || member.bindingSha256 !== observed.bindingSha256
            || !continuityAuthorityEqual(member.association,observed.association)
            || !continuityAuthorityEqual(member.sourceFacts,observed.sourceFacts))
          fail('SDC-AUTHORITY-CAS','continuity recovery owner binding changed');
        return {status:'recovered',operationHandle:operation.operationHandle,executionHandle:operation.executionHandle};
      } catch (error) { return continuityAuthorityUnavailable(error.code ?? 'continuity-recover'); }
    },
  };
  port = Object.freeze(methods); continuityAuthorityPorts.set(port,data);
  continuityAuthorityPortCache.set(cacheKey,port); return port;
}
export function isOwnedOnboardingContinuityAuthorityProducerPort(port,{repository}) {
  const data = continuityAuthorityPorts.get(port);
  return Boolean(data && continuityAuthorityEqual(data.repository,continuityAuthorityRepository(repository)));
}

function continuityAuthorityExecute(data,port,{operationHandle,memberHandle,expectedMemberRef}) {
      try {
        const operation = continuityAuthorityOperation(data,operationHandle);
        if (operation.legacy || operation.phase !== 'reserved') fail('SDC-AUTHORITY-CAS','continuity operation phase');
        continuityAuthorityCurrent(data,operation.requesterHandle);
        return withSessionAuthorityBoundary({repository:data.repository},boundary=>{
          const currentMember=advanceSessionAuthorityMember({boundary,producerPort:port,memberHandle,expectedMemberRef,operationHandle});
          operation.expectedMemberRef=currentMember.memberRef;
          operation.memberPath=currentMember.memberRef.path;
          const tuple = {sessionId:operation.association.target.sessionId,
            descriptorSha256:operation.association.target.descriptorSha256};
          const ownerResult = continuityAuthorityWriterRun(operation,'bind',()=>bindOnboardingSessionCleanup({rootDir:data.repository.primaryRoot,
            ...operation.input,sessionCleanup:tuple}));
          const observed = observeSessionCleanupState(data.repository.primaryRoot);
          if (!continuityAuthorityEqual(observed.sessionCleanup,tuple))
            fail('SDC-AUTHORITY-CAS','continuity bind writer readback');
          continuityAuthorityJournal(operation,'execution',{ownerResult,stateSha256:observed.stateSha256});
          operation.phase = 'armed'; operation.memberHandle = memberHandle;
          operation.memberPath = expectedMemberRef.path;
          const executionHandle = continuityAuthorityHandle(continuityAuthorityExecutions,{operation,ownerResult});
          operation.executionHandle = executionHandle;
          continuityJoinActualBoundCleanupOwner(operation,executionHandle);
          const armedMember=advanceSessionAuthorityMember({boundary,producerPort:port,memberHandle,expectedMemberRef,operationHandle});
          operation.expectedMemberRef=armedMember.memberRef;
          return {status:'executed',code:null,executionHandle,ownerResult,sourceRefs:[...operation.journalRefs]};
        });
      } catch (error) { return {status:'unavailable',code:error.code ?? 'SDC-AUTHORITY-UNAVAILABLE',executionHandle:null,ownerResult:null,sourceRefs:[]}; }
}
function continuityAuthorityFinish(data,port,{operationHandle,executionHandle,entry,input,expectedMemberRef}) {
      try {
        const operation = continuityAuthorityOperation(data,operationHandle);
        if (continuityAuthorityExecutions.get(executionHandle)?.operation !== operation
            || operation.executionHandle !== executionHandle || operation.phase !== 'armed'
            || entry !== 'release' || !exactKeys(input,new Set(['expectedStateSha256','expectedRevision'])))
          fail('SDC-AUTHORITY-CAS','continuity terminal origin or entry');
        continuityAuthorityCurrent(data,operation.requesterHandle);
        return withSessionAuthorityBoundary({repository:data.repository},boundary=>{
          const currentMember=advanceSessionAuthorityMember({boundary,producerPort:port,memberHandle:operation.memberHandle,
            expectedMemberRef,operationHandle});
          operation.expectedMemberRef=currentMember.memberRef;
          const tuple = {sessionId:operation.association.target.sessionId,
            descriptorSha256:operation.association.target.descriptorSha256};
          const ownerResult = continuityAuthorityWriterRun(operation,'release',()=>releaseOnboardingSessionCleanup({rootDir:data.repository.primaryRoot,...input,sessionCleanup:tuple}));
          operation.terminalOwnerResult = ownerResult;
          const snapshot = continuityAuthoritySnapshot(data.repository);
          if (snapshot.observed.sessionCleanup !== null || snapshot.observed.orphanBinding)
            fail('SDC-AUTHORITY-HELD','continuity writer retained binding');
          continuityAuthorityJournal(operation,'terminal',{ownerResult,stateSha256:snapshot.observed.stateSha256});
          operation.phase = 'terminal-observed';
          const terminalHandle = continuityAuthorityHandle(continuityAuthorityTerminals,
            {operation,memberships:continuityAuthoritySnapshot(data.repository).memberships});
          const terminalMember=advanceSessionAuthorityMember({boundary,producerPort:port,memberHandle:operation.memberHandle,
            expectedMemberRef,operationHandle});
          operation.expectedMemberRef=terminalMember.memberRef;
          return {status:'observed',terminalHandle,sourceRefs:[...operation.journalRefs]};
        });
      } catch (error) { return continuityAuthorityUnavailable(error.code ?? 'continuity-finish'); }
}
// Existing synchronous writer entrypoints participate in the same owning
// reservation/effect implementation as the async producer interface.
const continuityAuthorityWriterContext = new AsyncLocalStorage();
const continuityAuthorityDirectBindings = new Map();
function continuityAuthorityWriterRun(operation,entry,callback) {
  return continuityAuthorityWriterContext.run({operation,entry},callback);
}
function continuityAuthorityInternalWriter(request,entry) {
  const active=continuityAuthorityWriterContext.getStore();
  if(!active)return null;
  const operation=active.operation;
  if(active.entry!==entry||operation.legacy||!operation.operationHandle
      ||continuityAuthorityOperations.get(operation.operationHandle)!==operation
      ||resolve(request.rootDir)!==operation.data.repository.primaryRoot
      ||!continuityAuthorityEqual(request.sessionCleanup,{sessionId:operation.association.target.sessionId,
        descriptorSha256:operation.association.target.descriptorSha256}))
    fail('SDC-AUTHORITY-CAS','continuity source writer context mismatch');
  continuityAuthorityCurrent(operation.data,operation.requesterHandle);
  return active;
}
function continuityAuthorityDirectKey(repository,tuple) {
  return canonicalSha256({primaryRoot:repository.primaryRoot,commonDir:repository.commonDir,tuple});
}
function continuityAuthorityReadMemberRef(repository,original) {
  if(!original||typeof original.path!=='string'||!original.path.startsWith('.git/agent-pipeline/session-authority/members/onboarding-continuity/'))
    fail('SDC-AUTHORITY-CAS','continuity member path');
  return continuityAuthorityPrivateRef(repository,join(repository.commonDir,original.path.slice(5)));
}
export function bindOnboardingSessionCleanup(request={}) {
  if(continuityAuthorityInternalWriter(request,'bind'))return bindOnboardingSessionCleanupInternal(request);
  const repository=continuityAuthorityRepository(inspectSignedDescriptorCustodyRepository(request.rootDir));
  const context=readSourceOwnedAuthorityContext({repository});
  if(context.status!=='bound')fail('SDC-AUTHORITY-UNAVAILABLE','continuity current invocation required before binding');
  const port=createOnboardingContinuityAuthorityProducerPort({repository}),data=continuityAuthorityPorts.get(port);
  const requester=continuityAuthorityCurrent(data,context.requesterHandle);
  const tuple={sessionId:requester.sessionId,descriptorSha256:requester.descriptorSha256};
  if(!continuityAuthorityEqual(request.sessionCleanup,tuple))fail('SDC-AUTHORITY-CAS','continuity caller tuple is not current owner');
  const prepared=port.prepareOperation({requesterHandle:context.requesterHandle,entry:'bind',
    input:{expectedStateSha256:request.expectedStateSha256,expectedRevision:request.expectedRevision}});
  if(prepared.status!=='prepared')fail(prepared.code,'continuity owner preparation refused');
  const reserved=withSessionAuthorityBoundary({repository},boundary=>reserveSessionAuthorityMember({boundary,
    producerPort:port,association:port.observeOperation(prepared.operationHandle).association,
    operationHandle:prepared.operationHandle}));
  const executed=continuityAuthorityExecute(data,port,{operationHandle:prepared.operationHandle,
    memberHandle:reserved.memberHandle,expectedMemberRef:reserved.memberRef});
  if(executed.status!=='executed')fail(executed.code,'continuity owning bind failed after reservation');
  const ownedBinding={repository,port,data,prepared,reserved:{...reserved,
    memberRef:continuityAuthorityOperations.get(prepared.operationHandle).expectedMemberRef},executed};
  continuityAuthorityDirectBindings.set(continuityAuthorityDirectKey(repository,tuple),ownedBinding);
  captureContinuityVerificationOwner(ownedBinding);
  return executed.ownerResult;
}
export function releaseOnboardingSessionCleanup(request={}) {
  if(continuityAuthorityInternalWriter(request,'release'))return releaseOnboardingSessionCleanupInternal(request);
  const repository=continuityAuthorityRepository(inspectSignedDescriptorCustodyRepository(request.rootDir));
  const owned=continuityAuthorityDirectBindings.get(continuityAuthorityDirectKey(repository,request.sessionCleanup));
  if(!owned||!continuityAuthorityEqual(repository,owned.repository))
    fail('SDC-AUTHORITY-UNAVAILABLE','continuity owning execution recovery required before release');
  const memberRef=continuityAuthorityReadMemberRef(repository,owned.reserved.memberRef);
  const terminal=continuityAuthorityFinish(owned.data,owned.port,{operationHandle:owned.prepared.operationHandle,
    executionHandle:owned.executed.executionHandle,entry:'release',
    input:{expectedStateSha256:request.expectedStateSha256,expectedRevision:request.expectedRevision},expectedMemberRef:memberRef});
  if(terminal.status!=='observed')fail(terminal.code,'continuity owning release failed');
  const operation=continuityAuthorityOperations.get(owned.prepared.operationHandle);
  withSessionAuthorityBoundary({repository},boundary=>releaseSessionAuthorityMember({boundary,producerPort:owned.port,
    memberHandle:owned.reserved.memberHandle,expectedMemberRef:continuityAuthorityReadMemberRef(repository,memberRef),
    terminalHandle:terminal.terminalHandle}));
  continuityAuthorityDirectBindings.delete(continuityAuthorityDirectKey(repository,request.sessionCleanup));
  return operation.terminalOwnerResult;
}

// Source-owned selected-State bookkeeping. No public constructor mints a witness.
const continuitySharedStateWitnesses = new WeakMap();
const continuityAuthorityPortCache = new Map();
const continuitySharedStateEntries = new Set([
  'state.reopen-design','state.seal-plan-approval','state.set-gate-estimate',
  'state.revoke-plan','state.set-phase-no-calibration',
]);

function continuitySharedStateImage(fact) {
  const {sha256,size,identity,semanticSha256} = fact;
  return {sha256,size,identity,semanticSha256};
}
function continuitySharedStateSelected(snapshot,selectedPathSha256,image) {
  const selected = snapshot.sourceFacts.filter(fact=>fact.pathSha256===selectedPathSha256);
  if (selected.length!==1 || selected[0].namespaceId!=='selected-state'
      || !continuityAuthorityEqual(continuitySharedStateImage(selected[0]),image))
    fail('SDC-AUTHORITY-CAS','continuity selected-State source seal mismatch');
}
function continuitySharedStateCleanupIdentity(snapshot) {
  const observed=snapshot.observed;
  return {
    root:observed.root,path:observed.path,neutral:observed.neutral,mode:observed.mode,
    revision:observed.revision,activeFeatureId:observed.activeFeatureId,
    sessionCleanup:observed.sessionCleanup ?? null,
    orphanBinding:observed.orphanBinding ?? null,discardedEntry:observed.discardedEntry ?? null,
    releaseProof:observed.releaseProof ?? null,releaseReceipt:observed.releaseReceipt ?? null,
    released:observed.released ?? false,privateBinding:observed.privateBinding ?? null,
    continuity:observed.state.continuity ?? null,
    closedFeatures:observed.state.closedFeatures ?? null,
    discardedFeatures:observed.state.discardedFeatures ?? null,
    cleanupReleases:observed.state.cleanupReleases ?? null,
    binding:snapshot.binding,release:snapshot.release,
  };
}
function continuitySharedStateLogicalLegacyKey(data,snapshot,tuple) {
  return canonicalSha256({repository:data.repository,tuple,
    cleanupIdentity:continuitySharedStateCleanupIdentity(snapshot),
    sourceFacts:snapshot.sourceFacts.filter(fact=>fact.namespaceId!=='selected-state')});
}
function continuitySharedStateLegacyDigest(methods,pathSha256) {
  const observations=methods.readBaseline().legacyOperations.map(handle=>methods.observeOperation(handle))
    .map(observed=>({...observed,sourceFacts:observed.sourceFacts.filter(fact=>fact.pathSha256!==pathSha256)}))
    .map(canonicalJson).sort();
  return canonicalSha256(observations);
}
function continuitySharedStateNonselected(before,after,pathSha256) {
  if (before.length!==after.length) fail('SDC-AUTHORITY-CAS','continuity namespace closure changed');
  for (const prior of before) {
    const next=after.find(value=>value.namespaceId===prior.namespaceId);
    if (!next || next.rootSha256!==prior.rootSha256 || next.entryCount!==prior.entryCount
        || !continuityAuthorityEqual(prior.sourceFacts.filter(fact=>fact.pathSha256!==pathSha256),
          next.sourceFacts.filter(fact=>fact.pathSha256!==pathSha256)))
      fail('SDC-AUTHORITY-CAS','continuity nonselected namespace changed');
    if (!prior.sourceFacts.some(fact=>fact.pathSha256===pathSha256)
        && !continuityAuthorityEqual(prior,next))
      fail('SDC-AUTHORITY-CAS','continuity unaffected namespace changed');
  }
}
function continuitySharedStateRecord(data,ref) {
  if (!continuityAuthorityEqual(ref,continuityAuthorityPrivateRef(data.repository,
      join(data.repository.commonDir,ref.path.slice(5)))))
    fail('SDC-AUTHORITY-CAS','continuity indexed record changed');
  const raw=assertPrivateCleanupFile(join(data.repository.commonDir,ref.path.slice(5)),
    'continuity indexed authority record');
  if (raw.length!==ref.size || createHash('sha256').update(raw).digest('hex')!==ref.sha256)
    fail('SDC-AUTHORITY-CAS','continuity indexed record bytes changed');
  let record;
  try { record=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw)); }
  catch { fail('SDC-AUTHORITY-CAS','continuity indexed record malformed'); }
  if (!continuityAuthorityEqual(ref,continuityAuthorityPrivateRef(data.repository,
      join(data.repository.commonDir,ref.path.slice(5)))))
    fail('SDC-AUTHORITY-CAS','continuity indexed record readback changed');
  return record;
}
function continuitySharedStatePrivateOperation(data,methods,member,memberRef) {
  const possible=[...new Set([...data.operations,...[...data.legacy.values()]
    .map(handle=>continuityAuthorityOperations.get(handle))])];
  const matches=possible.filter(operation=>{
    if (!operation || operation.data!==data || operation.phase==='terminal-observed') return false;
    const handle=operation.operationHandle;
    if (!handle || continuityAuthorityOperations.get(handle)!==operation) return false;
    const observed=methods.observeOperation(handle);
    return continuityAuthorityEqual(observed,{association:member.association,kinds:member.kinds,
      phase:member.phase,bindingSha256:member.bindingSha256,sourceFacts:member.sourceFacts});
  });
  if (matches.length!==1) fail('SDC-AUTHORITY-UNAVAILABLE','continuity live operation unavailable or ambiguous');
  const operation=matches[0];
  if (operation.expectedMemberRef && !continuityAuthorityEqual(operation.expectedMemberRef,memberRef))
    fail('SDC-AUTHORITY-CAS','continuity private live member pin changed');
  if (!operation.legacy && operation.memberPath!==memberRef.path
      && !(operation.phase==='reserved' && operation.memberPath===undefined))
    fail('SDC-AUTHORITY-CAS','continuity owning member path changed');
  return operation;
}
function continuityObserveSharedStateWrite(data,port,methods,handle,context) {
  if (!exactKeys(context,new Set(['boundary','producerRecord','memberRecords','releaseRecords']))
      || !isOwnedStateAuthorityWriteHandle(handle,{repository:data.repository}))
    fail('SDC-AUTHORITY-UNAVAILABLE','continuity State witness requires actual source owner');
  continuityAuthorityRepository(data.repository);
  const plan=observeStateAuthorityWrite(handle);
  if (!continuitySharedStateEntries.has(plan.entry)
      || plan.repositorySha256!==canonicalSha256({primaryRoot:data.repository.primaryRoot,commonDir:data.repository.commonDir})
      || !plan.affectedProducerIds.includes('onboarding-continuity'))
    fail('SDC-AUTHORITY-UNAVAILABLE','continuity State entry not admitted');
  const producer=inspectSourceOwnedSessionAuthorityProducerRecord({boundary:context.boundary,producerPort:port});
  if (!continuityAuthorityEqual(producer.record,context.producerRecord))
    fail('SDC-AUTHORITY-CAS','continuity producer record is not current');
  const members=producer.record.members.map(index=>inspectSourceOwnedSessionAuthorityMemberRecord({
    boundary:context.boundary,producerPort:port,memberRef:index.memberRef}));
  if (!continuityAuthorityEqual(members.map(value=>value.record),context.memberRecords)
      || !continuityAuthorityEqual(members.filter(value=>value.releaseRecord!==null)
        .map(value=>value.releaseRecord),context.releaseRecords))
    fail('SDC-AUTHORITY-CAS','continuity member or release records are not current');
  const snapshot=continuityAuthoritySnapshot(data.repository);
  continuitySharedStateSelected(snapshot,plan.selectedPathSha256,plan.preimage);
  if (!snapshot.observed.neutral || snapshot.observed.mode!=='active'
      || snapshot.observed.orphanBinding || snapshot.release.status!=='absent'
      || members.some(value=>value.record.phase==='released'||value.record.phase==='terminal-observed'))
    fail('SDC-AUTHORITY-UNAVAILABLE','continuity historical authority requires owning lifecycle transition');
  if (!continuityAuthorityEqual(snapshot.memberships,producer.record.baseline))
    fail('SDC-AUTHORITY-CAS','continuity preexisting baseline drift');
  // Populate only genuine source-created legacy handles, then identify each
  // actual indexed live operation. No disk record becomes a new operation.
  methods.readBaseline();
  const live=members.map(member=>({memberRef:member.memberRef,record:structuredClone(member.record),
    operation:continuitySharedStatePrivateOperation(data,methods,member.record,member.memberRef)}));
  if (new Set(live.map(value=>value.operation)).size!==live.length)
    fail('SDC-AUTHORITY-CAS','continuity duplicate live operation incidence');
  const identity=continuitySharedStateCleanupIdentity(snapshot);
  const legacyOperationsSha256=continuitySharedStateLegacyDigest(methods,plan.selectedPathSha256);
  for (const item of live) {
    item.operation.expectedMemberRef=structuredClone(item.memberRef);
    item.operation.memberPath=item.memberRef.path;
  }
  const witness=Object.freeze({});
  continuitySharedStateWitnesses.set(witness,{data,port,handle,boundary:context.boundary,
    plan:structuredClone(plan),producer,live,identity,memberships:snapshot.memberships,
    legacyOperationsSha256,stage:'prepared'});
  return witness;
}
function continuityVerifySharedStateWrite(data,port,methods,handle,witness) {
  const owned=continuitySharedStateWitnesses.get(witness);
  if (!owned || owned.data!==data || owned.port!==port || owned.handle!==handle
      || !['prepared','verified'].includes(owned.stage)
      || !isOwnedStateAuthorityWriteHandle(handle,{repository:data.repository}))
    fail('SDC-AUTHORITY-CAS','unowned continuity State witness');
  continuityAuthorityRepository(data.repository);
  const terminal=observeStateAuthorityWriteTerminal(handle);
  if (terminal.entry!==owned.plan.entry || terminal.selectedPathSha256!==owned.plan.selectedPathSha256
      || !continuityAuthorityEqual(terminal.preimage,owned.plan.preimage))
    fail('SDC-AUTHORITY-CAS','continuity State terminal origin mismatch');
  const snapshot=continuityAuthoritySnapshot(data.repository);
  continuitySharedStateSelected(snapshot,owned.plan.selectedPathSha256,terminal.postimage);
  continuitySharedStateNonselected(owned.memberships,snapshot.memberships,owned.plan.selectedPathSha256);
  if (!continuityAuthorityEqual(continuitySharedStateCleanupIdentity(snapshot),owned.identity)
      || !continuityAuthorityEqual(continuitySharedStateRecord(data,owned.producer.producerRef),owned.producer.record))
    fail('SDC-AUTHORITY-CAS','continuity cleanup authority or producer identity changed');
  const memberObservations=owned.live.map(item=>{
    if (!continuityAuthorityEqual(item.operation.expectedMemberRef,item.memberRef)
        || !continuityAuthorityEqual(continuitySharedStateRecord(data,item.memberRef),item.record))
      fail('SDC-AUTHORITY-CAS','continuity live member identity changed');
    const observed=methods.observeOperation(item.operation.operationHandle);
    if (!continuityAuthorityEqual({association:observed.association,kinds:observed.kinds,
        phase:observed.phase,bindingSha256:observed.bindingSha256},
      {association:item.record.association,kinds:item.record.kinds,
        phase:item.record.phase,bindingSha256:item.record.bindingSha256})
        || !continuityAuthorityEqual(observed.sourceFacts.filter(fact=>fact.pathSha256!==owned.plan.selectedPathSha256),
          item.record.sourceFacts.filter(fact=>fact.pathSha256!==owned.plan.selectedPathSha256)))
      fail('SDC-AUTHORITY-CAS','continuity original live operation changed');
    return {memberRef:item.memberRef,...observed};
  });
  const legacyOperationsSha256=continuitySharedStateLegacyDigest(methods,owned.plan.selectedPathSha256);
  if (legacyOperationsSha256!==owned.legacyOperationsSha256)
    fail('SDC-AUTHORITY-CAS','continuity legacy operation identity changed');
  owned.postimage=structuredClone(terminal.postimage);owned.stage='verified';
  return {memberships:snapshot.memberships,memberObservations,legacyOperationsSha256};
}
function continuityRefreshSharedStateMemberRefs(data,port,handle,witness,{boundary}={}) {
  const owned=continuitySharedStateWitnesses.get(witness);
  if (!owned || owned.data!==data || owned.port!==port || owned.handle!==handle
      || owned.boundary!==boundary || owned.stage!=='verified')
    fail('SDC-AUTHORITY-CAS','continuity State refresh witness unavailable');
  owned.stage='refreshing';
  const refreshed=inspectSourceOwnedSessionAuthorityStateRefresh({boundary,producerPort:port,
    stateWriteHandle:handle,ownerWitness:witness});
  const updates=refreshed.members.map(change=>{
    const item=owned.live.find(value=>continuityAuthorityEqual(value.memberRef,change.previousMemberRef));
    if (!item || item.record.memberId!==change.memberId || item.record.memberGeneration!==change.memberGeneration
        || !continuityAuthorityEqual(item.operation.expectedMemberRef,item.memberRef))
      fail('SDC-AUTHORITY-CAS','continuity refresh is not original live member');
    const actual=inspectSourceOwnedSessionAuthorityMemberRecord({boundary,producerPort:port,memberRef:change.memberRef});
    const {sourceFacts,revision,updatedAt,...identity}=actual.record;
    const {sourceFacts:priorFacts,revision:priorRevision,updatedAt:priorUpdatedAt,...priorIdentity}=item.record;
    if (actual.releaseRef!==null || actual.releaseRecord!==null
        || !continuityAuthorityEqual(identity,priorIdentity) || revision!==priorRevision+1
        || !continuityAuthorityEqual(sourceFacts.filter(fact=>fact.pathSha256!==owned.plan.selectedPathSha256),
          priorFacts.filter(fact=>fact.pathSha256!==owned.plan.selectedPathSha256)))
      fail('SDC-AUTHORITY-CAS','continuity refreshed authority identity changed');
    const selected=sourceFacts.filter(fact=>fact.pathSha256===owned.plan.selectedPathSha256);
    if (selected.length!==1 || selected[0].namespaceId!=='selected-state'
        || !continuityAuthorityEqual(continuitySharedStateImage(selected[0]),owned.postimage))
      fail('SDC-AUTHORITY-CAS','continuity refreshed selected State seal changed');
    const directs=[...continuityAuthorityDirectBindings.values()].filter(direct=>
      direct.data===data && direct.prepared.operationHandle===item.operation.operationHandle);
    for (const direct of directs) {
      if (!continuityAuthorityEqual(direct.reserved.memberRef,change.previousMemberRef))
        fail('SDC-AUTHORITY-CAS','continuity direct reservation predecessor changed');
    }
    return {item,change,directs};
  });
  if (new Set(updates.map(value=>value.item)).size!==updates.length)
    fail('SDC-AUTHORITY-CAS','continuity duplicate ref refresh');
  for (const {item,change,directs} of updates) {
    item.operation.expectedMemberRef=structuredClone(change.memberRef);
    for (const direct of directs) {
      direct.reserved={...direct.reserved,memberRef:structuredClone(change.memberRef)};
    }
  }
  owned.stage='refreshed';
}

// The real bind writer has already created this tuple under its owning source
// operation. Join that actual lifetime rather than inventing a second legacy
// operation for the same newly written private binding.
function continuityJoinActualBoundCleanupOwner(operation,executionHandle) {
  const data=operation.data;
  if (operation.legacy || operation.phase!=='armed'
      || continuityAuthorityOperations.get(operation.operationHandle)!==operation
      || continuityAuthorityExecutions.get(executionHandle)?.operation!==operation
      || operation.executionHandle!==executionHandle)
    fail('SDC-AUTHORITY-CAS','actual continuity bind execution required');
  const requester=continuityAuthorityCurrent(data,operation.requesterHandle);
  const target=operation.association.target;
  if (operation.association.state!=='bound'
      || !continuityAuthorityEqual(target,{sessionId:requester.sessionId,
        descriptorSha256:requester.descriptorSha256,ownerNonceSha256:requester.ownerNonceSha256}))
    fail('SDC-AUTHORITY-CAS','actual continuity bind requester changed');
  continuityAuthorityCheckJournals(operation);
  const snapshot=continuityAuthoritySnapshot(data.repository);
  const tuple={sessionId:target.sessionId,descriptorSha256:target.descriptorSha256};
  if (!continuityAuthorityEqual(snapshot.observed.sessionCleanup,tuple)
      || !snapshot.observed.neutral || snapshot.observed.mode!=='active'
      || snapshot.observed.orphanBinding || snapshot.release.status!=='absent')
    fail('SDC-AUTHORITY-CAS','actual private continuity bind readback required');
  const member=continuitySharedStateRecord(data,operation.expectedMemberRef);
  if (operation.memberPath!==operation.expectedMemberRef.path
      || member.producerId!=='onboarding-continuity'
      || !['reserved','armed'].includes(member.phase)
      || member.bindingSha256!==operation.bindingSha256
      || !continuityAuthorityEqual(member.kinds,['continuity'])
      || !continuityAuthorityEqual(member.association,operation.association))
    fail('SDC-AUTHORITY-CAS','actual original continuity member required');
  const key=continuitySharedStateLogicalLegacyKey(data,snapshot,tuple);
  const prior=data.legacy.get(key);
  if (prior && prior!==operation.operationHandle)
    fail('SDC-AUTHORITY-CAS','existing continuity legacy lifetime differs');
  if (!prior && data.legacy.size>=4096)
    fail('SDC-AUTHORITY-UNAVAILABLE','continuity legacy lifetime bound');
  data.legacy.set(key,operation.operationHandle);
}

// A companion request is routed only from the actual I03 constructor's owning
// operation. A context object supplied by a caller never enters this WeakMap.
const continuityCompanionContexts = new WeakMap();
const continuityCompanionContextScope = new AsyncLocalStorage();
const continuityAfkInvocationScope = new AsyncLocalStorage();
const continuityAfkAdmissions = new WeakMap();
const continuityAfkAdmissionByOperation = new WeakMap();
const continuityAfkProjectionForState = new WeakMap();
const continuityCompanionStateWriterLockWitnesses = new WeakMap();
// Only the authentic synchronous member-ref refresh may populate this map.
// The actual context key never leaves its owning Source and is cleared finally.
const continuityCompanionRefRefreshObservations = new WeakMap();
const CONTINUITY_COMPANION_ENTRIES = new Set([
  'discard-feature','set-feature','continuity-init','submit-plan','present-plan',
  'afk-project',
  'approve-plan','materialize-architecture','continuity-result-bootstrap-plan',
  'continuity-result-bootstrap-apply','continuity-result-rebind-plan',
  'continuity-result-rebind-apply','continuity-result-close-plan','continuity-result-close-apply',
  'close-feature',
]);

function continuityCompanionCurrent(value,{repository,entry},refreshObservation=null) {
  if (!value || value.entry !== entry || !CONTINUITY_COMPANION_ENTRIES.has(entry)
      || !continuityAuthorityEqual(value.operation.data.repository,repository)
      || continuityCompanionContextScope.getStore() !== value.contextHandle)
    fail('SDC-AUTHORITY-UNAVAILABLE','unowned continuity companion context');
  const operation=continuityAuthorityOperation(value.operation.data,value.operation.operationHandle);
  if (operation !== value.operation || operation.phase !== 'armed'
      || continuityAuthorityExecutions.get(value.executionHandle)?.operation !== operation
      || operation.executionHandle !== value.executionHandle
      || !continuityAuthorityEqual(operation.expectedMemberRef,value.expectedMemberRef))
    fail('SDC-AUTHORITY-CAS','continuity companion original owner changed');
  continuityAuthorityCurrent(operation.data,operation.requesterHandle);
  continuityAuthorityCheckJournals(operation);
  let physicalMemberRef=value.expectedMemberRef;
  if (refreshObservation !== null) {
    const owned=continuityCompanionWitnesses.get(refreshObservation.witness);
    const lockWitness=continuityCompanionStateWriterLockWitnesses.get(value.contextHandle);
    if (continuityCompanionRefRefreshObservations.get(value.contextHandle)!==refreshObservation
        || !owned || owned.stage!=='refreshing' || owned.value!==value
        || owned.data!==operation.data || owned.data!==refreshObservation.data
        || owned.port!==refreshObservation.port || owned.handle!==refreshObservation.handle
        || owned.boundary!==refreshObservation.boundary || owned.contextHandle!==value.contextHandle
        || refreshObservation.contextHandle!==value.contextHandle || refreshObservation.value!==value
        || refreshObservation.operation!==operation || operation.companionExecuting!==true
        || entry!=='approve-plan' || !lockWitness || lockWitness.contextHandle!==value.contextHandle
        || lockWitness.boundary!==owned.boundary || !continuityAuthorityEqual(lockWitness.repository,repository)
        || !continuityAuthorityEqual(refreshObservation.previousMemberRef,value.expectedMemberRef)
        || !continuityAuthorityEqual(refreshObservation.previousMemberRef,operation.expectedMemberRef)
        || refreshObservation.memberRef.path!==refreshObservation.previousMemberRef.path)
      fail('SDC-AUTHORITY-CAS','unowned continuity member refresh observation');
    physicalMemberRef=refreshObservation.memberRef;
  }
  const path=join(repository.commonDir,physicalMemberRef.path.slice(5));
  if (!continuityAuthorityEqual(physicalMemberRef,continuityAuthorityPrivateRef(repository,path)))
    fail('SDC-AUTHORITY-CAS','continuity companion original member changed');
  const member=JSON.parse(assertPrivateCleanupFile(path,'continuity companion member'));
  if (member.producerId !== 'onboarding-continuity' || member.phase !== operation.phase
      || member.bindingSha256 !== operation.bindingSha256
      || !continuityAuthorityEqual(member.association,operation.association))
    fail('SDC-AUTHORITY-CAS','continuity companion member ownership changed');
  return value;
}

export function readSourceOwnedOnboardingContinuityCompanionContext({repository,entry}) {
  const handle=continuityCompanionContextScope.getStore();
  if (!handle) return null;
  continuityCompanionCurrent(continuityCompanionContexts.get(handle),{repository,entry});
  return handle;
}

export function isOwnedOnboardingContinuityCompanionContextHandle(contextHandle,{repository,entry}) {
  try {
    continuityCompanionCurrent(continuityCompanionContexts.get(contextHandle),{repository,entry});
    return true;
  } catch { return false; }
}

function continuityAuthoritySameStateWriterLock(repository, observed, witness) {
  const fact = inspectOwnedContinuityStateWriterLock({dir:repository.primaryRoot,lock:witness.lock});
  return fact !== null && fact.path === `${observed.path}.lock`
    && continuityAuthorityEqual(fact,witness.lockFact);
}

function continuityAuthorityCurrentStateWriterLock(repository, observed) {
  const contextHandle = continuityCompanionContextScope.getStore();
  const value = contextHandle && continuityCompanionContexts.get(contextHandle);
  if (!value || value.entry !== 'approve-plan') return null;
  continuityCompanionCurrent(value,{repository,entry:'approve-plan'},
    continuityCompanionRefRefreshObservations.get(contextHandle)??null);
  if (value.operation.companionExecuting !== true) return null;
  const witness = continuityCompanionStateWriterLockWitnesses.get(contextHandle);
  if (!witness || witness.contextHandle !== contextHandle || !continuityAuthorityEqual(witness.repository,repository)) return null;
  if (!continuityAuthoritySameStateWriterLock(repository,observed,witness))
    fail('SDC-AUTHORITY-CAS','owned continuity State lock physical image changed');
  return witness;
}

export function bindOnboardingContinuityStateWriterLockWitness({repository,contextHandle,boundary,dir,lock}) {
  const value = contextHandle && continuityCompanionContexts.get(contextHandle);
  if (!value || value.entry !== 'approve-plan' || continuityCompanionContextScope.getStore() !== contextHandle
      || value.operation.companionExecuting !== true || !boundary || typeof boundary !== 'object')
    fail('SDC-AUTHORITY-UNAVAILABLE','owned approval State lock context required');
  continuityCompanionCurrent(value,{repository,entry:'approve-plan'});
  if (continuityCompanionStateWriterLockWitnesses.has(contextHandle))
    fail('SDC-AUTHORITY-CAS','approval State lock witness already bound');
  if (resolve(dir) !== repository.primaryRoot)
    fail('SDC-AUTHORITY-CAS','approval State lock root changed');
  const observed = observeSessionCleanupState(repository.primaryRoot);
  const lockFact = inspectOwnedContinuityStateWriterLock({dir:repository.primaryRoot,lock});
  if (!lockFact || lockFact.path !== `${observed.path}.lock`)
    fail('SDC-AUTHORITY-CAS','actual approval State lock unavailable');
  const witness = Object.freeze({contextHandle,repository:structuredClone(repository),boundary,lock,lockFact});
  continuityCompanionStateWriterLockWitnesses.set(contextHandle,witness);
  controlledContinuityApplyLockFault(witness);
  return witness;
}

export function assertOnboardingContinuityStateWriterLockWitness(witness) {
  const value=witness?.contextHandle&&continuityCompanionContexts.get(witness.contextHandle);
  if(!witness||!value||value.entry!=='approve-plan'
      ||continuityCompanionStateWriterLockWitnesses.get(witness.contextHandle)!==witness
      ||continuityCompanionContextScope.getStore()!==witness.contextHandle
      ||value.operation.companionExecuting!==true||!witness.boundary
      ||!continuityAuthorityEqual(value.operation.data.repository,witness.repository))
    fail('SDC-AUTHORITY-CAS','unowned approval State lock assertion');
  continuityCompanionCurrent(value,{repository:witness.repository,entry:'approve-plan'});
  // The existing observer checks the original lock image and unresolved siblings.
  // It returns no authority or snapshot across this read-only assertion boundary.
  continuityAuthoritySnapshot(witness.repository);
}

export function clearOnboardingContinuityStateWriterLockWitness(witness) {
  if (!witness || continuityCompanionStateWriterLockWitnesses.get(witness.contextHandle) !== witness)
    fail('SDC-AUTHORITY-CAS','unowned approval State lock witness cleanup');
  continuityCompanionStateWriterLockWitnesses.delete(witness.contextHandle);
}

function continuityAfkCurrent(row) {
  if (!row || row.closed || continuityAfkInvocationScope.getStore()!==row
      || continuityAfkAdmissions.get(row.admissionHandle)!==row
      || continuityAfkAdmissionByOperation.get(row.operation)!==row
      || row.operation.data!==row.data || row.operation.operationHandle!==row.operationHandle
      || row.operation.executionHandle!==row.executionHandle || row.operation.phase!=='armed'
      || canonicalSha256(row.input)!==row.inputSha256
      || continuityAuthorityExecutions.get(row.executionHandle)?.operation!==row.operation)
    fail('SDC-AUTHORITY-CAS','AFK owning operation changed');
  continuityAuthorityCurrent(row.data,row.operation.requesterHandle);
  continuityAuthorityCheckJournals(row.operation);
  const memberRef=row.stateMemberRef??row.expectedMemberRef;
  if(!continuityAuthorityEqual(row.operation.expectedMemberRef,memberRef))
    fail('SDC-AUTHORITY-CAS','AFK owning member reference changed');
  const memberPath=join(row.data.repository.commonDir,memberRef.path.slice(5));
  if(!continuityAuthorityEqual(memberRef,continuityAuthorityPrivateRef(row.data.repository,memberPath)))
    fail('SDC-AUTHORITY-CAS','AFK owning member physical image changed');
  const member=JSON.parse(assertPrivateCleanupFile(memberPath,'AFK owning member'));
  const observed=row.port.observeOperation(row.operationHandle);
  if(member.producerId!=='onboarding-continuity'||member.phase!=='armed'
      ||member.bindingSha256!==observed.bindingSha256
      ||!continuityAuthorityEqual(member.association,observed.association)
      ||!continuityAuthorityEqual(member.kinds,observed.kinds)
      ||!continuityAuthorityEqual(member.sourceFacts,observed.sourceFacts))
    fail('SDC-AUTHORITY-CAS','AFK owning member record changed');
  let currentState;
  try {
    continuityAuthoritySnapshot(row.data.repository);
    const statePath=relative(row.data.repository.primaryRoot,statePathForMethod(row.data.repository.primaryRoot)).split(sep).join('/');
    currentState=continuityCompanionEffectImage(row.data.repository,{scope:'repository',path:statePath,preimage:null,postimage:null});
  } catch(error) {
    row.stateDisposition=row.stateAttempted?'durability-unknown':'indeterminate';
    throw error;
  }
  if(continuityAuthorityEqual(currentState,row.statePreimage)) row.stateDisposition='unchanged';
  else if(row.statePostimage&&continuityAuthorityEqual(currentState,row.statePostimage)) row.stateDisposition='committed';
  else {
    row.stateDisposition=row.stateAttempted?'durability-unknown':'indeterminate';
    fail('SDC-AUTHORITY-CAS','AFK selected State physical image changed');
  }
  return row;
}

export function readSourceOwnedOnboardingAfkAdmission({admissionHandle}) {
  const row=continuityAfkAdmissions.get(admissionHandle);
  continuityAfkCurrent(row);
  return Object.freeze({repository:row.data.repository,kind:row.kind,activationId:row.activationId,
    input:structuredClone(row.input),stateDisposition:row.stateDisposition});
}

export function readSourceOwnedOnboardingAfkProjectionForState({repository,entry}) {
  const contextHandle=continuityCompanionContextScope.getStore();
  const context=contextHandle&&continuityCompanionContexts.get(contextHandle);
  if(!context||entry!=='afk-project'||context.entry!=='afk-project'
      ||!continuityAuthorityEqual(context.operation.data.repository,repository)) return null;
  continuityCompanionCurrent(context,{repository,entry});
  const row=continuityAfkAdmissionByOperation.get(context.operation);
  if(!row||row.phase!=='projecting'||row.projectionRead||row.projectionContextHandle&&row.projectionContextHandle!==contextHandle
      ||continuityAfkProjectionForState.get(context.operation)!==row)
    fail('SDC-AUTHORITY-CAS','AFK projection is not in its private settlement scope');
  continuityAfkCurrent(row);
  row.projectionRead=true; row.projectionContextHandle=contextHandle;
  return Object.freeze(structuredClone(row.projection));
}

export function settleSourceOwnedOnboardingAfkProjection({admissionHandle}) {
  const row=continuityAfkAdmissions.get(admissionHandle);
  try {
    continuityAfkCurrent(row);
    if(row.phase!=='prepared'&&row.phase!=='host-settled')
      fail('SDC-AUTHORITY-CAS','AFK projection settlement phase changed');
    const selector=readSourceOwnedAfkProjectionSettlementSelector({admissionHandle});
    if(!selector||!continuityAuthorityEqual(selector.repository,row.data.repository)
        ||selector.activationId!==row.activationId||! /^[a-f0-9]{64}$/u.test(selector.ledgerHeadSha256??''))
      fail('SDC-AUTHORITY-CAS','AFK actual ledger settlement selector unavailable');
    const projection=readSourceOwnedAfkProjectionSettlement(selector);
    if(!projection||!exactKeys(projection,new Set(['schema','activationId','status','ledgerSequence','ledgerHeadSha256','privateRefOid','updatedAt']))
        ||projection.schema!=='pipeline.afk-projection.v1'||projection.activationId!==row.activationId
        ||projection.ledgerHeadSha256!==selector.ledgerHeadSha256)
      fail('SDC-AUTHORITY-CAS','AFK actual ledger projection unavailable');
    row.projection=Object.freeze(structuredClone(projection)); row.phase='projecting'; row.projectionRead=false;
    continuityAfkProjectionForState.set(row.operation,row);
    row.stateAttempted=true;
    const result=continuityExecuteCompanionOperation(row.data,row.port,{operationHandle:row.operationHandle,
      executionHandle:row.executionHandle,expectedMemberRef:row.operation.expectedMemberRef,
      expectedStateSha256:row.expectedStateSha256,entry:'afk-project',argv:['afk-project',
        '--activation-id',row.activationId,'--ledger-head-sha256',selector.ledgerHeadSha256]});
    if(result?.status==='completed'&&result.entry==='afk-project'&&result.exitCode===0
        &&result.statePreimage?.sha256===row.expectedStateSha256&&result.statePostimage?.sha256
        &&result.memberRef?.path) {
      row.statePostimage=structuredClone(result.statePostimage);
      row.stateMemberRef=structuredClone(result.memberRef);
      row.stateDisposition='committed';
    }
    if(result?.status!=='completed') {
      try { continuityAfkCurrent(row); } catch {}
      return Object.freeze({status:'unavailable',code:['SDC-AUTHORITY-UNAVAILABLE','SDC-AUTHORITY-CAS','SDC-AUTHORITY-HELD','SDC-PRIVATE-PATH','SDC-LOCK-HELD'].includes(result?.code)?result.code:'SDC-AUTHORITY-HELD',
        attempted:row.stateAttempted,stateDisposition:row.stateDisposition});
    }
    if(!row.projectionRead) fail('SDC-AUTHORITY-CAS','AFK State projection was not consumed');
    return result;
  } catch(error) {
    return Object.freeze({status:'unavailable',code:['SDC-AUTHORITY-UNAVAILABLE','SDC-AUTHORITY-CAS','SDC-AUTHORITY-HELD','SDC-PRIVATE-PATH','SDC-LOCK-HELD'].includes(error?.code)?error.code:'SDC-AUTHORITY-CAS',
      attempted:row?.stateAttempted===true,stateDisposition:row?.stateDisposition??'indeterminate'});
  } finally {
    if(row) {
      continuityAfkProjectionForState.delete(row.operation);
      row.projection=null; row.phase='settled';
    }
  }
}

function continuityExecuteAfkTransaction(data,port,request) {
  let row,originalHostFailure=null;
  try {
    if(!exactKeys(request,new Set(['operationHandle','executionHandle','expectedMemberRef','expectedStateSha256','kind','activationId','input']))
        ||!['activate','entry','review'].includes(request.kind)||! /^[a-f0-9]{32}$/u.test(request.activationId??'')
        ||! /^[a-f0-9]{64}$/u.test(request.expectedStateSha256??'')||!request.expectedMemberRef
        ||!request.input||typeof request.input!=='object'||Array.isArray(request.input))
      fail('SDC-AUTHORITY-UNAVAILABLE','unsupported AFK owning transaction request');
    const operation=continuityAuthorityOperation(data,request.operationHandle);
    if(operation.legacy||operation.phase!=='armed'||operation.companionExecuting===true
        ||operation.executionHandle!==request.executionHandle
        ||continuityAuthorityExecutions.get(request.executionHandle)?.operation!==operation
        ||!continuityAuthorityEqual(operation.expectedMemberRef,request.expectedMemberRef))
      fail('SDC-AUTHORITY-CAS','AFK original owning execution changed');
    const inputKeys={activate:new Set(['receipt','recordedAt']),entry:new Set(['request','proposal','recordedAt']),
      review:new Set(['reviewInput'])}[request.kind];
    if(!exactKeys(request.input,inputKeys)) fail('SDC-AUTHORITY-UNAVAILABLE','unsupported AFK transaction input');
    const activationMismatch=(request.kind==='activate'&&request.input.receipt?.activationId!==request.activationId)
      ||(request.kind==='entry'&&request.input.request?.activationId!==request.activationId)
      ||(request.kind==='review'&&request.input.reviewInput?.activationId!==undefined
        &&request.input.reviewInput.activationId!==request.activationId);
    if(activationMismatch)
      fail('SDC-AUTHORITY-CAS','AFK transaction activation binding changed');
    const snapshot=continuityAuthoritySnapshot(data.repository);
    if(snapshot.observed.stateSha256!==request.expectedStateSha256||snapshot.observed.sessionCleanup===null
        ||snapshot.observed.orphanBinding)
      fail('SDC-AUTHORITY-CAS','AFK selected State or owner binding changed');
    continuityAuthorityCurrent(data,operation.requesterHandle);
    continuityAuthorityCheckJournals(operation);
    const memberPath=join(data.repository.commonDir,request.expectedMemberRef.path.slice(5));
    if(!continuityAuthorityEqual(operation.expectedMemberRef,continuityAuthorityPrivateRef(data.repository,memberPath)))
      fail('SDC-AUTHORITY-CAS','AFK owning member preimage changed');
    const statePath=relative(data.repository.primaryRoot,statePathForMethod(data.repository.primaryRoot)).split(sep).join('/');
    const statePreimage=continuityCompanionEffectImage(data.repository,{scope:'repository',path:statePath,preimage:null,postimage:null});
    if(!statePreimage||statePreimage.sha256!==request.expectedStateSha256)
      fail('SDC-AUTHORITY-CAS','AFK selected State physical preimage changed');
    row={data,port,operation,operationHandle:request.operationHandle,executionHandle:request.executionHandle,
      expectedMemberRef:structuredClone(request.expectedMemberRef),expectedStateSha256:request.expectedStateSha256,
      statePreimage,
      kind:request.kind,activationId:request.activationId,input:structuredClone(request.input),inputSha256:canonicalSha256(request.input),
      phase:'prepared',attempted:false,hostInvoked:false,stateAttempted:false,stateDisposition:'unchanged',closed:false};
    row.admissionHandle=Object.freeze({});
    continuityAfkAdmissions.set(row.admissionHandle,row);
    continuityAfkAdmissionByOperation.set(operation,row);
    bindControlledAfkExerciseAdmission(row);
    return continuityAfkInvocationScope.run(row,()=>{
      try {
        row.hostInvoked=true;
        const result=executeSourceOwnedAfkHostTransaction({admissionHandle:row.admissionHandle});
        if(result?.status==='unavailable'&&Object.isFrozen(result)
            &&exactKeys(result,new Set(['status','code','attempted','hostEffects','stateDisposition']))
            &&controlledAfkExerciseCodes.has(result.code)&&typeof result.attempted==='boolean'
            &&['none','retained','unknown'].includes(result.hostEffects)
            &&['unchanged','committed','durability-unknown','indeterminate'].includes(result.stateDisposition))
          originalHostFailure=result;
        continuityAfkCurrent(row);
        if(result?.status==='completed'&&exactKeys(result,new Set(['status','kind','hostResult','statePreimage','statePostimage','memberRef','assurance']))
            &&result.kind===row.kind&&result.statePreimage?.sha256===row.expectedStateSha256
            &&result.statePostimage?.sha256&&result.memberRef?.path&&typeof result.assurance==='string'
            &&result.hostResult&&typeof result.hostResult==='object') {
          controlledAfkExerciseReplay(row,result);
          return result;
        }
        if(result?.status==='unavailable'&&exactKeys(result,new Set(['status','code','attempted','hostEffects','stateDisposition']))
            &&typeof result.code==='string'&&typeof result.attempted==='boolean'
            &&['none','retained','unknown'].includes(result.hostEffects)
            &&['unchanged','committed','durability-unknown','indeterminate'].includes(result.stateDisposition))
          return result;
        return Object.freeze({status:'unavailable',code:'SDC-AUTHORITY-HELD',attempted:true,
          hostEffects:'unknown',stateDisposition:row.stateDisposition});
      } catch(error) {
        let observedHostEffects=row.hostInvoked?'unknown':'none';
        let observedStateDisposition=row.stateDisposition;
        if(originalHostFailure)try {
          // Preserve only a Source-observed failed prefix, never admission or success.
          if(row.closed||!row.hostInvoked||continuityRetiredOwnerScope.getStore()
              ||continuityAfkInvocationScope.getStore()!==row
              ||continuityAfkAdmissions.get(row.admissionHandle)!==row
              ||continuityAfkAdmissionByOperation.get(operation)!==row
              ||continuityAuthorityPorts.get(port)!==data||row.port!==port||row.data!==data
              ||row.operation!==operation||continuityAuthorityOperations.get(request.operationHandle)!==operation
              ||row.operationHandle!==request.operationHandle||operation.operationHandle!==request.operationHandle
              ||row.executionHandle!==request.executionHandle||operation.executionHandle!==request.executionHandle
              ||continuityAuthorityExecutions.get(request.executionHandle)?.operation!==operation
              ||operation.data!==data||operation.legacy||operation.phase!=='armed'
              ||row.kind!==request.kind||row.activationId!==request.activationId
              ||row.inputSha256!==canonicalSha256(request.input)||row.inputSha256!==canonicalSha256(row.input)
              ||!continuityAuthorityEqual(row.expectedMemberRef,request.expectedMemberRef)
              ||!continuityAuthorityEqual(operation.expectedMemberRef,row.expectedMemberRef))
            fail('SDC-AUTHORITY-CAS','AFK failed prefix ownership changed');
          continuityAuthorityRepository(data.repository);
          const requester=continuityAuthorityCurrent(data,operation.requesterHandle);
          continuityAuthorityCheckJournals(operation);
          const path=join(data.repository.commonDir,row.expectedMemberRef.path.slice(5));
          if(!continuityAuthorityEqual(row.expectedMemberRef,continuityAuthorityPrivateRef(data.repository,path)))
            fail('SDC-AUTHORITY-CAS','AFK failed prefix member changed');
          continuityAuthorityRepository(data.repository);
          continuityAuthorityCheckJournals(operation);
          if(!continuityAuthorityEqual(requester,continuityAuthorityCurrent(data,operation.requesterHandle))
              ||!continuityAuthorityEqual(row.expectedMemberRef,continuityAuthorityPrivateRef(data.repository,path)))
            fail('SDC-AUTHORITY-CAS','AFK failed prefix readback changed');
          observedHostEffects=originalHostFailure.hostEffects;
          if(row.stateAttempted===true&&row.statePostimage===undefined&&row.stateMemberRef===undefined
              &&['durability-unknown','indeterminate'].includes(originalHostFailure.stateDisposition))
            observedStateDisposition=originalHostFailure.stateDisposition;
        } catch { /* Unowned or unstable evidence retains the original unknown fallback. */ }
        return Object.freeze({status:'unavailable',code:['SDC-AUTHORITY-UNAVAILABLE','SDC-AUTHORITY-CAS','SDC-AUTHORITY-HELD','SDC-PRIVATE-PATH','SDC-LOCK-HELD'].includes(error?.code)?error.code:'SDC-AUTHORITY-HELD',attempted:row.hostInvoked,
          hostEffects:observedHostEffects,stateDisposition:observedStateDisposition});
      } finally {
        row.closed=true; continuityAfkAdmissionByOperation.delete(operation);
      }
    });
  } catch(error) {
    return Object.freeze({status:'unavailable',code:['SDC-AUTHORITY-UNAVAILABLE','SDC-AUTHORITY-CAS','SDC-AUTHORITY-HELD','SDC-PRIVATE-PATH','SDC-LOCK-HELD'].includes(error?.code)?error.code:'SDC-AUTHORITY-UNAVAILABLE',attempted:false,
      hostEffects:'none',stateDisposition:'indeterminate'});
  }
}

function continuityExecuteCompanionOperation(data,port,request) {
  let attempted=false;
  let activeOperation=null;
  try {
    if (!exactKeys(request,new Set(['operationHandle','executionHandle','expectedMemberRef','expectedStateSha256','entry','argv']))
        || !CONTINUITY_COMPANION_ENTRIES.has(request.entry)
        || !Array.isArray(request.argv) || request.argv.length<1 || request.argv.length>256
        || request.argv[0]!==request.entry
        || request.argv.some(value=>typeof value!=='string' || value.length<1 || value.length>4096 || /[\0\r\n]/u.test(value))
        || !/^[a-f0-9]{64}$/u.test(request.expectedStateSha256??''))
      fail('SDC-AUTHORITY-UNAVAILABLE','unsupported owning continuity companion request');
    const operation=continuityAuthorityOperation(data,request.operationHandle);
    activeOperation=operation;
    if(request.entry==='afk-project') {
      const admission=continuityAfkAdmissionByOperation.get(operation);
      if(!admission||admission.phase!=='projecting'||continuityAfkProjectionForState.get(operation)!==admission)
        fail('SDC-AUTHORITY-UNAVAILABLE','AFK projection requires the actual private settlement');
    }
    continuityCompanionMemberRefSettlements.delete(operation);
    if (operation.legacy || operation.phase!=='armed' || operation.companionExecuting===true
        || operation.executionHandle!==request.executionHandle
        || continuityAuthorityExecutions.get(request.executionHandle)?.operation!==operation
        || !continuityAuthorityEqual(operation.expectedMemberRef,request.expectedMemberRef))
      fail('SDC-AUTHORITY-CAS','continuity companion original execution changed');
    const requester=continuityAuthorityCurrent(data,operation.requesterHandle);
    continuityAuthorityCheckJournals(operation);
    const memberPath=join(data.repository.commonDir,operation.expectedMemberRef.path.slice(5));
    if (!continuityAuthorityEqual(operation.expectedMemberRef,continuityAuthorityPrivateRef(data.repository,memberPath)))
      fail('SDC-AUTHORITY-CAS','continuity companion physical member changed');
    const member=JSON.parse(assertPrivateCleanupFile(memberPath,'continuity companion owning member'));
    const observed=port.observeOperation(request.operationHandle);
    if (member.producerId!=='onboarding-continuity' || member.phase!=='armed'
        || member.bindingSha256!==observed.bindingSha256
        || !continuityAuthorityEqual(member.association,observed.association)
        || !continuityAuthorityEqual(member.kinds,observed.kinds)
        || !continuityAuthorityEqual(member.sourceFacts,observed.sourceFacts))
      fail('SDC-AUTHORITY-CAS','continuity companion member observation changed');
    const effect={scope:'repository',path:relative(data.repository.primaryRoot,statePathForMethod(data.repository.primaryRoot)).split(sep).join('/'),
      preimage:null,postimage:null};
    const preimage=continuityCompanionEffectImage(data.repository,effect);
    if (!preimage || preimage.sha256!==request.expectedStateSha256)
      fail('SDC-AUTHORITY-CAS','continuity companion State preimage changed');
    const argv=[...request.argv];
    const argvSha256=canonicalSha256(argv);
    // Existing capability ownership is the context origin. Caller arguments
    // select an existing State entry; they never supply a context or verdict.
    // The actual State parser, approval, Critic/Verify and terminal gates run.
    operation.companionExecuting=true;
    let exitCode;
    try {
      attempted=true;
      exitCode=runOwnedContinuityCompanionState(operation,request.executionHandle,request.entry,argv,request.expectedStateSha256);
    } finally { operation.companionExecuting=false; }
    if (!Number.isInteger(exitCode) || (request.entry==='afk-project' && exitCode!==0))
      fail('SDC-AUTHORITY-HELD','continuity companion actual command terminal unavailable');
    const postimage=continuityCompanionEffectImage(data.repository,effect);
    const settlement=continuityCompanionMemberRefSettlements.get(operation);
    let currentMemberRef=operation.expectedMemberRef;
    if (settlement) {
      const context=continuityCompanionContexts.get(settlement.contextHandle);
      const owner=continuityCompanionWitnesses.get(settlement.witness);
      if (settlement.operation!==operation || settlement.operationHandle!==request.operationHandle
          || settlement.executionHandle!==request.executionHandle || !settlement.boundary || !settlement.handle || !settlement.witness
          || !owner || owner.data!==data || owner.port!==port || owner.handle!==settlement.handle
          || owner.contextHandle!==settlement.contextHandle
          || owner.value!==settlement.contextValue || owner.boundary!==settlement.boundary || owner.stage!=='refreshed'
          || !continuityAuthorityEqual(settlement.previousMemberRef,request.expectedMemberRef)
          || !context || context!==settlement.contextValue || context.operation!==operation
          || context.executionHandle!==request.executionHandle || context.contextHandle!==settlement.contextHandle
          || (!continuityAuthorityEqual(operation.expectedMemberRef,settlement.previousMemberRef)
            && !continuityAuthorityEqual(operation.expectedMemberRef,settlement.memberRef))
          || (!continuityAuthorityEqual(context.expectedMemberRef,settlement.previousMemberRef)
            && !continuityAuthorityEqual(context.expectedMemberRef,settlement.memberRef)))
        fail('SDC-AUTHORITY-CAS','continuity companion terminal settlement mismatch');
      currentMemberRef=settlement.memberRef;
    }
    const currentMemberPath=join(data.repository.commonDir,currentMemberRef.path.slice(5));
    if (!postimage || !continuityAuthorityEqual(currentMemberRef,continuityAuthorityPrivateRef(data.repository,currentMemberPath)))
      fail('SDC-AUTHORITY-CAS','continuity companion terminal physical readback changed');
    if (settlement) {
      operation.expectedMemberRef=structuredClone(currentMemberRef);
      settlement.contextValue.expectedMemberRef=structuredClone(currentMemberRef);
      continuityCompanionMemberRefSettlements.delete(operation);
    }
    return Object.freeze({status:'completed',entry:request.entry,exitCode,argvSha256,
      statePreimage:Object.freeze(preimage),statePostimage:Object.freeze(postimage),
      memberRef:Object.freeze(structuredClone(currentMemberRef)),assurance:requester.assurance});
  } catch (error) {
    // Refusal can follow a real attempted write. Keep the lifetime held; never
    // infer rollback, owner termination or release from a command result.
    if (activeOperation) continuityCompanionMemberRefSettlements.delete(activeOperation);
    return Object.freeze({status:'unavailable',code:error.code??'SDC-AUTHORITY-UNAVAILABLE',attempted,exitCode:null});
  }
}

// Called only by the owning port's closed named operation, never exported as a
// general callback factory. The original State run performs all real gates.
function runOwnedContinuityCompanionState(operation,executionHandle,entry,argv,expectedStateSha256) {
  if (!CONTINUITY_COMPANION_ENTRIES.has(entry) || !Array.isArray(argv)
      || entry!==argv[0]
      || argv.some(value=>typeof value!=='string'))
    fail('SDC-AUTHORITY-UNAVAILABLE','unsupported owning continuity companion entry');
  const contextHandle=Object.freeze({});
  const value={contextHandle,operation,executionHandle,entry,expectedStateSha256,
    expectedMemberRef:structuredClone(operation.expectedMemberRef)};
  continuityCompanionContexts.set(contextHandle,value);
  const execute=()=>continuityCompanionContextScope.run(contextHandle,()=>{
    continuityCompanionCurrent(value,{repository:operation.data.repository,entry});
    const exercise=controlledAfkExerciseCompanion(operation,executionHandle,entry,argv);
    if(exercise)return exercise.result;
    return runSanctionedCompanionState(argv,{dir:operation.data.repository.primaryRoot});
  });
  return entry==='close-feature'
    ? runOwnedContinuityRetiredTerminal(operation,entry,execute) : execute();
}

const continuityCompanionWitnesses=new WeakMap();
const continuityCompanionMemberRefSettlements=new WeakMap();
function continuityCompanionPhysicalPath(repository,effect) {
  if (!exactKeys(effect,new Set(['scope','path','preimage','postimage']))
      || !['repository','common'].includes(effect.scope) || typeof effect.path!=='string'
      || isAbsolute(effect.path) || effect.path.includes('\\')
      || effect.path.split('/').some(part=>!part||part==='.'||part==='..')
      || (effect.scope==='repository'&&effect.path.split('/')[0]==='.git'))
    fail('SDC-PRIVATE-PATH','invalid continuity companion effect');
  const root=effect.scope==='common'?repository.commonDir:repository.primaryRoot;
  let cursor=root;
  if (realpathSync(root)!==root) fail('SDC-ROOT','continuity companion root changed');
  for (const part of effect.path.split('/')) {
    cursor=join(cursor,part);
    if (!existsSync(cursor)) continue;
    const stat=lstatSync(cursor);
    if (stat.isSymbolicLink()) fail('SDC-PRIVATE-PATH','continuity companion source alias');
  }
  return cursor;
}
function continuityCompanionEffectImage(repository,effect) {
  const path=continuityCompanionPhysicalPath(repository,effect);
  if (!existsSync(path)) return null;
  const before=lstatSync(path);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink!==1
      || before.size>16777216 || (typeof process.getuid==='function'&&before.uid!==process.getuid()))
    fail('SDC-PRIVATE-PATH','unsafe continuity companion source');
  const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);
  let bytes;
  try {
    const opened=fstatSync(fd);
    if (opened.dev!==before.dev || opened.ino!==before.ino || opened.mode!==before.mode || opened.nlink!==1)
      fail('SDC-AUTHORITY-CAS','continuity companion opened source changed');
    bytes=readFileSync(fd);
  } finally { closeSync(fd); }
  const after=lstatSync(path),rawSha=createHash('sha256').update(bytes).digest('hex');
  if (after.dev!==before.dev || after.ino!==before.ino || after.mode!==before.mode
      || after.nlink!==1 || bytes.length!==after.size
      || rawSha!==createHash('sha256').update(readFileSync(path)).digest('hex'))
    fail('SDC-AUTHORITY-CAS','continuity companion source raced');
  let semanticSha256=rawSha;
  try { const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes); semanticSha256=canonicalSha256(JSON.parse(text)); } catch {}
  return {sha256:rawSha,size:bytes.length,identity:{dev:String(after.dev),ino:String(after.ino),mode:after.mode,nlink:1},semanticSha256};
}
function continuityCompanionFactMatched(fact,effects,imageKey) {
  return effects.some(effect=>effect[imageKey]!==null
    && continuityAuthorityEqual(continuitySharedStateImage(fact),effect[imageKey]));
}
function continuityCompanionLegacyDigest(methods,effects,imageKey) {
  const observations=methods.readBaseline().legacyOperations.map(handle=>methods.observeOperation(handle))
    .map(value=>({...value,sourceFacts:value.sourceFacts.filter(fact=>!continuityCompanionFactMatched(fact,effects,imageKey))}))
    .map(canonicalJson).sort();
  return canonicalSha256(observations);
}
function continuityCompanionConservedFacts(before,after,effects) {
  if (!continuityAuthorityEqual(before.filter(fact=>!continuityCompanionFactMatched(fact,effects,'preimage')),
      after.filter(fact=>!continuityCompanionFactMatched(fact,effects,'postimage'))))
    fail('SDC-AUTHORITY-CAS','unscoped continuity companion effects');
}
function continuityCompanionAssertOriginalBinding(value,snapshot) {
  const target=value.operation.association.target;
  const tuple=snapshot.binding.binding?.sessionCleanup;
  if (!snapshot.observed.neutral || !tuple
      || !continuityAuthorityEqual(tuple,{sessionId:target.sessionId,descriptorSha256:target.descriptorSha256})
      || snapshot.binding.binding.featureId!==value.originalBinding.featureId
      || snapshot.binding.binding.schema!==value.originalBinding.schema
      || snapshot.release.status!=='absent')
    fail('SDC-AUTHORITY-CAS','original continuity private binding changed');
}
function continuityRefreshCompanionKnownOwnerAlias(data,snapshot) {
  const contextHandle=continuityCompanionContextScope.getStore();
  const value=continuityCompanionContexts.get(contextHandle);
  if (!value || value.operation.data!==data || !value.companionWriteHandle) return;
  continuityCompanionCurrent(value,{repository:data.repository,entry:value.entry});
  const handle=value.companionWriteHandle;
  if (!isOwnedStateAuthorityCompanionWriteHandle(handle,{repository:data.repository})
      || getOwnedStateAuthorityCompanionContextHandle(handle)!==contextHandle)
    fail('SDC-AUTHORITY-CAS','unowned continuity companion source seal');
  const changed=value.companionPlan.effects.some(effect=>
    !continuityAuthorityEqual(continuityCompanionEffectImage(data.repository,effect),effect.preimage));
  if (!changed) return; // No physical effect: the actual original alias remains exact.
  const terminal=observeStateAuthorityCompanionWriteTerminal(handle);
  if (terminal.entry!==value.entry || !continuityCompanionResultValue(terminal.result)
      || terminal.effects.length!==value.companionPlan.effects.length)
    fail('SDC-AUTHORITY-CAS','continuity companion terminal mismatch');
  terminal.effects.forEach((effect,index)=>{
    const prior=value.companionPlan.effects[index];
    if (effect.scope!==prior.scope || effect.path!==prior.path
        || !continuityAuthorityEqual(effect.preimage,prior.preimage)
        || !continuityAuthorityEqual(continuityCompanionEffectImage(data.repository,effect),effect.postimage))
      fail('SDC-AUTHORITY-CAS','continuity companion terminal image mismatch');
  });
  continuityCompanionAssertOriginalBinding(value,snapshot);
  continuityCompanionConservedFacts(value.originalSourceFacts,snapshot.sourceFacts,terminal.effects);
  const tuple=snapshot.binding.binding.sessionCleanup;
  const key=continuitySharedStateLogicalLegacyKey(data,snapshot,tuple);
  const prior=data.legacy.get(key);
  if (prior && prior!==value.operation.operationHandle)
    fail('SDC-AUTHORITY-CAS','continuity companion legacy lifetime conflict');
  if (!prior && data.legacy.size>=4096)
    fail('SDC-AUTHORITY-UNAVAILABLE','continuity companion lifetime bound');
  data.legacy.set(key,value.operation.operationHandle);
}
function continuityObserveCompanionStateWrite(data,port,methods,handle,context) {
  if (!exactKeys(context,new Set(['boundary','producerRecord','memberRecords','releaseRecords']))
      || !isOwnedStateAuthorityCompanionWriteHandle(handle,{repository:data.repository}))
    fail('SDC-AUTHORITY-UNAVAILABLE','genuine continuity companion source required');
  const plan=observeStateAuthorityCompanionWrite(handle);
  const contextHandle=getOwnedStateAuthorityCompanionContextHandle(handle);
  const value=continuityCompanionCurrent(continuityCompanionContexts.get(contextHandle),
    {repository:data.repository,entry:plan.entry});
  if (value.operation.data!==data || plan.repositorySha256!==canonicalSha256({primaryRoot:data.repository.primaryRoot,commonDir:data.repository.commonDir})
      || !plan.affectedProducerIds.includes('onboarding-continuity')
      || !Array.isArray(plan.effects) || !plan.effects.length || plan.effects.length>4096)
    fail('SDC-AUTHORITY-CAS','continuity companion owner incidence mismatch');
  // Revalidate the requested State image at the original Common boundary,
  // after any attended approval prompt and before the actual sealed effect.
  const requestedStateEffect={scope:'repository',path:relative(data.repository.primaryRoot,statePathForMethod(data.repository.primaryRoot)).split(sep).join('/'),
    preimage:null,postimage:null};
  const requestedStateImage=continuityCompanionEffectImage(data.repository,requestedStateEffect);
  if (!requestedStateImage || requestedStateImage.sha256!==value.expectedStateSha256)
    fail('SDC-AUTHORITY-CAS','continuity companion requested State preimage changed');
  const producer=inspectSourceOwnedSessionAuthorityProducerRecord({boundary:context.boundary,producerPort:port});
  const members=producer.record.members.map(index=>inspectSourceOwnedSessionAuthorityMemberRecord({
    boundary:context.boundary,producerPort:port,memberRef:index.memberRef}));
  if (!continuityAuthorityEqual(producer.record,context.producerRecord)
      || !continuityAuthorityEqual(members.map(item=>item.record),context.memberRecords)
      || !continuityAuthorityEqual(members.filter(item=>item.releaseRecord!==null).map(item=>item.releaseRecord),context.releaseRecords)
      || members.some(item=>item.record.phase==='terminal-observed'
        || (item.record.phase==='released'&&item.record.sourceFacts.some(fact=>continuityCompanionFactMatched(fact,plan.effects,'preimage')))))
    fail('SDC-AUTHORITY-CAS','continuity companion record authentication failed');
  const snapshot=continuityAuthoritySnapshot(data.repository);
  if (!continuityAuthorityEqual(snapshot.memberships,producer.record.baseline))
    fail('SDC-AUTHORITY-CAS','continuity companion preexisting baseline drift');
  plan.effects.forEach(effect=>{
    if (effect.postimage!==null || !continuityAuthorityEqual(continuityCompanionEffectImage(data.repository,effect),effect.preimage))
      fail('SDC-AUTHORITY-CAS','continuity companion preimage changed');
  });
  value.originalBinding=structuredClone(snapshot.binding.binding);
  value.originalSourceFacts=structuredClone(snapshot.sourceFacts);
  continuityCompanionAssertOriginalBinding(value,snapshot);
  const historical=members.filter(item=>item.record.phase==='released').map(item=>({
    memberRef:item.memberRef,record:structuredClone(item.record),releaseRef:item.releaseRef,
    releaseRecord:structuredClone(item.releaseRecord)}));
  const live=members.filter(item=>item.record.phase!=='released').map(item=>({memberRef:item.memberRef,record:structuredClone(item.record),
    operation:continuitySharedStatePrivateOperation(data,methods,item.record,item.memberRef)}));
  if (live.filter(item=>item.operation===value.operation).length!==1)
    fail('SDC-AUTHORITY-CAS','continuity companion original member unavailable');
  value.companionWriteHandle=handle;value.companionPlan=structuredClone(plan);
  const witness=Object.freeze({});
  continuityCompanionWitnesses.set(witness,{data,port,handle,contextHandle,value,boundary:context.boundary,
    plan:structuredClone(plan),producer,live,historical,stage:'prepared',
    legacyOperationsSha256:continuityCompanionLegacyDigest(methods,plan.effects,'preimage')});
  return witness;
}
function continuityVerifyCompanionStateWrite(data,port,methods,handle,witness) {
  const owned=continuityCompanionWitnesses.get(witness);
  if (!owned || owned.data!==data || owned.port!==port || owned.handle!==handle
      || !['prepared','verified'].includes(owned.stage)
      || getOwnedStateAuthorityCompanionContextHandle(handle)!==owned.contextHandle)
    fail('SDC-AUTHORITY-CAS','unowned continuity companion witness');
  continuityCompanionCurrent(owned.value,{repository:data.repository,entry:owned.plan.entry});
  const terminal=observeStateAuthorityCompanionWriteTerminal(handle);
  const snapshot=continuityAuthoritySnapshot(data.repository);
  continuityRefreshCompanionKnownOwnerAlias(data,snapshot);
  continuityCompanionAssertOriginalBinding(owned.value,snapshot);
  if (!continuityAuthorityEqual(continuitySharedStateRecord(data,owned.producer.producerRef),owned.producer.record))
    fail('SDC-AUTHORITY-CAS','continuity companion producer changed');
  for (const item of owned.historical) {
    if (!item.releaseRef || !item.releaseRecord
        || !continuityAuthorityEqual(continuitySharedStateRecord(data,item.memberRef),item.record)
        || !continuityAuthorityEqual(continuitySharedStateRecord(data,item.releaseRef),item.releaseRecord))
      fail('SDC-AUTHORITY-CAS','continuity companion historical release changed');
  }
  const memberObservations=owned.live.map(item=>{
    if (!continuityAuthorityEqual(item.operation.expectedMemberRef,item.memberRef)
        || !continuityAuthorityEqual(continuitySharedStateRecord(data,item.memberRef),item.record))
      fail('SDC-AUTHORITY-CAS','continuity companion original member changed');
    const observed=methods.observeOperation(item.operation.operationHandle);
    if (!continuityAuthorityEqual({association:observed.association,kinds:observed.kinds,phase:observed.phase,bindingSha256:observed.bindingSha256},
        {association:item.record.association,kinds:item.record.kinds,phase:item.record.phase,bindingSha256:item.record.bindingSha256}))
      fail('SDC-AUTHORITY-CAS','continuity companion original operation changed');
    continuityCompanionConservedFacts(item.record.sourceFacts,observed.sourceFacts,terminal.effects);
    return {memberRef:item.memberRef,...observed};
  });
  const legacyOperationsSha256=continuityCompanionLegacyDigest(methods,terminal.effects,'postimage');
  if (legacyOperationsSha256!==owned.legacyOperationsSha256)
    fail('SDC-AUTHORITY-CAS','continuity companion legacy identity changed');
  owned.terminal=structuredClone(terminal);owned.stage='verified';
  return {memberships:snapshot.memberships,memberObservations,legacyOperationsSha256};
}
function continuityRefreshCompanionStateMemberRefs(data,port,handle,witness,{boundary}={}) {
  const owned=continuityCompanionWitnesses.get(witness);
  if (!owned || owned.data!==data || owned.port!==port || owned.handle!==handle
      || owned.boundary!==boundary || owned.stage!=='verified')
    fail('SDC-AUTHORITY-CAS','unowned continuity companion refresh');
  owned.stage='refreshing';
  const ticket=inspectSourceOwnedSessionAuthorityCompanionRefresh({boundary,producerPort:port,
    companionWriteHandle:handle,ownerWitness:witness});
  const updates=ticket.members.map(change=>{
    const item=owned.live.find(row=>continuityAuthorityEqual(row.memberRef,change.previousMemberRef));
    if (!item || item.record.memberId!==change.memberId || item.record.memberGeneration!==change.memberGeneration
        || !continuityAuthorityEqual(item.operation.expectedMemberRef,item.memberRef))
      fail('SDC-AUTHORITY-CAS','continuity companion refresh predecessor mismatch');
    // The genuine refresh ticket binds the successor before owner reconciliation.
    // Reopen that exact ticket ref without adopting any ref from current disk.
    const matching=ticket.memberRecords.filter(record=>
      continuityAuthorityEqual(record.memberRef,change.memberRef));
    if (matching.length!==1)
      fail('SDC-AUTHORITY-CAS','continuity companion refresh successor unavailable');
    const actual=matching[0];
    if (!continuityAuthorityEqual(actual.producerRef,ticket.producerRef)
        || !continuityAuthorityEqual(actual.catalogueRef,ticket.catalogueRef)
        || !continuityAuthorityEqual(continuitySharedStateRecord(data,change.memberRef),actual.record))
      fail('SDC-AUTHORITY-CAS','continuity companion refresh successor changed');
    const {sourceFacts,revision,updatedAt,...identity}=actual.record;
    const {sourceFacts:priorFacts,revision:priorRevision,updatedAt:priorUpdatedAt,...priorIdentity}=item.record;
    if (actual.releaseRef!==null || actual.releaseRecord!==null || revision!==priorRevision+1
        || !continuityAuthorityEqual(identity,priorIdentity))
      fail('SDC-AUTHORITY-CAS','continuity companion refreshed member identity mismatch');
    continuityCompanionConservedFacts(priorFacts,sourceFacts,owned.terminal.effects);
    const directs=[...continuityAuthorityDirectBindings.values()].filter(direct=>
      direct.data===data&&direct.prepared.operationHandle===item.operation.operationHandle);
    for (const direct of directs) {
      if (!continuityAuthorityEqual(direct.reserved.memberRef,change.previousMemberRef))
        fail('SDC-AUTHORITY-CAS','continuity companion direct predecessor mismatch');
    }
    return {item,change,directs,sourceFacts};
  });
  if (new Set(updates.map(value=>value.item)).size!==updates.length)
    fail('SDC-AUTHORITY-CAS','duplicate continuity companion refresh');
  // Registry has published these exact authenticated successors. Keep the
  // original pins until normal settlement, but validate that publication
  // during the current approval owner's genuine State-lock observation.
  const ownUpdate=updates.find(update=>update.item.operation===owned.value.operation);
  const observation=ownUpdate && owned.value.entry==='approve-plan' ? Object.freeze({
    data,port,handle,witness,boundary,contextHandle:owned.contextHandle,value:owned.value,
    operation:owned.value.operation,previousMemberRef:structuredClone(ownUpdate.change.previousMemberRef),
    memberRef:structuredClone(ownUpdate.change.memberRef),
  }) : null;
  if (observation) {
    if (continuityCompanionRefRefreshObservations.has(owned.contextHandle))
      fail('SDC-AUTHORITY-CAS','continuity member refresh observation already active');
    continuityCompanionRefRefreshObservations.set(owned.contextHandle,observation);
  }
  try {
    for (const {item,sourceFacts} of updates) {
      const observed=port.observeOperation(item.operation.operationHandle);
      if (!continuityAuthorityEqual(observed.sourceFacts,sourceFacts))
        fail('SDC-AUTHORITY-CAS','continuity companion refreshed physical facts mismatch');
    }
  } finally {
    if (observation) continuityCompanionRefRefreshObservations.delete(owned.contextHandle);
  }
  for (const {item,change,directs} of updates) {
    if (item.operation===owned.value.operation) {
      const priorSettlement=continuityCompanionMemberRefSettlements.get(item.operation);
      if (priorSettlement && !continuityAuthorityEqual(priorSettlement.memberRef,change.previousMemberRef))
        fail('SDC-AUTHORITY-CAS','continuity companion refresh chain changed');
      continuityCompanionMemberRefSettlements.set(item.operation,Object.freeze({
        operation:item.operation,
        operationHandle:item.operation.operationHandle,
        executionHandle:owned.value.executionHandle,
        contextHandle:owned.contextHandle,
        contextValue:owned.value,
        handle,
        witness,
        previousMemberRef:structuredClone(priorSettlement?.previousMemberRef??change.previousMemberRef),
        memberRef:structuredClone(change.memberRef),
        boundary:owned.boundary,
      }));
    }
    item.operation.expectedMemberRef=structuredClone(change.memberRef);
    for (const direct of directs) {
      direct.reserved={...direct.reserved,memberRef:structuredClone(change.memberRef)};
    }
    if (item.operation===owned.value.operation) owned.value.expectedMemberRef=structuredClone(change.memberRef);
  }
  owned.stage='refreshed';
}

function continuityCompanionResultValue(value) {
  if (Number.isInteger(value)) return true;
  if (!value || typeof value!=="object" || Array.isArray(value)) return false;
  try { return continuityAuthorityEqual(value,JSON.parse(canonicalJson(value))); } catch { return false; }
}

// Synthetic controlled-method preparation uses the real ordinary producers.
// The returned observation is not authority: only this module retains its brand.
const continuityMethodPreparations=new WeakMap();
const continuityMethodPreparationRoots=new Map();
const CONTINUITY_METHOD_ANCHOR='unit-descriptor-custody';

function continuityMethodRoot(rootDir) {
  const root=resolve(rootDir);
  const st=lstatSync(root);
  if (realpathSync(root)!==root || !st.isDirectory() || st.isSymbolicLink()
      || (typeof process.getuid==='function'&&st.uid!==process.getuid()))
    fail('SDC-ROOT','controlled continuity physical root required');
  return inspectSignedDescriptorCustodyRepository(root);
}
function continuityMethodGit(repository,argv) {
  const result=spawnSync('git',['-C',repository.primaryRoot,...argv],{env:{...process.env},shell:false,encoding:'utf8',timeout:15000,maxBuffer:1048576});
  if (!isSuccessfulSpawn(result) || result.signal!==null)
    fail('SDC-AUTHORITY-UNAVAILABLE','controlled continuity actual Git operation unavailable');
  return String(result.stdout).trim();
}
function continuityMethodPhysicalSource(root,path) {
  if (typeof path!=='string' || isAbsolute(path) || path.includes('\\')
      || path.split('/').some(value=>!value||value==='.'||value==='..') || path.startsWith('.git/'))
    fail('SDC-PRIVATE-PATH','unsafe controlled continuity public source path');
  let physical=root;
  for (const part of path.split('/')) {
    physical=join(physical,part);
    if (!existsSync(physical)) continue;
    const st=lstatSync(physical);
    if (st.isSymbolicLink() || (typeof process.getuid==='function'&&st.uid!==process.getuid()))
      fail('SDC-PRIVATE-PATH','controlled continuity source owner or alias changed');
  }
  return physical;
}
function continuityMethodPublicRef(root,path) {
  const physical=continuityMethodPhysicalSource(root,path),before=lstatSync(physical);
  if (!before.isFile() || before.nlink!==1 || before.size>1048576)
    fail('SDC-PRIVATE-PATH','controlled continuity source file unsafe');
  const fd=openSync(physical,constants.O_RDONLY|constants.O_NOFOLLOW);let bytes;
  try {const opened=fstatSync(fd);if(opened.dev!==before.dev||opened.ino!==before.ino||opened.mode!==before.mode||opened.nlink!==1)
    fail('SDC-AUTHORITY-CAS','controlled source open identity changed');bytes=readFileSync(fd);}finally {closeSync(fd);}
  const after=lstatSync(physical),sha256=createHash('sha256').update(bytes).digest('hex');
  if (before.dev!==after.dev || before.ino!==after.ino || before.mode!==after.mode
      || after.nlink!==1 || bytes.length!==after.size || sha256!==createHash('sha256').update(readFileSync(physical)).digest('hex'))
    fail('SDC-AUTHORITY-CAS','controlled continuity source raced');
  return {path,sha256,size:bytes.length};
}
function continuityMethodWriteSource(record,path,bytes,{replace=false}={}) {
  const physical=continuityMethodPhysicalSource(record.repository.primaryRoot,path);
  const prior=existsSync(physical)?continuityMethodPublicRef(record.repository.primaryRoot,path):null;
  if (prior&&!replace) fail('SDC-AUTHORITY-CAS','controlled continuity source collision');
  if (prior) record.preimages.push({ref:prior,bytes:readFileSync(physical)});
  mkdirSync(dirname(physical),{recursive:true,mode:0o700});
  continuityMethodPhysicalSource(record.repository.primaryRoot,path);
  const before=prior?lstatSync(physical):null;
  const fd=openSync(physical,constants.O_WRONLY|constants.O_NOFOLLOW
    |(prior?0:constants.O_CREAT|constants.O_EXCL),0o600);
  try {
    const opened=fstatSync(fd);
    if (opened.nlink!==1 || (before&&(opened.dev!==before.dev||opened.ino!==before.ino||opened.mode!==before.mode
        || !continuityAuthorityEqual(continuityMethodPublicRef(record.repository.primaryRoot,path),prior))))
      fail('SDC-AUTHORITY-CAS','controlled source replacement preimage changed');
    if (prior) ftruncateSync(fd,0);
    writeFileSync(fd,bytes);fsyncSync(fd);
  }finally {closeSync(fd);}
  const ref=continuityMethodPublicRef(record.repository.primaryRoot,path);
  if (ref.sha256!==createHash('sha256').update(bytes).digest('hex'))
    fail('SDC-AUTHORITY-CAS','controlled continuity source readback mismatch');
  record.publicSources.push(ref);return ref;
}
function continuityMethodState(root) {
  const observed=readSanctionedPlanState(root);
  if (observed.status!=='ok') fail('SDC-AUTHORITY-UNAVAILABLE','controlled continuity State unavailable');
  return observed.state;
}
function continuityMethodInvoke(record,argv) {
  const logs=[],prior={log:console.log,error:console.error,warn:console.warn};
  for (const channel of Object.keys(prior)) console[channel]=(...args)=>logs.push({channel,text:args.map(String).join(' ')});
  let result;
  try {result=runSanctionedCompanionState(argv,{dir:record.repository.primaryRoot});}
  finally {Object.assign(console,prior);}
  record.calls.push({argv:[...argv],result,logs});
  if (result!==0) fail('SDC-AUTHORITY-UNAVAILABLE',`controlled continuity genuine ${argv[0]} prerequisite unavailable`);
  return {result,logs};
}
function continuityMethodAssertBeforeAuthority(repository) {
  if (existsSync(join(repository.commonDir,'agent-pipeline/session-authority/catalogue.json'))
      || listActiveSessionDescriptors(repository.primaryRoot).length!==0
      || !['unbound','design-unbound'].includes(readOnboardingSessionCleanupBinding({rootDir:repository.primaryRoot}).status)
      || continuityMethodGit(repository,['status','--porcelain','--untracked-files=all'])!=='')
    fail('SDC-AUTHORITY-HELD','controlled continuity preparation must precede every authority lifetime and pending public write');
}
function continuityMethodSigner(root,fixtureSigner) {
  if (!exactKeys(fixtureSigner,new Set(['privateKey','publicKey','keyReference']))
      || fixtureSigner.keyReference!==CONTINUITY_METHOD_ANCHOR
      || typeof fixtureSigner.publicKey!=='string'
      || fixtureSigner.privateKey?.type!=='private' || fixtureSigner.privateKey.asymmetricKeyType!=='ed25519'
      || createPublicKey(fixtureSigner.privateKey).export({type:'spki',format:'pem'})!==fixtureSigner.publicKey)
    fail('SDC-AUTHORITY-UNAVAILABLE','actual memory-only controlled fixture signer required');
  const policy=readCriticalHumanProofPolicy(root);
  const sha=createHash('sha256').update(fixtureSigner.publicKey).digest('hex');
  if (!policy.ok || !policy.trustAnchors?.some(anchor=>anchor.keyReference===fixtureSigner.keyReference&&anchor.publicKeySha256===sha)
      || readHumanApprovalMode(root).mode!=='signature')
    fail('SDC-AUTHORITY-UNAVAILABLE','controlled signer does not match actual independent committed signature policy');
  return fixtureSigner;
}
function continuityMethodArchitecture() {
  return {schema:'pipeline.architecture-design.v1',repositoryKind:'greenfield',
    disposition:{decision:'approved-scoped',scope:['specs/','architecture/','src/','tests/'],
      rationale:'Controlled synthetic fixture with source-owned continuity; no material architecture decision.'},
    modules:[{id:'unit',responsibility:'Own synthetic continuity fixture',nonResponsibilities:['No native/model authority'],
      ownedPaths:['src/**','tests/**'],publicContracts:['src/index.mjs'],allowedDependencies:[],authorityEffects:[],
      verificationEntryPoints:['tests/unit.test.mjs'],adrReferences:[]}],
    implementationSurface:['src/index.mjs'],fitnessModel:{schema:'pipeline.fitness-model.v1',profileId:'synthetic-unit',revision:1,
      allowedBoundaryCrossings:[],antiFragmentationPolicy:{decision:'bounded'}}};
}


// Prepared and committed before the immutable Repository/catalogue snapshot.
// Source-generated stage inputs and actual journal execution remain separate.
function continuityMethodPrepareVerifySuite(record) {
  const path='tests/unit.test.mjs';
  const bytes=Buffer.from("// Source-owned controlled-method checks. This file records no synthetic PASS.\nimport assert from 'node:assert/strict';\nimport {createHash} from 'node:crypto';\nimport {lstatSync, readFileSync, realpathSync} from 'node:fs';\nimport {spawnSync} from 'node:child_process';\nimport {fileURLToPath} from 'node:url';\n\nconst sha=b=>createHash('sha256').update(b).digest('hex');\nfunction file(path) {\n  const before=lstatSync(path);\n  assert(before.isFile()&&!before.isSymbolicLink()&&before.nlink===1);\n  assert.equal(realpathSync(path),path);\n  const bytes=readFileSync(path),after=lstatSync(path);\n  assert.equal(after.dev,before.dev);assert.equal(after.ino,before.ino);\n  assert.equal(after.mode,before.mode);assert.equal(after.nlink,1);\n  assert.equal(bytes.length,after.size);return bytes;\n}\nassert.equal(process.argv.length,4,'source producer supplies one physical stage and its digest');\nconst stageBytes=file(process.argv[2]);assert.equal(sha(stageBytes),process.argv[3]);\nconst s=JSON.parse(stageBytes);\nassert.deepEqual(Object.keys(s).sort(),['candidate','common','criticPacketId','featureId','modules','refs','root','stateFile','stateSha256'].sort());\nassert.deepEqual(Object.keys(s.modules).sort(),['lifecycle','recorder']);\nconst expectedModules="+JSON.stringify(continuityMethodModuleData(record.controlledMethodModules))+";\nassert.deepEqual(s.modules,expectedModules,'only exact Source-issued module identities');\nfor(const ref of Object.values(s.modules)) {\n  assert.deepEqual(Object.keys(ref).sort(),['sha256','url']);\n  const url=new URL(ref.url);assert.equal(url.protocol,'file:');\n  assert.equal(sha(file(fileURLToPath(url))),ref.sha256);\n}\nconst {registerTestCaseCompletion}=await import(s.modules.recorder.url);\nconst {readBoundConsumedCriticReceipt}=await import(s.modules.lifecycle.url);\nfunction git(args) {\n  const r=spawnSync('git',['-C',s.root,...args],{encoding:'utf8',shell:false,timeout:5000});\n  assert.equal(r.error,undefined);assert.equal(r.signal,null);assert.equal(r.status,0);\n  return r.stdout.trim();\n}\nregisterTestCaseCompletion({fd:3,maxBytes:16384,cases:[\n  {id:'ICV001',name:'actual immutable candidate',run(){assert.equal(git(['rev-parse','HEAD']),s.candidate.commit);assert.equal(git(['rev-parse','HEAD^{tree}']),s.candidate.tree);}},\n  {id:'ICV002',name:'physical selected State',run(){const bytes=file(s.stateFile);assert.equal(sha(bytes),s.stateSha256);assert.equal(JSON.parse(bytes).activeFeature.id,s.featureId);}},\n  {id:'ICV003',name:'actual public source bindings',run(){assert(s.refs.length>=2);for(const ref of s.refs){assert.deepEqual(Object.keys(ref).sort(),['path','sha256']);assert(!ref.path.startsWith('/')&&!ref.path.includes('\\\\')&&ref.path.split('/').every(x=>x&&x!=='.'&&x!=='..'));assert.equal(sha(file(s.root+'/'+ref.path)),ref.sha256);}}},\n  {id:'ICV004',name:'real consumed packet',run(){const v=readBoundConsumedCriticReceipt({gitCommonDir:s.common,criticPacketId:s.criticPacketId,candidate:s.candidate});assert.equal(v.packet.candidate.commit,s.candidate.commit);assert.equal(v.critic.candidate.tree,s.candidate.tree);}},\n]});\n");
  const source=continuityMethodWriteSource(record,path,bytes);
  const registrationPath='harness/verify-suites.json',registrationFile=continuityMethodPhysicalSource(record.repository.primaryRoot,registrationPath);
  const registry=existsSync(registrationFile)?JSON.parse(readFileSync(registrationFile)): {schema:'pipeline.verify-suites.v1',suites:[]};
  if(registry.schema!=='pipeline.verify-suites.v1'||!Array.isArray(registry.suites)||registry.suites.some(s=>s.name==='controlled-method-unit'||s.file===path))ownedVerificationFail('OSV-ASSOCIATION-UNAVAILABLE');
  const caseCompletion={schema:'pipeline.verify-case-completion-policy.v1',caseIds:['ICV001','ICV002','ICV003','ICV004'],maxBytes:16384};
  registry.suites.push({name:'controlled-method-unit',file:path,caseCompletion});
  continuityMethodWriteSource(record,registrationPath,Buffer.from(JSON.stringify(registry,null,2)+'\n'),{replace:existsSync(registrationFile)});
  record.verifySuite=Object.freeze({path,sha256:source.sha256,
    caseCompletion:Object.freeze({schema:'pipeline.verify-case-completion-policy.v1',
      caseIds:Object.freeze(['ICV001','ICV002','ICV003','ICV004']),maxBytes:16384})});
}

export function prepareControlledMethodContinuityArtifacts({rootDir,fixtureRoot,fixtureSigner}) {
  const repository=continuityMethodRoot(rootDir);
  continuityMethodAssertBeforeAuthority(repository);
  if (continuityMethodPreparationRoots.has(repository.primaryRoot) || continuityMethodPreparationRoots.size>=4096)
    fail('SDC-AUTHORITY-UNAVAILABLE','controlled continuity preparation lifetime already used or full');
  const expectedRoot=join(repository.commonDir,'agent-pipeline/controlled-method-fixtures/continuity-transitions');
  if (resolve(fixtureRoot)!==expectedRoot || existsSync(expectedRoot))
    fail('SDC-PRIVATE-PATH','exclusive controlled continuity preparation namespace required');
  const state=continuityMethodState(repository.primaryRoot),intake=readOnboardingIntakeCheckpoint({rootDir:repository.primaryRoot,repositoryCapability:'local'});
  const observed=observeSessionCleanupState(repository.primaryRoot);
  if (intake.status!=='present' || !['generated','bound'].includes(intake.value.transactionState)
      || !observed.neutral || observed.sessionCleanup!==null || observed.orphanBinding
      || state.planApproved!==false || state.planApproval!==undefined
      || state.activeFeature?.phase!=='design' || state.continuity?.featureId!==state.activeFeature?.id
      || !/^[a-z][a-z0-9-]{0,63}$/.test(state.activeFeature.id))
    fail('SDC-AUTHORITY-UNAVAILABLE','genuine neutral source-generated unapproved fixture required');
  const signer=continuityMethodSigner(repository.primaryRoot,fixtureSigner);
  const featureId=state.activeFeature.id,planPath=state.activeFeature.planPath,specPath=state.continuity.authority.spec.path;
  const featureDir=dirname(planPath).split(sep).join('/');
  if (featureDir!==`specs/${featureId}` || dirname(specPath).split(sep).join('/')!==featureDir)
    fail('SDC-PRIVATE-PATH','controlled continuity feature package layout unsupported');
  const controlledMethodModules=continuityMethodCaptureSourceModules();
  mkdirSync(expectedRoot,{mode:0o700});
  let privateDirectory=repository.commonDir;
  for (const part of relative(repository.commonDir,expectedRoot).split(sep)) {
    privateDirectory=join(privateDirectory,part);const st=lstatSync(privateDirectory);
    if (!st.isDirectory() || st.isSymbolicLink() || realpathSync(privateDirectory)!==privateDirectory
        || (st.mode&0o077)!==0 || (typeof process.getuid==='function'&&st.uid!==process.getuid()))
      fail('SDC-PRIVATE-PATH','controlled preparation private directory unsafe');
  }
  mkdirSync(join(expectedRoot,'empty-hooks'),{mode:0o700});
  const handle=Object.freeze({}),record={handle,repository,fixtureRoot:expectedRoot,featureId,planPath,specPath,
    initialState:structuredClone(state),initialObservation:structuredClone(observed),controlledMethodModules,publicSources:[],preimages:[],calls:[],stage:'preparing'};
  continuityMethodPreparations.set(handle,record);continuityMethodPreparationRoots.set(repository.primaryRoot,record);
  const companionPaths=[`${featureDir}/design.md`,`${featureDir}/traceability.md`],reportPath=`${featureDir}/review/method-design-review.md`,
    receiptPath=`${featureDir}/review/method-design-review-receipt.json`;
  const specBytes=Buffer.from('# Controlled continuity fixture technical specification\n\n## Acceptance criteria\n\n| # | Criterion | Evidence |\n|---|---|---|\n| AC-1 | The package must receive a PASS verdict from an independent Critic before acceptance. | Source-consumed controlled method review; no native/model acceptance claim. |\n');
  continuityMethodWriteSource(record,specPath,specBytes,{replace:true});
  const language=state.continuity.runtime.humanFacingLanguage;
  const prdBytes=Buffer.from(`${PO_GATE_PRD_LANGUAGE_MARKER(language)}\n${PO_GATE_PRD_ACKNOWLEDGEMENT_MARKER}\n<!-- technical-spec-sha256: ${createHash('sha256').update(specBytes).digest('hex')} -->\n# Controlled continuity fixture PRD\nImplementation surface: \`src/index.mjs\`.\n\n\`\`\`pipeline-architecture-design\n${JSON.stringify(continuityMethodArchitecture())}\n\`\`\`\n`);
  continuityMethodWriteSource(record,planPath,prdBytes,{replace:true});
  for (const [path,bytes] of [[companionPaths[0],'# Controlled synthetic design\nOne owned source lifecycle; no external authority.\n'],
      [companionPaths[1],'| ID | Evidence |\n| --- | --- |\n| AC-1 | Actual consumed source review and owning Verify terminal. |\n'],
      [reportPath,'# Controlled method design review\nSynthetic test material after actual source reads; no model/native reviewer attribution.\n'],
      [`${featureDir}/acceptance.md`,'# Controlled fixture acceptance\nActual owning source lifecycle required.\n'],
      [`${featureDir}/result.md`,'# Controlled fixture result\nSource-producer evidence remains required before close.\n'],
      [`${featureDir}/owned-next-feature.md`,'# Controlled next-feature fixture\nOnly the genuine orphan-prefix transition.\n']])
    continuityMethodWriteSource(record,path,Buffer.from(bytes),{replace:!path.includes('/review/')});
  const source=path=>{const {size,...ref}=continuityMethodPublicRef(repository.primaryRoot,path);return ref;};
  const design=createDesignReviewReceipt({featureId,previous:null,sources:{prd:source(planPath),spec:source(specPath),companions:companionPaths.map(source)},
    reviewer:{runner:'codex',model:'controlled-method-synthetic'},report:source(reportPath),openFindingIds:[],reviewedAt:new Date().toISOString()});
  if (!design.ok) fail(design.code,'controlled design receipt producer refused');
  continuityMethodWriteSource(record,receiptPath,Buffer.from(design.bytes));
  mkdirSync(join(repository.primaryRoot,'docs/adr'),{recursive:true,mode:0o700});
  continuityMethodGit(repository,['add','--',featureDir]);
  continuityMethodGit(repository,['-c','user.name=AUTH Unit','-c','user.email=auth@example.invalid','commit','-q','-m',"test(pipeline): prepare controlled continuity source inputs\n\nDispatch: stage-0 (elephant)\nAI-Assisted: true"]);
  const published=publishPoGateProfileReceipt({rootDir:repository.primaryRoot,
    userYamlText:readFileSync(join(repository.primaryRoot,'pipeline.user.yaml')),
    runtimeYamlText:readFileSync(join(repository.primaryRoot,'project/pipeline.yaml'))});
  if (!published.ok) fail('SDC-AUTHORITY-UNAVAILABLE','actual controlled profile publication refused');
  continuityMethodInvoke(record,['submit-plan','--by','controlled-method-author','--profile','feature']);
  continuityMethodInvoke(record,['present-plan','--by','controlled-method-presenter','--review-receipt',receiptPath]);
  const presented=continuityMethodState(repository.primaryRoot),requestPath=presented.planPresentation?.designApprovalRequestPath;
  if (typeof requestPath!=='string' || !/^scratch\/design-approval-request-[a-f0-9]{64}\.json$/.test(requestPath))
    fail('SDC-AUTHORITY-UNAVAILABLE','actual design request producer unavailable');
  const request=JSON.parse(readFileSync(continuityMethodPhysicalSource(repository.primaryRoot,requestPath)));
  const digest=request.approvalIntent?.sha256;
  if (!/^[a-f0-9]{64}$/.test(digest)) fail('SDC-AUTHORITY-CAS','actual design request intent malformed');
  const proof={schema:'pipeline.po-approval-proof.v1',intentSha256:digest,keyReference:signer.keyReference,
    publicKey:signer.publicKey,signatureBase64:sign(null,Buffer.from(digest),signer.privateKey).toString('base64')};
  continuityMethodWriteSource(record,requestPath.replace('request-','proof-'),Buffer.from(JSON.stringify(proof,null,2)+'\n'));
  continuityMethodInvoke(record,['approve-plan','--by','controlled-method-po','--design-approval-request',requestPath]);
  const approved=continuityMethodState(repository.primaryRoot),accepted=approved.planApproval?.acceptedContract;
  if (approved.planApproved!==true || !accepted?.path || !/^[a-f0-9]{64}$/.test(accepted.sha256)
      || continuityMethodPublicRef(repository.primaryRoot,accepted.path).sha256!==accepted.sha256)
    fail('SDC-AUTHORITY-CAS','genuine retained accepted contract readback unavailable');
  continuityMethodInvoke(record,['materialize-architecture']);
  const compiled=compileDecisionSummary(repository.primaryRoot);
  if (compiled.authorityStatus!=='source-validated') fail('SDC-AUTHORITY-UNAVAILABLE','actual architecture compiler unavailable');
  const manifestPath=`${featureDir}/lifecycle.json`;
  const artifact=(kind,path,authority,mutability,retention)=>({class:kind,path,
    sha256:continuityMethodPublicRef(repository.primaryRoot,path).sha256,authority,mutability,retention});
  const manifest={schema:'pipeline.feature-package.v1',feature:{id:featureId,rigor:2},state:'approved',
    artifacts:[artifact('prd',planPath,true,'mutable','active'),artifact('spec',specPath,true,'mutable','active'),
      artifact('acceptance',`${featureDir}/acceptance.md`,true,'mutable','active'),
      artifact('result',`${featureDir}/result.md`,true,'mutable','active'),
      artifact('candidate-evidence',accepted.path,false,'immutable','retain')],
    candidate:structuredClone(request.approvalIntent.value.candidate),supersedes:null};
  continuityMethodWriteSource(record,manifestPath,Buffer.from(JSON.stringify(manifest,null,2)+'\n'),{replace:true});
  const checkedPackage=validateFeaturePackage(repository.primaryRoot,manifestPath);
  if (!checkedPackage.ok) fail('SDC-AUTHORITY-UNAVAILABLE','actual controlled feature package validation refused');
  // Commit the genuine registered package before the distinct suite source candidate.
  const baselinePaths=[featureDir,'architecture','project/architecture-decisions.compiled.json'];
  continuityMethodGit(repository,['add','--',...baselinePaths]);
  continuityMethodGit(repository,['add','-f','--',accepted.path]);
  continuityMethodGit(repository,['-c','user.name=AUTH Unit','-c','user.email=auth@example.invalid','commit','-q','-m',"test(pipeline): register controlled continuity package\n\nDispatch: stage-0 (elephant)\nAI-Assisted: true"]);
  // Bind only the existing calibration tiers the sanctioned transition writes.
  const calibrationInputs=['project/pipeline.json','.claude/pipeline.json']
    .filter(path=>existsSync(join(repository.primaryRoot,path))).map(path=>{
      const ref=continuityMethodPublicRef(repository.primaryRoot,path);
      const value=JSON.parse(readFileSync(continuityMethodPhysicalSource(repository.primaryRoot,path)));
      if (!value || typeof value!=='object' || Array.isArray(value)
          || !continuityAuthorityEqual(continuityMethodPublicRef(repository.primaryRoot,path),ref))
        fail('SDC-AUTHORITY-CAS','controlled calibration preimage changed');
      return {path,ref,value};
    });
  // Enter the existing baseline-only lifecycle without changing calibration.
  continuityMethodInvoke(record,['set-phase','--phase','implementation']);
  // The existing approval-verified carrier selects only genuine committed tiers.
  continuityMethodInvoke(record,['configure-verify','--verify-command','node tests/unit.test.mjs']);
  const calibrationOutputs=calibrationInputs.map(({path,value})=>{
    const ref=continuityMethodPublicRef(repository.primaryRoot,path);
    const actual=JSON.parse(readFileSync(continuityMethodPhysicalSource(repository.primaryRoot,path)));
    if (!continuityAuthorityEqual(actual,{...value,verify:'node tests/unit.test.mjs'})
        || !continuityAuthorityEqual(continuityMethodPublicRef(repository.primaryRoot,path),ref))
      fail('SDC-AUTHORITY-CAS','controlled calibration output binding changed');
    return ref;
  });
  const implementation=continuityMethodState(repository.primaryRoot);
  if (derivePlanLifecycle(implementation).status!=='implementing')
    fail('SDC-AUTHORITY-CAS','actual implementation phase producer unavailable');
  // Calibration has its own narrow normal-hook commit, never a mixed delta.
  continuityMethodGit(repository,['add','--',...calibrationOutputs.map(ref=>ref.path)]);
  continuityMethodGit(repository,['-c','user.name=AUTH Unit','-c','user.email=auth@example.invalid','commit','-q','-m',"chore(pipeline): configure controlled continuity verification\n\nDispatch: stage-0 (elephant)\nAI-Assisted: true"]);
  for (const ref of calibrationOutputs) {
    if (!continuityAuthorityEqual(continuityMethodPublicRef(repository.primaryRoot,ref.path),ref)
        || continuityMethodGit(repository,['rev-parse','HEAD:'+ref.path])
          !==continuityMethodGit(repository,['hash-object','--',ref.path]))
      fail('SDC-AUTHORITY-CAS','controlled committed calibration readback changed');
  }
  // The suite candidate still has exactly this genuine baseline as its parent.
  record.reviewBaseCommit=continuityMethodGit(repository,['rev-parse','HEAD']);
  continuityMethodPrepareVerifySuite(record);
  const paths=[featureDir,'architecture','project/architecture-decisions.compiled.json','tests/unit.test.mjs','harness/verify-suites.json'];
  continuityMethodGit(repository,['add','--',...paths]);
  continuityMethodGit(repository,['add','-f','--',accepted.path]);
  continuityMethodGit(repository,['-c','user.name=AUTH Unit','-c','user.email=auth@example.invalid','commit','-q','-m',"test(pipeline): record approved controlled continuity artifacts\n\nDispatch: stage-0 (elephant)\nAI-Assisted: true"]);
  for (const ref of calibrationOutputs) {
    if (!continuityAuthorityEqual(continuityMethodPublicRef(repository.primaryRoot,ref.path),ref)
        || continuityMethodGit(repository,['rev-parse','HEAD:'+ref.path])
          !==continuityMethodGit(repository,['hash-object','--',ref.path]))
      fail('SDC-AUTHORITY-CAS','controlled committed calibration readback changed');
    record.publicSources.push(ref);
  }
  if (continuityMethodGit(repository,['status','--porcelain','--untracked-files=all'])!=='')
    fail('SDC-AUTHORITY-CAS','controlled continuity setup left unbound public writes');
  record.repository=continuityMethodRoot(repository.primaryRoot);
  record.preparedState=structuredClone(continuityMethodState(repository.primaryRoot));
  record.preparedObservation=structuredClone(observeSessionCleanupState(repository.primaryRoot));
  record.publicSources=record.publicSources.filter(ref=>!ref.path.startsWith('scratch/'))
    .map(ref=>continuityMethodPublicRef(repository.primaryRoot,ref.path));
  for (const path of [accepted.path,'architecture/design-materialization.json','project/architecture-decisions.compiled.json',
      'pipeline.user.yaml','project/pipeline.yaml','project/critical-human-proof.json'])
    record.publicSources.push(continuityMethodPublicRef(repository.primaryRoot,path));
  record.acceptedRef=structuredClone(accepted);record.nextFeaturePlan=`${featureDir}/owned-next-feature.md`;record.manifestPath=manifestPath;
  record.stateRef=continuityMethodPublicRef(repository.primaryRoot,
    relative(repository.primaryRoot,statePathForMethod(repository.primaryRoot)).split(sep).join('/'));
  const provenance={schema:'pipeline.controlled-continuity-artifact-preparation.v1',repository:record.repository,featureId,
    stateRef:record.stateRef,acceptedRef:record.acceptedRef,publicSources:record.publicSources,verifySuite:record.verifySuite,reviewBaseCommit:record.reviewBaseCommit,calls:record.calls,
    assurance:'method-source-producers-synthetic-inputs',modelOrNativeAcceptance:false};
  const provenancePath=join(expectedRoot,'artifact-preparation.json');
  const fd=openSync(provenancePath,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  try {writeFileSync(fd,canonicalJson(provenance));fsyncSync(fd);}finally {closeSync(fd);}
  record.provenanceRef=continuityAuthorityPrivateRef(record.repository,provenancePath);record.stage='prepared';
  return {preparationHandle:handle,repository:structuredClone(record.repository),featureId,
    stateRef:structuredClone(record.stateRef),provenanceRef:structuredClone(record.provenanceRef),
    sourceRefs:record.publicSources.map(ref=>({...ref})),verifySuite:structuredClone(record.verifySuite),assurance:'method-source-producers-synthetic-inputs',nativeAcceptance:false};
}

function continuityMethodReadPreparation({repository,preparationHandle,checkInitialState=true}) {
  const record=continuityMethodPreparations.get(preparationHandle);
  if (!record || record.stage!=='prepared' || continuityMethodPreparationRoots.get(repository.primaryRoot)!==record
      || !continuityAuthorityEqual(record.repository,continuityAuthorityRepository(repository)))
    fail('SDC-AUTHORITY-UNAVAILABLE','genuine exact source-owned preparation required');
  const path=join(repository.commonDir,record.provenanceRef.path.slice(5));
  if (!continuityAuthorityEqual(continuityAuthorityPrivateRef(repository,path),record.provenanceRef)
      || (checkInitialState&&!continuityAuthorityEqual(continuityMethodPublicRef(repository.primaryRoot,record.stateRef.path),record.stateRef)))
    fail('SDC-AUTHORITY-CAS','controlled preparation source changed');
  for (const ref of record.publicSources) {
    if (!continuityAuthorityEqual(continuityMethodPublicRef(repository.primaryRoot,ref.path),ref))
      fail('SDC-AUTHORITY-CAS','controlled preparation public source changed');
  }
  if (record.methodDispatchHandle) {
    const method=inspectSourceOwnedControlledMethodDispatchHandle({methodDispatchHandle:record.methodDispatchHandle});
    if (!continuityAuthorityEqual(method.repository,record.repository)) fail('SDC-METHOD-DISPATCH-CAS','METHOD preparation continuation changed');
  }
  return record;
}

// Private preparation ownership is the sole METHOD constructor entry.
export function inspectControlledMethodContinuityDispatchPreparation(input) {
  if (!exactKeys(input,new Set(['repository','preparationHandle'])))
    fail('SDC-METHOD-DISPATCH-INPUT','closed private METHOD preparation input required');
  const {repository,preparationHandle}=input;
  const record=continuityMethodReadPreparation({repository,preparationHandle});
  continuityMethodAssertBeforeAuthority(record.repository);
  if (!record.verifySuite || record.methodDispatchHandle || !/^[a-f0-9]{40}$/.test(record.reviewBaseCommit??''))
    fail('SDC-METHOD-DISPATCH-UNAVAILABLE','unconsumed genuine METHOD preparation required');
  if (continuityMethodGit(repository,['rev-parse','HEAD^'])!==record.reviewBaseCommit)
    fail('SDC-METHOD-DISPATCH-CAS','genuine suite source commit parent changed');
  const accepted=readSanctionedAcceptedContract({dir:repository.primaryRoot,envelopePath:record.acceptedRef.path});
  if (!accepted.ok || accepted.envelopeSha256!==record.acceptedRef.sha256
      || accepted.authorityBasis!=='signature' || accepted.cryptographicallyAuthenticated!==true)
    fail('SDC-METHOD-DISPATCH-UNAVAILABLE','actual accepted signature preparation unavailable');
  return Object.freeze({repository:structuredClone(record.repository),featureId:record.featureId,
    fixtureRoot:record.fixtureRoot,preparationRef:structuredClone(record.provenanceRef),
    reviewBaseCommit:record.reviewBaseCommit,specRef:continuityMethodPublicRef(repository.primaryRoot,record.specPath),
    manifestPath:record.manifestPath,acceptedRef:structuredClone(record.acceptedRef),verifySuite:structuredClone(record.verifySuite)});
}

// One pre-reservation diagnostic registration continuation, never held rebase.
export function completeControlledMethodContinuityDispatchPreparation(input) {
  if (!exactKeys(input,new Set(['preparationHandle','methodDispatchHandle'])))
    fail('SDC-METHOD-DISPATCH-INPUT','closed private METHOD continuation input required');
  const {preparationHandle,methodDispatchHandle}=input;
  const record=continuityMethodPreparations.get(preparationHandle);
  if (!record || record.stage!=='prepared' || record.methodDispatchHandle
      || continuityMethodPreparationRoots.get(record.repository.primaryRoot)!==record)
    fail('SDC-METHOD-DISPATCH-UNAVAILABLE','private unconsumed preparation required');
  const observed=inspectSourceOwnedControlledMethodDispatchHandle({methodDispatchHandle});
  if (!continuityAuthorityEqual(observed.previousRepository,record.repository)
      || observed.featureId!==record.featureId || observed.reviewBaseCommit!==record.reviewBaseCommit
      || !continuityAuthorityEqual(observed.preparationRef,record.provenanceRef)
      || !continuityAuthorityEqual(observed.reviewCandidate,record.repository.candidate))
    fail('SDC-METHOD-DISPATCH-CAS','METHOD continuation does not own original preparation');
  continuityMethodAssertBeforeAuthority(observed.repository);
  const originalManifest=record.publicSources.find(ref=>ref.path===record.manifestPath);
  if (!originalManifest || !continuityAuthorityEqual(originalManifest,observed.manifestBefore)
      || observed.manifestAfter.path!==record.manifestPath
      || !continuityAuthorityEqual(continuityMethodPublicRef(record.repository.primaryRoot,record.stateRef.path),record.stateRef))
    fail('SDC-METHOD-DISPATCH-CAS','pre-reservation METHOD state/manifest preimage changed');
  for (const ref of record.publicSources.filter(ref=>ref.path!==record.manifestPath))
    if (!continuityAuthorityEqual(continuityMethodPublicRef(record.repository.primaryRoot,ref.path),ref))
      fail('SDC-METHOD-DISPATCH-CAS','unrelated preparation source changed');
  const fresh=continuityMethodRoot(record.repository.primaryRoot);
  if (!continuityAuthorityEqual(fresh,observed.repository))
    fail('SDC-METHOD-DISPATCH-CAS','actual diagnostic registration repository changed');
  record.repository=fresh;
  record.publicSources=record.publicSources.map(ref=>ref.path===record.manifestPath?structuredClone(observed.manifestAfter):ref);
  for (const ref of observed.evidenceRefs.filter(ref=>ref.path!==record.manifestPath))record.publicSources.push(structuredClone(ref));
  record.methodDispatchHandle=methodDispatchHandle;
  return Object.freeze({repository:structuredClone(record.repository),featureId:record.featureId,
    methodDispatch:observed,assurance:'controlled-source-method',productionDispatchAuthority:false});
}

// Read-only inter-module bridge. This reads actual private source ownership; it
// cannot construct an operation, grant a caller phase or recover a native actor.
export function inspectControlledMethodContinuityCarrierContext({repository,operationHandle,executionHandle,memberRef}) {
  const port=createOnboardingContinuityAuthorityProducerPort({repository}),data=continuityAuthorityPorts.get(port);
  const operation=continuityAuthorityOperation(data,operationHandle);
  if (operation.legacy || operation.phase!=='armed' || operation.executionHandle!==executionHandle
      || continuityAuthorityExecutions.get(executionHandle)?.operation!==operation
      || !continuityAuthorityEqual(operation.expectedMemberRef,memberRef))
    fail('SDC-AUTHORITY-CAS','controlled carrier original owning operation changed');
  const current=continuityAuthorityCurrent(data,operation.requesterHandle);
  if (current.assurance!=='controlled-unit-method')
    fail('SDC-AUTHORITY-UNAVAILABLE','controlled carrier cannot claim native requester authority');
  continuityAuthorityCheckJournals(operation);
  const memberPath=join(repository.commonDir,memberRef.path.slice(5));
  if (!continuityAuthorityEqual(continuityAuthorityPrivateRef(repository,memberPath),memberRef))
    fail('SDC-AUTHORITY-CAS','controlled carrier member source changed');
  const member=JSON.parse(assertPrivateCleanupFile(memberPath,'controlled carrier member'));
  const observed=port.observeOperation(operationHandle);
  if (member.producerId!=='onboarding-continuity' || member.phase!=='armed'
      || member.bindingSha256!==observed.bindingSha256 || !continuityAuthorityEqual(member.association,observed.association)
      || !continuityAuthorityEqual(member.kinds,observed.kinds) || !continuityAuthorityEqual(member.sourceFacts,observed.sourceFacts))
    fail('SDC-AUTHORITY-CAS','controlled carrier exact source member observation changed');
  const preparation=continuityMethodPreparationRoots.get(repository.primaryRoot);
  if (!preparation) fail('SDC-AUTHORITY-UNAVAILABLE','actual source-owned carrier preparation unavailable');
  const record=continuityMethodReadPreparation({repository,preparationHandle:preparation.handle,checkInitialState:false});
  const state=continuityMethodState(repository.primaryRoot);
  const acceptedRef=state.planApproval?.acceptedContract;
  if (state.activeFeature?.id!==record.featureId || state.activeFeature.planPath!==record.planPath
      || state.planApproved!==true || derivePlanLifecycle(state).status!=='implementing'
      || !acceptedRef?.path || !/^[a-f0-9]{64}$/.test(acceptedRef.sha256)
      || continuityMethodPublicRef(repository.primaryRoot,acceptedRef.path).sha256!==acceptedRef.sha256)
    fail('SDC-AUTHORITY-CAS','controlled carrier source-approved feature changed');
  const accepted=readSanctionedAcceptedContract({dir:repository.primaryRoot,envelopePath:acceptedRef.path});
  if (!accepted.ok || accepted.envelopeSha256!==acceptedRef.sha256
      || accepted.authorityBasis!=='signature' || accepted.cryptographicallyAuthenticated!==true)
    fail('SDC-AUTHORITY-UNAVAILABLE','actual controlled carrier accepted signature envelope unavailable');
  const active=inspectSourceOwnedCurrentAuthorityContext({repository});
  if (active.status!=='bound' || active.requesterHandle!==operation.requesterHandle
      || active.assurance!=='controlled-unit-method' || !active.currentInvocationHandle
      || !/^[a-f0-9]{64}$/.test(active.invocationBindingSha256))
    fail('SDC-AUTHORITY-UNAVAILABLE','actual current carrier invocation unavailable');
  return Object.freeze({repository:structuredClone(repository),featureId:record.featureId,planPath:record.planPath,specPath:record.specPath,
    manifestPath:record.manifestPath,acceptedRef:structuredClone(acceptedRef),preparationRef:structuredClone(record.provenanceRef),
    publicSources:record.publicSources.map(ref=>({...ref})),verifySuite:structuredClone(record.verifySuite),methodDispatch:record.methodDispatchHandle?inspectSourceOwnedControlledMethodDispatchHandle({methodDispatchHandle:record.methodDispatchHandle}):null,operation:observed,memberRef:structuredClone(memberRef),
    currentRequester:structuredClone(current),invocationBindingSha256:active.invocationBindingSha256,assurance:'controlled-unit-method'});
}

// Only the original controlled local preparation retains an invocation. No
// caller record or stale descriptor can create this private terminal join.
const continuityRetainedOwnerInvocations = new WeakMap();
const continuityRetiredOwnerScope = new AsyncLocalStorage();
function retainContinuityControlledOwnerInvocation(operation) {
  const observed=inspectSourceOwnedCurrentAuthorityContext({repository:operation.data.repository});
  if(observed.status!=='bound'||observed.requesterHandle!==operation.requesterHandle)
    fail('SDC-AUTHORITY-UNAVAILABLE','continuity original invocation unavailable');
  if(observed.assurance!=='controlled-unit-method')return;
  if(!observed.currentInvocationHandle||!observed.runtimePort
      ||!continuityAuthorityEqual(operation.association.target,{
        sessionId:observed.currentRequester.sessionId,
        descriptorSha256:observed.currentRequester.descriptorSha256,
        ownerNonceSha256:observed.currentRequester.ownerNonceSha256}))
    fail('SDC-AUTHORITY-CAS','continuity local owner invocation changed');
  const ownerHandle=observeOwnedSessionDescriptorOwnerHandle({repository:operation.data.repository,
    target:operation.association.target});
  continuityRetainedOwnerInvocations.set(operation,Object.freeze({
    currentInvocationHandle:observed.currentInvocationHandle,runtimePort:observed.runtimePort,
    ownerHandle,sourceRef:observed.sourceRef,invocationBindingSha256:observed.invocationBindingSha256,
    currentRequester:observed.currentRequester}));
}
function continuityReadRetiredOwner(operation) {
  const scope=continuityRetiredOwnerScope.getStore();
  if(!scope||scope.operation!==operation
      ||!['close-feature','release-owned-transition'].includes(scope.entry))
    fail('SDC-AUTHORITY-UNAVAILABLE','continuity owning terminal scope required');
  const retained=continuityRetainedOwnerInvocations.get(operation);
  if(!retained)fail('SDC-AUTHORITY-UNAVAILABLE','continuity original local owner was not retained');
  const observed=inspectSourceOwnedRetiredOwnerTerminalContext({repository:operation.data.repository});
  if(observed.status!=='terminal-observed'||observed.requesterHandle!==operation.requesterHandle
      ||observed.currentInvocationHandle!==retained.currentInvocationHandle
      ||observed.runtimePort!==retained.runtimePort||observed.assurance!=='controlled-unit-method'
      ||!continuityAuthorityEqual(observed.sourceRef,retained.sourceRef)
      ||observed.invocationBindingSha256!==retained.invocationBindingSha256
      ||!continuityAuthorityEqual(observed.currentRequester,retained.currentRequester)
      ||!continuityAuthorityEqual(observed.closure.target,operation.association.target)
      ||observed.closure.assurance!=='physical-owner-retirement')
    fail('SDC-AUTHORITY-CAS','continuity retired original invocation changed');
  return observed.currentRequester;
}
function runOwnedContinuityRetiredTerminal(operation,entry,callback) {
  if(!['close-feature','release-owned-transition'].includes(entry)
      ||typeof callback!=='function'||continuityRetiredOwnerScope.getStore()
      ||continuityAuthorityOperations.get(operation.operationHandle)!==operation
      ||operation.phase!=='armed'||operation.legacy)
    fail('SDC-AUTHORITY-UNAVAILABLE','unsupported continuity owning terminal route');
  const retained=continuityRetainedOwnerInvocations.get(operation);
  if(!retained)fail('SDC-AUTHORITY-UNAVAILABLE','continuity original local invocation unavailable');
  const repository=continuityAuthorityRepository(operation.data.repository);
  if(observeOwnedSessionDescriptorOwnerHandle({repository,target:operation.association.target})!==retained.ownerHandle)
    fail('SDC-AUTHORITY-CAS','continuity descriptor owning capability changed');
  const closureHandle=observeOwnedSessionDescriptorClosureHandle({repository,
    target:operation.association.target,ownerHandle:retained.ownerHandle});
  return withSourceOwnedRetiredOwnerTerminalContext({repository,
    currentInvocationHandle:retained.currentInvocationHandle,runtimePort:retained.runtimePort,
    ownerHandle:retained.ownerHandle,closureHandle},()=>continuityRetiredOwnerScope.run({operation,entry},()=>{
      continuityReadRetiredOwner(operation);continuityAuthorityCheckJournals(operation);
      const result=callback();
      if(result&&typeof result.then==='function')fail('SDC-AUTHORITY-UNAVAILABLE','asynchronous owning terminal callback');
      continuityReadRetiredOwner(operation);continuityAuthorityCheckJournals(operation);return result;
    }));
}

// Controlled method exercise only. The original production request is unchanged.
const controlledAfkExercisePorts=new WeakMap();
const controlledAfkExerciseScope=new AsyncLocalStorage();
const controlledAfkExerciseIds=new Set(['replay-settled-admission','run-companion-without-own-context',
  'interrupt-after-host-settled','interrupt-after-state-rename']);
const controlledAfkExerciseCodes=new Set(['SDC-AUTHORITY-UNAVAILABLE','SDC-AUTHORITY-CAS',
  'SDC-AUTHORITY-HELD','SDC-PRIVATE-PATH','SDC-LOCK-HELD']);
function controlledAfkExerciseRefuse(error) {
  fail(controlledAfkExerciseCodes.has(error?.code)?error.code:'SDC-AUTHORITY-UNAVAILABLE',
    'controlled AFK exercise context unavailable');
}
function controlledAfkExerciseSourceContext() {
  return ['onboarding-continuity.mjs','afk-transaction-host.mjs','afk-ledger.mjs',
    'session-requester-bridge.mjs','../scripts/pipeline-state.mjs'].map(name=>{
      const path=fileURLToPath(new URL(name,import.meta.url));
      return continuityAuthorityFact(path,'controlled-afk-exercise-source',{pathSha256:canonicalSha256(path)});
    });
}
function controlledAfkExerciseOrigin(value) {
  const repository=continuityAuthorityRepository(value.repository);
  const observed=inspectSourceOwnedRequesterInvocation({repository,
    currentInvocationHandle:value.currentInvocationHandle,runtimePort:value.runtimePort});
  const active=inspectSourceOwnedCurrentAuthorityContext({repository});
  if(observed.status!=='bound'||active.status!=='bound'||observed.assurance!=='controlled-unit-method'
      ||active.assurance!=='controlled-unit-method'||active.currentInvocationHandle!==value.currentInvocationHandle
      ||active.runtimePort!==value.runtimePort||active.requesterHandle!==observed.requesterHandle
      ||active.descriptorHandle!==observed.descriptorHandle
      ||!continuityAuthorityEqual(active.sourceRef,observed.sourceRef)
      ||active.invocationBindingSha256!==observed.invocationBindingSha256
      ||!continuityAuthorityEqual(active.controllerIdentity,observed.controllerIdentity)
      ||!continuityAuthorityEqual(active.currentRequester,observed.currentRequester))
    fail('SDC-AUTHORITY-CAS','controlled AFK original invocation changed');
  const ref=observed.sourceRef;
  if(!ref||typeof ref.path!=='string'||!ref.path.startsWith('.git/agent-pipeline/'))
    fail('SDC-PRIVATE-PATH','controlled AFK invocation source path');
  const path=join(repository.commonDir,ref.path.slice(5));
  if(!continuityAuthorityEqual(ref,continuityAuthorityPrivateRef(repository,path)))
    fail('SDC-AUTHORITY-CAS','controlled AFK origin source ref changed');
  const source=JSON.parse(assertPrivateCleanupFile(path,'controlled AFK origin'));
  if(!exactKeys(source,new Set(['schema','repositorySha256','process','assurance','fixtureRoot','eventId']))
      ||source.schema!=='pipeline.controlled-requester-invocation.v1'
      ||source.repositorySha256!==canonicalSha256({primaryRoot:repository.primaryRoot,commonDir:repository.commonDir})
      ||source.assurance!=='controlled-unit-method'||source.fixtureRoot!==value.fixtureRoot
      ||source.process?.pid!==process.pid||! /^[a-f0-9]{32}$/u.test(source.eventId??'')
      ||canonicalSha256(source)!==observed.invocationBindingSha256
      ||dirname(value.fixtureRoot)!==join(repository.commonDir,'agent-pipeline','controlled-method-fixtures')
      ||realpathSync(value.fixtureRoot)!==value.fixtureRoot
      ||!continuityAuthorityEqual(ref,continuityAuthorityPrivateRef(repository,path)))
    fail('SDC-AUTHORITY-CAS','controlled AFK Source origin changed');
  const directory=lstatSync(value.fixtureRoot);
  if(!directory.isDirectory()||directory.isSymbolicLink()||(directory.mode&0o077)!==0
      ||typeof process.getuid!=='function'||directory.uid!==process.getuid())
    fail('SDC-PRIVATE-PATH','controlled AFK fixture directory custody');
  if(value.origin&&(observed.requesterHandle!==value.origin.requesterHandle
      ||observed.descriptorHandle!==value.origin.descriptorHandle
      ||observed.invocationBindingSha256!==value.origin.invocationBindingSha256
      ||!continuityAuthorityEqual(observed.sourceRef,value.origin.sourceRef)
      ||!continuityAuthorityEqual(observed.controllerIdentity,value.origin.controllerIdentity)
      ||!continuityAuthorityEqual(observed.currentRequester,value.origin.currentRequester)))
    fail('SDC-AUTHORITY-CAS','controlled AFK retained requester changed');
  const modules=controlledAfkExerciseSourceContext();
  if(value.modules&&!continuityAuthorityEqual(modules,value.modules))
    fail('SDC-AUTHORITY-CAS','controlled AFK exercise module context changed');
  return {observed,modules};
}
function controlledAfkExerciseCurrent() {
  const value=controlledAfkExerciseScope.getStore();
  if(!value)return null;
  if(value.closed||controlledAfkExercisePorts.get(value.port)!==value)
    fail('SDC-AUTHORITY-CAS','controlled AFK exercise scope closed');
  controlledAfkExerciseOrigin(value);
  if(value.operation&&(continuityAuthorityOperations.get(value.operation.operationHandle)!==value.operation
      ||continuityAuthorityExecutions.get(value.request.executionHandle)?.operation!==value.operation
      ||value.operation.executionHandle!==value.request.executionHandle
      ||value.operation.data!==value.data||value.operation.requesterHandle!==value.origin.requesterHandle
      ||value.operation.legacy||value.operation.phase!=='armed'))
    fail('SDC-AUTHORITY-CAS','controlled AFK original operation changed');
  return value;
}
function controlledAfkExerciseDirectory(repository,path) {
  let current=repository.commonDir;
  const components=relative(current,path).split(sep);
  if(components.some(part=>!part||part==='.'||part==='..')||isAbsolute(relative(current,path)))
    fail('SDC-PRIVATE-PATH','controlled AFK readback directory outside common root');
  for(const part of components){
    current=join(current,part);let info;
    try{info=lstatSync(current);}catch(error){
      if(error?.code!=='ENOENT')throw error;
      const parent=dirname(current),before=lstatSync(parent),names=readdirSync(parent).sort();
      try{lstatSync(current);fail('SDC-AUTHORITY-CAS','controlled AFK absent directory appeared');}
      catch(second){if(second?.code!=='ENOENT')throw second;}
      const after=lstatSync(parent);
      if(before.dev!==after.dev||before.ino!==after.ino||before.mode!==after.mode
          ||!continuityAuthorityEqual(names,readdirSync(parent).sort()))
        fail('SDC-AUTHORITY-CAS','controlled AFK absence parent changed');
      return null;
    }
    if(!info.isDirectory()||info.isSymbolicLink()||(info.mode&0o077)!==0
        ||typeof process.getuid!=='function'||info.uid!==process.getuid()||realpathSync(current)!==current)
      fail('SDC-PRIVATE-PATH','controlled AFK readback directory custody');
  }
  const info=lstatSync(path),names=readdirSync(path).sort();
  if(names.length>4096)fail('SDC-AUTHORITY-UNAVAILABLE','controlled AFK readback entry bound');
  return {identity:{dev:String(info.dev),ino:String(info.ino),mode:info.mode,nlink:info.nlink},names};
}
// This is a private physical observation of an already authenticated interrupted
// course. It never reconciles, creates a producer, or admits a writer.
function controlledAfkPhysicalRequire(condition) {
  if(!condition)fail('SDC-AUTHORITY-CAS','controlled AFK physical record unresolved');
}
function controlledAfkPhysicalClosed(value,keys) {
  controlledAfkPhysicalRequire(exactKeys(value,new Set(keys)));
  return value;
}
function controlledAfkPhysicalDigest(value) {
  controlledAfkPhysicalRequire(typeof value==='string'&&/^[a-f0-9]{64}$/u.test(value));
}
function controlledAfkPhysicalGeneration(value) {
  controlledAfkPhysicalRequire(Number.isSafeInteger(value)&&value>0);
}
function controlledAfkPhysicalId(value) {
  controlledAfkPhysicalRequire(typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{2,79}$/u.test(value));
}
function controlledAfkPhysicalRef(value,path=null) {
  controlledAfkPhysicalClosed(value,['path','sha256','size']);controlledAfkPhysicalDigest(value.sha256);
  controlledAfkPhysicalRequire(typeof value.path==='string'&&value.path.startsWith('.git/agent-pipeline/')
    &&!value.path.includes('\\')&&!value.path.split('/').some(part=>!part||part==='.'||part==='..')
    &&Number.isSafeInteger(value.size)&&value.size>=0&&(path===null||value.path===`.git/${path}`));
}
function controlledAfkPhysicalTarget(value) {
  controlledAfkPhysicalClosed(value,['sessionId','descriptorSha256','ownerNonceSha256']);
  controlledAfkPhysicalId(value.sessionId);controlledAfkPhysicalDigest(value.descriptorSha256);
  controlledAfkPhysicalDigest(value.ownerNonceSha256);
}
function controlledAfkPhysicalTime(value) {
  controlledAfkPhysicalRequire(typeof value==='string'&&Number.isFinite(Date.parse(value))
    &&new Date(value).toISOString()===value);
}
function controlledAfkPhysicalSourceFacts(values) {
  const namespaces=['registered-activations','activation-generations','writer-recovery-locks'];
  controlledAfkPhysicalRequire(Array.isArray(values)&&values.length<=4096);
  let total=0;
  for(const value of values){
    controlledAfkPhysicalClosed(value,['namespaceId','pathSha256','sha256','size','identity','semanticSha256']);
    controlledAfkPhysicalRequire(namespaces.includes(value.namespaceId));
    for(const digest of [value.pathSha256,value.sha256,value.semanticSha256])controlledAfkPhysicalDigest(digest);
    controlledAfkPhysicalClosed(value.identity,['dev','ino','mode','nlink']);
    controlledAfkPhysicalRequire(typeof value.identity.dev==='string'&&/^\d+$/u.test(value.identity.dev)
      &&typeof value.identity.ino==='string'&&/^\d+$/u.test(value.identity.ino)
      &&Number.isSafeInteger(value.identity.mode)&&value.identity.nlink===1
      &&Number.isSafeInteger(value.size)&&value.size>=0&&value.size<=1048576);
    total+=value.size;
  }
  controlledAfkPhysicalRequire(total<=16777216);
}
function controlledAfkPhysicalRecord(repository,path,expectedRef,readset) {
  const absolute=join(repository.commonDir,path),directory=dirname(absolute);
  controlledAfkPhysicalRequire(path.startsWith('agent-pipeline/session-authority/')
    &&!path.includes('\\')&&!path.split('/').some(part=>!part||part==='.'||part==='..'));
  const topology=controlledAfkExerciseDirectory(repository,directory);
  controlledAfkPhysicalRequire(topology!==null);
  const initial=lstatSync(absolute);
  controlledAfkPhysicalRequire(initial.isFile()&&!initial.isSymbolicLink()&&initial.nlink===1&&initial.size<=1048576);
  const bytes=assertPrivateCleanupFile(absolute,'controlled AFK physical record');
  const parsed=JSON.parse(bytes.toString('utf8'));
  controlledAfkPhysicalRequire(bytes.length<=1048576&&bytes.toString('utf8')===canonicalJson(parsed));
  const fact=continuityAuthorityFact(absolute,'controlled-afk-physical-record',parsed);
  const ref=continuityAuthorityPrivateRef(repository,absolute);
  controlledAfkPhysicalRequire(ref.sha256===sha256(bytes)&&ref.size===bytes.length
    &&fact.sha256===ref.sha256&&fact.size===ref.size
    &&(process.platform==='win32'||(fact.identity.mode&0o777)===0o600)
    &&continuityAuthorityEqual(topology,controlledAfkExerciseDirectory(repository,directory)));
  if(expectedRef!==null){controlledAfkPhysicalRef(expectedRef,path);controlledAfkPhysicalRequire(continuityAuthorityEqual(expectedRef,ref));}
  controlledAfkPhysicalRequire(!readset.records.has(path));
  readset.total+=bytes.length;controlledAfkPhysicalRequire(readset.total<=16777216);
  readset.records.set(path,{path,parsed,fact,ref,directory,topology});
  return {record:parsed,ref};
}
function controlledAfkPhysicalMember(record,repository,participant) {
  controlledAfkPhysicalClosed(record,['schema','repositorySha256','producerId','memberId','memberGeneration','revision',
    'association','kinds','bindingSha256','phase','sourceFacts','createdAt','updatedAt','releaseRef']);
  controlledAfkPhysicalRequire(record.schema==='pipeline.session-authority-member.v1'
    &&record.repositorySha256===canonicalSha256({primaryRoot:repository.primaryRoot,commonDir:repository.commonDir})
    &&record.producerId===participant.producerId);
  controlledAfkPhysicalId(record.memberId);controlledAfkPhysicalGeneration(record.memberGeneration);
  controlledAfkPhysicalGeneration(record.revision);controlledAfkPhysicalDigest(record.bindingSha256);
  controlledAfkPhysicalClosed(record.association,['state','target']);
  if(record.association.state==='bound')controlledAfkPhysicalTarget(record.association.target);
  else controlledAfkPhysicalRequire(record.association.state==='unbound'&&record.association.target===null);
  controlledAfkPhysicalRequire(continuityAuthorityEqual(record.kinds,['armed-capability'])
    &&['reserved','armed','running','terminal-observed','released'].includes(record.phase));
  controlledAfkPhysicalSourceFacts(record.sourceFacts);
  controlledAfkPhysicalTime(record.createdAt);controlledAfkPhysicalTime(record.updatedAt);
  if(record.phase==='released')controlledAfkPhysicalRef(record.releaseRef,
    `agent-pipeline/session-authority/releases/afk-ledger/${record.memberId}.${record.memberGeneration}.json`);
  else controlledAfkPhysicalRequire(record.releaseRef===null);
}
function controlledAfkPhysicalRelease(record,member,repository,participant) {
  controlledAfkPhysicalClosed(record,['schema','repositorySha256','producerId','memberId','memberGeneration',
    'memberPreimageSha256','bindingSha256','terminal','sourceFacts','createdAt']);
  controlledAfkPhysicalRequire(record.schema==='pipeline.session-authority-release.v1'
    &&record.repositorySha256===canonicalSha256({primaryRoot:repository.primaryRoot,commonDir:repository.commonDir})
    &&record.producerId===participant.producerId&&record.memberId===member.memberId
    &&record.memberGeneration===member.memberGeneration&&record.bindingSha256===member.bindingSha256
    &&['completed','cancelled','consumed','revoked','stopped','continuity-released'].includes(record.terminal));
  controlledAfkPhysicalDigest(record.memberPreimageSha256);controlledAfkPhysicalSourceFacts(record.sourceFacts);
  controlledAfkPhysicalRequire(record.sourceFacts.length>0);controlledAfkPhysicalTime(record.createdAt);
}
function controlledAfkRenamedPhysicalMembers(value,state) {
  controlledAfkExerciseOrigin(value);
  const marker=value.renamedStateObservation,anchor=value.ledgerObservationAnchor;
  const operation=value.operation,row=value.admissionRow,repository=value.repository;
  controlledAfkPhysicalRequire(value.exercise==='interrupt-after-state-rename'
    &&value.reachedStage==='after-atomic-State-rename-before-directory-sync'
    &&controlledAfkExercisePorts.get(value.port)===value&&!value.closed&&value.used
    &&marker&&anchor&&value.before&&value.originalResult?.status==='unavailable'
    &&marker.operation===operation&&marker.executionHandle===value.request.executionHandle
    &&marker.row===row&&row?.closed===true&&row.phase==='settled'
    &&continuityAfkAdmissions.get(row.admissionHandle)===row
    &&continuityAfkAdmissionByOperation.get(operation)===undefined
    &&continuityAuthorityOperations.get(value.request.operationHandle)===operation
    &&continuityAuthorityExecutions.get(value.request.executionHandle)?.operation===operation
    &&operation.data===value.data&&operation.requesterHandle===value.origin.requesterHandle
    &&operation.executionHandle===value.request.executionHandle&&!operation.legacy&&operation.phase==='armed'
    &&row.operation===operation&&row.data===value.data&&row.executionHandle===value.request.executionHandle
    &&row.inputSha256===canonicalSha256(value.request.input)&&row.projectionRead===true
    &&row.projectionContextHandle===marker.contextHandle
    &&continuityAuthorityEqual(marker.memberRef,operation.expectedMemberRef)
    &&continuityAuthorityEqual(marker.state,state));
  const root='agent-pipeline/session-authority',readset={records:new Map(),total:0};
  const common=lstatSync(repository.commonDir);
  controlledAfkPhysicalRequire(common.isDirectory()&&!common.isSymbolicLink()
    &&realpathSync(repository.commonDir)===repository.commonDir
    &&typeof process.getuid==='function'&&common.uid===process.getuid());
  const commonIdentity=stat=>({dev:String(stat.dev),ino:String(stat.ino),mode:stat.mode,nlink:stat.nlink,uid:stat.uid});
  const directories=[join(repository.commonDir,'agent-pipeline'),
    ...['','/producers','/members','/members/afk-ledger','/releases','/releases/afk-ledger']
      .map(suffix=>join(repository.commonDir,`${root}${suffix}`))];
  const topology=directories.map(path=>controlledAfkExerciseDirectory(repository,path));
  controlledAfkPhysicalRequire(topology[0]!==null&&topology[1]!==null&&topology[2]!==null);
  const catalogue=controlledAfkPhysicalRecord(repository,`${root}/catalogue.json`,null,readset).record;
  controlledAfkPhysicalClosed(catalogue,['schema','repositorySha256','generation','participantSetSha256','participants','producers']);
  const repositorySha256=canonicalSha256({primaryRoot:repository.primaryRoot,commonDir:repository.commonDir});
  controlledAfkPhysicalRequire(catalogue.schema==='pipeline.session-authority-catalogue.v1'
    &&catalogue.repositorySha256===repositorySha256);
  controlledAfkPhysicalGeneration(catalogue.generation);controlledAfkPhysicalDigest(catalogue.participantSetSha256);
  const ids=['onboarding-continuity','human-guard-override','chat-gate','state-push-challenge',
    'native-goldfish','managed-codex','agy-session-consent','agy-family-dispatch','model-family-host',
    'afk-ledger','session-power','local-worker-supervisor'];
  controlledAfkPhysicalRequire(Array.isArray(catalogue.participants)&&catalogue.participants.length===12
    &&Array.isArray(catalogue.producers)&&catalogue.producers.length===12
    &&canonicalSha256(catalogue.participants)===catalogue.participantSetSha256
    &&catalogue.participantSetSha256===anchor.record.participantSetSha256);
  for(let i=0;i<ids.length;i++){
    const participant=catalogue.participants[i],index=catalogue.producers[i];
    controlledAfkPhysicalClosed(participant,['producerId','kinds','sourcePaths','sourceSha256','namespaceIds']);
    controlledAfkPhysicalClosed(index,['producerId','producerRef','producerGeneration']);
    controlledAfkPhysicalRequire(participant.producerId===ids[i]&&index.producerId===ids[i]);
    controlledAfkPhysicalDigest(participant.sourceSha256);controlledAfkPhysicalGeneration(index.producerGeneration);
    controlledAfkPhysicalRef(index.producerRef,`${root}/producers/${ids[i]}.json`);
  }
  const participant=catalogue.participants[9],index=catalogue.producers[9];
  const sourcePaths=['plugins/pipeline-core/lib/afk-ledger.mjs','plugins/pipeline-core/lib/afk-transaction-host.mjs',
    'plugins/pipeline-core/lib/session-authority-domain-owner.mjs'];
  controlledAfkPhysicalRequire(continuityAuthorityEqual(participant.kinds,['armed-capability'])
    &&continuityAuthorityEqual(participant.namespaceIds,['registered-activations','activation-generations','writer-recovery-locks'])
    &&continuityAuthorityEqual(participant.sourcePaths,sourcePaths));
  const sources=sourcePaths.map(path=>{
    const absolute=fileURLToPath(new URL(path.slice('plugins/pipeline-core/lib/'.length),import.meta.url));
    const fact=continuityAuthorityFact(absolute,'controlled-afk-physical-source',{pathSha256:canonicalSha256(absolute)});
    return {path,absolute,fact};
  });
  controlledAfkPhysicalRequire(participant.sourceSha256===canonicalSha256(sources.map(({path,fact})=>({path,sha256:fact.sha256})))
    &&participant.sourceSha256===anchor.record.sourceSha256);
  const producer=controlledAfkPhysicalRecord(repository,`${root}/producers/afk-ledger.json`,index.producerRef,readset).record;
  controlledAfkPhysicalClosed(producer,['schema','repositorySha256','producerId','generation','participantSetSha256',
    'sourceSha256','baseline','members','targetCertificates','lastTransitionSha256']);
  controlledAfkPhysicalRequire(producer.schema==='pipeline.session-authority-producer.v1'
    &&producer.repositorySha256===repositorySha256&&producer.producerId==='afk-ledger'
    &&producer.generation===index.producerGeneration&&producer.generation>=anchor.record.generation
    &&producer.participantSetSha256===catalogue.participantSetSha256&&producer.sourceSha256===participant.sourceSha256);
  controlledAfkPhysicalGeneration(producer.generation);controlledAfkPhysicalDigest(producer.lastTransitionSha256);
  controlledAfkPhysicalRequire(Array.isArray(producer.baseline)&&producer.baseline.length===3);
  const namespaceIds=new Set();let entries=0;
  for(const membership of producer.baseline){
    controlledAfkPhysicalClosed(membership,['namespaceId','rootSha256','entrySetSha256','entryCount','sourceFacts']);
    controlledAfkPhysicalRequire(participant.namespaceIds.includes(membership.namespaceId)&&!namespaceIds.has(membership.namespaceId));
    namespaceIds.add(membership.namespaceId);controlledAfkPhysicalDigest(membership.rootSha256);
    controlledAfkPhysicalDigest(membership.entrySetSha256);controlledAfkPhysicalSourceFacts(membership.sourceFacts);
    controlledAfkPhysicalRequire(Number.isSafeInteger(membership.entryCount)&&membership.entryCount===membership.sourceFacts.length);
    entries+=membership.entryCount;
  }
  controlledAfkPhysicalRequire(entries<=4096&&Array.isArray(producer.members)&&producer.members.length<=4096
    &&Array.isArray(producer.targetCertificates)&&producer.targetCertificates.length<=4096);
  const targets=new Set();
  for(const certificate of producer.targetCertificates){
    controlledAfkPhysicalClosed(certificate,['target','targetGeneration','certificateRef']);
    controlledAfkPhysicalTarget(certificate.target);controlledAfkPhysicalGeneration(certificate.targetGeneration);
    controlledAfkPhysicalRef(certificate.certificateRef,`${root}/targets/${certificate.target.sessionId}/afk-ledger.${certificate.targetGeneration}.json`);
    const key=canonicalJson(certificate.target);controlledAfkPhysicalRequire(!targets.has(key));targets.add(key);
  }
  const memberNames=[],members=new Map(),refs=[];
  for(const memberIndex of producer.members){
    controlledAfkPhysicalClosed(memberIndex,['memberId','memberGeneration','memberRef']);
    controlledAfkPhysicalId(memberIndex.memberId);controlledAfkPhysicalGeneration(memberIndex.memberGeneration);
    const name=`${memberIndex.memberId}.${memberIndex.memberGeneration}.json`;
    controlledAfkPhysicalRequire(!members.has(name));
    const loaded=controlledAfkPhysicalRecord(repository,`${root}/members/afk-ledger/${name}`,memberIndex.memberRef,readset);
    controlledAfkPhysicalMember(loaded.record,repository,participant);
    controlledAfkPhysicalRequire(loaded.record.memberId===memberIndex.memberId
      &&loaded.record.memberGeneration===memberIndex.memberGeneration);
    memberNames.push(name);members.set(name,loaded);refs.push({...loaded.ref});
  }
  controlledAfkPhysicalRequire(continuityAuthorityEqual(topology[4]?.names??[],memberNames.sort()));
  const releaseNames=topology[6]?.names??[],releasedNames=[];
  for(const name of releaseNames){
    const member=members.get(name);controlledAfkPhysicalRequire(member!==undefined);
    const loaded=controlledAfkPhysicalRecord(repository,`${root}/releases/afk-ledger/${name}`,member.record.releaseRef,readset);
    controlledAfkPhysicalRelease(loaded.record,member.record,repository,participant);
    if(member.record.phase==='released')releasedNames.push(name);
    else controlledAfkPhysicalRequire(member.record.phase==='terminal-observed'
      &&loaded.record.memberPreimageSha256===member.ref.sha256);
  }
  controlledAfkPhysicalRequire(continuityAuthorityEqual(releasedNames.sort(),
    [...members].filter(([,row])=>row.record.phase==='released').map(([name])=>name).sort()));
  for(const observed of readset.records.values()){
    const absolute=join(repository.commonDir,observed.path);
    controlledAfkPhysicalRequire(continuityAuthorityEqual(observed.fact,
      continuityAuthorityFact(absolute,'controlled-afk-physical-record',observed.parsed))
      &&continuityAuthorityEqual(observed.ref,continuityAuthorityPrivateRef(repository,absolute))
      &&continuityAuthorityEqual(observed.topology,controlledAfkExerciseDirectory(repository,observed.directory)));
  }
  for(let i=0;i<directories.length;i++)controlledAfkPhysicalRequire(
    continuityAuthorityEqual(topology[i],controlledAfkExerciseDirectory(repository,directories[i])));
  controlledAfkPhysicalRequire(continuityAuthorityEqual(commonIdentity(common),commonIdentity(lstatSync(repository.commonDir)))
    &&realpathSync(repository.commonDir)===repository.commonDir);
  for(const source of sources)controlledAfkPhysicalRequire(continuityAuthorityEqual(source.fact,
    continuityAuthorityFact(source.absolute,'controlled-afk-physical-source',{pathSha256:canonicalSha256(source.absolute)})));
  controlledAfkExerciseOrigin(value);
  return refs;
}
function controlledAfkExerciseSnapshot(value) {
  try {
    controlledAfkExerciseOrigin(value);
    const repository=value.repository,operation=value.operation,activationId=value.request.activationId;
    const state=continuityCompanionEffectImage(repository,{scope:'repository',
      path:relative(repository.primaryRoot,statePathForMethod(repository.primaryRoot)).split(sep).join('/'),preimage:null,postimage:null});
    const owningMemberRef=continuityAuthorityPrivateRef(repository,join(repository.commonDir,operation.expectedMemberRef.path.slice(5)));
    if(!continuityAuthorityEqual(owningMemberRef,operation.expectedMemberRef))
      fail('SDC-AUTHORITY-CAS','controlled AFK owning member readback changed');
    const directory=join(repository.commonDir,'agent-pipeline','afk',activationId,'generations');
    const before=controlledAfkExerciseDirectory(repository,directory),generations=[];let totalBytes=0;
    if(before)for(const name of before.names){
      const match=/^([0-9]{16})-([a-f0-9]{64})\.afklog$/u.exec(name);
      if(!match)fail('SDC-AUTHORITY-HELD','controlled AFK generation name unresolved');
      const path=join(directory,name),ref=continuityAuthorityPrivateRef(repository,path);
      const bytes=assertPrivateCleanupFile(path,'controlled AFK generation');
      totalBytes+=bytes.length;
      if(totalBytes>16777216||bytes.length>1048576||sha256(bytes)!==ref.sha256||bytes.length!==ref.size)
        fail('SDC-AUTHORITY-CAS','controlled AFK generation bytes changed');
      const parsed=parseAfkLedgerGeneration(bytes,activationId);
      if(!parsed.ok||parsed.sequence!==Number(match[1])||parsed.headSha256!==match[2]
          ||!continuityAuthorityEqual(ref,continuityAuthorityPrivateRef(repository,path)))
        fail('SDC-AUTHORITY-CAS','controlled AFK generation readback changed');
      generations.push({ref,parsed});
    }
    generations.sort((a,b)=>a.parsed.sequence-b.parsed.sequence);
    for(let index=1;index<generations.length;index++){
      const prior=generations[index-1].parsed,next=generations[index].parsed;
      if(prior.sequence>=next.sequence||prior.frames.some((frame,i)=>frame.recordHash!==next.frames[i]?.recordHash))
        fail('SDC-AUTHORITY-CAS','controlled AFK generation prefix changed');
    }
    if(!continuityAuthorityEqual(before,controlledAfkExerciseDirectory(repository,directory)))
      fail('SDC-AUTHORITY-CAS','controlled AFK generation namespace changed');
    const latest=generations.at(-1),ledger=latest?{activationId,sequence:latest.parsed.sequence,
      headSha256:latest.parsed.headSha256,generationRefs:generations.map(row=>({...row.ref}))}:null;
    const refName=`refs/agent-pipeline/afk/${activationId}`;
    const ref=observeAfkGitAuthority(repository.primaryRoot,refName);
    if(!ref.ok)fail('SDC-AUTHORITY-UNAVAILABLE','controlled AFK private ref unavailable');
    const privateRef=ref.refOid===null?null:{ref:refName,objectFormat:ref.objectFormat,oid:ref.refOid};
    const ledgerMemberRefs=value.renamedStateObservation!==null
      ?controlledAfkRenamedPhysicalMembers(value,state)
      :withSessionAuthorityBoundary({repository},boundary=>{
      const producerPort=createAfkLedgerAuthorityProducerPort({repository});
      const producer=inspectSourceOwnedSessionAuthorityProducerRecord({boundary,producerPort});
      if(value.exercise==='interrupt-after-state-rename'&&value.ledgerObservationAnchor===null)
        value.ledgerObservationAnchor=producer;
      return producer.record.members.map(row=>{
        const member=inspectSourceOwnedSessionAuthorityMemberRecord({boundary,producerPort,memberRef:row.memberRef});
        return {...member.memberRef};
      });
    });
    const again=observeAfkGitAuthority(repository.primaryRoot,refName);
    const afterState=continuityCompanionEffectImage(repository,{scope:'repository',
      path:relative(repository.primaryRoot,statePathForMethod(repository.primaryRoot)).split(sep).join('/'),preimage:null,postimage:null});
    if(!again.ok||!continuityAuthorityEqual(ref,again)||!continuityAuthorityEqual(state,afterState)
        ||!continuityAuthorityEqual(owningMemberRef,continuityAuthorityPrivateRef(repository,join(repository.commonDir,owningMemberRef.path.slice(5)))))
      fail('SDC-AUTHORITY-CAS','controlled AFK final physical snapshot changed');
    for(const row of generations) {
      const path=join(repository.commonDir,row.ref.path.slice(5));
      if(!continuityAuthorityEqual(row.ref,continuityAuthorityPrivateRef(repository,path))
          ||sha256(assertPrivateCleanupFile(path,'controlled AFK final generation'))!==row.ref.sha256)
        fail('SDC-AUTHORITY-CAS','controlled AFK final generation changed');
    }
    if(!continuityAuthorityEqual(before,controlledAfkExerciseDirectory(repository,directory)))
      fail('SDC-AUTHORITY-CAS','controlled AFK final generation namespace changed');
    controlledAfkExerciseOrigin(value);
    return Object.freeze({state,ledger,privateRef,owningMemberRef,ledgerMemberRefs});
  } catch(error) {value.snapshotError=controlledAfkExerciseCodes.has(error?.code)?error.code:'SDC-AUTHORITY-UNAVAILABLE';return null;}
}
function bindControlledAfkExerciseAdmission(row) {
  const value=controlledAfkExerciseCurrent();if(!value)return;
  if(value.admissionRow||row.operation!==value.operation||row.data!==value.data
      ||row.executionHandle!==value.request.executionHandle||row.activationId!==value.request.activationId
      ||row.kind!==value.request.kind||row.inputSha256!==canonicalSha256(value.request.input))
    fail('SDC-AUTHORITY-CAS','controlled AFK admission ownership changed');
  value.admissionRow=row;
}
function controlledAfkExerciseReplay(row,result) {
  const value=controlledAfkExerciseCurrent();
  if(!value||value.exercise!=='replay-settled-admission')return;
  if(value.admissionRow!==row||row.closed||value.reachedStage!==null)
    fail('SDC-AUTHORITY-CAS','controlled AFK replay ownership changed');
  value.reachedStage='after-first-host-settlement';value.before=controlledAfkExerciseSnapshot(value);
  value.exerciseResult=executeSourceOwnedAfkHostTransaction({admissionHandle:row.admissionHandle});
  value.after=controlledAfkExerciseSnapshot(value);
}
function controlledAfkExerciseCompanion(operation,executionHandle,entry,argv) {
  const value=controlledAfkExerciseCurrent();
  if(!value||value.exercise!=='run-companion-without-own-context'||entry!=='afk-project')return null;
  const row=value.admissionRow,contextHandle=continuityCompanionContextScope.getStore();
  const context=contextHandle&&continuityCompanionContexts.get(contextHandle);
  if(!row||row.closed||row.operation!==operation||row.executionHandle!==executionHandle
      ||continuityAfkInvocationScope.getStore()!==row||row.phase!=='projecting'
      ||continuityAfkProjectionForState.get(operation)!==row
      ||!context||context.operation!==operation||context.executionHandle!==executionHandle
      ||context.entry!==entry||value.reachedStage!==null)
    fail('SDC-AUTHORITY-CAS','controlled AFK companion ownership changed');
  value.reachedStage='inside-fixed-companion-without-context';
  return {result:continuityCompanionContextScope.exit(()=>runSanctionedCompanionState(argv,{dir:operation.data.repository.primaryRoot}))};
}
export function observeSourceOwnedControlledMethodAfkHostCheckpoint(input) {
  const value=controlledAfkExerciseCurrent();
  if(!value||value.exercise!=='interrupt-after-host-settled')return;
  if(!exactKeys(input,new Set(['admissionHandle']))||value.admissionRow?.admissionHandle!==input.admissionHandle
      ||continuityAfkInvocationScope.getStore()!==value.admissionRow
      ||!isCurrentSourceOwnedAfkProjectionAttempt({admissionHandle:input.admissionHandle,
        repository:value.repository,activationId:value.request.activationId})||value.reachedStage!==null)
    fail('SDC-AUTHORITY-CAS','controlled AFK host checkpoint ownership changed');
  value.reachedStage='after-host-observation-before-projection';
  fail('SDC-AUTHORITY-HELD','controlled method interruption after actual host settlement');
}
export function observeSourceOwnedControlledMethodAfkStateRename(input) {
  const value=controlledAfkExerciseCurrent();
  if(!value||value.exercise!=='interrupt-after-state-rename')return;
  const row=value.admissionRow,contextHandle=continuityCompanionContextScope.getStore();
  const context=contextHandle&&continuityCompanionContexts.get(contextHandle);
  if(!exactKeys(input,new Set(['rootDir','target','lock','bytes']))||!row||row.closed
      ||continuityAfkInvocationScope.getStore()!==row||row.phase!=='projecting'||!row.projectionRead
      ||row.projectionContextHandle!==contextHandle||!context||context.operation!==value.operation
      ||context.executionHandle!==value.request.executionHandle||context.entry!=='afk-project'
      ||input.rootDir!==value.repository.primaryRoot||input.target!==statePathForMethod(input.rootDir)
      ||!Buffer.isBuffer(input.bytes)||!inspectOwnedContinuityStateWriterLock({dir:input.rootDir,lock:input.lock})
      ||value.reachedStage!==null)
    fail('SDC-AUTHORITY-CAS','controlled AFK renamed State ownership changed');
  const effect={scope:'repository',path:relative(input.rootDir,input.target).split(sep).join('/'),preimage:null,postimage:null};
  const image=continuityCompanionEffectImage(value.repository,effect);
  if(!image||image.sha256!==sha256(input.bytes)||image.size!==input.bytes.length
      ||!continuityAuthorityEqual(image,continuityCompanionEffectImage(value.repository,effect)))
    fail('SDC-AUTHORITY-CAS','controlled AFK actual renamed State bytes changed');
  value.renamedStateObservation=Object.freeze({state:image,operation:value.operation,
    executionHandle:value.request.executionHandle,row,contextHandle,memberRef:structuredClone(value.operation.expectedMemberRef)});
  value.reachedStage='after-atomic-State-rename-before-directory-sync';
  fail('SDC-AUTHORITY-HELD','controlled method interruption after actual State rename');
}
export function createSourceOwnedControlledMethodAfkExercisePort(input,runtimePort) {
  try {
    if(!exactKeys(input,new Set(['repository','currentInvocationHandle','fixtureRoot']))
        ||typeof input.fixtureRoot!=='string'||controlledAfkExerciseScope.getStore())
      fail('SDC-AUTHORITY-UNAVAILABLE','unsupported controlled AFK exercise factory');
    const value={repository:continuityAuthorityRepository(input.repository),
      currentInvocationHandle:input.currentInvocationHandle,fixtureRoot:input.fixtureRoot,runtimePort,
      used:false,closed:false,request:null,operation:null,data:null,admissionRow:null,reachedStage:null,
      before:null,after:null,originalResult:null,exerciseResult:null,snapshotError:null,
      ledgerObservationAnchor:null,renamedStateObservation:null};
    const origin=controlledAfkExerciseOrigin(value);value.origin=origin.observed;value.modules=origin.modules;
    const port=Object.freeze({execute(args){
      try {
        if(controlledAfkExercisePorts.get(port)!==value||value.used||value.closed)
          fail('SDC-AUTHORITY-UNAVAILABLE','controlled AFK exercise port already used');
        value.used=true;
        if(!exactKeys(args,new Set(['request','exercise']))||!controlledAfkExerciseIds.has(args.exercise)
            ||!exactKeys(args.request,new Set(['operationHandle','executionHandle','expectedMemberRef','expectedStateSha256','kind','activationId','input'])))
          fail('SDC-AUTHORITY-UNAVAILABLE','unsupported controlled AFK exercise request');
        controlledAfkExerciseOrigin(value);
        const producerPort=createOnboardingContinuityAuthorityProducerPort({repository:value.repository});
        const data=continuityAuthorityPorts.get(producerPort),operation=continuityAuthorityOperation(data,args.request.operationHandle);
        if(operation.legacy||operation.phase!=='armed'||operation.companionExecuting
            ||operation.requesterHandle!==value.origin.requesterHandle
            ||operation.executionHandle!==args.request.executionHandle
            ||continuityAuthorityExecutions.get(args.request.executionHandle)?.operation!==operation
            ||!continuityAuthorityEqual(operation.expectedMemberRef,args.request.expectedMemberRef)
            ||! /^[a-f0-9]{64}$/u.test(args.request.expectedStateSha256??'')
            ||! /^[a-f0-9]{32}$/u.test(args.request.activationId??'')
            ||!['activate','entry','review'].includes(args.request.kind))
          fail('SDC-AUTHORITY-CAS','controlled AFK actual owning request changed');
        const physical=continuityAuthoritySnapshot(value.repository);
        if(physical.observed.stateSha256!==args.request.expectedStateSha256||!physical.observed.sessionCleanup||physical.observed.orphanBinding)
          fail('SDC-AUTHORITY-CAS','controlled AFK State preimage changed');
        continuityAuthorityCurrent(data,operation.requesterHandle);continuityAuthorityCheckJournals(operation);
        value.operation=operation;value.data=data;value.request=args.request;value.exercise=args.exercise;
        if(value.exercise!=='replay-settled-admission')value.before=controlledAfkExerciseSnapshot(value);
        const result=controlledAfkExerciseScope.run(value,()=>producerPort.executeAfkTransaction(args.request));
        value.originalResult=result;
        if(value.exercise!=='replay-settled-admission'){value.exerciseResult=result;value.after=controlledAfkExerciseSnapshot(value);}
      } catch(error) {controlledAfkExerciseRefuse(error);}
      finally {value.closed=true;controlledAfkExercisePorts.delete(port);}
      const privateScopeClosed=controlledAfkExerciseScope.getStore()!==value
        &&(!value.admissionRow||value.admissionRow.closed===true);
      return Object.freeze({schema:'pipeline.afk-method-exercise-observation.v1',exerciseId:value.exercise,
        originalInvocationBindingSha256:value.origin.invocationBindingSha256,
        operationBindingSha256:value.operation.bindingSha256,sourceContextSha256:canonicalSha256(value.modules),
        reachedStage:value.reachedStage,before:value.before,after:value.after,
        originalResult:value.originalResult,exerciseResult:value.exerciseResult,privateScopeClosed});
    }});
    value.port=port;controlledAfkExercisePorts.set(port,value);return port;
  } catch(error) {controlledAfkExerciseRefuse(error);}
}

// Fixed controlled-method controls. Production requests and authority gates are unchanged.
const controlledContinuityExercisePorts=new WeakMap();
const controlledContinuityExerciseOwners=new WeakMap();
const controlledContinuityExerciseProbes=new WeakMap();
const controlledContinuityReferenceWrites=new WeakMap();
const controlledContinuityExerciseScope=new AsyncLocalStorage();
const controlledContinuityLockCases=new Set(['APLOCK003','APLOCK004','APLOCK005','APLOCK006','APLOCK007','APLOCK008']);
const controlledContinuityTicketCases=new Set(['AFTICKET001','AFTICKET002','AFTICKET003','AFTICKET004']);
const controlledContinuityRequestKeys=new Set(['operationHandle','executionHandle','expectedMemberRef','expectedStateSha256','entry','argv']);
function controlledContinuityModules() {
  return ['onboarding-continuity.mjs','session-authority-registry.mjs','session-requester-bridge.mjs',
    '../scripts/pipeline-state.mjs','afk-isolated-repository-custody.mjs'].map(name=>{
      const path=fileURLToPath(new URL(name,import.meta.url));
      return continuityAuthorityFact(path,'controlled-continuity-exercise-source',{pathSha256:canonicalSha256(path)});
    });
}
function controlledContinuityCurrent(value) {
  if(!value||value.closed||controlledContinuityExercisePorts.get(value.port)!==value
      ||controlledContinuityExerciseScope.getStore()!==value
      ||continuityAuthorityPorts.get(value.producerPort)!==value.data
      ||continuityAuthorityOperations.get(value.request.operationHandle)!==value.operation
      ||continuityAuthorityExecutions.get(value.request.executionHandle)?.operation!==value.operation
      ||value.operation.data!==value.data||value.operation.executionHandle!==value.request.executionHandle
      ||value.operation.requesterHandle!==value.origin.requesterHandle||value.operation.legacy
      ||value.operation.phase!=='armed')
    fail('SDC-AUTHORITY-CAS','controlled continuity private lifetime changed');
  controlledAfkExerciseOrigin(value);
  if(!continuityAuthorityEqual(value.controlModules,controlledContinuityModules()))
    fail('SDC-AUTHORITY-CAS','controlled continuity source context changed');
  return value;
}
export function inspectSourceOwnedControlledContinuityExerciseCustodyClaim(input) {
  if(!exactKeys(input,new Set(['exerciseOwnerHandle','repository'])))return null;
  const value=input.exerciseOwnerHandle&&controlledContinuityExerciseOwners.get(input.exerciseOwnerHandle);
  if(!value||value.ownerHandle!==input.exerciseOwnerHandle||value.closed
      ||controlledContinuityExerciseScope.getStore()!==value
      ||!['claiming','settling'].includes(value.custodyPhase)
      ||input.repository?.primaryRoot!==value.repository.primaryRoot
      ||input.repository?.commonDir!==value.repository.commonDir)return null;
  controlledContinuityCurrent(value);
  return Object.freeze({repository:Object.freeze({...value.repository}),exerciseId:value.caseId,
    phase:value.custodyPhase,custodyRefSha256:value.custody.custodySourceRef.receiptSha256,
    sourceContextSha256:canonicalSha256(value.controlModules),
    invocationBindingSha256:value.origin.invocationBindingSha256,
    operationBindingSha256:value.operation.bindingSha256});
}
function controlledContinuityImage(value,path) {
  const repository=value.repository;
  const rel=relative(repository.primaryRoot,path);
  if(isAbsolute(rel)||rel.split(sep).some(part=>part==='..'||part==='.')||!rel)
    fail('SDC-PRIVATE-PATH','controlled continuity image outside root');
  let cursor=repository.primaryRoot;
  for(const part of rel.split(sep)){
    cursor=join(cursor,part);
    try{if(lstatSync(cursor).isSymbolicLink())fail('SDC-PRIVATE-PATH','controlled continuity image alias');}
    catch(error){if(error?.code==='ENOENT')return null;throw error;}
  }
  const before=lstatSync(path);
  const identity=stat=>({dev:String(stat.dev),ino:String(stat.ino),mode:stat.mode,nlink:stat.nlink});
  const safe=stat=>{if(!stat.isFile()||stat.isSymbolicLink()||stat.uid!==process.getuid()
      ||stat.size>1048576)fail('SDC-PRIVATE-PATH','controlled continuity image unsafe');};
  safe(before);const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);
  let bytes;
  try{
    const opened=fstatSync(fd);safe(opened);bytes=readFileSync(fd);
    if(!continuityAuthorityEqual(identity(before),identity(opened)))
      fail('SDC-AUTHORITY-CAS','controlled continuity image replaced');
  }finally{closeSync(fd);}
  const after=lstatSync(path);safe(after);
  if(!continuityAuthorityEqual(identity(before),identity(after))||bytes.length!==after.size
      ||sha256(bytes)!==sha256(readFileSync(path)))
    fail('SDC-AUTHORITY-CAS','controlled continuity image raced');
  return {path:rel.split(sep).join('/'),sha256:sha256(bytes),size:bytes.length,identity:identity(after)};
}
function controlledContinuityImages(value) {
  if(!value.targetPath)return null;
  return {target:controlledContinuityImage(value,value.targetPath),
    auxiliary:value.auxiliaryPath?controlledContinuityImage(value,value.auxiliaryPath):null};
}
function controlledContinuityOpenCaptured(value,path,image) {
  if(!image||!continuityAuthorityEqual(controlledContinuityImage(value,path),image))
    fail('SDC-AUTHORITY-CAS','controlled continuity captured image changed');
  const fd=openSync(path,constants.O_RDWR|constants.O_NOFOLLOW),stat=fstatSync(fd);
  if(String(stat.dev)!==image.identity.dev||String(stat.ino)!==image.identity.ino
      ||stat.mode!==image.identity.mode||stat.nlink!==image.identity.nlink
      ||stat.uid!==process.getuid()||sha256(readFileSync(fd))!==image.sha256){
    closeSync(fd);fail('SDC-AUTHORITY-CAS','controlled continuity captured inode changed');
  }
  return fd;
}
function controlledContinuityApplyLockFault(witness) {
  const value=controlledContinuityExerciseScope.getStore();
  if(!value||!controlledContinuityLockCases.has(value.caseId))return;
  controlledContinuityCurrent(value);
  const context=continuityCompanionContexts.get(witness.contextHandle);
  if(value.stage!==null||!value.claimed||!context||context.operation!==value.operation
      ||context.executionHandle!==value.request.executionHandle||context.entry!=='approve-plan'
      ||continuityCompanionContextScope.getStore()!==witness.contextHandle
      ||continuityCompanionStateWriterLockWitnesses.get(witness.contextHandle)!==witness
      ||value.operation.companionExecuting!==true
      ||!continuityAuthorityEqual(witness.repository,value.repository)
      ||!continuityAuthorityEqual(inspectOwnedContinuityStateWriterLock({dir:value.repository.primaryRoot,
        lock:witness.lock}),witness.lockFact))
    fail('SDC-AUTHORITY-CAS','controlled approval witness capture changed');
  value.targetPath=witness.lockFact.path;
  if(value.targetPath!==statePathForMethod(value.repository.primaryRoot)+'.lock')
    fail('SDC-AUTHORITY-CAS','controlled approval lock target changed');
  value.auxiliaryPath=value.caseId==='APLOCK008'
    ?statePathForMethod(value.repository.primaryRoot)+'.tmp.controlled-APLOCK008'
    :['APLOCK003','APLOCK005'].includes(value.caseId)?value.targetPath+'.controlled-'+value.caseId:null;
  value.before=controlledContinuityImages(value);
  if(value.before.auxiliary!==null)fail('SDC-AUTHORITY-CAS','controlled approval fault sibling occupied');
  const image=value.before.target,bytes=readFileSync(value.targetPath);
  if(image?.sha256!==witness.lockFact.bytesSha256||image.size!==witness.lockFact.size
      ||sha256(bytes)!==image.sha256||image.identity.nlink!==1)
    fail('SDC-AUTHORITY-CAS','controlled approval original lock bytes changed');
  value.stage='after-source-lock-witness-capture';
  if(value.caseId==='APLOCK003'){
    const fd=openSync(value.auxiliaryPath,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
    try{writeFileSync(fd,bytes);fsyncSync(fd);}finally{closeSync(fd);}
    if(!continuityAuthorityEqual(controlledContinuityImage(value,value.targetPath),image))
      fail('SDC-AUTHORITY-CAS','controlled approval replacement predecessor raced');
    const replacement=controlledContinuityImage(value,value.auxiliaryPath);
    if(replacement.sha256!==image.sha256||replacement.identity.nlink!==1
        ||replacement.identity.ino===image.identity.ino)
      fail('SDC-AUTHORITY-CAS','controlled approval replacement not distinct');
    renameSync(value.auxiliaryPath,value.targetPath);
  }else if(value.caseId==='APLOCK005'){
    linkSync(value.targetPath,value.auxiliaryPath);
    const target=controlledContinuityImage(value,value.targetPath),alias=controlledContinuityImage(value,value.auxiliaryPath);
    if(target.identity.nlink!==2||alias.identity.nlink!==2||target.identity.ino!==image.identity.ino
        ||alias.identity.ino!==image.identity.ino||target.identity.dev!==alias.identity.dev
        ||target.sha256!==image.sha256||alias.sha256!==image.sha256)
      fail('SDC-AUTHORITY-CAS','controlled approval hardlink capture changed');
  }else if(value.caseId==='APLOCK008'){
    const fd=openSync(value.auxiliaryPath,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
    try{writeFileSync(fd,Buffer.from('controlled unresolved State temporary\n'));fsyncSync(fd);}finally{closeSync(fd);}
  }else{
    const fd=controlledContinuityOpenCaptured(value,value.targetPath,image);
    try{
      if(value.caseId==='APLOCK004')fchmodSync(fd,0o620);
      else{
        const record=JSON.parse(bytes.toString('utf8'));
        if(value.caseId==='APLOCK006'){
          if(typeof record.ownerNonce!=='string'||record.ownerNonce.length===0)
            fail('SDC-AUTHORITY-CAS','controlled approval original nonce absent');
          record.ownerNonce=(record.ownerNonce[0]==='0'?'1':'0')+record.ownerNonce.slice(1);
        }else record.controlledUnknownField=true;
        const output=Buffer.from(JSON.stringify(record)+'\n');
        ftruncateSync(fd,0);
        let offset=0;
        while(offset<output.length){
          const written=writeSync(fd,output,offset,output.length-offset,offset);
          if(written<1)fail('SDC-AUTHORITY-UNAVAILABLE','controlled approval fault write incomplete');
          offset+=written;
        }
      }
      fsyncSync(fd);
    }finally{closeSync(fd);}
  }
  const dirFd=openSync(dirname(value.targetPath),constants.O_RDONLY);
  try{fsyncSync(dirFd);}finally{closeSync(dirFd);}
  value.afterFault=controlledContinuityImages(value);
}
// Authenticate the genuine publication phase without reopening the obsolete
// predecessor through the ordinary State context getter. No ref is adopted.
function controlledContinuityAuthenticateRefresh(value,owned,stage,witness) {
  const beforeRefresh=stage==='after-live-companion-tickets-before-owner-refresh';
  if(!['after-live-companion-tickets-before-owner-refresh','after-owner-refresh-before-final-inventory'].includes(stage)
      ||!owned||continuityCompanionWitnesses.get(witness)!==owned
      ||owned.stage!==(beforeRefresh?'verified':'refreshed')
      ||owned.value!==continuityCompanionContexts.get(owned.contextHandle)
      ||owned.contextHandle!==continuityCompanionContextScope.getStore()
      ||owned.value.operation!==value.operation||owned.value.executionHandle!==value.request.executionHandle
      ||owned.data!==value.data||owned.port!==value.producerPort||!owned.terminal
      ||value.operation.companionExecuting!==true)
    fail('SDC-AUTHORITY-CAS','controlled companion private refresh phase changed');
  const ticket=inspectSourceOwnedSessionAuthorityCompanionRefresh({boundary:owned.boundary,
    producerPort:owned.port,companionWriteHandle:owned.handle,ownerWitness:witness});
  const changed=new Set();
  for(const change of ticket.members){
    const matches=owned.live.filter(item=>continuityAuthorityEqual(item.memberRef,change.previousMemberRef));
    if(matches.length!==1||changed.has(matches[0]))
      fail('SDC-AUTHORITY-CAS','controlled companion refresh predecessor changed');
    const item=matches[0],records=ticket.memberRecords.filter(record=>continuityAuthorityEqual(record.memberRef,change.memberRef));
    if(records.length!==1||change.memberId!==item.record.memberId||change.memberGeneration!==item.record.memberGeneration
        ||!continuityAuthorityEqual(item.operation.expectedMemberRef,beforeRefresh?item.memberRef:change.memberRef))
      fail('SDC-AUTHORITY-CAS','controlled companion private member pin changed');
    const actual=records[0];
    if(!continuityAuthorityEqual(actual.producerRef,ticket.producerRef)
        ||!continuityAuthorityEqual(actual.catalogueRef,ticket.catalogueRef)
        ||!continuityAuthorityEqual(continuitySharedStateRecord(owned.data,change.memberRef),actual.record)
        ||actual.releaseRef!==null||actual.releaseRecord!==null)
      fail('SDC-AUTHORITY-CAS','controlled companion physical successor changed');
    const {sourceFacts,revision,updatedAt,...identity}=actual.record;
    const {sourceFacts:priorFacts,revision:priorRevision,updatedAt:priorUpdatedAt,...priorIdentity}=item.record;
    if(revision!==priorRevision+1||!continuityAuthorityEqual(identity,priorIdentity)
        ||(item.operation===value.operation&&!continuityAuthorityEqual(owned.value.expectedMemberRef,
          beforeRefresh?item.memberRef:change.memberRef)))
      fail('SDC-AUTHORITY-CAS','controlled companion successor identity changed');
    continuityCompanionConservedFacts(priorFacts,sourceFacts,owned.terminal.effects);
    changed.add(item);
  }
  for(const item of owned.live)if(!changed.has(item)
      &&(!continuityAuthorityEqual(item.operation.expectedMemberRef,item.memberRef)
        ||!continuityAuthorityEqual(continuitySharedStateRecord(owned.data,item.memberRef),item.record)))
    fail('SDC-AUTHORITY-CAS','controlled companion unchanged member changed');
  for(const item of owned.historical)if(!item.releaseRef||!item.releaseRecord
      ||!continuityAuthorityEqual(continuitySharedStateRecord(owned.data,item.memberRef),item.record)
      ||!continuityAuthorityEqual(continuitySharedStateRecord(owned.data,item.releaseRef),item.releaseRecord))
    fail('SDC-AUTHORITY-CAS','controlled companion historical release changed');
}
export function inspectSourceOwnedControlledContinuityTicketProbe(input) {
  if(!exactKeys(input,new Set(['probeHandle','boundary','companionWriteHandle','ownerWitness','repository','stage'])))return null;
  const probe=input.probeHandle&&controlledContinuityExerciseProbes.get(input.probeHandle);
  if(!probe||probe.closed||probe.boundary!==input.boundary||probe.handle!==input.companionWriteHandle
      ||probe.witness!==input.ownerWitness||probe.stage!==input.stage
      ||!continuityAuthorityEqual(probe.value.repository,input.repository))return null;
  const value=controlledContinuityCurrent(probe.value),owned=continuityCompanionWitnesses.get(probe.witness);
  if(!value.claimed||value.stage!==probe.stage||!owned||owned.value.operation!==value.operation
      ||owned.data!==value.data||owned.port!==value.producerPort||owned.handle!==probe.handle
      ||owned.boundary!==probe.boundary||owned.contextHandle!==continuityCompanionContextScope.getStore()
      ||owned.value.executionHandle!==value.request.executionHandle
      ||value.operation.companionExecuting!==true)
    fail('SDC-AUTHORITY-CAS','controlled companion probe ownership changed');
  controlledContinuityAuthenticateRefresh(value,owned,probe.stage,probe.witness);
  return Object.freeze({caseId:value.caseId,producerPort:value.producerPort,
    referenceWriteHandle:value.referenceWriteHandle??null,
    successorReservationOperationHandle:value.successorReservationOperationHandle??null,
    operationBindingSha256:value.operation.bindingSha256,association:value.operation.association});
}
export function observeSourceOwnedControlledContinuityCompanionCheckpoint(input) {
  const value=controlledContinuityExerciseScope.getStore();
  if(!value||controlledContinuityLockCases.has(value.caseId))return;
  if(!exactKeys(input,new Set(['boundary','companionWriteHandle','ownerWitness','stage'])))
    fail('SDC-AUTHORITY-UNAVAILABLE','controlled companion checkpoint closed shape');
  const required=value.caseId==='AFTICKET003'?'after-owner-refresh-before-final-inventory'
    :'after-live-companion-tickets-before-owner-refresh';
  if(input.stage!==required)return;
  controlledContinuityCurrent(value);
  const owned=continuityCompanionWitnesses.get(input.ownerWitness);
  if(value.stage!==null||!value.claimed||!owned||owned.data!==value.data||owned.port!==value.producerPort
      ||owned.value.operation!==value.operation||owned.handle!==input.companionWriteHandle
      ||owned.boundary!==input.boundary||owned.value.executionHandle!==value.request.executionHandle
      ||owned.contextHandle!==continuityCompanionContextScope.getStore()
      ||value.operation.companionExecuting!==true
      ||(input.stage==='after-live-companion-tickets-before-owner-refresh'&&owned.stage!=='verified')
      ||(input.stage==='after-owner-refresh-before-final-inventory'&&owned.stage!=='refreshed'))
    fail('SDC-AUTHORITY-CAS','controlled companion actual checkpoint changed');
  controlledContinuityAuthenticateRefresh(value,owned,input.stage,input.ownerWitness);
  value.stage=input.stage;
  if(value.caseId==='capture-companion-reference'){
    value.capturedWriteHandle=owned.handle;return;
  }
  const probeHandle=Object.freeze({}),probe={value,handle:owned.handle,witness:input.ownerWitness,
    boundary:input.boundary,stage:input.stage,closed:false};
  controlledContinuityExerciseProbes.set(probeHandle,probe);
  try{
    const observed=executeSourceOwnedControlledContinuityTicketProbe({probeHandle});
    value.before=observed.before;value.afterFault=observed.afterFault;
    value.probeResult=observed.probeResult;
    if(observed.targetRef)value.targetPath=join(value.repository.commonDir,observed.targetRef.path.slice(5));
  }finally{probe.closed=true;controlledContinuityExerciseProbes.delete(probeHandle);}
}
function controlledContinuityAdmission(value,request) {
  if(!exactKeys(request,controlledContinuityRequestKeys)||request.entry!=='approve-plan'
      ||!Array.isArray(request.argv)||request.argv[0]!=='approve-plan'||request.argv.length>128
      ||request.argv.some(arg=>typeof arg!=='string'||arg.length>8192)
      ||! /^[a-f0-9]{64}$/u.test(request.expectedStateSha256??''))
    fail('SDC-AUTHORITY-UNAVAILABLE','controlled approval request closed shape');
  controlledAfkExerciseOrigin(value);
  if(!continuityAuthorityEqual(value.controlModules,controlledContinuityModules()))
    fail('SDC-AUTHORITY-CAS','controlled approval module custody changed');
  const operation=continuityAuthorityOperation(value.data,request.operationHandle);
  if(operation.legacy||operation.phase!=='armed'||operation.companionExecuting
      ||operation.requesterHandle!==value.origin.requesterHandle||operation.executionHandle!==request.executionHandle
      ||continuityAuthorityExecutions.get(request.executionHandle)?.operation!==operation
      ||!continuityAuthorityEqual(operation.expectedMemberRef,request.expectedMemberRef))
    fail('SDC-AUTHORITY-CAS','controlled approval original operation changed');
  continuityAuthorityCurrent(value.data,operation.requesterHandle);continuityAuthorityCheckJournals(operation);
  const state=continuityAuthoritySnapshot(value.repository);
  if(state.observed.stateSha256!==request.expectedStateSha256||!state.observed.sessionCleanup||state.observed.orphanBinding)
    fail('SDC-AUTHORITY-CAS','controlled approval actual State preimage changed');
  const member=continuityAuthorityPrivateRef(value.repository,join(value.repository.commonDir,request.expectedMemberRef.path.slice(5)));
  if(!continuityAuthorityEqual(member,request.expectedMemberRef))
    fail('SDC-AUTHORITY-CAS','controlled approval actual member changed');
  value.request=request;value.operation=operation;
}
function controlledContinuityClaim(value) {
  value.ownerHandle=Object.freeze({});controlledContinuityExerciseOwners.set(value.ownerHandle,value);
  value.custodyPhase='claiming';
  const claimed=continuityExerciseCustody.claimSourceOwnedDisposableAfkRepositoryExercise({
    repositoryCustodyHandle:value.repositoryCustodyHandle,exerciseOwnerHandle:value.ownerHandle});
  if(claimed?.status!=='claimed'||claimed.lifecycle!=='exercise-claimed'
      ||claimed.exerciseId!==value.caseId||claimed.invocationBindingSha256!==value.origin.invocationBindingSha256
      ||claimed.operationBindingSha256!==value.operation.bindingSha256
      ||claimed.custodySourceRef?.receiptSha256!==value.custody.custodySourceRef.receiptSha256
      ||claimed.repository?.primaryRoot!==value.repository.primaryRoot
      ||claimed.repository?.commonDir!==value.repository.commonDir)
    fail('SDC-AUTHORITY-UNAVAILABLE','controlled approval custody claim unavailable');
  value.claimed=true;value.custodyPhase='executing';
}
function controlledContinuitySettle(value) {
  value.privateScopeClosed=false;
  try{
    if(value.claimed){
      value.custodyPhase='settling';
      const settled=continuityExerciseCustody.settleSourceOwnedDisposableAfkRepositoryExercise({
        repositoryCustodyHandle:value.repositoryCustodyHandle,exerciseOwnerHandle:value.ownerHandle});
      const keys=settled&&Object.keys(settled).sort();
      const held=continuityAuthorityEqual(keys,['lifecycle','status'])&&settled.status==='held'&&settled.lifecycle==='held';
      const completed=settled?.status==='settled'&&settled.lifecycle==='completed-with-evidence'
        &&settled.exerciseId===value.caseId&&settled.invocationBindingSha256===value.origin.invocationBindingSha256
        &&settled.operationBindingSha256===value.operation.bindingSha256
        &&settled.custodySourceRef?.receiptSha256===value.custody.custodySourceRef.receiptSha256;
      value.privateScopeClosed=held||completed;
    }
  }catch{value.privateScopeClosed=false;}
  finally{
    value.custodyPhase='closed';value.closed=true;
    if(value.ownerHandle)controlledContinuityExerciseOwners.delete(value.ownerHandle);
    controlledContinuityExercisePorts.delete(value.port);
  }
}
function controlledContinuityExecute(value,args,kind) {
  if(controlledContinuityExercisePorts.get(value.port)!==value||value.used||value.closed
      ||controlledContinuityExerciseScope.getStore())
    fail('SDC-AUTHORITY-UNAVAILABLE','controlled continuity port already used');
  value.used=true;
  const keys=kind==='lock'?new Set(['request','caseId']):kind==='capture'?new Set(['request'])
    :new Set(['request','caseId','referenceOperationHandle','successorReservationOperationHandle']);
  if(!exactKeys(args,keys)||(kind==='lock'&&!controlledContinuityLockCases.has(args.caseId))
      ||(kind==='ticket'&&!controlledContinuityTicketCases.has(args.caseId)))
    fail('SDC-AUTHORITY-UNAVAILABLE','controlled continuity exercise closed shape');
  controlledContinuityAdmission(value,args.request);
  value.caseId=kind==='capture'?'capture-companion-reference':args.caseId;
  if(kind==='ticket'){
    if(value.caseId!=='AFTICKET002'&&args.referenceOperationHandle!==null
        ||value.caseId!=='AFTICKET003'&&args.successorReservationOperationHandle!==null)
      fail('SDC-AUTHORITY-UNAVAILABLE','controlled companion unused selector');
    if(value.caseId==='AFTICKET002'){
      const reference=controlledContinuityReferenceWrites.get(args.referenceOperationHandle);
      if(!reference||reference.operation.operationHandle!==args.referenceOperationHandle
          ||continuityAuthorityOperations.get(args.referenceOperationHandle)!==reference.operation
          ||reference.operation.data!==reference.data||reference.operation===value.operation
          ||reference.repository.primaryRoot===value.repository.primaryRoot
          ||reference.repository.commonDir===value.repository.commonDir
          ||reference.sourceContextSha256!==canonicalSha256(value.controlModules))
        fail('SDC-AUTHORITY-CAS','controlled companion actual prior reference unavailable');
      value.referenceWriteHandle=reference.handle;
    }
    if(value.caseId==='AFTICKET003'){
      const successor=continuityAuthorityOperation(value.data,args.successorReservationOperationHandle);
      if(successor===value.operation||successor.legacy||successor.phase!=='reserved'
          ||successor.requesterHandle!==value.origin.requesterHandle||successor.executionHandle)
        fail('SDC-AUTHORITY-CAS','controlled companion actual pre-bind preparation unavailable');
      value.successorReservationOperationHandle=args.successorReservationOperationHandle;
    }
  }
  return controlledContinuityExerciseScope.run(value,()=>{
    try{
      controlledContinuityClaim(value);
      value.originalResult=value.producerPort.executeCompanionOperation(args.request);
      if(value.originalResult&&typeof value.originalResult.then==='function')
        fail('SDC-AUTHORITY-UNAVAILABLE','controlled companion asynchronous original result');
      if(value.targetPath)value.after=controlledContinuityImages(value);
      if(kind==='capture'&&value.capturedWriteHandle&&value.originalResult?.status==='completed'
          &&value.originalResult.exitCode===0){
        controlledContinuityReferenceWrites.set(args.request.operationHandle,{operation:value.operation,data:value.data,
          handle:value.capturedWriteHandle,repository:{...value.repository},sourceContextSha256:canonicalSha256(value.controlModules)});
        value.referenceCaptured=true;
      }
    }finally{controlledContinuitySettle(value);}
    if(kind==='capture')return Object.freeze({originalResult:value.originalResult,captured:value.referenceCaptured===true});
    return Object.freeze({schema:'pipeline.continuity-method-control-observation.v1',caseId:value.caseId,
      stage:value.stage,invocationBindingSha256:value.origin.invocationBindingSha256,
      operationBindingSha256:value.operation.bindingSha256,custodySourceSha256:value.custody.custodySourceRef.receiptSha256,
      sourceContextSha256:canonicalSha256(value.controlModules),before:value.before,afterFault:value.afterFault,
      after:value.after,originalResult:value.originalResult,probeResult:value.probeResult,privateScopeClosed:value.privateScopeClosed});
  });
}
export function createSourceOwnedControlledContinuityExercisePort(input,runtimePort) {
  try{
    if(!exactKeys(input,new Set(['producerPort','currentInvocationHandle','fixtureRoot','repositoryCustodyHandle']))
        ||controlledContinuityExerciseScope.getStore()||typeof input.fixtureRoot!=='string')
      fail('SDC-AUTHORITY-UNAVAILABLE','controlled continuity factory closed shape');
    const data=continuityAuthorityPorts.get(input.producerPort);
    if(!data)fail('SDC-AUTHORITY-UNAVAILABLE','controlled continuity genuine port required');
    const custody=continuityExerciseCustody.inspectSourceOwnedDisposableAfkRepository({repositoryCustodyHandle:input.repositoryCustodyHandle});
    const repository=continuityAuthorityRepository(data.repository);
    if(custody?.status!=='owned'||!['created','inspected'].includes(custody.lifecycle)
        ||custody.repository?.primaryRoot!==repository.primaryRoot||custody.repository?.commonDir!==repository.commonDir
        ||! /^[a-f0-9]{64}$/u.test(custody.custodySourceRef?.receiptSha256??''))
      fail('SDC-AUTHORITY-UNAVAILABLE','controlled continuity Source-created root custody required');
    const value={data,producerPort:input.producerPort,repository,custody,
      repositoryCustodyHandle:input.repositoryCustodyHandle,currentInvocationHandle:input.currentInvocationHandle,
      fixtureRoot:input.fixtureRoot,runtimePort,used:false,closed:false,claimed:false,caseId:null,stage:null,
      request:null,operation:null,ownerHandle:null,custodyPhase:null,targetPath:null,auxiliaryPath:null,
      before:null,afterFault:null,after:null,originalResult:null,probeResult:null,privateScopeClosed:false};
    const origin=controlledAfkExerciseOrigin(value);value.origin=origin.observed;value.modules=origin.modules;
    value.controlModules=controlledContinuityModules();
    const port=Object.freeze({
      executeApprovalLockCase:args=>controlledContinuityExecute(value,args,'lock'),
      captureCompanionReference:args=>controlledContinuityExecute(value,args,'capture'),
      executeCompanionTicketCase:args=>controlledContinuityExecute(value,args,'ticket'),
    });
    value.port=port;controlledContinuityExercisePorts.set(port,value);return port;
  }catch(error){controlledAfkExerciseRefuse(error);}
}

// Source-owned production verification custody. Bind only captures; it adds no bind prerequisite.
const continuityVerificationOwners=new WeakMap();
const continuityVerificationCaptured=new WeakMap();
const continuityVerificationAssociations=new WeakMap();
const continuityVerificationAttempts=new WeakMap();
const continuityVerificationPortStates=new WeakMap();
const CONTINUITY_VERIFICATION_TTL=120000;
function continuityVerificationUnavailable(code){return Object.freeze({status:'unavailable',code});}
function continuityVerificationCode(error,fallback='OSV-OWNER-UNAVAILABLE'){
  return OWNED_VERIFICATION_CODES.includes(error?.code)?error.code:fallback;
}
function captureContinuityVerificationOwner(owned){
  // Inert custody only: no ready/approved/suite predicate can regress the original bind.
  continuityVerificationCaptured.set(owned.prepared.operationHandle,owned);
}
function continuityVerificationFloorEqual(a,b){
  if(!ownedVerificationSameProcess(a?.controllerIdentity,b?.controllerIdentity))return false;
  const strip=value=>Object.fromEntries(Object.entries(value).filter(([key])=>key!=='controllerIdentity'));
  return continuityAuthorityEqual(strip(a),strip(b));
}
function continuityVerificationInvocationProcess(actual,original){
  if(process.platform==='win32')return actual?.platform==='win32'&&original?.pid===actual.pid
    &&original.startIdentitySha256===ownedVerificationDigest({start:actual.start,bootIdentity:actual.bootIdentity});
  return actual&&!['Z','X'].includes(actual.state)&&original?.pid===actual.pid
    &&original.startIdentitySha256===ownedVerificationDigest({start:actual.start,bootSha256:actual.bootSha256});
}
function continuityVerificationOwnerRead(owned,runtimePort){
  const {repository,port,data,prepared,executed}=owned;
  if(continuityAuthorityPorts.get(port)!==data||data.repository!==repository&& !continuityAuthorityEqual(data.repository,repository))
    ownedVerificationFail('OSV-OWNER-UNAVAILABLE');
  const operation=continuityAuthorityOperation(data,prepared.operationHandle);
  if(operation.legacy||operation.phase!=='armed'||operation.companionExecuting
    ||operation.executionHandle!==executed.executionHandle||continuityAuthorityExecutions.get(executed.executionHandle)?.operation!==operation
    ||continuityVerificationCaptured.get(prepared.operationHandle)!==owned)ownedVerificationFail('OSV-OWNER-UNAVAILABLE');
  const active=inspectSourceOwnedCurrentAuthorityContext({repository});
  if(active.status!=='bound'||active.runtimePort!==runtimePort||active.requesterHandle!==operation.requesterHandle
    ||!active.currentInvocationHandle||active.assurance==='controlled-unit-method')ownedVerificationFail('OSV-OWNER-UNAVAILABLE');
  const requester=continuityAuthorityCurrent(data,operation.requesterHandle);
  if(requester.assurance==='controlled-unit-method'||!continuityAuthorityEqual(operation.association.target,
    {sessionId:requester.sessionId,descriptorSha256:requester.descriptorSha256,ownerNonceSha256:requester.ownerNonceSha256}))ownedVerificationFail('OSV-OWNER-UNAVAILABLE');
  continuityAuthorityCheckJournals(operation);
  const snapshot=continuityAuthoritySnapshot(repository),state=snapshot.observed.state,lifecycle=derivePlanLifecycle(state);
  if(!snapshot.observed.neutral||snapshot.observed.mode!=='active'||snapshot.observed.orphanBinding||snapshot.release.status!=='absent'
    ||!continuityAuthorityEqual(snapshot.observed.sessionCleanup,{sessionId:requester.sessionId,descriptorSha256:requester.descriptorSha256})
    ||!lifecycle.ok||lifecycle.approvalCurrent!==true||!['approved','implementing'].includes(lifecycle.status)||state.planApproved!==true)
    ownedVerificationFail('OSV-COURSE-UNAVAILABLE');
  const approvalRefs=[readOwnedVerificationPhysicalFile(resolve(repository.primaryRoot,state.activeFeature.planPath),{root:repository.primaryRoot}).ref];
  const acceptedRef=state.planApproval?.acceptedContract;
  // Use the existing accepted-policy reader; no additional signature or METHOD requirement.
  if(acceptedRef){const accepted=readSanctionedAcceptedContract({dir:repository.primaryRoot,envelopePath:acceptedRef.path});
    if(!accepted.ok||accepted.envelopeSha256!==acceptedRef.sha256)ownedVerificationFail('OSV-COURSE-UNAVAILABLE');
    approvalRefs.push(readOwnedVerificationPhysicalFile(resolve(repository.primaryRoot,acceptedRef.path),{root:repository.primaryRoot}).ref);}
  const member=withSessionAuthorityBoundary({repository},boundary=>inspectSourceOwnedSessionAuthorityMember({boundary,
    producerPort:port,memberHandle:operation.memberHandle,operationHandle:prepared.operationHandle,expectedMemberRef:operation.expectedMemberRef}));
  const requesterFloor=inspectSourceOwnedContinuityVerificationRequesterFloor({repository,requesterHandle:operation.requesterHandle,
    currentInvocationHandle:active.currentInvocationHandle,runtimePort});
  if(!continuityAuthorityEqual(requesterFloor.repository,repository)||!continuityAuthorityEqual(requesterFloor.currentRequester,active.currentRequester)
    ||requesterFloor.invocationBindingSha256!==active.invocationBindingSha256
    ||!continuityVerificationInvocationProcess(requesterFloor.controllerIdentity,active.controllerIdentity))ownedVerificationFail('OSV-OWNER-UNAVAILABLE');
  return {repository,operation,active,requester,requesterFloor,member,snapshot,approvalRefs,
    selectedStateRef:readOwnedVerificationPhysicalFile(snapshot.observed.path,{root:repository.primaryRoot}).ref,
    course:{featureId:state.activeFeature.id,planPath:state.activeFeature.planPath,lifecycle:lifecycle.status,
      approvalSha256:ownedVerificationDigest({approval:state.planApproval,submission:state.planSubmission,revocation:state.planRevocation??null,
        lifecycle,continuity:state.continuity,approvalRefs})}};
}
export function acquireSourceOwnedContinuityVerificationOwner(input){
  if(!ownedVerificationExact(input,['runtimePort']))return continuityVerificationUnavailable('OSV-OWNER-UNAVAILABLE');
  let found=null;for(const owned of continuityAuthorityDirectBindings.values()){
    try{const current=continuityVerificationOwnerRead(owned,input.runtimePort);if(found)return continuityVerificationUnavailable('OSV-OWNER-UNAVAILABLE');found={owned,current};}catch{}
  }
  if(!found)return continuityVerificationUnavailable('OSV-OWNER-UNAVAILABLE');
  const ownerHandle=Object.freeze({});continuityVerificationOwners.set(ownerHandle,{owned:found.owned,runtimePort:input.runtimePort});
  return Object.freeze({status:'acquired',ownerHandle});
}
export function inspectSourceOwnedContinuityVerificationOwner(input){
  if(!ownedVerificationExact(input,['ownerHandle','runtimePort']))return continuityVerificationUnavailable('OSV-OWNER-UNAVAILABLE');
  try{const row=continuityVerificationOwners.get(input.ownerHandle);if(!row||row.runtimePort!==input.runtimePort)ownedVerificationFail('OSV-OWNER-UNAVAILABLE');
    const c=continuityVerificationOwnerRead(row.owned,input.runtimePort);
    return Object.freeze({status:'current',repository:c.repository,course:ownedVerificationFreeze(c.course),
      issuer:Object.freeze({producerPort:row.owned.port,operationHandle:c.operation.operationHandle,executionHandle:c.operation.executionHandle,
        memberHandle:c.operation.memberHandle,expectedMemberRef:structuredClone(c.operation.expectedMemberRef)})});
  }catch(error){return continuityVerificationUnavailable(continuityVerificationCode(error));}
}
export function registerSourceOwnedCourseVerificationAssociation(input){
  if(!ownedVerificationExact(input,['ownerHandle','runtimePort','taskPreparationHandle']))ownedVerificationFail('OSV-ASSOCIATION-UNAVAILABLE');
  const owner=continuityVerificationOwners.get(input.ownerHandle);if(!owner||owner.runtimePort!==input.runtimePort)ownedVerificationFail('OSV-OWNER-UNAVAILABLE');
  const current=continuityVerificationOwnerRead(owner.owned,input.runtimePort);
  const event=inspectSourceOwnedTaskVerificationPreparation(input);
  if(!continuityAuthorityEqual(event.course,current.course))ownedVerificationFail('OSV-INPUT-DRIFT');
  let associations=continuityVerificationAssociations.get(current.operation);if(!associations){associations=new Map();continuityVerificationAssociations.set(current.operation,associations);}
  const suiteId=event.registered.selectedSuite.name;if(associations.has(suiteId)||associations.size>=128)ownedVerificationFail('OSV-ASSOCIATION-UNAVAILABLE');
  const association={ownerHandle:input.ownerHandle,runtimePort:input.runtimePort,event,course:current.course,operation:current.operation,
    stateRef:current.selectedStateRef,requesterFloor:current.requesterFloor};
  association.sha256=ownedVerificationDigest({event,course:current.course,member:current.member,requesterFloor:current.requesterFloor});
  associations.set(suiteId,association);
  return Object.freeze({status:'registered',suiteId,associationSha256:association.sha256});
}
function continuityVerificationAssociationRead(owned,runtimePort,suiteId){
  const current=continuityVerificationOwnerRead(owned,runtimePort),association=continuityVerificationAssociations.get(current.operation)?.get(suiteId);
  if(!association||association.runtimePort!==runtimePort||association.operation!==current.operation)ownedVerificationFail('OSV-ASSOCIATION-UNAVAILABLE');
  const registered=readOwnedVerificationRegistration(current.repository,suiteId);
  if(!continuityAuthorityEqual(registered,association.event.registered)||!continuityAuthorityEqual(current.course,association.course)
    ||!continuityAuthorityEqual(current.selectedStateRef,association.stateRef)
    ||!continuityVerificationFloorEqual(current.requesterFloor,association.requesterFloor))ownedVerificationFail('OSV-INPUT-DRIFT');
  recheckOwnedVerificationPhysicalRefs(association.event.closure);
  if(association.event.controlledMethod){const actual=inspectSourceOwnedControlledMethodVerificationPreparation(association.event.controlledMethod);
    if(!continuityAuthorityEqual(actual,association.event.controlledMethodEvent))ownedVerificationFail('OSV-INPUT-DRIFT');}
  return {current,association,registered};
}
function continuityVerificationBinding(owned,runtimePort,suiteId){
  const {current:c,association:a,registered:r}=continuityVerificationAssociationRead(owned,runtimePort,suiteId);
  const moduleRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
  const executable=readOwnedVerificationPhysicalFile(realpathSync(process.execPath),{maxBytes:256*1024*1024}).ref;
  const fixed=(path,args)=>({module:readOwnedVerificationPhysicalFile(path).ref,executable,
    argv:[...process.execArgv,path,...args],cwd:c.repository.primaryRoot});
  const executor=fixed(join(moduleRoot,'scripts','owned-continuity-verification.mjs'),['--consume-owned-verification','--channel-fd','4']);
  const guard=fixed(join(moduleRoot,'hooks','guard-lifecycle-ready.mjs'),['--runner','codex','--consume-owned-verification-guard','--channel-fd','4']);
  const quote=s=>"'"+String(s).replaceAll("'",process.platform==='win32'?"''":"'\\''")+"'";
  const command=(process.platform==='win32'?'& ':'')+[executable.path,...executor.argv].map(quote).join(' ');
  const sourceClosure=[...a.event.closure];
  // Bind the issuer and authentic channel/executor Source as well as the suite's own static closure.
  const moduleSources=collectOwnedVerificationSourceModules({primaryRoot:resolve(moduleRoot,'..','..')},[fileURLToPath(import.meta.url),join(moduleRoot,'lib','owned-continuity-verification.mjs'),
    join(moduleRoot,'lib','session-requester-bridge.mjs'),join(moduleRoot,'lib','codex-host-process-journal.mjs'),
    join(moduleRoot,'lib','session-authority-registry.mjs'),join(moduleRoot,'scripts','pipeline-state.mjs'),
    join(moduleRoot,'scripts','verify-journal.mjs'),guard.module.path,executor.module.path]);
  for(const ref of moduleSources)if(!sourceClosure.some(item=>item.path===ref.path))sourceClosure.push(ref);
  sourceClosure.sort((x,y)=>x.path.localeCompare(y.path));
  const course={...c.course,taskRegistrationSha256:a.event.taskRegistrationSha256};
  let selectedSuite=r.selectedSuite,controlledMethodStage=null;
  if(a.event.controlledMethod){const stagePreparationHandle=continuityMethodPrepareStage(c,a,r,course);
    controlledMethodStage=publishSourceOwnedControlledMethodVerificationStage({stagePreparationHandle,runtimePort});
    sourceClosure.push(controlledMethodStage.stageRef);sourceClosure.sort((x,y)=>x.path.localeCompare(y.path));
    selectedSuite={...r.selectedSuite,args:[controlledMethodStage.stageRef.path,controlledMethodStage.stageRef.sha256]};}
  const binding={schema:controlledMethodStage?'pipeline.owned-continuity-verification.binding.v2':'pipeline.owned-continuity-verification.binding.v1',repository:c.repository,candidate:r.candidate,
    requester:structuredClone(c.active.currentRequester),invocation:{sourceRef:c.active.sourceRef,invocationBindingSha256:c.active.invocationBindingSha256,
      controllerIdentity:c.requesterFloor.controllerIdentity,assurance:c.active.assurance},requesterFloor:c.requesterFloor,
    course,courseSha256:ownedVerificationDigest(course),selectedStateRef:c.selectedStateRef,approvalRefs:c.approvalRefs,
    member:c.member,registration:r.registration,associationSha256:a.sha256,suiteSha256:ownedVerificationDigest({suite:selectedSuite,closure:a.event.closure,candidateBlobs:a.event.candidateBlobs,...(controlledMethodStage?{controlledMethodStage}:{})}),
    selectedSuite,sourceClosure,guard,executor,command,commandSha256:sha256(command),
    journalInputs:{gitCommonDir:c.repository.commonDir,repoRoot:c.repository.primaryRoot,candidate:r.candidate,suites:[selectedSuite],
      policyInputs:{courseSha256:ownedVerificationDigest(course),associationSha256:a.sha256,closureSha256:ownedVerificationDigest(sourceClosure),
        registrationSha256:r.registration.physicalRef.sha256,attemptNonce:randomBytes(32).toString('hex')}}};
  if(controlledMethodStage)binding.controlledMethodStage=controlledMethodStage;
  return ownedVerificationFreeze(binding);
}
export function createSourceOwnedContinuityVerificationPort(input,runtimePort){
  if(!ownedVerificationExact(input,['producerPort','operationHandle','executionHandle','memberHandle','expectedMemberRef']))ownedVerificationFail('OSV-OWNER-UNAVAILABLE');
  const owned=continuityVerificationCaptured.get(input.operationHandle);if(!owned||owned.port!==input.producerPort)ownedVerificationFail('OSV-OWNER-UNAVAILABLE');
  const current=continuityVerificationOwnerRead(owned,runtimePort);
  if(current.operation.executionHandle!==input.executionHandle||current.operation.memberHandle!==input.memberHandle
    ||!continuityAuthorityEqual(current.operation.expectedMemberRef,input.expectedMemberRef))ownedVerificationFail('OSV-OWNER-UNAVAILABLE');
  const port=Object.freeze({async execute(request){
    if(!ownedVerificationExact(request,['suiteId'])||typeof request.suiteId!=='string')return continuityVerificationUnavailable('OSV-ASSOCIATION-UNAVAILABLE');
    const state=continuityVerificationPortStates.get(port);if(state.used)return continuityVerificationUnavailable('OSV-REPLAY');state.used=true;
    let handle;try{const binding=continuityVerificationBinding(owned,runtimePort,request.suiteId);handle=Object.freeze({});
      continuityVerificationAttempts.set(handle,{owned,runtimePort,suiteId:request.suiteId,binding,bindingSha256:ownedVerificationDigest(binding),
        deadline:performance.now()+CONTINUITY_VERIFICATION_TTL,state:'pending',claimedChallenge:null,executorChallenge:null,result:null});
      // All physical Registry callbacks have returned before this real asynchronous child course.
      const result=await spawnSourceOwnedContinuityVerificationChild({verificationAttemptHandle:handle},runtimePort);
      const attempt=continuityVerificationAttempts.get(handle);
      if(attempt.state==='expired'||(!['succeeded','failed'].includes(attempt.state)&&performance.now()>=attempt.deadline)){
        attempt.state='expired';return continuityVerificationUnavailable('OSV-EXPIRED');}
      if(!['succeeded','failed'].includes(attempt.state)){
        attempt.state='failed';return continuityVerificationUnavailable('OSV-TERMINAL-UNAVAILABLE');}
      return attempt.result??result;
    }catch(error){if(handle){const attempt=continuityVerificationAttempts.get(handle);
      if(attempt&&(attempt.state==='expired'||(!['succeeded','failed'].includes(attempt.state)&&performance.now()>=attempt.deadline))){
        attempt.state='expired';return continuityVerificationUnavailable('OSV-EXPIRED');}
      if(attempt&&!['succeeded','failed','expired'].includes(attempt.state))attempt.state='failed';}
      return continuityVerificationUnavailable(continuityVerificationCode(error,'OSV-VERIFY-FAILED'));}
  }});continuityVerificationPortStates.set(port,{used:false});return port;
}
function continuityVerificationAttemptRead(input){
  if(!ownedVerificationExact(input,['verificationAttemptHandle','runtimePort']))ownedVerificationFail('OSV-OWNER-UNAVAILABLE');
  const a=continuityVerificationAttempts.get(input.verificationAttemptHandle);
  if(!a||a.runtimePort!==input.runtimePort||!['pending','claimed','running'].includes(a.state))ownedVerificationFail('OSV-REPLAY');
  if(performance.now()>=a.deadline){a.state='expired';ownedVerificationFail('OSV-EXPIRED');}
  const {current,registered}=continuityVerificationAssociationRead(a.owned,a.runtimePort,a.suiteId);
  if(!continuityAuthorityEqual(current.member,a.binding.member)||!continuityAuthorityEqual(current.selectedStateRef,a.binding.selectedStateRef)
    ||!continuityVerificationFloorEqual(current.requesterFloor,a.binding.requesterFloor)||!continuityAuthorityEqual(registered.candidate,a.binding.candidate))ownedVerificationFail('OSV-INPUT-DRIFT');
  recheckOwnedVerificationPhysicalRefs([...a.binding.sourceClosure,a.binding.selectedStateRef,...a.binding.approvalRefs,a.binding.registration.physicalRef,
    a.binding.executor.executable,a.binding.requesterFloor.program.executable,a.binding.requesterFloor.program.module]);return a;
}
export function inspectSourceOwnedContinuityVerificationAttempt(input){
  try{const a=continuityVerificationAttemptRead(input);return Object.freeze({status:'current',state:a.state,bindingSha256:a.bindingSha256,
    binding:a.binding,deadlineRemainingMs:Math.max(1,Math.floor(a.deadline-performance.now()))});}
  catch(error){const a=continuityVerificationAttempts.get(input?.verificationAttemptHandle);
    if(a&&a.runtimePort===input?.runtimePort&&['pending','claimed','running'].includes(a.state))a.state='failed';
    return continuityVerificationUnavailable(continuityVerificationCode(error));}
}
function continuityVerificationExchange(input,phase){
  const handleKey=phase==='guard-challenge'?'guardExchangeHandle':phase==='executor-challenge'?'executorExchangeHandle':'terminalExchangeHandle';
  if(!ownedVerificationExact(input,['verificationAttemptHandle','runtimePort',handleKey]))ownedVerificationFail('OSV-EXCHANGE-UNAVAILABLE');
  const a=continuityVerificationAttemptRead({verificationAttemptHandle:input.verificationAttemptHandle,runtimePort:input.runtimePort});
  const e=inspectSourceOwnedContinuityVerificationExchange({exchangeHandle:input[handleKey]});
  const failedTerminal=phase==='terminal'&&e.terminal?.journal===null;
  const kind=failedTerminal?e.kind:(phase==='guard-challenge'?'guard':'executor');
  if(!['guard','executor'].includes(kind))ownedVerificationFail('OSV-EXCHANGE-UNAVAILABLE');
  const selected=kind==='guard'?a.binding.guard:a.binding.executor;
  if(e.verificationAttemptHandle!==input.verificationAttemptHandle||e.runtimePort!==input.runtimePort||e.phase!==phase
    ||e.kind!==kind||e.bindingSha256!==a.bindingSha256
    ||!SHA256_RE.test(e.challengeSha256??'')||!ownedVerificationSameProcess(a.binding.invocation.controllerIdentity,e.controllerIdentity)
    ||!continuityAuthorityEqual(e.executable,selected.executable)||!continuityAuthorityEqual(e.argv,selected.argv)
    ||e.cwd!==selected.cwd||e.commandSha256!==a.binding.commandSha256)ownedVerificationFail('OSV-EXCHANGE-UNAVAILABLE');
  return {a,e};
}
export function claimSourceOwnedContinuityVerificationAttempt(input){
  try{const {a,e}=continuityVerificationExchange(input,'guard-challenge');if(a.state!=='pending')ownedVerificationFail('OSV-REPLAY');
    a.state='claimed';a.claimedChallenge=e.challengeSha256;return Object.freeze({status:'claimed',bindingSha256:a.bindingSha256});
  }catch(error){const a=continuityVerificationAttempts.get(input?.verificationAttemptHandle);
    if(a&&a.runtimePort===input?.runtimePort&&a.state==='pending')a.state='failed';
    return continuityVerificationUnavailable(continuityVerificationCode(error,'OSV-EXCHANGE-UNAVAILABLE'));}
}
export function startSourceOwnedContinuityVerificationAttempt(input){
  try{const {a,e}=continuityVerificationExchange(input,'executor-challenge');if(a.state!=='claimed'||e.challengeSha256===a.claimedChallenge)ownedVerificationFail('OSV-REPLAY');
    a.state='running';a.executorChallenge=e.challengeSha256;return Object.freeze({status:'running',bindingSha256:a.bindingSha256});
  }catch(error){const a=continuityVerificationAttempts.get(input?.verificationAttemptHandle);
    if(a&&a.runtimePort===input?.runtimePort&&a.state==='claimed')a.state='failed';
    return continuityVerificationUnavailable(continuityVerificationCode(error,'OSV-EXCHANGE-UNAVAILABLE'));}
}
export function completeSourceOwnedContinuityVerificationAttempt(input){
  let a;try{const observed=continuityVerificationExchange(input,'terminal');a=observed.a;const e=observed.e;
    if(e.terminal?.journal===null){
      if(!['pending','claimed','running'].includes(a.state))ownedVerificationFail('OSV-REPLAY');
      a.state='failed';a.result=Object.freeze({status:'failed',code:'OSV-VERIFY-FAILED',terminal:structuredClone(e.terminal)});return a.result;
    }
    if(a.state!=='running'||e.challengeSha256!==a.executorChallenge||!e.terminal)ownedVerificationFail('OSV-TERMINAL-UNAVAILABLE');
    const terminal=e.terminal;
    const journal=terminal.journal;
    const ok=terminal.outerClose?.closeObserved===true&&terminal.outerClose?.code===0
      &&terminal.outerClose?.signal===null&&terminal.outerClose?.errorCode===null
      &&continuityAuthorityEqual(terminal.outerClose.childIdentity,e.childIdentity)
      &&journal?.terminal?.status==='passed'&&journal?.steps?.length===1
      &&journal.dispatchedSuiteCount===1&&journal.steps[0].exitCode===0&&journal.steps[0].reused===false
      &&continuityAuthorityEqual(journal.candidate??journal.manifest?.candidate,a.binding.candidate);
    a.state=ok?'succeeded':'failed';a.result=Object.freeze({status:a.state,code:ok?null:'OSV-VERIFY-FAILED',terminal:structuredClone(terminal)});return a.result;
  }catch(error){a??=continuityVerificationAttempts.get(input?.verificationAttemptHandle);if(a&&a.runtimePort===input?.runtimePort&&!['succeeded','failed','expired'].includes(a.state))a.state='failed';
    return continuityVerificationUnavailable(continuityVerificationCode(error,'OSV-TERMINAL-UNAVAILABLE'));}
}

// Controlled stage selection is fixed Source, never an input URL/hash map.
const CONTINUITY_METHOD_MODULES=Object.freeze({
  recorder:Object.freeze({path:'test-case-completion.mjs',sha256:'616f1fc97316e740f569c948d27cd4550fa68de8122e979a7437325624691b55'}),
  lifecycle:Object.freeze({path:'critic-verify-lifecycle.mjs',sha256:'601b359f44be9c367b476d6a65e03177f31b88e069123d26a16184b5bdf217a4'})
});
const continuityMethodStagePreparations=new WeakMap();
function continuityMethodCaptureSourceModules(){
  const directory=dirname(fileURLToPath(import.meta.url)),sourceRoot=resolve(directory,'../../..'),modules={};
  for(const [name,spec] of Object.entries(CONTINUITY_METHOD_MODULES)){
    const image=readOwnedVerificationPhysicalFile(join(directory,spec.path),{root:sourceRoot});
    if(image.ref.sha256!==spec.sha256)ownedVerificationFail('OSV-INPUT-DRIFT');
    modules[name]={url:pathToFileURL(image.ref.path).href,sha256:spec.sha256,ref:image.ref};
  }
  const sourceClosure=collectOwnedVerificationSourceModules({primaryRoot:sourceRoot},Object.values(modules).map(m=>m.ref.path));
  return ownedVerificationFreeze({sourceRoot,modules,sourceClosure,
    producerRef:readOwnedVerificationPhysicalFile(fileURLToPath(import.meta.url),{root:sourceRoot}).ref});
}
function continuityMethodModuleData(capture){
  return Object.fromEntries(Object.entries(capture.modules).map(([name,m])=>[name,{url:m.url,sha256:m.sha256}]));
}
export function inspectSourceOwnedControlledMethodVerificationPreparation(input){
  if(!ownedVerificationExact(input,['preparationHandle','ownerHandle','runtimePort','criticPacketId']))ownedVerificationFail('OSV-ASSOCIATION-UNAVAILABLE');
  const owner=continuityVerificationOwners.get(input.ownerHandle);if(!owner||owner.runtimePort!==input.runtimePort)ownedVerificationFail('OSV-OWNER-UNAVAILABLE');
  const c=continuityVerificationOwnerRead(owner.owned,input.runtimePort);
  const record=continuityMethodReadPreparation({repository:c.repository,preparationHandle:input.preparationHandle,checkInitialState:false});
  const accepted=c.snapshot.observed.state.planApproval?.acceptedContract;
  if(!accepted||accepted.path!==record.acceptedRef.path||accepted.sha256!==record.acceptedRef.sha256
    ||c.snapshot.observed.state.planSubmission?.specPath!==record.specPath)ownedVerificationFail('OSV-COURSE-UNAVAILABLE');
  if(record.repository.primaryRoot!==c.repository.primaryRoot||record.repository.commonDir!==c.repository.commonDir
    ||record.featureId!==c.course.featureId||record.planPath!==c.course.planPath||!record.methodDispatchHandle
    ||record.verifySuite?.path!=='tests/unit.test.mjs'||!record.controlledMethodModules)ownedVerificationFail('OSV-ASSOCIATION-UNAVAILABLE');
  const registered=readOwnedVerificationRegistration(c.repository,'controlled-method-unit');
  if(registered.selectedSuite.file!==join(c.repository.primaryRoot,record.verifySuite.path)
    ||!continuityAuthorityEqual(registered.selectedSuite.caseCompletion,record.verifySuite.caseCompletion))ownedVerificationFail('OSV-ASSOCIATION-UNAVAILABLE');
  const suiteRef=readOwnedVerificationPhysicalFile(registered.selectedSuite.file,{root:c.repository.primaryRoot}).ref;
  if(suiteRef.sha256!==record.verifySuite.sha256)ownedVerificationFail('OSV-INPUT-DRIFT');
  recheckOwnedVerificationPhysicalRefs([...record.controlledMethodModules.sourceClosure,record.controlledMethodModules.producerRef]);
  const method=inspectSourceOwnedControlledMethodDispatchHandle({methodDispatchHandle:record.methodDispatchHandle});
  const consumed=readBoundConsumedCriticReceipt({gitCommonDir:c.repository.commonDir,criticPacketId:input.criticPacketId,candidate:registered.candidate});
  const specRefs=consumed.packet.references.filter(r=>r.kind==='spec');
  const specBlob=continuityMethodGit(c.repository,['rev-parse',registered.candidate.commit+':'+record.specPath]);
  if(consumed.packet.request.taskId!==method.taskId||consumed.packet.candidate.base!==record.reviewBaseCommit
    ||specRefs.length!==1||specRefs[0].path!==record.specPath||specRefs[0].candidateBlobOid!==specBlob)ownedVerificationFail('OSV-ASSOCIATION-UNAVAILABLE');
  const refs=record.publicSources.map(ref=>({path:ref.path,sha256:ref.sha256}));
  const critic={packetId:input.criticPacketId,packetDigest:consumed.critic.packetDigest,criticReceiptSha256:consumed.criticReceiptSha256,specCandidateBlobOid:specBlob};
  return ownedVerificationFreeze({course:c.course,registered,suiteRef,preparationRef:record.provenanceRef,
    sourceModules:record.controlledMethodModules,refs,critic,
    protocolSha256:ownedVerificationDigest({schema:'pipeline.controlled-method-verification-binding.v1',suiteRef,preparationRef:record.provenanceRef,
      moduleData:continuityMethodModuleData(record.controlledMethodModules),course:c.course,requester:c.requesterFloor,critic})});
}
function continuityMethodPrepareStage(c,a,r,course){
  const event=inspectSourceOwnedControlledMethodVerificationPreparation(a.event.controlledMethod);
  if(!continuityAuthorityEqual(event,a.event.controlledMethodEvent)||!continuityAuthorityEqual(event.registered,r))ownedVerificationFail('OSV-INPUT-DRIFT');
  const data={candidate:r.candidate,common:c.repository.commonDir,criticPacketId:event.critic.packetId,featureId:c.course.featureId,
    modules:continuityMethodModuleData(event.sourceModules),refs:event.refs,root:c.repository.primaryRoot,
    stateFile:c.selectedStateRef.path,stateSha256:c.selectedStateRef.sha256};
  const stagePreparationHandle=Object.freeze({}),directory=join(c.repository.commonDir,'agent-pipeline/controlled-method-fixtures/continuity-transitions/verification-stages');
  const row={ownerHandle:a.ownerHandle,runtimePort:a.runtimePort,controlledMethod:a.event.controlledMethod,event,data,directory,
    path:join(directory,randomBytes(16).toString('hex')+'.json'),courseSha256:ownedVerificationDigest(course),
    requesterInvocationSha256:c.active.invocationBindingSha256,requesterFloor:c.requesterFloor,state:'pending'};
  continuityMethodStagePreparations.set(stagePreparationHandle,row);return stagePreparationHandle;
}
export function inspectSourceOwnedControlledMethodStagePreparation(input){
  if(!ownedVerificationExact(input,['stagePreparationHandle','runtimePort']))ownedVerificationFail('OSV-ASSOCIATION-UNAVAILABLE');
  const row=continuityMethodStagePreparations.get(input.stagePreparationHandle);
  if(!row||row.runtimePort!==input.runtimePort||!['pending','published'].includes(row.state))ownedVerificationFail('OSV-ASSOCIATION-UNAVAILABLE');
  const owner=continuityVerificationOwners.get(row.ownerHandle);if(!owner||owner.runtimePort!==input.runtimePort)ownedVerificationFail('OSV-OWNER-UNAVAILABLE');
  const c=continuityVerificationOwnerRead(owner.owned,input.runtimePort),event=inspectSourceOwnedControlledMethodVerificationPreparation(row.controlledMethod);
  if(!continuityAuthorityEqual(event,row.event)||!continuityVerificationFloorEqual(c.requesterFloor,row.requesterFloor)
    ||c.active.invocationBindingSha256!==row.requesterInvocationSha256||c.selectedStateRef.path!==row.data.stateFile
    ||c.selectedStateRef.sha256!==row.data.stateSha256)ownedVerificationFail('OSV-INPUT-DRIFT');
  if(row.stageRef)recheckOwnedVerificationPhysicalRefs([row.stageRef]);
  return ownedVerificationFreeze({repository:c.repository,data:row.data,directory:row.directory,path:row.path,state:row.state,
    stageRef:row.stageRef??null,event:row.event,courseSha256:row.courseSha256,requesterInvocationSha256:row.requesterInvocationSha256});
}
export function completeSourceOwnedControlledMethodStagePublication(input){
  if(!ownedVerificationExact(input,['stagePreparationHandle','runtimePort']))ownedVerificationFail('OSV-ASSOCIATION-UNAVAILABLE');
  const observed=inspectSourceOwnedControlledMethodStagePreparation(input),row=continuityMethodStagePreparations.get(input.stagePreparationHandle);
  if(row.state!=='pending')ownedVerificationFail('OSV-REPLAY');
  if(process.platform!=='win32'){const directory=lstatSync(observed.directory),file=lstatSync(observed.path);
    if(!directory.isDirectory()||directory.isSymbolicLink()||directory.uid!==process.getuid()||(directory.mode&0o077)!==0
      ||file.uid!==process.getuid()||(file.mode&0o077)!==0)ownedVerificationFail('OSV-INPUT-DRIFT');}
  const image=readOwnedVerificationPhysicalFile(observed.path,{root:observed.repository.commonDir,maxBytes:16384});
  if(image.bytes.toString('utf8')!==ownedVerificationCanonical(observed.data)+'\n')ownedVerificationFail('OSV-INPUT-DRIFT');
  row.stageRef=image.ref;row.state='published';
  return ownedVerificationFreeze({schema:'pipeline.controlled-method-verification-binding.v1',preparationRef:row.event.preparationRef,
    suiteRef:row.event.suiteRef,producerRef:row.event.sourceModules.producerRef,sourceModules:row.event.sourceModules,
    stageRef:row.stageRef,stageDataSha256:row.stageRef.sha256,courseSha256:row.courseSha256,
    requesterInvocationSha256:row.requesterInvocationSha256,critic:row.event.critic});
}
