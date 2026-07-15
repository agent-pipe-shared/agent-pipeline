/** Pure validation and transition proposals for pipeline.continuity.v0. */
import { normalizeContinuityHostObservation } from "./continuity-host-adapter.mjs";

const ROOT_KEYS = new Set([
  "schema", "featureId", "revision", "authority", "queueHead", "blocker",
  "acknowledgedFinal", "resume", "recovery", "decisionTxn", "capacity",
]);
const ARTIFACT_KEYS = new Set(["path", "sha256"]);
const AUTHORITY_KEYS = new Set(["prd", "spec", "result"]);
const QUEUE_KEYS = new Set([
  "packageId", "actionId", "nextAction", "productRetryCount",
  "environmentRerouteCount", "dispatch",
]);
const IDENTITY_KEYS = new Set([
  "featureId", "queueRevision", "packageId", "actionId", "dispatchId",
  "attemptId", "authorityDigests", "routeRequestSha256", "mayDelegate",
]);
const IDENTITY_AUTHORITY_KEYS = new Set(["prdSha256", "specSha256", "resultSha256"]);
const BLOCKER_KEYS = new Set(["type", "signature", "resumeCondition", "decisionBrief"]);
const RESUME_CONDITION_KEYS = new Set(["kind", "evidenceSha256"]);
const BRIEF_KEYS = new Set(["decisionBriefId", "decisionBriefSha256", "resultPath"]);
const ACK_KEYS = new Set(["identity", "resultDigest", "finalOutcome", "integratedRevision"]);
const RESUME_KEYS = new Set(["mode", "sourceRevision", "reasonCode"]);
const RECOVERY_KEYS = new Set([
  "originLaneId", "originDispatchId", "originAttemptId", "environmentEvidenceSha256",
  "sameLaneRetryProhibited", "fallbackStatus", "fallbackLaneId", "fallbackDispatchId",
  "narrowingContractSha256", "originProductRetryCount", "resultDigest", "count",
]);
const DECISION_KEYS = new Set([
  "idempotencyKey", "briefSha256", "intentSha256", "selectedOptionId",
  "preSelectionRevision", "selectedRevision", "dispatchableRevision", "phase",
]);
const CAPACITY_KEYS = new Set([
  "concurrencyLimit", "reservedCriticSlots", "reservedRecoverySlots", "fallbackPolicy",
]);
const CAS_KEYS = new Set(["expectedRevision", "next"]);
const FINAL_REQUEST_KEYS = new Set(["expectedRevision", "observation", "next"]);
const DECISION_APPLY_KEYS = new Set(["expectedRevision", "decisionTxn", "queueHead", "blocker", "resume"]);
const DECISION_CLEAR_KEYS = new Set(["expectedRevision", "receipt"]);
const DECISION_RECEIPT_KEYS = new Set([
  "idempotencyKey", "briefSha256", "intentSha256", "selectedOptionId",
  "receiptSha256", "selectedRevision", "dispatchableRevision",
]);

const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const BLOCKER_TYPES = new Set(["authority", "security", "scope", "course", "capacity", "product", "environment", "unknown"]);
const NEXT_ACTIONS = new Set(["dispatch", "poll", "retrieve-final", "integrate-final", "review", "correct", "verify", "push", "fetch-back", "advance-package", "close"]);
const RESUME_KINDS = new Set(["po-decision", "evidence-change", "capacity-available", "authority-update", "manual"]);
const RESUME_MODES = new Set(["immediate", "resume-on-next-turn"]);
const RESUME_REASONS = new Set(["active-turn", "host-no-background-wakeup", "po-interrupt", "compact-reload", "blocker"]);
const FALLBACK_STATUSES = new Set(["fallback-pending", "running", "completed", "failed"]);
const FINAL_OUTCOMES = new Set(["succeeded", "failed"]);
const FALLBACK_POLICIES = new Set(["defer", "pre-authorized-mapped-fallback"]);
const MAX_STATE_BYTES = 8_192;

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, keys) {
  if (!isObject(value)) return false;
  const actual = Object.keys(value);
  return actual.length === keys.size && actual.every((key) => keys.has(key));
}

