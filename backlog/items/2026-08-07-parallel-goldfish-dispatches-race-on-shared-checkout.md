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
taken at dispatch start. Two concrete failure modes were observed in the
same wave:

1. **Silent commit sweep.** Two dispatches (`NOVA-A12A14-EVIDENCE-1` and a
   sibling) both touched `issue-acceptance-matrix.md` (different rows).
   Whichever committed second implicitly picked up the first dispatch's
   already-staged row edit too, because both edits lived in the same
   working-tree file at commit time. Benign here (content was correct,
   just misattributed to the wrong commit's diff/`Dispatch:` trailer), but
   it means per-dispatch evidence/authorship attribution (the trailer's
   whole purpose per the template) is not reliable under parallel dispatch.
2. **Shared-filename clobber.** Two dispatches (`NOVA-A8-EVIDENCE-1` and
   `NOVA-A56-EVIDENCE-1`) were separately briefed to write
   `dispatch-record.json` into the same evidence subdirectory
   (`specs/sprint-nova-epic/evidence/nova-a/a6/`), each mirroring an
   established naming pattern that assumed one dispatch per slice-folder.
   The second write clobbered the first. The losing dispatch additionally
   attempted a `git commit -- <paths>` that picked up the *other* dispatch's
   already-staged files (mode 1 above), detected it via `git show --stat`,
   and self-corrected with a local `git reset --soft HEAD~1`. It then
   reported honestly that nothing landed — but its own evidence file and
   matrix-row edit remained correct on disk, just orphaned (the file was
   gitignored and untracked, and the matrix edit had, unknown to it,
   already been swept into a third dispatch's commit by mode 1). The
   Elephant had to reconcile this by hand after the fact (two recovery
   commits, `4a62379`/`d075aa9`).

Neither incident lost data or corrupted committed content — both were
caught and reconciled — but both were luck-adjacent: mode 1 could just as
easily have dropped a real edit if the two writes had raced differently
(e.g. simultaneous `git commit` rather than sequential), and mode 2 required
the losing dispatch to notice the collision itself and self-correct rather
than blindly committing over the other's work.

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

## Triage (filled in by the Elephant of the next Pipeline session)

Not yet triaged. Filed same-wave as the incidents, at the point of
reconciling them, per this repo's "persist immediately" rule rather than
leaving it only in chat history.
