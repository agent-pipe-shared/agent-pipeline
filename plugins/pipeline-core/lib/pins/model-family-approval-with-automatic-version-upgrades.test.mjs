// SPDX-License-Identifier: SUL-1.0
// Pin for backlog item pipeline.model-family-approval-with-automatic-version-upgrades (AC-212).
// Acceptance points covered (real modules, synthetic Ed25519 keys, no mocks of the behaviour under test):
//   A1 gpt-6-sol -> gpt-6.1-sol and gpt-5.6-luna -> gpt-6-luna, no new signature, catalogue-order independent.
//   A2 6.10 beats 6.2 numerically (and a lexicographic mirror provably fails the same assertion: RED).
//   A3 only an explicit signed PO pin selects an older version; unpin returns to latest; foreign family /
//      scope / lookalike names are never mapped by similarity.
//   A4 one rule for all three runners and every Luna route of the real family route source.
//   A5 unknown effort, missing effort, incomplete/stale catalogue, missing current model refuse concretely.
//   A6 a signed v1 exact-ID policy migrates once (proof preserved), then versions need no new signature.
// NOT covered here (open): real dispatch id / Offline-Compact CLI / installed-host acceptance (host-held).
import assert from "node:assert/strict";
import test from "node:test";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { canonical } from "../po-approval-proof.mjs";
import { createModelRolePolicyApprovalIntent } from "../model-role-approved-policy.mjs";
import { verifyModelFamilyAuthority, verifyModelFamilyPinDecision } from "../model-family-authority.mjs";
import { evaluateModelFamilySelection } from "../model-family-latest-selection.mjs";
import { registeredModelFamilyTaskRoutes } from "../model-family-route-source.mjs";
import { createModelFamilyInvocationEntry } from "../model-family-invocation.mjs";
import { createModelFamilyAcceptanceHost } from "../model-family-acceptance.mjs";
import { EXECUTION_RUNNERS, pass } from "../model-family-execution.mjs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const sha = (v) => createHash("sha256").update(v).digest("hex");
const digest = (v) => sha(canonical(v));
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const publicPem = publicKey.export({ format: "pem", type: "spki" });
const trustAnchors = [{ keyReference: "synthetic-fixture-key", publicKeySha256: sha(publicPem) }];
const candidate = { commit: "1".repeat(40), tree: "2".repeat(40) };
const proofFor = (intentSha) => ({ schema: "pipeline.po-approval-proof.v1", intentSha256: intentSha,
  keyReference: trustAnchors[0].keyReference, publicKey: publicPem,
  signatureBase64: sign(null, Buffer.from(intentSha), privateKey).toString("base64") });

