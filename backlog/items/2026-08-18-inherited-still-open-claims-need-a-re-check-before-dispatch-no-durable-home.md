---
schema: pipeline.backlog-item.v1
id: pipeline.inherited-still-open-claims-need-a-re-check-before-dispatch-no-durable-home
type: workflow-improvement
owner: pipeline
status: closed
created: 2026-08-18
closed_at: 2026-08-19
closure_repository: self
closure_commit: 9ae28dad3f6c9c41833e7d629fa3d1d73872d2a2
closure_evidence: backlog/items/2026-08-18-inherited-still-open-claims-need-a-re-check-before-dispatch-no-durable-home.md
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

## Closure, 2026-08-19 (verified live against current code, not against status text)

Confirmed resolved in code by an independent, code-first verification pass
(Workflow task wdyd7rk9g, 2026-08-19) run in response to a PO directive to
actively check every open backlog item against current code rather than
trusting frontmatter status. The item's own frontmatter/Triage text had not
been updated to reflect the landed fix; this closure catches that drift.

CLAUDE.md (repo root, Hard Rules section, line 24) now contains the exact rule verbatim: '**Re-verify an inherited "still open"/"still needed" claim before dispatching work on it.** Before briefing a dispatch to address a backlog item or piece of work characterized as "still open" by an earlier survey, session, or another agent's report, re-read that item's own current Triage/status text and check `git log` for the area — trusting the inherited characterization without a fresh live check produced three separate stale-claim incidents in one 2026-08-18 session block (methodological, not one-off).' This is precisely the rule the item's Proposal called for and precisely the missing 'durable home' the item's Description says did not exist. `git show` confirms it was added by commit 96cf12d5 'docs: widen ADR-0056 conflict scope text and add three small process rules' (2026-08-18 17:10:35), which postdates the item's own creation commit 0c1924fc (2026-08-18 13:51:06) by about 3.3 hours, same day. The item's own Triage ('not yet decided — filed to preserve the finding') was never updated to reflect that the rule now has a home.
