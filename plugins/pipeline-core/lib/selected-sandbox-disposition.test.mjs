#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * Nova A2 contract for the pure selected-sandbox reducer.
 *
 * Frozen exports: SELECTED_SANDBOX_DISPOSITION_SCHEMA,
 * createSelectedSandboxDisposition(input), selectedSandboxDispositionDigest(record),
 * validateSelectedSandboxDisposition(record), reduceSelectedSandboxDisposition(record, event).
 * Reducer results are { ok, code, disposition, launch }; launch is true only for a new child attempt.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import {
  SELECTED_SANDBOX_DISPOSITION_SCHEMA,
  canonicalJson,
  createSelectedSandboxDisposition,
  reduceSelectedSandboxDisposition,
  selectedSandboxDispositionDigest,
  validateSelectedSandboxDisposition,
} from "./selected-sandbox-disposition.mjs";

const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);
const D = "d".repeat(64);
const PREFIX = /^(?:SHAPE|SCHEMA|BOUND|AUTHORITY|CAS|STALE|REPLAY|CONFLICT|UNAVAILABLE|DURABILITY|READBACK|INTERNAL):/u;

let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed += 1; console.log(`PASS ${name}`); }
  catch (error) { failures.push(`${name}: ${error.message}`); console.error(`FAIL ${name} -- ${error.message}`); }
}
const clone = (value) => JSON.parse(JSON.stringify(value));
function valid(record) { assert.deepEqual(validateSelectedSandboxDisposition(record), { ok: true, code: null }); }
function rejected(result, prefix = PREFIX) { assert.equal(result.ok, false); assert.match(result.code, prefix); assert.equal(result.launch, false); }

function fingerprint(overrides = {}) {
  return {
    runnerSha256: A, hostBootSha256: B, platformClass: "linux", architectureClass: "x64",
    sandboxSha256: C, profileSha256: D, policySha256: A, duty: "readiness", contractVersion: "nova-a2-v1", ...overrides,
  };
}
function input(overrides = {}) {
  return {
    dispositionId: "nova-a2-sandbox-01", duty: "readiness", transport: "selected-network-open-read-only-v1",
    fingerprint: fingerprint(), assurance: { requested: "selected-sandbox", observed: "not-observed", evidenceSha256: null },
    nowMonotonicMs: 1_000, ...overrides,
  };
}
function start(attemptId = "attempt-01", index = 0, nowMonotonicMs = 1_000) {
  return { kind: "probe-start", attempt: { attemptId, index, startedMonotonicMs: nowMonotonicMs }, challenge: { nonceSha256: C, bits: 256 } };
}
function fingerprintSha256(value = fingerprint()) {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}
function childReceipt(overrides = {}) {
  return {
    childIdSha256: D, attemptId: "attempt-01", nonceSha256: C, duty: "readiness",
    transport: "selected-network-open-read-only-v1", subjectSha256: fingerprintSha256(),
    assurance: "sandbox-read-only-except-coordinator-scratch-network-open", resultSha256: D, terminal: true, ...overrides,
  };
}
function reduce(record, event) { return reduceSelectedSandboxDisposition(record, event); }
function success(receipt = childReceipt(), observationReceiptSha256 = D) {
  return { kind: "probe-success", selectedChildIdSha256: D, childReceipt: receipt, observationReceiptSha256 };
}

const created = createSelectedSandboxDisposition(input());

check("A2S01 creates a sealed, exact unprobed v1 record with canonical digest", () => {
  assert.equal(SELECTED_SANDBOX_DISPOSITION_SCHEMA, "pipeline.selected-sandbox-disposition.v1");
  assert.deepEqual(Object.keys(created).sort(), ["assurance", "attempt", "challenge", "childReceipt", "dispositionId", "duty", "expiry", "failure", "fingerprint", "forceReprobe", "previousSha256", "recordSha256", "schema", "state", "transport"].sort());
  assert.equal(created.failure, null);
  assert.equal(created.forceReprobe, null);
  assert.equal(created.state, "unprobed");
  assert.equal(selectedSandboxDispositionDigest(created), created.recordSha256);
  valid(created);
});

check("A2S02 root/nested closed shapes and privacy-safe identity are enforced", () => {
  const extra = clone(created); extra.fingerprint.homePath = "/home/private-user";
  assert.equal(validateSelectedSandboxDisposition(extra).ok, false);
  const privateChild = clone(created); privateChild.childReceipt = { user: "private-user" };
  assert.equal(validateSelectedSandboxDisposition(privateChild).ok, false);
  const unexpectedObservation = clone(created); unexpectedObservation.observationReceiptSha256 = A;
  assert.equal(validateSelectedSandboxDisposition(unexpectedObservation).ok, false);
});

