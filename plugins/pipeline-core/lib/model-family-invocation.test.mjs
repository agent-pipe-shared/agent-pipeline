// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerTestCaseCompletion } from "./test-case-completion.mjs";
const cases = [];
function test(name, run) { cases.push({ id: `MFI${String(cases.length + 1).padStart(3, "0")}`, name, run }); }
import { canonical, createPoApprovalIntent } from "./po-approval-proof.mjs";
import { createModelFamilyInvocationEntry } from "./model-family-invocation.mjs";
import { createModelFamilyRuntimeHost } from "./model-family-runtime-host.mjs";
import { registeredModelFamilyTaskRoutes } from "./model-family-route-source.mjs";
import { createModelFamilyDiscoveryHost, RULE_FIELDS, pass, fail, digest as discoveryDigest } from "./model-family-discovery.mjs";
import { createCodexFamilyAdapter } from "./model-family-codex-adapter.mjs";

const sha = (value) => createHash("sha256").update(typeof value === "string" ? value : canonical(value)).digest("hex");
const runner = "codex";
const taskRoute = "profile.feature.execution_phase";
const sessionId = "session-1";
const invocationId = "invoke-1";
const candidateCommit = "1".repeat(40);
const candidateTree = "2".repeat(40);
const authoritySha256 = sha("family-authority");
const routeSource = registeredModelFamilyTaskRoutes();
const route = routeSource.taskRoutes.find((item) => item.runner === runner && item.taskRoute === taskRoute);

function fixture({ activation = "active", prepareResult = null, captureFreshDiscovery = null } = {}) {
  const receipts = new Map();
  const internalHandles = new WeakSet();
  const counts = { activation: 0, context: 0, capture: 0, prepare: 0, prelaunch: 0, launches: 0 };
  const key = { runner, installationBindingSha256: sha("installation"), accountBindingSha256: sha("account"),
    sessionId, invocationId };
  const assignment = { runner, taskRoute, role: route.role, effort: route.effort, familyId: "sol" };
  let currentCapture = null;
  const runtimeHost = {
    observeActivation() {
      counts.activation += 1;
      return activation === "active" ? { ok: true, code: "ACTIVE", status: "active", authoritySha256 }
        : activation === "inactive" ? { ok: true, code: "INACTIVE", status: "inactive" }
          : { ok: false, code: "MODEL-FAMILY-STATE-UNCERTAIN", status: "uncertain" };
    },
    resolveInvocationContext(input) {
      counts.context += 1;
      assert.equal(input.requestedSessionId, sessionId);
      return { ok: true, key: { ...key, invocationId: input.invocationId }, assignment,
        candidateCommit, candidateTree };
    },
    async withFreshDiscovery(request, operation) {
      counts.capture += 1;
      assert.equal(request.authoritySha256, authoritySha256);
      assert.deepEqual(request.key, { ...key, invocationId: request.key.invocationId });
      assert.equal(typeof request.assignment.familyId, "string");
      if (captureFreshDiscovery) {
        const captured = await captureFreshDiscovery(request);
        if (!captured?.ok) return captured ?? { ok: false, code: "ADAPTER_CONTRACT_UNQUALIFIED" };
        currentCapture = captured.value;
      }
      return operation();
    },
    root: () => ({ privateRoot: "/synthetic/agent-pipeline" }),
    store() {
      return {
        prepare({ key: actualKey, assignment: actualAssignment }) {
          counts.prepare += 1;
          if (prepareResult) return prepareResult;
          assert.deepEqual(actualAssignment, assignment);
          const tuple = `${actualKey.sessionId}:${actualKey.invocationId}`;
          if (!receipts.has(tuple)) {
            let selectedModelId = "gpt-6.1-sol";
            let version = [6, 1];
            if (currentCapture) {
              const read = currentCapture.discoveryHost.readDiscovery(currentCapture.discoveryHandle);
              assert.equal(read.ok, true, "S2 handle must be read by its host");
              const releases = read.value.records.filter((entry) => entry.familyId === assignment.familyId)
                .sort((left, right) => (right.version[0] ?? 0) - (left.version[0] ?? 0)
                  || (right.version[1] ?? 0) - (left.version[1] ?? 0));
              selectedModelId = releases[0].variants[0].modelId;
              version = releases[0].version;
            }
            const receipt = Object.freeze({ schema: "pipeline.model-family-invocation.v2",
              kind: "model-family-invocation", runner, sessionId, invocationId: actualKey.invocationId,
              candidateCommit, candidateTree, taskRoute, role: route.role, effort: route.effort, familyId: "sol",
              releaseId: `fixture-sol-${version.join("-")}`, version, selectedModelId,
              authoritySha256, discoverySha256: sha("discovery"), packetBindingSha256: sha("packet-binding"),
              receiptSha256: sha(tuple) });
            const handle = Object.freeze({ receipt });
            internalHandles.add(handle);
            receipts.set(tuple, { receipt, handle, key: { ...actualKey } });
          }
          return { ok: true, code: receipts.has(tuple) ? "MODEL-FAMILY-REPLAY" : "MODEL-FAMILY-READY",
            value: receipts.get(tuple).handle };
        },
        readState() { return { ok: true, invocationEntries: [...receipts.values()].map(({ key: heldKey, receipt }) =>
          ({ key: heldKey, receipt })) }; },
        prelaunch({ invocation, packetBindingSha256 }) {
          counts.prelaunch += 1;
          return internalHandles.has(invocation) && packetBindingSha256 === sha("packet-binding")
            ? { ok: true, code: "PRELAUNCH", value: Object.freeze(Object.create(null)) }
            : { ok: false, code: "MODEL-FAMILY-PRELAUNCH-BINDING" };
        },
        launch({ invocation }) {
          counts.launches += 1;
          if (currentCapture) {
            const read = currentCapture.discoveryHost.readDiscovery(currentCapture.discoveryHandle);
            const head = read.value.records.filter((entry) => entry.familyId === assignment.familyId)
              .sort((left, right) => (right.version[0] ?? 0) - (left.version[0] ?? 0)
                || (right.version[1] ?? 0) - (left.version[1] ?? 0))[0];
            if (head.variants[0].modelId !== invocation.receipt.selectedModelId) {
              return { ok: false, code: "MODEL-FAMILY-PRELAUNCH-SUPERSEDED" };
            }
          }
          return { ok: false, code: "MODEL-FAMILY-NATIVE-PORT-UNQUALIFIED" };
        },
      };
    },
  };
  return { entry: createModelFamilyInvocationEntry({ runtimeHost, routeSource }), counts };
}

