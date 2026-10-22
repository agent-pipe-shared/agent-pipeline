---
schema: pipeline.backlog-item.v1
id: pipeline.onboarding-init-greenfield-matrix-is-serial-and-slow
type: workflow-improvement
owner: pipeline
status: open
created: 2026-09-29
sprint: alfred
done_when: manual
tracking: "The four targeted onboarding-init greenfield cases pass but take over six minutes because independent runner/key fixtures are sequential inside individual tests."
source: "Focused onboarding-init test run on 2026-09-29: 4/4 pass in 368.5 seconds."
---

# Greenfield onboarding tests serialize independent fixtures

The cross-runner/key matrix, chat/signature matrix, and first-anchor failure
matrix are independent fixtures inside three long test cases. Their measured
durations were 109, 123, and 119 seconds respectively. Rerunning the whole
file to check one repair spends most of its time on unrelated cases.

## Direction

Split the independent cells into separately selectable test cases or files,
retain the current coverage and cleanup checks, and let the Verify scheduler
run the resulting files in parallel. Keep a fast focused selector for each
greenfield happy path and rollback boundary.

## Acceptance criteria

- Every existing runner/key and first-anchor failure cell is still executed.
- A failure identifies its cell without waiting for unrelated cells.
- The full selected Verify path has a measured lower wall time without raising
  process or memory pressure beyond the runner budget.

### Blocker analysis 2026-10-22

Read-only survey of the open clauses that the delivery remeasure assigned to native-host, verify-wsl, po-decision or po-signature (evidence: `specs/sprint-alfred-epic/evidence/blocker-analysis-2026-10-22/`). Status key: LINUX-RUN and WINDOWS-INTEROP-RUN are runs an agent can do from the WSL host; HOST-SESSION-NEEDED, PO-DECISION and PO-SIGNATURE are not agent work.

- **LINUX-RUN** — Measure the lower wall time of the selected Verify path on Linux/WSL (the AC3 measurement-hold skip)
  Time the split onboarding-init greenfield cases (pins/onboarding-init-greenfield-matrix-is-serial-and-slow.test.mjs and the split files) on Linux against the 368.5 s baseline, serially with a private TMPDIR, and record wall time; the measurement is a plain timed run, no host involved.
