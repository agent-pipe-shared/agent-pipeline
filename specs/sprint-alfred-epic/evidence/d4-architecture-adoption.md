# Architecture Adoption Demand, Proposal Generator, and Repository Dogfood (WP-D4) — Verification Evidence

Checkpoint: 2026-09-14.
Task: `ALF-D4-ARCHITECTURE-ADOPTION`
Governing Spec: `specs/sprint-alfred-epic/spec.md` §7.4
Issue: #109 Architecture Adoption Demand, Staged Proposal Generator, and Repository Dogfood
Acceptance Criteria: AC-9, AC-17, Spec §7.4, Doctrine §5 & §6

---

## 1. Executive Summary

This deliverable implements Architecture Adoption Demand, Staged Proposal Generator, and Repository Dogfood (WP-D4) for Agent-Pipeline, fulfilling the requirements of Issue #109, Spec §7.4, Doctrine §5 & §6, and Acceptance Criteria AC-9 and AC-17:

1. **JSON Schemas (`schemas/`)**:
   - `schemas/pipeline.adoption-state.v1.json`:
     - Canonical schema for architecture adoption state (`architecture/adoption-state.json`).
     - States: `["adoption-required", "approved-scoped", "deferred", "partial"]`.
     - Fields: `{ schema, state, scope, decidedAt, expiresAt, reviewDate, decisionRef, rationale, coverageClass, confidence, by }`.
   - `schemas/pipeline.adoption-proposal.v1.json`:
     - Canonical schema for staged architecture adoption proposals.
     - Captures 4-stage roadmap:
       - Stage 1: Navigation map bundle (map first, #109 §5).
       - Stage 2: Core contracts by traversal frequency / priority.
       - Stage 3: Fitness model and baseline ratchet.
       - Stage 4: Continuous enforcement and receipts.
     - Enforces backfill safety and the deterministic-pass rule: generated artifacts carry `{ coverageClass, confidence }` and cannot produce `pass`.

2. **Architecture Adoption Script (`plugins/pipeline-core/scripts/architecture-adoption.mjs`)**:
   - `resolveAdoptionState(rootDir, now)`: Resolves current repository adoption state from `architecture/adoption-state.json` or evaluates baseline presence. Deterministically returns `adoption-required` with `coverageClass: "unavailable"` and `confidence: "estimated"` if no baseline/decision exists. Re-raises `adoption-required` on expired deferral.
   - `generateAdoptionProposal(rootDir)`: Produces staged, priced 4-stage proposal from the live estate (~60-script / 560-suite estate) with honest effort status (`measured`, `estimated`, `unavailable`) and explicit "what is NOT proposed" boundaries.
   - `applyAdoptionDecision({ rootDir, decision, scope, rationale, expiresAt, reviewDate, decisionRef, by })`: Persists durable PO adoption decisions to `architecture/adoption-state.json`.
   - `checkPlanningAdoptionDisposition(rootDir, taskScope, now)`: Asserts task scope has a resolved architecture disposition (`approved-scoped` or `deferred`) before implementation authority (AC-17).
   - CLI: `--root <dir> [status|propose|apply|check] [--decision approved-scoped|deferred|partial] [--scope <paths>] [--expires <date>] [--by <name>] [--json]`.

3. **Repository Dogfood Run (AC-9)**:
   - Executed adoption flow against this repository (`agent-pipeline-share_alfred`).
   - Persisted durable PO-accepted decision in `architecture/adoption-state.json` (`state: "approved-scoped"`, scope: `architecture/map/`, rationale: "Sprint Alfred full dogfood adoption covering core modules: pipeline-core, harness, schemas, backlog", decisionRef: `PO-DECISION-ALFRED-D4`).
   - Verified that planning checks pass for `architecture/map/`.

4. **Unit Tests (`plugins/pipeline-core/scripts/architecture-adoption.test.mjs`)**:
   - 13 test cases across 3 suites testing state lifecycle, staged proposal generation, AC-17 disposition before implementation authority, and backfill safety.

5. **Verify Suite & Capability Registrations**:
   - Registered `architecture-adoption-tests` in `harness/verify-suites.json`.
   - Registered surfaces and test evidence in `docs/product-capability-inventory.json` under `deterministic-verification`.
   - Updated `architecture/map/pipeline-core.md`, `architecture/map/schemas.md`, and `architecture/fitness-model.json`.
   - C2 consolidation invariant pins:
     - `invariantPinned`: "Adoption state resolution, 4-stage adoption proposal generation, durable PO decision persistence, and AC-17 planning disposition checks before implementation authority are deterministic and fail-closed."
     - `nonOverlapNote`: "Tests architecture adoption state lifecycle, staged proposal generator, and AC-17 disposition gating; does not overlap with module-inventory or architecture-fitness tests."

---

## 2. Dogfood Run Details (AC-9)

The adoption script was executed against this repository (`agent-pipeline-share_alfred`), exercising the complete brownfield adoption demand loop:

### 2.1 Applied Adoption Decision (`architecture/adoption-state.json`)
```json
{
  "schema": "pipeline.adoption-state.v1",
  "state": "approved-scoped",
  "scope": "architecture/map/",
  "decidedAt": "2026-09-14T07:44:00.000Z",
  "expiresAt": null,
  "reviewDate": null,
  "decisionRef": "PO-DECISION-ALFRED-D4",
  "rationale": "Sprint Alfred full dogfood adoption covering core modules: pipeline-core, harness, schemas, backlog",
  "coverageClass": "evaluated",
  "confidence": "measured",
  "by": "PO"
}
```

### 2.2 Status Readback
Command:
```bash
node plugins/pipeline-core/scripts/architecture-adoption.mjs status
```
Output:
```
Adoption State: approved-scoped
Scope: architecture/map/
CoverageClass: evaluated (confidence: measured)
Rationale: Sprint Alfred full dogfood adoption covering core modules: pipeline-core, harness, schemas, backlog
```

### 2.3 Planning Disposition Check
Command:
```bash
node plugins/pipeline-core/scripts/architecture-adoption.mjs check --scope "architecture/map/index.md"
```
Output:
```
Planning disposition check PASSED: approved-scoped
Scope: architecture/map/
```

### 2.4 Staged Proposal Output
Command:
```bash
node plugins/pipeline-core/scripts/architecture-adoption.mjs propose
```
Output:
```
=== Architecture Adoption Staged Proposal ===
GeneratedAt: 2026-09-14T05:48:46.991Z
CoverageClass: evaluated (confidence: estimated)
Total Estimated Units: 24 (estimated)

Stages:
  Stage 1: Navigation map bundle (map first, #109 §5) [5 units, measured]
    Deploy machine-readable OKF v0.1 navigation map bundle: AGENTS.md entry pointer, architecture/map/index.md root index, and governed module concept files.
  Stage 2: Core contracts by traversal frequency / priority [8 units, estimated]
    Formalize public interface contracts for hottest modules by traversal frequency and preflight authority dependency.
  Stage 3: Fitness model and baseline ratchet [5 units, measured]
    Establish architecture fitness model and baseline ratchet store inventorying accepted debt without retroactive fabrication.
  Stage 4: Continuous enforcement and receipts [6 units, estimated]
    Enforce architecture properties at planning, candidate, push, and CI boundaries, recording module interaction receipts.

What is NOT proposed:
  - No architectural restructuring
  - No all-at-once migration
  - No retroactive ADR mass backfill
  - No prompt-based pass claims
```

---

## 3. AC-17 Disposition Before Authority

AC-17 requires that no work package reaches implementation authority in a governed area whose architecture disposition is unresolved; an `adoption-deferred` decision satisfies this, an absent one does not.

Verification in `architecture-adoption.test.mjs` confirms:
1. **Unconfigured / Missing Disposition**: Returns `ok: false`, disposition `adoption-required`. Fails planning checks.
2. **Approved Scoped Disposition**: Returns `ok: true`, disposition `approved-scoped` when task scope is within the approved boundary. If task scope falls outside the approved boundary, returns `ok: false` with boundary diagnosis.
3. **Deferred Disposition**: Returns `ok: true`, disposition `deferred`. Validates that deferral satisfies authority disposition until expiry.
4. **Expired Deferral**: Automatically re-raises `adoption-required` with `expired: true` and fails planning checks (`disposition: "expired-deferral"`).

### 3.1 Runtime authority binding (2026-09-15)

The disposition is now consumed on the runner path that grants implementation
authority, rather than remaining a standalone CLI check. `guard-lifecycle-ready`
recognizes only the already closed, sanctioned `pipeline-state.mjs set-phase
--phase implementation` argv shape. After exact session readiness, it reads the
writer-owned active feature plan path and invokes
`checkPlanningAdoptionDisposition` for that scope. A missing, expired, or
out-of-scope decision refuses the transition with
`GUARD-ARCHITECTURE-ADOPTION-UNRESOLVED`; only an in-scope approved, deferred,
or partial disposition is admitted.

The focused guard regression covers all three real resolver outcomes — missing
decision, matching scoped decision, and a decision for a different scope:

```text
node --test plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs
```

This is runner-hook enforcement for supported hook runtimes. The decision
writer's PO ceremony and the remaining D3 boundary integrations remain separate
acceptance obligations; this record does not claim that those are complete.

---

## 4. Backfill Safety & Deterministic-Pass Rule (#109 §5, Spec §7.4)

In accordance with Doctrine §5 & §6 and Spec §7.4:
- The machine-readable navigation map is the primary artifact; human documentation is derived from it.
- Generated adoption artifacts carry `{ coverageClass, confidence }`.
- Under the deterministic-pass rule, generated maps, contracts, and proposals cannot produce or claim `pass` until locally verified and backed by deterministic test evidence.
- The proposal explicitly enumerates what is NOT proposed: no forced restructuring, no all-at-once migration, and no fabricated retroactive ADR history.

---

## 5. Verification & Test Evidence

### 5.1 Architecture Adoption Test Suite
Command:
```bash
node --test plugins/pipeline-core/scripts/architecture-adoption.test.mjs
```
Output:
```
▶ Architecture Adoption (WP-D4, Issue #109, AC-9, AC-17)
  ▶ 1. Adoption State Lifecycle
    ✔ resolves adoption-required when neither adoption-state nor baseline exists (0.912995ms)
    ✔ applies and resolves approved-scoped adoption decision (0.941454ms)
    ✔ applies and resolves deferred adoption decision with expiry (1.437231ms)
    ✔ re-raises adoption-required when deferral has expired (0.486706ms)
    ✔ applies and resolves partial adoption decision (0.491546ms)
    ✔ rejects invalid decision or empty rationale (0.562845ms)
  ✔ 1. Adoption State Lifecycle (5.472122ms)
  ▶ 2. Staged Proposal Generation (#109 §5)
    ✔ generates a 4-stage proposal with map first (0.604414ms)
    ✔ enforces backfill safety and deterministic-pass rule (0.317701ms)
  ✔ 2. Staged Proposal Generation (#109 §5) (1.057582ms)
  ▶ 3. AC-17 Disposition Before Authority
    ✔ fails planning check if disposition is unconfigured (adoption-required) (0.379859ms)
    ✔ passes planning check if disposition is approved-scoped for covered scope (0.35238ms)
    ✔ fails planning check if task scope is outside approved-scoped boundary (0.34252ms)
    ✔ passes planning check if disposition is deferred (AC-17) (0.267713ms)
    ✔ fails planning check if deferral has expired (0.349851ms)
  ✔ 3. AC-17 Disposition Before Authority (1.8585ms)
✔ Architecture Adoption (WP-D4, Issue #109, AC-9, AC-17) (8.806971ms)
ℹ tests 13
ℹ suites 4
ℹ pass 13
ℹ fail 0
```

### 5.2 Verify Suite Registration Check
Command:
```bash
node harness/scripts/check-verify-suite-registration.mjs
```
Output:
```
Verify suite registration is complete: 560 registered, 0 declared exclusion(s), 0 unregistered.
```

### 5.3 Backlog State & Ledger Verification
Command:
```bash
node plugins/pipeline-core/scripts/check-backlog-state.mjs
```
Output:
```
Backlog state, transition ledger, closure evidence, and generated projections are valid.
```

### 5.4 Clean Diff Check
Command:
```bash
git diff --check
```
Output: Clean (exit 0).