async function actualS2OpaquePort({ models, key, familyId = "sol" }) {
  const rules = {};
  const contract = { schema: "pipeline.model-family-adapter-contract.v1", runner: "codex", familyId,
    discoveryModes: ["complete-catalogue"], providerEvidenceSha256s: [sha("synthetic-provider-contract")] };
  for (const name of RULE_FIELDS) {
    const rule = { id: `s5a-${name}`, version: 1, sha256: sha(name) };
    contract[name] = rule;
    const run = name === "identityRule" ? ({ phase, entry }) => phase === "coverage"
      ? pass("SYNTHETIC", { mode: "complete-catalogue", evidenceSha256: sha("coverage"), latestAliasEvidenceSha256: null })
      : pass("SYNTHETIC", { model: entry.model })
      : name === "releaseGroupingRule" ? ({ entry }) => pass("SYNTHETIC", { releaseId: `${familyId}-${entry.version.join("-")}`,
        familyId, groupingEvidenceSha256: sha("group") })
        : name === "versionRule" ? ({ entry }) => pass("SYNTHETIC", entry.version)
          : name === "variantSelectionRule" ? ({ entry }) => pass("SYNTHETIC", { modelId: entry.model,
            canonicalModelId: null, aliasEvidenceSha256: null })
            : name === "selectabilityRule" ? () => pass("SYNTHETIC", { released: true, visible: true, selectable: true })
              : name === "effortRule" ? ({ entry }) => pass("SYNTHETIC", {
                efforts: entry.supportedReasoningEfforts.map((item) => item.reasoningEffort),
                capabilityEvidenceSha256: sha("capability") })
                : () => fail("SYNTHETIC_UNUSED");
    rules[rule.id] = { version: rule.version, sha256: rule.sha256, run };
  }
  let latest;
  const timestamp = "2026-10-01T12:00:00.000Z";
  const expiresAt = "2026-10-01T12:01:00.000Z";
  const host = createModelFamilyDiscoveryHost({ rules, clock: () => timestamp,
    capture: async (context) => pass("SYNTHETIC_CAPTURE", { bindings: context.bindings, observedAt: context.observedAt,
      source: "S5A-SYNTHETIC", pages: [{ request: { id: 1, method: "model/list",
        params: { cursor: null, includeHidden: true, limit: 100 } },
        responseBytes: JSON.stringify({ id: 1, result: { data: models.map(({ modelId, version, efforts = [route.effort] }) => ({ id: modelId,
          model: modelId, hidden: false, version, released: true,
          supportedReasoningEfforts: efforts.map((reasoningEffort) => ({ reasoningEffort })) })), nextCursor: null } }) }] }),
    verifyProviderContract: ({ contractSha256, contract: value }) => pass("SYNTHETIC_CONTRACT", {
      contractSha256, providerEvidenceSha256s: value.providerEvidenceSha256s }),
    compatibility: ({ runner: selectedRunner, record, variant, slot }) => {
      const value = host.readDiscovery(latest).value;
      return pass("SYNTHETIC_COMPAT", { subjectSha256: discoveryDigest({ runner: selectedRunner,
        releaseId: record.releaseId, modelId: variant.modelId, ...slot,
        discoverySha256: discoveryDigest(value), adapterContractSha256: value.adapterContractSha256 }),
        evidenceSha256: sha("compat") });
    } });
  const context = host.createContext({ runner, bindings: { installationBindingSha256: key.installationBindingSha256,
    accountBindingSha256: key.accountBindingSha256, hostProcessBindingSha256: sha("process") },
    observedAt: timestamp, expiresAt }).value;
  const qualified = host.qualifyContract(contract);
  const adapter = createCodexFamilyAdapter(host);
  const raw = await adapter.captureRawDiscovery(context);
  if (!raw.ok) return raw;
  const coverage = adapter.verifyCoverage(raw.value, context, qualified.value);
  if (!coverage.ok) return coverage;
  const normalized = adapter.normalizeReleases(raw.value, qualified.value, coverage.value);
  if (!normalized.ok) return normalized;
  latest = normalized.value;
  const snapshot = host.readDiscovery(latest).value;
  const head = snapshot.records.filter((entry) => entry.familyId === familyId)
    .sort((left, right) => (right.version[0] ?? 0) - (left.version[0] ?? 0)
      || (right.version[1] ?? 0) - (left.version[1] ?? 0))[0];
  const compatible = adapter.verifyCompatibility({ discovery: latest, releaseId: head.releaseId,
    modelId: head.variants[0].modelId }, { taskRoute, role: route.role, effort: route.effort }, context, qualified.value);
  const resolverContext = { coverage: { familyId, coverageEvidenceSha256: sha("coverage"),
    unknownTargetFamilyEvidenceSha256s: [] }, hardEligibility: { runner, taskRoute, role: route.role,
    effort: route.effort, evidenceSha256: sha("hard"), minimumVersion: null, deniedModelIds: [] },
  variantRule: null, compatibility: { runner, taskRoute, role: route.role, effort: route.effort,
    modelId: head.variants[0].modelId, evidenceSha256: sha("compat") }, latestAlias: null };
  return compatible.ok ? { ok: true, contractSha256: discoveryDigest(contract), value: { discoveryHost: host,
    discoveryHandle: compatible.value.discovery, context: resolverContext } } : compatible;
}

