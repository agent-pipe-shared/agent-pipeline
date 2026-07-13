# ADR-0006: Model and Effort Policy per Role

## Status

Accepted on 2026-07-03; effort defaults revised on 2026-07-04.

## Context

Model names, prices, and runner controls change faster than the pipeline's safety requirements. The durable policy therefore describes capabilities and effort tiers in the provider-neutral kernel. Each runner owns the concrete model mapping.

Historical measurements showed that price per token alone did not predict effective cost per completed task. They also showed that changing the orchestrator's model during a session invalidated useful prompt-cache state. Those observations motivate stable routing, delegation, and measured follow-up rather than a universal vendor ranking.

## Decision

The kernel defines these capability requirements:

- The orchestrator uses the strongest configured reasoning tier for coordination and judgment.
- Implementors use the least expensive tier demonstrated capable of the work, but never a low-capability or research-only tier for implementation, judgment, or review.
- Critics use an independent review-capable tier. Architecture, guardrail, security, and other high-risk reviews use the configured highest review tier.
- Read-only retrieval may use a lower tier when it performs no implementation, judgment, or review.

The kernel requires a declared normal reasoning-effort class appropriate to orchestration; it does not prescribe a runner-specific effort label. For guardrail work, broad architecture, major refactoring, migrations, audits, or mass changes, the pipeline must actively offer the runner's configured `max` mode or approved highest task-scoped equivalent. The operator decides. A runner must never silently continue in a lower or otherwise wrong mode: it must obtain the decision or stop with an explicit capability mismatch.

Routing stays stable for the lifetime of a session. Work that needs a different model or capability is delegated as a bounded task instead of switching the orchestrator in place. This preserves cache reuse and makes cost attribution meaningful.

Concrete mappings are runner projections, not kernel truth:

- Existing Claude runner assignments to Fable, including the Claude orchestrator's `xhigh` default, remain unchanged by this ADR and by the Codex mapping; their concrete resolution stays a Claude runner detail.
- In the Codex runner, every duty mapped to Fable resolves to `gpt-5.6-sol` at the assigned effort tier. Codex must not invent another provider identity or silently substitute a different tier.
- Other runners must publish an explicit mapping and fail closed when a required tier is unavailable.

Telemetry records the selected capability tier, requested effort, effective runner mapping, usage, first-pass outcome, and attributable rework. Telemetry must avoid secrets and private prompt content.

## Consequences

Stable routing improves cache reuse and comparability. Capability floors protect implementation and review quality while allowing economical read-only retrieval. Runner mappings can evolve without rewriting the kernel decision.

The active-mode prompt introduces a deliberate operator gate for exceptional work. Missing or incompatible runner mappings stop work instead of degrading silently.

## Rejected Alternatives

- One concrete provider matrix as universal policy: it couples the kernel to transient products and prices.
- Price per token as the only routing metric: it ignores first-pass success and rework.
- In-session model switching: it damages cache stability and obscures attribution.
- Silent fallback: it hides a material change in review or implementation capability.

## Follow-up

The pricing review scheduled for 2026-08-31 remains a dated evidence check, not a universal pricing claim. It reviews runner presets using accumulated telemetry and compares first-pass rate and rework under each revised or exceptional effort default. An attributable regression in first-pass completion or rework must trigger a dated reversal decision at the PO gate; the runner may not silently retain the regressing default. Any resulting change must be recorded as a dated runner-policy revision and does not alter the capability-tier principle by itself.