function safeInteger(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  return Number.isSafeInteger(value) && value >= min && value <= max;
}

function digest(value, nullable = false) {
  return (nullable && value === null) || (typeof value === "string" && SHA256.test(value));
}

function safeId(value) {
  return typeof value === "string" && SAFE_ID.test(value);
}

function safePath(value) {
  if (typeof value !== "string" || value.length < 1 || value.length > 240
    || value.startsWith("/") || value.includes("\\") || value.includes("\0")) return false;
  const parts = value.split("/");
  return parts.every((part) => part.length > 0 && part !== "." && part !== "..");
}

function validArtifact(value) {
  return exactKeys(value, ARTIFACT_KEYS) && safePath(value.path) && digest(value.sha256);
}

function validAuthority(value) {
  return exactKeys(value, AUTHORITY_KEYS)
    && validArtifact(value.prd)
    && validArtifact(value.spec)
    && (value.result === null || validArtifact(value.result));
}

function validIdentity(value) {
  return exactKeys(value, IDENTITY_KEYS)
    && safeId(value.featureId)
    && safeInteger(value.queueRevision)
    && [value.packageId, value.actionId, value.dispatchId, value.attemptId].every(safeId)
    && exactKeys(value.authorityDigests, IDENTITY_AUTHORITY_KEYS)
    && digest(value.authorityDigests.prdSha256)
    && digest(value.authorityDigests.specSha256)
    && digest(value.authorityDigests.resultSha256, true)
    && digest(value.routeRequestSha256)
    && value.mayDelegate === false;
}

function sameIdentity(left, right) {
  return left.featureId === right.featureId
    && left.queueRevision === right.queueRevision
    && left.packageId === right.packageId
    && left.actionId === right.actionId
    && left.dispatchId === right.dispatchId
    && left.attemptId === right.attemptId
    && left.authorityDigests.prdSha256 === right.authorityDigests.prdSha256
    && left.authorityDigests.specSha256 === right.authorityDigests.specSha256
    && left.authorityDigests.resultSha256 === right.authorityDigests.resultSha256
    && left.routeRequestSha256 === right.routeRequestSha256
    && left.mayDelegate === right.mayDelegate;
}

function validQueueHead(value, state) {
  if (!exactKeys(value, QUEUE_KEYS)
    || !safeId(value.packageId)
    || !safeId(value.actionId)
    || !NEXT_ACTIONS.has(value.nextAction)
    || !safeInteger(value.productRetryCount, 0, 1)
    || !safeInteger(value.environmentRerouteCount, 0, 1)
    || (value.dispatch !== null && !validIdentity(value.dispatch))) return false;
  if (value.dispatch === null) return true;
  return value.dispatch.featureId === state.featureId
    && value.dispatch.packageId === value.packageId
    && value.dispatch.actionId === value.actionId
    && value.dispatch.queueRevision === state.revision
    && value.dispatch.authorityDigests.prdSha256 === state.authority.prd.sha256
    && value.dispatch.authorityDigests.specSha256 === state.authority.spec.sha256
    && value.dispatch.authorityDigests.resultSha256 === (state.authority.result?.sha256 ?? null);
}

function validDecisionBrief(value) {
  return value === null || (exactKeys(value, BRIEF_KEYS)
    && safeId(value.decisionBriefId)
    && digest(value.decisionBriefSha256)
    && safePath(value.resultPath));
}

function validBlocker(value, state) {
  return exactKeys(value, BLOCKER_KEYS)
    && BLOCKER_TYPES.has(value.type)
    && safeId(value.signature)
    && exactKeys(value.resumeCondition, RESUME_CONDITION_KEYS)
    && RESUME_KINDS.has(value.resumeCondition.kind)
    && digest(value.resumeCondition.evidenceSha256, true)
    && validDecisionBrief(value.decisionBrief)
    && (value.decisionBrief === null || (value.type === "course"
      && state.authority.result !== null
      && value.decisionBrief.resultPath === state.authority.result.path));
}

