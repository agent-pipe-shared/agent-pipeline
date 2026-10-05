// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { openSync } from "node:fs";
import { EventEmitter } from "node:events";
import { admitModelRoleBootstrap, antigravityAvailableModelIds, claudeApiAvailableModelIds, claudeCodeObservedModelIds, codexAvailableModelIds, modelRoleBootstrapReadback, resolveModelRoleBootstrap, resolveModelRoleSession, validateModelRoleSessionReceipt, validateModelRoleDispatchBinding } from "./model-role-session.mjs";
import { observeClaudeModelAlias } from "./claude-model-host-observation.mjs";
import { observeAntigravityModels } from "./antigravity-model-host-observation.mjs";
import { observeCodexModels } from "./codex-model-host-observation.mjs";
import { observeAnthropicApiModels } from "./anthropic-model-catalogue-host.mjs";
import { registeredFunctionalTaskRoutes } from "./model-role-route-source.mjs";
import { loadRunnerProfilesV3Registry } from "./runner-profiles-v3.mjs";
import { registerTestCaseCompletion } from "./test-case-completion.mjs";
import { devNull } from "node:os";

const cases = [];
function test(name, run) {
  cases.push({ id: `MRS${String(cases.length + 1).padStart(2, "0")}`, name, run });
}

const evidence = "a".repeat(64);
const candidateCommit = "b".repeat(40);
const observedAt = "2026-09-24T12:00:00.000Z";
const configuredRoutesOf = (routes) => routes.map(({ runner, role, effort }) => ({ runner, role, effort }));

function fixture(runner, role, effort, older, newer) {
  return {
    runner, role, effort, sessionId: `session-${runner}`,
    candidateCommit, observedAt,
    policy: {
      schema: "pipeline.model-role-policy.v1", runner, role,
      approved: [
        { modelId: older, rank: 1, efforts: [effort], compatibilityEvidenceSha256: evidence },
        { modelId: newer, rank: 2, efforts: [effort], compatibilityEvidenceSha256: evidence },
      ],
    },
    availableModelIds: [older, newer],
  };
}

for (const [runner, role, effort, older, newer] of [
  ["codex", "efficient", "medium", "gpt-5.6-luna", "gpt-6-luna"],
  ["claude", "frontier", "high", "claude-opus-old", "claude-opus-new"],
  ["antigravity", "worker", "high", "gemini-3.7-flash-high", "gemini-3.8-flash-high"],
]) {
  test(`${runner} selects the newest approved compatible model only at bootstrap`, () => {
    const input = fixture(runner, role, effort, older, newer);
    const first = resolveModelRoleSession(input);
    assert.equal(first.ok, true);
    assert.equal(first.receipt.modelId, newer);
    assert.equal(validateModelRoleSessionReceipt(first.receipt), true);
    const resumed = resolveModelRoleSession({ ...input, availableModelIds: [older], existingReceipt: first.receipt });
    assert.equal(resumed.code, "MODEL-ROLE-SESSION-REUSED");
    assert.deepEqual(resumed.receipt, first.receipt);
    const offline = resolveModelRoleSession({
      runner, role, effort, sessionId: input.sessionId,
      candidateCommit: "c".repeat(40), existingReceipt: first.receipt,
    });
    assert.equal(offline.code, "MODEL-ROLE-SESSION-REUSED");
    assert.deepEqual(offline.receipt, first.receipt);
  });
}

test("a newly discovered model remains unapproved and cannot silently take over", () => {
  const input = fixture("codex", "efficient", "medium", "gpt-5.6-luna", "gpt-6-luna");
  input.availableModelIds.push("gpt-7-luna");
  const result = resolveModelRoleSession(input);
  assert.equal(result.receipt.modelId, "gpt-6-luna");
  assert.deepEqual(result.unapprovedAvailableModelIds, ["gpt-7-luna"]);
});

test("no approved compatible available model fails closed", () => {
  const input = fixture("codex", "efficient", "medium", "gpt-5.6-luna", "gpt-6-luna");
  input.availableModelIds = ["gpt-7-luna"];
  assert.deepEqual(resolveModelRoleSession(input), { ok: false, code: "MODEL-ROLE-APPROVED-MODEL-UNAVAILABLE" });
});

test("missing session identity, duplicate rank and malformed approval evidence are refused", () => {
  const base = fixture("codex", "efficient", "medium", "gpt-5.6-luna", "gpt-6-luna");
  assert.equal(resolveModelRoleSession({ ...base, sessionId: "" }).code, "MODEL-ROLE-INPUT-INVALID");
  for (const unsafe of ["session/child", "../escape", "session\\child"]) {
    assert.equal(resolveModelRoleSession({ ...base, sessionId: unsafe }).code, "MODEL-ROLE-INPUT-INVALID");
  }
  const slashModel = fixture("codex", "efficient", "medium", "provider/old", "provider/new");
  assert.equal(resolveModelRoleSession(slashModel).receipt.modelId, "provider/new");
  const duplicateRank = structuredClone(base);
  duplicateRank.policy.approved[1].rank = 1;
  assert.equal(resolveModelRoleSession(duplicateRank).code, "MODEL-ROLE-INPUT-INVALID");
  const noEvidence = structuredClone(base);
  noEvidence.policy.approved[1].compatibilityEvidenceSha256 = null;
  assert.equal(resolveModelRoleSession(noEvidence).code, "MODEL-ROLE-INPUT-INVALID");
});

test("a forged or wrong-session receipt cannot be reused", () => {
  const input = fixture("codex", "efficient", "medium", "gpt-5.6-luna", "gpt-6-luna");
  const receipt = resolveModelRoleSession(input).receipt;
  const forged = { ...receipt, modelId: "gpt-7-luna" };
  assert.equal(validateModelRoleSessionReceipt(forged), false);
  assert.equal(resolveModelRoleSession({ ...input, existingReceipt: forged }).code, "MODEL-ROLE-RECEIPT-CONFLICT");
  assert.equal(resolveModelRoleSession({ ...input, sessionId: "another-session", existingReceipt: receipt }).code, "MODEL-ROLE-RECEIPT-CONFLICT");
  assert.equal(resolveModelRoleSession({ ...input, runner: "claude", existingReceipt: receipt }).code, "MODEL-ROLE-RECEIPT-CONFLICT");
  assert.equal(resolveModelRoleSession({ ...input, candidateCommit: "invalid", existingReceipt: receipt }).code, "MODEL-ROLE-RECEIPT-CONFLICT");
});

