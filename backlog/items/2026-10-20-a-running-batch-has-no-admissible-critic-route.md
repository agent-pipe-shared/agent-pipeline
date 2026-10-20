---
schema: pipeline.backlog-item.v1
id: pipeline.a-running-batch-has-no-admissible-critic-route
type: defect
owner: pipeline
status: open
created: 2026-10-20
source: "PO report scratch/pipeline-feedback-03.md, finding PF-34; the same refusal on this repository (CCA-REVIEW-UNIT-REQUIRED, Critic of e6fec04a0, 2026-10-19)"
sprint: none
done_when: manual
---

# A running batch has no admissible Critic route

## Description

`session-critic-finalizer.mjs register-batch` refuses a batch over the integrated state since
plan approval with `SCF-REVIEW-UNIT-REQUEST`. Per `lib/critic-generic-batch.mjs`
(`reviewUnitSource`, `sourceTarget`), the `reviewUnitPath` (`pipeline.critic-review-unit.v1`)
must already exist byte-identical in the base commit, and a null `signedQualityImportAnchor`
needs a committed local dispatch record. Neither can be produced for a batch already running:
no bootstrap, design or implementation step asks for the review unit before the first item,
and background Claude dispatches write no dispatch record (Q1, D55). On this repository the
preflight refused the same way (`CCA-REVIEW-UNIT-REQUIRED`), so the Critic of e6fec04a0 is
advisory, with no finalizer receipt. Every binding nevertheless reports
`criticDecision.appliedRow: T1`.

Measured on 2026-10-20 by reading the code: no production route writes
`specs/<feature>/design/critic-review-unit.json`. Only tests write it, in
`scripts/critic-dispatch-preflight.test.mjs`, `lib/critic-generic-batch.test.mjs` and
`scripts/session-critic-finalizer.test.mjs`. `featureReviewUnit`
(`lib/critic-course-admission.mjs`) needs that unit as an immutable, non-authority `design`
artifact in the feature's genesis manifest. So course admission refuses
`CCA-REVIEW-UNIT-REQUIRED` for every feature, not only for a running batch. A running feature
cannot add it later, because the genesis manifest is fixed.

Measured on 2026-10-20, read-only: two separate refusals.

- `SCF-REVIEW-UNIT-REQUEST` comes from the registration request's schema:
  `session-critic-finalizer.mjs` admits only `pipeline.critic-generic-batch-registration-request.v2`,
  and `templates/prompts/critic-review.md` still documents `.v1`.
- `CCA-REVIEW-UNIT-REQUIRED` comes from the manifest. The only production writer of
  `specs/<feature>/lifecycle.json` is `registerFeaturePackage`
  (`lib/feature-package-registration.mjs`), and it never adds the `design` entry for the review
  unit. The topology admits a non-authority `design` artifact, but no route amends an existing
  manifest.
- The course's genesis base is the first review's base, not the commit that created the manifest
  (`resolveRegisteredCriticCourseIdentity`). So a running feature with no retained Critic history
  can still satisfy admission: commit the unit and its manifest entry, then review from that
  commit. A feature that already has retained history keeps its genesis base, and only a change to
  `lib/critic-course-admission.mjs` would help it.
- None of these files is protected.

Planned fix:

1. `registerFeaturePackage` writes the review unit and its manifest entry for a new feature.
2. A typed `register-feature-package.mjs --add-review-unit` route adds both to a running feature,
   and names the commit that becomes the review base.
3. The template names the `.v2` registration request.

## Acceptance

- The review unit is created, or required with a named command, when a feature enters
  implementation or at its first item admission.
- A batch already running has a documented, typed route to register a review, using the
  commit evidence D55 accepts (Q1) in place of a dispatch record.
- The refusal names that route.
