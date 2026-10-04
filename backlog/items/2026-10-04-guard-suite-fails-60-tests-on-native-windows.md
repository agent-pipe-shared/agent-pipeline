---
schema: pipeline.backlog-item.v1
id: pipeline.guard-suite-fails-60-tests-on-native-windows
type: defect
owner: pipeline
status: open
created: 2026-10-04
source: "Baseline measurement, native Windows, 2026-10-04, feat/sprint-alfred, repository copy unchanged."
sprint: alfred
done_when: manual
---

# The guard suite fails 60 tests on native Windows

## Description

Running `plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs` (the
repository copy, unchanged) on native Windows on 2026-10-04 gives 273 tests,
213 passing and 60 failing. The failures have been known since 2026-09-30 as
stale fixture activation assumptions ("old fixture activation assumptions").
A staged post-image of a guard change showed 194 pass and 79 fail; an
identical run with only the earlier guard hotfix staged gave the same counts,
so the 19 extra failures are staging artefacts and not regressions.

Sixty red tests in the suite that guards the lifecycle make any guard change
hard to attribute and are a candidate blocker for Verify.

## Triggering situation

W0-4 baseline measurement before staging an approved-state fix, 2026-10-04.

## Affected artifact

`plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs` (fixtures and
their activation assumptions).

## Proposal

- Classify the 60 failures (stale fixture assumption, platform difference,
  real defect) and bring the fixtures in line with the current activation
  model, as its own work package in the first intermediate candidate.
- Keep a recorded baseline count so a later change can be attributed without a
  staging experiment.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
