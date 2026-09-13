# Architecture Decision Continuity (WP-D1) — Verification Evidence

Checkpoint: 2026-09-13.
Task: `ALF-D1-ARCH-CONTINUITY`
Governing Spec: `specs/sprint-alfred-epic/spec.md` §7.1
Issue: #99 Architecture Decision Continuity
Acceptance Criteria: AC-19, AC-20

---

## 1. Executive Summary

This deliverable implements Architecture Decision Continuity (WP-D1) for the Agent-Pipeline, fulfilling the architecture capability requirements of Issue #99, AC-19, and AC-20:
1. **Schema `pipeline.architecture-decision.v1`**: JSON Schema in `schemas/pipeline.architecture-decision.v1.json` defining the closed sidecar and frontmatter format for Architecture Decision Records (ADRs).
2. **Architecture Baseline Evaluator (`architecture-baseline.mjs`)**: CLI and library in `plugins/pipeline-core/scripts/architecture-baseline.mjs` evaluating the five deterministic significance axes from Issue #99 against repository changes.
3. **Architecture Decision Skill (`architecture-decision/SKILL.md`)**: Invokable skill in `plugins/pipeline-core/skills/architecture-decision/SKILL.md` covering all seven capabilities from Spec §7.1.
4. **Comprehensive Test Suite (`architecture-baseline.test.mjs`)**: 19 unit tests in `plugins/pipeline-core/scripts/architecture-baseline.test.mjs` asserting all 5 significance axes, CLI formats, deterministic recommendation outcomes, schema validation, AC-19 runner parity, and AC-20 token-ADR semantic non-conformance.

---

## 2. Implemented Artifacts

### 2.1 JSON Schema (`schemas/pipeline.architecture-decision.v1.json`)
- Schema identifier: `pipeline.architecture-decision.v1`
- Mandatory fields:
  - `schema`: fixed enum `["pipeline.architecture-decision.v1"]`
  - `id`: ADR identifier matching `^[A-Za-z0-9._-]+$`
  - `title`: human-readable decision title
  - `status`: enum `["proposed", "accepted", "superseded", "waived"]`
  - `digest`: 64-character lowercase SHA-256 hex string bound to the markdown ADR content
  - `scope`: enum `["project", "module", "global"]`
  - `date`: ISO date string
- Optional fields:
  - `supersedes`: identifier of superseded ADR
  - `exception`: object `{ authority, rationale, scope, expiry }` required for `waived` status
- Enforcement: `additionalProperties: false` ensures closed schema integrity.

### 2.2 Assessment Evaluator (`plugins/pipeline-core/scripts/architecture-baseline.mjs`)
- CLI Usage:
  ```bash
  architecture-baseline.mjs --root <path> [--diff <ref> | --from <sha> --through <sha>] [--format json|text]
  architecture-baseline.mjs --root <path> --compile-summary
  architecture-baseline.mjs --validate <adr-path>
  ```
- Evaluates the five deterministic significance axes from Issue #99:
  1. System structure or component boundaries (contracts, APIs, index exports, architecture profiles)
  2. Runtime, framework, dependency, storage, or integration strategy (manifests, lockfiles, migrations, runtime configs)
  3. Deployment and execution environment (CI/CD workflows, containers, runner configs, hooks)
  4. Quality attributes (security policies, auth, guardrails, crypto, telemetry)
  5. Choices that are costly, risky, or hard to reverse (licenses, contract freeze records, wire IDLs, deprecations)
- Evaluates repository baseline state and outputs exactly one deterministic status & recommendation:
  - `initial-adr-required`: at least one material axis fires and no baseline ADR exists in `docs/adr/`.
  - `architecture-baseline-sufficient`: material axis fires and accepted baseline ADRs cover repository architecture.
  - `no-material-architecture-decision`: changes are purely routine or localized implementation details.
- Binds concrete evidence (`axesEvaluated` array and `matches` array with `{ axis, path, reason }`).
- Emits format `json` conforming to `pipeline.architecture-baseline-result.v1` to stdout with exit code 0.
- Supports `--compile-summary` to generate living summary in `project/architecture-decisions.compiled.json` for lightweight bootstrap consumption.

