// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

import { clearGateEstimateForMutation, deriveNextGate, prepareGateEstimateMutation, projectGateEstimate, readGateEstimateEvidence, validateGateEstimateEvidence } from "./gate-estimate.mjs";

let passed = 0;
function check(name, fn) { fn(); passed += 1; process.stdout.write(`PASS GE${String(passed).padStart(2, "0")} ${name}\n`); }
const FEATURE = "batman";
const OID = "a".repeat(40);
function evidence() {
  return { schema: "pipeline.gate-estimate-evidence.v1", featureId: FEATURE, gate: "security", observedAt: "2026-07-18T12:00:00.000Z", basis: [
    { kind: "completed-contracts", reference: "specs/result.md", digest: "b".repeat(64) },
    { kind: "verify-run", reference: "evidence/verify.json", digest: "c".repeat(64) },
  ], note: "Two bounded contracts remain." };
}
function record(path, digest, overrides = {}) {
  return { schema: "pipeline.gate-estimate.v1", id: "batman-security-1", featureId: FEATURE, gate: "security", objectFormat: "sha1", sourceOid: OID,
    evidence: { path, sha256: digest }, rangeMinutes: { min: 20, max: 45 }, recordedBy: "coordinator", recordedAt: "2026-07-18T12:01:00.000Z", ...overrides };
}

