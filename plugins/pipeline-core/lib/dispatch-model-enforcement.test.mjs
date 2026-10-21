// SPDX-License-Identifier: SUL-1.0
// D84: a dispatch takes its model from the configured routing, never from inheritance or the Elephant's choice.
import test from "node:test";
import assert from "node:assert/strict";
import { evaluateDispatchModel, dispatchModelRefusalText, dispatchModelWarningText } from "./dispatch-model-enforcement.mjs";

const claudeSelectors = {
  implement: "sonnet", mechanic: "haiku", deep: "sonnet", test_author: "opus",
  critic_normal: "opus", critic_high_risk: "opus", readiness: "sonnet", advisory: "opus", read: "haiku",
};
const states = { mechanic: "opt-in", deep: "opt-in", read: "opt-in" };
const routes = (overrides = {}) => ({
  ok: true,
  taskRoutes: Object.entries({ ...claudeSelectors, ...overrides }).map(([duty, value]) => ({
    taskRoute: `duty.${duty}`, runner: "claude", state: states[duty] ?? "default", selector: { kind: "alias", value },
  })).concat([{ taskRoute: "duty.implement", runner: "codex", state: "default", selector: { kind: "model-id", value: "gpt-6-luna" } }]),
});

test("DME01 a dispatch without a model parameter is refused with the configured selectors and a runnable repair", () => {
  const result = evaluateDispatchModel({ runner: "claude", subagentType: "general-purpose", model: undefined, routeSource: routes() });
  assert.equal(result.ok, false);
  assert.equal(result.findings[0].code, "DISPATCH-MODEL-MISSING");
  assert.match(result.findings[0].message, /sonnet/u);
  assert.match(result.findings[0].message, /model/u);
  assert.match(dispatchModelRefusalText(result), /pass the tool-layer `model` parameter/iu);
});

test("DME02 an empty or non-string model counts as missing", () => {
  for (const model of ["", "   ", null, 5]) {
    const result = evaluateDispatchModel({ runner: "claude", subagentType: "general-purpose", model, routeSource: routes() });
    assert.equal(result.findings[0].code, "DISPATCH-MODEL-MISSING", String(model));
  }
});

test("DME03 a generic agent type accepts any configured, available Claude selector", () => {
  for (const model of ["sonnet", "haiku", "opus", "Sonnet"]) {
    assert.equal(evaluateDispatchModel({ runner: "claude", subagentType: "general-purpose", model, routeSource: routes() }).ok, true, model);
  }
});

test("DME04 a model that no configured route names is refused as unrouted", () => {
  const result = evaluateDispatchModel({ runner: "claude", subagentType: "general-purpose", model: "fable", routeSource: routes() });
  assert.equal(result.ok, false);
  assert.equal(result.findings[0].code, "DISPATCH-MODEL-UNROUTED");
  assert.match(result.findings[0].message, /sonnet.*haiku.*opus|haiku.*opus.*sonnet|opus.*sonnet.*haiku/su);
});

test("DME05 a pipeline-core agent type is bound to its duty's selector", () => {
  const ok = evaluateDispatchModel({ runner: "claude", subagentType: "pipeline-core:goldfish-implementor", model: "sonnet", routeSource: routes() });
  assert.equal(ok.ok, true);
  // A configured but different selector is the MP-05/MP-07 escalation shape: it warns, it does not refuse.
  const bad = evaluateDispatchModel({ runner: "claude", subagentType: "pipeline-core:goldfish-implementor", model: "opus", routeSource: routes() });
  assert.equal(bad.ok, true);
  assert.equal(bad.warnings[0].code, "DISPATCH-MODEL-DUTY-MISMATCH");
  assert.match(bad.warnings[0].message, /duty\.implement/u);
  assert.match(bad.warnings[0].message, /"sonnet"/u);
  assert.match(dispatchModelWarningText(bad), /^WARNING \(guard-dispatch\)/u);
  // A model no route selects still refuses, for a duty-bound agent type too.
  const unrouted = evaluateDispatchModel({ runner: "claude", subagentType: "pipeline-core:goldfish-implementor", model: "fable", routeSource: routes() });
  assert.equal(unrouted.findings[0].code, "DISPATCH-MODEL-UNROUTED");
  const critic = evaluateDispatchModel({ runner: "claude", subagentType: "pipeline-core:critic", model: "opus", routeSource: routes() });
  assert.equal(critic.ok, true);
  const mechanic = evaluateDispatchModel({ runner: "claude", subagentType: "pipeline-core:goldfish-mechanic", model: "haiku", routeSource: routes() });
  assert.equal(mechanic.ok, true);
});

test("DME06 an unavailable route is never an accepted selector", () => {
  const source = routes();
  source.taskRoutes = source.taskRoutes.map((route) => route.taskRoute === "duty.read" && route.runner === "claude" ? { ...route, state: "unavailable" } : route);
  const result = evaluateDispatchModel({ runner: "claude", subagentType: "general-purpose", model: "haiku", routeSource: source });
  // haiku is still configured for the opt-in mechanic duty, so the generic type may name it
  assert.equal(result.ok, true);
  const noHaiku = routes({ mechanic: "sonnet", read: "sonnet" });
  noHaiku.taskRoutes = noHaiku.taskRoutes.map((route) => route.taskRoute === "duty.read" ? { ...route, state: "unavailable" } : route);
  assert.equal(evaluateDispatchModel({ runner: "claude", subagentType: "general-purpose", model: "haiku", routeSource: noHaiku }).findings[0].code, "DISPATCH-MODEL-UNROUTED");
});

test("DME07 an unreadable route source yields no opinion, never a refusal that cannot be repaired", () => {
  const result = evaluateDispatchModel({ runner: "claude", subagentType: "general-purpose", model: undefined, routeSource: { ok: false, code: "MODEL-ROLE-ROUTE-SOURCE-INVALID" } });
  assert.equal(result.ok, true);
  assert.equal(result.skipped, "route-source-unavailable");
});

test("DME08 a runner without a tool-layer model parameter is not judged", () => {
  const result = evaluateDispatchModel({ runner: "codex", subagentType: "default", model: undefined, routeSource: routes() });
  assert.equal(result.ok, true);
  assert.equal(result.skipped, "runner-not-enforced");
});

test("DME09 a model id selector matches only exactly", () => {
  const source = { ok: true, taskRoutes: [{ taskRoute: "duty.implement", runner: "claude", state: "default", selector: { kind: "model-id", value: "claude-sonnet-5-5" } }] };
  assert.equal(evaluateDispatchModel({ runner: "claude", subagentType: "general-purpose", model: "claude-sonnet-5-5", routeSource: source }).ok, true);
  assert.equal(evaluateDispatchModel({ runner: "claude", subagentType: "general-purpose", model: "claude-sonnet-5", routeSource: source }).findings[0].code, "DISPATCH-MODEL-UNROUTED");
});