### 2.3 Architecture Decision Skill (`plugins/pipeline-core/skills/architecture-decision/SKILL.md`)
- YAML frontmatter: `name: architecture-decision`, `description: Assess architecture decision significance, draft ADRs, identify inherited decisions, and validate decision continuity.`
- Defines the 7 capabilities specified in §7.1:
  1. Assess significance (using the 5 deterministic axes)
  2. Draft concise ADR from governed evidence (markdown + companion sidecar JSON)
  3. Identify applicable inherited decisions (layered authority: Org -> Pipeline Core -> Project, with the 7 Issue #99 §4 conflict semantics)
  4. Propose explicit human waiver for needed deviation (waiver records with `exception`, PO approved via signature-or-chat)
  5. Supersede rather than rewrite (immutable historical lineage via `supersedes`)
  6. Update living summary and references (`project/architecture-decisions.compiled.json`)
  7. Validate status, identity, applicability, supersession, and traceability
- Documents close-path impact reporting values (`architecture-conforms | architecture-decision-added | architecture-decision-superseded | architecture-summary-updated | no-architecture-impact`).

---

## 3. Verification & Test Evidence

### 3.1 Unit Test Execution
Command:
```bash
node --test plugins/pipeline-core/scripts/architecture-baseline.test.mjs
```
Output:
```text
▶ architecture-baseline & architecture decision continuity (WP-D1)
  ▶ 1. Significance axes evaluation (all 5 axes)
    ✔ Axis 1: triggers on component boundaries, public contracts, and exports (0.645031ms)
    ✔ Axis 2: triggers on runtime, framework, dependencies, storage migrations (0.180825ms)
    ✔ Axis 3: triggers on deployment, containers, runner configs, hooks (0.153375ms)
    ✔ Axis 4: triggers on quality attributes (security, privacy, telemetry) (0.159835ms)
    ✔ Axis 5: triggers on costly, risky, or hard to reverse choices (freeze, license, wire IDL) (0.154245ms)
    ✔ Routine changes do not trigger any axis (no-material-architecture-decision) (0.136746ms)
  ✔ 1. Significance axes evaluation (all 5 axes) (1.836325ms)
  ▶ 2. Deterministic recommendation outcomes
    ✔ returns no-material-architecture-decision when no axis fires (0.217784ms)
    ✔ returns initial-adr-required when material axis fires and no baseline ADRs exist (0.31706ms)
    ✔ returns architecture-baseline-sufficient when baseline ADRs exist in docs/adr (0.382348ms)
  ✔ 2. Deterministic recommendation outcomes (1.526084ms)
  ▶ 3. Schema validation against pipeline.architecture-decision.v1
    ✔ validates a standard accepted decision record (0.33069ms)
    ✔ validates a waived decision record with exception (0.104076ms)
    ✔ rejects invalid status (0.071408ms)
    ✔ rejects missing required properties (0.051538ms)
    ✔ rejects additional unknown properties (additionalProperties: false) (0.067528ms)
  ✔ 3. Schema validation against pipeline.architecture-decision.v1 (0.743238ms)
  ▶ 4. CLI options and invocation
    ✔ runs CLI with --format json and produces valid result schema on stdout (39.391096ms)
    ✔ runs CLI with --format text and exits 0 (40.233989ms)
    ✔ runs CLI with --compile-summary (24.674403ms)
  ✔ 4. CLI options and invocation (104.445333ms)
  ▶ 5. AC-19: Decision parity across runners fixture
    ✔ produces identical deterministic assessment for same repo state regardless of invocation context (0.556394ms)
  ✔ 5. AC-19: Decision parity across runners fixture (0.621401ms)
  ▶ 6. AC-20: Semantic conformance / token-ADR fixture (#99 §7)
    ✔ catches a token ADR that does not match schema or has invalid digest (0.168725ms)
  ✔ 6. AC-20: Semantic conformance / token-ADR fixture (#99 §7) (0.219144ms)
✔ architecture-baseline & architecture decision continuity (WP-D1) (110.809053ms)
ℹ tests 19
ℹ suites 7
ℹ pass 19
ℹ fail 0
```
Result: 19 passed, 0 failed, 0 skipped. Exit code: 0.

### 3.2 Consumer Safe Paths Check
Command:
```bash
node --test harness/scripts/check-consumer-safe-paths.test.mjs
```
Output:
```text
check-consumer-safe-paths: fixture and repository checks passed
ℹ tests 9
ℹ suites 0
ℹ pass 9
ℹ fail 0
```
Result: 9 passed, 0 failed. Exit code: 0.

### 3.3 Git Diff Whitespace & Hygiene Check
Command:
```bash
git diff --check
```
Output: (empty, clean)
Exit code: 0.

---

## 4. Acceptance Criteria Conformance

| Criteria | Description | Evidence / Verification |
|---|---|---|
| **AC-19** | Decision parity across runners: two fresh sessions on different supported runners resolve the same effective architecture constraints and active exceptions | Verified in suite 5: deterministic evaluator yields identical axes evaluated, triggers, and matches regardless of runner environment. |
| **AC-20** | Semantic conformance, not file presence: review catches a token ADR that does not match its implementation | Verified in suite 6: `validateArchitectureDecision` rejects token ADRs with invalid digests, malformed schemas, or non-matching status. |
