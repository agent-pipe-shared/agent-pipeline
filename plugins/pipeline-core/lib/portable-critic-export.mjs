// SPDX-License-Identifier: SUL-1.0
/** Redacted, PO-signed bridge from a consumed private Critic packet to a clone. */
import { createHash } from "node:crypto";
import { readBoundConsumedCriticReceipt } from "./critic-verify-lifecycle.mjs";
import { verifyAgainstTrustAnchors } from "./critical-human-proof-policy.mjs";
import { canonical, createPoApprovalIntent } from "./po-approval-proof.mjs";

export const PORTABLE_CRITIC_EXPORT_SCHEMA = "pipeline.portable-critic-export.v1";
export const PORTABLE_CRITIC_EXPORT_SUBJECT_SCHEMA = "pipeline.portable-critic-export-subject.v1";
export const PORTABLE_CRITIC_EXPORT_REQUEST_SCHEMA = "pipeline.portable-critic-export-request.v1";
export const PORTABLE_CRITIC_EXPORT_PATH = "specs/sprint-alfred-epic/evidence/capability-critic-export.v1.json";
const PURPOSE = "product-capability-final";
const FEATURE = "sprint-alfred-epic";
const INVENTORY_PATH = "docs/product-capability-inventory.json";
const SHA = /^[a-f0-9]{64}$/u;
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const PACKET = /^[a-f0-9]{32}$/u;
const own = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const digest = (value) => createHash("sha256").update(canonical(value)).digest("hex");
const fail = (code) => ({ ok: false, code });

function validCandidate(value) {
  return own(value, ["commit", "tree"]) && OID.test(value.commit ?? "")
    && OID.test(value.tree ?? "") && value.commit !== value.tree;
}

function validSubject(subject) {
  if (!own(subject, ["schema", "purpose", "inventoryPath", "candidate", "producer"])
    || subject.schema !== PORTABLE_CRITIC_EXPORT_SUBJECT_SCHEMA
    || subject.purpose !== PURPOSE || subject.inventoryPath !== INVENTORY_PATH
    || !validCandidate(subject.candidate)) return false;
  const producer = subject.producer;
  return own(producer, ["kind", "packetId", "packetDigest", "receiptSha256", "verdictSha256", "reviewRange", "reviewPass"])
    && producer.kind === "consumed-session-critic" && producer.reviewPass === true
    && PACKET.test(producer.packetId ?? "")
    && [producer.packetDigest, producer.receiptSha256, producer.verdictSha256].every((value) => SHA.test(value ?? ""))
    && own(producer.reviewRange, ["base", "commit", "diffSha256"])
    && OID.test(producer.reviewRange.base ?? "")
    && producer.reviewRange.commit === subject.candidate.commit
    && SHA.test(producer.reviewRange.diffSha256 ?? "");
}

/** Only this production preparation path may derive a positive subject. */
export function preparePortableCriticExport({ gitCommonDir, criticPacketId, candidate,
  planSha256, specSha256 } = {}) {
  if (!validCandidate(candidate) || !PACKET.test(criticPacketId ?? "")
    || !SHA.test(planSha256 ?? "") || !SHA.test(specSha256 ?? "")) {
    throw new TypeError("portable Critic export input is invalid");
  }
  // This reader verifies consumed state, packet digest, fresh Critic receipt,
  // review range and reviewPass. A caller-authored receipt is insufficient.
  const bound = readBoundConsumedCriticReceipt({ gitCommonDir, criticPacketId, candidate });
  const subject = {
    schema: PORTABLE_CRITIC_EXPORT_SUBJECT_SCHEMA,
    purpose: PURPOSE,
    inventoryPath: INVENTORY_PATH,
    candidate: { ...candidate },
    producer: {
      kind: "consumed-session-critic",
      packetId: criticPacketId,
      packetDigest: bound.critic.packetDigest,
      receiptSha256: bound.criticReceiptSha256,
      verdictSha256: bound.critic.verdictSha256,
      reviewRange: { ...bound.critic.reviewRange },
      reviewPass: true,
    },
  };
  if (!validSubject(subject)) throw new TypeError("consumed Critic export has an invalid public binding");
  return {
    subject,
    approvalIntent: createPoApprovalIntent({ kind: "critic-export", featureId: FEATURE,
      planSha256, specSha256, candidate, policyRevision: "v1",
      subjectSha256: digest(subject), decision: "approve" }),
  };
}

