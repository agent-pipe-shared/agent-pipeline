// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { registerTestCaseCompletion } from "./test-case-completion.mjs";
const completionCases = [];
import { canonical } from "./po-approval-proof.mjs";
import { createModelRolePolicyApprovalIntent, verifyModelRoleApprovedPolicy } from "./model-role-approved-policy.mjs";
import { verifyModelFamilyAuthority, verifyModelFamilyPinDecision } from "./model-family-authority.mjs";

const sha = (v) => createHash("sha256").update(v).digest("hex");
const digest = (v) => sha(canonical(v));
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const publicPem = publicKey.export({ format: "pem", type: "spki" });
const trustAnchors = [{ keyReference: "synthetic-fixture-key", publicKeySha256: sha(publicPem) }];
const candidate = { commit: "1".repeat(40), tree: "2".repeat(40) };

function source(rows) {
  const taskRoutes = rows.map(({ taskRoute, runner = "codex", role, effort, selector, state = "default" }) =>
    ({ taskRoute, runner, role, effort, state, selector: { kind: "model-id", value: selector } }));
  const bySlot = new Map();
  for (const t of taskRoutes) if (t.state !== "unavailable") bySlot.set(`${t.runner}:${t.role}:${t.effort}`,
    { runner: t.runner, role: t.role, effort: t.effort, selector: t.selector });
  return { ok: true, taskRoutes, configuredRoutes: [...bySlot.values()] };
}
function legacyFixture() {
  const rows = [
    { taskRoute: "duty.implement", role: "worker", effort: "high", selector: "old-luna" },
    { taskRoute: "duty.mechanic", role: "efficient", effort: "high", selector: "old-luna" },
    { taskRoute: "duty.critic_normal", role: "frontier", effort: "medium", selector: "old-sol" },
    { taskRoute: "duty.critic_high_risk", role: "frontier", effort: "max", selector: "old-sol" },
    { taskRoute: "profile.epic.design_phase", runner: "claude", role: "frontier", effort: "xhigh", selector: "opus", state: "unavailable" },
  ];
  const historicRouteSource = source(rows);
  const approvedPolicies = historicRouteSource.configuredRoutes.map((c) => ({ runner: c.runner, role: c.role,
    effort: c.effort, policy: { schema: "pipeline.model-role-policy.v1", runner: c.runner, role: c.role,
      approved: [{ modelId: c.selector.value, rank: 1, efforts: ["high", "medium", "xhigh", "max"],
        compatibilityEvidenceSha256: "a".repeat(64) }] } }));
  const approvalIntent = createModelRolePolicyApprovalIntent({ routeSource: historicRouteSource, approvedPolicies, candidateAtApproval: candidate });
  const bundle = { schema: "pipeline.model-role-approved-policy.v1", candidateAtApproval: candidate, approvedPolicies, approvalIntent,
    proof: { schema: "pipeline.po-approval-proof.v1", intentSha256: approvalIntent.sha256, keyReference: trustAnchors[0].keyReference,
      publicKey: publicPem, signatureBase64: sign(null, Buffer.from(approvalIntent.sha256), privateKey).toString("base64") } };
  return { historicRouteSource, bundle, rawBundleBytes: Buffer.from(JSON.stringify(bundle)) };
}
function makeTarget(old) {
  const rows = [
    { taskRoute: "duty.implement", role: "worker", effort: "high", oldRole: "worker", oldEffort: "high", model: "old-luna", family: "luna", floor: [6], adapter: "b".repeat(64) },
    { taskRoute: "duty.mechanic", role: "efficient", effort: "medium", oldRole: "efficient", oldEffort: "high", model: "old-luna", family: "luna", floor: [6], adapter: "b".repeat(64) },
    { taskRoute: "duty.critic_normal", role: "frontier", effort: "xhigh", oldRole: "frontier", oldEffort: "medium", model: "old-sol", family: "sol", floor: [6, 1], adapter: "a".repeat(64) },
    { taskRoute: "duty.critic_high_risk", role: "frontier", effort: "max", oldRole: "frontier", oldEffort: "max", model: "old-sol", family: "astra", floor: [6], adapter: "c".repeat(64) },
  ];
  const routeSource = source([...rows.map((r) => ({ ...r, selector: `target-${r.family}` })),
    { taskRoute: "profile.epic.design_phase", runner: "claude", role: "frontier", effort: "xhigh", selector: "opus", state: "unavailable" }]);
  const assignments = rows.map((r) => ({ runner: "codex", role: r.role, effort: r.effort, taskRoutes: [r.taskRoute],
    familyId: r.family, adapterContractSha256: r.adapter, minimumVersion: r.floor, update: "latest" }));
  const projection = rows.map((r) => ({ runner: "codex", taskRoute: r.taskRoute, role: r.role, effort: r.effort,
    historicRole: r.oldRole, historicEffort: r.oldEffort, historicModelId: r.model, familyId: r.family,
    minimumVersion: r.floor, adapterContractSha256: r.adapter }));
  const sortedFloors = assignments.map((a) => ({ runner: a.runner, taskRoute: a.taskRoutes[0], role: a.role,
    effort: a.effort, familyId: a.familyId, minimumVersion: a.minimumVersion }))
    .sort((a, b) => JSON.stringify([a.runner, a.taskRoute, a.role, a.effort]).localeCompare(JSON.stringify([b.runner, b.taskRoute, b.role, b.effort])));
  const rawHash = sha(old.rawBundleBytes);
  const migration = { schema: "pipeline.model-family-migration.v1", historicBundleByteSha256: rawHash,
    historicApprovalIntentSha256: old.bundle.approvalIntent.sha256,
    historicRouteSourceSha256: digest({ taskRoutes: old.historicRouteSource.taskRoutes, configuredRoutes: old.historicRouteSource.configuredRoutes }),
    targetRouteSourceSha256: digest({ taskRoutes: routeSource.taskRoutes, configuredRoutes: routeSource.configuredRoutes }),
    familyProjectionSha256: digest(projection), adapterContractSha256s: ["a".repeat(64), "b".repeat(64), "c".repeat(64)],
    preservedFloorsSha256: digest(sortedFloors) };
  const subject = { revision: "model-family-v2", predecessorAuthoritySha256: null,
    routeSourceSha256: migration.targetRouteSourceSha256, assignments, migration };
  const subjectSha256 = digest(subject);
  const approvalIntent = { value: { schema: "pipeline.po-approval-intent.v1", kind: "model-role-policy",
    featureId: "model-role-routes", planSha256: subject.routeSourceSha256, specSha256: subjectSha256,
    candidate, policyRevision: "model-family-v2", subjectSha256, decision: "approved" } };
  approvalIntent.sha256 = sha(canonical(approvalIntent.value));
  const bundle = { schema: "pipeline.model-family-approved-policy.v2", candidateAtApproval: candidate, subject, approvalIntent,
    proof: { schema: "pipeline.po-approval-proof.v1", intentSha256: approvalIntent.sha256,
      keyReference: trustAnchors[0].keyReference, publicKey: publicPem,
      signatureBase64: sign(null, Buffer.from(approvalIntent.sha256), privateKey).toString("base64") } };
  return { rows, routeSource, assignments, projection, bundle, migration };
}
function signedPin(authority, subject) {
  const subjectSha256 = digest(subject);
  const value = { schema: "pipeline.po-approval-intent.v1", kind: "model-role-policy", featureId: "model-role-routes",
    planSha256: authority.authority.subject.routeSourceSha256, specSha256: subjectSha256,
    candidate, policyRevision: "model-family-pin-v1", subjectSha256, decision: subject.decision === "pin" ? "approved" : "released" };
  const approvalIntent = { value, sha256: sha(canonical(value)) };
  return { schema: "pipeline.model-family-pin-decision.v1", subject, approvalIntent,
    proof: { schema: "pipeline.po-approval-proof.v1", intentSha256: approvalIntent.sha256,
      keyReference: trustAnchors[0].keyReference, publicKey: publicPem,
      signatureBase64: sign(null, Buffer.from(approvalIntent.sha256), privateKey).toString("base64") } };
}

