#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import test from "node:test";

import { advisorySessionRoleSelectionSha256, createAdvisoryDemand } from "./advisory-lifecycle-v2.mjs";
import { ADVISORY_NATIVE_ATTEMPTS, coordinateAdvisory } from "./advisory-coordinator.mjs";
import { validateAdvisoryReceipt } from "./advisory-receipt.mjs";

const DISPATCH = Object.freeze({
  dispatchId: "advisory-dispatch-01",
  queueRevision: 3,
  candidateCommit: "a".repeat(40),
  candidateTree: "b".repeat(40),
});
function claudeFallbackSelection(overrides = {}) {
  const selection = {
    runner: "claude", taskRoute: "duty.advisory.fallback", role: "frontier",
    effort: "max", modelId: "claude-frontier-reviewed", sessionId: "claude-session-01",
    readbackSha256: "1".repeat(64), receiptSha256: "2".repeat(64),
    ...overrides,
  };
  return { ...selection, selectionSha256: advisorySessionRoleSelectionSha256(selection) };
}

function identity(provider, modelId, effort = "not-applicable") {
  return { provider, modelId, effort };
}

function request(overrides = {}) {
  const value = {
    profile: "epic",
    runner: "codex",
    question: "Which concrete choice is safer?",
    dispatch: DISPATCH,
    ...overrides,
  };
  if (value.demand === undefined && typeof value.question === "string") {
    value.demand = createAdvisoryDemand({
      runner: value.runner,
      profile: value.profile,
      reason: "risk-review",
      question: value.question,
      evidenceSha256: "e".repeat(64),
      dispatch: value.dispatch,
    }).demand;
  }
  return value;
}

function options(overrides = {}) {
  return {
    now: () => 1_784_355_600_000,
    makeReceiptId: () => "advisory-receipt-01",
    advisorExport: { consent: "approved" },
    invokeNative: async () => ({ status: "answered", answer: "native answer", identity: identity("anthropic", "claude-opus") }),
    invokeConsult: async () => ({ status: "answered", answer: "consult answer", identity: identity("openai", "gpt-5.6-sol", "max") }),
    ...overrides,
  };
}

