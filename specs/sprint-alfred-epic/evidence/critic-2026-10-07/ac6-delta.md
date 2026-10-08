# Critic — AC-6 delta (5ae19bbd7, 88ec01bc7; previous reviewed 87da2a348)

Route claude-opus-5-5 (effort not observed), functional-equivalent-read-only. Complete for the AC6-F1/F2 scope
(`guardrails/global.md` not reached; cannot reverse the verdict). Verdict **FAIL** (one major, one minor). Trajectory
consistent; candidate binding of the evidence artifacts not verifiable (RV-F7 / EVID slice).

## Registry dispositions

- AC6-F1 resolved (`lib/interruption-receipts.mjs:518-525`; six AC6-T2 cases red → green).
- AC6-F2 sub-items (a)–(d) resolved on static reading (writer tests do not reach an assertion on win32 — AC6-F4);
  sub-item (e) not resolved (AC6-D1).

## Findings

- AC6-D1 (major): the baseline `window` is still the requested window labelled `measured` whenever `--from`/`--through`
  are passed (`scripts/report-interruptions.mjs:221-223`, used at `:252`, `:397`, `:424`, written at `:464`); the fix only
  appends a limitation when receipts coverage is not measured (`:459-462`). A fallback run writes a self-contradictory
  baseline; on the store path with measured coverage no limitation is added at all. AC-6 (acceptance.md:23), spec.md:383-385.
- AC6-D2 (minor): the two new limitation branches (`:456-458`, `:459-462`) and the all-null scope have no test; the
  only baseline-content test runs without a window and asserts `"scope" in baseline` (`report-interruptions.test.mjs:180-193`).
  QG-11.

## Dispatcher disposition (2026-10-08)

Ruling 45: the baseline separates `requestedWindow` (the `--from`/`--through` values, status `requested`, or `null`) from
`window`, which records the observed collection window — the earliest and latest receipt timestamps actually read,
each with status `measured`, or `{ value: null, status: "unknown" }` when nothing was observed or receipts coverage is
not `measured`. The evaluator's window check (ruling 22) reads `window`, never `requestedWindow`. Pins first (AC6-T3:
store-path and fallback-path baselines with a requested window, both limitation branches, the all-null scope value),
written at the evaluator/writer seam that runs on win32 (an injected temp root, not `/var/tmp`); then the fix (AC6-F3).
This was the package's delta round, so the dispatcher self-verifies after the fix.
