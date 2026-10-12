# Wave 1 briefing inputs (read-only analysis, 2026-10-12)

Source: two read-only Explore analyses (Sonnet) over current source, backlog
items and `reuse-index.json`. No tests were run by them except one
`model-role-bootstrap.mjs --runner claude` (STORE-UNAVAILABLE). These are
dispatcher inputs, not qualification evidence. `P/` = `plugins/pipeline-core/`.

| Item | Source state today | Remaining / goal | Likely write scope |
| --- | --- | --- | --- |
| gitleaks-repair-ignore-cli-is-a-no-op-on-windows | fixed: `P/scripts/gitleaks-repair-ignore.mjs:39,213-215` uses `isDirectInvocation` | native evidence: real flags from a drive-letter path act (rewrite or typed refusal); GLCLI001 only proves main() runs | test acting-case in `gitleaks-repair-ignore.cli.test.mjs` + evidence |
| gitleaks-content-suppression-does-not-match-on-windows | likely fixed: `P/scripts/security-adapters/gitleaks.mjs:270-300` path normalization | real gitleaks scan of nested content-v1 suppression reports suppressed on Windows | evidence; else `gitleaks.mjs` + `gitleaks.windows-suppression.test.mjs` |
| concurrent-session-warning-never-fires-on-native-windows | fixed (b0d1ff11d): `P/lib/worktree-lifecycle.mjs:567-622`, preflight `:848-882` | preflight live/not-live cases are Linux-only skipped (`pipeline-start-preflight.test.mjs:1891,1946`); add win32-enabled variant + native evidence | `P/scripts/pipeline-start-preflight.test.mjs` |
| git-for-windows-2-56-rejects-git-config-global-nul | NOT fixed: `"NUL"` remains at `P/lib/calibration-verify-commit-transition.mjs:70`, `P/lib/critic-verify-lifecycle.mjs:311-312` | all git null-device values via `GIT_NULL_DEVICE`; R7-1a ratchets in `worktree-lifecycle.test.mjs:1614-1860` green | those two libs (+ any inline `/dev/null` sites) |
| windows-pre-push-installer-fsync-and-relative-action | fsync half fixed (`pre-push-hook-install.mjs:58-84,733-763`); onboarding offer absolute | relative `repairAction` remains at `P/scripts/check-clone-provisioning.mjs:72,118` | `check-clone-provisioning.mjs` + test; string-vs-structured contract is a design choice |
| windows-greenfield-scratch-write-denied | mostly fixed: `physical-scratch-boundary.mjs:20-83`, `guard/write-scope.mjs`, `guard/powershell-dialect.mjs` | native matrix evidence; fresh-intake observation may be a host/PO acceptance step | tests only, likely |
| windows-portable-seed-rolls-back-with-hidden-worktree-error | fixed for slash/drive (`worktree-lifecycle.mjs:262-269`) and driver loop (`onboarding-init.mjs:1446-1465`) | rollback/diagnostic surfacing unclear; installed fresh-session observation is post-install | tests; maybe `project-onboarding-v3.mjs` |
| windows-os-temp-root-dacl-fails-private-state-assurance-for-test-fixtures | partial: helper `P/lib/test-private-tmp.mjs` exists, consumers still use `mkdtempSync(tmpdir())` | migrate fixture consumers to `privateMkdtemp`; DACL assurance unchanged; also explains T9 fixture baseline | affected `*.test.mjs` fixtures |
| model-role-bootstrap-is-always-unavailable-on-native-windows | original cause fixed; live failure is `P/lib/model-role-host-store.mjs:21,85` `startsWith("/")` (+ casing at `:30-37`) | bootstrap returns a real status on Windows, POSIX unchanged | `model-role-host-store.mjs` + tests |
| hgo-dead-owner-audit-lock-permanently-ambiguous-on-windows | fixed in substance: `P/lib/human-guard-override.mjs:2601-2636` | real-host win32 case + stale matrix comment; planning-without-lock bullet is a scope question | `human-guard-override.test.mjs` |

Open PO/design questions surfaced: `repairAction` string vs structured
`{executable, argv, cwd}`; whether host/installed observations (fresh intake,
installed candidate session) are agent scope or host acceptance steps.
