# w263: the architecture is measured on the real code in the normal Verify path, the module budgets are reported, and the materialization names its commit step (candidate 20, G20-36, AC-108)

Base: `35db88a31` (the candidate-20 chain). Built in the slice clone `scratch/agent-out/s-archfit`. One held patch, one commit in the clone.
Closest criterion: AC-108 (PRD and Spec unchanged). Source: both greenfield reports (Codex P1 "Architektur nur teilweise operationalisiert",
Claude: the 14 materialized files under `architecture/` were never committed, fitness ran only as advisory inside set-phase).

## What

- `scripts/architecture-boundary-check.mjs`
  - `observe()` additionally tallies, per owning module, the source files and lines and the cross-module imports that really occur (allowed or
    not). The violation rules, their order and the CLI output are unchanged; the extra data travels in a private `_measured` field that
    `publicResult` strips like `_observed`.
  - `measureArchitecture({ rootDir })` (new): the same check plus `measurement` (`pipeline.architecture-measurement.v1`): `budgets`
    `{ maxFileLines, maxModuleLines, source }` (`source` is `fitness-model` when `architecture/fitness-model.json` carries `sizeBudgets`, else
    `default`), and per module `{ id, ownedPaths, sourceFiles, sourceLines, measuredDependencies, allowedDependencies, budget, overBudget }`.
    `overBudget` lists the files and the module over its budget (reuses `evaluateSizeBudgets`); it stays advisory, as in the fitness evidence,
    and never turns the status into `findings`. A finding is still `{ rule, module, file, target, detail }`.
  - The measurement excludes the Pipeline's own files in a consumer project (`project/consumer-verify.mjs`, `.claude/**`), which the check
    would otherwise report as `unowned-path` in every project that has a map.
- `scripts/architecture-boundary-check.mjs` `runConsumerVerifyCheck("architecture")`: prints the measurement as one JSON line, each
  violation as `[rule] detail` (module and file named), and on a non-zero result the repair (declare the module, path or dependency in
  `architecture/map`, or accept an existing state once with `architecture-boundary-check.mjs --root . --write-policy`). No map: not applicable, exit 0.
- `scripts/verify-evidence-producer.mjs`: the standard baseline gains the suite `baseline-architecture` (after `baseline-verify-contract`), so the
  normal Verify runs the measurement as soon as implementation exists, not only at set-phase. It is tree-deterministic, so it resumes like the
  other tree-bound baselines (no attempt token).
- `lib/architecture-design.mjs` `architectureCommitStep(root, extraPaths)` (new) and `scripts/pipeline-state.mjs` (`materialize-architecture`):
  after a `materialized` result the output gains `uncommittedPaths` (from `git status`, repository-relative) and `nextAction`, which names the
  exact `git add -- <paths>` and the commit. Both keys are additive; they are absent when everything is committed. If git cannot be read, the
  `nextAction` says so instead of claiming a clean state.
- Pins (test-first; RED against the original code, then green): `architecture-boundary-check.test.mjs` ABC10/ABC11 (11/11), `verify-evidence-
  producer.test.mjs` "G20-36 ..." (a forbidden import is a failing `baseline-architecture` step whose log names module and file and the repair;
  after the repair the same Verify passes and carries the measured dependencies), `architecture-public-greenfield-route.test.mjs` "G20-36 ..."
  (8/8; the executed CLI names the commit step, committing the listed paths empties it). Three assertions of `verify-evidence-producer.test.mjs`
  restated in place with a QG-04 comment: the standard suite list, the registered/receipt counts (6 to 7) and the reused-step list.

## Why

The map and fitness model existed, but nothing measured the real imports in the delivery path (`post-sitting-checks.mjs` is a Pipeline-repo tool,
and the evaluator checks only the paths a caller hands it), so a greenfield project got an empty baseline and no signal. The budgets already
existed as advisory `sizeBudgets` but were visible only inside the fitness evidence; they are now reported per module with their source. The
materialization writes files and cannot commit under the guard union, so the smallest complete fix is the exact next step in its own output.

## Not changed

- The signed design package, its pre-bound materialization bytes and `parseArchitectureDesign` (no schema or format change; `schemas/` untouched).
  Because of that, budgets are model-wide values applied to every module, not per-module overrides; a per-module override would be a new field in
  the design package and needs an additive schema version and a PO-approved design change.
- `architecture-measure.mjs` and the brownfield baseline: its `allowedDependencies` come from the real import edges, so a zero-violation
  baseline there is a measurement, not a placeholder. The greenfield baseline stays empty by design (no implementation exists at that point).
- `architecture-fitness.mjs` and its evidence (digest-bound by the rigor lifecycle); `harness/verify-suites.json`, the inventory (no new test
  file: the cases extend three registered suites); `lib/path-spelling.mjs` and the separator-sweep sites.
- Budget overruns do not fail Verify (advisory, as before); this is a one-line decision for the PO if a blocking budget is wanted.
- Languages: imports are read for the JS/TS family only (`extractJsImports`); a file of another language is counted for ownership and size but
  its imports are not measured. No reader exists for them in the Pipeline.

## Needs the Coordinator

- Apply the chain in order (this patch follows the chain at `35db88a31`), then the final Verify. The Pipeline repository's own gate
  (`harness/scripts/verify.mjs`) does not route through `verify-evidence-producer.mjs` (it only runs that producer's test suite), so the new
  suite does not run against this repository there. If a Verify ever runs the producer against this repository, `baseline-architecture` reports
  its pre-existing `unowned-path` findings (`scripts/post-sitting-checks.mjs` already lists them, and the three w263 deliverables sit in an
  unowned tree); the named repair is `node plugins/pipeline-core/scripts/architecture-boundary-check.mjs --root . --write-policy` (writes
  `architecture/boundary-policy.json` once) or assigning those paths in the map. A greenfield or consumer project meets the same step on its next
  Verify when it has a map and source files no module owns; the refusal prints the repair.

## Kernel import closure (repaired)

`consumer-verify-check.mjs` is a never-liftable kernel file, so it must gain no import edge (`guard-maintenance-window-kernel-closure.test.mjs`
GMWKC01). The first build added one; the patch now does not touch that file at all. `architecture-boundary-check.mjs` exports
`runConsumerVerifyCheck(check)` (the measurement, the printed findings and the repair line), and `verify-evidence-producer.mjs` passes that
module's URL (no import edge) as the dispatcher of the `baseline-architecture` suite, because the generated adapter imports whatever dispatcher
URL its first argument names. Measured: GMWKC01 reports the 8 violations it reported before this patch (`path-spelling.mjs`,
`security-close-status.mjs`, the `security-scan.mjs` spawn edge), none added; those eight belong to the Coordinator. The pins above
(producer suite 58/58, boundary suite 11/11) were re-run on this final shape. The "one commit in the clone" above is two (the second is the repair).

## Not proven

Final Verify of the applied chain, Critic review, PO acceptance. The patch does not apply on the real repository until the chain before it is
applied. The `baseline-architecture` suite was exercised only on fixture projects, not on a real consumer project (the two greenfield projects
may report `unowned-path` for test and tooling files that no module owns; the named repair is the policy file). Whether the repair command with the
plugin's absolute path is admitted by the guard grammar in a consumer session was not measured. The `git status` readback runs inside the
executing process; on Windows it was not run.
