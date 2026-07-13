# ADR-0019: One Active Write Target per Orchestrator

## Status

Accepted on 2026-07-04.

## Context

An orchestrator that writes across multiple repositories at once can blur ownership, stage unrelated changes, and collide with parallel sessions. Some legitimate workflows bind a public core to a private overlay, so the boundary must support deliberate transfer without implying simultaneous write authority.

## Decision

An orchestrator has exactly one active repository write target at a time.

- It may write only inside the repository and path scope granted for the current phase.
- Monitoring, inventory, and collection work is read-only toward every other repository.
- Cross-repository work is split into separately scoped, sequential phases. Before changing targets, the orchestrator completes or safely parks the current write phase, records the handoff evidence, and establishes the next repository as the sole write target.
- A transfer to another repository uses a new, discoverable, append-only handoff artifact or an explicit handback to the operator/coordinator. It does not edit an existing foreign file merely to make the request visible.
- Binding a public core and private overlay for comparison does not authorize concurrent or unbounded writes to both.

This is a process control, not a technical sandbox claim. Without an enforced path guard or runner-level `writeRoots`, repository permissions may still allow a violation. Reports and conformance statements must disclose that limitation.

Deferred hardening risk:

- **Owner:** pipeline maintainer.
- **Expiry gate:** before any automated cross-repository writer is enabled or described as safe.
- **Required resolution:** enforce repository/path write roots, or keep automated cross-repository writing disabled and retain the explicit process-only limitation.

## Consequences

Write ownership and staging scope stay auditable. Public/private reconciliation remains possible through sequential delivery and receipt phases.

Transfers take an extra handoff step. Until technical enforcement exists, safety depends on disciplined scoping and review.

## Rejected Alternatives

- Simultaneous writes to every bound repository: ownership and failure recovery become ambiguous.
- Treating read access as write authority: comparison scope is not mutation scope.
- Claiming the process rule is technically enforced: current controls do not justify that claim.

## Follow-up

The maintainer must resolve the deferred hardening risk at its expiry gate. No release or conformance claim is implied by this ADR.
