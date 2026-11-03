# w143 — the fitness evaluation reports size budgets without blocking (candidate 19, M1.3)

Applies on top of the chain at 692526262. Goldfish-built in a clone (clone-slice route). Criterion binding: AC-108 is the closest existing accepted criterion; the PRD and the Spec are unchanged.

## What it changes

- `plugins/pipeline-core/scripts/architecture-fitness.mjs`: new exported pure function `evaluateSizeBudgets({ rootDir, inventory, fitnessModel })`. For each governed module it counts lines of the existing text files its `ownedPaths` resolve to (missing and binary files skipped) and returns `{ budgets, overBudget }`; defaults are 500 lines per file and 2500 per module, overridable by an optional `fitnessModel.sizeBudgets`. `evaluateArchitectureFitness` attaches the result as one new top-level field `sizeBudgetAdvisory`. It adds no outcome and does not touch `summary`, `overallStatus` or `totalClasses`.
- `plugins/pipeline-core/lib/architecture-design.mjs`: `validateArchitectureDesign` accepts an optional `fitnessModel.sizeBudgets` (`maxFileLines`, `maxModuleLines`, positive integers, no other keys) and refuses anything else with `ARCHITECTURE-DESIGN-FITNESS-MISMATCH`. The key passes through unchanged into `architecture/fitness-model.json`; absent stays absent.
- `schemas/pipeline.fitness-evidence.v1.json`: optional property `sizeBudgetAdvisory` (the schema stays closed).
- Tests: five new cases in `architecture-fitness.test.mjs` (file row, module row, partial override, missing/binary skipped, evaluation unchanged and schema-valid), one new case in `architecture-design.test.mjs`.

## Checks

- `architecture-fitness.test.mjs` run alone in the clone: 69 of 69 (RED first: the missing export).
- `architecture-design.test.mjs` run alone in the clone: 20 of 20 (RED first: 0 was not refused).

## Not changed / not proven

- No fitness-model JSON schema exists in the repository, so none was changed. Other tests that mention the evidence schema or `totalClasses` use mocked results and were not run.
- The advisory is not a finding, outcome or property class; ratchet and baseline untouched. No consumer renders the advisory yet.
- The size check walks the static prefix of each owned path (symlinks not followed beyond what `readdirSync` reports as files); `.git` and `node_modules` are skipped.
- The full Verify run was not made; no independent Critic review (suspended by the PO until a working local candidate exists).
