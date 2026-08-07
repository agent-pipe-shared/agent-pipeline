// SPDX-License-Identifier: SUL-1.0
/**
 * Cryptographic authority adapter for exceptional security decisions.
 *
 * A caller-supplied `"human"` or `"policy"` label is never authority.  The
 * host must load the trust policy from its configured external authority and
 * provide a detached, signed PO proof that binds the exact decision subject.
 */
import { createHash } from "node:crypto";
import { createPoApprovalIntent, verifyPoApprovalProof } from "./po-approval-proof.mjs";

export const SECURITY_AUTHORITY_SCHEMA = "pipeline.security-authority.v1";
const SHA256 = /^[a-f0-9]{64}$/u;
const OID = /^[a-f0-9]{40,64}$/u;
const ID = /^[a-z][a-z0-9-]{0,63}$/u;
const own = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const validDigest = (value) => typeof value === "string" && SHA256.test(value);
const validCandidate = (value) => own(value, ["commit", "tree"]) && OID.test(value.commit) && OID.test(value.tree) && value.commit !== value.tree;
const canonical = (value) => Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : value !== null && typeof value === "object" ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}` : JSON.stringify(value);

export function securityAuthorityScopeSha256(value) {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

export function securityAuthoritySubjectSha256({ featureId, action, candidateSha256, policySha256, scopeSha256 } = {}) {
  if (![featureId, action].every((value) => ID.test(value ?? "")) || ![candidateSha256, policySha256, scopeSha256].every(validDigest)) return null;
  return createHash("sha256").update(canonical({ schema: SECURITY_AUTHORITY_SCHEMA, featureId, action, candidateSha256, policySha256, scopeSha256 })).digest("hex");
}

/** Creates the unsigned intent which an external human/policy authority signs. */
export function createSecurityAuthorityIntent({ featureId, action, candidate, candidateSha256, policySha256, scopeSha256, planSha256, specSha256, policyRevision } = {}) {
  const subjectSha256 = securityAuthoritySubjectSha256({ featureId, action, candidateSha256, policySha256, scopeSha256 });
  if (subjectSha256 === null || !validCandidate(candidate) || ![planSha256, specSha256].every(validDigest) || !ID.test(policyRevision ?? "")) throw new TypeError("security authority intent is invalid");
  return createPoApprovalIntent({ kind: "security-authority", featureId, planSha256, specSha256, candidate, policyRevision, subjectSha256, decision: "approved" });
}

/**
 * Verifies a detached authority proof against an externally configured trust
 * policy.  The trust policy is deliberately an input of the trusted host
 * adapter, not a repository-derived fallback and not a string label.
 */
export function verifySecurityAuthority({ authority, trustPolicy, featureId, action, candidate, candidateSha256, policySha256, scopeSha256, planSha256, specSha256, policyRevision } = {}) {
  const subjectSha256 = securityAuthoritySubjectSha256({ featureId, action, candidateSha256, policySha256, scopeSha256 });
  if (subjectSha256 === null || !validCandidate(candidate) || ![planSha256, specSha256].every(validDigest) || !ID.test(policyRevision ?? "")
    || !own(authority, ["schema", "kind", "intent", "proof"]) || authority.schema !== SECURITY_AUTHORITY_SCHEMA || !["human", "policy"].includes(authority.kind)) {
    return Object.freeze({ verified: false, code: "SECURITY-AUTHORITY-INVALID" });
  }
  const intent = authority.intent;
  const value = intent?.value;
  if (!own(value, ["schema", "kind", "featureId", "planSha256", "specSha256", "candidate", "policyRevision", "subjectSha256", "decision"])
    || value.kind !== "security-authority" || value.featureId !== featureId || value.planSha256 !== planSha256 || value.specSha256 !== specSha256
    || value.candidate?.commit !== candidate.commit || value.candidate?.tree !== candidate.tree || value.policyRevision !== policyRevision
    || value.subjectSha256 !== subjectSha256 || value.decision !== "approved") {
    return Object.freeze({ verified: false, code: "SECURITY-AUTHORITY-BINDING-MISMATCH" });
  }
  const result = verifyPoApprovalProof({ intent, trustPolicy, proof: authority.proof });
  return Object.freeze(result.verified
    ? { verified: true, kind: authority.kind, proofSha256: result.proofSha256, code: "SECURITY-AUTHORITY-VERIFIED" }
    : { verified: false, code: result.code });
}
