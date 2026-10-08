---
schema: pipeline.backlog-item.v1
id: pipeline.onboarding-test-runner-reports-async-pass-before-settlement
type: defect
owner: pipeline
status: open
created: 2026-09-29
sprint: alfred
done_when: manual
tracking: "0.7 test integrity and bounded runtime; Source repair delivered, final candidate verification pending."
source: "Confirmed during the PO-requested long-test optimization: source-bound216/eight-worker run run-A39Ey5 finished before900s but exited1; SECGATE2 was marked PASS before its promise rejected."
---

# The onboarding runner reports async PASS before the callback settles

## Confirmed behavior

The local test wrapper called `run()` without awaiting its result. The
asynchronous installed-plugin scanner fixture was therefore counted as passed
before its import rejected: its manually copied dependency closure omitted the
two new scanner diagnostics modules. The enclosing process correctly exited1;
the diagnostic correctly refused a complete PASS. Its callback-level216 PASS
count was nevertheless premature and must not be treated as216 completed tests.

The same run exposed an independent scheduler assumption: every child was
required to observe a B8 producer-to-guard command, although the eight-way
distribution legitimately assigned none to one child. Coverage belongs to the
whole corpus; each observed producer action still requires its real guard check.

## Delivered correction

- Register assigned cases, then await each before emitting PASS and END.
- Copy both diagnostics modules into the existing installed-plugin fixture.
- Report each child's coverage once over IPC; validate reports and require
  nonempty coverage across the successful complete corpus.

Source delivery:
`scratch/0.7-onboarding-async-and-coverage-repair-20260929/root-source-delivery.json`.
Three directed actual Source controls passed, including the awaited original
scanner fixture. An additional native IPC check passed with eight tiny children
carrying explicitly synthetic reports. It qualifies the parent protocol, not
real producer coverage or the full216 suite.

## Acceptance and closure

1. Fulfilled and rejected promises settle before their completion disposition.
2. The original installed scanner fixture completes with the current closure.
3. A child with no assigned B8 case is valid; missing, invalid or duplicate
   reports fail, and an entirely unobserved corpus cannot pass.
4. Final candidate verification finishes the current complete suite with
   consistent case counts, all child completions and exit0.

The Source correction is delivered; this item remains open until criterion4.
The closed2026-09-04 truncation item concerns a different observed defect and is
not reopened. This follow-up falls under the PO's approved test-optimization
and complete-confirmed-findings mandate.

## Triage

- **Decision:** fixed in source — closes after the 0.7.0 candidate host checklist (status stays `open` until then).
- **Rationale:** commit(s) `26fef9e7d`, host run needed.
- **Assignment (if accepted):** sprint-alfred-epic close-out batch.
- **Date:** 2026-10-08.
