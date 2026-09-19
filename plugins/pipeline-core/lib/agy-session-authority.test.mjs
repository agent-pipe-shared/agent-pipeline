// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";
import { buildSignatureIntent, consentSubject, digest, validateConsentRecord } from "./agy-session-authority.mjs";
import { canonical, PO_APPROVAL_PROOF_SCHEMA } from "./po-approval-proof.mjs";

const session = { id: "session-1", descriptorSha256: "a".repeat(64) };
const subject = consentSubject({ repository: "repo-fingerprint", session, model: "gemini-3.8-flash-high", roles: ["pipeline-core:goldfish-implementor"], allowedPaths: ["src/x.mjs"], scope: "implementation", fallbackPolicy: "none" });
const intent = buildSignatureIntent({ featureId: "alfred", planSha256: "b".repeat(64), specSha256: "c".repeat(64), candidate: { commit: "d".repeat(40), tree: "e".repeat(40) }, subjectSha256: digest(subject) });

test("chat consent is explicitly attributed and binds the immutable subject", () => {
  const record = { schema: "pipeline.agy-session-consent.v1", status: "approved", decisionId: "decision-1", mode: "chat", session, provider: "google", model: "gemini-3.8-flash-high", roles: subject.roles, allowedPaths: subject.allowedPaths, subject, subjectSha256: digest(subject), expiresAtMs: Date.now() + 10000, attribution: { mode: "chat-attributed-unattested", decisionReference: "chat-turn-1" } };
  assert.equal(validateConsentRecord(record, { session }).ok, true);
  assert.equal(validateConsentRecord({ ...record, subjectSha256: "f".repeat(64) }, { session }).code, "AGY-CONSENT-SUBJECT-MISMATCH");
});

test("signature consent verifies exact intent and rejects replay/tamper", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeyText = publicKey.export({ type: "spki", format: "pem" });
  const publicKeySha256 = createHash("sha256").update(publicKeyText).digest("hex");
  const proof = { schema: PO_APPROVAL_PROOF_SCHEMA, intentSha256: intent.sha256, keyReference: "test-key", publicKey: publicKeyText, signatureBase64: sign(null, Buffer.from(intent.sha256), privateKey).toString("base64") };
  const record = { schema: "pipeline.agy-session-consent.v1", status: "approved", decisionId: "decision-2", mode: "signature", session, provider: "google", model: "gemini-3.8-flash-high", roles: subject.roles, allowedPaths: subject.allowedPaths, subject, subjectSha256: digest(subject), intent, proof, expiresAtMs: Date.now() + 10000 };
  const policy = { ok: true, trustAnchors: [{ keyReference: "test-key", publicKeySha256 }], trustAnchor: null };
  assert.equal(validateConsentRecord(record, { session, policy }).ok, true);
  assert.equal(validateConsentRecord({ ...record, proof: { ...proof, intentSha256: "f".repeat(64) } }, { session, policy }).ok, false);
});
