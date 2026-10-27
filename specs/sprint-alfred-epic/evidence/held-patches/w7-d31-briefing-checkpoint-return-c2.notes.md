# Held patch notes: D31 briefing checkpoint return, complete (W7-D31-BRIEFING-CHECKPOINT-RETURN-C2-C1-20261027)

Status: COMPLETE as a held patch. Targeted delivery: green. Batch Critic, Full Verify and PO acceptance stay parent-owned and pending.
Patch: `w7-d31-briefing-checkpoint-return-c2.patch` = `git diff --binary` (written from Node) of the scratch clone against candidate
f5be5c034a111abd9095357d5fcbb7f83110a070. It supersedes `w7-d31-briefing-checkpoint-return.patch` (cases only, older candidate).
Apply check (`git apply --check` in clone2 at the candidate): exit 0.

## Cause
`plugins/pipeline-core/lib/dispatch-briefing-build.mjs` (return-contract paragraph in `renderGoldfishBriefing`, line 256) told every Goldfish
"otherwise stop and return a plain-text stop report instead of the JSON (no commit happens then)". `validateNativeGoldfishFinal` in
`lib/native-goldfish-host-return.mjs` accepts outcome `checkpoint` (opt-in `allowCheckpoint`, SubagentStop route) with non-empty sorted
changedPaths, but the briefing never asked for it, so a budget stop produced prose and lost the reservation.

## Changed lines
- `lib/dispatch-briefing-build.mjs` line 256: first sentence replaced; every other sentence byte-identical. New text: "`outcome` is
  `succeeded` only when every targeted check below is green. At the budget checkpoint, at a stop condition, or whenever a targeted check
  is not green, the final message is still this same JSON object with `outcome` set to `checkpoint`: the `report` string carries the
  condensed report plus a continuation card (done, remaining, next step), and `changedPaths` lists the files you have changed so far, so
  the host keeps the reservation live and the work can be resumed (a checkpoint commits nothing). Never invent another `outcome` word.
  Only when no file at all has been changed is a plain-text stop report the one legal form (no commit happens then)."
- `lib/pins/claude-background-goldfish-is-host-committed-at-subagent-stop.test.mjs`: two imports plus cases (xiii)-(xvi) (47 lines added).
- `scripts/dispatch-briefing.test.mjs`: NOT changed (no assertion on the old sentence).

## RED / GREEN (clone, whole pin file, node --test; reporter is not TAP)
- RED (cases present, production unchanged): failing exactly (xiii) and (xiv); (xv), (xvi) green (they pin existing behaviour).
- GREEN after the edit: `tests 17, pass 17, fail 0` (includes (xiii)-(xvi) all passing).
- Baseline clone2 (candidate, unpatched): `tests 13, pass 13, fail 0`.
- `scripts/dispatch-briefing.test.mjs`: one failure, identical in clone and clone2 (pre-existing, not caused by this patch):
  "public --help and -h work before setup without private reads, processes or filesystem effects" (strictEqual actual 1, expected 0, line 158).
- `lib/pins/goldfish-test-briefs-lack-targeted-and-quick-command-routes.test.mjs`: 7 of 7 pass in both.
- Failing-name sets: baseline = patched = {that one --help test}; the pin file has none in either.
- Pins changed: none (digest is computed dynamically, so no golden changed).

## Other copies / follow-ups that still contradict (not done, out of this slice)
- `templates/prompts/goldfish-task.md` line 478: "a stop report" in the restore-before-yield bullet; mild, not a return-form instruction; left.
- Budget hook text: `plugins/pipeline-core/lib/dispatch-budget-notice.mjs` line 10 (`NATIVE_HOST_RETURN_INSTRUCTION`) tells a Goldfish to return
  `outcome: "blocked"`. The validator accepts only `succeeded` or `checkpoint`, so this must become `checkpoint`. Pinned by
  `hooks/guard-dispatch-budget-grant-notice.test.mjs` line 290 and `hooks/guard-dispatch-budget.test.mjs` lines 679 and 701, which need the same update.
  Not edited here (outside the slice file list).

## NOT done
Briefings built before installation keep the old wording. The host SubagentStop path must have the D31 checkpoint finalizer installed
(allowCheckpoint) for a `checkpoint` final to be accepted. Full Verify, independent Critic review (parent-owned batch gate), PO acceptance.

## Proposed commit message
feat(dispatch): brief a Goldfish to return a typed checkpoint at a budget stop

## Operator flow
Apply the diff, `git add -u -- <the two plugin paths>`, `git commit --no-verify`, stamp, install. Protected-path classification observed: none
of the touched files matches TP-1..TP-13.
