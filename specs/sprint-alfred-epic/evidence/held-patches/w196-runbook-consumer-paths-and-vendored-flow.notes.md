# w196 — runbooks name no source-only path; the vendored push-release-flow copy follows its original (candidate 19c)

Found by the first Full Verify of the whole 19c chain (`consumer-safe-paths-tests`, `generate-vendored-canon-tests`); both are green in the main tree, so both come from the chain.

- `lib/runbook-paths.mjs` (w175) wrote `node harness/scripts/check-doc-reconciliation.mjs` into the push runbook and `e.g. node harness/scripts/verify.mjs` into the implement runbook. A consuming project has no `harness/`, so the runbook named a path that does not exist there. The push step now reads `the project's doc-reconciliation script: <the table's own span>`; the verify step reads `<the project's verify command from its calibration>`. The runbook JSON files were regenerated with `generate-runbook.mjs`.
- `plugins/pipeline-core/docs/push-release-flow.md` was stale against `docs/push-release-flow.md` after the chain's documentation edits; regenerated with `harness/scripts/generate-vendored-canon.mjs` (1 of 41 files written).
- Evidence on the work clone: `check-consumer-safe-paths.test.mjs` 9/9, `generate-vendored-canon.test.mjs` 8/8, `generate-runbook.test.mjs` 20/20.
