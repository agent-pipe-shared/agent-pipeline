# w146 — the analysis-run command runs the registered verify command in a throwaway clone (candidate 19, F2a)

Applies after w145. PO decision 2026-11-03 (ADR draft `docs/adr/draft-analysis-lane-runs-tests-in-a-scratch-clone-while-a-feature-is-approved.md`, points 1 to 4). Criterion binding: AC-108 is the closest existing accepted criterion; the PRD and the Spec are unchanged.

## What it adds

- `plugins/pipeline-core/lib/analysis-run.mjs` (`runAnalysis`, injectable `spawnSync`, clock and random id) and the thin CLI `plugins/pipeline-core/scripts/analysis-run.mjs` with the closed shape `--root <dir> [--commit <rev>] [--timeout-seconds <n>]`; anything else is refused as `ANALYSIS-USAGE`.
- Per run: resolves the repository and its git common directory, resolves the commit, reads `verify` from that commit (`project/pipeline.json`, then `.claude/pipeline.json`) and refuses a missing, empty or placeholder value with `ANALYSIS-VERIFY-NOT-CONFIGURED` (the exported `classifyVerifyCommand` of `pipeline-state.mjs`). That string is the only command that can run.
- Records HEAD and the sha256 of `git status --porcelain=v1 --untracked-files=all` of the real tree before and after; clones with `--no-hardlinks` into `<git-common-dir>/agent-pipeline/analysis/<run-id>/clone` (no git worktree), checks out the commit detached, runs the command through the platform shell in the clone with `TMPDIR` and `CLAUDE_PROJECT_DIR` inside it, timeout default 600 s, maximum 1800 s, stdout and stderr each bounded to 65536 bytes with `truncated` flags.
- Writes `result.json` (`pipeline.analysis-run.v1`, `kind: "analysis"`, `notVerifyEvidence: true`, verdict `passed | failed | timed-out | refused-working-tree-changed`; a changed real tree always wins and carries the repair `review and revert the change in the working tree`). Prints one JSON line; exit 0 for passed and failed, exit 2 for a refusal or a changed tree.
- Retention after writing: newest 5 runs kept, runs older than 7 days (by the run id timestamp) removed, never the run just written; the deleted count is printed.

## Checks

- `lib/analysis-run.test.mjs`: 10 of 10 pass. `scripts/analysis-run.test.mjs`: 4 of 4 pass. Each run alone. Cases were RED first (module missing).
- The held-patch check test (patch applies to the real HEAD, touches only the four named files).

## Not changed / not proven

- No guard, hook or lifecycle file touched; the shell-guard admission of the command is a separate slice. Not added to any catalogue.
- The two new test files are not yet registered in `harness/verify-suites.json` (the Elephant does that).
- No network policy, no promotion of a result to evidence, no extra flag.
- Not proven on Windows (the shell run and the timeout kill use the platform shell and `SIGKILL`); a verify command that spawns grandchildren may outlive the timeout kill on some platforms.
- The full Verify run was not made.
