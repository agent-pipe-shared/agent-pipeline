# Architecture Fitness Evaluator and Ratchet Store (WP-D3) — Verification Evidence

Checkpoint: 2026-09-14.
Task: `ALF-D3-ARCHITECTURE-FITNESS`
Governing Spec: `specs/sprint-alfred-epic/spec.md` §7.3
Issue: #106 Mechanically enforce agent-first architecture with baseline-and-ratchet fitness checks
Acceptance Criteria: AC-10, AC-18, AC-21, Spec §7.3, Doctrine §2.10, §3.3 & §4

---

## 1. Executive Summary

This deliverable implements the Architecture Fitness Evaluator and Ratchet Store (WP-D3) for Agent-Pipeline, fulfilling all requirements of Issue #106, Spec §7.3, Doctrine §2.10, §3.3 & §4, and Acceptance Criteria AC-10, AC-18, and AC-21:

1. **JSON Schemas (`schemas/`)**:
   - `schemas/pipeline.fitness-evidence.v1.json`: Canonical schema for fitness evaluation evidence across all five lifecycle boundaries (`planning`, `dispatch`, `candidate`, `pre-close`, `push`, `ci`). Strictly defines outcome enum: `["pass", "finding", "unavailable", "unsupported", "unknown", "excepted"]`. Captures `{ schema, evaluationMode, outcomes: [{ classId, propertyId, outcome, details, evidence }], overallStatus, summary }`.
   - `schemas/pipeline.architecture-baseline.v1.json`: Schema for the architecture baseline and ratchet store (`architecture/baseline.json`). Captures `{ schema, baselineRevision, acceptedViolations: [{ ruleId, module, target, rationale, acceptedAt, expiresAt }], ratchetMetrics, lastEvaluatedAt, stalenessDebt }`.
2. **Fitness Model & Ratchet Baseline (`architecture/`)**:
   - `architecture/fitness-model.json`: Machine-readable fitness model for the repository referencing the 4 governed modules (`pipeline-core`, `harness`, `schemas`, `backlog`), allowed boundary crossings, allowed dependency directions, authority effects, verification entry points, navigation artifacts, parallel work constraints, severity/blocking rules, and anti-fragmentation policy.
   - `architecture/baseline.json`: Initial ratchet baseline in conforming state (0 accepted violations, 0 cycles, 0 boundary crossings).
3. **Architecture Fitness Evaluator (`plugins/pipeline-core/scripts/architecture-fitness.mjs`)**:
   - Evaluates all 10 evaluated property classes (Spec §7.3 table / Doctrine §2.10):
     1. `module-identity-ownership`: Path -> module resolution via `module-inventory.mjs`.
     2. `contract-presence-freshness`: Public contract existence and freshness verification.
     3. `dependency-direction-cycles`: AST/regex-based JS/MJS import graph analyzer with cycle detection; explicit `unsupported` outcome for uncovered languages.
     4. `boundary-crossing`: Compares candidate diff against planned and authorized module surfaces.
     5. `authority-effect-ownership`: Mechanical verification of protected side effects against declared module authority effects.
     6. `verification-locality`: Mechanical check that declared module verification entry points exist and run locally.
     7. `navigation-currency`: Verifies navigation map bundle currency against touched contracts (AC-18); fails closed on candidate / publication push; records typed `architecture-map-stale` debt on checkpoint push.
     8. `parallel-overlap`: Verifies write-surface intersection across concurrently dispatched packages.
     9. `profile-drift`: Verifies module identity stability against accepted inventory.
     10. `calibrated-friction-thresholds`: Checks context and friction receipts; reports `unavailable` when uncalibrated (< 14 dogfood days).
   - **Deterministic-pass rule enforcement (AC-10)**: Model-judged or prompt-compliance claims can never produce `pass`. Any prompt-claimed pass is downgraded to `finding` or `unknown`.
   - **Anti-fragmentation enforcement (AC-21)**: Detects and rejects misleading tiny-module optimizations where modules have trivial single-line or duplicate facades created to evade complexity thresholds.
   - **Ratchet mechanism**: Net-new or worsened violations block; existing accepted violations in `architecture/baseline.json` pass as `excepted`; resolved violations reduce the ratchet deterministically.
   - **CLI interface**: `--root <dir> [--mode planning|candidate|push|ci] [--check] [--json] [--checkpoint] [--diff <paths...>]`.
4. **Unit Tests (`plugins/pipeline-core/scripts/architecture-fitness.test.mjs`)**:
   - 41 test cases across 8 suites testing all 10 property classes, AC-10 deterministic-pass rule, AC-18 navigation currency and debt, AC-21 anti-fragmentation, ratchet reduction, and the full 21-fixture catalog of Issue #106.
