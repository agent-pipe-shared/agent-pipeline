# w71 — case-completion counts restated, and the happy-path pin stays unclassified (candidate 17)

Applies after w70 and before the derived-files commit. Two files, found by running the harness checks on the fully applied chain.

## What it changes

1. `plugins/pipeline-core/lib/pins/happy-path-guide-names-only-existing-scripts.test.mjs` (w65): two regex literals held a literal backtick. The case-completion classifier's masker reads an
   odd number of backticks as the start of a template literal, so it swallowed the second `test(` call, counted ONE test and at least two assertions, and classified the file `node-test-single`
   ("VULNERABLE-UNREGISTERED"). The backticks are now written as `\x60` (same match under the `u` flag). The classifier now returns null for the file: two tests, no registration needed.
   No assertion is weakened or removed.
2. `harness/scripts/check-verify-case-completion.test.mjs` (VCR01): three pinned required-descriptor counts were outgrown by their suites and are restated with the usual dated comment:
   `critic-course-admission-tests` 343 to 349 and `critic-dispatch-preflight-tests` 382 to 389 (both mismatching already on the candidate-17 base, before any chain patch), and
   `guard-dispatch-budget-checkpoint-tests` 154 to 157 (assertions added by w67). Names, paths, classifications and all other counts stay as pinned.

## Checks

- Classifier run on the pin before and after: `node-test-single` (6 sites) before, null after.
- `check-verify-case-completion.test.mjs` plus the pin: 34 of 34 pass in the slice clone built on the w70 state.

## Not changed / not proven

- Applies only on the chain (needs w65, w67 and w70 applied); `git apply --check` against the plain repository fails by design.
- The full Verify run was not made.
