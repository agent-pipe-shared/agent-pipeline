---
schema: pipeline.backlog-item.v1
id: pipeline.gg-22s-own-remediation-order-creates-unclearable-ledger-debt
type: defect
owner: pipeline
status: open
created: 2026-08-29
sprint: nova
done_when: contains plugins/pipeline-core/hooks/guard-git.test.mjs GG22-7
source: "Hit live by the Elephant on 2026-08-29 while closing candidate backlog items: following GG-22's printed remediation literally produced a debt state no further reconciliation could clear, costing roughly ten tool calls to escape."
---

# GG-22's own remediation instructions, followed literally, create ledger debt that cannot be cleared

## What happened

Three items were closed in one commit. The next commit was refused:

> BLOCKED (git-guard GG-22): an earlier commit changed …'s status without a
> matching ledger reconciliation since …
> Run: `node plugins/pipeline-core/scripts/reconcile-backlog-ledger.mjs --activate`
> **Then commit the resulting backlog/STATUS.md / backlog/index.json /
> backlog/transitions.ndjson changes before any other commit.**

That instruction was followed exactly. The reconciler ran, recorded 60
transitions — including, from the *working tree*, closures that were not yet
committed — and the ledger was committed on its own, "before any other commit".

The next commit was then refused again, naming the item edits that had just
been committed *after* the ledger. Re-running the reconciler answered:

> Backlog ledger already records every item's asserted status; nothing to
> reconcile.

At that point the debt was unclearable by the prescribed route. GG-22 clears
only when a commit touches `backlog/transitions.ndjson`, and the reconciler
correctly refuses to produce one — its own code comment says it will not
"invent a ledger event that never happened".

## Where it is

`plugins/pipeline-core/hooks/guard-git.mjs`, the GG-22 block at lines 1204-1285:

- The debt range is `<last commit touching backlog/transitions.ndjson>..HEAD`.
- Debt is any `backlog/items/*.md` in that range with a changed `status:` line.
- While debt exists, only staged paths under `backlog/items/` or the three
  ledger files are admitted.

`plugins/pipeline-core/scripts/reconcile-backlog-ledger.mjs`,
`applyBacklogReconciliation()` at line 357: appends ledger events only for real
transitions, and regenerates the projections only on byte drift. Both behaviours
are correct and should not change.

The two are individually right and jointly produce the trap. The guard's
remediation text says *reconcile, then commit the ledger before anything else*.
But the reconciler reads the working tree, so reconciling first consumes the
transitions belonging to item edits that are still uncommitted. Committing those
edits afterwards puts them *after* the last ledger touch — fresh debt, against a
ledger that already records their outcome and therefore has nothing left to
append.

The guard's own code comment already describes the correct order, and it is the
opposite of what it prints: "batched multi-item closures across several commits
before one shared reconciliation commit are an established, legitimate pattern."
Reconciliation belongs **last**, not first.

## Why this is worth fixing

The trap is invisible until it fires and is expensive to escape. Escaping it
required understanding the guard's source, stashing a file, extracting it from
the stash, committing it alone so it would generate a genuine creation event,
reconciling on that event, committing the ledger, and only then landing the
change originally being made. About ten tool calls, none of which produced any
product value.

It also punishes correct behaviour. An agent that reads the remediation text and
follows it precisely lands in the trap; one that ignores the ordering and
reconciles last does not. A guard whose printed advice is worse than ignoring it
teaches agents to distrust guard messages, which is the opposite of what this
layer is for.

The blocking itself is right and should stay. Only the printed order is wrong.

## Proposal

Correct the remediation text to match the guard's own documented pattern, and
place a marker `pipeline.gg-22-remediation-order-is-reconcile-last` at it:

- Say: commit the item edits first, then run the reconciler, then commit the
  ledger files.
- Drop "before any other commit", which is what forces the inverted order. What
  the rule actually needs is that the ledger commit follows the item commits,
  not that it precedes everything.

Worth considering in the same change, both small: name the ledger paths as an
explicit staged-path allowance in the message so an agent does not discover by
refusal that a `backlog/items/`-only commit is permitted while debt exists; and
have the reconciler exit non-zero with a distinct message when it finds nothing
to reconcile *while* GG-22 debt exists, since "nothing to reconcile" currently
reads as success at the exact moment it means the trap has closed.

## Acceptance

- The remediation text names the reconcile-last order, and the marker is
  present.
- A fixture test drives the sequence that failed here — close an item, commit
  it, reconcile, commit the ledger — and asserts the next unrelated commit is
  admitted.
- A fixture test drives the inverted order and asserts the guidance no longer
  recommends it.
- The rule's blocking behaviour for genuine unreconciled debt is unchanged,
  asserted by the existing tests.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted
- **Rationale:** a guard that prints advice which reliably produces an
  unclearable state is worse than one that prints nothing. Cheap to fix, and it
  is a text-and-marker change, not a change to the rule.
- **Assignment:** `sprint: nova`. Not a candidate blocker — the trap is
  escapable once understood — but it will cost every session that meets it.
- **Date:** 2026-08-29

Fixed, 2026-08-29 (dispatch NVA-R16-GG22FIX): printed remediation text and
marker corrected in `guard-git.mjs` (commit `01c02971`); all 230 existing
`guard-git.test.mjs` cases pass unmodified. The two required fixture tests
(drafted as GG22-7/GG22-8, see dispatch record) could NOT be committed by
this dispatch — `guard-git.test.mjs` is TP-1 protected (`guard-testpath.mjs`)
with no override route available to a Goldfish (`status:
author-repair-required`). Left `status: open` for the Elephant to add the
tests (author-repair route or an Elephant-run stage-0 edit) and close.

**Elephant follow-up, 2026-08-29:** the same TP-1 protection refuses the
identical edit from the Elephant role too — this is a structural, self-
application constraint on `guard-git.test.mjs` (it gates the git-guard
union itself), not something role alone resolves. Genuinely needs a PO-
signed author-repair ceremony. Queued in the PO-gate/signature topic list
rather than spent now. The drafted `GG22-7`/`GG22-8` test code is preserved
verbatim in `evidence/dispatch-record-NVA-R16-GG22FIX.json`'s
`stopCondition.draftTests` field, ready to paste above the `// ---- Summary`
line once a ceremony clears the path. The source fix itself (commit
`01c02971`) is real, verified, and shipped independent of this remaining
test-coverage gap — the guard's behavior is correct today, just not yet
pinned by a dedicated regression test for this exact case.

`done_when` repointed, 2026-08-29 (Elephant): the old marker
(`pipeline.gg-22-remediation-order-is-reconcile-last`) was satisfied the
moment the source fix landed, so it stopped measuring anything once the
text fix was real — the same graduation pattern seen elsewhere this
session. Repointed to `contains guard-git.test.mjs GG22-7`, the drafted
test's own name, which will genuinely go from absent to present once the
ceremony clears and the tests land.
