# Opus Critic only for critical architecture and security, once per batch, re-critic on the diff only

- **Source:** PO general rule, 2026-10-09 (Sprint Alfred, Ruling 156), after one night of Opus Critic rounds cost about
  20 % of the weekly budget.
- **Scope:** Pipeline canon, so it binds consumer (user) repositories as well as this one.
- **Class:** policy / canon. **Target:** 0.7.0 candidate.

## Rule

1. A Critic runs on the Opus tier only for genuinely critical architecture or security changes.
2. Even then there is ONE Opus Critic over a larger batch of slices, never one per slice.
3. Any later re-review is a re-critic restricted to the delta diff since the reviewed candidate.
4. Every other Critic runs on Sonnet (the Critic agent's own route).

**PO clarification (2026-10-09, later the same morning, Ruling 158):** rules 2 and 3 apply to EVERY Critic, not only
Opus: one overall Critic over a batch, and every follow-up Critic only on the delta diff. Same day: `goldfish-mechanic`
moves to Haiku at effort medium.

## Work

- `policies/model-policy.md` MP-07: replace the per-diff A/G/S escalation with the batched rule above; guardrail-only
  changes no longer escalate on their own unless they are security-critical.
- `templates/prompts/critic-review.md`: the dispatch field states the batch scope, and a re-critic dispatch names the
  delta range as its only search surface.
- Plugin Critic route and the dispatch-budget/model checks: admit an Opus override only with the batch rationale.
- A test pin for any mechanical enforcement.

## Triage

Canon part done (2026-10-09, dispatch CRITIC-RULE-20261009), commit `docs(policy): one batched Opus Critic for critical architecture and security, Sonnet otherwise` (SHA in `evidence/dispatch-record-CRITIC-RULE-20261009.json`): MP-07 rewritten, `critic-review.md` gains the batch-scope/re-critic field. STILL OPEN: (a) the word-identical canonical trigger wording in `harness/review-protocol.md` §2.1 (T1-T4), `roles/critic.md` (§3, :215), `plugins/pipeline-core/skills/critic-review/SKILL.md`, ADR-0003 and ADR-0014 still states per-diff A/G/S escalation and needs an ADR amendment; (b) the `critic-review.md` line-25 tier text and criticality example; (c) plugin Critic route/budget checks and test pin; (d) the German reference half of `model-policy.md` is not updated.
