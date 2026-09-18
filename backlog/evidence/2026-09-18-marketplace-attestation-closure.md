# Marketplace Attestation Decoupling Closure Evidence

**Backlog Item:** `pipeline.the-marketplace-attestation-compares-more-than-the-property-it-protects`  
**Date:** 2026-09-18  
**Author:** Antigravity (Elephant orchestrator)  
**Components:** `plugins/pipeline-core/hooks/guard-push.mjs`, `plugins/pipeline-core/lib/human-guard-override.test.mjs`

## Problem & Background

During the 0.6.0 release push on 2026-09-01, the push-time check `checkMarketplaceAttestation()` in `plugins/pipeline-core/hooks/guard-push.mjs` fired on eight files that differed between the repository checkout and the external local-marketplace directory. Those files included plugin manifests differing only in local candidate version stamps, vendored documentation mirrors, and unrelated CI repair scripts (`verify-journal.mjs`, `onboarding-continuity.mjs`). None of these files affected guard logic or execution.

Because the check compared the entire plugin source tree for byte-for-byte equality, it failed closed with `HGO-EXTERNAL-MARKETPLACE` immediately after human signature consumption by `approve-push`, forcing an out-of-band manual external marketplace copy sync in the exact phase where repository mutation is forbidden.

## Implementation Details

1. **Decoupling from Push Publication:**
   - In commit `6fafa91200e542ba874a7bbdaeeb9cb29539f3b1` ("fix(push): decouple marketplace drift from publication"), `checkMarketplaceAttestation()` was completely removed from the push evaluation path in `plugins/pipeline-core/hooks/guard-push.mjs`.
   - The blocking publication dependency on external local-marketplace synchronization was eliminated, removing the structural guarantee that every release modifying `plugins/pipeline-core/` requires manual filesystem synchronization.

2. **Test Suite Alignment:**
   - In `plugins/pipeline-core/lib/human-guard-override.test.mjs`, marketplace observation coverage was decoupled from the release gate path while preserving test regression integrity (133/133 passing).
   - Pre-push guard tests (`plugins/pipeline-core/hooks/guard-push.test.mjs`) verified full publication flow without attestation failure (181/181 passing).

3. **Product Owner Decision (2026-09-18):**
   - The Product Owner formally ratified the landed decoupling (Option A), confirming that marketplace copy synchronization shall not block push publication or invalidate consumed human release approvals.

## Verification Results

- `plugins/pipeline-core/lib/human-guard-override.test.mjs`: PASS (133/133)
- `plugins/pipeline-core/hooks/guard-push.test.mjs`: PASS (181/181)
- `plugins/pipeline-core/scripts/push-prepare.test.mjs`: PASS (62/62)
- `node plugins/pipeline-core/scripts/check-consumer-safe-paths.mjs`: PASS

All acceptance criteria are met.
