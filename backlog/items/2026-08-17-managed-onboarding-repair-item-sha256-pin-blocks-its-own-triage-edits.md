---
schema: pipeline.backlog-item.v1
id: pipeline.managed-onboarding-repair-item-sha256-pin-blocks-its-own-triage-edits
type: defect
owner: pipeline
status: open
created: 2026-08-17
source: "Surfaced by the 2026-08-17 full-backlog triage pass: filling in this item's own Triage section broke check-backlog-state.mjs."
---

# The one-off `managed-onboarding-success-contract` ledger repair pins the item's entire file bytes, so filling in its own Triage section fails the gate

## What happened

`backlog/items/2026-07-25-managed-onboarding-success-contract.md` was admitted
into the ledger by a one-off 2026-07-29 hotfix repair
(`backlog/transitions.ndjson` sequence 41, `evidence.kind:
"missing-initial-ledger-repair"`, actor `hotfix-047-missing-initial-ledger-repair`).
That event records an `itemSha256` of the item file's exact bytes at repair
time. `check-backlog-state.mjs:533` re-hashes the current file on every run
and hard-fails (`ledger event 41: itemSha256 does not bind the current item
bytes`, exit 2) the moment those bytes change at all — including filling in
the item's own empty `## Triage` section, the same routine edit every other
backlog item accepts freely.

This was hit live during the 2026-08-17 full-backlog triage: the item was
correctly identified as a good match for Sprint Alfred, its `## Triage`
section was filled in exactly like the other 33 items deferred that day, and
`check-backlog-state.mjs` immediately failed. The edit was reverted (the item
file is back to its exact 2026-07-29-pinned bytes) so the gate is green
again; the resulting Alfred-deferral decision could not be recorded in the
item itself and is captured here instead, see Triage below.

## Why this is a defect, not intended behavior

`MANAGED_ONBOARDING_REPAIR_ID` in `backlog-state.mjs`
(`plugins/pipeline-core/lib/backlog-state.mjs:40`) is a single hardcoded
special case — no other backlog item has an equivalent byte-pin, and there is
no supported repin/amendment path for this one (unlike closure evidence,
which has an explicit V2 amendment mechanism for exactly this kind of
after-the-fact correction). The pin's evident intent was to anchor the
*content this item asserted* at the moment the 0.4.4 hotfix retro admitted it
into the ledger (proving it wasn't silently rewritten to claim something
different) — not to freeze the file forever, including its own still-empty
Triage placeholder.

## Affected artifact

`plugins/pipeline-core/lib/backlog-state.mjs:499-567` (the `missing-initial-
ledger-repair` event kind and its schema), `plugins/pipeline-core/scripts/
check-backlog-state.mjs:530-534` (the hard-fail check), and the one affected
item, `backlog/items/2026-07-25-managed-onboarding-success-contract.md`.

## Proposal

Narrow the pin so it survives routine metadata edits: either (a) hash only
the frontmatter-stripped body content up to (not including) the `## Triage`
section, so filling in Triage never invalidates it, or (b) add a scoped
repin/amendment event kind — mirroring the closure-evidence V2 amendment
mechanism already used elsewhere — that lets a later session record a new
`itemSha256` with its own authorized evidence, without a second full
`missing-initial-ledger-repair` event (which `backlog-state.mjs:1051`
explicitly refuses to allow twice). Needs a short design pass, not a same-day
patch to ledger-integrity code.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted as a real, narrow defect; not fixed this session
  (ledger-integrity code, needs a deliberate design pass + Critic review, not
  a same-day patch). The blocked triage decision it displaced: `pipeline.
  managed-onboarding-success-contract` is accepted, still open, deferred to
  Sprint Alfred — it is a standing review-lens rule for future host-layout
  additions ("mechanical governance, measurable rigor" fits it better than
  urgent current-scope work), not a live defect against any layout supported
  today. That deferral is recorded here, not in the pinned item, until this
  defect is fixed.
- **Rationale:** the pin is a narrow, understood, one-off mechanism; fixing
  it correctly needs a design decision (which of the two Proposal directions,
  or a third) the PO has not made yet.
- **Assignment (if accepted):** next available Alfred slot — this is itself
  "mechanical governance, control integrity" work, matching Alfred's own
  scope.
- **Date:** 2026-08-17
