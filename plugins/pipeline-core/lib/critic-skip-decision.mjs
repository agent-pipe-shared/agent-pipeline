// SPDX-License-Identifier: SUL-1.0
/**
 * Critic-skip decision: making "not required" a checkable record, not a silent absence.
 *
 * WHY THIS EXISTS. The review protocol's §2.1 trigger matrix decides, per dispatch, whether a
 * Critic review is required. When it IS required, the Critic dispatch itself produces evidence
 * (a findings report, a receipt -- the existing mechanism, untouched here). When it is NOT
 * required (rows resolving to no mandatory Critic), nothing was ever produced that says so --
 * so a repository with zero Critic artifacts is indistinguishable from the outside between
 * "the risk tier genuinely never required one" and "one was required and simply never
 * happened" (backlog/items/2026-08-29-critic-skip-not-an-explicit-logged-decision.md).
 *
 * This module is the smaller of the two shapes that item's own proposal names: a field on the
 * existing dispatch record (`evidence/dispatch-record-<TASK_ID>.json`), not a new ledger file.
 * A dispatch record is already keyed one-per-work-package by its own `taskId`, so a `criticSkip`
 * field on it already answers "which work package" for free -- no second identifier to invent
 * or keep in sync.
 *
 * SHAPE. A dispatch record carries an OPTIONAL `criticSkip` field once its dispatcher has
 * evaluated the trigger matrix and determined a Critic is not required:
 *
 *   "criticSkip": {
 *     "schema": "pipeline.critic-skip-decision.v1",
 *     "reason": "T5: rigor 0, risk low, no risk flag"   // optional, recommended
 *   }
 *
 * Presence of a well-formed `criticSkip` object IS the logged decision; `reason` is a plus, not
 * itself required (the backlog item's own Acceptance only asks for "which work package" and
 * "that a skip determination was made").
 *
 * FORWARD-LOOKING ONLY, BY CONSTRUCTION, NOT BY DATE. Every function below that counts "how
 * many dispatched work packages logged a decision" counts ONLY records that actually carry the
 * `criticSkip` field. A record from before this mechanism existed carries no such field, so it
 * is never counted, in either direction -- not as "covered" and not as "missing". This is the
 * same convention `dispatch-authorship-verify.mjs` already uses for a record predating a later
 * convention (its own `agentType`/model-check dimension is silent, not failing, when the field
 * is absent): absence of a marker is read as "not applicable", never as "violation". It is what
 * makes the third Acceptance bullet ("existing dispatches ... are not retroactively flagged")
 * hold without needing any date/ruleset-SHA comparison logic at all.
 *
 * WHAT IS DEFERRED, STATED PLAINLY. `evaluateCriticSkipCoverage` is a small pure function over
 * three numbers; it does not itself scan `evidence/` for dispatch records or for Critic
 * artifacts, and it is not wired into any Verify suite. Building that repository-scanning
 * wiring (what counts as a "Critic artifact" file, which records are "in scope" for a given
 * review, actual suite registration) is real, disclosed, smaller follow-up work -- not done
 * here. This module supplies the checkable primitive that follow-up would call.
 */

/** The schema tag a well-formed `criticSkip` decision object carries. */
export const CRITIC_SKIP_SCHEMA = "pipeline.critic-skip-decision.v1";

/**
 * True iff `record` carries a well-formed `criticSkip` decision object. Deliberately permissive
 * about `schema`/`reason` (both optional) -- a decision without either still counts, because the
 * backlog item's own Acceptance requires only "a skip determination was made", not the schema
 * tag or a reason string.
 *
 * @param {object} record - a parsed dispatch-record JSON object (or any record-shaped value)
 * @returns {boolean}
 */
export function hasCriticSkipDecision(record) {
  return Boolean(record && typeof record === "object" && record.criticSkip && typeof record.criticSkip === "object");
}

