// SPDX-License-Identifier: SUL-1.0
/**
 * PHX R-AC-08 / R-AC-10: the production producer for the one `command-offer`
 * event the journal never had a real writer for -- the `offered` event that must
 * exist BEFORE a guard hands a human a copy-only command to run outside the
 * session.
 *
 * `external-command-offer.mjs` already implements every later transition
 * (attempt, acknowledge, recovery, outcome), each of which takes an existing
 * offer and produces the next event; nothing in production ever constructed the
 * initial state. This module constructs exactly that state, for exactly the
 * three external-operator routes `human-guard-override.mjs`'s `recoveryRoute()`
 * can return, and nothing else.
 *
 * Two deliberate boundaries:
 *
 *  - It is a MAPPER, not a guard. It never decides whether a command is
 *    refused, never writes a file, and never reaches for a clock, a repository,
 *    or a hash function: every digest and the timestamp are supplied by the
 *    caller, which already holds them (`human-guard-override.mjs` computes them
 *    with its own existing `sha()` helper over canonical JSON). That is what
 *    keeps the mapping testable without a repository and keeps a second hashing
 *    convention from appearing in this family.
 *  - It is SYNCHRONOUS, unlike `external-command-offer.mjs`'s `async` recorders.
 *    The seam it serves is a PreToolUse guard path called synchronously by four
 *    production hooks; making the producer async would make the seam async. The
 *    append/readback discipline is mirrored from `appendValidated`
 *    (`external-command-offer.mjs:18`) field for field -- a returned thenable is
 *    therefore not a readback and fails closed as `GHO-READBACK`, rather than
 *    being silently awaited-never.
 *
 * Nothing here can grant authority: `authorityRequirement` is always
 * `not-required` and `relatedHumanDecisionId` always `null`, because these
 * routes return before any override request or human decision exists. The
 * record says a command was handed over, never that one was permitted or run.
 */
import { validateCommandOfferEvent } from "./agent-decision-journal.mjs";

const SHA256 = /^[a-f0-9]{64}$/u;
const EVENT_ID_PREFIX = "guard-handoff-offer:";
const OPERATION_CLASS_PREFIX = "external-operator-handoff:";

/** The exact three `recoveryRoute()` codes whose status is `external-operator-required`. */
export const GUARD_HANDOFF_OFFER_CODES = Object.freeze([
  "HGO-EXTERNAL-SENSITIVE-INPUT",
  "HGO-EXTERNAL-PROJECT-BOUNDARY",
  "HGO-EXTERNAL-ADAPTER-BOUNDARY",
]);

/** The four omissions `validateCommandOfferEvent` makes mandatory; this seam adds none. */
export const GUARD_HANDOFF_OFFER_OMISSIONS = Object.freeze([
  "raw-command",
  "arguments",
  "private-coordinates",
  "unrestricted-output",
]);

/** Identity of the redaction policy the offer above is emitted under. */
export const GUARD_HANDOFF_REDACTION_POLICY = "pipeline.guard-handoff-offer-redaction.v1";

/**
 * R-AC-10: what a route carries INSTEAD of `nextAction` when the offer could not
 * be journaled. The human is told the guard refused and is handed no command.
 */
export const GUARD_HANDOFF_JOURNAL_REFUSAL = "HGO-JOURNAL-UNAVAILABLE";

export const GUARD_HANDOFF_OFFER_RECEIPT_SCHEMA = "pipeline.guard-handoff-offer-receipt.v1";

export class GuardHandoffOfferError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "GuardHandoffOfferError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new GuardHandoffOfferError(code, message);
}

