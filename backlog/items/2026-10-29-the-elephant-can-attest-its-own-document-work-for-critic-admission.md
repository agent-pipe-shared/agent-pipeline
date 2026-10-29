---
schema: pipeline.backlog-item.v1
id: pipeline.the-elephant-can-attest-its-own-document-work-for-critic-admission
type: workflow-improvement
owner: pipeline
status: open
created: 2026-10-29
priority: P2
release: 0.7.0
sprint: none
source: "Toolbox consumer finding N13 (2026-10-29), first read as 'the Elephant cannot attest its own work', corrected the same day from the source of check-critic-skip-coverage.mjs: a descendant of a delivered record is already admitted; the tools do not say so"
done_when: manual
---

# Critic round two needs the first delivery's task id, and the tools do not say so

(File name kept from the first, wrong reading of the finding; rename to the topic above when convenient.)

## Evidence

A Toolbox consumer reached `session-critic-finalizer admit` for round 2 and was refused with `CPP-REVIEW-ADMISSION`: "found 0 ... the expected record is `evidence/dispatch-record-<taskId>.json`". The cause was not a missing record kind. `evaluateReviewAdmissionCore` (`plugins/pipeline-core/scripts/check-critic-skip-coverage.mjs`) admits two ways:

1. **Exact:** same `taskId` and the record's candidate is the review candidate.
2. **Descendant:** same `taskId`, a delivered Goldfish record (`authored-commit` or `orchestrator-attested`, Critic disposition `required`), and the review candidate descends from the record's candidate (`git merge-base --is-ancestor`). Who wrote the commits in between is not checked.

The consumer invented a new `taskId` for round 2 (`...-critic-r2`), for which no record exists. The existing record of the first delivery satisfied the descendant route. Three defects in the tools led there:

- The refusal text names only the exact route and sends the Elephant to the attested-record writer; it never mentions the descendant route.
- The skill section "Continuing a Critic course after the first round (PF-94)" does not say which `taskId` round 2 carries (the first delivery's, not a new one).
- `critic-dispatch-preflight.mjs` reports `packet-ready` without knowing the `taskId`; `admit` checks the record afterwards, so the two tools disagree about readiness.

## Proposal

1. **Refusal text.** When no record is admitted, `missingRecordHint` names the descendant route and, when a delivered record with another `taskId` is an ancestor of the review candidate, names that `taskId` ("this candidate descends from the delivered record of `<taskId>`; use that task id for the round").
2. **Skill.** Add a step to "Continuing a Critic course": reuse the `taskId` of the first delivery for every later round; a new `taskId` needs its own record.
3. **Preflight.** `critic-dispatch-preflight.mjs` accepts `--task-id <id>` and, when given, runs the same admission check and refuses with the same hint instead of reporting `packet-ready`; the result carries the admission mode (exact or descendant).

## Acceptance

- Round 2 with the first delivery's `taskId` is admitted by descent; with a fresh `taskId` the refusal names the descendant route and the matching `taskId`.
- The skill states the rule in one step.
- Preflight with `--task-id` and no admissible record refuses; with one it reports the admission mode; without the flag its behaviour is unchanged.
- Kernel paths (`check-critic-skip-coverage.mjs`, `critic-dispatch-preflight.mjs`): held patch under the Guard Maintenance Window.

## Not part of this item

A record kind for Elephant-authored ranges is NOT needed (the first reading of the finding). Related Toolbox findings N14 (a new item course refused with `CAC-REGISTRATION-INVALID` while `inspect` shows the approval valid, reason not named), N15 (the agent cannot delete its own scratch files) and N16 (`dispatch-briefing build` cannot read a spec addendum as a criterion) are separate items, still to be written from `scratch/uebergabe-pipeline-p0-p1-2026-10-27.md`.