test("receipt digest survives JSON key reordering but not altered content", () => {
  const input = fixture("codex", "efficient", "medium", "gpt-5.6-luna", "gpt-6-luna");
  const receipt = resolveModelRoleSession(input).receipt;
  const reordered = Object.fromEntries(Object.entries(receipt).reverse());
  assert.equal(validateModelRoleSessionReceipt(reordered), true);
  assert.equal(validateModelRoleSessionReceipt({ ...reordered, effort: "max" }), false);
});

test("invalid timestamps and non-string catalog entries are rejected without throwing", () => {
  const input = fixture("codex", "efficient", "medium", "gpt-5.6-luna", "gpt-6-luna");
  assert.equal(resolveModelRoleSession({ ...input, observedAt: "2026-09-31T12:00:00.000Z" }).code, "MODEL-ROLE-INPUT-INVALID");
  assert.equal(resolveModelRoleSession({ ...input, availableModelIds: [Symbol("model")] }).code, "MODEL-ROLE-INPUT-INVALID");
});

test("provider names never determine the functional role on any runner", () => {
  for (const runner of ["claude", "codex", "antigravity"]) {
    const input = fixture(runner, "worker", "medium", "family-old", "unrelated-brand-new");
    const result = resolveModelRoleSession(input);
    assert.equal(result.receipt.role, "worker");
    assert.equal(result.receipt.modelId, "unrelated-brand-new");
    const wrongRole = resolveModelRoleSession({ ...input, role: "frontier" });
    assert.equal(wrongRole.code, "MODEL-ROLE-INPUT-INVALID");
  }
});

test("dispatch can use only its host-held session, role, effort and exact model", () => {
  const input = fixture("codex", "worker", "medium", "vendor-old-family", "renamed-new-family");
  const receipt = resolveModelRoleSession(input).receipt;
  const request = { runner: input.runner, sessionId: input.sessionId, role: input.role, effort: input.effort, modelId: receipt.modelId, receipt };
  assert.deepEqual(validateModelRoleDispatchBinding(request), {
    ok: true, code: "MODEL-ROLE-DISPATCH-BOUND", receiptSha256: receipt.receiptSha256,
  });
  for (const change of [
    { modelId: "vendor-old-family" }, { role: "frontier" }, { sessionId: "another-session" },
    { effort: "high" }, { runner: "claude" },
  ]) assert.equal(validateModelRoleDispatchBinding({ ...request, ...change }).code, "MODEL-ROLE-DISPATCH-MISMATCH");
  assert.equal(validateModelRoleDispatchBinding({ ...request, receipt: { ...receipt, modelId: "forged" } }).code, "MODEL-ROLE-DISPATCH-INVALID");
});

test("new-session readback acknowledges changed mapping but does not re-prompt for an unchanged one", () => {
  const oldInput = fixture("codex", "worker", "medium", "vendor-old", "vendor-new");
  oldInput.sessionId = "previous-session";
  oldInput.availableModelIds = ["vendor-old"];
  const oldReceipt = resolveModelRoleSession(oldInput).receipt;
  const currentInput = { ...oldInput, sessionId: "current-session", availableModelIds: ["vendor-old", "vendor-new"] };
  const selected = resolveModelRoleSession(currentInput).receipt;
  const result = modelRoleBootstrapReadback({ sessionId: currentInput.sessionId, receipts: [selected], previousReceipts: [oldReceipt] });
  assert.equal(result.ok, true);
  assert.equal(result.acknowledgementRequired, true);
  assert.deepEqual(result.mappings, [{ runner: "codex", role: "worker", effort: "medium", modelId: "vendor-new",
    policySha256: selected.policySha256, compatibilityEvidenceSha256: selected.compatibilityEvidenceSha256,
    candidateAtBootstrap: selected.candidateAtBootstrap, receiptSha256: selected.receiptSha256,
    previousModelId: "vendor-old", previousPolicySha256: oldReceipt.policySha256, change: "changed" }]);
  const otherCandidateReceipt = resolveModelRoleSession({ ...currentInput, candidateCommit: "c".repeat(40) }).receipt;
  const otherCandidateReadback = modelRoleBootstrapReadback({ sessionId: currentInput.sessionId,
    receipts: [otherCandidateReceipt], previousReceipts: [oldReceipt] });
  assert.equal(otherCandidateReadback.mappings[0].modelId, result.mappings[0].modelId);
  assert.notEqual(otherCandidateReadback.readbackSha256, result.readbackSha256,
    "the same visible model cannot reuse a confirmation for a different bootstrap receipt");
  const differentPrevious = resolveModelRoleSession({ ...oldInput, availableModelIds: ["vendor-new"] }).receipt;
  const alteredComparison = modelRoleBootstrapReadback({ sessionId: currentInput.sessionId,
    receipts: [selected], previousReceipts: [differentPrevious] });
  assert.notEqual(alteredComparison.readbackSha256, result.readbackSha256);
  const priorSameModel = resolveModelRoleSession({ ...currentInput, sessionId: "previous-session" }).receipt;
  const unchanged = modelRoleBootstrapReadback({ sessionId: currentInput.sessionId, receipts: [selected],
    previousReceipts: [priorSameModel] });
  assert.equal(unchanged.mappings[0].change, "unchanged");
  assert.equal(unchanged.mappings[0].previousModelId, unchanged.mappings[0].modelId);
  assert.equal(unchanged.acknowledgementRequired, false);
  const revisedPolicy = structuredClone(currentInput);
  revisedPolicy.policy.approved[1].compatibilityEvidenceSha256 = "c".repeat(64);
  const sameModelNewPolicy = resolveModelRoleSession(revisedPolicy).receipt;
  const policyChanged = modelRoleBootstrapReadback({ sessionId: currentInput.sessionId,
    receipts: [sameModelNewPolicy], previousReceipts: [priorSameModel] });
  assert.equal(policyChanged.mappings[0].modelId, selected.modelId);
  assert.equal(policyChanged.mappings[0].change, "changed");
  assert.equal(policyChanged.acknowledgementRequired, true);
  const addedInput = fixture("claude", "frontier", "high", "old-opus", "new-opus");
  addedInput.sessionId = currentInput.sessionId;
  const addedReceipt = resolveModelRoleSession(addedInput).receipt;
  const added = modelRoleBootstrapReadback({ sessionId: currentInput.sessionId,
    receipts: [selected, addedReceipt], previousReceipts: [priorSameModel] });
  assert.equal(added.mappings.find((mapping) => mapping.runner === "claude").change, "added");
  assert.equal(added.mappings.find((mapping) => mapping.runner === "claude").previousModelId, null);
  assert.equal(added.acknowledgementRequired, true);
  assert.deepEqual(added.removedMappings, []);
  const removed = modelRoleBootstrapReadback({ sessionId: currentInput.sessionId,
    receipts: [selected], previousReceipts: [priorSameModel, resolveModelRoleSession({
      ...addedInput, sessionId: "previous-session",
    }).receipt] });
  assert.deepEqual(removed.removedMappings.map((mapping) => [mapping.runner, mapping.role]), [["claude", "frontier"]]);
  assert.equal(removed.acknowledgementRequired, true);
});

