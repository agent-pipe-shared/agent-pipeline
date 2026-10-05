// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { canonical, createPoApprovalIntent } from "../lib/po-approval-proof.mjs";
import { createModelRolePolicyApprovalIntent, verifyModelRoleApprovedPolicy } from "../lib/model-role-approved-policy.mjs";
import { registeredFunctionalTaskRoutes } from "../lib/model-role-route-source.mjs";
import { registeredModelFamilyTaskRoutes } from "../lib/model-family-route-source.mjs";
import { verifyModelFamilyAuthority } from "../lib/model-family-authority.mjs";
import { createModelFamilyApprovalRequest, modelFamilyApprovalRequestMatches } from "./model-family-approval-request.mjs";
import { registerTestCaseCompletion } from "../lib/test-case-completion.mjs";
import { openSync as openCompletionDescriptor } from "node:fs";
import { devNull } from "node:os";

const sha = (value) => createHash("sha256").update(value).digest("hex");
const digest = (value) => sha(canonical(value));
const pair = generateKeyPairSync("ed25519");
const publicKey = pair.publicKey.export({ format: "pem", type: "spki" });
const trustAnchors = [{ keyReference: "synthetic-family-request-test", publicKeySha256: sha(publicKey) }];
const candidateAtApproval = { commit: "1".repeat(40), tree: "2".repeat(40) };

function fixture() {
  const historicRouteSource = registeredFunctionalTaskRoutes();
  assert.equal(historicRouteSource.ok, true);
  const approvedPolicies = historicRouteSource.configuredRoutes
    .map((route) => ({ runner: route.runner, role: route.role, effort: route.effort,
      policy: { schema: "pipeline.model-role-policy.v1", runner: route.runner, role: route.role,
        approved: [{ modelId: route.runner === "codex" ? (route.role === "frontier" ? "gpt-6.1-sol" : "gpt-6-luna")
          : route.runner === "claude" ? "claude-current-sonnet" : "antigravity-current-gemini", rank: 1,
          efforts: ["low", "medium", "high", "xhigh", "max", "not-applicable"], compatibilityEvidenceSha256: "a".repeat(64) }] } }));
  const approvalIntent = createModelRolePolicyApprovalIntent({ routeSource: historicRouteSource,
    approvedPolicies, candidateAtApproval });
  const historicBundle = { schema: "pipeline.model-role-approved-policy.v1", candidateAtApproval,
    approvedPolicies, approvalIntent, proof: { schema: "pipeline.po-approval-proof.v1",
      intentSha256: approvalIntent.sha256, keyReference: trustAnchors[0].keyReference,
      publicKey, signatureBase64: sign(null, Buffer.from(approvalIntent.sha256), pair.privateKey).toString("base64") } };
  const historicBundleBytes = Buffer.from(JSON.stringify(historicBundle));
  const targetRouteSource = registeredModelFamilyTaskRoutes({ historicSource: historicRouteSource });
  const codexDefaults = new Map([
    ["profile.epic.design_phase", ["sol", [6, 1]]], ["profile.epic.execution_phase", ["sol", [6, 1]]],
    ["profile.feature.design_phase", ["sol", [6, 1]]], ["profile.feature.execution_phase", ["sol", [6, 1]]],
    ["profile.mini.design_phase", ["sol", [6, 1]]], ["profile.mini.execution_phase", ["sol", [6, 1]]],
    ["duty.implement", ["luna", [6]]], ["duty.mechanic", ["luna", [6]]], ["duty.deep", ["sol", [6, 1]]],
    ["duty.test_author", ["sol", [6, 1]]], ["duty.critic_normal", ["sol", [6, 1]]],
    ["duty.critic_high_risk", ["astra", [6]]], ["duty.readiness", ["luna", [6]]],
    ["duty.advisory", ["astra", [6]]], ["duty.read", ["luna", [6]]],
  ]);
  const proposedAssignments = targetRouteSource.taskRoutes.filter((route) => route.state !== "unavailable")
    .map((route) => {
      const [familyId, minimumVersion] = route.runner === "codex"
        ? codexDefaults.get(route.taskRoute) : [route.runner === "claude" ? "claude-current" : "antigravity-current", [1]];
      return { runner: route.runner, taskRoute: route.taskRoute, familyId, minimumVersion, update: "latest" };
    });
  const requiredContracts = [...new Set(proposedAssignments.map((row) => JSON.stringify([row.runner, row.familyId])))]
    .map((key) => JSON.parse(key));
  const rule = (id) => ({ id, version: 1, sha256: "b".repeat(64) });
  const adapterContractBindings = requiredContracts.map(([runner, familyId]) => ({ runner, familyId,
    path: "plugins/pipeline-core/contracts/" + runner + "-" + familyId + ".json",
    contract: { schema: "pipeline.model-family-adapter-contract.v1", runner, familyId,
      identityRule: rule(familyId + "-identity"), releaseGroupingRule: rule(familyId + "-release-grouping"),
      versionRule: rule(familyId + "-version"), variantSelectionRule: rule(familyId + "-variant-selection"),
      discoveryModes: ["complete-catalogue"], selectabilityRule: rule(familyId + "-selectability"),
      effortRule: rule(familyId + "-effort"), compatibilityRule: rule(familyId + "-compatibility"),
      executionIdentityRule: rule(familyId + "-execution-identity"), providerEvidenceSha256s: ["c".repeat(64)] } }));
  return { historicRouteSource, historicBundle, historicBundleBytes, targetRouteSource, adapterContractBindings, proposedAssignments };
}

