---
schema: pipeline.backlog-item.v1
id: pipeline.briefed-tool-budget-sits-below-an-unannounced-harness-maxturns-cliff
type: defect
owner: pipeline
status: open
created: 2026-08-23
source: "Direct measurement across one dispatch block, 2026-08-23 (agy-runner Critic-fix wave): five of six Goldfish dispatches ended mid-sentence without committing, every one of them at 50 or 51 tool uses, against briefed base caps of 30-35."
---

# The briefed tool budget is advisory and set below a hard, unannounced `maxTurns` cliff — so it produces truncations instead of preventing them

## Description

`templates/prompts/goldfish-task.md` field 6 asks every briefing to state a
tool budget, and states honestly that it is not hook-enforced: "no automated
per-subagent tool-call counter exists (yet)". Agents behave accordingly and
treat the number as a request.

What the template does NOT say is that a hard limit exists anyway. Every
Goldfish agent definition (`plugins/pipeline-core/agents/goldfish-deep.md`,
`goldfish-implementor.md`, `goldfish-mechanic.md`) carries `maxTurns: 50` in
its frontmatter, and the harness cuts the run off there — mid-sentence, before
the final report, and in several observed cases before any commit.

So the two numbers are the wrong way round. The soft number (30-35) sits well
below the hard number (50) and is declared non-binding; the hard number is
binding and is never mentioned to the agent at all. The closing-allowance
mechanism, which exists precisely to convert a budget exhaustion into a clean
structured handover, can only work when the base cap plus its allowance land
BELOW the real cliff. Today they land far below it, the agent ignores them,
and the run dies at the cliff with no handover.

## Triggering situation

One dispatch block on 2026-08-23, correcting the Critic findings for
`sprint-agy-runner`. Measured, not inferred:

| Dispatch | Briefed base cap | Tool uses at truncation |
|---|---|---|
| `AGY-VERIFYFIX-1` | 35 | 51 |
| `AGY-FIX-DOCS` | 30 | 50 |
| `AGY-FIX-INSTALL` | 35 | 50 |
| `AGY-FIX-GUARD` | 35 | 50 |

Each one ended with a fragment ("Now commit the QG-14 reconciliation.",
"Good. Now let's write the commit message file and commit this piece.") rather
than a report, and each needed a separate procedural resume to commit its work
and close out — roughly doubling the round trips for the block.

The counter-example is in the same block and is what makes this diagnosis
rather than correlation: the Critic agent carries `maxTurns: 30`, was briefed
at 24 base + 5 closing allowance = 29, and was the ONLY dispatch of the block
to run to a complete, correctly formatted report without a resume.

## Affected artifact

- `templates/prompts/goldfish-task.md` field 6 (tool budget + closing
  allowance), and the parallel field in `templates/prompts/critic-review.md`.
- `plugins/pipeline-core/agents/goldfish-deep.md`,
  `goldfish-implementor.md`, `goldfish-mechanic.md` frontmatter `maxTurns`.
- `roles/goldfish.md` §6 (GF-09-D, report durability) — the duty the truncation
  defeats.

## Proposal

Three parts, in order of confidence.

1. **Align the briefed numbers to the real cliff.** Base cap plus closing
   allowance must fit under `maxTurns` with margin. At `maxTurns: 50` that is
   roughly base 40 + allowance 5, leaving 5 in reserve. The current 30 + 5
   throws away a third of the available capacity while teaching agents that
   the stated number does not mean anything.

2. **Name the cliff in the briefing.** The template's honesty note is now half
   wrong: the briefed budget is advisory, `maxTurns` is not. A briefing should
   state both — "base cap N, advisory; harness hard limit M, enforced, and it
   truncates you mid-sentence". An agent that knows where the real edge is
   plans its close-out differently from one told the limit is only a request.

3. **Check whether 50 is enough for this repository at all.** Reading
   `agent-obligations.md` plus a typical context-file list costs five to eight
   tool calls before the first edit. If 40 usable calls is genuinely too tight
   for a normal package, the correct lever is `maxTurns` in the agent
   definitions, not the prose in the template. Measure before changing it.

