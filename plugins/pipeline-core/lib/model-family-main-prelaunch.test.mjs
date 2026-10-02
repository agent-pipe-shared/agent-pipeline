// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerTestCaseCompletion } from "./test-case-completion.mjs";
const completionCases = [];
import { createCodexFamilyAdapter } from "./model-family-codex-adapter.mjs";
import { createClaudeFamilyAdapter } from "./model-family-claude-adapter.mjs";
import { createAntigravityFamilyAdapter } from "./model-family-antigravity-adapter.mjs";
import { createModelFamilyMainPrelaunch } from "./model-family-main-prelaunch.mjs";
import { canonical, createPoApprovalIntent } from "./po-approval-proof.mjs";
import { createModelFamilyInvocationEntry } from "./model-family-invocation.mjs";
import { createModelFamilyRuntimeHost } from "./model-family-runtime-host.mjs";

const sha = (value) => createHash("sha256").update(typeof value === "string" ? value : canonical(value)).digest("hex");
const taskRoute = "profile.synthetic_main";
const candidateCommit = "1".repeat(40), candidateTree = "2".repeat(40);
const actualCandidate = { candidateCommit: "3".repeat(40), candidateTree: "4".repeat(40) };
const deepFreeze = (value) => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze); Object.freeze(value);
  }
  return value;
};

function signedPolicy({ runner, familyId, adapterContractSha256, modelId }) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicPem = publicKey.export({ format: "pem", type: "spki" });
  const trustAnchors = [{ keyReference: `positive-${runner}`, publicKeySha256: sha(publicPem) }];
  const selector = { kind: "model-id", value: modelId };
  const taskRoutes = [{ taskRoute, runner, role: "frontier", effort: "high", state: "default", selector }];
  const configuredRoutes = [{ runner, role: "frontier", effort: "high", selector }];
  const routeSource = { ok: true, taskRoutes, configuredRoutes };
  const routeSourceSha256 = sha({ taskRoutes, configuredRoutes });
  const assignments = [{ runner, role: "frontier", effort: "high", taskRoutes: [taskRoute], familyId,
    adapterContractSha256, minimumVersion: [6], update: "latest" }];
  const subject = { revision: "model-family-v2", predecessorAuthoritySha256: null,
    routeSourceSha256, assignments, migration: null };
  const subjectSha256 = sha(subject);
  const candidateAtApproval = { commit: candidateCommit, tree: candidateTree };
  const approvalIntent = createPoApprovalIntent({ kind: "model-role-policy", featureId: "model-role-routes",
    planSha256: routeSourceSha256, specSha256: subjectSha256, candidate: candidateAtApproval,
    policyRevision: "model-family-v2", subjectSha256, decision: "approved" });
  const bundle = { schema: "pipeline.model-family-approved-policy.v2", candidateAtApproval, subject, approvalIntent,
    proof: { schema: "pipeline.po-approval-proof.v1", intentSha256: approvalIntent.sha256,
      keyReference: trustAnchors[0].keyReference, publicKey: publicPem,
      signatureBase64: sign(null, Buffer.from(approvalIntent.sha256), privateKey).toString("base64") } };
  return { bundle, routeSource, trustAnchors };
}

