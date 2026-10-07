---
schema: pipeline.backlog-item.v1
id: pipeline.vim-es-and-busybox-heredoc-runners-are-data-to-the-push-classifier
type: defect
owner: pipeline
status: open
created: 2026-10-07
source: "Critic Q12 delta 1, finding F-E (specs/sprint-alfred-epic/evidence/critic-2026-10-07/q12-delta1.md)"
sprint: alfred
done_when: manual
due: 2026-10-20
---

# vim/vi `-es` and busybox applets fed a heredoc are data to the push classifier

## Description

Decision AF closed the list of command runners whose heredoc input is classified like a shell's. `vi`/`vim -es`
(ex mode reading commands from stdin, where `!git push …` runs a shell command) and `busybox` applets (`busybox sh`,
`busybox ash`) are not on that list, so `vim -es <<EOF` ⏎ `!git push origin main` ⏎ `EOF` is not a push candidate.
The classifier header names the gap in a comment only.

## Triggering situation

Critic Q12 delta 1 measured `commandIsGitPush("vim -es <<EOF\n!git push origin main\nEOF")` → false.

## Affected artifact

`plugins/pipeline-core/lib/git-cmd.mjs` (heredoc receiver list), `plugins/pipeline-core/lib/git-cmd.test.mjs`.

## Proposal

Extend the AF receiver list with `vi`/`vim`/`ex` in silent/ex mode (`-e`, `-es`, `-E`) and `busybox <shell-applet>`;
test-only pins first, then the fix. Owner: pipeline; due 2026-10-20.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted.
- **Rationale:** same class as decision AF; a documented gap without an owner is a QG-06 finding.
- **Assignment (if accepted):** Q12 lane, with the delta-1 pins (Q12-T9) and fix (Q12-F7).
- **Date:** 2026-10-07