function prepared(fx, adapterContractBindings = fx.adapterContractBindings) {
  return createModelFamilyApprovalRequest({ requestId: "fixture-001", candidateAtApproval,
    targetRouteSource: fx.targetRouteSource, historicRouteSource: fx.historicRouteSource,
    historicBundle: fx.historicBundle, historicBundleBytes: fx.historicBundleBytes,
    trustAnchors, adapterContractBindings, proposedAssignments: fx.proposedAssignments });
}

// These keys and signatures are disposable test fixtures, never live PO authority.
function withHistoricPolicies(fx, approvedPolicies) {
  const approvalIntent = createModelRolePolicyApprovalIntent({ routeSource: fx.historicRouteSource,
    approvedPolicies, candidateAtApproval });
  fx.historicBundle = { schema: "pipeline.model-role-approved-policy.v1", candidateAtApproval,
    approvedPolicies, approvalIntent, proof: { schema: "pipeline.po-approval-proof.v1",
      intentSha256: approvalIntent.sha256, keyReference: trustAnchors[0].keyReference, publicKey,
      signatureBase64: sign(null, Buffer.from(approvalIntent.sha256), pair.privateKey).toString("base64") } };
  fx.historicBundleBytes = Buffer.from(JSON.stringify(fx.historicBundle));
  return fx;
}

function codexOnlyFixture() {
  const fx = fixture();
  return withHistoricPolicies(fx, fx.historicBundle.approvedPolicies.filter((row) => row.runner === "codex"));
}

function rebindFixtureRequest(request) {
  const migration = request.subject.migration;
  migration.familyProjectionSha256 = digest(request.migrationProjection);
  const rows = request.subject.assignments.flatMap((a) => a.taskRoutes.map((taskRoute) => ({
    runner: a.runner, taskRoute, role: a.role, effort: a.effort, familyId: a.familyId, minimumVersion: a.minimumVersion,
  }))).sort((a, b) => JSON.stringify([a.runner, a.taskRoute, a.role, a.effort]).localeCompare(JSON.stringify([b.runner, b.taskRoute, b.role, b.effort])));
  migration.preservedFloorsSha256 = digest(rows);
  migration.adapterContractSha256s = [...new Set(request.subject.assignments.map((a) => a.adapterContractSha256))].sort();
  const subjectSha256 = digest(request.subject);
  request.approvalIntent = createPoApprovalIntent({ kind: "model-role-policy", featureId: "model-role-routes",
    planSha256: request.subject.routeSourceSha256, specSha256: subjectSha256, candidate: candidateAtApproval,
    policyRevision: "model-family-v2", subjectSha256, decision: "approved" });
  request.intentSha256 = request.approvalIntent.sha256;
  return request;
}

