# Counted pin results, 2026-10-23 (set d: cluster K9, remaining single suites)

Measured on commit `756248e0d` in a local clone (`scratch/clones/k77`), one test file after the other (never two at the same time), each run once in the foreground-equivalent serial runner with its own private TMPDIR outside every repository (spawn of `node <file>` with TMPDIR/TMP/TEMP set, 20 minute per-file cap). Other agents may have used the machine in the same window. The three red files were re-run once alone, with the same counts and the same first failing case each time. Nothing was fixed or diagnosed beyond one line.

Summary: 61 test files run. 58 green, 3 red, 0 timeout. 1 suite name has no suite found (`nova-verify-journal`). 3 suites skipped as already counted (see Skipped). Counts are copied from the node summary line of each run; suites with their own summary (marked `custom`) are counted from that printed summary.

A skipped or todo case is not a pass. A green row with skips or todos is counted green for the cases that ran. Windows-only pins skip on Linux with typed skips; those skips are listed in the Skip column.

Paths are relative to `plugins/pipeline-core/` unless they start with `harness/`.

## Red (3 files)

| Suite and path | Result | Cases | Pass | Fail | Skip | Todo | Secs | First failing case | Note |
|---|---|---|---|---|---|---|---|---|---|
| `scripts/local-worker-supervisor.test.mjs` (local-worker-supervisor-cli) | RED | 10 | 1 | 9 | 0 | 0 | 60 | LWSC01 plans and runs two overlapping real child processes in separate no-hardlink Git clones | LWSC01, LWSC03-LWSC10 fail (only LWSC02 passes). Same on the lone retry (60 s). One-line cause: the CLI answers `LWS-UNAVAILABLE` and several cases end in `record wait timed out`; not diagnosed further. |
| `scripts/goldfish-antigravity-live-host.test.mjs` | RED | 6 | 5 | 1 | 0 | 0 | 1 | real temporary session admits two distinct bounded fixture tasks and reuses stored consent | Same on the lone retry. One-line cause: receipt `status: rejected`, code `AGY-SESSION-NATIVE-CARRIER-UNAVAILABLE`, field `authorityLifetime`. |
| `lib/agy-session-authority.test.mjs` | RED | 6 | 4 | 2 | 0 | 0 | 1 | v2 actual signed family and consent allow two successors through one opaque admission | Second failure: `v2 native permissions bind only their verified implementation task and functional role`. Same on the lone retry. One-line cause: both end in `AGY-CONSENT-ADMISSION-UNAVAILABLE`. |

## Delivered or partly delivered rows of the closure read

| Suite and path | Result | Cases | Pass | Fail | Skip | Todo | Secs | First failing case | Note |
|---|---|---|---|---|---|---|---|---|---|
| `scripts/pipeline-state-rebind-runner.test.mjs` | GREEN | 18 | 18 | 0 | 0 | 0 | 12 | - | matches the 18/18 recorded at `540e96f71` |
| `scripts/pipeline-state-rebind-mutable.test.mjs` | GREEN | 5 | 5 | 0 | 0 | 0 | 1 | - | the four Verify-load-only reds named in the closure read do not occur standalone; only a full Verify can re-measure them |
| `lib/onboarding-continuity.test.mjs` (OBC129 file) | GREEN | 306 | 306 | 0 | 0 | 0 | 642 | - | whole file green, so the OBC129 case (if present in this file) passes; long suite |
| `scripts/verify-journal.test.mjs` | GREEN | 95 | 95 | 0 | 0 | 0 | 71 | - | the three verify-journal reds named in the closure read do not occur |
| `scripts/verify-journal.drvfs-hint.test.mjs` | GREEN | 2 | 2 | 0 | 0 | 0 | 1 | - | |
| `scripts/po-human-approval-openssl-path.test.mjs` | GREEN | 11 | 11 | 0 | 0 | 0 | 1 | - | the WINVERIFY NODE_OPTIONS mutations do not fail on Linux |
| `scripts/security-adapters/gitleaks.test.mjs` | GREEN | 23 | 23 | 0 | 0 | 0 | 1 | - | gitleaks near-miss suite |
| `scripts/security-scan.test.mjs` (custom: "161/161 cases passed") | GREEN | 161 | 161 | 0 | 0 | 0 | 7 | - | a test file, run as such (not the scan script) |
| `scripts/security-scan-snapshot.test.mjs` | GREEN | 4 | 4 | 0 | 0 | 0 | 1 | - | |
| `scripts/pipeline-start-preflight-enforcement.test.mjs` | GREEN | 20 | 19 | 0 | 0 | 1 | 1 | - | one todo-marked case; summary says fail 0 and exit code 0 |
| `lib/pins/draft-phase-guard-blocks-mandatory-bootstrap-preflight.test.mjs` (pin-draft-phase) | GREEN | 12 | 10 | 0 | 2 | 0 | 1 | - | |
| `lib/pins/worktrees-share-onboarding-private-state-with-root-bound-intake.test.mjs` (pin-worktrees) | GREEN | 7 | 7 | 0 | 0 | 0 | 20 | - | pin file named for AC-274 work in `5e215c4a8` |

