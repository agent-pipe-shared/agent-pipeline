# Neutral findings registry — f16ab254 / fcaf8d5e (serial-lane evictions)

Source: T1 Critic review (opus, max; functional-equivalent-read-only) of
commits `f16ab254` and `fcaf8d5e`. Verdict: **FAIL** — two major, no
blocker, no minor. The Critic's own framing: *rework, not reversal* — no
eviction was found unsafe and no defect was found in either diff.

- **F1** (major): the `SERIAL_LANE_SUITES` doc comment still claims the set
  is derived mechanically and "auditable without re-running anything"; after
  three manual exceptions that claim is false, and the exceptions, the one
  tooling-blocked retention and the five unassessed members are recoverable
  only from evidence files the source never references.
- **F2** (major): the package's named measured-result artifact carries the
  first eviction's measurement and no row for the second; the second commit's
  own message says "the orchestrator's full run after this commit is the
  measurement", and that run's result was not written anywhere durable in
  the enumerated set.

## Disposition

**F1 — accepted, to be fixed at the gate definition.** The first eviction's
verdicts file said, in as many words, that the comment was "deliberately
left as-is … documented here rather than by hand-editing the comment". QG-06
names that shape: a known gap documented elsewhere, with no owner and no
expiry, is a finding and not a mitigation. The file is not TP-protected;
the fix was available and was declined twice. It is dispatched as a
comment-only change to `verify-journal.mjs:591-608` stating the set's actual
constitution — three manual exceptions with their evidence files, one
retention for a tooling reason, five members unassessed — next to the set,
where a re-derivation would otherwise silently reinstate ≈183s of gate time.

**F2 — half dispatcher-side, half real, and the real half is a definition.**

Dispatcher-side: the second measurement *was* recorded before this review —
as a trend row in
`backlog/items/2026-09-01-verify-runtime-is-concentrated-in-ten-suites-….md`
(`afa8e217`) and in `CHANGELOG.md` (`02a09027`) — but neither was in the
Critic's enumerated evidence set, and the artifact that *was* enumerated,
`2026-09-06-lane-eviction-measured-result.md`, had no `fcaf8d5e` row. The
Critic could only review what it was handed.

Real: the Critic derived **462.3s** from `verify-latest.json`'s run envelope
(`startedAt` 14:50:59.956Z → `finishedAt` 14:58:42.241Z) and a saving of
≈20.2s against 482.5s. The dispatcher's recorded **454.9s** is the *suite
span* — first suite `startedAt` to last suite `completedAt`, from the
`pipeline.verify-progress.v1` stream — against a re-measured 485.0s baseline
at `a478b10c`, giving −30.1s. Both numbers are correct for their definition;
neither artifact stated its definition, so the two could not be reconciled
by a reader. That is the defect. The measured-result artifact now carries
the `fcaf8d5e` row with **both** definitions named, and the ~7–8s between
them (pre-/post-suite runner overhead) stated rather than left to be
discovered again.

On the prediction: ~35s expected, 30.1s (suite span) or 20.2s (envelope)
measured. Either way short; the suite span is the like-for-like comparison
with the first eviction's 163.2s, and the pool absorbed the relocated work.
Single-run wall clock is indicative, not conclusive, and is recorded as such.

## Also recorded

QG-01 was named a fourth time today: the diff was reviewed against a red
gate. Same cause each time — the TP-3 registration blocker — and it was
cleared by PO signature minutes after this review returned. The pattern the
Critic asked the Elephant to see is seen.
