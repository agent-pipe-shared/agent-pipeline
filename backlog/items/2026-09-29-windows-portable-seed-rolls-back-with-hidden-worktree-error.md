---
schema: pipeline.backlog-item.v1
id: pipeline.windows-portable-seed-rolls-back-with-hidden-worktree-error
type: bug
owner: pipeline
status: open
created: 2026-09-29
source: "Claude Windows greenfield onboarding report for the stamped 0.7 local candidate; verified against current source before correction."
sprint: none
done_when: manual
---

# Windows portable seed rolls back and the guided driver repeats it

## Description

In a fresh non-Git Windows project, portable seed application initializes Git,
then enrollment observes a worktree path in Git's forward-slash format. The
governance-scope check compares that raw path with a native resolved path and
returns `GS-WORKTREE`. The transaction rolls back. The portable lifecycle
adapter discards the failed application result, returning a fresh inspection
instead. The guided driver accepts that unexpected status and repeats the same
plan and apply pair until its step cap is exhausted.

The report used the 0.7.0 local candidate on win32. This item records only
synthetic paths and category-level observations; operator identity and project
paths are not copied into this repository.

## Affected artifact

`plugins/pipeline-core/lib/worktree-lifecycle.mjs`,
`plugins/pipeline-core/lib/governance-scope.mjs`,
`plugins/pipeline-core/lib/project-onboarding-v3.mjs`, and
`plugins/pipeline-core/scripts/onboarding-init.mjs`.

## Acceptance

- Git worktree paths compare correctly on Windows irrespective of slash style
  and drive-letter case, without weakening Unix or macOS containment.
- A failed portable seed application exposes its rollback and diagnostic with
  a non-success result; the driver stops instead of repeating the same plan.
- An unexpected result outside `nextAction.expected.statuses` stops the guided
  driver with the observed status and a bounded repair action.
- Synthetic Windows path fixtures and a fresh non-Git onboarding exercise
  cover the failure and successful progression to runtime initialization.
- The corrected installed Claude candidate is observed in a fresh Windows
  session before closing the item.

## Triage

Accepted into the next local 0.7 candidate by PO instruction. Native Windows
runner confirmation remains a separate acceptance step after installation.
