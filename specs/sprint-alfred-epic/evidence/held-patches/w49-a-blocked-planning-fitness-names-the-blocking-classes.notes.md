# w49 — a blocked planning fitness names the blocking classes (candidate 17, slice 2)

Found by the Toolbox consumer while starting a follow-up feature: `submit-plan --profile feature` refused `ARCHITECTURE-FITNESS-NOT-READY`
and printed an adoption proposal plus a `collect-input architecture-adoption-disposition` prompt with no selectable values. Neither is the
cause: the refusal comes from the planning fitness over the PRD's path tokens, and the blocking classes were dropped from the printed text.
The consumer had no value to enter and no way to read the cause (the read-only fitness probe was itself blocked by the draft guard).

## Change

- `lib/architecture-entry-readiness.mjs`: new `blockingFitnessOutcomes` and `describeBlockingOutcome`. The `ARCHITECTURE-FITNESS-NOT-READY`
  result now carries `fitness.blockingOutcomes` (class, property, outcome, up to five violations; the report-only class 10 is left out as it
  is in the decision), its message ends with the first blocking classes, and its `nextAction` is `repair-required`
  `ARCHITECTURE-FITNESS-REPAIR` with the blocking outcomes and the planning surface paths, instead of the unanswerable adoption prompt.
  Other refusal codes keep their `nextAction`.
- `submit-plan` and `set-phase` print `message` and `nextAction` as before, so they show the new text without a change in
  `pipeline-state.mjs`.
- Test (existing suite `architecture-entry-readiness.test.mjs`): a blocked planning fitness lists class 7 only, names its violation in the
  message, answers `repair-required`, and has no collect-input. A mutation that stops skipping the report-only class fails it.

## Not proven here

- The actual blocking class for the Toolbox PRD is still unknown (their probe is pending); this slice makes the next refusal say it.
- No change to what the planning surface contains (`PLAN_PATH_TOKEN`) and none to the draft guard that blocked the diagnostic (intake 1h/1i/1j).
- No Full Verify on the applied tree; batch Critic stays paused for this repo.
