---
schema: pipeline.backlog-item.v1
id: pipeline.historical-plan-cancellation-blocks-current-withdrawal
type: defect
owner: pipeline
status: closed
closed_at: 2026-10-07
closure_repository: self
closure_commit: 3b05a045e4acfd4e2d3393b6a0c015a799c2bee6
closure_evidence: specs/sprint-alfred-epic/plans/backlog-triage-2026-10-07.md
created: 2026-09-28
source: "Actual canonical cancel-submitted-plan terminal b7dcd4 exited 2 with PLAN-CANCEL-ALREADY-CANCELLED and zero mutation. The current submission differs from a historical cancellation receipt retained from 2026-09-20. Source: lib/plan-spec-state-v2.mjs cancelSubmittedPlan."
sprint: alfred
done_when: manual
---

# Historical cancellation receipt prevents withdrawal of a new submission

The canonical cancellation function rejects whenever `state.planCancellation`
already exists, except for an exact replay of an already empty draft. It does
not distinguish a historical cancelled submission from a different current
submission awaiting approval.

On 2026-09-28, withdrawing current submission
`6c6cdb7c76227f85815c398297fcf2859bc8e0671fa8e4a7c6e4214f6b802112`
failed because a valid receipt for earlier submission
`84541715e760abec51dd455c5c9a49f2dad89e489d3b335c81a3d422640b151c`
was retained. The sanctioned reopen-design alternative succeeded (terminal
`a55ca2`, exit 0), invalidating the current submission and returning to Draft.
That recovery does not fix the withdrawal route.

## Acceptance

- A historical cancellation must not block an independently validated current
  awaiting-approval submission from being cancelled.
- Preserve historical cancellation facts through a validated audit contract;
  never fix this by deleting the old receipt or weakening state/feature/digest
  checks. Any new receipt schema requires bounded strict validation and fixtures.
- Preserve exact zero-write replay, stale digest refusal, same-feature authority
  checks, continuity advancement and physical state readback.
- Exercise two successive submissions/cancellations, restart, exact replay,
  mismatched current digest and malformed historical evidence through the pure
  transition and canonical writer.

## Triage

- **Decision:** closed — fixed in source
- **Rationale:** fixed at 3b05a045e: lib/plan-spec-state-v2.mjs cancelSubmittedPlan with retained cancellation history (3b05a045e); tests: plan-spec-state-v2.test.mjs 'Cancellation receipt for an older submission cannot strand the exact current successor' and two siblings.
- **Assignment (if accepted):** n/a
- **Date:** 2026-10-07
