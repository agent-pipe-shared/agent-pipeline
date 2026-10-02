// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { registerTestCaseCompletion } from "./test-case-completion.mjs";
const completionCases = [];
import { createHash } from "node:crypto";
import { compareModelFamilyVersions, evaluateModelFamilySelection } from "./model-family-latest-selection.mjs";

const sha = (label) => createHash("sha256").update(label).digest("hex");
const NOW = "2026-10-01T12:00:30.000Z";
const OBSERVED = "2026-10-01T12:00:00.000Z";
const EXPIRES = "2026-10-01T12:01:00.000Z";
const slot = (runner = "codex", taskRoute = "duty.deep", role = "frontier", effort = "medium") =>
  JSON.stringify([runner, taskRoute, role, effort]);
const assignment = (overrides = {}) => ({ runner: "codex", taskRoute: "duty.deep", role: "frontier", effort: "medium",
  familyId: "sol", adapterContractSha256: sha("a"), minimumVersion: [6], update: "latest", ...overrides });
const variant = (modelId, effort = ["medium"], overrides = {}, slotKey = slot()) => ({
  modelId, canonicalModelId: null, aliasEvidenceSha256: null, visible: true, selectable: true,
  efforts: effort, capabilityEvidenceSha256: effort === null ? null : sha("c"),
  compatibilityBySlotSha256: { [slotKey]: sha("b") }, ...overrides,
});
const release = (releaseId, familyId, version, variants, overrides = {}) => ({ releaseId, familyId, version,
  released: true, groupingEvidenceSha256: sha("g"), variants, ...overrides });
const discovery = (records, overrides = {}) => ({ schema: "pipeline.model-family-discovery.v1", runner: "codex",
  installationBindingSha256: sha("i"), accountBindingSha256: sha("a"), hostProcessBindingSha256: sha("p"),
  adapterContractSha256: sha("a"), mode: "complete-catalogue", observedAt: OBSERVED, expiresAt: EXPIRES,
  rawEvidenceSha256: sha("r"), coverageEvidenceSha256: sha("v"), compatibilityEvidenceSha256: null,
  records, latestAliasEvidenceSha256: null, ...overrides });
const context = (a, modelId, overrides = {}) => ({
  coverage: { familyId: a.familyId, coverageEvidenceSha256: sha("v"), unknownTargetFamilyEvidenceSha256s: [] },
  hardEligibility: { runner: a.runner, taskRoute: a.taskRoute, role: a.role, effort: a.effort,
    evidenceSha256: sha("h"), minimumVersion: null, deniedModelIds: [] },
  variantRule: null,
  compatibility: { runner: a.runner, taskRoute: a.taskRoute, role: a.role, effort: a.effort, modelId, evidenceSha256: sha("b") },
  latestAlias: null, ...overrides,
});
const evaluate = ({ a = assignment(), records, d = discovery(records, { runner: a.runner }), watermark = null, pinSelection = null,
  ctx = context(a, "model-6.1"), now = NOW } = {}) =>
  evaluateModelFamilySelection({ assignment: a, discovery: d, watermark, pinSelection, context: ctx, now });
const ok = (result, modelId) => {
  assert.equal(result.ok, true, result.code);
  if (modelId) assert.equal(result.value.selectedModelId, modelId);
  assert.equal(result.value.authorityCeiling, "pure-selection-proposal");
  return result.value;
};

completionCases.push({ id: "MFLS" + String(completionCases.length + 1).padStart(3, "0"), name: "safe numeric comparison orders 6.10 after 6.2 and zero-pads trailing components", run: () => {
  assert.equal(compareModelFamilyVersions([6, 10], [6, 2]), 1);
  assert.equal(compareModelFamilyVersions([6], [6, 0, 0]), 0);
  assert.equal(compareModelFamilyVersions([5, 9], [6]), -1);
  assert.throws(() => compareModelFamilyVersions([Number.MAX_SAFE_INTEGER + 1], [6]), TypeError);
  assert.throws(() => compareModelFamilyVersions([], [6]), TypeError);
} });