async function signedRunnerFixture(runner, createAdapter) {
  const familyId = "sol", role = "frontier", effort = "high";
  const sessionId = `host-${runner}-session`, installationBindingSha256 = sha(`${runner}-install`);
  const accountBindingSha256 = sha(`${runner}-account`), hostProcessBindingSha256 = sha(`${runner}-process`);
  const adapterContractSha256 = sha(`${runner}-synthetic-contract`);
  const commonDir = mkdtempSync(join(tmpdir(), `main-positive-${runner}-`));
  mkdirSync(join(commonDir, "agent-pipeline"), { recursive: true, mode: 0o700 });
  let models = [{ modelId: `${runner}-family-6`, version: [6] }];
  let mainOrdinal = 0;
  const calls = { apply: 0, readback: 0, launch: 0, identity: 0 };
  const port = {
    async applyConfiguration({ configuration }) { calls.apply += 1; port.applied = structuredClone(configuration); return { ok: true }; },
    async readAppliedConfiguration() { calls.readback += 1; return { ok: true, configuration: structuredClone(port.applied) }; },
    async launchMain({ configuration }) {
      calls.launch += 1; assert.equal(configuration.binding.modelId, models.at(-1).modelId);
      return { ok: true, operationId: `${runner}-operation-${++mainOrdinal}` };
    },
    async readActualMainIdentity({ expected, operationId }) {
      calls.identity += 1;
      return { ok: true, identity: { kind: "main-session", runner: expected.runner,
        sessionId: expected.sessionId, invocationId: expected.invocationId, taskRoute: expected.taskRoute,
        candidateCommit: expected.candidateCommit, candidateTree: expected.candidateTree,
        modelId: expected.modelId, authoritySha256: expected.authoritySha256,
        adapterContractSha256: expected.adapterContractSha256, packetBindingSha256: expected.packetBindingSha256,
        role: expected.role, familyId: expected.familyId, hostStoreRootDir: expected.hostStoreRootDir,
        operationId, mainSessionId: `${runner}-main-session-${mainOrdinal}`,
        ...(port.reportedEffort === undefined ? {} : { effectiveEffort: port.reportedEffort }) } };
    },
  };
  const policy = signedPolicy({ runner, familyId, adapterContractSha256, modelId: models[0].modelId });
  const trustedSources = {
    readAuthorityInputs: () => ({ ...policy, predecessor: null }),
    readPinInputs: () => [],
    async captureFreshDiscovery({ key }) {
      const observedAt = "2026-10-02T09:00:00.000Z", expiresAt = "2026-10-02T09:01:00.000Z";
      const compatibility = sha(`${runner}-compatibility`), capability = sha(`${runner}-capability`);
      const normalized = deepFreeze({ schema: "pipeline.model-family-discovery.v1", runner,
        installationBindingSha256: key.installationBindingSha256, accountBindingSha256: key.accountBindingSha256,
        hostProcessBindingSha256, adapterContractSha256, mode: "complete-catalogue", observedAt, expiresAt,
        rawEvidenceSha256: sha(`${runner}-raw`), coverageEvidenceSha256: sha(`${runner}-coverage`),
        compatibilityEvidenceSha256: compatibility, latestAliasEvidenceSha256: null,
        records: models.map(({ modelId, version }) => ({ releaseId: `${runner}-${version.join("-")}`,
          familyId, version, released: true, groupingEvidenceSha256: sha(`${runner}-group-${version.join("-")}`),
          variants: [{ modelId, canonicalModelId: null, aliasEvidenceSha256: null, visible: true, selectable: true,
            efforts: [effort], capabilityEvidenceSha256: capability,
            compatibilityBySlotSha256: { [JSON.stringify([runner, taskRoute, role, effort])]: compatibility } }] })) });
      const discoveryHandle = Object.freeze(Object.create(null));
      const discoveryHost = Object.freeze({ readDiscovery(handle) { return handle === discoveryHandle
        ? { ok: true, code: "SYNTHETIC-S2-OPAQUE-READ", value: normalized }
        : { ok: false, code: "DISCOVERY-HANDLE-REQUIRED" }; } });
      const context = { coverage: { familyId, coverageEvidenceSha256: normalized.coverageEvidenceSha256,
        unknownTargetFamilyEvidenceSha256s: [] }, hardEligibility: { runner, taskRoute, role, effort,
        evidenceSha256: sha(`${runner}-hard`), minimumVersion: null, deniedModelIds: [] }, variantRule: null,
        compatibility: { runner, taskRoute, role, effort, modelId: models.at(-1).modelId, evidenceSha256: compatibility },
        latestAlias: null };
      return { ok: true, code: "SYNTHETIC-S2-CAPTURE", value: { discoveryHost, discoveryHandle, context } };
    },
    readCurrentCandidate: () => ({ ...actualCandidate }),
    resolveInvocationContext: ({ requestedSessionId, invocationId }) => ({ ok: true,
      key: { runner, installationBindingSha256, accountBindingSha256, sessionId: requestedSessionId, invocationId },
      assignment: { runner, taskRoute, role, effort, familyId }, ...actualCandidate }),
    admitNativeRequest: () => ({ ok: true, code: "SYNTHETIC-NATIVE-ADMISSION" }),
  };
  const adapter = createAdapter(Object.freeze({}), { mainLaunchPort: port });
  trustedSources.launchDriver = ({ driverContext }) => adapter.launchMainFromDriverContext(driverContext);
  const runtimeHost = createModelFamilyRuntimeHost({ cwd: commonDir, resolveCommonDir: () => commonDir,
    trustedSources, clock: () => Date.parse("2026-10-02T09:00:30.000Z") });
  const activated = runtimeHost.store().activate();
  if (!activated.ok) { rmSync(commonDir, { recursive: true, force: true }); throw new Error(activated.code); }
  const entry = createModelFamilyInvocationEntry({ runtimeHost, routeSource: policy.routeSource });
  const packetFor = (receipt) => ({ runner, sessionId: receipt.sessionId, invocationId: receipt.invocationId,
    candidateCommit: receipt.candidateCommit, candidateTree: receipt.candidateTree, taskRoute: receipt.taskRoute,
    role: receipt.role, effort: receipt.effort, selectedModelId: receipt.selectedModelId,
    authoritySha256: receipt.authoritySha256, discoverySha256: receipt.discoverySha256,
    packetBindingSha256: receipt.packetBindingSha256 });
  const requestFor = (receipt) => ({ schema: "pipeline.model-family-main-request.v1", purpose: "profile-main",
    operation: "create-main", runner, sessionId: receipt.sessionId, invocationId: receipt.invocationId,
    taskRoute: receipt.taskRoute, candidateCommit: receipt.candidateCommit, candidateTree: receipt.candidateTree,
    modelId: receipt.selectedModelId, effort: receipt.effort, authoritySha256: receipt.authoritySha256,
    adapterContractSha256: receipt.adapterContractSha256, packetBindingSha256: receipt.packetBindingSha256,
    existingMainSessionId: null, payload: { testOnly: true } });
  return { entry, port, calls, packetFor, requestFor, setModels(next) { models = next; }, cleanup() {
    rmSync(commonDir, { recursive: true, force: true });
  } };
}

