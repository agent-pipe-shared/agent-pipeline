# Release Evidence Promotion Simplification Closure Evidence

**Backlog Item:** `pipeline.release-evidence-promotion-repeats-full-qualification`
**Date:** 2026-09-18
**Author:** Antigravity (Elephant orchestrator)
**Components:** `plugins/pipeline-core/lib/verify-selection.mjs`, `plugins/pipeline-core/lib/release-promotion-envelope.mjs`, `plugins/pipeline-core/scripts/push-prepare.mjs`, `plugins/pipeline-core/hooks/guard-push.mjs`

## Problem & Background

In the 0.6.2 release delivery cycle, the delivery path required repeating full qualification runs under distinct mode names: a full release-mode Verify, followed by a full push-mode Verify, plus a separately placed Security scan. The substantive source candidate S had not changed between these checks; the subsequent commit R existed solely to record and reconcile evidence artifacts and backlog metadata.

Because `push-prepare.mjs` and `guard-push.mjs` required evidence artifacts to match `HEAD` byte-for-byte on commit OID, an append-only metadata/reconciliation commit invalidated previously computed verification receipts, forcing redundant qualification cycles.

Per PO Directive 4 (adopting decision packet D1–D3, specifically D1: one-way `release-satisfies-push` allowed only for the same qualified candidate; reverse forbidden), release governance was simplified via a verified, versioned promotion envelope binding substantive candidate S to record-only commit R.

## Implementation Details

1. **One-Way Mode Inclusion (D1):**
   - In `plugins/pipeline-core/lib/verify-selection.mjs`, updated `verifyEvidenceSatisfiesBoundary(evidence, boundary)`:
     - When `boundary === "push"`, a full release-mode qualification with zero omitted suites (`selection.mode === "release" && completeFallback`) is explicitly admitted.
     - When `boundary === "release"`, push qualifications remain strictly refused (`selection.mode === "push"` returns `false`).
     - Added comprehensive test assertions in `plugins/pipeline-core/lib/verify-selection.test.mjs`.

2. **Versioned Promotion Envelope Module:**
   - Created `plugins/pipeline-core/lib/release-promotion-envelope.mjs` with schema `pipeline.release-promotion-envelope.v1`.
   - Implemented `isRecordOnlyPath(path)` checking a strict allowlist of metadata/evidence paths:
     - `evidence/**`, `backlog/evidence/**`, `specs/*/evidence/**`, `specs/*/lifecycle.json`, `specs/*/result.md`, `backlog/STATUS.md`, `backlog/index.json`, `backlog/transitions.ndjson`, `backlog/items/**`, `backlog/PO-TOPICS.md`, `docs/state.md`, `.claude/pipeline-state.json`, `project/pipeline-state.json`.
   - Any modification to source files (e.g. in `src/`, `plugins/`, `harness/`) or non-allowlisted files fails closed with `unallowlisted-record-delta`.
   - Implemented `computeRecordOnlyDelta(sourceCommit, recordCommit, { repoDir })` using `git diff-tree -r --no-commit-id`.
   - Implemented `createReleasePromotionEnvelope(...)` and `validateReleasePromotionEnvelope(...)`:
     - Verifies git commit and tree OIDs for both S and R.
     - Confirms S is a strict ancestor of R (`git merge-base --is-ancestor`).
     - Recomputes delta S..R and validates each changed path against the allowlist.
     - Enforces full release qualification receipt binding on S.
     - Enforces one-way mode inclusion rule `release-satisfies-push` (SHA-256 bound).
     - Fails closed on any envelope tampering, delta mismatch, source modification, or reverse inclusion.

3. **Preflight and Guard Integration:**
   - In `plugins/pipeline-core/scripts/push-prepare.mjs`:
     - `checkEvidenceFreshness` now checks for a valid `evidence/release-promotion-latest.json` envelope when `data.commit !== headCommit`.
     - Validates that S matches `data.commit`, R matches `headCommit`, and mode satisfies boundary.
     - Reports clear promotion diagnostic: `${relPath} is fresh and green at HEAD (promoted from <S> via release-promotion-envelope)`.
   - In `plugins/pipeline-core/hooks/guard-push.mjs`:
     - `checkEvidenceFreshness` inspects `evidence/release-promotion-latest.json` when `data.commit !== sourceCommit`.
     - Validates envelope via `validateReleasePromotionEnvelope` against `evidenceProjectDir`.
     - Admits record-only commits with valid promotion envelopes without triggering commit staleness blocks.

4. **Adversarial Verification Suite:**
   - Added unit and adversarial matrix tests in `plugins/pipeline-core/lib/release-promotion-envelope.test.mjs`.
   - Added integration tests in `plugins/pipeline-core/scripts/push-prepare.test.mjs` (62/62 pass).
   - Added pre-push guard integration tests in `plugins/pipeline-core/hooks/guard-push.test.mjs` (181/181 pass).

## Verification Results

- `plugins/pipeline-core/lib/verify-selection.test.mjs`: PASS
- `plugins/pipeline-core/lib/release-promotion-envelope.test.mjs`: PASS
- `plugins/pipeline-core/scripts/push-prepare.test.mjs`: PASS (62/62)
- `plugins/pipeline-core/scripts/push-init.test.mjs`: PASS (26/26)
- `plugins/pipeline-core/hooks/guard-push.test.mjs`: PASS (181/181)
- `harness/scripts/check-consumer-safe-paths.mjs`: PASS (1201 tracked files, 143 allowlist entries)

All acceptance criteria met.
