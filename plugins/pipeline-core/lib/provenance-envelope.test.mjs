// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { createArtifactIdentity, createProvenanceAttestationPayload, evaluatePinningPolicy, evaluateProvenanceAdmission, evaluateProvenanceAppend, validateProvenanceEnvelope } from "./provenance-envelope.mjs";

const hash = (letter) => letter.repeat(64);
const candidate = { commit: "a".repeat(40), tree: "b".repeat(40) };
const subject = { id: "plugin.tar", sha256: hash("c") };
const keyPair = generateKeyPairSync("ed25519");
const publicKey = keyPair.publicKey.export({ type: "spki", format: "pem" });
const unsignedEnvelope = { schema: "pipeline.provenance-envelope.v1", candidate, subject, materials: [{ id: "package-lock.json", kind: "dependency", sha256: hash("d") }], builder: { id: "local-builder", digest: hash("e") }, invocation: { id: "build", parametersSha256: hash("f") }, environment: { kind: "local-test", identitySha256: hash("0") }, assurance: "verified", attestation: { keyReference: "test-key-1", signatureSha256: hash("1"), status: "verified" }, reproducibility: "repeatable-in-same-builder" };
const payload = createProvenanceAttestationPayload(unsignedEnvelope);
const signatureBase64 = sign(null, Buffer.from(payload), keyPair.privateKey).toString("base64");
const envelope = { ...unsignedEnvelope, attestation: { ...unsignedEnvelope.attestation, signatureSha256: createHash("sha256").update(Buffer.from(signatureBase64, "base64")).digest("hex") } };
const expected = { candidate, subject, materials: envelope.materials, builderDigest: envelope.builder.digest, attestation: { keyReference: "test-key-1", publicKeySha256: createHash("sha256").update(publicKey).digest("hex") } };
const attestation = { keyReference: "test-key-1", payload, publicKey, signatureBase64 };

assert.equal(validateProvenanceEnvelope(envelope).valid, true);
assert.equal(validateProvenanceEnvelope({ ...envelope, privateKey: "never" }).valid, false);
assert.equal(createArtifactIdentity("bundle", "canonical bytes").id, createArtifactIdentity("bundle", "canonical bytes").id);
for (const boundary of ["produce", "promote", "readback"]) assert.deepEqual(evaluateProvenanceAdmission({ boundary, envelope, expected, attestation }), { allowed: true, code: "PROVENANCE-ADMISSION-ALLOWED" });
assert.equal(evaluateProvenanceAdmission({ boundary: "promote", envelope, expected: { ...expected, subject: { ...subject, sha256: hash("9") } }, attestation }).code, "PROVENANCE-SUBJECT-MISMATCH");
assert.equal(evaluateProvenanceAdmission({ boundary: "readback", envelope: { ...envelope, attestation: { ...envelope.attestation, status: "revoked" } }, expected, attestation }).allowed, false);
assert.equal(evaluateProvenanceAdmission({ boundary: "produce", envelope: { ...envelope, materials: [{ ...envelope.materials[0], sha256: hash("8") }] }, expected, attestation }).code, "PROVENANCE-MATERIAL-MISMATCH");
assert.equal(evaluateProvenanceAdmission({ boundary: "promote", envelope, expected }).code, "PROVENANCE-ADMISSION-INVALID");
assert.equal(evaluateProvenanceAdmission({ boundary: "promote", envelope, expected, attestation: { ...attestation, signatureBase64: sign(null, Buffer.from("forged payload"), keyPair.privateKey).toString("base64") } }).code, "PROVENANCE-ATTESTATION-UNVERIFIED");
const wrongPayload = "wrong but valid payload";
const wrongSignatureBase64 = sign(null, Buffer.from(wrongPayload), keyPair.privateKey).toString("base64");
const wrongPayloadEnvelope = { ...envelope, attestation: { ...envelope.attestation, signatureSha256: createHash("sha256").update(Buffer.from(wrongSignatureBase64, "base64")).digest("hex") } };
assert.equal(evaluateProvenanceAdmission({ boundary: "promote", envelope: wrongPayloadEnvelope, expected, attestation: { ...attestation, payload: wrongPayload, signatureBase64: wrongSignatureBase64 } }).code, "PROVENANCE-ATTESTATION-PAYLOAD-MISMATCH");
assert.equal(evaluateProvenanceAdmission({ boundary: "promote", envelope, expected: { ...expected, attestation: { ...expected.attestation, publicKeySha256: hash("9") } }, attestation }).code, "PROVENANCE-ATTESTATION-TRUST-MISMATCH");
assert.equal(evaluateProvenanceAdmission({ boundary: "promote", envelope, expected: { ...expected, subject: { ...subject, sha256: hash("9") } }, attestation }).code, "PROVENANCE-SUBJECT-MISMATCH");
assert.deepEqual(evaluatePinningPolicy([{ kind: "action", value: "owner/action@" + "a".repeat(40) }, { kind: "image", value: "registry/image@sha256:" + hash("b") }]), { ok: true });
assert.equal(evaluatePinningPolicy([{ kind: "action", value: "owner/action@main" }]).code, "PROVENANCE-UNPINNED");
assert.equal(evaluateProvenanceAppend({ existing: [envelope], next: envelope }).code, "PROVENANCE-HISTORICAL-IMMUTABLE");
assert.deepEqual(evaluateProvenanceAppend({ existing: [envelope], next: { ...envelope, subject: { id: "next.tar", sha256: hash("8") } } }), { allowed: true, code: "PROVENANCE-APPEND-ALLOWED" });
assert.equal(evaluateProvenanceAppend({ existing: [{ schema: "invalid" }], next: envelope }).code, "PROVENANCE-APPEND-INVALID");
console.log("provenance envelope checks passed");
