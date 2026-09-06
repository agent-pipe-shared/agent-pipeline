# `project-onboarding-v3-tests` is a serial-lane false positive — measured 2026-09-06

The single largest lane member, and on this evidence it does not belong in the
lane at all.

## Why it matters more than everything else measured today

| | Lane seconds | Share of a 645.7s gate |
|---|---|---|
| `project-onboarding-v3-tests` alone | 169.6s | **26.3%** |
| All 12 suites the module-scoping audit found eligible | 111.2s | 17.2% |
| The 8 of those clean on that audit alone | 56.6s | 8.8% |

One suite is worth more than the entire eviction list that audit produced. A
day spent on lane-membership-by-module-scoping measured the smaller axis.

## Static reading

- Each case takes its own temp root: `root()` at
  `project-onboarding-v3.test.mjs:105` is `mkdtempSync(join(tmpdir(), …))`.
- **Zero** occurrences of `process.cwd()`, `process.chdir` or `homedir()` in
  the file.
- All five `repoRoot` call sites pass a fixture `path`, never the real
  repository.
- 164 cases, 54 child-process calls — the cost is process-spawn latency, not
  shared state.

The sweep's flag for this suite was signal (a), "git without its own tmpdir
fixture". It has one. The sweep's own doc comment already anticipates this
class: *"a suite the sweep flags is never proven unsafe, only plausibly so."*

## Empirical test: the suite raced against itself

Two full instances of the suite were run **simultaneously** on the same
machine. This is a harder test than the one the lane exists to protect
against: a suite racing an unrelated lane member shares less than a suite
racing an identical copy of itself.

| Instance | Result | Duration |
|---|---|---|
| A | 164 passed, 0 failed, exit 0 | 171.1s |
| B | 164 passed, 0 failed, exit 0 | 170.4s |

**No failure, no flake, in either instance.**

## The second finding, which was not the question asked

Two concurrent instances took 171.1s and 170.4s. The suite's solo time in the
gate is 169.6s. **Running two at once cost essentially nothing extra.** The
suite does not contend for CPU; it waits on process starts.

That matters for the eviction decision: moving this suite into the ordinary
pool will not meaningfully slow the pool's other members either, because it
mostly idles.

## What eviction would buy

The lane sums to 644.9s against a 645.7s wall clock — the lane *is* the
runtime. Removing 169.6s from it leaves ~475s of lane. The pool's 1015.2s
plus this suite, spread over 8 slots, stays well under that.

**Expected saving ≈ 170s, ≈ 26% of the gate**, from a single lane-membership
change. That is roughly three times the entire "eligible 12" list.

## What this does NOT establish

Stated so the result is not over-read:

- Two concurrent runs are strong evidence, not proof. A race that needs a
  third participant, or a specific interleaving with a *different* lane
  member, would not show here.
- The sweep's signals (b) and (c) were not re-run for this suite; only (a),
  the one that flagged it, was examined and found not to hold.
- Nothing here is a lane-membership change. `verify-journal.mjs` is
  unmodified; this is the evidence an eviction package would be built on.

## The separate, still-open opportunity

Node runs `test()` cases within one file sequentially unless concurrency is
set. 164 independent cases, each with its own temp root, dominated by spawn
latency, is the textbook shape for intra-file concurrency — which would shrink
the 169.6s itself rather than merely relocating it. Not attempted here; it is
a second, independent lever on the same suite.
