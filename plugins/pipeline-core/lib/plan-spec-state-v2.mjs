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
export const PLAN_SUBMISSION_SCHEMA = "pipeline.plan-submission.v1";
export const PLAN_INVALIDATION_SCHEMA = "pipeline.plan-invalidation.v1";
const AUTHORITY_SCHEMA = "pipeline.po-gate-authority.v2";
const REVOCATION_SCHEMA = "pipeline.plan-revocation.v2";
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
const ACTIVE_FEATURE_KEYS = ["id", "planPath", "phase"];
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
const INVALIDATION_REASONS = new Set(["reopen-design", "document-drift"]);

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

function validActiveFeature(value) {
  return hasExactKeys(value, ACTIVE_FEATURE_KEYS)
    && isNonBlankString(value.id)
    && isRepositoryPath(value.planPath)
    && PHASES.has(value.phase);
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
    && SHA256.test(value.invalidatedSubmissionSha256)
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
    if (validV2Approval(approval)) {
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
        activeFeature: { ...state.activeFeature, phase: "design" },
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
      activeFeature: { ...state.activeFeature, phase: "design" },
      planApproved: false,
      planInvalidation: invalidation,
    },
    invalidation,
  };
}

export function enterPlanImplementation({ state, expectedStateSha256 }) {
  const checked = exactTransitionState(state, expectedStateSha256);
  if (!checked.ok) return checked;
  if (checked.lifecycle.status !== "approved" || state.activeFeature.phase !== "design") {
    return fail("PLAN-IMPLEMENTATION-STATE-INVALID");
  }
  return {
    ok: true,
    replay: false,
    state: {
      ...state,
      activeFeature: { ...state.activeFeature, phase: "implementation" },
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
 * Pure v2-only revocation. Legacy approvals/revocations are history, never an
 * authorization source for this transition.
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
  if (!validV2Approval(approval)) return fail("PS-V2-APPROVAL-INVALID");
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
    state: { ...state, planApproved: false, planRevocation: revocation },
    revocation,
    planRevocationSha256: sha256CanonicalJson(revocation),
  };
}
