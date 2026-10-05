// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { openSync } from "node:fs";
import { CLAUDE_ADVISORY_FALLBACK_TASK_ROUTE, functionalTaskRoutesForRunner, registeredFunctionalTaskRoutes } from "../lib/model-role-route-source.mjs";
import { admitModelRoleHostBootstrap, prepareModelRoleHostBootstrap } from "../lib/model-role-host-session.mjs";
import { registerTestCaseCompletion } from "../lib/test-case-completion.mjs";
import { loadRunnerProfilesV3Registry } from "../lib/runner-profiles-v3.mjs";
import { selectModelRoleForTask } from "./model-role-dispatch-select.mjs";
import { devNull } from "node:os";

const cases = [];
function test(name, run) { cases.push({ id: `MDS${String(cases.length + 1).padStart(2, "0")}`, name, run }); }
const source = registeredFunctionalTaskRoutes();
const codex = functionalTaskRoutesForRunner(source, "codex");
const sessionId = "session-select-1";
const base = { rootDir: "/repo", runner: "codex", taskRoute: "duty.implement",
  env: { CODEX_SESSION_ID: sessionId }, routeSource: source,
  familyInvocationEntry: { observeActivation: () => ({ ok: true, status: "inactive" }) },
  readCommonDir: () => "/repo/.git" };

function admittedStore(runnerSource = codex, heldSessionId = sessionId) {
  const routes = runnerSource.configuredRoutes;
  const proposal = prepareModelRoleHostBootstrap({ sessionId: heldSessionId,
    candidateCommit: "a".repeat(40), observedAt: "2026-09-26T00:00:00.000Z",
    routeSource: runnerSource,
    approvedPolicies: routes.map((route) => ({ runner: route.runner, role: route.role,
      effort: route.effort, policy: { schema: "pipeline.model-role-policy.v1",
        runner: route.runner, role: route.role,
        approved: [{ modelId: `approved-${route.role}-${route.effort}`, rank: 1,
          efforts: [route.effort], compatibilityEvidenceSha256: "b".repeat(64) }] } })),
    observations: routes.map((route) => ({ runner: route.runner, role: route.role,
      effort: route.effort, ok: true, assurance: route.runner === "claude"
        ? "host-observed-single-call-not-provider-attested" : "installed-host-observed",
      availableModelIds: [`approved-${route.role}-${route.effort}`] })) });
  assert.equal(proposal.ok, true, JSON.stringify(proposal));
  let held;
  const store = { inspect: () => ({ ok: true, status: "present" }),
    persist: (value) => { held = value; return { ok: true }; },
    read: () => ({ ok: true, ...held }) };
  assert.equal(admitModelRoleHostBootstrap({ proposal, store,
    acknowledgement: { sessionId: heldSessionId, confirmed: true,
      readbackSha256: proposal.readback.readbackSha256 } }).ok, true);
  return store;
}

test("an absent current-session record selects only the legacy V3 route", () => {
  const result = selectModelRoleForTask({ ...base,
    makeStore: () => ({ inspect: () => ({ ok: true, status: "absent" }) }) });
  assert.equal(result.code, "MODEL-ROLE-SELECT-LEGACY-V3");
  assert.equal(result.modelId, undefined);
  assert.deepEqual(result.v3Route, {
    selector: { kind: "model-id", value: "gpt-6-luna" }, effort: "high",
  });

  const registry = loadRunnerProfilesV3Registry();
  for (const route of source.taskRoutes) {
    const [kind, first, second] = route.taskRoute.split(".");
    const cell = kind === "profile"
      ? registry.profiles?.[first]?.[second]?.[route.runner]
      : route.taskRoute === CLAUDE_ADVISORY_FALLBACK_TASK_ROUTE
        ? registry.duties?.advisory?.claude?.fallbacks?.find((entry) => entry.adapter === "consult" && entry.runner === "claude")
        : registry.duties?.[first]?.[route.runner];
    assert.ok(cell, `${route.runner} ${route.taskRoute} has a V3 cell`);
    const session = `fallback-${route.runner}`;
    const selected = selectModelRoleForTask({ ...base, runner: route.runner,
      taskRoute: route.taskRoute,
      env: route.runner === "claude" ? { CLAUDE_CODE_SESSION_ID: session }
        : route.runner === "codex" ? { CODEX_SESSION_ID: session } : {},
      hostHookSessionId: route.runner === "antigravity" ? session : null,
      makeStore: () => ({ inspect: () => ({ ok: true, status: "absent" }) }) });
    if (cell.state === "unavailable") {
      assert.equal(selected.code, "MODEL-ROLE-SELECT-ROUTE-UNAVAILABLE", `${route.runner} ${route.taskRoute}`);
      continue;
    }
    assert.equal(selected.status, "legacy-v3", `${route.runner} ${route.taskRoute}`);
    assert.deepEqual(selected.v3Route, { selector: cell.selector, effort: cell.effort },
      `${route.runner} ${route.taskRoute}`);
  }
});

