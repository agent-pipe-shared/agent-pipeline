# ADR-0023: Orchestrator Context Diet and Latency Measure Bundle

## Status

Accepted on 2026-07-05. Revised for provider-neutral Phase 2 architecture on 2026-07-13.

## Context

Measured work showed that orchestrator context and coordination latency could dominate a feature even when implementation was delegated. The response was a coordinated measure bundle, not a claim that any one token or cost figure is universally valid.

## Historical Decision

The 2026-07-05 decision adopted the bundle below and required first-pass quality to remain stable. Its original provider, run, and pricing evidence remains dated programme evidence rather than product policy.

## Phase 2 Revision (2026-07-13)

The operative bundle is:

- **Bounded reports:** a Goldfish report is capped at 1,000 tokens or 40 lines unless a named anomaly requires more evidence.
- **Parallel first:** independent reconnaissance and analysis run in the same turn where the host permits it. Sequential work requires a named dependency.
- **Phase cuts:** approximately ten dispatches, two hours, or 50% additional context growth triggers a deliberate phase-cut check alongside the normal fill-level check.
- **Selective reads:** use indexes and focused excerpts for normal work; read full source text when the task requires it or an anomaly makes the narrower view insufficient.
- **Evidence order:** persist or commit the intended content durably first; then verify that exact persisted content and bind the evidence to its content hash or commit; only then report. No report may precede durable persistence.
- **Dispatch ledger:** record each dispatch, its bounded purpose, state, evidence, and disposition.
- **Communication economy:** chat carries findings, gates or decisions needing attention, incidents or stops, and block results. Dispatch announcements and intermediate ceremony are omitted.
- **Readiness scope:** mandatory readiness review is reserved for canon, guardrails, core contracts, high-risk work, and the configured highest-rigor class.
- **Configured implementor effort:** the executor effort comes from the active runner projection, not from kernel prose.
- **Staleness notice:** startup may detect and prompt on stale runtime material. Detection is advisory and fail-open unless a separate gate explicitly makes freshness blocking.
- **Template enforcement:** planning templates encode the required scope, evidence, and dispatch fields instead of relying on memory.

Concrete model and effort labels are runner concerns. Existing Claude assignments remain unchanged in the Claude projection. Codex resolves every Fable assignment to `gpt-5.6-sol` at the same assigned effort tier and must not invent or silently substitute a tier.

## Consequences

The bundle reduces repeated context loading, serialized waiting, premature narration, and evidence loss. It also spreads maintenance across several contracts and therefore needs template and ledger checks.

Aggressive report or reading reductions can harm first-pass quality. Context, latency, first-pass completion, and attributable rework must be measured against a dated local baseline.

## Rejected Alternatives

- Treat one historical cost or context percentage as universal: runner and workload economics change.
- Apply only one measure: the bottleneck spans scheduling, reading, reporting, and evidence handling.
- Optimize output volume without a quality gate: lower token use is not success when rework rises.

## Follow-up

An attributable first-pass regression or increase in rework triggers a dated reversal decision at the PO gate. The regressing default must not be retained silently.
