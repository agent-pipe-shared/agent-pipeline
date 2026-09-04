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

## A seventh instance, two hours after filing — and it settles the direction

`3047c9c8` was authored by a dispatch whose briefing carried this warning in the
DoD, in these words: *"Put those two lines adjacent to each other with NO blank
line between them — a blank line makes git's trailer parser read the first as
body text, which is a defect filed today."* The briefing also required the
dispatch to verify the result with the prescribed structural invocation and
report what it printed.

The dispatch followed both instructions. It placed the two trailer lines
adjacently, ran the check, and reported honestly that it printed **nothing**.

The cause was a different blank line: git requires a blank line **before** the
trailer block, separating it from the body prose. The briefing warned about the
separator *within* the block and said nothing about the one *before* it, because
the person writing the briefing had only understood half the rule. So a dispatch
that complied exactly with an explicit, freshly-written warning still produced a
commit with no recognised assistance marker.

Two things follow, and the second is the important one.

First, the failure count is now seven, and the seventh happened under maximum
attention — freshly documented, explicitly briefed, verified after the fact.

Second, **direction 1 is refuted, not merely weak.** A habit fix cannot work here
because the rule has two conditions and a person writing a commit message by hand
reliably internalises one of them. The dispatch did everything right and still
failed. What caught it was running the prescribed check afterwards — which is
direction 2, performed manually. Making that check automatic at the commit
boundary is the only direction that survives contact with this evidence.

The commit is local and unpushed with nothing stacked on it, so amending remains
available on the same PO decision as the other six.

## Instance eight, 2026-09-03 — the briefing encoded half the rule as a prohibition

Commit `3c7c5d5f` (`docs(guard-handover-size): correct header comment ...`) returns
**nothing** from the prescribed check. It was authored by a dispatch that followed
its briefing exactly.

The briefing was mine, and its trailer instruction read:

> Trailers are exactly `AI-Assisted: true` and `Dispatch: <TASK_ID> (goldfish)`,
> adjacent, no blank line between them **and no blank line separating them from
> the body's last paragraph**

The clause in bold forbids the blank line git actually requires. This is worse
than the seventh instance, which this item already records: there the briefing was
merely silent about the separator before the block, so a dispatch could still get
it right by habit. Here the briefing affirmatively instructed the failure, and
five concurrent dispatches received the same wrong instruction. Four other
commits in the same run carry correct trailers only because their messages were
composed from files that happened to have the blank line.

What makes this worth appending rather than filing separately: the dispatcher who
wrote that instruction had this item in the backlog, had read the section above,
and still encoded half the rule. That is now the second consecutive instance where
the failure survived direct, recent, explicit knowledge of it — which is the
strongest available evidence for this item's own conclusion that **direction 1 is
refuted**. A rule that two attentive readers in three days each internalised half
of is not a rule that better documentation or a better habit will fix.

One thing that was available for instance seven is not available here: `3c7c5d5f`
has eight commits stacked on it, so amending is out regardless of the PO decision.
The marker is absent from published-in-branch history and stays absent.

The correction that was sent to the three still-running dispatches, and that any
future briefing should carry verbatim, states both conditions:

> Blank line BEFORE the trailer block; no blank line BETWEEN the trailers;
> nothing after them.

## Instance nine, 2026-09-04 — the same surface, the opposite failure, ten in a row

The correction above worked: every commit built with it parses. And the defect
moved.

Ten orchestrator-authored commits landed on 2026-09-04 whose trailer block parses
perfectly and says nothing:

    7e08073a  28a8d44d  2a461b2d  1ed85a91  44af9a14  2aeeaa68
    cb0223f9  4047d7d2  dfc747e3  2c0edb6a

`git log -10 --format='%h %s' --grep='Dispatch:' --invert-grep` returns all ten.
Each carries `AI-Assisted: true` and **no `Dispatch:` line at all** — neither
`stage-0 (elephant)` nor a task id. Under
`templates/prompts/agent-obligations.md` §6 that is "a commit with neither form",
which `dispatch-authorship-verify` reports `UNVERIFIABLE`, never a pass.

This is not the blank-line defect. It is the same commit-binding surface failing
one step earlier: the earlier instances wrote the right trailer and lost it to
git's parser; these never wrote it.

**Found by a Critic, not by a check.** The round-2 reviewer on the
capture-evidence package flagged `44af9a14` as finding F-D. The other nine were
found only because that finding prompted the dispatcher to sweep its own
commits. Ten unbound commits landed across a full working day and nothing in the
gate chain, the hooks, or the ledger noticed — which is this item's own
"and no check catches it" clause, confirmed at a scale the original measurement
did not reach.

**The dispatcher-side cause, stated plainly.** `Dispatch: stage-0 (elephant)` is
documented explicitly, in the same paragraph the dispatcher had already read and
quoted into three briefings that same day. It was applied to none of its own
commits. On one of them the dispatcher actively considered `Commit-Act:
orchestrator`, reasoned that it only applies alongside a `Dispatch:` line, and
removed it — arriving at the correct sub-conclusion and stopping one step short
of the rule it implies.

**Bearing on the direction question.** Instance seven refuted direction 1
(better documentation) for the spacing rule. This instance extends the same
verdict to the presence rule, and adds something the earlier ones could not: the
failure is not confined to one spelling. Whatever a mechanical check ends up
enforcing has to answer "is this commit bound to evidence at all", not merely
"do these two lines sit adjacent".

Amending is unavailable — the ten are stacked, and history rewriting is
prohibited outright. They stay unbound.
