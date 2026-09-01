---
schema: pipeline.backlog-item.v1
id: pipeline.verify-runtime-concentrated-in-ten-suites
type: requirement
owner: pipeline
status: open
created: 2026-09-01
sprint: nova-b
tracking: "Nova B — PO observation that verify has grown too long. Measured: the cost is concentrated in ten integration-heavy suites and the run is fully sequential, so removing test cases is not the lever it appears to be."
source: "Full verify at commit 0f0ed3f7 on 2026-09-01, exit 0, all 505 steps green. Per-suite wall clock taken from the run's own pipeline.verify-progress.v1 stream, which records startedAt/completedAt for every suite."
done_when: manual
---

# Verify's runtime is concentrated in ten suites, not spread across many

## The measurement

One full verify, 505 steps, all green. Summed suite wall clock: **1459.6s
(24.3 minutes)**, executed strictly sequentially.

| Rank | Suite | Time | Share |
|---|---|---|---|
| 1 | `project-onboarding-v3-tests` | 157.0s | 10.8% |
| 2 | `guard-push-tests` | 77.7s | 5.3% |
| 3 | `doc-contract-tests` | 71.4s | 4.9% |
| 4 | `onboarding-init-tests` | 59.7s | 4.1% |
| 5 | `codex-pretool-guard-tests` | 56.8s | 3.9% |
| 6 | `gate-strength-guard-tests` | 49.3s | 3.4% |
| 7 | `local-worker-supervisor-cli-tests` | 38.7s | 2.6% |
| 8 | `codex-critic-host-tests` | 38.1s | 2.6% |
| 9 | `onboarding-continuity-tests` | 34.7s | 2.4% |
| 10 | `human-guard-override-tests` | 33.2s | 2.3% |

**Ten suites carry 42.2% of the runtime.** The distribution underneath is the
opposite shape: **360 of 505 suites finish in under one second**, 453 under five
seconds, and everything below rank 25 — some 480 suites — sums to 520s.

## Why this matters for the obvious remedy

The intuitive fix for "verify takes too long" is to remove old or redundant test
cases. The measurement says that will not work: the many small suites are not
where the time is. Deleting a hundred sub-second suites would save under two
minutes and would spend real review effort — and each deletion carries the risk
of removing a case that still pins live behaviour, in a repository whose whole
discipline is that tests are the contract.

This is not an argument against tidying obsolete tests. Maintenance burden is a
real and separate cost, and an obsolete test that pins a mechanism which no
longer exists is worth removing on its own merits. It is an argument against
expecting that work to make verify meaningfully faster, and against letting a
runtime complaint drive a correctness-sensitive deletion pass.

## The actual lever, and its cost

`harness/scripts/verify.mjs` contains no concurrency whatsoever — no worker
pool, no `Promise.all` over suites, no CPU-count awareness. Every suite runs to
completion before the next starts. On a multi-core machine most of the wall
clock is idle capacity.

Parallelizing is therefore the lever, but it is not free and must not be
attempted as a quick change:

- Suite isolation is unproven at this scale. The repository already carries
  `test-tmpdir-budget-tests`, `test-tmpdir-tests` and `tmp-leak-guard-tests`,
  which exist precisely because temp-directory discipline has been a problem.
  Two suites sharing a fixture path would fail non-deterministically under
  concurrency and pass on a re-run — the worst failure mode a gate can have.
- Several suites exercise guards, hooks and git state. Whether any of them
  mutate shared repository state must be established per suite, not assumed.
- The candidate-binding check (`VERIFY-CANDIDATE-DRIFT`) and the progress/
  journal receipts assume an ordered stream; concurrency changes what "step N"
  means for resume.

A staged approach is likely right: prove isolation for the ten expensive suites
first and parallelize only those, keeping the long tail sequential. That
captures most of the available saving against the smallest isolation surface.

## Acceptance criteria

- A decision is recorded on whether verify parallelizes, and at what scope.
- If it does, suite isolation is demonstrated rather than assumed, with a
  documented method for deciding whether a given suite is safe to run
  concurrently.
- A run under concurrency produces the same step results as a sequential run
  across repeated executions — non-determinism is the failure this must exclude.
- Candidate binding, the progress stream, and verify resume keep working.
- Any separate obsolete-test cleanup is tracked on its own, with per-suite
  justification, and is not justified by runtime.
