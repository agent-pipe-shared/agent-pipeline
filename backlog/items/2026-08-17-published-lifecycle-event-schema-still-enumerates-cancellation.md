---
schema: pipeline.backlog-item.v1
id: pipeline.published-lifecycle-event-schema-still-enumerates-cancellation
type: defect
owner: pipeline
status: closed
created: 2026-08-17
source: "PHX-WP-LAC08 dispatch report (commit 20014aab), Elephant checkpoint docs/state.md 2026-08-17"
---

# Published lifecycle-event schema still enumerates the removed `cancellation` kind

## Description

PHX-WP-LAC08 (2026-08-17, commit `20014aab`) removed the undistinguishable
`cancellation` lifecycle-event `kind` from both hand-duplicated `KINDS` Sets
(`plugins/pipeline-core/lib/lifecycle-governance-events.mjs`,
`plugins/pipeline-core/lib/governance-replay-view.mjs`) and from the
renderer's `KIND_RECORD_CLASS` map, closing L-AC-08. The dispatch's own
context files did not include a THIRD hand-duplicated copy of the same kind
vocabulary: `governance/schemas/lifecycle-governance-event.schema.json:11`'s
published `kind` enum still lists `"cancellation"`. The dispatch correctly
flagged this as out of its briefed scope rather than silently touching it.

## Triggering situation

PHX-WP-LAC08's final report, open item (b): "governance/schemas/lifecycle-governance-event.schema.json:11
still enumerates `cancellation` — a third, hand-duplicated copy... Not in
field 2, and not among field 4's different-vocabulary exclusions, so I left
it untouched rather than burst scope... Needs a follow-up dispatch."
Independently confirmed by the Elephant (`grep -n "cancellation"
governance/schemas/lifecycle-governance-event.schema.json` → line 11).

## Affected artifact

`governance/schemas/lifecycle-governance-event.schema.json` (the published
`kind` enum). Currently referenced only by `specs/sprint-phoenix-epic/spec.md:434`
— no code or test reads this schema file today, so nothing is broken at
runtime; the published contract simply permits a value the validator now
rejects, which is a drift a future consumer of the published schema could be
misled by.

## Proposal

A small, mechanical follow-up: drop `"cancellation"` from this schema's
`kind` enum to match `lifecycle-governance-events.mjs`'s `KINDS` Set (the
canonical source), and consider whether this third hand-duplicated copy
should instead be generated from the code's own `KINDS` Set to prevent this
exact drift from recurring a fourth time.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accept and fix
- **Rationale:** matches canonical KINDS Set in lifecycle-governance-events.mjs; no code or test reads this schema file today so this is zero runtime risk, pure published-contract drift correction
- **Assignment (if accepted):** this dispatch (PHX-WP-LAC08-CANCELFIX)
- **Date:** 2026-08-18
- **Closure commit:** da72aacf
