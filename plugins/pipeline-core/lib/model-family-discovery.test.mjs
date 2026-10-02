// SPDX-License-Identifier: SUL-1.0
/** Every semantic rule and provider evidence in this suite is SYNTHETIC.
 * Passing tests never qualifies installed accounts or upstream semantics. */
import { registerTestCaseCompletion } from "./test-case-completion.mjs";
const completionCases = [];
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createModelFamilyDiscoveryHost, validateAdapterContract, RULE_FIELDS, RUNNERS, pass, fail, digest, bytesDigest } from "./model-family-discovery.mjs";
import { createCodexFamilyAdapter } from "./model-family-codex-adapter.mjs";
import { createClaudeFamilyAdapter } from "./model-family-claude-adapter.mjs";
import { createAntigravityFamilyAdapter } from "./model-family-antigravity-adapter.mjs";

const H = "a".repeat(64), B = { installationBindingSha256: H, accountBindingSha256: "b".repeat(64), hostProcessBindingSha256: "c".repeat(64) };
const NOW = "2026-10-01T10:00:00.000Z", EXP = "2026-10-01T10:01:00.000Z";
const factories = { codex: createCodexFamilyAdapter, claude: createClaudeFamilyAdapter, antigravity: createAntigravityFamilyAdapter };
const codexPage = (data, cursor = null, nextCursor = null, id = 1) => ({ request: { id, method: "model/list", params: { cursor, limit: 100, includeHidden: true } }, responseBytes: JSON.stringify({ id, result: { data, nextCursor } }) });
const entry = (model = "fixture-6.1", extra = {}) => ({ id: model, model, hidden: false, version: [6, 1], released: true,
  supportedReasoningEfforts: [{ reasoningEffort: "high" }], ...extra });
function fixture(runner = "codex", options = {}) {
  let now = NOW;
  const contract = { schema: "pipeline.model-family-adapter-contract.v1", runner, familyId: "fixture-family", discoveryModes: ["complete-catalogue"], providerEvidenceSha256s: [H] };
  const ruleFns = {
    identityRule: ({ phase, entry: e }) => phase === "coverage" ? pass("SYNTHETIC", { mode: "complete-catalogue", evidenceSha256: H, latestAliasEvidenceSha256: null })
      : e.unknown ? fail("FAMILY_COVERAGE_UNKNOWN") : pass("SYNTHETIC", { model: e.model ?? e.value ?? e.modelId }),
    releaseGroupingRule: ({ entry: e, identity }) => pass("SYNTHETIC", { releaseId: e.releaseId ?? identity.model, familyId: "fixture-family", groupingEvidenceSha256: H }),
    versionRule: ({ entry: e }) => pass("SYNTHETIC", e.version ?? [6, 1]),
    variantSelectionRule: ({ entry: e, identity }) => pass("SYNTHETIC", { modelId: identity.model, canonicalModelId: e.canonicalModelId ?? null, aliasEvidenceSha256: e.aliasEvidenceSha256 ?? null }),
    selectabilityRule: ({ entry: e }) => pass("SYNTHETIC", { released: e.released ?? true, visible: !e.hidden, selectable: !e.hidden && (e.released ?? true) }),
    effortRule: ({ entry: e }) => pass("SYNTHETIC", { efforts: e.supportedReasoningEfforts?.map((x) => x.reasoningEffort) ?? e.supportedEffortLevels ?? null, capabilityEvidenceSha256: H }),
    compatibilityRule: () => fail("SYNTHETIC_UNUSED"), executionIdentityRule: () => fail("SYNTHETIC_UNUSED"),
  };
  const rules = {};
  for (const name of RULE_FIELDS) { contract[name] = { id: `fixture-${name}`, version: 1, sha256: H };
    rules[contract[name].id] = { version: 1, sha256: H, run: options.ruleFns?.[name] ?? ruleFns[name] }; }
  let pages = options.pages;
  if (!pages) pages = runner === "codex" ? [codexPage([entry()])] : runner === "claude"
    ? [{ request: { operation: "reinitialize", sdkVersion: "0.3.220" }, responseBytes: JSON.stringify({ models: [{ value: "fixture-6.1", version: [6, 1], supportedEffortLevels: ["high"] }] }) }]
    : [{ request: { argv: ["models"] }, responseBytes: "fixture-6.1 Fixture label\n" }];
  const capture = options.capture ?? (async (c) => pass("SYNTHETIC_CAPTURE", { bindings: c.bindings, observedAt: c.observedAt, source: "synthetic-fixture-only", pages }));
  const compatibility = options.compatibility ?? (({ runner, record, variant, slot, contract: c }) => {
    const d = host.readDiscovery(latest).value;
    return pass("SYNTHETIC_COMPATIBILITY", { subjectSha256: digest({ runner, releaseId: record.releaseId, modelId: variant.modelId,
      ...slot, discoverySha256: digest(d), adapterContractSha256: digest(c) }), evidenceSha256: H });
  });
  const execution = options.execution ?? (({ rawHostResult }) => rawHostResult.native !== true ? fail("EXECUTION_IDENTITY_UNAVAILABLE")
    : pass("SYNTHETIC_EXECUTION", { actualModelIds: rawHostResult.observedIds, actualEffort: rawHostResult.effort ?? null,
      rawHostResultSha256: digest(rawHostResult), hostObservationSha256: H }));
  const host = createModelFamilyDiscoveryHost({ capture, rules, clock: () => now, compatibility, execution,
    verifyProviderContract: options.verifyProviderContract ?? (({ contractSha256, contract: c }) => pass("SYNTHETIC_QUALIFICATION", { contractSha256, providerEvidenceSha256s: c.providerEvidenceSha256s })) });
  const context = host.createContext({ runner, bindings: B, observedAt: NOW, expiresAt: EXP }).value;
  const qualified = host.qualifyContract(contract);
  const adapter = factories[runner](host);
  let latest;
  return { host, adapter, context, contract, qualified, setNow: (v) => { now = v; },
    async discover() { const raw = await adapter.captureRawDiscovery(context); if (!raw.ok) return raw;
      const cov = adapter.verifyCoverage(raw.value, context, qualified.value); if (!cov.ok) return cov;
      const normalized = adapter.normalizeReleases(raw.value, qualified.value, cov.value); if (normalized.ok) latest = normalized.value;
      return normalized; } };
}

