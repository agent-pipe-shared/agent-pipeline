# Minimum Rigor Floor Derivation (WP-B1) — Verification Evidence

Checkpoint: 2026-09-13.
Task: `ALF-B1-RIGOR-FLOOR`
Governing Spec: `specs/sprint-alfred-epic/spec.md` §5.1
Issue: #105 Minimum Rigor Floor Derivation
Acceptance Criteria: AC-7

---

## 1. Executive Summary

This deliverable implements Minimum Rigor Floor Derivation (WP-B1) for the Agent-Pipeline, fulfilling the governance and mechanical lifecycle requirements of Issue #105, Spec §5.1, and AC-7:
1. **Schema `pipeline.rigor-derivation.v1`**: JSON Schema in `schemas/pipeline.rigor-derivation.v1.json` defining the closed structure for minimum rigor derivation results, including `minProfile`, `requiredEvidenceClasses`, `escalationTriggers`, `derivationRevision`, `inputDigest`, `explanation`, and optional `disagreementLog`.
2. **Declarative Derivation Policy (`policies/rigor-derivation.v1.json`)**: Versioned policy defining the profile hierarchy (`mini` < `feature` < `epic`), diff size thresholds, reversibility mappings, and declarative escalation rules.
3. **Rigor Floor Derivation Engine (`plugins/pipeline-core/scripts/rigor-floor.mjs`)**: Pure function library and CLI tool evaluating normalized change surface dimensions, calculating deterministic SHA-256 input digests, enforcing asymmetric floor elevation, detecting selected-vs-derived profile disagreements, and producing schema-valid derivation outputs.
4. **Comprehensive 14-Fixture Test Suite (`plugins/pipeline-core/scripts/rigor-floor.test.mjs`)**: Full test coverage across all 14 fixture classes specified in Issue #105 / AC-7 / Spec §5.1.
5. **Verify Suite & Capability Registration**: Declarative registration in `harness/verify-suites.json` and capability attribution in `docs/product-capability-inventory.json` under `deterministic-verification`.

---

## 2. Implemented Artifacts

### 2.1 JSON Schema (`schemas/pipeline.rigor-derivation.v1.json`)
- Schema identifier: `pipeline.rigor-derivation.v1`
- Mandatory fields:
  - `schema`: fixed enum `["pipeline.rigor-derivation.v1"]`
  - `minProfile`: enum `["mini", "feature", "epic"]`
  - `requiredEvidenceClasses`: unique string array (`"verify"`, `"critic"`, `"security"`)
  - `escalationTriggers`: string array of fired escalation identifiers
  - `derivationRevision`: integer or string (e.g. `"b1-r1"`)
  - `inputDigest`: 64-character lowercase SHA-256 hex string bound to canonical input JSON
  - `explanation`: human-readable explanation of derivation decisions
- Optional fields:
  - `disagreementLog`: object `{ selected, derived, reason }` present when selected profile is lower than derived minimum floor
- Closed shape: `additionalProperties: false`.

### 2.2 Declarative Policy (`policies/rigor-derivation.v1.json`)
- Schema identifier: `pipeline.rigor-derivation-policy.v1`
- Defines profile hierarchy: `mini` (0) < `feature` (1) < `epic` (2).
- Base evidence classes:
  - `mini`: `["verify"]`
  - `feature`: `["verify", "critic"]`
  - `epic`: `["verify", "critic", "security"]`
- Thresholds:
  - `maxChangedFiles`: 5
  - `maxChangedLines`: 150
- Escalation rules:
  - Protected baseline touches (A3 / TP paths) or guardrails => `epic` (`TOUCHES_PROTECTED_BASELINE`).
  - Low or irreversible reversibility => `epic` (`IRREVERSIBLE_OR_LOW_REVERSIBILITY`).
  - Public contracts, schemas, core dependencies, or storage deltas => at least `feature` (`CONTRACT_OR_SCHEMA_DELTA`).
  - Actual candidate surface expansion beyond planned paths => at least `feature` (`SURFACE_EXPANSION`).
  - Candidate diff stats exceeding thresholds => at least `feature` (`DIFF_SIZE_EXCEEDED_THRESHOLD`).
  - Unavailable or unknown inputs => raise floor to at least `feature` and never lower (`UNAVAILABLE_OR_UNKNOWN_INPUT`).

