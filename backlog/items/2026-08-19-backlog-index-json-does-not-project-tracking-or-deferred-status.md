---
schema: pipeline.backlog-item.v1
id: pipeline.backlog-index-json-does-not-project-tracking-or-deferred-status
type: workflow-improvement
owner: pipeline
status: open
created: 2026-08-19
source: "PO, in-session, 2026-08-19, in response to the new backlog/README.md Ledger section: 'der index Jason des backlogs sollte dann aber auch Ziel sprints oder status wie pausiert/deffered kennen oder?' (the backlog's index.json should also know target sprints or a status like paused/deferred, right?)"
---

# `backlog/index.json` does not project `tracking` or a deferred marker, so neither is visible without opening the item file

## Description

`backlog/index.json` (the machine-generated, authoritative live view of the
backlog — see `backlog/README.md`'s Ledger section) currently projects only
`id`/`status`/`type`/`owner`/`created`/`source` per item (plus closure fields
once `status: closed`). Two pieces of information the PO expected to find
there are not projected at all:

1. **A "target sprint"-like signal.** The item template's optional `tracking`
   frontmatter field is sometimes used this way already (e.g.
   `tracking: "Nova A / issue #57"` on
   `backlog/items/2026-07-24-backlog-delivery-status-reconciliation.md`), but
   `tracking` is free text, used inconsistently (also seen as a Sentinel
   provenance/scope note, e.g. `"Sentinel recovery baseline; no completion
   claim."`), and is not projected into `index.json` at all.
2. **A "deferred" marker.** There is no `status: deferred` value by design —
   the ledger's status enum is strictly `open`/`in_progress`/`closed`
   (`reconcile-backlog-ledger.mjs`'s `ORDER` array), and a deferral is
   recorded as free-text prose in the item's own Triage `Decision:` field
   (`backlog/README.md`'s Triage rules, item 2). That prose is invisible in
   `index.json` — a deferred item looks identical to a plain `open` one in
   the one place meant to give a live view.

## Triggering situation

Direct follow-up to committing `backlog/README.md`'s new Ledger section
(commit `5d74f8b1`, 2026-08-19), which documents `index.json.counts` as "the
one place to read a live backlog count from." The PO's question surfaced
that the documented source of truth is still missing two fields people
actually want to filter/scan by.

## Affected artifact

- `plugins/pipeline-core/scripts/reconcile-backlog-ledger.mjs` — the
  generator that writes `backlog/index.json`; its per-item projection needs
  two additions.
- `backlog/index.json` — the output shape gains fields (additive, no
  existing field removed or renamed).
- `backlog/README.md`'s Ledger section — needs a one-line update once the
  shape changes.

## Proposal

Additive only — no change to the status enum or the ORDER-constrained
ledger state machine (that would be a real structural/ADR-level change, not
this item's scope):

1. **Project `tracking` verbatim** into each `index.json` item entry when the
   source file has one (already free text — no parsing needed).
2. **Add a derived `deferred: boolean`**, computed by parsing the item's own
   Triage section for `Decision: deferred` (case-insensitive, matching the
   existing worked example's exact phrasing convention in
   `backlog/README.md`'s Triage rules item 2). `false`/absent when the item
   has no Triage section yet or a different decision.
3. Regenerate `index.json`/`STATUS.md` via the existing
   `reconcile-backlog-ledger.mjs --activate` path — no new file, no new
   command surface.
4. Update `backlog/README.md`'s Ledger table row for `index.json` to name
   the two new fields.

Out of scope (flag if raised again, do not fold in here): a `status:
paused`/`deferred` enum value would touch the ORDER-constrained state
machine and every consumer of the three-value enum — that is a real design
decision, not a small addition, and is deliberately NOT proposed here.

## Triage

Not yet triaged.
