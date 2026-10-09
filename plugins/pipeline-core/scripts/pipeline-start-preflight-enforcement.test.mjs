// SPDX-License-Identifier: SUL-1.0
/**
 * HOOKREFRESH-T0-20261008 -- RED pins for the start preflight's ENFORCEMENT of hook refresh and of the
 * model-role bootstrap readback (backlog item pipeline.bootstrap-should-refresh-hooks-when-the-plugin-updated,
 * "Recurrence 2026-10-08 (late)", sharpened proposal points 1-3; design note HOOKREFRESH-D).
 *
 * Why this file exists: after HOOKREFRESH-S1 a stale mandatory hook projects to `refresh` and is, by design,
 * reported but never gating (`assessMandatoryHookReadiness` counts it as `current`). That made the refresh
 * advice-only: a session printed its bootstrap confirmation and dispatched ~15 Goldfish on stale hooks. These
 * pins turn the advice into enforcement for the Elephant, and make the model-role bootstrap a required readback.
 *
 * ASSUMED NAMES -- not present in production today, chosen here for the dispatcher to RATIFY (each is isolated in
 * one helper below, so ratifying a different spelling is a one-line change):
 *   R1  role carrier: option `role` of `observePipelineStartPreflight({ ..., role })`, one of
 *       "elephant" | "goldfish" | "critic". An absent role is treated as "elephant" (strict default: only a
 *       session that declares itself Goldfish/Critic is exempt).               helper: `run({ role })`
 *   R2  model-role seam: option `runModelRoleBootstrapFn` of `observePipelineStartPreflight`, called by the
 *       preflight itself with the same argument bag as `runModelRoleBootstrap` ({ rootDir, runner, env, ... }); it
 *       may return a plain value or a promise (the real function is async). Every call below is
 *       `await observePipelineStartPreflight(...)`, so these pins hold whether the implementation keeps the
 *       function synchronous or makes it async.                                 helper: `run({ modelRole })`
 *   R3  readback field: `result.modelRoleBootstrap` = { status, code } carrying the bootstrap result's own
 *       `status` ("ready" | "unavailable") and `code` (e.g. MODEL-ROLE-BOOTSTRAP-STORE-UNAVAILABLE); it must exist
 *       on every `ready` envelope, `unavailable` with its code is legal, an absent field is not. An
 *       unavailable bootstrap does not change the envelope's own `status`.
 *   R4  refresh action: `nextAction` is ONE object { kind: "command", mutation: true, executable, argv } whose
 *       `argv[0]` is an absolute script under `<pluginRoot>/scripts/`, plus an array `refreshes` naming the
 *       hook ids (as in `cloneProvisioning.checks[].id`) that single call refreshes.
 *                                                                              helper: `coveredHookIds()`
 *   Deliberately NOT pinned: the new `status` string (only "not ready" and a non-zero exit code), the concrete
 *   script/argv, `requiresConfirmation` (design note PO question 2), `expected`, the Antigravity runner.
 *
 * Reading guide: "ENFORCEMENT" tests are RED today and must go green with the feature. "CONTROL" tests pass today
 * and must stay green -- they bound the feature (it must not leak into Goldfish/Critic, nor into the advisory
 * pre-push hook). Every test asserts its preconditions first (fixture really reached the hook gate), so a RED run
 * fails on the contract assertion, never on fixture drift.
 *
 * Hermetic: the hook report, governance scope, onboarding readiness, public-core observation, decision projection
 * and model-role bootstrap are all injected; the working directory is a throw-away temp directory. Nothing reads
 * or writes the real repository's hooks or the home directory.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, sep } from "node:path";
import test, { after } from "node:test";

import { observePipelineStartPreflight, pipelineStartPreflightExitCode } from "./pipeline-start-preflight.mjs";

const cwd = mkdtempSync(join(tmpdir(), "hookrefresh-t0-"));
after(() => rmSync(cwd, { recursive: true, force: true }));

const manifest = JSON.stringify({ version: "0.4.5+test" });
const pluginList = () => JSON.stringify({
  installed: [{
    pluginId: "pipeline-core@agent-pipeline",
    name: "pipeline-core",
    marketplaceName: "agent-pipeline",
    version: "0.4.5+test",
    installed: true,
    enabled: true,
    source: { source: "local", path: "/cache/agent-pipeline/plugins/pipeline-core" },
    marketplaceSource: { sourceType: "git", source: "https://github.com/agent-pipe-shared/agent-pipeline.git" },
  }],
  available: [],
});

const PRE_COMMIT = "pre-commit-hook";
const COMMIT_MSG = "commit-msg-hook";
const PRE_PUSH = "pre-push-hook";
const INSTALLER = Object.freeze({
  [PRE_COMMIT]: "pre-commit-hook-install.mjs",
  [COMMIT_MSG]: "commit-msg-hook-install.mjs",
  [PRE_PUSH]: "pre-push-hook-install.mjs",
});

/** One hook check in the exact shape `checkCloneProvisioning` projects (status: current | refresh | install). */
function hookCheck(id, status) {
  return {
    id,
    status,
    path: join(cwd, ".git", "hooks", id.replace(/-hook$/u, "")),
    repairAction: status === "current" ? null : `node plugins/pipeline-core/scripts/${INSTALLER[id]} --install`,
  };
}

