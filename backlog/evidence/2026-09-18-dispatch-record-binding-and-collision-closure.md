# Dispatch Record Binding and Collision Closure Evidence

**Backlog Item:** `pipeline.half-the-dispatch-records-omit-the-field-that-binds-them-to-their-commit`
**Date:** 2026-09-18
**Author:** Antigravity (Elephant orchestrator)
**Components:** `harness/scripts/check-dispatch-provenance.mjs`, `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs`

## Problem & Analysis

1. **Record Shape Validation:**
   - As documented in `templates/prompts/agent-obligations.md` §6, a `Dispatch: <TASK_ID> (goldfish)` commit trailer entails three machine-checkable properties: the record exists at `evidence/dispatch-record-<TASK_ID>.json`, its `outcome` is terminal, and its `report.changedFiles` covers the paths touched by the commit.
   - Direction 1 was implemented in commit `1c2425f1` (`NVA-B-RECSHAPE-1`), adding `checkDispatchRecordShape` in `harness/scripts/check-dispatch-provenance.mjs` to measure these conditions per-commit.
   - Graduation to fatal was initially blocked on resolving whether durable provenance belongs in a gitignored directory (`2026-09-01-fourteen-evidence-files-are-tracked-inside-a-gitignored-directory.md`), which is now closed in commit `566d5523`.

2. **Task ID Reuse Collision Discovery:**
   - A distinct failure mode was observed on 2026-09-04: identical task IDs (`NVA-B-CRITICWRITE-1`) were assigned to two unrelated work packages three days apart (commits `f262a5c7` and `b72e22b2`).
   - Because `evidence/dispatch-record-<TASK_ID>.json` is single-slotted per task ID, the second package overwrote the record of the first, permanently orphaning the earlier commit's authorship binding (`record-names-different-commit`).
   - The root cause was that nothing verified task ID uniqueness before issuing a dispatch or creating its opening act record.

## Implementation Details

1. **PreToolUse Collision Protection in Guard Layer:**
   - Added `checkDispatchRecordCollision` and `blockedDispatchRecordCollision` in `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs`.
   - Exported denial code `GUARD-DISPATCH-RECORD-COLLISION`.
   - When any tool write targets `evidence/dispatch-record-<TASK_ID>.json`:
     a. If the file already exists on disk and has a terminal outcome (`isTerminalOutcome(existing.outcome)`), any write attempting to start a new dispatch (`outcome: "in-progress"`) or overwrite the record with a mismatched candidate commit is blocked.
     b. If an opening write (`outcome: "in-progress"`) is attempted, the guard also queries git history (`git log -1 --format=%H --grep="^Dispatch:[ \t]*<TASK_ID>[ \t]*("`). If a commit already carries that task ID in its `Dispatch:` trailer, the opening write is blocked immediately before work is done.
     c. Legitimate finalization updates (e.g. transitioning an in-progress record to terminal outcome upon task completion) and writes with fresh unique task IDs remain completely unhindered.

2. **Full Regression Test Coverage:**
   - Added unit tests in `plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs` verifying:
     - Completed record on disk rejects overwrite by a new opening write.
     - Fresh task IDs with no existing record or git history are admitted.
     - In-progress records transitioning to terminal status are admitted.
     - Opening writes referencing task IDs already committed in git history are blocked.
     - End-to-end `evaluateLifecycleReadyGuard` returns exit code 2 and `GUARD-DISPATCH-RECORD-COLLISION` denial message.

## Verification

1. **Test Execution:**
   - Executed `node plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs`: all 250 tests passed (duration ~20s).
   - Executed `node harness/scripts/check-dispatch-provenance.test.mjs`: all 32 tests passed.
   - Executed `node harness/scripts/check-consumer-safe-paths.mjs`: passed (1201 tracked files, 143 allowlist entries).

All criteria satisfied. Item closed.
