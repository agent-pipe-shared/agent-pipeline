# Windows consumer probe, stage 1: baseline result (installed plugin `0.7.0+claude.20261104062201.95d3e81`)

Source: the native Windows consumer session, protocol `windows-consumer-probe-stage1.md`, received 2026-11-04. All steps ran read-only, without override, chaining, dispatch or commit. The session replaced the project path by `<root>` and the plugin root by `$PLUGIN`; no user name appeared. This is the baseline; the identical steps run again after 19c is installed there.

Environment: Windows 11 (10.0.26300), PowerShell 7.6, Git Bash for the Bash tool, git 2.56.0.windows.4, node v26.13.0.

| Step | Item | Result | Reading |
|---|---|---|---|
| W1 preflight | baseline | `status: ready`; `windowsAuthorityReadiness: {status: ready, causes: []}`; mandatory hooks current, pre-push hook installed and current; scratch lifecycle line says `binding.status: reanchored` | no `WIN-AUTH-*` cause at bootstrap, so Q10 did not occur in this run |
| W2 session-authority-repair inspect | E2 | `lock: absent`, `cleanupLocks: []`, registry readable, all 12 producers `ok`, none in flight; `scratchBinding.status: dead-anchor` for the scratch path the preflight had just reported as `reanchored`; the only `next` is `heal` (not run) | no lock holder and no `unknown-registry-entry` this time. The `reanchored` then `dead-anchor` within seconds is a measured inconsistency between two readbacks of the same binding on Windows; cause not established (a Windows scratch-anchor liveness check is the candidate) |
| W3 lock holder liveness | E2 | not applicable, no lock holder | the `SDC-LOCK-HELD` of the earlier real runs did not reproduce at rest |
| W4 host-commit recover plan | E1 | exit 2, `GHCR-NO-SOURCE`: no pending host-commit state and no dispatch binding; a `stopFailure` entry with code `NGHF-PENDING-UNAVAILABLE` is still on record | the pending state the PreToolUse step should write is absent while the stop failure it should have prevented is present: the E1 hypothesis "pending state never written on Windows" is supported; whether the PreToolUse step ran at all is still unmeasured |
| W5 shell parity (8 read commands in Bash and PowerShell) | E7 | Bash ran all eight; the PowerShell tool refused all eight with `GUARD-POWERSHELL-GRAMMAR` ("use a sanctioned Pipeline action or a contained literal read. Working example: Get-Content docs/a.md") | in the PowerShell tool only a contained literal read such as `Get-Content <path>` is admitted; `node --version` and `git status --short` are not. That is the E7 PowerShell inconsistency in its measured form: the two shells admit different command sets |
| W6 | Q10 | no `WIN-AUTH-OPEN` appeared | the earlier `WIN-AUTH-OPEN` occurred when several calls started in parallel (reported by the session); not reproduced by parallel Bash and PowerShell rounds this time. Q10 (the missing path in the message) stays untested on Windows |

Open for stage 2 (needs the consumer owner's explicit go): a live background dispatch to see whether the PreToolUse step writes the pending state (E1) and a second parallel dispatch (E4). Next measurement after the 19c install: the same W1 to W5, plus a check of the dead-anchor readback.
