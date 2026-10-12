# What real trial data says about effort

Agent-Pipeline adds planning, review, verification and controlled delivery to
an agent-led software workflow. That creates real coordination and waiting
time as well as product work. The trials below help identify where that time
went; they are not a quote for your project or a controlled comparison of
runners.

## Observations from small greenfield runs

Three 0.6.2 sessions exercised meaningful lifecycle work in Claude Code,
Codex and Antigravity. The scopes, environments and measurement methods were
not identical, so the figures must not be ranked as a runner benchmark.

| Runner | What was observed | How to read it |
|---|---|---|
| Antigravity | 114.9 minutes elapsed for a small browser game; the report records 7/7 Playwright checks and a push. | Roughly 38–42 active minutes and about 520,000 tokens were estimates, not uniformly instrumented measurements. |
| Claude Code | About 89 minutes machine-observed; the report attributes about 31 minutes to dispatched product/quality work and estimates administration at roughly 55% of its session time. | A Critic found a missing restart-test assertion; the signed push and audit path completed. Time categories and administration share are the runner's estimates. |
| Codex | Recovery, verification and worker-dispatch paths were exercised; an under-delivering worker was replaced by a fresh dispatch. | The summary does not provide directly comparable wall-time or token figures. Do not infer a cost number from this run. |

The detailed [three-runner findings](../backlog/evidence/2026-09-11-greenfield-062-three-runner-findings.md)
retain the evidence boundaries and specific follow-ups.

One separate Claude happy-path transcript covered a tiny minigame from kickoff
through attempted push. It spans 1 hour 37 minutes 53 seconds; the forensic
accounting attributes 77 minutes 34 seconds to Pipeline-operation phases and
17 minutes 15 seconds to waiting for a human response. **The push was
abandoned**, so this is not the duration of a completed delivery. It is useful
as a friction example, not a typical-run estimate.

## What the observations are useful for

Across these trials, the actionable efficiency targets were avoidable
rediscovery, retries after incomplete diagnostics, and work that produced no
usable model result—not removing deliberate planning, human approval, or
independent review. The runs also surfaced real quality findings, so reducing
elapsed time alone would be the wrong success measure.

When evaluating a workflow, compare the same task and acceptance criteria.
Record the runner and environment, elapsed time, active agent and human time,
retry count, model/settings, and task outcome; include token use only where it
is actually observed. Mark unavailable or estimated values as such. Compare
quality and recovery as well as speed. Subscription allowance and model access
vary by provider, plan and task, so these repository observations cannot
predict your bill or plan usage.

## 0.7 verification measurements

Each new exact-candidate Verify receipt can record its selected pool width,
journal wall duration, executed and reused suite-duration sums, and counts for
pool, serial and exclusive lanes. `parallelWorkRatio` is an overlap and
utilization indicator—not a speedup, cost, capacity or quality score. Suite
durations may overlap and must not be added to journal wall time.

These fields let maintainers compare Verify runs on their own candidates. They
do not authorize changing pool width, moving a suite out of a serial lane, or
reusing a receipt; those choices still require evidence about isolation and
candidate-bound inputs and outputs. They also do not measure the cost of a
consuming project's full agent workflow.

## What is not measured yet

The Greenfield runs are too heterogeneous to establish a cross-runner cost
ranking or a representative consumer-overhead estimate. Comparable
multi-runner task telemetry is still needed before making those claims.
