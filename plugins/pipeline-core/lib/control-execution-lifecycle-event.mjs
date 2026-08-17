// SPDX-License-Identifier: SUL-1.0
/**
 * PHX L-AC-01 (`dispatch` and `status` kinds): the pure translators from a
 * validated `pipeline.control-execution-exchange.v1` record
 * (`control-execution-exchange.mjs`) to a closed lifecycle governance event
 * (`lifecycle-governance-events.mjs`).
 *
 * L-AC-01 names nine event kinds. This module produces exactly the TWO that have
 * a real producer in this repository, and refuses every other exchange class
 * cleanly:
 *
 *  - `dispatch` from the `admission` class -- `pipeline-state.mjs continuity-cas`
 *    is the only transaction that installs a `queueHead.dispatch`.
 *  - `status` from the `terminal` class -- `pipeline-state.mjs
 *    continuity-integrate-final` is the only transaction that acknowledges a
 *    delivered final for the dispatch currently at the queue head, and its
 *    acknowledgement carries a real `finalOutcome` (`succeeded`/`failed`,
 *    `continuity-host-adapter.mjs`) rather than a guess about why a dispatch
 *    disappeared.
 *
 * The remaining kinds stay unbuilt for the same reason `dispatch` was first:
 * each needs its own honest projection of a DIFFERENT source vocabulary
 * (`progress`, `cancellation`, `verification`, `review-handoff` each carry
 * statuses whose lifecycle counterpart is a separate judgement), and inventing
 * mappings without a producer would ship untested translations behind tested
 * ones. `advisory-decision-event.mjs` sets the same precedent: translate the case
 * that has a real caller, refuse the rest by name.
 *
 * A projection covers its source class COMPLETELY even where the wired caller
 * exercises only part of it -- the caller of `dispatch` only ever emits
 * `admitted`, and the caller of `status` only ever emits `succeeded`/`failed`,
 * because those are the only outcomes the continuity state machine can observe.
 * Completeness over the source vocabulary is a mapper's duty; producing a status
 * no caller can observe is not something a mapper can do on its own.
 *
 * Three boundaries, matching that precedent:
 *
 *  - It is a MAPPER, not a writer. No file, clock, git or store access lives
 *    here; the caller supplies the exchange and owns persistence.
 *  - It is SYNCHRONOUS and deterministic. The same exchange yields the same
 *    event, byte for byte, including the derived `eventId`, so re-projecting one
 *    admission or one final twice is recognizable as one event rather than two.
 *  - It never hand-rolls the target shape. The last thing it does is hand the
 *    constructed value to `validateLifecycleGovernanceEvent`, which stays the
 *    single source of truth for admissibility.
 *
 * A lifecycle record is never authority: nothing here can approve, gate or
 * complete anything. `invalidatesEventId` and `supersedesEventId` are always
 * `null` -- a `status` event does not supersede the `dispatch` event of the same
 * dispatch (both remain true observations of different moments, and this module
 * is given no prior event id to point at), and `candidate-invalidation` (the only
 * kind that may carry an `invalidatesEventId`) is not a kind this module
 * produces.
 */
import { createHash } from "node:crypto";

import { canonicalJson, validateControlExecutionExchange } from "./control-execution-exchange.mjs";
import { validateLifecycleGovernanceEvent } from "./lifecycle-governance-events.mjs";

/** The exchange event class that projects onto a `dispatch` lifecycle event. */
export const LIFECYCLE_DISPATCH_SOURCE_CLASS = "admission";

/** The exchange event class that projects onto a `status` lifecycle event. */
export const LIFECYCLE_STATUS_SOURCE_CLASS = "terminal";

