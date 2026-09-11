# Nova B push-init and worktree-matcher reverification — 2026-09-11

This focused pass checked the current executable entry paths for two stale
Nova B backlog items. It did not change hook wiring or run a full Verify.

## `push-init` candidate/record separation — closed

Current implementation commit on this branch:
`f3478069afc226791ccd43b10abb01c750795bf8`, tree
`4b74fba1c0a77f81e0f688db47b1a6d22cf6da0c`.

The code and CLI now carry separate `--candidate` and `--record-ref` inputs.
When the reconciliation checker exists, omission of `--candidate` produces the
typed `candidate-required` precondition instead of substituting `HEAD`.

Focused execution outside the WSL process sandbox, required because temporary
Git child processes otherwise fail with `spawnSync git EPERM`:

- `node plugins/pipeline-core/scripts/push-init.test.mjs` — 20/20 passed.
  This includes the real-repository regression where candidate
  `8681046622dc23956b760ba93552793b3d983193` is read from the later record ref
  and Layer 1b returns a real pass.
- `node --test plugins/pipeline-core/scripts/push-release-flow-docs-contract.test.mjs`
  — passed (1 test file), confirming shipped invocation documentation matches
  the CLI contract.

The same implementation previously landed as `7d56917c`; the current branch's
`f3478069` has the identical stable patch id
`2bc7feec77d064727cbd618248ac67e8a7ec8263`.

## Worktree-isolation `Agent` matcher — remains open

The underlying library is healthy:

- `node plugins/pipeline-core/lib/worktree-count-check.test.mjs` — 33/33
  passed outside the WSL process sandbox, including direct `Agent` detection
  and two real-Git worktree-count cases.

The shipped Claude hook registration is still incomplete. Reading the live
`guard-worktree-isolation.mjs` registration from
`plugins/pipeline-core/hooks/hooks.json` and splitting its matcher on `|`
produced:

```json
{
  "matcher": "Bash|Edit|Glob|Grep|NotebookEdit|Read|Task|TodoWrite|WebFetch|WebSearch|Write|Workflow",
  "hasAgent": false,
  "hasTask": true,
  "hasWorkflow": true
}
```

Because baseline registration must observe the dispatch event itself, library
coverage cannot compensate for the absent `Agent` matcher token. The item must
remain open until the TP-4-protected registration is corrected and its actual
manifest path is regression-tested.