## Dispatch budget and control

| Suite and path | Result | Cases | Pass | Fail | Skip | Todo | Secs | First failing case | Note |
|---|---|---|---|---|---|---|---|---|---|
| `harness/scripts/wire-dispatch-budget-hook.test.mjs` | GREEN | 17 | 17 | 0 | 0 | 0 | 0 | - | |
| `scripts/control-placement.test.mjs` | GREEN | 6 | 6 | 0 | 0 | 0 | 0 | - | |
| `lib/agy-final-return.test.mjs` | GREEN | 18 | 16 | 0 | 0 | 2 | 3 | - | two todo-marked cases AFR14 and AFR15; summary fail 0, exit 0 |
| `scripts/slice-queue.test.mjs` (slice-queue-cli) | GREEN | 16 | 16 | 0 | 0 | 0 | 31 | - | |
| `lib/slice-queue.test.mjs` | GREEN | 37 | 37 | 0 | 0 | 0 | 1 | - | library sibling, run for completeness |
| `lib/local-worker-supervisor.test.mjs` | GREEN | 15 | 15 | 0 | 0 | 0 | 1 | - | library sibling of the red CLI suite |

## Host output, late verify, AFK, runner contracts

| Suite and path | Result | Cases | Pass | Fail | Skip | Todo | Secs | First failing case | Note |
|---|---|---|---|---|---|---|---|---|---|
| `lib/codex-host-output-custody.test.mjs` | GREEN | 12 | 12 | 0 | 0 | 0 | 34 | - | |
| `scripts/pipeline-state-late-verify.test.mjs` | GREEN | 2 | 2 | 0 | 0 | 0 | 3 | - | |
| `scripts/afk-claude-host.test.mjs` | GREEN | 10 | 10 | 0 | 0 | 0 | 1 | - | |
| `scripts/afk-activation.test.mjs` | GREEN | 13 | 13 | 0 | 0 | 0 | 1 | - | |
| `scripts/runner-contracts.schema.test.mjs` (custom: "15/15 cases passed") | GREEN | 15 | 15 | 0 | 0 | 0 | 0 | - | |

## Preflight, design admission, bound paths

