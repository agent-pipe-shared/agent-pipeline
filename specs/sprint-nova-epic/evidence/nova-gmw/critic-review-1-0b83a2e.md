# NOVA-GMW-1 Critic review 1 — FAIL

Candidate: `a58e836^..0b83a2e` (four commits: `a58e836`, `b974dda`, `db88788`, `0b83a2e`), worktree `agent-ab84ec0efe49bd94a`.
Route requested: `claude-opus-5 at max` (guardrail-tier, MP-07 mandatory). Effective model identity: unknown (no direct route evidence).
T1 assurance: functional-equivalent-read-only; OS isolation not asserted.

## Verdict: FAIL

## Findings

- **F1 (blocker):** the window's `openedAtMs`/`expiresAt` fields are not part of the signed subject and are covered by no MAC — editing two plaintext numbers in `window.json` renews a window indefinitely from one genuine PO signature. Evidence: `plugins/pipeline-core/lib/guard-maintenance-window.mjs:292` (signed subject shape), `:406-418` (unsigned fields written into `record`), `:477-482` (integrity re-derivation excludes them). No guard protects `.git` from Edit/Write for this path.
- **F2 (blocker):** the nonce is generated and embedded but never consumed/tracked — `installGuardMaintenanceWindow` can be re-run with the same `{request, proof}` pair, re-deriving `openedAtMs = nowMs` each time, giving unlimited renewable lifts from one signature. Evidence: `guard-maintenance-window.mjs:341,349,300` (only 3 occurrences of `nonce`, no ledger); `:371-421` (`installGuardMaintenanceWindow` has no already-used check).
- **F3 (major):** the closed liftable-scope check (`GS-6`/`TP-*` only) runs only in `prepare`; `install` and `currentGuardMaintenanceWindow`/`windowCoversRule` never re-validate `scopeRuleIds`. Evidence: `:329` (sole call site of `isLiftableRuleId`); `guard-testpath.mjs:166,214` (config-supplied rule ids passed to `windowCoversRule` unfiltered).
- **F4 (major):** the mandatory "kernel path refused under a REAL armed window" integration test does not exist. `guard-gate-strength.test.mjs`/`guard-testpath.test.mjs` are untouched by all four commits; `guard-maintenance-window.test.mjs:10-13` falsely claims this coverage lives there, contradicted by the commit's own body.
- **F5 (major):** `guard-maintenance-window.test.mjs` is not registered in `harness/scripts/verify.mjs`'s `TEST_SUITES` list — the sealed "254/254" Verify evidence never executed any of the 8 new GMW tests.
- **F6 (minor):** the F4 gap is documented only in a commit message with no owner/backlog item/due date (QG-06).

## Trajectory check: inconsistent

The `verify` run itself is real and internally coherent, but: (1) the shipped test file's own header contradicts its shipping commit's body about where integration coverage lives; (2) "8/8 passing" and "all pre-existing cases still pass" claims have no artifact backing since the suite isn't registered; (3) an asserted manual end-to-end verification has no artifact and is not reproducible from what was supplied.

## Deliberately not flagged (cleared)

Kernel-check-before-window-lookup ordering; fail-closed expiry polarity (once F1's signing gap is fixed); 4h TTL ceiling enforcement; physical-repo binding; no in-session activation step; scope discipline (no other files touched, GS-1..5/7 untouched, no forbidden file touched); authorship (all four commits carry correct trailers); no weakened/deleted existing tests; symlink/DACL/owner-private storage hardening; no new dependencies; correct language assignment (English).

Full report text is this file's origin: Elephant-transcribed from the Critic dispatch's returned result, 2026-08-07.
