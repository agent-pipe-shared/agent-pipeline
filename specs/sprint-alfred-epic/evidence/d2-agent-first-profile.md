# Agent-First Architecture Standard and Navigation Map Bundle (WP-D2) — Verification Evidence

Checkpoint: 2026-09-14.
Task: `ALF-D2-AGENT-FIRST-PROFILE`
Governing Spec: `specs/sprint-alfred-epic/spec.md` §7.2
Issue: #104 Agent-First Architecture Standard and Navigation Map Bundle
Acceptance Criteria: AC-8, AC-21, AC-22, AC-23

---

## 1. Executive Summary

This deliverable implements the Agent-First Architecture Standard and Navigation Map Bundle (WP-D2) for Agent-Pipeline, fulfilling the requirements of Issue #104, Spec §7.2, Doctrine §2 & §3, and Acceptance Criteria AC-8, AC-21, AC-22, and AC-23:
1. **JSON Schemas (`schemas/`)**:
   - `schemas/pipeline.architecture-profile.v1.json`: Profile schema defining the 9 agent-first properties from #104 / Doctrine §2, honest measurement statuses (`measured`, `estimated`, `unavailable`, `unknown`), blocking policies (`advisory-first`, `blocking`, `report-only`), and OKF v0.1 map bundle pins (`mapBundlePath`, `specDigest`).
   - `schemas/pipeline.module-inventory.v1.json`: Governed module inventory row schema defining all 6 contract-sufficiency fields, ownership boundaries, allowed dependencies, effects, and candidate bindings.
   - `schemas/pipeline.module-interaction-receipt.v1.json`: Module interaction receipt schema capturing context locality, change locality, and contract sufficiency metrics with status tags.
2. **Standard Architecture Profile (`plugins/pipeline-core/architecture/agent-first-profile.v1.json`)**:
   - Ships `inherited-agent-first` profile declaring the 9 properties with honest statuses (`unavailable` for runner-telemetry dependent context locality on Antigravity; `measured` for mechanical checks).
   - Pins `mapBundlePath: "architecture/map"` and `specDigest` matching the root index.
3. **Architecture Navigation Map Bundle (`architecture/map/`)**:
   - `architecture/map/index.md`: Root concept map index documenting the 6-step re-entry reading order (Doctrine §3.2) and linking all governed modules.
   - Per-module concept files carrying YAML frontmatter with full contract sufficiency fields:
     - `architecture/map/pipeline-core.md` (owns `plugins/pipeline-core/**`)
     - `architecture/map/harness.md` (owns `harness/**`)
     - `architecture/map/schemas.md` (owns `schemas/**`)
     - `architecture/map/backlog.md` (owns `backlog/**`)
4. **AGENTS.md Linkage (AC-23)**:
   - Linked in both root `AGENTS.md` and `plugins/pipeline-core/rules/AGENTS.md`, pointing to `architecture/map/index.md` and documenting the 6-step re-entry reading order.
5. **Module Inventory Script (`plugins/pipeline-core/scripts/module-inventory.mjs`)**:
   - Loads and parses concept files from `architecture/map/`.
   - Validates frontmatter against `schemas/pipeline.module-inventory.v1.json`.
   - Implements `resolveModuleForPath(filePath, inventory)` for path-to-module resolution.
   - CLI flags `--root <dir> [--check] [--json]`.
6. **Remedy Comparison Generator (`plugins/pipeline-core/scripts/architecture-remedy.mjs`)**:
   - Evaluates findings (`contract-violation`, `boundary-crossing`, etc.) and proposes conformant remedies with trade-off comparisons (AC-22).
   - Implements anti-fragmentation enforcement: detects and rejects misleading tiny-module optimizations with high penalty churn score and non-conformance (AC-21).
7. **Verify Suite & Capability Registrations**:
   - Registered `architecture-remedy-tests` and `module-inventory-tests` in `harness/verify-suites.json`.
   - Registered surfaces and test evidence in `docs/product-capability-inventory.json` under `deterministic-verification`.
   - Section C / C2 consolidation invariant pins:
     - `module-inventory-tests`:
       - `invariantPinned`: "Map bundle loading, schema validation against pipeline.module-inventory.v1, path-to-module resolution, missing/malformed frontmatter detection, and 6-step re-entry reading order generation are deterministic and fail-closed."
       - `nonOverlapNote`: "Tests module inventory and OKF v0.1 concept file frontmatter parsing; does not overlap with architecture-baseline or verify-suites tests."
     - `architecture-remedy-tests`:
       - `invariantPinned`: "Remedy comparison proposals for contract violations and boundary crossings generate conformant options and deterministically reject misleading tiny-module optimization per AC-21."
       - `nonOverlapNote`: "Tests active optimization remedy comparisons and anti-fragmentation penalization; does not overlap with baseline evaluation or fitness checkers."

---

## 2. Implemented Artifacts

### 2.1 JSON Schemas (`schemas/`)

#### `schemas/pipeline.architecture-profile.v1.json`
- Schema identifier: `pipeline.architecture-profile.v1`
- Defines the 9 properties from #104 / Doctrine §2:
  1. `context-locality`
  2. `contract-sufficiency`
  3. `change-locality`
  4. `dependency-legibility`
  5. `authority-effect-locality`
  6. `verification-locality`
  7. `session-reentry-stability`
  8. `parallel-work-safety`
  9. `refactorability-without-churn`
- Supports property fields: `{ propertyId, class, form, declaration, signal, check, measurementStatus, blocking, description }`.
- Supports OKF v0.1 map bundle pins: `mapBundlePath`, `specDigest`.

