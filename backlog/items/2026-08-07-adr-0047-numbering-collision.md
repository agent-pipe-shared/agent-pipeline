---
schema: pipeline.backlog-item.v1
id: pipeline.adr-0047-numbering-collision
type: defect
owner: pipeline
status: in_progress
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

- **Decision:** accepted — step 1's PO call has been made (2026-08-09): the
  collision was accidental, not intentional. `docs/adr/0047-model-free-advisor-preflight-v2.md`
  keeps `0047` — it is the ADR every inbound status line and cross-reference
  already means. `docs/adr/0047-local-supervisor-state-authority.md` is
  renumbered to `0061` and `docs/adr/0047-governance-event-kernel.md` to
  `0062` (0060 was the prior highest number).
- **Rationale:** confirmed still live at triage time — both `0047-*`
  local-supervisor and `0047-*` governance-event-kernel files existed
  alongside `0047-model-free-advisor-preflight-v2.md`, a genuine three-way
  collision, not two. The PO ruling resolves which of the three keeps the
  number.
- **Outcome:** step 2 of the Proposal (rename + reference sweep) was executed
  by the `PHX-ADR-FIX` Goldfish dispatch (2026-08-09): `git mv` for both
  files, heading/self-reference updates, `docs/adr/README.md` table brought
  back in step, and every in-corpus inbound `ADR-0047` reference resolved to
  the correct one of the three ADRs from its own context (`docs/adr/0048-local-goldfish-supervisor.md`,
  8 references, updated to `ADR-0061`). Several inbound references live
  outside the ADR corpus (`docs/local-supervisor-state-threat-model.md`,
  `specs/sprint-nova-epic/{spec.md,plans/nova-b.md,plans/nova-b-readiness-2026-08-06.md,result.md}`)
  and were left untouched — that edit would have exceeded the `PHX-ADR-FIX`
  dispatch's scope boundary (ADR corpus + `docs/adr/README.md` + this item
  only); it is open follow-up work, tracked below. Step 3 of the Proposal (a
  Verify check against duplicate leading ADR numbers) was not part of this
  dispatch and remains open.
- **Status note:** advanced to `in_progress`, not `closed` — a `closed` status
  requires `closure_commit` to name an already-existing commit
  (`plugins/pipeline-core/scripts/reconcile-backlog-ledger.mjs`), and this
  Goldfish dispatch is forbidden from committing (`PHX-ADR-FIX` field 4). The
  Pipeline Elephant should move this item to `closed` (with closure fields
  bound to the actual landing commit) once the rename lands, or file the two
  remaining follow-ups (out-of-corpus reference sweep; duplicate-number Verify
  check) as their own items first.
- **Assignment (if accepted):** land the `PHX-ADR-FIX` diff; then either close
  this item directly (closure fields bound to that commit) or split the two
  remaining follow-ups into their own backlog items before closing.
- **Date:** 2026-08-07; triage call and execution 2026-08-09.