test("readback refuses duplicate routes, wrong sessions and invalid prior receipts", () => {
  const input = fixture("claude", "frontier", "high", "old", "new");
  const receipt = resolveModelRoleSession(input).receipt;
  assert.equal(modelRoleBootstrapReadback({ sessionId: input.sessionId, receipts: [receipt, receipt] }).code, "MODEL-ROLE-READBACK-DUPLICATE");
  assert.equal(modelRoleBootstrapReadback({ sessionId: "other", receipts: [receipt] }).code, "MODEL-ROLE-READBACK-INVALID");
  assert.equal(modelRoleBootstrapReadback({ sessionId: input.sessionId, receipts: [receipt],
    previousReceipts: [{ ...receipt, modelId: "forged" }] }).code, "MODEL-ROLE-READBACK-INVALID");
  assert.equal(modelRoleBootstrapReadback({ sessionId: input.sessionId, receipts: [receipt],
    previousReceipts: [receipt] }).code, "MODEL-ROLE-READBACK-INVALID");
  const one = resolveModelRoleSession({ ...input, sessionId: "prior-one" }).receipt;
  const two = resolveModelRoleSession({ ...input, sessionId: "prior-two", role: "worker",
    policy: { ...input.policy, role: "worker" } }).receipt;
  assert.equal(modelRoleBootstrapReadback({ sessionId: input.sessionId, receipts: [receipt],
    previousReceipts: [one, two] }).code, "MODEL-ROLE-READBACK-INVALID");
});

test("one bootstrap readback covers all runners and keeps same-model roles distinct", () => {
  const sessionId = "shared-session";
  const selections = [
    fixture("claude", "frontier", "high", "claude-opus-old", "claude-opus-new"),
    fixture("codex", "worker", "medium", "gpt-5.6-sol", "gpt-6-sol"),
    fixture("antigravity", "worker", "high", "gemini-flash-old", "gemini-flash-new"),
    fixture("antigravity", "efficient", "low", "gemini-flash-old", "gemini-flash-new"),
  ].map((input) => ({ ...input, sessionId }));
  const receipts = selections.map((input) => resolveModelRoleSession(input).receipt);
  const result = modelRoleBootstrapReadback({ sessionId, receipts });
  assert.equal(result.ok, true);
  assert.equal(result.acknowledgementRequired, true,
    "the first displayed mapping also needs one exact acknowledgement");
  assert.deepEqual(new Set(result.mappings.map((mapping) => mapping.runner)), new Set(["antigravity", "claude", "codex"]));
  assert.deepEqual(result.mappings.filter((mapping) => mapping.runner === "antigravity")
    .map((mapping) => [mapping.role, mapping.modelId]), [
    ["efficient", "gemini-flash-new"], ["worker", "gemini-flash-new"],
  ]);
  assert.ok(result.mappings.every((mapping) => mapping.change === "initial"));
  const configuredRoutes = configuredRoutesOf(selections);
  assert.equal(admitModelRoleBootstrap({ sessionId, configuredRoutes, receipts }).code,
    "MODEL-ROLE-BOOTSTRAP-ACKNOWLEDGEMENT-REQUIRED");
  assert.equal(admitModelRoleBootstrap({ sessionId, configuredRoutes, receipts,
    acknowledgement: { sessionId, readbackSha256: result.readbackSha256, confirmed: true } }).code,
  "MODEL-ROLE-BOOTSTRAP-ADMITTED");
});

test("one bootstrap proposal resolves all configured runners and reports a single changed-mapping acknowledgement", () => {
  const sessionId = "shared-bootstrap";
  const routes = [
    fixture("claude", "frontier", "high", "opus-old", "opus-new"),
    fixture("codex", "worker", "medium", "sol-old", "sol-new"),
    fixture("antigravity", "efficient", "low", "flash-old", "flash-new"),
  ].map((route) => ({ ...route, sessionId }));
  const previousReceipts = routes.map((route) => resolveModelRoleSession({
    ...route, sessionId: "previous-bootstrap", availableModelIds: [route.policy.approved[0].modelId],
  }).receipt);
  const result = resolveModelRoleBootstrap({ sessionId, configuredRoutes: configuredRoutesOf(routes), routes, previousReceipts });
  assert.equal(result.code, "MODEL-ROLE-BOOTSTRAP-RESOLVED");
  assert.equal(result.receipts.length, 3);
  assert.deepEqual(result.readback.mappings.map((mapping) => mapping.runner), ["antigravity", "claude", "codex"]);
  assert.equal(result.readback.acknowledgementRequired, true);
  assert.ok(result.readback.mappings.every((mapping) => mapping.change === "changed"));
});

