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

## Advisor-reviewed design, 2026-08-24

**Sourcing note:** obtained via direct Advisor consultation in this session
(the `advisor()` tool), cross-checked by the Elephant against source
(`project/guard-config.json`, `harness/scripts/verify.mjs`,
`plugins/pipeline-core/scripts/verify-journal.mjs`) before being recorded
here — not fabricated or restated from memory. A parallel attempt to route
this through the repo's dedicated `pipeline-core:consult-advisor` agent (the
traceable-receipt path this item's own Proposal names) was started but
stopped after 27 minutes of read-only work with no output and no visible
progress signal — cost/benefit unclear, PO flagged it live as likely not
worth continuing. That stall is itself a small friction point worth a
follow-up look if it recurs (the agent's tool set is Read/Grep/Glob only, so
it cannot have been stuck writing anything; more likely an unproductive read
loop across the same large files this design pass also had to read).

### Confirmed constraint (verified independently, not assumed from a code comment)

`project/guard-config.json`'s TP-3 pattern is exactly
`harness/scripts/verify\.mjs$` — it protects ONLY that one file.
`plugins/pipeline-core/scripts/verify-journal.mjs` and its test file are
covered by no protected-path pattern at all. This means:

- Nearly the entire pooling rewrite lands in `verify-journal.mjs` (+ its
  test) with no signature ceremony.
- `harness/scripts/verify.mjs` needs exactly ONE contiguous edit: its
  synchronous call site (`verifyRun = runVerifyJournal({...})`, currently
  around line 633, whose result is used synchronously afterward through the
  candidate-drift check around line 680) becomes
  `verifyRun = await runVerifyJournal({...})`. Scope the edit to that single
  call expression (add `await` + any concurrency-cap argument inside the
  same call) so it is one `old_string`/`Edit` region — a non-adjacent second
  change to this file costs a second ceremony (CLAUDE.md's own note on
  `guard-testpath.mjs`'s admission-matching behavior).

### Pooling mechanism and determinism

- Convert `executeSuite()`'s synchronous `spawnSync` to an async
  `child_process.spawn` wrapped in a Promise, run through a bounded worker
  pool (concurrency cap as a parameter to `runVerifyJournal`/
  `compileVerifySuites`, read from an env var or `project/pipeline.json`
  calibration inside `verify-journal.mjs` — never a new `verify.mjs` CLI
  flag, so raising the cap later never touches the protected file again).
- **`steps[]` order must stay registration order, not completion order.**
  Accumulate results into the existing `receiptBySuite`-shaped map as they
  complete (out of order), then materialize the `steps[]` array by iterating
  the original `suites` registration order once the pool drains. This keeps
  `overallExitCode = steps.find(s => s.exitCode !== 0)?.exitCode` (documented
  as "the first non-zero step's code") meaning what it already means, and
  keeps `evidence/verify-latest.json` diff-stable between runs of the same
  commit.
- **The shared `journal.jsonl` progress file and the digests derived from
  it (`journalSha256` → `terminalSha256` → `createPublicVerifyRunEvidence`)
  need the same treatment.** `appendProgress` currently writes every
  suite's start/complete line to one shared file; under concurrent
  completion the line ORDER varies run to run even though the content
  doesn't, which would make the same candidate produce a different terminal
  digest on different runs. Before deciding how hard to defend exact digest
  stability, confirm whether anything actually compares `terminalSha256`
  across separate runs for equality (vs. using it only as a single-run
  integrity check) — if it does, the clean fix is per-suite progress
  segments concatenated in registration order at the end (keeping the live
  console emit interleaved/real-time, since that's a progress stream for a
  human watching, not proof of anything).

### Serial lane (suites that must not run concurrently)

Derive mechanically, not by hand-auditing all 385: grep suite
implementations for `spawnSync`/`execSync`/`spawn` invoking `git` (racing on
`.git/index.lock` — `worktree-lifecycle`, `worktree-create`,
`worktree-target-binding`, `nova-candidate-freeze`, `guard-git`,
`guard-push`/`guard-push-v2` families), for writes under
`.git/agent-pipeline/**` (`guard-human-override`, `session-cleanup-*`,
`pipeline-state-*`, `verify-journal` itself), and for `listen(`/hardcoded
port literals (`codex-app-server-health`, `codex-advisory-app-server`).
Also watch `scratch/test-tmp/`-heavy suites (`test-tmpdir-budget-tests`,
`test-tmpdir-tests`) — this repo already hit a real temp-dir budget failure
this session from unrelated volume, so N-way concurrent temp-dir churn is a
real risk, not hypothetical. Anything not matched by the mechanical sweep
runs in the pool by default; anything matched stays in a serial lane run
before/after/around the pool. The manifest-gated `PHASE_STEPS`
(`validate-manifest` → `security-scan`) already have explicit `dependsOn`
chaining and should stay ordered relative to each other regardless.

### Staged rollout (de-risk the change itself)

1. Land the pooling mechanism with **default concurrency = 1** first — a
   structurally new code path whose evidence output (same `steps[]` order,
   same journal bytes, same terminal digest) is provably identical to today's
   sequential run. This is the shape a Critic can actually verify without
   re-deriving 385 suites' worth of trust.
2. Once that lands green, raise the default concurrency in a **second,
   separate commit**, after a full green run at N>1 confirms real suites
   still pass under real concurrency (not just the mechanism plumbing).

### Runner/headless neutrality

The pool is pure Node-level concurrency inside `verify-journal.mjs`
(`child_process.spawn` + `Promise`/bounded queue) — nothing runner-specific
about spawning multiple child processes from a Node script, so it behaves
identically whether invoked interactively under Claude Code/Codex/Antigravity
or headlessly/in CI: same script, same entry point (`node
harness/scripts/verify.mjs`), same output artifact shape. The one thing
worth confirming empirically once concurrency > 1 is live: whether any
runner's own sandboxing imposes a process-count or file-descriptor ceiling
that a pool of N children could hit before a plain sequential run would —
not identified as a concrete risk during this design pass, but not
empirically ruled out either, since no live multi-process spawn test was run
here.

### Expected payoff

Current full-run wall clock (~12–14 min ≈ 720–840s) for 385 suites is
roughly 2s/suite average, and per-suite timings observed this session are
mostly sub-second with a handful of outliers (`codex-critic-host` ~26s,
`security-scan` ~19s, `guard-push` ~30s). The win is in the long tail of
~379 fast suites, not the outliers — a pool of 8 concurrent suites should
comfortably clear the PO's 50–70% target, with the new critical path
becoming roughly the slowest single suite plus queueing overhead. Once the
pool lands, `guard-push.test.mjs`'s own per-test-case process-spawn pattern
(already named as a secondary target in this item's "Candidate shape"
section) becomes the next largest remaining single-suite cost, worth a
follow-up look rather than bundling into this same change.

### Not yet done

This is the design pass only — no implementation has landed. Per this
item's own Acceptance criteria, the next step is a scoped Goldfish
dispatch (goldfish-deep tier — this touches guardrail-adjacent execution
plumbing, test-suite authorship, and has genuine in-task design latitude
in exactly the areas this design pass flagged as open, e.g. the serial-lane
grep sweep's exact match list) implementing stage 1 (pool at concurrency=1)
first, per the staged rollout above.
