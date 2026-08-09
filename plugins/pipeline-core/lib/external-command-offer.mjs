// SPDX-License-Identifier: SUL-1.0
/**
 * PHX external-command offer lifecycle. This is a journal adapter, never a
 * command executor, authority issuer, or raw command store.
 */
import { validateCommandOfferEvent } from "./agent-decision-journal.mjs";

function fail(code, message = "External command offer operation is invalid.") { const error = new Error(message); error.code = code; throw error; }
function exact(value, keys) { return value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); }
function frozen(value) { return Object.freeze(value); }
/** R-AC-09: `occurredAtEpochMs` (agent-decision-journal.mjs) is deliberately absent from this identity check. A later event in the same lifecycle is expected to carry a different, later timestamp than the offer it correlates to -- that is not substitution, and this function only ever compares fields where a difference IS substitution. */
function sameOffer(left, right) { return left.candidateDigest === right.candidateDigest && left.target.repositoryFingerprint === right.target.repositoryFingerprint && left.target.scopeDigest === right.target.scopeDigest && left.policyDigest === right.policyDigest && left.redactionPolicyDigest === right.redactionPolicyDigest; }
/** Like `sameOffer`, minus `candidateDigest`: a recovery is deliberately allowed to name a different candidate than the one it anchors against -- that is what "alternative" means -- but never a different repository, scope, or policy context. `occurredAtEpochMs` is excluded for the same reason as `sameOffer` above. */
function sameRecoveryContext(left, right) { return left.target.repositoryFingerprint === right.target.repositoryFingerprint && left.target.scopeDigest === right.target.scopeDigest && left.policyDigest === right.policyDigest && left.redactionPolicyDigest === right.redactionPolicyDigest; }
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

/**
 * R-AC-10 typed non-material exception. `recordCommandOffer`/
 * `recordPipelineAttempt` keep failing closed with ECO-APPEND whenever
 * `append` is unavailable, byte-for-byte unchanged by this function's
 * addition -- this is a separate, additive path, never a relaxation of
 * theirs. It is usable ONLY when journaling is genuinely unavailable (no
 * `append` argument at all: passing one, even a working one, is refused
 * rather than silently ignored) AND the offer is classified
 * `sideEffectClass: "non-authoritative"` with `authorityRequirement:
 * "not-required"` -- never for a material, destructive, authority-changing,
 * guard-bypass, or policy-required offer, which must keep failing closed.
 *
 * Nothing is appended here, so there is no journal entry and no receipt():
 * the returned value's `schema` and `status` are unique to this path and
 * are never members of any journaled command state or `receipt()` status a
 * caller could otherwise read as "observed-completed"/"readback-verified"
 * proof that execution occurred or was recorded.
 */
export function acknowledgeNonMaterialOfferWithoutJournal({ offer, append } = {}) {
  if (append !== undefined) fail("ECO-JOURNAL-EXCEPTION-SCOPE", "Journaling is available; use recordCommandOffer instead of the non-material exception.");
  const event = validateCommandOfferEvent(offer);
  if (event.state !== "offered") fail("ECO-OFFER-STATE");
  if (event.sideEffectClass !== "non-authoritative" || event.authorityRequirement !== "not-required") fail("ECO-JOURNAL-EXCEPTION-SCOPE", "The non-material exception is not usable for this offer's sideEffectClass/authorityRequirement.");
  return frozen({ schema: "pipeline.external-command-offer-journal-exception.v1", authority: "non-authoritative", status: "unjournaled-non-material-exception", journaled: false, eventId: event.eventId, candidateDigest: event.candidateDigest });
}

/**
 * R-AC-02: appends a considered-recovery event -- `recovery-proposed` while
 * an alternative to a rejected sanctioned path is under consideration,
 * `recovered` once one has been selected. This is a separate, additive
 * recording path for exactly the two states `recordCommandOutcome` (below)
 * excludes; it never changes that exclusion.
 *
 * Five data points, five existing fields on the closed
 * `validateCommandOfferEvent` shape -- no new field is added anywhere:
 *  - trigger              -> `offerEventId`, required equal to `anchor.eventId`:
 *                            the existing offer, or -- chained -- a distinct
 *                            prior `recovery-proposed` event already appended
 *                            for this same recovery.
 *  - typed rejection       -> `reasonCode` (already mandatory and typed by the
 *                            shared schema; the same field R-AC-01 already
 *                            uses for "selected alternative/reason codes").
 *  - evidence gap          -> `preEvidenceDigest === null`, enforced here: the
 *                            documented absence of verified pre-evidence IS
 *                            the gap that motivated reconsidering the
 *                            sanctioned path.
 *  - candidate alternatives -> `candidateDigest` identifies this alternative;
 *                            a caller correlates it to alternatives already
 *                            considered by chaining `supersedesEventId` to an
 *                            earlier `recovery-proposed` event's eventId --
 *                            each alternative is its own distinct agent event.
 *  - selected recovery     -> on a `recovered` event, `supersedesEventId` set
 *                            to the chosen `recovery-proposed` alternative's
 *                            eventId names the selection; `candidateDigest`
 *                            carries which candidate that was.
 *
 * `anchor` may be the original `offered` event or a distinct prior
 * `recovery-proposed` event. Deliberately not `sameOffer()`: candidateDigest
 * is expected to differ (an alternative is, by definition, often a different
 * candidate than the one it replaces) -- but repository/scope/policy/
 * redaction continuity is still required, so a recovery can never smuggle in
 * a different target or policy context than the one it is recovering.
 */
export async function recordCommandRecoveryDisposition({ anchor, recovery, append } = {}) {
  const source = validateCommandOfferEvent(anchor); const event = validateCommandOfferEvent(recovery);
  if (!["offered", "recovery-proposed"].includes(source.state)) fail("ECO-RECOVERY-ANCHOR");
  if (!["recovery-proposed", "recovered"].includes(event.state)) fail("ECO-RECOVERY-STATE");
  if (event.offerEventId !== source.eventId || !sameRecoveryContext(source, event)) fail("ECO-RECOVERY-LINK");
  if (event.preEvidenceDigest !== null) fail("ECO-RECOVERY-EVIDENCE-GAP");
  return appendValidated(event, append, event.state);
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
