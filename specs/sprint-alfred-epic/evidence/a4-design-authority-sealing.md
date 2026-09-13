# Design-Authority Sealing and Staging Draft Rejection (WP-A4) — Verification Evidence

Checkpoint: 2026-09-13.
Task: `ALF-A4-DESIGN-AUTHORITY-SEALING`
Governing Spec: `specs/sprint-alfred-epic/spec.md` §4.4
Issue: #102 Design-Authority Sealing
Acceptance Criteria: AC-2, AC-4

---

## 1. Executive Summary

This deliverable implements Design-Authority Sealing and Staging Draft Rejection (WP-A4) per Issue #102, PRD §7 AC-2, AC-4, and Spec §4.4, closing three open backlog items:
1. `backlog/items/2026-08-27-plan-approval-binds-a-staging-draft-as-project-authority.md`
2. `backlog/items/2026-08-27-set-feature-to-submit-plan-is-not-closed-without-a-coordinator-only-continuity-init.md`
3. `backlog/items/2026-08-28-a-design-phase-prd-and-spec-are-frozen-by-their-own-continuity-binding.md`

---

## 2. Implemented Changes

### 2.1 Staging Draft Rejection Guard (`plugins/pipeline-core/lib/plan-authority-staging-guard.mjs`)
- Enhanced `refusePlanAuthorityStagingPath({ rootDir, planPath, specPath, readFileFn })`:
  - **Staging path check**: Refuses if `planPath` or `specPath` resolves inside `project/.onboarding-staging/` (`INTAKE_STAGING_DIRNAME`).
  - **Banner line check**: Refuses if the file content at `planPath` or `specPath` carries the generated pre-authority banner line (`PRE_AUTHORITY_BANNER_LINE` / `PRE_AUTHORITY_BANNER_SNIPPET`: `this staging file is NOT yet bound as project authority`), even if copied outside the staging directory into `specs/`.
  - **Typed refusal code**: Emits standard code `PLAN-BINDS-PRE-AUTHORITY-DRAFT`, while exporting `PLAN-AUTHORITY-STAGING-UNPROMOTED` and `PLAN_AUTHORITY_STAGING_CODE` as backwards-compatible aliases.
  - **Actionable error message**: Explicitly names the promotion action:
    `node plugins/pipeline-core/scripts/project-onboarding-v3.mjs kickoff promote apply` (subcommand `kickoff-promote-apply`).
  - Verified `PLAN_AUTHORITY_PROMOTION_SUBCOMMAND` against the authentic `ONBOARDING_SUBCOMMANDS` registry.

### 2.2 Lifecycle State Writer Integrity (`plugins/pipeline-core/scripts/pipeline-state.mjs`)
- **`set-feature` continuity initialization**:
  - When creating a feature in `phase: "design"`, initializes revision-0 design continuity (`pipeline.continuity.v0`) on the active feature state.
  - Resolves PRD and Spec paths and calculates sha256 digests from existing files on disk or PO gate authority.
  - Configures initial `queueHead` with `actionId: "review-active-feature"` and `nextAction: "review"`.
  - Guarantees subsequent `submit-plan` transitions directly without `PLAN-SUBMIT-CONTINUITY-INVALID` and without requiring an undocumented coordinator-only `continuity-init`.
- **Pre-authority draft gating in `submit-plan` and `approve-plan`**:
  - Both writers invoke `refusePlanAuthorityStagingPath` with `readFileFn` injection.
  - Path containment and banner line checks are enforced independently at submission and approval boundaries.
- **`continuity-init` compatibility**:
  - `continuityTransition` accepts `continuity-init` with `--expected-revision absent` when the existing state is an initial revision-0 design state, maintaining backward compatibility with prior test fixtures.

### 2.3 Lifecycle Ready Guard Authority Document Sealing (`plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs`)
- In `boundAuthorityDocumentPath(root, requested)`:
  - Added condition: If `state.activeFeature?.phase === "design"` and `state.planApproved !== true`, returns `null`, permitting agent edits to design PRD and Spec files during the open design phase.
  - Sealing freeze is armed when `phase === "implementation"` (or after `planApproved === true` without invalidation), blocking mutations with `GUARD-LIFECYCLE-AUTHORITY-BOUND`.
  - When `reopen-design` is called, `planInvalidation` is recorded, properly releasing the binding and unlocking design edits.

### 2.4 Test Suite & Registrations
- Authored `plugins/pipeline-core/lib/plan-authority-staging-guard.test.mjs` with 9 comprehensive tests:
  - Staging directory refusal (plan, spec, both).
  - Pre-authority banner line refusal (plan, spec, both, inside and outside staging).
  - Clean promoted documents pass.
  - Backwards-compatibility code aliases and CLI promotion command registration.
  - `submit-plan` and `approve-plan` staging rejection integration fixtures.
  - `set-feature` -> `submit-plan` direct workflow without `continuity-init`.
  - Authority document mutability during design and freezing during implementation.
- Registered `plan-authority-staging-guard-tests` in:
  - `harness/verify-suites.json`
  - `docs/product-capability-inventory.json` under `deterministic-verification` (`surfaceIds` and `testEvidence`).

---

## 3. Verification Results

1. **Unit Test Suite**:
   `node --test plugins/pipeline-core/lib/plan-authority-staging-guard.test.mjs`
   Passes: 9/9 tests (0 failures).

2. **State Writer Tests**:
   `node --test plugins/pipeline-core/scripts/pipeline-state.test.mjs`
   Passes: all checks passed (0 failures).

3. **Lifecycle Ready Guard Tests**:
   `node --test plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs`
   Passes: 258/258 tests (0 failures).

4. **Verify Suite Registration Check**:
   `node harness/scripts/check-verify-suite-registration.mjs`
   Exit code: 0 (554 registered, 0 declared exclusions, 0 unregistered).

5. **Git Diff Check**:
   `git diff --check`
   Exit code: 0 (clean, no trailing whitespace or merge conflict markers).