function verifyFixtureRequest(fx, request) {
  const proof = { schema: "pipeline.po-approval-proof.v1", intentSha256: request.intentSha256,
    keyReference: trustAnchors[0].keyReference, publicKey,
    signatureBase64: sign(null, Buffer.from(request.intentSha256), pair.privateKey).toString("base64") };
  return verifyModelFamilyAuthority({ bundle: { schema: "pipeline.model-family-approved-policy.v2",
    candidateAtApproval, subject: request.subject, approvalIntent: request.approvalIntent, proof },
    routeSource: fx.targetRouteSource, trustAnchors, predecessor: { rawBundleBytes: fx.historicBundleBytes,
      historicRouteSource: fx.historicRouteSource, migrationProjection: request.migrationProjection } });
}

const completionCases = [];
function test(name, run) {
  completionCases.push({ id: "MFA" + String(completionCases.length + 1).padStart(3, "0"), name, run });
}

test("request binds every available route on all runners and verifies through the existing v2 authority verifier", () => {
  const fx = fixture(); const result = prepared(fx);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.mappingPreview.length, 32);
  assert.deepEqual(new Set(result.mappingPreview.map((row) => row.runner)), new Set(["codex", "claude", "antigravity"]));
  const rows = new Map(result.mappingPreview.map((row) => [row.runner + ":" + row.taskRoute, row]));
  assert.deepEqual([rows.get("codex:duty.critic_high_risk").familyId, rows.get("codex:duty.critic_high_risk").minimumVersion,
    rows.get("codex:duty.critic_high_risk").effort], ["astra", [6], "max"]);
  assert.deepEqual([rows.get("codex:duty.critic_normal").familyId, rows.get("codex:duty.critic_normal").minimumVersion,
    rows.get("codex:duty.critic_normal").effort], ["sol", [6, 1], "xhigh"]);
  assert.deepEqual([rows.get("codex:duty.mechanic").familyId, rows.get("codex:duty.mechanic").minimumVersion,
    rows.get("codex:duty.mechanic").effort], ["luna", [6], "medium"]);
  const proof = { schema: "pipeline.po-approval-proof.v1", intentSha256: result.intentSha256,
    keyReference: trustAnchors[0].keyReference, publicKey,
    signatureBase64: sign(null, Buffer.from(result.intentSha256), pair.privateKey).toString("base64") };
  const verified = verifyModelFamilyAuthority({ bundle: { schema: "pipeline.model-family-approved-policy.v2",
    candidateAtApproval: result.request.candidateAtApproval, subject: result.request.subject,
    approvalIntent: result.request.approvalIntent, proof }, routeSource: fx.targetRouteSource, trustAnchors,
  predecessor: { rawBundleBytes: fx.historicBundleBytes, historicRouteSource: fx.historicRouteSource,
    migrationProjection: result.request.migrationProjection } });
  assert.equal(verified.ok, true, verified.code);
  assert.equal(verified.value.hostAdmission, "not-created");
  assert.equal(verified.value.assignments.length, 32);
  const newFx = codexOnlyFixture();
  const firstAdoption = prepared(newFx);
  assert.equal(firstAdoption.ok, true, JSON.stringify(firstAdoption));
  assert.equal(firstAdoption.request.migrationProjection.filter((row) => row.historicModelId === null).length, 17);
  assert.equal(firstAdoption.request.migrationProjection.filter((row) => row.runner === "codex" && typeof row.historicModelId === "string").length, 15);
  assert.equal(firstAdoption.mappingPreview.filter((row) => row.change === "explicit first adoption; no inherited model or floor").length, 17);
  const firstAuthority = verifyFixtureRequest(newFx, firstAdoption.request);
  assert.equal(firstAuthority.ok, true, firstAuthority.code);
  assert.equal(firstAuthority.value.assignments.length, 32);
  assert.equal(firstAuthority.value.hostAdmission, "not-created");

  // These negative proposals have valid disposable signatures and recomputed
  // digests, so rejection must come from the real migration contract.
  const changes = [
    (request) => { request.migrationProjection.find((row) => row.runner === "codex").historicModelId = null; },
    (request) => { request.migrationProjection.find((row) => row.runner === "claude").historicModelId = "fictional-old-model"; },
    (request) => { request.migrationProjection.find((row) => row.runner === "claude").historicRole = "efficient"; },
    (request) => { request.migrationProjection.find((row) => row.runner === "claude").adapterContractSha256 = "d".repeat(64); },
    (request) => {
      const omitted = request.migrationProjection.find((row) => row.runner === "claude");
      request.migrationProjection = request.migrationProjection.filter((row) => row !== omitted);
      for (const assignment of request.subject.assignments) if (assignment.runner === omitted.runner)
        assignment.taskRoutes = assignment.taskRoutes.filter((route) => route !== omitted.taskRoute);
      request.subject.assignments = request.subject.assignments.filter((assignment) => assignment.taskRoutes.length);
    },
  ];
  for (const change of changes) {
    const altered = structuredClone(firstAdoption.request); change(altered); rebindFixtureRequest(altered);
    assert.equal(verifyFixtureRequest(newFx, altered).ok, false);
    assert.equal(modelFamilyApprovalRequestMatches(altered, firstAdoption.request), false);
  }
  for (const change of [
    (request) => { request.subject.assignments.find((row) => row.runner === "claude").minimumVersion = [999]; },
    (request) => { request.subject.migration.familyProjectionSha256 = "e".repeat(64); },
  ]) {
    const altered = structuredClone(firstAdoption.request); change(altered);
    assert.equal(verifyFixtureRequest(newFx, altered).ok, false);
  }
  const ambiguous = fixture();
  const ambiguousPolicies = structuredClone(ambiguous.historicBundle.approvedPolicies);
  for (const row of ambiguousPolicies) if (row.runner === "codex" && row.role === "frontier")
    row.policy.approved.push({ ...row.policy.approved[0], modelId: "gpt-6.2-sol", rank: 2 });
  withHistoricPolicies(ambiguous, ambiguousPolicies);
  const authenticatedAmbiguity = verifyModelRoleApprovedPolicy({ bundle: ambiguous.historicBundle,
    routeSource: ambiguous.historicRouteSource, trustAnchors, requiredRunner: "codex" });
  assert.equal(authenticatedAmbiguity.ok, true, authenticatedAmbiguity.code);
  assert.equal(prepared(ambiguous).code, "MODEL-FAMILY-HISTORIC-EXACT-MODEL-AMBIGUOUS");
});

