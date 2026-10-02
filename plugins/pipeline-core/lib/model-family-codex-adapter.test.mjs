// SPDX-License-Identifier: SUL-1.0
import { registerTestCaseCompletion } from "./test-case-completion.mjs";
const completionCases = [];
import assert from "node:assert/strict";
import { parseCodexRawCoverage, parseCodexNumericIdentity, createCodexFamilyAdapter } from "./model-family-codex-adapter.mjs";
import { createModelFamilyDiscoveryHost, RULE_FIELDS, pass, fail } from "./model-family-discovery.mjs";
const item = { id: "gpt-6.1-sol", model: "gpt-6.1-sol", hidden: false, supportedReasoningEfforts: [{ reasoningEffort: "future-effort" }] };
const page = (cursor, nextCursor, id = 1, data = [item]) => ({ request: { id, method: "model/list", params: { cursor, limit: 100, includeHidden: true } }, responseBytes: JSON.stringify({ id, result: { data, nextCursor } }) });
const parse = (pages) => parseCodexRawCoverage({ pages, source: "synthetic-fixture-only" });
completionCases.push({ id: "MFCA" + String(completionCases.length + 1).padStart(3, "0"), name: "Codex parser retains hidden and all effort tokens across actual request cursors", run: () => {
  const r = parse([page(null, "next"), page("next", null, 2, [{ ...item, hidden: true }])]);
  assert.equal(r.ok, true); assert.equal(r.value.entries.length, 2); assert.equal(r.value.entries[1].hidden, true);
  assert.equal(r.value.entries[0].supportedReasoningEfforts[0].reasoningEffort, "future-effort");
} });
completionCases.push({ id: "MFCA" + String(completionCases.length + 1).padStart(3, "0"), name: "Codex cursor loop, incomplete/extra/duplicate/skipped pages and excluded hidden entries refuse", run: () => {
  assert.equal(parse([page(null, "loop"), page("loop", "loop", 2)]).code, "CATALOGUE_CURSOR_LOOP");
  assert.equal(parse([page(null, "next")]).code, "CATALOGUE_INCOMPLETE");
  assert.equal(parse([page(null, null), page(null, null, 2)]).code, "CATALOGUE_AFTER_TERMINAL");
  assert.equal(parse([page(null, "next"), page("next", null)]).code, "CATALOGUE_REQUEST_ID_DUPLICATE");
  assert.equal(parse([page(null, "next"), page("skipped", null, 2)]).code, "CATALOGUE_REQUEST_CHAIN_INVALID");
  const p = page(null, null); p.request.params.includeHidden = false;
  assert.equal(parse([p]).code, "CATALOGUE_REQUEST_CHAIN_INVALID");
} });
completionCases.push({ id: "MFCA" + String(completionCases.length + 1).padStart(3, "0"), name: "Codex page response identity, duplicate JSON keys, bounds and malformed optional fields refuse", run: () => {
  const p = page(null, null); p.responseBytes = '{"id":1,"id":1,"result":{"data":[],"nextCursor":null}}';
  assert.equal(parse([p]).code, "RAW_PAGE_MALFORMED");
  const bad = page(null, null); bad.request.id = 2; assert.equal(parse([bad]).code, "CATALOGUE_PAGE_INVALID");
  assert.equal(parse([page(null, null, 1, Array(101).fill(item))]).code, "CATALOGUE_PAGE_INVALID");
  assert.equal(parse([page(null, null, 1, [{ ...item, supportedReasoningEfforts: ["high"] }])]).code, "CATALOGUE_ENTRY_INVALID");
} });
completionCases.push({ id: "MFCA" + String(completionCases.length + 1).padStart(3, "0"), name: "Codex canonical numeric identity is future-generic but grants no family authority", run: async () => {
  const sol = parseCodexNumericIdentity("gpt-6.10-sol");
  assert.deepEqual(sol.value, { familyToken: "sol", version: [6, 10], authority: "none" });
  assert.deepEqual(parseCodexNumericIdentity("gpt-99.2.3-luna").value, { familyToken: "luna", version: [99, 2, 3], authority: "none" });
  for (const id of ["gpt-6-astra", "gpt-6.5-astra", "gpt-7-astra"]) {
    const r = parseCodexNumericIdentity(id); assert.equal(r.ok, true); assert.equal(r.value.familyToken, "astra"); assert.equal(r.value.authority, "none");
  }
  const ten = parseCodexNumericIdentity("gpt-6.10-sol").value.version, two = parseCodexNumericIdentity("gpt-6.2-sol").value.version;
  assert.equal(ten[0] > two[0] || ten[0] === two[0] && ten[1] > two[1], true);
  const moon = parseCodexNumericIdentity("gpt-7-moon");
  assert.deepEqual(moon.value, { familyToken: "moon", version: [7], authority: "none" });
  for (const id of ["gpt-06-sol", "gpt-6.01-sol", "gpt-6-sol-preview", "gpt-6-preview-sol", "gpt-latest-sol", "/gpt-6-sol", "gpt-6-sol/../moon", "gpt-9007199254740992-sol", "gpt-1.2.3.4.5.6.7.8.9-sol", "gpt-6-Moon"]) assert.equal(parseCodexNumericIdentity(id).ok, false, id);
  // A synthetic S2 host confirms structural unknown-family discovery cannot
  // cross a separately qualified contract whose family assignment is Sol.
  const H = "a".repeat(64), bindings = { installationBindingSha256: H, accountBindingSha256: "b".repeat(64), hostProcessBindingSha256: "c".repeat(64) };
  const now = "2026-10-01T10:00:00.000Z", expires = "2026-10-01T10:01:00.000Z";
  const contract = { schema: "pipeline.model-family-adapter-contract.v1", runner: "codex", familyId: "sol", discoveryModes: ["complete-catalogue"], providerEvidenceSha256s: [H] };
  const identityRule = ({ phase, entry: e }) => {
    if (phase === "coverage") return pass("SYNTHETIC", { mode: "complete-catalogue", evidenceSha256: H, latestAliasEvidenceSha256: null });
    const identity = parseCodexNumericIdentity(e.model);
    return identity.ok && identity.value.familyToken === contract.familyId
      ? pass("SYNTHETIC", { model: e.model }) : fail("FAMILY_COVERAGE_UNKNOWN");
  };
  const ruleFns = { identityRule, releaseGroupingRule: ({ entry: e }) => pass("SYNTHETIC", { releaseId: e.model, familyId: contract.familyId, groupingEvidenceSha256: H }),
    versionRule: ({ entry: e }) => { const r = parseCodexNumericIdentity(e.model); return r.ok ? pass("SYNTHETIC", r.value.version) : r; },
    variantSelectionRule: ({ entry: e }) => pass("SYNTHETIC", { modelId: e.model, canonicalModelId: null, aliasEvidenceSha256: null }),
    selectabilityRule: ({ entry: e }) => pass("SYNTHETIC", { released: true, visible: !e.hidden, selectable: !e.hidden }),
    effortRule: () => pass("SYNTHETIC", { efforts: ["high"], capabilityEvidenceSha256: H }),
    compatibilityRule: () => fail("COMPATIBILITY_UNVERIFIED"), executionIdentityRule: () => fail("EXECUTION_IDENTITY_UNAVAILABLE") };
  const rules = {};
  for (const name of RULE_FIELDS) { contract[name] = { id: `fixture-${name}`, version: 1, sha256: H }; rules[contract[name].id] = { version: 1, sha256: H, run: ruleFns[name] }; }
  const pages = [page(null, null, 1, [{ id: "gpt-7-moon", model: "gpt-7-moon", hidden: false }])];
  const host = createModelFamilyDiscoveryHost({ rules, clock: () => now, capture: async (c) => pass("SYNTHETIC_CAPTURE", { bindings: c.bindings, observedAt: c.observedAt, source: "fixture", pages }),
    verifyProviderContract: ({ contractSha256, contract: c }) => pass("SYNTHETIC_QUALIFICATION", { contractSha256, providerEvidenceSha256s: c.providerEvidenceSha256s }) });
  const context = host.createContext({ runner: "codex", bindings, observedAt: now, expiresAt: expires }).value;
  const qualified = host.qualifyContract(contract); assert.equal(qualified.ok, true);
  const adapter = createCodexFamilyAdapter(host), raw = await adapter.captureRawDiscovery(context); assert.equal(raw.ok, true);
  const coverage = adapter.verifyCoverage(raw.value, context, qualified.value); assert.equal(coverage.ok, true);
  assert.equal(adapter.normalizeReleases(raw.value, qualified.value, coverage.value).code, "FAMILY_COVERAGE_UNKNOWN");
} });

completionCases.push({ id: "MFCA" + String(completionCases.length + 1).padStart(3, "0"), name: "Codex main-session source port is distinct and absent defaults fail closed", run: async () => {
  const adapter = createCodexFamilyAdapter({});
  assert.equal(typeof adapter.launchMainFromDriverContext, "function");
  assert.deepEqual(await adapter.launchMainFromDriverContext(Object.freeze(Object.create(null))),
    { ok: false, code: "MAIN_PRELAUNCH_UNQUALIFIED", retryable: false });
} });

registerTestCaseCompletion({ cases: completionCases, fd: 3, maxBytes: 65536 });
