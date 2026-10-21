---
schema: pipeline.backlog-item.v1
id: pipeline.the-agy-installer-writes-a-machine-path-into-a-tracked-file
type: defect
owner: pipeline
status: open
created: 2026-10-21
source: "coverage-gaps-2026-10-19.md (Measurement gaps: 'It needs a backlog item (an installer must not write a machine path into a tracked file)'); 2026-10-21 coverage read found no item for it"
sprint: alfred
done_when: manual
---

# The Antigravity installer writes an absolute machine path into a tracked file

## Description

Antigravity installer option 2 (global topology refresh) ran `refreshed` on both PO machines on
2026-10-19. Its workspace-registry rebind rewrote the tracked `.agents/plugins.json` to an
absolute path of that machine. The edit was left uncommitted, and the working rule since then is
"never commit `.agents/plugins.json`". The project rule in `CLAUDE.md` forbids machine-specific
absolute paths in tracked files, because this repository runs on two machines with different
local paths. The installer produces exactly that content in a tracked file.

The existing item `a-push-leaves-the-next-item-dispatch-refused` records the same file as a
second dirty tracked path that makes `AGY-HOST-BASELINE-DIRTY` refuse an item dispatch. That item
covers the refusal text and the approval record. It does not cover the cause: the installer
writing a machine path into a tracked file. Whether a consumer repository tracks the file has not
been measured.

## Triggering situation

`install-agy` option 2 on a machine whose checkout path differs from the path already recorded in
the tracked file. Observed twice on 2026-10-19; the file differs from HEAD afterwards.

## Affected artifact

The Antigravity installer's workspace-registry rebind (its writer was not located in this read:
`plugins/pipeline-core` has no `workspace-registry-rebind` string; look in the installer entry
points and `scripts/`), and the tracked `.agents/plugins.json`.

## Proposal

Pick one, with the PO:

1. Keep the file untracked and ignored (`.gitignore` entry), so the installer's machine-local
   output never reaches `git status`.
2. Keep it tracked with a path-free (repo-relative) content and have the installer write the
   machine-specific binding to a machine-local file outside the work tree.
3. Make the installer refuse to rewrite a tracked file and name the machine-local route.

Whichever is chosen, the dirty-baseline refusal of the dependent item then no longer has this
cause.

PO decision 2026-10-21 (tile): option 2, and it must be FIXED in 0.7.0, not only filed (an installer
that dirties a tracked file with a machine path must not ship). Cause located by a read-only
analysis (`scratch/analysis/installer-machine-path-fix-design.md`): `refresh()` in
`lib/antigravity-topology-refresh-host.mjs` (lines 140-168) rebinds the workspace registry to the
absolute runner-view root (`workspace-registry-rebind`), and the final readback (169-170) forces
every Pipeline entry to equal that root. Option 1 (scope `workspace`) has the same defect outside
this repository. Whether Antigravity resolves a relative `entries[].path` against the workspace
root is UNVERIFIED and needs a read-only probe on the PO's real host before the stamp.

## Acceptance

- After `install-agy` option 2, `git status --porcelain` shows no change to a tracked file.
- A pin runs the rebind with a checkout path different from the recorded one and asserts that no
  tracked file receives an absolute path.
- The tracked-file question for consumer repositories is measured and recorded.
