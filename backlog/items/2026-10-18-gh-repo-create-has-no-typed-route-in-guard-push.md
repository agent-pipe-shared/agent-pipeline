---
schema: pipeline.backlog-item.v1
id: pipeline.gh-repo-create-has-no-typed-route-in-guard-push
type: defect
owner: pipeline
status: open
created: 2026-10-18
source: "real greenfield project report 2026-10-18 (PF-12)"
sprint: none
done_when: manual
---

# `gh repo create` has no typed route in `guard-push`

## Description

Even in status `ready`, `guard-push` refuses `gh repo create <owner>/<name> --private` as
`DELIVERY-GH-UNCLASSIFIED`. No typed route and no human override is offered, so the remote
repository the PO asked for cannot be created by the agent; the PO had to create it.

## Triggering situation

`gh repo create <owner>/<name> --private` after binding in a real greenfield project. Guard:
`hooks/guard-push.mjs`.

## Proposal

Classify `gh repo create` as a delivery action with an approval route (or an explicit
human-override route), so a PO-requested remote can be created under a recorded approval.

## Acceptance

- `gh repo create` is classified and either admitted under an approval or refused with a typed
  retry action naming the human route.
- A guard test covers the classification.
