# Held patch notes: D31 budget notice checkpoint c2 (W7-D31-BUDGET-NOTICE-CHECKPOINT-C2-C1-20261027), COMPLETE

Status: targeted delivery green. Batch Critic, Full Verify and PO acceptance stay parent-owned and pending.
Patch: `w7-d31-budget-notice-checkpoint-c2.patch` = `git diff --binary` (from Node) of the scratch clone against candidate
8c6a3bd0fae88f262dcd3f671270ddf696439aac, limited to `plugins/`. Single complete patch: RED cases + production edit + pins.
It supersedes the RED-only `w7-d31-budget-notice-checkpoint.patch` (left untouched; do not apply both).
Apply check (`git apply --check`) in clone2 detached at the candidate: exit 0.

## Cause
`lib/dispatch-budget-notice.mjs` line 10 (`NATIVE_HOST_RETURN_INSTRUCTION`) told a native Goldfish to return `outcome: "blocked"`;
`validateNativeGoldfishFinal` accepts only `succeeded` or (with `allowCheckpoint`) `checkpoint`. Re-verified in the clone.

## Changed lines (3 files, +38/-5)
- `lib/dispatch-budget-notice.mjs` line 10: `with outcome: "blocked" and an interim report (done / remaining / next step) in its report field`
  became `with outcome: "checkpoint" (changedPaths listing the files changed so far; if no file changed so far, the plain-text stop report is the only legal form) and a report carrying the condensed report plus a continuation card (done / remaining / next step) in its report field`. Exactly one `outcome:` token. Rest of the notice byte-identical (line 60 "instead of blocked" kept).
- `hooks/guard-dispatch-budget-grant-notice.test.mjs`: new cases D31-BUDGET-NOTICE-1..3; PF-69 pin (line ~290) regex moved to the new wording.
- `hooks/guard-dispatch-budget.test.mjs` lines ~679 and ~701: `/outcome: "blocked"/` to `/outcome: "checkpoint"/`.

## Pins changed, justification
All three: the return validator accepts only succeeded|checkpoint, so asserting `outcome: "blocked"` pinned a word the validator refuses.
Each is moved to the validator-accepted word, with a code comment; none weakened (same specificity, the PF-69 regex is longer). PF-69 title and the
"instead of blocked" assertion (line 289) left unchanged.

## RED / GREEN
- RED (clone, unchanged production, re-run this dispatch; log `scratch/agent-out/w7ra/red2.*.log`): grant-notice file 3 failing, exactly D31-BUDGET-NOTICE-1, -2, -3.
- GREEN (clone, patched): grant-notice file tests 16, pass 16, fail 0 (includes D31-BUDGET-NOTICE-1..3). guard-dispatch-budget.test.mjs: tests 127, pass 125, fail 0, skipped 2.
- Baseline clone2 (unchanged code): grant-notice tests 13, pass 13, fail 0; budget tests 127, pass 125, fail 0, skipped 2.
- Failing-name sets: baseline empty, patched empty; no pre-existing failures. The only delta is the 3 new passing cases.

## Step 5 sweep (report only, nothing fixed outside the slice)
- hooks (non-test): no `outcome: "blocked"` instruction. lib (non-test): only dispatch-budget-notice.mjs lines 10 (fixed) and 60 ("instead of blocked", prose, kept).
  Other lib hits are tests of unrelated validators (workflow-runner-boundary, native-goldfish-host-return, review-economy) using "blocked" as a refused/other outcome.
- skills: none. templates/prompts: `goldfish-task.md` line 555 says "outcome blocked" for the pin-owner return (a different contract, not the budget notice); not touched, parent may review.

## NOT done
Briefing-side half is the separate held patch (`w7-d31-briefing-checkpoint-return-c2.patch`). Critic review, Full Verify, install: parent-owned.

## Proposed commit message
fix(hooks): tell a Goldfish at the budget checkpoint to return outcome checkpoint instead of blocked

## Operator flow
Apply the diff after the round-2 bundle, `git add -u` with a path limit to the three files, `git commit --no-verify`, stamp, install.
Protected-path classification: none of the three files matches TP-1..TP-13. An independent Critic review stays a parent-owned batch gate.
