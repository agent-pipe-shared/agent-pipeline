---
schema: pipeline.backlog-item.v1
id: pipeline.license-check-declared-path-absence-still-reads-as-scanner-error
type: defect
owner: pipeline
status: closed
created: 2026-08-11
due: 2026-08-25
closed_at: 2026-08-17
closure_repository: self
closure_commit: 04e28774d8416904cccee5dd1fc561db4d2a86af
closure_evidence: plugins/pipeline-core/scripts/security-scan.test.mjs
source: "Critic review (PASS, F3) of NVA-BL-32 (backlog/items/2026-08-09-the-security-scan-looks-for-its-license-allowlist-in-the-pipelines-own-repository.md), 2026-08-11 — flagged as documented-instead-of-fixed without an owner/expiry (QG-06), not as a blocker to that diff."
---

# The `declaredPath` (third-party-licenses.json) absent-file branch still renders `scanner_error`, same defect class as the allowlist-absence fix

## Description

`NVA-BL-32` (commit `c3e34d562fa0d155ec8382a072b5611775162261`) fixed
`license-check.mjs`'s absent-`allowlistPath` branch to report a clean
`SKIPPED [success]` ("not configured") instead of `SKIPPED [scanner_error]`
— the license adapter's own reason: `security-scan.mjs`'s `scannerEntry`
defaults any `SKIPPED` result carrying no `classification` field to
`scanner_error`, so any adapter path returning an unclassified skip still
misreads a legitimate "nothing to check here" state as a scanner failure.

The sibling absent-`declaredPath` branch (a consumer project that
configures a license allowlist but ships no `third-party-licenses.json`)
was deliberately left unfixed in that diff — explicitly out of its scope —
and still returns an unclassified `SKIPPED`, so it still renders
`scanner_error` today.

## Triggering situation

Found by the Critic reviewing `NVA-BL-32`'s diff (finding F3, PASS verdict,
minor severity — not a blocker to that diff, which correctly disclosed the
asymmetry in its own header comment but did not name an owner or expiry
for it, which is what QG-06 requires of a documented-instead-of-fixed risk).

## Affected artifact

`plugins/pipeline-core/scripts/security-adapters/license-check.mjs` — the
absent-`declaredPath` branch (the same function `NVA-BL-32` fixed for the
absent-`allowlistPath` branch, a different early return in the same `run()`
function).

## Proposal

Apply the same fix `NVA-BL-32` used for the sibling branch: when
`declaredPath` is absent, classify the `SKIPPED` result `success` with a
"not configured" reason, matching the now-established clean-skip
convention (`osv-scanner`'s "no package sources" skip; the allowlist-absence
fix this session). Add or extend the regression test in
`security-scan.test.mjs` the same way `NVA-BL-32` did for the allowlist
branch. Small, bounded, same shape as the fix it mirrors — should not need
fresh design.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted, confirmed still open. Verified live:
  `plugins/pipeline-core/scripts/security-adapters/license-check.mjs:99-105`
  — the absent-`declaredPath` branch still returns without a
  `classification` key (only `reason`), unlike the fixed sibling at :93
  which explicitly sets `classification: "success"`. The module's own header
  comment (:32-33) still documents this as a deliberate, tracked asymmetry.
  Stays open, current-scope: small, well-scoped, mirrors an already-landed
  fix pattern, not deferrable material.
- **Rationale:** matches the item's own claim exactly on direct code read.
- **Assignment (if accepted):** small goldfish-implementor dispatch (mirrors
  `NVA-BL-32` exactly, no design latitude); not fixed in this triage pass
  (docs/backlog-only).
- **Date:** 2026-08-17

### Closed 2026-08-17 (overnight AFK block, NVA-MICRO-1)

Fixed exactly as proposed: the absent-`declaredPath` branch now sets
`classification: "success"`, mirroring `NVA-BL-32`'s sibling fix.
`security-scan.test.mjs`'s existing missing-declared-file case extended
with the same assertions the missing-allowlist case already carries.
Independently re-verified: `node --test
plugins/pipeline-core/scripts/security-adapters/license-check.test.mjs`
(10/10) and `security-scan.test.mjs` (131/131), both green.
