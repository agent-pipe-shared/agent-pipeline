# Held patch: finalizer root-authored case expects the code the review unit check raises

Slice W7-FINALIZER-STALE-EXPECTATION-FIX-C1-20261027, candidate 63cb00879657384479847ba35be11c6d2c39c3c9. Patch: `w7-finalizer-stale-expectation-fix.patch` (test-only, 1 line). Recon: `w7-finalizer-root-authored-baseline-failure.notes.md`.

## Cause (re-verified)

`lib/critic-generic-batch.mjs` lines 273-276: `declarationCommit` defaults to `d.baseCommit`; `git cat-file -t` must return `commit`, else `fail("CGB-REVIEW-UNIT-BINDING")`. A root-authored candidate's base is the empty-tree object, so the check refuses before `reference(...)` at line 277 (which would raise `CGB-REFERENCE`). The case in `session-critic-finalizer.test.mjs` (line 510) still expected `CGB-REFERENCE`. Stale test expectation; the recon is confirmed, no other cause found.

## Changed line (plugins/pipeline-core/scripts/session-critic-finalizer.test.mjs, line 510)

- `assert.throws(() => batchFor(fx), (error) => error.code === "CGB-REFERENCE");`
+ `assert.throws(() => batchFor(fx), (error) => error.code === "CGB-REVIEW-UNIT-BINDING");`

Case name and every other line unchanged. No production edit.

## RED / GREEN

Whole file `node plugins/pipeline-core/scripts/session-critic-finalizer.test.mjs` (reporter is not TAP; counts from the `ℹ` summary):

- RED, unchanged clone: tests 39, pass 38, fail 1 (the root-authored case).
- Baseline clone2 (unchanged): tests 39, pass 38, fail 1, same single name.
- GREEN, patched clone: tests 39, pass 39, fail 0.

Failing-name sets: baseline = {root-authored case}; patched = {}. No new cases were added (the existing case is the tripwire, now pinned to the exact current code). No other pre-existing failure.

Apply check: `git apply --check` of the patch in clone2 at the candidate, exit 0.

## NOT done

Full Verify, independent Critic review (a parent-owned batch gate) and PO acceptance remain pending. No production code touched.

## Proposed commit message

test(critic): the root-authored candidate case expects CGB-REVIEW-UNIT-BINDING, the code the review unit check raises first

## Operator flow

apply the diff (`git apply <patch>`), `git add -u -- plugins/pipeline-core/scripts/session-critic-finalizer.test.mjs`, commit with `--no-verify` using the message above, stamp, install.

## Protected-path classification

The edited test file matches none of TP-1..TP-13; it was edited normally (in the scratch clone, never in the repository tree under plugins/). No guard refusal occurred on it.
