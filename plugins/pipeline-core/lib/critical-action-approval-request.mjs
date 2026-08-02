// SPDX-License-Identifier: SUL-1.0
/**
 * Detached proof transport for the small set of actions that can create an
 * external effect.  It deliberately complements, rather than changes, the
 * existing threat-model request transport.
 */
import { createHash } from "node:crypto";

import { createPoApprovalIntent, verifyPoApprovalProof } from "./po-approval-proof.mjs";

export const CRITICAL_ACTION_APPROVAL_REQUEST_SCHEMA = "pipeline.critical-action-approval-request.v1";
export const CRITICAL_ACTION_KINDS = Object.freeze(["push", "deploy", "publication"]);

const SHA = /^[a-f0-9]{64}$/u;
const OID = /^[a-f0-9]{40,64}$/u;
const ID = /^[a-z][a-z0-9-]{0,63}$/u;
const own = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const canonical = (value) => Array.isArray(value) ? `[${value.map(canonical).join(",")}]`
  : value !== null && typeof value === "object" ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`
    : JSON.stringify(value);
const digest = (value) => createHash("sha256").update(canonical(value)).digest("hex");
const candidate = (value) => own(value, ["commit", "tree"])
  && OID.test(value.commit) && OID.test(value.tree) && value.commit !== value.tree;
const iso = (value) => typeof value === "string" && Number.isFinite(Date.parse(value))
  && new Date(value).toISOString() === value;

/** Creates the digest of the exact writer-owned external-effect subject. */
export function criticalActionSubjectSha256({ kind, candidate: subjectCandidate, subject } = {}) {
  if (!CRITICAL_ACTION_KINDS.includes(kind) || !candidate(subjectCandidate)
    || subject === null || typeof subject !== "object" || Array.isArray(subject)) {
    throw new TypeError("critical action subject is invalid");
  }
  return digest({ schema: "pipeline.critical-action-subject.v1", kind, candidate: subjectCandidate, subject });
}

function actionValid(value) {
  return own(value, ["kind", "subjectSha256", "expiresAt"])
    && CRITICAL_ACTION_KINDS.includes(value.kind) && SHA.test(value.subjectSha256 ?? "")
    && iso(value.expiresAt);
}

/** The agent may prepare this public request, but cannot authorize it. */
export function createCriticalActionApprovalRequest({ candidate: deliveryCandidate, featureId, planBytes, specBytes, action } = {}) {
  if (!candidate(deliveryCandidate) || !ID.test(featureId ?? "") || !Buffer.isBuffer(planBytes)
    || !Buffer.isBuffer(specBytes) || !actionValid(action)) {
    throw new TypeError("critical action approval request is invalid");
  }
  const approvalIntent = createPoApprovalIntent({
    kind: "critical-action",
    featureId,
    planSha256: createHash("sha256").update(planBytes).digest("hex"),
    specSha256: createHash("sha256").update(specBytes).digest("hex"),
    candidate: deliveryCandidate,
    policyRevision: "critical-human-proof-v1",
    subjectSha256: digest(action),
    decision: "approved",
  });
  return {
    schema: CRITICAL_ACTION_APPROVAL_REQUEST_SCHEMA,
    candidate: structuredClone(deliveryCandidate),
    action: structuredClone(action),
    approvalIntent,
  };
}

/** Rebuilds the exact public intent and rejects stale/cross-kind external proof. */
export function verifyCriticalActionApprovalRequest({ request, trustPolicy, proof, expectedCandidate, expectedAction, now = new Date().toISOString() } = {}) {
  if (!own(request, ["schema", "candidate", "action", "approvalIntent"])
    || request.schema !== CRITICAL_ACTION_APPROVAL_REQUEST_SCHEMA || !candidate(request.candidate)
    || !actionValid(request.action) || !request.approvalIntent
    || !own(request.approvalIntent, ["value", "sha256"]) || !SHA.test(request.approvalIntent.sha256 ?? "")
    || !candidate(expectedCandidate) || !actionValid(expectedAction) || !iso(now)) {
    return { verified: false, code: "CRITICAL-ACTION-REQUEST-INVALID" };
  }
  if (request.candidate.commit !== expectedCandidate.commit || request.candidate.tree !== expectedCandidate.tree
    || canonical(request.action) !== canonical(expectedAction)) {
    return { verified: false, code: "CRITICAL-ACTION-REQUEST-MISMATCH" };
  }
  if (Date.parse(request.action.expiresAt) < Date.parse(now)) {
    return { verified: false, code: "CRITICAL-ACTION-PROOF-EXPIRED" };
  }
  let rebuilt;
  try {
    rebuilt = createPoApprovalIntent({
      kind: "critical-action",
      featureId: request.approvalIntent.value?.featureId,
      planSha256: request.approvalIntent.value?.planSha256,
      specSha256: request.approvalIntent.value?.specSha256,
      candidate: request.candidate,
      policyRevision: "critical-human-proof-v1",
      subjectSha256: digest(request.action),
      decision: "approved",
    });
  } catch { return { verified: false, code: "CRITICAL-ACTION-REQUEST-INVALID" }; }
  if (rebuilt.sha256 !== request.approvalIntent.sha256) return { verified: false, code: "CRITICAL-ACTION-REQUEST-MISMATCH" };
  const verified = verifyPoApprovalProof({ intent: rebuilt, trustPolicy, proof });
  return verified.verified
    ? { verified: true, code: "CRITICAL-ACTION-PROOF-VERIFIED", proofSha256: verified.proofSha256, action: structuredClone(request.action) }
    : { verified: false, code: "CRITICAL-ACTION-EXTERNAL-AUTHORITY-REQUIRED", cause: verified.code };
}
