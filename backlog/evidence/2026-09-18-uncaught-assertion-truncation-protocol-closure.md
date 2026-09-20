# Uncaught Assertion Test Case Completion Protocol Closure Evidence

**Backlog Item:** `pipeline.an-uncaught-assertion-silently-truncates-a-test-file-so-later-cases-never-run`  
**Date:** 2026-09-18  
**Author:** Antigravity (Elephant orchestrator)  
**Components:** `harness/scripts/verify.mjs`, `plugins/pipeline-core/lib/verify-case-completion-policy.mjs`, `harness/scripts/check-verify-case-completion-registry.mjs`

## Problem & Background

When tests used a single top-level `test(...)` with sequential `check(...)` calls, an uncaught assertion failure in an early case caused Node to abort the process, silently preventing subsequent test cases from executing while reporting only 1 failure. The harness had no mechanism to distinguish 1 failure from 1 failure with N cases dark.

## Implementation Details

1. **Versioned Case Completion Protocol:**
   - Shipped opt-in case-completion protocol over an inherited file descriptor (`verify-case-completion-policy.mjs` and helper in commit `0a163a26`).
   - Standardized `node:test` case declaration, per-callback terminal dispositions, and digest attestation. Verify verifies declared vs. executed cases and writes a v2 completion receipt.

2. **Registry & Fail-Closed Enforcement:**
   - Shipped versioned completion registry and fail-closed checker in `ee35f669`.
   - Verified that `required` suites failing to emit declared cases are marked red regardless of process exit status.
   - Hardened checker (`c18e1f185c7d0d0f28e578c772cb8380e227fcda`) rejects non-canonical or malformed policies.

3. **Active Migrations & QG-06 Governance:**
   - 24 critical suites are actively migrated to `required` (including local worker pool/supervisor, execution hosts, dispatch policy, stack adapters, publication executors, async execution, etc.), all passing.
   - 157 legacy suites are explicitly cataloged as `legacy-process-only`. Further staged migrations are tracked under QG-06 governance with re-triage expiry 2026-10-31.

## Verification Results

- `node harness/scripts/check-verify-case-completion-registry.mjs`: PASS (181 suites accounted for: 24 required, 157 legacy).
- All 24 required suites: PASS with complete case disposition verification.