/**
 * Count how many records in `records` carry a logged skip decision. Records without the field
 * (old-shaped, pre-mechanism, or simply not evaluated) contribute nothing -- see the module
 * doc's "FORWARD-LOOKING ONLY" note.
 *
 * @param {object[]} records
 * @returns {number}
 */
export function countCriticSkipDecisions(records) {
  if (!Array.isArray(records)) return 0;
  return records.filter((record) => hasCriticSkipDecision(record)).length;
}

/**
 * The pure coverage rule (DoD's own two named scenarios), over three already-computed numbers:
 *
 *   - Any Critic artifact present at all: nothing to distinguish, never a finding.
 *   - Zero dispatched work in scope: nothing to evaluate, never a finding.
 *   - Zero Critic artifacts AND every piece of dispatched work in scope logged a skip decision
 *     (`skipRecordCount >= dispatchedWorkCount`): "N skip records matching N pieces of
 *     dispatched work" -- legitimately never required, not a finding.
 *   - Zero Critic artifacts AND some dispatched work in scope has neither Critic evidence nor a
 *     logged skip decision: "Critic evidence expected but missing" -- a finding.
 *
 * @param {object} params
 * @param {number} params.dispatchedWorkCount - work packages considered IN SCOPE for this
 *   check (caller's/follow-up wiring's responsibility to have already excluded anything
 *   pre-mechanism; see `countCriticSkipDecisions`'s note on how that exclusion falls out
 *   naturally when this count is itself derived from `criticSkip`-field presence).
 * @param {number} params.criticArtifactCount - count of Critic evidence artifacts found for
 *   the same scope.
 * @param {number} params.skipRecordCount - count of records in that scope carrying a logged
 *   skip decision (`countCriticSkipDecisions`'s return value, typically).
 * @returns {{finding: boolean, reason: string}}
 */
export function evaluateCriticSkipCoverage({ dispatchedWorkCount, criticArtifactCount, skipRecordCount }) {
  const total = Number(dispatchedWorkCount) || 0;
  const artifacts = Number(criticArtifactCount) || 0;
  const skipped = Number(skipRecordCount) || 0;

  if (artifacts > 0) {
    return { finding: false, reason: `${artifacts} critic artifact(s) present; skip-coverage check does not apply` };
  }
  if (total === 0) {
    return { finding: false, reason: "no dispatched work in scope to evaluate" };
  }
  if (skipped >= total) {
    return {
      finding: false,
      reason: `${skipped} skip record(s) matching ${total} piece(s) of dispatched work -- legitimately never required`,
    };
  }
  return {
    finding: true,
    reason: `critic evidence expected but missing: ${total - skipped} of ${total} dispatched work package(s) have neither critic evidence nor a logged skip decision`,
  };
}

/**
 * Convenience wrapper: derive `dispatchedWorkCount` and `skipRecordCount` from an array of
 * dispatch-record-shaped objects, both via `hasCriticSkipDecision`, then apply
 * `evaluateCriticSkipCoverage`. Because both counts come from the SAME presence check, a record
 * with no `criticSkip` field contributes to neither -- so passing in a mix of old-shaped and
 * new-shaped records never manufactures a false finding out of the old ones (see the module
 * doc's "FORWARD-LOOKING ONLY, BY CONSTRUCTION" note; this is the function that note's guarantee
 * is actually realized in).
 *
 * @param {object} params
 * @param {object[]} params.records - dispatch-record-shaped objects to consider
 * @param {number} params.criticArtifactCount - count of Critic evidence artifacts found for
 *   the same scope
 * @returns {{finding: boolean, reason: string}}
 */
export function evaluateCriticSkipCoverageFromRecords({ records, criticArtifactCount }) {
  const list = Array.isArray(records) ? records : [];
  const skipRecordCount = countCriticSkipDecisions(list);
  const dispatchedWorkCount = skipRecordCount;
  return evaluateCriticSkipCoverage({ dispatchedWorkCount, criticArtifactCount, skipRecordCount });
}