/** A clone-provisioning report mirroring the real one, including its aggregate `refreshAvailable` list. */
function provisioning({ preCommit = "current", commitMsg = "current", prePush = "current" } = {}) {
  const checks = [
    hookCheck(PRE_COMMIT, preCommit),
    hookCheck(COMMIT_MSG, commitMsg),
    hookCheck(PRE_PUSH, prePush),
    { id: "po-profile-receipt", status: "present", path: join(cwd, ".git", "agent-pipeline", "po-gate", "profile-receipt.json"), repairAction: null },
    { id: "private-state-directory", status: "present", path: join(cwd, ".git", "agent-pipeline"), repairAction: null },
  ];
  const refreshAvailable = checks.filter((entry) => entry.status === "refresh").map((entry) => entry.id);
  const usable = (entry) => ["present", "current", "refresh"].includes(entry.status);
  return {
    schema: "pipeline.clone-provisioning-report.v1",
    status: checks.every(usable) ? "ready" : "provisioning-required",
    checks,
    ...(refreshAvailable.length > 0 ? { refreshAvailable } : {}),
  };
}

const modelRoleReady = Object.freeze({ ok: true, code: "MODEL-ROLE-BOOTSTRAP-READY", status: "ready" });
const modelRoleUnavailable = Object.freeze({ ok: false, code: "MODEL-ROLE-BOOTSTRAP-STORE-UNAVAILABLE", status: "unavailable" });

/**
 * Drive the real preflight with every external observation injected. Always awaited by callers (R2).
 * `role === undefined` omits the option entirely, which pins the default.
 */
async function run({ role, hooks, modelRole = modelRoleReady } = {}) {
  const modelRoleCalls = [];
  const result = await observePipelineStartPreflight({
    env: {},
    pluginList: pluginList(),
    read: () => manifest,
    cwd,
    checkCloneProvisioningFn: () => provisioning(hooks),
    observeGovernanceScopeFn: ({ rootDir }) => ({
      schema: "pipeline.governance-scope.v1", state: "active", root: rootDir, scopeKey: "a".repeat(64), repositoryKind: "git",
      provenance: { kind: "isolated-unit-capability", refs: [] }, diagnostics: [], requiresEnforcement: true, hintAllowed: false,
    }),
    observeAntigravityLoadedTopologyFn: ({ loadedPluginRoot }) => ({
      schema: "pipeline.antigravity-loaded-topology.v1", status: "current", loadedKind: "direct", loadedPluginRoot,
      executingGuardAssurance: "not-established-by-topology",
    }),
    observe: () => ({
      schema: "pipeline.public-core-observation.v1",
      status: "ready",
      candidate: { repository: "https://github.com/agent-pipe-shared/agent-pipeline.git", branch: "main", commit: "a".repeat(40), tree: "b".repeat(40) },
      plugin: { name: "pipeline-core", version: "0.4.5+test", manifestSha256: "c".repeat(64), contentSha256: "d".repeat(64) },
    }),
    inspectEffectiveArchitectureDecisionsFn: () => ({
      schema: "pipeline.architecture-effective-decisions.v1", area: "project", status: "advisory",
      code: "ARCH-DECISION-EFFECTIVE-LEGACY-WARNING", projectionSha256: "a".repeat(64), decisions: [], activeExceptions: [],
      findings: [{ code: "legacy-decision-without-sidecar", path: "docs/adr/legacy.md" }],
    }),
    // A fully onboarded project: the existing "ready" action is the read-only onboarding inspect.
    requireProjectOnboardingReadyFn: () => {},
    runModelRoleBootstrapFn: async (args) => {
      modelRoleCalls.push(args);
      if (modelRole instanceof Error) throw modelRole;
      return modelRole;
    },
    ...(role === undefined ? {} : { role }),
  });
  return { result, modelRoleCalls };
}

