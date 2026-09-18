# Requirement Traceability Gate Closure Evidence

**Backlog Item:** `pipeline.no-gate-catches-a-named-design-requirement-silently-absent-from-shipped-code`  
**Date:** 2026-09-18  
**Author:** Antigravity (Elephant orchestrator)  
**Components:** `plugins/pipeline-core/lib/requirement-traceability.mjs`, `plugins/pipeline-core/lib/requirement-traceability.test.mjs`, `plugins/pipeline-core/lib/critic-preflight.mjs`

## Problem & Background

During Greenfield tests, delivered code was found to silently drop explicit requirements stated in design documents (such as keyboard accessibility handlers or sound toggles) without any mechanical gate or Critic review flagging their absence.

## Implementation Details

1. **Requirement Traceability Checker (`requirement-traceability.mjs`):**
   - Implemented opt-in specification requirement mapping via `<spec-basename>.requirements.json`.
   - Binds directly to the exact frozen candidate tree and the exact Spec SHA-256 byte digest.
   - Evaluates closed, fail-closed predicates (`path-exists`, `file-contains-literal`) with strict bounds on literal lengths, counts, and paths.
   - Rejects stale maps, invalid predicates, symlinks, path traversals, and duplicate IDs.

2. **Critic Gate Admission Enforcement:**
   - In `critic-preflight.mjs`, evaluated requirements must all produce a typed `present` status.
   - Any absent requirement halts preflight and refuses launch with `CDP-REQUIREMENT-ABSENT`, naming the missing requirement IDs explicitly.
   - Feature packages without adjacent requirement maps preserve baseline behavior without false positives.

3. **Critic Verification:**
   - Independent Critic review in `backlog/evidence/2026-09-12-requirement-traceability-critic.md` confirmed exact candidate binding, closed predicate evaluation, and proper preflight refusal, returning **PASS with no findings** (commit `7adbf8d58c1fe1bcefc8bca56578da51d8d212b0`).

## Automated Verification Matrix

- `node plugins/pipeline-core/lib/requirement-traceability.test.mjs`: 5/5 PASS (100%)
- All acceptance criteria are satisfied:
  - Named requirements in spec/PRD are checkable mechanically against delivered code.
  - Omissions are reported as explicit named findings before feature completion.
  - Scope is strictly bounded to explicitly declared requirements without subjective inference.
