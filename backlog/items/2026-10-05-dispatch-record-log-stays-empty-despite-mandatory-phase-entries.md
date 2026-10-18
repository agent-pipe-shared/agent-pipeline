---
schema: pipeline.backlog-item.v1
id: pipeline.dispatch-record-log-stays-empty-despite-mandatory-phase-entries
type: defect
owner: pipeline
status: open
created: 2026-10-05
source: "Live observation 2026-10-05 (Alfred session): three Goldfish dispatches in a row; ALFRED-BACKLOG-20261005 defect 3."
sprint: alfred
done_when: manual
---

# Dispatch-record log stays empty despite the mandatory per-phase entries

## Description

Three Goldfish dispatches in a row left the dispatch record's `log` empty although the briefing and `roles/goldfish.md` section 6 require an entry per phase. The progress trail the record exists to provide was therefore absent when the runs ended early.

## Triggering situation

2026-10-05 dispatches whose final records had `log: []`. Likely contributors: the commit-then-record ordering collision (`GUARD-DISPATCH-RECORD-COLLISION`, see `2026-10-04-parallel-work-in-one-checkout-is-unsafe.md`) and each log append costing a tool use against a tight budget.

## Affected artifact

`templates/prompts/goldfish-task.md` field 6, `roles/goldfish.md` section 6, `agents/goldfish-implementor.md`.

## Proposal

Reproduction shape: dispatch a Goldfish with the standard briefing and inspect `evidence/dispatch-record-<TASK_ID>.json` at the end. Fix direction: measure why entries are skipped (budget pressure vs. ordering vs. wording); consider a mechanical check at dispatch close that rejects a terminal record with an empty `log`, and fold log appends into existing writes rather than extra tool calls.

## Observed 2026-10-18: AGY greenfield, hand-typed JSON records (F-06)

Source: PO-supplied forensic analysis of the Antigravity greenfield run on WSL
(`scratch/pipeline-analyse-greenfield_agy_20261026.md`, finding F-06, improvement 4.2),
installed `pipeline-core` 0.6.2.

- About 65 steps were lost on schema refusals for the design review, the architecture
  input and the dispatch records. Required fields (`bundleSha256`, `criteria[]`,
  `outcomeClassification`, `criticRequired.appliedRow`) had to be read out of the
  validators.
- Re-check against 0.7.0 (2026-10-18): no scaffolder exists. There is no
  `init-dispatch-record` and no `init-design-review`. The architecture input is gone
  because materialization reads the design itself.

Added acceptance (0.7.0, minor):

- A dispatch record and a design review can be started from a generated, valid skeleton
  with the digests pre-filled. The agent fills judgment fields only.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