/** R4: the hook ids the single refresh action declares it covers (sorted), or null when it declares none. */
function coveredHookIds(action) {
  return Array.isArray(action?.refreshes) ? [...action.refreshes].sort() : null;
}

/** Precondition shared by every case: with all hooks current the fixture reaches `ready` and the plain inspect action. */
async function assertBaseline(role) {
  const { result } = await run({ role, hooks: {} });
  assert.equal(result.status, "ready", "precondition: all-current hooks must give a ready envelope");
  assert.equal(result.mandatoryHookReadiness.status, "ready");
  assert.equal(result.nextAction?.kind, "command", "precondition: ready envelope carries the onboarding action");
  assert.equal(basename(result.nextAction.argv[0]), "project-onboarding-v3.mjs");
  assert.equal(result.nextAction.argv[1], "inspect");
  return result;
}

/** The enforcement contract for a stale/missing mandatory hook, as seen by the Elephant. */
function assertElephantMustRefresh(result, expectedCovered) {
  assert.notEqual(result.status, "ready",
    "a stale mandatory hook must make the Elephant's preflight non-ready (it let the bootstrap confirmation through)");
  assert.notEqual(pipelineStartPreflightExitCode(result), 0, "a non-ready Elephant preflight must exit non-zero");
  const action = result.nextAction;
  assert.ok(action !== null && typeof action === "object" && !Array.isArray(action),
    `nextAction must be exactly one typed action, got ${JSON.stringify(action)}`);
  assert.equal(action.kind, "command");
  assert.equal(action.mutation, true, "the refresh rewrites installed hooks");
  assert.equal(typeof action.executable, "string");
  assert.ok(Array.isArray(action.argv) && action.argv.every((token) => typeof token === "string"));
  assert.ok(isAbsolute(action.argv[0]) && action.argv[0].startsWith(join(result.pluginRoot, "scripts") + sep),
    "the action must run a script of the LOADED plugin (the one spelling the guard admits), by absolute path");
  assert.deepEqual(coveredHookIds(action), expectedCovered,
    "ONE call must cover exactly the stale hooks (declared in nextAction.refreshes)");
}

// ---------------------------------------------------------------------------------------------------------------
// Point 1 -- a stale or missing mandatory hook makes the Elephant's preflight non-ready, with ONE refresh action.
// ---------------------------------------------------------------------------------------------------------------

test("ENFORCEMENT: Elephant, all three hooks stale -> non-ready, ONE action refreshes all of them", async () => {
  await assertBaseline("elephant");
  const { result } = await run({ role: "elephant", hooks: { preCommit: "refresh", commitMsg: "refresh", prePush: "refresh" } });
  assert.deepEqual(result.mandatoryHookReadiness.refreshAvailable, [PRE_COMMIT, COMMIT_MSG],
    "precondition: the fixture reached the mandatory-hook gate and both mandatory hooks read stale");
  assert.deepEqual(result.cloneProvisioning.refreshAvailable, [PRE_COMMIT, COMMIT_MSG, PRE_PUSH]);
  assertElephantMustRefresh(result, [COMMIT_MSG, PRE_COMMIT, PRE_PUSH]);
});

test("ENFORCEMENT: Elephant, one mandatory hook stale next to a current one -> action covers exactly the stale one", async () => {
  await assertBaseline("elephant");
  const { result } = await run({ role: "elephant", hooks: { commitMsg: "refresh" } });
  assert.deepEqual(result.mandatoryHookReadiness.refreshAvailable, [COMMIT_MSG], "precondition: only commit-msg reads stale");
  assertElephantMustRefresh(result, [COMMIT_MSG]);
});

