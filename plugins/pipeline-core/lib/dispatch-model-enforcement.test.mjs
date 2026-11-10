// SPDX-License-Identifier: SUL-1.0
// D84: a dispatch takes its model from the configured routing, never from inheritance or the Elephant's choice.
import test from "node:test";
import assert from "node:assert/strict";
import { configuredRecordRoute, evaluateDispatchModel, dispatchModelRefusalText, dispatchModelWarningText } from "./dispatch-model-enforcement.mjs";
import { registeredFunctionalTaskRoutes } from "./model-role-route-source.mjs";

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

// G20-70 (Claude greenfield 2026-11-08): a Critic dispatch without a model was told "implementation work uses duty.implement".
test("DME02b a missing model names the dispatched agent type's own duty selector, not the implementation default", () => {
  const critic = evaluateDispatchModel({ runner: "claude", subagentType: "pipeline-core:critic", model: undefined, routeSource: routes() });
  assert.equal(critic.findings[0].code, "DISPATCH-MODEL-MISSING");
  assert.match(critic.findings[0].message, /pipeline-core:critic serves duty\.critic_normal = "opus" \/ duty\.critic_high_risk = "opus"/u);
  assert.doesNotMatch(critic.findings[0].message, /implementation work uses/u);
  assert.match(critic.findings[0].message, /Batch scope \(MP-07\):.*critical architecture or security.*DISPATCH-OPUS-NO-BATCH-RATIONALE/u);
  const sonnetCritic = evaluateDispatchModel({ runner: "claude", subagentType: "pipeline-core:critic", model: undefined,
    routeSource: routes({ critic_normal: "sonnet", critic_high_risk: "sonnet" }) });
  assert.doesNotMatch(sonnetCritic.findings[0].message, /MP-07/u);
  const mechanic = evaluateDispatchModel({ runner: "claude", subagentType: "pipeline-core:goldfish-mechanic", model: undefined, routeSource: routes() });
  assert.match(mechanic.findings[0].message, /pipeline-core:goldfish-mechanic serves duty\.mechanic = "haiku"/u);
  const generic = evaluateDispatchModel({ runner: "claude", subagentType: "general-purpose", model: undefined, routeSource: routes() });
  assert.match(generic.findings[0].message, /implementation work uses duty\.implement = "sonnet"/u);
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

test("DME10 Antigravity requires an explicit native Model enum on each entry", () => {
  for (const model of [undefined, "", "inherit", "unknown", "Flash"]) {
    const result = evaluateDispatchModel({ runner: "antigravity", subagentType: "goldfish-implementor", model, routeSource: routes() });
    assert.equal(result.ok, false, String(model));
    assert.match(dispatchModelRefusalText(result), /Subagents\[\]\.Model/u);
  }
  for (const model of ["flash_lite", "flash", "pro"]) {
    assert.equal(evaluateDispatchModel({ runner: "antigravity", subagentType: "customer-researcher", model, routeSource: routes() }).ok, true);
  }
});

test("DME11 a directly comparable Antigravity duty selector binds the role", () => {
  const routeSource = { ok: true, taskRoutes: [{ taskRoute: "duty.implement", runner: "antigravity",
    state: "opt-in", nativeTier: "flash", selector: { kind: "model-id", value: "gemini-3.7" } }] };
  assert.equal(evaluateDispatchModel({ runner: "antigravity", subagentType: "goldfish-implementor", model: "flash", routeSource }).ok, true);
  const mismatch = evaluateDispatchModel({ runner: "antigravity", subagentType: "goldfish-implementor", model: "pro", routeSource });
  assert.equal(mismatch.findings[0].code, "DISPATCH-MODEL-DUTY-MISMATCH");
});

test("DME12 approved Antigravity tiers are projected beside, not substituted for, V3 selectors", () => {
  const source = registeredFunctionalTaskRoutes();
  assert.equal(source.ok, true);
  const routes = source.taskRoutes.filter((route) => route.runner === "antigravity" && route.taskRoute.startsWith("duty."));
  assert.equal(routes.find((route) => route.taskRoute === "duty.implement").nativeTier, "flash");
  // G20-43 (PO 2026-11-07, measured: the alias does not select a model on the host): the three Goldfish roles pass `flash`, the Critic
  // passes no Model and inherits the session's model (was: deep "pro", critic_normal "pro").
  assert.equal(routes.find((route) => route.taskRoute === "duty.deep").nativeTier, "flash");
  assert.equal(routes.find((route) => route.taskRoute === "duty.critic_normal").nativeTier, "inherit");
  assert.equal(routes.find((route) => route.taskRoute === "duty.advisory").nativeTier, "pro");
  assert.equal(evaluateDispatchModel({ runner: "antigravity", subagentType: "consult-advisor", model: "pro", routeSource: source }).ok, true);
  assert.equal(evaluateDispatchModel({ runner: "antigravity", subagentType: "plan-verifier", model: "pro", routeSource: source }).findings[0].code, "DISPATCH-MODEL-ROUTE-UNAVAILABLE");
  assert.notEqual(routes.find((route) => route.taskRoute === "duty.implement").selector.value, "flash");
});

test("DME13 G20-43 the Goldfish roles pass Model flash and the Critic passes no Model (it inherits the session model)", () => {
  const source = registeredFunctionalTaskRoutes();
  for (const subagentType of ["goldfish-implementor", "goldfish-mechanic", "goldfish-deep"]) {
    assert.equal(evaluateDispatchModel({ runner: "antigravity", subagentType, model: "flash", routeSource: source }).ok, true, subagentType);
    assert.equal(evaluateDispatchModel({ runner: "antigravity", subagentType, model: "pro", routeSource: source }).findings[0].code, "DISPATCH-MODEL-DUTY-MISMATCH", subagentType);
    assert.equal(evaluateDispatchModel({ runner: "antigravity", subagentType, model: undefined, routeSource: source }).findings[0].code, "DISPATCH-MODEL-MISSING", subagentType);
    assert.match(evaluateDispatchModel({ runner: "antigravity", subagentType, model: undefined, routeSource: source }).findings[0].message, /configured route for pipeline-core:goldfish-[a-z]+ selects "flash"/u, subagentType);
  }
  for (const subagentType of ["critic", "pipeline-core:critic"]) {
    for (const model of [undefined, "", "inherit"]) {
      assert.equal(evaluateDispatchModel({ runner: "antigravity", subagentType, model, routeSource: source }).ok, true, `${subagentType}/${String(model)}`);
    }
    // An explicit alias would only pick a model of the host's own choosing; the repair is to omit it.
    const refused = evaluateDispatchModel({ runner: "antigravity", subagentType, model: "pro", routeSource: source });
    assert.equal(refused.ok, false);
    assert.equal(refused.findings[0].code, "DISPATCH-MODEL-DUTY-MISMATCH");
    assert.match(dispatchModelRefusalText(refused), /omit Model/u);
  }
});

// C23 (draft ADR "a project's pipeline.user.yaml owns its routing", decision 4): the dispatch route reader returns the project's own value.
test("DME-C23 the dispatch model check reads the project's routing for its root, and falls back to the registry with a warning", async () => {
  const { mkdtempSync, rmSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { loadRunnerProfilesV3Registry, RUNNER_PROFILES_V3_REGISTRY_SHA256 } = await import("./runner-profiles-v3.mjs");
  const registry = loadRunnerProfilesV3Registry();
  const render = (value, indent = "") => Object.keys(value).map((key) => {
    const item = value[key];
    if (Array.isArray(item)) return item.length === 0 ? `${indent}${key}: []\n` : `${indent}${key}:\n${item.map((entry) => (entry !== null && typeof entry === "object"
      ? `${indent}  -\n${render(entry, `${indent}    `)}` : `${indent}  - ${JSON.stringify(entry)}\n`)).join("")}`;
    return item !== null && typeof item === "object" ? `${indent}${key}:\n${render(item, `${indent}  `)}` : `${indent}${key}: ${JSON.stringify(item)}\n`;
  }).join("");
  const intent = {
    schema: "pipeline.user.v3", core_registry_sha256: RUNNER_PROFILES_V3_REGISTRY_SHA256,
    language: { human_facing: "en", agent_facing: "en" }, agent_runtime: "other", runners: { enabled: ["claude"], default: "claude" },
    routing: { profiles: registry.profiles, duties: structuredClone(registry.duties) },
    usage: { common_projection: "pipeline.runner-usage.v1", raw_persistence: "none" },
    autonomy: { push_policy: "gated", branch_model: "feature-branch", wip_limit: 1 },
    gates: { dev_plan: "blocking", push: "blocking", security: "warn", claude_md_max_lines: 300 }, critic_export: registry.criticExportPolicy,
  };
  intent.routing.duties.mechanic.claude.selector = { kind: "model-id", value: "my-local-model" };
  const root = mkdtempSync(join(tmpdir(), "c23-enforce-"));
  try {
    const ask = (model, extra = {}) => evaluateDispatchModel({ runner: "claude", subagentType: "pipeline-core:goldfish-mechanic", model, root, ...extra });
    const absent = [];
    // No configuration yet: the registry answers, so the project's model id is not known and is refused as unrouted.
    assert.equal(ask("my-local-model", { warn: (text) => absent.push(text) }).findings[0].code, "DISPATCH-MODEL-UNROUTED");
    assert.equal(absent.length, 1);
    writeFileSync(join(root, "pipeline.user.yaml"), render(intent));
    assert.equal(ask("my-local-model").ok, true);
    assert.equal(ask("my-local-model").findings.length, 0);
    // The project's own value is the one the check names, the registry's alias is no longer the route.
    assert.equal(ask(undefined).findings[0].code, "DISPATCH-MODEL-MISSING");
    assert.match(ask(undefined).findings[0].message, /duty\.mechanic = "my-local-model"/u);
    // An explicit routeSource still wins (the pure decision stays injectable).
    assert.equal(ask("my-local-model", { routeSource: routes() }).findings[0].code, "DISPATCH-MODEL-UNROUTED");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// C23 (draft ADR "a project's pipeline.user.yaml owns its routing", decisions 5 and 6, AC-108): the dispatch admits what the
// configuration names. The Agent tool's `model` parameter accepts only family aliases, so a configured full Claude model id reaches the
// guard as its family alias; an `effort` parameter is admitted and judged against the configured duty effort by a warning only.
const effortRoutes = (selector, effort) => ({ ok: true, taskRoutes: [
  { taskRoute: "duty.deep", runner: "claude", state: "default", selector, effort },
  { taskRoute: "duty.implement", runner: "claude", state: "default", selector: { kind: "alias", value: "sonnet" }, effort: "medium" },
] });

test("DME-C23b a configured Claude model id admits its family alias on the call and still refuses another family", () => {
  const source = effortRoutes({ kind: "model-id", value: "claude-opus-5" }, "high");
  const viaAlias = evaluateDispatchModel({ runner: "claude", subagentType: "pipeline-core:goldfish-deep", model: "opus", routeSource: source });
  assert.equal(viaAlias.ok, true, JSON.stringify(viaAlias.findings));
  assert.equal(viaAlias.findings.length, 0);
  assert.equal(evaluateDispatchModel({ runner: "claude", subagentType: "pipeline-core:goldfish-deep", model: "claude-opus-5", routeSource: source }).ok, true, "the exact id stays admitted");
  assert.equal(evaluateDispatchModel({ runner: "claude", subagentType: "pipeline-core:goldfish-deep", model: "haiku", routeSource: source }).findings[0].code, "DISPATCH-MODEL-UNROUTED");
});

test("DME-C23c a call that carries the configured effort is admitted, a different effort warns, a call without a model is still refused", () => {
  const source = effortRoutes({ kind: "alias", value: "sonnet" }, "high");
  const same = evaluateDispatchModel({ runner: "claude", subagentType: "pipeline-core:goldfish-deep", model: "sonnet", effort: "high", routeSource: source });
  assert.equal(same.ok, true);
  assert.deepEqual(same.warnings ?? [], []);
  const other = evaluateDispatchModel({ runner: "claude", subagentType: "pipeline-core:goldfish-deep", model: "sonnet", effort: "low", routeSource: source });
  assert.equal(other.ok, true, "a differing effort is never a refusal");
  assert.equal(other.warnings?.[0]?.code, "DISPATCH-EFFORT-DUTY-MISMATCH", JSON.stringify(other));
  assert.match(other.warnings[0].message, /low/u);
  assert.match(other.warnings[0].message, /high/u);
  const noModel = evaluateDispatchModel({ runner: "claude", subagentType: "pipeline-core:goldfish-deep", model: undefined, effort: "high", routeSource: source });
  assert.equal(noModel.ok, false);
  assert.equal(noModel.findings[0].code, "DISPATCH-MODEL-MISSING", "naming an effort never replaces naming a model");
});

test("DME-C23f the record reader answers per half whether the project's Claude duty routes name a recorded model and effort", () => {
  const route = (taskRoute, runner, value, effort, state = "default") => ({ taskRoute, runner, role: "worker", effort, state, selector: { kind: value.startsWith("claude-") ? "model-id" : "alias", value } });
  const routeSource = { ok: true, taskRoutes: [route("duty.deep", "claude", "sonnet", "high"), route("duty.implement", "claude", "claude-haiku-5-5", "medium"),
    route("duty.read", "claude", "fable", "max", "unavailable"), route("duty.deep", "codex", "gpt-6-luna", "low"), route("profile.epic.design_phase", "claude", "opus", "xhigh")] };
  const read = configuredRecordRoute("/fixture-root", { routeSource });
  const v4 = (model, effort) => ({ schema: "pipeline.dispatch-record.v4", runner: "claude", model, effort });
  assert.deepEqual(read(v4("claude-sonnet-5-5", "medium")), { model: true, effort: true }, "an alias selector admits its family's ids; any duty route counts, as at the guard");
  assert.deepEqual(read(v4("haiku", "high")), { model: true, effort: true }, "a model-id selector is reached as its family alias");
  assert.deepEqual(read(v4("fable", "max")), { model: false, effort: false }, "an unavailable route names nothing");
  assert.deepEqual(read(v4("gpt-6-luna", "low")), { model: false, effort: false }, "another runner's route names nothing on Claude");
  assert.deepEqual(read(v4("opus", "xhigh")), { model: false, effort: false }, "a main-session profile route is not a dispatch route");
  assert.equal(read({ ...v4("sonnet", "high"), schema: "pipeline.dispatch-record.v3" }), null, "a hand-typed v3 record stays on the agent definition");
  assert.equal(read({ ...v4("sonnet", "high"), runner: "codex" }), null);
  assert.equal(configuredRecordRoute("/fixture-root", { routeSource: { ok: false } })(v4("sonnet", "high")), null);
  assert.equal(configuredRecordRoute(undefined)(v4("sonnet", "high")), null, "no root, no project to read");
});

test("DME-C23e the Claude SubagentStop hook names the effort that really ran, or says it is unobserved, beside a recorded Goldfish commit", async () => {
  const { mkdtempSync, mkdirSync, rmSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { effortObservationNotice } = await import("../hooks/native-goldfish-host.mjs");
  assert.equal(typeof effortObservationNotice, "function");
  const root = mkdtempSync(join(tmpdir(), "c23-effort-"));
  try {
    mkdirSync(join(root, "evidence"), { recursive: true });
    writeFileSync(join(root, "evidence", "dispatch-record-X1.json"), JSON.stringify({ taskId: "X1", effort: "high" }));
    const recorded = { status: "authored-commit-recorded", record: { target: "evidence/dispatch-record-X1.json" } };
    const stop = (extra = {}) => ({ hook_event_name: "SubagentStop", ...extra });
    assert.match(effortObservationNotice({ root, runner: "claude", input: stop({ effort: { level: "high" } }), result: recorded }), /observed.*high/iu);
    assert.match(effortObservationNotice({ root, runner: "claude", input: stop({ effort: { level: "xhigh" } }), result: recorded }), /DISPATCH-EFFORT-NOT-EFFECTIVE.*xhigh/u);
    assert.match(effortObservationNotice({ root, runner: "claude", input: stop(), result: recorded }), /DISPATCH-EFFORT-UNOBSERVED/u);
    // Nothing is claimed for another event, another runner, or a stop that recorded no commit.
    assert.equal(effortObservationNotice({ root, runner: "claude", input: { hook_event_name: "PostToolUse" }, result: recorded }), null);
    assert.equal(effortObservationNotice({ root, runner: "codex", input: stop(), result: recorded }), null);
    assert.equal(effortObservationNotice({ root, runner: "claude", input: stop(), result: { status: "recovery-required" } }), null);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("DME-C23d the effort that really ran is the one the stop reports; absent, it is recorded as unobserved and never claimed", async () => {
  const { observeEffectiveEffort } = await import("./dispatch-model-enforcement.mjs");
  assert.equal(typeof observeEffectiveEffort, "function");
  const observed = observeEffectiveEffort({ configuredEffort: "high", stopInput: { hook_event_name: "SubagentStop", effort: { level: "high" } } });
  assert.deepEqual({ status: observed.status, observed: observed.observed, configured: observed.configured, warning: observed.warning }, { status: "observed", observed: "high", configured: "high", warning: null });
  const differs = observeEffectiveEffort({ configuredEffort: "high", stopInput: { hook_event_name: "SubagentStop", effort: { level: "xhigh" } } });
  assert.equal(differs.status, "observed");
  assert.equal(differs.observed, "xhigh", "the record names the effort that really runs");
  assert.equal(differs.warning?.code, "DISPATCH-EFFORT-NOT-EFFECTIVE");
  assert.match(differs.warning.message, /high/u);
  assert.match(differs.warning.message, /xhigh/u);
  for (const stopInput of [{ hook_event_name: "SubagentStop" }, { effort: {} }, { effort: { level: "" } }, { effort: { level: 5 } }, null, undefined]) {
    const unobserved = observeEffectiveEffort({ configuredEffort: "high", stopInput });
    assert.equal(unobserved.status, "unobserved", JSON.stringify(stopInput));
    assert.equal(unobserved.observed, null, "no effort is claimed that was not observed");
    assert.equal(unobserved.warning?.code, "DISPATCH-EFFORT-UNOBSERVED");
    assert.match(unobserved.warning.message, /unobserved/iu);
  }
});
