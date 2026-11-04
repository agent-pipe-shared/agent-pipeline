// SPDX-License-Identifier: SUL-1.0
/**
 * Stable codes for the push-gate evidence freshness verdicts (candidate 19, D4b/E3 order of work, step 2a; see
 * docs/adr/draft-authority-carry-forward-and-signed-reconcile-commit.md, "Proposed amendment of 2026-11-04").
 *
 * The freshness comparison is written out by hand in several places and its failures are free text; a consumer such as
 * scripts/push-gate-satisfiability.mjs classified them by substring. A code next to the message lets a consumer stop reading prose.
 * The messages are NOT changed by this module. A result that carries no code (older checkers, injected test doubles) is still
 * classified by the consumer's prose fallback, so adding a code can only make a classification more exact, never different.
 */

export const EVIDENCE_FRESHNESS_CODES = Object.freeze({
  MISSING: "EF-MISSING",
  EXIT_NOT_ZERO: "EF-EXIT-NOT-ZERO",
  STALE_COMMIT: "EF-STALE-COMMIT",
  NOT_PUSH_BOUNDARY: "EF-NOT-PUSH-BOUNDARY",
});

const STATUS_BY_CODE = Object.freeze({
  [EVIDENCE_FRESHNESS_CODES.MISSING]: "missing",
  [EVIDENCE_FRESHNESS_CODES.EXIT_NOT_ZERO]: "verify-failed",
  [EVIDENCE_FRESHNESS_CODES.STALE_COMMIT]: "stale-commit",
});

/**
 * The ordered failure codes of one evidence record (candidate 19, D4b/E3 order of work, step 2b). It is the one place that states the
 * order and the conditions; `scripts/push-prepare.mjs` and `hooks/guard-push.mjs` keep their own messages, remedies and I/O and take
 * only the verdict from here. Order: missing, exit code, stale commit, push boundary.
 *
 * `promoted` and `satisfiesPushBoundary` are thunks so that a caller runs its promotion validation only for a record whose commit
 * differs from the expected one and its boundary check only for a Verify record, exactly as the two hand-written copies did.
 * `firstOnly` stops at the first failure (push-prepare reports one failure, guard-push collects them all).
 *
 * @param {object} input
 * @param {object|null|undefined} input.data the parsed evidence record
 * @param {string} input.expectedCommit the commit the record has to be bound to (HEAD, or the pushed source commit)
 * @param {() => boolean} [input.promoted] true when a release-promotion envelope (or, later, a carry-forward) vouches for a differing commit
 * @param {boolean} [input.isVerify] true for the Verify record, which has to satisfy the push boundary
 * @param {() => boolean} [input.satisfiesPushBoundary]
 * @param {boolean} [input.firstOnly]
 * @returns {string[]} codes from EVIDENCE_FRESHNESS_CODES, empty when the record is fresh and green
 */
export function evidenceFreshnessFailureCodes({ data, expectedCommit, promoted = () => false, isVerify = false, satisfiesPushBoundary = () => true, firstOnly = false } = {}) {
  if (data === null || data === undefined) return [EVIDENCE_FRESHNESS_CODES.MISSING];
  const codes = [];
  const add = (code) => { codes.push(code); return firstOnly; };
  if (data.exitCode !== 0 && add(EVIDENCE_FRESHNESS_CODES.EXIT_NOT_ZERO)) return codes;
  if (data.commit !== expectedCommit && !promoted() && add(EVIDENCE_FRESHNESS_CODES.STALE_COMMIT)) return codes;
  if (isVerify && !satisfiesPushBoundary()) add(EVIDENCE_FRESHNESS_CODES.NOT_PUSH_BOUNDARY);
  return codes;
}

/** The satisfiability status a code stands for, or null when the code is absent, unknown or has no dedicated status. */
export function satisfiabilityStatusForFreshnessCode(code) {
  return typeof code === "string" && Object.hasOwn(STATUS_BY_CODE, code) ? STATUS_BY_CODE[code] : null;
}