function source(rows) {
  const taskRoutes = rows.map(({ taskRoute, runner = "codex", role, effort, selector, state = "default" }) =>
    ({ taskRoute, runner, role, effort, state, selector: { kind: "model-id", value: selector } }));
  const bySlot = new Map();
  for (const t of taskRoutes) if (t.state !== "unavailable") bySlot.set(`${t.runner}:${t.role}:${t.effort}`,
    { runner: t.runner, role: t.role, effort: t.effort, selector: t.selector });
  return { ok: true, taskRoutes, configuredRoutes: [...bySlot.values()] };
}
function legacyFixture() {
  const rows = [
    { taskRoute: "duty.implement", role: "worker", effort: "high", selector: "gpt-5.6-luna" },
    { taskRoute: "duty.mechanic", role: "efficient", effort: "high", selector: "gpt-5.6-luna" },
    { taskRoute: "duty.critic_normal", role: "frontier", effort: "medium", selector: "gpt-6-sol" },
    { taskRoute: "duty.critic_high_risk", role: "frontier", effort: "max", selector: "gpt-6-sol" },
    { taskRoute: "profile.epic.design_phase", runner: "claude", role: "frontier", effort: "xhigh", selector: "opus", state: "unavailable" },
  ];
  const historicRouteSource = source(rows);
  const approvedPolicies = historicRouteSource.configuredRoutes.map((c) => ({ runner: c.runner, role: c.role,
    effort: c.effort, policy: { schema: "pipeline.model-role-policy.v1", runner: c.runner, role: c.role,
      approved: [{ modelId: c.selector.value, rank: 1, efforts: ["high", "medium", "xhigh", "max"],
        compatibilityEvidenceSha256: "a".repeat(64) }] } }));
  const approvalIntent = createModelRolePolicyApprovalIntent({ routeSource: historicRouteSource, approvedPolicies, candidateAtApproval: candidate });
  const bundle = { schema: "pipeline.model-role-approved-policy.v1", candidateAtApproval: candidate, approvedPolicies, approvalIntent,
    proof: proofFor(approvalIntent.sha256) };
  return { historicRouteSource, bundle, rawBundleBytes: Buffer.from(JSON.stringify(bundle)) };
}
function makeTarget(old) {
  const rows = [
    { taskRoute: "duty.implement", role: "worker", effort: "high", oldRole: "worker", oldEffort: "high", model: "gpt-5.6-luna", family: "luna", floor: [5, 6], adapter: "b".repeat(64) },
    { taskRoute: "duty.mechanic", role: "efficient", effort: "medium", oldRole: "efficient", oldEffort: "high", model: "gpt-5.6-luna", family: "luna", floor: [5, 6], adapter: "b".repeat(64) },
    { taskRoute: "duty.critic_normal", role: "frontier", effort: "xhigh", oldRole: "frontier", oldEffort: "medium", model: "gpt-6-sol", family: "sol", floor: [6], adapter: "a".repeat(64) },
    { taskRoute: "duty.critic_high_risk", role: "frontier", effort: "max", oldRole: "frontier", oldEffort: "max", model: "gpt-6-sol", family: "astra", floor: [6], adapter: "c".repeat(64) },
  ];
  const routeSource = source([...rows.map((r) => ({ ...r, selector: `target-${r.family}` })),
    { taskRoute: "profile.epic.design_phase", runner: "claude", role: "frontier", effort: "xhigh", selector: "opus", state: "unavailable" }]);
  const assignments = rows.map((r) => ({ runner: "codex", role: r.role, effort: r.effort, taskRoutes: [r.taskRoute],
    familyId: r.family, adapterContractSha256: r.adapter, minimumVersion: r.floor, update: "latest" }));
  const projection = rows.map((r) => ({ runner: "codex", taskRoute: r.taskRoute, role: r.role, effort: r.effort,
    historicRole: r.oldRole, historicEffort: r.oldEffort, historicModelId: r.model, familyId: r.family,
    minimumVersion: r.floor, adapterContractSha256: r.adapter }));
  const sortedFloors = assignments.map((a) => ({ runner: a.runner, taskRoute: a.taskRoutes[0], role: a.role,
    effort: a.effort, familyId: a.familyId, minimumVersion: a.minimumVersion }))
    .sort((a, b) => JSON.stringify([a.runner, a.taskRoute, a.role, a.effort]).localeCompare(JSON.stringify([b.runner, b.taskRoute, b.role, b.effort])));
  const migration = { schema: "pipeline.model-family-migration.v1", historicBundleByteSha256: sha(old.rawBundleBytes),
    historicApprovalIntentSha256: old.bundle.approvalIntent.sha256,
    historicRouteSourceSha256: digest({ taskRoutes: old.historicRouteSource.taskRoutes, configuredRoutes: old.historicRouteSource.configuredRoutes }),
    targetRouteSourceSha256: digest({ taskRoutes: routeSource.taskRoutes, configuredRoutes: routeSource.configuredRoutes }),
    familyProjectionSha256: digest(projection), adapterContractSha256s: ["a".repeat(64), "b".repeat(64), "c".repeat(64)],
    preservedFloorsSha256: digest(sortedFloors) };
  const subject = { revision: "model-family-v2", predecessorAuthoritySha256: null,
    routeSourceSha256: migration.targetRouteSourceSha256, assignments, migration };
  const subjectSha256 = digest(subject);
  const approvalIntent = { value: { schema: "pipeline.po-approval-intent.v1", kind: "model-role-policy",
    featureId: "model-role-routes", planSha256: subject.routeSourceSha256, specSha256: subjectSha256,
    candidate, policyRevision: "model-family-v2", subjectSha256, decision: "approved" } };
  approvalIntent.sha256 = sha(canonical(approvalIntent.value));
  const bundle = { schema: "pipeline.model-family-approved-policy.v2", candidateAtApproval: candidate, subject, approvalIntent,
    proof: proofFor(approvalIntent.sha256) };
  return { routeSource, projection, bundle };
}
function signedPin(authority, subject) {
  const subjectSha256 = digest(subject);
  const value = { schema: "pipeline.po-approval-intent.v1", kind: "model-role-policy", featureId: "model-role-routes",
    planSha256: authority.authority.subject.routeSourceSha256, specSha256: subjectSha256,
    candidate, policyRevision: "model-family-pin-v1", subjectSha256, decision: subject.decision === "pin" ? "approved" : "released" };
  const approvalIntent = { value, sha256: sha(canonical(value)) };
  return { schema: "pipeline.model-family-pin-decision.v1", subject, approvalIntent, proof: proofFor(approvalIntent.sha256) };
}
function migratedAuthority() {
  const old = legacyFixture(); const target = makeTarget(old);
  const result = verifyModelFamilyAuthority({ bundle: target.bundle, routeSource: target.routeSource, trustAnchors,
    predecessor: { rawBundleBytes: old.rawBundleBytes, historicRouteSource: old.historicRouteSource, migrationProjection: target.projection } });
  assert.equal(result.ok, true, result.code);
  return result.value;
}

// ---- selection fixtures (same shapes as the module's adjacent test) ----
const NOW = "2026-10-01T12:00:30.000Z";
const slotOf = (a) => JSON.stringify([a.runner, a.taskRoute, a.role, a.effort]);
const toAssignment = (a) => ({ runner: a.runner, taskRoute: a.taskRoute, role: a.role, effort: a.effort,
  familyId: a.familyId, adapterContractSha256: a.adapterContractSha256, minimumVersion: a.minimumVersion, update: "latest" });
const variant = (a, modelId, efforts = [a.effort]) => ({ modelId, canonicalModelId: null, aliasEvidenceSha256: null,
  visible: true, selectable: true, efforts, capabilityEvidenceSha256: efforts === null ? null : sha("c"),
  compatibilityBySlotSha256: { [slotOf(a)]: sha("b") } });
const release = (a, familyId, version, modelId, efforts) => ({ releaseId: `${familyId}-${version.join(".")}`, familyId, version,
  released: true, groupingEvidenceSha256: sha("g"), variants: [variant(a, modelId, efforts)] });
const discovery = (a, records, o = {}) => ({ schema: "pipeline.model-family-discovery.v1", runner: a.runner,
  installationBindingSha256: sha("i"), accountBindingSha256: sha("a"), hostProcessBindingSha256: sha("p"),
  adapterContractSha256: a.adapterContractSha256, mode: "complete-catalogue", observedAt: "2026-10-01T12:00:00.000Z",
  expiresAt: "2026-10-01T12:01:00.000Z", rawEvidenceSha256: sha("r"), coverageEvidenceSha256: sha("v"),
  compatibilityEvidenceSha256: null, records, latestAliasEvidenceSha256: null, ...o });
const ctx = (a, modelId, o = {}) => ({
  coverage: { familyId: a.familyId, coverageEvidenceSha256: sha("v"), unknownTargetFamilyEvidenceSha256s: [] },
  hardEligibility: { runner: a.runner, taskRoute: a.taskRoute, role: a.role, effort: a.effort, evidenceSha256: sha("h"),
    minimumVersion: null, deniedModelIds: [] },
  variantRule: null,
  compatibility: { runner: a.runner, taskRoute: a.taskRoute, role: a.role, effort: a.effort, modelId, evidenceSha256: sha("b") },
  latestAlias: null, ...o });
