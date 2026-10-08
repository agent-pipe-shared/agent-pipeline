---
schema: pipeline.backlog-item.v1
id: pipeline.push-classifier-does-not-model-powershell-backtick-escapes
type: defect
owner: pipeline
status: open
created: 2026-10-06
source: "GPGL-7 dispatch report (residual gap after the PowerShell literal-backslash reading), 2026-10-06."
sprint: alfred
done_when: manual
---

# The push classifier does not model PowerShell's backtick escape, here-strings or `$(...)` in double quotes

## Description

GPGL-7 added a third reading to `scanShell` in `plugins/pipeline-core/lib/git-cmd.mjs` in which a backslash is always
literal, so PowerShell-executed pushes behind a backslash-terminated path or a `\"` are classified as pushes (Critic
finding F1 in `specs/sprint-alfred-epic/evidence/critic-2026-10-05/gpgl-5-6-delta.md`). PowerShell's own escape
character is the backtick, which this reading does not model, nor here-strings (`@"..."@`, `@'...'@`) or `$(...)`
subexpressions inside double quotes. A shape such as a double-quoted string closed early by a backtick-escaped quote,
followed by a statement that runs `git push`, is likely still classified as not-a-push on the PowerShell route
(static analysis by the implementor; not probed). `guard-push` is wired to the PowerShell tool (`hooks.json` matcher
`Bash|PowerShell`), so the gap is on a live gate lane. Modelling the backtick in every reading would over-detect POSIX
command substitution in double quotes, so it needs its own reading.

## Triggering situation

GPGL-7 (PowerShell literal-backslash reading), open item in its report.

## Affected artifact

`plugins/pipeline-core/lib/git-cmd.mjs`, `plugins/pipeline-core/lib/git-cmd.test.mjs`.

## Proposal

Extend the PowerShell reading: backtick escapes the next character (outside single quotes), here-strings are one span,
`$(...)` inside double quotes is scanned as a nested command; pin the shapes as push cases; keep the fail-closed rule
(any reading a push → push). Alternatively, on the PowerShell tool lane fail closed whenever a backtick, here-string
marker or `$(` co-occurs with a git word at an executable boundary. Due before the 0.7.0 release candidate.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** fixed in source — closes after the 0.7.0 candidate host checklist (status stays `open` until then).
- **Rationale:** commit(s) `c9b9d0101, d9b4bf031`.
- **Assignment (if accepted):** sprint-alfred-epic close-out batch.
- **Date:** 2026-10-08.
