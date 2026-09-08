# Cost and measurement

Use measured receipts when weighing delivery assurance against elapsed time. The figures here describe bounded historical Verify runs in this repository; they are not a price list, a model recommendation, or a forecast for another project. The durable receipt identities and hashes are recorded in the [measurement evidence](../backlog/evidence/2026-09-08-adoption-reference-pages-and-verify-measurements.md).

## Historical lane eviction

On 2026-09-06, serial-lane eviction reduced the historical Verify **suite span** from 645.7 seconds to 482.5 seconds for the first eviction, and then to 454.9 seconds for the second. Suite span means the progress-stream interval from the first suite `startedAt` to the last suite `completedAt`. It is not the whole Verify run envelope. The first comparison retained one non-zero suite before and after; the later registration blocker was resolved separately.

This was a historical change to serial scheduling, not a promise that every host or candidate will reproduce the result. Pool-suite durations overlap and must not be added to report wall time.

## Full-Verify envelopes

The table uses a different measurement: whole-run envelope, from a receipt's `startedAt` to `finishedAt`. Each row names its exact candidate and receipt outcome so a clean result is not confused with a red gate.

| Receipt start date (UTC) and candidate commit | Envelope | Result |
| --- | ---: | --- |
| 2026-09-06, `1c03ab9cf306a26b73d6c552e93be2074e203c0d` | 446.923s | 516/516 |
| 2026-09-07, `f94882ba6e59cc093b4500af3ad50c3fb50f818c` | 469.781s | 517/517 |
| 2026-09-08, `12556ed0ead9ab9ad12cf4892f7886c36b0bc73b` | 595.413s | 515/517 |
| 2026-09-08, `37aa24fc327b910e6b74ba26bdcb8e1601605e7a` | 697.804s | 514/517 |

The last two rows are red gates, so neither is a performance improvement. No verified 4.5-minute full-gate result appeared in the bounded examined receipt set. That statement is limited to this set; it does not claim that no such run has ever existed. Timing variation is observational here: do not attribute it to a particular code change or host condition without a controlled experiment.

## What remains unmeasured

There is no verified public measurement of consumer administration overhead. A useful comparison would retain comparable workloads across at least two runners and record wall-clock start/finish, task outcome, active work versus administration time, tool-use or token counts where available, and the runner and environment conditions. A comparable two-runner measurement remains pending.
