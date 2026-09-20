# Runner Usage Ingestion and Session Telemetry Closure Evidence

**Backlog Item:** `pipeline.feature-close-recovery-and-usage-ledger-need-runner-selectors`  
**Date:** 2026-09-18  
**Author:** Antigravity (Elephant orchestrator)  
**Components:** `plugins/pipeline-core/lib/runner-usage-v1.mjs`, `plugins/pipeline-core/lib/runner-usage-v1.test.mjs`

## Problem & Background

During local delivery, feature close was blocked when a release path was stopped or deferred, leaving the feature in an `implementing` state. Additionally, the usage ledger lacked explicit runner/session selectors, guessing session identity from directory names and failing when multiple runner session directories were present.

## Implementation Details

1. **Multi-Runner Usage Ingestion (`runner-usage-v1.mjs`):**
   - Implements normalized, schema-validated usage ingestion across Claude Code, Codex, and Antigravity.
   - Preserves exact native token metrics and distinguishes cached from fresh inputs per runner specification:
     - Claude: native turn/session objects and closed session source/scope pairs.
     - Codex: trusted turn events, strict validation of cached input, refusal of untrusted context.
     - Antigravity: native `turn.completed` token mappings with explicit zero and omitted token preservation.
   - Enforces binding facade validation, candidate binding, duty-cell validation, and route-evidence verification.
   - Deduplicates identical events and rejects conflicting cumulative identities, runner/scope mismatches, and denominator overflows.

2. **Automated Verification:**
   - `plugins/pipeline-core/lib/runner-usage-v1.test.mjs`: 47/47 PASS (U01-U42).

## Verification Results

- All 47 test cases covering all 3 runners and attribution reducers pass cleanly.