completionCases.push({ id: "MFLS" + String(completionCases.length + 1).padStart(3, "0"), name: "unchanged Sol assignment selects synthetic 6.2, independently of record order", run: () => {
  const a = assignment();
  const records = [release("sol-r6", "sol", [6], [variant("gpt-6-sol")]),
    release("sol-r61", "sol", [6, 1], [variant("gpt-6.1-sol")]),
    release("sol-r62", "sol", [6, 2], [variant("gpt-6.2-sol")])];
  for (const permuted of [records, [...records].reverse(), [records[1], records[2], records[0]]]) {
    const chosenContext = context(a, "gpt-6.2-sol");
    ok(evaluate({ a, records: permuted, ctx: chosenContext }), "gpt-6.2-sol");
  }
} });

completionCases.push({ id: "MFLS" + String(completionCases.length + 1).padStart(3, "0"), name: "numeric release ordering is independent of labels and input order", run: () => {
  const a = assignment();
  const records = [release("release-62", "sol", [6, 2], [variant("candidate-62")]),
    release("release-610", "sol", [6, 10], [variant("candidate-610")])];
  ok(evaluate({ a, records, ctx: context(a, "candidate-610") }), "candidate-610");
  ok(evaluate({ a, records: [...records].reverse(), ctx: context(a, "candidate-610") }), "candidate-610");
} });

completionCases.push({ id: "MFLS" + String(completionCases.length + 1).padStart(3, "0"), name: "Luna 5.6 to 6 and synthetic 7, Astra 6 to 6.5, and all runner values share one algorithm", run: () => {
  const cases = [
    { runner: "codex", familyId: "luna", minimumVersion: [6], versions: [[5, 6], [6], [7]], modelIds: ["L-old", "L6", "L7"] },
    { runner: "claude", familyId: "sol", minimumVersion: [6, 1], versions: [[6], [6, 1]], modelIds: ["C-old", "C61"] },
    { runner: "antigravity", familyId: "astra", minimumVersion: [6], versions: [[6], [6, 5]], modelIds: ["A6", "A65"] },
  ];
  for (const item of cases) {
    const route = item.runner === "codex" ? "duty.deep" : "duty.advisory";
    const a = assignment({ runner: item.runner, taskRoute: route, familyId: item.familyId, minimumVersion: item.minimumVersion });
    const records = item.versions.map((version, i) => release(`${item.familyId}-r${i}`, item.familyId, version,
      [variant(item.modelIds[i], ["medium"], {}, slot(a.runner, a.taskRoute, a.role, a.effort))]));
    const result = evaluate({ a, records, ctx: context(a, item.modelIds.at(-1)) });
    assert.equal(result.ok, true, `${item.runner}: ${result.code}`);
    assert.equal(result.value.selectedModelId, item.modelIds.at(-1));
  }
} });

completionCases.push({ id: "MFLS" + String(completionCases.length + 1).padStart(3, "0"), name: "distinct release identities with numerically equal versions refuse in every input order", run: () => {
  const a = assignment();
  const records = [release("release-6", "sol", [6], [variant("candidate-6")]),
    release("release-6-0", "sol", [6, 0], [variant("candidate-6-0")])];
  for (const ordered of [records, [...records].reverse()]) {
    assert.equal(evaluate({ a, records: ordered, ctx: context(a, "candidate-6") }).code, "VERSION_AMBIGUOUS");
  }
} });

completionCases.push({ id: "MFLS" + String(completionCases.length + 1).padStart(3, "0"), name: "hidden or unreleased newer observations do not displace the visible selectable head", run: () => {
  const a = assignment();
  const records = [release("r61", "sol", [6, 1], [variant("visible-61")]),
    release("r62-hidden", "sol", [6, 2], [variant("hidden-62", ["medium"], { visible: false })]),
    release("r63-unreleased", "sol", [6, 3], [variant("unreleased-63")], { released: false })];
  ok(evaluate({ a, records, ctx: context(a, "visible-61") }), "visible-61");
} });