export function portableCriticExportRequest(prepared) {
  if (!own(prepared, ["subject", "approvalIntent"]) || !validSubject(prepared.subject)) {
    throw new TypeError("portable Critic preparation is invalid");
  }
  const { subject, approvalIntent } = prepared;
  if (!own(approvalIntent, ["value", "sha256"]) || !SHA.test(approvalIntent.sha256 ?? "")) {
    throw new TypeError("portable Critic approval intent is invalid");
  }
  const request = { schema: PORTABLE_CRITIC_EXPORT_REQUEST_SCHEMA,
    intentSha256: approvalIntent.sha256, exportPath: PORTABLE_CRITIC_EXPORT_PATH,
    subject, approvalIntent };
  if (!validatePortableCriticExportRequest(request, {
    planSha256: approvalIntent.value?.planSha256,
    specSha256: approvalIntent.value?.specSha256,
  })) throw new TypeError("portable Critic approval intent is not bound to its subject");
  return request;
}

export function validatePortableCriticExportRequest(request, { planSha256, specSha256 } = {}) {
  if (!own(request, ["schema", "intentSha256", "exportPath", "subject", "approvalIntent"])
    || request.schema !== PORTABLE_CRITIC_EXPORT_REQUEST_SCHEMA
    || request.exportPath !== PORTABLE_CRITIC_EXPORT_PATH
    || !validSubject(request.subject)
    || !SHA.test(planSha256 ?? "") || !SHA.test(specSha256 ?? "")) return false;
  let expected;
  try {
    expected = createPoApprovalIntent({ kind: "critic-export", featureId: FEATURE,
      planSha256, specSha256, candidate: request.subject.candidate,
      policyRevision: "v1", subjectSha256: digest(request.subject), decision: "approve" });
  } catch { return false; }
  return request.intentSha256 === expected.sha256
    && canonical(request.approvalIntent) === canonical(expected);
}

/** Clone-side check: the signature attests a producer-derived subject, not provider identity. */
export function verifyPortableCriticExport({ exportRecord, candidate, receiptSha256,
  planSha256, specSha256, trustAnchors } = {}) {
  if (!own(exportRecord, ["schema", "subject", "approvalIntent", "proof"])
    || exportRecord.schema !== PORTABLE_CRITIC_EXPORT_SCHEMA
    || !validSubject(exportRecord.subject) || !validCandidate(candidate)
    || exportRecord.subject.candidate.commit !== candidate.commit
    || exportRecord.subject.candidate.tree !== candidate.tree
    || exportRecord.subject.producer.receiptSha256 !== receiptSha256
    || !SHA.test(planSha256 ?? "") || !SHA.test(specSha256 ?? "")) return fail("portable-critic-export-shape-or-binding");
  if (!Array.isArray(trustAnchors) || trustAnchors.length === 0) return fail("portable-critic-export-trust-anchor-missing");
  let expected;
  try {
    expected = createPoApprovalIntent({ kind: "critic-export", featureId: FEATURE,
      planSha256, specSha256, candidate, policyRevision: "v1",
      subjectSha256: digest(exportRecord.subject), decision: "approve" });
  } catch { return fail("portable-critic-export-intent-invalid"); }
  if (!own(exportRecord.approvalIntent, ["value", "sha256"])
    || canonical(exportRecord.approvalIntent) !== canonical(expected)) return fail("portable-critic-export-intent-mismatch");
  const checked = verifyAgainstTrustAnchors({ intent: expected, anchors: trustAnchors,
    proof: exportRecord.proof });
  return checked.verified ? { ok: true, code: "portable-critic-export-signature-verified",
    signer: checked.signer } : fail(checked.code);
}