test("newly observed models are review candidates, never silently selected or added to acknowledgement authority", () => {
  const sessionId = "discovery-session";
  const worker = { ...fixture("codex", "worker", "high", "luna-approved", "luna-next"), sessionId };
  const efficient = { ...fixture("codex", "efficient", "medium", "luna-approved", "luna-next"), sessionId };
  for (const route of [worker, efficient]) {
    route.policy.approved = [route.policy.approved[0]];
    route.availableModelIds = ["luna-approved", "brand-new-model"];
  }
  const routes = [worker, efficient];
  const result = resolveModelRoleBootstrap({ sessionId, configuredRoutes: configuredRoutesOf(routes), routes });
  assert.equal(result.ok, true);
  assert.deepEqual(result.receipts.map((receipt) => receipt.modelId), ["luna-approved", "luna-approved"]);
  assert.deepEqual(result.reviewCandidates, [{
    runner: "codex", modelId: "brand-new-model", affectedRoutes: [
      { role: "efficient", effort: "medium" }, { role: "worker", effort: "high" },
    ],
  }]);
  assert.equal(result.readback.mappings.some((mapping) => mapping.modelId === "brand-new-model"), false);
  const resumed = routes.map((route, index) => ({
    runner: route.runner, role: route.role, effort: route.effort, sessionId,
    candidateCommit: route.candidateCommit, existingReceipt: result.receipts[index],
  }));
  assert.deepEqual(resolveModelRoleBootstrap({ sessionId, configuredRoutes: configuredRoutesOf(routes), routes: resumed })
    .reviewCandidates, []);
});

test("Claude older-Opus discovery needs compatibility and PO policy before next-session replacement", () => {
  const oldModel = "claude-opus-4-8";
  const newModel = "claude-opus-5";
  const initial = fixture("claude", "frontier", "high", oldModel, newModel);
  initial.sessionId = "opus-session-old";
  initial.policy.approved = [initial.policy.approved[0]];
  initial.availableModelIds = [oldModel, newModel];
  const first = resolveModelRoleBootstrap({
    sessionId: initial.sessionId, configuredRoutes: configuredRoutesOf([initial]), routes: [initial],
  });
  assert.equal(first.ok, true);
  assert.equal(first.receipts[0].modelId, oldModel);
  assert.deepEqual(first.reviewCandidates, [{ runner: "claude", modelId: newModel,
    affectedRoutes: [{ role: "frontier", effort: "high" }] }]);
  const compact = resolveModelRoleSession({
    runner: "claude", role: "frontier", effort: "high", sessionId: initial.sessionId,
    candidateCommit, existingReceipt: first.receipts[0],
  });
  assert.equal(compact.receipt.modelId, oldModel);

  const next = fixture("claude", "frontier", "high", oldModel, newModel);
  next.sessionId = "opus-session-next";
  next.policy.approved[1].compatibilityEvidenceSha256 = "c".repeat(64);
  const changed = resolveModelRoleBootstrap({
    sessionId: next.sessionId, configuredRoutes: configuredRoutesOf([next]), routes: [next],
    previousReceipts: first.receipts,
  });
  assert.equal(changed.receipts[0].modelId, newModel);
  assert.deepEqual(changed.reviewCandidates, []);
  assert.equal(changed.readback.mappings[0].change, "changed");
  assert.equal(admitModelRoleBootstrap({ sessionId: next.sessionId,
    configuredRoutes: configuredRoutesOf([next]), receipts: changed.receipts,
    previousReceipts: first.receipts }).code, "MODEL-ROLE-BOOTSTRAP-ACKNOWLEDGEMENT-REQUIRED");
  assert.equal(admitModelRoleBootstrap({ sessionId: next.sessionId,
    configuredRoutes: configuredRoutesOf([next]), receipts: changed.receipts,
    previousReceipts: first.receipts,
    acknowledgement: { sessionId: next.sessionId,
      readbackSha256: changed.readback.readbackSha256, confirmed: true },
  }).code, "MODEL-ROLE-BOOTSTRAP-ADMITTED");
});

test("a missing approved model or duplicate route yields no partial bootstrap receipts", () => {
  const sessionId = "shared-bootstrap";
  const routes = [
    fixture("claude", "frontier", "high", "opus-old", "opus-new"),
    fixture("codex", "worker", "medium", "sol-old", "sol-new"),
    fixture("antigravity", "efficient", "low", "flash-old", "flash-new"),
  ].map((route) => ({ ...route, sessionId }));
  const unavailable = structuredClone(routes);
  unavailable[2].availableModelIds = ["unapproved-flash"];
  const configuredRoutes = configuredRoutesOf(routes);
  const failed = resolveModelRoleBootstrap({ sessionId, configuredRoutes, routes: unavailable });
  assert.deepEqual(failed, { ok: false, code: "MODEL-ROLE-BOOTSTRAP-ROUTE-FAILED", routeIndex: 2,
    reasonCode: "MODEL-ROLE-APPROVED-MODEL-UNAVAILABLE" });
  assert.equal(Object.hasOwn(failed, "receipts"), false);
  assert.equal(resolveModelRoleBootstrap({ sessionId, configuredRoutes, routes: [routes[0], routes[0]] }).code,
    "MODEL-ROLE-BOOTSTRAP-DUPLICATE");
  assert.equal(resolveModelRoleBootstrap({ sessionId, configuredRoutes, routes: [{ ...routes[0], sessionId: "other" }] }).code,
    "MODEL-ROLE-BOOTSTRAP-INVALID");
  assert.equal(resolveModelRoleBootstrap({ sessionId, configuredRoutes, routes: routes.slice(0, 2) }).code,
    "MODEL-ROLE-BOOTSTRAP-ROUTE-SET-MISMATCH");
  assert.equal(resolveModelRoleBootstrap({ sessionId, configuredRoutes, routes: [routes[0], routes[1],
    { ...fixture("antigravity", "frontier", "high", "pro-old", "pro-new"), sessionId }] }).code,
    "MODEL-ROLE-BOOTSTRAP-ROUTE-SET-MISMATCH");
  assert.equal(resolveModelRoleBootstrap({ sessionId, routes }).code, "MODEL-ROLE-BOOTSTRAP-INVALID");
});

