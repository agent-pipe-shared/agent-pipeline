// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { createPoApprovalIntent, PO_APPROVAL_PROOF_SCHEMA, verifyPoApprovalProof } from "./po-approval-proof.mjs";
const intent = createPoApprovalIntent({ kind: "threat-model", featureId: "cyb-4", planSha256: "a".repeat(64), specSha256: "b".repeat(64), candidate: { commit: "c".repeat(40), tree: "d".repeat(40) }, policyRevision: "policy-v1", subjectSha256: "e".repeat(64), decision: "approved" });
const pair = generateKeyPairSync("ed25519"); const publicKey = pair.publicKey.export({ type: "spki", format: "pem" }); const trustPolicy = { keyReference: "local-device-key", publicKeySha256: createHash("sha256").update(publicKey).digest("hex") }; const proof = { schema: PO_APPROVAL_PROOF_SCHEMA, intentSha256: intent.sha256, keyReference: trustPolicy.keyReference, publicKey, signatureBase64: sign(null, Buffer.from(intent.sha256), pair.privateKey).toString("base64") };
assert.equal(verifyPoApprovalProof({ intent, trustPolicy, proof }).verified, true); assert.equal(verifyPoApprovalProof({ intent: { ...intent, sha256: "0".repeat(64) }, trustPolicy, proof }).verified, false); assert.equal(verifyPoApprovalProof({ intent, trustPolicy: { ...trustPolicy, keyReference: "other" }, proof }).verified, false); assert.equal(verifyPoApprovalProof({ intent, trustPolicy, proof: { ...proof, signatureBase64: sign(null, Buffer.from("wrong"), pair.privateKey).toString("base64") } }).verified, false);
const override = createPoApprovalIntent({ kind: "manual-override", featureId: "nova-7", planSha256: "f".repeat(64), specSha256: "a".repeat(64), candidate: { commit: "b".repeat(40), tree: "c".repeat(40) }, policyRevision: "policy-v2", subjectSha256: "d".repeat(64), decision: "allow-once" });
assert.equal(override.value.kind, "manual-override");
// NVA-SIGDISCLOSE-1 Finding 2: PO-APPROVAL-TRUST-MISMATCH must name the two digests it
// just compared -- both already computed at that point -- never just the bare code.
const wrongTrustPolicy = { ...trustPolicy, publicKeySha256: "0".repeat(64) };
const mismatch = verifyPoApprovalProof({ intent, trustPolicy: wrongTrustPolicy, proof });
assert.equal(mismatch.verified, false); assert.equal(mismatch.code, "PO-APPROVAL-TRUST-MISMATCH");
assert.equal(mismatch.observedPublicKeySha256, createHash("sha256").update(publicKey).digest("hex"), "the observed digest must be the one actually computed from proof.publicKey");
assert.equal(mismatch.expectedPublicKeySha256, "0".repeat(64), "the expected digest must be the trust policy's own publicKeySha256");
assert.notEqual(mismatch.observedPublicKeySha256, mismatch.expectedPublicKeySha256, "the two disclosed digests must be distinct in the mismatch case");
assert.ok(!("publicKey" in mismatch) && !JSON.stringify(mismatch).includes(publicKey), "raw key material must never be echoed back, only its sha256 digest");

// SETUP-1: trust-policy.json shape disagreement fix (backlog
// 2026-08-17-trust-policy-shape-disagreement-...). `setup --human-name`
// writes a 3-key named shape {keyReference, publicKeySha256, humanName};
// verifyPoApprovalProof must accept it, exactly as it accepts the 2-key
// legacy shape, without loosening the precision of the `own()` check.
const namedTrustPolicy = { ...trustPolicy, humanName: "Nova the PO" };
const namedProofResult = verifyPoApprovalProof({ intent, trustPolicy: namedTrustPolicy, proof });
assert.equal(namedProofResult.verified, true);
assert.equal(namedProofResult.code, "PO-APPROVAL-PROOF-VERIFIED");

// Regression: the pre-existing 2-key legacy shape (no humanName) still verifies.
assert.equal(verifyPoApprovalProof({ intent, trustPolicy, proof }).verified, true);

// A required field missing must still fail closed, humanName present or not.
const missingKeyReference = { publicKeySha256: trustPolicy.publicKeySha256, humanName: "Nova the PO" };
const missingKeyReferenceResult = verifyPoApprovalProof({ intent, trustPolicy: missingKeyReference, proof });
assert.equal(missingKeyReferenceResult.verified, false);
assert.equal(missingKeyReferenceResult.code, "PO-APPROVAL-PROOF-INVALID");
const missingPublicKeySha256 = { keyReference: trustPolicy.keyReference, humanName: "Nova the PO" };
const missingPublicKeySha256Result = verifyPoApprovalProof({ intent, trustPolicy: missingPublicKeySha256, proof });
assert.equal(missingPublicKeySha256Result.verified, false);
assert.equal(missingPublicKeySha256Result.code, "PO-APPROVAL-PROOF-INVALID");
const missingBothNoHumanName = { humanName: "Nova the PO" };
const missingBothNoHumanNameResult = verifyPoApprovalProof({ intent, trustPolicy: missingBothNoHumanName, proof });
assert.equal(missingBothNoHumanNameResult.verified, false);
assert.equal(missingBothNoHumanNameResult.code, "PO-APPROVAL-PROOF-INVALID");

// Precision bar: only `humanName` specifically becomes tolerated, not any
// extra key -- a different extra field must still fail closed.
const otherExtraKey = { ...trustPolicy, someOtherField: "x" };
const otherExtraKeyResult = verifyPoApprovalProof({ intent, trustPolicy: otherExtraKey, proof });
assert.equal(otherExtraKeyResult.verified, false);
assert.equal(otherExtraKeyResult.code, "PO-APPROVAL-PROOF-INVALID");

// proof's own `own()` check stays exactly as strict as before: an extra key
// on `proof` (mirroring the trustPolicy precision-bar case above) must still
// fail closed, proving this fix did not touch proof's check.
const proofWithExtraKey = { ...proof, someOtherField: "x" };
const proofWithExtraKeyResult = verifyPoApprovalProof({ intent, trustPolicy, proof: proofWithExtraKey });
assert.equal(proofWithExtraKeyResult.verified, false);
assert.equal(proofWithExtraKeyResult.code, "PO-APPROVAL-PROOF-INVALID");

console.log("24 PO approval proof checks passed");