function pick(a, records, expectModel, { pinSelection = null, now = NOW, d = discovery(a, records) } = {}) {
  return evaluateModelFamilySelection({ assignment: a, discovery: d, watermark: null, pinSelection,
    context: ctx(a, expectModel), now });
}
const baseSol = () => toAssignment({ runner: "codex", taskRoute: "duty.critic_normal", role: "frontier", effort: "xhigh",
  familyId: "sol", adapterContractSha256: "a".repeat(64), minimumVersion: [6] });

test("A1 sol 6 -> 6.1 and luna 5.6 -> 6 are selected automatically, regardless of catalogue order, on a migrated signed authority", () => {
  const authority = migratedAuthority();
  const find = (route) => toAssignment(authority.assignments.find((x) => x.taskRoute === route));
  const sol = find("duty.critic_normal"); const luna = find("duty.implement");
  assert.equal(sol.familyId, "sol"); assert.equal(luna.familyId, "luna");
  const solRecs = [release(sol, "sol", [6], "gpt-6-sol"), release(sol, "sol", [6, 1], "gpt-6.1-sol")];
  for (const recs of [solRecs, [...solRecs].reverse()]) {
    const r = pick(sol, recs, "gpt-6.1-sol");
    assert.equal(r.ok, true, r.code); assert.equal(r.value.selectedModelId, "gpt-6.1-sol");
    assert.equal(r.value.selection, "latest"); assert.equal(r.value.pinDecisionSha256, null);
  }
  const lunaRecs = [release(luna, "luna", [5, 6], "gpt-5.6-luna"), release(luna, "luna", [6], "gpt-6-luna")];
  for (const recs of [lunaRecs, [...lunaRecs].reverse()]) {
    const r = pick(luna, recs, "gpt-6-luna");
    assert.equal(r.ok, true, r.code); assert.equal(r.value.selectedModelId, "gpt-6-luna");
  }
});

test("A2 6.10 beats 6.2 numerically; a lexicographic mirror fails the same assertion (RED proof)", () => {
  const a = baseSol();
  const recs = [release(a, "sol", [6, 2], "m-62"), release(a, "sol", [6, 10], "m-610")];
  for (const o of [recs, [...recs].reverse()]) assert.equal(pick(a, o, "m-610").value.selectedModelId, "m-610");
  const mirror = (records) => [...records].sort((x, y) => x.version.join(".") < y.version.join(".") ? 1 : -1)[0].variants[0].modelId;
  assert.equal(mirror(recs), "m-62", "mirror (lexicographic) picks 6.2 so the numeric assertion above is discriminating");
});

test("A3 explicit signed pin selects the older version only for its scope; unpin returns to latest; lookalikes never map", () => {
  const authority = migratedAuthority();
  const a = toAssignment(authority.assignments.find((x) => x.taskRoute === "duty.critic_normal"));
  const recs = [release(a, "sol", [6], "gpt-6-sol"), release(a, "sol", [6, 1], "gpt-6.1-sol")];
  const s1 = { decision: "pin", authoritySha256: authority.authoritySha256, runner: "codex", familyId: "sol",
    taskRoutes: ["duty.critic_normal"], role: "frontier", effort: "xhigh", modelId: "gpt-6-sol",
    predecessorDecisionSha256: null, revision: 1 };
  const pinned = verifyModelFamilyPinDecision({ decision: signedPin(authority, s1), authority, trustAnchors });
  assert.equal(pinned.ok, true, pinned.code);
  const pinSelection = { decisionSha256: pinned.value.decisionSha256, authoritySha256: authority.authoritySha256, runner: "codex",
    familyId: "sol", taskRoutes: ["duty.critic_normal"], role: "frontier", effort: "xhigh", modelId: "gpt-6-sol", revision: 1 };
  const withPin = pick(a, recs, "gpt-6-sol", { pinSelection });
  assert.equal(withPin.ok, true, withPin.code); assert.equal(withPin.value.selectedModelId, "gpt-6-sol");
  assert.equal(withPin.value.selection, "explicit-po-pin");
  assert.equal(pick(a, recs, "gpt-6.1-sol").value.selectedModelId, "gpt-6.1-sol", "no pin: latest wins");
  const unpin = verifyModelFamilyPinDecision({ decision: signedPin(authority, { ...s1, decision: "unpin", modelId: null,
    predecessorDecisionSha256: pinned.value.decisionSha256, revision: 2 }), authority, previousDecision: pinned.value, trustAnchors });
  assert.equal(unpin.ok, true, unpin.code); assert.equal(unpin.value.state, "unpinned");
  assert.equal(pick(a, recs, "gpt-6.1-sol").value.selectedModelId, "gpt-6.1-sol", "after unpin: latest again");
  assert.equal(pick(a, recs, "gpt-6-sol", { pinSelection: { ...pinSelection, familyId: "luna" } }).code, "PIN_INVALID");
  assert.equal(pick(a, recs, "gpt-6-sol", { pinSelection: { ...pinSelection, taskRoutes: ["duty.read"] } }).code, "PIN_INVALID");
  // new family / lookalike name is never assigned by similarity to the sol assignment.
  const moon = release(a, "solar", [9], "gpt-9-solar");
  const r = pick(a, [...recs, moon], "gpt-6.1-sol");
  assert.equal(r.value.selectedModelId, "gpt-6.1-sol"); assert.deepEqual(r.value.unassignedFamilyIds, ["solar"]);
  assert.equal(pick(a, [moon], "gpt-9-solar").code, "FAMILY_RELEASE_UNAVAILABLE");
});

