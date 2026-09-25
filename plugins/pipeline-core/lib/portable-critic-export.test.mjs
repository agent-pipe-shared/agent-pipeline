// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { test } from "node:test";
import { canonical, createPoApprovalIntent, PO_APPROVAL_PROOF_SCHEMA } from "./po-approval-proof.mjs";
import { PORTABLE_CRITIC_EXPORT_SCHEMA, PORTABLE_CRITIC_EXPORT_SUBJECT_SCHEMA,
  PORTABLE_CRITIC_EXPORT_REQUEST_SCHEMA, portableCriticExportRequest,
  preparePortableCriticExport, validatePortableCriticExportRequest,
  verifyPortableCriticExport } from "./portable-critic-export.mjs";

const sha = (value) => createHash("sha256").update(value).digest("hex");
const candidate = { commit: "b".repeat(40), tree: "c".repeat(40) };
const planSha256 = "d".repeat(64);
const specSha256 = "e".repeat(64);
const receiptSha256 = "f".repeat(64);

function fixture() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeyText = publicKey.export({ type: "spki", format: "pem" }).toString();
  const trustAnchors = [{ keyReference: "fixture-po", publicKeySha256: sha(publicKeyText) }];
  const subject = {
    schema: PORTABLE_CRITIC_EXPORT_SUBJECT_SCHEMA,
    purpose: "product-capability-final",
    inventoryPath: "docs/product-capability-inventory.json",
    candidate,
    producer: { kind: "consumed-session-critic", packetId: "a".repeat(32),
      packetDigest: "1".repeat(64), receiptSha256, verdictSha256: "2".repeat(64),
      reviewRange: { base: "3".repeat(40), commit: candidate.commit, diffSha256: "4".repeat(64) },
      reviewPass: true },
  };
  const approvalIntent = createPoApprovalIntent({ kind: "critic-export", featureId: "sprint-alfred-epic",
    planSha256, specSha256, candidate, policyRevision: "v1",
    subjectSha256: sha(canonical(subject)), decision: "approve" });
  const proof = { schema: PO_APPROVAL_PROOF_SCHEMA, intentSha256: approvalIntent.sha256,
    keyReference: "fixture-po", publicKey: publicKeyText,
    signatureBase64: sign(null, Buffer.from(approvalIntent.sha256, "utf8"), privateKey).toString("base64") };
  return { exportRecord: { schema: PORTABLE_CRITIC_EXPORT_SCHEMA, subject, approvalIntent, proof },
    candidate, receiptSha256, planSha256, specSha256, trustAnchors };
}

test("PCE01 an anchored detached signature binds redacted producer digests to one reviewed candidate", () => {
  const input = fixture();
  const result = verifyPortableCriticExport(input);
  assert.equal(result.ok, true);
  assert.equal(result.signer.keyReference, "fixture-po");
  assert.equal(JSON.stringify(input.exportRecord).includes("private-path"), false);
});

test("PCE02 changed candidate, receipt, purpose, producer or signed intent cannot reuse a proof", () => {
  const input = fixture();
  const altered = [
    { ...input, candidate: { ...candidate, commit: "6".repeat(40) } },
    { ...input, receiptSha256: "7".repeat(64) },
    { ...input, exportRecord: { ...input.exportRecord,
      subject: { ...input.exportRecord.subject, purpose: "unrelated" } } },
    { ...input, exportRecord: { ...input.exportRecord,
      subject: { ...input.exportRecord.subject, producer: { ...input.exportRecord.subject.producer,
        verdictSha256: "8".repeat(64) } } } },
    { ...input, exportRecord: { ...input.exportRecord,
      approvalIntent: { ...input.exportRecord.approvalIntent, sha256: "9".repeat(64) } } },
  ];
  for (const value of altered) assert.equal(verifyPortableCriticExport(value).ok, false);
});

test("PCE03 no committed anchor, wrong anchor and forged signature fail closed", () => {
  const input = fixture();
  assert.equal(verifyPortableCriticExport({ ...input, trustAnchors: [] }).code,
    "portable-critic-export-trust-anchor-missing");
  assert.equal(verifyPortableCriticExport({ ...input, trustAnchors: [{ keyReference: "other",
    publicKeySha256: input.trustAnchors[0].publicKeySha256 }] }).ok, false);
  const forged = structuredClone(input);
  forged.exportRecord.proof.signatureBase64 = Buffer.alloc(64).toString("base64");
  assert.equal(verifyPortableCriticExport(forged).ok, false);
});

test("PCE04 the producer refuses to invent a consumed private packet", () => {
  assert.throws(() => preparePortableCriticExport({ gitCommonDir: "/nonexistent-critic-export-fixture",
    criticPacketId: "a".repeat(32), candidate, planSha256, specSha256 }));
});

test("PCE05 a signing request binds the exact redacted subject and plan/spec bytes", () => {
  const { exportRecord } = fixture();
  const request = portableCriticExportRequest({ subject: exportRecord.subject,
    approvalIntent: exportRecord.approvalIntent });
  assert.equal(request.schema, PORTABLE_CRITIC_EXPORT_REQUEST_SCHEMA);
  assert.equal(request.intentSha256, exportRecord.approvalIntent.sha256);
  assert.equal(validatePortableCriticExportRequest(request, { planSha256, specSha256 }), true);
  for (const changed of [
    { ...request, intentSha256: "0".repeat(64) },
    { ...request, exportPath: "scratch/other.json" },
    { ...request, subject: { ...request.subject, producer: { ...request.subject.producer,
      verdictSha256: "0".repeat(64) } } },
  ]) assert.equal(validatePortableCriticExportRequest(changed, { planSha256, specSha256 }), false);
  assert.equal(validatePortableCriticExportRequest(request,
    { planSha256: "0".repeat(64), specSha256 }), false);
  assert.throws(() => portableCriticExportRequest({ subject: exportRecord.subject,
    approvalIntent: { ...exportRecord.approvalIntent, sha256: "0".repeat(64) } }));
});