/**
 * The closed projection of an `admission` exchange status onto the lifecycle
 * vocabulary. Every one of the class's four statuses is covered, deliberately:
 *
 *  - `admitted`  -> `active`: the dispatch exists and is running. Not
 *    `completed`; an admission says nothing about an outcome.
 *  - `rejected`  -> `failed`: admission was refused. `cancelled` would claim a
 *    cancellation event that never happened.
 *  - `unknown` / `unavailable` project onto their own lifecycle statuses rather
 *    than collapsing into `failed`. L-AC-05 forbids inventing a total order or a
 *    successful completion out of a gap; it equally forbids inventing a failure.
 */
export const LIFECYCLE_DISPATCH_PROJECTION = Object.freeze({
  admitted: Object.freeze({ status: "active", reasonCode: "DISPATCH_ADMITTED" }),
  rejected: Object.freeze({ status: "failed", reasonCode: "DISPATCH_REJECTED" }),
  unknown: Object.freeze({ status: "unknown", reasonCode: "DISPATCH_ADMISSION_UNKNOWN" }),
  unavailable: Object.freeze({ status: "unavailable", reasonCode: "DISPATCH_ADMISSION_UNAVAILABLE" }),
});

/**
 * The closed projection of a `terminal` exchange status onto the lifecycle
 * vocabulary. All five statuses of the class are covered:
 *
 *  - `succeeded` -> `completed`: the dispatch ended and its final was accepted.
 *  - `failed`    -> `failed`.
 *  - `cancelled` -> `cancelled`: never folded into `failed`. A cancellation is
 *    the one distinction L-AC-01's `cancellation` trigger rests on, so
 *    collapsing it here would destroy that trigger's only evidence.
 *  - `unknown` / `unavailable` keep their own statuses, for the same reason the
 *    admission projection does: a gap is not an outcome.
 */
export const LIFECYCLE_STATUS_PROJECTION = Object.freeze({
  succeeded: Object.freeze({ status: "completed", reasonCode: "DISPATCH_SUCCEEDED" }),
  failed: Object.freeze({ status: "failed", reasonCode: "DISPATCH_FAILED" }),
  cancelled: Object.freeze({ status: "cancelled", reasonCode: "DISPATCH_CANCELLED" }),
  unknown: Object.freeze({ status: "unknown", reasonCode: "DISPATCH_TERMINAL_UNKNOWN" }),
  unavailable: Object.freeze({ status: "unavailable", reasonCode: "DISPATCH_TERMINAL_UNAVAILABLE" }),
});

export class ControlExecutionLifecycleEventError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ControlExecutionLifecycleEventError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new ControlExecutionLifecycleEventError(code, message);
}

/**
 * A deterministic id over exactly the retained identity, so two projections of
 * one source event collide (desirable) while two distinct ones cannot. The
 * per-kind domain separator keeps this digest from ever equalling another
 * family's hash over the same body. 68 characters, inside the lifecycle `ID`
 * bound of 128.
 */
function derivedEventId(family, body) {
  const digest = createHash("sha256").update(`${family}\0${canonicalJson(body)}`, "utf8").digest("hex");
  return `lge-${digest}`;
}

/**
 * The one projection both kinds share: re-validate, refuse an unsupported class,
 * refuse an invalidated candidate, project the status, and let the lifecycle
 * schema decide admissibility. Kept as a single body so the two kinds cannot
 * drift apart in what they refuse.
 */