function signedS4Authority(adapterContractSha256, familyId = "sol", selectedModelId = "gpt-6-sol") {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicPem = publicKey.export({ format: "pem", type: "spki" });
  const trustAnchors = [{ keyReference: "S5A-SYNTHETIC-TEST-KEY", publicKeySha256: sha(publicPem) }];
  const selector = { kind: "model-id", value: selectedModelId };
  const taskRoutes = [{ taskRoute, runner, role: route.role, effort: route.effort, state: "default", selector }];
  const configuredRoutes = [{ runner, role: route.role, effort: route.effort, selector }];
  const routeSource = { ok: true, taskRoutes, configuredRoutes };
  const routeSourceSha256 = sha({ taskRoutes, configuredRoutes });
  const assignments = [{ runner, role: route.role, effort: route.effort, taskRoutes: [taskRoute], familyId,
    adapterContractSha256, minimumVersion: [6], update: "latest" }];
  const subject = { revision: "model-family-v2", predecessorAuthoritySha256: null,
    routeSourceSha256, assignments, migration: null };
  const subjectSha256 = sha(subject);
  const candidateAtApproval = { commit: candidateCommit, tree: candidateTree };
  const approvalIntent = createPoApprovalIntent({ kind: "model-role-policy", featureId: "model-role-routes",
    planSha256: routeSourceSha256, specSha256: subjectSha256, candidate: candidateAtApproval,
    policyRevision: "model-family-v2", subjectSha256, decision: "approved" });
  const bundle = { schema: "pipeline.model-family-approved-policy.v2", candidateAtApproval, subject,
    approvalIntent, proof: { schema: "pipeline.po-approval-proof.v1", intentSha256: approvalIntent.sha256,
      keyReference: trustAnchors[0].keyReference, publicKey: publicPem,
      signatureBase64: sign(null, Buffer.from(approvalIntent.sha256), privateKey).toString("base64") } };
  return { bundle, routeSource, trustAnchors };
}