test("Compact reuses the complete session selection and refuses mixed fresh routes", () => {
  const sessionId = "compact-session";
  const routes = [
    fixture("claude", "frontier", "high", "opus-old", "opus-new"),
    fixture("codex", "worker", "medium", "sol-old", "sol-new"),
  ].map((route) => ({ ...route, sessionId }));
  const configuredRoutes = configuredRoutesOf(routes);
  const fresh = resolveModelRoleBootstrap({ sessionId, configuredRoutes, routes });
  assert.equal(fresh.ok, true);
  const resumed = routes.map((route, index) => ({
    runner: route.runner, role: route.role, effort: route.effort, sessionId,
    candidateCommit: "c".repeat(40), existingReceipt: fresh.receipts[index],
  }));
  const mixed = resolveModelRoleBootstrap({ sessionId, configuredRoutes, routes: [resumed[0], routes[1]] });
  assert.equal(mixed.code, "MODEL-ROLE-BOOTSTRAP-MIXED-SESSION");
  assert.equal(Object.hasOwn(mixed, "receipts"), false);
  const complete = resolveModelRoleBootstrap({ sessionId, configuredRoutes, routes: resumed });
  assert.equal(complete.code, "MODEL-ROLE-BOOTSTRAP-REUSED");
  assert.deepEqual(complete.receipts, fresh.receipts);
});

test("changed mappings require one exact new-session acknowledgement; unchanged mappings do not", () => {
  const current = fixture("codex", "worker", "medium", "old-model", "renamed-model");
  current.sessionId = "current-session";
  const previous = { ...current, sessionId: "previous-session", availableModelIds: ["old-model"] };
  const receipts = [resolveModelRoleSession(current).receipt];
  const previousReceipts = [resolveModelRoleSession(previous).receipt];
  const args = { sessionId: current.sessionId, configuredRoutes: configuredRoutesOf([current]), receipts, previousReceipts };
  const readback = modelRoleBootstrapReadback(args);
  assert.equal(readback.acknowledgementRequired, true);
  assert.match(readback.readbackSha256, /^[a-f0-9]{64}$/u);
  assert.equal(admitModelRoleBootstrap(args).code, "MODEL-ROLE-BOOTSTRAP-ACKNOWLEDGEMENT-REQUIRED");
  const acknowledgement = { sessionId: current.sessionId, readbackSha256: readback.readbackSha256, confirmed: true };
  assert.deepEqual(admitModelRoleBootstrap({ ...args, acknowledgement }), {
    ok: true, code: "MODEL-ROLE-BOOTSTRAP-ADMITTED", readbackSha256: readback.readbackSha256,
    receiptSha256s: receipts.map((receipt) => receipt.receiptSha256),
  });
  const otherCandidateReceipts = [resolveModelRoleSession({ ...current, candidateCommit: "c".repeat(40) }).receipt];
  assert.equal(admitModelRoleBootstrap({ ...args, receipts: otherCandidateReceipts, acknowledgement }).code,
    "MODEL-ROLE-BOOTSTRAP-ACKNOWLEDGEMENT-REQUIRED",
    "an acknowledgement for one candidate must not admit a different bootstrap receipt");
  for (const wrong of [
    { ...acknowledgement, confirmed: false },
    { ...acknowledgement, sessionId: "another-session" },
    { ...acknowledgement, readbackSha256: "0".repeat(64) },
    { ...acknowledgement, extra: true },
  ]) assert.equal(admitModelRoleBootstrap({ ...args, acknowledgement: wrong }).code,
    "MODEL-ROLE-BOOTSTRAP-ACKNOWLEDGEMENT-REQUIRED");
  const unchangedPrevious = [resolveModelRoleSession({ ...current, sessionId: "previous-session" }).receipt];
  assert.equal(admitModelRoleBootstrap({ ...args, previousReceipts: unchangedPrevious }).code,
    "MODEL-ROLE-BOOTSTRAP-ADMITTED");
  assert.equal(admitModelRoleBootstrap({ ...args, receipts: [{ ...receipts[0], modelId: "forged" }],
    acknowledgement }).code, "MODEL-ROLE-BOOTSTRAP-ADMISSION-INVALID");
  assert.equal(admitModelRoleBootstrap({ ...args, configuredRoutes: [
    ...args.configuredRoutes, { runner: "claude", role: "frontier", effort: "high" },
  ], acknowledgement }).code, "MODEL-ROLE-BOOTSTRAP-ADMISSION-ROUTE-SET-MISMATCH");
  assert.equal(admitModelRoleBootstrap({ ...args, configuredRoutes: [], acknowledgement }).code,
    "MODEL-ROLE-BOOTSTRAP-ADMISSION-ROUTE-SET-MISMATCH");
  assert.equal(admitModelRoleBootstrap({ ...args, receipts: [null], acknowledgement }).code,
    "MODEL-ROLE-BOOTSTRAP-ADMISSION-ROUTE-SET-MISMATCH");
});

test("Codex catalogue admits only visible exact IDs supporting the requested effort", () => {
  const data = [
    { id: "gpt-6-sol", model: "gpt-6-sol", hidden: false,
      supportedReasoningEfforts: [{ reasoningEffort: "high" }, { reasoningEffort: "max" }] },
    { id: "gpt-6-luna", model: "gpt-6-luna", hidden: false,
      supportedReasoningEfforts: [{ reasoningEffort: "medium" }, { reasoningEffort: "high" }] },
    { id: "hidden-test", model: "hidden-test", hidden: true,
      supportedReasoningEfforts: [{ reasoningEffort: "high" }] },
  ];
  assert.deepEqual(codexAvailableModelIds({ data, nextCursor: null }, "high"), {
    ok: true, code: "MODEL-ROLE-CODEX-CATALOGUE-OBSERVED",
    availableModelIds: ["gpt-6-luna", "gpt-6-sol"],
  });
  assert.deepEqual(codexAvailableModelIds({ data, nextCursor: null }, "xhigh").availableModelIds, []);
  assert.equal(codexAvailableModelIds({ data, nextCursor: "more" }, "high").ok, false,
    "a partial page cannot pretend to be the complete available catalogue");
  assert.equal(codexAvailableModelIds({ data: [...data, { ...data[0] }], nextCursor: null }, "high").code,
    "MODEL-ROLE-CODEX-CATALOGUE-DUPLICATE");
  assert.equal(codexAvailableModelIds({ data: [...data, { ...data[2] }], nextCursor: null }, "high").code,
    "MODEL-ROLE-CODEX-CATALOGUE-DUPLICATE",
    "a hidden duplicate still makes the account catalogue malformed");
  assert.equal(codexAvailableModelIds({ data: [{ ...data[0], model: "different" }], nextCursor: null }, "high").ok, false);
});