completionCases.push({ id: "MFLS" + String(completionCases.length + 1).padStart(3, "0"), name: "the chosen head never falls back after missing or unknown effort", run: () => {
  const a = assignment();
  const older = release("r61", "sol", [6, 1], [variant("medium-older")]);
  const unsupported = release("r62", "sol", [6, 2], [variant("high-only", ["high"])]);
  assert.equal(evaluate({ a, records: [older, unsupported], ctx: context(a, "high-only") }).code, "CURRENT_EFFORT_UNAVAILABLE");
  const unknown = release("r62", "sol", [6, 2], [variant("unknown-effort", null)]);
  assert.equal(evaluate({ a, records: [older, unknown], ctx: context(a, "unknown-effort") }).code, "CURRENT_EFFORT_UNKNOWN");
  const empty = release("r62", "sol", [6, 2], [variant("empty-effort", [])]);
  assert.equal(evaluate({ a, records: [older, empty], ctx: context(a, "empty-effort") }).code, "CURRENT_EFFORT_UNAVAILABLE");
} });

completionCases.push({ id: "MFLS" + String(completionCases.length + 1).padStart(3, "0"), name: "head compatibility is exact-variant and exact-slot bound, without older fallback", run: () => {
  const a = assignment();
  const older = release("r61", "sol", [6, 1], [variant("compatible-older")]);
  const head = release("r62", "sol", [6, 2], [variant("missing-compat", ["medium"], { compatibilityBySlotSha256: {} })]);
  assert.equal(evaluate({ a, records: [older, head], ctx: context(a, "missing-compat") }).code, "COMPATIBILITY_UNVERIFIED");
  const wrongSlot = context(a, "missing-compat", { compatibility: { ...context(a, "missing-compat").compatibility, taskRoute: "duty.read" } });
  assert.equal(evaluate({ a, records: [head], ctx: wrongSlot }).code, "COMPATIBILITY_UNVERIFIED");
} });

completionCases.push({ id: "MFLS" + String(completionCases.length + 1).padStart(3, "0"), name: "stale, incomplete, and unknown target-family discovery refuses; unrelated families remain diagnostics", run: () => {
  const a = assignment(); const records = [release("r61", "sol", [6, 1], [variant("candidate-61")])];
  assert.equal(evaluate({ a, records, now: "2026-10-01T12:01:00.000Z" }).code, "DISCOVERY_STALE");
  const unknownCoverage = context(a, "candidate-61", { coverage: { familyId: "sol", coverageEvidenceSha256: sha("v"),
    unknownTargetFamilyEvidenceSha256s: [sha("u")] } });
  assert.equal(evaluate({ a, records, ctx: unknownCoverage }).code, "FAMILY_VERSION_UNRECOGNIZED");
  const unassigned = release("moon-r1", "moon", [1], [variant("Moon-1")]);
  const value = ok(evaluate({ a, records: [...records, unassigned], ctx: context(a, "candidate-61") }), "candidate-61");
  assert.deepEqual(value.unassignedFamilyIds, ["moon"]);
  assert.equal(evaluate({ a, records, d: discovery(records, { coverageEvidenceSha256: sha("z") }),
    ctx: context(a, "candidate-61") }).code, "DISCOVERY_INVALID");
} });

