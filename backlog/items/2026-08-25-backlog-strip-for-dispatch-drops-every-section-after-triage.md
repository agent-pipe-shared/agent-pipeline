---
schema: pipeline.backlog-item.v1
id: pipeline.backlog-strip-for-dispatch-drops-every-section-after-triage
type: defect
owner: pipeline
status: closed
closed_at: 2026-09-01
closure_commit: 6da6d03a551b3ed649dcff098858e32ea9d3cbc3
closure_repository: "self"
closure_evidence: plugins/pipeline-core/lib/backlog-dispatch-reference.test.mjs
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

## Closed, 2026-09-01 — fixed on the day it was filed, never closed

Commit `6da6d03a` (2026-08-25 22:46, `AGY-SWEEP-backlog-strip-for-dispatch`)
implements exactly this item's Proposal: `stripBacklogVerdictProse` removes each
verdict-shaped heading's own bounded section, up to the next same-or-shallower
heading, instead of everything from the first verdict heading to end-of-file. A
later differently-named PO-decision section survives; a later section that is
itself verdict-shaped is still removed. It additionally guards against a
`#`-prefixed line inside a fenced code block being read as a section boundary —
a case this item did not anticipate.

Verified live before closing, not taken from the commit message: stripping
`backlog/items/2026-08-21-enforce-kickoff-po-questions.md` — the exact item this
defect was reproduced against — now preserves every `##` section after Triage,
with only the Triage body replaced by the `SPEC-REFERENCE-STRIPPED-TRIAGE`
marker. `node --test plugins/pipeline-core/lib/backlog-dispatch-reference.test.mjs`
passes 12/12, including a case explicitly named for this regression.

**How this stayed open for a week, recorded because the failure is the
interesting part.** The fix landed hours after the Triage deferred the item, in
a sweep dispatch that did not close what it fixed. Nothing then reconciled the
two. On 2026-09-01 an Elephant re-read this item's own current text — which
still said `open` and `deferred` — and briefed a dispatch against it. The
dispatch stopped correctly on a briefing-vs-repo contradiction and cost a full
run to discover what one `git log` on the affected file would have shown in
seconds.

The re-verification rule in `CLAUDE.md` names both halves: re-read the item's
own current status **and** check `git log` for the area. The item text was
checked and the log was not. Half the rule is not the rule — this is a concrete
instance of `pipeline.resolved-backlog-items-can-keep-status-open-indefinitely`,
which is a live open item and now has a third confirmed occurrence.
