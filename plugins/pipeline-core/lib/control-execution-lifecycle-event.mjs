// SPDX-License-Identifier: SUL-1.0
/**
 * PHX L-AC-01 (dispatch kind): the pure translator from a validated
 * `pipeline.control-execution-exchange.v1` record (`control-execution-exchange.mjs`)
 * to a closed lifecycle governance event (`lifecycle-governance-events.mjs`).
 *
 * L-AC-01 names nine event kinds. This module deliberately produces exactly ONE
 * of them -- `dispatch` -- and refuses every other exchange class cleanly. The
 * reason is not budget: each remaining kind needs its own honest projection of a
 * DIFFERENT source vocabulary (`progress`, `terminal`, `cancellation`,
 * `verification`, `review-handoff` each carry statuses whose lifecycle
 * counterpart is a separate judgement), and inventing five more mappings from a
 * single wired producer would ship four untested translations behind one tested
 * one. `advisory-decision-event.mjs` sets the same precedent: translate the case
 * that has a real caller, refuse the rest by name.
 *
 * Three boundaries, matching that precedent:
 *
 *  - It is a MAPPER, not a writer. No file, clock, git or store access lives
 *    here; the caller supplies the exchange and owns persistence.
 *  - It is SYNCHRONOUS and deterministic. The same exchange yields the same
 *    event, byte for byte, including the derived `eventId`, so re-projecting one
 *    admission twice is recognizable as one event rather than two.
 *  - It never hand-rolls the target shape. The last thing it does is hand the
 *    constructed value to `validateLifecycleGovernanceEvent`, which stays the
 *    single source of truth for admissibility.
 *
 * A lifecycle record is never authority: nothing here can approve, gate or
 * complete anything. `invalidatesEventId` and `supersedesEventId` are always
 * `null` -- this is the FIRST event of a dispatch, so no supersession chain
 * exists yet, and `candidate-invalidation` (the only kind that may carry an
 * `invalidatesEventId`) is not a kind this module produces.
 */
import { createHash } from "node:crypto";

import { canonicalJson, validateControlExecutionExchange } from "./control-execution-exchange.mjs";
import { validateLifecycleGovernanceEvent } from "./lifecycle-governance-events.mjs";

/** The exchange event class this translator projects. */
export const LIFECYCLE_DISPATCH_SOURCE_CLASS = "admission";

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
 * one admission collide (desirable) while two distinct admissions cannot. The
 * domain separator keeps this digest from ever equalling another family's hash
 * over the same body. 68 characters, inside the lifecycle `ID` bound of 128.
 */
function derivedEventId(body) {
  const digest = createHash("sha256").update(`pipeline.lifecycle-dispatch-event.v1\0${canonicalJson(body)}`, "utf8").digest("hex");
  return `lge-${digest}`;
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
  const revalidated = validateControlExecutionExchange(exchange);
  if (revalidated?.ok !== true) {
    fail("CLE-EXCHANGE-INVALID", `control/execution exchange is not valid (${revalidated?.code ?? "unknown"})`);
  }
  if (exchange.event.class !== LIFECYCLE_DISPATCH_SOURCE_CLASS) {
    fail("CLE-CLASS-UNSUPPORTED", `only the ${LIFECYCLE_DISPATCH_SOURCE_CLASS} class projects onto a dispatch lifecycle event`);
  }
  // An invalidated candidate is NOT a dispatch event with a healthy status: it is
  // a `candidate-invalidation`, which the lifecycle schema requires to carry the
  // id of the event it invalidates. This translator has no such link to offer, so
  // it refuses rather than emitting an event that reads as a live dispatch on a
  // candidate that is already gone.
  if (exchange.package.invalidation.state !== "valid") {
    fail("CLE-EXCHANGE-INVALIDATED", "an invalidated exchange projects onto a candidate-invalidation event, not a dispatch event");
  }
  const projection = LIFECYCLE_DISPATCH_PROJECTION[exchange.event.status];
  if (projection === undefined) {
    fail("CLE-STATUS-UNSUPPORTED", `admission status ${String(exchange.event.status)} has no lifecycle projection`);
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
    eventId: eventId ?? derivedEventId({ kind: "dispatch", status: projection.status, reasonCode: projection.reasonCode, correlation, candidate }),
    kind: "dispatch",
    status: projection.status,
    reasonCode: projection.reasonCode,
    correlation,
    candidate,
    invalidatesEventId: null,
    supersedesEventId: null,
  });
}