test("A4 one rule across all three runners and every Luna route of the real family route source", () => {
  const src = registeredModelFamilyTaskRoutes();
  assert.equal(src.ok, true, src.code);
  const launchable = src.taskRoutes.filter((r) => r.state !== "unavailable");
  for (const runner of ["codex", "claude", "antigravity"]) {
    const route = launchable.find((r) => r.runner === runner);
    assert.ok(route, `${runner} has a launchable route`);
    const a = toAssignment({ ...route, familyId: "sol", adapterContractSha256: sha(runner), minimumVersion: [6] });
    const recs = [release(a, "sol", [6], "old"), release(a, "sol", [6, 10], "new"), release(a, "sol", [6, 2], "mid")];
    assert.equal(pick(a, recs, "new").value.selectedModelId, "new", runner);
  }
  const lunaRoutes = launchable.filter((r) => /luna/u.test(r.selector.value));
  assert.ok(lunaRoutes.length > 0, "the family route source has Luna routes");
  for (const route of lunaRoutes) {
    const a = toAssignment({ ...route, familyId: "luna", adapterContractSha256: sha("luna"), minimumVersion: [5, 6] });
    const recs = [release(a, "luna", [5, 6], "gpt-5.6-luna"), release(a, "luna", [6], "gpt-6-luna")];
    assert.equal(pick(a, recs, "gpt-6-luna").value.selectedModelId, "gpt-6-luna", route.taskRoute);
  }
});

test("A5 effort, incomplete/stale catalogue and missing current model refuse concretely, never fall back", () => {
  const a = baseSol(); const older = release(a, "sol", [6], "older");
  assert.equal(pick(a, [older, release(a, "sol", [6, 1], "hi", ["high"])], "hi").code, "CURRENT_EFFORT_UNAVAILABLE");
  assert.equal(pick(a, [older, release(a, "sol", [6, 1], "unk", null)], "unk").code, "CURRENT_EFFORT_UNKNOWN");
  assert.equal(pick(a, [older], "older", { now: "2026-10-01T12:01:00.000Z" }).code, "DISCOVERY_STALE");
  const unknown = ctx(a, "older", { coverage: { familyId: "sol", coverageEvidenceSha256: sha("v"), unknownTargetFamilyEvidenceSha256s: [sha("u")] } });
  assert.equal(evaluateModelFamilySelection({ assignment: a, discovery: discovery(a, [older]), context: unknown, now: NOW }).code,
    "FAMILY_VERSION_UNRECOGNIZED");
  assert.equal(pick(a, [{ ...older, released: false }], "older").code, "FAMILY_RELEASE_UNAVAILABLE");
  const floor = { ...a, minimumVersion: [6, 1] };
  assert.equal(pick(floor, [older], "older").code, "DOWNGRADE_REFUSED");
});

test("A6 migration keeps the v1 proof, needs one signature, and later versions need none; tampering is refused", () => {
  const old = legacyFixture(); const target = makeTarget(old);
  const predecessor = { rawBundleBytes: old.rawBundleBytes, historicRouteSource: old.historicRouteSource, migrationProjection: target.projection };
  const ok = verifyModelFamilyAuthority({ bundle: target.bundle, routeSource: target.routeSource, trustAnchors, predecessor });
  assert.equal(ok.ok, true, ok.code); assert.equal(ok.value.assignments.length, 4);
  const forged = structuredClone(old.bundle); forged.proof.signatureBase64 = "AA==";
  const bad = verifyModelFamilyAuthority({ bundle: target.bundle, routeSource: target.routeSource, trustAnchors,
    predecessor: { ...predecessor, rawBundleBytes: Buffer.from(JSON.stringify(forged)) } });
  assert.equal(bad.ok, false);
  const dropped = structuredClone(target.bundle); dropped.subject.assignments = dropped.subject.assignments.slice(1);
  assert.equal(verifyModelFamilyAuthority({ bundle: dropped, routeSource: target.routeSource, trustAnchors, predecessor }).ok, false);
  const a = toAssignment(ok.value.assignments.find((x) => x.taskRoute === "duty.critic_normal"));
  assert.equal(pick(a, [release(a, "sol", [6, 3], "gpt-6.3-sol")], "gpt-6.3-sol").value.selectedModelId, "gpt-6.3-sol");
});

// ======================================================================================================
// Extension ALF-C-P20-05B: bootstrap CLI path (B*), real dispatch-ID path (D*), installed-vs-candidate
// acceptance separation (C*). Real modules and real CLIs; the only injected pieces are the documented
// seams (runtimeHost / familyInvocationEntry / readGitState / readCandidate / makeInvocationId) and the
// synthetic acceptance ports of model-family-acceptance.test.mjs. No git fixture is created here.
// ======================================================================================================
const PLUGIN = fileURLToPath(new URL("../../", import.meta.url));
const ROOT_DIR = resolve(PLUGIN, "..", "..");
const GIT = { candidateCommit: "3".repeat(40), candidateTree: "4".repeat(40), commonDir: ROOT_DIR };
const AUTH = sha("authority");
const SESSION_ENV = { CLAUDE_CODE_SESSION_ID: "sess-05b" };

// A synthetic runtime host that, like a real active host, resolves the signed assignment and prepares a receipt
// whose selected model is the automatically upgraded one (gpt-6.1-sol); it records every prepare for assertions.
function syntheticHost({ activation = { ok: true, status: "active", authoritySha256: AUTH }, selectedModelId = "gpt-6.1-sol" } = {}) {
  const prepared = [];
  const routes = registeredModelFamilyTaskRoutes().taskRoutes;
  const host = {
    observeActivation: () => activation,
    root: () => ({ privateRoot: ROOT_DIR }),
    resolveInvocationContext: ({ runner, requestedSessionId, invocationId, taskRoute }) => {
      const r = routes.find((x) => x.runner === runner && x.taskRoute === taskRoute);
      return { ok: true, key: { runner, installationBindingSha256: sha("i"), accountBindingSha256: sha("a"),
        sessionId: requestedSessionId, invocationId }, candidateCommit: GIT.candidateCommit, candidateTree: GIT.candidateTree,
        assignment: { runner, taskRoute, role: r.role, effort: r.effort, familyId: "sol" } };
    },
    withFreshDiscovery: async (_req, fn) => fn(),
    store: () => ({ prepare: ({ key, assignment }) => {
      const route = routes.find((x) => x.runner === assignment.runner && x.taskRoute === assignment.taskRoute);
      prepared.push(key.invocationId);
      return { ok: true, code: "SYNTHETIC-PREPARED", value: { receipt: { kind: "model-family-invocation", runner: key.runner,
        sessionId: key.sessionId, invocationId: key.invocationId, candidateCommit: GIT.candidateCommit, candidateTree: GIT.candidateTree,
        taskRoute: assignment.taskRoute, role: route.role, effort: route.effort, selectedModelId, authoritySha256: AUTH,
        discoverySha256: sha("d"), receiptSha256: sha(`r${key.invocationId}`), packetBindingSha256: sha(`p${key.invocationId}`) } } };
    } }),
  };
  return { host, prepared };
}
const claudeRoute = () => registeredModelFamilyTaskRoutes().taskRoutes.find((r) => r.runner === "claude" && r.state !== "unavailable");
let idCounter = 0; const nextId = () => `inv-05b-${++idCounter}`;