function validAcknowledgedFinal(value, state) {
  return value === null || (exactKeys(value, ACK_KEYS)
    && validIdentity(value.identity)
    && digest(value.resultDigest)
    && FINAL_OUTCOMES.has(value.finalOutcome)
    && safeInteger(value.integratedRevision)
    && value.identity.featureId === state.featureId
    && value.integratedRevision === value.identity.queueRevision + 1
    && value.integratedRevision <= state.revision);
}

function validResume(value, revision) {
  return exactKeys(value, RESUME_KEYS)
    && RESUME_MODES.has(value.mode)
    && safeInteger(value.sourceRevision)
    && value.sourceRevision <= revision
    && RESUME_REASONS.has(value.reasonCode)
    && (value.mode !== "resume-on-next-turn" || value.reasonCode !== "active-turn");
}

function validRecovery(value, state) {
  if (value === null) return true;
  if (!exactKeys(value, RECOVERY_KEYS)
    || ![value.originLaneId, value.originDispatchId, value.originAttemptId, value.fallbackLaneId, value.fallbackDispatchId].every(safeId)
    || value.originLaneId === value.fallbackLaneId
    || value.originDispatchId === value.fallbackDispatchId
    || !digest(value.environmentEvidenceSha256)
    || value.sameLaneRetryProhibited !== true
    || !FALLBACK_STATUSES.has(value.fallbackStatus)
    || !digest(value.narrowingContractSha256)
    || !safeInteger(value.originProductRetryCount, 0, 1)
    || !digest(value.resultDigest, true)
    || value.count !== 1) return false;
  if (state.queueHead !== null) {
    return state.queueHead.environmentRerouteCount === 1
      && state.queueHead.productRetryCount === value.originProductRetryCount
      && state.queueHead.dispatch !== null
      && state.queueHead.dispatch.dispatchId === value.fallbackDispatchId;
  }
  return value.fallbackStatus === "failed"
    && state.blocker !== null
    && new Set(["course", "capacity", "product", "environment"]).has(state.blocker.type);
}

function validDecisionTxn(value, revision) {
  return value === null || (exactKeys(value, DECISION_KEYS)
    && [value.idempotencyKey, value.selectedOptionId].every(safeId)
    && digest(value.briefSha256)
    && digest(value.intentSha256)
    && safeInteger(value.preSelectionRevision)
    && safeInteger(value.selectedRevision)
    && safeInteger(value.dispatchableRevision)
    && value.selectedRevision === value.preSelectionRevision + 1
    && value.dispatchableRevision === value.selectedRevision + 1
    && revision === value.selectedRevision
    && value.phase === "state-applied");
}

function validCapacity(value) {
  return exactKeys(value, CAPACITY_KEYS)
    && safeInteger(value.concurrencyLimit, 2, 64)
    && value.reservedCriticSlots === 1
    && value.reservedRecoverySlots === 1
    && value.concurrencyLimit >= value.reservedCriticSlots + value.reservedRecoverySlots
    && FALLBACK_POLICIES.has(value.fallbackPolicy);
}

function result(ok, code, state = null, mutated = false) {
  return { ok, code, mutated, state };
}