| Suite and path | Result | Cases | Pass | Fail | Skip | Todo | Secs | First failing case | Note |
|---|---|---|---|---|---|---|---|---|---|
| `scripts/pipeline-start-preflight-pre-push-observation.test.mjs` | GREEN | 28 | 28 | 0 | 0 | 0 | 87 | - | |
| `hooks/design-approval-command-admission.test.mjs` | GREEN | 13 | 13 | 0 | 0 | 0 | 1 | - | |
| `scripts/design-advisory-admission.test.mjs` (design-advisory-admission-cli) | GREEN | 2 | 2 | 0 | 0 | 0 | 0 | - | |
| `lib/design-advisory-admission.test.mjs` | GREEN | 8 | 8 | 0 | 0 | 0 | 0 | - | library sibling |
| `scripts/r7-3-bound-paths.test.mjs` | GREEN | 13 | 13 | 0 | 0 | 0 | 2 | - | |

## Pins: uninstall and session start

| Suite and path | Result | Cases | Pass | Fail | Skip | Todo | Secs | First failing case | Note |
|---|---|---|---|---|---|---|---|---|---|
| `lib/pins/no-uninstall-path-for-a-repository-that-once-opted-in.test.mjs` (pin-no-uninstall) | GREEN | 29 | 29 | 0 | 0 | 0 | 79 | - | |
| `lib/pins/claude-session-start-emits-codex-transcript-recovery-hint.test.mjs` (pin-claude-session-start) | GREEN | 13 | 13 | 0 | 0 | 0 | 15 | - | |

## Windows and WSL pins (run on Linux)

| Suite and path | Result | Cases | Pass | Fail | Skip | Todo | Secs | First failing case | Note |
|---|---|---|---|---|---|---|---|---|---|
| `lib/pins/model-role-bootstrap-is-always-unavailable-on-native-windows.test.mjs` | GREEN | 14 | 12 | 0 | 2 | 0 | 19 | - | |
| `lib/pins/verify-on-a-wsl-mnt-drive-checkout-hides-its-reason.test.mjs` | GREEN | 8 | 7 | 0 | 1 | 0 | 1 | - | |
| `lib/pins/windows-greenfield-scratch-write-denied.test.mjs` | GREEN | 12 | 11 | 0 | 1 | 0 | 4 | - | |
| `lib/wsl-ipc-compatibility.test.mjs` | GREEN | 24 | 24 | 0 | 0 | 0 | 2 | - | |
| `lib/pins/capture-evidence-does-not-normalize-windows-npm-launch.test.mjs` | GREEN | 11 | 9 | 0 | 2 | 0 | 0 | - | |
| `lib/pins/claude-design-readiness-cannot-start-on-windows.test.mjs` | GREEN | 10 | 10 | 0 | 0 | 0 | 1 | - | |
| `lib/pins/claude-windows-greenfield-lifecycle-not-walkable.test.mjs` | GREEN | 42 | 41 | 0 | 1 | 0 | 85 | - | |
| `lib/pins/claude-windows-guard-refuses-every-in-repo-read.test.mjs` | GREEN | 15 | 14 | 0 | 1 | 0 | 27 | - | |
| `lib/pins/codex-wsl-required-advisor-has-no-completable-route.test.mjs` | GREEN | 19 | 19 | 0 | 0 | 0 | 2 | - | |
| `lib/pins/concurrent-session-warning-never-fires-on-native-windows.test.mjs` | GREEN | 6 | 6 | 0 | 0 | 0 | 2 | - | |
| `lib/pins/design-workflow-package-v2-readiness-fixture-fails-on-windows.test.mjs` | GREEN | 8 | 5 | 0 | 3 | 0 | 1 | - | |
| `lib/pins/dispatch-budget-lock-refuses-every-subagent-call-on-windows.test.mjs` | GREEN | 10 | 10 | 0 | 0 | 0 | 16 | - | |
| `lib/pins/gitleaks-content-suppression-does-not-match-on-windows.test.mjs` | GREEN | 26 | 25 | 0 | 1 | 0 | 0 | - | |
| `lib/pins/gitleaks-repair-ignore-cli-is-a-no-op-on-windows.test.mjs` | GREEN | 9 | 9 | 0 | 0 | 0 | 1 | - | |
| `lib/pins/hgo-dead-owner-audit-lock-permanently-ambiguous-on-windows.test.mjs` | GREEN | 12 | 11 | 0 | 1 | 0 | 1 | - | |
| `lib/pins/node-v24-on-windows-creates-a-real-nul-file.test.mjs` | GREEN | 14 | 14 | 0 | 0 | 0 | 1 | - | |
| `lib/pins/signed-quality-package-route-is-not-agent-operable-on-windows.test.mjs` | GREEN | 15 | 14 | 0 | 1 | 0 | 3 | - | |
| `lib/pins/windows-authority-ancestors-above-repository-are-human-controlled.test.mjs` | GREEN | 8 | 0 | 0 | 8 | 0 | 0 | - | all cases skip on Linux (native Windows only); green means no case ran |
| `lib/pins/windows-os-temp-root-dacl-fails-private-state-assurance-for-test-fixtures.test.mjs` | GREEN | 14 | 6 | 0 | 8 | 0 | 1 | - | |
| `lib/pins/windows-portable-seed-rolls-back-with-hidden-worktree-error.test.mjs` | GREEN | 9 | 7 | 0 | 2 | 0 | 1 | - | |
| `lib/pins/windows-pre-push-installer-fsync-and-relative-action.test.mjs` | GREEN | 14 | 14 | 0 | 0 | 0 | 58 | - | |
| `lib/pins/windows-requester-ancestors-above-repository-are-human-controlled.test.mjs` | GREEN | 13 | 4 | 0 | 9 | 0 | 0 | - | |
| `lib/quality-package-windows-path.test.mjs` | GREEN | 1 | 1 | 0 | 0 | 0 | 0 | - | |
| `lib/windows-assurance-verify-registration.test.mjs` (custom: "24 passed, 0 failed") | GREEN | 24 | 24 | 0 | 0 | 0 | 0 | - | |
| `lib/windows-native-type-cache.test.mjs` | GREEN | 13 | 4 | 0 | 9 | 0 | 0 | - | |
| `lib/windows-private-state-observation-memo.test.mjs` | GREEN | 12 | 1 | 0 | 11 | 0 | 0 | - | |
| `lib/windows-private-state.test.mjs` | GREEN | 16 | 12 | 0 | 4 | 0 | 0 | - | |
| `scripts/security-adapters/gitleaks.windows-suppression.test.mjs` | GREEN | 44 | 38 | 0 | 6 | 0 | 0 | - | |

