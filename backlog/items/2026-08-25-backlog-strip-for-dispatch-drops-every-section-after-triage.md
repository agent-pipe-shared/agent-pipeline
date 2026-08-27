---
schema: pipeline.backlog-item.v1
id: pipeline.backlog-strip-for-dispatch-drops-every-section-after-triage
type: defect
owner: pipeline
status: open
created: 2026-08-25
sprint: alfred
source: "Confirmed twice in one session, 2026-08-25: AGY-KICKOFFPOQ-1's own completion report (Deviations #1) and directly reproduced by the Elephant while preparing this item's own follow-up dispatch"
---

# `backlog-item-strip-for-dispatch.mjs` drops every section after the FIRST `## Triage` heading, not just verdict-shaped content

## Description

`backlog-item-strip-for-dispatch.mjs` is meant to remove verdict-shaped
Triage content (a prior human/Critic decision framed as spec content) before
handing a backlog item to a dispatched agent as context — per its own stated
purpose and the "circular measuring stick" incident it exists to prevent.
In practice it strips everything from the FIRST `## Triage` heading through
the end of the file, including later, unrelated `##` sections appended
after it — e.g. `## Design direction decided`, `## Mode decided`, `##
Option picked`, `## Scope widened` on
`2026-08-21-enforce-kickoff-po-questions.md`. None of those are
verdict-shaped hunt-list/expected-outcome content; they are the item's own
accepted scope and PO decisions — exactly the material a dispatch needs to
know what to build.

## Triggering situation

- AGY-KICKOFFPOQ-1's own completion report (2026-08-25, Deviations #1)
  found the stripped file ending at a `SPEC-REFERENCE-STRIPPED-TRIAGE`
  marker, missing the "Design direction decided" and "Mode decided"
  sections that existed below `## Triage` in the raw item. It proceeded
  only because the raw item and the briefing's own Goal field
  independently agreed — and flagged that a future case might not have two
  agreeing sources.
- Reproduced directly: stripping the SAME item again after two more `##`
  sections were appended below `## Triage` (`Option picked`, `Scope
  widened`) shows only `Description`/`Triggering situation`/`Affected
  artifact`/`Proposal` survive — all decision content is gone.

## Affected artifact

`plugins/pipeline-core/scripts/backlog-item-strip-for-dispatch.mjs`.

## Proposal

Strip only the `## Triage` section's own body (up to the NEXT `##`
heading), not everything from `## Triage` to end-of-file — mirroring how
`docs/state.md`'s own section-boundary parsing elsewhere in this repo
already stops at the next heading rather than at end-of-file. Any
later-appended decision section (however named) should survive stripping
by default; if a future decision section is itself verdict-shaped and
needs stripping too, that should be an explicit, separately named
exclusion, not a side effect of appearing after `## Triage` in file order.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** deferred
- **Rationale:** confirmed real, but the immediate dispatch that surfaced
  it a second time works around it by citing the raw item paths directly
  in the briefing's Context files field instead of the stripped copy — not
  blocking. Worth a small fix on its own later.
- **Assignment (if accepted):** unscheduled.
- **Date:** 2026-08-25
