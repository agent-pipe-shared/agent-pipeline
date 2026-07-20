#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

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

function identity(provider, modelId) {
  return { provider, modelId, effort: "not-applicable" };
}

function options(overrides = {}) {
  return {
    now: () => 1_784_355_600_000,
    makeReceiptId: () => "advisory-receipt-01",
    advisorExport: { consent: "approved" },
    invokeNative: async () => ({ status: "answered", answer: "native answer", identity: identity("anthropic", "claude-fable") }),
    invokeConsult: async () => ({ status: "answered", answer: "consult answer", identity: identity("openai", "gpt-5.6-sol") }),
    ...overrides,
  };
}

test("missing or declined advisor export consent disables advisory before dispatch", async () => {
  for (const advisorExport of [null, { consent: "declined" }]) {
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

test("Codex uses Sol consult-primary with fresh hard-read-only one-question context", async () => {
  const calls = [];
  const result = await coordinateAdvisory({ profile: "epic", runner: "codex", question: "Which boundary is safest?", dispatch: DISPATCH }, options({
    invokeNative: async () => { throw new Error("native Codex advisory must not run"); },
    invokeConsult: async (call) => {
      calls.push(call);
      return { status: "answered", answer: "keep the boundary", identity: identity("openai", "gpt-5.6-sol") };
    },
  }));

  assert.equal(result.ok, true);
  assert.equal(result.answer, "keep the boundary");
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    role: "consult-advisor",
    subagentType: "consult-advisor",
    runner: "codex",
    model: "gpt-5.6-sol",
    selector: { kind: "model-id", value: "gpt-5.6-sol" },
    effort: "not-applicable",
    question: "Which boundary is safest?",
    dispatch: DISPATCH,
    oneQuestion: true,
    freshContext: true,
    contextPolicy: "fresh-no-handover-no-chat-history-no-implementor-rationale",
    tools: ["Read", "Grep", "Glob"],
    memory: false,
    autoApply: false,
  });
  assert.equal(result.receipt.adapter, "consult");
  assert.equal(result.receipt.fallback.reason, "none");
  assert.deepEqual(validateAdvisoryReceipt(result.receipt), { ok: true });
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
      return { status: "answered", answer: "shadow first", identity: identity("anthropic", "claude-fable") };
    },
  }));

  assert.equal(result.ok, true);
  assert.equal(consultCalls.length, 1);
  assert.equal(consultCalls[0].runner, "claude");
  assert.equal(consultCalls[0].model, "fable");
  assert.equal(consultCalls[0].freshContext, true);
  assert.deepEqual(consultCalls[0].tools, ["Read", "Grep", "Glob"]);
  assert.equal(result.receipt.adapter, "consult");
  assert.equal(result.receipt.configuredRoute.runner, "claude");
  assert.equal(result.receipt.fallback.reason, "native-timeout");
});

test("receipt persists only content digests while the runtime answer remains separate", async () => {
  const question = "Should raw context be retained?";
  const answer = "No raw content in receipts.";
  const result = await coordinateAdvisory({ profile: "epic", runner: "codex", question, dispatch: DISPATCH }, options({
    invokeConsult: async () => ({ status: "answered", answer, identity: identity("openai", "gpt-5.6-sol") }),
  }));
  const serialized = JSON.stringify(result.receipt);
  assert.equal(serialized.includes(question), false);
  assert.equal(serialized.includes(answer), false);
  assert.equal(result.answer, answer);
  assert.match(result.receipt.questionSha256, /^[a-f0-9]{64}$/);
  assert.match(result.receipt.answerSha256, /^[a-f0-9]{64}$/);
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

test("wrong-provider identity and adapter exceptions fail closed with sanitized receipts", async () => {
  const drift = await coordinateAdvisory({ profile: "epic", runner: "codex", question: "Can the runner drift?", dispatch: DISPATCH }, options({
    invokeConsult: async () => ({ status: "answered", answer: "wrong runner", identity: identity("anthropic", "claude-fable") }),
  }));
  assert.equal(drift.ok, false);
  assert.equal(drift.code, "adapter_protocol");
  assert.equal(drift.receipt.observed.status, "failed");
  assert.equal(drift.receipt.observed.identity, null);
  assert.equal(drift.receipt.answerSha256, null);
  assert.equal(drift.receipt.fallback.redactedErrorClass, "failure");

  const thrown = await coordinateAdvisory({ profile: "epic", runner: "codex", question: "Will errors leak?", dispatch: DISPATCH }, options({
    invokeConsult: async () => { const error = new Error("secret=do-not-persist"); error.code = "ETIMEDOUT"; throw error; },
  }));
  assert.equal(thrown.ok, false);
  assert.equal(thrown.receipt.observed.status, "timed-out");
  assert.equal(JSON.stringify(thrown.receipt).includes("do-not-persist"), false);
  assert.deepEqual(validateAdvisoryReceipt(thrown.receipt), { ok: true });
});

test("same-provider model drift fails closed against the configured route", async () => {
  const drift = await coordinateAdvisory({ profile: "epic", runner: "codex", question: "Can the model drift?", dispatch: DISPATCH }, options({
    invokeConsult: async () => ({ status: "answered", answer: "wrong model", identity: identity("openai", "gpt-5.6-terra") }),
  }));
  assert.equal(drift.ok, false);
  assert.equal(drift.code, "adapter_protocol");
  assert.equal(drift.receipt.observed.identity, null);
  assert.equal(drift.receipt.answerSha256, null);
});

test("observed effort drift fails closed against the configured route", async () => {
  const drift = await coordinateAdvisory({ profile: "feature", runner: "codex", question: "Can effort drift?", dispatch: DISPATCH }, options({
    invokeConsult: async () => ({ status: "answered", answer: "wrong effort", identity: { provider: "openai", modelId: "gpt-5.6-sol", effort: "max" } }),
  }));
  assert.equal(drift.ok, false);
  assert.equal(drift.code, "adapter_protocol");
  assert.equal(drift.receipt.observed.identity, null);
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

test("Codex forwards the exact selector-bound request without changing its Sol route", async () => {
  const calls = [];
  const sandbox = {
    selectionId: "css_aaaaaaaaaaaaaaaaaaaaaaaaae",
    selectionSha256: "c".repeat(64),
    requestSha256: "d".repeat(64),
    assurance: {
      class: "sandbox-read-only-except-coordinator-scratch-network-open",
      literal: "sandbox-read-only-except-coordinator-scratch; input/network isolation not asserted",
    },
  };
  const result = await coordinateAdvisory({
    profile: "feature", runner: "codex", question: "Does the transport preserve routing?", dispatch: DISPATCH, sandbox,
  }, options({
    invokeConsult: async (call) => {
      calls.push(call);
      return { status: "answered", answer: "yes", identity: identity("openai", "gpt-5.6-sol") };
    },
  }));

  assert.equal(result.ok, true);
  assert.deepEqual(calls[0].sandbox, sandbox);
  assert.deepEqual(calls[0].tools, ["Read", "Grep", "Glob", "Bash"]);
  assert.equal(calls[0].model, "gpt-5.6-sol");
  assert.equal(calls[0].runner, "codex");
});