Native Windows is out of scope on this Linux machine (D133); the skips above are the typed native-Windows skips and are not passes.

## Skipped as already counted, and no suite found

| Name | Result | Pointer |
|---|---|---|
| `pipeline-state-push-anchor` (`scripts/pipeline-state-push-anchor.test.mjs`) | already counted GREEN 10/10 | `pin-counted-results-2026-10-23-c.md` (K4 table) |
| `guard-dispatch-budget-checkpoint` GDBC10 (`hooks/guard-dispatch-budget-checkpoint.test.mjs`) | already counted GREEN 15/15 | `pin-counted-results-2026-10-23-b.md` |
| `sign-intent-bare-openssl-spawn-searches-the-working-directory-on-windows` pin (Windows pin) | already counted GREEN 4/4 | `pin-counted-results-2026-10-23.md` |
| `nova-verify-journal` | no suite found | no test file with `nova` and `verify-journal` exists; the `verify-journal` suites above are the nearest and are green |

Name resolution: `pipeline-start-preflight-*` resolved to `pipeline-start-preflight-enforcement` and `pipeline-start-preflight-pre-push-observation`; `-cli` names resolved to the files under `scripts/` and each library sibling under `lib/` was also run. The Windows and WSL pins are the three Windows/WSL fixtures repaired in `5e215c4a8` plus every other `*windows*` / `*wsl*` pin and library test found by name. Three of the eight `5e215c4a8` pins are counted under their own K9 rows (draft-phase, no-uninstall, worktrees).