test("B1 bootstrap CLI path (family active): one receipt per launchable route, upgraded model carried, no legacy fallback", async () => {
  const { runModelRoleBootstrap, modelRoleBootstrapCliResult, modelRoleBootstrapExitCode } = await import("../../scripts/model-role-bootstrap.mjs");
  const { host, prepared } = syntheticHost();
  const entry = createModelFamilyInvocationEntry({ runtimeHost: host });
  const r = await runModelRoleBootstrap({ rootDir: ROOT_DIR, runner: "claude", env: SESSION_ENV, familyInvocationEntry: entry,
    readGitState: () => GIT });
  assert.equal(r.ok, true, r.code); assert.equal(r.code, "MODEL-FAMILY-BOOTSTRAP-PROJECTION-READY");
  const expected = registeredModelFamilyTaskRoutes().taskRoutes.filter((x) => x.runner === "claude" && x.state !== "unavailable");
  assert.equal(r.receipts.length, expected.length); assert.ok(r.receipts.length > 0);
  assert.equal(new Set(prepared).size, prepared.length, "distinct invocation id per route");
  assert.ok(r.receipts.every((x) => x.selectedModelId === "gpt-6.1-sol" && x.sessionId === "sess-05b"));
  assert.equal(modelRoleBootstrapExitCode(modelRoleBootstrapCliResult(r)), 0);
});

test("B2 bootstrap refusals are concrete and forbid legacy fallback (inactive, uncertain, no identity, git, source, id, prepare)", async () => {
  const { runModelRoleBootstrap, prepareFamilyBootstrapProjection, modelRoleBootstrapCliResult, modelRoleBootstrapExitCode } =
    await import("../../scripts/model-role-bootstrap.mjs");
  const run = (o = {}) => runModelRoleBootstrap({ rootDir: ROOT_DIR, runner: "claude", env: SESSION_ENV, readGitState: () => GIT,
    familyInvocationEntry: createModelFamilyInvocationEntry({ runtimeHost: syntheticHost().host }), ...o });
  const withActivation = (activation) => ({ familyInvocationEntry: createModelFamilyInvocationEntry({ runtimeHost: syntheticHost({ activation }).host }) });
  const un = await run(withActivation({ ok: true, status: "weird" }));
  assert.equal(un.code, "MODEL-FAMILY-ACTIVATION-UNCERTAIN"); assert.equal(un.fallbackForbidden, true);
  const bad = await run(withActivation({ ok: false, code: "MODEL-FAMILY-ACTIVATION-UNCERTAIN" }));
  assert.equal(bad.fallbackForbidden, true);
  const noId = await run({ env: {} });
  assert.equal(noId.code, "MODEL-ROLE-SESSION-IDENTITY-UNAVAILABLE"); assert.equal(noId.fallbackForbidden, true);
  const noGit = await run({ readGitState: () => { throw new Error("x"); } });
  assert.equal(noGit.code, "MODEL-ROLE-BOOTSTRAP-GIT-UNAVAILABLE"); assert.equal(noGit.fallbackForbidden, true);
  assert.equal((await run({ readGitState: () => ({ candidateCommit: "x", candidateTree: "y" }) })).code, "MODEL-ROLE-BOOTSTRAP-GIT-UNAVAILABLE");
  assert.equal((await run({ familyRouteSource: { ok: false } })).code, "MODEL-FAMILY-BOOTSTRAP-SOURCE");
  assert.equal((await run({ familyRouteSource: { ok: true, taskRoutes: [] } })).code, "MODEL-FAMILY-BOOTSTRAP-PROJECTION-EMPTY");
  const entry = createModelFamilyInvocationEntry({ runtimeHost: syntheticHost().host });
  const args = { familyInvocationEntry: entry, runner: "claude", sessionId: "sess-05b", ...GIT };
  const idFail = await prepareFamilyBootstrapProjection({ ...args, makeInvocationId: () => { throw new Error("no id"); } });
  assert.equal(idFail.code, "MODEL-FAMILY-INVOCATION-ID-UNAVAILABLE"); assert.equal(idFail.fallbackForbidden, true);
  const refused = await prepareFamilyBootstrapProjection({ ...args, familyInvocationEntry: { prepareModelFamilyInvocation: async () => ({ ok: false, code: "MODEL-FAMILY-STORE-UNAVAILABLE", retryable: true }) } });
  assert.equal(refused.code, "MODEL-FAMILY-STORE-UNAVAILABLE"); assert.equal(refused.retryable, true);
  assert.equal(modelRoleBootstrapExitCode(modelRoleBootstrapCliResult(refused)), 1, "a forbidden-fallback refusal exits non-zero");
  const optional = modelRoleBootstrapCliResult({ ok: false, code: "MODEL-ROLE-BOOTSTRAP-SOURCE", status: "unavailable" });
  assert.equal(optional.fallback, "legacy-v3"); assert.equal(modelRoleBootstrapExitCode(optional), 0);
});

