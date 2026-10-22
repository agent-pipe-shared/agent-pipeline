# K63 protected notes (K63-K11-S4-CANCEL-CLASS-CORE)

Both library files are in NEVER_LIFTABLE_KERNEL_PATHS of `plugins/pipeline-core/lib/guard-maintenance-window.mjs`
(`native-goldfish-host-state.mjs` line 360, `slice-queue.mjs` line 810), so they are delivered as
`scratch/agent-out/k63-protected.diff` (`git apply --check` from the main checkout: exit 0). No new module and no new
import edge between modules (the two files already import each other), so no kernel-list or threat-model line is needed.

## What changed
- `lib/slice-queue.mjs`: `CANCEL_CLASSES` (budget, wrong-premise, review-defect, integrated-elsewhere, superseded),
  `UNCLASSIFIED_CANCEL = "unclassified"`, `CANCEL_CLASS_HELP` (one teaching line per class), `checkCancelClass(value)`
  (typed refusal `SQ-CANCEL-CLASS` with reason and repair for a missing, empty, unknown or non-string value, and for the
  reserved word `unclassified`), `SLICE_KEYS` gains `cancelClass`; the validator accepts a class only on a
  cancelled slice (SQ-CANCEL-CLASS otherwise), a cancelled row without a class is normalized to `unclassified`,
  other rows carry `cancelClass: null`; `readyAndLive` summaries of cancelled slices carry `cancelClass`.
- `lib/native-goldfish-host-state.mjs`: `cancelUnstartedGovernedItemSlice({..., cancelClass})` refuses a missing or
  unknown class (`SQ-CANCEL-CLASS`, before any queue read, queue untouched), stores `row.cancelClass`, returns it;
  the four cancel repairs (dependency held, session owner fault, started slice, reservation hint) now read
  `--reason "<why>" --class <budget|wrong-premise|review-defect|integrated-elsewhere|superseded>` (so `--started --reason`
  stays adjacent) plus a one-line teaching of each class. The vocabulary is read lazily (the two modules import each other).

## Measured (clone, lib diff applied)
- `node --test lib/slice-queue.test.mjs`: baseline 37/37; RED with stubs 37 pass / 3 fail (SQ38-40); after 40/40.
- `node lib/native-goldfish-host-state.test.mjs`: after 39/39. Baseline under `node --test` was 36/38 with NGHS09 and
  NGHS13 red: a nested `node --test` child inside the outer test runner reports a pass for an expected failure; unrelated
  to this change (not fixed). The after-run used plain `node` and is green.
- RED for NGHS39 on the unchanged lib: failed at the first new assertion (repair lacks `--class`).
- `check-consumer-safe-paths.test.mjs`: 9/9.

## Open: S5 coupling
`cancelUnstartedGovernedItemSlice` now REQUIRES a class. Its callers `scripts/slice-queue.mjs` (cancel verb, line 385) and
`scripts/session-authority-repair.mjs` (line 248), and `scripts/session-authority-repair.test.mjs` (line 111) pass none
and will be refused SQ-CANCEL-CLASS until slice S5 adds `--class`. Not run or touched here (S5 files).

## Commit proposal for the operator (protected part)
```
feat(slice-queue): classify a slice cancel by reason class (D75 S4)

CANCEL_CLASSES, SQ-CANCEL-CLASS, the cancelClass slice key (legacy cancelled rows read
as unclassified), the required class on cancelUnstartedGovernedItemSlice, row.cancelClass
and --class teaching in the cancel repairs. Tests: 168de3d9e (clone) / SQ38-40, NGHS39.

AI-Assisted: true
Dispatch: K63-K11-S4-CANCEL-CLASS-CORE (goldfish)
```
