---
schema: pipeline.backlog-item.v1
id: pipeline.gg20-refuses-reading-the-hooks-path
type: defect
owner: pipeline
status: open
created: 2026-10-20
source: "Elephant observation, 2026-10-20: `git config --get core.hooksPath` was refused with GG-20 while checking which commit-msg hook a PO terminal commit meets"
sprint: none
done_when: manual
---

# GG-20 refuses reading the hooks path

## Description

`hooks/guard-git.mjs` rule GG-20 blocks `git config core.hooksPath` as a persistent rebinding
that would disable hooks. It also blocks the read-only `git config --get core.hooksPath`, and it
has no override. An agent that needs to know whether a hook path is configured has to read the
config file itself. Reading `.git/config` is allowed, but it is a detour that the refusal does
not name.

## Acceptance

- `git config --get core.hooksPath` (and `--get-all`, `--show-origin`) is admitted as a read.
  Every write form stays blocked.
- Otherwise the refusal names a read route that is admitted.
