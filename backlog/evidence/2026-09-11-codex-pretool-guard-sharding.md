# Codex pretool guard suite sharding

Date: 2026-09-11

The registered `codex-pretool-guard-tests` suite contained 36 isolated
integration cases. Each case starts the production adapter and nested guard
processes, while the direct suite entry point executed all cases serially.

Commit `cf524617` introduced three deterministic child shards. Critic review
then found that an inherited shard environment variable could select a
partial suite without the controller. Commit `298614da` closes that route:
only children connected through Node's parent IPC channel may enter shard
mode, and the controller requires exactly 36 unique contiguous ordinals.
Child errors, signals, malformed output, failed cases and incomplete coverage
all make the controller fail. The existing named-filter path remains serial.

Exact-candidate evidence was collected in a detached worktree at
`298614da`:

- command: `node plugins/pipeline-core/hooks/codex-pretool-guard.test.mjs`;
- result: 36 passed, zero failed;
- elapsed: 12.90s; user CPU: 23.53s; system CPU: 11.41s;
- prior unchanged-suite baseline on the same machine: 29.73s;
- wall-clock reduction: 56.6%.

A direct invocation with `PIPELINE_CODEX_PRETOOL_TEST_SHARD=0` exits non-zero
before registering tests. A named filtered invocation remains green. The
independent correction Critic reported no findings in this file's scope.

This is one suite-level optimization. The parent Verify-runtime item remains
open for the other serial-lane suites and the release-boundary trend check.
