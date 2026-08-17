---
schema: pipeline.backlog-item.v1
id: pipeline.merged-into-frontmatter-key-documented-but-unsupported
type: defect
owner: pipeline
status: closed
created: 2026-08-17
closed_at: 2026-08-17
closure_repository: self
closure_commit: 35c46c26344d2292f5823ce726882dd04a5990bf
closure_evidence: backlog/README.md
source: "Elephant self-caught, 2026-08-17: followed backlog/README.md's own documented duplicate-merge convention verbatim and it broke check-backlog-state.mjs."
---

# `backlog/README.md`'s documented `merged-into:` frontmatter key is not accepted by the parser, silently corrupting the whole item on use

## Description

`backlog/README.md:58` documents the duplicate-merge convention: "the
newer item points to the older one (`merged-into: <filename>`), `status:
rejected` with rationale 'duplicate of …'." Following this literally in a
backlog item's frontmatter breaks `parseBacklogItem()`
(`plugins/pipeline-core/lib/backlog-state.mjs:136`): the frontmatter key
regex is `^([a-z_]+):\s*(.*?)\s*$` — lowercase letters and underscores
only, no hyphens. A `merged-into:` line fails this match entirely, so
`check-backlog-state.mjs` reports `frontmatter line N is not a scalar
key/value` for the WHOLE item, which then cascades into unrelated-looking
`ledger event N: id does not name a current backlog item` errors for every
prior ledger transition recorded against that item's id (since the
checker's stricter parser now can't resolve the id at all).

Separately, `status: rejected` is ALSO not a value the ledger tooling
accepts: `reconcile-backlog-ledger.mjs`'s `ORDER` only recognizes `open`,
`in_progress`, `closed` (`plugins/pipeline-core/scripts/reconcile-backlog-ledger.mjs:69`).
The README's documented duplicate-merge convention (`merged-into` key AND
`status: rejected`) is therefore not the tooling's actual current
contract in either respect — it describes an aspiration or a stale
convention, not what the machine-enforced schema accepts today.

## Triggering situation

Live 2026-08-17: closed a genuine duplicate backlog item following the
README's own convention verbatim (`merged-into: <filename>`), which
silently broke `check-backlog-state.mjs` (caught only because a
subsequent unrelated `harness/scripts/verify.mjs` run happened to include
`backlog-state-check` as a step). Recovered by removing the unsupported
key (the merge target is still recorded in the item's body prose and in
`closure_evidence`) and using `status: closed` with real closure fields
instead of `status: rejected`.

## Affected artifact

`backlog/README.md:56-58` (the documented convention),
`plugins/pipeline-core/lib/backlog-state.mjs:136` (the frontmatter key
regex, `[a-z_]+` only), `plugins/pipeline-core/scripts/reconcile-backlog-ledger.mjs:69`
(the `ORDER` enum, `open`/`in_progress`/`closed` only).

## Proposal

Not designed here. Two independent directions, either or both: (a) update
`backlog/README.md` to describe the convention that actually works today —
e.g. a `closure_evidence`-pointer-plus-body-prose pattern, `status: closed`
with a real `closure_commit`/`closure_evidence`, no `merged-into` key,
no `rejected` status — since this is the cheaper, no-code fix; or (b)
extend the schema/tooling to actually accept `merged-into`/`rejected` as
first-class, if that expressiveness is wanted (distinguishing "duplicate,
merged" and "considered and declined" from an ordinary "closed" disposition
has real value). Either way, the current mismatch between documented and
enforced behavior should not persist silently.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted — confirmed live, self-caught and self-recovered
  same session.
- **Rationale:** low severity (caught by an existing gate before it could
  land silently), but a real footgun for the next session that follows
  the README literally.
- **Assignment:** queued; likely a quick docs-only fix (direction (a)) is
  the pragmatic default unless the PO wants the richer schema (direction (b)).
- **Date:** 2026-08-17

### Closed 2026-08-17 (overnight AFK block, NVA-MICRO-1)

Direction (a): `backlog/README.md`'s duplicate-merge convention rewritten
to describe the actually-working pattern (`status: closed` with real
`closure_commit`/`closure_evidence`, merge target named in body prose),
pointing at a real worked example already in the repo. No schema/tooling
change. `node harness/scripts/check-doc-contracts.mjs` clean. A sibling gap
in the SAME file (step 2 still documents unsupported `status: rejected`/
`status: deferred` values) was self-caught while verifying this fix and
filed separately:
`backlog/items/2026-08-17-backlog-readme-still-documents-rejected-and-deferred-as-status-values.md`.