Deliberately NOT proposed: dropping the budget field. That was the first
instinct and the measurements contradict it — with no stated budget, every
dispatch runs to 50 and truncates, and the closing allowance never fires.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted
- **Rationale:** Small, fully-specified, no design latitude (proposal parts
  1 and 2 name the exact files and target numbers already). Directly
  relevant to the PO's 2026-08-24 observation that small fixes end up
  costing many hours — a truncated dispatch needing a procedural resume
  roughly doubles a round trip's cost, which is exactly what this item
  measures and fixes. Part 3 (whether 50 is enough at all) needs
  measurement first and is not blocking parts 1+2.
- **Assignment (if accepted):** this sprint — parts 1+2 applied directly
  this session (stage-0: 2 files, mechanical, no design latitude beyond
  numbers already derived from the real `maxTurns` values, no need for a
  full dispatch round-trip for a task this small).
- **Date:** 2026-08-24

## Parts 1+2 landed, 2026-08-24

Commit `eccbdadd`: `templates/prompts/goldfish-task.md`'s base-cap default
lowered from 45 to 40 (fits under the real `maxTurns: 50` with 5 in
reserve, versus the old default landing exactly on the cliff with zero
margin); `templates/prompts/critic-review.md`'s lowered from 45 to 24
(matching this item's own empirically-successful counter-example dispatch,
24+5=29 under `maxTurns: 30` — the template's OLD default of 45 would have
overrun the Critic's real cliff by 15 turns on its own, a sharper version
of this item's diagnosis than the item itself had measured). Both
templates now name the real `maxTurns` cliff explicitly and its
consequence (mid-sentence truncation, no report, no closing handover), so
a future briefing at a different `agentType`/`maxTurns` rescales rather
than reusing an unsafe number. Applied identically to the vendored plugin
copies (`plugins/pipeline-core/templates/prompts/`), confirmed
byte-identical before and after. `check-consumer-safe-paths.test.mjs`
9/9 green.

**Part 3 (whether `maxTurns: 50`/`30` is enough at all for this
repository) remains open** — deliberately not touched, per this item's own
ordering ("measure before changing it"). Item stays `open`.

## Part 3 measured, 2026-08-24 (interim result)

A read-only research fork gathered empirical tool-use data from this
session's own `evidence/dispatch-record-*.json` files under the NEW 40/24
caps and the prior 30-35 regime:

- `AGY-F5-OMSECTION` (small doc-edit, new regime): 15-17 tool uses — well
  under 40.
- `AGY-FIX-HARDENING` (substantial guardrail restoration + 8 new tests,
  prior regime): 27 tool uses — comfortably under even the old 35 cap.
- `AGY-VERIFYFIX-1` (one of this item's own named truncation incidents):
  the actual USEFUL work finished at 21 logged tool uses; the truncation
  was caused by the agent not treating the stated soft cap as binding and
  continuing to wander past it into unlogged territory until the real
  ~50 cliff stopped it — confirming the root cause parts 1+2 already fixed
  (behavioral, not a too-small budget), not evidence that `maxTurns` itself
  needs raising.

**Interim recommendation: leave `maxTurns` at 50/30 as-is — no evidence
supports raising it.** Every sample found needed real work well under the
new 40/24 base caps. **Not fully closed yet:** `AGY-VERIFYTUNER-1` (the one
genuinely complex task dispatched under the new caps this session — an
async worker-pool rewrite with real design latitude) was still in flight
when this measurement ran, so it is the one open data point that could
still change this conclusion. Re-check its own final tool-use count once it
completes; if it also finishes comfortably under 40, this closes part 3
with full confidence. If it genuinely needed more room, that is the first
real signal to reconsider `maxTurns` itself, and should be re-investigated
then — not pre-empted here. Item stays `open` pending that one data point.
