// SPDX-License-Identifier: SUL-1.0
//
// Producer logic for `pipeline.close-cleanup-receipt.v1` (candidate 16d).
//
// The close coordinator accepts a private cleanup receipt (5 keys) but nothing produced it, so `evidenceDigest` was whatever a
// consumer chose (the hash of a stored `session-cleanup.mjs status` output). That output lists the CLOSING session's own descriptor
// as `unavailable`: a still-running session cannot answer for itself, so the hash proved nothing about cleanup.
//
// Rule built here: the closing session's own descriptor (`claude-<session id>`, derived from the runtime environment, never typed)
// is excluded and named explicitly in the observation; every OTHER active descriptor counts. `complete` only when no other active
// descriptor remains, otherwise `uncertain` (which passes `cleanup-complete` but is refused by `closed-local`, CLOSE-CLEANUP).

import { createHash } from "node:crypto";

export const CLEANUP_OBSERVATION_SCHEMA = "pipeline.close-cleanup-observation.v1";
export const CLEANUP_RECEIPT_SCHEMA = "pipeline.close-cleanup-receipt.v1";

const SHA256 = /^[0-9a-f]{64}$/u;
const OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const OWNER_STATUSES = new Set(["live", "not-live", "reused", "unavailable", "unobserved"]);

const canonical = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
};

function refuse(message) {
  const error = new Error(message);
  error.code = "CLOSE-CLEANUP-RECEIPT";
  throw error;
}

/**
 * @param {{descriptors: Array<{sessionId: string, descriptorSha256: string, status: string}>,
 *          ownSessionId: string|null, candidateOid: string, candidateTree: string}} input
 * @returns {{observation: object, observationSha256: string, receipt: object}}
 */
export function buildCleanupReceipt({ descriptors, ownSessionId, candidateOid, candidateTree, ownSession = null }) {
  if (!Array.isArray(descriptors)) refuse("descriptor listing is invalid");
  if (!OID.test(candidateOid ?? "") || !OID.test(candidateTree ?? "")) refuse("candidate identity is invalid");
  if (ownSessionId !== null && (typeof ownSessionId !== "string" || ownSessionId === "")) refuse("own session id is invalid");
  const seen = new Set();
  for (const descriptor of descriptors) {
    if (!descriptor || typeof descriptor.sessionId !== "string" || descriptor.sessionId === ""
      || !SHA256.test(descriptor.descriptorSha256 ?? "") || !OWNER_STATUSES.has(descriptor.status)
      || seen.has(descriptor.sessionId)) refuse("descriptor entry is invalid");
    seen.add(descriptor.sessionId);
  }
  const own = ownSessionId === null ? null : descriptors.find((descriptor) => descriptor.sessionId === ownSessionId) ?? null;
  const others = descriptors
    .filter((descriptor) => descriptor.sessionId !== ownSessionId)
    .map(({ sessionId, descriptorSha256, status }) => ({ sessionId, descriptorSha256, status }))
    .sort((left, right) => (left.sessionId < right.sessionId ? -1 : 1));
  const observation = {
    schema: CLEANUP_OBSERVATION_SCHEMA,
    candidateOid,
    candidateTree,
    // Named, never silent: the exclusion is part of what the digest binds.
    excludedOwnSession: own === null ? null : { sessionId: own.sessionId, descriptorSha256: own.descriptorSha256, status: own.status },
    ownSessionDerived: ownSessionId !== null,
    // 17: the runner that derived (or failed to derive) the own session is part of what the digest binds, so a receipt cannot be
    // re-read as if another runner's rule had produced it. Absent for a caller that does not say (the 16d callers).
    ...(ownSession === null ? {} : { runner: ownSession.runner, ownSessionDerivation: ownSession.derivation, ownSessionReason: ownSession.reason }),
    otherActiveDescriptors: others,
  };
  const observationSha256 = createHash("sha256").update(canonical(observation)).digest("hex");
  // A typed result for the case the old text got wrong: the own session could not be derived, so the closing session's own
  // descriptor (if it has one) is among the "others". That is not "other sessions remain"; the person has to know which it is.
  const ownSessionCode = ownSessionId === null && others.length > 0 && ownSession !== null ? "CLOSE-CLEANUP-OWN-SESSION-UNDERIVED" : null;
  return {
    observation,
    observationSha256,
    ownSessionCode,
    receipt: {
      schema: CLEANUP_RECEIPT_SCHEMA,
      status: others.length === 0 ? "complete" : "uncertain",
      evidenceDigest: observationSha256,
      candidateOid,
      candidateTree,
    },
  };
}
