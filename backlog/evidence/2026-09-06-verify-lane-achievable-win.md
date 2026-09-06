# What the verify-lane optimisation can actually buy — measured 2026-09-06

Measured against the run at commit `d483eea6` (515 suites, wall clock
645.7s), using the audit's own eligibility list. Recorded because the
optimisation had been promised in vaguer terms twice, and the honest number
is smaller than either promise.

## The structural facts, unchanged

- Wall clock 645.7s; the 60-member serial lane sums to 644.9s. **The lane is
  the runtime** — lane seconds removed are wall-clock seconds saved, and
  raising pool concurrency or deleting fast suites cannot help.
- The pool runs 1015.2s of work entirely in the lane's shadow.

## The ceiling, and why it is low

| Group | Lane seconds | Share of wall clock |
|---|---|---|
| All 12 suites the audit found eligible | 111.2s | 17.2% |
| — of those, clean on this audit alone (8) | 56.6s | 8.8% |
| — of those, needing a further audit round (4) | 54.6s | 8.5% |
| Top 5 lane members, **not** evictable | 378.4s | 58.6% |

The last row is the whole story. `project-onboarding-v3-tests` alone is
169.6s — more than the entire eligible set. It, `guard-lifecycle-ready-tests`,
`codex-pretool-guard-tests`, `gate-strength-guard-tests` and
`human-guard-override-tests` together are 59% of the gate, and the
module-scoping audit established that the modules behind them
(`pipeline-state.mjs`, `human-guard-override.mjs`) are process-global. They
cannot be evicted on the caller-scoping criterion at all.

## The clean 8, per suite

```
  26.9s  session-cleanup-binding-tests
  15.2s  guard-maintenance-window-tests
   8.1s  worktree-lifecycle-tests
   2.7s  codex-sandbox-runtime-tests
   2.1s  session-cleanup-power-tests
   0.9s  session-power-cli-tests
   0.3s  session-cleanup-owner-nonce-tests
   0.3s  lifecycle-ready-enforcement-tests
```

Two suites carry 74% of that subset. The remaining six are worth 6.3s
combined — evicting them is measurable only in aggregate and not worth an
audit round of its own.

## What this changes

**An eviction package for the clean 8 is worth doing** — roughly 9% off the
gate, and the safety question for them is already answered on the
module-scoping criterion. It still needs the original sweep's signals (a) and
(c) cleared per suite before anything is removed from the lane.

**Chasing the caveated 4 is probably not worth it.** They are 8.5%, and each
needs its own module audited (`verify-journal.mjs`, `project-authority.mjs`,
`session-cleanup-recovery.mjs`) — the same cost as the audit that produced
this list, for half its yield.

**The large win does not exist on this axis.** Getting the gate meaningfully
faster means making `project-onboarding-v3-tests` cheaper or making
`pipeline-state.mjs` caller-scoped so its ~10 suites can leave the lane —
both real projects, neither a lane-membership question. Anyone told "the
verify optimisation is in the candidate" should read that as **at most ~9%**,
and only after an eviction package that has not been written.

## Method

`scratch/eligible-12-cost.mjs`, parsing the `pipeline.verify-progress.v1`
stream. The suite list and the caveats are taken from
`2026-09-06-nva-b-verifylane-2-module-scoping-audit.md`, not re-derived. The
raw stream is a machine-local run artifact and is not committed; the numbers
above are a recorded measurement, re-derivable by running the script against
any fresh verify stream.
