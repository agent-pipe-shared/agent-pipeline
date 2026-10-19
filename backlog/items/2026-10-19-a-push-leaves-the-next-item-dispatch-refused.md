---
schema: pipeline.backlog-item.v1
id: pipeline.a-push-leaves-the-next-item-dispatch-refused
type: defect
owner: pipeline
status: open
created: 2026-10-19
source: "Live dispatch of ALF-F7B-PRETOOL-PARITY on this repository, right after the c27576438 checkpoint push (2026-10-19)"
sprint: none
done_when: manual
---

# A push leaves the next item dispatch refused

## Description

After the c27576438 checkpoint push, the next governed item dispatch on this repository was
refused before launch:

`SDC-AUTHORITY-UNAVAILABLE: version 2 native host binding failed before launch. Reason: AGY-HOST-BASELINE-DIRTY`

The native host baseline (`captureHostCommitBaseline`, `lib/agy-host-commit-admission.mjs`)
refuses any tracked path that differs from HEAD. Two such paths were present, and the Pipeline
itself wrote both:

- **`project/pipeline-state.json`.** `approve-push` writes `pushApproval.lastApproved` with
  `pendingAuditWrite: true` after the signed subject, so every successful approve-push leaves
  this file dirty. `push-prepare`'s fold refuses while `forCommit` equals HEAD
  (`approval-outstanding`, NVA-CF-PUSHFOLD gate 2). Right after the push, `forCommit` is still
  HEAD. Until some other commit moves HEAD, the record stays dirty and every item dispatch is
  refused. The Elephant can only move HEAD with an unrelated docs commit.
- **`.agents/plugins.json`.** The installer rewrites this tracked file to the Antigravity
  runner view. This applies to this repository. Whether a consumer repository tracks the file
  has not been measured.

The refusal names neither the dirty paths nor the repair.

## Acceptance

- A push, followed by an item dispatch with no other change, is admitted. Either the
  approval record no longer blocks the baseline, or it is folded once the push has landed.
- The refusal names each dirty path and its repair.
- A pin covers approve-push → push → item dispatch.
