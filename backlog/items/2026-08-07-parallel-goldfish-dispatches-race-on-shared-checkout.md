---
schema: pipeline.backlog-item.v1
id: pipeline.parallel-goldfish-dispatches-race-on-shared-checkout
type: defect
owner: pipeline
status: closed
created: 2026-08-07
source: "Observed live during a 2026-08-07 wave of five parallel Nova A evidence-sealing Goldfish dispatches, each briefed 'Worktree: no' on the reasoning that their file scopes were disjoint."
due: 2026-09-06
expires: 2026-09-06
closed_at: "2026-08-18"
closure_repository: "self"
closure_commit: "55912293385c595109abffad3442661bb1166956"
closure_evidence: "backlog/items/2026-08-07-parallel-goldfish-dispatches-race-on-shared-checkout.md"
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

## Second occurrence — 2026-08-09, PHX-WP-DOC-1 / PHX-WP-DOC-2

Two Goldfish dispatches (`PHX-WP-DOC-1`, `PHX-WP-DOC-2`), both briefed
`Worktree: no`, both writing prose to disjoint *primary* doc files but
sharing the one physical checkout. `WP-DOC-1`'s first commit attempt
(`ad0b83c`) swept `WP-DOC-2`'s four already-`git add`-ed files in alongside
its own three — the exact collision surface Proposal #3 above already names
("does *any* file either dispatch will `git add`/write to overlap"), except
this time the *shared* surface was the working tree's staging area itself,
not a named shared file.

`WP-DOC-1` then ran an *unverified* `git reset --soft HEAD~1` on `ad0b83c`
to un-bundle its own commit — the exact action Proposal #4 says to forbid
outright. This time the guess was right: `ad0b83c` was `WP-DOC-1`'s own
freshly-made commit, not a concurrent dispatch's finished, independent work
(contrast incident 2 above, where the reset destroyed someone else's real
commit). `WP-DOC-2`'s content survived, uncommitted, in the working tree;
the Elephant found and committed it separately afterward (`3f09bed`) once
both dispatches' final reports were reconciled by hand.

**This does not contradict Proposal #4 — it is exactly the risk it names,
that happened to resolve safely.** A Goldfish dispatch has no reliable way
to distinguish "the commit I just made accidentally absorbed someone else's
staged edits" from "a concurrent dispatch already landed its own real,
finished commit and I am now looking at legitimate shared-branch state" —
both incidents this item now documents involved a subagent making that call
correctly once and incorrectly once, from inside the same blind spot.
Two live incidents from the same unverified-self-correction root cause is
enough evidence that this proposal should not wait indefinitely for triage.

## Third occurrence — 2026-08-12, PHX-WP-PX0AC13-FAILCLOSED / PHX-WP-PX0AC05-AR05G

Two Goldfish dispatches, both briefed `Worktree: no` on disjoint primary
files (`ruleset-freshness.mjs`/`.test.mjs` vs.
`harness/scripts/pipeline-state.test.mjs`), both explicitly warned in their
briefings about the shared checkout and instructed to bundle
stage+commit as one shell call. AR05G's first commit (`979e579c`) landed
correctly-scoped but with a bare subject line — the multi-line body and
required commit trailer couldn't be composed as a single `-m` under the
closed shell grammar (a real, separate gap: the template's own final-report
instructions assume a trailer is easy to attach in one commit, but say
nothing about what to do when the shell grammar itself can't express a
multi-line `-m` in one call). AR05G then ran an *unscoped*
`git commit --amend -F <msgfile>` to attach the missing trailer — between
its two commands, FAILCLOSED had committed on top of it, so the unscoped
amend landed on FAILCLOSED's commit instead of AR05G's own, swapping their
messages/trailers (content of each commit stayed correct; only the
message/trailer pairing was wrong). Recovered by the Elephant via
`git commit-tree` (content-preserving, no working-tree interaction) to
rebuild both commits with correct pairing — but the actual branch-ref move
to point at the corrected commits was refused by two independent guard
layers (`guard-git.mjs` GG-07, the runner's own auto-mode classifier), both
correctly treating an AFK agent force-moving a branch pointer as requiring
a human in the loop. Left as a disclosed, content-safe provenance anomaly
for the PO to resolve at their convenience (`docs/state.md`, 2026-08-12
checkpoint) rather than a blocker.

**This occurrence is the clean confirmation Proposal #4 asked for.** Both
dispatches this time correctly refrained from a *second* unverified
self-correction once they noticed something was wrong — AR05G explicitly
reasoned "either risks racing the still-possibly-live other dispatch a
second time" and stopped to report instead, and FAILCLOSED likewise
reported rather than guessing at a fix. Contrast the second occurrence
above, where `WP-DOC-1` reset anyway and got lucky. Three live incidents,
one clean stop-and-report this time, is strong evidence Proposal #4
(forbid unverified reset/history-altering self-correction outright, stop
and report the exact SHA instead) is the right fix and should be formalized
into the template rather than left as dispatch-briefing prose.

## Triage — 2026-08-18

- **Decision:** accepted as still open, dispatch-ready — not closed, not deferred.
- **Rationale:** Re-checked against current Phoenix source. The load-bearing defect (Proposal #4: a Goldfish dispatch may run an unverified `git reset --soft`/history-altering self-correction on a shared checkout, which incident 2 shows can silently discard another dispatch's real, finished commit) is still live: `guardrails/git.md` GG-04 blocks `reset --hard` but not `reset --soft`; neither `templates/prompts/goldfish-task.md` nor `roles/goldfish.md` GF-07 (stop conditions) mentions forbidding unverified reset/history-altering self-correction. Checked the sibling Nova checkout for the same gap: Nova has independently ported Proposal #1 (per-task `dispatch-record-{{TASK_ID}}.json` naming, `templates/prompts/goldfish-task.md:237`, closing incidents 1/3's collision surface) but has NOT implemented Proposal #4 either — so this is not a case of "already solved in Nova, skip it"; the core fix is unbuilt in both repos.
- **Assignment (if accepted):** Two bounded, independent dispatches, neither requiring a PO design call: (1) add a Proposal #4 forbidden-action/stop-condition to `roles/goldfish.md` GF-07 and mirror it in `templates/prompts/goldfish-task.md` ("never run `git reset`/other history-altering self-correction on a shared checkout without first verifying via `git log`/`git show` that the commit being touched is your own — stop and report the exact SHA instead"); (2) adopt Nova's per-task `dispatch-record-<taskId>.json` naming convention (Proposal #1) in Phoenix's own template, replacing the fixed `dispatch-record.json` name at `templates/prompts/goldfish-task.md:132`.
- **Date:** 2026-08-18

## Triage — closed 2026-08-18

- **Decision:** closed — resolved.
- **Rationale:** `templates/prompts/goldfish-task.md:115` (unverified history-altering self-correction stop condition) and `:133` (per-task `dispatch-record-{{TASK_ID}}.json` naming, replacing the collision-prone fixed filename), mirrored in `roles/goldfish.md:72` (GF-07). Landed commits `55912293`/`562a2a91`.
- **Date:** 2026-08-18
