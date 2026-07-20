#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { reconcileMainSessionRoute } from "./main-session-route.mjs";

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
    modelId: "gpt-5.6-terra",
    effort: "xhigh",
    ...overrides,
  };
}

const cases = [
  ["the phase profile is the desired main-session authority", () => {
    const result = reconcileMainSessionRoute({ ...route, observed: observed() });
    assert.equal(result.code, "MSR-ALIGNED");
    assert.deepEqual(result.desired, {
      runner: "codex", selector: { kind: "model-id", value: "gpt-5.6-terra" }, effort: "xhigh",
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
    assert.equal(result.desired.selector.value, "gpt-5.6-terra");
  }],
];

let passed = 0;
for (const [name, run] of cases) {
  try { run(); passed += 1; console.log(`PASS ${name}`); }
  catch (error) { console.error(`FAIL ${name} -- ${error.message}`); }
}
console.log(`\n${passed}/${cases.length} cases passed.`);
process.exit(passed === cases.length ? 0 : 1);
