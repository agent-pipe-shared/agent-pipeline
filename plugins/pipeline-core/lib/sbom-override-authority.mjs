// SPDX-License-Identifier: SUL-1.0
/**
 * Authority for accepting a gap in the feature close's software bill of materials (ADR-0091, PO decision 2026-11-11: the override needs a signature).
 *
 * A caller-supplied sentence is never authority. The close builds one request that names the feature, the exact blocked findings and the candidate commit and tree (HEAD at the close);
 * the human signs the request's intent digest with `po-human-approval.mjs sign-intent --request <the request file>`; the close then verifies that proof against the trust anchors the project
 * configured outside the agent's reach (`project/critical-human-proof.json`). Any other finding, another candidate, another key or an edited proof fails closed.
 *
 * The shared intent primitive wants a plan digest and a specification digest; a close-time SBOM gap has neither of its own, so both carry the digest of the subject (feature id and findings).
 * What binds is therefore the feature, the findings and the candidate.
 */
import { createHash } from "node:crypto";
import { canonical, createPoApprovalIntent, verifyPoApprovalProof } from "./po-approval-proof.mjs";

export const SBOM_OVERRIDE_REQUEST_SCHEMA = "pipeline.sbom-override-request.v1";
export const SBOM_OVERRIDE_KIND = "sbom-override";
export const SBOM_OVERRIDE_CODES = Object.freeze({ invalid: "SBOM-OVERRIDE-PROOF-INVALID", untrusted: "SBOM-OVERRIDE-KEY-UNTRUSTED", noAnchor: "SBOM-OVERRIDE-NO-TRUST-ANCHOR", unreadable: "SBOM-OVERRIDE-PROOF-UNREADABLE" });

const OID = /^[a-f0-9]{40,64}$/u;
const exact = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const sha256 = (value) => createHash("sha256").update(canonical(value)).digest("hex");
const normalizeBlocked = (blocked) => blocked.map(({ state, code, path, reason }) => ({ state, code, path, reason })).sort((left, right) => (canonical(left) < canonical(right) ? -1 : 1));
const validBlocked = (blocked) => Array.isArray(blocked) && blocked.length > 0 && blocked.every((entry) => exact(entry, ["state", "code", "path", "reason"]) && Object.values(entry).every((part) => typeof part === "string" && part !== ""));
const validCandidate = (candidate) => exact(candidate, ["commit", "tree"]) && OID.test(candidate.commit) && OID.test(candidate.tree) && candidate.commit !== candidate.tree;

/** The digest of what the human accepts: the feature and every finding, in a fixed order. */
export function sbomOverrideSubjectSha256({ featureId, blocked }) {
  return sha256({ schema: SBOM_OVERRIDE_REQUEST_SCHEMA, featureId, blocked: normalizeBlocked(blocked) });
}

/** The request the human signs; null when its inputs are not a feature id, a non-empty list of findings and a candidate. */
export function createSbomOverrideRequest({ featureId, blocked, candidate } = {}) {
  if (typeof featureId !== "string" || featureId === "" || !validBlocked(blocked) || !validCandidate(candidate)) return null;
  const subjectSha256 = sbomOverrideSubjectSha256({ featureId, blocked });
  const approvalIntent = createPoApprovalIntent({ kind: SBOM_OVERRIDE_KIND, featureId: "sbom-close", planSha256: subjectSha256, specSha256: subjectSha256, candidate: { commit: candidate.commit, tree: candidate.tree }, policyRevision: "sbom-close-1", subjectSha256, decision: "accept-sbom-gap" });
  return { schema: SBOM_OVERRIDE_REQUEST_SCHEMA, intentSha256: approvalIntent.sha256, approvalIntent, featureId, blocked: normalizeBlocked(blocked), candidate: { commit: candidate.commit, tree: candidate.tree } };
}

/** What the signer is shown, derived from the request alone and only when it re-derives to the digest being signed; null otherwise (the signature then refuses). */
export function describeSbomOverrideRequest(record, intentSha256) {
  if (!exact(record, ["schema", "intentSha256", "approvalIntent", "featureId", "blocked", "candidate"]) || record.schema !== SBOM_OVERRIDE_REQUEST_SCHEMA || record.intentSha256 !== intentSha256) return null;
  const rebuilt = createSbomOverrideRequest({ featureId: record.featureId, blocked: record.blocked, candidate: record.candidate });
  if (rebuilt === null || canonical(rebuilt) !== canonical(record)) return null;
  return {
    resolved: true,
    lines: [
      "action: accept a gap in the software bill of materials (SBOM) of a feature close",
      `feature: ${record.featureId}`,
      `candidate commit: ${record.candidate.commit}`,
      ...record.blocked.map((entry) => `finding (${entry.state}) ${entry.code} in ${entry.path}: ${entry.reason}`),
      "this accepts ONLY the findings listed here, for this candidate: the SBOM of this feature stays incomplete by your decision and the close record says so; it approves nothing else",
    ],
  };
}

/**
 * Verifies a detached proof for exactly this feature, these findings and this candidate. `trustAnchors` comes from the project's configured policy, never from the proof.
 * Returns { verified: true, authority } with the record fields the close keeps, or { verified: false, code }.
 */
export function verifySbomOverrideProof({ featureId, blocked, candidate, proof, trustAnchors } = {}) {
  const request = createSbomOverrideRequest({ featureId, blocked, candidate });
  if (request === null || !exact(proof, ["schema", "intentSha256", "keyReference", "publicKey", "signatureBase64"])) return { verified: false, code: SBOM_OVERRIDE_CODES.invalid };
  if (!Array.isArray(trustAnchors) || trustAnchors.length === 0) return { verified: false, code: SBOM_OVERRIDE_CODES.noAnchor };
  const anchor = trustAnchors.find((entry) => entry?.keyReference === proof.keyReference);
  if (anchor === undefined) return { verified: false, code: SBOM_OVERRIDE_CODES.untrusted };
  const checked = verifyPoApprovalProof({ intent: request.approvalIntent, trustPolicy: anchor, proof });
  if (checked.verified !== true) return { verified: false, code: SBOM_OVERRIDE_CODES.invalid };
  return { verified: true, request, authority: { kind: "po-signature", keyReference: proof.keyReference, intentSha256: request.intentSha256, proofSha256: checked.proofSha256, candidateCommit: request.candidate.commit } };
}
