---
schema: pipeline.backlog-item.v1
id: pipeline.prd-spec-depth-collapses-relative-to-design-input
type: defect
owner: pipeline
status: open
created: 2026-08-10
source: "PO live observation during two greenfield kickoff test sessions on 2026-08-10 (Claude Code test project `Rune-Test1-Claude-054-44`, and two Codex rollout sessions under `~/.codex/sessions/2026/08/10/`, both still in progress at the time this item was filed). The PO states this is not new: the same pattern has been visible across roughly the last 10 kickoff/planning tests and, separately, across effectively all Pipeline GitHub Issues to date (bound PRD/Spec consistently thinner than the Issue that originated the same scope of work)."
---

# PRD/Spec depth tracks whatever input happened to arrive, instead of being driven to completeness by dialogue before the Spec is written

## Description

Two live greenfield kickoff tests running today produced a PRD and Spec that
the PO judged much flatter than the design input actually given during
kickoff — material detail was visibly lost. The PO states this is a
consistent pattern across roughly the last 10 kickoff/planning tests, and
separately across effectively all Pipeline GitHub Issues to date: whenever an
Issue is the richer source, the bound PRD/Spec derived from it comes out
noticeably thinner than the Issue itself. This is not a one-off and not
specific to today's two sessions.

The PO's framing reaches past "faithfully capture whatever input volume
happened to arrive": even when the initial input is small, it is the design
phase's job to run an actual dialogue with the user until the PRD is
comprehensive — asking follow-up questions, surfacing gaps, drawing out
scope/edge cases/acceptance criteria the user did not spontaneously state —
and only once that PRD is comprehensive should the Spec be written from it.
Read this way, the defect is not primarily about a lossy capture/summary step
(`design-input.md`, the resume-hint card) dropping detail that was already
given. It is that the design phase does not treat "comprehensive PRD via
dialogue" as its own gated objective, independent of input volume, before
Spec authoring starts. A rich input getting flattened and a thin input never
being expanded through dialogue are the same underlying gap: nothing in the
flow requires the PRD to reach a completeness bar before the Spec begins.

## Triggering situation

Live PO observation mid-session on 2026-08-10, made while two independent
greenfield kickoff tests (one Claude Code, one Codex, the Codex one spanning
a restart) were still running and being forensically reviewed for other
kickoff-parameter and turn-waste issues. The PO explicitly asked for this to
be filed as its own backlog item, separately from the other findings from the
same test round, then immediately followed up to state the pattern is not
new to today: it recurs across roughly the last 10 kickoff/planning tests and
across essentially all Pipeline GitHub Issues, and added the PRD-completeness-
via-dialogue framing above as the required content of this item, not an
optional elaboration.

## Affected artifact

`plugins/pipeline-core/skills/pipeline-start/references/kickoff-design.md` —
specifically the existing instructions "Preserve the user's specificity;
never collapse a detailed design into the initial one-line goal" and "For
material input, replace the bootstrap placeholders with a useful PRD and
Spec before a normal plan gate" (the PRD/Spec content-coverage paragraph).
Both already exist and already state the intent the PO is describing; the
live tests show the outcome regardless. Possibly also relevant: the
`design-input.md` structured-extraction capture (same file, "source
evidence, not an unbounded conversation dump") and the separately-raised
resume-hint card bounds (`resume-hint.mjs`, 4/4/3-entry short-string arrays)
— the PO also called the resume-hint card "too shallow" in the same
conversation, which may share a root cause with this item (a systemic bias
toward compact capture over faithful coverage) rather than being a
coincidence. Not yet filed as its own item; note the possible link here for
whoever triages this.

## Proposal

No fix designed yet. Filed as a live observation pending the completion of
the two in-progress test sessions and their forensic transcript analysis,
which should surface concrete before/after examples (specific stated input
that a specific PRD/Spec section dropped, and cases where the PRD moved
straight to Spec without any follow-up question at all). Candidate
directions, per the PO's dialogue-driven framing above:

- Make PRD completeness its own explicit gate ahead of Spec authoring: the
  design phase asks follow-up questions against a fixed coverage checklist
  (problem/users, outcomes, success measures, scope/non-goals, testable
  acceptance criteria, assumptions/risks/open questions, user-flow decisions
  — the categories `kickoff-design.md` already names for the PRD) until each
  is actually answered or explicitly marked out of scope, rather than moving
  to Spec once *a* PRD document exists.
- Treat a short initial goal as a prompt to ask more, not as a signal that
  little PRD content is warranted — the current flow has no such prompt.
- Only after that: revisit whether the "distilled, never a transcript"
  capture policies (`design-input.md`, the resume-hint card) are additionally
  too lossy on top of the dialogue gap, since a shallow PRD makes those
  captures look shallow too even if they faithfully reflect a PRD dialogue
  that itself never went deep enough.

## Triage (filled in by the Elephant of the next Pipeline session)
