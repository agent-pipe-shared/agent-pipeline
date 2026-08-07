// SPDX-License-Identifier: SUL-1.0
/**
 * Public request/verification transport for an externally authorized,
 * candidate-bound threat-model decision. This module never accepts a private
 * key, password, passphrase, or signing command.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

import { createPoApprovalIntent, verifyPoApprovalProof } from "./po-approval-proof.mjs";
import { THREAT_APPROVAL_RECEIPT_SCHEMA, THREAT_MODEL_SCHEMA, threatModelDigest, validateThreatApprovalReceipt, validateThreatModel } from "./threat-model.mjs";

export const THREAT_MODEL_APPROVAL_REQUEST_SCHEMA = "pipeline.threat-model-approval-request.v1";

const own = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const SHA = /^[a-f0-9]{64}$/u;
const OID = /^[a-f0-9]{40,64}$/u;
const ID = /^[a-z][a-z0-9-]{0,63}$/u;
const candidate = (value) => own(value, ["commit", "tree"]) && OID.test(value.commit) && OID.test(value.tree) && value.commit !== value.tree;
const sha = (value) => createHash("sha256").update(value).digest("hex");

function inside(root, path) {
  const rel = relative(root, path);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

/** Reads a public regular file from the named repository without path escape. */
export function readPublicRepositoryFile(repoRoot, repositoryPath) {
  if (typeof repoRoot !== "string" || typeof repositoryPath !== "string" || repositoryPath.length === 0 || repositoryPath.includes("\0") || isAbsolute(repositoryPath)) throw new TypeError("repository path is invalid");
  const root = resolve(repoRoot); const path = resolve(root, repositoryPath);
  if (!inside(root, path)) throw new TypeError("repository path escapes root");
  return readFileSync(path);
}

/**
 * Creates only public data for a human-operated external signer. The reference
 * model is copied with the live delivery candidate; it is not rewritten in the
 * repository and cannot authorize anything until its resulting intent is
 * signed against a separately configured trust anchor.
 */
export function createThreatModelApprovalRequest({ candidate: deliveryCandidate, featureId, planBytes, specBytes, referenceModel, decision = "approved" } = {}) {
  if (!candidate(deliveryCandidate) || !ID.test(featureId ?? "") || !Buffer.isBuffer(planBytes) || !Buffer.isBuffer(specBytes) || !validateThreatModel(referenceModel).valid || !["approved", "accepted-risk", "not-applicable"].includes(decision)) throw new TypeError("threat-model approval request is invalid");
  const model = { ...structuredClone(referenceModel), candidate: structuredClone(deliveryCandidate) };
  if (!validateThreatModel(model).valid) throw new TypeError("candidate-bound threat model is invalid");
  const modelDigest = threatModelDigest(model).digest;
  const approvalReceipt = {
    schema: THREAT_APPROVAL_RECEIPT_SCHEMA,
    receiptId: `external-${featureId}-${deliveryCandidate.commit.slice(0, 12)}`,
    authority: "human",
    decision,
    candidate: structuredClone(deliveryCandidate),
    policyRevision: model.policyRevision,
    modelDigest,
  };
  if (!validateThreatApprovalReceipt(approvalReceipt).valid) throw new TypeError("pending threat approval receipt is invalid");
  const approvalIntent = createPoApprovalIntent({
    kind: "threat-model",
    featureId,
    planSha256: sha(planBytes),
    specSha256: sha(specBytes),
    candidate: deliveryCandidate,
    policyRevision: model.policyRevision,
    subjectSha256: modelDigest,
    decision,
  });
  return { schema: THREAT_MODEL_APPROVAL_REQUEST_SCHEMA, candidate: structuredClone(deliveryCandidate), model, approvalReceipt, approvalIntent };
}

/** Recomputes all public bindings before accepting a detached external proof. */
export function verifyThreatModelApprovalRequest({ request, trustPolicy, proof } = {}) {
  if (!own(request, ["schema", "candidate", "model", "approvalReceipt", "approvalIntent"]) || request.schema !== THREAT_MODEL_APPROVAL_REQUEST_SCHEMA || !candidate(request.candidate) || !validateThreatModel(request.model).valid || !validateThreatApprovalReceipt(request.approvalReceipt).valid || !request.approvalIntent || !own(request.approvalIntent, ["value", "sha256"]) || !SHA.test(request.approvalIntent.sha256)) return { verified: false, code: "THREAT-APPROVAL-REQUEST-INVALID" };
  const { model, approvalReceipt, approvalIntent } = request;
  if (model.candidate.commit !== request.candidate.commit || model.candidate.tree !== request.candidate.tree || approvalReceipt.candidate.commit !== request.candidate.commit || approvalReceipt.candidate.tree !== request.candidate.tree || approvalReceipt.policyRevision !== model.policyRevision || approvalReceipt.modelDigest !== threatModelDigest(model).digest) return { verified: false, code: "THREAT-APPROVAL-REQUEST-MISMATCH" };
  let rebuilt;
  try {
    rebuilt = createPoApprovalIntent({
      kind: "threat-model",
      featureId: approvalIntent.value?.featureId,
      planSha256: approvalIntent.value?.planSha256,
      specSha256: approvalIntent.value?.specSha256,
      candidate: request.candidate,
      policyRevision: model.policyRevision,
      subjectSha256: threatModelDigest(model).digest,
      decision: approvalReceipt.decision,
    });
  } catch { return { verified: false, code: "THREAT-APPROVAL-REQUEST-INVALID" }; }
  if (rebuilt.sha256 !== approvalIntent.sha256) return { verified: false, code: "THREAT-APPROVAL-REQUEST-MISMATCH" };
  const verified = verifyPoApprovalProof({ intent: rebuilt, trustPolicy, proof });
  return verified.verified ? { verified: true, code: "THREAT-APPROVAL-REQUEST-VERIFIED", request: structuredClone(request), proofSha256: verified.proofSha256 } : { verified: false, code: "THREAT-APPROVAL-EXTERNAL-AUTHORITY-REQUIRED", cause: verified.code };
}
