---
schema: pipeline.backlog-item.v1
id: pipeline.critic-follow-up-round-that-moves-a-trust-boundary-has-no-route
type: defect
owner: pipeline
status: open
created: 2026-10-30
priority: P1
release: 0.7.0
sprint: alfred
source: "Consumer finding 2026-10-30 (Elephant session on 0.7.0+claude.20261030114801.c23df26); PO direction 2026-10-30: when a diff round is no longer admissible because too much changed, a new full run must be admissible, end to end, with no chain of follow-up errors"
done_when: manual
---

# A Critic follow-up round that moves a trust boundary has no route

## Evidence

A consumer course had two registered rounds. The correction range honestly moved trust boundaries (a session refresh in
the request proxy, a new SQL function exposing member e-mail addresses to owners, release workflows). Observed chain:

1. `register-feature-package.mjs --add-delta-request` accepted `{coordinatorImpactConfirmed: true,
   trustBoundaryChanged: true, impactAmbiguous: false}` and registered the request.
2. `critic-dispatch-preflight.mjs --delta-request` refused with `RE-DELTA-BINDINGS-INVALID` and no detail
   (`lib/review-economy.mjs` `admitReviewAttempt` demands `trustBoundaryChanged === false`).
3. The same preflight without the delta request refused with `CCA-REQUESTED-MODE` ("the first review is full, every
   later review is a delta").
4. The takeover verbs retire only unregistered rounds, so the registered course could not be restarted either.

The only way out the agent could see was to declare the boundary unchanged, which would falsify the review record; the
PO refused that. The course had no typed route at all.

The original design had the route: `scripts/review-attempt.schema.json` separates `requestedMode` from `effectiveMode`
and forbids `trustBoundaryChanged: true` only when the effective mode is delta, and `lib/critic-review-lineage.mjs`
`expectedInvalidation` records `full-review-required` with reason `trust-boundary-change` / `impact-ambiguous`. The
admission that produced an effective full round was lost in checkpoint d02409a8a (2026-10-12).

Side finding: the help texts of `register-feature-package.mjs` and `critic-diagnostic-evidence.mjs`, the
`CCA-DETERMINISTIC-UNAVAILABLE` repair text and the critic-review skill tell the agent to commit the diagnostic artifact
first and the manifest in a second commit. `evidenceCommitV2` in `lib/critic-course-admission.mjs` accepts only ONE
commit that changes the manifest together with every added path; the two-commit route ends in `FPR-DELTA-TRANSPORT` /
`CCA-TRANSPORT-SOURCE-DRIFT`. Registration reads the working tree, so the one-commit route needs no earlier commit.

## Wanted (PO direction 2026-10-30)

1. A follow-up round whose registered delta request carries `trustBoundaryChanged: true` or `impactAmbiguous: true`
   is admitted as an effective FULL round inside the same course: requested mode delta, effective mode full, the
   whole feature range under review, the reason recorded. The history stays honest; no flag is ever re-declared.
2. The full round is consumed and registered like any round; the next diff round has that full round as its parent.
3. `RE-DELTA-BINDINGS-INVALID` names the binding that failed.
4. The help texts, the repair text and the skill describe the one-commit evidence route the code accepts.
5. One end-to-end replay from the consumer's state proves the chain, with no further refusal on the way.
