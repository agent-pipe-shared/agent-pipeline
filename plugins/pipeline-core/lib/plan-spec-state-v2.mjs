// SPDX-License-Identifier: SUL-1.0

/**
 * Pure HAW-0 state transitions for binding an existing approval to its Spec
 * and for recording a bound revocation. The pipeline-state writer owns locks,
 * filesystem I/O and command routing; this module owns only closed values.
 */
import { createHash } from "node:crypto";
import { validateContinuityState } from "./continuity-state.mjs";

const APPROVAL_SCHEMA = "pipeline.plan-approval.v2";
const PREVIOUS_CURRENT_APPROVAL_SCHEMA = "pipeline.plan-approval.v3";
export const CURRENT_APPROVAL_SCHEMA = "pipeline.plan-approval.v4";
// Schema-identifier collision, resolved additively and deliberately NOT merged:
// "pipeline.plan-approval.v3" denotes two disjoint historical record shapes.
//   - PREVIOUS_CURRENT_APPROVAL_SCHEMA (above): the submission-bound approval
//     superseded by v4; key set PREVIOUS_CURRENT_APPROVAL_KEYS. Authoritative
//     for everything submitPlan/approveSubmittedPlan/sealCurrentPlanApproval
//     write. Untouched by the restoration below.
//   - HUMAN_APPROVAL_SCHEMA (below): the ledger-first, human-decision-bound
//     approval of the spec-binding lineage, restored from 998a609 (the last
//     commit before the 75b8361 integration merge dropped it); key set
//     HUMAN_APPROVAL_KEYS. The two key sets are disjoint, so hasExactKeys keeps
//     validV3Approval and validPreviousCurrentPlanApproval mutually exclusive:
//     no record can satisfy both, and neither reader can misread the other.
const HUMAN_APPROVAL_SCHEMA = "pipeline.plan-approval.v3";
const HUMAN_REFERENCE_SCHEMA = "pipeline.human-decision-reference.v1";
export const PLAN_SUBMISSION_SCHEMA = "pipeline.plan-submission.v1";
export const PLAN_INVALIDATION_SCHEMA = "pipeline.plan-invalidation.v1";
const AUTHORITY_SCHEMA = "pipeline.po-gate-authority.v2";
const REVOCATION_SCHEMA = "pipeline.plan-revocation.v2";
export const LEGACY_V2_REVOCATION_RECOVERY_SCHEMA = "pipeline.plan-legacy-v2-revocation-recovery.v1";
export const LEGACY_V2_REVOCATION_RECOVERY_CLASS = "legacy-v2-revocation-implementation-to-design";
const STATE_SCHEMA = "pipeline.state.v0";
const SHA256 = /^[a-f0-9]{64}$/u;
const AUTHORITY_KEYS = [
  "schema",
  "humanFacing",
  "sourceSha256",
  "runtimeSha256",
  "receiptSha256",
  "repositoryFingerprint",
  "planPath",
  "planSha256",
  "specPath",
  "specSha256",
];
const APPROVAL_KEYS = [
  "schema",
  "approvedBy",
  "approvedAt",
  "specBoundBy",
  "specBoundAt",
  "poGateAuthority",
];
const HUMAN_APPROVAL_KEYS = [...APPROVAL_KEYS, "humanDecision"];
const HUMAN_REFERENCE_KEYS = ["schema", "decisionId", "decisionDigest", "candidate", "checkpoint"];
const LEGACY_APPROVAL_KEYS = ["approvedBy", "approvedAt"];
const REVOCATION_KEYS = [
  "schema",
  "planPath",
  "planSha256",
  "specPath",
  "specSha256",
  "revokedBy",
  "revokedAt",
];
const LEGACY_V2_RECOVERY_KEYS = [
  "schema",
  "recoveryClass",
  "recoveredBy",
  "recoveredAt",
  "preimageSha256",
];
// The historical V2 writer predates submissions/invalidation.  These are the
// only stable State envelope fields it could carry alongside the defective
// approval/revocation pair.  New or unrecognised fields are not passive here:
// accepting one could overwrite a later recovery receipt or reinterpret a
// newer State shape as this narrow historical case.
const LEGACY_V2_RECOVERY_STATE_KEYS = new Set([
  "schema",
  "activeFeature",
  "planApproved",
  "planApproval",
  "planRevocation",
  "continuity",
  "updatedAt",
  "closedFeatures",
  "pushApproval",
  "deployApprovals",
]);
const ACTIVE_FEATURE_KEYS = ["id", "planPath", "phase"];
// Purely additive: an activeFeature carrying `phaseHistory` is a superset
// shape, never a replacement -- a state file written before this field
// existed has exactly ACTIVE_FEATURE_KEYS and stays valid forever (backward
// compatibility, NVA-W4-02B). Only a writer that chooses to track history
// (this module's own transition builders) ever adds the fourth key.
const ACTIVE_FEATURE_KEYS_WITH_HISTORY = ["id", "planPath", "phase", "phaseHistory"];
const PHASE_HISTORY_ENTRY_KEYS = ["phase", "at"];
const SUBMISSION_KEYS = [
  "schema",
  "featureId",
  "planPath",
  "planSha256",
  "specPath",
  "specSha256",
  "profile",
  "profileSha256",
  "submittedBy",
  "submittedAt",
];
const CURRENT_APPROVAL_KEYS = [
  "schema",
  "approvedBy",
  "approvedAt",
  "submissionSha256",
  "profileSha256",
  "poGateAuthority",
  "priorInvalidationSha256",
];
const PREVIOUS_CURRENT_APPROVAL_KEYS = CURRENT_APPROVAL_KEYS.filter((key) => key !== "priorInvalidationSha256");
const INVALIDATION_KEYS = [
  "schema",
  "featureId",
  "invalidatedSubmissionSha256",
  "invalidatedApprovalSha256",
  "invalidatedBy",
  "invalidatedAt",
  "reason",
];
const PROFILES = new Set(["epic", "feature", "mini"]);
const PHASES = new Set(["design", "implementation"]);
// NVA-R3-PRDBIND (backlog: 2026-08-29-prd-binding-precedes-framing-with-no-
// reopen-path-back.md): distinguishes "releasing a binding that a bind step
// froze before it was ever submitted" from the two reasons above, neither of
// which describes backing out of a submission or approval that never
// existed. See reopenPlanDesign()'s fifth path below.
const REOPEN_UNSUBMITTED_BINDING_REASON = "pipeline.reopen-bound-unsubmitted-prd";
const INVALIDATION_REASONS = new Set(["reopen-design", "document-drift", REOPEN_UNSUBMITTED_BINDING_REASON]);