async function realS4EntryFixture(initialModels, { familyId = "sol", selectedModelId = "gpt-6-sol",
  modelsForInvocation = null, beforeCapture = null, nativePort = true, driverResult = null } = {}) {
  const bindingKey = { runner, installationBindingSha256: sha("installation"),
    accountBindingSha256: sha("account"), sessionId, invocationId };
  const contractProbe = await actualS2OpaquePort({ models: initialModels, key: bindingKey, familyId });
  if (!contractProbe.ok) throw new Error(`S2 fixture contract probe: ${contractProbe.code}`);
  const authority = signedS4Authority(contractProbe.contractSha256, familyId, selectedModelId);
  const commonDir = mkdtempSync(join(tmpdir(), "s5a-real-s4-"));
  mkdirSync(join(commonDir, "agent-pipeline"), { recursive: true, mode: 0o700 });
  let models = initialModels;
  let captureCount = 0;
  let admissionCount = 0;
  const nativeRequests = [];
  const trustedSources = {
    readAuthorityInputs: () => ({ bundle: authority.bundle, routeSource: authority.routeSource,
      trustAnchors: authority.trustAnchors, predecessor: null }),
    readPinInputs: () => [],
    captureFreshDiscovery: async ({ key: freshKey }) => {
      captureCount += 1;
      await beforeCapture?.(freshKey);
      return actualS2OpaquePort({ models: modelsForInvocation?.(freshKey) ?? models, key: freshKey, familyId });
    },
    readCurrentCandidate: () => ({ candidateCommit, candidateTree }),
    resolveInvocationContext: ({ requestedSessionId, invocationId: requestedInvocationId }) => ({ ok: true,
      key: { ...bindingKey, sessionId: requestedSessionId, invocationId: requestedInvocationId },
      assignment: { runner, taskRoute, role: route.role, effort: route.effort, familyId },
      candidateCommit, candidateTree }),
    resolveCurrentInvocationIdentity: ({ invocationId: requestedInvocationId }) => ({ ok: true,
      key: { ...bindingKey, sessionId: "host-session-actual", invocationId: requestedInvocationId },
      assignment: { runner, taskRoute, role: route.role, effort: route.effort, familyId },
      candidateCommit, candidateTree }),
    ...(nativePort ? { admitNativeRequest: ({ rootDir, repositoryRoot, gitCommonDir, invocation, key, assignment, request }) => {
      admissionCount += 1;
      assert.equal(rootDir, join(commonDir, "agent-pipeline"));
      assert.equal(repositoryRoot, commonDir);
      assert.equal(gitCommonDir, commonDir);
      assert.equal(invocation.schema, "pipeline.model-family-invocation.v2");
      assert.equal(invocation.kind, "model-family-invocation");
      assert.equal(Object.isFrozen(invocation), true);
      assert.deepEqual(key, bindingKey);
      assert.equal(assignment.taskRoute, taskRoute);
      assert.equal(request.selectedModelId, invocation.selectedModelId);
      assert.equal(request.effort, invocation.effort);
      return { ok: true, code: "SYNTHETIC-NATIVE-REQUEST-ADMITTED" };
    } } : {}),
    launchDriver: ({ nativeRequest }) => {
      if (nativeRequest !== undefined) nativeRequests.push(nativeRequest);
      return driverResult ? driverResult({ nativeRequest })
        : { ok: false, code: "MODEL-FAMILY-NATIVE-PORT-UNQUALIFIED" };
    },
  };
  const runtimeHost = createModelFamilyRuntimeHost({ cwd: commonDir, resolveCommonDir: () => commonDir,
    trustedSources, clock: () => Date.parse("2026-10-01T12:00:30.000Z") });
  const activated = runtimeHost.store().activate();
  if (!activated.ok) { rmSync(commonDir, { recursive: true, force: true }); throw new Error(`S4 synthetic activation: ${activated.code}`); }
  return { entry: createModelFamilyInvocationEntry({ runtimeHost, routeSource }),
    setModels(value) { models = value; }, captureCount: () => captureCount,
    admissionCount: () => admissionCount, nativeRequests,
    cleanup() { rmSync(commonDir, { recursive: true, force: true }); } };
}

const input = (overrides = {}) => ({ kind: "dispatch", runner, taskRoute, sessionId, invocationId,
  candidateCommit, candidateTree, ...overrides });