test("a present admitted record selects the exact current-runner task model before packet sealing", () => {
  const result = selectModelRoleForTask({ ...base, makeStore: () => admittedStore() });
  assert.equal(result.ok, true);
  assert.equal(result.modelId, "approved-worker-high");
  assert.equal(result.taskRoute, "duty.implement");
  assert.equal(result.runner, "codex");
});

test("a single Claude or Antigravity runner selects its own receipt without another runner", () => {
  for (const [runner, env, hostHookSessionId] of [
    ["claude", { CLAUDE_CODE_SESSION_ID: "claude-only" }, null],
    ["antigravity", {}, "agy-only"],
  ]) {
    const scoped = functionalTaskRoutesForRunner(source, runner);
    assert.equal(scoped.ok, true);
    assert.ok(scoped.configuredRoutes.every((route) => route.runner === runner));
    const store = admittedStore(scoped, runner === "claude" ? "claude-only" : "agy-only");
    const selected = selectModelRoleForTask({ ...base, runner, env, hostHookSessionId,
      taskRoute: "duty.implement", makeStore: () => store });
    assert.equal(selected.ok, true, JSON.stringify(selected));
    assert.equal(selected.runner, runner);
    assert.equal(selected.taskRoute, "duty.implement");
    assert.equal(selected.modelId, "approved-worker-medium", JSON.stringify(selected));
    const legacy = selectModelRoleForTask({ ...base, runner, env, hostHookSessionId,
      taskRoute: "duty.implement",
      makeStore: () => ({ inspect: () => ({ ok: true, status: "absent" }) }) });
    assert.equal(legacy.status, "legacy-v3");
    assert.deepEqual(legacy.v3Route, runner === "claude"
      ? { selector: { kind: "alias", value: "sonnet" }, effort: "medium" }
      : { selector: { kind: "model-id", value: "gemini-3.8-flash-medium" }, effort: "medium" });
    if (runner === "claude") {
      const fallback = selectModelRoleForTask({ ...base, runner, env,
        taskRoute: CLAUDE_ADVISORY_FALLBACK_TASK_ROUTE, makeStore: () => store });
      assert.equal(fallback.ok, true, JSON.stringify(fallback));
      assert.equal(fallback.modelId, "approved-frontier-max");
      assert.equal(fallback.effort, "max");
      const noOptionalSelection = selectModelRoleForTask({ ...base, runner, env,
        taskRoute: CLAUDE_ADVISORY_FALLBACK_TASK_ROUTE,
        makeStore: () => ({ inspect: () => ({ ok: true, status: "absent" }) }) });
      assert.equal(noOptionalSelection.status, "legacy-v3");
      assert.equal(noOptionalSelection.modelId, undefined);
      assert.deepEqual(noOptionalSelection.v3Route,
        { selector: { kind: "alias", value: "opus" }, effort: "max" });
    }
  }
});

test("a foreign receipt cannot select its model, and unknown or V3-unavailable routes remain denied", () => {
  const makeStore = () => admittedStore();
  assert.equal(selectModelRoleForTask({ ...base, taskRoute: "duty.unknown", makeStore }).ok, false);
  const foreign = selectModelRoleForTask({ ...base, runner: "claude",
    env: { CLAUDE_CODE_SESSION_ID: sessionId }, makeStore });
  assert.equal(foreign.status, "legacy-v3");
  assert.equal(foreign.modelId, undefined);
  assert.deepEqual(foreign.v3Route,
    { selector: { kind: "alias", value: "sonnet" }, effort: "medium" });
  assert.equal(typeof foreign.diagnostic, "string");
  assert.equal(selectModelRoleForTask({ ...base, runner: "antigravity",
    env: {}, hostHookSessionId: sessionId, taskRoute: "duty.critic_high_risk", makeStore }).code,
  "MODEL-ROLE-SELECT-ROUTE-UNAVAILABLE");
});

