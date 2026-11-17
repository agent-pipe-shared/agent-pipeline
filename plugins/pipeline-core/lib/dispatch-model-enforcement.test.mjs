// SPDX-License-Identifier: SUL-1.0
// D84: a dispatch takes its model from the configured routing, never from inheritance or the Elephant's choice.
import test from "node:test";
import assert from "node:assert/strict";
import { CLAUDE_FAMILY_ALIASES, configuredRecordRoute, evaluateDispatchModel, dispatchModelRefusalText, dispatchModelWarningText } from "./dispatch-model-enforcement.mjs";
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

// C30G-M16 (PO 2026-11-17): a PO-requested, recorded, expiring model exception. The store is an in-memory snapshot here; the script and the
// hook cases exercise the real file store.
const NOON = "2026-11-17T12:00:00.000Z";
const at = (minutesAfterNoon) => new Date(Date.parse(NOON) + minutesAfterNoon * 60000).toISOString();
async function exceptionFixture(specs) {
  const lib = await import("./dispatch-model-exception.mjs");
  let store = lib.emptyExceptionStore();
  for (const spec of specs) {
    const recorded = lib.recordModelException(store, { by: "label-from-the-po", reason: "design analysis", at: NOON, aliases: CLAUDE_FAMILY_ALIASES, ...spec });
    assert.equal(recorded.ok, true, JSON.stringify(recorded));
    store = recorded.store;
  }
  return { lib, store, snapshot: () => ({ ok: true, store }) };
}
const call = (extra) => ({ runner: "claude", subagentType: "pipeline-core:goldfish-deep", model: "fable", root: "/fixture-root", routeSource: routes(), nowFn: () => at(10), ...extra });

test("DME-X1 a model no route selects is admitted, with a named warning, exactly when a live exception names it", async () => {
  const { snapshot } = await exceptionFixture([{ model: "fable", scope: { kind: "dispatch-id", value: "FEATURE-A-1" } }]);
  const admitted = evaluateDispatchModel(call({ dispatchId: "FEATURE-A-1", exceptionStore: snapshot() }));
  assert.equal(admitted.ok, true, JSON.stringify(admitted));
  const warning = admitted.warnings.find((entry) => entry.code === "DISPATCH-MODEL-EXCEPTION");
  assert.match(warning.message, /model exception: fable, requested by the PO at 2026-11-17T12:00:00\.000Z \(label-from-the-po\)/u);
  assert.equal(admitted.exceptionUse.model, "fable");
  assert.equal(admitted.warnings.some((entry) => entry.code === "DISPATCH-MODEL-DUTY-MISMATCH"), false, "the exception replaces the escalation warning, it does not stack on it");
  assert.match(dispatchModelWarningText(admitted), /DISPATCH-MODEL-EXCEPTION/u);
  const without = evaluateDispatchModel(call({ dispatchId: "FEATURE-A-1", exceptionStore: { ok: true, store: (await import("./dispatch-model-exception.mjs")).emptyExceptionStore() } }));
  assert.equal(without.ok, false);
  assert.equal(without.exceptionUse, undefined);
});