5. **Verify Suite & Capability Registrations**:
   - Registered `architecture-fitness-tests` in `harness/verify-suites.json`.
   - Registered surfaces and test evidence in `docs/product-capability-inventory.json` under `deterministic-verification`.
   - C2 consolidation invariant pins:
     - `invariantPinned`: "Fitness evaluation across the 10 property classes, deterministic-pass rule enforcement, anti-fragmentation enforcement, and baseline ratchet mechanics are deterministic and fail-closed."
     - `nonOverlapNote`: "Tests architecture fitness evaluator, ratchet store, and 21 fixture scenarios; does not overlap with architecture-baseline, architecture-remedy, or module-inventory tests."

---

## 2. Issue #106 21-Fixture Scenario Walkthrough

Every fixture named in Issue #106 §Scope and acceptance criteria is explicitly tested and verified in `plugins/pipeline-core/scripts/architecture-fitness.test.mjs`:

| # | Fixture Name | Requirement / Behavior | Evaluator Outcome |
|---|---|---|---|
| 1 | `inherited greenfield default` | Work without custom profile deterministically resolves to `inherited-agent-first`. | `pass` / `profileSource: inherited-agent-first` |
| 2 | `accepted custom profile` | PO-approved custom profile is honored and enforced identically. | `pass` / `profileSource: accepted-custom-*` |
| 3 | `clean architecture` | Repository meeting all 10 properties passes evaluation cleanly. | `pass` (overallStatus: `pass`, 0 findings) |
| 4 | `missing/stale contract` | Missing or 0-byte contract file produces finding. | `finding` (`missing-contract` / `stale-contract`) |
| 5 | `accepted legacy debt` | Pre-existing violation listed in baseline passes as excepted. | `excepted` (`[EXCEPTED]` with audit rationale) |
| 6 | `new/worsened violation` | Net-new violation outside baseline blocks candidate. | `finding` / overallStatus `blocked` |
| 7 | `resolved violation` | Resolved baseline violation reduces ratchet total deterministically. | Ratchet reduction (`resolvedCount > 0`) |
| 8 | `new cycle` | Circular inter-module dependency graph detected via DFS. | `finding` (`dependency-cycle`) |
| 9 | `hidden side effect` | Undeclared `child_process` or write without declared authority effect fails. | `finding` (`undeclared-authority-effect`) |
| 10 | `missing local verification` | Missing test or entry-point file in `verificationEntryPoints` fails. | `finding` (`missing-verification-entry-point`) |
| 11 | `stale architecture map` | Stale navigation map bundle fails closed at candidate/push boundary (AC-18). | `finding` / overallStatus `blocked` |
| 12 | `analyzer unavailable` | Uncovered language (e.g. Python/Rust) returns unsupported outcome. | `unsupported` |
| 13 | `legitimate override` | Scoped human waiver recorded in baseline passes with rationale. | `excepted` (with rationale) |
| 14 | `expiry/supersession` | Expired exception in baseline is revoked and fails as finding. | `finding` (`[EXPIRED-EXCEPTION]`) |
| 15 | `scope divergence` | Candidate modifying files outside planned module surface fails. | `finding` (`unauthorized-boundary-crossing`) |
| 16 | `prompt-only claimed compliance` | Prompt/model self-attestation downgraded from pass (AC-10). | `finding` / `unknown` (never `pass`) |
| 17 | `exact-candidate drift` | Unapproved module identity or topology mutation detected. | `finding` (`profile-drift`) |
| 18 | `checkpoint push with stale map` | Session-checkpoint push records typed `architecture-map-stale` debt (AC-18). | `finding` + typed `stalenessDebt` record |
| 19 | `follow-up session blocked` | Open push-time staleness debt identified before implementation authority. | Blocked until debt consumed |
| 20 | `publication push failing closed` | Final publication push fails closed on stale navigation map. | `finding` / overallStatus `blocked` |
| 21 | `deterministic debt reduction` | Refreshing navigation map bundle clears staleness debt on resolution. | `pass` / `stalenessDebt: []` |

---

## 3. Verification Commands and Readback

