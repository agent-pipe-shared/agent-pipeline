# Critic review gate closure

Backlog item:
`pipeline.no-technical-gate-enforces-critic-review-before-done`

The implementation is distributed across the accepted trigger matrix in
`harness/review-protocol.md`, `critic-skip-decision.mjs`, the closed v3 dispatch
record validator and `check-critic-skip-coverage.mjs`. The checker is registered
in `harness/scripts/verify.mjs` as both a test and a gate step. Commit
`0b34dbc111f98dd4b3b6d1408ef012a924cd9d63` added the remaining commit-path
verification, so a detached verdict cannot be attached to unrelated commits.

On 2026-09-12 this focused command passed all three suites:

```text
node --test plugins/pipeline-core/lib/critic-skip-decision.test.mjs plugins/pipeline-core/lib/dispatch-record.test.mjs plugins/pipeline-core/scripts/check-critic-skip-coverage.test.mjs
```

The live checker exited 1 and named exactly three current v3 records whose T1
review evidence remains pending: the two Continuity repair records and the HGO
audit-repair record. That negative result is expected gate behavior. It is not
a clean-candidate Verify result and does not claim those three dispatches are
accepted. The final candidate must still dispose their review evidence before
the gate can pass.