/** Validate one bounded continuity object. */
export function validateContinuityState(value, activeFeatureId = undefined) {
  if (!exactKeys(value, ROOT_KEYS)
    || value.schema !== "pipeline.continuity.v0"
    || !safeId(value.featureId)
    || !safeInteger(value.revision)
    || (activeFeatureId !== undefined && value.featureId !== activeFeatureId)
    || !validAuthority(value.authority)
    || (value.queueHead === null) === (value.blocker === null)
    || (value.queueHead !== null && !validQueueHead(value.queueHead, value))
    || (value.blocker !== null && !validBlocker(value.blocker, value))
    || !validAcknowledgedFinal(value.acknowledgedFinal, value)
    || !validResume(value.resume, value.revision)
    || !validRecovery(value.recovery, value)
    || !validDecisionTxn(value.decisionTxn, value.revision)
    || !validCapacity(value.capacity)) {
    return { ok: false, code: "CS-INVALID" };
  }
  let bytes;
  try {
    bytes = Buffer.byteLength(JSON.stringify(value), "utf8");
  } catch {
    return { ok: false, code: "CS-INVALID" };
  }
  if (bytes > MAX_STATE_BYTES) return { ok: false, code: "CS-STATE-BUDGET" };
  return { ok: true, code: "CS-VALID" };
}

/** Return whether a validated state is currently eligible for dispatch. */
export function continuityDispatchAllowed(value, activeFeatureId = undefined) {
  const valid = validateContinuityState(value, activeFeatureId);
  if (!valid.ok) return { ok: false, code: valid.code, allowed: false };
  if (value.decisionTxn !== null) return { ok: true, code: "CS-DECISION-PENDING", allowed: false };
  if (value.blocker !== null) return { ok: true, code: "CS-BLOCKED", allowed: false };
  return value.queueHead.nextAction === "dispatch" && value.queueHead.dispatch === null
    ? { ok: true, code: "CS-DISPATCHABLE", allowed: true }
    : { ok: true, code: "CS-NOT-DISPATCH-ACTION", allowed: false };
}

function sameAcknowledgement(left, right) {
  if (left === null || right === null) return left === right;
  return sameIdentity(left.identity, right.identity)
    && left.resultDigest === right.resultDigest
    && left.finalOutcome === right.finalOutcome
    && left.integratedRevision === right.integratedRevision;
}

function sameDecisionTxn(left, right) {
  if (left === null || right === null) return left === right;
  return exactKeys(left, DECISION_KEYS)
    && exactKeys(right, DECISION_KEYS)
    && [...DECISION_KEYS].every((key) => left[key] === right[key]);
}

function compareAndSwap(current, request, activeFeatureId, {
  allowAcknowledgementChange = false,
  allowDecisionChange = false,
} = {}) {
  const before = validateContinuityState(current, activeFeatureId);
  if (!before.ok || !exactKeys(request, CAS_KEYS) || !safeInteger(request.expectedRevision)) {
    return result(false, before.ok ? "CS-REQUEST" : before.code);
  }
  if (request.expectedRevision !== current.revision) return result(false, "CS-STALE");
  if (current.revision === Number.MAX_SAFE_INTEGER) return result(false, "CS-REVISION-OVERFLOW");
  if (!isObject(request.next)
    || request.next.featureId !== current.featureId
    || request.next.revision !== current.revision + 1) return result(false, "CS-REVISION");
  const after = validateContinuityState(request.next, activeFeatureId);
  if (!after.ok) return result(false, after.code);
  if (!allowAcknowledgementChange
    && !sameAcknowledgement(current.acknowledgedFinal, request.next.acknowledgedFinal)) {
    return result(false, "CS-PROTECTED-ACK");
  }
  if (!allowDecisionChange && !sameDecisionTxn(current.decisionTxn, request.next.decisionTxn)) {
    return result(false, "CS-PROTECTED-DECISION");
  }
  return result(true, "CS-CAS-APPLIED", structuredClone(request.next), true);
}

/** Validate a pure compare-and-swap proposal; performs no I/O. */
export function compareAndSwapContinuity(current, request, activeFeatureId = undefined) {
  return compareAndSwap(current, request, activeFeatureId);
}

function adapterAck(acknowledgedFinal) {
  if (acknowledgedFinal === null) return null;
  return {
    identity: acknowledgedFinal.identity,
    resultDigest: acknowledgedFinal.resultDigest,
    finalOutcome: acknowledgedFinal.finalOutcome,
  };
}