test("missing real adapter inputs yield typed denial while retaining the entire review preview", () => {
  const fx = fixture(); const result = prepared(fx, fx.adapterContractBindings.filter((binding) => !(binding.runner === "codex" && binding.familyId === "sol")));
  assert.equal(result.ok, false);
  assert.equal(result.code, "MODEL-FAMILY-ADAPTER-CONTRACTS-MISSING");
  assert.deepEqual(result.missingRunnerFamilies, [["codex", "sol"]]);
  assert.equal(result.mappingPreview.length, 32);
});

test("explicit mapping must cover all available runner routes before it can become a request", () => {
  const fx = fixture();
  const result = createModelFamilyApprovalRequest({ requestId: "fixture-incomplete", candidateAtApproval,
    targetRouteSource: fx.targetRouteSource, historicRouteSource: fx.historicRouteSource,
    historicBundle: fx.historicBundle, historicBundleBytes: fx.historicBundleBytes, trustAnchors,
    adapterContractBindings: fx.adapterContractBindings, proposedAssignments: fx.proposedAssignments.slice(0, -1) });
  assert.equal(result.code, "MODEL-FAMILY-ASSIGNMENT-MAPPING-INCOMPLETE");
  assert.equal(result.missingRoutes.length, 1);
  const first = codexOnlyFixture();
  first.proposedAssignments = first.proposedAssignments.filter((row) => !(row.runner === "claude" && row.taskRoute === "duty.read"));
  const missingFirstDecision = prepared(first);
  assert.equal(missingFirstDecision.code, "MODEL-FAMILY-ASSIGNMENT-MAPPING-INCOMPLETE");
  assert.deepEqual(missingFirstDecision.missingRoutes, [{ runner: "claude", taskRoute: "duty.read" }]);
});

