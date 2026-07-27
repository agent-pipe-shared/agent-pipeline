#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * Nova A2 contract for a pure capability-report module.
 *
 * Frozen exports: RUNNER_CAPABILITY_REPORT_SCHEMA,
 * sealRunnerCapabilityReport(draft), runnerCapabilityReportDigest(record),
 * validateRunnerCapabilityReport(record), effectiveConcurrentTasks(capacity).
 * Validators return { ok, code }; a failed code begins with a §7.2 prefix.
 */

import assert from "node:assert/strict";

import {
  RUNNER_CAPABILITY_REPORT_SCHEMA,
  effectiveConcurrentTasks,
  runnerCapabilityReportDigest,
  sealRunnerCapabilityReport,
  validateRunnerCapabilityReport,
} from "./runner-capability-report.mjs";

const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);
const D = "d".repeat(64);
const COMMIT = "1".repeat(40);
const TREE = "2".repeat(40);
const PREFIX = /^(?:SHAPE|SCHEMA|BOUND|AUTHORITY|CAS|STALE|REPLAY|CONFLICT|UNAVAILABLE|DURABILITY|READBACK|INTERNAL):/u;

let passed = 0;
const failures = [];
function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
    console.error(`FAIL ${name} -- ${error.message}`);
  }
}
const clone = (value) => JSON.parse(JSON.stringify(value));
function valid(record) {
  assert.deepEqual(validateRunnerCapabilityReport(record), { ok: true, code: null });
}
function invalid(record, prefix = PREFIX) {
  const result = validateRunnerCapabilityReport(record);
  assert.equal(result.ok, false);
  assert.match(result.code, prefix);
}
function evidence(kind, sha256) {
  return { kind, path: null, fileSha256: sha256, recordSha256: null };
}

function draft() {
  return {
    schema: RUNNER_CAPABILITY_REPORT_SCHEMA,
    reportId: "nova-a2-codex-conformance-01",
    identity: {
      adapterId: "codex-host-adapter", adapterVersion: "1.0.0", implementationSha256: A,
      requestedRunner: "codex", requestedModel: "gpt-5.6-terra",
      observedRunner: "codex", observedModel: "gpt-5.6-terra",
    },
    environment: { platformClass: "linux", architectureClass: "x64", hostClass: "developer-host", fingerprintSha256: B },
    // Canonical order is lexical (unit, source); every (unit, source) pair is unique.
    capacity: [
      { unit: "concurrent-tasks", value: 4, source: "advertised", status: "known" },
      { unit: "concurrent-tasks", value: 2, source: "certified", status: "known" },
      { unit: "concurrent-tasks", value: 2, source: "effective", status: "known" },
      { unit: "concurrent-tasks", value: 2, source: "observed", status: "known" },
      { unit: "concurrent-tasks", value: 1, source: "reserved", status: "known" },
      { unit: "cpu-millicores", value: 16000, source: "advertised", status: "known" },
    ],
    cells: [
      { capabilityId: "claude-native-review", mode: "native", status: "certified", evidence: [evidence("host-receipt", C)] },
      { capabilityId: "codex-native-readonly", mode: "native", status: "observed", evidence: [evidence("host-receipt", D)] },
      { capabilityId: "synthetic-contract", mode: "synthetic", status: "certified", evidence: [evidence("fixture", A)] },
      { capabilityId: "unsupported-live-worker", mode: "unsupported", status: "unsupported", evidence: [] },
    ],
    assurance: {
      workspace: { status: "observed", evidenceSha256: A },
      process: { status: "not-observed", evidenceSha256: null },
      filesystem: { status: "observed", evidenceSha256: B },
      network: { status: "unavailable", evidenceSha256: C },
      os: { status: "not-observed", evidenceSha256: null },
    },
    bindings: {
      suiteVersion: "nova-a2-suite-v1", candidate: { commit: COMMIT, tree: TREE },
      authorityDigests: [{ kind: "nova-spec", sha256: D }], rawEvidenceSha256: [A, B, C, D],
    },
  };
}

const report = sealRunnerCapabilityReport(draft());

