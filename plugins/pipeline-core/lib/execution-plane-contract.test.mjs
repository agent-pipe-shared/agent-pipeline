#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createExecutionPlaneRequest,
  createExecutionState,
  createExecutionSubject,
  executionRequestDigest,
  executionSubjectDigest,
  normalizeSyntheticExecutionOutcome,
  reduceExecutionState,
  validateExecutionPlaneAdmission,
  validateExecutionPlaneRequest,
  validateExecutionState,
  validateExecutionSubject,
} from "./execution-plane-contract.mjs";

const A = "a".repeat(64), B = "b".repeat(64), C = "c".repeat(64), O = "1".repeat(40);
const SUBJECT_SCHEMA = JSON.parse(readFileSync(new URL("../scripts/nova-execution-subject.schema.json", import.meta.url), "utf8"));
const REQUEST_SCHEMA = JSON.parse(readFileSync(new URL("../scripts/execution-plane-request.schema.json", import.meta.url), "utf8"));
const STATE_SCHEMA = JSON.parse(readFileSync(new URL("../scripts/nova-execution-state.schema.json", import.meta.url), "utf8"));
const DOCUMENTS = { [SUBJECT_SCHEMA.$id]: SUBJECT_SCHEMA };
const clone = (value) => JSON.parse(JSON.stringify(value));

function schemaAccepts(value, root) {
  const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
  const typeMatches = (item, type) => {
    if (Array.isArray(type)) return type.some((entry) => typeMatches(item, entry));
    if (type === "null") return item === null;
    if (type === "array") return Array.isArray(item);
    if (type === "object") return item !== null && typeof item === "object" && !Array.isArray(item);
    if (type === "integer") return Number.isSafeInteger(item);
    return typeof item === type;
  };
  function resolve(reference, activeRoot) {
    if (reference.startsWith("#/$defs/")) return [activeRoot.$defs[reference.slice("#/$defs/".length)], activeRoot];
    assert.ok(DOCUMENTS[reference], `unknown schema reference ${reference}`);
    return [DOCUMENTS[reference], DOCUMENTS[reference]];
  }
  function valid(item, schema, activeRoot) {
    if (schema.$ref) {
      const [target, targetRoot] = resolve(schema.$ref, activeRoot);
      if (!valid(item, target, targetRoot)) return false;
    }
    if (Object.hasOwn(schema, "const") && !same(item, schema.const)) return false;
    if (schema.enum && !schema.enum.some((entry) => same(item, entry))) return false;
    if (schema.type && !typeMatches(item, schema.type)) return false;
    if (schema.oneOf && schema.oneOf.filter((entry) => valid(item, entry, activeRoot)).length !== 1) return false;
    if (schema.allOf && !schema.allOf.every((entry) => valid(item, entry, activeRoot))) return false;
    if (schema.if) {
      const branch = valid(item, schema.if, activeRoot) ? schema.then : schema.else;
      if (branch && !valid(item, branch, activeRoot)) return false;
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
      if (schema.items && !item.every((entry) => valid(entry, schema.items, activeRoot))) return false;
    }
    if (item !== null && typeof item === "object" && !Array.isArray(item)) {
      if (schema.required && !schema.required.every((key) => Object.hasOwn(item, key))) return false;
      if (schema.additionalProperties === false && Object.keys(item).some((key) => !Object.hasOwn(schema.properties ?? {}, key))) return false;
      for (const [key, child] of Object.entries(schema.properties ?? {})) {
        if (Object.hasOwn(item, key) && !valid(item[key], child, activeRoot)) return false;
      }
    }
    return true;
  }
  return valid(value, root, root);
}