completionCases.push({ id: "MFLS" + String(completionCases.length + 1).padStart(3, "0"), name: "assignment floor, disappearing head and account/install-bound watermark refuse downgrade", run: () => {
  const records = [release("r60", "sol", [6], [variant("model-6")])];
  const a = assignment({ minimumVersion: [6, 1] });
  assert.equal(evaluate({ a, records, ctx: context(a, "model-6") }).code, "DOWNGRADE_REFUSED");
  const a61 = assignment();
  const watermark = { runner: "codex", accountBindingSha256: sha("a"), installationBindingSha256: sha("i"),
    familyId: "sol", version: [6, 1], admittedReceiptSha256: sha("q") };
  assert.equal(evaluate({ a: a61, records, watermark, ctx: context(a61, "model-6") }).code, "DOWNGRADE_REFUSED");
  assert.equal(evaluate({ a: a61, records, watermark: { ...watermark, familyId: "luna" },
    ctx: context(a61, "model-6") }).code, "WATERMARK_SCOPE_MISMATCH");
} });

completionCases.push({ id: "MFLS" + String(completionCases.length + 1).padStart(3, "0"), name: "an explicit scoped old pin bypasses only automatic floors and never lowers watermark", run: () => {
  const a = assignment({ minimumVersion: [6, 1] });
  const records = [release("r6", "sol", [6], [variant("model-6")]),
    release("r61", "sol", [6, 1], [variant("model-61")])];
  const pinSelection = { decisionSha256: sha("d"), authoritySha256: sha("x"), runner: "codex", familyId: "sol",
    taskRoutes: ["duty.deep"], role: "frontier", effort: "medium", modelId: "model-6", revision: 1 };
  const watermark = { runner: "codex", accountBindingSha256: sha("a"), installationBindingSha256: sha("i"),
    familyId: "sol", version: [6, 1], admittedReceiptSha256: sha("q") };
  const value = ok(evaluate({ a, records, watermark, pinSelection, ctx: context(a, "model-6") }), "model-6");
  assert.equal(value.selection, "explicit-po-pin");
  assert.deepEqual(value.watermarkBefore, [6, 1]);
  assert.deepEqual(value.watermarkAfter, [6, 1]);
  assert.equal(evaluate({ a, records, pinSelection: { ...pinSelection, familyId: "luna" }, ctx: context(a, "model-6") }).code, "PIN_INVALID");
  assert.equal(evaluate({ a, records, pinSelection: { ...pinSelection, taskRoutes: ["duty.read"] }, ctx: context(a, "model-6") }).code, "PIN_INVALID");
  assert.equal(evaluate({ a, records, pinSelection: { ...pinSelection, modelId: "hidden" }, ctx: context(a, "model-6") }).code, "PIN_UNAVAILABLE");
  const forbiddenContext = context(a, "model-6", { hardEligibility: { ...context(a, "model-6").hardEligibility, deniedModelIds: ["model-6"] } });
  assert.equal(evaluate({ a, records, pinSelection, ctx: forbiddenContext }).code, "HARD_MODEL_INELIGIBLE");
  const hardFloor = context(a, "model-6", { hardEligibility: { ...context(a, "model-6").hardEligibility, minimumVersion: [6, 1] } });
  assert.equal(evaluate({ a, records, pinSelection, ctx: hardFloor }).code, "HARD_MODEL_INELIGIBLE");
} });

completionCases.push({ id: "MFLS" + String(completionCases.length + 1).padStart(3, "0"), name: "multiple eligible exact variants refuse unless generic equivalence resolves one concrete identity", run: () => {
  const a = assignment();
  const records = [release("r61", "sol", [6, 1], [
    variant("variant-a", ["medium"], { canonicalModelId: "canonical", aliasEvidenceSha256: sha("1") }),
    variant("variant-b", ["medium"], { canonicalModelId: "canonical", aliasEvidenceSha256: sha("2") }),
  ])];
  assert.equal(evaluate({ a, records, ctx: context(a, "variant-a") }).code, "VARIANT_AMBIGUOUS");
  const variantRule = { adapterContractSha256: a.adapterContractSha256, ruleSha256: sha("r"), evidenceSha256: sha("e"),
    canonicalModelId: "canonical", selectedModelId: "variant-b" };
  ok(evaluate({ a, records, ctx: context(a, "variant-b", { variantRule }) }), "variant-b");
  const contradiction = { ...variantRule, canonicalModelId: "other" };
  assert.equal(evaluate({ a, records, ctx: context(a, "variant-a", { variantRule: contradiction }) }).code, "VARIANT_RULE_CONTRADICTION");
  assert.equal(evaluate({ a, records, ctx: context(a, "variant-a", { variantRule: { ...variantRule, selectedModelId: "not-present" } }) }).code,
    "VARIANT_AMBIGUOUS");
} });

