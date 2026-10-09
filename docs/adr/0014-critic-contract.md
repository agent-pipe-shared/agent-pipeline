# ADR-0014: Critic Contract

## Status

Accepted on 2026-07-03; revised on 2026-07-04 to require injected-context disclosure and independent freshness checks; amended on 2026-10-09 (PO decision, Sprint Alfred Ruling 156) to reserve the higher-capability Critic tier for one batched review of genuinely critical architecture or security changes; clarified the same day (PO decision, Ruling 158) so that the batch rule - one overall Critic per batch, diff-only follow-ups - applies to every Critic.

**Governs:** docs/operating-model.md, roles/critic.md, harness/review-protocol.md, harness/checklists/critic-review.md, templates/prompts/critic-review.md, plugins/pipeline-core/agents/critic.md, plugins/pipeline-core/skills/critic-review/SKILL.md, harness/scripts/check-critic-contract-citations.mjs, harness/scripts/check-critic-contract-citations.test.mjs, plugins/pipeline-core/config/codex-sandbox-compatibility.v2.json, plugins/pipeline-core/config/codex-sandbox-compatibility.v2.schema.json, plugins/pipeline-core/lib/codex-sandbox-compatibility.mjs, plugins/pipeline-core/lib/codex-sandbox-compatibility.test.mjs, plugins/pipeline-core/scripts/critic-dispatch-preflight.mjs, plugins/pipeline-core/scripts/critic-dispatch-preflight.test.mjs, plugins/pipeline-core/scripts/critic-claude-host.mjs, plugins/pipeline-core/scripts/critic-claude-host.test.mjs, plugins/pipeline-core/scripts/critic-native-bare.mjs, plugins/pipeline-core/scripts/critic-bare.mjs, plugins/pipeline-core/scripts/critic-bare.test.mjs, plugins/pipeline-core/scripts/critic-verdict.schema.json, plugins/pipeline-core/scripts/codex-critic-host.mjs, plugins/pipeline-core/scripts/codex-critic-host.test.mjs, plugins/pipeline-core/scripts/codex-critic-selected-host.mjs, plugins/pipeline-core/scripts/codex-critic-app-server.mjs, plugins/pipeline-core/scripts/codex-critic-app-server-child.mjs, plugins/pipeline-core/scripts/sandboxed-readonly-host-bridge.mjs, plugins/pipeline-core/scripts/sandboxed-readonly-host-bridge.test.mjs, plugins/pipeline-core/scripts/codex-critic-receipt.schema.json, plugins/pipeline-core/scripts/codex-isolated-critic-contract.mjs, plugins/pipeline-core/scripts/codex-isolated-critic-contract.test.mjs

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

Risk policy selects staffing and isolation. Every architecture, guardrail and
security change requires an independent Critic; the configured highest review
capability is reserved for genuinely critical architecture or security changes,
reviewed once per batch (amendment of 2026-10-09 below). The normal route is the
fresh, contractually read-only session Critic:

> "Every architecture/guardrail/security diff gets the Critic in ONE fresh independently briefed, contractually read-only session subagent with a JSON-schema-shaped verdict and the literal assurance `functional-equivalent-read-only; OS isolation not asserted`, on the review-tier model (the Critic agent's own Sonnet route). The batch rule binds EVERY Critic, on whichever tier: ONE overall Critic per batch of slices (never one per slice or per diff), and every follow-up Critic of that batch is a re-critic restricted to the delta diff since the reviewed candidate. The higher-capability tier is used additionally only for a genuinely critical architecture or security change, as that one batched Critic. This session lane is the autonomous default. Selected-runner native isolation is an optional explicitly configured or requested escalation, not a prerequisite for the ordinary Critic and not a Pipeline PO gate. Rigor level 2 makes the Critic mandatory (default: the review-tier model); escalation to the higher-capability tier applies there only for a genuinely critical architecture or security change, reviewed once per batch."

The default session Critic has no chat/history or implementer reasoning,
refs-only bounded input, strict read-only/no-write/no-subdelegation instruction,
and a fixed candidate commit and diff. It never asserts OS isolation or
effective-model identity. If the runner cannot provide this contractual
independent review, the coordinator reports a typed runtime failure; it does
not invent a PO decision point.

Model names and spawn mechanics belong to runner mappings. The kernel contract is provider-neutral; any runner-specific mapping must preserve the required capability and independence.

### Amendment — one batched higher-capability Critic (PO decision 2026-10-09, Sprint Alfred Ruling 156)

The Critic tier trigger above is amended. The independence, read-only, assurance, evidence and
finding-disposition requirements of this ADR are unchanged. Cause: one night of per-diff
higher-capability Critic rounds cost about 20 % of a weekly budget.

1. A Critic runs on the higher-capability (Opus) tier only for genuinely critical architecture
   changes (ADR-required decisions, core contracts, operating-model changes) or security changes
   (secrets/credentials, auth, network exposure, history rewrites, anything that can control real
   devices or production systems).
2. Even then there is ONE higher-capability Critic over a larger batch of slices, never one per
   slice or per diff; the dispatch states the batch scope and the rationale.
3. Any later review of that batch is a re-critic restricted to the delta diff since the reviewed
   candidate; it names the delta range as its only search surface.
4. Every other Critic, including an architecture, guardrail or security diff that is not critical
   in this sense, runs on the review-tier model (the Critic agent's own Sonnet route).
   Guardrail-only changes no longer escalate on their own unless they are security-critical.

The earlier canonical wording (escalation of every architecture, guardrail or security diff, and of
every rigor-2 diff with a high risk class, to the higher-capability tier) is superseded; the
canonical wording quoted above replaces it word-identically in `harness/review-protocol.md` §2.1,
`roles/critic.md`, `plugins/pipeline-core/skills/critic-review/SKILL.md`, ADR-0003 and this ADR.
Operative detail: `policies/model-policy.md` MP-07 and `harness/review-protocol.md` §2.1. Backlog
item: `backlog/items/2026-10-09-opus-critic-only-batched-for-architecture-and-security.md`. Not part
of this amendment: the plugin Critic route and budget checks and their test pin, which that item
tracks.

### Amendment — the batch rule for every Critic (PO clarification 2026-10-09, Sprint Alfred Ruling 158)

The amendment above is clarified: its batch rule is not specific to the higher-capability tier. The
independence, read-only, assurance, evidence and finding-disposition requirements of this ADR remain
unchanged.

1. EVERY Critic, on whichever tier, is ONE overall Critic per batch of slices, never one per slice or
   per diff. The dispatch states the batch scope (the slice ids and the single candidate range).
2. EVERY follow-up Critic of that batch is a re-critic restricted to the delta diff since the reviewed
   candidate; it names the delta range as its only search surface and reads nothing outside it.
3. The higher-capability (Opus) tier stays an additional condition on top of the batch rule, only for
   genuinely critical architecture or security changes (item 1 of the amendment above); the batch rule
   does not depend on it.

The canonical wording quoted above carries this extension word-identically in
`harness/review-protocol.md` §2.1, `roles/critic.md`, `plugins/pipeline-core/skills/critic-review/SKILL.md`,
ADR-0003 and this ADR. Operative detail: `policies/model-policy.md` MP-07 and
`templates/prompts/critic-review.md`. Backlog item:
`backlog/items/2026-10-09-opus-critic-only-batched-for-architecture-and-security.md`. Not part of this
amendment: the model route of `goldfish-mechanic` (Ruling 158 also moves it to Haiku at effort `medium`);
that is an agent-route change tracked in the same backlog item, not an ADR-0014 decision.

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
