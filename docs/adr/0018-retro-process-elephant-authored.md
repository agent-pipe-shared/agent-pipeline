# ADR-0018: Elephant-Authored Close Retro

## Status

Accepted on 2026-07-04.

## Context

Routinely asking the operator what the pipeline should improve transfers a recurring process duty away from the orchestrator that observed the work. Removing the ritual question must not make the retrospective optional or silent.

## Decision

At session close, the Elephant authors the retrospective itself. It produces exactly one explicit outcome:

- concrete, actionable improvement items with a durable handoff to the continuous-improvement process; or
- an explicit statement that no improvement item was found.

The retrospective must never be silently omitted. The operator may contribute observations at any time, but the pipeline does not require a ritual prompt to obtain them.

The retrospective records evidence and scope without copying private conversation or unrelated session history into shared artifacts. A requested change in another repository follows the repository-boundary contract rather than granting cross-repository write authority.

## Consequences

The continuous-improvement loop remains explicit without burdening the operator with a recurring ceremony.

The same orchestrator reviews its own work, which creates a blind spot. An explicit `nothing found` result prevents silent omission but does not prove that no issue exists; high-risk work may still require independent review of the close evidence.

## Rejected Alternatives

- Always ask the operator: recurring ceremony without demonstrated value.
- Omit the retro when no issue is obvious: absence becomes indistinguishable from a skipped duty.
- Require a finding: it incentivizes invented or low-value backlog items.

## Follow-up

None.
