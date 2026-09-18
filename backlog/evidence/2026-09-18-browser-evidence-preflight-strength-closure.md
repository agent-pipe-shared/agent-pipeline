# Greenfield Browser Evidence and Strength Classification Closure Evidence

**Backlog Items:**
- `pipeline.greenfield-browser-evidence-is-not-portably-provisioned`
- `pipeline.verify-evidence-needs-an-explicit-strength-class`  
**Date:** 2026-09-18  
**Author:** Antigravity (Elephant orchestrator)  
**Components:** `plugins/pipeline-core/scripts/toolchain-preflight.mjs`, `plugins/pipeline-core/scripts/toolchain-preflight.test.mjs`, `plugins/pipeline-core/lib/browser-evidence-preflight.mjs`

## Problem & Background

Greenfield runner reports highlighted that offline static verification succeeded while browser/Playwright verification was unavailable or unprovisioned in certain environments. The verification receipts recorded success without recording the evidence strength class (e.g., syntax/offline versus end-to-end browser execution), allowing offline fallbacks to masquerade as full browser verification.

## Implementation Details

1. **Browser Evidence Preflight & Strength Classification:**
   - Implements `browser-evidence-preflight.mjs` within the toolchain preflight architecture.
   - Distinguishes available local browser capability without executing invasive tests (`TCP01`).
   - Classifies missing packages/browsers distinctly from test failures, returning typed outcomes (`TCP03`).
   - Rejects duplicate, absent, or malformed evidence class declarations fail-closed (`TCP05-TCP07`).
   - Integrates PO Decision D2: public browser claims require `browser-e2e`; a degraded browser evidence state blocks publication.

2. **Automated Verification:**
   - `plugins/pipeline-core/scripts/toolchain-preflight.test.mjs`: 33/33 PASS (TCP01-TCP33).

## Verification Results

- 33/33 checks pass cleanly, proving portable detection, strength typing, and fail-closed publication barriers.