function packetFor(receipt) {
  return { runner: receipt.runner, sessionId: receipt.sessionId, invocationId: receipt.invocationId,
    candidateCommit: receipt.candidateCommit, candidateTree: receipt.candidateTree, taskRoute: receipt.taskRoute,
    role: receipt.role, effort: receipt.effort, selectedModelId: receipt.selectedModelId,
    authoritySha256: receipt.authoritySha256, discoverySha256: receipt.discoverySha256,
    packetBindingSha256: receipt.packetBindingSha256 };
}

test("shared entry returns legacy-eligible only for independently inactive state", async () => {
  const inactive = fixture({ activation: "inactive" });
  const result = await inactive.entry.prepareModelFamilyInvocation(input());
  assert.equal(result.status, "inactive");
  assert.equal(result.code, "MODEL-FAMILY-INACTIVE");
  assert.equal(inactive.counts.prepare, 0);
  const uncertain = fixture({ activation: "uncertain" });
  assert.equal((await uncertain.entry.prepareModelFamilyInvocation(input())).status, "unavailable");
  assert.equal(uncertain.counts.prepare, 0);
});

test("active preparation uses one fresh family receipt and never invokes confirmation", async () => {
  const f = fixture();
  const result = await f.entry.prepareModelFamilyInvocation(input());
  assert.equal(result.ok, true, result.code);
  assert.equal(result.value.receipt.selectedModelId, "gpt-6.1-sol");
  assert.equal(result.value.receipt.effort, route.effort);
  assert.equal(f.counts.prepare, 1);
  assert.equal(f.counts.capture, 1);
  assert.equal(Object.keys(result.value.handle).length, 0);
  const deserialized = structuredClone(result.value.handle);
  assert.equal((await f.entry.bindModelFamilyInvocation({ invocation: deserialized, packet: packetFor(result.value.receipt) })).ok, false);
});

test("exact invocation replay preserves a deeply immutable independent receipt while a new ID can advance", async () => {
  const f = fixture();
  const first = await f.entry.prepareModelFamilyInvocation(input());
  const replay = await f.entry.prepareModelFamilyInvocation(input());
  const next = await f.entry.prepareModelFamilyInvocation(input({ invocationId: "invoke-2" }));
  assert.equal(first.ok && replay.ok && next.ok, true);
  assert.equal(first.value.receipt.receiptSha256, replay.value.receipt.receiptSha256);
  assert.equal(f.counts.capture, 2);
  assert.notEqual(first.value.receipt.receiptSha256, next.value.receipt.receiptSha256);
  assert.equal(Object.isFrozen(first.value.receipt), true);
  assert.equal(Object.isFrozen(first.value.receipt.version), true);
  assert.throws(() => { first.value.receipt.version[0] = 99; }, TypeError);
  const callerCopy = structuredClone(first.value.receipt);
  callerCopy.version[0] = 88;
  assert.equal((await f.entry.prepareModelFamilyInvocation(input())).value.receipt.version[0], 6);
  assert.equal(f.counts.capture, 2, "held same-ID replay does not recollect discovery");
  assert.equal(replay.value.receipt.version[0], 6);
});

test("active latest-head refusal returns no legacy route and keeps its typed reason", async () => {
  const f = fixture({ prepareResult: { ok: false, code: "CURRENT_EFFORT_UNAVAILABLE", retryable: false } });
  const result = await f.entry.prepareModelFamilyInvocation(input());
  assert.equal(result.ok, false);
  assert.equal(result.code, "CURRENT_EFFORT_UNAVAILABLE");
  assert.equal(Object.hasOwn(result, "fallback"), false);
  assert.equal(Object.hasOwn(result, "v3Route"), false);
});

test("caller JSON cannot inject a store, authority, discovery or admission result", async () => {
  const f = fixture();
  for (const extra of [{ hostStore: {} }, { authority: { ok: true } }, { discovery: { ok: true } }, { ok: true }]) {
    const result = await f.entry.prepareModelFamilyInvocation({ ...input(), ...extra });
    assert.equal(result.ok, false);
    assert.equal(result.code, "MODEL-FAMILY-INVOCATION-INPUT");
  }
});

test("binding checks every selected packet fact and issues a private launch capability with a second fresh capture", async () => {
  const f = fixture();
  const prepared = await f.entry.prepareModelFamilyInvocation(input());
  assert.equal(prepared.ok, true, prepared.code);
  const packet = packetFor(prepared.value.receipt);
  const bound = await f.entry.bindModelFamilyInvocation({ invocation: prepared.value.handle, packet });
  assert.equal(bound.ok, true, bound.code);
  assert.equal(Object.keys(bound.value).length, 0);
  assert.equal((await f.entry.bindModelFamilyInvocation({ invocation: {}, packet })).code,
    "MODEL-FAMILY-BINDING-HANDLE-REQUIRED");
  for (const field of ["candidateCommit", "taskRoute", "selectedModelId", "effort", "authoritySha256",
    "discoverySha256", "packetBindingSha256"]) {
    const changed = { ...packet, [field]: field === "effort" ? "high" : "wrong" };
    assert.equal((await f.entry.bindModelFamilyInvocation({ invocation: prepared.value.handle, packet: changed })).ok, false, field);
  }
  assert.equal(f.counts.prelaunch, 1);
  assert.equal(f.counts.capture, 2);
});

