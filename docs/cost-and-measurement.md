# Measurement boundary

This page does **not** estimate the time, tokens, subscription cost, or
administrative effort for your project. No comparable consumer measurement
exists yet across runners. Do not use it to budget adoption, compare runners,
or choose a model subscription.

What a future project measurement needs is a comparable workload, observed
runner and environment conditions, wall-clock start/finish, task outcome,
active work versus administration time, and tool-use or token counts where
available. Missing measurements must remain `unavailable`, never be replaced
by zero or an estimate.

The historical source receipts behind the limited observations below are kept
in the [measurement evidence](../backlog/evidence/2026-09-08-adoption-reference-pages-and-verify-measurements.md).
They are traceability material, not a user-facing benchmark.

## Historical Verify observations

Four historical Full-Verify receipts took roughly 447–698 seconds. Two of the
four were red gates, so none establishes an improvement or a delivery-time
expectation. The runs used different candidates and were not a controlled
experiment; individual durations must not be attributed to a code change or a
host condition.

Historical serial-lane scheduling also reduced one source-suite span from
about 646 seconds to about 455 seconds. A suite span is not whole-run wall
time: pool-suite durations overlap and must not be added to it. This is a
source-maintenance observation, not a promise that a consumer project will
reproduce it.

## 0.7 Verify execution metrics

The prepared 0.7 Verify evidence adds a machine-readable `execution` summary
to each new exact-candidate receipt. It records the selected pool width, whole
journal wall duration, executed and reused suite-duration sums, and counts for
pool, serial, and exclusive lanes. `parallelWorkRatio` is the executed
suite-duration sum divided by the journal wall duration. It is an overlap and
utilization indicator, **not** a speedup, cost, capacity, or quality score.

The fields make two candidate-bound runs comparable without adding overlapping
suite durations to wall time. They do not authorize changing pool width,
moving a suite out of a serial lane, or reusing a receipt. Those changes still
need an independent input/output, isolation, and candidate-binding analysis.

## What remains unmeasured

A comparable two-runner consumer-overhead measurement remains pending.
