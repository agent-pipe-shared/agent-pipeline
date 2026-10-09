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

## Work

- `policies/model-policy.md` MP-07: replace the per-diff A/G/S escalation with the batched rule above; guardrail-only
  changes no longer escalate on their own unless they are security-critical.
- `templates/prompts/critic-review.md`: the dispatch field states the batch scope, and a re-critic dispatch names the
  delta range as its only search surface.
- Plugin Critic route and the dispatch-budget/model checks: admit an Opus override only with the batch rationale.
- A test pin for any mechanical enforcement.

## Triage

Open. Queued for the 0.7.0 candidate (PO: everything not Batman/Nightwing goes into the next local candidate).
