---
schema: pipeline.backlog-item.v1
id: pipeline.draft-phase-blocks-commit-and-unstage-of-po-concept-files
type: defect
owner: pipeline
status: open
created: 2026-10-18
source: "real greenfield project report 2026-10-18 (PF-13)"
sprint: none
done_when: manual
---

# Draft phase blocks committing and unstaging concept files the PO placed in the repository

## Description

Concept files the PO placed in the repository (a concept folder) could not be committed in the
design phase: the commit-msg hook refused with `GUARD-DEVPLAN-LIFECYCLE`. They also could not
be removed from the index with `git restore --staged <path>`, which is classified as a
working-tree write with no override. Only a path-less `git reset` helped. Adding an entry to
`.gitignore` (for example for Windows zone-identifier files) is blocked in `draft` as well.

## Triggering situation

`git add <concept folder>/...`, commit, then `git restore --staged <concept folder>` in lifecycle
`draft`. Guards: `hooks/guard-devplan.mjs` and the commit-msg hook.

## Proposal

Classify `git restore --staged` as an index-only operation, admit commits of PO-supplied
material under the design-phase exempt prefixes, and allow `.gitignore` edits in `draft`.

## Acceptance

- `git restore --staged <path>` is not treated as a working-tree write.
- A concept folder can be committed or unstaged in `draft` without a path-less reset.
- Tests pin both shapes.