function observationIsSupersededOrigin(current, observation) {
  return current.recovery !== null
    && isObject(observation)
    && isObject(observation.identity)
    && observation.identity.dispatchId === current.recovery.originDispatchId
    && observation.identity.attemptId === current.recovery.originAttemptId;
}

/**
 * Validate a raw host final through the adapter and atomically propose its
 * acknowledgement plus next head/blocker. Result/state persistence is later
 * writer work; every rejection returns state:null and mutated:false.
 */
export function integrateContinuityFinal(current, request, activeFeatureId = undefined) {
  const before = validateContinuityState(current, activeFeatureId);
  if (!before.ok || !exactKeys(request, FINAL_REQUEST_KEYS) || !safeInteger(request.expectedRevision)) {
    return result(false, before.ok ? "CS-REQUEST" : before.code);
  }
  if (request.expectedRevision !== current.revision) return result(false, "CS-STALE");
  if (current.acknowledgedFinal !== null
    && isObject(request.observation?.identity)
    && sameIdentity(current.acknowledgedFinal.identity, request.observation.identity)) {
    const replay = normalizeContinuityHostObservation({
      expected: current.acknowledgedFinal.identity,
      observation: request.observation,
      priorAcknowledgement: adapterAck(current.acknowledgedFinal),
    });
    return replay.code === "CHA-DUPLICATE-FINAL"
      ? result(true, "CS-DUPLICATE-FINAL")
      : result(false, "CS-FINAL-REJECTED");
  }
  if (current.queueHead === null || current.queueHead.dispatch === null) return result(false, "CS-NO-DISPATCH");
  if (observationIsSupersededOrigin(current, request.observation)) {
    return result(true, "CS-SUPERSEDED-ORIGIN-FINAL");
  }
  const normalized = normalizeContinuityHostObservation({
    expected: current.queueHead.dispatch,
    observation: request.observation,
    priorAcknowledgement: adapterAck(current.acknowledgedFinal),
  });
  const passiveCodes = new Map([
    ["CHA-RUNNING", "CS-RUNNING"],
    ["CHA-COMPLETED-UNDELIVERED", "CS-COMPLETED-UNDELIVERED"],
    ["CHA-HOST-FAILED", "CS-HOST-FAILED"],
    ["CHA-DUPLICATE-FINAL", "CS-DUPLICATE-FINAL"],
  ]);
  if (passiveCodes.has(normalized.code)) return result(true, passiveCodes.get(normalized.code));
  if (normalized.code !== "CHA-FINAL-READY") return result(false, "CS-FINAL-REJECTED");

  if (!isObject(request.next)) return result(false, "CS-REQUEST");
  const expectedAck = request.next.acknowledgedFinal;
  if (!exactKeys(expectedAck, ACK_KEYS)
    || !validIdentity(expectedAck.identity)
    || !sameIdentity(expectedAck.identity, request.observation.identity)
    || expectedAck.resultDigest !== normalized.resultDigest
    || expectedAck.finalOutcome !== normalized.finalOutcome
    || expectedAck.integratedRevision !== current.revision + 1
    || (normalized.finalOutcome === "failed" && request.next.blocker === null)) {
    return result(false, "CS-ACK-MISMATCH");
  }
  const cas = compareAndSwap(current, {
    expectedRevision: request.expectedRevision,
    next: request.next,
  }, activeFeatureId, { allowAcknowledgementChange: true });
  return cas.ok ? result(true, "CS-FINAL-INTEGRATED", cas.state, true) : cas;
}

