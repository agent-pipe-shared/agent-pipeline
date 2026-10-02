// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync, linkSync, symlinkSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { registerTestCaseCompletion } from "./test-case-completion.mjs";
import { createModelFamilyDiscoveryHost, RULE_FIELDS, pass, fail, digest as discoveryDigest } from "./model-family-discovery.mjs";
import { createCodexFamilyAdapter } from "./model-family-codex-adapter.mjs";
import { canonical, createPoApprovalIntent } from "./po-approval-proof.mjs";
import { createModelFamilyHostController, readHeldModelFamilyInvocation,
  consumeModelFamilyHostDriverContext } from "./model-family-host-store.mjs";
import { createModelFamilyMainPrelaunch } from "./model-family-main-prelaunch.mjs";
import { verifyModelFamilyAuthority } from "./model-family-authority.mjs";
import { MODEL_FAMILY_HOST_STORE_LIMITS } from "./model-family-host-store.mjs";

const cases = [];
function test(name, run) {
  const id = `MFHS${String(cases.length + 1).padStart(3, "0")}`;
  cases.push({ id, name, run: async (...args) => {
    try { return await run(...args); }
    catch (error) { process.stderr.write(`${id} ${name}: ${error?.stack ?? error}\n`); throw error; }
  } });
}

const sha = (value) => createHash("sha256").update(value).digest("hex");
const digest = (value) => sha(canonical(value));
const NOW_MS = Date.parse("2026-10-01T12:00:30.000Z");
const NOW = new Date(NOW_MS).toISOString();
const OBSERVED = "2026-10-01T12:00:00.000Z";
const EXPIRES = "2026-10-01T12:01:00.000Z";
const route = { runner: "codex", taskRoute: "duty.deep", role: "frontier", effort: "medium", familyId: "fixture" };
const key = (invocationId = "invoke-1") => ({ runner: "codex", installationBindingSha256: sha("install"),
  accountBindingSha256: sha("account"), sessionId: "session-1", invocationId });
const assignmentSlot = (taskRoute = route.taskRoute) => JSON.stringify([route.runner, taskRoute, route.role, route.effort]);
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const publicPem = publicKey.export({ format: "pem", type: "spki" });
const trustAnchors = [{ keyReference: "synthetic-s4-fixture", publicKeySha256: sha(publicPem) }];
const candidateAtApproval = { commit: "1".repeat(40), tree: "2".repeat(40) };
const candidateCurrentA = { candidateCommit: "3".repeat(40), candidateTree: "4".repeat(40) };
const candidateCurrentB = { candidateCommit: "5".repeat(40), candidateTree: "6".repeat(40) };

function signedBundle({ changed = false, adapterSha = sha("adapter"), taskRoute = route.taskRoute } = {}) {
  const selector = { kind: "model-id", value: changed ? "fixture-model-b" : "fixture-model-a" };
  const routeSource = { ok: true,
    taskRoutes: [{ taskRoute, runner: route.runner, role: route.role, effort: route.effort, state: "default", selector }],
    configuredRoutes: [{ runner: route.runner, role: route.role, effort: route.effort, selector }] };
  const assignments = [{ runner: route.runner, role: route.role, effort: route.effort,
    taskRoutes: [taskRoute], familyId: route.familyId, adapterContractSha256: adapterSha,
    minimumVersion: [6], update: "latest" }];
  const subject = { revision: "model-family-v2", predecessorAuthoritySha256: null,
    routeSourceSha256: digest({ taskRoutes: routeSource.taskRoutes, configuredRoutes: routeSource.configuredRoutes }),
    assignments, migration: null };
  const subjectSha256 = digest(subject);
  const intentValue = { schema: "pipeline.po-approval-intent.v1", kind: "model-role-policy",
    featureId: "model-role-routes", planSha256: subject.routeSourceSha256, specSha256: subjectSha256,
    candidate: candidateAtApproval, policyRevision: "model-family-v2", subjectSha256, decision: "approved" };
  const approvalIntent = { value: intentValue, sha256: digest(intentValue) };
  const bundle = { schema: "pipeline.model-family-approved-policy.v2", candidateAtApproval, subject, approvalIntent,
    proof: { schema: "pipeline.po-approval-proof.v1", intentSha256: approvalIntent.sha256,
      keyReference: trustAnchors[0].keyReference, publicKey: publicPem,
      signatureBase64: sign(null, Buffer.from(approvalIntent.sha256), privateKey).toString("base64") } };
  return { bundle, routeSource, assignments };
}

function signedSuccessor(predecessor, { wrongPredecessor = false, changedSource = false } = {}) {
  const base = signedBundle({ changed: changedSource });
  const extraSelector = { kind: "model-id", value: "model-added-family" };
  base.routeSource.taskRoutes.push({ taskRoute: "duty.extra", runner: "codex", role: "efficient", effort: "low",
    state: "default", selector: extraSelector });
  base.routeSource.configuredRoutes.push({ runner: "codex", role: "efficient", effort: "low", selector: extraSelector });
  base.assignments.push({ runner: "codex", role: "efficient", effort: "low", taskRoutes: ["duty.extra"],
    familyId: "added-family", adapterContractSha256: sha("added-adapter"), minimumVersion: [1], update: "latest" });
  const subject = { revision: "model-family-v2",
    predecessorAuthoritySha256: wrongPredecessor ? sha("wrong predecessor") : predecessor.authoritySha256,
    routeSourceSha256: digest({ taskRoutes: base.routeSource.taskRoutes, configuredRoutes: base.routeSource.configuredRoutes }),
    assignments: base.assignments, migration: null };
  const subjectSha256 = digest(subject);
  const value = { schema: "pipeline.po-approval-intent.v1", kind: "model-role-policy", featureId: "model-role-routes",
    planSha256: subject.routeSourceSha256, specSha256: subjectSha256, candidate: candidateAtApproval,
    policyRevision: "model-family-v2", subjectSha256, decision: "approved" };
  const approvalIntent = { value, sha256: digest(value) };
  const bundle = { schema: "pipeline.model-family-approved-policy.v2", candidateAtApproval, subject, approvalIntent,
    proof: { schema: "pipeline.po-approval-proof.v1", intentSha256: approvalIntent.sha256,
      keyReference: trustAnchors[0].keyReference, publicKey: publicPem,
      signatureBase64: sign(null, Buffer.from(approvalIntent.sha256), privateKey).toString("base64") } };
  return { bundle, routeSource: base.routeSource, assignments: base.assignments };
}

function verifyAuthority(inputs, predecessor = null) {
  return verifyModelFamilyAuthority({ ...inputs, trustAnchors, predecessor });
}

function release(modelId, version = [6, 2], taskRoute = route.taskRoute) {
  return { releaseId: `fixture-${version.join("-")}`, familyId: "fixture", version, released: true,
    groupingEvidenceSha256: sha("group"), variants: [{ modelId, canonicalModelId: null,
      aliasEvidenceSha256: null, visible: true, selectable: true, efforts: ["medium"],
      capabilityEvidenceSha256: sha("capability"), compatibilityBySlotSha256: { [assignmentSlot(taskRoute)]: sha("compat") } }] };
}

