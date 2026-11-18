# w30k11 — the five remaining private calibration path lists and the two mirror-rule guard texts use the shared CALIBRATION_PATHS (candidate 30k, finding K1-04, stage 2)

Applies AFTER the integrated 30j tree (the clone int30j: the 30i chain plus every 30j lane, in particular J9 which adds `CALIBRATION_PATHS` and J17): the patch is a delta on that state and does not apply to the real checkout before it (`apply --check` is exit 0 on the int30j clone, exit 1 on the real HEAD, as expected). The check test therefore never runs `git apply` against the repository. Criterion binding: AC-112 is the closest existing accepted criterion; the PRD and the Spec are unchanged. The Critic is suspended by the PO for candidates of this repository and no Full Verify ran, so this change is verified by tests only.

Protected sources: `hooks/guard-dispatch-budget.mjs` and `hooks/guard-gate-strength.mjs` are guard hooks, so the PO applies this chain on the plugin-source commit route.

## What the patch changes

Read rule of each site established FIRST and kept byte for byte (only the list is shared; the shared list is neutral first, the same order every site already had):

- `scripts/repository-mode-promote.mjs`: `TWIN_PATHS = CALIBRATION_PATHS` (still exported, still frozen). Rule: both twins are read and written, so list order changes no result.
- `scripts/critic-dispatch-preflight.mjs`: `calibrationRepositoryMode` (first READABLE twin wins, even when it holds no `repositoryMode`) and `calibrationProjectId` (first twin whose `project` is a valid id) iterate the shared list; the loop bodies are untouched. The `CDPF086` write-free closure is kept: `project-authority-read.mjs` was already imported by this script. The history-in-range repair text (`CDP-HISTORY-IN-RANGE`) now builds both names from the list; its output bytes are identical.
- `hooks/guard-dispatch-budget.mjs` (`criticReadRefusal`): the first twin that reads and parses wins (a read or parse error moves on to the next); loop unchanged, list shared. New import of the leaf `project-authority-read.mjs` (builtin dependencies only).
- `scripts/push-prepare.mjs` (`repositoryModeNotice`): neutral file when it exists, else the legacy file; the mirror sentence only when both exist. Same ternary, names from the list (imported through the facade `project-authority.mjs`, which re-exports it). Output bytes identical.
- `hooks/guard-gate-strength.mjs`: the GS-10 and GS-11 `path` values and the two long `reason` strings are built from the shared list. The sentence that names the mirror (`calibrationMirrorRule`) and the shared verify-route sentence are each written once instead of twice; the resulting strings are byte-identical to before (pinned by a golden-text case, below).
- Test: four cases in `lib/calibration-verify-commit-transition.test.mjs` (the same file J9 and J17 used): (1) literal scan over the five modules (quoted calibration literal in a non-comment line), (2) loose text scan over the three text sites (neither file name appears in a non-comment line), (3) `TWIN_PATHS` equals the shared list and is frozen, (4) golden text of the GS-10 and GS-11 reasons and paths, typed out in full.

## Why

Analysis K1-04 (duplicated-state-and-rules count, stage 2) and the earlier state-machine finding that one list should name the two files so no two lists can disagree. Hard limits kept: no stored status, no record shape or digest/key byte, no gate, signature or approval behaviour, both calibration files byte-identical, `CVCT-TWIN-CAS` and `PCI-CALIBRATION-DRIFT` unchanged.

## Tests (clone, `test-in.mjs`, one suite at a time)

- RED first (before any production edit): `lib/calibration-verify-commit-transition.test.mjs` 14 cases, 12 pass, 2 fail (the literal scan names all five modules; the text scan names `critic-dispatch-preflight`, `push-prepare` and `guard-gate-strength`). The `TWIN_PATHS` and golden-text cases are GREEN on the original code on purpose: they characterize behaviour that must not change. Exit 1. No separate evidence file; counts are here.
- GREEN after: `lib/calibration-verify-commit-transition.test.mjs` 14 of 14 (exit 0).
- Neighbour suites, unchanged and green: `scripts/repository-mode-promote.test.mjs` 20 of 20; `scripts/push-prepare.test.mjs` 100 of 100; `hooks/guard-gate-strength.test.mjs` 1 of 1 (a single harness case that prints its own counts, exit 0); `hooks/guard-dispatch-budget.test.mjs` 129 pass, 2 skipped, 0 fail; `scripts/critic-dispatch-preflight.test.mjs` 124 of 124.
- No existing test was restated or weakened. `repository-mode-promote.test.mjs`, `push-prepare.test.mjs` and `guard-gate-strength.test.mjs` are unchanged.
- This check test: 2 of 2 (`node --test` on the file).

## Not changed

- Text that restates the pair for another purpose and is not a read-order list: the `RMP-*` message table of `repository-mode-promote.mjs` (lines naming both files in plain prose, pinned by its suite), `lib/guard/constants.mjs`, `lib/human-guard-override.mjs`, `scripts/pre-commit-hook-install.mjs` (kept and pinned, J25), the `.claude/pipeline.json` literals of test fixtures. Retiring a twin stays a PO decision (D-3).
- `GS-12` root `pipeline.json` is a different file (not a twin) and keeps its literal.
- No site's read rule differed from the shared list's order, so none stays private; none needed a file:line report.

## Not proven

- No Full Verify, no Critic round, no architecture-boundary run. No new test file was created (no registration needed). A pin outside the write list that asserts the SOURCE TEXT of these five modules (none found by a bounded search) would be restated, not reverted.
- `scripts/pre-commit-hook-install.test.mjs` imports `TWIN_PATHS`; it was run as a neighbour: 73 of 73, exit 0.
