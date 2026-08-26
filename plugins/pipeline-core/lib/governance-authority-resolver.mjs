// SPDX-License-Identifier: SUL-1.0
/** Stable fail-closed boundary for consumers of PHX-2 human authority. */
import { resolveExternallyVerifiedHumanGovernanceAuthority, resolveHumanGovernanceAuthority } from "./human-governance-ledger.mjs";

export function resolveGovernanceAuthority({ decisions, decisionId, repositoryFingerprint, candidate, nowEpochMs } = {}) {
  return resolveHumanGovernanceAuthority({ decisions, decisionId, repositoryFingerprint, candidate, nowEpochMs });
}

/**
 * A role exception is never general authority.
 *
 * Every consumer of this boundary reads `granted: true` plus a matching
 * `scope.action` as an unqualified grant. A role exception reaching them
 * through here would present as exactly that -- with the constraints and the
 * outstanding follow-up review that are the entire reason the class exists
 * dropped on the way out. That is not a narrower authority arriving at a
 * consumer that ignores its bounds; it is a bounded record widening into an
 * unbounded one at the boundary. Consumers that can honour the bounds ask for
 * them by name through `requireGovernanceRoleException` and receive them.
 */
function refuseRoleException(result) {
  return result.exceptionClass !== undefined;
}

export function requireGovernanceAuthority(request) {
  const result = resolveGovernanceAuthority(request);
  if (result.status !== "granted") return Object.freeze({ granted: false, reason: result.reason ?? "unavailable" });
  if (refuseRoleException(result)) return Object.freeze({ granted: false, reason: "role-exception-not-general-authority" });
  return Object.freeze({ granted: true, decisionId: result.decisionId, decisionDigest: result.decisionDigest, scope: result.scope, singleUse: result.singleUse });
}

/**
 * Explicit opt-in for the role-exception class.  It is a separate entry point
 * rather than a flag on the general one so that a consumer cannot obtain an
 * exception by accident: asking for it means undertaking to enforce the
 * returned `constraints` and to carry the `followUpReview` forward.
 */
export function requireGovernanceRoleException(request) {
  const result = resolveGovernanceAuthority(request);
  if (result.status !== "granted") return Object.freeze({ granted: false, reason: result.reason ?? "unavailable" });
  if (!refuseRoleException(result)) return Object.freeze({ granted: false, reason: "not-a-role-exception" });
  return Object.freeze({ granted: true, decisionId: result.decisionId, decisionDigest: result.decisionDigest, scope: result.scope, singleUse: result.singleUse, exceptionClass: result.exceptionClass, constraints: result.constraints, followUpReview: result.followUpReview });
}

/**
 * Explicit opt-in for consumers that need detached-proof verification. A
 * caller-supplied trust policy has no independently verifiable provenance, so
 * this helper never turns local attribution into human identity attestation.
 */
export function requireExternallyVerifiedGovernanceAuthority(request) {
  const result = resolveExternallyVerifiedHumanGovernanceAuthority(request);
  if (result.status !== "granted") return Object.freeze({ granted: false, reason: result.reason ?? "unavailable", proofCode: result.proofCode });
  // A verified detached proof attests who decided, not what class of decision
  // it was. It cannot turn a bounded exception into general authority either.
  if (refuseRoleException(result)) return Object.freeze({ granted: false, reason: "role-exception-not-general-authority" });
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
