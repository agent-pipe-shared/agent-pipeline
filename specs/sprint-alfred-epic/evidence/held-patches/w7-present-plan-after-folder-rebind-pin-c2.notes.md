# Held patch c2 (INTERIM, partly unverified): present-plan after a byte-identical feature-directory rebind

State: INTERIM. Patch written; GREEN of the four cases, the patched whole-file run of `design-approval-route.e2e.test.mjs` and the apply check in clone2 were NOT read/run before the tool budget ran out.
Patch: `w7-present-plan-after-folder-rebind-pin-c2.patch` (git diff --binary of the scratch clone against its local baseline = candidate + round-2 bundle). Files: `design-approval-route.e2e.test.mjs`, `pipeline-state.mjs` (the briefing allows both in the patch; note the dispatch write scope lists only the test file, so the production hunk is a scope question for the dispatcher).
The committed `w7-present-plan-after-folder-rebind-pin.patch` was briefly overwritten by the driver (wrong name) and restored with `git checkout --` on that one path.

## RED (read from the earlier log)
DABX009..DABX012 all failed with `SDC-AUTHORITY-UNAVAILABLE: companion-presentation-original-receipts` (exit 2), i.e. `readDesignApprovalInputs` returned not-ok.

## Cause (production gap CONFIRMED by reading code, not yet by GREEN)
`readDesignApprovalInputs` (pipeline-state.mjs, ~line 9445) takes companion paths and report paths from the latest receipt (old directory). After a folder move those paths are absent. In addition `design-consistency-check.mjs` (`reportPathAfterRebind`) expects the review REPORT under the new directory when the report lived under the old feature directory, so the fixture must move the report too.

## Change (12 lines in pipeline-state.mjs, no other behaviour change)
Local helper `moved(path)`: if the PRD directory of the latest receipt differs from the submission's PRD directory and the path sits under the old directory, use the same relative position under the new directory when that file exists, else keep the receipt's path. Applied to companions and to each summary report path. Identity when the directory is unchanged.
Fixture change (test only): with `move`, the review report is also `git mv`-ed to `specs/e2e-moved/review/`; the receipt JSON stays (default: receipt files stay).

## Results so far
- pipeline-state.test.mjs in the clone (patched): the process terminated with an uncaught assertion (`neutral-only must not invent an effective decision for the unowned planned path`, log line ~418). It is almost certainly pre-existing and unrelated, but the clone2 baseline run was NOT done, so this is unproven. Log: `scratch/agent-out/w7rf/green2.pipeline-state.test.mjs.log`.
- design-approval-route.e2e.test.mjs baseline (clone2, bundle only): 14 pass, 0 fail (exit 0).
- design-approval-route.e2e.test.mjs patched (clone): run started, log `scratch/agent-out/w7rf/green.design-approval-route.e2e.test.mjs.log` NOT read; GREEN counts unknown.

## Defaults assumed
Receipt files stay; the report moves with the feature directory; a rebind always needs a fresh signature.

## NOT done
GREEN counts; failing-name set comparison for both files; `driver.mjs check` (apply check in clone2); `driver.mjs cleanup` (both clones still exist); independent Critic review (parent-owned batch gate).

## Proposed commit message
`test(state): present-plan after a byte-identical feature-directory rebind needs no new review round`

## Operator flow
Apply round-2 bundle v2 and the pathRebind patch first, then this c2 patch (it supersedes the partial pin patch), `git add -u` with a path limit, `--no-verify` commit, stamp, install. Do not apply before GREEN is read.

## Classification
Kernel path (state machine, design approval route). Neither file matches TP-1..TP-13.

CONTINUATION CARD -- done: RED read, fix and fixture change in clone, patch written; remaining: read green.design-approval-route log (expect 18 pass), run `driver.mjs run base` for pipeline-state.test.mjs in clone2 and compare failures, `driver.mjs check`, update this note, `driver.mjs cleanup`; next step: read the green log tail.