test("Antigravity catalogue parses exact IDs without inferring roles from display names", () => {
  assert.deepEqual(antigravityAvailableModelIds("gemini-3.8-flash-high\tGemini 3.8 Flash (High)\n"
    + "gemini-3.1-pro-high\tGemini 3.1 Pro (High)\n"), {
    ok: true, code: "MODEL-ROLE-AGY-CATALOGUE-OBSERVED",
    availableModelIds: ["gemini-3.1-pro-high", "gemini-3.8-flash-high"],
  });
  assert.equal(antigravityAvailableModelIds("gemini-3.8-flash-high\tFlash\n"
    + "gemini-3.8-flash-high\tRenamed Flash\n").code, "MODEL-ROLE-AGY-CATALOGUE-DUPLICATE");
  assert.equal(antigravityAvailableModelIds("unstructured model name").ok, false);
  assert.equal(antigravityAvailableModelIds("../../bad\tBad\n").ok, false);
});

test("Claude API catalogue requires all pages and retains its narrower credential assurance", () => {
  const first = { data: [{ type: "model", id: "claude-opus-5" }],
    first_id: "claude-opus-5", last_id: "claude-opus-5", has_more: true };
  const last = { data: [{ type: "model", id: "claude-sonnet-5" }],
    first_id: "claude-sonnet-5", last_id: "claude-sonnet-5", has_more: false };
  const firstItem = { requestAfterId: null, response: first };
  const lastItem = { requestAfterId: "claude-opus-5", response: last };
  assert.deepEqual(claudeApiAvailableModelIds([firstItem, lastItem]), {
    ok: true, code: "MODEL-ROLE-CLAUDE-API-CATALOGUE-OBSERVED",
    assurance: "api-credential-only", availableModelIds: ["claude-opus-5", "claude-sonnet-5"],
  });
  assert.equal(claudeApiAvailableModelIds([firstItem]).ok, false);
  assert.equal(claudeApiAvailableModelIds([firstItem, { ...lastItem, requestAfterId: "wrong" }]).ok, false);
  assert.equal(claudeApiAvailableModelIds([{ requestAfterId: null, response: {
    ...last, data: [last.data[0], last.data[0]] } }]).code,
    "MODEL-ROLE-CLAUDE-API-CATALOGUE-DUPLICATE");
  assert.equal(claudeApiAvailableModelIds([firstItem, {
    requestAfterId: "claude-opus-5", response: { ...last, data: [first.data[0]],
      first_id: "claude-opus-5", last_id: "claude-opus-5" } }]).code,
    "MODEL-ROLE-CLAUDE-API-CATALOGUE-DUPLICATE");
});

test("Claude Code successful modelUsage is host observation; OAuth failure cannot mint availability", () => {
  assert.deepEqual(claudeCodeObservedModelIds({ type: "result", is_error: false,
    terminal_reason: "success", modelUsage: { "claude-opus-5": { inputTokens: 1 } } }), {
    ok: true, code: "MODEL-ROLE-CLAUDE-HOST-MODEL-OBSERVED",
    availableModelIds: ["claude-opus-5"],
  });
  assert.equal(claudeCodeObservedModelIds({ type: "result", is_error: true,
    terminal_reason: "api_error", modelUsage: {} }).ok, false);
  assert.equal(claudeCodeObservedModelIds({ type: "result", is_error: false,
    terminal_reason: "success", modelUsage: {} }).code, "MODEL-ROLE-CLAUDE-HOST-MODEL-UNOBSERVED");
});

const claudeProbeResult = (modelUsage) => ({ status: 0, stdout: JSON.stringify({
  type: "result", is_error: false, terminal_reason: "success", modelUsage,
}) });
const claudeProbeDeps = (overrides = {}) => ({
  alias: "opus", executableResult: { ok: true, path: "/usr/bin/claude" },
  makeTemp: () => "/tmp/isolated-claude-model-probe", removeTemp: () => {},
  now: () => observedAt, run: () => claudeProbeResult({ "claude-opus-5": { inputTokens: 1 } }),
  ...overrides,
});

test("Claude host probe observes only the model actually used by an isolated, tool-free call", () => {
  let call;
  let removed = false;
  const result = observeClaudeModelAlias(claudeProbeDeps({
    run: (...args) => { call = args; return claudeProbeResult({ "claude-opus-5": { inputTokens: 1 } }); },
    removeTemp: () => { removed = true; },
  }));
  assert.equal(result.ok, true);
  assert.equal(result.modelCalls, 1);
  assert.equal(result.observation.modelId, "claude-opus-5");
  assert.equal(result.observation.assurance, "host-observed-single-call-not-provider-attested");
  assert.match(result.observationSha256, /^[a-f0-9]{64}$/u);
  assert.equal(call[0], "/usr/bin/claude");
  assert.deepEqual(call[1], ["--print", "--output-format", "json", "--no-session-persistence",
    "--tools", "", "--setting-sources", "", "--model", "opus", "Reply exactly OK."]);
  assert.equal(call[2].cwd, "/tmp/isolated-claude-model-probe");
  assert.equal(call[2].shell, false);
  assert.equal(removed, true);
});

test("Claude host probe rejects unsupported alias and missing trusted executable before launch", () => {
  let launched = false;
  const run = () => { launched = true; throw new Error("unexpected launch"); };
  assert.equal(observeClaudeModelAlias(claudeProbeDeps({ alias: "other", run })).code,
    "MODEL-ROLE-CLAUDE-ALIAS-INVALID");
  assert.equal(observeClaudeModelAlias(claudeProbeDeps({ executableResult: { ok: false }, run })).code,
    "MODEL-ROLE-CLAUDE-EXECUTABLE-UNAVAILABLE");
  assert.equal(launched, false);
});