/** Install the dispatch-blocking state-applied decision marker exactly once. */
export function applyDecisionSelection(current, request, activeFeatureId = undefined) {
  const before = validateContinuityState(current, activeFeatureId);
  if (!before.ok || !exactKeys(request, DECISION_APPLY_KEYS) || !safeInteger(request.expectedRevision)) {
    return result(false, before.ok ? "CS-REQUEST" : before.code);
  }
  if (current.decisionTxn !== null) {
    const sameTxn = exactKeys(request.decisionTxn, DECISION_KEYS)
      && [...DECISION_KEYS].every((key) => current.decisionTxn[key] === request.decisionTxn[key]);
    return request.expectedRevision === current.revision && sameTxn
      ? result(true, "CS-DECISION-REPLAY")
      : result(false, "CS-DECISION-CONFLICT");
  }
  if (request.expectedRevision !== current.revision || current.blocker === null) return result(false, "CS-STALE");
  if (!validDecisionTxn(request.decisionTxn, current.revision + 1)
    || request.decisionTxn.preSelectionRevision !== current.revision
    || current.blocker.decisionBrief === null
    || current.blocker.decisionBrief.decisionBriefSha256 !== request.decisionTxn.briefSha256
    || (request.queueHead === null) === (request.blocker === null)
    || !validResume(request.resume, current.revision + 1)) return result(false, "CS-DECISION-INVALID");

  const next = structuredClone(current);
  next.revision += 1;
  next.queueHead = request.queueHead;
  next.blocker = request.blocker;
  next.resume = request.resume;
  next.decisionTxn = request.decisionTxn;
  return compareAndSwap(current, { expectedRevision: request.expectedRevision, next }, activeFeatureId, {
    allowDecisionChange: true,
  });
}

/** Clear a matching durable decision receipt and make the selected state dispatchable. */
export function clearDecisionSelection(current, request, activeFeatureId = undefined) {
  const before = validateContinuityState(current, activeFeatureId);
  if (!before.ok || !exactKeys(request, DECISION_CLEAR_KEYS)
    || !safeInteger(request.expectedRevision)
    || !exactKeys(request.receipt, DECISION_RECEIPT_KEYS)) {
    return result(false, before.ok ? "CS-REQUEST" : before.code);
  }
  if (current.decisionTxn === null) return result(false, "CS-NO-DECISION-TXN");
  const txn = current.decisionTxn;
  const receipt = request.receipt;
  if (request.expectedRevision !== current.revision
    || !digest(receipt.receiptSha256)
    || receipt.idempotencyKey !== txn.idempotencyKey
    || receipt.briefSha256 !== txn.briefSha256
    || receipt.intentSha256 !== txn.intentSha256
    || receipt.selectedOptionId !== txn.selectedOptionId
    || receipt.selectedRevision !== txn.selectedRevision
    || receipt.dispatchableRevision !== txn.dispatchableRevision) return result(false, "CS-DECISION-RECEIPT-MISMATCH");

  const next = structuredClone(current);
  next.revision = txn.dispatchableRevision;
  next.decisionTxn = null;
  return compareAndSwap(current, { expectedRevision: request.expectedRevision, next }, activeFeatureId, {
    allowDecisionChange: true,
  });
}

export const CONTINUITY_STATE_CODES = Object.freeze([
  "CS-INVALID", "CS-STATE-BUDGET", "CS-VALID", "CS-REQUEST", "CS-STALE",
  "CS-REVISION-OVERFLOW", "CS-REVISION", "CS-CAS-APPLIED", "CS-NO-DISPATCH",
  "CS-SUPERSEDED-ORIGIN-FINAL", "CS-RUNNING", "CS-COMPLETED-UNDELIVERED",
  "CS-HOST-FAILED", "CS-DUPLICATE-FINAL", "CS-FINAL-REJECTED",
  "CS-ACK-MISMATCH", "CS-FINAL-INTEGRATED", "CS-DECISION-PENDING", "CS-BLOCKED", "CS-NOT-DISPATCH-ACTION",
  "CS-DISPATCHABLE", "CS-DECISION-REPLAY", "CS-DECISION-CONFLICT",
  "CS-DECISION-INVALID", "CS-NO-DECISION-TXN", "CS-DECISION-RECEIPT-MISMATCH", "CS-PROTECTED-ACK", "CS-PROTECTED-DECISION",
]);

export const CONTINUITY_STATE_MAX_BYTES = MAX_STATE_BYTES;
