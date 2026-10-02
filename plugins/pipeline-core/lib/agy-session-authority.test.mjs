// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";
import { buildSignatureIntent, consentSubject, digest, validateConsentRecord, validateDispatchBinding } from "./agy-session-authority.mjs";
import { canonical, PO_APPROVAL_PROOF_SCHEMA } from "./po-approval-proof.mjs";
import { AGY_FAMILY_SUBJECT_SCHEMA, createAgyFamilyConsentAuthority, familyConsentAssignment, validateFamilyConsentSubject } from "./agy-session-authority.mjs";
import { verifyModelFamilyAuthority } from "./model-family-authority.mjs";

// Reusable by the owned CLI suite: ephemeral signatures are synthetic test data.
export function signedFamilyConsentFixture({ repository = { primaryRoot: "/repo", commonDir: "/repo/.git" }, session: boundSession = session, now = 1000, nativeRole = "pipeline-core:goldfish-implementor" } = {}) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicPem = publicKey.export({ type: "spki", format: "pem" });
  const anchors = [{ keyReference: "synthetic-family-consent", publicKeySha256: createHash("sha256").update(publicPem).digest("hex") }];
  const proofFor = intent => ({ schema: PO_APPROVAL_PROOF_SCHEMA, intentSha256: intent.sha256, keyReference: anchors[0].keyReference, publicKey: publicPem, signatureBase64: sign(null, Buffer.from(intent.sha256), privateKey).toString("base64") });
  const selector = { kind: "model-id", value: "synthetic-gemini-1" };
  const mechanic = nativeRole === "pipeline-core:goldfish-mechanic", taskRoute = mechanic ? "duty.mechanic" : "duty.implement", role = mechanic ? "efficient" : "worker";
  const routeSource = { ok: true, taskRoutes: [{ taskRoute, runner: "antigravity", role, effort: "high", state: "default", selector }], configuredRoutes: [{ runner: "antigravity", role, effort: "high", selector }] };
  const authoritySubject = { revision: "model-family-v2", predecessorAuthoritySha256: null, routeSourceSha256: digest({ taskRoutes: routeSource.taskRoutes, configuredRoutes: routeSource.configuredRoutes }), assignments: [{ runner: "antigravity", role, effort: "high", taskRoutes: [taskRoute], familyId: "gemini", adapterContractSha256: "b".repeat(64), minimumVersion: [1], update: "latest" }], migration: null };
  const candidate = { commit: "c".repeat(40), tree: "d".repeat(40) };
  const value = { schema: "pipeline.po-approval-intent.v1", kind: "model-role-policy", featureId: "model-role-routes", planSha256: authoritySubject.routeSourceSha256, specSha256: digest(authoritySubject), candidate, policyRevision: "model-family-v2", subjectSha256: digest(authoritySubject), decision: "approved" };
  const approvalIntent = { value, sha256: digest(value) };
  const bundle = { schema: "pipeline.model-family-approved-policy.v2", candidateAtApproval: candidate, subject: authoritySubject, approvalIntent, proof: proofFor(approvalIntent) };
  const familyAuthorityInputs = { bundle, routeSource, trustAnchors: anchors };
  const verified = verifyModelFamilyAuthority(familyAuthorityInputs); assert.equal(verified.ok, true, verified.code);
  const subject = { schema: AGY_FAMILY_SUBJECT_SCHEMA, repository, session: boundSession, runner: "antigravity", provider: "google", familyAuthoritySha256: verified.value.authoritySha256, assignments: verified.value.assignments.map(familyConsentAssignment), roles: [nativeRole], allowedPaths: ["src/x.mjs"], scope: { dispatchId: "one-dispatch", purpose: "implementation" }, fallbackPolicy: "none", expiresAtMs: now + 60000, decisionNonce: "family-decision-nonce" };
  const intent = buildSignatureIntent({ featureId: "fixture", planSha256: "e".repeat(64), specSha256: "f".repeat(64), candidate, subjectSha256: digest(subject), policyRevision: "agy-session-family-v2" });
  const record = { schema: "pipeline.agy-session-consent.v2", status: "approved", decisionId: subject.decisionNonce, mode: "signature", session: boundSession, runner: subject.runner, provider: subject.provider, familyAuthoritySha256: subject.familyAuthoritySha256, assignments: subject.assignments, roles: subject.roles, allowedPaths: subject.allowedPaths, subject, subjectSha256: digest(subject), intent, proof: proofFor(intent), attribution: null, approvedAtMs: now, expiresAtMs: subject.expiresAtMs };
  return { record, subject, familyAuthorityInputs, repository, session: boundSession, now, policy: { ok: true, trustAnchors: anchors }, proofFor };
}

