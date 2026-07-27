// SPDX-License-Identifier: SUL-1.0

/**
 * Nova A3's deliberately small, pure invocation contract.
 *
 * Nothing in this module starts a child.  Callers receive an immutable launch
 * decision and remain responsible for turning that decision into separately
 * attested execution evidence.
 */
import { createHash } from "node:crypto";

export const INVOCATION_REQUEST_SCHEMA = "pipeline.invocation-request.v1";
export const INVOCATION_ATTEMPT_SCHEMA = "pipeline.invocation-attempt.v1";
export const INVOCATION_CHAIN_VERSION = "nova-a3-v1";
export const INVOCATION_FAILURE_CLASSES = Object.freeze([
  "request-invalid", "chain-invalid", "authority-invalid", "selected-sandbox-terminal",
  "selected-sandbox-transient", "transport-transient", "host-pressure", "denied",
  "unavailable", "malformed-result", "timeout", "cancelled", "internal-error",
  "succeeded-unverified",
]);

const SHA256 = /^[a-f0-9]{64}$/u;
const REQUEST_KEYS = ["schema", "invocationId", "subject", "route", "duty", "sandboxDispositionSha256", "command", "inputDigests", "timeoutMs", "allowedOutputs", "privacyClass", "requestSha256"];
const ATTEMPT_KEYS = ["schema", "attemptId", "invocationId", "index", "requestSha256", "launchDecision", "failureClass", "started", "ended", "resultSha256", "previousSha256", "recordSha256"];
const PRELAUNCH_FAILURES = new Set(["request-invalid", "chain-invalid", "authority-invalid", "selected-sandbox-terminal", "selected-sandbox-transient"]);
const RETRYABLE_FAILURES = new Set(["selected-sandbox-transient", "transport-transient", "host-pressure"]);
const OUTPUTS = new Set(["result", "receipt", "metrics"]);
const PRIVACY = new Set(["public", "restricted", "private"]);
const TOKEN_TYPES = new Set(["literal", "digest-ref"]);

const exact = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const string = (value, maximum = 256) => typeof value === "string" && value.length > 0 && value.length <= maximum && !/[\0\r\n]/u.test(value);
const clone = (value) => JSON.parse(JSON.stringify(value));
function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

export function canonicalInvocationJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalInvocationJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalInvocationJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function digest(value) { return createHash("sha256").update(canonicalInvocationJson(value), "utf8").digest("hex"); }
export function invalidInvocationDigest(value) { return digest(value === undefined ? { absent: true } : value); }
export function invocationRequestDigest(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return null;
  const { requestSha256, ...semantic } = record;
  return digest(semantic);
}
export function invocationAttemptDigest(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return null;
  const { recordSha256, ...semantic } = record;
  return digest(semantic);
}

function sortedUnique(values) { return Array.isArray(values) && values.length <= 256 && values.every((entry) => typeof entry === "string") && [...values].every((entry, index) => index === 0 || values[index - 1] < entry); }
function validSubject(value) { return exact(value, ["kind", "sha256"]) && string(value.kind, 64) && SHA256.test(value.sha256); }
function validRoute(value) { return exact(value, ["runner", "adapterId", "adapterVersion", "requestedModel"]) && [value.runner, value.adapterId, value.adapterVersion, value.requestedModel].every((entry) => string(entry, 128)); }
function validArgument(value) { return exact(value, ["type", "value"]) && TOKEN_TYPES.has(value.type) && string(value.value, 512) && (value.type !== "digest-ref" || SHA256.test(value.value)); }
function validCommand(value) { return exact(value, ["contractId", "executableSha256", "arguments"]) && string(value.contractId, 128) && SHA256.test(value.executableSha256) && Array.isArray(value.arguments) && value.arguments.length <= 256 && value.arguments.every(validArgument); }
function validObservation(value) { return exact(value, ["source", "monotonicMs", "wallTime", "rawSha256"]) && string(value.source, 64) && Number.isSafeInteger(value.monotonicMs) && value.monotonicMs >= 0 && (value.wallTime === null || (typeof value.wallTime === "string" && !Number.isNaN(Date.parse(value.wallTime)))) && SHA256.test(value.rawSha256); }

