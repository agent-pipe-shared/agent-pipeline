# Diagnosis: pre-existing failing finalizer case (root-authored candidate)

Case: `session-critic-finalizer.test.mjs` — "a root-authored candidate keeps its empty-tree base but cannot register a generic batch review unit".

Status: diagnosed by the Coordinator from the failing stack of a whole-file run in a scratch clone (baseline with and without the Cut A follow-up), not by a dispatched Goldfish. A Goldfish dispatch for this was prepared but not needed. Nothing is changed in the repository.

## Observation

The case fails at the candidate commit and identically with the W7 patches stacked: 35 tests / 1 fail at the Cut A baseline, 39 tests / 1 fail with the follow-up.

Failing assertion (`assert.throws(() => batchFor(fx), (error) => error.code === "CGB-REFERENCE")`): the validation function received a `GenericCriticBatchError` whose code is not `CGB-REFERENCE`. The stack runs `registerGenericCriticBatch` → `registerBatch` → `declarationSource` → `reviewUnitSource` → `fail(...)` at `critic-generic-batch.mjs` line 275 of the clone.

## Cause

`reviewUnitSource` (lib/critic-generic-batch.mjs, the `declarationCommit` block just after the function head) takes the declaration commit as `d.baseCommit` when none is given and first requires `git cat-file -t <declarationCommit>` to be `commit`, refusing with `CGB-REVIEW-UNIT-BINDING` otherwise. For a root-authored candidate the base is the empty-tree object (the case asserts this itself), so `cat-file -t` returns `tree` and the code refuses with `CGB-REVIEW-UNIT-BINDING` before `reference(root, declarationCommit, d.reviewUnitPath)` is ever reached. The case still expects the older code `CGB-REFERENCE`, which that later call would have produced. The review-unit binding check was put in front of it (D165-era hardening); the test expectation was not updated.

## Classification

Test defect (stale expectation). The product behaviour the case names — a root-authored candidate cannot register a generic batch review unit — still holds: the registration is refused, only with a different typed code. Confidence: high for the mechanism (the stack names the refusing function and the case asserts the empty-tree base); not re-run against a variant that accepts both codes.

## Proposed minimal fix (not applied)

In the case, change the predicate to `error.code === "CGB-REVIEW-UNIT-BINDING"` (pinning the code the product now raises), keeping the empty-tree-base assertion. Do not accept both codes: pinning exactly the current code keeps the case a real tripwire. One line in `plugins/pipeline-core/scripts/session-critic-finalizer.test.mjs`; no production change. Independent Critic review and Full Verify stay parent-owned gates.