test("DME-X2 without a live exception the refusal names the ONE record command, what the PO supplies, and the decline path", async () => {
  const { lib } = await exceptionFixture([]);
  const refused = evaluateDispatchModel(call({ dispatchId: "FEATURE-A-1", effort: "max", exceptionStore: { ok: true, store: lib.emptyExceptionStore() } }));
  assert.equal(refused.ok, false);
  assert.equal(refused.findings[0].code, "DISPATCH-MODEL-UNROUTED");
  const text = refused.findings[0].message;
  assert.match(text, /dispatch-model-exception\.mjs" record --model fable --effort max --dispatch-id FEATURE-A-1 --reason "<reason the PO gave>" --by "<label the PO gave>" --root "\/fixture-root"/u);
  assert.match(text, /decline/u);
  assert.match(text, /sonnet/u, "the decline path re-issues with a configured selector");
  assert.match(text, /no exception is recorded/u);
  const noId = evaluateDispatchModel(call({ exceptionStore: { ok: true, store: lib.emptyExceptionStore() } }));
  assert.match(noId.findings[0].message, /record --model fable --count 1 --reason/u, "a dispatch with no declared id gets the one-dispatch count scope");
  const other = evaluateDispatchModel(call({ model: "gpt-6", exceptionStore: { ok: true, store: lib.emptyExceptionStore() } }));
  assert.doesNotMatch(other.findings[0].message, /dispatch-model-exception/u, "only a Claude family alias can be excepted");
  assert.equal(evaluateDispatchModel({ runner: "claude", subagentType: "general-purpose", model: "fable", routeSource: routes() }).findings[0].message,
    "the dispatch names model \"fable\", which no available configured route selects. Re-issue it with one of the configured selectors: \"sonnet\", \"haiku\", \"opus\".",
    "no root and no injected store: the refusal is byte-identical to the one before the exception existed");
});

test("DME-X3 an expired, consumed, wrong-alias or wrong-dispatch-id exception is refused and said as such, naming list and record", async () => {
  const noOpus = routes({ test_author: "sonnet", critic_normal: "sonnet", critic_high_risk: "sonnet", advisory: "sonnet" });
  const cases = [
    { specs: [{ model: "fable", scope: { kind: "minutes", value: 30 } }], extra: { nowFn: () => at(31) }, cause: "expired" },
    { specs: [{ model: "fable", scope: { kind: "dispatch-id", value: "FEATURE-A-1" } }], extra: { dispatchId: "FEATURE-A-2" }, cause: "wrong-dispatch-id" },
    { specs: [{ model: "fable", scope: { kind: "count", value: 1 } }], uses: ["FEATURE-A-9"], extra: { dispatchId: "FEATURE-A-2" }, cause: "consumed" },
    { specs: [{ model: "fable", scope: { kind: "count", value: 2 } }], extra: { model: "opus", routeSource: noOpus }, cause: "wrong-alias" },
  ];
  for (const entry of cases) {
    const { lib, store } = await exceptionFixture(entry.specs);
    let current = store;
    for (const key of entry.uses ?? []) current = lib.applyModelExceptionUse(current, { id: "MX-1", dispatchKey: key, dispatchId: key, model: "fable", effort: null, reused: false }, NOON).store;
    const refused = evaluateDispatchModel(call({ dispatchId: "FEATURE-A-1", ...entry.extra, exceptionStore: { ok: true, store: current } }));
    assert.equal(refused.ok, false, entry.cause);
    assert.equal(refused.exceptionUse, undefined);
    assert.match(refused.findings[0].message, new RegExp(`MX-1[^.]*${entry.cause}`, "u"), entry.cause);
    assert.match(refused.findings[0].message, /dispatch-model-exception\.mjs" list /u, entry.cause);
    assert.match(refused.findings[0].message, /dispatch-model-exception\.mjs" record /u, entry.cause);
  }
});

test("DME-X4 an exception for one alias never admits another model", async () => {
  const noOpus = routes({ test_author: "sonnet", critic_normal: "sonnet", critic_high_risk: "sonnet", advisory: "sonnet" });
  const { snapshot } = await exceptionFixture([{ model: "fable", scope: { kind: "minutes", value: 60 } }]);
  assert.equal(evaluateDispatchModel(call({ model: "opus", routeSource: noOpus, exceptionStore: snapshot() })).ok, false);
  assert.equal(evaluateDispatchModel(call({ model: "claude-fable-5", exceptionStore: snapshot() })).ok, true, "a full Claude id of the excepted family is the same alias");
  assert.equal(evaluateDispatchModel(call({ model: "fable-extra", exceptionStore: snapshot() })).ok, false, "a prefix of the alias is not the alias");
});

test("DME-X5 a count exception is consumed once per new dispatch, never by a refusal, never twice by a retry of the same dispatch", async () => {
  const { lib, store, snapshot } = await exceptionFixture([{ model: "fable", scope: { kind: "count", value: 1 } }]);
  const first = evaluateDispatchModel(call({ dispatchId: "FEATURE-A-1", exceptionStore: snapshot() }));
  assert.equal(first.ok, true);
  assert.equal(first.exceptionUse.reused, false);
  assert.equal(evaluateDispatchModel(call({ dispatchId: "FEATURE-A-1", exceptionStore: snapshot() })).exceptionUse.id, "MX-1", "deciding is read-only: the same store admits the same call again");
  const used = lib.applyModelExceptionUse(store, first.exceptionUse, at(10));
  assert.equal(used.ok, true);
  const after = { ok: true, store: used.store };
  const retry = evaluateDispatchModel(call({ dispatchId: "FEATURE-A-1", exceptionStore: after }));
  assert.equal(retry.ok, true, "a retried identical call after a transient failure is still admitted");
  assert.equal(retry.exceptionUse.reused, true);
  assert.equal(lib.applyModelExceptionUse(used.store, retry.exceptionUse, at(11)).store.digest, used.store.digest, "the retry appends nothing: the exception is not burnt twice");
  const next = evaluateDispatchModel(call({ dispatchId: "FEATURE-A-2", exceptionStore: after }));
  assert.equal(next.ok, false, "the count was one dispatch");
  assert.match(next.findings[0].message, /consumed/u);
  // A SendMessage continuation is not a new dispatch: it is no Agent call and never reaches this decision (the hook is registered on Task/Agent only).
});

test("DME-X6 a window exception expires by time on an injected clock and records each admitted dispatch once", async () => {
  const { lib, store } = await exceptionFixture([{ model: "fable", scope: { kind: "minutes", value: 30 } }]);
  const live = (minutes, dispatchId) => evaluateDispatchModel(call({ dispatchId, nowFn: () => at(minutes), exceptionStore: { ok: true, store: current } }));
  let current = store;
  assert.equal(live(29, "FEATURE-A-1").ok, true);
  current = lib.applyModelExceptionUse(current, live(29, "FEATURE-A-1").exceptionUse, at(29)).store;
  assert.equal(live(29, "FEATURE-A-2").ok, true, "a window is not decremented by a dispatch");
  assert.equal(live(30, "FEATURE-A-3").ok, false, "the window ends at its stated time");
  assert.match(live(30, "FEATURE-A-3").findings[0].message, /expired/u);
});

test("DME-X7 an effort the configuration does not name is admitted under an exception that names it, with the exception warning", async () => {
  const { snapshot } = await exceptionFixture([{ model: "fable", effort: "max", scope: { kind: "dispatch-id", value: "FEATURE-A-1" } }]);
  const admitted = evaluateDispatchModel(call({ dispatchId: "FEATURE-A-1", effort: "max", exceptionStore: snapshot() }));
  assert.equal(admitted.ok, true);
  assert.match(admitted.warnings.find((entry) => entry.code === "DISPATCH-MODEL-EXCEPTION").message, /effort max/u);
  assert.equal(admitted.warnings.some((entry) => entry.code === "DISPATCH-EFFORT-DUTY-MISMATCH"), false);
  assert.equal(admitted.exceptionUse.effort, "max");
  const sonnetOnly = evaluateDispatchModel(call({ model: "sonnet", dispatchId: "FEATURE-A-1", effort: "max", exceptionStore: snapshot() }));
  assert.equal(sonnetOnly.ok, true, "an exception for fable never touches a sonnet dispatch");
  assert.equal(sonnetOnly.exceptionUse, undefined);
});

test("DME-X8 a corrupt or unreadable store grants nothing and the refusal names the repair", async () => {
  const { lib, store } = await exceptionFixture([{ model: "fable", scope: { kind: "minutes", value: 60 } }]);
  const tampered = JSON.parse(JSON.stringify(store));
  tampered.entries[0].reason = "another reason";
  const verdict = lib.validateExceptionStore(tampered);
  assert.equal(verdict.ok, false);
  const refused = evaluateDispatchModel(call({ exceptionStore: { ok: false, code: verdict.code, path: "/fixture-root/.git/agent-pipeline/dispatch-model-exception/store.json" } }));
  assert.equal(refused.ok, false, "a store that does not verify admits nothing");
  assert.match(refused.findings[0].message, /does not verify/u);
  assert.match(refused.findings[0].message, /--move-broken-store-aside/u);
});

test("DME-X9b the record comparison binds an exception-admitted record to its dispatch and still reports an unexplained mismatch", async () => {
  const { compareRecordedModel } = await import("./agent-model-registry.mjs");
  const { lib, store } = await exceptionFixture([{ model: "fable", effort: "max", scope: { kind: "dispatch-id", value: "FEATURE-A-1" } }]);
  const used = lib.applyModelExceptionUse(store, { id: "MX-1", dispatchKey: "FEATURE-A-1", dispatchId: "FEATURE-A-1", model: "fable", effort: "max", reused: false }, NOON).store;
  const record = (taskId, model) => ({ schema: "pipeline.dispatch-record.v4", runner: "claude", taskId, agentType: "goldfish-deep", model, effort: "max" });
  const configuredRoute = configuredRecordRoute("/fixture-root", { routeSource: routes(), exceptionStore: { ok: true, store: used } });
  const admitted = compareRecordedModel(record("FEATURE-A-1", "claude-fable-5"), { configuredRoute });
  assert.equal(admitted.classification, "model-route-configured");
  assert.match(admitted.reason, /PO model exception/u);
  assert.equal(compareRecordedModel(record("FEATURE-A-2", "claude-fable-5"), { configuredRoute }).classification, "model-mismatch", "another dispatch's record is an unexplained mismatch");
  assert.equal(compareRecordedModel(record("FEATURE-A-1", "gpt-6"), { configuredRoute }).classification, "model-mismatch", "a model the exception does not name is an unexplained mismatch");
  assert.equal(compareRecordedModel(record("FEATURE-A-1", "claude-fable-5")).classification, "model-mismatch", "no reader, no acceptance");
});

test("DME-X9 the host commit accepts the model and effort of a dispatch admitted under an exception, and still refuses an unexplained mismatch", async () => {
  const { lib, store } = await exceptionFixture([{ model: "fable", effort: "max", scope: { kind: "count", value: 1 } }]);
  const used = lib.applyModelExceptionUse(store, { id: "MX-1", dispatchKey: "FEATURE-A-1", dispatchId: "FEATURE-A-1", model: "fable", effort: "max", reused: false }, NOON).store;
  const v4 = (taskId, model, effort) => ({ schema: "pipeline.dispatch-record.v4", runner: "claude", taskId, model, effort });
  const read = configuredRecordRoute("/fixture-root", { routeSource: routes(), exceptionStore: { ok: true, store: used } });
  assert.deepEqual(read(v4("FEATURE-A-1", "claude-fable-5", "max")), { model: true, effort: true, exception: true });
  assert.deepEqual(read(v4("FEATURE-A-2", "fable", "max")), { model: false, effort: false }, "another dispatch id was not admitted under it");
  assert.deepEqual(read(v4("FEATURE-A-1", "opus", "max")), { model: true, effort: true, exception: true }, "opus is configured: the route answers the model half, the exception only the effort half");
  assert.deepEqual(read(v4("FEATURE-A-1", "gpt-6", "max")), { model: false, effort: true, exception: true }, "the exception names no other model; the effort half is its own");
  const none = configuredRecordRoute("/fixture-root", { routeSource: routes(), exceptionStore: { ok: true, store: lib.emptyExceptionStore() } });
  assert.deepEqual(none(v4("FEATURE-A-1", "fable", "max")), { model: false, effort: false }, "no exception, no acceptance");
  const unreadable = configuredRecordRoute("/fixture-root", { routeSource: routes(), exceptionStore: { ok: false, code: "store-unverifiable" } });
  assert.deepEqual(unreadable(v4("FEATURE-A-1", "fable", "max")), { model: false, effort: false });
});