test("Claude host probe fails closed on OAuth failure, absent or ambiguous model usage", () => {
  const oauth = observeClaudeModelAlias(claudeProbeDeps({ run: () => ({ status: 1,
    stdout: JSON.stringify({ type: "result", is_error: true, terminal_reason: "api_error", modelUsage: {} }) }) }));
  assert.equal(oauth.code, "MODEL-ROLE-CLAUDE-PROBE-UNAVAILABLE");
  assert.equal(oauth.modelCalls, 1);
  for (const modelUsage of [{}, { "claude-opus-5": {}, "claude-sonnet-5": {} }]) {
    const result = observeClaudeModelAlias(claudeProbeDeps({ run: () => claudeProbeResult(modelUsage) }));
    assert.equal(result.code, "MODEL-ROLE-CLAUDE-MODEL-UNOBSERVED");
  }
});

test("Claude host probe preserves attempt count and requires canonical host time", () => {
  const threw = observeClaudeModelAlias(claudeProbeDeps({ run: () => { throw new Error("private"); } }));
  assert.equal(threw.code, "MODEL-ROLE-CLAUDE-PROBE-UNAVAILABLE");
  assert.equal(threw.modelCalls, 1);
  assert.equal(JSON.stringify(threw).includes("private"), false);
  const invalidTime = observeClaudeModelAlias(claudeProbeDeps({ now: () => "2026-09-24" }));
  assert.equal(invalidTime.code, "MODEL-ROLE-CLAUDE-CLOCK-UNAVAILABLE");
});

test("Anthropic API host follows authenticated pagination without exporting the credential", async () => {
  const requests = [];
  const pages = [
    { data: [{ type: "model", id: "claude-opus-5" }], first_id: "claude-opus-5",
      last_id: "claude-opus-5", has_more: true },
    { data: [{ type: "model", id: "claude-sonnet-5" }], first_id: "claude-sonnet-5",
      last_id: "claude-sonnet-5", has_more: false },
  ];
  const fetchImpl = async (url, options) => {
    requests.push({ url: String(url), options });
    return new Response(JSON.stringify(pages[requests.length - 1]), { status: 200 });
  };
  const result = await observeAnthropicApiModels({ apiKey: "private-test-key", fetchImpl });
  assert.deepEqual(result, { ok: true, code: "MODEL-ROLE-CLAUDE-API-CATALOGUE-OBSERVED",
    assurance: "api-credential-only", availableModelIds: ["claude-opus-5", "claude-sonnet-5"] });
  assert.equal(requests.length, 2);
  assert.equal(requests[0].options.headers["x-api-key"], "private-test-key");
  assert.equal(new URL(requests[1].url).searchParams.get("after_id"), "claude-opus-5");
  assert.equal(requests[0].options.redirect, "error");
  assert.equal(JSON.stringify(result).includes("private-test-key"), false);
});

test("Anthropic API host rejects absent credentials and malformed or incomplete responses", async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return new Response("{}", { status: 200 }); };
  assert.equal((await observeAnthropicApiModels({ fetchImpl })).code,
    "MODEL-ROLE-CLAUDE-API-CREDENTIAL-UNAVAILABLE");
  assert.equal(calls, 0);
  assert.equal((await observeAnthropicApiModels({ apiKey: "key", fetchImpl })).ok, false);
  const badStatus = await observeAnthropicApiModels({ apiKey: "key", fetchImpl: async () =>
    new Response("private backend error", { status: 401 }) });
  assert.equal(badStatus.code, "MODEL-ROLE-CLAUDE-API-UNAVAILABLE");
  assert.equal(JSON.stringify(badStatus).includes("private backend error"), false);
  const tooLarge = await observeAnthropicApiModels({ apiKey: "key", fetchImpl: async () =>
    new Response("x".repeat(262_145), { status: 200 }) });
  assert.equal(tooLarge.code, "MODEL-ROLE-CLAUDE-API-RESPONSE-INVALID");
});

test("Anthropic API host does not turn transport exceptions into model availability", async () => {
  const failed = await observeAnthropicApiModels({ apiKey: "private-key", fetchImpl: async () => {
    throw new Error("private response details");
  } });
  assert.equal(failed.code, "MODEL-ROLE-CLAUDE-API-UNAVAILABLE");
  assert.equal(failed.ok, false);
  assert.equal(JSON.stringify(failed).includes("private"), false);
});

function completeRoleRegistry() {
  return loadRunnerProfilesV3Registry();
}

test("functional task projection includes the registered V3 pure-read duty", () => {
  const result = registeredFunctionalTaskRoutes();
  assert.equal(result.ok, true);
  assert.equal(result.taskRoutes.filter((route) => route.taskRoute === "duty.read").length, 3);
  const absent = completeRoleRegistry();
  delete absent.duties.read;
  assert.deepEqual(registeredFunctionalTaskRoutes(absent), {
    ok: false, code: "MODEL-ROLE-ROUTE-SOURCE-INCOMPLETE",
    missingTaskRoutes: ["duty.read"],
  });
});

test("functional roles cover every registered task route without inferring them from model names", () => {
  const result = registeredFunctionalTaskRoutes(completeRoleRegistry());
  assert.equal(result.ok, true);
  assert.equal(result.taskRoutes.length, (6 + 9) * 3 + 1,
    "V3 records three design and three coordination profiles, nine duties and the separate Claude Advisor fallback");
  const role = (taskRoute, runner) => result.taskRoutes.find((route) =>
    route.taskRoute === taskRoute && route.runner === runner);
  assert.equal(role("profile.epic.design_phase", "codex").role, "frontier");
  assert.equal(role("duty.implement", "codex").role, "worker");
  assert.equal(role("duty.mechanic", "codex").role, "efficient");
  assert.equal(role("duty.read", "codex").role, "efficient");
  assert.equal(role("duty.critic_high_risk", "antigravity").role, "frontier");
  assert.equal(result.configuredRoutes.filter((route) => route.runner === "antigravity").length, 1,
    "unavailable Agy routes stay visible but cannot demand a bootstrap model selection");
  assert.equal(result.unavailableTaskRoutes.some((route) => route.taskRoute === "duty.critic_high_risk"
    && route.runner === "antigravity"), true);
  assert.equal(result.configuredRoutes.filter((route) =>
    route.runner === "codex" && route.role === "efficient").length, 2);
});