function sealedInvocation(f, model, version, invocationId) {
  const i = { schema: "pipeline.model-family-invocation.v2", kind: "model-family-invocation", runner: "antigravity", sessionId: f.session.id, invocationId, candidateCommit: "c".repeat(40), candidateTree: "d".repeat(40), taskRoute: "duty.implement", role: "worker", effort: "high", familyId: "gemini", releaseId: "synthetic-release-" + version, version: [version], selectedModelId: model, canonicalModelId: null, groupingEvidenceSha256: "a".repeat(64), variantSelectionEvidenceSha256: "a".repeat(64), selection: "latest", authoritySha256: f.subject.familyAuthoritySha256, pinDecisionSha256: null, adapterContractSha256: "b".repeat(64), discoverySha256: "a".repeat(64), compatibilityEvidenceSha256: "a".repeat(64), observedAt: new Date(f.now).toISOString(), expiresAt: new Date(f.now + 60000).toISOString(), storeGeneration: 1, watermarkBefore: null, watermarkAfter: [version], packetBindingSha256: "a".repeat(64) };
  Object.assign(i, { taskRoute: f.subject.assignments[0].taskRoute, role: f.subject.assignments[0].role });
  i.receiptSha256 = digest(i);
  return { invocation: i, bindings: { installationBindingSha256: "a".repeat(64), accountBindingSha256: "b".repeat(64), hostProcessBindingSha256: "c".repeat(64) }, provenanceSha256: "d".repeat(64) };
}

test("v2 actual signed family and consent allow two successors through one opaque admission", async () => {
  const f = signedFamilyConsentFixture(), invocations = new Map([1, 2].map(n => ["invocation-" + n, sealedInvocation(f, "synthetic-gemini-" + n, n, "invocation-" + n)]));
  let stored = f.record, revoked = false;
  const host = createAgyFamilyConsentAuthority({ readFamilyAuthority: () => f.familyAuthorityInputs, readInvocation: ({ invocationId }) => invocations.get(invocationId), readLive: () => ({ ok: true, session: f.session, descriptor: { repo: f.repository } }), readStored: () => ({ record: stored, revoked }), readMode: () => ({ mode: "signature" }), readPolicy: () => f.policy });
  const admitted = await host.admit({ root: "/repo", sessionId: f.session.id, descriptorSha256: f.session.descriptorSha256, nowEpochMs: f.now }); assert.equal(admitted.ok, true, admitted.code);
  const request = n => ({ invocationId: "invocation-" + n, requestedModel: "synthetic-gemini-" + n, requestedEffort: "high", role: f.subject.roles[0], scope: f.subject.scope, requiredPaths: ["src/x.mjs"], fallbackPolicy: "none", nowEpochMs: f.now });
  for (const n of [1, 2]) { const bound = await host.bind(admitted.handle, request(n)); assert.equal(bound.ok, true, bound.code); assert.equal(bound.projection.consentRecordSha256, admitted.consentRecordSha256); assert.equal(Object.hasOwn(bound.projection, "modelId"), false); assert.equal((await host.bind(structuredClone(admitted.handle), request(n))).ok, false); assert.equal((await host.bind(bound.projection, request(n))).ok, false); }
  for (const change of [{ requestedModel: "wrong" }, { requestedEffort: "medium" }, { role: "frontier" }, { requiredPaths: ["secrets/key"] }, { scope: {} }, { scope: { ...f.subject.scope, dispatchId: "other" } }, { fallbackPolicy: "automatic" }, { nowEpochMs: f.subject.expiresAtMs }]) assert.equal((await host.bind(admitted.handle, { ...request(1), ...change })).ok, false, JSON.stringify(change));
  for (const [key, value] of [["taskRoute", "duty.other"], ["familyId", "other"], ["authoritySha256", "f".repeat(64)], ["sessionId", "other-session"], ["adapterContractSha256", "f".repeat(64)]]) { const original = invocations.get("invocation-1"), changed = structuredClone(original); changed.invocation[key] = value; const { receiptSha256, ...body } = changed.invocation; changed.invocation.receiptSha256 = digest(body); invocations.set("invocation-1", changed); assert.equal((await host.bind(admitted.handle, request(1))).ok, false, key); invocations.set("invocation-1", original); }
  stored = { ...f.record, extra: true }; assert.equal((await host.bind(admitted.handle, request(1))).ok, false); stored = f.record; revoked = true; assert.equal((await host.bind(admitted.handle, request(1))).code, "AGY-CONSENT-REVOKED-OR-MISSING");
});

