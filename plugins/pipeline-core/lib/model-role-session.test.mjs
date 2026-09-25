// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { openSync } from "node:fs";
import { admitModelRoleBootstrap, modelRoleBootstrapReadback, resolveModelRoleBootstrap, resolveModelRoleSession, validateModelRoleSessionReceipt, validateModelRoleDispatchBinding } from "./model-role-session.mjs";
import { registerTestCaseCompletion } from "./test-case-completion.mjs";

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

assert.equal(cases.length, 20, "the complete model-role session corpus must be registered before execution begins");
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync(process.platform === "win32" ? "NUL" : "/dev/null", "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: cases, fd: completionFd, maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });
