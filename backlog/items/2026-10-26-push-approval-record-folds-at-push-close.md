---
schema: pipeline.backlog-item.v1
id: pipeline.push-approval-record-folds-at-push-close
type: defect
owner: pipeline
status: open
created: 2026-10-26
priority: P1
release: 0.7.0
source: "Re-entry handover on the WSL PC, 2026-10-26, reproduced the trailing push-approval write after the closed item pipeline.push-approval-record-always-trails-the-signed-commit; PO decision D161 (Q21 (a))"
done_when: manual
---

# The push-approval record is folded at push close

Follow-up of the closed `2026-08-26-push-approval-record-always-trails-the-signed-commit`
(AC-37). `approve-push` (`scripts/pipeline-state.mjs`, about lines 12410-12444) writes
`approvalRecord` and `criticalProofConsumption` into the tracked `project/pipeline-state.json`
after the signed subject. The record of approving commit X can never be inside X. The
mitigation NVA-PUSHFOLD-1 (`foldPendingPushApprovalWrite` in `scripts/push-prepare.mjs`, about
line 601) folds it only at the start of the NEXT `push-prepare`, and only once HEAD has moved
past `forCommit` (gate 2, "approval-outstanding"). Until then the tree stays dirty, and a
transfer to another machine carries no record of the last push.

## Decision

D161 (PO, 2026-10-26): fold immediately at push close. The tree is clean afterwards; the fold
commit stays unpushed until the next signed push. No guard change.

## Design sketch (to be confirmed by the implementing slice)

- Gate 2 gains one admitted case: `forCommit` equals HEAD AND the push already landed, read
  as the remote-tracking ref of the approved destination equal to `forCommit` (or a recorded
  consumption of that approval). Before the push lands the fold stays refused exactly as today.
- A sanctioned close step runs that fold right after a push, for example
  `push-prepare.mjs --close`, and `docs/push-release-flow.md` names it as the last step.
- The fold commit keeps its existing message shape and trailers.
- If any touched file is protected, the change lands as a held patch for the bundled sitting.

## Acceptance

- After a signed push and the close step, `git status` is clean and the fold commit holds the
  approval record with `pendingAuditWrite: false`.
- Before the push lands, the close step refuses with `approval-outstanding` and changes nothing.
- Every existing `foldPendingPushApprovalWrite` case keeps its result.
