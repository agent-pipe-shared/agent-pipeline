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

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
