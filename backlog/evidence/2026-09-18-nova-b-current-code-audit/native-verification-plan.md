# Native verification plan

Portable-core checks establish properties, not host-native capability acceptance.
ADR-0057 uses portability properties for shared code and does not require a
human matrix gate for every shared function. Native claims require the actual
host evidence below.

| Runner | Linux/WSL x64 | Native Windows | Native macOS |
| --- | --- | --- | --- |
| Claude | Version observed only; installed-consumer workflow unexecuted. | Not executed; PowerShell/path/DACL evidence required. | Not executed; identify Apple Silicon, Intel, or hosted CI. |
| Codex | Version observed only; live lane is Codex-specific but consumer workflow unexecuted. | Not executed; native sandbox/App-Server evidence required. | Not executed; identify Apple Silicon, Intel, or hosted CI. |
| Antigravity | Absent from PATH; no consumer observation. | Not executed. | Not executed. |

The observed host is Linux/WSL x64 with Node v24.15.0. Claude and Codex version
commands succeeded; Antigravity was absent. CI ordinary and live jobs are
Ubuntu-only. These observations do not establish installed consumer execution.

For each available native host, bind the same clean commit/tree, record OS,
architecture, shell, and runner/plugin versions without private paths, then run
`node harness/scripts/verify.mjs --mode release --no-reuse` and retain its
machine evidence and Security result. In a disposable consumer project, test
ordinary installed entrypoint discovery, guard admission and denial, dispatch,
result consumption, cancellation, and resume. Direct imports are insufficient.

Windows must cover ordinary PowerShell, path, and DACL behavior. macOS evidence
must identify Apple Silicon, Intel, or hosted CI. Do not run live/provider,
network, or publication work under this plan.
