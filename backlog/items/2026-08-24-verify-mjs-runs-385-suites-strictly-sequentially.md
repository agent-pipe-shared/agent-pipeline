---
schema: pipeline.backlog-item.v1
id: pipeline.verify-mjs-runs-385-suites-strictly-sequentially
type: workflow-improvement
owner: pipeline
status: open
created: 2026-08-24
source: "PO observation during the sprint-agy-runner D-fix wave, 2026-08-24 (\"wir müssen verify mindestens um 70% beschleunigen ... von mir aus auch 50% aber schneller ohne Verluste\")"
due: 2026-08-31
---

# `verify.mjs` runs its 385 registered suites strictly sequentially, with no worker pool

## Description

`harness/scripts/verify.mjs` executes its full registered suite list one at a
time: each suite is its own `spawnSync` child process, run in a plain
sequential loop (confirmed by reading the file — no `Promise.all`, no
concurrency primitive anywhere in the suite-running path). A full run this
session took ~12–14 minutes end to end.

Two concrete cost drivers observed directly this session:

- Per-suite process-spawn overhead across 385 suites, most of them small/fast
  individually, adds up with nothing running concurrently.
- At least one suite (`guard-push.test.mjs`) additionally spawns a FRESH node
  child process PER TEST CASE inside itself (156+ cases), which alone
  accounted for roughly 30 seconds of the total run, serialized.

## Why this matters

The PO hits this wall on every Verify run during active development, and
asked directly for a 50–70% reduction without losing coverage or rigor. A
bounded worker pool across the outer suite loop is the obvious first lever —
most suites are already independent (isolated fixtures, temp dirs per case)
so nothing about their current design should block running several
concurrently, but this needs to be verified case by case, not assumed
uniformly true.

## Explicit design constraint (PO, 2026-08-24)

This must be designed once, properly, so it works uniformly for every runner
and session shape this repository supports (Claude Code, Codex, Antigravity;
local dev loop and any headless/CI-style invocation) — not hand-rolled ad hoc
inside a single session. Route through the Advisor for the actual design pass
before implementation.

## Candidate shape (not a spec; input for the Advisor design pass)

- A bounded concurrency pool (configurable cap, mind the same class of
  resource-contention concerns `scratch/test-tmp/`'s budget check already
  exists to catch) running suites in parallel, falling back to the current
  sequential behavior where a suite is known/flagged as unsafe to run
  concurrently (shared global state, fixed ports, etc.).
- Separately, `guard-push.test.mjs`'s per-case process-spawn pattern is its
  own, more localized optimization target (batch cases through fewer
  processes, or an in-process invocation path for the guard) — smaller in
  scope than the outer pool, but a candidate for the same pass.

## Acceptance

- An Advisor-reviewed design exists before any implementation lands.
- The design states explicitly how it behaves under each supported runner
  (Claude Code, Codex, Antigravity) and under a headless/CI-style invocation,
  not just the interactive local case this was observed in.
- Full Verify wall-clock time drops materially (target: 50–70%, per the PO)
  with zero loss of suite coverage, isolation, or determinism — the same
  registered suite set runs, each suite's own pass/fail result is unchanged
  from a sequential run of the same commit.