test("v2 native permissions bind only their verified implementation task and functional role", async () => {
  const nativeRoles = ["pipeline-core:goldfish-implementor", "pipeline-core:goldfish-mechanic"];
  for (const nativeRole of nativeRoles) {
    const f = signedFamilyConsentFixture({ nativeRole }), readback = sealedInvocation(f, "synthetic-gemini-1", 1, "native-invocation");
    const host = createAgyFamilyConsentAuthority({ readFamilyAuthority: () => f.familyAuthorityInputs, readInvocation: () => readback, readLive: () => ({ ok: true, session: f.session, descriptor: { repo: f.repository } }), readStored: () => ({ record: f.record }), readMode: () => ({ mode: "signature" }), readPolicy: () => f.policy });
    const admitted = await host.admit({ root: "/repo", sessionId: f.session.id, descriptorSha256: f.session.descriptorSha256, nowEpochMs: f.now });
    assert.equal(admitted.ok, true, admitted.code);
    const request = { invocationId: "native-invocation", requestedModel: "synthetic-gemini-1", requestedEffort: "high", role: nativeRole, scope: f.subject.scope, requiredPaths: ["src/x.mjs"], fallbackPolicy: "none", nowEpochMs: f.now };
    const bound = await host.bind(admitted.handle, request);
    assert.equal(bound.ok, true, bound.code); assert.equal(bound.projection.role, nativeRole);
    assert.equal(readback.invocation.taskRoute, nativeRole.endsWith("mechanic") ? "duty.mechanic" : "duty.implement");
    assert.equal(readback.invocation.role, nativeRole.endsWith("mechanic") ? "efficient" : "worker");
    for (const role of [...nativeRoles.filter(r => r !== nativeRole), "worker", "efficient", "frontier", "pipeline-core:critic", "pipeline-core:advisor", "__proto__"]) {
      assert.equal((await host.bind(admitted.handle, { ...request, role })).ok, false, role);
      const subject = { ...f.subject, roles: [role] };
      assert.equal(validateFamilyConsentSubject(subject, { repository: f.repository, session: f.session, familyAuthorityInputs: f.familyAuthorityInputs, nowEpochMs: f.now }).ok, false, role);
    }
    for (const change of [{ taskRoute: "duty.test_author" }, { taskRoute: "duty.advisory" }, { role: "frontier" }, { taskRoute: nativeRole.endsWith("mechanic") ? "duty.implement" : "duty.mechanic", role: nativeRole.endsWith("mechanic") ? "worker" : "efficient" }]) {
      const original = structuredClone(readback.invocation); Object.assign(readback.invocation, change);
      const { receiptSha256, ...body } = readback.invocation; readback.invocation.receiptSha256 = digest(body);
      assert.equal((await host.bind(admitted.handle, request)).ok, false, JSON.stringify(change));
      readback.invocation = original;
    }
  }
});

test("v2 exact schemas, assignment floor digest and duplicated fields reject tamper", () => {
  const f = signedFamilyConsentFixture(), options = { repository: f.repository, session: f.session, nowEpochMs: f.now, configuredMode: "signature", policy: f.policy, familyAuthorityInputs: f.familyAuthorityInputs };
  assert.equal(validateConsentRecord(f.record, options).ok, true);
  for (const key of ["session", "runner", "provider", "familyAuthoritySha256", "assignments", "roles", "allowedPaths", "expiresAtMs", "decisionId", "subjectSha256", "approvedAtMs", "attribution"]) { const changed = structuredClone(f.record); changed[key] = key === "approvedAtMs" ? f.subject.expiresAtMs : key === "attribution" ? { mode: "chat-attributed-unattested", decisionReference: "wrong-mode" } : null; assert.equal(validateConsentRecord(changed, options).ok, false, key); }
  for (const proof of [{ ...f.record.proof, extra: true }, { ...f.record.proof, signatureBase64: Buffer.alloc(64).toString("base64") }, null]) assert.equal(validateConsentRecord({ ...f.record, proof }, options).ok, false);
  assert.equal(validateConsentRecord({ ...f.record, intent: { ...f.record.intent, extra: true } }, options).ok, false);
  for (const mutate of [s => { s.modelId = "forbidden"; }, s => { s.assignments[0].assignmentSha256 = "f".repeat(64); }, s => { s.assignments[0].familyId = "wrong"; }, s => { s.assignments[0].taskRoute = "duty.other"; }, s => { s.assignments[0].effort = "medium"; }, s => { s.roles.push("frontier"); }, s => { s.allowedPaths = ["../escape"]; }, s => { s.repository.commonDir = "/other/.git"; }, s => { s.session.id = "other"; }]) { const changed = structuredClone(f.subject); mutate(changed); assert.equal(validateFamilyConsentSubject(changed, options).ok, false); }
  assert.equal(validateFamilyConsentSubject(f.subject, { ...options, familyAuthorityInputs: { admitted: true, ...f.familyAuthorityInputs, bundle: { ...f.familyAuthorityInputs.bundle, proof: null } } }).ok, false);
  assert.equal(validateConsentRecord({ ...f.record, extra: true }, options).ok, false);
  const wrongIntent = buildSignatureIntent({ ...f.record.intent.value, subjectSha256: f.record.subjectSha256, policyRevision: "agy-session-v1" });
  assert.equal(validateConsentRecord({ ...f.record, intent: wrongIntent, proof: f.proofFor(wrongIntent) }, options).ok, false);
  const chat = { ...f.record, mode: "chat", intent: null, proof: null, attribution: { mode: "chat-attributed-unattested", decisionReference: "synthetic-turn" } };
  assert.equal(validateConsentRecord(chat, { ...options, configuredMode: "chat" }).ok, true);
  assert.equal(validateConsentRecord({ ...chat, proof: f.record.proof }, { ...options, configuredMode: "chat" }).ok, false);
});

