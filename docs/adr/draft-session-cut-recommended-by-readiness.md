# ADR (draft, unnumbered) — recommend a session cut by readiness, never by token threshold

> Unnumbered and unindexed until PO acceptance, per ADR-0069 Decision 2.

## Status

Draft, 2026-09-04. Supersedes the context-budget half of the PO decision of
2026-07-07 (plan `2026-07-07-retro-speed`), whose mechanism was removed from
`plugins/pipeline-core/hooks/stop-suggest.mjs` on 2026-09-04 by PO decision
(commit `868ee755`).

## Context

The removed mechanism read a statusline usage snapshot and, at thresholds
calibrated for a 200k context window, escalated through `warn` → `overdue` →
a hard `decision: "block"` demanding an immediate `/compact`.

Three things were wrong with it, and they are worth separating because only the
first is about the numbers.

**1. The thresholds outlived their window.** They were absolute-token figures
(100k / 150k / 170k) later re-expressed as percentages of a 200k window.
Sessions now run a 1M window. The tiering fired against an assumption that no
longer held.

**2. It recommended the more expensive operation.** Measured on this
repository's own usage over 2026-09-02..04, the orchestrator's spend decomposed
as: cache read 49%, **cache write 36%**, output 9%, input 5%. A `/compact`
pays a full cache-write rebuild of the new prefix — the 36% line — in exchange
for shortening future reads. `/clear` at a genuine boundary shortens the prefix
without paying for a summarisation pass, and without the rebuild being wasted on
material the next task does not need.

**3. It optimised the wrong variable.** A compaction mid-task loses working
state that no summary reliably preserves. This is not hypothetical: on
2026-09-04 a compaction in this repository blurred the in-flight state of four
concurrent dispatches, and what survived was a scratch file written by hand
beforehand, not the summary. Token count is a poor proxy for "is this a good
moment to cut" — it answers how full the window is, never whether anything
would be lost.

## Decision

Replace the token-threshold recommendation with a **readiness predicate**: the
pipeline recommends a session cut when a cut would cost nothing, and otherwise
names precisely what is in the way.

`/clear` is the recommended cut, not `/compact`. Where continuity across the cut
is needed, it is carried by the existing Resume-Hint card
(`plugins/pipeline-core/scripts/resume-hint.mjs capture`), which is a durable,
validated, screened artifact — not by a summarisation of the transcript.

### The predicate

A cut is **safe** when every one of these holds. Each is mechanically checkable
from state the pipeline already owns, and each failure names its own remedy.

| # | Condition | Source | Remedy when it fails |
|---|---|---|---|
| 1 | No dispatch in flight | the dispatch-budget guard's per-agent state under `.git/agent-pipeline/` | wait, or let the dispatch close out |
| 2 | Working tree clean | `git status --porcelain` empty | commit the work |
| 3 | No unreconciled status-flip debt | `reconcile-backlog-ledger.mjs` reports nothing pending | reconcile, then commit the ledger |
| 4 | No outstanding HEAD-bound PO command | the human-guard-override request store | let the ceremony return first |
| 5 | Handover reflects current state | `docs/state.md` against HEAD | update the handover |
| 6 | At a package boundary | `pipeline-state.mjs inspect` — `nextAction`, active package/feature | finish the package, or capture a Resume-Hint card |

Conditions 1–4 are **loss conditions**: cutting while one of them fails destroys
or strands work. Conditions 5–6 are **continuity conditions**: cutting is safe
but the next session starts colder than it needs to.

### What the hook emits

Advisory only. It never blocks, never demands, and emits no decision field —
that property is now pinned by the regression sweep in
`stop-suggest.test.mjs`, and this decision does not reopen it.

- All six hold → one line: a cut is safe now, and whether a Resume-Hint card is
  worth capturing first.
- A loss condition fails → say nothing about cutting at all. Naming the
  remedy for condition 2 or 3 is the surviving phase/gate suggestion's job, and
  duplicating it here is the chatter this hook already paid for once.
- Only continuity conditions fail → a cut is safe, and here is what to persist
  first.

### What is deliberately not built

**No learned heuristic, no scoring, no threshold anywhere.** The predicate is
deterministic and each term is independently checkable. A model that guesses at
the right moment is unfalsifiable, cannot say why it fired, and re-introduces
exactly the property that made the old tiering hard to trust.

**No automatic cut.** The hook recommends; the human decides. An agent that
clears its own context is an agent that discards state on its own judgement, and
this repository's whole evidence discipline exists because that judgement is not
reliably good.

**No token count in the message.** Removed 2026-09-04 by PO decision; this
decision does not bring it back through a side door.

## Consequences

**Positive.** The recommendation becomes actionable rather than nagging: it
either says "safe now" or names one blocking condition. It reuses the
Resume-Hint card instead of inventing a second continuity mechanism. It cannot
misfire on a window size it was not calibrated for, because it reads no window
size. And it points at the cheaper operation.

**Negative.** Condition 1 needs the dispatch-budget guard's state to be readable
from the Stop hook, which is not established here — see Open questions. The
predicate is also conservative: it will stay silent through long stretches of a
session that has uncommitted work by design, which is the correct behaviour but
means the recommendation appears rarely.

**Neutral.** `hooks.json` is untouched. Hook 6 stays registered exactly as it
is; only what it computes changes. Its TP-4-protected `$comment` already owes a
correction for the removal (recorded in
`backlog/evidence/2026-09-03-suite-registration-ceremony-package.md`) and this
decision adds nothing further to that debt.

## Open questions, to be answered before implementation

1. **Can a Stop hook read the dispatch-budget state?** The guard writes per-agent
   counters under `.git/agent-pipeline/`, but whether an in-flight dispatch is
   distinguishable there from a finished one — and whether the Stop hook's own
   input carries enough identity to ask — is unmeasured. If it cannot,
   condition 1 is unavailable and the predicate must fail closed: no
   recommendation rather than a wrong one.
2. **What exactly is a package boundary (condition 6)?** `pipeline-state.mjs
   inspect` returns `nextAction` and the queue head. Which transitions count as
   a boundary is a judgement this draft does not make.
3. **Is condition 5 checkable at all, or only observable?** "The handover
   reflects current state" has no mechanical test today; the nearest proxy is
   whether `docs/state.md` changed since the last commit that touched tracked
   work. A proxy that is wrong in either direction is worse than dropping the
   condition.
4. **Does the recommendation belong in the Stop hook at all?** The Stop hook
   fires after every turn. A recommendation that is only ever true at a boundary
   might belong at the boundary instead — emitted by whatever closes a package —
   where it would fire once rather than being suppressed hundreds of times.

Question 4 is the one that could change the shape of this decision, and it
should be answered first.
