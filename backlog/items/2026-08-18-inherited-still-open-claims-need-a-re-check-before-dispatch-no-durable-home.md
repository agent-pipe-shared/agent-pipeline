---
schema: pipeline.backlog-item.v1
id: pipeline.inherited-still-open-claims-need-a-re-check-before-dispatch-no-durable-home
type: workflow-improvement
owner: pipeline
status: open
created: 2026-08-18
source: "Incremental handover-rotation extraction pass (ADR-0066 Decision 6/7), 2026-08-18, second rotation batch ('Correction logged for the record (methodological, not just this session's)' entry). Finding surfaced by a read-only research fork."
---

# A methodological rule ("re-verify an inherited 'still open'/'still needed' claim against current backlog Triage/status and `git log` before dispatching work on it") has no permanent home

## Description

`docs/state.md`'s second rotation batch records three separate stale-claim
incidents in the same session block, each traced to trusting an earlier
survey's "still open"/"still needed" characterization of a backlog item or
piece of work without re-checking the item's own current Triage/status
text and `git log` first. The session's own text frames this as
methodological, not one-off ("methodological, not just this session's"),
but no repo-committed artifact states the rule.

## Triggering situation

Incremental extraction pass over `docs/state.md`'s second rotation batch
before that content is archived (ADR-0066 Decision 6/7). Checked
`CLAUDE.md` and `docs/operating-model.md` for this rule — no match.

## Affected artifact

`CLAUDE.md` (a candidate Hard Rule, alongside the existing dispatch-
discipline rules) or `docs/operating-model.md` §7 (feedback loop) — not yet
decided which is the better home.

## Proposal

Not yet designed in detail. Likely a short, cheap addition: before
dispatching work to address a "still open"/"still needed" claim inherited
from an earlier survey, session, or another agent's report, re-read the
named backlog item's own current Triage/status and check `git log` for
that area rather than trusting the inherited characterization.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** not yet decided — filed to preserve the finding.
- **Rationale:** cheap, low-risk addition once someone decides the right
  home (CLAUDE.md Hard Rule vs. operating-model process section); not
  something to add ad hoc mid an unrelated rotation pass.
- **Date:** 2026-08-18
