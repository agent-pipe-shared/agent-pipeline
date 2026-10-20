---
schema: pipeline.backlog-item.v1
id: pipeline.a-checkpoint-fold-lands-above-the-checkpoint-commit
type: defect
owner: pipeline
status: open
created: 2026-10-20
source: "Push of the 0.7.0 Alfred candidate 0913fa941 on 2026-10-20: one PO push signature spent on a refused push"
sprint: none
done_when: manual
---

# A checkpoint fold lands above the checkpoint commit

## Description

`push-prepare.mjs --checkpoint` folds a pending push-approval record (`pendingAuditWrite`) into a
new commit, `chore(pipeline-state): fold pending push-approval record`, on top of HEAD, and then
reports `ready: true` for that fold commit. The fold commit carries no `Checkpoint-Intent`
trailer, so `guard-push.mjs` (`checkpointEligibility`) refuses the push after the PO has signed
and `approve-push` has run: "checkpoint candidate needs exactly one bounded Checkpoint-Intent
commit trailer".

Observed on 2026-10-20: the empty checkpoint commit `6af32708d` was followed by the fold
`c46c95325`; the PO signed for `c46c95325`, and the push was refused. The repair was a new empty
checkpoint commit, a second push-prepare (which folded the new approval record again,
`4a41c374b`), a third checkpoint commit `0913fa941`, a third push-prepare that folded nothing, and
a second PO signature. One signature was spent.

## Proposal

- In checkpoint mode, push-prepare refuses before printing any signing command when the HEAD it
  would bind carries no valid `Checkpoint-Intent`, and names the repair (an empty checkpoint
  commit after the fold), exactly as `push-init.mjs`'s `checkpoint-intent` check already does.
- Or the fold commit carries the `Checkpoint-Intent` of the commit it folds onto, when that commit
  is a checkpoint.
- A test covers a checkpoint with a pending record: push-prepare never reports ready for a HEAD
  the push guard refuses.
