---
schema: pipeline.backlog-item.v1
id: pipeline.adr-0047-numbering-collision
type: defect
owner: pipeline
status: open
created: 2026-08-07
source: "specs/sprint-nova-epic/plans/nova-b-readiness-2026-08-06.md (lines 55-69), promoted from a plan-only note to a backlog item per the 0.5.2 Critic round's F2 finding, 2026-08-07."
due: 2026-09-06
expires: 2026-09-06
---

# Two different ADRs both claim number 0047

## Description

`docs/adr/` contains both `0047-local-supervisor-state-authority.md` and
`0047-model-free-advisor-preflight-v2.md`. "ADR-0047" is now an ambiguous
reference across the repo; `specs/sprint-nova-epic/plans/nova-b.md`'s D1/B1-I
sections depend on the number resolving to one specific decision.

## Triggering situation

Found while building `specs/sprint-nova-epic/plans/nova-b-readiness-2026-08-06.md`
on 2026-08-06; recorded there only, not filed as a backlog item at the time —
that document's own text recommended filing it. The 0.5.2 release Critic
round (2026-08-07) raised this gap as finding F2: a real defect parked in a
session-scoped plan file rather than the versioned work queue.

## Affected artifact

`docs/adr/0047-local-supervisor-state-authority.md`,
`docs/adr/0047-model-free-advisor-preflight-v2.md`, and every reference to
"ADR-0047" elsewhere in the repo (notably `specs/sprint-nova-epic/plans/nova-b.md`).

## Proposal

1. Confirm with the PO whether the collision is intentional (unlikely) or
   accidental.
2. Renumber one of the two ADRs to the next free number, updating its
   filename, its own internal self-reference if any, and every inbound
   reference to the old number across the repo (`docs/adr/README.md` index,
   `specs/sprint-nova-epic/plans/nova-b.md`, and any other citing document).
3. Add a check (or extend an existing one, e.g. `doc-contract-check` /
   `language-canon-check`'s registration pattern) that fails Verify on a
   duplicate leading ADR number, so this class of collision cannot recur
   silently.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accept-open.
- **Rationale:** confirmed still live — `docs/adr/0047-local-supervisor-state-authority.md`
  and `docs/adr/0047-model-free-advisor-preflight-v2.md` both exist. Step 1
  of the item's own Proposal (confirm with the PO whether this is
  intentional) is unresolved and is a PO call, not something to infer —
  proceeding straight to a renumber without that confirmation risks
  guessing which of the two ADRs is the one that should move.
- **Assignment (if accepted):** ask the PO which ADR keeps `0047` before any
  rename; then a `goldfish-mechanic` dispatch (uniform rename + reference
  sweep across `docs/adr/README.md`, `specs/sprint-nova-epic/plans/nova-b.md`,
  and any other citing document) plus, per the item's step 3, a Verify check
  for duplicate leading ADR numbers so this class of collision cannot recur
  silently.
- **Date:** 2026-08-07
