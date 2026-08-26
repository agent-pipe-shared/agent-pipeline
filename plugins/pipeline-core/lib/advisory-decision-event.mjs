// SPDX-License-Identifier: SUL-1.0
/**
 * PHX A-AC-05: the pure translator from a successful advisory receipt
 * (`pipeline.advisory-receipt.v1`, `advisory-receipt.mjs`) to an
 * `agent-decision-journal.mjs` event that records WHICH identity actually
 * answered -- runner, model, effort, adapter and profile -- each carrying the
 * provenance and assurance the criterion requires.
 *
 * The receipt already records the identity dimensions; what it does not record,
 * and what A-AC-05 is about, is HOW each of them is known. That judgement is
 * made once, here, per dimension, and is not a property the receipt could carry:
 * it depends on which facts THIS translator re-derives itself (`verified`) and
 * which it forwards from an invariant enforced upstream in the coordinator or
 * supplied by the caller (`reported`). See the per-dimension rationale on
 * `IDENTITY_ASSURANCE_BASIS` below.
 *
 * Three deliberate boundaries:
 *
 *  - It is a MAPPER, not a journal writer. There is no append, no store, no
 *    clock and no repository binding in this module; the wiring into
 *    `advisory-coordinator.mjs` / `advisory-host-bridge.mjs` and the governance
 *    event store is deliberately separate work, because threading a real
 *    repository fingerprint and capture-policy binding through a currently
 *    synchronous, git-unaware call path is its own design decision.
 *  - It is SYNCHRONOUS and deterministic. The same receipt yields the same
 *    event, byte for byte: no `Date.now()`, no `randomUUID()`. Every value that
 *    could vary is either derived from the receipt or injected by the caller.
 *  - It never hand-rolls the journal's shape rules. The last thing it does is
 *    hand the constructed event to `validateAgentDecisionEvent`, which is the
 *    single source of truth for admissibility. Notably, `advisory-receipt.mjs`'s
 *    `MODEL_ID` pattern additionally admits `/`, which the journal's own `ID`
 *    pattern does not; a receipt carrying such a `modelId` is therefore refused
 *    by the journal with `ADJ-SHAPE` rather than being pre-filtered, rewritten
 *    or normalized here. That cross-module gap is real and is left visible on
 *    purpose -- closing it is a change to one of those two modules' patterns,
 *    not something a translator may paper over.
 *
 * Only the success case is translated. A receipt whose route was exhausted
 * without an answer carries no observed identity at all
 * (`observed.identity === null` by the receipt's own shape rules), and deciding
 * what `kind`/`state` honestly describes "we tried and never got an identity"
 * -- given `ADJ-IDENTITY-SCOPE` restricts identity to
 * `selection`/`escalation`/`fallback` -- is a separate question. It is refused
 * cleanly (`ADE-RECEIPT-UNANSWERED`) instead of guessed at.
 *
 * Nothing here can grant authority: `state` is always `declared`,
 * `relatedHumanDecisionId` and `supersedesEventId` are always `null`. The record
 * says which identity answered, never that the answer was approved or acted on.
 */
import { validateAdvisoryReceipt } from "./advisory-receipt.mjs";
import { validateAgentDecisionEvent } from "./agent-decision-journal.mjs";
import { canonicalSha256 } from "./governance-event.mjs";

/** The two `reasonCode`s this translator emits, one per admissible `kind`. */
export const ADVISORY_DECISION_REASON_CODES = Object.freeze({
  selection: "ADVISORY_ROUTE_SELECTED",
  fallback: "ADVISORY_ROUTE_FALLBACK",
});

/**
 * Why each dimension carries the assurance it carries. Exported so a reviewer
 * (and a test) can check the mapping against the reasoning rather than against
 * a literal buried in a constructor call.
 *
 *  - `runner` is `verified` because this module re-derives it from
 *    `observed.identity.provider` and refuses on mismatch (`ADE-IDENTITY-DRIFT`
 *    below); it is checked here, not taken on trust.
 *  - `adapter` is `verified` because which adapter answered is a fact about this
 *    dispatch's own control flow, not an externally reported claim.
 *  - `model` and `effort` are `reported`: they are the agent's self-report,
 *    accepted upstream by `advisory-coordinator.mjs`'s `identityMatchesRoute`
 *    alias matching. That invariant is real, but it is enforced THERE; this
 *    translator does not reimplement the alias table, so it must not claim to
 *    have verified them.
 *  - `profile` is `reported` and `requested-route`, not `same-dispatch-observed`:
 *    it is caller-supplied routing input that nothing in the dispatch observes
 *    back.
 */
