# w30j17 — the four calibration path lists that C30J-J9 could not reach use the shared one (candidate 30j)

Applies AFTER the integrated 30i tree plus the held patch of slice C30J-J9 (`w30j09-*.patch`): it is a delta on that state and does not apply to the real checkout before J9. Order: 30i tree, J9, J17.

## What it changes

- `critic-evidence-carry.mjs`: `CALIBRATION_TWINS = new Set(CALIBRATION_PATHS)` (same two values, same order).
- `analysis-run.mjs`: the private `const CALIBRATION_PATHS = [...]` is removed; the import of the shared frozen list replaces it (the loop is unchanged).
- `maintenance-delivery.mjs`: the inline loop in `calibratedVerifyAt` iterates the shared list.
- `push-threat-model-materialize.mjs`: the inline loop in `readCalibration` iterates the shared list.
- All four import `CALIBRATION_PATHS` from `./project-authority-read.mjs`. The resolver `resolveAuthorityArtifactPath` is NOT adopted anywhere (J9 showed its read rule differs from the stakes readers; only the list is shared).
- Test: one pin case in `calibration-verify-commit-transition.test.mjs` scans the four module sources for a quoted calibration path literal, like J9's pin for its eight. RED before the swap (all four modules named), GREEN after.

## Why

Analysis finding C8 / SM-6 (one source for the two calibration paths). Criterion binding: AC-112 is the closest existing accepted criterion; the PRD and Spec are unchanged.

## Checks (tests only; the Critic is suspended by the PO for candidates of this repository and no Full Verify ran)

- `calibration-verify-commit-transition.test.mjs`: 10 of 10 (new case red first, then green).
- `analysis-run.test.mjs`: 10 of 10. `maintenance-delivery.test.mjs`: 7 of 7.
- `critic-evidence-carry.test.mjs`: 17 of 18. The one red case ("the exact repositoryMode promotion of both calibration twins is carried", line-ending rewrite assertion) is red identically on the base clone without this change, so it is pre-existing and not caused by the swap.

## Not changed

- No record shape, digest or key byte, no gate, signature, approval or Critic evidence semantics; no stored status.
- Fifth private list (report only): the plugin's `scripts/pre-commit-hook-install.mjs` holds a private list of both calibration paths (around lines 497-498). A hook installer, outside the write list, left untouched.

## Not proven

- Integrated Verify and Critic review are pending (Coordinator). The pre-existing red case above is not investigated here.
