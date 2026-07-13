# ADR-0020: Every Implementation Runs as a Bounded Executor Dispatch

## Status

Accepted on 2026-07-05. Revised for provider-neutral Phase 2 architecture on 2026-07-13.

## Context

The orchestrator owns decomposition, decisions, and gates. When it also authors production implementation, the role boundary disappears: the same context plans, executes, and explains its own work. Labeling a change “small” or “tightly coupled” does not remove that risk.

## Historical Decision

The 2026-07-05 decision established three enforcement layers plus migration onboarding: bootstrap loads the role prohibition, close checks authorship, and the Critic checks the implementation trajectory. Migration onboarding must remove older language that permits routine orchestrator implementation.

It also retained the governed fast path and explicit PO exception. Those are the only ways to authorize orchestrator-authored production implementation.

## Phase 2 Revision (2026-07-13)

The durable contract is expressed without a provider-specific executor model:

- Outside the governed fast path or an explicit PO exception, the orchestrator must not author production implementation.
- Every implementation task is sent to an executor through one bounded, self-contained briefing with a clear outcome, context, checks, prohibitions, stop conditions, and dispatch identity.
- Tightly coupled small changes may be one bounded dispatch when they form one coherent and reviewable outcome. “One dispatch” is not permission for a repository-wide or multi-purpose mega-briefing.
- If a briefing becomes too broad to review or recover independently, the orchestrator must split it before dispatch.
- Bootstrap, authorship check, Critic trajectory review, and migration onboarding enforce the same boundary.

Concrete executor models belong to runner projections. Existing Claude assignments remain unchanged in the Claude projection. In the Codex projection, every Fable assignment resolves to `gpt-5.6-sol` at the same assigned effort tier; no other provider identity or silent tier substitution is permitted.

## Consequences

Planning and implementation remain independently attributable. Bounded dispatches reduce recovery scope and make evidence reviewable.

The rule creates dispatch overhead even for small changes. The bounded-bundle option absorbs genuinely coupled work without turning bundling into self-implementation or a mega-briefing bypass.

## Rejected Alternatives

- A standing “small or tightly coupled” exemption: it is subjective and collapses the role boundary.
- Enforcement only at bootstrap: a reminder alone does not establish authorship evidence.
- Unbounded combined briefings: they preserve the dispatch label while defeating bounded execution.

## Follow-up

None.
