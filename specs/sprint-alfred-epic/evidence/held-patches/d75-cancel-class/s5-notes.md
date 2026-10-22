# K65 protected notes (K65-K11-S5-CANCEL-CLASS-CLI)

Protected part of slice S5: `plugins/pipeline-core/hooks/guard-dispatch.mjs` and `plugins/pipeline-core/hooks/guard-dispatch.test.mjs`
(`guard-*.mjs` and their tests). Delivered as `scratch/agent-out/k65-protected.diff` (6047 bytes, relative to the clone HEAD
`a738556a3`; `git apply --check` from the main checkout: exit 0, and the S4 diff `k63-protected.diff` also checks clean, the two
diffs touch disjoint files).

## Order
1. `scratch/agent-out/k63-protected.diff` (S4: `lib/slice-queue.mjs`, `lib/native-goldfish-host-state.mjs`), commit as proposed in `k63-protected-notes.md`.
2. The three unprotected S5 commits from the clone (cherry-pick `e74d68d04`, `ae6d0e4db`, `a738556a3`), or any equivalent.
3. `scratch/agent-out/k65-protected.diff` (S5), commit as proposed below.
S5 must come after S4: guard-dispatch.mjs, scripts/slice-queue.mjs, scripts/session-authority-repair.mjs and scripts/dispatch-briefing.mjs
all import `CANCEL_CLASSES` / `CANCEL_CLASS_HELP` / `checkCancelClass` from the S4 library and fail at import without it.

## What changed in the protected files
- `hooks/guard-dispatch.mjs`: the warning printed when a refused dispatch's queue row cannot be rolled back is now built by the exported
  `queueRowKeptWarning({ sliceId, code })`; it names `cancel <id> --started --reason "<why>" --class <budget|wrong-premise|review-defect|integrated-elsewhere|superseded>`
  and one teaching line per class (read from the library vocabulary). Import line gains `CANCEL_CLASS_HELP, CANCEL_CLASSES`. The plan named a second
  guard text (line 771); no other cancel text exists in the file today (only this one, line 836 before the change).
- `hooks/guard-dispatch.test.mjs`: new GD66 (subprocess import like GD16, never an in-process import of the hook); corpus count 66 -> 67. No existing assertion touched.

## Measured (clone working tree = S4 libs + S5 files, i.e. both protected diffs applied)
| check | baseline (S4 applied, before S5) | RED (new test, unchanged script) | after |
|---|---|---|---|
| `node scripts/slice-queue.test.mjs` | 16/16 | 14/19 (SC10, SC16 unknown flag `--class`; SC17-19 new) | 19/19 |
| `node scripts/session-authority-repair.test.mjs` | 8/10 (SAR04, SAR10 red BECAUSE of S4: cancel/take-over without a class) | 9/11 (SAR04, SAR10; SAR11 RED proven separately against the pre-CLI `slice-queue.mjs`) | 11/11 |
| `node scripts/dispatch-briefing.test.mjs` | 49/49 | 49/50 | 50/50 |
| `node hooks/guard-dispatch.test.mjs` | 66/66 | 66/67 (GD66) | 67/67 |
| `node --test harness/scripts/check-consumer-safe-paths.test.mjs` | - | - | 9/9 |
Green only with BOTH protected diffs applied: SAR04, SAR10, SAR11, SC17-SC19 (they need the S4 library: class stored on the row, `unclassified` normalisation,
cancelClass key accepted by the validator), GD66 (needs S5 diff and the S4 vocabulary) and, by import, every S5 script. SC10/SC16/SAR04/SAR10 adapt existing calls only (QG-04 below).

## QG-04 notes (existing calls adapted, no assertion weakened)
PO decision D75: a cancel always carries its class. `slice-queue.test.mjs` SC10 (3 calls) and SC16 (3 calls) gained `--class`; `session-authority-repair.test.mjs`
SAR04 (direct `cancelUnstartedGovernedItemSlice` call gained `cancelClass: "budget"`) and SAR10 (two take-over calls gained `--class`). Assertions unchanged; SAR04/SAR10 gained class assertions.

## Open items for the operator
- Line-bound ratchet (`architecture/boundary-policy.json`, not raised by me): `guard-dispatch.mjs` 1043 lines vs accepted 1037 (+6), `guard-dispatch.test.mjs` 1055 vs 1032 (+23).
  The S4 libs also exceed theirs (slice-queue.mjs 1042/1007, native-goldfish-host-state.mjs 1611/1604, its test 1077/1047). The check was already failing on 17 unrelated `unowned-path` scripts/ entries.
  Options: PO raises the accepted lines, or the new test/helper moves into a split module.
- Design choice taken (report, not a vocabulary change): `session-authority-repair.mjs take-over` takes one required `--class` applied to every slice it frees (not per slice); it is stored in `take-over.json` and in each cancelled row's result. Alternative: a fixed class for take-over.
- Plain (non-governed) queues also require `--class` and store `cancelClass` on the cancelled slice (the S4 validator accepts it).

## Commit proposal (protected part)
```
feat(guard-dispatch): name the cancel class in the kept-queue-row warning (D75 S5)

The warning for a queue row a refused dispatch could not roll back now comes from the
exported queueRowKeptWarning and names the cancel with --class <...> plus one teaching
line per class. GD66 pins the wording; no existing assertion changed.

AI-Assisted: true
Dispatch: K65-K11-S5-CANCEL-CLASS-CLI (goldfish)
```
