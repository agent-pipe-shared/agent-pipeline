---
schema: pipeline.backlog-item.v1
id: pipeline.guard-push-refuses-read-only-git-without-push
type: workflow-improvement
owner: pipeline
status: open
created: 2026-10-09
source: "toil log 2026-10-06-07, row T85"
sprint: alfred
done_when: manual
due: 2026-10-31
---

# guard-push refuses read-only git invocations that contain no push

## Description

guard-push refuses read-only git invocations that contain no `push`: `git --version` is refused ("only git
[-C <path>] push is accepted; other global repository overrides are ambiguous"), and so is every
`wsl.exe -e bash -lc "... git ..."` command text. Same family as toil row T80.

## Triggering situation

Toil row T85 (2026-10-08 late): the BASELINE-EV dispatch could not run `git worktree add` under WSL. A worktree made
on the Windows side carries a Windows-drive gitdir pointer that WSL git cannot read, so candidate-bound evidence for
older SHAs was impossible. Cost: 1 dispatch stopped (BASELINE-EV), 1 Elephant call.

## Affected artifact

guard-push (the push classification in the git guard union).

## Proposal

guard-push classifies only an actual `push` subcommand (after global options) as a push. `--version`/`version` and a
nested shell's non-push git verbs never reach it. Pin both with tests.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
