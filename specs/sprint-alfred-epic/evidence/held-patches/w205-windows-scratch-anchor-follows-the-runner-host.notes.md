# w205 — on Windows the scratch binding is anchored to the runner host, not to the one-shot shell (E2; candidate 19c)

## Measured defect

Stage 1 of the Windows consumer probe (`evidence/windows-consumer-probe-stage1-baseline-result.md`) on the installed plugin: the preflight printed the scratch lifecycle line `binding.status: reanchored` and `session-authority-repair.mjs inspect`, seconds later, reported the same scratch path as `dead-anchor`.

## Cause (read in the source, not yet proven on Windows)

`bindScratchDescriptor` records the pid it is given as the liveness anchor of the binding. The preflight and the repair CLI give it `resolveRunnerHostPid()`. That function walks up from the parent process past one-shot shells to the long-lived runner host, but only on Linux (`platform !== "linux"` returned the start pid, and the existing test pinned exactly that: "off Linux the start pid is kept"). On Windows the start pid is `process.ppid`, which for a Bash or PowerShell tool call is the shell started for that one call. It is gone when the call returns, so the next read finds a dead anchor, and a later sweep may retire a live session's binding. This is the mechanism the Linux comment already describes (measured there: node -> bash -> claude).

## Change

`lib/session-cleanup-recovery.mjs`: `resolveRunnerHostPid` gets a Windows branch. It reads one process at a time from the CIM process table (`powershell.exe -NoProfile -NonInteractive -Command ...Win32_Process...`, bounded to 5 s, pid validated as a safe integer before it enters the command), and walks up past `bash.exe`, `sh.exe`, `zsh.exe`, `dash.exe`, `pwsh.exe`, `powershell.exe`, `cmd.exe` and `conhost.exe` (case-insensitive) to the first other process, at most 8 steps. Any failure (no PowerShell, a pid not in the table, a malformed line, only shells up to the bound) keeps the start pid, i.e. exactly today's behaviour. The Linux branch is untouched. Reader and spawn are injectable.

`scripts/pipeline-start-scratch-lifecycle.test.mjs`: the one pin "off Linux the start pid is kept" used platform `win32`; it moves to `darwin` with the same intent (own hunk, QG-04; a platform with no reader keeps the start pid). New cases: the Windows walk over a fake process table (passes two shells to the runner host, keeps a host parent, keeps the start pid beyond the depth bound, for an unreadable or malformed row, for the system process, compares names case-insensitively) and the default reader with an injected spawn (one read per step, the command shape, the 5 s bound, a missing process, an unparsable line, no PowerShell).

## Evidence (work clone on the rehearsed chain)

- `pipeline-start-scratch-lifecycle.test.mjs` 20/20; `staleness-check`, `session-authority-repair`, `session-cleanup-recovery-list-once` and `-load-once` pass.
- `session-cleanup-recovery.test.mjs`: 5 cases fail with `domain-ancestor-unsafe` (bind-orphan, retire-orphans, release-lost-binding, quarantine-private-receipt, RF2A). The identical 5 fail in the UNCHANGED rehearsal clone (c19l without w205), so they come from the clone sitting below the repository's `scratch/`, not from this change; they are not re-measured in the main tree.

## What this does not prove

Only a Windows run shows that the anchor now survives: the post-19c rerun of stage 1 step W2 (preflight, then `inspect`, then `inspect` again after the call has returned) must report `bound`, not `dead-anchor`. The unit tests prove the walk and its fail-closed fallbacks, not the real process tree of the Windows runners (Claude Code with Git Bash, Codex, Antigravity); an unknown host image name that happens to be a shell would simply keep the start pid.