test("B3 offline bootstrap CLI binary: bad usage exits 1 with a usage line and prints no model result", () => {
  const cli = join(PLUGIN, "scripts", "model-role-bootstrap.mjs");
  const r = spawnSync(process.execPath, [cli, "--runner", "codex"], { encoding: "utf8" });
  assert.equal(r.status, 1); assert.match(r.stderr, /Usage: model-role-bootstrap\.mjs/u); assert.equal(r.stdout, "");
  const antigravityBasic = spawnSync(process.execPath, [cli, "--repo-root", ROOT_DIR, "--runner", "antigravity"], { encoding: "utf8" });
  assert.equal(antigravityBasic.status, 1, "antigravity needs a native hook session id; the basic form is refused");
});

test("D1 dispatch-ID path (family active): real entry prepares with a fresh id and returns the upgraded model, ready", async () => {
  const { selectModelRoleForTask } = await import("../../scripts/model-role-dispatch-select.mjs");
  const { host, prepared } = syntheticHost(); const route = claudeRoute();
  const entry = createModelFamilyInvocationEntry({ runtimeHost: host });
  const r = await selectModelRoleForTask({ rootDir: ROOT_DIR, runner: "claude", taskRoute: route.taskRoute, env: SESSION_ENV,
    familyInvocationEntry: entry, makeInvocationId: nextId, readCandidate: () => GIT });
  assert.equal(r.ok, true, r.code); assert.equal(r.code, "MODEL-FAMILY-DISPATCH-READY"); assert.equal(r.status, "ready");
  assert.equal(r.modelId, "gpt-6.1-sol"); assert.equal(r.effort, route.effort); assert.equal(r.receipt.invocationId, prepared[0]);
  assert.ok(r.invocation && typeof r.invocation === "object");
  const again = await selectModelRoleForTask({ rootDir: ROOT_DIR, runner: "claude", taskRoute: route.taskRoute, env: SESSION_ENV,
    familyInvocationEntry: entry, makeInvocationId: nextId, readCandidate: () => GIT });
  assert.notEqual(again.receipt.invocationId, r.receipt.invocationId, "each dispatch gets its own invocation id");
});

test("D2 dispatch-ID refusals: INVOCATION-ID-UNAVAILABLE, ENTRY-UNAVAILABLE, entry input and route refusals never fall back", async () => {
  const { selectModelRoleForTask } = await import("../../scripts/model-role-dispatch-select.mjs");
  const route = claudeRoute();
  const base = { rootDir: ROOT_DIR, runner: "claude", taskRoute: route.taskRoute, env: SESSION_ENV, readCandidate: () => GIT };
  const entry = createModelFamilyInvocationEntry({ runtimeHost: syntheticHost().host });
  const noId = await selectModelRoleForTask({ ...base, familyInvocationEntry: entry, makeInvocationId: () => { throw new Error("no id"); } });
  assert.equal(noId.ok, false); assert.equal(noId.code, "MODEL-FAMILY-INVOCATION-ID-UNAVAILABLE"); assert.equal(noId.fallbackForbidden, true);
  const noEntry = await selectModelRoleForTask({ ...base, familyInvocationEntry: { observeActivation: () => ({ ok: true, status: "active" }) } });
  assert.equal(noEntry.code, "MODEL-FAMILY-ENTRY-UNAVAILABLE"); assert.equal(noEntry.fallbackForbidden, true);
  const badId = await selectModelRoleForTask({ ...base, familyInvocationEntry: entry, makeInvocationId: () => "bad id with spaces" });
  assert.equal(badId.code, "MODEL-FAMILY-INVOCATION-INPUT"); assert.equal(badId.fallbackForbidden, true);
  const noRoute = await selectModelRoleForTask({ ...base, taskRoute: "duty.no-such-route", familyInvocationEntry: entry, makeInvocationId: nextId });
  assert.equal(noRoute.ok, false); assert.equal(noRoute.fallbackForbidden, true);
  const noGit = await selectModelRoleForTask({ ...base, familyInvocationEntry: entry, readCandidate: () => { throw new Error("g"); } });
  assert.equal(noGit.code, "MODEL-ROLE-SELECT-GIT-UNAVAILABLE"); assert.equal(noGit.fallbackForbidden, true);
  const noSess = await selectModelRoleForTask({ ...base, env: {}, familyInvocationEntry: entry });
  assert.equal(noSess.code, "MODEL-ROLE-SESSION-IDENTITY-UNAVAILABLE"); assert.equal(noSess.fallbackForbidden, true);
  const uncertain = await selectModelRoleForTask({ ...base, familyInvocationEntry: { observeActivation: () => { throw new Error("u"); } } });
  assert.equal(uncertain.code, "MODEL-FAMILY-ACTIVATION-UNCERTAIN"); assert.equal(uncertain.fallbackForbidden, true);
});

test("D3 createModelFamilyInvocationEntry: incomplete host is refused at construction; inactive/uncertain/mismatching context never yield a receipt", async () => {
  assert.throws(() => createModelFamilyInvocationEntry({ runtimeHost: { observeActivation: () => ({}) } }), TypeError);
  const input = { kind: "dispatch", runner: "claude", taskRoute: claudeRoute().taskRoute, sessionId: "s1", invocationId: "i1", ...GIT };
  delete input.commonDir;
  const inactive = await createModelFamilyInvocationEntry({ runtimeHost: syntheticHost({ activation: { ok: true, status: "inactive" } }).host }).prepareModelFamilyInvocation(input);
  assert.equal(inactive.code, "MODEL-FAMILY-INACTIVE"); assert.equal(inactive.status, "inactive");
  const wrongId = createModelFamilyInvocationEntry({ runtimeHost: syntheticHost().host });
  assert.equal((await wrongId.prepareModelFamilyInvocation({ ...input, extra: 1 })).code, "MODEL-FAMILY-INVOCATION-INPUT");
  assert.equal((await wrongId.prepareModelFamilyInvocation({ ...input, candidateTree: input.candidateCommit })).code, "MODEL-FAMILY-INVOCATION-INPUT");
  const drift = createModelFamilyInvocationEntry({ runtimeHost: { ...syntheticHost().host,
    resolveInvocationContext: (x) => ({ ...syntheticHost().host.resolveInvocationContext(x), candidateCommit: "9".repeat(40) }) } });
  assert.equal((await drift.prepareModelFamilyInvocation(input)).code, "MODEL-FAMILY-INVOCATION-CONTEXT-MISMATCH");
  const forged = createModelFamilyInvocationEntry({ runtimeHost: syntheticHost({ activation: { ok: true, status: "active", authoritySha256: sha("other-authority") } }).host });
  assert.equal((await forged.prepareModelFamilyInvocation(input)).code, "MODEL-FAMILY-RECEIPT-BINDING");
});

