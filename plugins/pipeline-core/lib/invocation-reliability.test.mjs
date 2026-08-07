#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  INVOCATION_ATTEMPT_SCHEMA,
  INVOCATION_CHAIN_VERSION,
  INVOCATION_CONTRACT_REGISTRY,
  INVOCATION_FAILURE_CLASSES,
  INVOCATION_FAILURE_TAXONOMY,
  INVOCATION_REQUEST_SCHEMA,
  aggregateInvocationRecurrences,
  createInvocationAttempt,
  createInvocationRecurrenceReport,
  createInvocationRemediationCandidate,
  createInvocationRequest,
  createSanitizedInvocationReceipt,
  deduplicateInvocationRemediationCandidates,
  invocationAttemptDigest,
  invocationFailurePolicy,
  invocationRequestDigest,
  isRetryableInvocationFailure,
  validateInvocationAttempt,
  validateInvocationChain,
  validateInvocationRecurrenceReport,
  validateInvocationRemediationCandidate,
  validateInvocationRequest,
} from "./invocation-reliability.mjs";

const A = "a".repeat(64); const B = "b".repeat(64); const C = "c".repeat(64);
const REQUEST_SCHEMA = JSON.parse(readFileSync(new URL("../scripts/invocation-request.schema.json", import.meta.url), "utf8"));
const ATTEMPT_SCHEMA = JSON.parse(readFileSync(new URL("../scripts/invocation-attempt.schema.json", import.meta.url), "utf8"));
let passed = 0; const failures = [];
function check(name, fn) { try { fn(); passed += 1; console.log(`PASS ${name}`); } catch (error) { failures.push(`${name}: ${error.message}`); console.error(`FAIL ${name} -- ${error.message}`); } }
const clone = (value) => JSON.parse(JSON.stringify(value));
function schemaAccepts(value, root) {
  function resolve(reference) {
    assert.match(reference, /^#\/\$defs\/[A-Za-z0-9_-]+$/u);
    return root.$defs[reference.slice("#/$defs/".length)];
  }
  function same(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
  function typeMatches(item, type) {
    if (type === "null") return item === null;
    if (type === "array") return Array.isArray(item);
    if (type === "object") return item !== null && typeof item === "object" && !Array.isArray(item);
    if (type === "integer") return Number.isSafeInteger(item);
    return typeof item === type;
  }
  function valid(item, schema) {
    if (schema.$ref && !valid(item, resolve(schema.$ref))) return false;
    if (Object.hasOwn(schema, "const") && !same(item, schema.const)) return false;
    if (schema.enum && !schema.enum.some((entry) => same(item, entry))) return false;
    if (schema.type && !typeMatches(item, schema.type)) return false;
    if (schema.oneOf && schema.oneOf.filter((entry) => valid(item, entry)).length !== 1) return false;
    if (schema.anyOf && !schema.anyOf.some((entry) => valid(item, entry))) return false;
    if (schema.allOf && !schema.allOf.every((entry) => valid(item, entry))) return false;
    if (schema.not && valid(item, schema.not)) return false;
    if (schema.if) {
      const branch = valid(item, schema.if) ? schema.then : schema.else;
      if (branch && !valid(item, branch)) return false;
    }
    if (typeof item === "string") {
      if (schema.minLength !== undefined && [...item].length < schema.minLength) return false;
      if (schema.maxLength !== undefined && [...item].length > schema.maxLength) return false;
      if (schema.pattern && !new RegExp(schema.pattern, "u").test(item)) return false;
      if (schema.format === "date-time" && Number.isNaN(Date.parse(item))) return false;
    }
    if (typeof item === "number") {
      if (schema.minimum !== undefined && item < schema.minimum) return false;
      if (schema.maximum !== undefined && item > schema.maximum) return false;
    }
    if (Array.isArray(item)) {
      if (schema.minItems !== undefined && item.length < schema.minItems) return false;
      if (schema.maxItems !== undefined && item.length > schema.maxItems) return false;
      if (schema.uniqueItems && new Set(item.map((entry) => JSON.stringify(entry))).size !== item.length) return false;
      if (schema.items && !item.every((entry) => valid(entry, schema.items))) return false;
    }
    if (item !== null && typeof item === "object" && !Array.isArray(item)) {
      if (schema.required && !schema.required.every((key) => Object.hasOwn(item, key))) return false;
      if (schema.additionalProperties === false && Object.keys(item).some((key) => !Object.hasOwn(schema.properties ?? {}, key))) return false;
      for (const [key, child] of Object.entries(schema.properties ?? {})) {
        if (Object.hasOwn(item, key) && !valid(item[key], child)) return false;
      }
    }
    return true;
  }
  return valid(value, root);
}
function request(overrides = {}) {
  return createInvocationRequest({
    invocationId: "nova-a3-invocation-01", subject: { kind: "dispatch", sha256: A },
    route: { runner: "codex", adapterId: "selected-sandbox", adapterVersion: "v1", requestedModel: "gpt-5.6-sol" },
    duty: "advisory", sandboxDispositionSha256: B,
    command: { contractId: "advisory-v1", executableSha256: C, arguments: [{ type: "literal", value: "--read-only" }, { type: "digest-ref", value: A }] },
    inputDigests: [A, B], timeoutMs: 60_000, allowedOutputs: ["metrics", "receipt", "result"], privacyClass: "restricted", ...overrides,
  });
}
function observation(ms) { return { source: "preflight", monotonicMs: ms, wallTime: null, rawSha256: A }; }
function attempt(req, overrides = {}) {
  return createInvocationAttempt({ attemptId: "nova-a3-attempt-01", invocationId: req.invocationId, index: 0, requestSha256: req.requestSha256, launchDecision: "launch", failureClass: null, started: observation(1_000), ended: null, resultSha256: null, previousSha256: null, ...overrides });
}
function resealRequest(value) { value.requestSha256 = invocationRequestDigest(value); return value; }
function resealAttempt(value) { value.recordSha256 = invocationAttemptDigest(value); return value; }

check("A3R01 creates exact frozen canonical request and attempt records", () => {
  const req = request(); const item = attempt(req);
  assert.equal(INVOCATION_REQUEST_SCHEMA, "pipeline.invocation-request.v1"); assert.equal(INVOCATION_ATTEMPT_SCHEMA, "pipeline.invocation-attempt.v1"); assert.equal(INVOCATION_CHAIN_VERSION, "nova-a3-v1");
  assert.equal(Object.isFrozen(req), true); assert.equal(Object.isFrozen(item), true);
  assert.equal(invocationRequestDigest(req), req.requestSha256); assert.equal(invocationAttemptDigest(item), item.recordSha256);
  assert.deepEqual(validateInvocationRequest(req), { ok: true, code: null }); assert.deepEqual(validateInvocationAttempt(item), { ok: true, code: null });
});

check("A3R02 command arguments are typed argv tokens and request shape/digest are fail-closed", () => {
  const req = request(); const bad = JSON.parse(JSON.stringify(req)); bad.command.arguments[1].value = "not-a-digest";
  assert.equal(validateInvocationRequest(bad).ok, false);
  const drift = JSON.parse(JSON.stringify(req)); drift.timeoutMs = 1_000;
  assert.equal(validateInvocationRequest(drift).code, "CONFLICT:request-digest");
  assert.throws(() => request({ allowedOutputs: ["result", "result"] }), /SHAPE:request-input/u);
});

check("A3R03 chain links exact request and prior attempt digests with unique correlated indexes", () => {
  const req = request(); const first = attempt(req);
  const second = createInvocationAttempt({ attemptId: "nova-a3-attempt-02", invocationId: req.invocationId, index: 1, requestSha256: req.requestSha256, launchDecision: "launch", failureClass: "timeout", started: observation(2_000), ended: observation(3_000), resultSha256: null, previousSha256: first.recordSha256 });
  assert.deepEqual(validateInvocationChain(req, [first, second]), { ok: true, code: null });
  const duplicate = JSON.parse(JSON.stringify(second)); duplicate.attemptId = first.attemptId; duplicate.recordSha256 = invocationAttemptDigest(duplicate);
  assert.equal(validateInvocationChain(req, [first, duplicate]).ok, false);
});

check("A3R04 succeeded-unverified is a terminal class, not a success projection", () => {
  const req = request();
  const unverified = attempt(req, { failureClass: "succeeded-unverified", ended: observation(2_000), resultSha256: B });
  assert.deepEqual(validateInvocationAttempt(unverified), { ok: true, code: null });
  assert.equal(unverified.failureClass, "succeeded-unverified");
  assert.equal(isRetryableInvocationFailure("succeeded-unverified"), false);
  assert.equal(isRetryableInvocationFailure("transport-transient"), true);
});

check("A3R05 request schema is Draft 2020-12, exact, closed and runtime-parallel on its structural corpus", () => {
  const expectedRoot = ["schema", "invocationId", "subject", "route", "duty", "sandboxDispositionSha256", "command", "inputDigests", "timeoutMs", "allowedOutputs", "privacyClass", "requestSha256"];
  assert.equal(REQUEST_SCHEMA.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(REQUEST_SCHEMA.$id, INVOCATION_REQUEST_SCHEMA);
  assert.equal(REQUEST_SCHEMA.additionalProperties, false);
  assert.deepEqual(REQUEST_SCHEMA.required, expectedRoot);
  for (const name of ["subject", "route", "command"]) {
    assert.equal(REQUEST_SCHEMA.$defs[name].additionalProperties, false);
    assert.deepEqual(Object.keys(REQUEST_SCHEMA.$defs[name].properties).sort(), [...REQUEST_SCHEMA.$defs[name].required].sort());
  }
  for (const branch of REQUEST_SCHEMA.$defs.argument.oneOf) {
    assert.equal(branch.additionalProperties, false);
    assert.deepEqual(Object.keys(branch.properties).sort(), [...branch.required].sort());
  }
  const good = request();
  const corpus = [
    good,
    resealRequest({ ...clone(good), invocationId: "/private/user" }),
    resealRequest({ ...clone(good), timeoutMs: 999 }),
    resealRequest({ ...clone(good), allowedOutputs: ["result", "result"] }),
    resealRequest({ ...clone(good), privacyClass: "secret" }),
    resealRequest({ ...clone(good), route: { ...clone(good.route), homePath: "/private/user" } }),
    resealRequest({ ...clone(good), command: { ...clone(good.command), arguments: [{ type: "digest-ref", value: "not-a-digest" }] } }),
    resealRequest({ ...clone(good), command: { ...clone(good.command), arguments: [{ type: "literal", value: "line\nbreak" }] } }),
  ];
  const expected = [true, false, false, false, false, false, false, false];
  corpus.forEach((record, index) => {
    const structural = schemaAccepts(record, REQUEST_SCHEMA);
    const runtime = validateInvocationRequest(record).ok;
    assert.equal(structural, expected[index], `request schema corpus ${index}`);
    assert.equal(runtime, expected[index], `request runtime corpus ${index}`);
  });
});

check("A3R06 attempt schema is exact, closed and runtime-parallel for bounds/enums/conditionals", () => {
  const expectedRoot = ["schema", "attemptId", "invocationId", "index", "requestSha256", "launchDecision", "failureClass", "started", "ended", "resultSha256", "previousSha256", "recordSha256"];
  assert.equal(ATTEMPT_SCHEMA.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(ATTEMPT_SCHEMA.$id, INVOCATION_ATTEMPT_SCHEMA);
  assert.equal(ATTEMPT_SCHEMA.additionalProperties, false);
  assert.deepEqual(ATTEMPT_SCHEMA.required, expectedRoot);
  assert.equal(ATTEMPT_SCHEMA.$defs.timedObservation.additionalProperties, false);
  assert.deepEqual(Object.keys(ATTEMPT_SCHEMA.$defs.timedObservation.properties).sort(), [...ATTEMPT_SCHEMA.$defs.timedObservation.required].sort());
  assert.deepEqual(ATTEMPT_SCHEMA.$defs.failureClass.enum, INVOCATION_FAILURE_CLASSES);
  const req = request();
  const active = attempt(req);
  const suppressed = createInvocationAttempt({ attemptId: "nova-a3-suppressed-01", invocationId: req.invocationId, index: 0, requestSha256: req.requestSha256, launchDecision: "suppressed", failureClass: "selected-sandbox-transient", started: null, ended: null, resultSha256: null, previousSha256: null });
  const unverified = attempt(req, { failureClass: "succeeded-unverified", ended: observation(2_000), resultSha256: B });
  const corpus = [
    active,
    suppressed,
    unverified,
    resealAttempt({ ...clone(active), index: 256 }),
    resealAttempt({ ...clone(active), failureClass: "timeout" }),
    resealAttempt({ ...clone(active), launchDecision: "suppressed", failureClass: "request-invalid" }),
    resealAttempt({ ...clone(active), started: null, ended: observation(2_000), failureClass: "timeout" }),
    resealAttempt({ ...clone(active), ended: observation(2_000), failureClass: "timeout", resultSha256: B }),
    resealAttempt({ ...clone(active), started: { ...clone(active.started), rawOutput: "private" } }),
  ];
  const expected = [true, true, true, false, false, false, false, false, false];
  corpus.forEach((record, index) => {
    const structural = schemaAccepts(record, ATTEMPT_SCHEMA);
    const runtime = validateInvocationAttempt(record).ok;
    assert.equal(structural, expected[index], `attempt schema corpus ${index}`);
    assert.equal(runtime, expected[index], `attempt runtime corpus ${index}`);
  });
});

check("A3R07 versioned registry and failure ownership/retry/circuit taxonomy are closed and complete", () => {
  assert.deepEqual(INVOCATION_CONTRACT_REGISTRY, {
    registryVersion: "nova-a3-contracts-v1",
    chainVersion: "nova-a3-v1",
    contracts: [
      { schema: "pipeline.invocation-request.v1", producer: "preflight", consumer: "launcher" },
      { schema: "pipeline.invocation-attempt.v1", producer: "launcher-or-importer", consumer: "recurrence-reporter" },
    ],
  });
  assert.deepEqual(INVOCATION_FAILURE_TAXONOMY.map((entry) => entry.failureClass), INVOCATION_FAILURE_CLASSES);
  assert.equal(new Set(INVOCATION_FAILURE_TAXONOMY.map((entry) => entry.failureClass)).size, INVOCATION_FAILURE_CLASSES.length);
  for (const entry of INVOCATION_FAILURE_TAXONOMY) {
    assert.deepEqual(Object.keys(entry).sort(), ["circuit", "failureClass", "owningLayer", "retry"]);
    assert.strictEqual(invocationFailurePolicy(entry.failureClass), entry);
    assert.equal(isRetryableInvocationFailure(entry.failureClass), entry.retry === "declared-backoff");
  }
  assert.equal(invocationFailurePolicy("unknown"), null);
  assert.equal(Object.isFrozen(INVOCATION_CONTRACT_REGISTRY), true);
  assert.equal(Object.isFrozen(INVOCATION_FAILURE_TAXONOMY), true);
});

check("A3R08 recurrence aggregation emits only class, owning layer, bounded counters, coarse bucket and digest", () => {
  const reports = aggregateInvocationRecurrences([
    { failureClass: "transport-transient", invocationSha256: A, sessionSha256: B, timeBucket: "2026-07-31T10:00Z" },
    { failureClass: "transport-transient", invocationSha256: A, sessionSha256: B, timeBucket: "2026-07-31T10:00Z" },
    { failureClass: "transport-transient", invocationSha256: C, sessionSha256: B, timeBucket: "2026-07-31T10:00Z" },
  ]);
  assert.equal(reports.length, 1);
  assert.deepEqual(Object.keys(reports[0]).sort(), ["counters", "failureClass", "owningLayer", "reportSha256", "timeBucket"]);
  assert.deepEqual(reports[0].counters, { occurrences: 3, invocations: 2, sessions: 1 });
  assert.equal(reports[0].owningLayer, "transport-adapter");
  assert.deepEqual(validateInvocationRecurrenceReport(reports[0]), { ok: true, code: null });
  assert.doesNotMatch(JSON.stringify(reports), /(?:\/home\/|Users|account|token|environment)/u);
  assert.throws(() => aggregateInvocationRecurrences([{ failureClass: "transport-transient", invocationSha256: A, sessionSha256: B, timeBucket: "2026-07-31T10:00Z", raw: "/home/private" }]), /SHAPE:recurrence-event/u);
  assert.throws(() => createInvocationRecurrenceReport({ failureClass: "transport-transient", counters: { occurrences: 2, invocations: 3, sessions: 1 }, timeBucket: "2026-07-31T10:00Z" }), /SHAPE:recurrence-report-input/u);
});

check("A3R09 remediation is deduplicated and accepted only with all four systemic-repair evidence gates", () => {
  const recurrenceReport = createInvocationRecurrenceReport({
    failureClass: "internal-error", counters: { occurrences: 2, invocations: 2, sessions: 1 }, timeBucket: "2026-07-31T10:00Z",
  });
  const reproducer = createInvocationRemediationCandidate({
    recurrenceReport,
    evidence: { reproducerSha256: A, owningLayerFixSha256: B, regressionFixtureSha256: null, postFixNonRecurrenceSha256: null },
  });
  const regression = createInvocationRemediationCandidate({
    recurrenceReport,
    evidence: { reproducerSha256: null, owningLayerFixSha256: null, regressionFixtureSha256: C, postFixNonRecurrenceSha256: B },
  });
  assert.equal(reproducer.status, "observational");
  const deduplicated = deduplicateInvocationRemediationCandidates([reproducer, reproducer, regression]);
  assert.deepEqual({ ok: deduplicated.ok, code: deduplicated.code }, { ok: true, code: null });
  assert.equal(deduplicated.candidates.length, 1);
  assert.equal(deduplicated.candidates[0].status, "accepted");
  assert.deepEqual(validateInvocationRemediationCandidate(deduplicated.candidates[0]), { ok: true, code: null });
  const forged = clone(reproducer); forged.status = "accepted"; forged.candidateSha256 = A;
  assert.equal(validateInvocationRemediationCandidate(forged).code, "BOUND:remediation-acceptance");
  const conflict = createInvocationRemediationCandidate({
    recurrenceReport,
    evidence: { reproducerSha256: C, owningLayerFixSha256: null, regressionFixtureSha256: null, postFixNonRecurrenceSha256: null },
  });
  assert.equal(deduplicateInvocationRemediationCandidates([reproducer, conflict]).code, "CONFLICT:remediation-evidence");
});

check("A3R10 sanitized receipt retains only digests, bounded count and a non-success verification projection", () => {
  const req = request({ invocationId: "private-machine-coordinate" });
  const terminal = attempt(req, { failureClass: "succeeded-unverified", ended: observation(2_000), resultSha256: B });
  const receipt = createSanitizedInvocationReceipt(req, [terminal]);
  assert.deepEqual(Object.keys(receipt).sort(), ["attemptCount", "chainHeadSha256", "contractVersion", "invocationSha256", "receiptSha256", "requestSha256", "resultSha256", "terminalFailureClass", "verified"]);
  assert.equal(receipt.verified, false);
  assert.equal(receipt.terminalFailureClass, "succeeded-unverified");
  assert.equal(receipt.attemptCount, 1);
  assert.doesNotMatch(JSON.stringify(receipt), /private-machine-coordinate/u);
  assert.throws(() => createSanitizedInvocationReceipt(req, [attempt(req)]), /BOUND:receipt-active/u);
});

console.log(`\ninvocation-reliability: ${passed}/${passed + failures.length} checks passed.`);
if (failures.length) process.exitCode = 1;