// HOOKREFRESH-T6-20261009 RE-POINT (Ruling 84 F1): this T0 case used to pin the blocked-branch `staleMissingMix`
// refresh action (status stayed `hook-provisioning-blocked`, the action was refresh-mandatory-hooks.mjs, and its last
// assertion required `refreshes` to include PRE_COMMIT). Ruling 84 removes that branch: the mix is now provisioning
// first, then refresh. The case keeps its precondition and its "not a dead end, one typed command" assertions and is
// re-pointed to the two-hop expectation; each hop's `expected` is asserted, and the hops are driven through the
// `checkCloneProvisioningFn` fixture states the real coordinator / helper would leave behind.
test("ENFORCEMENT [T0 case re-pointed by HOOKREFRESH-T6, Ruling 84 F1]: Elephant, a stale hook next to a MISSING one goes provisioning first, then refresh, then ready", async () => {
  await assertBaseline("elephant");
  const { result } = await run({ role: "elephant", hooks: { preCommit: "refresh", commitMsg: "install" } });
  assert.deepEqual(result.mandatoryHookReadiness.required.map((entry) => entry.status), ["refresh", "install"],
    "precondition: the fixture reached the gate with one stale and one missing mandatory hook");
  assert.notEqual(result.status, "ready");
  const action = result.nextAction;
  assert.ok(action !== null && typeof action === "object" && !Array.isArray(action),
    `a stale + missing mix must not collapse to a dead end (blocked, nextAction null); it must offer one typed action, got ${JSON.stringify(action)}`);
  assert.equal(action.kind, "command");
  assert.equal(action.mutation, true);

  // Hop 1: the coordinator installs the missing hook (RED today: status is hook-provisioning-blocked and the action is the refresh).
  assert.equal(result.status, "hook-provisioning-required",
    "Ruling 84 F1: the stale+missing mix is provisioning-required first (today hook-provisioning-blocked with the removed staleMissingMix refresh action)");
  assert.equal(result.mandatoryHookReadiness.status, "provisioning-required");
  assert.equal(basename(action.argv[0]), "clone-hook-readiness.mjs", "hop 1 runs the install coordinator, not the refresh helper");
  assert.ok(action.argv.includes("--apply"));
  assert.equal(action.requiresConfirmation, true);
  assert.deepEqual(action.expected, { schema: "pipeline.mandatory-hook-readiness.v1", status: "ready" });

  // Hop 2: after the coordinator ran, commit-msg is current and pre-commit is still stale -> the existing refresh action.
  const { result: second } = await run({ role: "elephant", hooks: { preCommit: "refresh", commitMsg: "current" } });
  assert.equal(second.status, "hook-refresh-required");
  assertElephantMustRefresh(second, [PRE_COMMIT]);
  assert.equal(basename(second.nextAction.argv[0]), "refresh-mandatory-hooks.mjs");
  assert.deepEqual(second.nextAction.expected, { schema: "pipeline.mandatory-hook-refresh.v1", status: "ready" });

  // Hop 3: after the refresh helper ran, everything is current.
  const { result: third } = await run({ role: "elephant", hooks: {} });
  assert.equal(third.status, "ready");
  assert.equal(pipelineStartPipelineExitCodeOf(third), 0);
});

const pipelineStartPipelineExitCodeOf = (result) => pipelineStartPreflightExitCode(result);

// ---------------------------------------------------------------------------------------------------------------
// HOOKREFRESH-T6-20261009 additions (Ruling 84 F4 status passthrough, F2 seam argument bag).
// ---------------------------------------------------------------------------------------------------------------

for (const value of [
  Object.freeze({ ok: false, code: "MODEL-ROLE-BOOTSTRAP-HUMAN-CONFIRMATION-REQUIRED", status: "confirmation-required" }),
  Object.freeze({ ok: false, code: "MODEL-ROLE-BOOTSTRAP-NOT-CONFIRMED", status: "confirmation-required" }),
  Object.freeze({ ok: false, code: "MODEL-ROLE-BOOTSTRAP-ADMISSION-PENDING", status: "admission-pending" }),
]) {
  test(`RED F4 (Ruling 84): the field carries \`${value.status}\` / ${value.code} as its own status, not \`unavailable\``, async () => {
    const { result } = await run({ role: "elephant", hooks: {}, modelRole: value });
    assert.equal(result.status, "ready", "precondition: ready envelope (the readback is reported, not gating)");
    assert.ok(result.modelRoleBootstrap, "modelRoleBootstrap must be present");
    assert.equal(result.modelRoleBootstrap.status, value.status,
      "Ruling 84 F4: modelRoleBootstrapField folds everything but `ready` into `unavailable`, hiding that a human confirmation or an admission is merely pending");
    assert.equal(result.modelRoleBootstrap.code, value.code);
    assert.deepEqual(Object.keys(result.modelRoleBootstrap).sort(), ["code", "status"], "the field stays the closed { status, code } shape");
  });
}