test("a corrupt optional model-role receipt falls back visibly to V3, never using its model", () => {
  const result = selectModelRoleForTask({ ...base,
    makeStore: () => ({ inspect: () => ({ ok: true, status: "present" }),
      read: () => ({ ok: false }) }) });
  assert.equal(result.ok, true);
  assert.equal(result.code, "MODEL-ROLE-SELECT-LEGACY-V3");
  assert.equal(result.status, "legacy-v3");
  assert.equal(typeof result.diagnostic, "string");
  assert.equal(result.modelId, undefined);
  assert.deepEqual(result.v3Route,
    { selector: { kind: "model-id", value: "gpt-6-luna" }, effort: "high" });
  const missingIdentity = selectModelRoleForTask({ ...base, env: {},
    makeStore: () => { throw new Error("must not read optional store"); } });
  assert.equal(missingIdentity.status, "legacy-v3");
  assert.equal(missingIdentity.modelId, undefined);
  const missingAgyHook = selectModelRoleForTask({ ...base, runner: "antigravity",
    env: {}, hostHookSessionId: null,
    makeStore: () => { throw new Error("must not read optional store"); } });
  assert.equal(missingAgyHook.status, "legacy-v3");
  assert.equal(missingAgyHook.modelId, undefined);
  assert.equal(selectModelRoleForTask({ ...base, taskRoute: "duty.unknown",
    env: {} }).code, "MODEL-ROLE-SELECT-ROUTE-UNAVAILABLE");
});

test("a defective optional role source keeps an independently valid V3 route usable", () => {
  const broken = { ok: false, code: "MODEL-ROLE-ROUTE-SOURCE-INCOMPLETE" };
  const selected = selectModelRoleForTask({ ...base, routeSource: broken,
    makeStore: () => { throw new Error("optional store must not be read"); } });
  assert.equal(selected.status, "legacy-v3");
  assert.equal(selected.diagnostic, "MODEL-ROLE-SELECT-SOURCE");
  assert.equal(selected.modelId, undefined);
  const absentProjection = selectModelRoleForTask({ ...base,
    routeSource: { ok: true, taskRoutes: [], configuredRoutes: [] } });
  assert.equal(absentProjection.status, "legacy-v3");
  assert.equal(selectModelRoleForTask({ ...base, routeSource: broken,
    taskRoute: "duty.unknown" }).code, "MODEL-ROLE-SELECT-ROUTE-UNAVAILABLE");
  assert.equal(selectModelRoleForTask({ ...base, routeSource: broken,
    readRegistry: () => ({ ...loadRunnerProfilesV3Registry(), duties: {} }) }).code,
  "MODEL-ROLE-SELECT-SOURCE");
  assert.equal(selectModelRoleForTask({ ...base, routeSource: broken,
    readRegistry: () => { throw new Error("missing V3 source"); } }).code,
  "MODEL-ROLE-SELECT-SOURCE");
});

test("throwing optional source and stored selection preserve V3 without aborting dispatch", () => {
  const brokenSource = selectModelRoleForTask({ ...base,
    routeSource: { ok: true, get taskRoutes() { throw new Error("damaged role source"); } },
    makeStore: () => { throw new Error("optional store must not be read"); } });
  assert.equal(brokenSource.code, "MODEL-ROLE-SELECT-LEGACY-V3");
  assert.equal(brokenSource.diagnostic, "MODEL-ROLE-SELECT-SOURCE");
  assert.equal(brokenSource.modelId, undefined);
  assert.deepEqual(brokenSource.v3Route,
    { selector: { kind: "model-id", value: "gpt-6-luna" }, effort: "high" });

  const brokenReceipt = selectModelRoleForTask({ ...base,
    makeStore: () => ({ inspect: () => ({ ok: true, status: "present" }),
      read: () => ({ ok: true, sessionId, runner: "codex", receipts: [],
        authority: { routeSource: { taskRoutes: {} } } }) }) });
  assert.equal(brokenReceipt.code, "MODEL-ROLE-SELECT-LEGACY-V3");
  assert.equal(brokenReceipt.diagnostic, "MODEL-ROLE-SELECT-STORE-UNAVAILABLE");
  assert.equal(brokenReceipt.modelId, undefined);
  assert.deepEqual(brokenReceipt.v3Route,
    { selector: { kind: "model-id", value: "gpt-6-luna" }, effort: "high" });
});

