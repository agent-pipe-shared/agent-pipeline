// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import {
  REPRESENTATIVE_STACK_ADAPTERS,
  createStackAdapterEvidence,
  executeStackAdapterConformance,
  runRepresentativeAdapterConformance,
  validateStackAdapter,
} from "./stack-adapter-contract.mjs";
import { buildStackCapabilityPlan, STACK_CAPABILITIES } from "./stack-capability-plan.mjs";
import { createDynamicTargetAuthorization } from "./stack-dynamic-boundary.mjs";
import { validateSecurityEvidenceV2 } from "./security-evidence-evaluator.mjs";

const candidate = { commit: "a".repeat(40), tree: "b".repeat(40) };
const observations = [];
const discovery = { ok: true, schema: "pipeline.stack-discovery.v1", candidate, observations, digest: createHash("sha256").update(JSON.stringify({ candidate, observations })).digest("hex") };
const threatModel = { candidate, digest: "d".repeat(64) };
const plan = buildStackCapabilityPlan({ candidate, discovery, policyRevision: "policy-v1", threatModel, observations: STACK_CAPABILITIES.map((capability) => ({ capability, present: true })), requirements: [] });
function authorization(id) { const target = { id, environment: "test", bindingSha256: "c".repeat(64) }; const scope = { id: "scope", paths: ["fixtures"] }; const receipt = createDynamicTargetAuthorization({ candidate, target, scope, execution: { network: "offline", credential: "none", timeoutMs: 1000 } }).receipt; return { candidate, target, scope, receipt }; }
const authorizations = { "cap.dast": authorization("dast-target"), "cap.fuzz": authorization("fuzz-target") };
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
    const execution = executeStackAdapterConformance({ adapter, plan, environment: { platform: "linux", nodeVersion: null }, authorization: adapter.dynamic ? authorizations[adapter.capability] : null });
    const result = createStackAdapterEvidence({
      adapter,
      plan,
      environment: { platform: "linux", nodeVersion: null },
      execution: execution.execution,
      authorization: adapter.dynamic ? authorizations[adapter.capability] : null,
    });
    assert.equal(result.ok, true);
    assert.deepEqual(validateSecurityEvidenceV2(result.evidence), { valid: true });
    assert.equal(result.evidence.capabilities[0].capabilityId, adapter.capability);
  });
}

check("shared conformance suite runs every representative adapter offline", () => {
  const result = runRepresentativeAdapterConformance({ plan, authorizations });
  assert.equal(result.ok, true);
  assert.equal(result.results.length, 7);
});

check("declared platform matrix is offline synthetic evidence, not a claim of native host execution", () => {
  for (const platform of ["linux", "darwin", "win32"]) {
    const result = runRepresentativeAdapterConformance({ plan, platform, authorizations });
    assert.equal(result.ok, true, platform);
    assert.equal(result.results.every((entry) => entry.evidence.environment.platform === platform), true, platform);
  }
});

check("unsupported platform is typed and never becomes evidence", () => {
  const execution = executeStackAdapterConformance({ adapter: REPRESENTATIVE_STACK_ADAPTERS[0], plan, environment: { platform: "linux", nodeVersion: null }, authorization: null });
  const result = createStackAdapterEvidence({
    adapter: REPRESENTATIVE_STACK_ADAPTERS[0],
    plan,
    environment: { platform: "unsupported", nodeVersion: null },
    execution: execution.execution,
    authorization: null,
  });
  assert.deepEqual(result, { ok: false, code: "STACK-ADAPTER-INPUT-INVALID" });
});

check("dynamic and fuzz adapters cannot report conformance without an offline authorization", () => {
  const fuzz = REPRESENTATIVE_STACK_ADAPTERS.find((adapter) => adapter.kind === "fuzz");
  assert.equal(executeStackAdapterConformance({ adapter: fuzz, plan, environment: { platform: "linux", nodeVersion: null }, authorization: null }).code, "STACK-ADAPTER-VERIFICATION-REQUIRED");
  assert.equal(runRepresentativeAdapterConformance({ plan }).ok, false);
});

check("a required unsupported capability cannot be hidden by successful selected adapters", () => {
  const unavailablePlan = buildStackCapabilityPlan({ candidate, discovery, policyRevision: "policy-v1", threatModel, observations: STACK_CAPABILITIES.map((capability) => ({ capability, present: capability !== "cap.dast" })), requirements: [{ capability: "cap.dast", required: true }] });
  assert.deepEqual(runRepresentativeAdapterConformance({ plan: unavailablePlan, authorizations }), { ok: false, code: "STACK-ADAPTER-REQUIRED-UNAVAILABLE", unavailable: ["cap.dast"] });
});

check("invalid adapter and malformed evidence are rejected fail closed", () => {
  assert.deepEqual(validateStackAdapter({}), { ok: false, code: "STACK-ADAPTER-INVALID" });
  const execution = executeStackAdapterConformance({ adapter: REPRESENTATIVE_STACK_ADAPTERS[0], plan, environment: { platform: "linux", nodeVersion: null }, authorization: null });
  const result = createStackAdapterEvidence({
    adapter: REPRESENTATIVE_STACK_ADAPTERS[0],
    plan,
    environment: { platform: "linux", nodeVersion: null },
    execution: { ...execution.execution, coverage: { ...coverage, unexpected: true } },
    authorization: null,
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "STACK-ADAPTER-EXECUTION-INVALID");
});

console.log(`${pass} stack adapter contract checks passed`);
