---
schema: pipeline.backlog-item.v1
id: pipeline.correction-critic-reuses-the-full-review-context
type: improvement
owner: pipeline
status: open
created: 2026-10-12
source: "PO request 2026-10-12 (Claude × native Windows × own repo), after the T10 design review: a delta review on a two-file diff took about 15 minutes after a full review of the same object."
done_when: manual
---

# Correction Critic reuses the full review's context

## Description

Every Critic review, including a correction or delta review on a small diff, starts as a fresh-context
dispatch. A delta reviewer must rebuild the whole context the full reviewer already held: the spec,
guardrails, evidence artifacts and the source reconstruction under the correction-input procedure. Each
dispatch also pays the bootstrap-receipt detour and the refused-notes path. Observed 2026-10-12: the T10
delta design review of two files ran about 15 minutes at max effort.

The PO asks whether the delta or correction review can be performed by the same Critic that did the full
review, keeping its context. This applies to design reviews (ADR-0085) and to implementation correction
reviews (one full plus at most three correction-diff reviews).

## Tension to resolve

The current contract makes fresh context deliberate. A Critic sees no prior verdict, no implementer
narrative and no history (`roles/critic.md`, `templates/prompts/critic-review.md` reference boundary), so a
correction review is not anchored by the earlier verdict. Reusing the full reviewer keeps its own prior
judgement in context. That changes the independence guarantee and must be decided explicitly, not slipped
in as a performance fix.

## Options

1. Resume the same Critic for correction rounds; the resumed reviewer sees its own prior report but still
   no implementer prose. Fastest; weakest independence.
2. Keep fresh correction reviewers, but hand them a source-owned, verdict-free context pack (resolved
   references, reconstructed source diff, guard-admitted command forms) so they skip rediscovery.
3. Keep the current model, and cut fixed costs only: bootstrap-receipt detour
   (`pipeline.every-dispatch-pays-a-bootstrap-receipt-detour`), notes writer
   (`pipeline.critic-scratch-notes-write-is-refused-again`), early checkpoint
   (`pipeline.budget-checkpoint-fires-below-the-briefed-cap`), and a lower effort tier for small deltas.

## Acceptance

- A decision (ADR) records which option applies to design and implementation correction reviews, and its
  effect on reviewer independence.
- The chosen route is shipped in the Pipeline (contract, template and enforcement), not only in one
  repository.
- A measured before/after comparison of a delta review's duration and tool calls on the same kind of
  object.

## Scheduling

After Alfred. Not part of the Alfred delivery scope; must not change the approved Alfred design.