function prep(modelId = "model-fixture-62", version = [6, 2], overrides = {}, taskRoute = route.taskRoute) {
  const discovery = { schema: "pipeline.model-family-discovery.v1", runner: "codex",
    installationBindingSha256: key().installationBindingSha256, accountBindingSha256: key().accountBindingSha256,
    hostProcessBindingSha256: sha("process"), adapterContractSha256: sha("adapter"), mode: "complete-catalogue",
    observedAt: OBSERVED, expiresAt: EXPIRES, rawEvidenceSha256: sha("raw"), coverageEvidenceSha256: sha("coverage"),
    compatibilityEvidenceSha256: null, records: [release(modelId, version, taskRoute)], latestAliasEvidenceSha256: null,
    ...overrides.discovery };
  const context = { coverage: { familyId: "fixture", coverageEvidenceSha256: sha("coverage"), unknownTargetFamilyEvidenceSha256s: [] },
    hardEligibility: { runner: "codex", taskRoute, role: "frontier", effort: "medium",
      evidenceSha256: sha("hard"), minimumVersion: null, deniedModelIds: [] }, variantRule: null,
    compatibility: { runner: "codex", taskRoute, role: "frontier", effort: "medium",
      modelId, evidenceSha256: sha("compat") }, latestAlias: null, ...overrides.context };
  return { discovery, context, observedAt: discovery.observedAt };
}

function discoveryPort(prepared) {
  const handle = Object.freeze(Object.create(null));
  const value = structuredClone(prepared.discovery);
  const freeze = (item) => { if (item && typeof item === "object" && !Object.isFrozen(item)) {
    Object.values(item).forEach(freeze); Object.freeze(item); } return item; };
  const host = Object.freeze({ readDiscovery(candidate) { return candidate === handle
    ? { ok: true, code: "DISCOVERY_READ", value: freeze(value) }
    : { ok: false, code: "DISCOVERY_HANDLE_REQUIRED", retryable: false }; } });
  return { discoveryHost: host, discoveryHandle: handle, context: prepared.context };
}

async function actualS2Port({ modelId = "model-fixture-62", version = [6, 2] } = {}) {
  let latest;
  const contract = { schema: "pipeline.model-family-adapter-contract.v1", runner: "codex", familyId: "fixture",
    discoveryModes: ["complete-catalogue"], providerEvidenceSha256s: [sha("provider-contract")] };
  const rules = {};
  for (const name of RULE_FIELDS) {
    contract[name] = { id: `s4-${name}`, version: 1, sha256: sha(name) };
    const run = name === "identityRule" ? ({ phase, entry }) => phase === "coverage"
      ? pass("SYNTHETIC", { mode: "complete-catalogue", evidenceSha256: sha("coverage"), latestAliasEvidenceSha256: null })
      : pass("SYNTHETIC", { model: entry.model })
      : name === "releaseGroupingRule" ? ({ entry }) => pass("SYNTHETIC", { releaseId: `fixture-${version.join("-")}`,
        familyId: "fixture", groupingEvidenceSha256: sha("group") })
        : name === "versionRule" ? () => pass("SYNTHETIC", version)
          : name === "variantSelectionRule" ? ({ entry }) => pass("SYNTHETIC", { modelId: entry.model,
            canonicalModelId: null, aliasEvidenceSha256: null })
            : name === "selectabilityRule" ? () => pass("SYNTHETIC", { released: true, visible: true, selectable: true })
              : name === "effortRule" ? () => pass("SYNTHETIC", { efforts: ["medium"], capabilityEvidenceSha256: sha("capability") })
                : () => fail("SYNTHETIC_UNUSED");
    rules[contract[name].id] = { version: 1, sha256: sha(name), run };
  }
  const host = createModelFamilyDiscoveryHost({ rules, clock: () => NOW,
    capture: async (contextValue) => pass("SYNTHETIC_CAPTURE", { bindings: contextValue.bindings,
      observedAt: contextValue.observedAt, source: "S4-test", pages: [
      { request: { id: 1, method: "model/list", params: { cursor: null, limit: 100, includeHidden: true } },
        responseBytes: JSON.stringify({ id: 1, result: { data: [{ id: modelId, model: modelId, hidden: false,
          version, released: true, supportedReasoningEfforts: [{ reasoningEffort: "medium" }] }], nextCursor: null } }) },
    ] }),
    verifyProviderContract: ({ contractSha256, contract: c }) => pass("SYNTHETIC_CONTRACT", {
      contractSha256, providerEvidenceSha256s: c.providerEvidenceSha256s }),
    compatibility: ({ runner, record, variant, slot }) => {
      const discovery = host.readDiscovery(latest).value;
      return pass("SYNTHETIC_COMPAT", { subjectSha256: discoveryDigest({ runner, releaseId: record.releaseId,
        modelId: variant.modelId, ...slot, discoverySha256: discoveryDigest(discovery),
        adapterContractSha256: discovery.adapterContractSha256 }), evidenceSha256: sha("compat") });
    } });
  const context = host.createContext({ runner: "codex", bindings: { installationBindingSha256: key().installationBindingSha256,
    accountBindingSha256: key().accountBindingSha256, hostProcessBindingSha256: sha("process") }, observedAt: OBSERVED,
    expiresAt: EXPIRES }).value;
  const qualified = host.qualifyContract(contract);
  const adapter = createCodexFamilyAdapter(host);
  const raw = await adapter.captureRawDiscovery(context);
  if (!raw.ok) throw new Error(`S2 capture: ${raw.code}`);
  const coverage = adapter.verifyCoverage(raw.value, context, qualified.value);
  if (!coverage.ok) throw new Error(`S2 coverage: ${coverage.code}`);
  const normalized = adapter.normalizeReleases(raw.value, qualified.value, coverage.value);
  if (!normalized.ok) throw new Error(`S2 normalize: ${normalized.code}`);
  latest = normalized.value;
  const compatible = adapter.verifyCompatibility({ discovery: latest, releaseId: `fixture-${version.join("-")}`, modelId },
    { taskRoute: route.taskRoute, role: route.role, effort: route.effort }, context, qualified.value);
  if (!compatible.ok) throw new Error(`S2 compatibility: ${compatible.code}`);
  return { host, handle: compatible.value.discovery, contractSha256: discoveryDigest(contract), context: prep().context };
}

function fixture({ preparation = null, bundleChangeOnRecheck = false, taskRoute = route.taskRoute } = {}) {
  const data = signedBundle({ taskRoute });
  let authorityReads = 0;
  let preparations = 0;
  let launched = 0;
  let now = NOW_MS;
  let currentCandidate = { ...candidateCurrentA };
  const source = {
    readAuthorityInputs() { authorityReads += 1; return { bundle: data.bundle, routeSource: data.routeSource, trustAnchors, predecessor: null }; },
    readPinInputs() { return []; },
    readFreshDiscovery() { preparations += 1; return discoveryPort(preparation ? preparation(preparations) : prep("model-fixture-62", [6, 2], {}, taskRoute)); },
    readCurrentCandidate() { return { ...currentCandidate }; },
    launchDriver() { launched += 1; return { ok: true, value: { launched: true } }; },
  };
  const root = mkdtempSync(join(tmpdir(), "model-family-host-store-fixture-"));
  return { root, source, controller: createModelFamilyHostController({ rootDir: root, trustedSources: source, clock: () => now }),
    data, setNow(value) { now = value; }, setCandidate(value) { currentCandidate = { ...value }; },
    currentCandidate: () => ({ ...currentCandidate }), counts: () => ({ authorityReads, preparations, launched }) };
}

function activate(f) {
  const result = f.controller.activate();
  assert.equal(result.ok, true, result.code);
  assert.equal(result.state.generation, 0);
  return result;
}

