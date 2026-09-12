---
schema: pipeline.backlog-item.v1
id: pipeline.verify-runtime-concentrated-in-ten-suites
type: defect
owner: pipeline
status: closed
created: 2026-09-01
sprint: nova-b
tracking: "Nova B — the parallelized verify has regressed from 419s to 571s in one week, and the single suite named as its next lever grew 35% in the same period. Also supplies the all-fresh full-run artifact two older items were blocked on."
source: "Full verify at commit 0f0ed3f7 on 2026-09-01, exit 0, all 505 steps green and every one of them fresh (reused: 0). Per-suite wall clock from the run's own pipeline.verify-progress.v1 stream; total wall clock computed from its first startedAt to its last completedAt."
done_when: manual
closure_commit: 0eba7f80f050d1affc819940e3a834db6cbc18b0
closure_evidence: backlog/evidence/2026-09-12-verify-runtime-concentration-closure.md
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

## Trend, continued — 2026-09-06

| Date | Wall clock | Event |
|---|---|---|
| 2026-08-25 | 419s | closure measurement of the sequential-verify item |
| 2026-09-01 | 571s | this item filed (+36%) |
| 2026-09-06 | 646s | first full green since 2026-09-02 (+13% in five days) |
| 2026-09-06 | **482s** | `f16ab254`: `project-onboarding-v3-tests` evicted from the serial lane (−25%) |
| 2026-09-06 | 485s | re-measured at `a478b10c` after the day's remaining commits (+2.5s) |
| 2026-09-06 | **454.9s** | `fcaf8d5e`: `session-cleanup-binding-tests` and `worktree-lifecycle-tests` evicted (−30.1s, −6.2%; cumulative −29.5% from 645.7s) |

The named next lever was the right one, and it was a lane-membership question
rather than a suite-cost question: the suite was a serial-lane false positive
(each case owns a `mkdtemp` root; two full instances raced against each other
164/164 green, `2026-09-06-onboarding-suite-lane-false-positive.md`). Moving
it into the ordinary pool removed its 169.6s from the critical path without
touching the suite.

**The suite itself is still 169.6s and still growing**, now hidden inside the
pool rather than dominating the lane. The intra-file concurrency lever remains
untouched. And the lane is still 100% of wall clock: its new top five
(`guard-lifecycle-ready`, `codex-pretool-guard`, `gate-strength-guard`,
`human-guard-override`, `onboarding-continuity`) are 52% of the remaining
gate and are **not** false positives on the same test — they exercise guards
that write under `.git/agent-pipeline/**`
(`2026-09-06-verify-lane-achievable-win.md`).

This item stays open: the regression it names is measured, not resolved, and
the between-releases wall-clock measurement it asks for still does not exist.

## Profile and first implementation — 2026-09-11

The remaining internal cost of `project-onboarding-v3-tests` is now reduced at
its source. A clean run of the unchanged 166-case suite at `949eb2e8` took
55.771s. Commit `72617333` gives the direct entry point four deterministic Node
child shards; every declared case is assigned by declaration index modulo four,
imports remain inert, partial child execution is labelled explicitly, and the
parent fails on any child error, signal, or non-zero exit. The same 166 cases
then took 16.930s, with 166 passed and zero failed in both measurements. That is
a 69.6% reduction for this suite on the same machine and command.

The exact-candidate full Verify at `72617333` passed 520/520 fresh steps. Under
that pool load the suite took 20.669s; the full gate took 190.374s. The suite
result therefore reduces compute and pool pressure, but it is not a claim that
the entire gate became 69.6% faster. The serial lane still determines the full
gate's critical path.

Durable method, bindings, raw-output hashes, and limitations are recorded in
`backlog/evidence/2026-09-11-project-onboarding-v3-sharding.md` and its linked
machine evidence.

The next serial-lane slice reduces `codex-pretool-guard-tests` without moving
or weakening it. Its 36 isolated integration cases now run in three
deterministic child shards and are reported in declaration order. The first
implementation exposed a partial-suite environment switch; the Critic found
it, and the correction restricts shard mode to children with the controller's
Node IPC channel. The controller also requires exactly 36 unique contiguous
ordinals and propagates child errors, signals, malformed output and failed
cases.

An exact detached-candidate run at `298614da` passed 36/36 in 12.90s, down
from the 29.73s unchanged-suite baseline on the same machine (56.6% less wall
time). The named serial debug filter remains available, while a direct forged
shard invocation exits non-zero. See
`backlog/evidence/2026-09-11-codex-pretool-guard-sharding.md`.

## Wall-clock boundary decision

Release-mode full Verify is the regular measurement boundary. Each such run
already records exact candidate binding, `startedAt`, `finishedAt`, and every
suite duration; release evidence must use those fields to report total wall
clock and the leading suites. Ordinary implementation and Critic verification
remain impact-scoped, because forcing a full run at those boundaries would
reintroduce the cost this work is reducing. No blocking duration threshold is
set from a single newer sample; the release series supplies the stable baseline
needed for a later threshold.

The historical 419s → 571.4s change has two distinguishable components. The
registered suite set grew from 385 to 505 (+120), while
`project-onboarding-v3-tests` grew from 116.5s to 157.0s (+40.5s). The named
suite accounts for about 27% of the 152.4s wall-clock regression because it was
then serial. Added suites and other serial-lane growth account for the remaining
change, but the existing artifacts do not justify a finer numeric attribution.

This item remains open until the residual serial critical path is assessed and
the release-boundary trend is exercised by subsequent release evidence.

The next bounded batch in `a1446c56` adds exact case-completion evidence to
three measured legacy suites: `onboarding-continuity-tests` (previously about
35.3s), `project-authority-tests` (about 25.3s), and
`runner-profile-migration-v3-tests` (about 5.8s). It improves diagnostic
completeness for 367 cases but does not claim a runtime reduction; no suite was
deleted or bypassed. Runtime work remains focused on the measured serial path.

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

## Closure — 2026-09-12

Closed. The regression is decomposed, both measured hot suites were sharded
without deleting cases, release-mode all-fresh measurement is now a supported
and exercised regular boundary, and the remaining serial critical path is
ranked in the fresh evidence. The release-mode run at `0eba7f80` completed
520/520 fresh suites in 188.208 seconds; two later exact clean 534-suite runs
completed in 189.320 and 185.594 seconds. This closes the measured regression
and its missing-observation mechanism. Further case-completion migrations and
individual suite work remain owned by their existing separate items.