#### `schemas/pipeline.module-inventory.v1.json`
- Schema identifier: `pipeline.module-inventory.v1`
- Governed module inventory row fields:
  - `id`: unique module identifier
  - `responsibility`: string
  - `nonResponsibilities`: string[]
  - `ownedPaths`: string[] (path glob patterns)
  - `publicContracts`: string[]
  - `allowedDependencies`: string[] (module IDs)
  - `authorityEffects`: string[]
  - `verificationEntryPoints`: string[]
  - `adrReferences`: string[]
  - `profileSource`: string (defaults to `inherited-agent-first`)
  - `provisional`: boolean
  - `candidateBinding`: object `{ commit, tree, artifactDigests }`

#### `schemas/pipeline.module-interaction-receipt.v1.json`
- Schema identifier: `pipeline.module-interaction-receipt.v1`
- Receipt fields: `{ schema, taskId, featureId, candidateCommit, touchedModules, metrics: { contextLocality, changeLocality, contractSufficiency } }`.
- Each metric carries `{ value, status: ["measured", "estimated", "unavailable", "unknown"], note }`.

---

## 3. Verification & Test Evidence

### 3.1 Module Inventory Test Suite (`module-inventory.test.mjs`)
Command:
```bash
node --test plugins/pipeline-core/scripts/module-inventory.test.mjs
```
Output:
```text
▶ module-inventory (WP-D2, AC-8, AC-22, AC-23)
  ▶ 1. Map bundle loading and validation
    ✔ successfully loads live map bundle with 4 governed modules (1.12837ms)
    ✔ ensures each governed module satisfies all 6 contract-sufficiency fields (1.114249ms)
    ✔ verifies live map index documents the 6-step re-entry reading order (0.114077ms)
  ✔ 1. Map bundle loading and validation (2.836302ms)
  ▶ 2. Schema validation of module inventory rows
    ✔ validates a conformant module row against schema (0.176225ms)
    ✔ rejects a module row missing required fields (0.176685ms)
    ✔ rejects a module row with incorrect property types (0.174785ms)
  ✔ 2. Schema validation of module inventory rows (0.688811ms)
  ▶ 3. Path-to-module resolution
    ✔ resolves files under plugins/pipeline-core to pipeline-core (0.266413ms)
    ✔ resolves files under harness to harness (0.097518ms)
    ✔ resolves files under schemas to schemas (0.198355ms)
    ✔ resolves files under backlog to backlog (0.140476ms)
    ✔ returns null for unowned paths (0.102157ms)
    ✔ handles leading './' in path resolution (0.067508ms)
    ✔ handles absolute paths within repo (0.122767ms)
  ✔ 3. Path-to-module resolution (1.301074ms)
  ▶ 4. Missing or malformed frontmatter detection
    ✔ reports error for a markdown file with missing frontmatter (0.314841ms)
    ✔ reports error for a markdown file with malformed YAML (0.234163ms)
    ✔ reports error when allowedDependencies cites an unknown module (0.36211ms)
  ✔ 4. Missing or malformed frontmatter detection (1.024552ms)
  ▶ 5. Re-entry reading order generator
    ✔ generates the complete 6-step re-entry reading order (0.138136ms)
  ✔ 5. Re-entry reading order generator (0.176475ms)
✔ module-inventory (WP-D2, AC-8, AC-22, AC-23) (6.507343ms)
ℹ tests 17
ℹ suites 6
ℹ pass 17
ℹ fail 0
```

### 3.2 Remedy Comparison Test Suite (`architecture-remedy.test.mjs`)
Command:
```bash
node --test plugins/pipeline-core/scripts/architecture-remedy.test.mjs
```
Output:
```text
▶ architecture-remedy & active optimization (WP-D2, AC-21, AC-22)
  ▶ 1. Remedy comparison for contract violations (AC-22)
    ✔ proposes conformant remedies and trade-off comparison for contract violation (0.509536ms)
  ✔ 1. Remedy comparison for contract violations (AC-22) (0.928945ms)
  ▶ 2. Remedy comparison for boundary crossings (AC-22)
    ✔ proposes conformant remedies for boundary crossing / unauthorized dependency (0.181095ms)
  ✔ 2. Remedy comparison for boundary crossings (AC-22) (0.876166ms)
  ▶ 3. Anti-fragmentation fixture (AC-21: misleading tiny-module optimization)
    ✔ identifies misleading tiny-module optimization keywords and flags (0.206115ms)
    ✔ rejects misleading tiny-module optimization with penalty churn score and non-conformance (AC-21 fixture) (0.146056ms)
    ✔ returns null bestRemedy when only non-conformant tiny-module optimization is proposed without alternatives (0.164076ms)
  ✔ 3. Anti-fragmentation fixture (AC-21: misleading tiny-module optimization) (0.708641ms)
✔ architecture-remedy & active optimization (WP-D2, AC-21, AC-22) (2.886552ms)
ℹ tests 5
ℹ suites 4
ℹ pass 5
ℹ fail 0
```

### 3.3 Suite Registration & Preflight Checks
- Suite registration completeness:
  ```bash
  node harness/scripts/check-verify-suite-registration.mjs
  # Verify suite registration is complete: 558 registered, 0 declared exclusion(s), 0 unregistered.
  ```
- Backlog state validation:
  ```bash
  node plugins/pipeline-core/scripts/check-backlog-state.mjs
  # Backlog state, transition ledger, closure evidence, and generated projections are valid.
  ```
- Git diff hygiene:
  ```bash
  git diff --check
  # Exits 0 cleanly.
  ```
