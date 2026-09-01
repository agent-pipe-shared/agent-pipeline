---
schema: pipeline.backlog-item.v1
id: pipeline.verify-runtime-concentrated-in-ten-suites
type: defect
owner: pipeline
status: open
created: 2026-09-01
sprint: nova-b
tracking: "Nova B — the parallelized verify has regressed from 419s to 571s in one week, and the single suite named as its next lever grew 35% in the same period. Also supplies the all-fresh full-run artifact two older items were blocked on."
source: "Full verify at commit 0f0ed3f7 on 2026-09-01, exit 0, all 505 steps green and every one of them fresh (reused: 0). Per-suite wall clock from the run's own pipeline.verify-progress.v1 stream; total wall clock computed from its first startedAt to its last completedAt."
done_when: manual
---

# The parallelized verify has regressed 36% in one week

## Correcting the framing first

This item was originally filed on 2026-09-01 claiming `verify.mjs` had no
concurrency at all. That was wrong, and the error is recorded rather than
quietly edited away because it is instructive: the grep that produced it
searched `harness/scripts/verify.mjs`, and the worker pool does not live there.
It lives in `plugins/pipeline-core/scripts/verify-journal.mjs`
(`DEFAULT_VERIFY_CONCURRENCY = 8`, `runSuitePool`, a 60-member serial lane and
an exclusive pre-phase). Searching the orchestrator for a mechanism that lives
in the library it calls is a cheap mistake to make and an expensive one to act
on.

## Measured, 2026-09-01

| | |
|---|---|
| Steps | 505, all exit 0 |
| Fresh vs. reused | **505 fresh, 0 reused** |
| Candidate binding | exact, `0f0ed3f7` |
| Summed suite time | 1459.6s |
| **Actual wall clock** | **571.4s (9m 31s)** — effective speedup 2.55x |

Ten suites carry 42.2% of the summed time; 360 of 505 finish under one second
and 453 under five. The top five:

| Suite | 2026-09-01 | 2026-08-25 |
|---|---|---|
| `project-onboarding-v3-tests` | **157.0s** | 116.5s |
| `guard-push-tests` | 77.7s | — |
| `doc-contract-tests` | 71.4s | — |
| `onboarding-init-tests` | 59.7s | — |
| `codex-pretool-guard-tests` | 56.8s | — |

## The regression

`2026-08-24-verify-mjs-runs-385-suites-strictly-sequentially.md` was closed on
2026-08-25 by PO decision, accepting a measured clean full run of **419s** and
naming `project-onboarding-v3-tests` (then 116.5s) as the concrete next lever if
anyone picked it up.

One week later the same gate takes **571.4s** — 36% slower — and that named
suite has grown to **157.0s**, up 35%. It is in the serial lane, so it cannot
overlap with the other 59 lane members, and it alone is now more than a quarter
of the summed suite cost.

Neither number was going to surface on its own. The closed item's own next-lever
note was left as an unblocking observation rather than a tracked condition, and
nothing measures wall clock between releases.

## Why "sort out old test cases" is not the remedy

Raised by the PO on 2026-09-01 as the intuitive fix. The distribution rules it
out: everything below rank 25 — roughly 480 suites — sums to 520s of *summed*
time, which under concurrency is a far smaller share of the 571s wall clock.
Deleting a hundred sub-second suites would buy very little, while spending real
review effort on correctness-sensitive deletions in a repository whose stated
discipline is that tests are the contract.

That is not an argument against removing obsolete tests. A test pinning a
mechanism that no longer exists should go on maintenance grounds, regardless of
its runtime. It is an argument against letting a runtime complaint choose which
tests get deleted, because it would select the cheap ones and leave the
expensive ones untouched.

## Relationship to the two existing items — neither is a duplicate

- `pipeline.verify-has-grown-to-269-suites-with-no-recorded-cost` (open): its
  lever is **selective execution**. Its 2026-08-20 design pass states that its
  smallest safe next step is "one successful stable full Verify run at the
  intended candidate baseline with every suite fresh (`reused: false`)". **That
  artifact now exists** — the run above, 505/505 fresh, exit 0, exact binding.
  Whoever picks that item up should not commission another one.
- `pipeline.verify-mjs-runs-385-suites-strictly-sequentially` (closed): its
  lever was **parallelizing the same suite set**, and it delivered. This item
  does not reopen it or dispute its result; it records that the result has
  since decayed.

## Acceptance criteria

- The cause of the 419s → 571s regression is identified, distinguishing suites
  that grew from suites that were added.
- `project-onboarding-v3-tests`'s internal cost is profiled — subprocess and
  fixture count inside that one file — since the closed item already
  established that no concurrency-cap change moves it.
- A decision is recorded on whether wall clock is measured at any regular
  boundary, so the next regression is noticed rather than re-discovered.
- Any obsolete-test cleanup is tracked separately, justified per suite, and
  never on runtime grounds.
