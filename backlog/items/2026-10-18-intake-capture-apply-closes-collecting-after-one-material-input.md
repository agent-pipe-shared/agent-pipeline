---
schema: pipeline.backlog-item.v1
id: pipeline.intake-capture-apply-closes-collecting-after-one-material-input
type: defect
owner: pipeline
status: open
created: 2026-10-18
source: "real greenfield project report 2026-10-18 (PF-03)"
sprint: none
done_when: manual
---

# `intake-capture-apply` closes the collecting stage after one material input

## Description

After a single `intake-capture-apply`, the checkpoint moves straight to
`design-questions-pending`. The intake reference describes capture as "repeated until the PO
signals done", but the flow offers no second material input once the checkpoint has moved on.

## Triggering situation

`intake-consent-apply`, then one `intake-capture-apply --text-file ...` in a real greenfield
project. Code: `lib/onboarding-continuity.mjs`; reference: `references/intake-generate-design.md`.

## Proposal

Either keep the checkpoint in collecting until the PO signals completion, or change the
reference to state that one capture closes collecting and describe how additional material is
added afterwards.

## Acceptance

- Code and reference agree on whether capture repeats.
- If it repeats, a test applies two captures and the checkpoint stays collecting after the first.