test("active CLI/native port gaps are typed unavailable without fabricated success", async () => {
  const f = fixture({ prepareResult: { ok: false, code: "MODEL-FAMILY-NATIVE-PORT-UNQUALIFIED", retryable: false } });
  const result = await f.entry.prepareModelFamilyInvocation(input());
  assert.equal(result.ok, false);
  assert.equal(result.code, "MODEL-FAMILY-NATIVE-PORT-UNQUALIFIED");
  assert.equal(f.counts.prepare, 1);
});

test("S2 opaque complete catalogues advance new Sol invocation IDs, while replay stays held", async () => {
  const catalogues = [
    [{ modelId: "gpt-6-sol", version: [6] }],
    [{ modelId: "gpt-6-sol", version: [6] }, { modelId: "gpt-6.1-sol", version: [6, 1] }],
    [{ modelId: "gpt-6-sol", version: [6] }, { modelId: "gpt-6.1-sol", version: [6, 1] },
      { modelId: "gpt-6.2-sol", version: [6, 2] }],
  ];
  let models = catalogues[0];
  const f = fixture({ captureFreshDiscovery: (request) => actualS2OpaquePort({ models, key: request.key }) });
  const expected = ["gpt-6-sol", "gpt-6.1-sol", "gpt-6.2-sol"];
  for (let index = 0; index < expected.length; index += 1) {
    models = catalogues[index];
    const invocation = input({ invocationId: `sol-${index}` });
    const prepared = await f.entry.prepareModelFamilyInvocation(invocation);
    assert.equal(prepared.ok, true, prepared.code);
    assert.equal(prepared.value.receipt.selectedModelId, expected[index]);
    if (index === 0) {
      const replay = await f.entry.prepareModelFamilyInvocation(invocation);
      assert.equal(replay.value.receipt.selectedModelId, "gpt-6-sol");
      assert.equal(f.counts.capture, 1, "same-ID held replay performs no discovery");
    }
    const packet = packetFor(prepared.value.receipt);
    const bound = await f.entry.bindModelFamilyInvocation({ invocation: prepared.value.handle, packet });
    assert.equal(bound.ok, true, bound.code);
    const launched = await f.entry.launchModelFamilyInvocation({ binding: bound.value });
    assert.equal(launched.code, "MODEL-FAMILY-NATIVE-PORT-UNQUALIFIED");
  }
  assert.equal(f.counts.capture, 9, "fresh capture once per prepare/bind/launch; replay is offline");
  assert.equal(f.counts.prelaunch, 3);
});

test("same synthetic signed S4 authority advances Sol under real S2 handles and refuses unsupported head", async () => {
  const catalogues = [
    [{ modelId: "gpt-6-sol", version: [6] }],
    [{ modelId: "gpt-6-sol", version: [6] }, { modelId: "gpt-6.1-sol", version: [6, 1] }],
    [{ modelId: "gpt-6-sol", version: [6] }, { modelId: "gpt-6.1-sol", version: [6, 1] },
      { modelId: "gpt-6.2-sol", version: [6, 2] }],
  ];
  const f = await realS4EntryFixture(catalogues[0]);
  try {
    const authorityReceipts = [];
    for (let index = 0; index < catalogues.length; index += 1) {
      f.setModels(catalogues[index]);
      const invocation = input({ invocationId: `signed-sol-${index}` });
      const prepared = await f.entry.prepareModelFamilyInvocation(invocation);
      assert.equal(prepared.ok, true, prepared.code);
      assert.equal(prepared.value.receipt.selectedModelId, ["gpt-6-sol", "gpt-6.1-sol", "gpt-6.2-sol"][index]);
      authorityReceipts.push(prepared.value.receipt.authoritySha256);
      if (index === 0) {
        const before = f.captureCount();
        const held = await f.entry.prepareModelFamilyInvocation(invocation);
        assert.equal(held.value.receipt.receiptSha256, prepared.value.receipt.receiptSha256);
        assert.equal(f.captureCount(), before, "S4 exact-ID replay is offline");
      }
      const bound = await f.entry.bindModelFamilyInvocation({ invocation: prepared.value.handle,
        packet: packetFor(prepared.value.receipt) });
      assert.equal(bound.ok, true, bound.code);
      const launched = await f.entry.launchModelFamilyInvocation({ binding: bound.value });
      assert.equal(launched.ok, false, "native launch port remains unqualified");
    }
    assert.equal(new Set(authorityReceipts).size, 1, "all successor receipts retain identical signed authority");
    assert.equal(f.captureCount(), 9);
    f.setModels([{ modelId: "gpt-6.2-sol", version: [6, 2] },
      { modelId: "gpt-6.3-sol", version: [6, 3], efforts: ["low"] }]);
    const refused = await f.entry.prepareModelFamilyInvocation(input({ invocationId: "signed-sol-unsupported" }));
    assert.equal(refused.ok, false);
    assert.equal(refused.code, "EFFORT_UNSUPPORTED");
    assert.equal(Object.hasOwn(refused, "fallback"), false);
  } finally { f.cleanup(); }
});