test("GREEN control F4: genuinely unavailable results, unknown statuses and a null result still read `unavailable`", async () => {
  const unavailable = { ok: false, code: "MODEL-ROLE-BOOTSTRAP-GIT-UNAVAILABLE", status: "unavailable", fallbackForbidden: true };
  const first = (await run({ role: "elephant", hooks: {}, modelRole: unavailable })).result;
  assert.deepEqual(first.modelRoleBootstrap, { status: "unavailable", code: "MODEL-ROLE-BOOTSTRAP-GIT-UNAVAILABLE" });
  const unknown = { ok: false, code: "MODEL-ROLE-BOOTSTRAP-SOMETHING-NEW", status: "surprising-new-status" };
  const second = (await run({ role: "elephant", hooks: {}, modelRole: unknown })).result;
  assert.deepEqual(second.modelRoleBootstrap, { status: "unavailable", code: "MODEL-ROLE-BOOTSTRAP-SOMETHING-NEW" },
    "the passthrough is a closed allowlist, not an open echo of any status");
  const third = (await run({ role: "elephant", hooks: {}, modelRole: null })).result;
  assert.deepEqual(third.modelRoleBootstrap, { status: "unavailable", code: "MODEL-ROLE-BOOTSTRAP-UNAVAILABLE" });
});

test("RED F2 (Ruling 84, ASSUMED NAME R5): the preflight's readback call carries readOnly: true in its argument bag (seam spy)", async () => {
  const { modelRoleCalls } = await run({ role: "elephant", hooks: {}, modelRole: modelRoleReady });
  assert.equal(modelRoleCalls.length, 1, "precondition: the preflight ran the readback exactly once");
  assert.equal(typeof modelRoleCalls[0].rootDir, "string", "precondition: the existing argument bag is intact");
  assert.equal(modelRoleCalls[0].readOnly, true,
    "Ruling 84 F2: the preflight's model-role readback must be read-only (the process-entry call site is pinned in model-role-bootstrap.readonly.test.mjs)");
});

test("ENFORCEMENT: an absent role is the Elephant (strict default) -> stale mandatory hook is non-ready", async () => {
  await assertBaseline(undefined);
  const { result } = await run({ role: undefined, hooks: { preCommit: "refresh" } });
  assert.deepEqual(result.mandatoryHookReadiness.refreshAvailable, [PRE_COMMIT], "precondition: pre-commit reads stale");
  assertElephantMustRefresh(result, [PRE_COMMIT]);
});

// ---------------------------------------------------------------------------------------------------------------
// Controls -- the enforcement must not leak outside the Elephant's mandatory hooks. Green today, green after.
// ---------------------------------------------------------------------------------------------------------------

for (const role of ["goldfish", "critic"]) {
  test(`CONTROL: ${role} readback is unaffected by stale hooks (they never install)`, async () => {
    const baseline = await assertBaseline(role);
    const { result } = await run({ role, hooks: { preCommit: "refresh", commitMsg: "refresh", prePush: "refresh" } });
    assert.deepEqual(result.mandatoryHookReadiness.refreshAvailable, [PRE_COMMIT, COMMIT_MSG],
      "precondition: the stale hooks are still reported (informational readback unchanged)");
    assert.equal(result.status, "ready");
    assert.equal(pipelineStartPreflightExitCode(result), 0);
    assert.deepEqual(result.nextAction, baseline.nextAction, "same action as with current hooks; no refresh action for this role");
  });
}

test("CONTROL: Elephant, only the ADVISORY pre-push hook stale -> still ready (assumption: pre-push is not mandatory)", async () => {
  const baseline = await assertBaseline("elephant");
  const { result } = await run({ role: "elephant", hooks: { prePush: "refresh" } });
  assert.deepEqual(result.cloneProvisioning.refreshAvailable, [PRE_PUSH], "precondition: pre-push reads stale");
  assert.equal(result.mandatoryHookReadiness.status, "ready");
  assert.equal(result.status, "ready");
  assert.deepEqual(result.nextAction, baseline.nextAction);
});

