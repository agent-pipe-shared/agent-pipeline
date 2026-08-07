---
schema: pipeline.backlog-item.v1
id: pipeline.backlog-ledger-closure-reason-misleading
type: defect
owner: pipeline
status: open
created: 2026-08-07
source: "0.5.2 release Critic round, 2026-08-07, finding F3."
due: 2026-09-06
expires: 2026-09-06
---

# `reconcile-backlog-ledger.mjs` records a "no closure claimed" reason on real closures

## Description

Every transition `reconcile-backlog-ledger.mjs` records — including a
transition `"to": "closed"` — carries the identical hardcoded `REASON`
string (`plugins/pipeline-core/scripts/reconcile-backlog-ledger.mjs:64-67`):
*"Record in the ledger the status this backlog item file already asserts.
The item file is the pre-existing record; this entry claims no
implementation, no review, and no closure of its own."*

That wording is correct for a baseline-migration sync of an already-`open`
or `in_progress` item. It is wrong for a `"to": "closed"` transition: those
items carry real `closed_at`/`closure_repository`/`closure_commit`/
`closure_evidence` fields in their own frontmatter, checked by this same
script's `closureFindings()` before the transition is even recorded. The
ledger — the append-only audit surface a future reader consults to ask "on
what basis was this closed?" — answers with a disclaimer that no closure is
being claimed, for entries that demonstrably are closures.

The machine-checkable binding is unaffected: `evidence.commit` on each
transition correctly names the real fixing commit. Only the human-readable
`reason` field is wrong.

## Triggering situation

Found by the 0.5.2 release Critic round (2026-08-07) reviewing the
2026-08-06 night backlog-reconciliation commits, finding F3. Confirmed
directly: `backlog/transitions.ndjson` sequences with `"to":"closed"` (e.g.
`pipeline.po-gate-authority-path-canonicalization`,
`pipeline.windows-verify-brittle-test-hygiene`) all carry this reason
verbatim.

## Affected artifact

`plugins/pipeline-core/scripts/reconcile-backlog-ledger.mjs` (the `REASON`
constant and its single unconditional use for every transition regardless
of target status).

## Proposal (drafted, not applied — GS-6 blocked in-session)

Split the reason by target status: keep the existing `REASON` text for
non-closing transitions; add a distinct reason for `to === "closed"`
transitions that correctly states the entry attests a sync to the item's
own pre-existing, evidence-bound closure record rather than disclaiming
closure entirely. Attempted directly in this session:

```js
const CLOSED_REASON =
  "Record in the ledger the closure this backlog item file's own frontmatter " +
  "already documents (closed_at, closure_repository, closure_commit, closure_evidence). " +
  "This entry attests the sync to that pre-existing closure record, not a new " +
  "implementation or review of its own.";
```

...selected at the call site based on the transition's `to` value. Refused
by `guard-gate-strength.mjs` (GS-6): this checkout is the live-enforcing
plugin root for the session, and GS-6 has no in-session override by design
(same class of gap as
`backlog/items/2026-08-07-gs6-blocks-inert-plugin-metadata-in-self-hosted-sessions.md`,
filed the same session). A future dispatch or the PO editing this file
directly outside a session should apply the split and re-run
`reconcile-backlog-ledger-tests`.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accept-open.
- **Rationale:** correctness gap in an audit-trail's human-readable field,
  real but low-severity (the machine-checkable `evidence.commit` binding is
  unaffected, per the item's own Description) and low-risk to fix (a
  two-line conditional, already drafted and reviewed in this item). No
  design latitude remains — the fix is fully specified.
- **Assignment (if accepted):** `goldfish-mechanic` (mechanical, uniform,
  fully-specified — no in-task design decisions) once dispatched from a
  session or PO edit not bound by this checkout's GS-6 restriction on
  `plugins/pipeline-core/**`, applying the drafted `CLOSED_REASON` split to
  `reconcile-backlog-ledger.mjs`, then re-running
  `reconcile-backlog-ledger-tests` and `backlog-state-check`.
- **Date:** 2026-08-07