test("unavailable Argon routes cannot be added to an approval mapping", () => {
  const fx = fixture();
  const unavailable = fx.targetRouteSource.unavailableTaskRoutes[0];
  const assignments = [...fx.proposedAssignments, { runner: unavailable.runner, taskRoute: unavailable.taskRoute,
    familyId: "argon-preview", minimumVersion: [1], update: "latest" }];
  const result = createModelFamilyApprovalRequest({ requestId: "fixture-unavailable", candidateAtApproval,
    targetRouteSource: fx.targetRouteSource, historicRouteSource: fx.historicRouteSource,
    historicBundle: fx.historicBundle, historicBundleBytes: fx.historicBundleBytes, trustAnchors,
    adapterContractBindings: fx.adapterContractBindings, proposedAssignments: assignments });
  assert.equal(result.code, "MODEL-FAMILY-ASSIGNMENT-ROUTE-INVALID");
  assert.equal(fx.targetRouteSource.unavailableTaskRoutes.length, 14);
});

test("mapping and contract input order canonicalize to one exact disclosure", () => {
  const fx = fixture();
  const first = prepared(fx);
  const reordered = createModelFamilyApprovalRequest({ requestId: "fixture-001", candidateAtApproval,
    targetRouteSource: fx.targetRouteSource, historicRouteSource: fx.historicRouteSource,
    historicBundle: fx.historicBundle, historicBundleBytes: fx.historicBundleBytes, trustAnchors,
    adapterContractBindings: [...fx.adapterContractBindings].reverse(),
    proposedAssignments: [...fx.proposedAssignments].reverse() });
  assert.equal(first.ok, true, first.code);
  assert.equal(reordered.ok, true, reordered.code);
  assert.equal(digest(first.request), digest(reordered.request));
});

test("new runner-family identifiers need no code change and remain exact request bindings", () => {
  const fx = fixture();
  const assignments = structuredClone(fx.proposedAssignments);
  const target = assignments.find((row) => row.runner === "claude");
  const previousFamily = target.familyId;
  target.familyId = "future-beta";
  const sourceBinding = fx.adapterContractBindings.find((binding) => binding.runner === "claude" && binding.familyId === previousFamily);
  const futureBinding = structuredClone(sourceBinding);
  futureBinding.familyId = "future-beta";
  futureBinding.path = "plugins/pipeline-core/contracts/claude-future-beta.json";
  futureBinding.contract.familyId = "future-beta";
  const result = createModelFamilyApprovalRequest({ requestId: "fixture-new-family", candidateAtApproval,
    targetRouteSource: fx.targetRouteSource, historicRouteSource: fx.historicRouteSource,
    historicBundle: fx.historicBundle, historicBundleBytes: fx.historicBundleBytes, trustAnchors,
    adapterContractBindings: [...fx.adapterContractBindings, futureBinding], proposedAssignments: assignments });
  assert.equal(result.ok, true, result.code);
  assert.ok(result.request.subject.assignments.some((row) => row.runner === "claude" && row.familyId === "future-beta"));
  assert.ok(result.request.adapterContractBindings.some((binding) => binding.runner === "claude" && binding.familyId === "future-beta"));
});

test("canonical adapter-contract validation rejects malformed version fields", () => {
  const fx = fixture();
  const contracts = structuredClone(fx.adapterContractBindings);
  contracts[0].contract.identityRule.version = "1";
  const result = prepared(fx, contracts);
  assert.equal(result.code, "MODEL-FAMILY-ADAPTER-CONTRACT-INVALID");
});

