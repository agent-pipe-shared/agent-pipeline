---
schema: pipeline.backlog-item.v1
id: pipeline.observerunner-has-no-test-coverage
type: defect
owner: pipeline
status: closed
closed_at: 2026-09-01
closure_commit: d8465468761105fe3a789a0ab89e409b26360a02
closure_repository: "self"
closure_evidence: plugins/pipeline-core/lib/local-worker-supervisor.test.mjs
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

## Closed, 2026-09-01 — coverage landed, verified live before closing

Commit `d8465468` added check `LWS15` to
`plugins/pipeline-core/lib/local-worker-supervisor.test.mjs`:
"pins observeRunner's Codex --version and --help probe argument vectors to the
host-boundary sandbox". It locates the `observeRunner(` function body, extracts
every `execFileSync` argument vector inside it, and asserts
`danger-full-access` present with `workspace-write` and
`sandbox_workspace_write.network_access` absent.

Re-checked live before closing rather than trusting the dispatch report: the
`observeRunner` grep this item cites as returning zero matches now returns the
assertions above, and the suite is registered and passed in the full verify at
`0f0ed3f7` (`local-worker-supervisor-core-tests`, exit 0).

The coverage is broader than the Proposal asked for — it pins the `--version`
probe as well as `--help`. Stated plainly for the record: it is a source-text
assertion over the built argument vector, in the `LWS05` pattern this item's own
Proposal named, not a behavioural execution test. That is the right shape for
pinning an argument literal against accidental revert, which is the risk this
item describes, and it is not sufficient evidence that the probe works against a
real runner. Nothing here claims otherwise.
