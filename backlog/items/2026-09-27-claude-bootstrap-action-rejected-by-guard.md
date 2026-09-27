---
schema: pipeline.backlog-item.v1
id: pipeline.claude-bootstrap-action-rejected-by-guard
type: defect
owner: pipeline
status: open
created: 2026-09-27
source: "Claude/Windows greenfield review F-01, 2026-09-27; source inspection of project-onboarding-v3 and onboarding-argv-shapes confirmed the emitted/admitted argv mismatch."
sprint: alfred
done_when: manual
---

# Claude bootstrap acknowledgement action is rejected by its lifecycle guard

## Description

In `bootstrap-binding-required`, inspection emits `bootstrap-acknowledge-plan`
with `--runner claude --intent session`. The mutating argv shape for that
subcommand allows only `--root` and `--activate`. The Claude/Windows consumer
reports `GUARD-LIFECYCLE-NOT-READY` for the exact returned action and cannot
finish onboarding. Source inspection confirms the producer/guard mismatch;
the live refusal is reported by the consumer.

## Affected artifact

`lib/project-onboarding-v3.mjs`, `lib/onboarding-argv-shapes.mjs`,
`hooks/guard-lifecycle-ready.mjs`, and onboarding action-closure tests.

## Proposal

Render every mutating `nextAction` through the shared argv declaration or
extend the declaration to include the intended flags. Check the emitted action
through the actual guard at every onboarding phase, including signature mode.
The guard's recovery must not send the caller back to the same refused action.

## Acceptance

- A real fresh Claude/Windows signature-mode project can execute the emitted
  acknowledgement plan and reach the next phase.
- A phase sweep proves every emitted mutating action is admitted with its exact
  argv and refuses altered/extra flags.
- A repeated refusal yields a distinct, executable recovery rather than a loop.

## Triage

