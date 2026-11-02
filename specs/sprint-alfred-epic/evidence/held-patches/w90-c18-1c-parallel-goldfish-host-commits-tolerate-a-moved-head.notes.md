# w90 — a Goldfish host commit survives a sibling host commit, and a sibling stop's lock is waited for (candidate 18, C18-1C)

Source binding: AC-108 is the closest existing accepted criterion; the PRD and the Spec are unchanged.

**Apply order.** This patch is a delta on top of w76 (it edits the same files). Apply w76 first, then this patch. It does not apply to a checkout that lacks w76, and its check test therefore does not run `git apply` against the repository.

## What it adds

- **Moved HEAD tolerated (normal path only).** `assessHostCommit` used to admit only when HEAD equalled the baseline `candidateCommit`. It now also admits when HEAD has moved, if and only if the baseline commit is an ancestor of the current HEAD AND no path changed between baseline and HEAD (`git diff --name-only`) equals one of this dispatch's allowed paths or claimed `changedPaths`. Top level, unmerged paths and a staged index are still checked first and unchanged. A baseline that is not an ancestor, an overlapping path, a staged change or any git failure keeps `AGY-HOST-COMMIT-DRIFT` with its existing `detail.conditions` text.
- The admission result carries the commit it admitted against (`candidateCommit` = current HEAD) plus `headMoved: true` and `baselineCommit`. The finalizer hands the commit step a baseline whose `candidateCommit` is that HEAD, so the commit's parent is the CURRENT HEAD. The recorded pending state and its baseline are not rewritten and its schema is unchanged.
- **Open blocker, guarded.** Measured: with the tolerant admission the commit succeeds on the moved HEAD, but the observation receipt and record validators in `native-goldfish-host-observation.mjs` (outside this slice's files) bind `parent === candidateCommit` and refuse with `NGHO-DRAFT-BINDING`, leaving a commit without a record. Therefore the finalizer carries a guard that refuses a tolerated moved HEAD with `AGY-HOST-COMMIT-DRIFT` BEFORE committing (behavior as before at the stop path). The admission function itself is tolerant and tested (AHC13-AHC16). Needed change to finish item (1): `native-goldfish-host-observation.mjs` (and the receipt and record validators it calls) must accept a commit parent that is a descendant of the briefing's candidate, then the guard in the finalizer is removed and NGHF36 returns to asserting `NGHF-AUTHORED-RECORD-VERIFIED` with the sibling HEAD as parent.
- The item-delivery (concurrent) branch is untouched: the tolerant branch applies only when no concurrent authority is passed. Allowed-path and changed-path checks, consent rules and every refusal code are unchanged.
- **Lock wait.** `prepareTerminal` at the stop path now runs inside the existing `retryWhileSessionAuthorityLockHeld` (budget 5 s, exponential delay, injectable `now` and `sleep` through `dependencies.lockWait`). The helper now also treats `SDC-AUTHORITY-UNAVAILABLE` with reason `state-push-owner-unavailable` as transient. After the bound the original error is rethrown, so the refusal stays the typed `SDC-LOCK-HELD` (or the existing code) with stage `authority-terminal-prepare`; no new public code. Only a refusal raised before the callback entered is retried, as before.
- **Diagnosable exception.** The `NGHF-COMMIT-EXCEPTION` record gains `detail.errorMessage`: at most 160 characters, control characters removed, every whitespace-delimited token that contains a path separator replaced by `<path>`. The sanitizer and the hook notice accept and print it ("message ..."). `errorName`, `errorCode` and `reason` are unchanged.
- Tests: `agy-host-commit-admission.test.mjs` AHC13-AHC16 (corpus pin 12 to 16): disjoint sibling admitted against the new HEAD, overlapping allowed path drifts, non-ancestor drifts, moved HEAD plus staged change drifts naming both. `native-goldfish-host-finalizer.test.mjs` NGHF33-NGHF36: lock released within the bound succeeds (one `SDC-LOCK-HELD`, one `state-push-owner-unavailable`), lock held beyond the bound ends typed with nothing committed, bounded path-free message, end-to-end commit on a moved HEAD whose parent is the sibling's HEAD.
- **Changed existing case, with justification.** NGHF31 asserted that the exception record contains no message text (`text.includes("boom") === false`) and an exact detail object. Goal item (3) requires the message to be recorded, so its detail now also expects `errorMessage: "boom at <path> stack"` and the absence of the path and of the path token's text is still asserted. No other existing case was weakened.

## Checks (clone, serial)

See the dispatch report for the printed counts of the admission, finalizer, return and consumer-safe-path suites.

## Not changed / not proven

- `agy-host-commit-execution.mjs` is untouched; the readback parent check there is satisfied because the commit is given the moved HEAD as its baseline commit.
- The exact producer of `state-push-owner-unavailable` was not located in the clone; it is retried by its code/reason pair only. A lock held by a live sibling longer than 5 s still fails typed; the bound was not tuned against a real parallel run.
- The test-first order was not kept for the production edit: the admission and finalizer production code was written before the new cases were run, so the new cases were not observed RED against the original code.
- A sibling commit that touches a path only by directory prefix of an allowed path is compared by exact path equality, as the allowed-path check itself is.
- Not proven against a real consumer run with several parallel Goldfish. The full Verify was not run.
