#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import test from "node:test";

import { ADVISORY_FABLE_ATTEMPTS, coordinateAdvisory } from "./advisory-coordinator.mjs";
import { validateAdvisoryReceipt } from "./advisory-receipt.mjs";

const DISPATCH = Object.freeze({
  dispatchId: "advisory-dispatch-01",
  queueRevision: 3,
  candidateCommit: "a".repeat(40),
  candidateTree: "b".repeat(40),
});

function identity(provider, modelId, effort = "not-applicable") {
  return { provider, modelId, effort };
}

function options(overrides = {}) {
  return {
    now: () => 1_784_355_600_000,
    makeReceiptId: () => "advisory-receipt-01",
    advisorExport: { consent: "approved" },
    invokeNative: async () => ({ status: "answered", answer: "native answer", identity: identity("anthropic", "claude-fable") }),
    invokeConsult: async () => ({ status: "answered", answer: "consult answer", identity: identity("openai", "gpt-5.6-sol", "max") }),
    ...overrides,
  };
}

test("Codex host-consult is deferred to the host flow without adapter or receipt", async () => {
  let calls = 0;
  const result = await coordinateAdvisory({ profile: "epic", runner: "codex", question: "Host?", dispatch: DISPATCH }, options({
    invokeNative: async () => { calls += 1; },
    invokeConsult: async () => { calls += 1; },
  }));
  assert.equal(result.ok, false);
  assert.equal(result.code, "host_route_required");
  assert.equal(result.status, "deferred");
  assert.equal(result.receipt, null);
  assert.deepEqual(result.attempts, []);
  assert.equal(calls, 0);
});

test("only an explicit declined advisor export consent disables advisory before dispatch", async () => {
  for (const advisorExport of [{ consent: "declined" }]) {
    let calls = 0;
    const result = await coordinateAdvisory({ profile: "epic", runner: "codex", question: "Must this stay local?", dispatch: DISPATCH }, options({
      advisorExport,
      invokeNative: async () => { calls += 1; },
      invokeConsult: async () => { calls += 1; },
    }));
    assert.equal(result.ok, false);
    assert.equal(result.code, "advisory_disabled_no_consent");
    assert.equal(result.receipt, null);
    assert.deepEqual(result.attempts, []);
    assert.equal(calls, 0);
  }
});

test("Claude retries Fable, then uses explicit same-runner Opus and records the fallback", async () => {
  const calls = [];
  const result = await coordinateAdvisory({ profile: "feature", runner: "claude", question: "Is option A coherent?", dispatch: DISPATCH }, options({
    invokeNative: async (call) => {
      calls.push(call);
      if (call.adapter === "native-fable") return { status: "unavailable" };
      return { status: "answered", answer: "yes", identity: identity("anthropic", "claude-opus") };
    },
  }));

  assert.equal(result.ok, true);
  assert.equal(calls.length, ADVISORY_FABLE_ATTEMPTS + 1);
  assert.deepEqual(calls.map(({ adapter, runner, attempt }) => ({ adapter, runner, attempt })), [
    { adapter: "native-fable", runner: "claude", attempt: 1 },
    { adapter: "native-fable", runner: "claude", attempt: 2 },
    { adapter: "native-opus", runner: "claude", attempt: 1 },
  ]);
  assert.equal(result.receipt.configuredRoute.runner, "claude");
  assert.equal(result.receipt.configuredRoute.selector.value, "opus");
  assert.equal(result.receipt.fallback.reason, "native-unavailable");
  assert.deepEqual(validateAdvisoryReceipt(result.receipt), { ok: true });
});

test("Claude falls through failed native adapters only to a fresh read-only Claude consult", async () => {
  const consultCalls = [];
  const result = await coordinateAdvisory({ profile: "epic", runner: "claude", question: "What is the least risky cutover?", dispatch: DISPATCH }, options({
    invokeNative: async () => ({ status: "timed-out" }),
    invokeConsult: async (call) => {
      consultCalls.push(call);
      return { status: "answered", answer: "shadow first", identity: identity("anthropic", "claude-fable", "max") };
    },
  }));

  assert.equal(result.ok, true);
  assert.equal(consultCalls.length, 1);
  assert.equal(consultCalls[0].runner, "claude");
  assert.equal(consultCalls[0].model, "fable");
  assert.equal(consultCalls[0].effort, "max");
  assert.equal(consultCalls[0].freshContext, true);
  assert.deepEqual(consultCalls[0].tools, ["Read", "Grep", "Glob"]);
  assert.equal(result.receipt.adapter, "consult");
  assert.equal(result.receipt.configuredRoute.runner, "claude");
  assert.equal(result.receipt.fallback.reason, "native-timeout");
});

test("mini and malformed batched questions fail before an adapter is called", async () => {
  let calls = 0;
  const opts = options({
    invokeNative: async () => { calls += 1; },
    invokeConsult: async () => { calls += 1; },
  });
  const mini = await coordinateAdvisory({ profile: "mini", runner: "codex", question: "Advise?", dispatch: DISPATCH }, opts);
  const batched = await coordinateAdvisory({ profile: "epic", runner: "codex", question: ["A?", "B?"], dispatch: DISPATCH }, opts);
  assert.equal(mini.code, "advisory_disabled");
  assert.equal(batched.code, "invalid_question");
  assert.equal(calls, 0);
});

test("any registry route mutation, including a runner switch, is rejected before dispatch", async () => {
  const registry = (await import("./runner-profiles-v3.mjs")).loadRunnerProfilesV3Registry();
  registry.duties.advisory.claude.fallbacks[0].runner = "codex";
  let calls = 0;
  const result = await coordinateAdvisory({ profile: "epic", runner: "claude", question: "Switch?", dispatch: DISPATCH }, options({
    registry,
    invokeNative: async () => { calls += 1; },
    invokeConsult: async () => { calls += 1; },
  }));
  assert.equal(result.code, "route_contract_invalid");
  assert.equal(calls, 0);
});