function requestCode(record, verifyDigest = true) {
  if (!exact(record, REQUEST_KEYS)) return "SHAPE:request";
  if (record.schema !== INVOCATION_REQUEST_SCHEMA) return "SCHEMA:request";
  if (!string(record.invocationId) || !validSubject(record.subject) || !validRoute(record.route) || !string(record.duty, 64) || !SHA256.test(record.sandboxDispositionSha256)) return "SHAPE:request-fields";
  if (!validCommand(record.command) || !sortedUnique(record.inputDigests) || !record.inputDigests.every((entry) => SHA256.test(entry)) || !Number.isSafeInteger(record.timeoutMs) || record.timeoutMs < 1_000 || record.timeoutMs > 3_600_000 || !sortedUnique(record.allowedOutputs) || record.allowedOutputs.length === 0 || !record.allowedOutputs.every((entry) => OUTPUTS.has(entry)) || !PRIVACY.has(record.privacyClass) || !SHA256.test(record.requestSha256)) return "SHAPE:request-contract";
  if (verifyDigest && invocationRequestDigest(record) !== record.requestSha256) return "CONFLICT:request-digest";
  return null;
}
export function validateInvocationRequest(record) { const code = requestCode(record); return code ? { ok: false, code } : { ok: true, code: null }; }
export function createInvocationRequest(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("SHAPE:request-input");
  const record = { schema: INVOCATION_REQUEST_SCHEMA, ...clone(input), requestSha256: "0".repeat(64) };
  if (Object.hasOwn(input, "schema") || Object.hasOwn(input, "requestSha256") || requestCode(record, false)) throw new Error("SHAPE:request-input");
  record.requestSha256 = invocationRequestDigest(record);
  return freeze(record);
}

function attemptCode(record, verifyDigest = true) {
  if (!exact(record, ATTEMPT_KEYS)) return "SHAPE:attempt";
  if (record.schema !== INVOCATION_ATTEMPT_SCHEMA) return "SCHEMA:attempt";
  if (!string(record.attemptId) || !string(record.invocationId) || !Number.isSafeInteger(record.index) || record.index < 0 || !SHA256.test(record.requestSha256) || !["launch", "suppressed"].includes(record.launchDecision) || !(record.failureClass === null || INVOCATION_FAILURE_CLASSES.includes(record.failureClass)) || !(record.started === null || validObservation(record.started)) || !(record.ended === null || validObservation(record.ended)) || !(record.resultSha256 === null || SHA256.test(record.resultSha256)) || !(record.previousSha256 === null || SHA256.test(record.previousSha256)) || !SHA256.test(record.recordSha256)) return "SHAPE:attempt-fields";
  if (record.ended && !record.started) return "BOUND:attempt-observation";
  if (record.started && record.ended && record.ended.monotonicMs < record.started.monotonicMs) return "BOUND:attempt-time";
  if (record.launchDecision === "suppressed" && (record.started !== null || record.ended !== null || record.resultSha256 !== null || !PRELAUNCH_FAILURES.has(record.failureClass))) return "BOUND:suppressed";
  if (record.launchDecision === "launch" && record.started === null) return "BOUND:launch";
  if (record.ended === null && (record.failureClass !== null || record.resultSha256 !== null)) return "BOUND:active";
  if (record.failureClass === "succeeded-unverified" && (record.ended === null || record.resultSha256 === null)) return "BOUND:unverified";
  if (record.failureClass !== "succeeded-unverified" && record.resultSha256 !== null) return "BOUND:result";
  if (verifyDigest && invocationAttemptDigest(record) !== record.recordSha256) return "CONFLICT:attempt-digest";
  return null;
}
export function validateInvocationAttempt(record) { const code = attemptCode(record); return code ? { ok: false, code } : { ok: true, code: null }; }
export function createInvocationAttempt(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("SHAPE:attempt-input");
  const record = { schema: INVOCATION_ATTEMPT_SCHEMA, ...clone(input), recordSha256: "0".repeat(64) };
  if (Object.hasOwn(input, "schema") || Object.hasOwn(input, "recordSha256") || attemptCode(record, false)) throw new Error("SHAPE:attempt-input");
  record.recordSha256 = invocationAttemptDigest(record);
  return freeze(record);
}

export function validateInvocationChain(request, attempts) {
  const invalidRequest = requestCode(request);
  if (invalidRequest) return { ok: false, code: invalidRequest };
  if (!Array.isArray(attempts) || attempts.length > 256) return { ok: false, code: "SHAPE:attempt-chain" };
  const ids = new Set();
  for (let index = 0; index < attempts.length; index += 1) {
    const attempt = attempts[index]; const invalid = attemptCode(attempt);
    if (invalid) return { ok: false, code: invalid };
    if (attempt.invocationId !== request.invocationId || attempt.requestSha256 !== request.requestSha256 || attempt.index !== index || ids.has(attempt.attemptId) || attempt.previousSha256 !== (index === 0 ? null : attempts[index - 1].recordSha256)) return { ok: false, code: "CHAIN:attempt-link" };
    ids.add(attempt.attemptId);
  }
  return { ok: true, code: null };
}

export function invocationResolutionKey(request, fingerprint) {
  if (requestCode(request) || !fingerprint || typeof fingerprint !== "object" || Array.isArray(fingerprint)) return null;
  return digest({ chainVersion: INVOCATION_CHAIN_VERSION, fingerprint, subjectSha256: request.subject.sha256, duty: request.duty, requestSha256: request.requestSha256 });
}
export function isRetryableInvocationFailure(failureClass) { return RETRYABLE_FAILURES.has(failureClass); }
