# Review brief: deterministic sharding of `project-onboarding-v3-tests`

## Purpose

Reduce the dominant onboarding fixture suite's internal process-start latency
without deleting cases, weakening assertions, changing production behavior, or
making imports execute tests.

## Acceptance criteria

1. Ordinary direct and `node --test` execution completes all 166 existing cases.
2. Work is split deterministically across a bounded number of real Node child
   processes, with no duplicate or omitted declaration.
3. A child error, signal, or non-zero exit makes the parent fail.
4. Partial child results identify their shard and cannot be mistaken for the
   complete suite result; malformed shard coordinates fail closed.
5. Importing the module remains inert.
6. Focused before/after evidence uses clean, commit-bound candidates and the
   same command; integration evidence binds the implementation candidate.
7. Documentation distinguishes focused-suite reduction from total Verify wall
   clock and records the regular measurement boundary.

## Review scope

- `plugins/pipeline-core/lib/project-onboarding-v3.test.mjs`
- `backlog/items/2026-09-01-verify-runtime-is-concentrated-in-ten-suites-not-spread-across-many.md`
- `backlog/evidence/2026-09-11-project-onboarding-v3-before.json`
- `backlog/evidence/2026-09-11-project-onboarding-v3-after.json`
- `backlog/evidence/2026-09-11-project-onboarding-v3-sharding.md`
- this review brief

The item remains open after this package because residual serial-lane analysis
and subsequent release-boundary trend evidence are separate follow-up work.

## Recovery and follow-up boundary

This test-runner-only package has no production rollout or persisted-data
migration. If a later environment exposes a sharding defect, revert commit
`72617333eb5fe0fa0740fe0e174c87759b3eca31`; the suite then returns to its
previous single-process execution without changing product behavior or test
declarations.

The pipeline owner retains the residual serial-lane analysis. Reassess it with
the first 0.6.2 release-boundary Verify evidence, or by 2026-09-18 if that
release has not occurred. That date bounds this measurement follow-up; it is
not a new PO gate or a reason to run full Verify at ordinary work boundaries.
