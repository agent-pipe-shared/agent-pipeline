---
schema: pipeline.backlog-item.v1
id: pipeline.critic-skip-not-an-explicit-logged-decision
type: workflow-improvement
owner: pipeline
status: open
created: 2026-08-29
sprint: nova
done_when: contains harness/review-protocol.md pipeline.critic-skip-decision-logged
source: "Claude/Windows self-audit report (docs/pipeline-audit-claude-session.md §3.1, §10.6), cited by scratch/greenfield-triage-2026-08-29.md finding F16, observed during the 2026-08-29 three-runner greenfield test."
---

# No Critic evidence anywhere in the run that shipped code — a skip is indistinguishable from "not required"

## What happened

The one 2026-08-29 greenfield run that actually shipped code produced zero
Critic artifacts anywhere in its repository. From the outside, a repository
with no Critic evidence is indistinguishable between two very different
situations: "the risk tier genuinely did not require a Critic review" and
"a Critic review was required and simply never happened." Nothing in the
current design forces that distinction to be recorded.

## Where it is

- `harness/review-protocol.md` §2.1 defines the trigger matrix (which risk
  classes require a Critic) and §4 the escalation ladder, but neither section
  requires a POSITIVE, logged record of the decision not to dispatch a
  Critic when the matrix says one is not required — the absence of evidence
  is currently silent by default rather than an explicit, checkable "skip"
  record.
- `roles/critic.md` and `templates/prompts/critic-review.md` define what a
  Critic dispatch produces when one happens, but there is no sibling
  artifact type for "a Critic was considered and explicitly not dispatched,
  and here is why."
- No script under `plugins/pipeline-core/scripts/` was found (grepped for
  `critic-skip`/`criticSkip`/`skipCriticReason`) that checks for or emits
  such a record — confirmed absent, not merely unexamined.

## Proposal

Add an explicit "Critic skip" decision artifact: when the escalation-ladder
trigger matrix (`harness/review-protocol.md` §2.1) evaluates a piece of work
as NOT requiring a Critic, require that determination to be logged
somewhere checkable (e.g. a line in the dispatch record, or a small ledger
entry) rather than simply producing no Critic evidence. A repository with
zero Critic artifacts should then be checkable as either "N skip decisions
logged, 0 Critic reviews needed" or "Critic evidence expected but missing" —
never an unlabeled blank. Add a marker
`pipeline.critic-skip-decision-logged` at the point this lands in
`harness/review-protocol.md`.

## Acceptance

- The trigger-matrix evaluation path (wherever it lives after this change)
  produces a record for every dispatch decision, whether it results in a
  Critic dispatch or an explicit skip.
- A check can distinguish, from repository state alone, "zero Critic
  artifacts because zero were ever required" from "zero Critic artifacts
  despite N required" — the second case is a finding, the first is not.
- Existing dispatches that legitimately never needed a Critic (stage-0,
  light-profile work) are not retroactively flagged once this lands; the
  requirement is forward-looking.

## Progress note

Fixed, 2026-08-29 (dispatch NVA-R21-CRITICSKIP): added an optional
`criticSkip` field to the dispatch-record shape, the marker
`pipeline.critic-skip-decision-logged` in `harness/review-protocol.md`
§2.1, and `plugins/pipeline-core/lib/critic-skip-decision.mjs` (pure,
tested coverage-evaluation functions, not wired into a Verify suite —
that wiring is disclosed as a smaller follow-up). Left `status: open`
and `done_when` untouched for the Elephant to verify and close.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted
- **Rationale:** Directly observed in the one run that shipped code — a
  concrete instance of the exact ambiguity this item names, not a
  hypothetical.
- **Assignment:** `sprint: nova`, Nova B — a quality-gate hardening, not a
  happy-path blocker; does not block the 0.6.0 candidate.
- **Date:** 2026-08-29
