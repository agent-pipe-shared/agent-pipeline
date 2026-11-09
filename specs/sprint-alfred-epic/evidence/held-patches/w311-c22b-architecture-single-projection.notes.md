# w311 — One architecture projection for preflight and Verify (candidate 22b)

Delta on 8627df377 (two commits in a clone). Closest accepted criterion: AC-108 (PRD and Spec unchanged). Built by a Goldfish in a clone; delivered as a held patch. Targeted delivery: green. Batch Critic, Full Verify and PO acceptance stay pending.

## Why

Finding CGF-08 of the Codex greenfield report: the stored architecture projection said `observed-open` while the narrow blocking check was green, and the two were never shown as one reading. w309 built the labels (`pipeline.architecture-verdict-label.v1`) but left the single projection open for an authority decision. The PO decided it: the blocking check alone decides the gate verdict of a candidate; the stored fitness observation stays beside it, report-only and open, with its date; it is never hidden by a PASS and never upgrades or downgrades the gate. With no blocking result the projection says so and claims nothing.

## What it changes (all under plugins/pipeline-core/)

1. The reader (`lib/architecture-verdict-label.mjs`, test beside it)
   - New pure `currentArchitectureProjection({ boundaryVerdict, fitnessLabel })`, schema `pipeline.architecture-projection.v1`, frozen: `{ schema, decidedBy, gate, reportOnly, summary }`.
   - `gate` is the blocking label verbatim, or a typed label `no-blocking-result` (effect blocking, currency unobserved, candidate and date null) when none exists. `decidedBy` is `blocking-check` or `none`.
   - `reportOnly` is the fitness label verbatim (verdict, observation date, candidate, open classes) or null. The open report-only classes the blocking check lists itself (size budgets) stay on `gate.reportOnlyOpen`.
   - A label of the wrong effect is refused (`AVL-INVALID: boundaryVerdict` / `fitnessLabel`), never reinterpreted; that makes "the fitness observation never changes the gate" structural. `summary` is two printable lines built with the existing `describeVerdictLabel`.
2. The stored reader (`lib/rigor-lifecycle.mjs`)
   - New `readRecordedFitnessObservation(rootDir)`: the newest stored rigor row (any feature) that carries a fitness projection, read through the same authority path and the same history validation as `readRigorVerifyObservation`. Null on anything unreadable; never throws; evaluates nothing.
3. Preflight (`lib/architecture-adoption-orientation.mjs`)
   - The orientation result gains `architectureProjection`. Stored observations only: no boundary run, no clock (AC-245 byte comparison stays green). No stored blocking result exists anywhere the bootstrap may read, so `gate` is typed `no-blocking-result`; `reportOnly` is the latest recorded fitness observation (scope text names "in the repository", not a feature) or null. Injectable `deps.readFitnessObservation`. The preflight script itself is unchanged: it already carries the orientation object through.
4. Verify (`scripts/verify-evidence-producer.mjs`)
   - New exported `architectureProjectionForRun(root, run, commit)`. The blocking verdict is read from the retained log of the `baseline-architecture` suite (the check runs in a child process and is never re-run), and counts only when the log hash-matches this run's receipt. A verdict observed at another candidate (a resumed baseline) is relabelled `superseded`. No map, suite not selected or an unreadable log: `no-blocking-result`.
   - `produceVerifyEvidence` returns `architectureProjection` beside `evidence` (passed, event and event-unavailable returns); the CLI prints it beside the evidence fields. The evidence file and its object gain no key (tested: on-disk file deep-equals `result.evidence`).

## Tests (test-first)

RED before the first production edit: label suite 4 failed of 9 (AVL06 to AVL09); orientation suite 1 failed of 8; preflight CGF-08 case failed (projection undefined); Verify CGF-08 case failed.
GREEN after, one suite at a time: `lib/architecture-verdict-label.test.mjs` 9 of 9; `lib/architecture-adoption-orientation.test.mjs` 8 of 8; `scripts/pipeline-start-preflight.test.mjs` 100 of 100; `scripts/verify-evidence-producer.test.mjs` 60 of 60 (two new cases: PASS with no map and with a map including a resumed baseline; PASS beside a stored open fitness observation read through a real authority-ready state, observation date and class 7 visible, gate still `pass`).
Neighbours green: `scripts/pipeline-start-preflight.continuity-drift` 9/9, `scripts/architecture-boundary-check` 12/12, `lib/close-quality-readback` 12/12, `lib/architecture-public-greenfield-route` 10/10, `lib/architecture-close-disposition` 3/3, pin `greenfield-architecture-entry-names-materialization` 5/5.
Journeys: no stored state (typed), unreadable store (typed), open fitness beside PASS (visible, gate unchanged), findings plus passing fitness (gate stays findings, AVL07), resumed baseline (gate still the blocking verdict of this candidate), swapped label effects (refused). No new test file: all cases are in existing files (the verdict-label test file is the one w309 already flagged as needing registration).

## Deliberately not changed

- Rigor history rows, `closeArchitectureFitnessDisposition` output and the closed feature entry: no key added (hashed, exact-key validated).
- The evidence file `pipeline.verify-evidence.v0`: the projection is printed beside it, not stored in it (a stored key would change a closed, hashed shape consumed by later gates).
- Preflight does not read the last `evidence/verify.json` as a blocking result: that file is candidate-bound and carries only exit codes, not the verdict.
- The plan lifecycle site named in the w309 notes ("preflight, plan and Verify"): the briefing named preflight orientation and Verify only; plan not wired.
- No gate, signature or review round added; no existing gate decision changed. Critic preimage files, guard hooks, protected tests untouched.

## Not proven / needs the Coordinator

- `lib/guard-maintenance-window-kernel-closure.test.mjs` is red with this patch: 6 violations, none caused by it (each names an import this patch did not add; the suite was not run separately at the base). One of them predates this slice: `architecture-adoption-orientation.mjs` imports `architecture-verdict-label.mjs` (w309) which is not in `NEVER_LIFTABLE_KERNEL_PATHS` (the other five are unrelated: push-threat-model-materialize, close-acceptance-record, repository-freshness, critic-route-assurance). This patch adds no import outside the listed kernel (the new `rigor-lifecycle.mjs` import is already listed), but the label module needs its entry in `lib/guard-maintenance-window.mjs` (and the threat-model prose, GMWKC03). That file is a guard kernel list, outside this slice.
- Derived files (product-capability-inventory, reader inputs) and the Verify suite registration were not refreshed (not allowed in this slice).
- The Verify projection was proven in the test harness (a real `produceVerifyEvidence` run in a fixture project); the CLI print was not run on a live project.
- No Full Verify, no Critic review.
- Two suites were started in one tool block once (preflight and close-quality-readback, both green, private temp each); results were not affected.
