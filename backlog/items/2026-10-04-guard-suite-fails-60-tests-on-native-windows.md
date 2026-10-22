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

## Recorded baseline 2026-10-22

The second Proposal bullet (a recorded baseline count) is met for Linux/WSL2:
`specs/sprint-alfred-epic/evidence/guard-lifecycle-ready-suite-baseline-2026-10-22.md` records 392 cases, 389 pass,
0 fail, 3 skipped (typed native-Windows skips) at commit `f3a9f02cb`. Open: the native-Windows count at the current
commit, and the classification of the 60 failures reported on 2026-10-04 (273 cases then; 392 now).

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**

### Blocker analysis 2026-10-22

Read-only survey of the open clauses that the delivery remeasure assigned to native-host, verify-wsl, po-decision or po-signature (evidence: `specs/sprint-alfred-epic/evidence/blocker-analysis-2026-10-22/`). Status key: LINUX-RUN and WINDOWS-INTEROP-RUN are runs an agent can do from the WSL host; HOST-SESSION-NEEDED, PO-DECISION and PO-SIGNATURE are not agent work.

- **WINDOWS-INTEROP-RUN** — Run guard-lifecycle-ready.test.mjs on native Windows and state the counted result
  Run plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs (392 cases; Linux baseline 389 pass, 0 fail, 3 typed skips at f3a9f02cb) with Windows node through cmd.exe on a Windows-drive clone. Expected to take hours (large guard suite, POSIX-permission checks); record pass/fail/skip and classify any red case.