completionCases.push({ id: "MFD" + String(completionCases.length + 1).padStart(3, "0"), name: "contracts are structural, immutable and closed to unknown keys/release inventories", run: () => {
  const f = fixture(); assert.equal(f.qualified.ok, true); assert.equal(Object.isFrozen(f.qualified.value), true);
  assert.equal(validateAdapterContract({ ...f.contract, releases: [] }).code, "ADAPTER_CONTRACT_INVALID");
  const closed = fixture("codex", { verifyProviderContract: () => fail("ADAPTER_CONTRACT_UNQUALIFIED") });
  assert.deepEqual(closed.qualified, { ok: false, code: "ADAPTER_CONTRACT_UNQUALIFIED", retryable: false });
  assert.equal(f.host.qualifyContract({ ...f.contract, runner: "other" }).ok, false);
} });
completionCases.push({ id: "MFD" + String(completionCases.length + 1).padStart(3, "0"), name: "wire admission flags and serialized handles cannot gain authority", run: async () => {
  const f = fixture(); const raw = await f.adapter.captureRawDiscovery(f.context);
  assert.equal(f.adapter.verifyCoverage(raw.value, { admitted: true }, f.qualified.value).code, "HOST_HANDLE_REQUIRED");
  assert.equal(f.adapter.verifyCoverage(raw.value, f.context, structuredClone(f.qualified.value)).code, "HOST_HANDLE_REQUIRED");
  assert.equal(f.host.readDiscovery({ schema: "pipeline.model-family-discovery.v1", admitted: true }).ok, false);
} });
completionCases.push({ id: "MFD" + String(completionCases.length + 1).padStart(3, "0"), name: "raw bytes, optional absence and request sequence are retained without effort filtering", run: async () => {
  const page = codexPage([entry("fixture-6.1", { hidden: true }), entry("fixture-6.2", { released: false, version: [6, 2] }), entry("fixture-6.3", { version: [6, 3], supportedReasoningEfforts: undefined })]);
  const f = fixture("codex", { pages: [page] }), raw = await f.adapter.captureRawDiscovery(f.context);
  const retained = f.host.readRetainedRaw(raw.value).value;
  assert.equal(retained.pages[0].responseBytes, page.responseBytes);
  assert.equal(retained.pages[0].responseByteSha256, bytesDigest(page.responseBytes));
  assert.deepEqual(retained.pages[0].request, page.request);
  assert.equal(Object.isFrozen(retained.pages[0].request), true);
  const d = await f.discover(), records = f.host.readDiscovery(d.value).value.records;
  assert.equal(records.length, 3); assert.equal(records[0].variants[0].selectable, false);
  assert.equal(records[1].released, false); assert.equal(records[2].variants[0].efforts, null);
} });
completionCases.push({ id: "MFD" + String(completionCases.length + 1).padStart(3, "0"), name: "unknown effort tokens survive; supported empty differs from unknown", run: async () => {
  const f = fixture("codex", { pages: [codexPage([entry("fixture-6.1", { supportedReasoningEfforts: [{ reasoningEffort: "future-effort" }] }), entry("fixture-6.2", { version: [6, 2], supportedReasoningEfforts: [] })])] });
  const d = await f.discover(), records = f.host.readDiscovery(d.value).value.records;
  assert.deepEqual(records[0].variants[0].efforts, ["future-effort"]); assert.deepEqual(records[1].variants[0].efforts, []);
} });
completionCases.push({ id: "MFD" + String(completionCases.length + 1).padStart(3, "0"), name: "account, installation and process mismatch fail independently", run: async () => {
  for (const key of Object.keys(B)) { const f = fixture("codex", { capture: async (c) => pass("SYNTHETIC", { bindings: { ...c.bindings, [key]: "d".repeat(64) }, pages: [codexPage([entry()])], source: "fixture", observedAt: NOW }) });
    assert.equal((await f.discover()).code, "RAW_CAPTURE_BINDING_INVALID"); }
} });
completionCases.push({ id: "MFD" + String(completionCases.length + 1).padStart(3, "0"), name: "freshness is bounded at 60 seconds and rechecked after capture", run: async () => {
  const f = fixture(); assert.equal(f.host.createContext({ runner: "codex", bindings: B, observedAt: NOW, expiresAt: "2026-10-01T10:01:00.001Z" }).code, "HOST_CONTEXT_INVALID");
  f.setNow(EXP); assert.equal((await f.discover()).code, "DISCOVERY_STALE");
  let slow; slow = fixture("codex", { capture: async (c) => { slow.setNow(EXP); return pass("SYNTHETIC", { bindings: c.bindings, pages: [codexPage([entry()])], source: "fixture", observedAt: NOW }); } });
  assert.equal((await slow.discover()).ok, false);
} });
completionCases.push({ id: "MFD" + String(completionCases.length + 1).padStart(3, "0"), name: "numeric equivalence, duplicate IDs, and unknown successors fail", run: async () => {
  for (const [entries, code] of [
    [[entry("fixture-6", { version: [6] }), entry("fixture-6.0", { version: [6, 0] })], "VERSION_AMBIGUOUS"],
    [[entry(), entry()], "MODEL_ID_DUPLICATE"], [[entry("possible-successor", { unknown: true })], "FAMILY_COVERAGE_UNKNOWN"]]) {
    const f = fixture("codex", { pages: [codexPage(entries)] }); assert.equal((await f.discover()).code, code);
  }
} });
completionCases.push({ id: "MFD" + String(completionCases.length + 1).padStart(3, "0"), name: "alias-to-concrete numeric head requires separate canonical mapping evidence", run: async () => {
  const f = fixture("codex", { pages: [codexPage([entry("fixture-alias", { canonicalModelId: "fixture-6.1" })])] });
  assert.equal((await f.discover()).code, "NORMALIZATION_INVALID");
  const qualified = fixture("codex", { pages: [codexPage([entry("fixture-alias", { canonicalModelId: "fixture-6.1", aliasEvidenceSha256: H })])] });
  assert.equal((await qualified.discover()).ok, true);
} });
completionCases.push({ id: "MFD" + String(completionCases.length + 1).padStart(3, "0"), name: "unsupported newest head refuses compatibility without older fallback", run: async () => {
  const f = fixture("codex", { pages: [codexPage([entry("fixture-6.1"), entry("fixture-6.2", { version: [6, 2], supportedReasoningEfforts: [] })])] });
  const d = await f.discover();
  assert.equal(f.adapter.verifyCompatibility({ discovery: d.value, releaseId: "fixture-6.2", modelId: "fixture-6.2" }, { taskRoute: "duty.worker", role: "worker", effort: "high" }, f.context, f.qualified.value).code, "EFFORT_UNSUPPORTED");
} });
completionCases.push({ id: "MFD" + String(completionCases.length + 1).padStart(3, "0"), name: "host ports must return the exact Result shape, never caller booleans", run: async () => {
  const f = fixture("codex", { capture: async () => ({ ok: true, admitted: true, value: {} }) });
  assert.equal((await f.discover()).code, "HOST_RESULT_INVALID");
  const bad = fixture("codex", { verifyProviderContract: () => pass("FORGED", { contractSha256: H, providerEvidenceSha256s: [H] }) });
  assert.equal(bad.qualified.code, "ADAPTER_CONTRACT_UNQUALIFIED");
  const missingBindings = fixture("codex", { capture: async () => pass("SYNTHETIC", { bindings: undefined, pages: [], source: "fixture", observedAt: NOW }) });
  assert.equal((await missingBindings.discover()).code, "RAW_CAPTURE_BINDING_INVALID");
} });
completionCases.push({ id: "MFD" + String(completionCases.length + 1).padStart(3, "0"), name: "generic grouping joins independently established variants and rejects inconsistent release metadata", run: async () => {
  const grouped = fixture("codex", { pages: [codexPage([entry("fixture-6.1-a", { releaseId: "fixture-release-6.1" }), entry("fixture-6.1-b", { releaseId: "fixture-release-6.1" })])] });
  const d = await grouped.discover(); assert.equal(d.ok, true);
  const records = grouped.host.readDiscovery(d.value).value.records; assert.equal(records.length, 1); assert.equal(records[0].variants.length, 2);
  const conflict = fixture("codex", { pages: [codexPage([entry("fixture-6.1-a", { releaseId: "same-release" }), entry("fixture-6.2-b", { releaseId: "same-release", version: [6, 2] })])] });
  assert.equal((await conflict.discover()).code, "RELEASE_GROUP_CONFLICT");
} });
completionCases.push({ id: "MFD" + String(completionCases.length + 1).padStart(3, "0"), name: "compatibility grammar alone, wrong-subject proof, unknown effort and wire booleans cannot launch", run: async () => {
  const slot = { taskRoute: "duty.worker", role: "worker", effort: "high" };
  const unsupported = fixture("codex", { compatibility: () => pass("FORGED", { subjectSha256: H, evidenceSha256: H }) });
  const d = await unsupported.discover(), head = { discovery: d.value, releaseId: "fixture-6.1", modelId: "fixture-6.1" };
  assert.equal(unsupported.adapter.verifyCompatibility(head, slot, unsupported.context, unsupported.qualified.value).code, "COMPATIBILITY_UNVERIFIED");
  const unknown = fixture("claude", { pages: [{ request: { operation: "reinitialize", sdkVersion: "0.3.220" }, responseBytes: '{"models":[{"value":"fixture-6.1"}]}' }] });
  const u = await unknown.discover();
  assert.equal(unknown.adapter.verifyCompatibility({ ...head, discovery: u.value }, slot, unknown.context, unknown.qualified.value).code, "EFFORT_UNKNOWN");
} });
completionCases.push({ id: "MFD" + String(completionCases.length + 1).padStart(3, "0"), name: "real HOST fixture processes retain all three raw source shapes without provider calls", run: async () => {
  let processCount = 0;
  for (const runner of RUNNERS) {
    const pages = runner === "codex" ? [codexPage([entry()])] : runner === "claude"
      ? [{ request: { operation: "reinitialize", sdkVersion: "0.3.220" }, responseBytes: '{"models":[{"value":"fixture-6.1"}]}' }]
      : [{ request: { argv: ["models"] }, responseBytes: "fixture-6.1 Synthetic display\n" }];
    const f = fixture(runner, { capture: async (c) => {
      const child = spawnSync(process.execPath, ["-e", "process.stdout.write(process.argv[1])", JSON.stringify(pages)],
        { shell: false, encoding: "utf8", timeout: 2000, maxBuffer: 65536 });
      processCount += 1; assert.equal(child.status, 0); assert.equal(child.error, undefined);
      return pass("HOST_SYNTHETIC_PROCESS_CAPTURE", { bindings: c.bindings, observedAt: c.observedAt,
        source: "synthetic-native-process-fixture-only", pages: JSON.parse(child.stdout) });
    } });
    const raw = await f.adapter.captureRawDiscovery(f.context); assert.equal(raw.ok, true);
    assert.equal(f.host.readRetainedRaw(raw.value).value.pages[0].responseBytes, pages[0].responseBytes);
  }
  assert.equal(processCount, 3);
} });
completionCases.push({ id: "MFD" + String(completionCases.length + 1).padStart(3, "0"), name: "expired held observation context remains valid for actual identity but cannot rediscover", run: async () => {
  const f = fixture(); f.setNow(EXP);
  assert.equal((await f.discover()).code, "DISCOVERY_STALE");
  assert.equal(f.adapter.readActualExecutionIdentity({ native: true, observedIds: ["fixture-6.1"] }, f.context).ok, true);
} });
for (const runner of RUNNERS) {
  completionCases.push({ id: "MFD" + String(completionCases.length + 1).padStart(3, "0"), name: `${runner}: all six source interfaces and default qualification closure`, run: () => {
    const host = createModelFamilyDiscoveryHost(), adapter = factories[runner](host);
    for (const name of ["captureRawDiscovery", "verifyCoverage", "normalizeReleases", "verifyCompatibility", "renderExactLaunch", "readActualExecutionIdentity"]) assert.equal(typeof adapter[name], "function");
    const f = fixture(runner); assert.equal(host.qualifyContract(f.contract).ok, false);
  } });
  completionCases.push({ id: "MFD" + String(completionCases.length + 1).padStart(3, "0"), name: `${runner}: exact model/effort rendering bound to compatibility and immutable capture`, run: async () => {
    const f = fixture(runner, runner === "antigravity" ? { ruleFns: { effortRule: () => pass("SYNTHETIC", { efforts: ["high"], capabilityEvidenceSha256: H }) } } : {});
    const d = await f.discover(); assert.equal(d.ok, true);
    const slot = { taskRoute: "duty.worker", role: "worker", effort: "high" }, head = { discovery: d.value, releaseId: "fixture-6.1", modelId: "fixture-6.1" };
    const compat = f.adapter.verifyCompatibility(head, slot, f.context, f.qualified.value); assert.equal(compat.ok, true);
    const discovery = compat.value.discovery, selection = { discovery, releaseId: "fixture-6.1", modelId: "fixture-6.1", effort: "high" };
    const packet = { invocationReceiptSha256: H, selectedModelId: "fixture-6.1", effort: "high", discoverySha256: digest(f.host.readDiscovery(discovery).value) };
    const rendered = f.adapter.renderExactLaunch(selection, packet); assert.equal(rendered.ok, true);
    assert.equal(rendered.value.invocationReceiptSha256, H);
    if (runner === "codex") { assert.equal(rendered.value.params.model, packet.selectedModelId); assert.equal(rendered.value.params.config.model_reasoning_effort, "high"); }
    else assert.deepEqual(rendered.value.argv, ["--model", "fixture-6.1", "--effort", "high"]);
    assert.equal(f.adapter.renderExactLaunch(selection, { ...packet, selectedModelId: "fixture-6.0" }).code, "LAUNCH_BINDING_INVALID");
    assert.equal(f.adapter.renderExactLaunch({ ...selection, discovery: {} }, packet).ok, false);
  } });
  completionCases.push({ id: "MFD" + String(completionCases.length + 1).padStart(3, "0"), name: `${runner}: actual identity is host observation; request echo is unavailable`, run: () => {
    const f = fixture(runner);
    assert.equal(f.adapter.readActualExecutionIdentity({ requestedModel: "fixture-6.1" }, f.context).code, "EXECUTION_IDENTITY_UNAVAILABLE");
    const raw = { native: true, observedIds: ["fixture-6.2"] }, observed = f.adapter.readActualExecutionIdentity(raw, f.context);
    assert.equal(observed.ok, true); assert.deepEqual(observed.value.actualModelIds, ["fixture-6.2"]);
    assert.equal(observed.value.actualEffort, null); assert.equal(observed.value.rawHostResultSha256, digest(raw));
    assert.equal(f.adapter.readActualExecutionIdentity({ native: true, observedIds: [] }, f.context).ok, false);
  } });
}

registerTestCaseCompletion({ cases: completionCases, fd: 3, maxBytes: 65536 });
