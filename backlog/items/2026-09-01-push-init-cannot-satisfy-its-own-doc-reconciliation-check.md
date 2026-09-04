---
schema: pipeline.backlog-item.v1
id: pipeline.push-init-cannot-satisfy-its-own-doc-reconciliation-check
type: defect
owner: pipeline
status: closed
closed_at: 2026-09-04
closure_repository: self
closure_commit: 7d56917c37344fb3750877c4e16787b0adb30943
closure_evidence: backlog/evidence/2026-09-04-nva-b-pushinitdoc-1-closure-verification.md
created: 2026-09-01
sprint: nova-b
done_when: manual
source: "scratch/release-flow-self-invalidation-2026-09-01.md (loop 3), confirmed against plugins/pipeline-core/scripts/push-init.mjs (buildReconciliationArgv, parseArgs) and harness/scripts/check-doc-reconciliation.mjs's header contract."
---

# `push-init` cannot satisfy its own doc-reconciliation check

## The defect

`buildReconciliationArgv()` in
`plugins/pipeline-core/scripts/push-init.mjs` emits the literal string
`HEAD` as `--candidate` and never emits `--record-ref`, which
`check-doc-reconciliation.mjs` defaults to `HEAD` too. Both therefore resolve
to the same commit within one invocation.

`check-doc-reconciliation.mjs`'s own header states the contract this breaks:
the reconciliation record naming a candidate commit cannot live inside that
same commit's own tree — writing the record changes the tree, which changes
the commit's own hash. The prescribed shape is to commit the substantive
work as commit S, run the checker with an explicit `--candidate S`, then
commit the reconciliation record as a later commit R, read via
`--record-ref` (`git show <recordRefSha>:docs/doc-reconciliation.md`).

`push-init`'s own invocation asks the checker to find, inside HEAD's own
tree, a record naming HEAD's own SHA — which is structurally impossible
whenever any `**Governs:**`-annotated ADR is implicated.

## Confirmed empirically, twice, on 2026-09-01

- With an explicit `--candidate <sha> --record-ref HEAD` (the record commit
  ahead of the candidate commit): the check exits 0.
- With `push-init`'s own form (`--candidate HEAD`, no `--record-ref`): the
  check exits 2.

## Remedy options (none selected here)

1. Add a `--record-ref` flag to `push-init.mjs`'s own CLI, threaded through
   `buildReconciliationArgv()`, so a caller can name the later record commit
   explicitly.
2. Have `push-init.mjs` accept an explicit `--candidate <sha>` (rather than
   the literal string `HEAD`) so the candidate and record commits can differ
   by construction.

## Review requirement

This touches the push-driver argv contract and its guard-admission tests. It
owes a T1 Critic round.

## Closure

Closed 2026-09-04 against `7d56917c`, which had already landed 2026-09-01 —
the defect was fixed the same day this item was filed, by a different, unaware
dispatch (`NVA-B-PUSHINIT-1`). Both remedy options above are implemented as a
superset: `--candidate` is now required, `--record-ref` optional and defaulting
to the checker's own documented default.

Full verification, including the T1 round this item requires, is in
`backlog/evidence/2026-09-04-nva-b-pushinitdoc-1-closure-verification.md`. In
short: reproduction re-established live (both directions, not trusted from the
item's own three-day-old claim); the Critic's one major finding (three
documented invocation surfaces left stale) turned out to be already resolved by
a third, unrelated commit the same day, verified live rather than taken on the
Critic's own disclaimer that this was outside its reviewed object; the Critic's
one minor finding (a test pinned to two historical SHAs, a narrow false-red
risk) is accepted as residual and recorded rather than dispatched for a fix.
