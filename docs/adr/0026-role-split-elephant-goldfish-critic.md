# ADR-0026: Three-Role Split and the Plan-Verifier Capability

## Status

Accepted on 2026-07-07. Clarified for Phase 2 on 2026-07-13.

## Context

The pipeline needs a stable separation between orchestration, execution, and independent review. It also needs a narrow check that an implementation diff maps to every approved plan item. That check is a verification capability, not a new authority or a fourth role.

## Historical Decision

The 2026-07-07 decision formalized three roles and introduced a fresh-context, read-only `plan-verifier` agent before work is treated as complete.

## Decision

The pipeline has exactly three roles:

- **Elephant:** the orchestrator. It owns triage, specification and plan, decomposition, dispatch, gates, and handoff. Production implementation follows [ADR-0020](0020-el01-enforcement-goldfish-duty.md).
- **Goldfish:** the executor. It starts each bounded, self-contained task in a fresh execution context and returns content plus evidence. It does not expand its own authority or retain cross-task memory.
- **Critic:** the independent, read-only reviewer. It evaluates specification fidelity, guardrails, risk, interactions, trajectory, and evidence under [ADR-0014](0014-critic-contract.md).

The `plan-verifier` is a narrow verification agent operating within this topology:

- it receives the approved plan, exact diff or commit range, and bound evidence in a fresh context;
- it remains read-only and reports `VERIFIED | GAP | UNPLANNED` for each plan item with content references;
- it provides an independent, evidence-backed plan-to-diff mapping, not deterministic or mechanical proof;
- it does not judge broader specification fidelity, guardrails, security, edge cases, or review sufficiency;
- it is not a fourth pipeline role and cannot replace the Critic;
- the implementor must never verify its own implementation through this capability.

## Phase 2 Clarification (2026-07-13)

The earlier description of plan coverage as “mechanical evidence” is superseded by “independent, evidence-backed mapping.” An LLM verdict remains judgment and must be represented honestly.

Concrete staffing models belong to runner projections. Existing Claude assignments remain unchanged. Codex maps every Fable assignment to `gpt-5.6-sol` at the same assigned effort tier; this mapping creates no additional role.

## Consequences

The three-role authority model stays small while plan coverage gets a focused independent check. The Critic remains responsible for the broader safety and correctness judgment.

The additional verification step costs a dispatch and can still be wrong. Fresh context, read-only operation, evidence references, and Critic separation limit that risk without overstating certainty.

## Rejected Alternatives

- Make plan-verifier a fourth role: it has no separate authority domain.
- Let the implementor run its own plan verification: that defeats independence.
- Replace the Critic with plan coverage: a plan can be fully mapped and still be unsafe or incorrect.

## Follow-up

None.
