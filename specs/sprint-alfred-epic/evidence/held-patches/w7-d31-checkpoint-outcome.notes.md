# Held patch notes: D31 checkpoint outcome (slice 4a, W7-D31-CHECKPOINT-OUTCOME-C1-20261027)

Status: INTERIM (budget checkpoint). Patch written; apply check and clone cleanup NOT run.

Apply order: the PF-83 c2 patch (`w7-pf83-stop-failure-removed-c2.patch`) first, this patch second. The patch is `git diff --binary`
of the scratch clone against its local "pf83 stack base" commit (candidate b6d2f1236 plus the PF-83 c2 patch). Files: the finalizer
and its test only.

## Cause
A budget stop hands back an interim report. `validateNativeGoldfishFinal` (native-goldfish-host-return.mjs line 106) admits only
outcome `succeeded`, so the finalizer saw a failure: `recordSubagentStopOutcome` wrote a stop-failure diagnostic and the dispatch
looked failed. The recon cited lines were re-verified: writer at finalizer lines 155-169, success status at the end of the inner
function; the return schema/validator lives OUTSIDE the slice files.

## Changed lines (native-goldfish-host-finalizer.mjs)
1. `observeClaudeSubagentStop`: local `bind` wrapper. When the shared validator refuses and the parsed document has outcome
   `checkpoint`, the same document is re-bound with only that word replaced by `succeeded` (every other field validated unchanged);
   the observed outcome stays `checkpoint`. This is a SHIM, see "Schema change needed".
2. Inner finalizer, before the `NGHF-RETURN-NOT-SUCCESS` refusal: `checkpoint` returns `{ status: "checkpoint-recorded",
   code: "NGHF-CHECKPOINT-RESERVATION-LIVE", dispatchId, commit: null, record: null, reservation: "live",
   continuation: { resume: "continuation-card-and-sendmessage", abandon: "slice-queue-cancel-class-budget" } }`. Nothing is consumed,
   committed, released or cancelled, so a repeat is idempotent.
3. `recordSubagentStopOutcome`: returns before writing when the status is `checkpoint-recorded`.

## Cases (native-goldfish-host-finalizer.test.mjs)
NGHF17 checkpoint writes no diagnostic and a following success of the same dispatch commits (commits 1). NGHF18 reservation live,
state snapshot unchanged, both routes named, repeat deep-equal. NGHF19 outcome `failed` still writes the diagnostic, not finalized.
Justified fixture change: the first draft used `changedPaths: []`; the shared validator requires a non-empty path list
(line 108), so the cases use the fixture default `["src/change.mjs"]` (a checkpoint with partial work lists its changed paths).

## Evidence (machine-written logs in scratch/agent-out/w7qa/, wrapper driver prints one ok / not ok per case id)
- RED (patched code absent, new cases present): NGHF17 and NGHF18 not ok with NGHR-FINAL-SHAPE (first draft with empty paths, run
  against the already-edited finalizer, so it shows the validator limit, not a clean pre-implementation RED; a clean RED against the
  unchanged finalizer was not captured: the first plain run aborted earlier on a flaky `catalogue-source-closure` fixture fault in
  NGHF03, which the wrapper run did not reproduce). Said plainly: RED-before-implementation is only partly evidenced.
- GREEN in clone, whole file: `tests 21 pass 21 fail 0` (log green2). Baseline clone2 (PF-83 only): `tests 18 pass 18 fail 0`
  (log base). Failing-name sets: both empty; new cases NGHF17-19 are the only difference.

## NOT done
Apply check in clone2 (`driver.mjs check`) and `driver.mjs cleanup` (both clones still exist under scratch/agent-out/w7qa/, ignored).
Return-schema change in `plugins/pipeline-core/lib/native-goldfish-host-return.mjs` (outside the slice files): accept
`outcome: "checkpoint"` in `validateNativeGoldfishFinal` (line 106), emit it as a typed final, and allow the checkpoint a
non-empty `changedPaths` as today; then delete the shim in finalizer item 1. The grant headroom rule (po-decision), retention
pruning and heal are untouched. The PostToolUse foreground route does not recognise a checkpoint (SubagentStop only).

## Proposed commit message
feat(host-commit): accept a checkpoint outcome that keeps the reservation live (D31)

## Operator flow
Apply the PF-83 c2 patch, then this one (`git apply`), `git add -u -- <the two files>`, `git commit --no-verify`, stamp, install.
Protected-path classification observed: neither file matches a TP-1..TP-13 pattern; the finalizer is protected native authority
(Critic batch gate). An independent Critic review stays a parent-owned batch gate.
