---
schema: pipeline.backlog-item.v1
id: pipeline.adr-0047-numbering-collision
type: defect
owner: pipeline
status: closed
created: 2026-08-07
source: "specs/sprint-nova-epic/plans/nova-b-readiness-2026-08-06.md (lines 55-69), promoted from a plan-only note to a backlog item per the 0.5.2 Critic round's F2 finding, 2026-08-07."
due: 2026-09-06
expires: 2026-09-06
closed_at: 2026-08-09
closure_repository: self
closure_commit: 88a7133caa851ba740349bafce912ddd6552b895
closure_evidence: "backlog/items/2026-08-07-adr-0047-numbering-collision.md"
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
- **Status note:** closed 2026-08-09, closure bound to commit `88a7133`
  ("fix(adr): give the three ADRs numbered 0047 real numbers, and move two
  records to the code"), which landed the `PHX-ADR-FIX` rename and reference
  sweep this item's Proposal step 2 called for. This closure does NOT assert
  that Proposal step 3 (a Verify check against duplicate leading ADR numbers)
  is done — it is not: it is being built in parallel as
  `harness/scripts/check-adr-consistency.mjs` and has not landed as of this
  closure. The Assignment note below (written 2026-08-07) offered a choice —
  close directly, or split the two remaining follow-ups into their own items
  first — rather than gating closure on step 3; this closure takes that
  offered path and files the out-of-corpus reference sweep as its own item,
  `2026-08-09-adr-0047-renumber-left-live-references-behind.md`, per
  `88a7133`'s own commit message naming exactly what it deliberately did not
  repair (Nova sprint historical references, the hash-bound Phoenix Spec
  reference, and German reference-table drift). The duplicate-number Verify
  check (step 3) is tracked separately by its own in-flight build and is not
  re-filed here to avoid a duplicate.
- **Assignment (if accepted):** land the `PHX-ADR-FIX` diff; then either close
  this item directly (closure fields bound to that commit) or split the two
  remaining follow-ups into their own backlog items before closing.
- **Date:** 2026-08-07; triage call and execution 2026-08-09; closed 2026-08-09.

### Nova checkout's own triage, 2026-08-11 (deferral, made independently of the Phoenix-side closure above)

- **Decision:** deferred in the Nova checkout — owned by the Phoenix sprint.
- **Rationale:** PO decision, 2026-08-11: "das wird vom phoenix sprint
  nachhaltig gefixt - hier ignorieren" (this gets fixed sustainably by the
  Phoenix sprint — ignore it here). Not a Nova A/B scope item; no Nova
  session should renumber either ADR or sweep references, to avoid
  colliding with whatever Phoenix's own resolution does. Consistent with the
  Phoenix-side closure above, which had already landed the actual renumbering
  two days earlier (2026-08-09) — Nova correctly stayed out of it.
- **Assignment (if accepted):** n/a — tracked in the Phoenix sprint, not Nova.
- **Date:** 2026-08-11

#### PO re-confirmation, 2026-08-18

Re-asked as part of the 20-item decision batch. PO confirmed: "A — reine
Bestätigung, dass die alte Anweisung noch gilt" (pure confirmation that
the old instruction still stands). No Nova action; stays with Phoenix.
- **Date:** 2026-08-18
