---
schema: pipeline.backlog-item.v1
id: pipeline.every-stage-0-commit-loses-its-assistance-marker-to-a-blank-line
type: defect
owner: pipeline
status: open
created: 2026-09-01
sprint: nova-b
done_when: manual
source: "Critic round J, finding F-1, 2026-09-01, reviewing commits ccc7df84 and 25c51c90. Verified independently by the Elephant against git's own trailer parser before filing."
---

# Every stage-0 commit in the sample loses its `AI-Assisted: true` marker to a blank line, and no check catches it

## What was measured

GIT-03 makes the anonymous assistance trailer mandatory on every agent-authored
commit, and it prescribes the exact check that decides the question:

```
git log -1 --format='%(trailers:only=true,unfold=true)' <commit>
```

Run against `25c51c90`, that returns `Dispatch: stage-0 (elephant)` and nothing
else. Run against `ccc7df84`, it returns both `AI-Assisted: true` and
`Dispatch: NVA-B-GIT09WORD (goldfish)`.

The cause is a blank line. In the failing messages the marker is separated from
the `Dispatch:` line by an empty line, so git's trailer parser treats only the
last block as trailers and everything above it — including the marker — as body
text. In the passing messages the two lines are adjacent.

## The correlation is perfect, which is what makes it a defect rather than a slip

Across the last twenty commits at the time of measurement:

- **all six** whose work package is `stage-0 (elephant)` fail the check —
  `bfe4f751`, `25c51c90`, `63c1a8ab`, `2c3310b2`, `672b1709`, `ed8cc9e8`
- **all eleven** whose work package is a `(goldfish)` dispatch pass it

Six for six against eleven for eleven is not a distribution of accidents. The
goldfish commits are composed from a template that places the two trailers
adjacently; the stage-0 messages are composed by hand each time, and the hand
composing them inserts a paragraph break before the attribution line because it
reads better.

## Why the consequence is more than cosmetic

`guardrails/git.md` states, in the rule itself, that the structural-parsing check
exists precisely to catch "the malformed case that a body-text grep like
`rg "^AI-Assisted: true$"` would miss." These six commits are exactly that case:
a reader greping the message body finds the marker and concludes the commit is
compliant; the check the guardrail actually prescribes finds nothing.

So the repository's durable, provider-neutral assistance signal is missing on
every commit the orchestrator authored in this lane, while looking present to the
most obvious manual inspection.

GIT-03 carries **no** carve-out for `chore` commits, mechanical work,
generated-file regeneration, or the stage-0 lane. The requirement is
unconditional, and the stage-0 lane is precisely where the orchestrator writes
production commits itself rather than dispatching them.

## Nothing catches it

No automatic check flagged any of the six. The verify gate does not examine
commit trailers, and the review that found this was a Critic reading two commits
for an unrelated wording change — it surfaced the pattern only because it sampled
the surrounding history while establishing the authorship chain.

## The state of the six, and why they were not amended

All six are unpushed: no remote branch contains them, verified directly. A
rewrite is therefore technically available without a force-push, which is the
usual reason not to.

It was **not** taken, and the ground is recorded so a later reader does not
mistake inaction for oversight. `CLAUDE.md` prohibits rewriting history flatly,
without an unpushed carve-out, and the prohibition sits in the same clause as
never force-pushing and never skipping hooks. Rewriting six commits immediately
before a release sequence is the wrong moment to test where that boundary
actually lies. Whether to amend is a PO decision, not an agent's.

## Directions, none pre-selected

1. **Fix the composition habit** and treat the six as historical. Cheapest, and
   it stops the bleeding, but it leaves six non-compliant commits in the history
   of a release and relies on a habit that has already failed six times out of
   six.
2. **Add a commit-boundary check** for the trailer, using the prescribed
   structural invocation rather than a body grep. This repository already
   installs a pre-commit hook generator for exactly this kind of boundary
   enforcement, and the handover-size check landed there this same session, so
   the mechanism exists and would not need inventing.
3. **Amend the six**, on explicit PO instruction, before the release sequence
   reaches them. Available because they are unpushed; forbidden to an agent
   acting on its own judgment.

Direction 2 is the one that makes direction 1 unnecessary. They are not
alternatives — a habit fix without a check is what produced the current state.
