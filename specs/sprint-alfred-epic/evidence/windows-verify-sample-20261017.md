# Windows Full Verify sample and triage, 2026-10-17

Status: classification evidence for the 0.7.0 local candidate. This is not a
Full Verify PASS. By PO decision of 2026-10-17, the regular Full Verify runs
under WSL ([runbook](../plans/wsl-candidate-sync-runbook.md)); native Windows
gets no further Full Verify before the stamp.

## Source

- The candidate Full Verify on native Windows, commit `ab5fefbbc`, was
  stopped by PO choice after about 50 minutes.
- 49 of 1036 suites had finished, and 22 of them were red.
- Run id `verify-1792256197476-71401bf79aea5d2c`. Its records live in the
  private run directory under the Git common directory.
- Cost analysis:
  [backlog item](../../../backlog/items/2026-10-17-full-verify-on-windows-takes-hours.md).

## Classes of the 22 red suites

Each red suite is classified by its first measured error. "Host class" means
the cause is a property of native Windows, not product logic.

| Class | Suites (approx.) | Course |
| --- | --- | --- |
| Symlink creation without privilege (EPERM) | about 9 | Host class; WSL run |
| POSIX mode bits asserted on win32 (codex-critic-isolation) | 1 | Host class under the 2026-10-17 threat-model decision; WSL run |
| Windows authority ancestor above the repository (WIN-AUTH-ANCESTOR-MUTATION): session-cleanup-power, verify-evidence-producer | 2 | Product fix under the existing PO decision; dispatch ALF-C-ANCESTOR-CALLERS4 |
| Unborn-HEAD git calls in fixtures (WT-GIT-FAILED), continuity-result suites | 4 | Host/fixture class; unborn custody fixed in `1ad75c0fe`; rest to WSL run |
| gitleaks 60 s timeout (security-scan) | 1 | Host speed; WSL run |
| Possibly genuine, triaged below | 7 suites in 6 triage dispatches | See next table |

The per-class counts are approximate. The exact list sits in the private run
records. The 7 possibly genuine suites are listed exactly.

## Triage of the 7 possibly genuine suites

Each suite was run on HEAD `809a798b4` and on the baseline worktree at
`d461bbb79`. All 7 were already red at the baseline. None is a regression of
the evening's work.

| Suite | Baseline vs HEAD | Cause | Result |
| --- | --- | --- | --- |
| control-placement | 5/6 = 5/6 | Table lacked rows for 3 newer hooks | Fixed `7ef004254`, 6/6 |
| critic-claude-host | abort after CLH01 on both | Fixture dispatch record had an empty log | Fixed `38ae6197f`, 20/20 |
| interruption-receipts | 11 red on both | Fixture built round 2 as a full review; delta is required since `d02409a8a` | Fixed `e06c3df08`, 100 pass / 1 fail / 6 skip (Linux ext). One red was masked before: the adapter tripwire case preloads an import graph that now reaches a JSON schema. That is an open design question. |
| model-role-host-store | 0/5 on both | POSIX-only root and mode checks | Ported `bf9040f27`, 7/8 on win32. MRSR01 remains: it expects a mode-bit refusal (line 77) and needs a file symlink (line 79, EPERM). Both are host-class inside the test. |
| setup | 187/188 (baseline file byte-identical, not run) | Stale assertion: mechanic is haiku/medium since the PO-signed package `7f37cc916` | Fixed `04c92b7db`, 188/188 |
| repository-freshness | 22/23 = 22/23 | `chmod 0o500` on a directory has no effect on win32 | Host class; WSL run |
| codex-native-critic-host | 6/9 = 6/9 | POSIX-only path guard (`startsWith("/")`); the route is designed for linux-wsl2 | Host class; WSL run |

## What this does not show

- It is no Full Verify result on any host.
- The 987 suites that did not run on Windows are unclassified until the WSL
  run.
- The fixes above have targeted runs only. The product changes
  (model-role-host-store, ancestor callers) still need the Critic batch C6
  DIFF.