function subjectInput(overrides = {}) {
  return {
    repository: "self",
    baseCommit: O,
    baseTree: O,
    candidateCommit: O,
    candidateTree: O,
    packageId: "pkg",
    dispatchId: "dispatch",
    attempt: 0,
    queueRevision: 0,
    authorityDigests: [{ kind: "spec", sha256: A }],
    writePaths: ["lib/pkg.mjs"],
    resources: ["cpu"],
    ...overrides,
  };
}
const subject = createExecutionSubject(subjectInput());
function requestInput(overrides = {}) {
  return {
    requestId: "request",
    subject,
    adapter: { kind: "synthetic", version: "v1", implementationSha256: A },
    locality: "in-process",
    workspace: { identitySha256: A, separation: "observed", assuranceEvidenceSha256: B },
    network: { mode: "none", egressClasses: [] },
    mounts: [],
    writePaths: ["lib/pkg.mjs"],
    resources: [{ unit: "cpu", value: 1, source: "admission", status: "known" }],
    sidecars: [],
    credentialLease: null,
    heartbeat: { intervalMs: 10, orphanAfterMs: 20 },
    timeout: { absoluteMs: 100, maxPauseMs: 0 },
    cancellation: { supported: true, deadlineMs: 10 },
    resultDelivery: { mode: "inline-digest", maxBytes: 10, destinationClass: "result" },
    frozenBinding: { controlExecutionExchangeSha256: A, invocationRequestSha256: B },
    ...overrides,
  };
}
const request = createExecutionPlaneRequest(requestInput());
const reseal = (value) => {
  value.requestSha256 = executionRequestDigest(value);
  return value;
};
const admission = (overrides = {}) => ({
  subjectSha256: executionSubjectDigest(subject),
  candidateCommit: O,
  candidateTree: O,
  queueRevision: 0,
  controlExecutionExchangeSha256: A,
  invocationRequestSha256: B,
  seenRequestSha256s: [],
  ...overrides,
});

let passed = 0;
const check = (name, fn) => {
  fn();
  passed += 1;
  console.log(`PASS EPC${String(passed).padStart(2, "0")} ${name}`);
};
const outcome = (kind, result = null, candidateCommit = O) => ({ dispatchId: "dispatch", attempt: 0, candidateCommit, kind, evidenceSha256: B, result });

check("publishes exact Draft 2020-12 roots and closes every nested subject/request shape", () => {
  assert.deepEqual(SUBJECT_SCHEMA.required, ["schema", "repository", "baseCommit", "baseTree", "candidateCommit", "candidateTree", "packageId", "dispatchId", "attempt", "queueRevision", "authorityDigests", "writePaths", "resources"]);
  assert.deepEqual(REQUEST_SCHEMA.required, ["schema", "requestId", "subject", "adapter", "locality", "workspace", "network", "mounts", "writePaths", "resources", "sidecars", "credentialLease", "heartbeat", "timeout", "cancellation", "resultDelivery", "frozenBinding", "requestSha256"]);
  for (const schema of [SUBJECT_SCHEMA, REQUEST_SCHEMA, STATE_SCHEMA]) {
    assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
    assert.equal(schema.additionalProperties, false);
  }
  for (const name of ["adapter", "workspace", "network", "mount", "capacityValue", "sidecar", "credentialLease", "heartbeat", "timeout", "cancellation", "resultDelivery", "frozenBinding"]) {
    assert.equal(REQUEST_SCHEMA.$defs[name].additionalProperties, false, name);
    assert.deepEqual(Object.keys(REQUEST_SCHEMA.$defs[name].properties).sort(), [...REQUEST_SCHEMA.$defs[name].required].sort(), name);
  }
  for (const name of ["observation", "result"]) {
    assert.equal(STATE_SCHEMA.$defs[name].additionalProperties, false, name);
    assert.deepEqual(Object.keys(STATE_SCHEMA.$defs[name].properties).sort(), [...STATE_SCHEMA.$defs[name].required].sort(), name);
  }
});

check("keeps execution-subject Schema and runtime admission parallel over the closed corpus", () => {
  const valid = clone(subject);
  const corpus = [
    valid,
    { ...clone(valid), extra: true },
    { ...clone(valid), packageId: "/private/pkg" },
    { ...clone(valid), repository: "foreign" },
    { ...clone(valid), writePaths: ["../escape"] },
    { ...clone(valid), resources: ["cpu", "cpu"] },
    { ...clone(valid), authorityDigests: [{ kind: "spec", sha256: A }, { kind: "spec", sha256: A }] },
  ];
  const expected = [true, false, false, false, false, false, false];
  corpus.forEach((record, index) => {
    const structural = schemaAccepts(record, SUBJECT_SCHEMA);
    const runtime = validateExecutionSubject(record).ok;
    assert.equal(structural && runtime, expected[index], `subject public corpus ${index}`);
    assert.equal(runtime, expected[index], `subject runtime corpus ${index}`);
  });
});

