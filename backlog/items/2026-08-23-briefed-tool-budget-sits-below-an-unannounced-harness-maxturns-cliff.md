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

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
