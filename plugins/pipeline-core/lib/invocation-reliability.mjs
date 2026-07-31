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
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:+-]{0,127}$/u;
const REQUEST_KEYS = ["schema", "invocationId", "subject", "route", "duty", "sandboxDispositionSha256", "command", "inputDigests", "timeoutMs", "allowedOutputs", "privacyClass", "requestSha256"];
const ATTEMPT_KEYS = ["schema", "attemptId", "invocationId", "index", "requestSha256", "launchDecision", "failureClass", "started", "ended", "resultSha256", "previousSha256", "recordSha256"];
const PRELAUNCH_FAILURES = new Set(["request-invalid", "chain-invalid", "authority-invalid", "selected-sandbox-terminal", "selected-sandbox-transient"]);
const RETRYABLE_FAILURES = new Set(["selected-sandbox-transient", "transport-transient", "host-pressure"]);
const OUTPUTS = new Set(["result", "receipt", "metrics"]);
const PRIVACY = new Set(["public", "restricted", "private"]);
const TOKEN_TYPES = new Set(["literal", "digest-ref"]);
const TIME_BUCKET = /^\d{4}-\d{2}-\d{2}T\d{2}:00Z$/u;
const COUNTER_MAXIMUM = 1_000_000;

const exact = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const id = (value) => typeof value === "string" && SAFE_ID.test(value);
const token = (value) => typeof value === "string" && Buffer.byteLength(value, "utf8") > 0
  && Buffer.byteLength(value, "utf8") <= 512 && !/[\0\r\n]/u.test(value);
const clone = (value) => JSON.parse(JSON.stringify(value));
function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

export const INVOCATION_CONTRACT_REGISTRY = freeze({
  registryVersion: "nova-a3-contracts-v1",
  chainVersion: INVOCATION_CHAIN_VERSION,
  contracts: [
    { schema: INVOCATION_REQUEST_SCHEMA, producer: "preflight", consumer: "launcher" },
    { schema: INVOCATION_ATTEMPT_SCHEMA, producer: "launcher-or-importer", consumer: "recurrence-reporter" },
  ],
});

export const INVOCATION_FAILURE_TAXONOMY = freeze([
  { failureClass: "request-invalid", owningLayer: "invocation-preflight", retry: "never", circuit: "request-digest" },
  { failureClass: "chain-invalid", owningLayer: "invocation-chain", retry: "never", circuit: "logical-invocation" },
  { failureClass: "authority-invalid", owningLayer: "sandbox-admission", retry: "never", circuit: "fingerprint" },
  { failureClass: "selected-sandbox-terminal", owningLayer: "sandbox-resolver", retry: "invalidation-only", circuit: "fingerprint" },
  { failureClass: "selected-sandbox-transient", owningLayer: "sandbox-resolver", retry: "declared-backoff", circuit: "fingerprint" },
  { failureClass: "transport-transient", owningLayer: "transport-adapter", retry: "declared-backoff", circuit: "logical-invocation" },
  { failureClass: "host-pressure", owningLayer: "host-runtime", retry: "declared-backoff", circuit: "host-fingerprint" },
  { failureClass: "denied", owningLayer: "authority-provider", retry: "never", circuit: "logical-invocation" },
  { failureClass: "unavailable", owningLayer: "owning-adapter", retry: "never", circuit: "logical-invocation" },
  { failureClass: "malformed-result", owningLayer: "result-importer", retry: "never", circuit: "logical-invocation" },
  { failureClass: "timeout", owningLayer: "invocation-launcher", retry: "never", circuit: "logical-invocation" },
  { failureClass: "cancelled", owningLayer: "caller-authority", retry: "never", circuit: "logical-invocation" },
  { failureClass: "internal-error", owningLayer: "invocation-internal", retry: "never", circuit: "logical-invocation" },
  { failureClass: "succeeded-unverified", owningLayer: "result-verifier", retry: "never", circuit: "logical-invocation" },
]);
const FAILURE_POLICIES = new Map(INVOCATION_FAILURE_TAXONOMY.map((entry) => [entry.failureClass, entry]));

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
function validSubject(value) { return exact(value, ["kind", "sha256"]) && id(value.kind) && SHA256.test(value.sha256); }
function validRoute(value) { return exact(value, ["runner", "adapterId", "adapterVersion", "requestedModel"]) && [value.runner, value.adapterId, value.adapterVersion, value.requestedModel].every(id); }
function validArgument(value) { return exact(value, ["type", "value"]) && TOKEN_TYPES.has(value.type) && token(value.value) && (value.type !== "digest-ref" || SHA256.test(value.value)); }
function validCommand(value) { return exact(value, ["contractId", "executableSha256", "arguments"]) && id(value.contractId) && SHA256.test(value.executableSha256) && Array.isArray(value.arguments) && value.arguments.length <= 256 && value.arguments.every(validArgument); }
function validObservation(value) { return exact(value, ["source", "monotonicMs", "wallTime", "rawSha256"]) && id(value.source) && Number.isSafeInteger(value.monotonicMs) && value.monotonicMs >= 0 && (value.wallTime === null || (typeof value.wallTime === "string" && !Number.isNaN(Date.parse(value.wallTime)))) && SHA256.test(value.rawSha256); }

