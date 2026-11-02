# w95 — the host observation accepts a commit on a moved HEAD, and the w90 guard is removed (candidate 18, C18-1D)

Source binding: AC-108 is the closest existing accepted criterion; the PRD and the Spec are unchanged.

**Apply order.** This patch is a delta on top of w76 and w90 (it edits the same files). Apply w76, then w90, then this patch. It does not apply to a checkout that lacks them, and its check test therefore does not run `git apply` against the repository.

## What it adds

- **Typed evidence in the receipt.** When the admission tolerated a moved HEAD (`headMoved: true`, `candidateCommit` = admitted HEAD, `baselineCommit`), the finalizer hands exactly those typed fields to `draftNativeGoldfishHostObservation`, which records them in the receipt as an optional key `movedHead: { admittedHead, baselineCommit }` (no free text). A receipt without the key is validated exactly as before (`parent === candidateCommit` for the non-shared schemas).
- **`validateNativeGoldfishHostObservation`** accepts `parent !== candidateCommit` only when `movedHead` is present with exactly those two OIDs, `baselineCommit === candidateCommit` and `admittedHead === parent`. With a `root` option (passed by the draft and by `inspectNativeGoldfishHostObservation`) it additionally requires `candidateCommit` to be an ancestor of `parent` (`git merge-base --is-ancestor`). A parent that is neither the candidate nor the admitted HEAD, a missing or malformed `movedHead`, or a non-descendant parent keeps `NGHO-DRAFT-BINDING` / `NGHO-OBSERVATION-BINDING`. Schema, dispatch id, paths, tree, blob and record checks are unchanged.
- **Finalizer.** The w90 guard that refused a tolerated moved HEAD with `AGY-HOST-COMMIT-DRIFT` before committing is removed. The shared (item-delivery) route is untouched.
- Tests in `native-goldfish-host-finalizer.test.mjs`: NGHF36 asserts again `NGHF-AUTHORED-RECORD-VERIFIED` with the sibling HEAD as the parent. New NGHF37-NGHF40: descendant parent accepted (finalizer route and local readback); a parent that is not the admitted HEAD refused; a parent that is not a descendant refused; a moved parent without `headMoved` evidence (or with malformed evidence) refused.

## Checks (clone, serial)

See the dispatch report for the printed counts of the finalizer, admission, return and consumer-safe-path suites.

## Not changed / not proven

- `agy-host-commit-admission.mjs`, `agy-host-commit-execution.mjs` and the dispatch-record validators are untouched.
- The ancestry check needs a repository root; a validation without `root` (private-store write and read) checks the typed binding only. The ancestry was enforced at the draft (before the receipt is stored) and at the local readback.
- Not proven against a real consumer run with several parallel Goldfish. The full Verify was not run.
