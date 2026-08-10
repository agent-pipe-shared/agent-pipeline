---
schema: pipeline.backlog-item.v1
id: pipeline.prd-spec-depth-collapses-relative-to-design-input
type: defect
owner: pipeline
status: open
created: 2026-08-10
source: "PO live observation during two greenfield kickoff test sessions on 2026-08-10 (Claude Code test project `Rune-Test1-Claude-054-44`, and two Codex rollout sessions under `~/.codex/sessions/2026/08/10/`, both still in progress at the time this item was filed), reinforced by a standing, independently-noticed pattern from unrelated prior work: bound PRD/Spec documents come out consistently thinner than the GitHub Issues that originate the same scope of work."
---

# PRD/Spec documents collapse far more of the design input than the existing "never collapse" instruction intends

## Description

Two live greenfield kickoff tests running today produced a PRD and Spec that
the PO judged much flatter than the design input actually given during
kickoff — material detail was visibly lost. The PO separately reports this is
not a one-off: the same collapse pattern shows up whenever a GitHub Issue
(richer, more detailed) is the source and a pipeline PRD/Spec is derived from
it — the bound plan/spec ends up noticeably thinner than its own source
material. This suggests the existing anti-collapse instruction in the kickoff
flow is not effective in practice, not just under-applied in one test run.

## Triggering situation

Live PO observation mid-session on 2026-08-10, made while two independent
greenfield kickoff tests (one Claude Code, one Codex, the Codex one spanning
a restart) were still running and being forensically reviewed for other
kickoff-parameter and turn-waste issues. The PO explicitly asked for this to
be filed as its own backlog item, separately from the other findings from the
same test round.

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

No fix proposed yet. Filed as a live observation pending the completion of
the two in-progress test sessions and their forensic transcript analysis,
which should surface concrete before/after examples (specific stated input
that a specific PRD/Spec section dropped). Candidate directions once that
evidence exists: an explicit minimum-coverage self-check in the kickoff flow
(e.g. cross-referencing `design-input.md`'s section list against the
resulting PRD/Spec section list before presenting a planning result instead
of only after the fact), a worked "how much detail is enough" example added
to `kickoff-design.md`, or revisiting whether "distilled, never a transcript"
capture policies (both `design-input.md` and the resume-hint card) are
structurally too lossy for how much design input PO sessions actually
produce.

## Triage (filled in by the Elephant of the next Pipeline session)