### 2.3 Derivation Evaluator (`plugins/pipeline-core/scripts/rigor-floor.mjs`)
- Exports:
  - `deriveMinimumRigor(inputs, policy)`: pure derivation function.
  - `normalizeInputs(rawInputs)`: normalizes 7 dimensions (`plannedPaths`, `actualPaths`, `protectedTouches`, `contractDeltas`, `reversibility`, `diffStats`, `selectedProfile`) to `{ value, status, sourceContract }`.
  - `computeInputDigest(normalizedInputs)`: computes canonical SHA-256 digest.
  - `loadPolicy(rootOrPath)`: loads derivation policy.
- CLI usage:
  ```bash
  node plugins/pipeline-core/scripts/rigor-floor.mjs --root <path> [--inputs <path-to-json>] [--format json|text]
  ```
  - `--format json`: emits machine-readable JSON satisfying `pipeline.rigor-derivation.v1`.
  - `--format text`: emits formatted summary with explanation and disagreement log.

---

## 3. Fixture Matrix & Acceptance Evidence (AC-7)

The test suite `plugins/pipeline-core/scripts/rigor-floor.test.mjs` executes and proves the 14 fixture classes:

| # | Fixture Class | Verification Invariant | Outcome |
|---|---|---|---|
| 1 | Pinned determinism | Identical normalized inputs produce identical floor & inputDigest | PASS |
| 2 | Unknown/unavailable monotonicity | Unavailable / unknown inputs can only raise or keep floor, never lower | PASS |
| 3 | Protected surface escalation | Touches to protected baseline (A3/TP) escalate to `epic` | PASS |
| 4 | Reversibility escalation | Low reversibility or irreversible changes escalate to `epic` | PASS |
| 5 | Public contract/schema deltas | Touches to public contracts, schemas, dependencies require at least `feature` | PASS |
| 6 | Routine docs/internal | Routine docs/internal-only changes permit `mini` | PASS |
| 7 | Surface expansion asymmetry | Planned surface vs actual surface expansion escalates floor to `feature` | PASS |
| 8 | Human escalation respect | Higher human-selected profile is respected beside floor (not lowered) | PASS |
| 9 | Disagreement log | Lower human-selected profile generates disagreementLog entry | PASS |
| 10 | Asymmetric enforcement | Agent cannot lower rigor via missing planned fields | PASS |
| 11 | CLI format json | CLI `--format json` emits valid schema-conforming output | PASS |
| 12 | CLI format text | CLI `--format text` prints clear human explanation | PASS |
| 13 | Schema validation | Derivation results validate against `pipeline.rigor-derivation.v1` schema | PASS |
| 14 | Edge cases | Empty inputs and missing optional dimensions resolve safely | PASS |

---

## 4. Test Execution Output

```
▶ WP-B1 / Issue #105: Minimum Rigor Floor Derivation
  ✔ 1. Identical normalized inputs produce identical floor & inputDigest (pinned test) (2.893834ms)
  ✔ 2. Unavailable / unknown inputs can only raise or keep floor, never lower (0.266402ms)
  ✔ 3. Touches to protected surfaces escalate to epic (0.117177ms)
  ✔ 4. High-risk reversibility escalates to epic (0.209874ms)
  ✔ 5. Public contract/schema deltas require at least feature (0.145526ms)
  ✔ 6. Routine docs/internal-only change permits mini (0.143256ms)
  ✔ 7. Planned surface vs actual surface expansion escalates floor (0.144656ms)
  ✔ 8. Higher human-selected profile is respected beside floor (not lowered to floor) (0.177514ms)
  ✔ 9. Lower human-selected profile generates disagreementLog entry (0.196954ms)
  ✔ 10. Asymmetric enforcement: agent cannot lower rigor via missing planned fields (0.209854ms)
  ✔ 11. CLI --format json emits valid schema (32.859388ms)
  ✔ 12. CLI --format text prints clear human explanation (25.569322ms)
  ✔ 13. Validation against pipeline.rigor-derivation.v1 schema (0.3201ms)
  ✔ 14. Edge cases: empty inputs, missing optional dimensions (0.254602ms)
✔ WP-B1 / Issue #105: Minimum Rigor Floor Derivation (64.404323ms)
ℹ tests 14
ℹ suites 1
ℹ pass 14
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

Verification suite registration check:
```
$ node harness/scripts/check-verify-suite-registration.mjs
Verify suite registration is complete: 555 registered, 0 declared exclusion(s), 0 unregistered.
```