function pinDecision(f, authority, decision, prior = null, modelId = "model-fixture-61") {
  const subject = { decision, authoritySha256: authority.authoritySha256, runner: route.runner,
    familyId: route.familyId, taskRoutes: [route.taskRoute], role: route.role, effort: route.effort,
    modelId: decision === "pin" ? modelId : null, predecessorDecisionSha256: prior?.decisionSha256 ?? null,
    revision: prior ? prior.decision.subject.revision + 1 : 1 };
  const subjectSha256 = digest(subject);
  const intent = createPoApprovalIntent({ kind: "model-role-policy", featureId: "model-role-routes",
    planSha256: authority.authority.subject.routeSourceSha256, specSha256: subjectSha256,
    candidate: authority.authority.candidateAtApproval, policyRevision: "model-family-pin-v1", subjectSha256,
    decision: decision === "pin" ? "approved" : "released" });
  const value = { schema: "pipeline.model-family-pin-decision.v1", subject,
    approvalIntent: intent, proof: { schema: "pipeline.po-approval-proof.v1", intentSha256: intent.sha256,
      keyReference: trustAnchors[0].keyReference, publicKey: publicPem,
      signatureBase64: sign(null, Buffer.from(intent.sha256), privateKey).toString("base64") } };
  return { value, decisionSha256: digest(value), decision: value };
}

function invoke(f, invocationKey = key(), taskRoute = route.taskRoute) {
  return f.controller.prepare({ key: invocationKey, assignment: { ...route, taskRoute } });
}