test("Codex host-consult is deferred to the host flow without adapter or receipt", async () => {
  let calls = 0;
  const result = await coordinateAdvisory(request({ question: "Host?" }), options({
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
    const result = await coordinateAdvisory(request({ question: "Must this stay local?" }), options({
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

test("Claude retries native Opus, then uses same-runner Opus consult and records the fallback", async () => {
  const nativeCalls = [];
  const consultCalls = [];
  const result = await coordinateAdvisory(request({ profile: "feature", runner: "claude", question: "Is option A coherent?" }), options({
    invokeNative: async (call) => {
      nativeCalls.push(call);
      return { status: "unavailable" };
    },
    invokeConsult: async (call) => {
      consultCalls.push(call);
      return { status: "answered", answer: "yes", identity: identity("anthropic", "claude-opus", "max") };
    },
  }));

  assert.equal(result.ok, true);
  assert.equal(nativeCalls.length, ADVISORY_NATIVE_ATTEMPTS);
  assert.deepEqual(nativeCalls.map(({ adapter, runner, attempt }) => ({ adapter, runner, attempt })), [
    { adapter: "native-opus", runner: "claude", attempt: 1 },
    { adapter: "native-opus", runner: "claude", attempt: 2 },
  ]);
  assert.equal(consultCalls.length, 1);
  assert.equal(consultCalls[0].model, "opus");
  assert.equal(result.receipt.configuredRoute.runner, "claude");
  assert.equal(result.receipt.configuredRoute.selector.value, "opus");
  assert.equal(result.receipt.fallback.reason, "native-unavailable");
  assert.deepEqual(validateAdvisoryReceipt(result.receipt), { ok: true });
});

test("Claude falls through failed native adapters only to a fresh read-only Claude consult", async () => {
  const consultCalls = [];
  const result = await coordinateAdvisory(request({ runner: "claude", question: "What is the least risky cutover?" }), options({
    invokeNative: async () => ({ status: "timed-out" }),
    invokeConsult: async (call) => {
      consultCalls.push(call);
      return { status: "answered", answer: "shadow first", identity: identity("anthropic", "claude-opus", "max") };
    },
  }));

  assert.equal(result.ok, true);
  assert.equal(consultCalls.length, 1);
  assert.equal(consultCalls[0].runner, "claude");
  assert.equal(consultCalls[0].model, "opus");
  assert.equal(consultCalls[0].effort, "max");
  assert.equal(consultCalls[0].freshContext, true);
  assert.deepEqual(consultCalls[0].tools, ["Read", "Grep", "Glob"]);
  assert.equal(result.receipt.adapter, "consult");
  assert.equal(result.receipt.configuredRoute.runner, "claude");
  assert.equal(result.receipt.fallback.reason, "native-timeout");
});

test("Claude uses the digest-bound session Frontier only for consult fallback", async () => {
  const nativeCalls = [];
  const consultCalls = [];
  const selection = claudeFallbackSelection();
  const selectedRequest = request({ runner: "claude", question: "Use the admitted fallback?" });
  selectedRequest.demand = createAdvisoryDemand({
    runner: "claude", profile: selectedRequest.profile, reason: "risk-review",
    question: selectedRequest.question, evidenceSha256: "e".repeat(64),
    dispatch: selectedRequest.dispatch, sessionRoleSelection: selection,
  }).demand;
  const result = await coordinateAdvisory(selectedRequest, options({
    claudeFallbackSelection: selection,
    invokeNative: async (call) => { nativeCalls.push(call); return { status: "unavailable" }; },
    invokeConsult: async (call) => {
      consultCalls.push(call);
      return { status: "answered", answer: "Use the admitted Frontier.",
        identity: identity("anthropic", selection.modelId, "max") };
    },
  }));
  assert.equal(result.ok, true);
  assert.equal(nativeCalls.length, ADVISORY_NATIVE_ATTEMPTS);
  assert.equal(nativeCalls.every((call) => call.selector.value === "opus"
    && call.effort === "not-applicable"), true, "the selected fallback must never remap the native route");
  assert.equal(consultCalls.length, 1);
  assert.equal(consultCalls[0].model, selection.modelId);
  assert.equal(consultCalls[0].effort, "max");
  assert.equal(result.receipt.configuredRoute.selector.kind, "model-id");
  assert.equal(result.receipt.configuredRoute.selector.value, selection.modelId);
  assert.equal(result.receipt.configuredRoute.sessionRoleBindingSha256, selection.selectionSha256);
  assert.equal(Object.hasOwn(result.receipt.configuredRoute, "sessionId"), false);
  assert.deepEqual(validateAdvisoryReceipt(result.receipt), { ok: true });
});

test("invalid optional Claude session selection falls back to the registered V3 consult cell", async () => {
  const invalid = claudeFallbackSelection({ role: "worker" });
  let consultCall;
  const result = await coordinateAdvisory(request({ runner: "claude", question: "Keep V3 available?" }), options({
    claudeFallbackSelection: invalid,
    invokeNative: async () => ({ status: "failed" }),
    invokeConsult: async (call) => {
      consultCall = call;
      return { status: "answered", answer: "Yes.", identity: identity("anthropic", "claude-opus", "max") };
    },
  }));
  assert.equal(result.ok, true);
  assert.equal(consultCall.model, "opus");
  assert.deepEqual(result.receipt.configuredRoute.selector, { kind: "alias", value: "opus" });
  assert.equal(Object.hasOwn(result.receipt.configuredRoute, "sessionRoleBindingSha256"), false);
});

test("a session-bound Claude demand rejects a different host readback before any adapter", async () => {
  const selection = claudeFallbackSelection();
  const selectedRequest = request({ runner: "claude", question: "Bind this fallback exactly?" });
  selectedRequest.demand = createAdvisoryDemand({
    runner: "claude", profile: selectedRequest.profile, reason: "risk-review",
    question: selectedRequest.question, evidenceSha256: "e".repeat(64),
    dispatch: selectedRequest.dispatch, sessionRoleSelection: selection,
  }).demand;
  let calls = 0;
  const result = await coordinateAdvisory(selectedRequest, options({
    claudeFallbackSelection: claudeFallbackSelection({ modelId: "another-admitted-model" }),
    invokeNative: async () => { calls += 1; return { status: "unavailable" }; },
    invokeConsult: async () => { calls += 1; return { status: "answered" }; },
  }));
  assert.equal(result.code, "advisory_demand_binding_mismatch");
  assert.equal(result.receipt, null);
  assert.equal(calls, 0);
});

test("mini and malformed batched questions fail before an adapter is called", async () => {
  let calls = 0;
  const opts = options({
    invokeNative: async () => { calls += 1; },
    invokeConsult: async () => { calls += 1; },
  });
  const mini = await coordinateAdvisory(request({ profile: "mini", question: "Advise?" }), opts);
  const batched = await coordinateAdvisory(request({ question: ["A?", "B?"] }), opts);
  assert.equal(mini.code, "advisory_disabled");
  assert.equal(batched.code, "invalid_question");
  assert.equal(calls, 0);
});

test("any registry route mutation, including a runner switch, is rejected before dispatch", async () => {
  const registry = (await import("./runner-profiles-v3.mjs")).loadRunnerProfilesV3Registry();
  registry.duties.advisory.claude.fallbacks[0].runner = "codex";
  let calls = 0;
  const result = await coordinateAdvisory(request({ runner: "claude", question: "Switch?" }), options({
    registry,
    invokeNative: async () => { calls += 1; },
    invokeConsult: async () => { calls += 1; },
  }));
  assert.equal(result.code, "route_contract_invalid");
  assert.equal(calls, 0);
});

test("missing, lifecycle-only, stale and already-used demand never invokes an adapter", async () => {
  let calls = 0;
  const invoke = async () => { calls += 1; return { status: "answered" }; };
  const missing = request({ runner: "claude", demand: null });
  assert.equal((await coordinateAdvisory(missing, options({ invokeNative: invoke, invokeConsult: invoke }))).code, "advisory_demand_required");
  const stale = request({ runner: "claude", question: "Bound question" });
  stale.question = "Changed question";
  assert.equal((await coordinateAdvisory(stale, options({ invokeNative: invoke, invokeConsult: invoke }))).code, "advisory_demand_binding_mismatch");
  const first = request({ runner: "claude", question: "Do not repeat this?" });
  const completed = await coordinateAdvisory(first, options());
  const repeated = await coordinateAdvisory({ ...first, priorConsultation: completed.consultationRecord }, options({
    invokeNative: invoke,
    invokeConsult: invoke,
  }));
  assert.equal(repeated.code, "advisory_reused_no_repeat");
  assert.equal(repeated.answer, null);
  assert.equal(calls, 0);
});
