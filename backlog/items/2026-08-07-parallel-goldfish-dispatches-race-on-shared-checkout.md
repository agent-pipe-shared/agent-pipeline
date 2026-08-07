---
schema: pipeline.backlog-item.v1
id: pipeline.parallel-goldfish-dispatches-race-on-shared-checkout
type: defect
owner: pipeline
status: open
created: 2026-08-07
source: "Observed live during a 2026-08-07 wave of five parallel Nova A evidence-sealing Goldfish dispatches, each briefed 'Worktree: no' on the reasoning that their file scopes were disjoint."
due: 2026-09-06
expires: 2026-09-06
---

# Parallel Goldfish dispatches without worktree isolation race on shared files

## Description

Dispatching multiple Goldfish subagents in parallel into the same physical
checkout (no `git worktree` isolation) races on any file more than one
dispatch touches — even when each dispatch's *primary* scope is disjoint,
because the goldfish-task template's own commit discipline
(`git add -- <exact paths>` then `git commit -- <same paths>`) re-adds
whatever the *working tree* currently holds for those paths, not a snapshot
taken at dispatch start. **Corrected 2026-08-07, same day:** this item
originally described the observed effects as "benign" / "no data lost."
That was wrong for one of the three actual incidents in the same wave —
corrected below after directly re-verifying committed state against every
dispatch's own final report, rather than trusting the reports alone.

Three concrete incidents, same wave, in probable causal order:

1. **Benign commit sweep (no loss).** `NOVA-A29-EVIDENCE-1`'s matrix-row
   edit landed inside `NOVA-A56-EVIDENCE-1`'s commit (`196b32c`) instead of
   its own commit (`805797a`), because both edits lived in the same
   working-tree file at commit time. Content correct, just misattributed to
   the wrong commit's diff/`Dispatch:` trailer — per-dispatch authorship
   evidence (the trailer's whole purpose) is not reliable under parallel
   dispatch, but nothing was lost.
2. **A real commit destroyed by another dispatch's self-correction
   (actual data loss, recovered by hand).** `NOVA-A12A14-EVIDENCE-1`
   completed and made a real standalone commit (`8e57205`, its own
   matrix-row edit + two evidence files). `NOVA-A8-EVIDENCE-1`, running
   concurrently, later ran its own `git commit -- <its own paths>`, found
   unexpected content in the result (evidently including `#12`/`#14`
   material still present in the shared working tree/index), concluded
   *its own* commit was contaminated, and ran `git reset --soft HEAD~1` to
   undo what it believed was its own mistake. **This actually discarded
   `8e57205` — a different dispatch's real, completed, correct commit —
   from branch history**, not just its own erroneous one; the subagent had
   no way to distinguish "my commit picked up someone else's staged
   content" from "someone else's real commit is sitting at HEAD" before
   resetting. The content survived only as orphaned, gitignored, untracked
   files on disk (`git ls-files` for the target directory returned empty;
   the matrix still carried the pre-dispatch text). Found and recovered by
   the Elephant only because closing out the wave included directly
   re-verifying every dispatch's claimed result against committed state,
   not because any dispatch flagged it (`463df63`).
3. **Shared-filename clobber, evidence recoverable (no loss, but required
   manual reconciliation).** `NOVA-A8-EVIDENCE-1` and `NOVA-A56-EVIDENCE-1`
   were separately briefed to write `dispatch-record.json` into the same
   evidence subdirectory (`specs/sprint-nova-epic/evidence/nova-a/a6/`),
   each mirroring an established naming pattern that assumed one dispatch
   per slice-folder. `#56`'s write landed; `#8`'s own evidence file and
   matrix-row edit were left uncommitted after incident 2's revert cascade
   and were never committed by any dispatch. Recovered by hand
   (`4a62379`/`d075aa9`).

**The load-bearing finding is incident 2, not incidents 1/3:** a subagent
performed a history-altering operation (`git reset --soft`) on a shared
branch based only on its own local, incomplete view of concurrent state,
with no way to tell "this is my own bad commit" from "this is someone
else's real, finished work sitting at HEAD right now." That is a
structural gap in the dispatch discipline, not a one-off mistake by that
specific run — any future parallel-dispatch wave where one subagent
self-corrects via reset is exposed to the same risk, and unlike incidents
1/3 (recoverable orphaned files), a hard `git reset --hard` or a push in
between would have made this unrecoverable.

## Triggering situation

Live, this session, dispatching five Goldfish agents in parallel to seal
Nova A per-issue evidence (`#38`, `#8`, `#12`/`#14`, `#56`, `#29`), each
briefed with `Worktree: no` on the (partially wrong) reasoning that disjoint
*primary* file scope meant no collision risk. The shared
`issue-acceptance-matrix.md` (touched by every dispatch, one row each) and
the shared per-slice `dispatch-record.json` convention (one file per
directory, but two dispatches landed in the same directory) were the actual
collision surfaces, not the primary implementation files.

## Affected artifact

`templates/prompts/goldfish-task.md` (the commit-discipline instructions and
the `dispatch-record.json` naming convention in field 6, which assumes one
dispatch per evidence directory); the Elephant's own dispatch-briefing
practice of setting `Worktree: no` based only on primary-file-scope
disjointness rather than also checking shared-file exposure (this exact
matrix file, this exact per-directory record convention).

## Proposal

Not designed here. Candidates for a future session:

1. Require `dispatch-record.json` to be named per-task
   (`dispatch-record-<taskId>.json` or a `dispatch-records/` subdirectory)
   in the template itself, rather than a fixed filename assumed unique per
   directory — removes failure mode 2 structurally.
2. For any dispatch wave where multiple Goldfish will edit the *same*
   tracked file (even different sections/rows), either serialize those
   specific edits, or brief each dispatch to touch only a per-task scratch
   file and have the Elephant merge the shared file afterward, rather than
   trusting concurrent working-tree commits to interleave safely.
3. Reconsider the `Worktree: no` heuristic: the real question is not "do
   the dispatches' *primary* files overlap" but "does *any* file either
   dispatch will `git add`/write to overlap, including shared tracking
   documents and shared-directory conventions."
4. **Forbid unverified `git reset`/history-altering self-correction by a
   Goldfish dispatch outright** — the template's stop-condition discipline
   already says "more than 2 failed attempts... report the failure state";
   a subagent that suspects its own commit is contaminated should stop and
   report the exact commit SHA and diff it's unsure about, never
   unilaterally reset HEAD on a branch it does not exclusively own. This
   would have converted incident 2 into a clean stop-and-report instead of
   silent history loss.

## Triage (filled in by the Elephant of the next Pipeline session)

Not yet triaged. Filed same-wave as the incidents, at the point of
reconciling them, per this repo's "persist immediately" rule rather than
leaving it only in chat history.