check("A2S03 exactly one probe launches for a fingerprint; concurrent callers join it", () => {
  const first = reduce(created, start());
  assert.equal(first.ok, true); assert.equal(first.launch, true); assert.equal(first.disposition.state, "probing");
  const joined = reduce(first.disposition, start());
  assert.equal(joined.ok, true); assert.equal(joined.launch, false); assert.deepEqual(joined.disposition, first.disposition);
});

check("A2S04 available-attested requires the parent 256-bit challenge and exact child/attempt/nonce/duty/transport/subject/result bindings", () => {
  const probing = reduce(created, start()).disposition;
  const attested = reduce(probing, success());
  assert.equal(attested.ok, true); assert.equal(attested.launch, false); assert.equal(attested.disposition.state, "available-attested"); valid(attested.disposition);
  for (const [field, value] of [["childIdSha256", A], ["attemptId", "attempt-other"], ["nonceSha256", A], ["duty", "critic"], ["transport", "fallback"], ["subjectSha256", B], ["resultSha256", C]]) {
    const receipt = childReceipt({ [field]: value });
    rejected(reduce(probing, success(receipt)), /^(?:AUTHORITY|CONFLICT|SHAPE):/u);
  }
  const wrongProfile = fingerprint({ profileSha256: B });
  rejected(reduce(probing, success(childReceipt({ subjectSha256: fingerprintSha256(wrongProfile) }))), /^AUTHORITY:/u);
  const wrongFingerprint = fingerprint({ hostBootSha256: C });
  rejected(reduce(probing, success(childReceipt({ subjectSha256: fingerprintSha256(wrongFingerprint) }))), /^AUTHORITY:/u);
  rejected(reduce(probing, success(childReceipt({ resultSha256: A }), B)), /^AUTHORITY:/u);
});

check("A2S05 CAS health, fallback and a self-asserted runner cannot become attested", () => {
  const probing = reduce(created, start()).disposition;
  for (const receipt of [
    { kind: "cas-health", status: "ready" },
    { ...childReceipt(), transport: "fallback-transport" },
    { ...childReceipt(), childIdSha256: null, runnerName: "codex" },
  ]) rejected(reduce(probing, success(receipt)));
});

check("A2S06 transient retry is unavailable before and eligible at exactly 300000 monotonic ms", () => {
  const probing = reduce(created, start()).disposition;
  const transient = reduce(probing, { kind: "probe-failure", failure: "transient-unavailable", observationReceiptSha256: D, nowMonotonicMs: 2_000 });
  assert.equal(transient.ok, true); assert.equal(transient.disposition.state, "transient-unavailable");
  assert.deepEqual(transient.disposition.failure, { class: "transient-unavailable", observationReceiptSha256: D });
  assert.deepEqual(transient.disposition.attempt, probing.attempt);
  assert.equal(transient.disposition.challenge, null);
  rejected(reduce(transient.disposition, start("attempt-02", 1, 301_999)), /^UNAVAILABLE:/u);
  const retry = reduce(transient.disposition, start("attempt-02", 1, 302_000));
  assert.equal(retry.ok, true); assert.equal(retry.launch, true); assert.equal(retry.disposition.state, "probing");
});

