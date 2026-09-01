---
schema: pipeline.backlog-item.v1
id: pipeline.push-init-hardcodes-candidate-head-which-layer-1b-can-never-satisfy
type: defect
owner: pipeline
status: open
created: 2026-08-31
source: "Measured 2026-09-01 during 0.6.0 release preparation, when Layer 1b (check-doc-reconciliation.mjs) was run manually after push-init.mjs's driver contract was inspected."
sprint: nova-b
done_when: manual
---

# `push-init.mjs` hardcodes `--candidate HEAD`, which Layer 1b's own record contract can never satisfy

## Description

`plugins/pipeline-core/scripts/push-init.mjs` builds its Layer 1b
(`harness/scripts/check-doc-reconciliation.mjs`) invocation with `--candidate`
pinned to the literal ref `"HEAD"` (`buildReconciliationArgv()`,
`push-init.mjs:161`; the header comment at `push-init.mjs:57-59` explains the
choice as "definitionally the same candidate every other step below binds
to").

`docs/doc-reconciliation.md`'s write-order rule states the reconciliation
record "can never live inside that commit" it names, because writing the
record changes the tree, which changes the hash — so the record is written
and committed **last**, and the check must be run with `--candidate` set to
the tip of the substantive work, **not** the record commit itself. The same
file's "Known limitation (v1)" section states that a record whose section
names candidate commit X is invisible to a run against candidate commit Y
even when X is an ancestor of Y.

Put together: driving Layer 1b through `push-init.mjs` requires a
reconciliation record entry naming `HEAD` for the run to find
(`findCandidateSection()` matches only the exact resolved candidate sha), but
by the record's own write-order rule that entry can never exist inside `HEAD`
— committing it produces a new `HEAD`, which then needs its own entry, and so
on: an unbounded regress with no fixed point. In any repository that carries
`check-doc-reconciliation.mjs` (this repository, by ADR-0015 self-
application), the documented fast path through `push-init.mjs` therefore
cannot satisfy Layer 1b as designed. The per-layer commands (running
`check-doc-reconciliation.mjs` directly with an explicit `--candidate` naming
the tip of substantive work, distinct from the record commit) are the only
working route today.

`docs/push-release-flow.md` presents `push-init.mjs` as the fast path
("`push-init.mjs --root … --by … --remote … --destination … [--base …]` —
fast path chaining 1b through the readiness check; stops at the signature",
line 507) without recording this limitation.

## Triggering situation

Measured 2026-09-01 during 0.6.0 release preparation: Layer 1b was run
manually, against an explicit `--candidate` naming the tip commit rather than
`HEAD` at record-commit time, after `push-init.mjs`'s driver contract
(`buildReconciliationArgv()` and its surrounding header comment) was
inspected and found to hardcode `--candidate HEAD` with no override.

## Affected artifact

`plugins/pipeline-core/scripts/push-init.mjs` (`buildReconciliationArgv()`);
`docs/doc-reconciliation.md` (write-order rule and "Known limitation (v1)");
`docs/push-release-flow.md` line 507 (presents `push-init.mjs` as the fast
path without this caveat).

## Proposal

Left open for the PO to choose among (not decided here):

1. Widen `check-doc-reconciliation.mjs` to accept a proven-clean ancestor
   span instead of requiring an exact-sha section match — named in
   `docs/doc-reconciliation.md` itself as "the obvious v2, not something to
   do here without review".
2. Give `push-init.mjs` a `--candidate` flag so a caller can pass the actual
   tip of substantive work instead of the hardcoded literal `"HEAD"`.
3. Document `push-init.mjs` as not applicable (or as skipping Layer 1b) in
   any repository where `check-doc-reconciliation.mjs` is present, and
   correct `docs/push-release-flow.md` line 507 to stop presenting it as an
   unqualified fast path for such repositories.