function freshAuthority(rows, minimumVersion = [0]) {
  const routeSource = source(rows.map((r) => ({ ...r, selector: "family-fixture-model" })));
  const assignments = rows.map((r) => ({ runner: "codex", role: r.role, effort: r.effort,
    taskRoutes: [r.taskRoute], familyId: "fixture", adapterContractSha256: "f".repeat(64),
    minimumVersion: [...minimumVersion], update: "latest" }));
  const subject = { revision: "model-family-v2", predecessorAuthoritySha256: null,
    routeSourceSha256: digest({ taskRoutes: routeSource.taskRoutes, configuredRoutes: routeSource.configuredRoutes }),
    assignments, migration: null };
  const subjectSha256 = digest(subject);
  const approvalIntent = { value: { schema: "pipeline.po-approval-intent.v1", kind: "model-role-policy",
    featureId: "model-role-routes", planSha256: subject.routeSourceSha256, specSha256: subjectSha256,
    candidate, policyRevision: "model-family-v2", subjectSha256, decision: "approved" } };
  approvalIntent.sha256 = sha(canonical(approvalIntent.value));
  const bundle = { schema: "pipeline.model-family-approved-policy.v2", candidateAtApproval: candidate, subject, approvalIntent,
    proof: { schema: "pipeline.po-approval-proof.v1", intentSha256: approvalIntent.sha256,
      keyReference: trustAnchors[0].keyReference, publicKey: publicPem,
      signatureBase64: sign(null, Buffer.from(approvalIntent.sha256), privateKey).toString("base64") } };
  return { bundle, routeSource };
}