test("same synthetic signed S4 authority advances Luna 6 to 7 under real S2 handles", async () => {
  const catalogues = [
    [{ modelId: "gpt-6-luna", version: [6] }],
    [{ modelId: "gpt-6-luna", version: [6] }, { modelId: "gpt-7-luna", version: [7] }],
  ];
  const f = await realS4EntryFixture(catalogues[0], { familyId: "luna", selectedModelId: "gpt-6-luna" });
  try {
    const authorities = [];
    for (let index = 0; index < catalogues.length; index += 1) {
      f.setModels(catalogues[index]);
      const prepared = await f.entry.prepareModelFamilyInvocation(input({ invocationId: `signed-luna-${index}` }));
      assert.equal(prepared.ok, true, prepared.code);
      assert.equal(prepared.value.receipt.familyId, "luna");
      assert.equal(prepared.value.receipt.selectedModelId, ["gpt-6-luna", "gpt-7-luna"][index]);
      authorities.push(prepared.value.receipt.authoritySha256);
    }
    assert.equal(new Set(authorities).size, 1, "Luna successor receipts retain the same signed authority");
    assert.equal(f.captureCount(), 2);
  } finally { f.cleanup(); }
});

test("overlapping asynchronous S2 captures keep each signed invocation bound to its own catalogue", async () => {
  const catalogues = new Map([
    ["overlap-left", [{ modelId: "gpt-6-sol", version: [6] }]],
    ["overlap-right", [{ modelId: "gpt-6-sol", version: [6] }, { modelId: "gpt-6.1-sol", version: [6, 1] }]],
  ]);
  let started = 0;
  let releaseBoth;
  const bothStarted = new Promise((resolve) => { releaseBoth = resolve; });
  const f = await realS4EntryFixture(catalogues.get("overlap-left"), {
    modelsForInvocation: (key) => catalogues.get(key.invocationId),
    beforeCapture: async (key) => {
      started += 1;
      if (started === 2) releaseBoth();
      await bothStarted;
      if (key.invocationId === "overlap-right") await new Promise((resolve) => setTimeout(resolve, 15));
    },
  });
  try {
    const [left, right] = await Promise.all([
      f.entry.prepareModelFamilyInvocation(input({ invocationId: "overlap-left" })),
      f.entry.prepareModelFamilyInvocation(input({ invocationId: "overlap-right" })),
    ]);
    assert.equal(left.ok, true, left.code);
    assert.equal(right.ok, true, right.code);
    assert.equal(left.value.receipt.selectedModelId, "gpt-6-sol");
    assert.equal(right.value.receipt.selectedModelId, "gpt-6.1-sol");
    assert.equal(left.value.receipt.authoritySha256, right.value.receipt.authoritySha256);
    assert.equal(f.captureCount(), 2);
  } finally { f.cleanup(); }
});

