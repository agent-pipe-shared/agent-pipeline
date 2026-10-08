# 0.7.0 candidate — host-run checklist (2026-10-08)

Checks that cannot be settled by a single test file on the Windows development host or in the shared tree while
parallel dispatches run. Each is a precondition for calling the candidate qualified; none is PO-accepted yet.

| # | Check | Why it cannot run here | Host | Command (repo root) | Source |
|---|---|---|---|---|---|
| H1 | `scratch-sweep.test.mjs` colon-name case (D2-2 repro) runs red-then-green on POSIX | the case skips on win32 (colon is not a legal file name) | Linux or WSL | `node --test plugins/pipeline-core/scripts/scratch-sweep.test.mjs` | `../evidence/critic-2026-10-07/scratch-sweep-delta3.md` CS3-3 |
| H2 | C1 interruption store cases and the AC-6 `--write-baseline` writer case pass | C1 requires the Linux ext backend (`C1S-PLATFORM`/`C1S-IO`); the writer fixture uses `/var/tmp` | Linux or WSL | `node --test plugins/pipeline-core/lib/interruption-receipts.test.mjs plugins/pipeline-core/scripts/report-interruptions.test.mjs` | AC6-HOST-T2 (`87da2a348`), PO question N9 |
| H3 | `toolchain-preflight.test.mjs` R7-7e passes on a quiet tree | the git-hooks repair re-hashes the live plugin source and refuses with `GHS-SOURCE-DRIFT` when another dispatch edits a file in that window | this host, no dispatch running | `node --test plugins/pipeline-core/scripts/toolchain-preflight.test.mjs` | toil T58 |
| H4 | `guard-push.test.mjs` at baseline (177/179; the two PG-CHECKPOINT cases need a signature on this host) | ~33 min; a case timed out under load (PG12s16 `exit null`) | this host, quiet | `node --test plugins/pipeline-core/hooks/guard-push.test.mjs` | `evidence/q12-f8-guard-push.txt` |
| H5 | Installed-hook behaviour: git-hook runtime snapshot, native-patch rename markers, first-enrollment retirement | needs the installed candidate, not a unit run | candidate install on this host and one POSIX host | per item Acceptance | close-out map rows `needs-host-run` |
| H6 | agy (Antigravity) runtime item | needs an agy host run | agy host | per item | CLOSE-B result |
| H7 | Full onboarding async runner suite | criterion is the full complete-suite run | this host, quiet | per item | close-out map row `onboarding-test-runner-async-pass` |
| H8 | `governance-action-artifact.test.mjs` symlink setup | `EPERM` from `symlink` without Developer Mode | Windows with symlink rights, or POSIX | `node --test plugins/pipeline-core/lib/governance-action-artifact.test.mjs` | FSYNC-F3 (`42a8d765e`) |
| H9 | Codex native-Windows sandbox probe, so a `windows-native`/`windows-ntfs` compatibility entry can be added with probe evidence; AL-2 stays red until then | the design admits the native lane only for an entry backed by probe evidence (no default widening) | Windows host with Codex installed | the probe named in `../design/codex-critic-lane-2026-10-08.md` slice 1, then `node --test plugins/pipeline-core/lib/critic-lane-fallback.test.mjs` | AL-F (`a3af12b0c`), ruling 31 |
| H10 | agy spike S1, S5, S6 in a disposable account before the AM wiring reaches `install-agy.mjs` / the update verb | the library slice (AM-F2) runs against a fake CLI only | agy host, disposable account | per design note `../design/agy-snapshot-central-2026-10-08.md` §6 | AM-T2 (`32e327d9f`), ruling 33 |
| H11 | `security-scan.test.mjs` CLI smoke cases pass | semgrep timed out after 5000 ms under load on this host (154/156) | this host, quiet, or POSIX | `node --test plugins/pipeline-core/scripts/security-scan.test.mjs` | `evidence/sec-port-tc-scan.txt` |
| H12 | AC-34 U-1 on the POSIX dialect and in a consumer-layout repository | the AC34 cases ran on win32 only | Linux or WSL, consumer layout | `node --test plugins/pipeline-core/lib/project-uninstall.test.mjs` | `../evidence/critic-2026-10-07/ac34-full.md` AC34-F3 |

Order before a stamp: stop all dispatches → H3, H4, H7 on this host → H1, H2 on WSL/Linux → install the candidate →
H5 → H6 when an agy host is available (may be recorded as `unavailable` with its prerequisite).
