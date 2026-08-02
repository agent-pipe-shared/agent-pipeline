// SPDX-License-Identifier: SUL-1.0
/** Stable fail-closed boundary for consumers of PHX-2 human authority. */
import { resolveExternallyVerifiedHumanGovernanceAuthority, resolveHumanGovernanceAuthority } from "./human-governance-ledger.mjs";

export function resolveGovernanceAuthority({ decisions, decisionId, repositoryFingerprint, candidate, nowEpochMs } = {}) {
  return resolveHumanGovernanceAuthority({ decisions, decisionId, repositoryFingerprint, candidate, nowEpochMs });
}

export function requireGovernanceAuthority(request) {
  const result = resolveGovernanceAuthority(request);
  if (result.status !== "granted") return Object.freeze({ granted: false, reason: result.reason ?? "unavailable" });
  return Object.freeze({ granted: true, decisionId: result.decisionId, decisionDigest: result.decisionDigest, scope: result.scope, singleUse: result.singleUse });
}

/**
 * Explicit opt-in for consumers that need detached-proof verification. A
 * caller-supplied trust policy has no independently verifiable provenance, so
 * this helper never turns local attribution into human identity attestation.
 */
export function requireExternallyVerifiedGovernanceAuthority(request) {
  const result = resolveExternallyVerifiedHumanGovernanceAuthority(request);
  if (result.status !== "granted") return Object.freeze({ granted: false, reason: result.reason ?? "unavailable", proofCode: result.proofCode });
  return Object.freeze({ granted: true, decisionId: result.decisionId, decisionDigest: result.decisionDigest, scope: result.scope, singleUse: result.singleUse, externalProofVerified: true, proofTrustAssurance: result.proofTrustAssurance, approvalIntentSha256: result.approvalIntentSha256, proofSha256: result.proofSha256 });
}

/**
 * @deprecated Compatibility export for existing consumers.  It keeps the
 * established import path and response envelope while deliberately refusing
 * the former externally-attested identity claim.  Migrate to
 * `requireExternallyVerifiedGovernanceAuthority` to consume the explicit
 * proof-verification semantics.
 */
export function requireExternallyAttestedGovernanceAuthority(request) {
  const verified = requireExternallyVerifiedGovernanceAuthority(request);
  if (!verified.granted) return verified;
  return Object.freeze({ ...verified, identityAssurance: "local-human", externalAttestationDeprecated: true });
}
