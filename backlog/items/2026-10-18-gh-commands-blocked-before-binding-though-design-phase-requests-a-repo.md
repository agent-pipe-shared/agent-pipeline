---
schema: pipeline.backlog-item.v1
id: pipeline.gh-commands-blocked-before-binding-though-design-phase-requests-a-repo
type: defect
owner: pipeline
status: open
created: 2026-10-18
source: "real greenfield project report 2026-10-18 (PF-07)"
sprint: none
done_when: manual
---

# `gh` commands are blocked before binding although the design phase asks for a repository

## Description

Before binding, every `gh` command is refused with `GUARD-LIFECYCLE-NOT-READY`, even a read
such as `gh repo view`. The PO had explicitly requested a remote repository during the design
phase, so creating it is only possible after binding.

## Triggering situation

`gh repo view ...` in status `bootstrap-binding-required`, real greenfield project. Guard:
`hooks/guard-lifecycle-ready.mjs`.

## Proposal

Admit read-only `gh` shapes (`repo view`) before binding, or document in the design-course
reference that remote creation waits until after binding.

## Acceptance

- Read-only `gh repo view` is admitted before binding, or the reference states the ordering.
- A test pins the chosen behavior.
