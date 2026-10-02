// SPDX-License-Identifier: SUL-1.0
/** Synthetic host evidence exercises source behavior, never installed proof. */
import { registerTestCaseCompletion } from "./test-case-completion.mjs";
const completionCases = [];
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { createModelFamilyExecutionHost, validateModelFamilyExecutionReceipt, validateInvocationReadback, pass, fail, digest, EXECUTION_RUNNERS } from "./model-family-execution.mjs";
import { createModelFamilyDiscoveryHost } from "./model-family-discovery.mjs";
import { createCodexFamilyAdapter } from "./model-family-codex-adapter.mjs";
import { createClaudeFamilyAdapter } from "./model-family-claude-adapter.mjs";
import { createAntigravityFamilyAdapter } from "./model-family-antigravity-adapter.mjs";
import { createModelFamilyHostController } from "./model-family-host-store.mjs";
import { canonicalizeJson } from "./governance-event.mjs";
import { createModelFamilyDiscoveryHost as createAssemblyDiscoveryHost, RULE_FIELDS as ASSEMBLY_RULE_FIELDS, digest as assemblyS2Digest } from "./model-family-discovery.mjs";
import { createCodexFamilyAdapter as createAssemblyCodexAdapter } from "./model-family-codex-adapter.mjs";
const H = "a".repeat(64), B = { installationBindingSha256: H, accountBindingSha256: "b".repeat(64), hostProcessBindingSha256: "c".repeat(64) };
const factories = { codex: createCodexFamilyAdapter, claude: createClaudeFamilyAdapter, antigravity: createAntigravityFamilyAdapter };
function invocation(runner = "codex", overrides = {}) {
  const subject = { schema: "pipeline.model-family-invocation.v2", kind: "model-family-invocation", runner, sessionId: "fixture:session",
    invocationId: "fixture-invocation", candidateCommit: "1".repeat(40), candidateTree: "2".repeat(40), taskRoute: "duty.worker", role: "worker", effort: "high",
    familyId: "fixture-family", releaseId: "fixture-release-6.1", version: [6, 1], selectedModelId: "fixture-6.1", canonicalModelId: null,
    groupingEvidenceSha256: H, variantSelectionEvidenceSha256: H, selection: "latest", authoritySha256: H, pinDecisionSha256: null,
    adapterContractSha256: H, discoverySha256: H, compatibilityEvidenceSha256: H, observedAt: "2026-10-01T10:00:00.000Z",
    expiresAt: "2026-10-01T10:01:00.000Z", storeGeneration: 1, watermarkBefore: [6], watermarkAfter: [6, 1], packetBindingSha256: H, ...overrides };
  return { ...subject, receiptSha256: digest(subject) };
}
function fixture(runner = "codex", options = {}) {
  let i = invocation(runner, options.invocation);
  const native = new WeakMap(), observedContext = new WeakMap();
  const s2 = createModelFamilyDiscoveryHost({ clock: () => "2026-10-01T10:00:00.000Z",
    execution: ({ runner: actualRunner, rawHostResult, bindings }) => {
      const e = native.get(rawHostResult);
      if (!e || actualRunner !== runner || digest(bindings) !== digest(B)) return fail("EXECUTION_IDENTITY_UNAVAILABLE");
      return pass("SYNTHETIC_NATIVE_OBSERVATION", { actualModelIds: e.ids, actualEffort: e.effort,
        rawHostResultSha256: digest(rawHostResult), hostObservationSha256: H });
    } });
  const context = s2.createContext({ runner, bindings: B, observedAt: "2026-10-01T10:00:00.000Z", expiresAt: "2026-10-01T10:01:00.000Z" }).value;
  const adapters = { [runner]: factories[runner](s2) }, audits = [];
  const controls = () => ({ invocationReceiptSha256: i.receiptSha256, runner,
    supported: { status: "supported", efforts: [i.effort], evidenceSha256: H },
    requested: { modelId: i.selectedModelId, effort: i.effort, evidenceSha256: H },
    configured: { modelId: i.selectedModelId, effort: i.effort, evidenceSha256: H, assurance: "host-configured" },
    execution: { status: "succeeded", evidenceSha256: H } });
  const host = createModelFamilyExecutionHost({ adapters,
    readInvocation: options.readInvocation ?? (() => pass("SYNTHETIC_S4_READ", { invocation: i, bindings: B, provenanceSha256: H })),
    readLaunchEvidence: options.readLaunchEvidence ?? (() => { const c = controls(); options.mutateControls?.(c); return pass("SYNTHETIC_HOST_CONTROLS", c); }),
    contextForInvocation: () => pass("S2_HOST_CONTEXT", context),
    verifyAlias: options.verifyAlias,
    appendExecution: ({ receipt, observation }) => { audits.push({ receipt, observation }); return pass("SYNTHETIC_APPEND", null); },
  });
  return { host, audits, invocation: () => i, replaceInvocation: (v) => { i = v; },
    raw(ids = [i.selectedModelId], effort = null) { const raw = Object.freeze({ kind: "synthetic-native-result", sequence: 1 });
      native.set(raw, { ids, effort }); return raw; } };
}