test("request, predecessor, floor, and contract tampering fail exact disclosure binding", () => {
  const fx = fixture(); const result = prepared(fx); assert.equal(result.ok, true, result.code);
  const request = result.request;
  assert.equal(modelFamilyApprovalRequestMatches(request, request), true);
  for (const mutate of [
    (copy) => { copy.subject.migration.historicApprovalIntentSha256 = "d".repeat(64); },
    (copy) => { copy.subject.assignments.find((row) => row.taskRoutes[0] === "duty.critic_high_risk").minimumVersion = [5]; },
    (copy) => { copy.adapterContractBindings[0].contract.identityRule.sha256 = "e".repeat(64); },
    (copy) => { copy.mappingPreview.pop(); },
    (copy) => { copy.intentSha256 = "f".repeat(64); },
  ]) {
    const changed = structuredClone(request); mutate(changed);
    assert.equal(modelFamilyApprovalRequestMatches(changed, request), false);
  }
  const proof = { schema: "pipeline.po-approval-proof.v1", intentSha256: result.intentSha256,
    keyReference: trustAnchors[0].keyReference, publicKey,
    signatureBase64: sign(null, Buffer.from(result.intentSha256), pair.privateKey).toString("base64") };
  const wrongPredecessor = verifyModelFamilyAuthority({ bundle: { schema: "pipeline.model-family-approved-policy.v2",
    candidateAtApproval: request.candidateAtApproval, subject: request.subject,
    approvalIntent: request.approvalIntent, proof }, routeSource: fx.targetRouteSource, trustAnchors,
  predecessor: { rawBundleBytes: Buffer.concat([fx.historicBundleBytes, Buffer.from(" ")]),
    historicRouteSource: fx.historicRouteSource, migrationProjection: request.migrationProjection } });
  assert.equal(wrongPredecessor.ok, false);
  assert.equal(wrongPredecessor.code, "MODEL-FAMILY-MIGRATION-INVALID");
});

test("closed request schema rejects extra authority fields and an invalid candidate", () => {
  const fx = fixture(); const result = prepared(fx); assert.equal(result.ok, true, result.code);
  const changed = structuredClone(result.request); changed.hostAdmission = true;
  assert.equal(modelFamilyApprovalRequestMatches(changed, result.request), false);
  const invalidCandidate = createModelFamilyApprovalRequest({ requestId: "fixture-002",
    candidateAtApproval: { commit: "1".repeat(40), tree: "1".repeat(40) },
    targetRouteSource: fx.targetRouteSource, historicRouteSource: fx.historicRouteSource,
    historicBundle: fx.historicBundle, historicBundleBytes: fx.historicBundleBytes,
    trustAnchors, adapterContractBindings: fx.adapterContractBindings });
  assert.equal(invalidCandidate.code, "MODEL-FAMILY-CANDIDATE-BINDING");
});

test("canonical PO signer resolves the family request before guard fallback and rejects an unresolved family schema", () => {
  const signer = readFileSync(new URL("./po-human-approval.mjs", import.meta.url), "utf8");
  const resolveAt = signer.indexOf("const modelFamilyApproval =");
  const denyAt = signer.indexOf("scratchRequestRecord?.schema === MODEL_FAMILY_APPROVAL_REQUEST_SCHEMA && modelFamilyApproval === null");
  const selectAt = signer.indexOf("?? modelFamilyApproval");
  const genericFallbackAt = signer.indexOf("describeGmw({ rootDir: repository, intentSha256 })");
  assert.ok(resolveAt >= 0 && denyAt > resolveAt && selectAt > denyAt && genericFallbackAt > selectAt,
    "family requests must receive their own exact disclosure and fail closed before generic HGO/GMW fallback");
  assert.match(signer, /the model-family request does not bind the current candidate/u);
});

if (completionCases.length !== 10) throw new Error("case completion count drift: expected 10, got " + completionCases.length);
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openCompletionDescriptor(devNull, "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: completionCases, fd: completionFd, maxBytes: 65536 });
