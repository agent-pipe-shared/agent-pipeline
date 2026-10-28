# Recon notes: D31/D32 resume without manual cancel (W7-D31-RESUME-WITHOUT-MANUAL-CANCEL-C1-20261027), NOTES-ONLY, no patch

Status: recon complete, STEP 2 says the smallest fix does NOT fit the four slice files. No patch delivered (a notes-only delivery is valid per the briefing).
Candidate: 8bbf027d79c6289a7c34ce12d25fd3f042a84162. No clone was needed (no edit was made, nothing RED/GREEN was run). Batch Critic, Full Verify and PO acceptance stay parent-owned and pending.

## Note on the cited recon
`w7-d31-budget-notice-checkpoint-c2.notes.md` covers a different half of D31 (the budget NOTICE wording, `outcome: "blocked"` vs `checkpoint`). It does not trace the settle/cancel path and cites no line of the finalizer; it is consistent with, but does not support, this slice. The cause below was measured fresh.

## STEP 1 - measured cause (verified against the repository tree at the candidate)
- `lib/native-goldfish-host-return.mjs` line 108: the validator accepts `outcome: "checkpoint"` only when `allowCheckpoint === true`. It validates only; it touches no slice row and no reservation.
- `lib/native-goldfish-host-finalizer.mjs` line 141 (`bind`, `allowCheckpoint: true` on the Claude SubagentStop route only) feeds the return into the finalizer.
- `lib/native-goldfish-host-finalizer.mjs` lines 302-306: for `observation.final.outcome === "checkpoint"` the finalizer returns `{status:"checkpoint-recorded", code:"NGHF-CHECKPOINT-RESERVATION-LIVE", reservation:"live", continuation:{resume:"continuation-card-and-sendmessage", abandon:"slice-queue-cancel-class-budget"}}`. The comment states the design: "Nothing is consumed, committed, released or cancelled, so the reservation stays live and a repeat is idempotent". Line 179 makes the checkpoint skip the stop-failure diagnostic.
- Result: the slice row stays `ready`/started and the native dispatch state stays, i.e. the reservation keeps blocking. A continuation dispatched as a NEW package for the same write scope collides with it. The only sanctioned release is `slice-queue.mjs cancel <slice> --started --class budget` (`lib/native-goldfish-host-state.mjs` line 1200 `cancelUnstartedGovernedItemSlice`; lines 1227-1229 refuse a started slice without `--started`; lines 1230-1235 set `state='cancelled'`, `cancelClass`). That is the manual cancel.
- Existing pin: `lib/native-goldfish-host-finalizer.test.mjs` lines ~464-482 assert `checkpoint-recorded` / `NGHF-CHECKPOINT-RESERVATION-LIVE`. A change of the finalizer would deliberately change that pinned behaviour.
- The PF-85 1a held patch (`w7-pf85-continuation-of-c3.patch`) already provides the admission half: `continuationPredecessorRefusal` admits `continuationOf` only for a predecessor in state `cancelled` with class `budget` or `wrong-premise`, and its refusal repair literally tells the operator to run the manual cancel first. So the missing piece is exactly: something must move the predecessor to `cancelled/budget`.

## STEP 2 - does it fit the four slice files? NO
The settling action belongs at the finalizer checkpoint branch (`native-goldfish-host-finalizer.mjs` 302-306), which is not among `native-goldfish-host-state.mjs`, `native-goldfish-host-state.test.mjs`, `slice-queue.mjs`, `slice-queue.test.mjs`. The briefing says: a fix needing files outside the four is NOT implemented. Further, the write scope for tests is only `native-goldfish-host-state.test.mjs`, which cannot exercise the finalizer.

Additional design hazard (needs a PO/design rule, so another reason not to implement): the current "reservation stays live" is a deliberate choice that keeps the write scope protected while the stopped Goldfish can still be resumed in place via SendMessage with the continuation card (`resume: continuation-card-and-sendmessage`). Auto-cancelling with class budget at the checkpoint return would release the write scope protection (cancel note, line 1236) and make the in-place resume route unsafe, and it would also kill the idempotent-repeat property the finalizer test pins.

## Options
A. Finalizer settles on checkpoint: on `checkpoint`, call `cancelUnstartedGovernedItemSlice({root, sliceId, started:true, cancelClass:'budget', reason:'budget checkpoint return'})` and record the card; keep `resume` route only for the SendMessage-before-new-dispatch case by making the new-package path (continuationOf) the sole resume. Needs: finalizer edit + its test update (pinned behaviour changes, written justification required), probably the pending-state record. Outside the four files.
B. Admit `continuationOf` against a predecessor that is `ready` with a live reservation whose dispatch state carries a recorded checkpoint, and cancel it as part of the admission (inside `slice-queue.mjs` / `native-goldfish-host-state.mjs`: the prepare path where `continuationPredecessorRefusal` is called). Stays inside the four files, but needs a durable "checkpoint recorded" marker that the finalizer does not write today (it returns the result only; line 304 persists nothing), so B also requires a finalizer edit unless the marker is derived from existing pending state (not shown to exist).
C. Leave as is; make the refusal repair of PF-85 1a state the single manual command. Zero code, no rule change.

## Recommendation
Option A, as its own slice with files `native-goldfish-host-finalizer.mjs` and `native-goldfish-host-finalizer.test.mjs` (plus `native-goldfish-host-state.mjs` only if a helper is wanted), after the PO confirms that a checkpoint return ends the in-place SendMessage resume route (the write-scope protection drop). RED cases then: stop (checkpoint return settles the row cancelled/budget), grant (the budget grant still gates the continuation dispatch, unchanged), resume (a `continuationOf` package for the settled slice is admitted with no manual cancel; the PF-85 1a NGHS52 cases show the prepare harness). Base the slice on the verified PF-85 1a patch.

## NOT done
- No code, no RED/GREEN cases, no patch, no clone (no change was justified within scope).
- The grant headroom decision stays a PO decision; not touched.
- Native qualification, independent Critic review, Full Verify, install: parent-owned.

## Proposed commit message for these notes
docs(evidence): record the D31/D32 resume-without-manual-cancel recon; the settle belongs to the finalizer checkpoint branch, outside the slice files

(The originally proposed `feat(goldfish): a budget checkpoint return settles its slice so the continuation card resumes without a manual cancel (D31/D32)` applies only to a later slice implementing option A.)

## Operator flow / protected paths
Notes only: add the notes file, commit with the host. Protected-path classification: the notes file matches none of TP-1..TP-13; nothing under `plugins/` was touched.
