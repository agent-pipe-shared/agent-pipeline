// SPDX-License-Identifier: SUL-1.0
/** Runner-neutral proof contract for an approval performed outside the agent boundary. */
import { createHash, verify } from "node:crypto";

const SHA = /^[a-f0-9]{64}$/u;
const OID = /^[a-f0-9]{40,64}$/u;
const ID = /^[a-z][a-z0-9-]{0,63}$/u;
const own = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const text = (value) => typeof value === "string" && value.trim() !== "";
const candidate = (value) => own(value, ["commit", "tree"]) && OID.test(value.commit) && OID.test(value.tree) && value.commit !== value.tree;
const canonical = (value) => Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : value !== null && typeof value === "object" ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}` : JSON.stringify(value);

export const PO_APPROVAL_INTENT_SCHEMA = "pipeline.po-approval-intent.v1";
export const PO_APPROVAL_PROOF_SCHEMA = "pipeline.po-approval-proof.v1";

/** The agent may create this request but cannot authorize it. */
/**
 * The agent may create this request but cannot authorize it. `subjectSha256`
 * binds the feature-specific object (model, override request, release input),
 * while the surrounding fields make the primitive uniformly reusable.
 */
export function createPoApprovalIntent({ kind, featureId, planSha256, specSha256, candidate: subject, policyRevision, subjectSha256, decision }) {
  if (!ID.test(kind ?? "") || !ID.test(featureId ?? "") || !SHA.test(planSha256 ?? "") || !SHA.test(specSha256 ?? "") || !candidate(subject) || !ID.test(policyRevision ?? "") || !SHA.test(subjectSha256 ?? "") || !ID.test(decision ?? "")) throw new TypeError("PO approval intent is invalid");
  const value = { schema: PO_APPROVAL_INTENT_SCHEMA, kind, featureId, planSha256, specSha256, candidate: subject, policyRevision, subjectSha256, decision };
  return { value, sha256: createHash("sha256").update(canonical(value)).digest("hex") };
}

/**
 * `trustPolicy` is intentionally supplied by a configured external authority,
 * not derived from the candidate or from this proof. A caller that cannot
 * resolve such an authority must fail closed.
 */
export function verifyPoApprovalProof({ intent, trustPolicy, proof } = {}) {
  if (!intent || !SHA.test(intent.sha256 ?? "") || !trustPolicy || !proof || !own(trustPolicy, ["keyReference", "publicKeySha256"]) || !text(trustPolicy.keyReference) || !SHA.test(trustPolicy.publicKeySha256) || !own(proof, ["schema", "intentSha256", "keyReference", "publicKey", "signatureBase64"]) || proof.schema !== PO_APPROVAL_PROOF_SCHEMA || proof.intentSha256 !== intent.sha256 || proof.keyReference !== trustPolicy.keyReference || !text(proof.publicKey) || !text(proof.signatureBase64)) return { verified: false, code: "PO-APPROVAL-PROOF-INVALID" };
  if (createHash("sha256").update(proof.publicKey).digest("hex") !== trustPolicy.publicKeySha256) return { verified: false, code: "PO-APPROVAL-TRUST-MISMATCH" };
  let signature; try { signature = Buffer.from(proof.signatureBase64, "base64"); } catch { return { verified: false, code: "PO-APPROVAL-PROOF-INVALID" }; }
  if (signature.length === 0) return { verified: false, code: "PO-APPROVAL-PROOF-INVALID" };
  try { return verify(null, Buffer.from(intent.sha256, "utf8"), proof.publicKey, signature) ? { verified: true, code: "PO-APPROVAL-PROOF-VERIFIED", proofSha256: createHash("sha256").update(canonical(proof)).digest("hex") } : { verified: false, code: "PO-APPROVAL-PROOF-MISMATCH" }; } catch { return { verified: false, code: "PO-APPROVAL-PROOF-INVALID" }; }
}
