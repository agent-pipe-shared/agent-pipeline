# D190 residual-finding acceptance: lifecycle slice implemented (C2)

Status: lifecycle production edit done and its five cases GREEN; authorization function, push-gate wiring and the remaining suite comparison are NOT done. Targeted delivery for the lifecycle check: green. Batch Critic, Full Verify and PO acceptance stay pending.

## Stacking

The patch is the cumulative diff against "candidate a4d1e0d4d plus the budget patch (w7-d190-critic-delta-rounds-are-not-capped.patch)". Apply order: budget patch, then this patch. `git apply --check` of this patch on a third clone (plain candidate plus budget patch): exit 0.

## Changed files (in the patch)

- plugins/pipeline-core/lib/critic-verify-lifecycle.mjs (+~50 lines): exports `residualFindingId` (sha256 of the module's existing `canonicalJson`), `CRITIC_VERIFY_RESIDUAL_LIFECYCLE_RECEIPT_SCHEMA` (v3) and `RESIDUAL_ACCEPTANCE_BASIS`; a private `residualAcceptanceFor`; `readBoundConsumedCriticReceipt` lets a failed receipt through only via that function (so record and readback share one rule); record writes v3 with `residualAcceptance {basis, mode, acceptanceSha256, findings}`; readback accepts v3, requires the key set, and refuses drift (`CVL-CRITIC-DRIFT`) when the record kind and the recomputed acceptance disagree. Passing receipts keep v1, byte for byte. Carry-forward records never take the residual path (the inner carry read passes no acceptance, so a failed receipt stays CVL-CRITIC-FAILED).
- plugins/pipeline-core/lib/critic-verify-lifecycle.test.mjs: the five RED cases of slice C1, now GREEN, one corrected (below).

Rule implemented: a failed receipt passes only when the open findings (default reader: consumed result `verdict.findings`) are non-empty, count equals `findingCount`, every severity is `minor`, the acceptance binds the receipt's commit, tree, receipt sha256 and the exact sorted `{id, severity}` list, and `verifyResidualAcceptanceFn` returns `authorized: true` with a mode. Otherwise `CVL-CRITIC-FAILED` with its unchanged text. The recorded mode is the verify function's returned mode.

## Case correction (written justification)

Case "a missing or unverified acceptance..." recorded both modes in ONE fixture. The record is immutable and now carries the mode, so the second write hit the existing `CVL-RECEIPT-COLLISION` rule (same id, different bytes). That rule is a deliberate existing binding, not something to weaken; the case now uses a fresh fixture per mode. The PO decision (both approval modes qualify) is still pinned: both modes are asserted.

## Evidence (clone, machine-written logs in the scratch driver dir, removed with it)

- RED against original code: `node plugins/pipeline-core/lib/critic-verify-lifecycle.test.mjs` exit 1, SyntaxError: no export `residualFindingId` (whole file RED).
- GREEN with edit: lifecycle suite tests 12, pass 12, fail 0, exit 0 (first run had 1 failure, the collision above).
- Revert proof: with ONLY the lifecycle production edit reverted (tests kept) the file is RED again with the same import SyntaxError, exit 1; restore proven byte-identical.
- Baseline (clone2 = candidate plus budget patch, NOT plain candidate; difference stated): lifecycle suite 7/7 pass; push-prepare 88/88 in both states.
- scripts/push-prepare.test.mjs: patched 88/88, baseline 88/88, failing-name sets both empty.
- lib/critic-verify-readiness.test.mjs: does not exist.
- session-critic-finalizer, guard-maintenance-window-kernel-closure suites and `generate-architecture-overview.mjs --check`: were started in both clones but had NOT finished at the budget checkpoint; NOT verified here. Run them next.

## Not done

- critic-verify-readiness.mjs wiring: no readiness test file exists; wiring needs the authorization function, which does not exist. Dependencies stay injectable (`readOpenFindingsFn`, `residualAcceptance`, `verifyResidualAcceptanceFn`); the readiness reader still calls `readCriticVerifyLifecycle` without them. Next slice.
- Authorization function for kind `accept-residual-critic-findings` in both approval modes (signature via the kind-generic signed-action verifier, chat via the waiver), the authorize-critical and pipeline-state wiring, the push-prepare closing sentence (~line 752) and its text pin.
- Unverified from C1 notes: whether `criticalActionSubjectSha256` accepts a new kind without edits.
- Failing-name comparison for finalizer, kernel-closure and architecture check (above).

## Kernel production files and operator flow

Production kernel file in this patch: plugins/pipeline-core/lib/critic-verify-lifecycle.mjs; the PO applies it under a Guard Maintenance Window. Flow: apply-diff budget patch, then this patch; `git add -u` with a path limit; commit as the PO; stamp; install. Independent Critic review stays a parent-owned batch gate.

Proposed commit message: feat(critic): let the PO accept residual minor findings through the configured approval mode so the push gate can qualify the candidate