function projectLifecycleEvent({ exchange, eventId, kind, sourceClass, projection, idFamily }) {
  const revalidated = validateControlExecutionExchange(exchange);
  if (revalidated?.ok !== true) {
    fail("CLE-EXCHANGE-INVALID", `control/execution exchange is not valid (${revalidated?.code ?? "unknown"})`);
  }
  if (exchange.event.class !== sourceClass) {
    fail("CLE-CLASS-UNSUPPORTED", `only the ${sourceClass} class projects onto a ${kind} lifecycle event`);
  }
  // An invalidated candidate is NOT a live dispatch with a healthy status: it is
  // a `candidate-invalidation`, which the lifecycle schema requires to carry the
  // id of the event it invalidates. This module has no such link to offer, so it
  // refuses rather than emitting an event that reads as a dispatch or an outcome
  // on a candidate that is already gone.
  if (exchange.package.invalidation.state !== "valid") {
    fail("CLE-EXCHANGE-INVALIDATED", "an invalidated exchange projects onto a candidate-invalidation event, not a dispatch or status event");
  }
  const projected = projection[exchange.event.status];
  if (projected === undefined) {
    fail("CLE-STATUS-UNSUPPORTED", `${sourceClass} status ${String(exchange.event.status)} has no lifecycle projection`);
  }
  // Exactly the L-AC-02 identity set the exchange carries, moved across without
  // widening or dropping a field.
  const correlation = {
    packageId: exchange.package.packageId,
    dispatchId: exchange.orchestration.dispatchId,
    attemptId: exchange.orchestration.attemptId,
    workerId: exchange.orchestration.workerId,
    correlationId: exchange.orchestration.correlationId,
    queueRevision: exchange.package.queueRevision,
  };
  const candidate = { commit: exchange.package.candidateCommit, tree: exchange.package.candidateTree };
  return validateLifecycleGovernanceEvent({
    eventId: eventId ?? derivedEventId(idFamily, { kind, status: projected.status, reasonCode: projected.reasonCode, correlation, candidate }),
    kind,
    status: projected.status,
    reasonCode: projected.reasonCode,
    correlation,
    candidate,
    invalidatesEventId: null,
    supersedesEventId: null,
  });
}

/**
 * Projects one control/execution exchange admission onto a validated lifecycle
 * governance event of kind `dispatch`.
 *
 * @param {object} args
 * @param {object} args.exchange a `pipeline.control-execution-exchange.v1` record.
 *   Re-validated here rather than trusted: an already-validated object can still be
 *   the wrong object by the time it reaches this call.
 * @param {string} [args.eventId] injected event id; defaults to the deterministic
 *   id derived from the retained identity.
 * @returns {object} frozen, validated lifecycle event. Throws `CLE-*` for an
 *   exchange this translator refuses, or the lifecycle schema's own `LGE-*` for a
 *   value that schema refuses -- never a silently coerced result.
 */
export function buildLifecycleDispatchEvent({ exchange, eventId } = {}) {
  return projectLifecycleEvent({
    exchange,
    eventId,
    kind: "dispatch",
    sourceClass: LIFECYCLE_DISPATCH_SOURCE_CLASS,
    projection: LIFECYCLE_DISPATCH_PROJECTION,
    idFamily: "pipeline.lifecycle-dispatch-event.v1",
  });
}

/**
 * Projects one control/execution exchange TERMINAL observation onto a validated
 * lifecycle governance event of kind `status`.
 *
 * The identity in the exchange is the identity of the dispatch that ended, so the
 * caller must build the exchange from the state that still carries that dispatch
 * at its queue head; an exchange built from the post-transition state would carry
 * either no dispatch at all (the shape refuses it) or the identity of the NEXT
 * one, which would attribute one worker's outcome to another.
 *
 * @param {object} args
 * @param {object} args.exchange a `pipeline.control-execution-exchange.v1` record
 *   of class `terminal`. Re-validated here rather than trusted.
 * @param {string} [args.eventId] injected event id; defaults to the deterministic
 *   id derived from the retained identity.
 * @returns {object} frozen, validated lifecycle event. Throws `CLE-*`/`LGE-*`
 *   exactly like the dispatch projection.
 */
export function buildLifecycleStatusEvent({ exchange, eventId } = {}) {
  return projectLifecycleEvent({
    exchange,
    eventId,
    kind: "status",
    sourceClass: LIFECYCLE_STATUS_SOURCE_CLASS,
    projection: LIFECYCLE_STATUS_PROJECTION,
    idFamily: "pipeline.lifecycle-status-event.v1",
  });
}
