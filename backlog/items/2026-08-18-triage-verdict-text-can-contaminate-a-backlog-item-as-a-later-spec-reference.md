---
schema: pipeline.backlog-item.v1
id: pipeline.triage-verdict-text-can-contaminate-a-backlog-item-as-a-later-spec-reference
type: defect
owner: pipeline
status: open
created: 2026-08-18
source: "Incremental handover-rotation extraction pass (ADR-0066 Decision 6/7), 2026-08-18, second rotation batch (2026-08-08 Nova GF-054 block). Finding surfaced by a read-only research fork."
---

# A prior Critic verdict written into a backlog item's own Triage section can contaminate that item when it is later handed to a Critic as a spec/reference

## Description

`docs/state.md`'s 2026-08-08 Nova GF-054 entry records a concrete incident:
a backlog item's Triage section had an earlier Critic verdict written into
it, and that item was later used as a reference/spec input to a subsequent
Critic dispatch — meaning the later Critic could read a prior verdict about
the very thing it was independently supposed to judge. In the observed
incident the Critic itself caught this ("circular measuring stick"),
stopped, and re-derived its finding independently from a pre-triage
revision of the item instead — but the text explicitly frames the failure
as the dispatcher's, not something to rely on the Critic catching every
time.

This is adjacent to, but distinct from, the already-codified hunt-list/
expectation-framing contamination rule
(`templates/prompts/critic-review.md` §2, and this session's own
`feedback-critic-dispatch-hunt-list-contamination` memory) — that rule
covers the DISPATCH BRIEFING text; this finding is about a REFERENCED
ARTIFACT (a backlog item) carrying prior-verdict content that biases a
later, unrelated review reading it as background.

## Triggering situation

Incremental extraction pass over `docs/state.md`'s second rotation batch
before that content is archived (ADR-0066 Decision 6/7). Checked
`templates/prompts/critic-review.md`, `guardrails/`, `CLAUDE.md`, and
`roles/critic.md` for this specific risk — found no match beyond the
adjacent hunt-list rule.

## Affected artifact

`templates/prompts/critic-review.md` (candidate location for a rule about
what a Critic should do if a referenced artifact contains a prior verdict),
possibly `backlog/README.md` (guidance on keeping a Triage section free of
review-verdict language that could later read as a spec claim).

## Proposal

Not yet designed in detail. Likely direction: either (a) a dispatch-side
rule — never hand a Critic a backlog item whose Triage contains a prior
Critic verdict without first stripping/summarizing it, or (b) a
Critic-side rule — explicitly instructed to disregard any verdict-shaped
language in a referenced artifact and derive findings independently
(closer to what already happened in the observed incident, just made
explicit rather than relying on the Critic to notice on its own).

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** not yet decided — filed to preserve the finding.
- **Rationale:** real but narrow risk (only matters when a backlog item
  with embedded verdict text is later used as Critic-dispatch background);
  the one observed incident was caught, not landed as a bad outcome — worth
  a considered fix, not an inline patch.
- **Date:** 2026-08-18