test("active family selection is prepared through the shared entry and carries its immutable receipt", async () => {
  const calls = [];
  const familyInvocationEntry = { observeActivation: () => ({ ok: true, status: "active" }),
    prepareModelFamilyInvocation: (input) => { calls.push(input); return { ok: true, value: {
      handle: Object.freeze(Object.create(null)), receipt: Object.freeze({ selectedModelId: "gpt-6.1-sol",
        effort: "high", runner: input.runner, taskRoute: input.taskRoute, sessionId: input.sessionId,
        invocationId: input.invocationId, receiptSha256: "a".repeat(64) }) } }; } };
  const selected = await selectModelRoleForTask({ ...base, familyInvocationEntry,
    readCandidate: () => ({ candidateCommit: "b".repeat(40), candidateTree: "c".repeat(40) }),
    makeInvocationId: () => "family-dispatch-1", routeSource: { ok: false },
    readRegistry: () => { throw new Error("family mode must not consult V3"); } });
  assert.equal(selected.ok, true, selected.code);
  assert.equal(selected.family, true);
  assert.equal(selected.modelId, "gpt-6.1-sol");
  assert.equal(selected.receipt.receiptSha256, "a".repeat(64));
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { kind: "dispatch", runner: "codex", taskRoute: "duty.implement",
    sessionId, invocationId: "family-dispatch-1", candidateCommit: "b".repeat(40), candidateTree: "c".repeat(40) });
});

test("active or uncertain family failures never contain legacy selectors, including identity and source failures", async () => {
  const uncertain = await selectModelRoleForTask({ ...base,
    familyInvocationEntry: { observeActivation: () => ({ ok: false, code: "MODEL-FAMILY-STATE-UNCERTAIN" }) },
    env: {}, routeSource: { ok: false }, readRegistry: () => { throw new Error("must not read V3"); } });
  assert.equal(uncertain.code, "MODEL-FAMILY-STATE-UNCERTAIN");
  assert.equal(uncertain.fallbackForbidden, true);
  assert.equal(Object.hasOwn(uncertain, "v3Route"), false);
  const activeIdentityFailure = await selectModelRoleForTask({ ...base,
    familyInvocationEntry: { observeActivation: () => ({ ok: true, status: "active" }) },
    env: {}, routeSource: { ok: false }, readRegistry: () => { throw new Error("must not read V3"); } });
  assert.equal(activeIdentityFailure.fallbackForbidden, true);
  assert.equal(Object.hasOwn(activeIdentityFailure, "v3Route"), false);
  const activeSourceFailure = await selectModelRoleForTask({ ...base,
    familyInvocationEntry: { observeActivation: () => ({ ok: true, status: "active" }),
      prepareModelFamilyInvocation: () => ({ ok: false, code: "MODEL-FAMILY-ROUTE-SOURCE-UNAVAILABLE" }) },
    readCandidate: () => ({ candidateCommit: "b".repeat(40), candidateTree: "c".repeat(40) }) });
  assert.equal(activeSourceFailure.code, "MODEL-FAMILY-ROUTE-SOURCE-UNAVAILABLE");
  assert.equal(Object.hasOwn(activeSourceFailure, "fallback"), false);
});

test("family selection script-level identity transport failure stays unavailable", async () => {
  const result = await selectModelRoleForTask({ ...base,
    familyInvocationEntry: { observeActivation: () => ({ ok: true, status: "active" }) }, env: {} });
  assert.equal(result.ok, false);
  assert.equal(result.fallbackForbidden, true);
  assert.equal(Object.hasOwn(result, "v3Route"), false);
});

assert.equal(cases.length, 10);
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync(devNull, "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: cases, fd: completionFd,
  maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });
