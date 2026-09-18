# Nova-B corrected-candidate evidence checkpoint

## Status and identity

This is an additive evidence checkpoint for the actually tested candidate. It
does not qualify, accept, publish, or authorize the candidate. The no-reuse
release Verify run was `verify-1789770687736-bba0b2692cb5c0ca` on commit
`f3f79edfda2b8fe772bd8da3c1f320ef33a6b777`, tree
`ce0599c6b2f1edee7a570bd67e3d62760079c1c4`. Its machine output is preserved
byte-for-byte in `verify-2026-09-19.json`; the binding helper output is in
`binding-2026-09-19.json`.

Verify failed with 549/555 suites and these six actual failed steps:
`doc-contract-tests` (1), `doc-contract-check` (2),
`epic-ac02-publication-check-tests` (1), `epic-ac02-publication-check` (2),
`backlog-done-predicate-check` (1), and `critic-skip-coverage-check` (1).
The Security step passed with exit 0 and was not reused. A passed Security
freshness result is separate from the guard's final candidate/tree binding;
the Q0 prose overstates full admission when it treats freshness as that final
binding.

The binding helper verified 555 candidate-bound receipts and logs, including
the journal, manifest, terminal and plan bindings. `bindingChecksPassed` is
integrity evidence, not a green qualification, because the associated Verify
result is failed.

## What the corrections establish

The bounded corrections establish useful source and receipt consistency around
promotion inputs, policy, producer expectations and the candidate-bound Verify
data. Remaining ordinary wiring is still required: a production promotion
source/receipt/policy/input/producer architecture; a trusted human-terminal
host adapter; repair of the historical frozen-evidence mismatch; and native
observations that fixtures do not establish. The proposed release-promotion
design remains subject to real design and PO acceptance.

The Q0 measurement covers six enforced checks against the 549 whole-tree
suites. There is no deliverable optimized flow under the current contracts.
The Q0 map, publication-repair preparation and promotion-invariant material
remain proposals or scratch planning inputs; none is accepted code.

## Remaining defects and limits

Ignored scratch links are being repaired in a separate dispatch. The dispatch
record template and validator still disagree over required fields, log/report
format, and the terminal no-commit contradiction. Critic coverage is pending.
These defects are recorded here and remain unresolved.

The publication patch is draft-only. A zero-context `git apply --check
--unidiff-zero` check passes; no behavior checks were run and no protected
source was edited. The incomplete patch is not accepted code, and no new human
approval requirement is inferred.

The earlier historical evidence remains untouched. This later documentation
checkpoint must not be claimed as tested by the earlier Verify run, and its
commit must not be substituted for the candidate commit above. No native
Windows or macOS observation is established by the available fixtures.

## Evidence and disposition

The copied JSON artifacts retain exact machine output. Validation must confirm
their byte equality to `scratch/nova-b-audit/verify-f3f79edf.json` and
`scratch/nova-b-audit/current-run-binding.json`, the exact candidate, tree,
run ID, 549/555 count, six failed steps, and no private host paths or raw logs.
All referenced Markdown targets are tracked repository files. No product tests,
Full Verify rerun, Security rerun, source edit, approval, push, or publication
was performed for this checkpoint.

`verify: failed`; `independent review: pending`; `manual/browser check:
pending`; `PO acceptance: open`.
