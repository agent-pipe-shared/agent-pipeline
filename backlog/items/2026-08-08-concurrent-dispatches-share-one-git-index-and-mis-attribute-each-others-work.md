---
schema: pipeline.backlog-item.v1
id: pipeline.concurrent-dispatches-share-one-index
type: defect
owner: pipeline
status: closed
closed_at: 2026-08-11
closure_repository: self
closure_commit: 7003b2fd221a48d583569505c817013cd551397c
closure_evidence: specs/sprint-nova-epic/evidence/backlog/2026-08-11-pareto-triage-report.md
created: 2026-08-08
due: 2026-08-22
source: "Observed directly on 2026-08-08: commit 598a78b, trailered Dispatch: HGOELIG-1 (goldfish), contains a backlog-item edit written by the Elephant and staged seconds earlier."
---

# Concurrent dispatches share one Git index, so one can commit another's work under its own dispatch trailer

## What happened

The Elephant edited a backlog item and staged it. A dispatch running concurrently
in the same checkout committed at that moment and swept the staged file into its
own commit. The result, `598a78b`, carries the trailer
`Dispatch: HGOELIG-1 (goldfish)` and contains 158 lines the dispatch wrote plus 25
lines it never saw.

No content was lost or damaged. What was damaged is the record.

## Why the record matters more than it sounds

The `Dispatch: <ID> (goldfish)` trailer is not decoration. It is the **authorship
evidence** the Critic's trajectory check reads to answer a specific question: did
this production diff come from a dispatched fresh-context session, or from the
orchestrator session itself? An orchestrator-authored production diff outside the
stage-0 fast path is a lifecycle-violation finding of at least major severity.

A commit that attributes the orchestrator's work to a dispatch inverts exactly that
check. The Critic reads a trailer that says "a fresh-context Goldfish wrote this"
about lines the Elephant wrote. The check does not fail; it passes wrongly, which
is worse.

In this instance the swept file was a backlog item, so nothing about the guard
change is misattributed. That is luck, not design — the same race would have swept
a production edit identically.

## Why it happens

The Git index is per-checkout, not per-process. Several dispatches running in the
same working tree share one staging area, so `git commit` without an explicit path
list commits whatever anyone staged. Briefings tell dispatches not to *stage* files
they do not own — and this dispatch obeyed that; it staged only its own — but a
commit with no path limit does not consult the briefing.

Note the interaction with a practice adopted in the same block: dispatches are now
told to commit **as soon as their suites are green** rather than at the end, to
survive truncation. That is the right instruction, and it makes commits more
frequent, which makes this race more likely. The two are in tension and the tension
should be resolved deliberately rather than discovered again.

## What cannot be the fix

Rewriting history. The commit is on a branch, the repository forbids history
rewriting by hard rule, and there is no version of this worth an exception. The
mis-attribution stands; this item is the correction of record.

## Direction, not a design

1. **Make every dispatch commit with an explicit path list.** `git commit -- <paths>`
   commits exactly what was named regardless of index state. This is the cheap,
   complete fix for the common case, and it belongs in the dispatch templates rather
   than in each briefing.
   Note the known trap in that form, already recorded elsewhere: a path list that
   names only the new side of a rename leaves the deletion staged and uncommitted.
   Whatever is adopted must name both sides.
2. **Consider whether concurrent dispatches should share a checkout at all.** Worktree
   isolation exists and is already used for some flows; it removes the race entirely
   at a real cost in setup time and disk. The trade-off deserves an explicit answer,
   not a default.
3. **Give the Elephant somewhere safe to stage.** Much of the orchestrator's own work
   is documentation and backlog. If it staged and committed in one step, its window
   of exposure would be near zero.
4. **Consider detecting it after the fact.** A commit whose file list is disjoint from
   its dispatch's declared scope is mechanically detectable, and the dispatch record
   already carries that scope.

## Triggering situation

Four to six dispatches running concurrently in one checkout, each committing when
its own suites go green, with the orchestrator also committing documentation and
backlog work between them. Observed once; the exposure existed for every commit in
this block.

## Related

- `2026-08-08-long-dispatches-truncate-before-emitting-their-report.md` — the item
  whose adopted practice (commit early) raises this race's probability.
- [ADR-0014](../../docs/adr/0014-critic-contract.md) — the review contract whose
  authorship check this defect defeats.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
