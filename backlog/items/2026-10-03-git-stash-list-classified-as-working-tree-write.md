---
schema: pipeline.backlog-item.v1
id: pipeline.git-stash-list-classified-as-working-tree-write
type: defect
owner: pipeline
status: open
created: 2026-10-03
source: "Manual observation, Claude Code session on Windows, 2026-10-03, feat/sprint-alfred at a0d83ce78, lifecycle draft."
sprint: alfred
done_when: manual
---

# `git stash list` is classified as a working-tree write

## Description

`git stash list` is a read-only listing, yet the draft-phase gate refuses it
with `GUARD-DEVPLAN-SHELL`, lane `git-working-tree-write`, and reports the
subcommand argument `list` as the written `File:`. The `stash` subcommand is
apparently treated as mutating as a whole, without distinguishing its read-only
forms (`list`, `show`). The recovery handover explicitly requires the next
session to recheck the local stash, so this blocks a mandated re-entry step.

Related parser symptom, same session: for a refused
`sed -i "s#^ ... \"docs/...\",#&\n ...#" governance/observation-doc-governance.json`
the denial reported the mangled sed expression (with wrongly stripped quotes) as
the written `File:`, not the real target file. Both cases show that the
write-lane classifier picks the wrong operand as the target. The denial text
then misleads the agent about what was refused.

## Triggering situation

Re-entry check from `docs/0.7-recovery-2026-10-03.md` ("Recheck HEAD, clean
status, the local stash").

## Affected artifact

Git subcommand classification in `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs`
and the shared command grammar (`hooks/guard-command-grammar.mjs`).

## Proposal

Classify `git stash list` and `git stash show [<stash>]` (with a closed option
set, no `--output`) as read-only. Keep every mutating `stash` form in the
write lane. Add positive and negative tests.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** deferred past the 0.7.0 candidate (PO decision, 2026-10-16). The item stays open.
- **Rationale:** the PO chose to ship the 0.7.0 local test candidate without this guard classification change, not to drop it.
- **Assignment (if accepted):** next sprint after 0.7.0; AC-181 is not counted against the 0.7.0 candidate.
- **Date:** 2026-10-17

## Observed 2026-10-18: real greenfield project, Claude on WSL (PF-16)

Same family, different command: in lifecycle `draft`, `guard-devplan` read the sed expression
of `sed -i -e '<expr>' -e '<expr>' specs/<feature>/<file>.md` as the write target (reported as
"File: s/^..."), and refused it with `GUARD-DEVPLAN-SHELL`. The real target was under `specs/`,
where draft-phase writes are allowed. The workaround was the Edit tool; no override was used.
The path detection of the `write-command` classifier misparses sed arguments.

### Blocker analysis 2026-10-22

Read-only survey of the open clauses that the delivery remeasure assigned to native-host, verify-wsl, po-decision or po-signature (evidence: `specs/sprint-alfred-epic/evidence/blocker-analysis-2026-10-22/`). Status key: LINUX-RUN and WINDOWS-INTEROP-RUN are runs an agent can do from the WSL host; HOST-SESSION-NEEDED, PO-DECISION and PO-SIGNATURE are not agent work.

- **DEFERRED** — Triage defers the item past the 0.7.0 candidate (2026-10-17); confirm whether it counts for this delivery
  Already answered by the recorded PO decision of 2026-10-16 (item Triage, 2026-10-17): deferred past 0.7.0, AC-181 is not counted against the candidate. No new decision is needed.

## Reconciled 2026-10-23

Text sweep K59-BACKLOG-TEXT-SWEEP-3. Superseded sentences above, kept as history:

- Triage "deferred past the 0.7.0 candidate ... The item stays open", Description ("`git stash list` is classified as a
  working-tree write") and Proposal: both defects named here are fixed in the source tree although the item itself is
  still `open` for acceptance. The PO deferral decision of 2026-10-16 is a statement about the candidate scope and is not
  withdrawn; it no longer describes the state of the code.
  - Stash reader: `git stash list`, `git stash show` and `git stash show <ref>` are classified read-only, every
    mutating verb (pop, drop, apply, push, save, clear, branch, create, store) and every output or hostile spelling stay
    outside the reader. Evidence: `plugins/pipeline-core/lib/guard/git-stash-readonly.test.mjs` (GSR001-GSR034, introduced
    in the transfer checkpoint `d02409a8a`), re-run in a clean clone on 2026-10-23: 34 tests, 34 pass, 0 fail, 0 skip.
  - sed target (the PF-16 symptom of the Observed 2026-10-18 section and the "mangled sed expression" in the
    Description): commit `3bbdb7c12` (`fix(guard): name the real file operand of a sed -i write target (PF-16)`) makes the
    draft-phase denial name the real file operand instead of the script, and also closes a fail-open for `sed -i.bak` and
    `sed --in-place=.bak`. The pin `plugins/pipeline-core/lib/pins/git-stash-list-classified-as-working-tree-write.test.mjs`
    was added in `b09dddc88` (33 of 73 cases fail without the fix, 73 of 73 with it; the commit message records that it
    documents the contract and needs the protected fix).
  - Residuals recorded by `3bbdb7c12`, still open: an `&&` chain after a writer is outside the closed grammar and still
    reports every word as a conservative candidate; `perl -i.bak` and `ruby -i.bak` are not detected in the parsed lane.
- The Blocker analysis DEFERRED bullet is unchanged and still true as to the decision.
