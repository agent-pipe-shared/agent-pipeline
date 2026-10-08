# Tranche 1 - Verify registration post-image (T1-VERIFY-REG, 2026-10-08)

These files are proposed post-images for the quality-package builder. Nothing here is applied to the repo.

## Files
- `harness/verify-suites.json` - HEAD blob `53db39bfe1f54af5dc7ff654f198f729ee8acd8c` plus seven appended entries
  (append-only: no earlier entry changed, key order and indentation kept, trailing newline kept).
- `harness/scripts/verify.mjs` is NOT changed: it loads every entry of `harness/verify-suites.json` through
  `loadDeclarativeVerifySuites` (about line 936) and pushes `{name, file, caseCompletion?}` into `TEST_SUITES`.
  A JSON entry alone registers a suite.

## Entries (shape = nearest entries: name, file, invariantPinned, nonOverlapNote)
- `test-private-tmp-tests` -> `plugins/pipeline-core/lib/test-private-tmp.test.mjs`
- `scratch-retention-tests` -> `plugins/pipeline-core/lib/scratch-retention.test.mjs`
- `scratch-sweep-tests` -> `plugins/pipeline-core/scripts/scratch-sweep.test.mjs`
- `design-consistency-check-tests` -> `plugins/pipeline-core/lib/design-consistency-check.test.mjs`
- `design-review-receipt-tests` -> `plugins/pipeline-core/lib/design-review-receipt.test.mjs`
- `design-approval-binding-tests` -> `plugins/pipeline-core/lib/design-approval-binding.test.mjs`
- `recovery-refusal-registry-tests` -> `plugins/pipeline-core/lib/recovery-refusal-registry.test.mjs`
All seven test files and their modules are tracked at HEAD (`git ls-files`).

## Why these field values
- Names follow the `<topic>-tests` convention; `file` is the repo-relative test path.
- No `caseCompletion` block: these suites carry no stable case-ID scheme (the first entries of the file are
  registered the same way). Adding one is a later, separate decision.
- `invariantPinned` / `nonOverlapNote` are derived from each test file's header comment; the package author may refine wording.
- The `verify.mjs` HEAD blob was not changed, so no post-image exists for it.

## Not done
- Q11/T33 suites (`hardened-private-directory-install-tests`, `gitleaks-repair-ignore-cli-tests`) are not registered (manifest: needs decision).
- `plugins/pipeline-core/lib/fs-durability.mjs` has no test file, so nothing was added for it.
