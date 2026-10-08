# Critic — AC-6 package, full review (db12dc4cc, eca10d71d, 87da2a348)

Route claude-opus-5-5 (effort unknown), functional-equivalent-read-only. Partial review (runtime hook counted a
25-call working budget and fired at call 20); pass/fail withheld. Four major findings; the unreached items could only
add findings. Trajectory consistent; authorship binding not verifiable (records not supplied).

## Findings (registry IDs)

- AC6-F1 (major): `evaluatePromotionEvidence` (`lib/interruption-receipts.mjs:518-523`) rejects only coverage exactly
  `unknown`; `estimated`/`unavailable` coverage, missing/extra coverage keys, an `undefined` window value or an inverted
  window still reach `calibrated-pass` with a matching approval. Spec 386-389 / acceptance 23: "sufficient measured
  evidence". Ruling 15's wording ("coverage other than `unknown`") was narrower than the spec.
- AC6-F2 (major): the writer always emits `limitations: []` (`scripts/report-interruptions.mjs:455`; the aggregate has no
  `limitations` key) and records no scope: a scope-filtered run replaces the tracked baseline with a subset, the fallback
  collection's `qualification: "unestablished"` is dropped, and the requested `--from/--through` window is labelled
  measured. Acceptance 23: "actual window, coverage and limitations are recorded".
- AC6-F3 (major): no production caller reads the baseline or calls the evaluator; the "recorded PO promotion approval" has
  no format, writer or reader. Acceptance 23 evidence column: "promotion checks that read it". AC-6 cannot close on this
  package.
- AC6-F4 (major): the writer half has no executed test on any supplied host (fixture `/var/tmp` on win32) and the package's
  suites end red (4 failures incl. `C1 createOperation preserves duplicate definitions …` at
  `interruption-receipts.test.mjs:1086`, an assertion, not a platform code). QG-03/QG-11.

## Briefing defects noted by the Critic

AC-6 lives at `specs/sprint-alfred-epic/acceptance.md:23`, not in `spec.md`; the Critic's runtime working budget is 25,
not the briefed 30.

## Dispatcher disposition (2026-10-08)

Ruling 22 (supersedes the coverage/window clause of ruling 15): `calibrated-pass` requires coverage with exactly the keys
`receipts` and `followup`, each status `measured`; both window values present (non-null, non-undefined) with
start ≤ end; and a matching approval. Ruling 23: `--write-baseline` refuses any scope filter (`--feature`, `--package`,
`--dispatch`) with a typed code, and the baseline records `limitations` from the collection (fallback qualification and
unsupported source kinds, a requested window that is not observed) and its `scope`. F1/F2 → AC6-T2 pins, then AC6-F2
fix. F3 → design of the approval record and its reader (DESIGN-AC6-PROMO), PO question N12. F4 → Linux/WSL run (host
checklist H2) plus diagnosis of the duplicate-definitions case. AC-6 stays open.
