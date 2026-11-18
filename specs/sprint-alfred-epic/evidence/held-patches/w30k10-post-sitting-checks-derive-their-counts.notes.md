# w30k10 — the post-sitting checks judge by exit code and print their counts (candidate 30k, K1-02)

Applies after the integrated 30j tree (the 30i chain plus every 30j lane). The patch is the delta on that tree, so it does not apply to the real checkout until that tree is applied first (`apply --check` on the integrated 30j clone: exit 0).
Stage 1 of `plans/duplicated-state-and-rules-count-2026-11-18.md` (finding K1-02, "derive on read"). PO decision D-2 default applies: no literal "number of registered suites" tripwire.

## What

- `scripts/post-sitting-checks.mjs`: the `EXPECT` literals (1093 registered suites, 76 and 9 test cases) are removed. `suite-registration` is GREEN at exit 0 and prints the count it observes. The two test rows are GREEN at exit 0, zero failing cases and a parsable pass count, and print `pass N of M, fail F`.
  Row names and exit-code semantics are unchanged.
- `docs/operating-tools.md`: the three restatements of the counts are replaced by a pointer to the script output.
- `scripts/post-sitting-checks.test.mjs` (new, plain `node:test`, 11 cases): a different count is GREEN; a failing case, a non-zero exit and unparsable output are RED; the literal export is gone. Written first and RED against the old literals (4 of 11 failed), GREEN after the change (11 of 11).

## Why

The literals moved with every suite registration and turned the table RED at every candidate that adds a suite, although the checks they wrap already judge themselves by exit code. Nothing is stored; no record shape, gate or digest is touched.

## Criterion binding

AC-112 is the closest existing accepted criterion; the PRD and the Spec are unchanged.

## Not changed

- The other eight rows, the table format, `--json` and `--only` handling.
- The registration checker, the case-completion triple and the capability-inventory baseline (other findings).

## Not proven

- The Critic is suspended by the PO for candidates of this repository and no Full Verify ran: tests only.
- The new test file is not run by Verify until it is registered in `harness/verify-suites.json` (a protected list: operator step).
- The script was not run against a full checkout in this slice; the judges were exercised on fixture results only.
