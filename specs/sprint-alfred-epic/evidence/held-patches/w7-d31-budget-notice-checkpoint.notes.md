# Held patch notes: D31 budget notice checkpoint (W7-D31-BUDGET-NOTICE-CHECKPOINT-C1-20261027), PARTIAL

Status: PARTIAL, stopped at the 80 % budget checkpoint (counted call 32 of 40). Targeted delivery: blocked (RED cases written and
recorded RED; implementation and pin updates NOT done). Batch Critic, Full Verify and PO acceptance stay parent-owned and pending.
Patch: `w7-d31-budget-notice-checkpoint.patch` = `git diff --binary` (from Node) of the scratch clone against candidate
cc4fcbb295ef2f3809d6538971b68bf210c2438b. It contains the RED cases ONLY (one file: hooks/guard-dispatch-budget-grant-notice.test.mjs,
+31/-1). Do not apply it alone: it adds three failing cases. The apply check in clone2 was not run (budget); a one-file diff at the
candidate, expected to apply.

## Cause (re-verified in the clone)
`lib/dispatch-budget-notice.mjs` line 10 (`NATIVE_HOST_RETURN_INSTRUCTION`) says `outcome: "blocked"`; `validateNativeGoldfishFinal`
(`lib/native-goldfish-host-return.mjs` line 108) accepts only `succeeded`, or `checkpoint` when `allowCheckpoint` is true. Line 60 of the
notice also says "instead of blocked". Recon note lines are correct.

## Done
- Scratch driver `scratch/agent-out/w7ra/driver.mjs` (modes setup, setup2, run, patch, check, cleanup); clone and clone2 at the candidate.
- RED cases added in the clone after PF-69, ids `D31-BUDGET-NOTICE-1..3`: (1) the native notice names outcome "checkpoint", changedPaths,
  done / remaining / next step, the CONTINUATION CARD and the "no file changed so far, the plain-text stop report is the only legal form"
  clause; (2) neither the notice nor `nativeHostBlockedContinuation(0|3)` contains `outcome: "blocked"` (narrowed deliberately to the
  `outcome:` token so the PF-69 "instead of blocked" phrase is not forced to change); (3) a final built with the outcome word captured from
  the notice validates against the real `validateNativeGoldfishFinal` with `allowCheckpoint: true` (imported, not copied).
- RED run (clone, unchanged production, node --test, not TAP): 3 failing, exactly D31-BUDGET-NOTICE-1, -2, -3 (log
  `scratch/agent-out/w7ra/red.guard-dispatch-budget-grant-notice.test.mjs.log`). Note: that run started before case 2 was narrowed; it
  would fail identically, but re-run it.

## NOT done (remaining, in order)
1. `lib/dispatch-budget-notice.mjs` line 10 in the clone: replace `with outcome: "blocked" and an interim report (done / remaining / next step) in its report field`
   by wording with exactly one `outcome:` token, e.g. `with outcome: "checkpoint" (changedPaths listing the files changed so far; if no file changed so far, the plain-text stop report is the only legal form) and a report carrying the condensed report plus a continuation card (done / remaining / next step) in its report field`.
2. Update pins, each with this justification: the validator accepts only succeeded|checkpoint, so asserting "blocked" pins a refused word.
   `hooks/guard-dispatch-budget-grant-notice.test.mjs` line 290 (regex to the new wording, keep escaped schema);
   `hooks/guard-dispatch-budget.test.mjs` lines 679 and 701 (`/outcome: "blocked"/` to `/outcome: "checkpoint"/`). Line 287 title and
   line 289 ("instead of blocked") may stay; mention if left.
3. GREEN run of the three cases; whole `guard-dispatch-budget-grant-notice.test.mjs` and `guard-dispatch-budget.test.mjs` in clone versus
   clone2 (baseline); compare failing-name sets. No `lib/dispatch-budget-notice*.test.mjs` file was seen in a rg of lib tests; no byte or
   length pin on the native notice was found in the budget test (rg for `.length`), record as such.
4. Regenerate patch (the same driver `patch` mode), run `check` in clone2, `cleanup`.
5. Other copies of "blocked" in hook or skill text (rg per directory hooks, lib, skills, templates/prompts): not swept.
6. Briefing-side half is the separate held patch `w7-d31-briefing-checkpoint-return-c2.patch`.

## Proposed commit message
fix(hooks): tell a Goldfish at the budget checkpoint to return outcome checkpoint instead of blocked

## Operator flow (once complete)
Apply the diff, `git add -u` with a path limit, `git commit --no-verify`, stamp, install. Protected-path classification: none of the
three files matches TP-1..TP-13. The hook text itself still says "blocked" in installed copies until installed; the budget notice
this run received was the old one and demonstrates the defect.

## Recovery
Clones still exist under `scratch/agent-out/w7ra/clone` (holds the RED edits) and `clone2`; not cleaned up.