function independentlySignedSuccessor(predecessor, initial, predecessorSha256 = predecessor.authoritySha256) {
  const bundle = structuredClone(initial.bundle);
  bundle.subject.predecessorAuthoritySha256 = predecessorSha256;
  bundle.subject.assignments[0].familyId = "fixture-next";
  bundle.subject.assignments[0].minimumVersion = [1];
  const subjectSha256 = digest(bundle.subject);
  const value = { schema: "pipeline.po-approval-intent.v1", kind: "model-role-policy", featureId: "model-role-routes",
    planSha256: bundle.subject.routeSourceSha256, specSha256: subjectSha256,
    candidate: bundle.candidateAtApproval, policyRevision: "model-family-v2", subjectSha256, decision: "approved" };
  bundle.approvalIntent = { value, sha256: sha(canonical(value)) };
  bundle.proof = { schema: "pipeline.po-approval-proof.v1", intentSha256: bundle.approvalIntent.sha256,
    keyReference: trustAnchors[0].keyReference, publicKey: publicPem,
    signatureBase64: sign(null, Buffer.from(bundle.approvalIntent.sha256), privateKey).toString("base64") };
  return bundle;
}

function authorityValue(input) {
  const result = verifyModelFamilyAuthority(input);
  assert.equal(result.ok, true, result.code);
  return result.value;
}

function pinValue(input) {
  const result = verifyModelFamilyPinDecision(input);
  assert.equal(result.ok, true, result.code);
  return result.value;
}

completionCases.push({ id: "MFA" + String(completionCases.length + 1).padStart(3, "0"), name: "synthetic Ed25519 migration verifies original v1 proof, raw bytes, complete targets, and explicit Astra family", run: () => {
  const old = legacyFixture();
  assert.equal(verifyModelRoleApprovedPolicy({ bundle: old.bundle, routeSource: old.historicRouteSource, trustAnchors }).ok, true);
  const target = makeTarget(old);
  const result = verifyModelFamilyAuthority({ bundle: target.bundle, routeSource: target.routeSource, trustAnchors,
    predecessor: { rawBundleBytes: old.rawBundleBytes, historicRouteSource: old.historicRouteSource, migrationProjection: target.projection } });
  assert.equal(result.ok, true, result.code);
  assert.deepEqual(Object.keys(result).sort(), ["code", "ok", "value"]);
  assert.equal(result.value.assignments.length, 4);
  assert.equal(result.value.assignments.find((a) => a.taskRoute === "duty.critic_high_risk").familyId, "astra");
  assert.equal(result.value.hostAdmission, "not-created");
} });

