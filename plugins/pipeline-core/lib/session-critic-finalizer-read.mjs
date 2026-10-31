// SPDX-License-Identifier: SUL-1.0
/**
 * Read half of scripts/session-critic-finalizer.mjs (D216 option A, D219): the validators of a session Critic result and receipt,
 * with no filesystem-write API. The script imports and re-exports these symbols.
 */


export const SESSION_CRITIC_RECEIPT_SCHEMA = "pipeline.session-critic-receipt.v1";
export const SESSION_CRITIC_ASSURANCE = "functional-equivalent-read-only; OS isolation not asserted";
export const PACKET_ID = /^[a-f0-9]{32}$/u;
export const SHA256 = /^[a-f0-9]{64}$/u;
export const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
export const SAFE_ID = /^[a-z0-9][a-z0-9._-]{1,79}$/u;
const RECEIPT_KEYS = Object.freeze(["schema", "packetId", "packetDigest", "session", "candidate", "reviewRange", "rulesetSha", "assurance", "verdictSha256", "findingCount", "reviewPass"]);
export class SessionCriticFinalizerError extends Error {
  constructor(code, message = "Session Critic finalization is invalid.") {
    super(message);
    this.name = "SessionCriticFinalizerError";
    this.code = code;
  }
}

export function fail(code, message) { throw new SessionCriticFinalizerError(code, message); }

export function record(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
export function exact(value, keys) {
  return record(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
export function validateSessionCriticReceipt(receipt) {
  if (!exact(receipt, RECEIPT_KEYS) || receipt.schema !== SESSION_CRITIC_RECEIPT_SCHEMA
    || !PACKET_ID.test(receipt.packetId) || !SHA256.test(receipt.packetDigest)
    || !exact(receipt.session, ["id", "freshContext", "historyInherited", "mayDelegate"])
    || !SAFE_ID.test(receipt.session.id) || receipt.session.freshContext !== true
    || receipt.session.historyInherited !== false || receipt.session.mayDelegate !== false
    || !OID.test(receipt.rulesetSha)
    || receipt.assurance !== SESSION_CRITIC_ASSURANCE || !SHA256.test(receipt.verdictSha256)
    || !Number.isSafeInteger(receipt.findingCount) || receipt.findingCount < 0
    || typeof receipt.reviewPass !== "boolean"
    || !exact(receipt.candidate, ["base", "commit", "tree"])
    || !exact(receipt.reviewRange, ["base", "commit", "diffSha256"])
    || receipt.candidate.base !== receipt.reviewRange.base || receipt.candidate.commit !== receipt.reviewRange.commit
    || !OID.test(receipt.candidate.base) || !OID.test(receipt.candidate.commit) || !OID.test(receipt.candidate.tree)
    || !SHA256.test(receipt.reviewRange.diffSha256)) fail("SCF-RECEIPT");
  return receipt;
}

