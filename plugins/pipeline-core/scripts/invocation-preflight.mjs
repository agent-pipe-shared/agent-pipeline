#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/** Thin, no-launch Nova A3 admission and session single-flight memory. */
import {
  createInvocationAttempt,
  invalidInvocationDigest,
  invocationResolutionKey,
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
const exact = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const freeze = (value) => { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) freeze(child); } return value; };

function outcome({ ok, decision, failureClass, requestSha256, attempt = null, resolutionKey = null }) {
  return freeze({ ok, decision, failureClass, requestSha256, attempt, resolutionKey });
}
function denied(failureClass, request) { return outcome({ ok: false, decision: "suppressed", failureClass, requestSha256: invalidInvocationDigest(request) }); }
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

/**
 * Returns a session-local preflight resolver. It performs no I/O and never
 * invokes a launcher; an admitted `launch` decision is merely a sealed input
 * for a later, independently attested launcher.
 */
export function createInvocationPreflightSession() {
  const resolutions = new Map();
  const seenAttemptIds = new Set();
  const invalid = new Map();
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
    if (existing) return outcome({ ok: true, decision: "join", failureClass: null, requestSha256: input.request.requestSha256, attempt: existing, resolutionKey });
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