completionCases.push({ id: "MFA" + String(completionCases.length + 1).padStart(3, "0"), name: "migration rejects changed historical bytes, source, proof, mapping, and trust", run: () => {
  const old = legacyFixture(); const target = makeTarget(old);
  const predecessor = { rawBundleBytes: old.rawBundleBytes, historicRouteSource: old.historicRouteSource, migrationProjection: target.projection };
  const verify = (p = predecessor, anchors = trustAnchors, b = target.bundle) => verifyModelFamilyAuthority({ bundle: b, routeSource: target.routeSource, trustAnchors: anchors, predecessor: p });
  assert.equal(verify({ ...predecessor, rawBundleBytes: Buffer.concat([old.rawBundleBytes, Buffer.from(" ")]) }).ok, false);
  assert.equal(verify({ ...predecessor, historicRouteSource: { ...old.historicRouteSource, taskRoutes: [] } }).ok, false);
  const forged = structuredClone(old.bundle); forged.proof.signatureBase64 = "AA==";
  const forgedPred = { ...predecessor, rawBundleBytes: Buffer.from(JSON.stringify(forged)) };
  assert.equal(verify(forgedPred).ok, false);
  assert.equal(verify(predecessor, [{ keyReference: "wrong", publicKeySha256: "f".repeat(64) }]).ok, false);
  const changed = structuredClone(target.bundle); changed.subject.migration.familyProjectionSha256 = "d".repeat(64);
  const intent = changed.subject; void intent;
  assert.equal(verify(predecessor, trustAnchors, changed).ok, false);
  const badProjection = structuredClone(target.projection); badProjection.pop();
  assert.equal(verify({ ...predecessor, migrationProjection: badProjection }).ok, false);
  const failure = verify({ ...predecessor, historicRouteSource: null });
  assert.deepEqual(Object.keys(failure).sort(), ["code", "ok", "retryable"]);
  assert.equal(failure.ok, false);
  assert.equal(typeof failure.retryable, "boolean");
  // Null may describe explicit first adoption only when the authenticated old
  // slot is absent, even if a fresh synthetic signature binds the altered row.
  const nullProjection = structuredClone(target.projection); nullProjection[0].historicModelId = null;
  const nullBundle = structuredClone(target.bundle);
  nullBundle.subject.migration.familyProjectionSha256 = digest(nullProjection);
  const nullSubjectSha256 = digest(nullBundle.subject);
  nullBundle.approvalIntent.value = { ...nullBundle.approvalIntent.value,
    specSha256: nullSubjectSha256, subjectSha256: nullSubjectSha256 };
  nullBundle.approvalIntent.sha256 = sha(canonical(nullBundle.approvalIntent.value));
  nullBundle.proof.intentSha256 = nullBundle.approvalIntent.sha256;
  nullBundle.proof.signatureBase64 = sign(null, Buffer.from(nullBundle.approvalIntent.sha256), privateKey).toString("base64");
  assert.equal(verify({ ...predecessor, migrationProjection: nullProjection }, trustAnchors, nullBundle).ok, false);
} });

completionCases.push({ id: "MFA" + String(completionCases.length + 1).padStart(3, "0"), name: "authority rejects duplicated normalized identities, effort or source drift, floors, and unapproved additions", run: () => {
  const old = legacyFixture(); const target = makeTarget(old);
  const check = (assignments = target.assignments, sourceValue = target.routeSource) => {
    const b = structuredClone(target.bundle); b.subject.assignments = assignments;
    return verifyModelFamilyAuthority({ bundle: b, routeSource: sourceValue, trustAnchors,
      predecessor: { rawBundleBytes: old.rawBundleBytes, historicRouteSource: old.historicRouteSource, migrationProjection: target.projection } });
  };
  assert.equal(check([...target.assignments, { ...target.assignments[0], taskRoutes: ["duty.mechanic"] }]).ok, false);
  const dropped = target.assignments.slice(1); assert.equal(check(dropped).ok, false);
  const wrongEffort = structuredClone(target.assignments); wrongEffort[0].effort = "medium"; assert.equal(check(wrongEffort).ok, false);
  const wrongRole = structuredClone(target.assignments); wrongRole[0].role = "efficient"; assert.equal(check(wrongRole).ok, false);
  const wrongFloor = structuredClone(target.assignments); wrongFloor[2].minimumVersion = [6]; assert.equal(check(wrongFloor).ok, false);
  const extraSource = structuredClone(target.routeSource); extraSource.taskRoutes.push({ ...extraSource.taskRoutes[0], taskRoute: "duty.extra" });
  assert.equal(check(target.assignments, extraSource).ok, false);
  const changed = structuredClone(target.bundle); changed.subject.assignments[0].update = "pinned";
  assert.equal(verifyModelFamilyAuthority({ bundle: changed, routeSource: target.routeSource, trustAnchors,
    predecessor: { rawBundleBytes: old.rawBundleBytes, historicRouteSource: old.historicRouteSource, migrationProjection: target.projection } }).ok, false);
} });