function requestCode(record, verifyDigest = true) {
  if (!exact(record, REQUEST_KEYS)) return "SHAPE:request";
  if (record.schema !== INVOCATION_REQUEST_SCHEMA) return "SCHEMA:request";
  if (!id(record.invocationId) || !validSubject(record.subject) || !validRoute(record.route) || !id(record.duty) || !SHA256.test(record.sandboxDispositionSha256)) return "SHAPE:request-fields";
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
  if (!id(record.attemptId) || !id(record.invocationId) || !Number.isSafeInteger(record.index) || record.index < 0 || record.index > 255 || !SHA256.test(record.requestSha256) || !["launch", "suppressed"].includes(record.launchDecision) || !(record.failureClass === null || INVOCATION_FAILURE_CLASSES.includes(record.failureClass)) || !(record.started === null || validObservation(record.started)) || !(record.ended === null || validObservation(record.ended)) || !(record.resultSha256 === null || SHA256.test(record.resultSha256)) || !(record.previousSha256 === null || SHA256.test(record.previousSha256)) || !SHA256.test(record.recordSha256)) return "SHAPE:attempt-fields";
  if (record.ended && !record.started) return "BOUND:attempt-observation";
  if (record.started && record.ended && record.ended.monotonicMs < record.started.monotonicMs) return "BOUND:attempt-time";
  if (record.launchDecision === "suppressed" && (record.started !== null || record.ended !== null || record.resultSha256 !== null || !PRELAUNCH_FAILURES.has(record.failureClass))) return "BOUND:suppressed";
  if (record.launchDecision === "launch" && record.started === null) return "BOUND:launch";
  if (record.launchDecision === "launch" && record.ended === null && (record.failureClass !== null || record.resultSha256 !== null)) return "BOUND:active";
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

export function invocationFailurePolicy(failureClass) {
  return FAILURE_POLICIES.get(failureClass) ?? null;
}

export function invocationResolutionKey(request, fingerprint) {
  if (requestCode(request) || !fingerprint || typeof fingerprint !== "object" || Array.isArray(fingerprint)) return null;
  return digest({ chainVersion: INVOCATION_CHAIN_VERSION, fingerprint, subjectSha256: request.subject.sha256, duty: request.duty, requestSha256: request.requestSha256 });
}
export function isRetryableInvocationFailure(failureClass) { return RETRYABLE_FAILURES.has(failureClass); }

function validTimeBucket(value) {
  return typeof value === "string" && TIME_BUCKET.test(value) && !Number.isNaN(Date.parse(value));
}
function validCounters(value) {
  return exact(value, ["occurrences", "invocations", "sessions"])
    && [value.occurrences, value.invocations, value.sessions].every((entry) => Number.isSafeInteger(entry) && entry >= 1 && entry <= COUNTER_MAXIMUM)
    && value.sessions <= value.invocations && value.invocations <= value.occurrences;
}
function recurrenceReportCode(report, verifyDigest = true) {
  if (!exact(report, ["failureClass", "owningLayer", "counters", "timeBucket", "reportSha256"])) return "SHAPE:recurrence-report";
  const policy = invocationFailurePolicy(report.failureClass);
  if (!policy || report.owningLayer !== policy.owningLayer || !validCounters(report.counters)
    || !validTimeBucket(report.timeBucket) || !SHA256.test(report.reportSha256)) return "SHAPE:recurrence-report-fields";
  if (verifyDigest) {
    const { reportSha256, ...semantic } = report;
    if (digest(semantic) !== reportSha256) return "CONFLICT:recurrence-report-digest";
  }
  return null;
}
export function validateInvocationRecurrenceReport(report) {
  const code = recurrenceReportCode(report);
  return code ? { ok: false, code } : { ok: true, code: null };
}
export function createInvocationRecurrenceReport(input) {
  if (!exact(input, ["failureClass", "counters", "timeBucket"])) throw new Error("SHAPE:recurrence-report-input");
  const policy = invocationFailurePolicy(input.failureClass);
  const report = {
    failureClass: input.failureClass,
    owningLayer: policy?.owningLayer,
    counters: clone(input.counters),
    timeBucket: input.timeBucket,
    reportSha256: "0".repeat(64),
  };
  if (!policy || recurrenceReportCode(report, false)) throw new Error("SHAPE:recurrence-report-input");
  report.reportSha256 = digest({ failureClass: report.failureClass, owningLayer: report.owningLayer, counters: report.counters, timeBucket: report.timeBucket });
  return freeze(report);
}
export function aggregateInvocationRecurrences(events) {
  if (!Array.isArray(events) || events.length === 0 || events.length > 4096) throw new Error("BOUND:recurrence-events");
  const groups = new Map();
  for (const event of events) {
    if (!exact(event, ["failureClass", "invocationSha256", "sessionSha256", "timeBucket"])
      || !invocationFailurePolicy(event.failureClass) || !SHA256.test(event.invocationSha256)
      || !SHA256.test(event.sessionSha256) || !validTimeBucket(event.timeBucket)) throw new Error("SHAPE:recurrence-event");
    const key = `${event.failureClass}:${event.timeBucket}`;
    const group = groups.get(key) ?? { failureClass: event.failureClass, timeBucket: event.timeBucket, occurrences: 0, invocations: new Set(), sessions: new Set() };
    group.occurrences += 1;
    group.invocations.add(event.invocationSha256);
    group.sessions.add(event.sessionSha256);
    groups.set(key, group);
  }
  return freeze([...groups.values()].map((group) => createInvocationRecurrenceReport({
    failureClass: group.failureClass,
    counters: { occurrences: group.occurrences, invocations: group.invocations.size, sessions: group.sessions.size },
    timeBucket: group.timeBucket,
  })).sort((left, right) => left.reportSha256.localeCompare(right.reportSha256)));
}

function remediationEvidenceCode(value) {
  if (!exact(value, ["reproducerSha256", "owningLayerFixSha256", "regressionFixtureSha256", "postFixNonRecurrenceSha256"])) return "SHAPE:remediation-evidence";
  return Object.values(value).every((entry) => entry === null || SHA256.test(entry)) ? null : "SHAPE:remediation-evidence";
}
function remediationCandidateCode(value, verifyDigest = true) {
  if (!exact(value, ["failureClass", "owningLayer", "recurrenceSha256", "evidence", "status", "candidateSha256"])) return "SHAPE:remediation-candidate";
  const policy = invocationFailurePolicy(value.failureClass);
  if (!policy || policy.owningLayer !== value.owningLayer || !SHA256.test(value.recurrenceSha256)
    || remediationEvidenceCode(value.evidence) || !["observational", "accepted"].includes(value.status)
    || !SHA256.test(value.candidateSha256)) return "SHAPE:remediation-candidate-fields";
  const complete = Object.values(value.evidence).every((entry) => SHA256.test(entry));
  if ((value.status === "accepted") !== complete) return "BOUND:remediation-acceptance";
  if (verifyDigest) {
    const { candidateSha256, ...semantic } = value;
    if (digest(semantic) !== candidateSha256) return "CONFLICT:remediation-candidate-digest";
  }
  return null;
}
function sealRemediationCandidate(failureClass, owningLayer, recurrenceSha256, evidence) {
  const candidate = {
    failureClass,
    owningLayer,
    recurrenceSha256,
    evidence: clone(evidence),
    status: Object.values(evidence).every((entry) => SHA256.test(entry)) ? "accepted" : "observational",
    candidateSha256: "0".repeat(64),
  };
  if (remediationCandidateCode(candidate, false)) throw new Error("SHAPE:remediation-candidate-input");
  candidate.candidateSha256 = digest({
    failureClass: candidate.failureClass, owningLayer: candidate.owningLayer, recurrenceSha256: candidate.recurrenceSha256,
    evidence: candidate.evidence, status: candidate.status,
  });
  return freeze(candidate);
}
export function createInvocationRemediationCandidate(input) {
  if (!exact(input, ["recurrenceReport", "evidence"]) || recurrenceReportCode(input.recurrenceReport)
    || remediationEvidenceCode(input.evidence)) throw new Error("SHAPE:remediation-candidate-input");
  return sealRemediationCandidate(input.recurrenceReport.failureClass, input.recurrenceReport.owningLayer, input.recurrenceReport.reportSha256, input.evidence);
}
export function validateInvocationRemediationCandidate(value) {
  const code = remediationCandidateCode(value);
  return code ? { ok: false, code } : { ok: true, code: null };
}
export function deduplicateInvocationRemediationCandidates(values) {
  if (!Array.isArray(values) || values.length > 256) return freeze({ ok: false, code: "BOUND:remediation-candidates", candidates: null });
  const groups = new Map();
  for (const value of values) {
    const invalid = remediationCandidateCode(value);
    if (invalid) return freeze({ ok: false, code: invalid, candidates: null });
    const current = groups.get(value.recurrenceSha256);
    if (!current) {
      groups.set(value.recurrenceSha256, { failureClass: value.failureClass, owningLayer: value.owningLayer, evidence: clone(value.evidence) });
      continue;
    }
    if (current.failureClass !== value.failureClass || current.owningLayer !== value.owningLayer) return freeze({ ok: false, code: "CONFLICT:remediation-ownership", candidates: null });
    for (const key of Object.keys(current.evidence)) {
      const incoming = value.evidence[key];
      if (current.evidence[key] !== null && incoming !== null && current.evidence[key] !== incoming) return freeze({ ok: false, code: "CONFLICT:remediation-evidence", candidates: null });
      if (current.evidence[key] === null) current.evidence[key] = incoming;
    }
  }
  const candidates = [...groups.entries()].map(([recurrenceSha256, value]) => sealRemediationCandidate(value.failureClass, value.owningLayer, recurrenceSha256, value.evidence))
    .sort((left, right) => left.recurrenceSha256.localeCompare(right.recurrenceSha256));
  return freeze({ ok: true, code: null, candidates });
}

export function createSanitizedInvocationReceipt(request, attempts) {
  const chain = validateInvocationChain(request, attempts);
  if (!chain.ok) throw new Error(chain.code);
  if (attempts.length === 0) throw new Error("BOUND:receipt-empty");
  const last = attempts.at(-1);
  if (last.launchDecision === "launch" && last.ended === null) throw new Error("BOUND:receipt-active");
  const receipt = {
    contractVersion: INVOCATION_CHAIN_VERSION,
    invocationSha256: digest({ invocationId: request.invocationId }),
    requestSha256: request.requestSha256,
    attemptCount: attempts.length,
    chainHeadSha256: last.recordSha256,
    terminalFailureClass: last.failureClass,
    resultSha256: last.resultSha256,
    verified: false,
    receiptSha256: "0".repeat(64),
  };
  receipt.receiptSha256 = digest({
    contractVersion: receipt.contractVersion, invocationSha256: receipt.invocationSha256, requestSha256: receipt.requestSha256,
    attemptCount: receipt.attemptCount, chainHeadSha256: receipt.chainHeadSha256, terminalFailureClass: receipt.terminalFailureClass,
    resultSha256: receipt.resultSha256, verified: receipt.verified,
  });
  return freeze(receipt);
}
