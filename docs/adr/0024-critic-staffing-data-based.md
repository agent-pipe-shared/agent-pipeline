# ADR-0024: Risk-Based Critic Staffing

## Status

Accepted during the 2026-07-05 measure wave. Revised for provider-neutral Phase 2 architecture on 2026-07-13.

## Context

Critic staffing should follow risk and evidence rather than use the most expensive review path for every change. Historical observations supported a cascade for routine work, but they did not weaken blocking review for high-risk architecture, guardrail, or security changes.

## Historical Decision

The original decision introduced a mechanical auto-pass, a medium-risk cascade, non-blocking low-risk review, one bundled Critic per wave by default, and unchanged blocking review for high-risk and architecture/guardrail/security work.

## Phase 2 Revision (2026-07-13)

The kernel uses capability and independence classes rather than provider names:

- **Mechanical:** a Critic may be bypassed only when the entire diff is deterministically generated or purely format-normalized and evidence includes both the exact generating command and successful verification bound to the resulting content. A descriptive claim that work was mechanical is insufficient.
- **Low risk:** an independent review may run non-blocking and in parallel. Every finding and the explicit pass result still require disposition before the wave closes.
- **Medium risk:** start with the configured standard independent review capability. Escalate to the strongest configured independent review when there is a finding of at least major severity, an architecture/guardrail/security touch, or a contested disposition.
- **High risk and architecture/guardrail/security:** the strongest configured independent review is mandatory, blocking, and may not be replaced by a mechanical classification or lower-tier pass.
- **Wave staffing:** one bundled Critic is the default only when the reviewed items share a coherent risk boundary. It cannot merge unrelated high-risk decisions into an unreviewable batch.

Existing Claude assignments remain unchanged in the Claude projection. In the Codex projection, every Fable duty resolves to `gpt-5.6-sol` at the same assigned effort tier. Neither mapping changes the provider-neutral risk semantics.

## Consequences

Deterministic work avoids redundant judgment calls while medium and low risk can use proportionate review. High-risk work retains the strongest independent blocking path.

The cascade adds classification complexity. Misclassification is controlled by evidence requirements and by treating any architecture, guardrail, or security touch as a mandatory high-risk path.

## Rejected Alternatives

- Strongest-tier review for every mechanical diff: deterministic evidence can establish those bytes more reliably.
- No review or disposition for low risk: non-blocking does not mean ignorable.
- Non-blocking high-risk review: it allows work to proceed before the highest-impact findings are resolved.

## Follow-up

Continue collecting dated review outcomes. Any change to the cascade requires evidence that distinguishes mechanical, low-, medium-, and high-risk work.
