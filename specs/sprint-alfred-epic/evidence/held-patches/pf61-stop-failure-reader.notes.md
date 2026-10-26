# Held patch: PF-61 reader, a background Goldfish stop failure surfaces at the next briefing build

Patch: `pf61-stop-failure-reader.patch` (git diff against the stack commit `0cea4a3f`, which is HEAD plus the held patches
applied in order; apply with `git apply --index`).
Apply AFTER `d162-s4-orientation-migration.patch`, as the 19th patch of `scratch/wave3/hotfix-order-19.txt`.
Reason it is held: `plugins/pipeline-core/scripts/dispatch-briefing.mjs` is also changed by `pf65-orientation-bound.patch`
(item 10), so this diff only applies on top of the stack.

## Cause

`pf61-subagent-handback-commit.patch` (item 9) persists a `stop-failure-<dispatchId>.json` diagnostic under
`<git-common-dir>/agent-pipeline/run/native-goldfish-host-commit/` when the SubagentStop host commit of a background Goldfish
fails. SubagentStop surfaces no stderr to the orchestrator, and nothing read that file, so the failure stayed invisible.

## Fix

`runDispatchBriefing` gets a `deps.stopFailures` seam. The default reader resolves the git common dir through
`lib/po-key-directory.mjs` and lists at most 20 regular, non-symlink `stop-failure-*.json` files, each read bounded to 64 KiB
with `O_NOFOLLOW`. It keeps only objects of schema `pipeline.native-goldfish-host-stop-failure.v1` with string `dispatchId`
and `code`. Each kept entry adds one non-blocking warning `DBG-HOST-COMMIT-STOP-FAILURE`, ordered by `observedAt` then
`dispatchId`, naming dispatch, code, status, candidate commit and the next step (verify the diff, commit with the Dispatch
trailer, rebuild). The build never refuses on it, and the reader never deletes, moves or rewrites a file; the next successful
completion removes the diagnostic. Any reader fault yields an empty list.

## Touched files and preimage SHA-256 (measured on the stack commit `0cea4a3f`)

- `plugins/pipeline-core/scripts/dispatch-briefing.mjs` `2a3f5e2c2520803e61da8be227066bfbc77b6782b367ee7aee5818ed8619ee42`
- `plugins/pipeline-core/scripts/dispatch-briefing.test.mjs` `81433770704ca6bcb91c8919cc598da2af05a842fcb8923c0494723b327fc995`

## Counts

- dispatch-briefing.test.mjs with the change: 94 tests, 93 pass, 1 fail. On the stack without the change: 90 tests, 89 pass,
  1 fail. The single failure is the same help-audit case ("public --help and -h work before setup", HELP-FORBIDDEN-IO) in both
  runs, so it is pre-existing and not caused by this patch.
- New tests (prefix "PF-61 reader"): 4 of 4 pass.
- harness/scripts/check-consumer-safe-paths.test.mjs: 9 tests, 9 pass.
- lib/pins/claude-background-goldfish-is-host-committed-at-subagent-stop.test.mjs: 12 tests, 12 pass.
- lib/guard-maintenance-window-kernel-closure.test.mjs on all 19 patches: 1 test, 1 pass.
- Stack check on a fresh clone of repository HEAD `02b1a84e8`: all 19 patches of `hotfix-order-19.txt` apply in order.

No existing assertion changed; the test file only gains the `symlinkSync` import and the four new tests.

## Proposed commit message

```
feat(dispatch): surface a background Goldfish stop failure at the next briefing build

A failed SubagentStop host commit left a stop-failure diagnostic that nothing read,
because SubagentStop shows no stderr (PF-61). The briefing build now lists those
diagnostics read-only and adds one non-blocking warning per entry with the next step.
```
