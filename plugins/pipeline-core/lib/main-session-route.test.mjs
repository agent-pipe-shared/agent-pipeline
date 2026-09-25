#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { reconcileMainSessionRoute } from "./main-session-route.mjs";
import { resolveModelRoleSession } from "./model-role-session.mjs";

const route = {
  profile: "feature",
  phase: "execution_phase",
  runner: "codex",
};

function observed(overrides = {}) {
  return {
    subject: "main-session",
    source: "host-introspection",
    eventId: "main-session-route-01",
    runner: "codex",
    modelId: "gpt-6-sol",
    effort: "medium",
    ...overrides,
  };
}

function functionalRoute(runner, role, effort, modelId) {
  const sessionId = `session-${runner}`;
  const resolved = resolveModelRoleSession({
    runner, role, effort, sessionId, candidateCommit: "a".repeat(40),
    observedAt: "2026-09-25T12:00:00.000Z", availableModelIds: [modelId],
    policy: { schema: "pipeline.model-role-policy.v1", runner, role,
      approved: [{ modelId, rank: 1, efforts: [effort], compatibilityEvidenceSha256: "b".repeat(64) }] },
  });
  assert.equal(resolved.ok, true);
  return {
    registry: { profiles: { feature: { execution_phase: { [runner]: {
      selector: { kind: "functional-role", value: role }, effort,
    } } } } },
    receipt: resolved.receipt,
    observation: observed({ runner, modelId, effort, sessionId }),
  };
}

const cases = [
  ["the phase profile is the desired main-session authority", () => {
    const result = reconcileMainSessionRoute({ ...route, observed: observed() });
    assert.equal(result.code, "MSR-ALIGNED");
    assert.deepEqual(result.desired, {
      runner: "codex", selector: { kind: "model-id", value: "gpt-6-sol" }, effort: "medium",
    });
    assert.equal(result.action, null);
  }],
  ["a host-attested main-session drift requests a visible switch and never switches automatically", () => {
    const result = reconcileMainSessionRoute({ ...route, observed: observed({ modelId: "gpt-5.6-sol", effort: "high" }) });
    assert.equal(result.code, "MSR-DRIFT-RETURN-REQUESTED");
    assert.equal(result.action.kind, "request-main-session-route-change");
    assert.equal(result.action.automatic, false);
    assert.deepEqual(result.action.target, result.desired);
  }],
  ["the same durable drift event is rendered only once", () => {
    const result = reconcileMainSessionRoute({
      ...route,
      observed: observed({ modelId: "gpt-5.6-sol" }),
      reportedEventIds: ["main-session-route-01"],
    });
    assert.equal(result.code, "MSR-DRIFT-ALREADY-REPORTED");
    assert.equal(result.action, null);
  }],
  ["subagent observations cannot attest the main session", () => {
    const result = reconcileMainSessionRoute({
      ...route,
      observed: observed({ subject: "subagent", modelId: "gpt-5.6-sol" }),
    });
    assert.equal(result.code, "MSR-UNVERIFIED");
    assert.equal(result.observed, null);
  }],
  ["a missing host observation remains honestly unverified", () => {
    const result = reconcileMainSessionRoute({ ...route, observed: null });
    assert.equal(result.code, "MSR-UNVERIFIED");
    assert.equal(result.action, null);
  }],
  ["a bounded PO exception is visible and never rewritten as the registered route", () => {
    const result = reconcileMainSessionRoute({
      ...route,
      observed: observed({ modelId: "gpt-5.6-sol", effort: "high" }),
      poException: {
        authority: "po",
        id: "po-route-exception-01",
        runner: "codex",
        modelId: "gpt-5.6-sol",
        effort: "high",
      },
    });
    assert.equal(result.code, "MSR-PO-EXCEPTION");
    assert.equal(result.action, null);
    assert.equal(result.desired.selector.value, "gpt-6-sol");
  }],
  ["Claude, Codex and Antigravity functional routes resolve only from their host-held session receipt", () => {
    for (const [runner, role, effort, modelId] of [
      ["claude", "frontier", "high", "claude-current"],
      ["codex", "worker", "medium", "gpt-current"],
      ["antigravity", "efficient", "low", "gemini-current"],
    ]) {
      const { registry, receipt, observation } = functionalRoute(runner, role, effort, modelId);
      const result = reconcileMainSessionRoute({ ...route, runner, observed: observation, registry,
        hostHeldModelRoleReceipt: receipt });
      assert.equal(result.code, "MSR-ALIGNED");
      assert.deepEqual(result.desired, { runner, selector: { kind: "model-id", value: modelId }, effort });
    }
  }],
  ["a functional route without its host-held receipt remains unverified", () => {
    const { registry, observation } = functionalRoute("codex", "worker", "medium", "gpt-current");
    const result = reconcileMainSessionRoute({ ...route, observed: observation, registry });
    assert.equal(result.code, "MSR-UNVERIFIED");
    assert.equal(result.reasonCode, "MSR-MODEL-ROLE-RECEIPT-UNAVAILABLE");
    assert.deepEqual(result.desired.selector, { kind: "functional-role", value: "worker" });
  }],
  ["a forged or cross-session role receipt cannot align the main session", () => {
    const { registry, receipt, observation } = functionalRoute("codex", "worker", "medium", "gpt-current");
    for (const changed of [
      { ...receipt, modelId: "forged" },
      receipt,
    ]) {
      const observedValue = changed === receipt ? { ...observation, sessionId: "other-session" } : observation;
      const result = reconcileMainSessionRoute({ ...route, observed: observedValue, registry,
        hostHeldModelRoleReceipt: changed });
      assert.equal(result.code, "MSR-UNVERIFIED");
      assert.equal(result.reasonCode, "MSR-MODEL-ROLE-RECEIPT-UNAVAILABLE");
    }
    const malformed = reconcileMainSessionRoute({ ...route, observed: { ...observation, sessionId: 123 }, registry,
      hostHeldModelRoleReceipt: receipt });
    assert.equal(malformed.code, "MSR-UNVERIFIED");
    assert.equal(malformed.reasonCode, "MSR-HOST-OBSERVATION-UNAVAILABLE");
  }],
  ["a host-observed functional-role drift requests the exact resolved model without changing it", () => {
    const { registry, receipt, observation } = functionalRoute("codex", "worker", "medium", "gpt-current");
    const result = reconcileMainSessionRoute({ ...route, observed: { ...observation, modelId: "gpt-other" }, registry,
      hostHeldModelRoleReceipt: receipt });
    assert.equal(result.code, "MSR-DRIFT-RETURN-REQUESTED");
    assert.deepEqual(result.action.target.selector, { kind: "model-id", value: "gpt-current" });
    assert.equal(result.action.automatic, false);
  }],
  ["a role receipt cannot override a legacy exact-ID V3 route", () => {
    const { receipt } = functionalRoute("codex", "worker", "medium", "gpt-current");
    const result = reconcileMainSessionRoute({ ...route, observed: observed({ sessionId: receipt.sessionId }),
      hostHeldModelRoleReceipt: receipt });
    assert.equal(result.code, "MSR-ALIGNED");
    assert.deepEqual(result.desired.selector, { kind: "model-id", value: "gpt-6-sol" });
  }],
];

let passed = 0;
for (const [name, run] of cases) {
  try { run(); passed += 1; console.log(`PASS ${name}`); }
  catch (error) { console.error(`FAIL ${name} -- ${error.message}`); }
}
console.log(`\n${passed}/${cases.length} cases passed.`);
process.exit(passed === cases.length ? 0 : 1);
