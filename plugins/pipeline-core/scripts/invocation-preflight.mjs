#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/** Thin, no-launch Nova A3 admission and session single-flight memory. */
import {
  createInvocationAttempt,
  invalidInvocationDigest,
  invocationResolutionKey,
  isRetryableInvocationFailure,
  validateInvocationChain,
  validateInvocationRequest,
} from "../lib/invocation-reliability.mjs";
import {
  selectedSandboxDispositionDigest,
  validateSelectedSandboxDisposition,
} from "../lib/selected-sandbox-disposition.mjs";

const SELECTED_TRANSPORT = "selected-network-open-read-only-v1";
const ATTESTED_ASSURANCE = "sandbox-read-only-except-coordinator-scratch-network-open";
const INPUT_KEYS = ["request", "sandboxDisposition", "attempts", "attemptId", "nowMonotonicMs"];
const RETRY_COURSE_KEYS = ["failureClasses", "baseBackoffMs", "maximumAttempts"];
const MAXIMUM_BACKOFF_MS = 3_600_000;
const exact = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const freeze = (value) => { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) freeze(child); } return value; };
const MEMORY_STATE = new WeakMap();

function outcome({ ok, decision, failureClass, requestSha256, attempt = null, resolutionKey = null }) {
  return freeze({ ok, decision, failureClass, requestSha256, attempt, resolutionKey });
}
function denied(failureClass, request) { return outcome({ ok: false, decision: "suppressed", failureClass, requestSha256: invalidInvocationDigest(request) }); }
function suppressed(failureClass, request) { return outcome({ ok: false, decision: "suppressed", failureClass, requestSha256: request.requestSha256 }); }
function sandboxFailure(record) {
  if (record.state === "terminal-unavailable") return "selected-sandbox-terminal";
  if (record.state === "transient-unavailable") return "selected-sandbox-transient";
  return "authority-invalid";
}
function admitsSelectedSandbox(request, record) {
  const checked = validateSelectedSandboxDisposition(record);
  if (!checked.ok || selectedSandboxDispositionDigest(record) !== request.sandboxDispositionSha256 || record.duty !== request.duty) return "authority-invalid";
  if (record.state !== "available-attested") return sandboxFailure(record);
  if (record.transport !== SELECTED_TRANSPORT || record.assurance?.observed !== ATTESTED_ASSURANCE || record.childReceipt?.terminal !== true || record.childReceipt?.duty !== request.duty || record.childReceipt?.transport !== SELECTED_TRANSPORT) return "authority-invalid";
  return null;
}

function validRetryCourse(value) {
  return exact(value, RETRY_COURSE_KEYS)
    && Array.isArray(value.failureClasses) && value.failureClasses.length > 0 && value.failureClasses.length <= 3
    && value.failureClasses.every((entry, index) => isRetryableInvocationFailure(entry) && (index === 0 || value.failureClasses[index - 1] < entry))
    && Number.isSafeInteger(value.baseBackoffMs) && value.baseBackoffMs >= 1_000 && value.baseBackoffMs <= MAXIMUM_BACKOFF_MS
    && Number.isSafeInteger(value.maximumAttempts) && value.maximumAttempts >= 1 && value.maximumAttempts <= 8;
}
function retrySuppression(attempts, nowMonotonicMs, retryCourse) {
  if (attempts.length === 0) return null;
  const last = attempts.at(-1);
  if (last.launchDecision === "launch" && last.ended === null) return "chain-invalid";
  if (last.failureClass === null) return "succeeded-unverified";
  if (!isRetryableInvocationFailure(last.failureClass)) return last.failureClass;
  if (!retryCourse || !retryCourse.failureClasses.includes(last.failureClass) || last.ended === null) return last.failureClass;
  let consecutive = 0;
  for (let index = attempts.length - 1; index >= 0 && attempts[index].failureClass === last.failureClass; index -= 1) consecutive += 1;
  if (consecutive >= retryCourse.maximumAttempts) return last.failureClass;
  const multiplier = 2 ** Math.max(0, consecutive - 1);
  const backoffMs = Math.min(retryCourse.baseBackoffMs * multiplier, MAXIMUM_BACKOFF_MS);
  if (nowMonotonicMs < last.ended.monotonicMs + backoffMs) return last.failureClass;
  return null;
}
function sameReservation(existing, observed) {
  return existing.attemptId === observed.attemptId && existing.invocationId === observed.invocationId
    && existing.index === observed.index && existing.requestSha256 === observed.requestSha256
    && existing.launchDecision === observed.launchDecision && existing.previousSha256 === observed.previousSha256
    && JSON.stringify(existing.started) === JSON.stringify(observed.started);
}