test("native request is source-admitted from the actual signed S4 receipt and consumed once through the shared driver", async () => {
  let delayedResolve;
  const f = await realS4EntryFixture([{ modelId: "gpt-6-sol", version: [6] }], {
    driverResult: () => new Promise((resolve) => { delayedResolve = resolve; }),
  });
  try {
    const prepared = await f.entry.prepareModelFamilyInvocation(input());
    assert.equal(prepared.ok, true, prepared.code);
    const receipt = prepared.value.receipt;
    const request = { schema: "pipeline.synthetic-native-request.v1", runner, sessionId, invocationId,
      taskRoute, candidateCommit, candidateTree, selectedModelId: receipt.selectedModelId,
      effort: receipt.effort, payload: { prompt: "sealed prompt", controls: { temperature: 0 } } };
    const binding = await f.entry.bindModelFamilyInvocation({ invocation: prepared.value.handle,
      packet: packetFor(receipt), nativeRequest: request });
    assert.equal(binding.ok, true, binding.code);
    request.payload.prompt = "caller mutation after binding";
    const copy = Object.freeze(Object.create(Object.getPrototypeOf(binding.value),
      Object.getOwnPropertyDescriptors(binding.value)));
    assert.equal((await f.entry.launchModelFamilyInvocation({ binding: copy })).code,
      "MODEL-FAMILY-LAUNCH-CAPABILITY-REQUIRED");
    const firstPromise = f.entry.launchModelFamilyInvocation({ binding: binding.value });
    for (let turn = 0; turn < 20 && !delayedResolve; turn += 1) await new Promise((resolve) => setImmediate(resolve));
    assert.equal(typeof delayedResolve, "function", "first launch reached the shared native driver");
    const second = await f.entry.launchModelFamilyInvocation({ binding: binding.value });
    assert.equal(second.ok, false);
    assert.equal(second.code, "MODEL-FAMILY-NATIVE-CAPABILITY-REQUIRED");
    assert.equal(f.admissionCount(), 1);
    assert.equal(f.nativeRequests.length, 1);
    assert.equal(f.nativeRequests[0].payload.prompt, "sealed prompt");
    assert.equal(Object.isFrozen(f.nativeRequests[0]), true);
    assert.equal(Object.isFrozen(f.nativeRequests[0].payload), true);
    delayedResolve({ ok: true, value: { accepted: true, modelId: receipt.selectedModelId } });
    const settled = await firstPromise;
    assert.equal(settled.ok, true);
    assert.equal(settled.value.modelId, receipt.selectedModelId);
  } finally { f.cleanup(); }
});

test("missing native request port and non-JSON request fail before any launch", async () => {
  const f = await realS4EntryFixture([{ modelId: "gpt-6-sol", version: [6] }], { nativePort: false });
  try {
    const prepared = await f.entry.prepareModelFamilyInvocation(input());
    assert.equal(prepared.ok, true, prepared.code);
    const packet = packetFor(prepared.value.receipt);
    const noPort = await f.entry.bindModelFamilyInvocation({ invocation: prepared.value.handle, packet,
      nativeRequest: { schema: "pipeline.synthetic-native-request.v1" } });
    assert.equal(noPort.code, "MODEL-FAMILY-NATIVE-PORT-UNQUALIFIED");
    assert.equal(f.nativeRequests.length, 0);
  } finally { f.cleanup(); }

  const g = await realS4EntryFixture([{ modelId: "gpt-6-sol", version: [6] }]);
  try {
    const prepared = await g.entry.prepareModelFamilyInvocation(input());
    assert.equal(prepared.ok, true, prepared.code);
    const cyclic = { schema: "pipeline.synthetic-native-request.v1" };
    cyclic.self = cyclic;
    const result = await g.entry.bindModelFamilyInvocation({ invocation: prepared.value.handle,
      packet: packetFor(prepared.value.receipt), nativeRequest: cyclic });
    assert.equal(result.code, "MODEL-FAMILY-NATIVE-REQUEST-INVALID");
    assert.equal(g.admissionCount(), 0);
    assert.equal(g.nativeRequests.length, 0);
  } finally { g.cleanup(); }
});

test("current identity entry uses the host session source and keeps dispatch invocation ID separate", async () => {
  const f = await realS4EntryFixture([{ modelId: "gpt-6-sol", version: [6] }]);
  try {
    const prepared = await f.entry.prepareCurrentModelFamilyInvocation({ kind: "dispatch", runner, taskRoute,
      invocationId: "dispatch-unique-1" });
    assert.equal(prepared.ok, true, prepared.code);
    assert.equal(prepared.value.receipt.sessionId, "host-session-actual");
    assert.equal(prepared.value.receipt.invocationId, "dispatch-unique-1");
    assert.notEqual(prepared.value.receipt.sessionId, prepared.value.receipt.invocationId);
    assert.equal(prepared.value.receipt.candidateCommit, candidateCommit);
  } finally { f.cleanup(); }

  const noHostIdentity = fixture();
  const unavailable = await noHostIdentity.entry.prepareCurrentModelFamilyInvocation({ kind: "dispatch", runner,
    taskRoute, invocationId: "dispatch-unique-2" });
  assert.equal(unavailable.code, "MODEL-FAMILY-NATIVE-PORT-UNQUALIFIED");
  assert.equal(noHostIdentity.counts.prepare, 0);
});

registerTestCaseCompletion({ cases, fd: 3, maxBytes: 65536 });