const inertHost = Object.freeze({});

completionCases.push({ id: "MFMP001", name: "all three source adapters expose a separate main method and default to unqualified without a child", run: async () => {
  for (const adapter of [createCodexFamilyAdapter(inertHost), createClaudeFamilyAdapter(inertHost),
    createAntigravityFamilyAdapter(inertHost)]) {
    assert.equal(typeof adapter.launchMainFromDriverContext, "function");
    const result = await adapter.launchMainFromDriverContext(Object.freeze(Object.create(null)));
    assert.deepEqual(result, { ok: false, code: "MAIN_PRELAUNCH_UNQUALIFIED", retryable: false });
  }
} });

completionCases.push({ id: "MFMP002", name: "copied or fabricated context cannot reach configured main operations", run: async () => {
  let calls = 0;
  const port = Object.fromEntries(["applyConfiguration", "readAppliedConfiguration", "launchMain", "readActualMainIdentity"]
    .map((name) => [name, async () => { calls += 1; return { ok: true, operationId: "op" }; }]));
  const main = createModelFamilyMainPrelaunch({ runner: "codex", port, renderConfiguration: () => ({}) });
  const forged = { invocation: { receipt: {} }, key: {}, assignment: {}, nativeRequest: {} };
  const result = await main.launchFromDriverContext(forged);
  assert.equal(result.code, "MAIN_PRELAUNCH_CONTEXT_REQUIRED");
  assert.equal(calls, 0);
} });

completionCases.push({ id: "MFMP003", name: "signed S1 opaque S2 S4 S5 path completes distinct correlated main ports for all runners with unknown optional effort telemetry", run: async () => {
  for (const [runner, createAdapter] of [["codex", createCodexFamilyAdapter], ["claude", createClaudeFamilyAdapter],
    ["antigravity", createAntigravityFamilyAdapter]]) {
    const fixture = await signedRunnerFixture(runner, createAdapter);
    try {
      const sessionId = `host-${runner}-session`;
      const prepareLaunch = async (invocationId, { expectSuccess = true } = {}) => {
        const prepared = await fixture.entry.prepareModelFamilyInvocation({ kind: "dispatch", runner, taskRoute,
          sessionId, invocationId, candidateCommit: actualCandidate.candidateCommit,
          candidateTree: actualCandidate.candidateTree });
        assert.equal(prepared.ok, true, prepared.code);
        const receipt = prepared.value.receipt;
        const bound = await fixture.entry.bindModelFamilyInvocation({ invocation: prepared.value.handle,
          packet: fixture.packetFor(receipt), nativeRequest: fixture.requestFor(receipt) });
        assert.equal(bound.ok, true, bound.code);
        const launched = await fixture.entry.launchModelFamilyInvocation({ binding: bound.value });
        if (!expectSuccess) {
          assert.equal(launched.ok, false);
          assert.equal(launched.code, "MAIN_PRELAUNCH_IDENTITY_MISMATCH");
          return null;
        }
        assert.equal(launched.ok, true, `${runner}: ${launched.code}`);
        assert.equal(launched.code, "MAIN_PRELAUNCH_OBSERVED");
        assert.notEqual(launched.value.mainSessionId, sessionId);
        assert.notEqual(launched.value.mainSessionId, invocationId);
        return { modelId: receipt.selectedModelId, mainSessionId: launched.value.mainSessionId };
      };
      const first = await prepareLaunch(`${runner}-invocation-1`);
      const firstConfiguration = fixture.port.applied;
      fixture.setModels([{ modelId: `${runner}-family-6`, version: [6] }, { modelId: `${runner}-family-7`, version: [7] }]);
      assert.equal(firstConfiguration.binding.modelId, first.modelId, "the held main selection stays unchanged after a successor appears");
      const next = await prepareLaunch(`${runner}-invocation-2`);
      assert.notEqual(next.modelId, first.modelId, "only a future invocation advances to the newly observed successor");
      fixture.port.reportedEffort = "low";
      await prepareLaunch(`${runner}-invocation-3`, { expectSuccess: false });
      assert.equal(fixture.calls.apply, 3); assert.equal(fixture.calls.readback, 3);
      assert.equal(fixture.calls.launch, 3); assert.equal(fixture.calls.identity, 3);
    } finally { fixture.cleanup(); }
  }
} });

registerTestCaseCompletion({ cases: completionCases, fd: 3, maxBytes: 65536 });