export const PLAN_LIFECYCLE_STATUSES = Object.freeze([
  "draft",
  "awaiting-approval",
  "approved",
  "implementing",
]);

function fail(code) {
  return { ok: false, code };
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value, keys) {
  return isPlainObject(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function isCanonicalIso(value) {
  if (typeof value !== "string") return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function isNonBlankString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isRepositoryPath(value) {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.includes("\0")
    || value.includes("\\")
    || value.startsWith("/")
    || /^[A-Za-z]:/u.test(value)
  ) return false;
  return value.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}

function equalCanonical(left, right) {
  try {
    return canonicalJson(left) === canonicalJson(right);
  } catch {
    return false;
  }
}

/** Repository canonical JSON: recursive lexical keys and JSON scalar bytes. */
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

export function sha256CanonicalJson(value) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function validAuthority(value) {
  return hasExactKeys(value, AUTHORITY_KEYS)
    && value.schema === AUTHORITY_SCHEMA
    && (value.humanFacing === "de" || value.humanFacing === "en")
    && SHA256.test(value.sourceSha256)
    && SHA256.test(value.runtimeSha256)
    && SHA256.test(value.receiptSha256)
    && SHA256.test(value.repositoryFingerprint)
    && isRepositoryPath(value.planPath)
    && SHA256.test(value.planSha256)
    && isRepositoryPath(value.specPath)
    && SHA256.test(value.specSha256);
}

function validLegacyApproval(value) {
  return hasExactKeys(value, LEGACY_APPROVAL_KEYS)
    && isNonBlankString(value.approvedBy)
    && isCanonicalIso(value.approvedAt);
}

function validV2Approval(value) {
  return hasExactKeys(value, APPROVAL_KEYS)
    && value.schema === APPROVAL_SCHEMA
    && isNonBlankString(value.approvedBy)
    && isCanonicalIso(value.approvedAt)
    && isNonBlankString(value.specBoundBy)
    && isCanonicalIso(value.specBoundAt)
    && validAuthority(value.poGateAuthority);
}

function validPhaseHistoryEntry(value) {
  return hasExactKeys(value, PHASE_HISTORY_ENTRY_KEYS)
    && PHASES.has(value.phase)
    && isCanonicalIso(value.at);
}

function validPhaseHistory(value) {
  return Array.isArray(value) && value.every(validPhaseHistoryEntry);
}

function validHumanDecisionReference(value) {
  return hasExactKeys(value, HUMAN_REFERENCE_KEYS)
    && value.schema === HUMAN_REFERENCE_SCHEMA
    && typeof value.decisionId === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value.decisionId)
    && SHA256.test(value.decisionDigest)
    && hasExactKeys(value.candidate, ["commit", "tree"])
    && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(value.candidate.commit)
    && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(value.candidate.tree)
    && hasExactKeys(value.checkpoint, ["repositoryFingerprint", "streamId", "sequence", "eventDigest", "candidateCommit", "candidateTree"])
    && SHA256.test(value.checkpoint.repositoryFingerprint)
    && value.checkpoint.streamId === "human"
    && Number.isSafeInteger(value.checkpoint.sequence) && value.checkpoint.sequence > 0
    && SHA256.test(value.checkpoint.eventDigest)
    && value.checkpoint.candidateCommit === value.candidate.commit
    && value.checkpoint.candidateTree === value.candidate.tree;
}

function validV3Approval(value) {
  return hasExactKeys(value, HUMAN_APPROVAL_KEYS)
    && value.schema === HUMAN_APPROVAL_SCHEMA
    && isNonBlankString(value.approvedBy)
    && isCanonicalIso(value.approvedAt)
    && isNonBlankString(value.specBoundBy)
    && isCanonicalIso(value.specBoundAt)
    && validAuthority(value.poGateAuthority)
    && validHumanDecisionReference(value.humanDecision)
    && value.humanDecision.checkpoint.repositoryFingerprint === value.poGateAuthority.repositoryFingerprint;
}

function validActiveFeature(value) {
  if (!isPlainObject(value)) return false;
  const hasHistory = Object.prototype.hasOwnProperty.call(value, "phaseHistory");
  const keys = hasHistory ? ACTIVE_FEATURE_KEYS_WITH_HISTORY : ACTIVE_FEATURE_KEYS;
  return hasExactKeys(value, keys)
    && isNonBlankString(value.id)
    && isRepositoryPath(value.planPath)
    && PHASES.has(value.phase)
    && (!hasHistory || validPhaseHistory(value.phaseHistory));
}

/**
 * Append one timestamped `{phase, at}` entry to an activeFeature's phase
 * history. Purely additive and order-preserving: a pre-existing activeFeature
 * without `phaseHistory` starts a fresh array rather than failing -- there is
 * no bootstrap requirement to backfill history for a feature created before
 * this field existed.
 */
export function appendPhaseHistory(activeFeature, phase, at) {
  const priorHistory = Array.isArray(activeFeature?.phaseHistory) ? activeFeature.phaseHistory : [];
  return [...priorHistory, { phase, at }];
}

export function validPlanSubmission(value) {
  return hasExactKeys(value, SUBMISSION_KEYS)
    && value.schema === PLAN_SUBMISSION_SCHEMA
    && isNonBlankString(value.featureId)
    && isRepositoryPath(value.planPath)
    && SHA256.test(value.planSha256)
    && isRepositoryPath(value.specPath)
    && SHA256.test(value.specSha256)
    && PROFILES.has(value.profile)
    && SHA256.test(value.profileSha256)
    && isNonBlankString(value.submittedBy)
    && isCanonicalIso(value.submittedAt);
}

export function validCurrentPlanApproval(value) {
  return hasExactKeys(value, CURRENT_APPROVAL_KEYS)
    && value.schema === CURRENT_APPROVAL_SCHEMA
    && isNonBlankString(value.approvedBy)
    && isCanonicalIso(value.approvedAt)
    && SHA256.test(value.submissionSha256)
    && SHA256.test(value.profileSha256)
    && (value.priorInvalidationSha256 === null || SHA256.test(value.priorInvalidationSha256))
    && validAuthority(value.poGateAuthority);
}

function validPreviousCurrentPlanApproval(value) {
  return hasExactKeys(value, PREVIOUS_CURRENT_APPROVAL_KEYS)
    && value.schema === PREVIOUS_CURRENT_APPROVAL_SCHEMA
    && isNonBlankString(value.approvedBy)
    && isCanonicalIso(value.approvedAt)
    && SHA256.test(value.submissionSha256)
    && SHA256.test(value.profileSha256)
    && validAuthority(value.poGateAuthority);
}

export function validPlanInvalidation(value) {
  return hasExactKeys(value, INVALIDATION_KEYS)
    && value.schema === PLAN_INVALIDATION_SCHEMA
    && isNonBlankString(value.featureId)
    // NVA-R3-PRDBIND: nullable like invalidatedApprovalSha256 below -- the
    // bound-unsubmitted-binding reason has no real submission to hash either.
    // Purely additive: every existing writer (a real prior submission) still
    // supplies a real hash, so this never accepts a previously-rejected value.
    && (value.invalidatedSubmissionSha256 === null || SHA256.test(value.invalidatedSubmissionSha256))
    && (value.invalidatedApprovalSha256 === null || SHA256.test(value.invalidatedApprovalSha256))
    && isNonBlankString(value.invalidatedBy)
    && isCanonicalIso(value.invalidatedAt)
    && INVALIDATION_REASONS.has(value.reason);
}

function submissionMatchesObservation(submission, observation = {}) {
  return (observation.planSha256 === undefined || observation.planSha256 === submission.planSha256)
    && (observation.specSha256 === undefined || observation.specSha256 === submission.specSha256)
    && (observation.profileSha256 === undefined || observation.profileSha256 === submission.profileSha256);
}

function currentSubmission(state, observation) {
  const submission = state.planSubmission;
  if (!validPlanSubmission(submission)
    || submission.featureId !== state.activeFeature.id
    || submission.planPath !== state.activeFeature.planPath) return null;
  const invalidation = state.planInvalidation;
  if (invalidation !== undefined) {
    if (!validPlanInvalidation(invalidation) || invalidation.featureId !== state.activeFeature.id) return null;
    if (invalidation.invalidatedSubmissionSha256 === sha256CanonicalJson(submission)) return null;
  }
  return submissionMatchesObservation(submission, observation) ? submission : null;
}

function currentApproval(state, submission, observation) {
  const approval = state.planApproval;
  if (submission !== null && (validCurrentPlanApproval(approval) || validPreviousCurrentPlanApproval(approval))) {
    const authority = approval.poGateAuthority;
    const invalidation = state.planInvalidation;
    const requiredSeal = invalidation === undefined ? null : sha256CanonicalJson(invalidation);
    const sealed = approval.schema === CURRENT_APPROVAL_SCHEMA
      ? approval.priorInvalidationSha256 === requiredSeal
      : invalidation === undefined;
    return approval.submissionSha256 === sha256CanonicalJson(submission)
      && approval.profileSha256 === submission.profileSha256
      && authority.planPath === submission.planPath
      && authority.planSha256 === submission.planSha256
      && authority.specPath === submission.specPath
      && authority.specSha256 === submission.specSha256
      && submissionMatchesObservation(submission, observation)
      && sealed
      ? approval
      : null;
  }
  // Compatibility states had no explicit submission. Their exact approval
  // remains current until the next sanctioned lifecycle write.
  if (state.planSubmission === undefined && state.planApproved === true) {
    // Collision resolution, read side: the restored human-decision-bound v3
    // approval has exactly the standing of the v2 spec-bound one -- same closed
    // authority, plus a ledger reference. Without this widening a freshly
    // written v3 approval would read back as no approval at all
    // (PLAN-LIFECYCLE-APPROVAL-STALE), which is worse than not restoring the
    // writer. Strictly additive: this compatibility branch is only reached when
    // state.planSubmission is undefined, so no submission-bound path changes.
    if (validV2Approval(approval) || validV3Approval(approval)) {
      const authority = approval.poGateAuthority;
      if (authority.planPath !== state.activeFeature.planPath) return null;
      if (observation.planSha256 !== undefined && observation.planSha256 !== authority.planSha256) return null;
      if (observation.specSha256 !== undefined && observation.specSha256 !== authority.specSha256) return null;
      return approval;
    }
    if (validLegacyApproval(approval)) return approval;
  }
  return null;
}

/**
 * One closed lifecycle projection shared by every State reader. Callers that
 * can observe repository bytes pass their current digests; any drift then
 * immediately removes approval/implementation authority and names the sole
 * sanctioned recovery action.
 */
export function derivePlanLifecycle(state, observation = {}) {
  if (!isPlainObject(state) || state.schema !== STATE_SCHEMA) {
    return { ok: false, code: "PLAN-LIFECYCLE-STATE-INVALID", status: null, phase: null, nextAction: null };
  }
  if (state.activeFeature === undefined || state.activeFeature === null) {
    return { ok: true, code: "PLAN-LIFECYCLE-INACTIVE", status: null, phase: null, nextAction: null };
  }
  if (!validActiveFeature(state.activeFeature)) {
    return { ok: false, code: "PLAN-LIFECYCLE-FEATURE-INVALID", status: null, phase: null, nextAction: null };
  }
  if (state.planSubmission !== undefined && !validPlanSubmission(state.planSubmission)) {
    return { ok: false, code: "PLAN-LIFECYCLE-SUBMISSION-INVALID", status: null, phase: state.activeFeature.phase, nextAction: null };
  }
  if (state.planInvalidation !== undefined && !validPlanInvalidation(state.planInvalidation)) {
    return { ok: false, code: "PLAN-LIFECYCLE-INVALIDATION-INVALID", status: null, phase: state.activeFeature.phase, nextAction: null };
  }
  if (state.planSubmission === undefined
    && state.planApproved === false
    && validV2Approval(state.planApproval)
    && (!validV2Revocation(state.planRevocation)
      || !matchingRevocation(state.planRevocation, state.planApproval))) {
    return {
      ok: false,
      code: "PLAN-LIFECYCLE-LEGACY-REVOCATION-INVALID",
      status: null,
      phase: state.activeFeature.phase,
      nextAction: null,
    };
  }
  const submission = currentSubmission(state, observation);
  const approval = currentApproval(state, submission, observation);
  const observedDrift = validPlanSubmission(state.planSubmission)
    && !submissionMatchesObservation(state.planSubmission, observation);
  const invalidated = validPlanSubmission(state.planSubmission)
    && validPlanInvalidation(state.planInvalidation)
    && state.planInvalidation.invalidatedSubmissionSha256 === sha256CanonicalJson(state.planSubmission);
  let status;
  if (submission === null && approval === null) status = "draft";
  else if (submission === null) status = state.activeFeature.phase === "implementation" ? "implementing" : "approved";
  else if (approval === null) status = "awaiting-approval";
  else status = state.activeFeature.phase === "implementation" ? "implementing" : "approved";
  if (approval !== null && state.planApproved !== true) {
    return {
      ok: false,
      code: "PLAN-LIFECYCLE-APPROVAL-CONTRADICTORY",
      status,
      phase: state.activeFeature.phase,
      nextAction: "reopen-design",
      submissionCurrent: submission !== null,
      approvalCurrent: false,
    };
  }
  if (state.activeFeature.phase === "implementation" && status !== "implementing") {
    return {
      ok: false,
      code: observedDrift ? "PLAN-LIFECYCLE-DIGEST-DRIFT" : "PLAN-LIFECYCLE-IMPLEMENTATION-UNAUTHORIZED",
      status,
      phase: state.activeFeature.phase,
      nextAction: "reopen-design",
      submissionCurrent: submission !== null,
      approvalCurrent: false,
    };
  }
  if (state.planApproved === true && approval === null) {
    return {
      ok: false,
      code: observedDrift ? "PLAN-LIFECYCLE-DIGEST-DRIFT" : "PLAN-LIFECYCLE-APPROVAL-STALE",
      status,
      phase: state.activeFeature.phase,
      nextAction: "reopen-design",
      submissionCurrent: submission !== null,
      approvalCurrent: false,
    };
  }
  return {
    ok: true,
    code: observedDrift ? "PLAN-LIFECYCLE-DIGEST-DRIFT"
      : invalidated ? "PLAN-LIFECYCLE-INVALIDATED"
        : "PLAN-LIFECYCLE-CURRENT",
    status,
    phase: state.activeFeature.phase,
    nextAction: observedDrift ? "reopen-design" : null,
    submissionCurrent: submission !== null,
    approvalCurrent: approval !== null,
    submissionSha256: submission === null ? null : sha256CanonicalJson(submission),
    approvalSha256: approval === null ? null : sha256CanonicalJson(approval),
  };
}

function exactTransitionState(state, expectedStateSha256) {
  if (!currentStateMatches(state, expectedStateSha256)) return fail("PLAN-LIFECYCLE-STATE-STALE");
  const lifecycle = derivePlanLifecycle(state);
  return lifecycle.ok ? { ok: true, lifecycle } : fail(lifecycle.code);
}

export function submitPlan({
  state,
  expectedStateSha256,
  poGateAuthority,
  profile,
  profileSha256,
  by,
  at,
}) {
  const checked = exactTransitionState(state, expectedStateSha256);
  if (!checked.ok) return checked;
  if (checked.lifecycle.status !== "draft" || state.activeFeature.phase !== "design") {
    return fail("PLAN-SUBMIT-STATE-INVALID");
  }
  if (!validAuthority(poGateAuthority)
    || poGateAuthority.planPath !== state.activeFeature.planPath
    || !PROFILES.has(profile)
    || !SHA256.test(profileSha256 ?? "")
    || !isNonBlankString(by)
    || !isCanonicalIso(at)) return fail("PLAN-SUBMIT-REQUEST-INVALID");
  const continuity = state.continuity;
  if (!validateContinuityState(continuity, state.activeFeature.id).ok) {
    return fail("PLAN-SUBMIT-CONTINUITY-INVALID");
  }
  if (continuity.revision >= Number.MAX_SAFE_INTEGER
    || continuity.queueHead === null
    || continuity.queueHead.dispatch !== null
    || continuity.blocker !== null
    || continuity.acknowledgedFinal !== null
    || continuity.authority.result !== null
    || continuity.recovery !== null
    || continuity.decisionTxn !== null
    || continuity.closeTransition != null) {
    return fail("PLAN-SUBMIT-CONTINUITY-BUSY");
  }
  // A signed continuity-authority revision (recorded via the dedicated
  // revision path, never via this writer) can rebind continuity.authority to
  // a document *other* than the one this ordinary, unsigned submission's own
  // PO-gate view derives. Content-digest drift on the SAME document is the
  // routine, expected shape of an ordinary resubmission and is never gated
  // here; a PATH mismatch means the currently recorded binding was moved by
  // something other than this submission and must never be silently
  // overwritten -- fail closed and name which side of the binding conflicts.
  if (continuity.authority.prd.path !== poGateAuthority.planPath) {
    return fail("PLAN-SUBMIT-AUTHORITY-PRD-CONFLICT");
  }
  if (continuity.authority.spec.path !== poGateAuthority.specPath) {
    return fail("PLAN-SUBMIT-AUTHORITY-SPEC-CONFLICT");
  }
  const submission = {
    schema: PLAN_SUBMISSION_SCHEMA,
    featureId: state.activeFeature.id,
    planPath: poGateAuthority.planPath,
    planSha256: poGateAuthority.planSha256,
    specPath: poGateAuthority.specPath,
    specSha256: poGateAuthority.specSha256,
    profile,
    profileSha256,
    submittedBy: by,
    submittedAt: at,
  };
  const next = {
    ...state,
    planApproved: false,
    planSubmission: submission,
    continuity: {
      ...continuity,
      revision: continuity.revision + 1,
      authority: {
        prd: { path: poGateAuthority.planPath, sha256: poGateAuthority.planSha256 },
        spec: { path: poGateAuthority.specPath, sha256: poGateAuthority.specSha256 },
        result: null,
      },
      nativeContinuation: null,
      resume: {
        mode: "immediate",
        sourceRevision: continuity.revision + 1,
        reasonCode: "active-turn",
      },
    },
  };
  if (!validateContinuityState(next.continuity, state.activeFeature.id).ok) {
    return fail("PLAN-SUBMIT-CONTINUITY-POSTIMAGE");
  }
  return {
    ok: true,
    replay: false,
    state: next,
    submission,
    planSubmissionSha256: sha256CanonicalJson(submission),
  };
}

export function approveSubmittedPlan({
  state,
  expectedStateSha256,
  expectedSubmissionSha256,
  poGateAuthority,
  profileSha256,
  by,
  at,
}) {
  const checked = exactTransitionState(state, expectedStateSha256);
  if (!checked.ok) return checked;
  if (checked.lifecycle.status !== "awaiting-approval"
    || checked.lifecycle.submissionSha256 !== expectedSubmissionSha256
    || !validAuthority(poGateAuthority)
    || !SHA256.test(profileSha256 ?? "")
    || !isNonBlankString(by)
    || !isCanonicalIso(at)) return fail("PLAN-APPROVE-REQUEST-INVALID");
  const submission = state.planSubmission;
  if (submission.profileSha256 !== profileSha256
    || submission.planPath !== poGateAuthority.planPath
    || submission.planSha256 !== poGateAuthority.planSha256
    || submission.specPath !== poGateAuthority.specPath
    || submission.specSha256 !== poGateAuthority.specSha256) return fail("PLAN-APPROVE-AUTHORITY-STALE");
  const approval = {
    schema: CURRENT_APPROVAL_SCHEMA,
    approvedBy: by,
    approvedAt: at,
    submissionSha256: expectedSubmissionSha256,
    profileSha256,
    poGateAuthority,
    priorInvalidationSha256: state.planInvalidation === undefined
      ? null
      : sha256CanonicalJson(state.planInvalidation),
  };
  const next = { ...state, planApproved: true, planApproval: approval };
  // A renewed exact approval supersedes any retained historical revocation.
  // Keeping that stale record would produce an impossible mixed state
  // (approved current authority plus revoked prior authority) and leave the
  // sanctioned reopen -> submit -> approve recovery path permanently blocked.
  delete next.planRevocation;
  return {
    ok: true,
    replay: false,
    state: next,
    approval,
  };
}

/**
 * One deterministic compatibility writer for a current v3 approval that
 * follows retained invalidation audit.  It preserves the PO approval itself;
 * only the current-approval schema and its closed audit seal are renewed.
 */
export function sealCurrentPlanApproval({ state, expectedStateSha256 }) {
  if (!currentStateMatches(state, expectedStateSha256)) return fail("PLAN-LIFECYCLE-STATE-STALE");
  if (!validActiveFeature(state?.activeFeature) || state.planApproved !== true) {
    return fail("PLAN-APPROVAL-SEAL-STATE-INVALID");
  }
  if (!validPlanInvalidation(state.planInvalidation)) return fail("PLAN-APPROVAL-SEAL-INVALIDATION-REQUIRED");
  const approval = state.planApproval;
  if (!validPreviousCurrentPlanApproval(approval)) return fail("PLAN-APPROVAL-SEAL-V3-REQUIRED");
  const submission = currentSubmission(state, {});
  const authority = approval.poGateAuthority;
  if (submission === null
    || !new Set(["design", "implementation"]).has(state.activeFeature.phase)
    || approval.submissionSha256 !== sha256CanonicalJson(submission)
    || approval.profileSha256 !== submission.profileSha256
    || authority.planPath !== submission.planPath
    || authority.planSha256 !== submission.planSha256
    || authority.specPath !== submission.specPath
    || authority.specSha256 !== submission.specSha256) {
    return fail("PLAN-APPROVAL-SEAL-STATE-INVALID");
  }
  const sealed = {
    ...approval,
    schema: CURRENT_APPROVAL_SCHEMA,
    priorInvalidationSha256: sha256CanonicalJson(state.planInvalidation),
  };
  return {
    ok: true,
    replay: false,
    state: { ...state, planApproval: sealed },
    approval: sealed,
  };
}

// NVA-R3-PRDBIND: true exactly when `continuity.authority` is bound to real
// repository documents -- the same live binding
// guard-lifecycle-ready.mjs's `boundAuthorityDocumentPath()` reads to refuse
// direct edits (GUARD-LIFECYCLE-AUTHORITY-BOUND). Every coordinator-sourced
// bind (`applyOnboardingBootstrapBind`) and every kickoff promotion write
// this; a genuinely pre-continuity legacy state (the `legacyV2Approval`
// shape reopenPlanDesign() already special-cases, and the hostile/malformed
// fixtures this module's own tests construct) does not, and this predicate
// deliberately fails closed (false) rather than guess when it cannot tell.
function continuityAuthorityBound(state) {
  const authority = state.continuity?.authority;
  if (!isPlainObject(authority)) return false;
  return isPlainObject(authority.prd) && isRepositoryPath(authority.prd.path) && SHA256.test(authority.prd.sha256 ?? "")
    && isPlainObject(authority.spec) && isRepositoryPath(authority.spec.path) && SHA256.test(authority.spec.sha256 ?? "");
}

export function reopenPlanDesign({
  state,
  expectedStateSha256,
  by,
  at,
  reason = "reopen-design",
}) {
  if (!currentStateMatches(state, expectedStateSha256)) return fail("PLAN-REOPEN-STATE-STALE");
  if (!validActiveFeature(state?.activeFeature)
    || !isNonBlankString(by)
    || !isCanonicalIso(at)
    || !INVALIDATION_REASONS.has(reason)) return fail("PLAN-REOPEN-REQUEST-INVALID");
  const submission = state.planSubmission;
  if (!validPlanSubmission(submission)) {
    // Pre-submission V2 approvals are a bounded compatibility state. They have
    // an authority-bound approval but no submission digest to invalidate, so a
    // V3 invalidation record cannot be truthfully manufactured. The sanctioned
    // reopen writer therefore retires that approval atomically and leaves an
    // ordinary editable design draft. Do not accept any mixed legacy state.
    const legacyV2Approval = state.planSubmission === undefined
      && state.planApproved === true
      && state.activeFeature.phase === "implementation"
      && validV2Approval(state.planApproval)
      && state.planApproval.poGateAuthority.planPath === state.activeFeature.planPath
      && state.planInvalidation === undefined
      && state.planRevocation === undefined;
    if (legacyV2Approval) {
      const next = {
        ...state,
        activeFeature: {
          ...state.activeFeature,
          phase: "design",
          phaseHistory: appendPhaseHistory(state.activeFeature, "design", at),
        },
        planApproved: false,
      };
      delete next.planApproval;
      return {
        ok: true,
        replay: false,
        state: next,
        invalidation: null,
      };
    }
    // NVA-R3-PRDBIND: fifth path -- an authority-bound feature that was never
    // submitted at all. This is exactly what a coordinator-sourced
    // `applyOnboardingBootstrapBind()` bind produces (buildCoordinatorSourced-
    // PromotionPlan(), onboarding-continuity.mjs): `continuity.authority`
    // points at real PRD/Spec/design-input documents from the moment binding
    // happens, regardless of phase or of whether framing was authored first.
    // Without this branch, that state fell straight into the "already open"
    // no-op below -- ok:true, replay:true, `state` byte-identical, `planInvalidation`
    // never set -- which reports success while leaving the write-time guard's
    // only release condition (a real `planInvalidation` object,
    // guard-lifecycle-ready.mjs `boundAuthorityDocumentPath()`) unmet. Checked
    // BEFORE the no-op below because its own precondition (design phase,
    // `planApproved !== true`) is a strict superset of this one and would
    // otherwise always match first.
    if (continuityAuthorityBound(state)) {
      const alreadyReleased = validPlanInvalidation(state.planInvalidation)
        && state.planInvalidation.featureId === state.activeFeature.id
        && state.planInvalidation.reason === REOPEN_UNSUBMITTED_BINDING_REASON
        && state.planInvalidation.invalidatedSubmissionSha256 === null
        && state.planInvalidation.invalidatedApprovalSha256 === null
        && state.activeFeature.phase === "design"
        && state.planApproved !== true;
      if (alreadyReleased) {
        return { ok: true, replay: true, state, invalidation: state.planInvalidation };
      }
      const invalidation = {
        schema: PLAN_INVALIDATION_SCHEMA,
        featureId: state.activeFeature.id,
        // Neither a submission nor an approval ever existed for this state, so
        // there is nothing truthful to hash -- unlike the real-submission path
        // below, both are null (validPlanInvalidation() accepts null on both).
        invalidatedSubmissionSha256: null,
        invalidatedApprovalSha256: null,
        invalidatedBy: by,
        invalidatedAt: at,
        reason: REOPEN_UNSUBMITTED_BINDING_REASON,
      };
      return {
        ok: true,
        replay: false,
        state: {
          ...state,
          activeFeature: {
            ...state.activeFeature,
            phase: "design",
            phaseHistory: appendPhaseHistory(state.activeFeature, "design", at),
          },
          planApproved: false,
          planInvalidation: invalidation,
        },
        invalidation,
      };
    }
    if (state.activeFeature.phase === "design" && state.planApproved !== true) {
      return { ok: true, replay: true, state, invalidation: state.planInvalidation ?? null };
    }
    return fail("PLAN-REOPEN-SUBMISSION-INVALID");
  }
  const invalidation = {
    schema: PLAN_INVALIDATION_SCHEMA,
    featureId: state.activeFeature.id,
    invalidatedSubmissionSha256: sha256CanonicalJson(submission),
    invalidatedApprovalSha256: state.planApproval === undefined ? null : sha256CanonicalJson(state.planApproval),
    invalidatedBy: by,
    invalidatedAt: at,
    reason,
  };
  if (validPlanInvalidation(state.planInvalidation)
    && equalCanonical(state.planInvalidation, invalidation)
    && state.activeFeature.phase === "design"
    && state.planApproved === false) {
    return { ok: true, replay: true, state, invalidation };
  }
  return {
    ok: true,
    replay: false,
    state: {
      ...state,
      activeFeature: {
        ...state.activeFeature,
        phase: "design",
        phaseHistory: appendPhaseHistory(state.activeFeature, "design", at),
      },
      planApproved: false,
      planInvalidation: invalidation,
    },
    invalidation,
  };
}

export function enterPlanImplementation({ state, expectedStateSha256, at }) {
  const checked = exactTransitionState(state, expectedStateSha256);
  if (!checked.ok) return checked;
  if (checked.lifecycle.status !== "approved" || state.activeFeature.phase !== "design") {
    return fail("PLAN-IMPLEMENTATION-STATE-INVALID");
  }
  if (!isCanonicalIso(at)) return fail("PLAN-IMPLEMENTATION-REQUEST-INVALID");
  return {
    ok: true,
    replay: false,
    state: {
      ...state,
      activeFeature: {
        ...state.activeFeature,
        phase: "implementation",
        phaseHistory: appendPhaseHistory(state.activeFeature, "implementation", at),
      },
    },
  };
}

function validV2Revocation(value) {
  return hasExactKeys(value, REVOCATION_KEYS)
    && value.schema === REVOCATION_SCHEMA
    && isRepositoryPath(value.planPath)
    && SHA256.test(value.planSha256)
    && isRepositoryPath(value.specPath)
    && SHA256.test(value.specSha256)
    && isNonBlankString(value.revokedBy)
    && isCanonicalIso(value.revokedAt);
}

function validStateForAuthority(state, authority) {
  return isPlainObject(state)
    && state.schema === STATE_SCHEMA
    && isPlainObject(state.activeFeature)
    && isNonBlankString(state.activeFeature.id)
    && state.activeFeature.planPath === authority.planPath;
}

function currentStateMatches(state, expectedStateSha256) {
  if (!SHA256.test(expectedStateSha256)) return false;
  try {
    return sha256CanonicalJson(state) === expectedStateSha256;
  } catch {
    return false;
  }
}

function matchingAuthority(authority, expectedPlanSha256, expectedSpecSha256) {
  return validAuthority(authority)
    && SHA256.test(expectedPlanSha256)
    && SHA256.test(expectedSpecSha256)
    && authority.planSha256 === expectedPlanSha256
    && authority.specSha256 === expectedSpecSha256;
}

function matchingRevocation(revocation, approval) {
  return validV2Revocation(revocation)
    && revocation.planPath === approval.poGateAuthority.planPath
    && revocation.planSha256 === approval.poGateAuthority.planSha256
    && revocation.specPath === approval.poGateAuthority.specPath
    && revocation.specSha256 === approval.poGateAuthority.specSha256;
}

function validLegacyV2RevocationRecovery(value) {
  return hasExactKeys(value, LEGACY_V2_RECOVERY_KEYS)
    && value.schema === LEGACY_V2_REVOCATION_RECOVERY_SCHEMA
    && value.recoveryClass === LEGACY_V2_REVOCATION_RECOVERY_CLASS
    && isNonBlankString(value.recoveredBy)
    && isCanonicalIso(value.recoveredAt)
    && SHA256.test(value.preimageSha256);
}

function exactLegacyV2RecoveryStateEnvelope(state) {
  if (!isPlainObject(state)
    || state.schema !== STATE_SCHEMA
    || !Object.keys(state).every((key) => LEGACY_V2_RECOVERY_STATE_KEYS.has(key))) return false;
  if (Object.prototype.hasOwnProperty.call(state, "updatedAt") && !isCanonicalIso(state.updatedAt)) return false;
  if (Object.prototype.hasOwnProperty.call(state, "closedFeatures") && !Array.isArray(state.closedFeatures)) return false;
  if (Object.prototype.hasOwnProperty.call(state, "pushApproval") && !isPlainObject(state.pushApproval)) return false;
  return !(Object.prototype.hasOwnProperty.call(state, "deployApprovals") && !Array.isArray(state.deployApprovals));
}

function legacyV2RevocationRecoveryPostimage(state, { by, at, preimageSha256 }) {
  const next = {
    ...state,
    planApproved: false,
    activeFeature: {
      ...state.activeFeature,
      phase: "design",
      phaseHistory: appendPhaseHistory(state.activeFeature, "design", at),
    },
    planRecovery: {
      schema: LEGACY_V2_REVOCATION_RECOVERY_SCHEMA,
      recoveryClass: LEGACY_V2_REVOCATION_RECOVERY_CLASS,
      recoveredBy: by,
      recoveredAt: at,
      preimageSha256,
    },
  };
  delete next.planApproval;
  delete next.planRevocation;
  return next;
}

/**
 * Narrow recovery for the sole historical writer defect that emitted a valid
 * V2 revocation while leaving its feature in implementation. This never
 * generalizes to arbitrary state repair: the exact legacy shape is required.
 */
export function planLegacyV2RevocationRecovery({
  state,
  expectedStateSha256,
  by,
  at,
}) {
  if (!currentStateMatches(state, expectedStateSha256)) return fail("PS-V2-LEGACY-RECOVERY-STATE-STALE");
  if (!isNonBlankString(by) || !isCanonicalIso(at)) return fail("PS-V2-LEGACY-RECOVERY-REQUEST-INVALID");

  const preimageSha256 = sha256CanonicalJson(state);
  if (
    !exactLegacyV2RecoveryStateEnvelope(state)
    ||
    state?.planSubmission !== undefined
    || state?.planInvalidation !== undefined
    || state?.planApproved !== false
    || state?.activeFeature?.phase !== "implementation"
    || !validV2Approval(state?.planApproval)
    || !validV2Revocation(state?.planRevocation)
    || !matchingRevocation(state.planRevocation, state.planApproval)
    || state.activeFeature.planPath !== state.planApproval.poGateAuthority.planPath
    || !validateContinuityState(state.continuity, state.activeFeature.id).ok
  ) return fail("PS-V2-LEGACY-RECOVERY-INELIGIBLE");

  const nextState = legacyV2RevocationRecoveryPostimage(state, { by, at, preimageSha256 });
  return {
    ok: true,
    recoveryClass: LEGACY_V2_REVOCATION_RECOVERY_CLASS,
    preimageSha256,
    postimageSha256: sha256CanonicalJson(nextState),
    state: nextState,
  };
}

/** Apply/readback verifier for the digest-bound legacy recovery plan. */
export function applyLegacyV2RevocationRecovery({
  state,
  expectedPreimageSha256,
  expectedPostimageSha256,
  by,
  at,
}) {
  if (!SHA256.test(expectedPreimageSha256 ?? "") || !SHA256.test(expectedPostimageSha256 ?? "")) {
    return fail("PS-V2-LEGACY-RECOVERY-PLAN-INVALID");
  }
  if (!isNonBlankString(by) || !isCanonicalIso(at)) return fail("PS-V2-LEGACY-RECOVERY-REQUEST-INVALID");
  if (sha256CanonicalJson(state) === expectedPostimageSha256
    && state?.planApproved === false
    && state?.activeFeature?.phase === "design"
    && state.planApproval === undefined
    && state.planRevocation === undefined
    && validLegacyV2RevocationRecovery(state.planRecovery)
    && state.planRecovery.recoveredBy === by
    && state.planRecovery.recoveredAt === at
    && state.planRecovery.preimageSha256 === expectedPreimageSha256) {
    return { ok: true, replay: true, state };
  }
  const planned = planLegacyV2RevocationRecovery({
    state,
    expectedStateSha256: expectedPreimageSha256,
    by,
    at,
  });
  if (!planned.ok) return planned;
  if (planned.postimageSha256 !== expectedPostimageSha256) return fail("PS-V2-LEGACY-RECOVERY-POSTIMAGE-STALE");
  return { ok: true, replay: false, state: planned.state };
}

/**
 * Atomically-ready pure transition from one exact legacy plan approval to v2.
 * Callers must apply the returned state under their existing writer lock.
 */
export function bindPlanSpecApproval({
  state,
  expectedStateSha256,
  poGateAuthority,
  expectedPlanSha256,
  expectedSpecSha256,
  by,
  at,
}) {
  if (!currentStateMatches(state, expectedStateSha256)) return fail("PS-V2-STATE-STALE");
  if (!matchingAuthority(poGateAuthority, expectedPlanSha256, expectedSpecSha256)) return fail("PS-V2-AUTHORITY-INVALID");
  if (!validStateForAuthority(state, poGateAuthority) || state.planApproved !== true) return fail("PS-V2-APPROVAL-INVALID");
  if (!isNonBlankString(by) || !isCanonicalIso(at)) return fail("PS-V2-BIND-REQUEST-INVALID");
  if (Object.prototype.hasOwnProperty.call(state, "planRevocation")) return fail("PS-V2-REVOCATION-CONFLICT");

  const approval = state.planApproval;
  if (validV2Approval(approval)) {
    if (
      !equalCanonical(approval.poGateAuthority, poGateAuthority)
      || approval.specBoundBy !== by
      || approval.specBoundAt !== at
    ) return fail("PS-V2-BIND-CONFLICT");
    return { ok: true, replay: true, state, approval };
  }
  if (!validLegacyApproval(approval)) return fail("PS-V2-LEGACY-APPROVAL-INVALID");

  const bound = {
    schema: APPROVAL_SCHEMA,
    approvedBy: approval.approvedBy,
    approvedAt: approval.approvedAt,
    specBoundBy: by,
    specBoundAt: at,
    poGateAuthority,
  };
  return {
    ok: true,
    replay: false,
    state: { ...state, planApproved: true, planApproval: bound },
    approval: bound,
  };
}

/**
 * Ledger-first v3 plan-approval transition. The mutable projection preserves
 * the exact authority reference, while a reader independently resolves it.
 * Cyborg integration point: the caller must supply a reference that was bound
 * to Cyborg's verified-human-attestation receipt at the admission boundary;
 * this pure state transition must not attempt identity verification itself.
 */
export function bindPlanSpecApprovalWithHumanDecision({
  state,
  expectedStateSha256,
  poGateAuthority,
  expectedPlanSha256,
  expectedSpecSha256,
  humanDecision,
  by,
  at,
}) {
  if (!currentStateMatches(state, expectedStateSha256)) return fail("PS-V3-STATE-STALE");
  if (!matchingAuthority(poGateAuthority, expectedPlanSha256, expectedSpecSha256)) return fail("PS-V3-AUTHORITY-INVALID");
  if (!validHumanDecisionReference(humanDecision) || humanDecision.checkpoint.repositoryFingerprint !== poGateAuthority.repositoryFingerprint) return fail("PS-V3-HUMAN-DECISION-INVALID");
  if (!validStateForAuthority(state, poGateAuthority) || state.planApproved !== true) return fail("PS-V3-APPROVAL-INVALID");
  if (!isNonBlankString(by) || !isCanonicalIso(at) || Object.prototype.hasOwnProperty.call(state, "planRevocation")) return fail("PS-V3-BIND-REQUEST-INVALID");
  const approval = state.planApproval;
  if (validV3Approval(approval)) {
    if (!equalCanonical(approval.poGateAuthority, poGateAuthority) || !equalCanonical(approval.humanDecision, humanDecision) || approval.specBoundBy !== by || approval.specBoundAt !== at) return fail("PS-V3-BIND-CONFLICT");
    return { ok: true, replay: true, state, approval };
  }
  if (!validLegacyApproval(approval) && !validV2Approval(approval)) return fail("PS-V3-LEGACY-APPROVAL-INVALID");
  const bound = {
    schema: HUMAN_APPROVAL_SCHEMA,
    approvedBy: approval.approvedBy,
    approvedAt: approval.approvedAt,
    specBoundBy: by,
    specBoundAt: at,
    poGateAuthority,
    humanDecision,
  };
  return { ok: true, replay: false, state: { ...state, planApproved: true, planApproval: bound }, approval: bound };
}

/**
 * Pure current-approval revocation. Legacy approvals/revocations are history;
 * an exact v2 or ledger-first v3 approval supplies the bound authority.
 */
export function revokePlanV2({
  state,
  expectedStateSha256,
  expectedPlanSha256,
  expectedSpecSha256,
  by,
  at,
}) {
  if (!currentStateMatches(state, expectedStateSha256)) return fail("PS-V2-STATE-STALE");
  if (!isNonBlankString(by) || !isCanonicalIso(at)) return fail("PS-V2-REVOCATION-REQUEST-INVALID");
  const approval = state?.planApproval;
  if (!validV2Approval(approval) && !validV3Approval(approval)) return fail("PS-V2-APPROVAL-INVALID");
  const authority = approval.poGateAuthority;
  if (
    !matchingAuthority(authority, expectedPlanSha256, expectedSpecSha256)
    || !validStateForAuthority(state, authority)
  ) return fail("PS-V2-AUTHORITY-INVALID");

  if (Object.prototype.hasOwnProperty.call(state, "planRevocation")) {
    const revocation = state.planRevocation;
    if (
      state.planApproved !== false
      || !matchingRevocation(revocation, approval)
      || revocation.revokedBy !== by
      || revocation.revokedAt !== at
    ) return fail("PS-V2-REVOCATION-CONFLICT");
    return {
      ok: true,
      replay: true,
      state,
      revocation,
      planRevocationSha256: sha256CanonicalJson(revocation),
    };
  }
  if (state.planApproved !== true) return fail("PS-V2-APPROVAL-INVALID");

  const revocation = {
    schema: REVOCATION_SCHEMA,
    planPath: authority.planPath,
    planSha256: authority.planSha256,
    specPath: authority.specPath,
    specSha256: authority.specSha256,
    revokedBy: by,
    revokedAt: at,
  };
  return {
    ok: true,
    replay: false,
    state: {
      ...state,
      planApproved: false,
      planRevocation: revocation,
      activeFeature: {
        ...state.activeFeature,
        phase: "design",
        phaseHistory: appendPhaseHistory(state.activeFeature, "design", at),
      },
    },
    revocation,
    planRevocationSha256: sha256CanonicalJson(revocation),
  };
}
