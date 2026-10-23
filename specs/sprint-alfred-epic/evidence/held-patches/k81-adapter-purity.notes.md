# K81-K2-ADAPTER-PURITY notes (implementation complete in clone; independent Critic read, operator commit of the protected parts and PO acceptance pending)

## Cause
`interruption-source-adapter.mjs` imported `validateCriticReviewHistory` from `critic-review-lineage.mjs`.
That module (since d02409a8a) also imports `critic-course-admission`, `critic-verify-lifecycle`,
`node:child_process`, `scripts/critic-packet-preflight` and `critic-accepted-contract`. The adapter's import
graph therefore reached modules that read `import.meta`/do I/O at evaluation time; the purity test's
preloader stops at a non-JS import (`schemas/pipeline.design-workflow-package.v2.json`, SyntaxError) in that
graph -> `interruption-receipts.test.mjs` 106/107.
The adapter uses exactly one symbol: `validateCriticReviewHistory` (line 11 import, line 149 call). It is the only
adapter->lineage use, and the adapter is imported by no file except `interruption-receipts.test.mjs`.

## Change (recommended fix a, smallest form)
- NEW `plugins/pipeline-core/lib/critic-review-lineage-core.mjs`: the pure validation half, moved VERBATIM
  (constants, shape/chain/transition validators, `v2BindingCode`, `validateCriticReviewLineage`,
  `criticReviewLineageDigest`, `validateCriticReviewHistory`). Imports only `review-economy.mjs` (node:crypto).
  Helpers the compile/release code still needs are now `export`ed from it.
- `critic-review-lineage.mjs`: keeps the impure/compile/release/registered-compile code; imports from the core and
  re-exports the 9 previously public validator/constant names, so every importer keeps working. Public export
  surface identical (14 names before, 14 after).
- `interruption-source-adapter.mjs` line 11: import from `./critic-review-lineage-core.mjs`. (unprotected)
- Because the lineage module is a kernel path and now imports the core, the core is a kernel path (GMWKC01):
  one line added to `NEVER_LIFTABLE_KERNEL_PATHS` in `lib/guard-maintenance-window.mjs` (protected) and one prose
  entry in `docs/guard-maintenance-window-threat-model.md` (GMWKC03; unprotected doc).
- Not needed: capability inventory (`docs/product-capability-inventory.json`, check passes unchanged, lineage is not
  in it), `docs/operating-tools.md`, architecture map (`architecture/map/pipeline-core.md` does not list the lineage
  module), a new test file (the existing purity test is the examiner; a new test file would need
  `harness/verify-suites.json` registration, protected). No assertion was changed.

## Counted results (private TMPDIR under the home dir, one at a time; clone needs an empty `scratch/` dir because the
C1 tests `mkdtemp('scratch/...')` relative to cwd, without it 10 tests fail with ENOENT for an environmental reason)
Runner: `node scratch/k81-run.mjs <label> <file>` (main checkout; node <file> in the clone).
| suite (path inside the clone) | before | after |
|---|---|---|
| lib/interruption-receipts.test.mjs | 106 pass / 1 fail (the purity test) | 107/107 (re-run once more: 107/107) |
| lib/critic-review-lineage.test.mjs | 14/14 | 14/14 |
| lib/review-economy.test.mjs | 120/120 checks | 120/120 |
| lib/critic-course-admission.test.mjs | 18/18 | 18/18 |
| lib/critic-verify-lifecycle.test.mjs | 7/7 | 7/7 |
| scripts/critic-packet-preflight.test.mjs | 12/12 | 12/12 |
| scripts/critic-dispatch-preflight.test.mjs | 46/46 | 46/46 |
| lib/guard-maintenance-window-kernel-closure.test.mjs | 11 passed | 11 passed (incl. GMWKC01, GMWKC03) |
| lib/guard-maintenance-window.test.mjs | not run before | 63 passed, 0 failed (1 pre-existing SINGLE-VOLUME skip) |
| harness/scripts/check-product-capability-inventory.mjs | PASS | PASS |
| harness/scripts/check-consumer-safe-paths.test.mjs | not run before | 9/9 |
Log files: `scratch/agent-out/k81-{base,after,final}-*.log`.

