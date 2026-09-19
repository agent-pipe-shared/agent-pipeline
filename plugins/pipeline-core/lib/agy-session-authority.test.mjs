// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";
import { buildSignatureIntent, consentSubject, digest, validateConsentRecord, validateDispatchBinding } from "./agy-session-authority.mjs";
import { canonical, PO_APPROVAL_PROOF_SCHEMA } from "./po-approval-proof.mjs";

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
