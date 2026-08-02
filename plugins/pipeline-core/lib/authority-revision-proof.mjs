// SPDX-License-Identifier: SUL-1.0
/** Public-key proof boundary for a Phoenix continuity authority revision. */
import { createHash, verify } from "node:crypto";

const SHA = /^[a-f0-9]{64}$/u;
const OID = /^[a-f0-9]{40,64}$/u;
const own = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const canonical = (value) => Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : value !== null && typeof value === "object" ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}` : JSON.stringify(value);
const authority = (value) => own(value, ["prd", "spec"]) && [value.prd, value.spec].every((entry) => own(entry, ["path", "sha256"]) && typeof entry.path === "string" && SHA.test(entry.sha256));

export const AUTHORITY_REVISION_INTENT_SCHEMA = "pipeline.continuity-authority-revision-intent.v1";
export const AUTHORITY_REVISION_PROOF_SCHEMA = "pipeline.continuity-authority-revision-proof.v1";

export function createAuthorityRevisionIntent({ featureId, oldAuthority, nextAuthority, decision, candidate, evidence, expiresAt } = {}) {
  if (typeof featureId !== "string" || !/^[a-z][a-z0-9-]{0,63}$/u.test(featureId) || !authority(oldAuthority) || !authority(nextAuthority)
    || !own(decision, ["id", "sha256", "scope"]) || typeof decision.id !== "string" || !SHA.test(decision.sha256)
    || !own(candidate, ["commit", "tree"]) || !OID.test(candidate.commit) || !OID.test(candidate.tree)
    || !own(evidence, ["sha256"]) || !SHA.test(evidence.sha256) || typeof expiresAt !== "string" || !Number.isFinite(Date.parse(expiresAt))) throw new TypeError("authority revision intent is invalid");
  const value = { schema: AUTHORITY_REVISION_INTENT_SCHEMA, featureId, oldAuthority, nextAuthority, decision, candidate, evidence, expiresAt };
  return Object.freeze({ value: Object.freeze(value), sha256: createHash("sha256").update(canonical(value)).digest("hex") });
}

export function verifyAuthorityRevisionProof({ intent, trustPolicy, proof } = {}) {
  if (!intent || !SHA.test(intent.sha256 ?? "") || !trustPolicy || !proof || !own(trustPolicy, ["keyReference", "publicKeySha256"])
    || !own(proof, ["schema", "intentSha256", "keyReference", "publicKey", "signatureBase64"])
    || proof.schema !== AUTHORITY_REVISION_PROOF_SCHEMA || proof.intentSha256 !== intent.sha256 || proof.keyReference !== trustPolicy.keyReference
    || createHash("sha256").update(proof.publicKey ?? "").digest("hex") !== trustPolicy.publicKeySha256) return Object.freeze({ verified: false, code: "AR-PROOF-INVALID" });
  try { return verify(null, Buffer.from(intent.sha256, "utf8"), proof.publicKey, Buffer.from(proof.signatureBase64, "base64")) ? Object.freeze({ verified: true, proofSha256: createHash("sha256").update(canonical(proof)).digest("hex") }) : Object.freeze({ verified: false, code: "AR-PROOF-MISMATCH" }); } catch { return Object.freeze({ verified: false, code: "AR-PROOF-INVALID" }); }
}
