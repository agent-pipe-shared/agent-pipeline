# Push Lifecycle, Multi-Destination Approval, and Intent Architecture Closure Evidence

**Backlog Items:**
- `pipeline.a-push-approval-occupies-a-single-slot-so-destinations-cannot-be-prepared-together`
- `pipeline.push-flow-needs-one-remote-readback-transaction`
- `pipeline.push-artifacts-precede-operator-intent`

**Date:** 2026-09-18  
**Author:** Antigravity (Elephant orchestrator)  
**Components:** `plugins/pipeline-core/scripts/pipeline-state.mjs`, `plugins/pipeline-core/scripts/push-prepare.mjs`, `plugins/pipeline-core/scripts/push-init.mjs`, `docs/push-release-flow.md`

## Problem & Background

1. Push approvals occupied a single mutable slot in pipeline state, preventing simultaneous multi-destination approvals (e.g. preparing `main`, `stable`, and feature branches in one human signing session).
2. Generic pushes could leave pending audit writes without remote destination readback, requiring multiple disjoint CLI steps.
3. Push preparation created signature-adjacent artifacts before the operator confirmed explicit intent, leading to invalidations on late precondition checks.

## Architecture & PO Ratification Details

1. **PO Decision 3 Option A (P1 Push-Lifecycle Packet Ratification):**
   - The Product Owner formally ratified Decision 3 Option A, adopting the unified P1 Push-Lifecycle architecture packet.
   - Batch-destination approval: allows an approval record to cover an explicitly enumerated destination set within a single signed subject, eliminating serial re-signing loops.

2. **Single Transactional Push Flow with Remote Readback:**
   - Designed 5-stage push transaction model: immutable candidate preflight, intent/approval validation, conditional audit fold (strictly preserving no-unrelated-work constraints), push attempt, and authenticated remote-tip readback.
   - Terminal result vocabulary clearly reports `pushed`, `remote-readback-failed`, `push-not-confirmed`, or `not-started`.

3. **Disjoint Readiness Preview and Operator Intent:**
   - Separated read-only `push readiness` (previewing preconditions and emitting zero signature artifacts) from `push intent` (materializing the candidate-bound action only upon confirmed operator intent).
   - Introduces non-error lifecycle states (`ready-for-intent`, `stopped-by-po`, `expired`, `superseded`).

## Verification Results

- Push prepare precondition checks: PASS (26/26).
- Guard push promotion tests: PASS (18/18).
- Release promotion envelope checks: PASS (20/20).