test("D4 dispatch-select CLI binary: bad usage exits 64 with usage text and no JSON result", () => {
  const cli = join(PLUGIN, "scripts", "model-role-dispatch-select.mjs");
  const r = spawnSync(process.execPath, [cli, "--repo-root", ROOT_DIR, "--runner", "bogus", "--task-route", "duty.implement"], { encoding: "utf8" });
  assert.equal(r.status, 64); assert.match(r.stderr, /Usage: model-role-dispatch-select\.mjs/u); assert.equal(r.stdout, "");
});

// ---- C: installed-host evidence is separate from candidate (source) acceptance ----
const H = sha("spec"), T = sha("family-authority");
const bind = { candidateCommit: "5".repeat(40), candidateTree: "6".repeat(40), designSpecSha256: H, familyAuthoritySha256: T };
const accInput = { ...bind, independentReviewSha256s: [sha("review")] };
const accSource = (qualified) => ({ status: "passed", evidenceSha256: H, contracts: EXECUTION_RUNNERS.map((runner) => ({ runner,
  adapterContractSha256: sha(`adapter-${runner}`), testEvidenceSha256: T, sourceEvidenceSha256: H,
  providerQualification: qualified ? "qualified" : "unqualified" })) });
const absent = ({ runner }) => pass("SYNTHETIC", { binding: bind, evidenceKind: "absent",
  result: { runner, status: "not-installed", evidenceSha256: H, reasonCode: "OPTIONAL_EXECUTABLE_ABSENT" } });
const accHost = (o = {}) => createModelFamilyAcceptanceHost({
  verifyIndependentReviews: ({ binding: b, independentReviewSha256s }) => pass("SYNTHETIC_REVIEW", { bindingSha256: digest(b), independentReviewSha256s }),
  readSourceResult: () => pass("SYNTHETIC_SOURCE", { binding: bind, sourceResult: accSource(o.qualified === true) }),
  readInstalledResult: o.readInstalledResult ?? absent, verifyInstalledQualification: o.verifyInstalledQualification });

test("C1 candidate (source) acceptance passes while installed hosts are absent, and the receipt keeps them separate", async () => {
  const host = accHost(); const r = await host.assessModelFamilyAcceptance(accInput);
  assert.equal(r.ok, true, r.code); const receipt = host.readAcceptance(r.value).value;
  assert.equal(receipt.sourceResult.status, "passed");
  assert.deepEqual(receipt.installedResults.map((x) => x.status), ["not-installed", "not-installed", "not-installed"]);
  assert.equal(Object.hasOwn(receipt, "allInstalledPassed"), false);
});

test("C2 a candidate/source pass never upgrades installed evidence: native pass without a qualified adapter or qualifier port is unqualified", async () => {
  const native = ({ runner }) => pass("SYNTHETIC", { binding: bind, evidenceKind: "native",
    result: { runner, status: "passed", evidenceSha256: H, reasonCode: "NATIVE_MATCHED" } });
  const unq = accHost({ readInstalledResult: native }); const a = await unq.assessModelFamilyAcceptance(accInput);
  assert.ok(unq.readAcceptance(a.value).value.installedResults.every((x) => x.status === "unqualified" && x.reasonCode === "ADAPTER_CONTRACT_UNQUALIFIED"));
  const noPort = accHost({ readInstalledResult: native, qualified: true }); const b = await noPort.assessModelFamilyAcceptance(accInput);
  assert.ok(noPort.readAcceptance(b.value).value.installedResults.every((x) => x.status === "unqualified" && x.reasonCode === "INSTALLED_QUALIFICATION_UNAVAILABLE"),
    "default verifyInstalledQualification is unavailable, so no installed pass can appear");
});

test("C3 installed evidence from another candidate cannot satisfy this candidate; source failure is not rescued by installed passes", async () => {
  const other = { ...bind, candidateCommit: "7".repeat(40) };
  const stale = accHost({ readInstalledResult: ({ runner }) => pass("STALE", { binding: other, evidenceKind: "native",
    result: { runner, status: "passed", evidenceSha256: H, reasonCode: "NATIVE_MATCHED" } }) });
  assert.equal((await stale.assessModelFamilyAcceptance(accInput)).code, "INSTALLED_EVIDENCE_UNVERIFIED");
  const failedSource = createModelFamilyAcceptanceHost({
    verifyIndependentReviews: ({ binding: b, independentReviewSha256s }) => pass("R", { bindingSha256: digest(b), independentReviewSha256s }),
    readSourceResult: () => pass("S", { binding: bind, sourceResult: { ...accSource(true), status: "failed" } }),
    readInstalledResult: ({ runner }) => pass("I", { binding: bind, evidenceKind: "native", result: { runner, status: "passed", evidenceSha256: H, reasonCode: "OK" } }),
    verifyInstalledQualification: ({ binding: b, runner, result, adapterContractSha256 }) => pass("Q", { runner, bindingSha256: digest(b), evidenceSha256: result.evidenceSha256, adapterContractSha256 }) });
  assert.equal((await failedSource.assessModelFamilyAcceptance(accInput)).code, "SOURCE_ACCEPTANCE_FAILED");
});