check("A2S07 terminal suppression blocks unchanged inputs; only explicit force-reprobe authority creates a new attempt", () => {
  const probing = reduce(created, start()).disposition;
  const terminal = reduce(probing, { kind: "probe-failure", failure: "terminal-unavailable", observationReceiptSha256: D, nowMonotonicMs: 2_000 }).disposition;
  assert.deepEqual(terminal.attempt, probing.attempt);
  assert.equal(terminal.challenge, null);
  const suppressed = reduce(terminal, start("attempt-02", 1, 999_999));
  rejected(suppressed, /^UNAVAILABLE:/u);
  const authority = {
    kind: "po-force-reprobe", decisionId: "nova-a2-force-01",
    receiptPath: "specs/sprint-nova-epic/evidence/nova-a/force-reprobe-01.json", receiptSha256: C,
  };
  rejected(reduce(terminal, {
    kind: "force-reprobe", authority,
    attempt: { attemptId: "attempt-01", index: 1, startedMonotonicMs: 3_000 }, challenge: { nonceSha256: B, bits: 256 },
  }), /^BOUND:/u);
  rejected(reduce(terminal, {
    kind: "force-reprobe", authority,
    attempt: { attemptId: "attempt-02", index: 0, startedMonotonicMs: 3_000 }, challenge: { nonceSha256: B, bits: 256 },
  }), /^BOUND:/u);
  const force = reduce(terminal, {
    kind: "force-reprobe", authority,
    attempt: { attemptId: "attempt-02", index: 1, startedMonotonicMs: 3_000 }, challenge: { nonceSha256: B, bits: 256 },
  });
  assert.equal(force.ok, true); assert.equal(force.launch, true); assert.equal(force.disposition.state, "probing");
  assert.equal(force.disposition.attempt.attemptId, "attempt-02");
  assert.deepEqual(force.disposition.forceReprobe, {
    kind: "po-force-reprobe", decisionId: "nova-a2-force-01",
    receiptPath: "specs/sprint-nova-epic/evidence/nova-a/force-reprobe-01.json", receiptSha256: C,
  });
  const drift = reduce(force.disposition, { kind: "fingerprint-drift", fingerprint: fingerprint({ profileSha256: B }) });
  assert.equal(drift.ok, true);
  assert.equal(drift.disposition.forceReprobe, null);
});

check("A2S08 fingerprint/session drift invalidates attestation before any new probe", () => {
  const probing = reduce(created, start()).disposition;
  const attested = reduce(probing, success()).disposition;
  const drift = reduce(attested, { kind: "fingerprint-drift", fingerprint: fingerprint({ hostBootSha256: C }) });
  assert.equal(drift.ok, true); assert.equal(drift.launch, false); assert.equal(drift.disposition.state, "invalidated");
  const next = reduce(drift.disposition, start("attempt-02", 1, 4_000));
  assert.equal(next.ok, true); assert.equal(next.launch, true); assert.equal(next.disposition.fingerprint.hostBootSha256, C);
});

check("A2S09 identical fingerprint drift cannot bypass terminal suppression", () => {
  const probing = reduce(created, start()).disposition;
  const terminal = reduce(probing, { kind: "probe-failure", failure: "terminal-unavailable", observationReceiptSha256: D, nowMonotonicMs: 2_000 }).disposition;
  rejected(reduce(terminal, { kind: "fingerprint-drift", fingerprint: fingerprint() }), /^REPLAY:/u);
  const changed = reduce(terminal, { kind: "fingerprint-drift", fingerprint: fingerprint({ hostBootSha256: C }) });
  assert.equal(changed.ok, true); assert.equal(changed.disposition.state, "invalidated");
});

check("A2S10 semantic record chains bind the exact prior digest and fail closed on replay/digest drift", () => {
  const probing = reduce(created, start()).disposition;
  assert.equal(probing.previousSha256, created.recordSha256);
  const corrupt = clone(probing); corrupt.previousSha256 = A;
  assert.equal(validateSelectedSandboxDisposition(corrupt).ok, false);
  const replay = reduce(probing, success());
  assert.equal(replay.ok, true);
  rejected(reduce(replay.disposition, success()), /^(?:REPLAY|CONFLICT|UNAVAILABLE):/u);
});

check("A2S11 the published 2020-12 schema closes every selected-sandbox nested record", () => {
  const schema = JSON.parse(readFileSync(new URL("../scripts/selected-sandbox-disposition.schema.json", import.meta.url), "utf8"));
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.required, ["schema", "dispositionId", "duty", "transport", "fingerprint", "state", "failure", "attempt", "challenge", "childReceipt", "expiry", "forceReprobe", "assurance", "previousSha256", "recordSha256"]);
  for (const name of ["fingerprint", "failure", "attempt", "challenge", "childReceipt", "expiry", "authority", "assurance"]) {
    assert.equal(schema.$defs[name].additionalProperties, false, `${name} must reject additional properties`);
    assert.deepEqual(Object.keys(schema.$defs[name].properties).sort(), [...schema.$defs[name].required].sort());
  }
  assert.equal(schema.$defs.challenge.properties.bits.const, 256);
  assert.deepEqual(schema.$defs.childReceipt.properties.terminal, { const: true });
});

console.log(`\nselected-sandbox-disposition: ${passed}/${passed + failures.length} checks passed.`);
if (failures.length) {
  for (const failure of failures) console.error(failure);
  process.exitCode = 1;
}
