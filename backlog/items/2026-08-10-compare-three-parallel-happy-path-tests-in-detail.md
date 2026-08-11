---
schema: pipeline.backlog-item.v1
id: pipeline.compare-three-parallel-happy-path-tests-in-detail
type: idea
owner: pipeline
status: closed
closed_at: 2026-08-12
closure_repository: self
closure_commit: 344b49620f2353749b8bb44fc0dc2889dbdc339c
closure_evidence: specs/sprint-nova-epic/evidence/backlog/2026-08-12-medium-low-triage-grouping.md
created: 2026-08-10
source: "PO instruction, 2026-08-10, mid pre-release review, explicitly deferred to a future session (\"nicht mehr heute\")."
---

# Detailed cross-comparison of three parallel greenfield happy-path tests: Claude+Pipeline, Codex+Pipeline, Claude without Pipeline

## Description

The PO ran three roughly-parallel greenfield onboarding/kickoff tests the
same day: Claude Code with Agent-Pipeline active, Codex with Agent-Pipeline
active, and a third Claude Code session with Agent-Pipeline explicitly
declined at the onboarding prompt (a "control" run). A concrete difference
already surfaced in passing: in the no-Pipeline control run, Claude started
installing a Chromium CLI unprompted, with no consent step at all — the PO's
own characterization, "nicht schlimm aber schon krass nicht mal zu fragen."

## Triggering situation

PO instruction, verbatim: "merke dir auch vor, dass wir nächstes mal die 3
tests jetzt mit claude, codex auf pipeline und dann claude ohne detailliert
abgleichen aber nicht mehr heute." Filed as a placeholder rather than
actioned, per that same instruction.

## Affected artifact

None yet — this is a cross-session forensic/comparison exercise, not a code
change. Likely touches whichever transcript-mining method the pipeline
settles on (see the related, still-open
`backlog/items/2026-08-07-...` durable-transcript-mining item if one exists)
and could surface findings against onboarding, guard, or governance behavior
in either mode.

## Proposal

Not designed yet. At minimum: pull the three session transcripts, compare
side by side on (a) what got asked vs. assumed, (b) what got installed/
written without consent, (c) how much unprompted scope crept in the
no-Pipeline run relative to the two governed runs, (d) turn/token cost
difference. The unprompted-install observation is the concrete lead worth
starting from.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** Closed — the PO states this comparison is already done.
- **Rationale:** PO, 2026-08-12: "ist erledigt close."
- **Assignment:** n/a.
- **Date:** 2026-08-12
