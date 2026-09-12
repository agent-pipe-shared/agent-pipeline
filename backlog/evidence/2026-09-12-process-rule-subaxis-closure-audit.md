# Process-rule subaxis closure audit

This audit checks only the two parts of
`pipeline.unenforced-process-rules-vary-by-runner` that were already reported
as implemented. It was run against candidate commit
`21cf930cacebf26b3d2ceb8c6ebe55ed787c017e` (tree
`b5a54b04b2bada03c837620fc13c68132fd5f8a2`). It does not close the parent
item.

## Product-retry axis: complete

The dedicated `continuity-dispose-failure` transition accepts a closed,
digest-bound failure envelope and derives the disposition through the shared
`review-economy` policy. The request cannot select an action or supply a
replacement queue. For a product failure the transition consumes the single
allowed retry, persists `productRetryCount: 1` in the root `retryBudget`, clears
the old dispatch and selects `nextAction: dispatch`.

The shared Continuity test executes the same decision for `claude`, `codex` and
`antigravity`. It also proves that a second product retry is refused, generic
compare-and-swap cannot forge or reset the counters, and the consumed budget
survives a course blocker and later queue reconstruction. The CLI lifecycle
test proves the dedicated writer persists the transition and rejects a
caller-selected action without changing state.

This satisfies the first acceptance criterion. It is runner-neutral policy and
state behavior; it makes no native Codex-sandbox claim.

## Dispatch-record write axis: complete

`dispatch-record-write.mjs` reads a bounded physical request, rejects duplicate
JSON keys, validates the complete `pipeline.dispatch-record.v3` object and its
model binding before publication, restricts the destination to
`evidence/dispatch-record-<taskId>.json`, publishes exclusively, and checks the
published inode, bytes and digest by readback. Malformed, incomplete,
misbound, computed-path, alias, symlink, race and mutation cases are refused.

For Workflow/native returns, `coordinateWorkflowRunnerReturn()` treats the
writer receipt as necessary but insufficient: task, candidate and result
bindings must match, and the candidate commit must then pass the authorship
verifier as `bound`. Failed write or authorship checks never produce a recorded
success.

This satisfies the third acceptance criterion and covers the historical
underspecified-stub failure class.

## Verification

The machine-written receipt
`backlog/evidence/2026-09-12-process-rule-subaxis-test-receipt.json` binds the
run to candidate commit `21cf930cacebf26b3d2ceb8c6ebe55ed787c017e`
and tree `b5a54b04b2bada03c837620fc13c68132fd5f8a2`. It verifies before and
after execution that the Pipeline code in the worktree matches that candidate,
records exact argv, exit codes, signals, byte counts and stdout/stderr digests,
and performs exact publication readback. Its canonical payload digest is
`eb35740399d9340006e8953428db2d137f262569f3b1ba540b37728c710ca0be`;
the final JSON file digest observed after readback is
`92c9c2f0a87f174724f8ca8dd93857b1c52ccae82b2c7f880f266f04c21f8047`.

The focused commands passed on 2026-09-12 with exit code 0:

```text
node --test plugins/pipeline-core/lib/continuity-state.test.mjs plugins/pipeline-core/scripts/pipeline-state-lifecycle-event.test.mjs
# 2 test files passed; continuity-state's direct TAP contains 115 passing checks.

node --test plugins/pipeline-core/scripts/dispatch-record-write.test.mjs plugins/pipeline-core/lib/dispatch-record.test.mjs plugins/pipeline-core/lib/workflow-runner-boundary.test.mjs
# 21 node:test cases plus 43 workflow-boundary checks passed.
```

The second command requires a host where its temporary `git init` fixture may
spawn; the managed tool sandbox returned `spawnSync git EPERM`, and the same
unchanged command passed outside that tool sandbox. This is test-fixture
execution evidence, not evidence for or against the deferred native Codex
sandbox under WSL.

## Parent item remains open

No ledger transition is warranted. The trusted persisted host-attestation plus
real environment-reroute consumer remains absent. Authenticated live budget
adapters for every supported runner and the empirical budget calibration also
remain absent. Therefore the second and fourth acceptance criteria are not
complete, and the item must stay `open`.
