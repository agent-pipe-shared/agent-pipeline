# Orchestrator commit acts, 2026-10-07 — provenance addendum

The Elephant ran `git commit` for four diffs that dispatched Goldfish had authored and left uncommitted when they stopped
(each record ends `stopped-without-commit`, so `commits` is empty and the record is immutable). Each commit carries the
authoring dispatch's `Dispatch:` trailer plus `Commit-Act: orchestrator`. This addendum binds each SHA to the authoring
record and to the evidence the Elephant checked before committing. Finding F1 of the A-S2b Critic (round 1) flagged the
missing binding; the correct route per `roles/elephant.md` EL-13a is a procedural resume of the same dispatch, which the
Elephant uses from now on instead of committing itself.

| Commit | Path(s) | Authoring dispatch record (diff author) | Record `report.changedFiles` | Pre-commit check by the Elephant |
|---|---|---|---|---|
| `8f5bab8de` | `plugins/pipeline-core/scripts/po-human-approval.test.mjs` | `evidence/dispatch-record-R7-6-T6.json` (staged the file; commit refused twice with `.git/index.lock`) | the test file | committed the already-staged index content with the message the dispatch handed over; RED evidence `evidence/r7-6-t6-after.txt` |
| `9aa9ddf89` | `plugins/pipeline-core/scripts/pre-commit-hook-install.mjs` | `evidence/dispatch-record-A-S2B-F2.json` (diff authored, stopped on a red broad DoD pattern) | `[]` (record written before staging) | diff confined to the CLI entry block (`git diff`); target case green `evidence/a-s2b-f2-precommit-target.txt`; the 13 red `freshRepo` cases fail before the CLI block (root cause in `PRECOMMIT-WIN-T`, `21d807037`) |
| `81d0e45d3` | `plugins/pipeline-core/scripts/commit-msg-hook-install.mjs` | `evidence/dispatch-record-A-S2B-F2.json` | `[]` | diff confined to the CLI entry block; CMI023 green `evidence/a-s2b-f2-commitmsg-target.txt`; CMI016 red only in the combined run under parallel plugin writes (`GHS-SOURCE-DRIFT`), green alone |
| `67f0b4cd4` | `plugins/pipeline-core/scripts/guard-human-override.mjs`, `plugins/pipeline-core/scripts/pipeline-start-preflight.mjs` | `evidence/dispatch-record-R7-7-F3.json` (both files) and `evidence/dispatch-record-R7-7-F4.json` (preflight entry runner) | F3: both files; F4: preflight | quiet-tree `toolchain-preflight.test.mjs` exit 0 (`evidence/r7-7-quiet-tcp.txt`); `pipeline-start-preflight.test.mjs` failing set identical with and without the change (`evidence/r7-7-preflight-base-fails.txt` vs `evidence/r7-7-preflight-change-fails.txt`, baseline run in a detached HEAD worktree); `guard-human-override.test.mjs` only `NVA-HGOFIX-2` (POSIX-only backslash filename) |

The trailer of `67f0b4cd4` names only `R7-7-F4`; the diff is the joint result of `R7-7-F3` and `R7-7-F4` as listed above.
