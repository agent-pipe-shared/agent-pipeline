# Lifecycle Event Schema Non-Dispatch Governance Action Closure Evidence

**Backlog Item:** `pipeline.lifecycle-event-schema-has-no-non-dispatch-correlation-shape`  
**Date:** 2026-09-18  
**Author:** Antigravity (Elephant orchestrator)  
**Components:** `governance/schemas/governance-action-event.schema.json`, `plugins/pipeline-core/lib/governance-action-events.mjs`, `plugins/pipeline-core/lib/governance-action-events.test.mjs`, `plugins/pipeline-core/lib/governance-recovery-reconciliation-action.mjs`, `plugins/pipeline-core/lib/governance-recovery-reconciliation-action.test.mjs`, `plugins/pipeline-core/lib/governance-replay.mjs`, `plugins/pipeline-core/lib/governance-event-projection.mjs`, `plugins/pipeline-core/lib/governance-event-store.mjs`

## Problem & Background

`validateLifecycleGovernanceEvent` previously required every event's `correlation` object to carry queue-dispatched worker execution fields (`{packageId, dispatchId, attemptId, workerId, correlationId, queueRevision}`). This correlation shape was invalid for non-dispatch governance actions (verification, review, gate, recovery, reconciliation). Representing those actions required either fabricating fake dispatch identities or extending the schema with a second, non-dispatch correlation shape.

## Implementation Details

1. **ADR-0083 Adoption (Option B):**
   - Published `pipeline.governance-action-event.v1` as a dedicated payload schema under envelope origin `lifecycle`, authority class `non-authoritative`, and stream `lifecycle`.
   - `pipeline.lifecycle-governance-event.v1` remains the dispatch-correlated payload (`dispatch`, `status`, `candidate-invalidation`).

2. **Dedicated Action Event Modules:**
   - `governance-action-events.mjs`: Implements `buildGovernanceActionEvent` and `validateGovernanceActionEvent`, enforcing closed fields, valid matrix rows, digest stability, and exact candidate/source identity.
   - Dedicated producers for verification, review, gate, recovery, reconciliation, and HGO consumption actions.
   - Unified replay and projection support in `governance-replay.mjs`, `governance-replay-view.mjs`, `governance-event-projection.mjs`, and `governance-event-store.mjs`.

3. **Automated Verification:**
   - `plugins/pipeline-core/lib/governance-action-events.test.mjs`: 13/13 PASS.
   - `plugins/pipeline-core/lib/governance-recovery-reconciliation-action.test.mjs`: 9/9 PASS.
   - `plugins/pipeline-core/lib/governance-event-store.test.mjs` & `governance-event-projection.test.mjs`: All passing.

## Verification Results

- All 8 acceptance criteria (LND-0 through LND-8) and the independent HGO decision are fully satisfied and covered by passing automated suites.