/**
 * A process-local session memory. Its mutable maps stay private in a WeakMap;
 * multiple preflight facades may share the same synchronous CAS-like
 * resolution reservation without exposing request or fingerprint material.
 */
export function createInvocationResolutionMemory() {
  const memory = freeze({ kind: "invocation-resolution-memory", version: "nova-a3-memory-v1" });
  MEMORY_STATE.set(memory, { resolutions: new Map(), seenAttemptIds: new Set(), invalid: new Map() });
  return memory;
}

/**
 * Returns a session-local preflight resolver. It performs no I/O and never
 * invokes a launcher; an admitted `launch` decision is merely a sealed input
 * for a later, independently attested launcher.
 */
export function createInvocationPreflightSession(options = undefined) {
  if (options !== undefined && !exact(options, ["memory", "retryCourse"])) throw new Error("SHAPE:preflight-session-options");
  const memory = options?.memory ?? createInvocationResolutionMemory();
  const state = MEMORY_STATE.get(memory);
  if (!state || !(options?.retryCourse === null || options?.retryCourse === undefined || validRetryCourse(options.retryCourse))) throw new Error("SHAPE:preflight-session-options");
  const retryCourse = options?.retryCourse ?? null;
  const { resolutions, seenAttemptIds, invalid } = state;
  function preflight(input) {
    if (!exact(input, INPUT_KEYS) || !Number.isSafeInteger(input.nowMonotonicMs) || input.nowMonotonicMs < 0 || typeof input.attemptId !== "string" || input.attemptId.length === 0 || /[\0\r\n]/u.test(input.attemptId)) {
      const key = invalidInvocationDigest(input);
      if (!invalid.has(key)) invalid.set(key, denied("request-invalid", input));
      return invalid.get(key);
    }
    const requestValidation = validateInvocationRequest(input.request);
    if (!requestValidation.ok) {
      const key = invalidInvocationDigest(input.request);
      if (!invalid.has(key)) invalid.set(key, denied("request-invalid", input.request));
      return invalid.get(key);
    }
    const chain = validateInvocationChain(input.request, input.attempts);
    if (!chain.ok) return denied("chain-invalid", input.request);
    const authority = admitsSelectedSandbox(input.request, input.sandboxDisposition);
    if (authority) return outcome({ ok: false, decision: "suppressed", failureClass: authority, requestSha256: input.request.requestSha256 });
    const resolutionKey = invocationResolutionKey(input.request, input.sandboxDisposition.fingerprint);
    const existing = resolutions.get(resolutionKey);
    if (existing) {
      const observed = input.attempts.find((attempt) => attempt.attemptId === existing.attemptId);
      if (!observed) return outcome({ ok: true, decision: "join", failureClass: null, requestSha256: input.request.requestSha256, attempt: existing, resolutionKey });
      if (!sameReservation(existing, observed)) return suppressed("chain-invalid", input.request);
      if (observed.ended === null) return outcome({ ok: true, decision: "join", failureClass: null, requestSha256: input.request.requestSha256, attempt: existing, resolutionKey });
      resolutions.delete(resolutionKey);
    }
    const retryFailure = retrySuppression(input.attempts, input.nowMonotonicMs, retryCourse);
    if (retryFailure) return suppressed(retryFailure, input.request);
    if (seenAttemptIds.has(input.attemptId) || input.attempts.some((attempt) => attempt.attemptId === input.attemptId)) return denied("chain-invalid", input.request);
    const attempt = createInvocationAttempt({
      attemptId: input.attemptId, invocationId: input.request.invocationId, index: input.attempts.length,
      requestSha256: input.request.requestSha256, launchDecision: "launch", failureClass: null,
      started: { source: "preflight", monotonicMs: input.nowMonotonicMs, wallTime: null, rawSha256: input.request.requestSha256 },
      ended: null, resultSha256: null, previousSha256: input.attempts.length === 0 ? null : input.attempts.at(-1).recordSha256,
    });
    seenAttemptIds.add(input.attemptId); resolutions.set(resolutionKey, attempt);
    return outcome({ ok: true, decision: "launch", failureClass: null, requestSha256: input.request.requestSha256, attempt, resolutionKey });
  }
  return freeze({ preflight, resolutionCount: () => resolutions.size });
}

export function preflightInvocation(input) { return createInvocationPreflightSession().preflight(input); }
