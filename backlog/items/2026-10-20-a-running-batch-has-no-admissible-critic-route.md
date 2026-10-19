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

## Acceptance

- The review unit is created, or required with a named command, when a feature enters
  implementation or at its first item admission.
- A batch already running has a documented, typed route to register a review, using the
  commit evidence D55 accepts (Q1) in place of a dispatch record.
- The refusal names that route.
