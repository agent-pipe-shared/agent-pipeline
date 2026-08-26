# P-AC-08 — prior finding registry (neutral, delta re-review)

Source: independent Critic review, 2026-08-11 (commits `c6bd3a6b..3fdf8b9f`),
full report at `specs/sprint-phoenix-epic/evidence/pac08-f3-critic-review-3fdf8b9f.md`.

- **F-B (major):** `defaultFeaturePackageReconcileApproval` (in
  `plugins/pipeline-core/scripts/pipeline-state.mjs`) calls
  `verifyCriticalHumanProof` for a `feature-package-reconcile` action and, on
  success, returned only `{ ok: true }` — `verified.proof`, `verified.waived`,
  and the operator's `--by` value were computed and then discarded. No
  `criticalProofConsumption`-style replay ledger existed for this action kind
  (unlike `approve-push`'s). No durable record existed anywhere that a human
  approved a given reconcile. In chat mode, nothing was commit-bound.

This delta reviews commit `5420c5e7` (base `3fdf8b9f`) against this finding
only. Three other items named in the source review are out of scope for this
delta: F-A (an unrelated guard-suite regression in a different file, untouched
by this commit), and F-C/F-D (attribution-record edits made outside version
control, not code — no source file they touch is part of this delta).
