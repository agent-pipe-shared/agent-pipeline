// SPDX-License-Identifier: SUL-1.0
/**
 * PHX external-command offer lifecycle. This is a journal adapter, never a
 * command executor, authority issuer, or raw command store.
 */
import { validateCommandOfferEvent } from "./agent-decision-journal.mjs";

function fail(code, message = "External command offer operation is invalid.") { const error = new Error(message); error.code = code; throw error; }
function exact(value, keys) { return value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); }
function frozen(value) { return Object.freeze(value); }
function sameOffer(left, right) { return left.candidateDigest === right.candidateDigest && left.target.repositoryFingerprint === right.target.repositoryFingerprint && left.target.scopeDigest === right.target.scopeDigest && left.policyDigest === right.policyDigest && left.redactionPolicyDigest === right.redactionPolicyDigest; }
function receipt(value, status) { return frozen({ schema: "pipeline.external-command-offer-receipt.v1", authority: "non-authoritative", status, eventId: value.eventId, offerEventId: value.offerEventId, candidateDigest: value.candidateDigest }); }

async function appendValidated(value, append, status) {
  if (typeof append !== "function") fail("ECO-APPEND");
  const readback = await append(value);
  if (!exact(readback, ["eventId", "candidateDigest", "integrity"]) || readback.eventId !== value.eventId || readback.candidateDigest !== value.candidateDigest || readback.integrity !== "verified") fail("ECO-READBACK");
  return receipt(value, status);
}

/** Appends the offer before a caller can present or initiate any command. */
export async function recordCommandOffer({ offer, append } = {}) {
  const event = validateCommandOfferEvent(offer);
  if (event.state !== "offered") fail("ECO-OFFER-STATE");
  return appendValidated(event, append, "offered");
}

/** Appends an attempt before a Pipeline-initiated executor may be invoked. */
export async function recordPipelineAttempt({ offer, attempt, append, resolveHumanAuthority } = {}) {
  const source = validateCommandOfferEvent(offer); const event = validateCommandOfferEvent(attempt);
  if (source.state !== "offered" || event.state !== "attempted" || event.offerEventId !== source.eventId || event.offerOrigin !== "pipeline-initiated" || !sameOffer(source, event)) fail("ECO-ATTEMPT");
  if (event.authorityRequirement === "human-decision-required") {
    // Cyborg integration seam: this resolver must verify a signed human
    // authority attestation; an offer, execution status, or local receipt is
    // never sufficient to grant the required decision.
    if (typeof resolveHumanAuthority !== "function") fail("ECO-AUTHORITY");
    const authority = await resolveHumanAuthority(frozen({ decisionId: event.relatedHumanDecisionId, candidateDigest: event.candidateDigest, repositoryFingerprint: event.target.repositoryFingerprint, scopeDigest: event.target.scopeDigest }));
    if (!exact(authority, ["granted", "decisionId", "candidateDigest"]) || authority.granted !== true || authority.decisionId !== event.relatedHumanDecisionId || authority.candidateDigest !== event.candidateDigest) fail("ECO-AUTHORITY");
  }
  return appendValidated(event, append, "attempted");
}

/** Records only bounded outcomes; user assertions remain execution-unobserved. */
export async function recordCommandOutcome({ offer, outcome, append, verifyOutcome } = {}) {
  const source = validateCommandOfferEvent(offer); const event = validateCommandOfferEvent(outcome);
  if (source.state !== "offered" || event.offerEventId !== source.eventId || !sameOffer(source, event) || ["offered", "attempted", "acknowledged", "authorized", "copied", "recovery-proposed", "recovered"].includes(event.state)) fail("ECO-OUTCOME");
  if (["observed-completed", "readback-verified"].includes(event.state)) {
    if (typeof verifyOutcome !== "function" || event.postEvidenceDigest === null) fail("ECO-OUTCOME-EVIDENCE");
    const observation = await verifyOutcome(frozen({ offerEventId: source.eventId, eventId: event.eventId, candidateDigest: event.candidateDigest, postEvidenceDigest: event.postEvidenceDigest }));
    if (!exact(observation, ["state", "postEvidenceDigest"]) || observation.state !== event.state || observation.postEvidenceDigest !== event.postEvidenceDigest) fail("ECO-OUTCOME-EVIDENCE");
  }
  return appendValidated(event, append, event.state);
}