completionCases.push({ id: "MFA" + String(completionCases.length + 1).padStart(3, "0"), name: "scope-bound pin and monotone unpin decisions reject replay, expansion, missing predecessor and wrong revision", run: () => {
  const old = legacyFixture(); const target = makeTarget(old);
  const authority = authorityValue({ bundle: target.bundle, routeSource: target.routeSource, trustAnchors,
    predecessor: { rawBundleBytes: old.rawBundleBytes, historicRouteSource: old.historicRouteSource, migrationProjection: target.projection } });
  const s1 = { decision: "pin", authoritySha256: authority.authoritySha256, runner: "codex", familyId: "sol",
    taskRoutes: ["duty.critic_normal"], role: "frontier", effort: "xhigh", modelId: "gpt-6.1-sol",
    predecessorDecisionSha256: null, revision: 1 };
  const pin = signedPin(authority, s1);
  const firstPin = verifyModelFamilyPinDecision({ decision: pin, authority, trustAnchors });
  assert.equal(firstPin.ok, true, firstPin.code);
  const verifiedPin = firstPin.value;
  const unpin = signedPin(authority, { ...s1, decision: "unpin", modelId: null,
    predecessorDecisionSha256: verifiedPin.decisionSha256, revision: 2 });
  const unpinResult = verifyModelFamilyPinDecision({ decision: unpin, authority, previousDecision: verifiedPin, trustAnchors });
  assert.equal(unpinResult.ok, true, unpinResult.code);
  const verifiedUnpin = unpinResult.value;
  assert.deepEqual(Object.keys(unpinResult).sort(), ["code", "ok", "value"]);
  assert.equal(verifiedUnpin.state, "unpinned");
  assert.equal(verifyModelFamilyPinDecision({ decision: unpin, authority, trustAnchors }).ok, false);
  const wrongRevision = signedPin(authority, { ...s1, decision: "unpin", modelId: null,
    predecessorDecisionSha256: verifiedPin.decisionSha256, revision: 3 });
  assert.equal(verifyModelFamilyPinDecision({ decision: wrongRevision, authority, previousDecision: verifiedPin, trustAnchors }).ok, false);
  const expanded = signedPin(authority, { ...s1, taskRoutes: ["duty.critic_normal", "duty.critic_high_risk"] });
  assert.equal(verifyModelFamilyPinDecision({ decision: expanded, authority, trustAnchors }).ok, false);
  const replay = signedPin(authority, { ...s1, predecessorDecisionSha256: "e".repeat(64), revision: 2 });
  assert.equal(verifyModelFamilyPinDecision({ decision: replay, authority, previousDecision: verifiedPin, trustAnchors }).ok, false);
  assert.equal(verifyModelFamilyPinDecision({ decision: unpin, authority: { ...authority }, previousDecision: verifiedPin, trustAnchors }).ok, false);
  assert.equal(verifyModelFamilyPinDecision({ decision: unpin, authority, previousDecision: structuredClone(verifiedPin), trustAnchors }).ok, false);
  const badProof = structuredClone(pin); badProof.proof.signatureBase64 = "AA==";
  assert.equal(verifyModelFamilyPinDecision({ decision: badProof, authority, trustAnchors }).ok, false);
} });

