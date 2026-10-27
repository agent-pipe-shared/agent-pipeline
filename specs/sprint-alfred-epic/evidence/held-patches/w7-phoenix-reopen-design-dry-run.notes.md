# Held patch notes: reopen-design --dry-run (Phoenix slice b) - INTERIM, budget-stopped, NOT verified

Candidate dfe2f31eca0a4c2f43199ff126e1e7f532d983ec. Patch: `w7-phoenix-reopen-design-dry-run.patch` (git diff --binary against the candidate, 2 files).
Targeted delivery: BLOCKED (implementation and cases written; GREEN/RED/baseline comparison not obtained).

## Cause
`reopen-design --by <name>` voids the plan approval, submission binding and invalidation record with no preview (backlog Wanted 3).

## Changed lines
- `plugins/pipeline-core/scripts/pipeline-state.mjs` (+36): in `case "reopen-design"`, a `--dry-run` token branch before the existing code. It calls the pure
  `reopenPlanDesign()` on the observed state (no `writeState`, no `syncNextActionDocs`) and prints `pipeline.reopen-design-preview.v1` JSON:
  `dryRun, wrote:false, ok, code, wouldChange, phase{current,after}, voids{planSubmissionSha256, planApprovalPresent, planApprovalSha256,
  approvalSignaturePresent, receiptsBoundToPlanSha256}`. Exit 0. Without the flag the code path is untouched. `lib/plan-spec-state-v2.mjs` NOT changed.
  Receipts and reviews are files, not state fields, so the preview names the plan hash they bind to rather than listing files.
- `plugins/pipeline-core/scripts/pipeline-state.test.mjs` (+89, appended after the AC-264 block): cases DR1, DR1b, DR2, DR3, DR4 (collected, asserted once at end).

## Verification state (honest)
- First run (started before the implementation edit) exited 1 on an EARLIER assertion in the file (`deepStrictEqual` actual
  `[{area:'application',status:'ready',...}]` vs expected `[]`), so the new cases never executed. Not yet known whether that failure is pre-existing
  (needs the same run in clone2 at the unchanged candidate). Log: `scratch/agent-out/w7qu/red.pipeline-state.test.mjs.log`.
- GREEN run, baseline run in clone2, failing-name comparison, observer-conformance suite: NOT run. `git apply --check` in clone2: NOT run.
- DR cases are unproven; DR1b injects a fabricated `planApproval` into the state file (dry-run only reads it) and may need adjusting.
- Clones remain in `scratch/agent-out/w7qu/` (clone, clone2); driver `scratch/agent-out/w7qu/driver.mjs` (modes setup, setup2, run, patch, check, cleanup).

## Protected-path finding (stop condition 3)
`plugins/pipeline-core/lib/guard/sanctioned-args-scripts.mjs` line 424-426 admits only `reopen-design --by <name>` with `args.length === 3`;
`--dry-run` is refused for an agent. That file is protected and outside this slice. Exact change needed: accept `["reopen-design","--by",name,"--dry-run"]`
(length 4, `args[3] === "--dry-run"`) in that branch, plus a pin case. Not made.
Also observed: a shell `node -e` append to `pipeline-state.test.mjs` was refused by guard-testpath (TP-5 lane, opaque interpreter); Edit in the clone was admitted.

## Not done
Whole-file runs and failing-name sets (clone vs clone2), observer-conformance run, apply check, cleanup, Critic review (parent-owned batch gate).

## Proposed commit message
`feat(state): add a dry-run preview to reopen-design`

## Operator flow
Apply the diff, `git add -u` with a path limit to the two plugin files, `--no-verify` commit, stamp, install. The guard file change above must land first or in the same ceremony.
