# ADR-0014: Critic Contract

## Status

Accepted on 2026-07-03; revised on 2026-07-04 to require injected-context disclosure and independent freshness checks.

## Context

Independent review reduces self-confirmation and anchoring, but asking a reviewer to find gaps can also cause overreporting. Some runner surfaces inject project instructions, memory, or a repository-status snapshot into a new agent. A standard-tier critic on such a surface is useful but is not honestly a pristine context.

## Decision

The Critic is an independent, read-only role. It must not edit the reviewed work.

Its bounded input is the specification, the exact diff or commit range, applicable guardrails, and the evidence artifacts. The dispatch must not include chat history, implementor reasoning, or arguments intended to persuade the review.

The Critic must:

1. disclose all context known to have been injected by the runner, including project instructions, user memory, repository snapshots, and inherited framing;
2. state the isolation level actually achieved and never describe a standard-tier review as fresh or bare when inherited context remains;
3. derive the review range from the dispatch and inspect the live repository state independently with current commands;
4. never use an injected or inherited status snapshot as freshness evidence;
5. verify that claimed checks were actually run and that their evidence binds to the reviewed content;
6. report each finding with severity, `file:line` evidence, and its specification or guardrail basis;
7. provide an overall pass/fail only when the caller requests one, and never substitute a numerical score for findings.

The report includes a **Deliberately not flagged** section for plausible concerns rejected due to insufficient evidence, irrelevance, or deterministic enforcement elsewhere. The Critic does not repeat findings already enforced by a deterministic gate unless the gate itself is missing, stale, or not bound to the reviewed content.

Risk policy selects staffing and isolation. High-risk architecture, guardrail,
and security changes require the configured highest review capability and the
selected runner's usable native isolation first. The standing PO-authorized
fallback is exact, not an implicit cross-runner substitution:

> "Every architecture/guardrail/security diff runs with the Critic on the higher-capability tier AND with the selected runner's usable native isolation; if that isolation is technically unavailable or unusable in the current host setup, the standing PO-authorized functional equivalent is ONE fresh independently briefed, contractually read-only Critic subagent with a JSON-schema-shaped verdict and the literal assurance `functional-equivalent-read-only; OS isolation not asserted`. Rigor level 2 makes the Critic mandatory (default: the review-tier model); escalation to the higher-capability tier applies there only when, in addition, the risk class is high OR an architecture/guardrail/security diff is present."

The functional equivalent has no chat/history or implementer reasoning,
refs-only bounded input, strict read-only/no-write/no-subdelegation instruction,
and a fixed candidate commit and diff. It never asserts OS isolation or
effective-model identity. If the selected runner cannot provide even this
contractual independent review, the coordinator stops at the applicable PO
course gate.

Model names and spawn mechanics belong to runner mappings. The kernel contract is provider-neutral; any runner-specific mapping must preserve the required capability and independence.

## Consequences

Findings are reproducible and tied to the actual diff. Disclosure makes unavoidable context contamination visible instead of pretending it does not exist. The trajectory check prevents claimed-but-unexecuted verification from passing as evidence.

Read-only review adds cost and cannot eliminate all anchoring on standard runner surfaces. Stronger isolation or a second independent path remains necessary where the risk policy requires it.

## Rejected Alternatives

- Critic with the implementation conversation: it imports framing and self-justification.
- Injected status snapshot as repository truth: it may predate the review.
- CI alone: deterministic checks cannot judge specification fidelity or subtle interactions.
- Score-only judging: it hides evidence and encourages false precision.

## Follow-up

Runner projections must document their actual context injection, isolation capability, and critic model mapping.