const hashText = (v) => createHash("sha256").update(v).digest("hex");
const approvalCandidate = { commit: "1".repeat(40), tree: "2".repeat(40) };
async function realS4Receipt() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const pem = publicKey.export({ format: "pem", type: "spki" });
  const anchors = [{ keyReference: "s4-s6-interop-test", publicKeySha256: hashText(pem) }];
  const route = { runner: "codex", taskRoute: "duty.worker", role: "frontier", effort: "high", familyId: "fixture" };
  const canonical = (v) => canonicalizeJson(v);
  const sha = (v) => hashText(v);
  const policyDigest = (v) => sha(canonical(v));
  let discoveryHandle;
  const rules = {}, contract = { schema: "pipeline.model-family-adapter-contract.v1", runner: "codex", familyId: "fixture",
    discoveryModes: ["complete-catalogue"], providerEvidenceSha256s: [sha("provider-contract")] };
  const releaseVersion = [6, 1], modelId = "provider-model-6.1";
  for (const name of ASSEMBLY_RULE_FIELDS) {
    contract[name] = { id: `interop-${name}`, version: 1, sha256: sha(name) };
    const run = name === "identityRule" ? ({ phase, entry }) => phase === "coverage"
      ? pass("TEST", { mode: "complete-catalogue", evidenceSha256: sha("coverage"), latestAliasEvidenceSha256: null })
      : pass("TEST", { model: entry.model })
      : name === "releaseGroupingRule" ? () => pass("TEST", { releaseId: "fixture-6-1", familyId: "fixture", groupingEvidenceSha256: sha("group") })
      : name === "versionRule" ? () => pass("TEST", releaseVersion)
      : name === "variantSelectionRule" ? ({ entry }) => pass("TEST", { modelId: entry.model, canonicalModelId: null, aliasEvidenceSha256: null })
      : name === "selectabilityRule" ? () => pass("TEST", { released: true, visible: true, selectable: true })
      : name === "effortRule" ? () => pass("TEST", { efforts: ["high"], capabilityEvidenceSha256: sha("capability") })
      : () => fail("UNUSED");
    rules[contract[name].id] = { version: 1, sha256: sha(name), run };
  }
  const selector = { kind: "model-id", value: "provider-model-6.1" };
  const taskRoutes = [{ taskRoute: route.taskRoute, runner: route.runner, role: route.role, effort: route.effort, state: "default", selector }];
  const configuredRoutes = [{ runner: route.runner, role: route.role, effort: route.effort, selector }];
  const assignments = [{ runner: route.runner, role: route.role, effort: route.effort, taskRoutes: [route.taskRoute],
    familyId: route.familyId, adapterContractSha256: assemblyS2Digest(contract), minimumVersion: [6], update: "latest" }];
  const subject = { revision: "model-family-v2", predecessorAuthoritySha256: null,
    routeSourceSha256: policyDigest({ taskRoutes, configuredRoutes }), assignments, migration: null };
  const subjectSha256 = policyDigest(subject);
  const intentValue = { schema: "pipeline.po-approval-intent.v1", kind: "model-role-policy", featureId: "model-role-routes",
    planSha256: subject.routeSourceSha256, specSha256: subjectSha256, candidate: approvalCandidate,
    policyRevision: "model-family-v2", subjectSha256, decision: "approved" };
  const approvalIntent = { value: intentValue, sha256: policyDigest(intentValue) };
  const bundle = { schema: "pipeline.model-family-approved-policy.v2", candidateAtApproval: approvalCandidate, subject,
    approvalIntent, proof: { schema: "pipeline.po-approval-proof.v1", intentSha256: approvalIntent.sha256,
      keyReference: anchors[0].keyReference, publicKey: pem,
      signatureBase64: sign(null, Buffer.from(approvalIntent.sha256), privateKey).toString("base64") } };
  const s2 = createAssemblyDiscoveryHost({ rules, clock: () => "2026-10-01T10:00:00.000Z",
    capture: async (ctx) => pass("TEST", { bindings: ctx.bindings, observedAt: ctx.observedAt, source: "S4-S6-test", pages: [
      { request: { id: 1, method: "model/list", params: { cursor: null, limit: 100, includeHidden: true } },
        responseBytes: JSON.stringify({ id: 1, result: { data: [{ id: modelId, model: modelId, hidden: false, version: releaseVersion,
          released: true, supportedReasoningEfforts: [{ reasoningEffort: "high" }] }], nextCursor: null } }) }] }),
    verifyProviderContract: ({ contractSha256, contract: c }) => pass("TEST", { contractSha256, providerEvidenceSha256s: c.providerEvidenceSha256s }),
    compatibility: ({ runner: r, record, variant, slot }) => {
      const d = s2.readDiscovery(discoveryHandle).value;
      return pass("TEST", { subjectSha256: assemblyS2Digest({ runner: r, releaseId: record.releaseId, modelId: variant.modelId,
        ...slot, discoverySha256: assemblyS2Digest(d), adapterContractSha256: d.adapterContractSha256 }), evidenceSha256: sha("compat") });
    } });
  const bindings = B;
  const context = s2.createContext({ runner: "codex", bindings, observedAt: "2026-10-01T10:00:00.000Z", expiresAt: "2026-10-01T10:01:00.000Z" }).value;
  const qualified = s2.qualifyContract(contract).value, adapter = createAssemblyCodexAdapter(s2);
  const raw = await adapter.captureRawDiscovery(context), coverage = adapter.verifyCoverage(raw.value, context, qualified);
  const normalized = adapter.normalizeReleases(raw.value, qualified, coverage.value); discoveryHandle = normalized.value;
  const compatible = adapter.verifyCompatibility({ discovery: discoveryHandle, releaseId: "fixture-6-1", modelId },
    { taskRoute: route.taskRoute, role: "frontier", effort: route.effort }, context, qualified);
  if (!compatible.ok) throw new Error(`S2 compatibility failed: ${compatible.code}`);
  const prepContext = { coverage: { familyId: "fixture", coverageEvidenceSha256: sha("coverage"), unknownTargetFamilyEvidenceSha256s: [] },
    hardEligibility: { runner: "codex", taskRoute: route.taskRoute, role: "frontier", effort: route.effort,
      evidenceSha256: sha("hard"), minimumVersion: null, deniedModelIds: [] }, variantRule: null,
    compatibility: { runner: "codex", taskRoute: route.taskRoute, role: "frontier", effort: route.effort, modelId, evidenceSha256: sha("compat") }, latestAlias: null };
  const root = mkdtempSync(join(resolve("/var/tmp"), "s4-s6-real-receipt-"));
  const source = {
    readAuthorityInputs: () => ({ bundle, routeSource: { ok: true, taskRoutes, configuredRoutes }, trustAnchors: anchors, predecessor: null }),
    readPinInputs: () => [],
    readFreshDiscovery: () => ({ discoveryHost: s2, discoveryHandle: compatible.value.discovery, context: prepContext }),
    readCurrentCandidate: () => ({ candidateCommit: "3".repeat(40), candidateTree: "4".repeat(40) }),
    launchDriver: () => ({ ok: true, value: null }),
  };
  try {
    const host = createModelFamilyHostController({ rootDir: root, trustedSources: source, clock: () => Date.parse("2026-10-01T10:00:30.000Z") });
    const active = host.activate(); if (!active.ok) throw new Error(`S4 activation failed: ${active.code}`);
    const prepared = host.prepare({ key: { runner: "codex", installationBindingSha256: bindings.installationBindingSha256,
      accountBindingSha256: bindings.accountBindingSha256, sessionId: "session:interop", invocationId: "invocation:interop" }, assignment: route });
    if (!prepared.ok) throw new Error(`S4 prepare failed: ${prepared.code}`);
    return { receipt: prepared.value.receipt, bindings, provenanceSha256: sha("s4-provenance") };
  } finally { rmSync(root, { recursive: true, force: true }); }
}

