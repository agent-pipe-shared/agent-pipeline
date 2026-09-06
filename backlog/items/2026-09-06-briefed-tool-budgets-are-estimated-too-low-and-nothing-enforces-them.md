---
schema: pipeline.backlog-item.v1
id: pipeline.briefed-tool-budgets-are-estimated-too-low-and-nothing-enforces-them
type: workflow-improvement
owner: pipeline
status: open
created: 2026-09-06
source: "four dispatches measured on 2026-09-06 against their own briefed caps; one was cut at the harness maxTurns limit mid-verification. Second instance of the class in backlog/items/2026-08-23-briefed-tool-budget-sits-below-an-unannounced-harness-maxturns-cliff.md"
sprint: nova-b
done_when: manual
---

# Briefed tool budgets are estimated too low, and nothing enforces them

## Description

Every dispatch briefing states a tool budget. On 2026-09-06 four dispatches
ran against theirs:

| Dispatch | Tier | Briefed base + closing | Actual | Outcome |
|---|---|---|---|---|
| documentation drift, first pass | implementor | 34 + 6 | 66 | completed, overrun unremarked |
| Codex preflight diagnosis | deep | 45 + 6 | 45 | stopped on budget, second deliverable not started |
| documentation drift, correction | implementor | 26 + 5 | 50 | **cut at the harness turn limit mid-verification** |
| Codex receipt diagnosis | deep | 40 + 6 | 39 | completed within budget |

Two separate problems are visible in that table, and they need different
fixes.

**The estimate is wrong.** The correction pass was briefed at 26 for six files
in two languages, immediately after a nearly identical file set had cost 66.
Estimating a documentation dispatch by counting its edits underestimates it by
roughly a factor of two: the reads, the checker runs, the greps that prove a
negative, the commit and the dispatch record dominate, and none of them appear
in an edit count.

**Nothing enforces the number.** The budget is a duty the dispatch keeps or
does not keep. The mechanism that should count it externally,
`guard-dispatch-budget.mjs`, never counts anything — see the separate item on
its discriminator. Above the advisory budget sits the real cliff: the agent
tier's own `maxTurns`, which the harness enforces by cutting the run
mid-sentence with no report and no closing handover.

## Triggering situation

The correction dispatch was cut at 50 turns with six edited files uncommitted,
no commit, no finalized dispatch record and no report. Nothing was lost only
because it ran in the shared checkout, where the edits survived and a resume
message let it finish. The same cut inside a worktree-isolated dispatch would
have discarded the work.

This is the second recorded instance of the class; the first is
`backlog/items/2026-08-23-briefed-tool-budget-sits-below-an-unannounced-harness-maxturns-cliff.md`.
That one recorded the cliff. This one records that the estimate feeding it is
also wrong, and that a dispatch was actually cut.

## Affected artifact

- `templates/prompts/goldfish-task.md` — field 6 carries the tool budget; it
  does not tell the dispatcher how to arrive at a number.
- `templates/prompts/critic-review.md` — already states its tier's `maxTurns`
  explicitly and scales the base cap to fit under it. That is the pattern the
  Goldfish template lacks.
- `plugins/pipeline-core/agents/goldfish-*.md` — each carries its own
  `maxTurns` (mechanic and implementor 50, deep 80).

## Proposal

Three parts, cheapest first.

1. **Put the tier's `maxTurns` in the briefing.** The Critic template already
   does this and explains why: a cap far below the cliff wastes the tier, and
   a cap near it truncates the close-out. A Goldfish briefing should state the
   number the harness will actually enforce so the dispatch can pace against
   it.
2. **Give the dispatcher an estimate rule instead of intuition.** From the
   measurements above, a documentation dispatch costs roughly four tool uses
   per file touched plus a fixed overhead of about ten for checkers, greps,
   the commit and the record. Any rule that produces the right order of
   magnitude beats the current practice of counting edits.
3. **Split earlier.** Both documentation dispatches would have fitted
   comfortably as three smaller ones. Splitting by file set is the one
   intervention that helps regardless of whether the estimate or the
   enforcement improves.

External enforcement is tracked separately in the dispatch-budget guard item;
it is the real fix, and these three are what works while it does not.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