## No caller's behaviour changed (evidence)
1. `scratch/k81-verify-move.mjs`: every non-blank line of the original lineage module is found verbatim
   (modulo a leading `export `) in the union of the two new files: 0 missing; the only additional lines are
   imports/exports/header comment.
2. Exported name set of `critic-review-lineage.mjs` identical before/after (14 = 14).
3. All suites that import the lineage module (directly: review-economy, critic-course-admission,
   critic-review-lineage, interruption-receipts tests, critic-packet-preflight and critic-dispatch-preflight tests;
   indirectly via critic-verify-lifecycle) have identical pass counts.
4. The adapter's only use, `validateCriticReviewHistory`, is the same function object semantics (same code, now
   defined in the core and re-exported).

## Ratchet effect (report only; `architecture/boundary-policy.json` NOT edited)
`architecture-boundary-check` after the change reports one NEW violation:
`[over-line-bound] plugins/pipeline-core/lib/guard-maintenance-window.mjs has 2087 lines ... past its accepted 2086`.
The accepted `maxLines` for that file must go 2086 -> 2087 (same precedent as D88/D110: one data line per kernel-list
entry). Alternative without a ratchet change: put the new path on the same line as
`critic-review-lineage.mjs` (style break). The other 17 findings of that run (`unowned-path` for repo-root
`scripts/*.mjs`) exist independent of this change. No line-bound issue for the lineage module (shrinks to ~420 lines)
or the core (509 lines).

## Diffs
- `scratch/agent-out/k81-protected.diff`: `plugins/pipeline-core/lib/critic-review-lineage.mjs`,
  `plugins/pipeline-core/lib/critic-review-lineage-core.mjs` (new), `plugins/pipeline-core/lib/guard-maintenance-window.mjs`.
- `scratch/agent-out/k81-unprotected.diff`: `plugins/pipeline-core/lib/interruption-source-adapter.mjs`,
  `docs/guard-maintenance-window-threat-model.md`.
- `git apply --check` from the main checkout: both clean (against main HEAD, independent of each other: disjoint files).
- The unprotected diff works ONLY with the protected diff applied (the adapter imports the new core module); the
  threat-model entry names a module that exists only after the protected diff.
- Operator order: (1) apply `k81-protected.diff`, protected commit by the operator first (it alone is green: lineage
  + core are behaviour-neutral, receipts test still 106/107 until step 2); (2) apply `k81-unprotected.diff`, commit.
  Do not commit the unprotected diff before the protected one (its import target would not exist). The boundary
  ratchet raise (2086 -> 2087) belongs with step 1 or right after.

## Proposed commit messages
Protected (operator):
```
refactor(critic): split the pure lineage validators into their own module

Move the record/chain/transition validators and constants of
critic-review-lineage.mjs verbatim into critic-review-lineage-core.mjs
(imports only review-economy.mjs). The lineage module imports and
re-exports them unchanged, so no caller changes. The core is a kernel
path by import closure (GMWKC01): add it to NEVER_LIFTABLE_KERNEL_PATHS.

AI-Assisted: true
Dispatch: K81-K2-ADAPTER-PURITY (goldfish)
```
Unprotected:
```
fix(interruption): import the pure lineage validators in the source adapter

The adapter reached modules with I/O and import.meta at evaluation time
through critic-review-lineage.mjs. Import validateCriticReviewHistory from
critic-review-lineage-core.mjs so the adapter's import graph is pure again
(interruption-receipts.test.mjs 107/107, purity claim unchanged). Document
the core module as protected in the maintenance-window threat model.

AI-Assisted: true
Dispatch: K81-K2-ADAPTER-PURITY (goldfish)
```
Note for the `Dispatch:` trailer: `evidence/dispatch-record-K81-K2-ADAPTER-PURITY.json` must exist (Elephant's step).

## Open items
Independent Critic read; operator commit of the protected parts; ratchet raise decision (PO); PO acceptance.
