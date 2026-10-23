# Counted pin results, 2026-10-23 (second set)

Measured on commit `abb58235eee68ae9c1e034fd635425d17a83e6ce` (`abb58235e`) in a fresh local clone, one test file after the other (never two at the same time), each run with its own private TMPDIR outside every repository. A second dispatch may have run suites on the same machine during this window, so the machine was not idle; the one red suite was re-run once alone, with the same result.

Totals: 13 test files, 12 green, 1 red; 437 cases, 433 passed, 2 failed, 1 skipped, 1 todo.

A skipped or todo case is not a pass. A green row with a skip or todo is counted as green for the cases that ran.

Red: `scripts/session-cleanup-binding.test.mjs` (the K1D session continuity binding suite), first failing case `neutral coordinator-close release is private, byte-stable, and replayable`.

Notes:

- `session-cleanup-binding.test.mjs`: 67 cases, 65 passed, 2 failed in both runs (first run 688 s, retry alone 616 s). The named case failed both times with `SDC-AUTHORITY-CAS` (reason `onboarding-continuity:namespace-drift`). The second failing case differed between the two runs: `composite recovery remains fail-closed when one orphan cannot be retired` (first run, `SessionPowerError: fixed address namespace changed`) and `a dead process composite lock is reclaimed and the journal resumes` (retry). The case named in K1D is therefore red deterministically; the second failure is not stable. Cause not diagnosed here.
- `rebind-approval.test.mjs`: the todo case is `inspect of an approval that cannot be verified on this checkout lists rebind-approval alongside reopen-design` (the fixture clone is not an onboarded project, status partial). The runner prints a `failing tests:` heading for it; the summary is fail 0 and the exit code is 0.
- `lifecycle-coordination-commands-refused-as-implementation-writes.test.mjs`: the skipped case is `AC-207 point 5` (Git Bash end-to-end run; needs a native Windows host).
- `design-workflow-package-v2.test.mjs`: green on this run (2 of 2); the earlier `SDC-AUTHORITY-UNAVAILABLE` red did not recur.
- `codex-critic-packet-host.test.mjs` uses its own check reporter, not TAP: 4 of 4 checks passed (CCH01 to CCH04); the Cases and Pass columns are those 4 checks.
- The PARWORK pins of `parallel-work-in-one-checkout-is-unsafe` live in one file with 19 cases, all passed.
- The `advertised-git-to-head-pipeline-is-refused` file ran 174 cases on this commit (the 2026-10-22 table recorded 42).

| Pin file | Verdict | Cases | Pass | Fail | Skip | Todo |
|---|---|---|---|---|---|---|
| `lib/pins/configure-verify-names-the-unmet-approval-condition.test.mjs` | GREEN | 6 | 6 | 0 | 0 | 0 |
| `lib/pins/parallel-work-in-one-checkout-is-unsafe.test.mjs` | GREEN | 19 | 19 | 0 | 0 | 0 |
| `lib/pins/lifecycle-coordination-commands-refused-as-implementation-writes.test.mjs` | GREEN | 31 | 30 | 0 | 1 | 0 |
| `lib/pins/catalogue-admit-prescribed-lifecycle-verbs.test.mjs` | GREEN | 19 | 19 | 0 | 0 | 0 |
| `lib/pins/advertised-git-to-head-pipeline-is-refused.test.mjs` | GREEN | 174 | 174 | 0 | 0 | 0 |
| `scripts/session-cleanup-binding.test.mjs` | RED | 67 | 65 | 2 | 0 | 0 |
| `lib/project-uninstall.test.mjs` | GREEN | 20 | 20 | 0 | 0 | 0 |
| `scripts/rebind-approval.test.mjs` | GREEN | 10 | 9 | 0 | 0 | 1 |
| `lib/design-workflow-package-v2.test.mjs` | GREEN | 2 | 2 | 0 | 0 | 0 |
| `scripts/dispatch-authorship-verify.test.mjs` | GREEN | 65 | 65 | 0 | 0 | 0 |
| `scripts/codex-critic-packet-host.test.mjs` | GREEN | 4 | 4 | 0 | 0 | 0 |
| `hooks/guard-dispatch-budget-grant-notice.test.mjs` | GREEN | 5 | 5 | 0 | 0 | 0 |
| `hooks/guard-dispatch-budget-checkpoint.test.mjs` | GREEN | 15 | 15 | 0 | 0 | 0 |

Paths in the table are relative to `plugins/pipeline-core/`.
