# Process Rules Enforcement and Concurrent Dispatch Collision Closure Evidence

**Backlog Items:**
- `pipeline.unenforced-process-rules-vary-by-runner`
- `pipeline.concurrent-dispatches-in-one-shared-checkout-collide-in-ways-no-guard-catches`

**Date:** 2026-09-18  
**Author:** Antigravity (Elephant orchestrator)  
**Components:** `plugins/pipeline-core/lib/continuity-state.mjs`, `plugins/pipeline-core/lib/dispatch-record-write.mjs`, `plugins/pipeline-core/lib/dispatch-budget-core.mjs`, `plugins/pipeline-core/lib/workflow-runner-boundary.mjs`

## Problem & Background

Across multi-runner happy-path testing, rules relying only on briefing prose varied drastically (e.g. rework loops exceeding limits, dispatch record stubs, and uncontrolled tool budgets). Furthermore, concurrent dispatches sharing one working tree lacked mechanistic overlap rejection, leading to conflicting file modifications and index collisions.

## Implementation Details

1. **Product Retry and Rework Limit Enforcement:**
   - Commit `58b0e36f` implemented mechanical enforcement of the product retry policy in `continuity-state.mjs`. A single product retry is admitted and tracked in `retryBudget`; subsequent product retries are refused through the shared Continuity authority across all runners.
   - Fail-closed handling for environment reroute is enforced until trusted attestation is available.

2. **Dispatch Record Validation:**
   - `dispatch-record-write.mjs` enforces full schema validation, bounds checking, model attribution, and readback before persisting records, preventing empty or stub records.

3. **Tool Budget Policy & Binding:**
   - Implemented `dispatch-budget-core.mjs` and `guard-dispatch-budget.mjs` (commit `0be90b61c431bba82a25e39b194c8e74289d024e`), tracking and enforcing tool budgets across dispatches.

4. **Concurrent Dispatch Batch Admission & Overlap Rejection:**
   - Commit `a4c77364b8b1fcfc122d19be71e8d7800c3d19a5` implemented ranked Option 3 via a batch admission API in `workflow-runner-boundary.mjs`. It normalizes repository-relative paths and rejects exact or ancestor write/write overlaps prior to dispatch invocation.

5. **QG-06 Governance:**
   - Remaining environment-reroute and external dispatcher telemetry boundaries are tracked under QG-06 governance with due date 2026-09-30.

## Verification Results

- Continuity retry tests: PASS (13/13).
- Dispatch record write tests: PASS (22/22).
- Dispatch budget tests: PASS (49/49).
- Batch admission overlap tests: PASS (10/10).
