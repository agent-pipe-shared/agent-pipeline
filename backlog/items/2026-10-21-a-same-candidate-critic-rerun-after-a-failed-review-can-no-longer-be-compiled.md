---
schema: pipeline.backlog-item.v1
id: pipeline.a-same-candidate-critic-rerun-after-a-failed-review-can-no-longer-be-compiled
type: defect
owner: pipeline
status: open
created: 2026-10-21
source: "repair of lib/critic-review-lineage.test.mjs (2026-10-21): the test fixtures were stale, and the repair exposed a product-side inconsistency"
sprint: none
done_when: manual
---

# A same-candidate Critic rerun after a failed review can no longer be compiled

## Description

`admitReviewAttempt` (`lib/review-economy.mjs`) admits only a `delta` attempt from
review round 2 on, and a delta attempt must carry invalidation `none`. In
`lib/critic-review-lineage.mjs`, `transitionCode` still requires
`invalidation.reason === "prior-review-failure"` for a same-candidate rerun (no new
correction commits). The two rules cannot both hold: after a failed or timed-out
review, a rerun over the SAME candidate has no admissible attempt shape, so it cannot
be compiled; the only way forward is a new correction commit. Likewise
`compileReleaseCriticReviewScope` mode `broad-correction` and the `expectedInvalidation`
fallbacks (unknown-changed-path, trust-boundary-change) are reachable only for
historical records.

The repaired test (`CRL09`, `CRL10`, `CRL14`) now pins the retained historical shape
through a re-sealed test helper, so compile-time coverage of "broad review with typed
invalidation" is gone.

## Acceptance

- The owner decides which rule wins: either a failed-review rerun over the same
  candidate gets an admissible attempt shape (a delta attempt with a typed
  `prior-review-failure` invalidation), or the unreachable branches are removed and the
  retained-record validators say so.
- A test covers the chosen path by compiling, not by re-sealing a record.
- No change to the Spec or PRD is needed or implied.
