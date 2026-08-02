// SPDX-License-Identifier: SUL-1.0
/** Pure validation and authority resolution for PHX-2 human decisions. */
import { canonicalSha256 } from "./governance-event.mjs";
import { appendPortableGovernanceEvent, queryPortableGovernanceStream } from "./governance-event-store.mjs";
import { HumanGovernanceLedgerError, validateHumanGovernanceDecision } from "./human-governance-decision.mjs";

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
function record(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exact(value, keys) { return record(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); }

export { HumanGovernanceLedgerError, validateHumanGovernanceDecision };

/** Returns an immutable authority result; any ambiguity or stale binding fails closed. */
export function resolveHumanGovernanceAuthority({ decisions, decisionId, repositoryFingerprint, candidate, nowEpochMs = Date.now() } = {}) {
  if (!Array.isArray(decisions) || !ID.test(decisionId) || !SHA256.test(repositoryFingerprint) || !exact(candidate, ["commit", "tree"]) || !OID.test(candidate.commit) || !OID.test(candidate.tree) || !Number.isSafeInteger(nowEpochMs)) fail("HGL-RESOLVE-REQUEST");
  const valid = decisions.map(validateHumanGovernanceDecision);
  const selected = valid.filter((entry) => entry.decisionId === decisionId);
  if (selected.length !== 1) return Object.freeze({ status: "unavailable", reason: "decision-not-unique" });
  const decision = selected[0];
  if (decision.event !== "granted" || decision.outcome !== "granted") return Object.freeze({ status: "denied", reason: "not-granted" });
  if (decision.scope.repositoryFingerprint !== repositoryFingerprint || decision.scope.candidate.commit !== candidate.commit || decision.scope.candidate.tree !== candidate.tree) return Object.freeze({ status: "denied", reason: "scope-mismatch" });
  if (nowEpochMs < decision.validity.notBeforeEpochMs || nowEpochMs > decision.validity.expiresAtEpochMs) return Object.freeze({ status: "denied", reason: "expired" });
  const dispositions = valid.filter((entry) => Object.values(entry.links).includes(decisionId));
  if (dispositions.some((entry) => ["consumed", "revoked", "superseded", "corrected"].includes(entry.event))) return Object.freeze({ status: "denied", reason: "disposed" });
  return Object.freeze({ status: "granted", decisionId, decisionDigest: canonicalSha256(decision), singleUse: decision.validity.singleUse, scope: decision.scope });
}

/**
 * Cyborg integration point: its verified-human-attestation adapter belongs
 * immediately before this admission boundary. A future schema revision may
 * materialize only the permitted assurance evidence here; this ledger must
 * never promote an unverified caller claim to a verified human authority.
 */
/** Append one already validated human decision through the canonical portable writer. */
export async function appendHumanGovernanceDecision({ repositoryRoot, repositoryFingerprint, intent } = {}) {
  if (!record(intent) || intent.origin !== "human" || intent.streamId !== "human" || intent.authorityClass !== "human-authority" || intent.payloadSchema !== "pipeline.human-governance-decision.v1") fail("HGL-APPEND-INTENT");
  const decision = validateHumanGovernanceDecision(intent.payload);
  if (intent.repositoryFingerprint !== repositoryFingerprint || decision.scope.repositoryFingerprint !== repositoryFingerprint) fail("HGL-CROSS-REPOSITORY");
  return appendPortableGovernanceEvent({ repositoryRoot, repositoryFingerprint, intent });
}

/** Return only verified/prefix-valid canonical human decisions, never mutable projection state. */
export async function queryHumanGovernanceDecisions({ repositoryRoot, repositoryFingerprint, checkpoint } = {}) {
  const result = await queryPortableGovernanceStream({ repositoryRoot, repositoryFingerprint, streamId: "human", checkpoint });
  return Object.freeze({ ...result, decisions: Object.freeze(result.events.map((event) => validateHumanGovernanceDecision(event.payload))) });
}
