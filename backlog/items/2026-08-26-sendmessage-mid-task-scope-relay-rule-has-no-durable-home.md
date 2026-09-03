---
schema: pipeline.backlog-item.v1
id: pipeline.sendmessage-mid-task-scope-relay-rule-has-no-durable-home
type: workflow-improvement
owner: pipeline
status: closed
closed_at: 2026-09-03
closure_repository: self
closure_commit: 7a7428c7739afb47c9c0ad0f3898b1306889dae0
closure_evidence: plugins/pipeline-core/skills/pipeline-start/references/workflow-dispatch.md
created: 2026-08-26
sprint: alfred
source: "Handover-rotation extraction pass (ADR-0066 Decision 6/7) over docs/state.md's 2026-08-25 'Antigravity CLI 3rd Runner Integration & Hardening' section, before rotating it to archive"
done_when: contains plugins/pipeline-core/skills/pipeline-start/references/workflow-dispatch.md scope-widening PO decision
---

# The "don't relay a scope-widening PO decision to an already-running dispatch via SendMessage" rule has no durable home

## Description

The rotated 2026-08-25 handover section recorded a confirmed-correct
refusal: a mid-task `SendMessage` relaying a PO's "standardize all three"
decision to an already-running Goldfish dispatch (`AGY-CHATADAPTER-1`) was
correctly REFUSED by that dispatch, because its own field 4 never granted
write scope on the files the new decision would have touched. The
handover's own text states this as a durable operational rule ("do not try
to shortcut a scope amendment via SendMessage again; build a fresh briefing
instead"), but a search of `docs/operating-model.md` and
`plugins/pipeline-core/skills/pipeline-start/references/workflow-dispatch.md`
(the two most likely existing homes for dispatch-relay discipline) found no
existing statement of this rule anywhere.

## Proposal

Give this rule a durable home — most likely a short addition to
`workflow-dispatch.md` (which already documents several other
dispatch-relay pitfalls in the same style) or `docs/operating-model.md`'s
dispatch-briefing section — stating: a PO decision that widens or changes a
dispatch's authorized scope must not be relayed to an already-running
dispatch via `SendMessage`; if the running dispatch's briefing did not
grant the needed scope, build and send a fresh, properly-scoped briefing
instead (a new dispatch or a resume message that only adds procedural
continuation, never new authority).

## Triage

- **Decision:** open, unassigned — filed during a handover-rotation
  extraction pass, not evaluated for priority yet.

## Closure

Closed 2026-09-03 against `7a7428c7739afb47c9c0ad0f3898b1306889dae0`, which gave
the rule the durable home this item asked for: `workflow-dispatch.md:232`, under
the heading "Never relay a scope-widening PO decision to a running dispatch via
`SendMessage`" — the reference file the Proposal named as the most likely home,
in the style it named.

The item's own `done_when` predicate went from false to true when that commit
landed, and `check-backlog-done-predicate.mjs` reported it as STALE-OPEN on
2026-09-03. That is the mechanism working exactly as intended: the item's
`status:` field was wrong, and a machine caught it rather than a person
remembering. Verified by hand before closing rather than on the checker's word.
