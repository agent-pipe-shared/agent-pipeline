---
schema: pipeline.backlog-item.v1
id: pipeline.design-to-implementation-path-has-no-driver
type: workflow-improvement
owner: pipeline
status: open
created: 2026-08-28
sprint: nova
done_when: manual
tracking: "Nova B — PO-raised 2026-08-28: the next path complex enough to need a driver. Ranked BEHIND the push driver, for the reason stated below."
source: "PO request 2026-08-28. Scope established by reading what onboarding-init.mjs drives (project-onboarding-v3.mjs's subcommand table only) against where the design-to-implementation transition actually lives (pipeline-state.mjs)."
---

# The design → implementation path has no driver either

## Confirming the scope question

The guided driver covers onboarding and nothing else. The design → implementation
transition — `submit-plan`, `approve-plan`, `set-phase --phase implementation`, and the
dispatch that follows — lives in `pipeline-state.mjs` and is walked by hand, one command
per turn, with the agent re-deriving from the handover each time which step is next.

## Why this one is ranked behind the push driver

Both are worth doing, and the push path goes first:

- **Frequency.** Onboarding happens once per project. The design → implementation
  transition happens once per feature. A push happens many times per feature. The same
  driver saves the most where it is walked most.
- **Cost per occurrence.** The push path's cost includes a human passphrase entry against
  an external key; getting its sequencing wrong burns that. This path's steps are cheap to
  retry.
- **Clarity of the stop.** The push path has exactly one irreducibly human act and it is
  precisely identified. This path's human decision — plan approval — is a judgement about
  content, and where exactly it belongs is a design question this item has not answered.

## The open design question, stated rather than assumed

For onboarding, "what does the human genuinely decide" had a clean answer: consent and
identity, the project description, the design answers, and the acknowledgement. Here it is
less clear. Approving a plan is a judgement about whether the plan is right, which is not
a value a driver can collect and pass along — it is a read of a document.

The onboarding chain already solved a version of this: `collectPrdAcknowledgementAction()`
publishes an ask carrying no `input` at all, naming the PRD and spec by path and sha256,
stating that the PO adds the marker themselves and that no command writes it on their
behalf. That is the shape to reuse — but whether plan approval decomposes into one such
stop or several is not established, and this item does not pretend to know.

## Direction

1. First establish, by driving the path against a real feature and counting, where the
   turns actually go. The onboarding work was only possible because the smoke measurement
   said 4 human rounds and 25 chained commands rather than "it feels slow". Do that first
   here; do not design from memory of the friction.
2. Then decide which stops are genuine decisions and which are sequencing, and give the
   sequencing ones a `nextAction`.
3. Reuse the existing driver loop. Never a second driver with a second stop convention.

## Acceptance criteria

- A measurement exists, taken against a real feature, of how many human turns and how many
  agent commands the path costs today.
- Every step identified as sequencing rather than decision publishes a `nextAction`.
- Every remaining stop is a genuine human decision, and each one states what the human is
  deciding, naming the artifacts by path and digest.
- No approval becomes satisfiable by an agent on the human's behalf.

## Related

- `2026-08-28-the-push-path-has-no-driver-so-its-five-layers-are-walked-by-hand.md` — the
  same work on the path that is walked more often; do that one first.
- `2026-08-28-onboarding-needs-one-guided-init-instead-of-a-turn-by-turn-state-machine.md`
  — the pattern, and the measurement discipline this item borrows.
- `2026-08-28-the-guided-init-asks-the-po-four-times-where-three-is-the-floor.md` — how the
  "which stops are genuine" question was answered for onboarding.
