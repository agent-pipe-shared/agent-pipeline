---
schema: pipeline.backlog-item.v1
id: pipeline.observerunner-has-no-test-coverage
type: defect
owner: pipeline
status: open
created: 2026-08-30
sprint: nova-b
tracking: "Nova B -- Critic finding (minor), NVA-CF-SANDBOXQUICKFIX delta review, not blocking"
source: "Critic review, backlog/items/2026-08-30-codex-worker-supervisor-hardcodes-a-sandbox-mode-that-blocks-git-spawn.md, Finding 2"
---

# `observeRunner()` in `local-worker-supervisor.mjs` has no test coverage

## What happened

Commit `75426da5` updated `observeRunner()`'s Codex `--help` probe
(`plugins/pipeline-core/lib/local-worker-supervisor.mjs:451`) from
`--sandbox workspace-write` to `--sandbox danger-full-access`, identically to
the real-dispatch call site in `buildLocalWorkerLaunch()` (line 760). Only the
`buildLocalWorkerLaunch()` path received a dedicated assertion (new check
`LWS05`, `local-worker-supervisor.test.mjs`) confirming the new literal is
present and the old one is absent.

`grep -n "observeRunner" plugins/pipeline-core/lib/local-worker-supervisor.test.mjs`
returns zero matches: `observeRunner()` has no test coverage at all, and had
none before this diff either -- this is a pre-existing gap, not something
this diff introduced or falsely claimed to cover.

## Risk

A future accidental revert or regression of the `observeRunner()` sandbox
literal (or any other argument in that function) would go undetected by the
test suite, unlike the now-guarded `buildLocalWorkerLaunch()` path.

## Proposal

Add a direct unit test for `observeRunner()`'s built Codex `exec --help`
probe argument shape, mirroring the existing `LWS05`-style assertion pattern
used for `buildLocalWorkerLaunch()`.

## Triage

- **Decision:** open, Nova B (minor, non-blocking)
- **Rationale:** pre-existing gap surfaced by an unrelated Critic review; not
  urgent enough to block the Nova 0.6.0 candidate
- **Date:** 2026-08-30