completionCases.push({ id: "MFA" + String(completionCases.length + 1).padStart(3, "0"), name: "verified authority and decision values are deeply immutable snapshots, and copied handles are not trusted", run: () => {
  const old = legacyFixture(); const target = makeTarget(old);
  const originalDigest = sha(canonical(target.bundle));
  const authority = authorityValue({ bundle: target.bundle, routeSource: target.routeSource, trustAnchors,
    predecessor: { rawBundleBytes: old.rawBundleBytes, historicRouteSource: old.historicRouteSource, migrationProjection: target.projection } });
  assert.equal(Object.isFrozen(authority), true);
  assert.equal(Object.isFrozen(authority.authority), true);
  assert.equal(Object.isFrozen(authority.authority.subject.assignments), true);
  assert.equal(Object.isFrozen(authority.authority.subject.assignments[0].taskRoutes), true);
  assert.equal(Object.isFrozen(authority.authority.proof), true);
  assert.throws(() => { authority.authority.subject.assignments[0].taskRoutes.push("duty.extra"); }, TypeError);
  assert.throws(() => { authority.authority.proof.signatureBase64 = "AA=="; }, TypeError);
  assert.throws(() => { authority.assignments[0].taskRoute = "duty.extra"; }, TypeError);
  target.bundle.subject.assignments[0].taskRoutes.push("duty.injected");
  target.routeSource.taskRoutes[0].selector.value = "changed-after-proof";
  target.projection[0].familyId = "changed-after-proof";
  old.rawBundleBytes[0] ^= 1;
  assert.equal(sha(canonical(authority.authority)), originalDigest);
  assert.equal(authority.assignments.some((a) => a.taskRoute === "duty.injected"), false);
  assert.equal(verifyModelFamilyPinDecision({ decision: signedPin({ ...authority }, {
    decision: "pin", authoritySha256: authority.authoritySha256, runner: "codex", familyId: "sol",
    taskRoutes: ["duty.critic_normal"], role: "frontier", effort: "xhigh", modelId: "gpt-6.1-sol",
    predecessorDecisionSha256: null, revision: 1 }), authority: { ...authority }, trustAnchors }).ok, false);

  const validDecision = signedPin(authority, { decision: "pin", authoritySha256: authority.authoritySha256,
    runner: "codex", familyId: "sol", taskRoutes: ["duty.critic_normal"], role: "frontier", effort: "xhigh",
    modelId: "gpt-6.1-sol", predecessorDecisionSha256: null, revision: 1 });
  const decision = pinValue({ decision: validDecision, authority, trustAnchors });
  assert.equal(Object.isFrozen(decision), true);
  assert.equal(Object.isFrozen(decision.decision.subject), true);
  assert.equal(Object.isFrozen(decision.decision.proof), true);
  assert.throws(() => { decision.decision.subject.taskRoutes.push("duty.critic_high_risk"); }, TypeError);
  assert.throws(() => { decision.decision.proof.signatureBase64 = "AA=="; }, TypeError);
  validDecision.subject.taskRoutes.push("duty.critic_high_risk");
  assert.deepEqual(decision.decision.subject.taskRoutes, ["duty.critic_normal"]);
  assert.equal(verifyModelFamilyPinDecision({ decision: signedPin(authority, {
    ...decision.decision.subject, revision: 2, predecessorDecisionSha256: decision.decisionSha256,
    decision: "unpin", modelId: null,
  }), authority, previousDecision: JSON.parse(JSON.stringify(decision)), trustAnchors }).ok, false);
} });

