// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";

import {
  REPRESENTATIVE_STACK_ADAPTERS,
  createStackAdapterEvidence,
  runRepresentativeAdapterConformance,
  validateStackAdapter,
} from "./stack-adapter-contract.mjs";
import { validateSecurityEvidenceV2 } from "./security-evidence-evaluator.mjs";

const candidate = { commit: "a".repeat(40), tree: "b".repeat(40) };
const coverage = {
  subject: "synthetic",
  exclusions: [],
  ignored: [],
  unsupportedScope: [],
  truncation: { truncated: false, scannedFileCount: 1, totalEligibleFileCount: 1 },
  dataAge: { ageSeconds: 0, snapshotAt: null },
};
let pass = 0;
function check(name, fn) {
  fn();
  pass++;
  console.log(`PASS ${name}`);
}

check("seven representative adapters cover every major family cluster", () => {
  assert.equal(REPRESENTATIVE_STACK_ADAPTERS.length, 7);
  assert.equal(new Set(REPRESENTATIVE_STACK_ADAPTERS.map((adapter) => adapter.capability)).size, 7);
  for (const adapter of REPRESENTATIVE_STACK_ADAPTERS) assert.deepEqual(validateStackAdapter(adapter), { ok: true });
});

for (const adapter of REPRESENTATIVE_STACK_ADAPTERS) {
  check(`${adapter.kind} adapter emits schema-valid CYB-2 evidence`, () => {
    const result = createStackAdapterEvidence({
      adapter,
      candidate,
      policyRevision: "policy-v1",
      environment: { platform: "linux", nodeVersion: null },
      result: { status: "PASS", findings: [], coverage, reason: "synthetic-conformance" },
    });
    assert.equal(result.ok, true);
    assert.deepEqual(validateSecurityEvidenceV2(result.evidence), { valid: true });
    assert.equal(result.evidence.capabilities[0].capabilityId, adapter.capability);
  });
}

check("shared conformance suite runs every representative adapter offline", () => {
  const result = runRepresentativeAdapterConformance({ candidate, policyRevision: "policy-v1" });
  assert.equal(result.ok, true);
  assert.equal(result.results.length, 7);
});

check("unsupported platform is typed and never becomes evidence", () => {
  const result = createStackAdapterEvidence({
    adapter: REPRESENTATIVE_STACK_ADAPTERS[0],
    candidate,
    policyRevision: "policy-v1",
    environment: { platform: "unsupported", nodeVersion: null },
    result: { status: "PASS", findings: [], coverage, reason: "synthetic-conformance" },
  });
  assert.deepEqual(result, { ok: false, code: "STACK-ADAPTER-INPUT-INVALID" });
});

check("invalid adapter and malformed evidence are rejected fail closed", () => {
  assert.deepEqual(validateStackAdapter({}), { ok: false, code: "STACK-ADAPTER-INVALID" });
  const result = createStackAdapterEvidence({
    adapter: REPRESENTATIVE_STACK_ADAPTERS[0],
    candidate,
    policyRevision: "policy-v1",
    environment: { platform: "linux", nodeVersion: null },
    result: { status: "PASS", findings: [], coverage: { ...coverage, unexpected: true }, reason: "synthetic-conformance" },
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "STACK-ADAPTER-EVIDENCE-INVALID");
});

console.log(`${pass} stack adapter contract checks passed`);
