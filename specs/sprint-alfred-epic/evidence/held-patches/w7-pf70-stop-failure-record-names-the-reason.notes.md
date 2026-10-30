# W7 PF-70: the stop-failure record names the stage and the reason

Elephant-built held patch (PO exception 2026-10-30: small items in scratch clones). Candidate a1bca53f4; the four files are untouched by 01dd1d448 and 140310e46, so the patch also applies on 140310e46.

## Why

Every stop-failure record of a failed SubagentStop host commit carried only `status` and `code`. Ten records on this repository (nine in the 2026-10-30 build warning list plus the D197 record) read `SDC-AUTHORITY-UNAVAILABLE` and say nothing about where or why: `fail(code)` in `lib/native-goldfish-host-finalizer.mjs` dropped `error.reason`, and `recordSubagentStopOutcome` wrote no stage. The root cause of PF-70 cannot be found from the records.

## Change

- `lib/native-goldfish-host-finalizer.mjs`: `failAt(stage, error, fallback)` for the two pre-commit catches (`attempt-inspection`, `authority-terminal-prepare`); the post-commit catch adds `stage` (the existing `postCommitStage`). `causeReason` carries `error.reason` only when it is a bounded slug (`^[a-z0-9][a-z0-9.-]{0,95}$`), never a message or a path. The stop-failure record gains `stage` and `reason` (null when absent). Two dependency seams (`inspectAttempt`, `prepareTerminal`) for the tests, defaulting to the real functions.
- `hooks/native-goldfish-host.mjs`: `readNativeGoldfishStopFailure` reads `stage` and `reason` (null for older records); the stop notice names them.
- Readers unaffected: `routine-repair.mjs` checks only schema and dispatchId; the generator warning reads code and status.

## Evidence (scratch clones, logs next to this note)

- Clone: finalizer suite 29/29 (new NGHF26, NGHF27), commit-execution suite 7/7 (new NGHC07).
- Baseline clone2: 27/27 and 6/6, no failures; the failing-name sets are both empty.
- Revert proof: with the two production files reverted, both suites fail (NGHF26 sees the stop succeed, NGHC07 sees stage undefined); files restored byte-equal.
- `driver.mjs patch`: 12095 bytes, 4 files, apply-check exit 0 on the plain candidate.

## Not done

Full Verify, Critic, native Windows runs, PO acceptance. The root cause of PF-70 itself stays open: the next failed stop after install will name its stage and reason.

## Proposed commit message

fix(finalizer): record the stage and slug reason of a failed stop host commit (PF-70)