test("activation marker plus generation index qualify a fresh invocation; failed launch retains its watermark", () => {
  const f = fixture();
  try {
    activate(f);
    const result = invoke(f);
    assert.equal(result?.ok, true, `prepare result: ${JSON.stringify(result)}`);
    assert.equal(result.value.receipt.selectedModelId, "model-fixture-62");
    assert.equal(result.value.receipt.storeGeneration, 1);
    assert.equal(result.value.receipt.selection, "latest");
    assert.equal(result.value.receipt.groupingEvidenceSha256, sha("group"));
    const state = f.controller.readState();
    assert.equal(state.ok, true, state.code);
    assert.deepEqual(state.state.watermarks[0].version, [6, 2]);
    f.source.launchDriver = () => ({ ok: false });
    const launched = f.controller.launch({ invocation: result.value, packetBindingSha256: result.value.receipt.packetBindingSha256 });
    assert.equal(launched.code, "MODEL-FAMILY-LAUNCH-FAILED");
    assert.deepEqual(f.controller.readState().state.watermarks[0].version, [6, 2]);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("trusted asynchronous driver success is awaited while synchronous success remains synchronous", async () => {
  const f = fixture();
  try {
    activate(f);
    const held = invoke(f, key("async-driver-success"));
    assert.equal(held.ok, true, held.code);
    let delivered;
    f.source.launchDriver = async ({ invocation, prelaunchToken }) => {
      await new Promise((resolve) => setTimeout(resolve, 15));
      delivered = { invocation, prelaunchToken };
      return { ok: true, value: { launched: true } };
    };
    const pending = f.controller.launch({ invocation: held.value,
      packetBindingSha256: held.value.receipt.packetBindingSha256 });
    assert.equal(typeof pending?.then, "function", "a thenable driver result produces an awaitable launch result");
    const launched = await pending;
    assert.deepEqual(launched, { ok: true, code: "MODEL-FAMILY-LAUNCH-RETURNED", value: { launched: true } });
    assert.equal(delivered.invocation.invocationId, held.value.receipt.invocationId);
    assert.equal(delivered.invocation.selectedModelId, held.value.receipt.selectedModelId);
    assert.equal(delivered.invocation.effort, held.value.receipt.effort);
    assert.equal(delivered.prelaunchToken.receiptSha256, held.value.receipt.receiptSha256);

    f.source.launchDriver = () => ({ ok: true, value: { launched: "sync" } });
    const synchronous = f.controller.launch({ invocation: held.value,
      packetBindingSha256: held.value.receipt.packetBindingSha256 });
    assert.equal(typeof synchronous?.then, "undefined", "legacy synchronous driver callers stay synchronous");
    assert.equal(synchronous.value.launched, "sync");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("S4 private driver context carries the original sealed invocation and admitted immutable request once", async () => {
  const f = fixture();
  try {
    activate(f);
    const prepared = invoke(f, key("main-driver-context"));
    assert.equal(prepared.ok, true, prepared.code);
    let admitted;
    let received;
    let drivers = 0;
    f.source.admitNativeRequest = ({ invocation, key: actualKey, assignment, request }) => {
      admitted = { invocation, key: actualKey, assignment, request };
      return { ok: true, code: "SYNTHETIC-ADMITTED" };
    };
    f.source.launchDriver = ({ driverContext }) => {
      drivers += 1;
      received = consumeModelFamilyHostDriverContext(driverContext);
      return { ok: true, value: { accepted: true } };
    };
    const request = { schema: "pipeline.synthetic-main-request.v1", purpose: "profile-main",
      runner: "codex", sessionId: "session-1", invocationId: "main-driver-context",
      taskRoute: route.taskRoute, selectedModelId: prepared.value.receipt.selectedModelId,
      effort: prepared.value.receipt.effort, payload: { model: prepared.value.receipt.selectedModelId } };
    const capability = await f.controller.admitNativeRequest({ invocation: prepared.value, request });
    assert.equal(capability.ok, true, capability.code);
    request.payload.model = "caller-mutated";
    const launched = f.controller.launch({ invocation: prepared.value,
      packetBindingSha256: prepared.value.receipt.packetBindingSha256,
      nativeRequestCapability: capability.value });
    assert.equal(launched.ok, true, launched.code);
    assert.equal(received.ok, true, received.code);
    assert.equal(received.value.invocation, prepared.value, "bridge preserves S4 handle identity");
    assert.deepEqual(received.value.key, admitted.key);
    assert.deepEqual(received.value.assignment, admitted.assignment);
    assert.equal(received.value.nativeRequest.payload.model, prepared.value.receipt.selectedModelId);
    assert.equal(Object.isFrozen(received.value.nativeRequest), true);
    assert.equal(Object.isFrozen(received.value.nativeRequest.payload), true);
    assert.equal(typeof received.value.revalidate, "function");
    const revalidated = received.value.revalidate();
    assert.equal(revalidated.ok, true, revalidated.code);
    assert.equal(received.value.revalidate().code, "MODEL-FAMILY-RECHECK-CONSUMED");
    assert.equal(consumeModelFamilyHostDriverContext(Object.freeze(Object.create(null))).code,
      "MODEL-FAMILY-DRIVER-CONTEXT-REQUIRED");
    assert.equal(consumeModelFamilyHostDriverContext(received.value).code,
      "MODEL-FAMILY-DRIVER-CONTEXT-REQUIRED", "a readback object is not a bridge capability");
    assert.equal(f.controller.launch({ invocation: prepared.value,
      packetBindingSha256: prepared.value.receipt.packetBindingSha256,
      nativeRequestCapability: capability.value }).code, "MODEL-FAMILY-NATIVE-CAPABILITY-REQUIRED");
    assert.equal(drivers, 1, "neither context nor admitted request replays to a second driver call");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("S4 trusted driver can complete a correlated synthetic profile-main operation from the original handle", async () => {
  const taskRoute = "profile.main";
  const f = fixture({ taskRoute });
  try {
    activate(f);
    const prepared = invoke(f, key("main-prelaunch-positive"), taskRoute);
    assert.equal(prepared.ok, true, prepared.code);
    const receipt = prepared.value.receipt;
    let applied;
    const port = {
      async applyConfiguration({ configuration }) { applied = structuredClone(configuration); return { ok: true }; },
      async readAppliedConfiguration() { return { ok: true, configuration: structuredClone(applied) }; },
      async launchMain({ configuration }) {
        assert.equal(configuration.binding.modelId, receipt.selectedModelId);
        return { ok: true, operationId: "synthetic-main-operation-1" };
      },
      async readActualMainIdentity({ expected, operationId }) { return { ok: true, identity: {
        kind: "main-session", runner: expected.runner, sessionId: expected.sessionId,
        invocationId: expected.invocationId, taskRoute: expected.taskRoute,
        candidateCommit: expected.candidateCommit, candidateTree: expected.candidateTree,
        modelId: expected.modelId, authoritySha256: expected.authoritySha256,
        adapterContractSha256: expected.adapterContractSha256, packetBindingSha256: expected.packetBindingSha256,
        operationId, mainSessionId: "synthetic-main-session-1" } }; },
    };
    const sourceAdapter = createCodexFamilyAdapter({}, { mainLaunchPort: port });
    f.source.admitNativeRequest = () => ({ ok: true, code: "SYNTHETIC-ADMITTED" });
    f.source.launchDriver = ({ driverContext }) => sourceAdapter.launchMainFromDriverContext(driverContext);
    const request = { schema: "pipeline.model-family-main-request.v1", purpose: "profile-main", operation: "create-main",
      runner: "codex", sessionId: "session-1", invocationId: "main-prelaunch-positive", taskRoute,
      candidateCommit: receipt.candidateCommit, candidateTree: receipt.candidateTree,
      modelId: receipt.selectedModelId, effort: receipt.effort, authoritySha256: receipt.authoritySha256,
      adapterContractSha256: receipt.adapterContractSha256, packetBindingSha256: receipt.packetBindingSha256,
      existingMainSessionId: null, payload: { prompt: "synthetic fixture only" } };
    const capability = await f.controller.admitNativeRequest({ invocation: prepared.value, request });
    assert.equal(capability.ok, true, capability.code);
    const launched = await f.controller.launch({ invocation: prepared.value,
      packetBindingSha256: receipt.packetBindingSha256, nativeRequestCapability: capability.value });
    assert.equal(launched.ok, true, launched.code);
    assert.equal(launched.code, "MAIN_PRELAUNCH_OBSERVED");
    assert.equal(launched.value.mainSessionId, "synthetic-main-session-1");
    assert.equal(applied.schema, "codex.main-session-config.v1");
    assert.equal(applied.binding.taskRoute, taskRoute);
    assert.equal(applied.binding.modelId, receipt.selectedModelId);
    assert.equal(applied.binding.effort, receipt.effort);
    assert.equal(applied.binding.authoritySha256, receipt.authoritySha256);
    assert.equal(applied.binding.adapterContractSha256, receipt.adapterContractSha256);
    assert.equal(applied.binding.packetBindingSha256, receipt.packetBindingSha256);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("profile-main boundary refuses duty routes and existing-main switches before configured operations", async () => {
  for (const scenario of [{ taskRoute: "duty.deep", existingMainSessionId: null },
    { taskRoute: "profile.main", existingMainSessionId: "already-running-main" }]) {
    const f = fixture({ taskRoute: scenario.taskRoute });
    try {
      activate(f);
      const invocationKey = key(`main-refusal-${scenario.taskRoute.replace(".", "-")}`);
      const prepared = invoke(f, invocationKey, scenario.taskRoute);
      assert.equal(prepared.ok, true, prepared.code);
      const receipt = prepared.value.receipt;
      let calls = 0;
      const port = Object.fromEntries(["applyConfiguration", "readAppliedConfiguration", "launchMain", "readActualMainIdentity"]
        .map((name) => [name, async () => { calls += 1; return { ok: true, configuration: {}, operationId: "unexpected" }; }]));
      const sourceAdapter = createCodexFamilyAdapter({}, { mainLaunchPort: port });
      f.source.admitNativeRequest = () => ({ ok: true, code: "SYNTHETIC-ADMITTED" });
      f.source.launchDriver = ({ driverContext }) => sourceAdapter.launchMainFromDriverContext(driverContext);
      const request = { schema: "pipeline.model-family-main-request.v1", purpose: "profile-main", operation: "create-main",
        runner: "codex", sessionId: invocationKey.sessionId, invocationId: invocationKey.invocationId,
        taskRoute: scenario.taskRoute, candidateCommit: receipt.candidateCommit, candidateTree: receipt.candidateTree,
        modelId: receipt.selectedModelId, effort: receipt.effort, authoritySha256: receipt.authoritySha256,
        adapterContractSha256: receipt.adapterContractSha256, packetBindingSha256: receipt.packetBindingSha256,
        existingMainSessionId: scenario.existingMainSessionId };
      const capability = await f.controller.admitNativeRequest({ invocation: prepared.value, request });
      assert.equal(capability.ok, true, capability.code);
      const launched = await f.controller.launch({ invocation: prepared.value,
        packetBindingSha256: receipt.packetBindingSha256, nativeRequestCapability: capability.value });
      assert.equal(launched.code, "MAIN_PRELAUNCH_REQUEST_REFUSED");
      assert.equal(calls, 0);
    } finally { rmSync(f.root, { recursive: true, force: true }); }
  }
});

test("main launch revalidates the sealed candidate after asynchronous config application", async () => {
  const taskRoute = "profile.main";
  const f = fixture({ taskRoute });
  try {
    activate(f);
    const prepared = invoke(f, key("main-prelaunch-candidate-recheck"), taskRoute);
    assert.equal(prepared.ok, true, prepared.code);
    const receipt = prepared.value.receipt;
    let finishApply;
    let launchCount = 0;
    let applied;
    const port = {
      applyConfiguration({ configuration }) { applied = structuredClone(configuration); return new Promise((resolve) => { finishApply = resolve; }); },
      async readAppliedConfiguration() { return { ok: true, configuration: structuredClone(applied) }; },
      async launchMain() { launchCount += 1; return { ok: true, operationId: "must-not-launch" }; },
      async readActualMainIdentity() { throw new Error("must not observe main identity"); },
    };
    const sourceAdapter = createCodexFamilyAdapter({}, { mainLaunchPort: port });
    f.source.admitNativeRequest = () => ({ ok: true, code: "SYNTHETIC-ADMITTED" });
    f.source.launchDriver = ({ driverContext }) => sourceAdapter.launchMainFromDriverContext(driverContext);
    const request = { schema: "pipeline.model-family-main-request.v1", purpose: "profile-main", operation: "create-main",
      runner: "codex", sessionId: "session-1", invocationId: "main-prelaunch-candidate-recheck", taskRoute,
      candidateCommit: receipt.candidateCommit, candidateTree: receipt.candidateTree,
      modelId: receipt.selectedModelId, effort: receipt.effort, authoritySha256: receipt.authoritySha256,
      adapterContractSha256: receipt.adapterContractSha256, packetBindingSha256: receipt.packetBindingSha256,
      existingMainSessionId: null };
    const capability = await f.controller.admitNativeRequest({ invocation: prepared.value, request });
    assert.equal(capability.ok, true, capability.code);
    const launchPromise = f.controller.launch({ invocation: prepared.value,
      packetBindingSha256: receipt.packetBindingSha256, nativeRequestCapability: capability.value });
    await Promise.resolve();
    f.setCandidate(candidateCurrentB);
    finishApply({ ok: true });
    const result = await launchPromise;
    assert.equal(result.code, "MAIN_PRELAUNCH_RECHECK_REFUSED");
    assert.equal(launchCount, 0);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("main launch revalidates signed authority after asynchronous config application", async () => {
  const taskRoute = "profile.main";
  const f = fixture({ taskRoute });
  try {
    activate(f);
    const prepared = invoke(f, key("main-prelaunch-authority-recheck"), taskRoute);
    assert.equal(prepared.ok, true, prepared.code);
    const receipt = prepared.value.receipt;
    let finishApply;
    let launchCount = 0;
    let applied;
    const port = {
      applyConfiguration({ configuration }) { applied = structuredClone(configuration); return new Promise((resolve) => { finishApply = resolve; }); },
      async readAppliedConfiguration() { return { ok: true, configuration: structuredClone(applied) }; },
      async launchMain() { launchCount += 1; return { ok: true, operationId: "must-not-launch" }; },
      async readActualMainIdentity() { throw new Error("must not observe main identity"); },
    };
    const sourceAdapter = createCodexFamilyAdapter({}, { mainLaunchPort: port });
    f.source.admitNativeRequest = () => ({ ok: true, code: "SYNTHETIC-ADMITTED" });
    f.source.launchDriver = ({ driverContext }) => sourceAdapter.launchMainFromDriverContext(driverContext);
    const request = { schema: "pipeline.model-family-main-request.v1", purpose: "profile-main", operation: "create-main",
      runner: "codex", sessionId: "session-1", invocationId: "main-prelaunch-authority-recheck", taskRoute,
      candidateCommit: receipt.candidateCommit, candidateTree: receipt.candidateTree,
      modelId: receipt.selectedModelId, effort: receipt.effort, authoritySha256: receipt.authoritySha256,
      adapterContractSha256: receipt.adapterContractSha256, packetBindingSha256: receipt.packetBindingSha256,
      existingMainSessionId: null };
    const capability = await f.controller.admitNativeRequest({ invocation: prepared.value, request });
    assert.equal(capability.ok, true, capability.code);
    const launchPromise = f.controller.launch({ invocation: prepared.value,
      packetBindingSha256: receipt.packetBindingSha256, nativeRequestCapability: capability.value });
    await Promise.resolve();
    f.source.readAuthorityInputs = () => ({ bundle: null, routeSource: null, trustAnchors: [], predecessor: null });
    finishApply({ ok: true });
    const result = await launchPromise;
    assert.equal(result.code, "MAIN_PRELAUNCH_RECHECK_REFUSED");
    assert.equal(launchCount, 0);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("async driver rejection, malformed results, and unknown dispositions fail closed while unqualified is typed", async () => {
  const f = fixture();
  try {
    activate(f);
    const held = invoke(f, key("async-driver-failures"));
    assert.equal(held.ok, true, held.code);
    const launch = () => f.controller.launch({ invocation: held.value,
      packetBindingSha256: held.value.receipt.packetBindingSha256 });

    f.source.launchDriver = () => { throw new Error("driver threw before returning"); };
    assert.equal(launch().code, "MODEL-FAMILY-LAUNCH-FAILED");
    f.source.launchDriver = () => Promise.reject(new Error("driver transport failed"));
    assert.equal((await launch()).code, "MODEL-FAMILY-LAUNCH-FAILED");
    f.source.launchDriver = () => Promise.resolve({ ok: "true", value: { launched: true } });
    assert.equal((await launch()).code, "MODEL-FAMILY-LAUNCH-FAILED");
    f.source.launchDriver = () => ({ ok: false, code: "ARBITRARY-DRIVER-ERROR", retryable: false });
    assert.equal(launch().code, "MODEL-FAMILY-LAUNCH-FAILED");
    f.source.launchDriver = () => Promise.resolve({ ok: false,
      code: "MODEL-FAMILY-NATIVE-PORT-UNQUALIFIED", retryable: false, detail: "must not cross the boundary" });
    assert.equal((await launch()).code, "MODEL-FAMILY-LAUNCH-FAILED", "open driver errors are not relayed");
    f.source.launchDriver = () => Promise.resolve({ ok: false,
      code: "MODEL-FAMILY-NATIVE-PORT-UNQUALIFIED", retryable: false });
    const unqualified = await launch();
    assert.equal(unqualified.code, "MODEL-FAMILY-NATIVE-PORT-UNQUALIFIED");
    assert.equal(unqualified.retryable, false);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("ordinary repository candidates reuse signed family authority while receipts and replays retain exact candidate bytes", () => {
  const f = fixture();
  try {
    activate(f);
    const authoritySha256 = f.controller.readState().state.authoritySha256;
    const first = invoke(f, key("before-commit"));
    assert.equal(first.ok, true, first.code);
    assert.equal(first.value.receipt.candidateCommit, candidateCurrentA.candidateCommit);
    assert.equal(first.value.receipt.candidateTree, candidateCurrentA.candidateTree);
    const firstReceipt = structuredClone(first.value.receipt);
    f.setCandidate(candidateCurrentB);
    const afterCommit = invoke(f, key("after-commit"));
    assert.equal(afterCommit.ok, true, afterCommit.code);
    assert.equal(afterCommit.value.receipt.authoritySha256, authoritySha256);
    assert.equal(afterCommit.value.receipt.candidateCommit, candidateCurrentB.candidateCommit);
    assert.equal(afterCommit.value.receipt.candidateTree, candidateCurrentB.candidateTree);
    assert.notEqual(afterCommit.value.receipt.packetBindingSha256, firstReceipt.packetBindingSha256);
    const replay = invoke(f, key("before-commit"));
    assert.equal(replay.code, "MODEL-FAMILY-REPLAY");
    assert.deepEqual(replay.value.receipt, firstReceipt);
    const held = readHeldModelFamilyInvocation({ rootDir: f.root, key: key("before-commit") });
    assert.equal(held.ok, true, held.code);
    assert.deepEqual(held.value, firstReceipt);
    const staleLaunch = f.controller.launch({ invocation: first.value,
      packetBindingSha256: firstReceipt.packetBindingSha256 });
    assert.equal(staleLaunch.code, "MODEL-FAMILY-CANDIDATE-SUPERSEDED");
    assert.equal(f.counts().launched, 0);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("current-candidate callback failures and non-closed or invalid OID values refuse before receipt admission", () => {
  const f = fixture();
  try {
    activate(f);
    f.source.readCurrentCandidate = () => { throw new Error("candidate source unavailable"); };
    assert.equal(invoke(f, key("candidate-source-down")).code, "MODEL-FAMILY-CANDIDATE-SOURCE");
    f.source.readCurrentCandidate = () => ({ ...candidateCurrentA, extra: true });
    assert.equal(invoke(f, key("candidate-open-shape")).code, "MODEL-FAMILY-CANDIDATE-SHAPE");
    f.source.readCurrentCandidate = () => ({ candidateCommit: "not-an-oid", candidateTree: candidateCurrentA.candidateTree });
    assert.equal(invoke(f, key("candidate-invalid-oid")).code, "MODEL-FAMILY-CANDIDATE-SHAPE");
    assert.equal(f.controller.readState().receipts.length, 0);
    assert.equal(f.counts().launched, 0);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("candidate drift between preparation capture and locked CAS refuses without sealing", () => {
  const f = fixture();
  try {
    activate(f);
    let reads = 0;
    f.source.readCurrentCandidate = () => (++reads === 1 ? { ...candidateCurrentA } : { ...candidateCurrentB });
    const result = invoke(f, key("candidate-cas-race"));
    assert.equal(result.code, "MODEL-FAMILY-CANDIDATE-SUPERSEDED");
    assert.equal(result.retryable, true);
    assert.equal(reads, 2);
    assert.equal(f.controller.readState().receipts.length, 0);
    assert.equal(f.counts().launched, 0);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("candidate drift at the final prelaunch check prevents the native driver call", () => {
  const f = fixture();
  try {
    activate(f);
    const held = invoke(f, key("candidate-launch-race"));
    assert.equal(held.ok, true, held.code);
    let reads = 0;
    f.source.readCurrentCandidate = () => (++reads === 1 ? { ...candidateCurrentA } : { ...candidateCurrentB });
    const launched = f.controller.launch({ invocation: held.value,
      packetBindingSha256: held.value.receipt.packetBindingSha256 });
    assert.equal(launched.code, "MODEL-FAMILY-CANDIDATE-SUPERSEDED");
    assert.equal(reads, 2);
    assert.equal(f.counts().launched, 0);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("S2 opaque discovery handle is consumed by the host; ordinary JSON and foreign bindings are refused", async () => {
  const f = fixture();
  try {
    const s2 = await actualS2Port();
    Object.assign(f.data, signedBundle({ adapterSha: s2.contractSha256 }));
    f.source.readFreshDiscovery = () => ({ discoveryHost: s2.host, discoveryHandle: s2.handle, context: s2.context });
    activate(f);
    const accepted = invoke(f);
    assert.equal(accepted.ok, true, accepted.code);
    f.source.readFreshDiscovery = () => ({ discoveryHost: s2.host,
      discoveryHandle: { schema: "pipeline.model-family-discovery.v1", admitted: true }, context: s2.context });
    const forged = invoke(f, key("forged-json"));
    assert.equal(forged.ok, false);
    assert.equal(forged.code, "MODEL-FAMILY-DISCOVERY-HANDLE-REQUIRED");
    f.source.readFreshDiscovery = () => discoveryPort({ ...prep(), discovery: { ...prep().discovery,
      installationBindingSha256: sha("other-install") } });
    const wrongInstall = invoke(f, key("wrong-install"));
    assert.equal(wrongInstall.code, "MODEL-FAMILY-DISCOVERY-CONTEXT-MISMATCH");
    f.source.readFreshDiscovery = () => discoveryPort({ ...prep(), discovery: { ...prep().discovery,
      accountBindingSha256: sha("other-account") } });
    const wrongAccount = invoke(f, key("wrong-account"));
    assert.equal(wrongAccount.code, "MODEL-FAMILY-DISCOVERY-CONTEXT-MISMATCH");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("freshness accepts a preparation younger than sixty seconds and rejects one older than sixty", () => {
  const f = fixture();
  try {
    activate(f);
    f.setNow(Date.parse("2026-10-01T12:00:59.999Z"));
    assert.equal(invoke(f, key("fresh-under-sixty")).ok, true);
    f.setNow(Date.parse("2026-10-01T12:01:00.001Z"));
    assert.equal(invoke(f, key("stale-over-sixty")).code, "DISCOVERY_STALE");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("writer contention performs exactly two bounded CAS retries and never launches", () => {
  const f = fixture();
  try {
    activate(f);
    let preparations = 0;
    f.source.readFreshDiscovery = () => {
      preparations += 1;
      if (preparations === 1) writeFileSync(join(f.root, "model-family-host", ".writer.lock"), "busy", { mode: 0o600 });
      return discoveryPort(prep());
    };
    const result = invoke(f, key("bounded-retries"));
    assert.equal(result.code, "CONCURRENT_RESELECTION_REQUIRED");
    assert.equal(preparations, MODEL_FAMILY_HOST_STORE_LIMITS.casRetries + 1);
    assert.equal(f.counts().launched, 0);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("same-key replay returns original held bytes without resolving a newer selection", () => {
  const f = fixture();
  try {
    activate(f);
    const first = invoke(f);
    assert.equal(first.ok, true, first.code);
    const originalBytes = readFileSync(join(f.root, "model-family-host/receipts", `${digest(key())}.json`));
    f.source.readFreshDiscovery = () => { throw new Error("replay must not resolve current model"); };
    const replay = invoke(f);
    assert.equal(replay.code, "MODEL-FAMILY-REPLAY");
    assert.equal(replay.value.receipt.receiptSha256, first.value.receipt.receiptSha256);
    assert.deepEqual(readFileSync(join(f.root, "model-family-host/receipts", `${digest(key())}.json`)), originalBytes);
    const offline = readHeldModelFamilyInvocation({ rootDir: f.root, key: key() });
    assert.equal(offline.ok, true, offline.code);
    assert.equal(offline.value.receiptSha256, first.value.receipt.receiptSha256);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("expired preparation and a disappeared newer head refuse without lowering the watermark", () => {
  const f = fixture();
  try {
    activate(f);
    const first = invoke(f);
    assert.equal(first.ok, true, first.code);
    f.source.readFreshDiscovery = () => discoveryPort(prep("model-fixture-61", [6, 1]));
    const second = invoke(f, key("invoke-2"));
    assert.equal(second.ok, false);
    assert.equal(second.code, "DOWNGRADE_REFUSED");
    assert.deepEqual(f.controller.readState().state.watermarks[0].version, [6, 2]);
    f.source.readFreshDiscovery = () => discoveryPort(prep("model-fixture-62", [6, 2], {
      discovery: { observedAt: "2026-10-01T12:00:00.000Z", expiresAt: "2026-10-01T12:00:10.000Z" },
    }));
    f.setNow(Date.parse("2026-10-01T12:00:11.000Z"));
    const stale = invoke(f, key("invoke-3"));
    assert.equal(stale.ok, false);
    assert.match(stale.code, /STALE/u);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("policy supersession during locked CAS and source freshness cancel the unlaunched attempt", () => {
  const f = fixture();
  try {
    activate(f);
    let changed = false;
    f.source.readFreshDiscovery = () => {
      if (!changed) {
        changed = true;
        const next = signedBundle({ changed: true });
        f.data.bundle = next.bundle;
        f.data.routeSource = next.routeSource;
      }
      return discoveryPort(prep());
    };
    const result = invoke(f);
    assert.equal(result.ok, false);
    assert.equal(result.code, "MODEL-FAMILY-AUTHORITY-SUPERSEDED");
    assert.equal(f.controller.readState().state.generation, 0);
    assert.equal(f.counts().launched, 0);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("pin and unpin decisions changing during CAS cancel both raced selections", () => {
  const f = fixture();
  try {
    activate(f);
    const authority = verifyModelFamilyAuthority({ bundle: f.data.bundle, routeSource: f.data.routeSource,
      trustAnchors, predecessor: null }).value;
    const pin = pinDecision(f, authority, "pin");
    let pinReads = 0;
    f.source.readPinInputs = () => ++pinReads === 1 ? [] : [pin.value];
    const pinRace = invoke(f, key("pin-race"));
    assert.equal(pinRace.code, "MODEL-FAMILY-PIN-SUPERSEDED");
    assert.equal(f.controller.readState().state.generation, 0);

    const pin2 = pinDecision(f, authority, "pin");
    const unpin = pinDecision(f, authority, "unpin", pin2);
    pinReads = 0;
    f.source.readPinInputs = () => ++pinReads === 1 ? [pin2.value] : [pin2.value, unpin.value];
    f.source.readFreshDiscovery = () => discoveryPort(prep("model-fixture-61", [6, 1]));
    const unpinRace = invoke(f, key("unpin-race"));
    assert.equal(unpinRace.code, "MODEL-FAMILY-PIN-SUPERSEDED");
    assert.equal(f.controller.readState().state.generation, 0);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("freshly signed authority successor CAS preserves watermarks and held receipt bytes", () => {
  const f = fixture();
  try {
    activate(f);
    const held = invoke(f, key("before-successor"));
    assert.equal(held.ok, true, held.code);
    const heldPath = join(f.root, "model-family-host", "receipts", `${digest(key("before-successor"))}.json`);
    const heldBytes = readFileSync(heldPath);
    const priorState = f.controller.readState().state;
    const predecessor = verifyAuthority({ bundle: f.data.bundle, routeSource: f.data.routeSource }).value;
    const next = signedSuccessor(predecessor);
    const nextInput = { bundle: next.bundle, routeSource: next.routeSource, trustAnchors };
    f.source.readSuccessorAuthorityInputs = () => nextInput;
    const changed = f.controller.transitionAuthority();
    assert.equal(changed.ok, true, changed.code);
    assert.equal(changed.predecessorAuthoritySha256, predecessor.authoritySha256);
    assert.equal(changed.authoritySha256, digest(next.bundle));
    assert.equal(changed.state.generation, priorState.generation + 1);
    assert.deepEqual(changed.state.watermarks, priorState.watermarks);
    assert.equal(changed.state.invocationIndex.length, priorState.invocationIndex.length);
    assert.deepEqual(readFileSync(heldPath), heldBytes);

    const activeNext = { ...nextInput, predecessor };
    f.source.readAuthorityInputs = () => activeNext;
    const replay = invoke(f, key("before-successor"));
    assert.equal(replay.code, "MODEL-FAMILY-REPLAY");
    assert.equal(replay.value.receipt.receiptSha256, held.value.receipt.receiptSha256);
    assert.deepEqual(readFileSync(heldPath), heldBytes);
    let driverCalls = 0;
    f.source.launchDriver = () => { driverCalls += 1; return { ok: true }; };
    const blockedLaunch = f.controller.launch({ invocation: held.value,
      packetBindingSha256: held.value.receipt.packetBindingSha256 });
    assert.equal(blockedLaunch.code, "MODEL-FAMILY-AUTHORITY-SUPERSEDED");
    assert.equal(driverCalls, 0, "stale authority is rejected before the native driver is called");

    f.source.readFreshDiscovery = () => discoveryPort(prep("model-fixture-61", [6, 1]));
    const rollback = invoke(f, key("same-family-after-new-family"));
    assert.equal(rollback.code, "DOWNGRADE_REFUSED");
    assert.equal(f.controller.readState().state.generation, changed.state.generation);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("unsigned, wrong-predecessor, raced and partial successor transitions fail closed", () => {
  const f = fixture();
  try {
    activate(f);
    const predecessor = verifyAuthority({ bundle: f.data.bundle, routeSource: f.data.routeSource }).value;
    const valid = signedSuccessor(predecessor);
    const invalid = structuredClone(valid);
    invalid.bundle.proof.signatureBase64 = Buffer.alloc(64).toString("base64");
    f.source.readSuccessorAuthorityInputs = () => ({ bundle: invalid.bundle, routeSource: invalid.routeSource, trustAnchors });
    assert.equal(f.controller.transitionAuthority().code, "MODEL-FAMILY-AUTHORITY-PROOF");
    assert.equal(f.controller.readState().state.generation, 0);

    const wrong = signedSuccessor(predecessor, { wrongPredecessor: true });
    f.source.readSuccessorAuthorityInputs = () => ({ bundle: wrong.bundle, routeSource: wrong.routeSource, trustAnchors });
    assert.equal(f.controller.transitionAuthority().code, "MODEL-FAMILY-AUTHORITY-PREDECESSOR");
    assert.equal(f.controller.readState().state.authoritySha256, predecessor.authoritySha256);

    const wrongSource = signedSuccessor(predecessor);
    wrongSource.routeSource.taskRoutes[0].selector.value = "tampered-source";
    f.source.readSuccessorAuthorityInputs = () => ({ bundle: wrongSource.bundle,
      routeSource: wrongSource.routeSource, trustAnchors });
    assert.equal(f.controller.transitionAuthority().code, "MODEL-FAMILY-AUTHORITY-SOURCE");
    assert.equal(f.controller.readState().state.generation, 0);

    const raced = signedSuccessor(predecessor, { changedSource: true });
    let reads = 0;
    f.source.readSuccessorAuthorityInputs = () => {
      reads += 1;
      const selected = reads === 1 ? valid : raced;
      return { bundle: selected.bundle, routeSource: selected.routeSource, trustAnchors };
    };
    assert.equal(f.controller.transitionAuthority().code, "MODEL-FAMILY-SUCCESSOR-SOURCE-RACED");
    assert.equal(f.controller.readState().state.generation, 0);

    const markerPath = join(f.root, "model-family-host", "activation.json");
    const marker = JSON.parse(readFileSync(markerPath, "utf8"));
    marker.authoritySha256 = digest(valid.bundle);
    writeFileSync(markerPath, JSON.stringify(marker), { mode: 0o600 });
    assert.equal(f.controller.readState().code, "MODEL-FAMILY-STATE-UNCERTAIN");
    assert.equal(invoke(f, key("partial-transition-no-fallback")).code, "MODEL-FAMILY-STATE-UNCERTAIN");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("a prepare racing transition wins one generation CAS before successor transition retries", () => {
  const f = fixture();
  try {
    activate(f);
    const predecessor = verifyAuthority({ bundle: f.data.bundle, routeSource: f.data.routeSource }).value;
    const next = signedSuccessor(predecessor);
    const nextInput = { bundle: next.bundle, routeSource: next.routeSource, trustAnchors };
    let didPrepare = false;
    f.source.readSuccessorAuthorityInputs = () => {
      if (!didPrepare) {
        didPrepare = true;
        const prepared = invoke(f, key("transition-racer"));
        assert.equal(prepared.ok, true, prepared.code);
      }
      return nextInput;
    };
    const transition = f.controller.transitionAuthority();
    assert.equal(transition.ok, true, transition.code);
    assert.equal(transition.state.generation, 2);
    assert.equal(transition.state.invocationIndex.length, 1);
    assert.equal(transition.state.authoritySha256, digest(next.bundle));
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

function spawnTransitionWriter(rootDir, data) {
  const moduleUrl = new URL("./model-family-host-store.mjs", import.meta.url).href;
  const source = [
    `import { createModelFamilyHostController } from ${JSON.stringify(moduleUrl)};`,
    "const d=JSON.parse(process.env.S4_TRANSITION_DATA);",
    "const s={readAuthorityInputs:()=>d.authorityInputs,readSuccessorAuthorityInputs:()=>d.successorInputs,readPinInputs:()=>[],readFreshDiscovery:()=>{throw Error('unused')},readCurrentCandidate:()=>({candidateCommit:'3333333333333333333333333333333333333333',candidateTree:'4444444444444444444444444444444444444444'}),launchDriver:()=>({ok:true})};",
    "const c=createModelFamilyHostController({rootDir:d.rootDir,trustedSources:s,clock:()=>Date.parse('2026-10-01T12:00:30.000Z')});",
    "const r=c.transitionAuthority();process.stdout.write(JSON.stringify({ok:r.ok,code:r.code,generation:r.state?.generation})+'\\n');",
  ].join("\n");
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", source], {
      cwd: resolve("."), env: { ...process.env, S4_TRANSITION_DATA: JSON.stringify({ ...data, rootDir }) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = ""; let stderr = "";
    child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolvePromise(JSON.parse(stdout.trim()))
      : reject(new Error(`successor transition process failed (${code}): ${stderr}`)));
  });
}

test("real competing transition and prepare serialize on the stored generation", async () => {
  const f = fixture();
  try {
    activate(f);
    const predecessor = verifyAuthority({ bundle: f.data.bundle, routeSource: f.data.routeSource }).value;
    const next = signedSuccessor(predecessor);
    const successorInputs = { bundle: next.bundle, routeSource: next.routeSource, trustAnchors };
    const authorityInputs = { bundle: f.data.bundle, routeSource: f.data.routeSource, trustAnchors, predecessor: null };
    const transitionPromise = spawnTransitionWriter(f.root, { authorityInputs, successorInputs });
    const prepared = invoke(f, key("competing-transition-prepare"));
    const transition = await transitionPromise;
    assert.equal(transition.ok, true, transition.code);
    assert.equal([true, false].includes(prepared.ok), true);
    if (prepared.ok) assert.equal(prepared.value.receipt.authoritySha256, predecessor.authoritySha256);
    else assert.ok(["MODEL-FAMILY-AUTHORITY-SOURCE-SUPERSEDED", "CONCURRENT_RESELECTION_REQUIRED"].includes(prepared.code), prepared.code);
    const state = f.controller.readState();
    assert.equal(state.ok, true, state.code);
    assert.equal(state.state.authoritySha256, digest(next.bundle));
    assert.equal(state.receipts.length, prepared.ok ? 1 : 0);
    assert.equal(state.state.generation, prepared.ok ? 2 : 1);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("missing or corrupt private current state preserves active-family refusal and never falls back", () => {
  const f = fixture();
  try {
    activate(f);
    unlinkSync(join(f.root, "model-family-host", "current.json"));
    const result = f.controller.readState();
    assert.equal(result.ok, false);
    assert.equal(result.code, "MODEL-FAMILY-STATE-UNCERTAIN");
    assert.equal(f.controller.prepare({ key: key("new"), assignment: route }).code, "MODEL-FAMILY-STATE-UNCERTAIN");
    writeFileSync(join(f.root, "model-family-host", "current.json"), "{\"partial\":", { mode: 0o600 });
    assert.equal(f.controller.readState().code, "MODEL-FAMILY-STATE-UNCERTAIN");
    assert.equal(f.controller.prepare({ key: key("newer"), assignment: route }).code, "MODEL-FAMILY-STATE-UNCERTAIN");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("symlink roots, hard-linked receipts, and malformed private JSON fail closed", () => {
  const f = fixture();
  const link = `${f.root}-alias`;
  try {
    activate(f);
    const result = invoke(f);
    assert.equal(result.ok, true, result.code);
    const receiptPath = join(f.root, "model-family-host/receipts", `${digest(key())}.json`);
    linkSync(receiptPath, join(f.root, "model-family-host/receipts", "hardlink.json"));
    assert.equal(f.controller.readState().ok, false);
    unlinkSync(join(f.root, "model-family-host/receipts", "hardlink.json"));
    symlinkSync(f.root, link, "dir");
    const aliased = createModelFamilyHostController({ rootDir: link, trustedSources: f.source });
    assert.equal(aliased.readState().ok, false);
    writeFileSync(receiptPath, "{\"duplicate\":1,\"duplicate\":2}", { mode: 0o600 });
    assert.equal(f.controller.readState().ok, false);
  } finally { rmSync(f.root, { recursive: true, force: true }); try { unlinkSync(link); } catch {} }
});

test("replaced receipt bytes are never repaired or overwritten; tampering blocks offline readback", () => {
  const f = fixture();
  try {
    activate(f);
    const result = invoke(f);
    assert.equal(result.ok, true, result.code);
    const receiptPath = join(f.root, "model-family-host/receipts", `${digest(key())}.json`);
    const before = readFileSync(receiptPath);
    assert.equal(statSync(receiptPath).nlink, 1);
    writeFileSync(receiptPath, "{}\n", { mode: 0o600 });
    const replay = invoke(f);
    assert.equal(replay.ok, false);
    assert.notDeepEqual(readFileSync(receiptPath), before);
    assert.equal(readHeldModelFamilyInvocation({ rootDir: f.root, key: key() }).ok, false);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("schemas are closed and bind unique invocation identity, assignment, candidate, generation and watermarks", () => {
  const root = new URL("../schemas/", import.meta.url);
  const invocation = JSON.parse(readFileSync(new URL("pipeline.model-family-invocation.v2.json", root), "utf8"));
  const state = JSON.parse(readFileSync(new URL("pipeline.model-family-host-state.v1.json", root), "utf8"));
  assert.equal(invocation.additionalProperties, false);
  assert.equal(state.additionalProperties, false);
  assert.deepEqual(invocation.required, ["schema", "kind", "runner", "sessionId", "invocationId", "candidateCommit", "candidateTree",
    "taskRoute", "role", "effort", "familyId", "releaseId", "version", "selectedModelId", "canonicalModelId",
    "groupingEvidenceSha256", "variantSelectionEvidenceSha256", "selection", "authoritySha256", "pinDecisionSha256",
    "adapterContractSha256", "discoverySha256", "compatibilityEvidenceSha256", "observedAt", "expiresAt",
    "storeGeneration", "watermarkBefore", "watermarkAfter", "packetBindingSha256", "receiptSha256"]);
  assert.deepEqual(state.required, ["schema", "generation", "activation", "authoritySha256", "pinStates", "watermarks", "invocationIndex"]);
  assert.deepEqual(state.properties.activation, { const: "family-active" });
  assert.ok(state.$defs.invocationIndexEntry.properties.installationBindingSha256);
});

function spawnConcurrentWriter(rootDir, hostData) {
  const moduleUrl = new URL("./model-family-host-store.mjs", import.meta.url).href;
  const source = [
    `import { createModelFamilyHostController } from ${JSON.stringify(moduleUrl)};`,
    "const d=JSON.parse(process.env.S4_HOST_DATA);",
    "const sources={readAuthorityInputs:()=>d.authorityInputs,readPinInputs:()=>[],",
    "readFreshDiscovery:()=>{Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,40);const h=Object.freeze(Object.create(null)),v=d.preparation.discovery,fr=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(fr);Object.freeze(x)}return x};return {discoveryHost:{readDiscovery:x=>x===h?{ok:true,code:'DISCOVERY_READ',value:fr(v)}:{ok:false,code:'DISCOVERY_HANDLE_REQUIRED',retryable:false}},discoveryHandle:h,context:d.preparation.context};},",
    "readCurrentCandidate:()=>({candidateCommit:'3333333333333333333333333333333333333333',candidateTree:'4444444444444444444444444444444444444444'}),launchDriver:()=>({ok:true})};",
    "const c=createModelFamilyHostController({rootDir:d.rootDir,trustedSources:sources,clock:()=>Date.parse('2026-10-01T12:00:30.000Z')});",
    "const r=c.prepare({key:d.key,assignment:d.assignment});",
    "process.stdout.write(JSON.stringify({ok:r.ok,code:r.code,receiptSha256:r.value?.receipt.receiptSha256})+'\\n');",
  ].join("\n");
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", source], {
      cwd: resolve("."), env: { ...process.env, S4_HOST_DATA: JSON.stringify({ ...hostData, rootDir }) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = ""; let stderr = "";
    child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolvePromise(JSON.parse(stdout.trim()))
      : reject(new Error(`concurrent writer failed (${code}): ${stderr}`)));
  });
}

test("real process contention serializes same-key replay and different invocation CAS generations", async () => {
  assert.equal(MODEL_FAMILY_HOST_STORE_LIMITS.casRetries, 2);
  for (const sameInvocation of [true, false]) {
    const f = fixture();
    try {
      activate(f);
      const data = { rootDir: f.root,
        authorityInputs: { bundle: f.data.bundle, routeSource: f.data.routeSource, trustAnchors, predecessor: null },
        preparation: prep(), assignment: route };
      const left = key("process-left");
      const right = sameInvocation ? left : key("process-right");
      const results = await Promise.all([spawnConcurrentWriter(f.root, { ...data, key: left }),
        spawnConcurrentWriter(f.root, { ...data, key: right })]);
      assert.equal(results.every((item) => item.ok), true, JSON.stringify(results));
      const state = f.controller.readState();
      assert.equal(state.ok, true, state.code);
      assert.equal(state.receipts.length, sameInvocation ? 1 : 2);
      assert.deepEqual(state.receipts.map((item) => item.storeGeneration).sort(), sameInvocation ? [1] : [1, 2]);
      if (sameInvocation) assert.equal(results.filter((item) => item.code === "MODEL-FAMILY-REPLAY").length, 1);
    } finally { rmSync(f.root, { recursive: true, force: true }); }
  }
});

registerTestCaseCompletion({ cases, fd: 3, maxBytes: 65536 });