const session = { id: "session-1", descriptorSha256: "a".repeat(64) };
const expiry = Date.now() + 10000;
const subject = consentSubject({ repository: { primaryRoot: "/repo", commonDir: "/repo/.git" }, session, model: "gemini-3.8-flash-high", roles: ["pipeline-core:goldfish-implementor"], allowedPaths: ["src/x.mjs"], scope: "implementation", fallbackPolicy: "none", expiresAtMs: expiry, decisionNonce: "decision-1-nonce" });
const intent = buildSignatureIntent({ featureId: "alfred", planSha256: "b".repeat(64), specSha256: "c".repeat(64), candidate: { commit: "d".repeat(40), tree: "e".repeat(40) }, subjectSha256: digest(subject) });

test("chat consent is explicitly attributed and binds the immutable subject", () => {
  const record = { schema: "pipeline.agy-session-consent.v1", status: "approved", decisionId: "decision-1-nonce", mode: "chat", session, provider: "google", model: "gemini-3.8-flash-high", roles: subject.roles, allowedPaths: subject.allowedPaths, subject, subjectSha256: digest(subject), expiresAtMs: expiry, attribution: { mode: "chat-attributed-unattested", decisionReference: "chat-turn-1" } };
  assert.equal(validateConsentRecord(record, { session, repository: subject.repository }).ok, true);
  assert.equal(validateConsentRecord({ ...record, subjectSha256: "f".repeat(64) }, { session, repository: subject.repository }).code, "AGY-CONSENT-SUBJECT-MISMATCH");
});

test("signature consent verifies exact intent and rejects replay/tamper", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeyText = publicKey.export({ type: "spki", format: "pem" });
  const publicKeySha256 = createHash("sha256").update(publicKeyText).digest("hex");
  const proof = { schema: PO_APPROVAL_PROOF_SCHEMA, intentSha256: intent.sha256, keyReference: "test-key", publicKey: publicKeyText, signatureBase64: sign(null, Buffer.from(intent.sha256), privateKey).toString("base64") };
  const record = { schema: "pipeline.agy-session-consent.v1", status: "approved", decisionId: "decision-1-nonce", mode: "signature", session, provider: "google", model: "gemini-3.8-flash-high", roles: subject.roles, allowedPaths: subject.allowedPaths, subject, subjectSha256: digest(subject), intent, proof, expiresAtMs: expiry };
  const policy = { ok: true, trustAnchors: [{ keyReference: "test-key", publicKeySha256 }], trustAnchor: null };
  assert.equal(validateConsentRecord(record, { session, repository: subject.repository, root: process.cwd(), policy }).ok, true);
  assert.equal(validateConsentRecord({ ...record, proof: { ...proof, intentSha256: "f".repeat(64) } }, { session, repository: subject.repository, root: process.cwd(), policy }).ok, false);
});

test("dispatch binding refuses widening and expiry changes", () => {
  const record = { model: subject.model, provider: "google", expiresAtMs: expiry, subject };
  const base = { requestedModel: subject.model, role: subject.roles[0], scope: "implementation", requiredPaths: ["src/x.mjs"], nowEpochMs: 2 };
  assert.equal(validateDispatchBinding(record, base).ok, true);
  assert.equal(validateDispatchBinding(record, { ...base, requestedModel: "gemini-other" }).code, "AGY-CONSENT-MODEL-MISMATCH");
  assert.equal(validateDispatchBinding(record, { ...base, role: "pipeline-core:goldfish-reviewer" }).code, "AGY-CONSENT-ROLE-MISMATCH");
  assert.equal(validateDispatchBinding(record, { ...base, requiredPaths: ["secrets/key"] }).code, "AGY-CONSENT-PATH-MISMATCH");
  assert.equal(validateDispatchBinding(record, { ...base, scope: "broader" }).code, "AGY-CONSENT-SCOPE-MISMATCH");
  assert.equal(validateDispatchBinding(record, { ...base, nowEpochMs: expiry }).code, "AGY-CONSENT-EXPIRED");
  assert.equal(validateDispatchBinding({ ...record, expiresAtMs: expiry + 1 }, base).code, "AGY-CONSENT-EXPIRED");
});
