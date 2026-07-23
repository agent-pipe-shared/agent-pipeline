// SPDX-License-Identifier: SUL-1.0

/**
 * Storm delivery-attempt and course-gate contract.
 *
 * P3B's review economy owns implementation/review retries while the SDLC run
 * graph records a finished delivery/fetch-back chain.  This additive contract
 * owns the distinct delivery transport decision before a graph may claim that
 * terminal chain.  It is pure data validation: it never starts a Git command,
 * accesses a credential, or grants a write authority.
 */
import { sha256Canonical } from "./review-economy.mjs";

export const DELIVERY_COURSE_SCHEMA = "pipeline.delivery-course.v1";
export const DELIVERY_FAILURE_CLASSES = Object.freeze([
  "retryable",
  "target-ambiguous",
  "policy-rejected",
  "readback-mismatch",
]);
export const DELIVERY_ATTEMPT_LIMIT = 3;
export const DELIVERY_IMMEDIATE_GATE_CLASSES = Object.freeze([
  "target-ambiguous",
  "policy-rejected",
  "readback-mismatch",
]);

const SHA256 = /^[a-f0-9]{64}$/u;
const GIT_OID = /^[a-f0-9]{40}$/u;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const SAFE_REMOTE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const SAFE_REF = /^refs\/(?:heads|tags)\/[A-Za-z0-9][A-Za-z0-9._/-]{0,239}$/u;

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, keys) {
  return isObject(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function safeId(value) {
  return typeof value === "string" && SAFE_ID.test(value);
}

function validOid(value) {
  return typeof value === "string" && GIT_OID.test(value);
}

function validRefs(value) {
  return Array.isArray(value) && value.length > 0 && value.length <= 8
    && value.every((ref) => typeof ref === "string" && SAFE_REF.test(ref))
    && new Set(value).size === value.length
    && [...value].sort().every((ref, index) => ref === value[index]);
}

/** Closed, non-secret authority record; retries must match it byte-for-byte. */
export function validateDeliveryAuthority(authority, { allowForce = false } = {}) {
  if (!exactKeys(authority, ["remote", "ref", "force", "credentialAuthority", "writeRefs"])
    || typeof authority.remote !== "string" || !SAFE_REMOTE.test(authority.remote)
    || typeof authority.ref !== "string" || !SAFE_REF.test(authority.ref)
    || typeof authority.force !== "boolean" || (!allowForce && authority.force !== false) || !safeId(authority.credentialAuthority)
    || !validRefs(authority.writeRefs) || !authority.writeRefs.includes(authority.ref)) {
    return { ok: false, code: "DC-AUTHORITY-SHAPE" };
  }
  return { ok: true, code: "DC-AUTHORITY-VALID" };
}

function sameAuthority(left, right) {
  return left.remote === right.remote
    && left.ref === right.ref
    && left.force === right.force
    && left.credentialAuthority === right.credentialAuthority
    && left.writeRefs.length === right.writeRefs.length
    && left.writeRefs.every((ref, index) => ref === right.writeRefs[index]);
}

function deliveryBinding(attempt) {
  return sha256Canonical({
    candidateCommit: attempt.candidateCommit,
    tree: attempt.tree,
    authority: attempt.authority,
  });
}

/** Raw diagnostics cannot influence this normalized, closed failure signature. */
export function deliveryFailureSignature(failure) {
  if (!exactKeys(failure, ["class", "stableCode", "bindingSha256"])
    || !DELIVERY_FAILURE_CLASSES.includes(failure.class)
    || !safeId(failure.stableCode) || typeof failure.bindingSha256 !== "string" || !SHA256.test(failure.bindingSha256)) {
    throw new TypeError("invalid delivery failure signature input");
  }
  return sha256Canonical(failure);
}

function validateAttempt(attempt) {
  if (!exactKeys(attempt, ["attemptId", "sequence", "candidateCommit", "tree", "authority", "outcome", "failure"])
    || !safeId(attempt.attemptId) || !Number.isSafeInteger(attempt.sequence) || attempt.sequence < 1
    || !validOid(attempt.candidateCommit) || !validOid(attempt.tree)
    || !["succeeded", "failed"].includes(attempt.outcome)) {
    return { ok: false, code: "DC-ATTEMPT-SHAPE" };
  }
  const authority = validateDeliveryAuthority(attempt.authority, { allowForce: true });
  if (!authority.ok) return authority;
  if (attempt.outcome === "succeeded") {
    return attempt.failure === null
      ? { ok: true, code: "DC-ATTEMPT-SUCCEEDED" }
      : { ok: false, code: "DC-SUCCESS-WITH-FAILURE" };
  }
  if (!isObject(attempt.failure)) return { ok: false, code: "DC-FAILED-WITHOUT-CLASSIFICATION" };
  let signature;
  try { signature = deliveryFailureSignature(attempt.failure); } catch { return { ok: false, code: "DC-FAILURE-SHAPE" }; }
  if (attempt.failure.bindingSha256 !== deliveryBinding(attempt)) return { ok: false, code: "DC-FAILURE-BINDING" };
  return { ok: true, code: "DC-ATTEMPT-FAILED", signature };
}

/**
 * Validate and decide a bounded delivery history.
 *
 * `retry` is permission only to repeat the exact initially authorized
 * candidate/target/ref/credential/write scope. Any authority or candidate
 * change is a course gate, never an implicit narrowing or replacement.
 */
export function decideDeliveryCourse(input) {
  if (!exactKeys(input, ["schema", "featureId", "candidateCommit", "tree", "authority", "attempts"])
    || input.schema !== DELIVERY_COURSE_SCHEMA || !safeId(input.featureId)
    || !validOid(input.candidateCommit) || !validOid(input.tree)
    || !Array.isArray(input.attempts) || input.attempts.length < 1 || input.attempts.length > DELIVERY_ATTEMPT_LIMIT) {
    return { ok: false, action: "block", code: "DC-HISTORY-SHAPE" };
  }
  const baselineAuthority = validateDeliveryAuthority(input.authority);
  if (!baselineAuthority.ok) return { ok: false, action: "block", code: baselineAuthority.code };

  const attemptIds = new Set();
  const validated = [];
  for (const [index, attempt] of input.attempts.entries()) {
    const result = validateAttempt(attempt);
    if (!result.ok) return { ok: false, action: "block", code: result.code };
    if (attempt.sequence !== index + 1 || attemptIds.has(attempt.attemptId)) {
      return { ok: false, action: "block", code: "DC-ATTEMPT-ORDER" };
    }
    attemptIds.add(attempt.attemptId);
    if (attempt.candidateCommit !== input.candidateCommit || attempt.tree !== input.tree
      || !sameAuthority(attempt.authority, input.authority)) {
      return {
        ok: true,
        action: "course-gate",
        code: "DC-AUTHORITY-OR-CANDIDATE-CHANGE",
        attemptId: attempt.attemptId,
        retryProhibited: true,
      };
    }
    validated.push({ attempt, ...result });
  }

  const succeeded = validated.find(({ attempt }) => attempt.outcome === "succeeded");
  if (succeeded) {
    if (succeeded.attempt.sequence !== validated.length) {
      return { ok: false, action: "block", code: "DC-ATTEMPT-AFTER-SUCCESS" };
    }
    return {
      ok: true,
      action: "complete",
      code: "DC-DELIVERY-SUCCEEDED",
      attemptId: succeeded.attempt.attemptId,
      attemptCount: validated.length,
    };
  }

  const last = validated.at(-1);
  const failureClass = last.attempt.failure.class;
  if (DELIVERY_IMMEDIATE_GATE_CLASSES.includes(failureClass)) {
    return {
      ok: true,
      action: "course-gate",
      code: `DC-${failureClass.toUpperCase()}-IMMEDIATE-GATE`,
      attemptId: last.attempt.attemptId,
      signature: last.signature,
      retryProhibited: true,
    };
  }
  const seenEarlier = validated.slice(0, -1).some(({ signature }) => signature === last.signature);
  if (seenEarlier) {
    return {
      ok: true,
      action: "course-gate",
      code: "DC-REPEATED-SIGNATURE-COURSE-GATE",
      attemptId: last.attempt.attemptId,
      signature: last.signature,
      retryProhibited: true,
    };
  }
  if (validated.length >= DELIVERY_ATTEMPT_LIMIT) {
    return {
      ok: true,
      action: "course-gate",
      code: "DC-ATTEMPT-BUDGET-EXHAUSTED",
      attemptId: last.attempt.attemptId,
      signature: last.signature,
      retryProhibited: true,
    };
  }
  return {
    ok: true,
    action: "retry",
    code: "DC-EXACT-RETRY-ADMITTED",
    attemptId: last.attempt.attemptId,
    signature: last.signature,
    nextAttemptSequence: validated.length + 1,
    remainingAttempts: DELIVERY_ATTEMPT_LIMIT - validated.length,
    authority: structuredClone(input.authority),
    candidateCommit: input.candidateCommit,
    tree: input.tree,
  };
}

/** Bind a separately recorded delivery course to the immutable graph candidate. */
export function validateDeliveryCourseGraphAnchor(course, anchor) {
  if (!isObject(anchor) || !exactKeys(anchor, ["featureId", "candidateCommit", "tree"])
    || !safeId(anchor.featureId) || !validOid(anchor.candidateCommit) || !validOid(anchor.tree)) {
    return { ok: false, code: "DC-GRAPH-ANCHOR-SHAPE" };
  }
  const decision = decideDeliveryCourse(course);
  if (!decision.ok) return { ok: false, code: decision.code };
  if (course.featureId !== anchor.featureId || course.candidateCommit !== anchor.candidateCommit || course.tree !== anchor.tree) {
    return { ok: false, code: "DC-GRAPH-ANCHOR-DRIFT" };
  }
  return { ok: true, code: "DC-GRAPH-ANCHOR-VALID", decision };
}
