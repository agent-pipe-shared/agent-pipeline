---
schema: pipeline.backlog-item.v1
id: pipeline.critic-and-verify-cadence-may-be-too-fine-grained
type: workflow-improvement
owner: pipeline
status: open
created: 2026-08-24
source: "PO observation during the sprint-agy-runner D-fix wave, 2026-08-24 (\"seltener Critics und Verifys fahren und diese eher nur an große Sammelblöcke setzen ... dadurch dauern selbst kleine Fixes und kleine Erweiterungen immer viele Stunden\")"
due: 2026-08-31
---

# Analyze and verify whether Critic/Verify cadence should batch onto larger collection blocks instead of running on every small diff

## Description

The current operating model runs a full deterministic Verify and dispatches
a Critic review at fine granularity — repeatedly against small diffs and
correction waves within a single feature (this session alone: an initial
full Critic review, a delta review of the correction range, then a *third*
delta-scoped review of a follow-up correction wave, each gated by its own
Verify run). Observed directly this session: a small diff going through a
Critic round very reliably surfaces at least one finding (majors/minors),
which then requires a fix wave and a fresh delta round to close — and the
round budget (max 4 Critic rounds per package, per
`templates/prompts/critic-review.md`) exists specifically because this
repeats. Each Verify run alone costs ~12–14 minutes
(`backlog/items/2026-08-24-verify-mjs-runs-385-suites-strictly-sequentially.md`).
The PO's observation is that this compounds: even a small fix or small
extension ends up costing many hours of wall-clock time, once the
Verify-then-Critic-then-fix-then-re-Critic loop is counted in full, purely
because review happens on small increments rather than being batched onto
larger collection blocks.

## Why this matters

This is a review-cadence/granularity question, not a review-rigor question —
the PO is not proposing to review less thoroughly, but to review the same
total amount of change less often, in larger batches, so that the fixed
overhead of a Verify+Critic round (which does not scale down much with diff
size) is paid fewer times per unit of delivered work. Whether that actually
nets out faster is not obvious and needs an honest analysis rather than an
assumption in either direction:

- **In favor:** fewer round trips, less fixed per-round overhead (a 12–14
  minute Verify run costs roughly the same whether the diff is 5 lines or
  500), fewer context-reload costs for a fresh Critic dispatch.
- **Against:** batching correction waves together risks losing the tight
  feedback loop that catches a regression close to where it was introduced
  (this session's F1/F2 delta-3 findings were themselves regressions
  introduced by the *previous* correction wave — a batched cadence could let
  such a regression sit longer before being caught, or get buried among
  unrelated changes in a larger diff, making root-causing harder); a larger
  single Critic pass may also just find proportionally more issues at once
  rather than fewer overall, without actually reducing total review rounds.

## Candidate shape (not a spec; input for analysis)

- Quantify the actual fixed-vs-variable cost split of a Verify run and of a
  Critic review round (how much is genuinely diff-size-independent overhead
  vs. scales with lines changed) — this session's suite timings and the
  three-round delta-review history on `sprint-agy-runner` are a concrete
  dataset to start from.
- Compare total wall-clock cost, empirically or by simulation, of the
  current fine-grained cadence against a coarser one (e.g., batch several
  logically related fixes/commits into one collection block before running
  Verify/Critic against the block, rather than after each fix).
- Identify what governs the current cadence today (dispatch/session
  boundaries? the round-budget rule? habit?) versus what a deliberately
  chosen batching policy would look like, and where the line should be
  between "small enough that batching is safe" and "large enough that
  batching risks burying a regression."
- Consider whether this is a `verify.mjs`-runtime concern (addressed
  separately by the parallelization work in
  `backlog/items/2026-08-24-verify-mjs-runs-385-suites-strictly-sequentially.md`)
  or a process/dispatch-cadence concern (when the Elephant chooses to run
  Verify/dispatch Critic at all) — likely both contribute to the observed
  multi-hour cost and should be evaluated independently before conflating
  them into one fix.

## Acceptance

- A documented analysis exists (in this item or a linked artifact) that
  states, with evidence rather than assumption, whether a coarser
  Critic/Verify cadence would reduce total wall-clock cost for typical
  small-fix/small-extension work without a material increase in regression
  risk or review-quality loss.
- If the analysis recommends a cadence change, it proposes a concrete,
  boundable policy (not "review less often" as a vague instruction) — e.g.
  a minimum/maximum batch size, a trigger condition, or a rule for when
  fine-grained review is still required (guardrail/security/architecture
  diffs, per existing MP-07 routing).
- If the analysis recommends no change, it states why the current
  fine-grained cadence's regression-catching value outweighs the measured
  overhead, so the question does not need re-litigating without new
  evidence.