completionCases.push({ id: "MFLS" + String(completionCases.length + 1).padStart(3, "0"), name: "verified latest-alias mode binds concrete newest release evidence", run: () => {
  const a = assignment();
  const records = [release("r61", "sol", [6, 1], [variant("model-61")]),
    release("r62", "sol", [6, 2], [variant("model-62")])];
  const d = discovery(records, { mode: "verified-latest-alias", latestAliasEvidenceSha256: sha("l") });
  const good = context(a, "model-62", { latestAlias: { releaseId: "r62", modelId: "model-62", evidenceSha256: sha("l") } });
  ok(evaluate({ a, records, d, ctx: good }), "model-62");
  const wrong = context(a, "model-62", { latestAlias: { releaseId: "r61", modelId: "model-61", evidenceSha256: sha("l") } });
  assert.equal(evaluate({ a, records, d, ctx: wrong }).code, "LATEST_ALIAS_UNVERIFIED");
  assert.equal(evaluate({ a, records, d, ctx: context(a, "model-62") }).code, "LATEST_ALIAS_UNVERIFIED");
} });

completionCases.push({ id: "MFLS" + String(completionCases.length + 1).padStart(3, "0"), name: "conflicting duplicate exact IDs, malformed tuples, and caller admission booleans fail closed", run: () => {
  const a = assignment();
  const duplicate = [release("r61", "sol", [6, 1], [variant("same-id")]),
    release("r62", "sol", [6, 2], [variant("same-id")])];
  assert.equal(evaluate({ a, records: duplicate, ctx: context(a, "same-id") }).code, "DISCOVERY_INVALID");
  const malformed = [release("r61", "sol", [Number.MAX_SAFE_INTEGER + 1], [variant("bad-version")])];
  assert.equal(evaluate({ a, records: malformed, ctx: context(a, "bad-version") }).code, "DISCOVERY_INVALID");
  const unsafeContext = { ...context(a, "model-61"), admitted: true };
  assert.equal(evaluate({ a, records: [release("r61", "sol", [6, 1], [variant("model-61")])], ctx: unsafeContext }).code, "INPUT_INVALID");
} });

completionCases.push({ id: "MFLS" + String(completionCases.length + 1).padStart(3, "0"), name: "absent effort telemetry retains its raw evidence and still refuses the selected head", run: () => {
  const a = assignment();
  const records = [release("r61", "sol", [6, 1], [variant("older", ["medium"])]),
    release("r62", "sol", [6, 2], [variant("unknown-head", null, { capabilityEvidenceSha256: sha("retained-absent-field") })])];
  assert.equal(evaluate({ a, records, ctx: context(a, "unknown-head") }).code, "CURRENT_EFFORT_UNKNOWN");
} });

completionCases.push({ id: "MFLS" + String(completionCases.length + 1).padStart(3, "0"), name: "a normalized discovery expiry cannot exceed the sixty-second preparation window", run: () => {
  const a = assignment();
  const records = [release("r61", "sol", [6, 1], [variant("model-61")])];
  assert.equal(evaluate({ a, records, d: discovery(records, { expiresAt: "2026-10-01T12:01:00.001Z" }),
    ctx: context(a, "model-61") }).code, "DISCOVERY_INVALID");
  ok(evaluate({ a, records, ctx: context(a, "model-61") }), "model-61");
} });

registerTestCaseCompletion({ cases: completionCases, fd: 3, maxBytes: 65536 });
