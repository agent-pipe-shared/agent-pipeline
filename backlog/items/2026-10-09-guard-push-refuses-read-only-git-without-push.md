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

### Blocker analysis 2026-10-22

Read-only survey of the open clauses that the delivery remeasure assigned to native-host, verify-wsl, po-decision or po-signature (evidence: `specs/sprint-alfred-epic/evidence/blocker-analysis-2026-10-22/`). Status key: LINUX-RUN and WINDOWS-INTEROP-RUN are runs an agent can do from the WSL host; HOST-SESSION-NEEDED, PO-DECISION and PO-SIGNATURE are not agent work.

- **PO-DECISION** (decided: D127) — Acknowledge that the Q12 option B refusal of nested-shell git replaces the item's original second clause as the effective acceptance
  Question: does the shipped Q12 option B (a nested shell naming git stays fail-closed) replace the item's second proposal clause (non-push git verbs in a nested shell never reach guard-push) as the accepted behaviour? The pin already records the supersession (AC-195 point 2).