### 3.1 Architecture Fitness Unit Tests (`architecture-fitness.test.mjs`)
Command:
```bash
node --test plugins/pipeline-core/scripts/architecture-fitness.test.mjs
```
Output:
```
▶ architecture-fitness evaluator & ratchet store (WP-D3, Issue #106, AC-10, AC-18, AC-21)
  ▶ 1. Ten evaluated property classes (Spec §7.3 / Doctrine §2.10)
    ✔ Class 1: module-identity-ownership verifies owned paths and flags unresolved ones
    ✔ Class 2: contract-presence-freshness verifies public contracts and detects missing/stale files
    ✔ Class 3: dependency-direction-cycles verifies dependencies, flags cycles, and returns unsupported for non-JS
    ✔ Class 4: boundary-crossing verifies candidate matches planned module boundaries
    ✔ Class 5: authority-effect-ownership mechanically verifies side-effect ownership
    ✔ Class 6: verification-locality verifies declared entry points exist
    ✔ Class 7: navigation-currency checks map freshness and records checkpoint debt (AC-18)
    ✔ Class 8: parallel-overlap checks concurrent write surfaces
    ✔ Class 9: profile-drift detects unapproved identity drift
    ✔ Class 10: calibrated-friction-thresholds reports honest status
  ✔ 1. Ten evaluated property classes (Spec §7.3 / Doctrine §2.10)
  ▶ 2. AC-10 Fixture: Deterministic-pass rule enforcement
    ✔ downgrades prompt-only claimed compliance to finding, never pass
    ✔ downgrades model-judged evaluation to unknown or finding, never pass
  ✔ 2. AC-10 Fixture: Deterministic-pass rule enforcement
  ▶ 3. AC-18 Fixture: Navigation currency fails closed and records debt
    ✔ candidate evaluation fails closed on stale map against touched contracts
    ✔ checkpoint push permits exit while recording typed architecture-map-stale debt
  ✔ 3. AC-18 Fixture: Navigation currency fails closed and records debt
  ▶ 4. AC-21 Fixture: Anti-fragmentation enforcement
    ✔ rejects misleading tiny-module optimization created to evade boundary checks
    ✔ evaluator integrates anti-fragmentation and marks overallStatus blocked
  ✔ 4. AC-21 Fixture: Anti-fragmentation enforcement
  ▶ 5. Baseline and Ratchet Store mechanics
    ✔ net-new violation fails, accepted baseline passes as excepted, ratchet reduces
    ✔ rejects expired exceptions in baseline ratchet
  ✔ 5. Baseline and Ratchet Store mechanics
  ▶ 6. Complete 21 Fixture Scenarios from Issue #106 / AC list
    ✔ Fixture 1: inherited greenfield default resolves to inherited-agent-first
    ✔ Fixture 2: accepted custom profile is honored
    ✔ Fixture 3: clean architecture passes all checks
    ✔ Fixture 4: missing/stale contract produces finding
    ✔ Fixture 5: accepted legacy debt passes as excepted
    ✔ Fixture 6: new/worsened violation fails
    ✔ Fixture 7: resolved violation reduces baseline deterministically
    ✔ Fixture 8: new cycle detected and fails
    ✔ Fixture 9: hidden side effect detected and fails
    ✔ Fixture 10: missing local verification entry point fails
    ✔ Fixture 11: stale architecture map fails closed at candidate boundary
    ✔ Fixture 12: analyzer unavailable returns unsupported/unavailable outcome
    ✔ Fixture 13: legitimate override passes as excepted with audit rationale
    ✔ Fixture 14: expiry/supersession revokes exception and blocks
    ✔ Fixture 15: scope divergence triggers boundary-crossing finding
    ✔ Fixture 16: prompt-only claimed compliance yields finding or unknown, never pass
    ✔ Fixture 17: exact-candidate drift is detected
    ✔ Fixture 18: checkpoint push with stale map produces typed debt
    ✔ Fixture 19: follow-up session blocked until push-time debt is consumed
    ✔ Fixture 20: publication push failing closed on a stale map
    ✔ Fixture 21: deterministic staleness-debt reduction on resolution
  ✔ 6. Complete 21 Fixture Scenarios from Issue #106 / AC list
  ▶ 7. JSON Schemas Conformance
    ✔ evidence output validates cleanly against pipeline.fitness-evidence.v1.json
    ✔ live baseline validates cleanly against pipeline.architecture-baseline.v1.json
  ✔ 7. JSON Schemas Conformance
✔ architecture-fitness evaluator & ratchet store (WP-D3, Issue #106, AC-10, AC-18, AC-21)
ℹ tests 41
ℹ suites 8
ℹ pass 41
ℹ fail 0
```

### 3.2 Live Repository Architecture Fitness Check
Command:
```bash
node plugins/pipeline-core/scripts/architecture-fitness.mjs --check
```
Output:
```
Architecture fitness check PASSED: all property classes evaluated (10 pass, 0 excepted).
```

### 3.3 Verify Suite Registration Check
Command:
```bash
node harness/scripts/check-verify-suite-registration.mjs
```
Output:
```
Verify suite registration is complete: 559 registered, 0 declared exclusion(s), 0 unregistered.
```

### 3.4 Backlog State & Ledger Integrity Check
Command:
```bash
node plugins/pipeline-core/scripts/check-backlog-state.mjs
```
Output:
```
Backlog state, transition ledger, closure evidence, and generated projections are valid.
```
