---
schema: pipeline.backlog-item.v1
id: pipeline.a-dispatched-agent-cannot-delete-its-own-scratch-files
type: workflow-improvement
owner: pipeline
status: open
created: 2026-10-29
priority: P2
release: 0.7.0
sprint: alfred
source: "Toolbox consumer finding N15 (PO relay, 2026-10-29, from the consumer's handover list of 2026-10-27); not yet reproduced here"
done_when: manual
---

# A dispatched agent cannot delete its own scratch files

## Evidence

A Toolbox agent could not delete the scratch files it had created itself; the closed shell grammar admits writes into `scratch/` and `mkdir -p` there, but no removal. Scratch therefore only grows during a dispatch, and the agent either leaves clutter or asks the Elephant to clean up.

## Wanted

- A narrow, admitted removal for the agent's own scratch files: only regular files, only below the repository `scratch/`, only paths the same session created (or a dedicated per-dispatch scratch subdirectory), never a directory outside it, never a glob outside `scratch/`, never a link.
- OR no removal at all, and the housekeeping job (`scripts/housekeeping.mjs`, backlog `2026-10-29-a-recurring-housekeeping-job-collects-growing-runtime-state.md`) gets a scratch collector so that nobody deletes by hand; the choice is a design decision for the PO (tile), because an `rm` form widens the shell grammar and the guard is a kernel path.

## Acceptance

- Whichever way is chosen: an agent in a dispatch can leave `scratch/` as it found it without a guard refusal, and a pin proves that a path outside `scratch/` or a symlink is still refused.
- If the grammar is widened: held patch under the Guard Maintenance Window, with the negative cases (outside root, outside `scratch/`, directory, glob, symlink) pinned.
