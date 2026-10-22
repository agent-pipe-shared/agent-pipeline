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

- **Decision:** accepted and built; the empty-log rule is decided by D77 (K6, 2026-10-21): a new terminal v3/v4 record with an empty log is refused at write, committed v3 history stays readable.
- **Rationale:** the check belongs on the write path (`dispatch-record-write.mjs`) so a record cannot end empty, while history written before the rule remains readable; the cause measurement and the generated skeleton are covered by the pin. See "Reconciled 2026-10-23".
- **Assignment (if accepted):** none open; the F-06 skeleton acceptance is delivered by `init-dispatch-record`. Independent Critic read and PO acceptance pending.
- **Date:** 2026-10-23 (filled from D77 of 2026-10-21)

## Reconciled 2026-10-23

Text sweep K58-BACKLOG-TEXT-SWEEP-2. Superseded sentences above, kept as history:

- Description and Proposal ("left the dispatch record's `log` empty"; "consider a mechanical check at dispatch close that
  rejects a terminal record with an empty `log`"): built. Commit `f7321f418` (`fix(dispatch-record): refuse an empty
  terminal log at write, keep v3 history readable (AC-163, D77)`) makes `writeDispatchRecordObject` refuse a NEW terminal
  v3/v4 record with `log: []` (code `record-log`) and leaves no file; a terminal v4 record with an empty log is also
  rejected at read; committed terminal v3 history stays readable; the completed-undelivered observation keeps its
  documented empty-log exception. Earlier related commit: `edfc80d4c`.
- Proposal ("measure why entries are skipped (budget pressure vs. ordering vs. wording)"): measured in commit `8753e566c`
  (`fix(dispatch-record): measure why log entries are skipped and carry them on existing record writes`), which also
  changes the three Goldfish agent definitions, `roles/goldfish.md` and `templates/prompts/goldfish-task.md` so log
  entries ride on writes the Goldfish already makes. The ordering cause (a record opened after the first commit that cites
  its task id is refused) is pinned as "MEASURED ordering (a)/(b)".
- "Added acceptance (0.7.0, minor): A dispatch record and a design review can be started from a generated, valid
  skeleton" and the sentence "no scaffolder exists. There is no `init-dispatch-record`": the dispatch-record skeleton is
  `plugins/pipeline-core/scripts/init-dispatch-record.mjs` (commit `d4b792e73`, AC-163; case "init-dispatch-record prints
  a valid opening v4 record ..." in `plugins/pipeline-core/scripts/dispatch-briefing.test.mjs`); the design-review half
  is the receipt producer `scripts/design-review-receipt.mjs` (digests derived from disk, case "a design review receipt
  is generated with every digest derived from disk" in the pin file).
- All of the above is pinned in `plugins/pipeline-core/lib/pins/dispatch-record-log-stays-empty-despite-mandatory-phase-entries.test.mjs`.
  Independent Critic read and PO acceptance remain pending; no status change is made here.