function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, keys) {
  return object(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function digest(value) {
  return typeof value === "string" && SHA256.test(value);
}

/**
 * A bounded operation class derived from the tool name only. The raw command,
 * its argv, and its targets are structurally excluded from this record by
 * `omissions`; the operation class must not smuggle any of them back in, so it
 * is built from the tool name alone, normalized to the journal's own `ID`
 * pattern rather than trusted to already match it.
 */
function operationClass(toolName) {
  const normalized = String(toolName ?? "").replace(/[^A-Za-z0-9._-]/gu, "_").slice(0, 64);
  return `${OPERATION_CLASS_PREFIX}${normalized === "" ? "unknown" : normalized}`;
}

/**
 * Maps one external-operator route plus the context the denying seam already
 * holds onto a validated `command-offer` event in state `offered`.
 *
 * `eventId` is deterministic: the same denial, replayed, yields the same id, so
 * a duplicate hand-off is recognizable downstream rather than looking like a
 * second, distinct offer. It is derived from the route's own
 * `toolInputSha256` -- the digest the route ALREADY computes and already hands
 * to the human -- so this record introduces no digest the seam did not have.
 *
 * @returns {object} frozen, validated event (throws `GHO-*` or the journal's own
 *   `ADJ-COMMAND-OFFER` rather than returning an invalid one).
 */
export function buildGuardHandoffOfferEvent({
  route,
  toolName,
  candidateDigest,
  repositoryFingerprint,
  scopeDigest,
  policyDigest,
  redactionPolicyDigest,
  occurredAtEpochMs,
} = {}) {
  if (!object(route)
    || route.status !== "external-operator-required"
    || !GUARD_HANDOFF_OFFER_CODES.includes(route.code)) {
    fail("GHO-ROUTE", "guard hand-off offers are built only for external-operator routes");
  }
  const toolInputSha256 = route.nextAction?.action?.toolInputSha256;
  if (!digest(toolInputSha256)) fail("GHO-ROUTE-DIGEST", "external-operator route carries no bound action digest");
  if (![candidateDigest, repositoryFingerprint, scopeDigest, policyDigest, redactionPolicyDigest].every(digest)) {
    fail("GHO-DIGEST", "guard hand-off offer context digests are invalid");
  }
  if (!Number.isFinite(occurredAtEpochMs) || occurredAtEpochMs < 0) {
    fail("GHO-OCCURRED-AT", "guard hand-off offer occurrence time is invalid");
  }
  return validateCommandOfferEvent({
    eventId: `${EVENT_ID_PREFIX}${route.code}:${toolInputSha256}`,
    kind: "command-offer",
    state: "offered",
    reasonCode: route.code,
    candidateDigest,
    relatedHumanDecisionId: null,
    supersedesEventId: null,
    offerOrigin: "pipeline-initiated",
    operation: {
      operationClass: operationClass(toolName),
      version: null,
      governedArtifactSha256: null,
    },
    target: { repositoryFingerprint, scopeDigest },
    // The guard refused this exact action because it cannot attest its effect;
    // that is never the `non-authoritative` classification that unlocks
    // `acknowledgeNonMaterialOfferWithoutJournal` (external-command-offer.mjs:102).
    sideEffectClass: "guard-bypass",
    // These routes return before any override request, audit entry, or human
    // decision exists, so there is no decision id this offer could correlate to.
    authorityRequirement: "not-required",
    policyDigest,
    redactionPolicyDigest,
    executionAssurance: "not-applicable",
    omissions: [...GUARD_HANDOFF_OFFER_OMISSIONS],
    offerEventId: null,
    preEvidenceDigest: null,
    postEvidenceDigest: null,
    // The offer itself mutates nothing, so no cleanup is required and
    // `requiredCleanup` is deliberately absent (ADJ-COMMAND-CLEANUP-SCOPE).
    recoverability: "not-applicable",
    occurredAtEpochMs: Math.trunc(occurredAtEpochMs),
  });
}

/**
 * Appends the offer and verifies the readback before any caller may present the
 * command it describes. Mirrors `appendValidated`
 * (`external-command-offer.mjs:18`): a mismatched echo or an `integrity` other
 * than `"verified"` is a failure, never a warning.
 */
export function recordGuardHandoffOffer({ offer, append } = {}) {
  const event = validateCommandOfferEvent(offer);
  if (event.state !== "offered") fail("GHO-OFFER-STATE", "a guard hand-off offer must be recorded in state offered");
  if (typeof append !== "function") fail("GHO-APPEND", "journaling the guard hand-off offer is unavailable");
  const readback = append(event);
  if (!exactKeys(readback, ["eventId", "candidateDigest", "integrity"])
    || readback.eventId !== event.eventId
    || readback.candidateDigest !== event.candidateDigest
    || readback.integrity !== "verified") {
    fail("GHO-READBACK", "guard hand-off offer append readback is not verified");
  }
  return Object.freeze({
    schema: GUARD_HANDOFF_OFFER_RECEIPT_SCHEMA,
    authority: "non-authoritative",
    status: "offered",
    eventId: event.eventId,
    candidateDigest: event.candidateDigest,
  });
}