check("keeps request Schema and runtime admission parallel and excludes raw provider/private fields", () => {
  const valid = clone(request);
  const corpus = [
    valid,
    reseal({ ...clone(valid), providerSecret: "secret" }),
    reseal({ ...clone(valid), adapter: { ...clone(valid.adapter), rawEvent: "provider-event" } }),
    reseal({ ...clone(valid), locality: "external-live" }),
    reseal({ ...clone(valid), cancellation: { supported: false, deadlineMs: 1 } }),
    reseal({ ...clone(valid), resources: [{ unit: "cpu", value: null, source: "admission", status: "known" }] }),
    reseal({ ...clone(valid), mounts: [{ sourceClass: "source", targetClass: "target", mode: "read-only", evidenceSha256: A, rawPath: "/private" }] }),
  ];
  const expected = [true, false, false, false, false, false, false];
  corpus.forEach((record, index) => {
    const structural = schemaAccepts(record, REQUEST_SCHEMA);
    const runtime = validateExecutionPlaneRequest(record).ok;
    assert.equal(structural && runtime, expected[index], `request public corpus ${index}`);
    assert.equal(runtime, expected[index], `request runtime corpus ${index}`);
  });
});

check("binds paths, resource units, locality, network and timing without a capability false success", () => {
  const cases = [
    reseal({ ...clone(request), writePaths: ["elsewhere"] }),
    reseal({ ...clone(request), resources: [{ unit: "memory", value: 1, source: "admission", status: "known" }] }),
    reseal({ ...clone(request), resources: [{ unit: "cpu", value: null, source: "admission", status: "unknown" }] }),
    reseal({ ...clone(request), network: { mode: "none", egressClasses: ["internet"] } }),
    reseal({ ...clone(request), locality: "local-isolated", workspace: { ...clone(request.workspace), separation: "not-observed" } }),
    reseal({ ...clone(request), heartbeat: { intervalMs: 10, orphanAfterMs: 10 } }),
    reseal({ ...clone(request), timeout: { absoluteMs: 100, maxPauseMs: 101 } }),
  ];
  for (const record of cases) assert.equal(validateExecutionPlaneRequest(record).ok, false);
  const synthetic = createExecutionPlaneRequest(requestInput({ locality: "external-synthetic" }));
  assert.equal(validateExecutionPlaneRequest(synthetic).ok, true);
});

check("rejects stale, replayed, candidate-drifted and frozen-binding-drifted admission contexts", () => {
  assert.deepEqual(validateExecutionPlaneAdmission(request, admission()), { ok: true, code: null });
  assert.equal(validateExecutionPlaneAdmission(request, admission({ seenRequestSha256s: [request.requestSha256] })).code, "REPLAY:request");
  assert.equal(validateExecutionPlaneAdmission(request, admission({ subjectSha256: C })).code, "STALE:request-subject");
  assert.equal(validateExecutionPlaneAdmission(request, admission({ candidateCommit: "2".repeat(40) })).code, "STALE:request-candidate");
  assert.equal(validateExecutionPlaneAdmission(request, admission({ controlExecutionExchangeSha256: C })).code, "STALE:request-frozen");
});

check("builds a frozen canonical request and detects post-construction digest drift", () => {
  assert.equal(executionSubjectDigest(subject).length, 64);
  assert.equal(validateExecutionPlaneRequest(request).ok, true);
  assert.equal(Object.isFrozen(request), true);
  const drift = clone(request);
  drift.timeout.absoluteMs += 1;
  assert.equal(validateExecutionPlaneRequest(drift).code, "CONFLICT:request-digest");
});

check("keeps the closed full TimedObservation state envelope parallel with runtime admission", () => {
  const created = createExecutionState(subject);
  const admitted = reduceExecutionState(created, outcome("admitted")).state;
  const running = reduceExecutionState(admitted, outcome("running")).state;
  assert.deepEqual(Object.keys(running.observation), ["source", "monotonicMs", "wallTime", "rawSha256", "adapterState", "rawStateSha256"]);
  const corpus = [
    created,
    running,
    { ...clone(running), observation: { ...clone(running.observation), source: undefined } },
    { ...clone(running), observation: { ...clone(running.observation), rawEvent: "provider-private" } },
    { ...clone(running), observation: { ...clone(running.observation), wallTime: "not-a-time" } },
    { ...clone(running), subjectSha256: C },
  ];
  delete corpus[2].observation.source;
  const expected = [true, true, false, false, false, false];
  corpus.forEach((record, index) => {
    const structural = schemaAccepts(record, STATE_SCHEMA);
    const history = index === 1 ? [created, admitted] : undefined;
    const runtime = validateExecutionState(record, history).ok;
    assert.equal(structural && runtime, expected[index], `state public corpus ${index}`);
    assert.equal(runtime, expected[index], `state runtime corpus ${index}`);
  });
});