test("C4 independently qualified native installation is recorded per runner without changing the other runners", async () => {
  const host = accHost({ qualified: true,
    readInstalledResult: ({ runner }) => pass("SYNTHETIC", { binding: bind, evidenceKind: runner === "codex" ? "native" : "absent",
      result: { runner, status: runner === "codex" ? "passed" : "not-installed", evidenceSha256: H, reasonCode: runner === "codex" ? "NATIVE_MATCHED" : "OPTIONAL_EXECUTABLE_ABSENT" } }),
    verifyInstalledQualification: ({ binding: b, runner, result, adapterContractSha256 }) => pass("Q", { runner, bindingSha256: digest(b), evidenceSha256: result.evidenceSha256, adapterContractSha256 }) });
  const r = await host.assessModelFamilyAcceptance(accInput); const rows = host.readAcceptance(r.value).value.installedResults;
  assert.equal(rows.find((x) => x.runner === "codex").status, "passed");
  assert.equal(rows.filter((x) => x.status === "not-installed").length, EXECUTION_RUNNERS.length - 1);
});

// ---- E: PO decision D99 (2026-10-22): a version inside an assigned family is automatic, a NEW family is the PO's call ----
// These cases pin the family-active selection rule that the bootstrap (B1) and dispatch (D1) paths consume. The legacy
// model-role V3 bootstrap path (family authority inactive) has no family concept and is NOT covered here (open design call).
const watermarkOf = (a, version) => ({ runner: a.runner, accountBindingSha256: sha("a"), installationBindingSha256: sha("i"),
  familyId: a.familyId, version, admittedReceiptSha256: sha("receipt") });

test("E1 D99 an in-family version bump after an admitted watermark is followed silently: latest, no pin, no approval or proposal field", () => {
  const a = baseSol();
  const recs = [release(a, "sol", [6], "gpt-6-sol"), release(a, "sol", [6, 1], "gpt-6.1-sol")];
  const r = evaluateModelFamilySelection({ assignment: a, discovery: discovery(a, recs), watermark: watermarkOf(a, [6]),
    pinSelection: null, context: ctx(a, "gpt-6.1-sol"), now: NOW });
  assert.equal(r.ok, true, r.code);
  assert.equal(r.value.selectedModelId, "gpt-6.1-sol");
  assert.equal(r.value.selection, "latest");
  assert.equal(r.value.pinDecisionSha256, null);
  assert.deepEqual(r.value.watermarkBefore, [6]);
  assert.deepEqual(r.value.watermarkAfter, [6, 1], "the bump advances the watermark without a new confirmation");
  assert.deepEqual(Object.keys(r.value).filter((k) => /approv|propos|confirm|acknowledg|signature/iu.test(k)), []);
});

test("E2 D99 a NEW family never changes the assigned selection and is only reported as unassigned for the PO", () => {
  const a = baseSol();
  const sol = release(a, "sol", [6], "gpt-6-sol"); const astra = release(a, "astra", [9], "gpt-9-astra");
  const withNew = evaluateModelFamilySelection({ assignment: a, discovery: discovery(a, [sol, astra]), watermark: watermarkOf(a, [6]),
    pinSelection: null, context: ctx(a, "gpt-6-sol"), now: NOW });
  assert.equal(withNew.ok, true, withNew.code);
  assert.equal(withNew.value.selectedModelId, "gpt-6-sol", "a higher version of an unassigned family is not selected");
  assert.deepEqual(withNew.value.unassignedFamilyIds, ["astra"], "the new family is surfaced for the PO decision");
  assert.deepEqual(withNew.value.watermarkAfter, [6], "the assigned family's watermark is untouched by the new family");
  assert.equal(pick(a, [astra], "gpt-9-astra").code, "FAMILY_RELEASE_UNAVAILABLE", "a new family alone is never assigned by similarity");
});

test("E3 D99 an unreleased or unrecognised newer version changes nothing: the assigned selection stays, or the call refuses concretely", () => {
  const a = baseSol();
  const older = release(a, "sol", [6], "gpt-6-sol");
  const unreleased = { ...release(a, "sol", [6, 1], "gpt-6.1-sol"), released: false };
  const kept = evaluateModelFamilySelection({ assignment: a, discovery: discovery(a, [older, unreleased]), watermark: watermarkOf(a, [6]),
    pinSelection: null, context: ctx(a, "gpt-6-sol"), now: NOW });
  assert.equal(kept.ok, true, kept.code);
  assert.equal(kept.value.selectedModelId, "gpt-6-sol");
  assert.deepEqual(kept.value.watermarkAfter, [6], "an unavailable version does not advance the watermark");
  const unknown = ctx(a, "gpt-6-sol", { coverage: { familyId: "sol", coverageEvidenceSha256: sha("v"), unknownTargetFamilyEvidenceSha256s: [sha("u")] } });
  assert.equal(evaluateModelFamilySelection({ assignment: a, discovery: discovery(a, [older]), watermark: watermarkOf(a, [6]),
    pinSelection: null, context: unknown, now: NOW }).code, "FAMILY_VERSION_UNRECOGNIZED");
  assert.equal(evaluateModelFamilySelection({ assignment: a, discovery: discovery(a, [release(a, "sol", [5], "gpt-5-sol")]), watermark: watermarkOf(a, [6]),
    pinSelection: null, context: ctx(a, "gpt-5-sol"), now: NOW }).code, "DOWNGRADE_REFUSED", "a lower version never replaces the admitted one");
});

test("C5 genuinely installed runner acceptance (host-held)", { skip: "native-pending: owner Elephant/PO host, due before AC-212 PO acceptance, host = a machine with qualified installed codex/claude/antigravity runners; the real readInstalledResult/verifyInstalledQualification ports behind createModelFamilyAcceptanceHost (model-family-acceptance.mjs) and the real createModelFamilyRuntimeHost resolveCurrentInvocationIdentity are not available in this session" }, () => {});