check("A2R01 seals the exact v1 root and verifies its canonical semantic digest", () => {
  assert.equal(RUNNER_CAPABILITY_REPORT_SCHEMA, "pipeline.runner-capability-report.v1");
  assert.deepEqual(Object.keys(report).sort(), ["assurance", "bindings", "capacity", "cells", "environment", "identity", "recordSha256", "reportId", "schema"].sort());
  assert.match(report.recordSha256, /^[0-9a-f]{64}$/u);
  assert.equal(runnerCapabilityReportDigest(report), report.recordSha256);
  valid(report);
});

for (const field of Object.keys(report)) {
  check(`A2R02 omitting root ${field} fails closed`, () => {
    const value = clone(report);
    delete value[field];
    invalid(value, /^(?:SHAPE|SCHEMA):/u);
  });
}

check("A2R03 root and nested shapes reject extras, including private-host coordinates", () => {
  invalid({ ...clone(report), unexpected: true }, /^SHAPE:/u);
  const value = clone(report);
  value.identity.rawEnvironment = { HOME: "/home/private-user" };
  invalid(value, /^SHAPE:/u);
});

check("A2R04 the required synthetic, Claude, Codex and unsupported matrix is non-empty", () => {
  for (const capabilityId of ["synthetic-contract", "claude-native-review", "codex-native-readonly", "unsupported-live-worker"]) {
    const value = clone(report);
    value.cells = value.cells.filter((cell) => cell.capabilityId !== capabilityId);
    value.recordSha256 = runnerCapabilityReportDigest(value);
    invalid(value, /^BOUND:/u);
  }
});

check("A2R05 sorted unique capacity/cell/evidence sets and declared bounds are mandatory", () => {
  const unsorted = clone(report);
  [unsorted.capacity[0], unsorted.capacity[1]] = [unsorted.capacity[1], unsorted.capacity[0]];
  unsorted.recordSha256 = runnerCapabilityReportDigest(unsorted);
  invalid(unsorted, /^BOUND:/u);
  const duplicate = clone(report);
  duplicate.cells.splice(1, 0, clone(duplicate.cells[0]));
  duplicate.recordSha256 = runnerCapabilityReportDigest(duplicate);
  invalid(duplicate, /^BOUND:/u);
});

check("A2R06 capacity keeps typed units separate and computes task concurrency only from concurrent-tasks", () => {
  assert.equal(effectiveConcurrentTasks(report.capacity), 2);
  const value = clone(report.capacity);
  value.find((entry) => entry.unit === "cpu-millicores").value = 1;
  assert.equal(effectiveConcurrentTasks(value), 2, "cpu millicores cannot lower a task-concurrency minimum");
  const unknown = clone(report.capacity).map((entry) => entry.unit === "concurrent-tasks" && entry.source === "effective"
    ? { ...entry, status: "unknown", value: null } : entry);
  assert.equal(effectiveConcurrentTasks(unknown), null, "unknown effective task capacity stays unknown");
});

check("A2R07 a runner self-report is input only and never certifies a cell", () => {
  const value = clone(report);
  value.cells[1] = { ...value.cells[1], status: "certified", evidence: [evidence("runner-self-report", A)] };
  value.recordSha256 = runnerCapabilityReportDigest(value);
  invalid(value, /^AUTHORITY:/u);
});

check("A2R08 requested and independently observed identity remain distinct; not-observed is honest", () => {
  const value = clone(report);
  value.identity.observedRunner = "not-observed";
  value.identity.observedModel = "not-observed";
  value.recordSha256 = runnerCapabilityReportDigest(value);
  valid(value);
  value.identity.observedModel = "gpt-5.6-terra";
  value.recordSha256 = runnerCapabilityReportDigest(value);
  invalid(value, /^BOUND:/u);
});

check("A2R09 candidate/authority/raw-evidence binding is covered by the own semantic digest", () => {
  for (const mutate of [
    (value) => { value.bindings.candidate.commit = "f".repeat(40); },
    (value) => { value.bindings.authorityDigests[0].sha256 = A; },
    (value) => { value.bindings.rawEvidenceSha256 = [D, C, B, A]; },
    (value) => { value.recordSha256 = A; },
  ]) {
    const value = clone(report);
    mutate(value);
    invalid(value);
  }
});

console.log(`\nrunner-capability-report: ${passed}/${passed + failures.length} checks passed.`);
if (failures.length) {
  for (const failure of failures) console.error(failure);
  process.exitCode = 1;
}
