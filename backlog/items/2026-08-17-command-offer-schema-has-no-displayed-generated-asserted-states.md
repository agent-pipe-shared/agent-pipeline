---
schema: pipeline.backlog-item.v1
id: pipeline.command-offer-schema-has-no-displayed-generated-asserted-states
type: requirement
owner: pipeline
status: open
created: 2026-08-17
source: R-AC-06 investigation (PHX-WP-RAC06, 2026-08-17), specs/sprint-phoenix-epic/evidence/acceptance-evidence-map.mjs POINTERS['R-AC-06']
---

# Command-offer schema has no representation for the displayed/generated/asserted states

## Description

R-AC-06 names six offer-response states a command offer may reach:
`displayed`, `acknowledged`, `authorized`, `copied`, `generated`, `asserted`.
`COMMAND_STATES` (`plugins/pipeline-core/lib/agent-decision-journal.mjs:28`)
is the closed vocabulary every command-offer event's `state` field validates
against. Three of the six — `acknowledged`, `authorized`, `copied` — are
real members of that set and now have a real producer
(`recordCommandUserAcknowledgement`, `external-command-offer.mjs`, commit
`ddcda3f6`). The other three — `displayed`, `generated`, `asserted` — are
not members of `COMMAND_STATES` at all, confirmed by direct read; no
reachable code path anywhere in this codebase constructs a command-offer
event carrying any of them.

This is not the same gap as the first three were: it is not a missing
producer for an existing state, it is the state itself not existing in the
schema. `offered` (the anchor state every offer starts in) is a different
concept from `displayed` — the schema's own append/duplicate discipline
(`sameOffer`, `appendValidated`) treats `offered` as the single unambiguous
starting point every later state anchors against; folding `displayed` into
`offered` would blur that anchor, and `generated`/`asserted` have no
existing analogue in the vocabulary at all.

## Triggering situation

`PHX-WP-RAC06` (2026-08-17) built the producer for `acknowledged`/
`authorized`/`copied` and, per its own explicit scope boundary, did not
extend `COMMAND_STATES`. This session (2026-08-17, continued) re-checked
`displayed`/`generated`/`asserted` directly against
`agent-decision-journal.mjs`'s `COMMAND_STATES` set and confirmed all three
remain absent, and concluded — mirroring the disposition already used for
L-AC-01, H-AC-11 O-4, and PX0-AC-13 clause 1 in this epic — that extending a
closed, independently-tested state vocabulary the same night, without a
reviewed design pass on what `displayed`/`generated`/`asserted` actually
mean operationally (a rendering event? a template-fill event? a user
utterance event?) and how each interacts with the existing
append/duplicate/anchor discipline, is not a same-session fix.

## Affected artifact

`plugins/pipeline-core/lib/agent-decision-journal.mjs` (`COMMAND_STATES`,
the closed vocabulary and its validator), `plugins/pipeline-core/lib/
external-command-offer.mjs` (the producer(s) that would append these
states), and any consumer that renders command-offer state (Evidence
Viewer, governance replay). `specs/sprint-phoenix-epic/acceptance.md`
R-AC-06.

## Proposal

Either (a) design and add `displayed`/`generated`/`asserted` to
`COMMAND_STATES` with their own anchor/transition rules (what precedes
each, what may follow, whether they compose with the existing
`offered`→`acknowledged`/`authorized`/`copied` chain or are independent
starting points) plus a producer for each, real design work with its own
review; or (b) accept that R-AC-06 as originally worded covers a broader
offer-interaction surface than this schema currently models, and scope the
acceptance text to the three states the architecture actually
distinguishes (`acknowledged`/`authorized`/`copied`, now producible) via an
acceptance.md amendment, tracking the remaining three as a named future
increment. Either path needs a dedicated design pass first — not a
same-night schema extension (mirrors the L-AC-01/H-AC-11/PX0-AC-13
disposition class already used in this epic).

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** deferred
- **Rationale:** genuine schema-design work (new state vocabulary members,
  their transition rules, and their producer) with no existing operational
  definition to build against; not safely attemptable as a same-session
  extension without a reviewed design doc, the same standard already
  applied to L-AC-01/H-AC-11/PX0-AC-13 in this epic.
- **Assignment (if accepted):** a future increment, outside Sprint
  Phoenix's current close-out window; owner `pipeline`, no expiry set
  (R-AC-06 stays formally scoped to its three producible states in the
  meantime, per the acceptance.md amendment this item is referenced from).
- **Date:** 2026-08-17
