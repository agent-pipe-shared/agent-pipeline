// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { createAttestationRequest, evaluateCredentialHygiene, validateSigningRequest, verifyAttestation } from "./provenance-attestation.mjs";

const payload = "candidate-bound artifact digest";
const pair = generateKeyPairSync("ed25519");
const signature = sign(null, Buffer.from(payload), pair.privateKey).toString("base64");
const publicKey = pair.publicKey.export({ type: "spki", format: "pem" });
const checked = verifyAttestation({ keyReference: "test-key", payload, publicKey, signatureBase64: signature });
assert.equal(checked.status, "verified");
assert.equal(/^[a-f0-9]{64}$/u.test(checked.signatureSha256), true);
assert.equal(verifyAttestation({ keyReference: "test-key", payload: "tampered", publicKey, signatureBase64: signature }).code, "PROVENANCE-ATTESTATION-MISMATCH");
const request = createAttestationRequest(payload);
assert.equal(request.ok, true);
assert.equal(validateSigningRequest({ keyReference: "test-key", payloadSha256: request.payloadSha256 }).valid, true);
assert.equal(validateSigningRequest({ keyReference: "test-key", payloadSha256: "not-a-digest" }).valid, false);
assert.deepEqual(evaluateCredentialHygiene({ public: "safe", nested: ["no credential"] }), { ok: true });
assert.equal(evaluateCredentialHygiene({ log: "Bearer abcdefghijklmnopqrstuvwxyz" }).code, "PROVENANCE-CREDENTIAL-EXPOSURE");
assert.equal(evaluateCredentialHygiene({ key: "-----BEGIN PRIVATE KEY-----" }).ok, false);
console.log("9 provenance attestation checks passed");
