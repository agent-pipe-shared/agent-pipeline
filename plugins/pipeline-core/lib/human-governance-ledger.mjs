// SPDX-License-Identifier: SUL-1.0
/** Pure validation and authority resolution for PHX-2 human decisions. */
import { canonicalSha256, validateGovernanceEventEnvelope } from "./governance-event.mjs";
import { appendPortableGovernanceEvent, queryPortableGovernanceStream } from "./governance-event-store.mjs";
import { HumanGovernanceLedgerError, createConsumedHumanGovernanceDecision, validateHumanGovernanceDecision } from "./human-governance-decision.mjs";

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
function record(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exact(value, keys) { return record(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); }
function fail(code) { throw new HumanGovernanceLedgerError(code); }

export { HumanGovernanceLedgerError, createConsumedHumanGovernanceDecision, validateHumanGovernanceDecision };

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
 * Cyborg integration point: the published `po-approval-proof` verifier belongs
 * immediately before this admission boundary, using a trust policy resolved
 * outside the candidate. A future schema revision may materialize only the
 * permitted assurance evidence here; this ledger must never promote an
 * unverified caller claim to a verified human authority.
 */
/** Append one already validated human decision through the canonical portable writer. */
export async function appendHumanGovernanceDecision({ repositoryRoot, repositoryFingerprint, intent } = {}) {
  if (!record(intent) || intent.origin !== "human" || intent.streamId !== "human" || intent.authorityClass !== "human-authority" || intent.payloadSchema !== "pipeline.human-governance-decision.v1") fail("HGL-APPEND-INTENT");
  const decision = validateHumanGovernanceDecision(intent.payload);
  if (intent.repositoryFingerprint !== repositoryFingerprint || decision.scope.repositoryFingerprint !== repositoryFingerprint) fail("HGL-CROSS-REPOSITORY");
  return appendPortableGovernanceEvent({ repositoryRoot, repositoryFingerprint, intent });
}

/**
 * Append the only valid disposition of a live single-use grant.  The grant is
 * re-read under the human-stream append lock, so a stale caller cannot race a
 * second consumption into the immutable ledger.  Mutable State is deliberately
 * not touched here; its writer must project the returned receipt afterwards.
 */
export async function appendConsumedHumanGovernanceDecision({ repositoryRoot, repositoryFingerprint, grantEvent, decisionId, eventId, idempotencyKey, observedAtEpochMs } = {}) {
  if (!record(grantEvent) || !validateGovernanceEventEnvelope(grantEvent).valid
    || grantEvent.origin !== "human" || grantEvent.streamId !== "human"
    || grantEvent.authorityClass !== "human-authority"
    || grantEvent.payloadSchema !== "pipeline.human-governance-decision.v1"
    || !ID.test(decisionId) || !ID.test(eventId) || !ID.test(idempotencyKey)
    || !Number.isSafeInteger(observedAtEpochMs)) fail("HGL-CONSUME-ENVELOPE");
  const grant = validateHumanGovernanceDecision(grantEvent.payload);
  if (grant.event !== "granted" || grant.outcome !== "granted"
    || grant.scope.repositoryFingerprint !== repositoryFingerprint
    || grantEvent.repositoryFingerprint !== repositoryFingerprint
    || decisionId === grant.decisionId) fail("HGL-CONSUME-ENVELOPE");
  const consumed = createConsumedHumanGovernanceDecision({ grant, decisionId, observedAtEpochMs });
  const intent = {
    schema: "pipeline.governance-event-envelope.v1",
    payloadSchema: "pipeline.human-governance-decision.v1",
    canonicalization: "RFC8785",
    digestAlgorithm: "sha-256",
    eventId,
    idempotencyKey,
    origin: "human",
    authorityClass: "human-authority",
    eventType: "human.consumed",
    occurredAtEpochMs: observedAtEpochMs,
    observedAtEpochMs,
    timeAssurance: "locally-observed",
    repositoryFingerprint,
    sourceUri: grantEvent.sourceUri,
    streamId: "human",
    correlation: grantEvent.correlation,
    candidate: grant.scope.candidate,
    artifacts: grantEvent.artifacts,
    policy: grantEvent.policy,
    classification: "repository-public-safe",
    storageProfile: "repository-public-safe",
    retentionCompatibility: "repository-retained",
    disclosureClass: "repository-visible",
    payload: consumed,
  };
  return appendPortableGovernanceEvent({
    repositoryRoot,
    repositoryFingerprint,
    intent,
    assertAppend: (events) => {
      const persisted = events.find((event) => event.eventDigest === grantEvent.eventDigest);
      if (!persisted || canonicalSha256(persisted) !== canonicalSha256(grantEvent)) fail("HGL-CONSUME-GRANT-STALE");
      const decisions = events
        .filter((event) => event.origin === "human" && event.streamId === "human")
        .map((event) => validateHumanGovernanceDecision(event.payload));
      const authority = resolveHumanGovernanceAuthority({
        decisions,
        decisionId: grant.decisionId,
        repositoryFingerprint,
        candidate: grant.scope.candidate,
        nowEpochMs: observedAtEpochMs,
      });
      if (authority.status !== "granted" || authority.singleUse !== true) fail("HGL-CONSUME-NOT-LIVE");
    },
  });
}

/** Return only verified/prefix-valid canonical human decisions, never mutable projection state. */
export async function queryHumanGovernanceDecisions({ repositoryRoot, repositoryFingerprint, checkpoint } = {}) {
  const result = await queryPortableGovernanceStream({ repositoryRoot, repositoryFingerprint, streamId: "human", checkpoint });
  return Object.freeze({ ...result, decisions: Object.freeze(result.events.map((event) => validateHumanGovernanceDecision(event.payload))) });
}
