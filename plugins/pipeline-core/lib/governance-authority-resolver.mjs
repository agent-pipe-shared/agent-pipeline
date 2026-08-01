// SPDX-License-Identifier: SUL-1.0
/** Stable fail-closed boundary for consumers of PHX-2 human authority. */
import { resolveHumanGovernanceAuthority } from "./human-governance-ledger.mjs";

export function resolveGovernanceAuthority({ decisions, decisionId, repositoryFingerprint, candidate, nowEpochMs } = {}) {
  return resolveHumanGovernanceAuthority({ decisions, decisionId, repositoryFingerprint, candidate, nowEpochMs });
}

export function requireGovernanceAuthority(request) {
  const result = resolveGovernanceAuthority(request);
  if (result.status !== "granted") return Object.freeze({ granted: false, reason: result.reason ?? "unavailable" });
  return Object.freeze({ granted: true, decisionId: result.decisionId, decisionDigest: result.decisionDigest, scope: result.scope, singleUse: result.singleUse });
}
