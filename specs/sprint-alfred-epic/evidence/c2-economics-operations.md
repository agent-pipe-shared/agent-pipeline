# Dispatch Economics, Closing Allowance, Range Mode Check, Clone Provisioning Readback, and Critic Notes Persistence (WP-C2 & Operations) — Verification Evidence

**Checkpoint:** 2026-09-14  
**Task:** `ALF-C2-ECONOMICS-OPERATIONS`  
**Governing Spec:** `specs/sprint-alfred-epic/spec.md` §7.3 (WP-C2) & Operations  
**Closed Backlog Items:**
1. `backlog/items/2026-08-08-long-dispatches-truncate-before-emitting-their-report.md`
2. `backlog/items/2026-08-16-verify-has-grown-to-269-suites-with-no-recorded-cost.md`
3. `backlog/items/2026-08-17-goldfish-critic-dispatch-bootstrap-token-cost-is-disproportionate.md`
4. `backlog/items/2026-08-25-verify-range-mode-registration-for-orchestrator-commit-control.md`
5. `backlog/items/2026-08-27-a-fresh-clone-loses-all-machine-local-pipeline-state-with-no-provisioning-readback.md`
6. `backlog/items/2026-08-27-critic-dispatches-cannot-persist-their-scratch-notes.md`

---

## 1. Executive Summary

This deliverable resolves all six open operational and economic backlog items under WP-C2 and Alfred operations, bringing the complete Sprint Alfred backlog to 100% closure.

### Key Deliverables Implemented:
1. **Closing Allowance (`schemas/pipeline.dispatch-closing-allowance.v1.json`):**
   - Formal schema specifying `{ schema, tokensRemaining, turnsRemaining, phase }`.
   - Integrated into `plugins/pipeline-core/lib/dispatch-record.mjs` (supported in `dispatch-record.v3` schema).
   - Prompt guidance added to `templates/prompts/goldfish-task.md` and vendored canon.
   - Tested in `plugins/pipeline-core/lib/dispatch-record.test.mjs` (Case 1 DRC01).

2. **Verify Suite Cost Telemetry & Consolidation Invariant:**
   - Updated `schemas/pipeline.verify-suites.v1.json` with optional `durationMs` and required consolidation fields: `invariantPinned` and `nonOverlapNote`.
   - Updated `harness/scripts/check-verify-suite-registration.mjs` and `check-verify-suite-registration.test.mjs` to validate these invariants on all declarative suites.
   - Updated all entries in `harness/verify-suites.json`.

3. **Bootstrap Token Economics Analysis:**
   - Empirical investigation in `specs/sprint-alfred-epic/evidence/c2-dispatch-token-breakdown.md`.
   - Concluded bootstrap represents ~17.2% of token usage (<40%), while iterative active work (63.1%) and verification sweeps dominate.

4. **Verify Range Mode Check (`check-commit-type-range.mjs`):**
   - Implemented `plugins/pipeline-core/scripts/check-commit-type-range.mjs` to audit Conventional Commit types over git revisions between base and HEAD.
   - Fully tested with `check-commit-type-range.test.mjs`.
   - Registered in `harness/verify-suites.json` and capability inventory.

5. **Clone Provisioning Readback (`check-clone-provisioning.mjs`):**
   - Canonical report schema `schemas/pipeline.clone-provisioning-report.v1.json`.
   - Implementation in `plugins/pipeline-core/scripts/check-clone-provisioning.mjs` reporting presence/readiness of git hooks, PO profile receipts, and private state directories.
   - Integrated into `plugins/pipeline-core/scripts/pipeline-start-preflight.mjs` and tested in `pipeline-start-preflight.test.mjs` and `check-clone-provisioning.test.mjs`.

6. **Critic Scratch Notes Persistence:**
   - Updated `plugins/pipeline-core/lib/guard-devplan-policy.mjs` with `isCriticScratchNotesPath` allowing write operations to `scratch/dispatch/<task>/critic-notes.md` during all phases.
   - Verified in `plugins/pipeline-core/lib/guard-devplan-policy.test.mjs`.
   - Documented in `plugins/pipeline-core/agents/critic.md` and `templates/prompts/critic-review.md`.

---

## 2. Verification Command Runs & Results

All verification suites pass deterministically:

1. **Commit Type Range Check:**
   ```
   node plugins/pipeline-core/scripts/check-commit-type-range.mjs
   Output: Commit type range check passed: 141 commit(s) verified in c1e799c1ea8681c96e2fc5da7380499e20b748e0..HEAD.
   ```

2. **Commit Type Range Unit Tests:**
   ```
   node --test plugins/pipeline-core/scripts/check-commit-type-range.test.mjs
   ✔ auditCommitTypeRange: clean conventional commit range passes
   ✔ auditCommitTypeRange: non-conventional commit type produces finding
   ✔ auditCommitTypeRange: missing base when plugin.json has no parsable version returns skipped
   tests 3, pass 3, fail 0
   ```

3. **Clone Provisioning Verification:**
   ```
   node plugins/pipeline-core/scripts/check-clone-provisioning.mjs
   Output: Clone provisioning status: ready
   ```

4. **Clone Provisioning Unit Tests:**
   ```
   node --test plugins/pipeline-core/scripts/check-clone-provisioning.test.mjs
   ✔ checkCloneProvisioning returns well-formed report against current root
   ✔ checkCloneProvisioning handles non-git root cleanly
   tests 2, pass 2, fail 0
   ```

5. **Guard DevPlan Policy Tests:**
   ```
   node --test plugins/pipeline-core/lib/guard-devplan-policy.test.mjs
   ✔ isCriticScratchNotesPath identifies critic notes and dispatch scratch paths
   ✔ devPlanGateVerdict unconditionally admits scratch/dispatch/TASK-1/critic-notes.md during all phases
   tests 2, pass 2, fail 0
   ```

6. **Verify Suite Registration:**
   ```
   node harness/scripts/check-verify-suite-registration.mjs
   Output: Verify suite registration is complete: 564 registered, 0 declared exclusion(s), 0 unregistered.
   ```

7. **Verify Suite Registration Unit Tests:**
   ```
   node harness/scripts/check-verify-suite-registration.test.mjs
   tests 47, pass 47, fail 0
   ```

8. **Dispatch Record Unit Tests:**
   ```
   node plugins/pipeline-core/lib/dispatch-record.test.mjs
   tests 10, pass 10, fail 0
   ```

9. **Vendored Template Sync Tests:**
   ```
   node --test plugins/pipeline-core/scripts/check-vendored-template-sync.test.mjs
   tests 4, pass 4, fail 0
   ```

10. **Consumer Safe Paths Test:**
    ```
    node --test harness/scripts/check-consumer-safe-paths.test.mjs
    tests 9, pass 9, fail 0
    ```

11. **Pipeline Start Preflight Tests:**
    ```
    node --test plugins/pipeline-core/scripts/pipeline-start-preflight.test.mjs
    tests 60, pass 60, fail 0
    ```