export const IDENTITY_ASSURANCE_BASIS = Object.freeze({
  runner: Object.freeze({ provenance: "same-dispatch-observed", assurance: "verified" }),
  model: Object.freeze({ provenance: "same-dispatch-observed", assurance: "reported" }),
  effort: Object.freeze({ provenance: "same-dispatch-observed", assurance: "reported" }),
  adapter: Object.freeze({ provenance: "same-dispatch-observed", assurance: "verified" }),
  profile: Object.freeze({ provenance: "requested-route", assurance: "reported" }),
});

export class AdvisoryDecisionEventError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "AdvisoryDecisionEventError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new AdvisoryDecisionEventError(code, message);
}

/**
 * Deliberate local duplicate of `advisory-receipt.mjs`'s non-exported
 * `providerForRunner`: a closed two-entry mapping, re-derived here so the drift
 * check below is this module's own conclusion rather than a restatement of the
 * receipt's. Duplicating a trivial closed helper instead of widening another
 * module's export surface follows the convention `human-guard-override.mjs` and
 * `external-command-offer.mjs` already use.
 */
function providerForRunner(runner) {
  return runner === "claude" ? "anthropic" : runner === "codex" ? "openai" : null;
}

/**
 * The candidate this decision is bound to. Shaped and hashed as `{commit, tree}`
 * via `canonicalSha256` -- not a two-key literal of this module's own choosing --
 * because `governance-event-store.mjs`'s agent-origin binding check compares this
 * digest against `canonicalSha256(event.candidate)`, and `event.candidate` is
 * always `{commit, tree}` (the same shape the human/lifecycle streams already
 * bind against). A different preimage shape or hash function here can never
 * equal that check's output for any real value.
 */
function candidateDigest(dispatch) {
  return canonicalSha256({ commit: dispatch.candidateCommit, tree: dispatch.candidateTree });
}

function identityEntry(dimension, value) {
  return { dimension, value, ...IDENTITY_ASSURANCE_BASIS[dimension] };
}

/**
 * Maps one answered advisory receipt onto a validated agent-decision event.
 *
 * @param {object} args
 * @param {object} args.receipt a `pipeline.advisory-receipt.v1` receipt. Re-validated
 *   here rather than trusted: an already-validated object can still be the wrong
 *   object, or a mutable one, by the time it reaches this call.
 * @param {number} [args.nowMs] injected clock. Accepted so no caller is ever tempted
 *   to let this module reach for `Date.now()` itself, and deliberately NOT written
 *   into the event: `validateAgentDecisionEvent`'s base shape -- unlike
 *   `validateCommandOfferEvent`'s -- has no timestamp key at all, and this module
 *   does not widen another module's closed shape to add one.
 * @param {string} [args.eventId] injected event id; defaults to a deterministic id
 *   derived from the receipt, so the same receipt translated twice is recognizable
 *   as one decision rather than two.
 * @returns {object} frozen, validated event. Throws `ADE-*` for a receipt this
 *   translator refuses, or the journal's own `ADJ-*` for an event the journal
 *   refuses -- never a silently coerced result.
 */
export function buildAdvisoryDecisionEvent({ receipt, nowMs, eventId } = {}) {
  void nowMs;
  const revalidated = validateAdvisoryReceipt(receipt);
  if (revalidated?.ok !== true) {
    fail("ADE-RECEIPT-INVALID", `advisory receipt is not valid (${revalidated?.reason ?? "unknown"})`);
  }
  if (receipt.observed.status !== "answered") {
    fail("ADE-RECEIPT-UNANSWERED", "only an answered advisory receipt carries an observed identity to record");
  }
  if (receipt.observed.identity?.provider !== providerForRunner(receipt.configuredRoute.runner)) {
    fail("ADE-IDENTITY-DRIFT", "observed provider does not match the configured runner");
  }
  const kind = receipt.fallback.reason === "none" ? "selection" : "fallback";
  return validateAgentDecisionEvent({
    eventId: eventId ?? `${receipt.receiptId}-decision`,
    kind,
    // The first and only event for this selection: no supersession chain exists
    // yet. The A-AC-02 transitions (verified/contradicted/expired/invalidated/
    // superseded) are later, linked events this module does not build.
    state: "declared",
    reasonCode: ADVISORY_DECISION_REASON_CODES[kind],
    candidateDigest: candidateDigest(receipt.dispatch),
    relatedHumanDecisionId: null,
    supersedesEventId: null,
    // No `assumptionState`: A-AC-05 is about the provenance of an identity, not
    // the epistemic status of a factual claim, and the two axes never collapse.
    identity: [
      identityEntry("runner", receipt.configuredRoute.runner),
      identityEntry("model", receipt.observed.identity.modelId),
      identityEntry("effort", receipt.observed.identity.effort),
      identityEntry("adapter", receipt.adapter),
      identityEntry("profile", receipt.profile),
    ],
  });
}
