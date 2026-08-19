---
schema: pipeline.backlog-item.v1
id: pipeline.guard-testpath-override-ot09-stale-literal-pattern
type: defect
owner: pipeline
status: closed
created: 2026-08-19
closed_at: "2026-08-19"
closure_repository: "self"
closure_commit: "0f50c9bd6a56a62e08f451381b4dcf93cef0f287"
closure_evidence: "plugins/pipeline-core/hooks/guard-testpath-override.test.mjs"
source: "Found by PHX-WP-TESTPATH-GATESTRENGTH-TRIAGE while diagnosing 5 failing guard-testpath/gate-strength suites from a full clean-candidate Verify run, 2026-08-18/19."
---

# guard-testpath-override-tests' OT09 asserts a literal pattern an earlier refactor already removed

## Description

`OT09` (in the suite registered as `guard-testpath-override-tests`) asserts that
`critical-human-proof-policy.mjs` contains the literal regex pattern
`/gates\?\.push_approval/u`. Commit `c6bd3a6b` ("generalize gate-approval mode to
feature-package-reconcile") replaced that literal property access with a
table-driven `value?.gates?.[key]` lookup, so the literal pattern no longer
exists in the file — the real behavior this test protects almost certainly
still works, but the test's own assertion is now checking for a specific
implementation detail that a legitimate refactor removed.

## Affected artifact

`critical-human-proof-policy.mjs`'s own test coverage (the suite registered as
`guard-testpath-override-tests`, specifically case OT09) — the file is
TP-7-protected, so no in-session edit route existed without a TP-7-scoped GMW
window (not open during discovery; the active window at the time covered
GS-6/TP-2/TP-3/TP-5/TP-6 only).

## Proposal

Update OT09 to assert the current, generalized `value?.gates?.[key]`
lookup-table behavior (e.g. by exercising the actual gate-approval-mode
resolution path for `push_approval` and confirming it still resolves
correctly) rather than grepping for a specific literal regex that a
legitimate prior refactor already removed. Needs a TP-7-scoped GMW window (or
the next one opened with TP-7 in scope) to edit the protected file/test pair.

## Triage — 2026-08-19

- **Decision:** accept-open, dispatch-ready once a TP-7-scoped GMW window is available.
- **Rationale:** Confirmed pre-existing (predates this session's own GMW/guard work), root cause identified precisely, fix is small and low-risk — just needs the right guard scope to land.
- **Assignment (if accepted):** Goldfish, next TP-7 GMW window.
- **Date:** 2026-08-19

## Triage — closed 2026-08-19

- **Decision:** closed — resolved.
- **Rationale:** No GMW window needed after all: `critical-human-proof-policy.mjs` and its test are Pipeline plugin source, so the guard's own override planner refuses even the `plan` step (`HGO-EXTERNAL-ADAPTER-BOUNDARY`) — the PO applied the fix directly outside the guarded session instead (commit `0f50c9bd`). OT09 now exercises the real `readPushApprovalMode` resolution path instead of grepping for the literal `/gates\?\.push_approval/u` pattern the c6bd3a6b refactor removed. Full `guard-testpath-override.test.mjs` suite: 19/19 pass.
- **Date:** 2026-08-19
