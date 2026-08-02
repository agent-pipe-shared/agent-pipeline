// SPDX-License-Identifier: SUL-1.0
/** Stable fail-closed boundary for consumers of PHX-2 human authority. */
import { resolveExternallyAttestedHumanGovernanceAuthority, resolveHumanGovernanceAuthority } from "./human-governance-ledger.mjs";

export function resolveGovernanceAuthority({ decisions, decisionId, repositoryFingerprint, candidate, nowEpochMs } = {}) {
  return resolveHumanGovernanceAuthority({ decisions, decisionId, repositoryFingerprint, candidate, nowEpochMs });
}

export function requireGovernanceAuthority(request) {
  const result = resolveGovernanceAuthority(request);
  if (result.status !== "granted") return Object.freeze({ granted: false, reason: result.reason ?? "unavailable" });
  return Object.freeze({ granted: true, decisionId: result.decisionId, decisionDigest: result.decisionDigest, scope: result.scope, singleUse: result.singleUse });
}

/**
 * Explicit opt-in for consumers that require a cryptographically verified
 * human identity. `trustPolicy` must be resolved by the caller from its
 * external authority boundary; this repository never persists a key or turns
 * ordinary ledger attribution into this stronger result.
 */
export function requireExternallyAttestedGovernanceAuthority(request) {
  const result = resolveExternallyAttestedHumanGovernanceAuthority(request);
  if (result.status !== "granted") return Object.freeze({ granted: false, reason: result.reason ?? "unavailable", proofCode: result.proofCode });
  return Object.freeze({ granted: true, decisionId: result.decisionId, decisionDigest: result.decisionDigest, scope: result.scope, singleUse: result.singleUse, identityAssurance: result.identityAssurance, approvalIntentSha256: result.approvalIntentSha256, proofSha256: result.proofSha256 });
}
