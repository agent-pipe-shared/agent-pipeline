# Held patch (INTERIM, unverified): present-plan after a byte-identical feature-directory rebind (Phoenix Wanted 4, slice 3)

State: INTERIM. Test cases written in a scratch clone and exported as a patch; the RED run was started but its result was NOT read before the
tool budget checkpoint; GREEN, whole-file baseline-versus-patched comparison and the pipeline-state.test.mjs comparison were NOT run.
Candidate 24a03ad33 plus the round-2 bundle (`scratch/agent-out/compose/bundle.patch`, which already contains `pathRebind` in `design-approval-binding.mjs`).
Patch: `w7-present-plan-after-folder-rebind-pin.patch` (diff against the bundle baseline). Apply check in clone2 (bundle committed as baseline): exit 0.
Only file in the patch: `plugins/pipeline-core/scripts/design-approval-route.e2e.test.mjs`. No production change made (none shown to be needed yet).

## Recon re-verified in the clone
- `readDesignApprovalInputs` (pipeline-state.mjs ~9445) takes `submission.planPath/specPath` from the new submission, but derives companion paths from
  the LATEST RECEIPT (`latest.sources.companions`, old paths) and reads them with `physicalRebindFile`. After a move the old companions are absent,
  so the route may fail before `createDesignApprovalBinding` is reached. This is the suspected production gap (not proven; RED result not read).
  If RED confirms it, a likely small fix is to take the companion paths from the current folder when `checkDesignConsistency` reports a rebind; that
  is NOT implemented. If it needs more than about 40 lines or another file: STOP and name it.

## Cases added (ids DABX009..DABX012, declared in `originalDesignCases`, none existing edited)
- rebind 1 (DABX009): present-plan after the move exits 0, binding has `pathRebind {fromDir:"specs/e2e", toDir:"specs/e2e-moved"}`, one receipt, no delta.
- rebind 2 (DABX010): move plus one PRD byte refuses with `DCC-REVIEW-RECEIPT-BINDING` or `DAB-REVIEW-CHAIN`, no request, no presentation.
- rebind 3 (DABX011): a request from a twin pre-move repository substituted into the moved repository is refused by approve-plan with `DAB-BINDING-DRIFT`.
- rebind 4 (DABX012): a request created after the move is signed and approve-plan exits 0; the record carries `pathRebind`.
- Fixture change: `buildSubmittedFeature(prefix, {move, changeByte})`; after the receipt commit the PRD/Spec/companions are `git mv`-ed to `specs/e2e-moved/`,
  the receipt and report stay in `specs/e2e/review/`; set-feature/continuity-init/materialize use the moved paths. Default (move=false) is unchanged.

## Defaults assumed (PO decision pending)
Review receipt files stay where they are; a rebind always needs a fresh signature.

## NOT done
- RED/GREEN ids and counts; failing-name sets (clone vs clone2) for design-approval-route.e2e.test.mjs and pipeline-state.test.mjs.
  RED log, if it finished: `scratch/agent-out/w7rf/red.design-approval-route.e2e.test.mjs.log` (driver, background).
- Whether `specs/e2e-moved` is accepted by the registrar and whether the architecture fixture/submit-plan accept the moved path (unverified).
- Production change in pipeline-state.mjs (none made).
- Clones `scratch/agent-out/w7rf/clone` and `clone2` still exist; `driver.mjs cleanup` not run.
- Independent Critic review: parent-owned batch gate.

## Proposed commit message
`test(state): present-plan after a byte-identical feature-directory rebind needs no new review round`

## Operator flow
Apply round-2 bundle v2 (includes the pathRebind patch), then `git apply w7-present-plan-after-folder-rebind-pin.patch`, `git add -u` with a path limit on the test file,
`--no-verify` commit, stamp, install. Do not apply until RED/GREEN evidence exists.

## Classification
Test-only so far; kernel path (state machine, design approval route). Test file matches no TP-1..TP-13.
