---
schema: pipeline.backlog-item.v1
id: pipeline.second-writer-check-skips-a-worktree-isolation-that-may-not-be-granted
type: defect
owner: pipeline
status: open
created: 2026-10-22
source: "K39 delivery (guard-side second-writer refusal, D110) and CLAUDE.md note of 2026-08-25 on worktree isolation that was not granted."
sprint: none
done_when: manual
---

# The second-writer check skips a worktree isolation that may not be granted

The guard-side check of `hooks/guard-dispatch.mjs` (build K39, PO decision D110) refuses a second Goldfish writer in a
checkout while an open dispatch record's owner is alive. A dispatch that declares `isolation: "worktree"` (Agent tool
input or inside a Workflow script) is deliberately not checked (PO decision D135, 2026-10-22), because it is assumed to
write in its own worktree.

## Risk

The repository's CLAUDE.md records (2026-08-25) that a dispatch briefed with `isolation: "worktree"` can land directly
in the dispatcher's own checkout when the isolation is not granted. Such a dispatch then writes in the shared checkout
without the second-writer check ever seeing it.

## Proposal

Before skipping the check for a declared isolation, the guard confirms that the isolation was actually granted (for
example the dispatch's reported root is a worktree other than the primary root, `git worktree list`), and otherwise
applies the check. Protected change in `guard-dispatch.mjs` (operator diff).

## Acceptance

- A dispatch that declares worktree isolation but runs in the primary checkout is checked like any other dispatch.
- A dispatch that really runs in its own worktree stays unchecked.
- A regression case in the parallel-work pin covers both.