for (const runner of EXECUTION_RUNNERS) {
  completionCases.push({ id: "MFE" + String(completionCases.length + 1).padStart(3, "0"), name: `${runner}: S2 host identity + supported/requested/configured permit unknown optional actual effort`, run: async () => {
    const f = fixture(runner), result = await f.host.recordModelFamilyExecution({ invocationId: "fixture-invocation", rawHostResult: f.raw() });
    assert.equal(result.ok, true); const r = f.host.readExecutionReceipt(result.value).value;
    assert.equal(r.outcome, "matched"); assert.equal(r.actualEffort, null); assert.deepEqual(r.actualModelIds, ["fixture-6.1"]);
    assert.equal(validateModelFamilyExecutionReceipt(r).ok, true);
    assert.equal(f.audits[0].observation.effective.status, "unknown");
    assert.equal(f.audits[0].observation.effective.evidenceSha256, null);
    assert.equal(r.hostObservationSha256, digest(f.audits[0].observation));
    assert.equal(Object.isFrozen(r), true); assert.equal(f.host.readExecutionReceipt(structuredClone(result.value)).ok, false);
  } });
  completionCases.push({ id: "MFE" + String(completionCases.length + 1).padStart(3, "0"), name: `${runner}: caller echo, config and init.model cannot become actual proof`, run: async () => {
    for (const raw of [{ requestedModel: "fixture-6.1", requestedEffort: "high" }, { config: { model: "fixture-6.1", reasoningEffort: "high" } }, { init: { model: "fixture-6.1" } }]) {
      const f = fixture(runner), r = await f.host.recordModelFamilyExecution({ invocationId: "fixture-invocation", rawHostResult: raw });
      assert.deepEqual(r, { ok: false, code: "EXECUTION_IDENTITY_UNAVAILABLE", retryable: false });
      assert.equal(f.audits[0].receipt.outcome, "identity-unavailable");
    }
  } });
  completionCases.push({ id: "MFE" + String(completionCases.length + 1).padStart(3, "0"), name: `${runner}: model mismatch, missing/multiple identity and trusted effort contradictions refuse`, run: async () => {
    for (const [ids, effort, code] of [[["fixture-6.2"], null, "EXECUTION_MODEL_MISMATCH"], [[], null, "EXECUTION_IDENTITY_UNAVAILABLE"],
      [["fixture-6.1", "fixture-6.2"], null, "EXECUTION_IDENTITY_MULTIPLE_OR_MISSING"], [["fixture-6.1"], "medium", "EXECUTION_EFFORT_MISMATCH"]]) {
      const f = fixture(runner), r = await f.host.recordModelFamilyExecution({ invocationId: "fixture-invocation", rawHostResult: f.raw(ids, effort) });
      assert.equal(r.code, code); assert.equal(r.ok, false); assert.deepEqual(Object.keys(r).sort(), ["code", "ok", "retryable"]);
    }
  } });
  completionCases.push({ id: "MFE" + String(completionCases.length + 1).padStart(3, "0"), name: `${runner}: capability absence and exact request/config contradictions fail independently`, run: async () => {
    for (const [mutateControls, code] of [
      [(c) => { c.supported.status = "unknown"; c.supported.efforts = null; c.supported.evidenceSha256 = null; }, "SUPPORTED_EFFORT_UNVERIFIED"],
      [(c) => { c.supported.efforts = ["medium"]; }, "SUPPORTED_EFFORT_UNVERIFIED"],
      [(c) => { c.requested.effort = "medium"; }, "REQUEST_BINDING_MISMATCH"],
      [(c) => { c.requested.modelId = "fixture-6.0"; }, "REQUEST_BINDING_MISMATCH"],
      [(c) => { c.configured.effort = "medium"; }, "CONFIGURATION_BINDING_MISMATCH"],
      [(c) => { c.configured.modelId = "fixture-6.0"; }, "CONFIGURATION_BINDING_MISMATCH"],
      [(c) => { c.configured.assurance = "argv-only"; }, "EXECUTION_CONTROLS_UNVERIFIED"]]) {
      const f = fixture(runner, { mutateControls }), r = await f.host.recordModelFamilyExecution({ invocationId: "fixture-invocation", rawHostResult: f.raw() });
      assert.equal(r.code, code);
    }
  } });
  completionCases.push({ id: "MFE" + String(completionCases.length + 1).padStart(3, "0"), name: `${runner}: native observed effort stays separate and max/not-applicable do not collapse`, run: async () => {
    for (const effort of ["high", "max", "not-applicable"]) {
      const f = fixture(runner, { invocation: { effort } }), r = await f.host.recordModelFamilyExecution({ invocationId: "fixture-invocation", rawHostResult: f.raw(["fixture-6.1"], effort) });
      assert.equal(r.ok, true); assert.equal(f.host.readExecutionReceipt(r.value).value.actualEffort, effort);
      assert.equal(f.audits[0].observation.effective.status, "observed");
    }
  } });
}
completionCases.push({ id: "MFE" + String(completionCases.length + 1).padStart(3, "0"), name: "exact canonical identity needs invocation-bound independent alias evidence", run: async () => {
  const failed = fixture("claude", { invocation: { selectedModelId: "fixture-alias", canonicalModelId: "fixture-6.1" } });
  assert.equal((await failed.host.recordModelFamilyExecution({ invocationId: "fixture-invocation", rawHostResult: failed.raw(["fixture-6.1"]) })).code, "ALIAS_EXECUTION_UNVERIFIED");
  const verified = fixture("claude", { invocation: { selectedModelId: "fixture-alias", canonicalModelId: "fixture-6.1" },
    verifyAlias: ({ invocation: i, actualModelId }) => pass("SYNTHETIC_ALIAS", { invocationReceiptSha256: i.receiptSha256,
      selectedModelId: i.selectedModelId, canonicalModelId: actualModelId, adapterContractSha256: i.adapterContractSha256, evidenceSha256: H }) });
  assert.equal((await verified.host.recordModelFamilyExecution({ invocationId: "fixture-invocation", rawHostResult: verified.raw(["fixture-6.1"]) })).ok, true);
  const drifted = fixture("claude", { invocation: { selectedModelId: "fixture-alias", canonicalModelId: "fixture-6.1" },
    verifyAlias: () => pass("FORGED_ALIAS", { invocationReceiptSha256: H, selectedModelId: "fixture-alias", canonicalModelId: "fixture-6.1", adapterContractSha256: H, evidenceSha256: H }) });
  assert.equal((await drifted.host.recordModelFamilyExecution({ invocationId: "fixture-invocation", rawHostResult: drifted.raw(["fixture-6.1"]) })).code, "ALIAS_EXECUTION_UNVERIFIED");
} });
completionCases.push({ id: "MFE" + String(completionCases.length + 1).padStart(3, "0"), name: "immutable held result cannot be replaced by new raw results or newer invocation", run: async () => {
  const f = fixture(), raw = f.raw(), first = await f.host.recordModelFamilyExecution({ invocationId: "fixture-invocation", rawHostResult: raw });
  const held = await f.host.recordModelFamilyExecution({ invocationId: "fixture-invocation", rawHostResult: raw });
  assert.equal(held.value, first.value); assert.equal(f.audits.length, 1);
  f.replaceInvocation(invocation("codex", { selectedModelId: "fixture-6.2" }));
  assert.equal((await f.host.recordModelFamilyExecution({ invocationId: "fixture-invocation", rawHostResult: raw })).code, "EXECUTION_IMMUTABLE_CONFLICT");
} });
completionCases.push({ id: "MFE" + String(completionCases.length + 1).padStart(3, "0"), name: "forged invocation digest, provider result extras, absent ports and legacy receipt kinds fail closed", run: async () => {
  const i = invocation(); assert.equal(validateInvocationReadback({ invocation: { ...i, selectedModelId: "fixture-6.2" }, bindings: B, provenanceSha256: H }).code, "INVOCATION_DIGEST_MISMATCH");
  for (const kind of ["bootstrap", "dispatch", "request"]) {
    const { receiptSha256, ...subject } = i;
    const wrongKind = { ...subject, kind };
    assert.equal(validateInvocationReadback({ invocation: { ...wrongKind, receiptSha256: digest(wrongKind) }, bindings: B, provenanceSha256: H }).code, "INVOCATION_INVALID");
  }
  for (const bad of [
    invocation("codex", { sessionId: "bad/id" }), invocation("codex", { invocationId: "bad/id" }),
    invocation("codex", { selectedModelId: "bad\\id" }), invocation("codex", { taskRoute: "duty." + "x".repeat(121) }),
    invocation("codex", { storeGeneration: 0 }),
  ]) assert.equal(validateInvocationReadback({ invocation: bad, bindings: B, provenanceSha256: H }).code, "INVOCATION_INVALID");
  const s4Shapes = invocation("codex", { selectedModelId: "provider:model/6.2", canonicalModelId: "canonical:6.2" });
  assert.equal(validateInvocationReadback({ invocation: s4Shapes, bindings: B, provenanceSha256: H }).ok, true);
  const closed = createModelFamilyExecutionHost(); assert.equal((await closed.recordModelFamilyExecution({ invocationId: "fixture-invocation", rawHostResult: {} })).code, "HOST_PORT_UNAVAILABLE");
  const f = fixture("codex", { readInvocation: () => ({ ok: true, value: { admitted: true }, code: "FORGED", admitted: true }) });
  assert.equal((await f.host.recordModelFamilyExecution({ invocationId: "fixture-invocation", rawHostResult: {} })).code, "HOST_RESULT_INVALID");
  assert.equal(validateModelFamilyExecutionReceipt({ schema: "pipeline.model-role-execution.v1", selectedModelId: "historic" }).ok, false);
  const { receipt, bindings, provenanceSha256 } = await realS4Receipt();
  assert.equal(receipt.kind, "model-family-invocation"); assert.equal(receipt.storeGeneration, 1);
  assert.equal(receipt.sessionId, "session:interop"); assert.equal(receipt.invocationId, "invocation:interop");
  assert.equal(validateInvocationReadback({ invocation: receipt, bindings, provenanceSha256 }).ok, true);
  const accepted = fixture("codex"); accepted.replaceInvocation(receipt);
  const executed = await accepted.host.recordModelFamilyExecution({ invocationId: receipt.invocationId, rawHostResult: accepted.raw() });
  assert.equal(executed.ok, true, executed.code);
  assert.equal(accepted.host.readExecutionReceipt(executed.value).value.outcome, "matched");
  const broken = { ...receipt, packetBindingSha256: "d".repeat(64) };
  assert.equal(validateInvocationReadback({ invocation: broken, bindings, provenanceSha256 }).code, "INVOCATION_DIGEST_MISMATCH");
  const misbound = fixture("codex", { mutateControls: (c) => { c.invocationReceiptSha256 = H; } });
  misbound.replaceInvocation(receipt);
  assert.equal((await misbound.host.recordModelFamilyExecution({ invocationId: receipt.invocationId, rawHostResult: misbound.raw() })).code, "EXECUTION_CONTROLS_UNVERIFIED");
} });
completionCases.push({ id: "MFE" + String(completionCases.length + 1).padStart(3, "0"), name: "trusted failed execution records failure audit without qualifying delivery", run: async () => {
  const f = fixture("antigravity", { mutateControls: (c) => { c.execution.status = "failed"; } });
  assert.equal((await f.host.recordModelFamilyExecution({ invocationId: "fixture-invocation", rawHostResult: f.raw() })).code, "HOST_EXECUTION_FAILED");
  assert.equal(f.audits[0].receipt.outcome, "execution-failed"); assert.equal(validateModelFamilyExecutionReceipt(f.audits[0].receipt).ok, true);
} });

registerTestCaseCompletion({ cases: completionCases, fd: 3, maxBytes: 65536 });