check("derives only the frozen next-gate phase map", () => {
  assert.equal(deriveNextGate("design"), "prd"); assert.equal(deriveNextGate("implementation"), "security");
  assert.equal(deriveNextGate("security-scan"), "merge"); assert.equal(deriveNextGate("ui-design"), "merge"); assert.equal(deriveNextGate("close"), null);
});
check("accepts nonempty sorted unique evidence and rejects duplicates/order drift", () => {
  assert.equal(validateGateEstimateEvidence(evidence(), FEATURE, "security").ok, true);
  const duplicate = evidence(); duplicate.basis.push({ ...duplicate.basis[0] });
  assert.equal(validateGateEstimateEvidence(duplicate, FEATURE, "security").code, "GE-EVIDENCE-ORDER");
  const unsorted = evidence(); unsorted.basis.reverse(); assert.equal(validateGateEstimateEvidence(unsorted, FEATURE, "security").code, "GE-EVIDENCE-ORDER");
});
check("reads only a bounded regular in-repository evidence file", () => {
  const root = mkdtempSync(join(tmpdir(), "gate-evidence-"));
  try {
    mkdirSync(join(root, "evidence")); const bytes = `${JSON.stringify(evidence())}\n`; writeFileSync(join(root, "evidence", "eta.json"), bytes);
    const result = readGateEstimateEvidence(root, "evidence/eta.json"); assert.equal(result.ok, true); assert.equal(result.sha256, createHash("sha256").update(bytes).digest("hex"));
    symlinkSync(join(root, "evidence", "eta.json"), join(root, "evidence", "alias.json")); assert.equal(readGateEstimateEvidence(root, "evidence/alias.json").code, "GE-EVIDENCE-SYMLINK");
    assert.equal(readGateEstimateEvidence(root, "../outside.json").code, "GE-EVIDENCE-PATH");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
check("projects a range only when phase, feature, source and raw evidence all match", () => {
  const bytes = Buffer.from(`${JSON.stringify(evidence())}\n`); const digest = createHash("sha256").update(bytes).digest("hex"); const path = "evidence/eta.json";
  const context = { activeFeature: { id: FEATURE, phase: "implementation" }, observation: { ok: true, objectFormat: "sha1", sourceOid: OID }, evidence: { ok: true, path, sha256: digest, bytes, value: evidence() } };
  const known = projectGateEstimate(record(path, digest), context); assert.equal(known.state, "known"); assert.deepEqual(known.rangeMinutes, { min: 20, max: 45 });
  assert.equal(projectGateEstimate(record(path, digest), { ...context, observation: { ok: true, objectFormat: "sha1", sourceOid: "d".repeat(40) } }).state, "unknown");
  assert.equal(projectGateEstimate(record(path, digest), { ...context, activeFeature: { id: FEATURE, phase: "design" } }).state, "unknown");
  assert.equal(projectGateEstimate(record(path, digest), { ...context, evidence: { ...context.evidence, sha256: "e".repeat(64) } }).state, "unknown");
});
check("rejects range, attribution and schema overclaims", () => {
  const context = { activeFeature: { id: FEATURE, phase: "implementation" }, observation: { ok: true, objectFormat: "sha1", sourceOid: OID }, evidence: { ok: true, path: "evidence/eta.json", sha256: "f".repeat(64), value: evidence() } };
  assert.equal(projectGateEstimate(record("evidence/eta.json", "f".repeat(64), { rangeMinutes: { min: 1, max: 10081 } }), context).state, "unknown");
  assert.equal(projectGateEstimate(record("evidence/eta.json", "f".repeat(64), { recordedBy: "po" }), context).state, "unknown");
});
check("prepares CAS-bound writer input, preserves idempotent time and clears on later mutation", () => {
  const value = evidence(); const bytes = Buffer.from(`${JSON.stringify(value)}\n`); const digest = createHash("sha256").update(bytes).digest("hex");
  const context = { observation: { ok: true, objectFormat: "sha1", sourceOid: OID }, evidence: { ok: true, path: "evidence/eta.json", sha256: digest, value } };
  const state = { schema: "pipeline.state.v0", activeFeature: { id: FEATURE, phase: "implementation", planPath: "specs/prd.md" } };
  const request = { id: "estimate-1", expectedCurrentId: "absent", featureId: FEATURE, gate: "security", objectFormat: "sha1", sourceOid: OID, evidencePath: "evidence/eta.json", evidenceSha256: digest, rangeMinutes: { min: 20, max: 45 }, recordedBy: "coordinator" };
  const prepared = prepareGateEstimateMutation(state, request, { ...context, now: new Date("2026-07-18T12:00:00.000Z") }); assert.equal(prepared.code, "PS-GATE-ESTIMATE-PREPARED");
  const retry = prepareGateEstimateMutation(prepared.state, { ...request, expectedCurrentId: "estimate-1" }, { ...context, now: new Date("2026-07-18T13:00:00.000Z") });
  assert.equal(retry.code, "PS-GATE-ESTIMATE-IDEMPOTENT"); assert.equal(retry.zeroWrite, true); assert.equal(retry.state.gateEstimate.recordedAt, "2026-07-18T12:00:00.000Z");
  assert.equal(clearGateEstimateForMutation(prepared.state).gateEstimate, undefined);
  assert.equal(prepareGateEstimateMutation(state, { ...request, expectedCurrentId: "other" }, context).code, "PS-GATE-ESTIMATE-CAS");
});
check("refuses to overwrite a malformed persisted estimate", () => {
  const value = evidence(); const bytes = Buffer.from(`${JSON.stringify(value)}\n`); const digest = createHash("sha256").update(bytes).digest("hex");
  const context = { observation: { ok: true, objectFormat: "sha1", sourceOid: OID }, evidence: { ok: true, path: "evidence/eta.json", sha256: digest, value } };
  const state = { schema: "pipeline.state.v0", activeFeature: { id: FEATURE, phase: "implementation", planPath: "specs/prd.md" }, gateEstimate: { id: "unclosed" } };
  const request = { id: "estimate-1", expectedCurrentId: "absent", featureId: FEATURE, gate: "security", objectFormat: "sha1", sourceOid: OID, evidencePath: "evidence/eta.json", evidenceSha256: digest, rangeMinutes: { min: 20, max: 45 }, recordedBy: "coordinator" };
  assert.equal(prepareGateEstimateMutation(state, request, context).code, "PS-GATE-ESTIMATE-EXISTING");
});
process.stdout.write(`${passed}/7 checks passed.\n`);