completionCases.push({ id: "MFA" + String(completionCases.length + 1).padStart(3, "0"), name: "pin predecessor chain requires exact scope while permitting normalized route order", run: () => {
  const old = legacyFixture(); const target = makeTarget(old);
  const authority = authorityValue({ bundle: target.bundle, routeSource: target.routeSource, trustAnchors,
    predecessor: { rawBundleBytes: old.rawBundleBytes, historicRouteSource: old.historicRouteSource, migrationProjection: target.projection } });
  const subject = { decision: "pin", authoritySha256: authority.authoritySha256, runner: "codex", familyId: "sol",
    taskRoutes: ["duty.critic_normal"], role: "frontier", effort: "xhigh", modelId: "gpt-6.1-sol",
    predecessorDecisionSha256: null, revision: 1 };
  const first = pinValue({ decision: signedPin(authority, subject), authority, trustAnchors });
  const reordered = signedPin(authority, { ...subject, decision: "unpin", modelId: null,
    taskRoutes: ["duty.critic_normal"], predecessorDecisionSha256: first.decisionSha256, revision: 2 });
  assert.equal(verifyModelFamilyPinDecision({ decision: reordered, authority, previousDecision: first, trustAnchors }).ok, true);

  const wrongScopes = [
    { runner: "claude" }, { familyId: "astra" }, { role: "worker" }, { effort: "medium" },
    { taskRoutes: ["duty.critic_high_risk"] },
  ];
  for (const change of wrongScopes) {
    const changed = { ...subject, ...change, decision: "unpin", modelId: null,
      predecessorDecisionSha256: first.decisionSha256, revision: 2 };
    const result = verifyModelFamilyPinDecision({ decision: signedPin(authority, changed), authority,
      previousDecision: first, trustAnchors });
    assert.equal(result.ok, false, JSON.stringify(change));
  }
} });

completionCases.push({ id: "MFA" + String(completionCases.length + 1).padStart(3, "0"), name: "authority accepts all declared roles and efforts, not-applicable, and zero tuples; runtime rejects unknowns and unsafe integers", run: () => {
  const rows = [];
  for (const role of ["frontier", "worker", "efficient"])
    for (const effort of ["low", "medium", "high", "xhigh", "max", "not-applicable"])
      rows.push({ taskRoute: `duty.fixture_${role}_${effort.replaceAll("-", "_")}`, role, effort });
  const valid = freshAuthority(rows);
  const authority = authorityValue({ ...valid, trustAnchors });
  assert.equal(authority.assignments.length, 18);
  assert.equal(authority.assignments.some((a) => a.effort === "not-applicable"), true);
  assert.equal(authority.assignments.every((a) => a.minimumVersion.length === 1 && a.minimumVersion[0] === 0), true);

  for (const badRow of [
    { taskRoute: "duty.fixture_unknown_role", role: "observer", effort: "high" },
    { taskRoute: "duty.fixture_unknown_effort", role: "worker", effort: "turbo" },
  ]) {
    const invalid = freshAuthority([badRow]);
    assert.equal(verifyModelFamilyAuthority({ ...invalid, trustAnchors }).ok, false);
  }
  const unsafe = freshAuthority([{ taskRoute: "duty.fixture_unsafe", role: "worker", effort: "high" }], [Number.MAX_SAFE_INTEGER + 1]);
  assert.equal(verifyModelFamilyAuthority({ ...unsafe, trustAnchors }).ok, false);
} });

completionCases.push({ id: "MFA" + String(completionCases.length + 1).padStart(3, "0"), name: "a freshly signed successor accepts its exact branded v2 predecessor", run: () => {
  const rows = [{ taskRoute: "duty.fixture_successor", role: "worker", effort: "high" }];
  const initial = freshAuthority(rows);
  const predecessor = authorityValue({ ...initial, trustAnchors });
  const successor = independentlySignedSuccessor(predecessor, initial);
  const result = verifyModelFamilyAuthority({ bundle: successor, routeSource: initial.routeSource, trustAnchors,
    predecessor });
  assert.equal(result.ok, true, result.code);
  assert.equal(result.value.authority.subject.predecessorAuthoritySha256, predecessor.authoritySha256);
  assert.equal(result.value.assignments[0].familyId, "fixture-next");
  assert.notEqual(result.value.authoritySha256, predecessor.authoritySha256);
} });