// ---------------------------------------------------------------------------------------------------------------
// Point 2 -- the preflight runs the model-role bootstrap itself and returns it as a REQUIRED readback field.
// ---------------------------------------------------------------------------------------------------------------

for (const role of [undefined, "elephant", "goldfish", "critic"]) {
  test(`ENFORCEMENT: every ready envelope carries modelRoleBootstrap (role: ${role ?? "absent"})`, async () => {
    const { result, modelRoleCalls } = await run({ role, hooks: {}, modelRole: modelRoleReady });
    assert.equal(result.status, "ready", "precondition: ready envelope");
    assert.ok(result.modelRoleBootstrap !== undefined && result.modelRoleBootstrap !== null,
      "a ready envelope without modelRoleBootstrap lets the bootstrap skip the model-role step silently");
    assert.equal(typeof result.modelRoleBootstrap, "object");
    assert.equal(typeof result.modelRoleBootstrap.status, "string");
    assert.equal(typeof result.modelRoleBootstrap.code, "string");
    assert.equal(modelRoleCalls.length, 1, "the preflight must run the model-role bootstrap itself, exactly once");
  });
}

test("ENFORCEMENT: a ready model-role bootstrap is passed through as its own status and code", async () => {
  const { result } = await run({ role: "elephant", hooks: {}, modelRole: modelRoleReady });
  assert.equal(result.status, "ready", "precondition: ready envelope");
  assert.ok(result.modelRoleBootstrap, "modelRoleBootstrap must be present");
  assert.equal(result.modelRoleBootstrap.status, "ready");
  assert.equal(result.modelRoleBootstrap.code, "MODEL-ROLE-BOOTSTRAP-READY");
});

test("ENFORCEMENT: `unavailable` with its code is a legal value and does not downgrade the envelope", async () => {
  const { result } = await run({ role: "elephant", hooks: {}, modelRole: modelRoleUnavailable });
  assert.equal(result.status, "ready", "unavailable model-role bootstrap is reported, not gating");
  assert.ok(result.modelRoleBootstrap, "modelRoleBootstrap must be present even when unavailable");
  assert.equal(result.modelRoleBootstrap.status, "unavailable");
  assert.equal(result.modelRoleBootstrap.code, "MODEL-ROLE-BOOTSTRAP-STORE-UNAVAILABLE");
});

test("ENFORCEMENT: a bootstrap that throws is still a present field (`unavailable`), never an absent one", async () => {
  const { result, modelRoleCalls } = await run({ role: "elephant", hooks: {}, modelRole: new Error("simulated bootstrap failure") });
  assert.equal(result.status, "ready", "precondition: ready envelope");
  assert.ok(result.modelRoleBootstrap, "an exception must be folded into the field, not swallowed into absence");
  assert.equal(result.modelRoleBootstrap.status, "unavailable");
  assert.equal(typeof result.modelRoleBootstrap.code, "string");
  assert.equal(modelRoleCalls.length, 1, "the field must come from the bootstrap the preflight itself ran (and that threw)");
});

// ---------------------------------------------------------------------------------------------------------------
// Point 3 -- a plugin update under an onboarded project yields ONE typed nextAction (the refresh), not a two-step repair.
// ---------------------------------------------------------------------------------------------------------------

test("TODO: plugin update under an onboarded project -> one typed refresh nextAction, not a two-step repair", {
  todo: "not expressible at the preflight seam: the preflight only distinguishes ProjectOnboardingReadyError code "
    + "PORG-NOT-READY (never onboarded, projection drift and cleanup residue all fold into it) and answers with the "
    + "guided-driver / inspect action; projection drift after a plugin update is classified inside project-onboarding-v3, "
    + "and no 'refresh' action or command exists in any contract yet (backlog item "
    + "pipeline.plugin-update-under-an-onboarded-project-derails-the-next-session-into-repair: 'Not designed here'; "
    + "pipeline.typed-plugin-update-next-action has no design). Pin it in the project-onboarding-v3 suite once the "
    + "refresh action's identity is decided.",
});