test("functional route source fails closed on a conflicting or extra route cell", () => {
  const conflict = completeRoleRegistry();
  conflict.duties.test_author.codex.selector.value = "gpt-6-astra";
  assert.equal(registeredFunctionalTaskRoutes(conflict).code, "MODEL-ROLE-ROUTE-SOURCE-CONFLICT");
  const extra = completeRoleRegistry();
  extra.duties.read.codex.inventedRole = "frontier";
  assert.equal(registeredFunctionalTaskRoutes(extra).code, "MODEL-ROLE-ROUTE-SOURCE-INVALID");
  delete extra.duties.read.codex.inventedRole;
  extra.duties.unregistered = extra.duties.read;
  assert.equal(registeredFunctionalTaskRoutes(extra).code, "MODEL-ROLE-ROUTE-SOURCE-INCOMPLETE");
});

test("Agy host catalogue executes only the installed models command", () => {
  let invocation;
  const result = observeAntigravityModels({ executableResult: { ok: true, path: "/usr/bin/agy" },
    run: (path, argv, options) => {
      invocation = { path, argv, options };
      return { status: 0, stdout: "gemini-3.8-flash-medium\tFlash Medium\n" };
    } });
  assert.equal(result.ok, true);
  assert.equal(result.assurance, "installed-host-observed");
  assert.deepEqual(result.availableModelIds, ["gemini-3.8-flash-medium"]);
  assert.deepEqual(invocation.argv, ["models"]);
  assert.equal(invocation.options.shell, false);
});

test("Agy host catalogue rejects missing executable, errors and malformed output", () => {
  assert.equal(observeAntigravityModels({ executableResult: { ok: false } }).ok, false);
  assert.equal(observeAntigravityModels({ executableResult: { ok: true, path: "/usr/bin/agy" },
    run: () => ({ status: 1, stderr: "private diagnostic" }) }).code,
    "MODEL-ROLE-AGY-CATALOGUE-UNAVAILABLE");
  const malformed = observeAntigravityModels({ executableResult: { ok: true, path: "/usr/bin/agy" },
    run: () => ({ status: 0, stdout: "not a tabbed model row" }) });
  assert.equal(malformed.ok, false);
  assert.equal(JSON.stringify(malformed).includes("private"), false);
});

function codexCatalogChild(respond) {
  const child = new EventEmitter();
  child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
  child.stdin = { write(bytes) {
    const request = JSON.parse(bytes);
    queueMicrotask(() => {
      const response = respond(request);
      if (response) child.stdout.emit("data", Buffer.from(`${JSON.stringify(response)}\n`));
    });
  }, end() {} };
  child.kill = () => {};
  return child;
}

test("Codex host catalogue uses initialized model/list pagination and supported effort", async () => {
  const calls = [];
  const item = (id, effort) => ({ id, model: id, hidden: false,
    supportedReasoningEfforts: [{ reasoningEffort: effort }] });
  const observed = await observeCodexModels({ effort: "high",
    executableResult: { ok: true, path: "/usr/bin/codex" },
    spawnProcess: (path, args, options) => {
      assert.deepEqual(args, ["app-server", "--stdio", "--strict-config"]);
      assert.equal(options.shell, false);
      return codexCatalogChild((request) => {
        calls.push(request);
        if (request.id === 1) return { id: 1, result: { userAgent: "test" } };
        if (request.id === 2) return { id: 2, result: { data: [item("gpt-6-sol", "high")], nextCursor: "next" } };
        if (request.id === 3) return { id: 3, result: { data: [item("gpt-6-luna", "medium")], nextCursor: null } };
        return null;
      });
    } });
  assert.equal(observed.ok, true);
  assert.deepEqual(observed.availableModelIds, ["gpt-6-sol"]);
  assert.equal(observed.assurance, "installed-host-observed");
  assert.deepEqual(calls.filter((call) => call.method === "model/list").map((call) => call.params.cursor ?? null), [null, "next"]);
  assert.equal(calls.some((call) => call.method === "thread/start" || call.method === "turn/start"), false);
});

test("Codex host catalogue fails closed on missing executable and protocol errors", async () => {
  assert.equal((await observeCodexModels({ effort: "high", executableResult: { ok: false } })).ok, false);
  const invalid = await observeCodexModels({ effort: "high", executableResult: { ok: true, path: "/usr/bin/codex" },
    spawnProcess: () => codexCatalogChild((request) => request.id === 1
      ? { id: 1, result: {} } : request.id === 2
        ? { id: 2, result: { data: [], nextCursor: "partial" } } : null), timeoutMs: 100 });
  assert.equal(invalid.ok, false);
  assert.equal(JSON.stringify(invalid).includes("partial"), false);
});

test("Codex catalogue tolerates a future effort without promoting it to a governed route", () => {
  const data = [
    { id: "future-model", model: "future-model", hidden: false,
      supportedReasoningEfforts: [{ reasoningEffort: "ultra" }] },
    { id: "approved-model", model: "approved-model", hidden: false,
      supportedReasoningEfforts: [{ reasoningEffort: "high" }, { reasoningEffort: "ultra" }] },
  ];
  assert.deepEqual(codexAvailableModelIds({ data, nextCursor: null }, "high").availableModelIds,
    ["approved-model"]);
  assert.equal(codexAvailableModelIds({ data, nextCursor: null }, "ultra").ok, false,
    "a catalogue-only effort must not become an approved routing effort");
  assert.equal(codexAvailableModelIds({ data: [{ ...data[0],
    supportedReasoningEfforts: [{ reasoningEffort: "unsafe effort" }] }], nextCursor: null }, "high").ok, false);
});

assert.equal(cases.length, 39, "the complete model-role session corpus must be registered before execution begins");
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync(devNull, "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: cases, fd: completionFd, maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });
