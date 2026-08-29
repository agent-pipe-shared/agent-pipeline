---
schema: pipeline.backlog-item.v1
id: pipeline.goldfish-critic-dispatch-bootstrap-token-cost-is-disproportionate
type: workflow-improvement
owner: pipeline
status: open
created: 2026-08-17
sprint: alfred
source: "PO observation, 2026-08-17, live during a session dispatching several goldfish-deep and Critic subagents back-to-back for Nova A Windows bugfix work."
done_when: manual
---

# Goldfish-deep/Critic dispatch bootstrap alone regularly costs 50k-150k tokens

## Description

The PO observed, watching several `goldfish-deep` and `critic` dispatches
run back-to-back in one session, that the bootstrap/context-loading portion
of each dispatch alone (before any actual investigation or implementation
work starts) regularly costs on the order of 50,000-150,000 tokens. In the
PO's judgement this is disproportionate to what a bootstrap should cost, and
the mechanism driving it has not been investigated.

Not investigated yet in this session (explicitly deferred — the PO asked
only that this be recorded, not chased down live, given active Nova A
delivery pressure): which specific inputs dominate this cost — the
`agent-obligations.md` full-text include, canon file reads
(`templates/prompts/*`, `roles/*.md`, `guardrails/*.md`), the briefing text
itself for a design-latitude task, or something else entirely; whether the
cost scales with briefing size/file-context size or is closer to a fixed
per-dispatch floor; whether `goldfish-implementor`/`goldfish-mechanic` (lower
tiers) show the same disproportion or whether it is specific to
`goldfish-deep`/`critic`'s fuller-reference obligations.

## Triggering situation

Observed live across multiple dispatches in one 2026-08-17 session (Windows
bugfix work: NVA-PAWINACL-1, NVA-MKTHASH-1, NVA-CONTREP-1/2, plus a
consolidated Critic review) — a repeated pattern across dispatches, not a
one-off.

## Proposal

Not designed here. Needs an actual measurement pass before any optimization:
break down one representative `goldfish-deep` and one `critic` dispatch's
token usage by phase (bootstrap/context-load vs. actual work vs. report
authoring) to confirm where the cost really sits before proposing a fix
(e.g. trimming what `agent-obligations.md`/canon includes by default,
reference-inlining more aggressively, a lighter bootstrap confirmation for
non-architecture tasks).

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted as a real, recorded observation; explicitly NOT
  investigated or fixed this session per the PO's own instruction (recorded
  now, investigated later).
- **Assignment:** Nova B, or Nova A if a cheap measurement pass turns out to
  fit without displacing current delivery work — PO's stated preference,
  cheapest slot wins.
- **Date:** 2026-08-17

### Update, 2026-08-18 — release-bar triage: reassigned off Nova A/B to Sprint Alfred

- **Decision:** deferred — owned by Sprint Alfred.

- **Decision:** unchanged on substance (accepted, real observation, needs a
  measurement pass before any fix, not resolvable by reading alone this
  triage pass) — correcting only the assignment. "Nova A" and "Nova B" are
  sub-slices of Sprint Nova itself, confirmed via `docs/adr/0043-post-go-
  live-sprint-model.md` (Nova is one of the three canonical follow-up
  planning windows established alongside Nightwing and Phoenix, and the
  live `docs/state.md` record shows Nova A/Nova B are this same release's
  own delivery tracks — the one shipping as 0.6.0). Deferring to "Nova B,
  or Nova A" is therefore deferring within the current release, not to a
  genuinely separate future sprint, and does not satisfy the release bar's
  deferral exception.
- **Rationale:** this item cannot be closed now (a real measurement pass
  needs actual dispatch instrumentation and telemetry, which a read-only
  triage pass cannot produce), so it is queued rather than closed; it is
  reassigned to a genuinely distinct, still-open sprint so it does not
  silently ride along inside the release it was supposed to be deferred
  past.
- **Assignment:** Sprint Alfred — matches its confirmed "measurable rigor"
  scope (`docs/adr/0043-post-go-live-sprint-model.md`, 2026-08-17
  amendment); first step is exactly this item's own Proposal (a
  phase-by-phase token breakdown of one representative `goldfish-deep` and
  one `critic` dispatch) before any optimization is attempted.
- **Date:** 2026-08-18
