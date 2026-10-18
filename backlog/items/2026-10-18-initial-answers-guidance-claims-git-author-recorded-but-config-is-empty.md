---
schema: pipeline.backlog-item.v1
id: pipeline.initial-answers-guidance-claims-git-author-recorded-but-config-is-empty
type: defect
owner: pipeline
status: open
created: 2026-10-18
source: "real greenfield project report 2026-10-18 (PF-04)"
sprint: none
done_when: manual
---

# Initial-answers guidance says the Git author is recorded, but the local config is empty

## Description

The guidance after the initial answers says it "records the repository-local Git author". After
`INITIAL-ANSWERS-APPLIED`, `git config --local --list` showed no `user.name` or `user.email`,
and the checkpoint reported `gitAuthor: null`. A different piece of guidance says the values
should be set only immediately before the first commit.

## Triggering situation

`onboarding-init.mjs ... --git-author-name ... --git-author-email ...`, then
`git config --local --list`, in a real greenfield project. Code: `scripts/onboarding-init.mjs`.

## Proposal

Pick one behavior (record at init, or defer to the first commit) and make the guidance text,
the checkpoint field and the config state agree.

## Acceptance

- The guidance wording matches what the command actually writes.
- A test asserts the local config and `gitAuthor` after the initial answers are applied.