check("normalizes success as unverified and reserves verified for matching verifier evidence", () => {
  let state = createExecutionState(subject);
  state = reduceExecutionState(state, outcome("admitted")).state;
  state = reduceExecutionState(state, outcome("running")).state;
  const success = reduceExecutionState(state, outcome("success", { resultSha256: A, bytes: 1, status: "delivered" }));
  assert.equal(success.state.state, "succeeded-unverified");
  assert.equal(normalizeSyntheticExecutionOutcome(success.state, outcome("verifierPassed", { resultSha256: B, bytes: 1, status: "delivered" })).code, "AUTHORITY:verifier");
  const verified = reduceExecutionState(success.state, outcome("verifierPassed", { resultSha256: A, bytes: 1, status: "delivered" }));
  assert.equal(verified.state.state, "verified");
});

check("rejects unbound and forged chains, admitting successors only with a complete genesis history", () => {
  const created = createExecutionState(subject);
  const admitted = reduceExecutionState(created, outcome("admitted")).state;
  const running = reduceExecutionState(admitted, outcome("running")).state;
  const forged = { ...clone(running), state: "verified", result: { resultSha256: A, bytes: 1, status: "verified" }, revision: 0, previousSha256: null };
  assert.equal(validateExecutionState(forged).code, "AUTHORITY:state-genesis");
  assert.equal(validateExecutionState(running).code, "UNAVAILABLE:state-predecessor");
  assert.deepEqual(validateExecutionState(running, [created, admitted]), { ok: true, code: null });
  assert.equal(validateExecutionState(running, [admitted]).code, "UNAVAILABLE:state-predecessor");
  const forgedPredecessor = { ...clone(created), state: "admitted", revision: 0 };
  const forgedSuccessor = { ...clone(running), previousSha256: executionSubjectDigest(subject) };
  assert.equal(validateExecutionState(forgedSuccessor, [forgedPredecessor, admitted]).code, "STALE:state-predecessor");
  assert.equal(reduceExecutionState(forgedPredecessor, outcome("running")).code, "AUTHORITY:state-genesis");
  const success = reduceExecutionState(running, outcome("success", { resultSha256: A, bytes: 1, status: "delivered" })).state;
  const verified = reduceExecutionState(success, outcome("verifierPassed", { resultSha256: A, bytes: 1, status: "delivered" })).state;
  assert.deepEqual(validateExecutionState(verified, [created, admitted, running, success]), { ok: true, code: null });
});

check("covers duplicate, out-of-order, stale candidate, failure, timeout, cancellation, lost heartbeat and completed-undelivered without false success", () => {
  const state = createExecutionState(subject);
  assert.equal(normalizeSyntheticExecutionOutcome(state, outcome("duplicate")).code, "REPLAY:duplicate");
  assert.equal(normalizeSyntheticExecutionOutcome(state, outcome("outOfOrder")).code, "STALE:out-of-order");
  assert.equal(normalizeSyntheticExecutionOutcome(state, outcome("running", null, "2".repeat(40))).code, "STALE:outcome");
  const running = reduceExecutionState(reduceExecutionState(state, outcome("admitted")).state, outcome("running")).state;
  assert.equal(reduceExecutionState(running, outcome("failure")).state.state, "failed");
  assert.equal(reduceExecutionState(running, outcome("timeout")).state.state, "timed-out");
  const requested = reduceExecutionState(running, outcome("cancel")).state;
  assert.equal(requested.state, "cancel-requested");
  assert.equal(reduceExecutionState(requested, outcome("cancel")).state.state, "cancelled");
  assert.equal(reduceExecutionState(running, outcome("lostHeartbeat")).state.state, "lost");
  assert.equal(reduceExecutionState(running, outcome("completedUndelivered")).state.state, "completed-undelivered");
});

console.log(`${passed}/10 checks passed.`);