completionCases.push({ id: "MFA" + String(completionCases.length + 1).padStart(3, "0"), name: "successor refuses copied predecessors, wrong digest or source, extra subject keys, and unapproved changes", run: () => {
  const rows = [{ taskRoute: "duty.fixture_successor", role: "worker", effort: "high" }];
  const initial = freshAuthority(rows);
  const predecessor = authorityValue({ ...initial, trustAnchors });
  const bundle = independentlySignedSuccessor(predecessor, initial);
  const verify = (next = bundle, routeSource = initial.routeSource, prior = predecessor) =>
    verifyModelFamilyAuthority({ bundle: next, routeSource, trustAnchors, predecessor: prior });

  assert.equal(verify().ok, true);
  assert.equal(verify(bundle, initial.routeSource, structuredClone(predecessor)).ok, false);
  assert.equal(verify(independentlySignedSuccessor(predecessor, initial, "f".repeat(64))).ok, false);

  const changedSource = structuredClone(initial.routeSource);
  changedSource.taskRoutes[0].selector.value = "changed-model";
  changedSource.configuredRoutes[0].selector.value = "changed-model";
  assert.equal(verify(bundle, changedSource).ok, false);

  const extraKey = structuredClone(bundle);
  extraKey.subject.unreviewed = true;
  assert.equal(verify(extraKey).ok, false);

  const unapprovedFamily = structuredClone(bundle);
  unapprovedFamily.subject.assignments[0].familyId = "unapproved-family";
  assert.equal(verify(unapprovedFamily).ok, false);

  const invalidProof = structuredClone(bundle);
  invalidProof.proof.signatureBase64 = "AA==";
  assert.equal(verify(invalidProof).ok, false);
} });

completionCases.push({ id: "MFA" + String(completionCases.length + 1).padStart(3, "0"), name: "all four added schemas are closed JSON objects with matching names", run: () => {
  const root = new URL("../schemas/", import.meta.url);
  const names = ["pipeline.model-family-approved-policy.v2", "pipeline.model-family-migration.v1",
    "pipeline.model-family-pin-decision.v1", "pipeline.model-family-adapter-contract.v1"];
  const schemas = new Map();
  for (const name of names) {
    const schema = JSON.parse(readFileSync(new URL(`${name}.json`, root), "utf8"));
    assert.equal(schema.$id, name);
    assert.equal(schema.additionalProperties, false);
    schemas.set(name, schema);
  }
  const authority = schemas.get(names[0]);
  assert.deepEqual(authority.required, ["schema", "candidateAtApproval", "subject", "approvalIntent", "proof"]);
  assert.deepEqual(authority.properties.subject.required,
    ["revision", "predecessorAuthoritySha256", "routeSourceSha256", "assignments", "migration"]);
  assert.deepEqual(authority.$defs.assignment.required,
    ["runner", "role", "effort", "taskRoutes", "familyId", "adapterContractSha256", "minimumVersion", "update"]);
  assert.deepEqual(authority.$defs.assignment.properties.role.enum, ["frontier", "worker", "efficient"]);
  assert.deepEqual(authority.$defs.assignment.properties.effort.enum,
    ["low", "medium", "high", "xhigh", "max", "not-applicable"]);
  assert.equal(authority.$defs.assignment.properties.minimumVersion.items.maximum, Number.MAX_SAFE_INTEGER);
  assert.equal(authority.$defs.assignment.properties.minimumVersion.items.minimum, 0);
  assert.deepEqual(schemas.get(names[1]).required,
    ["schema", "historicBundleByteSha256", "historicApprovalIntentSha256", "historicRouteSourceSha256", "targetRouteSourceSha256", "familyProjectionSha256", "adapterContractSha256s", "preservedFloorsSha256"]);
  assert.deepEqual(schemas.get(names[2]).properties.subject.required,
    ["decision", "authoritySha256", "runner", "familyId", "taskRoutes", "role", "effort", "modelId", "predecessorDecisionSha256", "revision"]);
  assert.deepEqual(schemas.get(names[2]).properties.subject.properties.role.enum, ["frontier", "worker", "efficient"]);
  assert.deepEqual(schemas.get(names[2]).properties.subject.properties.effort.enum,
    ["low", "medium", "high", "xhigh", "max", "not-applicable"]);
  assert.deepEqual(schemas.get(names[3]).required,
    ["schema", "runner", "familyId", "identityRule", "releaseGroupingRule", "versionRule", "variantSelectionRule", "discoveryModes", "selectabilityRule", "effortRule", "compatibilityRule", "executionIdentityRule", "providerEvidenceSha256s"]);
} });

registerTestCaseCompletion({ cases: completionCases, fd: 3, maxBytes: 65536 });
