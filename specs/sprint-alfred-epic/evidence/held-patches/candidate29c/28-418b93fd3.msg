docs(runbook): export-report is a step of the design path

D247 named design-review-receipt.mjs export-report only in design-course
and in a needs line of the receipt step, so the happy path and the
generated plan-path runbook went from the review straight to create. The
happy path now orders the review dispatch, export-report on Claude, then
create; the runbook gains the step design-review-export-report between
the ADR steps and the receipt (regenerated plan-path and index).

Checkpoint-Intent: candidate 29c, Claude run 3 L3 part 3
AI-Assisted: true
Dispatch: stage-0 (elephant)
