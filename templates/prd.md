<!--
PROMPT/DOC TEMPLATE: PRD — Product Review Document (PO gate) — Agent-Pipeline
Language: English (default for the share; the PO is the primary reader — see the
project's own language policy if it differs).
Source of truth: docs/operating-model.md §3.2 (Step 3b) / §3.3 / roles/elephant.md EL-19.
Purpose: the PO release gate. Written by the Elephant AFTER the solution is designed
and the spec passed readiness, BEFORE the first implementation dispatch. Mandatory at
rigor >=1 OR risk class high; a true stage-0 fast-path (§3.3) is exempt.
Keep it to ~1 page. It carries product RATIONALE, not acceptance criteria — those live
agent-facing/English in spec.md, which this PRD references (no duplication).
Location: specs/<task>/prd_<topic>.md
Release mechanic: EL-17a — numbered inline chat summary + this file reference + readable
delivery to the PO's device/render (a repo path alone is NOT delivery) + explicit wait for
the literal word "approved" (no UI dialog; EL-19).

PO language guidance (binding for every future PRD):
- The target reader is the PO, not the agent — plain language, short sentences, in the
  project's human-facing language (default English).
- Every block answers three questions: What problem? What are we changing? What do you
  get out of it?
- Rule IDs, file paths, jargon stay OUT of the main text — only in compact, italicized
  technical lines at the end of a block or in an appendix; the Goldfish briefings carry
  the technical detail later anyway.
- For feedback-/review-driven PRDs: don't skip the "Coverage Matrix" section.
- Decision points are numbered at the end, kept separate from plain FYI items.
-->

# PRD — <Feature/Topic>

> Product Review Document (PO gate). Produced after the solution design, before
> implementation. The PO verifies and gives "approved". Acceptance criteria: see
> `spec.md` (agent-facing). Task: `<task-id>` · Rigor <0/1/2> / Class <low/medium/high>.

## What
<One paragraph: what is being built/changed — in product terms, not code. Each point
follows Problem → Change → Benefit; rule IDs/paths/jargon stay out — if unavoidable,
add them as a compact italicized technical line at the end of the paragraph instead of
in the running text.>

## Why
<Problem/benefit/trigger; how success is measured.>

## Scope
<What's in — the concrete change, ideally as a short list of affected artifacts
(file paths are fine here as list items, not in the surrounding prose).>

## Non-goals
<What is deliberately NOT done (boundary against scope creep).>

## Risks & mitigation
<The 2–4 most important risks, each with a countermeasure.>

## Alternatives considered
<Considered & rejected, each with a one-sentence rationale (solo-memory element).>

## Coverage matrix (only for feedback-/review-driven PRDs)
<Include only if the PRD builds on feedback/review — otherwise remove this section
entirely. A "your input → where in the PRD" table makes completeness checkable by the
PO instead of trust-based.>

| Input | Where in the PRD |
|---|---|
| <Keyword/quote> | <Block/section> |

## DoD (release criteria)
<How the PO recognizes "done"; reference to spec.md acceptance criteria.>

## Decision points
<Numbered and explicit "what you need to decide" — kept separate from plain FYI items.
Per point: question + recommendation (+ alternative, if any).>

1. <Decision point 1 — question, recommendation.>

<!-- Optional, WITHOUT a gate: sdp_<topic>.md (Software Development Plan) — documented
     only, not a mandatory confirmation point (enterprise reservation). -->
