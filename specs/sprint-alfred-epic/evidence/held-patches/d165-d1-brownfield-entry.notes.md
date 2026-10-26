# D165 D1 — brownfield implementation entry guard (held patch)

Dispatch: W6-D165-BROWNFIELD-ENTRY-D1A-20261026 (goldfish-implementor, guard fix with unit cases only).
Backlog item: `backlog/items/2026-10-26-brownfield-architecture-gate-never-passes.md` (D1).
Patch: `d165-d1-brownfield-entry.patch`, built against `21524d141` (4 files, 84 insertions, 1 deletion).

## Cause

`architectureFitnessAuthorityVerdict` (`lib/guard/entry-gates.mjs`) admits only `overallStatus` `pass` or `excepted`.
An approved-scoped brownfield repository always carries class 10 (`calibrated-friction-thresholds`) as `unavailable`
with `evidence.required [measured-calibration, explicit-threshold-promotion]`, because no measured calibration exists
yet, so `evaluateArchitectureFitness` reports `overallStatus: unavailable` and the guard denies. The entry-readiness
library already treats exactly that shape as report-only (`projectPlanningFitness`). The D162 S3 patch in the D163
hotfix retired the deferred allowance that used to cover the case, so the two readers diverged: readiness says ready,
the guard denies, and the project can never reach implementation.

## Change

- `lib/architecture-entry-readiness.mjs`: new export `planningFitnessBlockingStatus(fitness)`, which returns
  `projectPlanningFitness(fitness)` unchanged.
- `lib/guard/entry-gates.mjs`: after the pass/excepted early return, admit when the projection is not malformed and
  `blockingOverallStatus` is `pass` or `excepted`. Same module import as `inspectArchitectureEntryReadiness`, so no
  new kernel edge. The pending allowance, the denial text and class 9/10 evaluation are untouched.
- Tests: five `D165-D1` cases (a) to (e); no existing case changed.

## Evidence

- Baseline at HEAD before any edit: 49 tests, 49 pass (four suites; `lib/architecture-fitness.test.mjs` does not exist).
- RED on the two touched test files: 44 tests, 42 pass, 2 fail (cases (a) and (e)); (b), (c), (d) pin unchanged behaviour.
- GREEN, all four suites: 54 tests, 54 pass, 0 fail.
- `git apply --check` in a fresh clone of `21524d141`: exit 0 (checked by the coordinator).

Preimage SHA-256 at `21524d141`:

| File | SHA-256 |
| --- | --- |
| `plugins/pipeline-core/lib/guard/entry-gates.mjs` | `51843d778579a2ccef12c470f3defca23a29e5c7e1fea41ce0d19a6ff33d4310` |
| `plugins/pipeline-core/lib/architecture-entry-readiness.mjs` | `6afc56c4334a5c01a1e6e4d92dedca314ed4a119f2eae53b65b127fff9f93ae7` |
| `plugins/pipeline-core/lib/architecture-entry-readiness.test.mjs` | `45e047f6f9a536c99dcb4ba21a56b1ee833409d49b1056ae92d33c3125acf645` |
| `plugins/pipeline-core/lib/guard/entry-gates-greenfield-pending.test.mjs` | `a051a678b3268fc52e7e2fdf595d00988f0ce4b8f13d2c5a0bc082545c9bf8bc` |

## Not covered (separate slices)

- End-to-end brownfield reproduction through measure and the adoption migration (also the D2 class 9 measurement).
- D2 class 9 behaviour, D3, D4, D5.

## Proposed commit message

`fix(guard): treat uncalibrated class 10 as report-only at implementation entry (D165 D1)`

Operator flow: apply-diff, `git add -u`, `--no-verify` commit, stamp, install (kernel paths).
