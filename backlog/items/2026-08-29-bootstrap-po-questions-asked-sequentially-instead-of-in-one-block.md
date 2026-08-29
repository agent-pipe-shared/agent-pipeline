---
schema: pipeline.backlog-item.v1
id: pipeline.bootstrap-po-questions-asked-sequentially-instead-of-in-one-block
type: workflow-improvement
owner: pipeline
status: open
created: 2026-08-29
sprint: nova
done_when: manual
source: "PO observation during the 2026-08-29 three-runner greenfield test (finding F26 of scratch/greenfield-triage-2026-08-29.md)."
---

# The Claude/Windows runner asked 5–6 PO bootstrap questions one at a time instead of in a single block

## What happened

During onboarding, the Claude runner asked the PO five to six questions in
sequence — one, wait for an answer, ask the next — rather than presenting
them together as one bundled round. This is a behavioural/UX observation
directly from the PO, not a reproduced code defect.

## Where it is

This is a behavioural finding, not a located defect — no single code
location produces it, and this dispatch's reading confirms the instruction
that governs the behaviour already asks for the opposite of what happened,
which is itself the interesting part:

- `plugins/pipeline-core/skills/pipeline-start/references/kickoff-design.md`
  (around the "Bootstrap questions are answered before any artifact is
  written" passage) already instructs: "Ask it together with the goal and
  profile below, before the first artifact is drafted, in plain language".
  This is prose guidance, not a mechanically enforced batching.
- A genuinely mechanical, one-shot enforcement DOES exist, but for a
  different, later stage: `intake-generate-design.md` documents
  `intake-design-questions-apply --answers-json <JSON array of {question,
  answer}> --activate` as "exactly ONE bundled round; a second round with
  different answers is refused" — the *design-questions* stage of intake is
  structurally forced to be one round by the CLI's own contract.

So the gap is specifically at the earlier **bootstrap-question** step
(language, goal, profile, git author, etc.) — the step covered only by
prose instruction in `kickoff-design.md`, not by any API shape that forces
batching the way the later design-questions stage is forced. An agent that
does not follow the prose can revert to asking one question at a time and
nothing catches it.

## Proposal

Bring the earlier bootstrap-question step under the same structural
discipline the later design-questions step already has: either (a) route it
through a `--answers-json` array shaped call analogous to
`intake-design-questions-apply`, so the CLI itself expects one bundled
payload rather than a sequence of individual answers, or (b) if no such CLI
boundary is judged practical for these particular fields (identity/auth
setup can genuinely be sequential in places), at minimum add an explicit
checklist instruction and a self-check line the agent must print before
asking anything ("all N bootstrap questions below, together, before the
first one is answered") — the same pattern `pipeline-start/SKILL.md` already
uses for its printed confirmation lines elsewhere.

## Acceptance

- The bootstrap-question step's instruction text names, explicitly, that all
  questions for that step are to be asked together in one message — this
  item is not asking for a new capability, only for closing the gap between
  what `kickoff-design.md` already says ("ask it together") and what
  happened.
- If a mechanical batching boundary (option (a) above) is chosen, a test
  demonstrates that no path lets the questions be asked one-by-one and the
  CLI accepted individually.
- If only the instruction-strengthening option (b) is chosen, the item is
  closed against a `manual` predicate with the PO's own read of a
  subsequent session's transcript as the evidence, since no code artifact
  exists to check mechanically.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment:** `sprint: nova` — Nova B work, not a 0.6.0 candidate blocker.
- **Date:**
