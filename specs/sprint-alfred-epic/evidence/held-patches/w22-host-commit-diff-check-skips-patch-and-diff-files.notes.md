# Held patch notes — the host commit's whitespace check no longer reads patch and diff files as source (candidate 15c)

Patch: `w22-host-commit-diff-check-skips-patch-and-diff-files.patch`. Independent of the other 15c patches (applies on the bare tree).

## Root cause (measured 2026-11-01, read-only on the retained registry and diagnostics)

Almost every Goldfish dispatch left a pending state and a registry member behind instead of a host commit, and `heal` followed by `move-aside` was needed before the next dispatch.

- The member of a Goldfish dispatch is released only by the host commit at its stop (strict handback, host commit, terminal record, release). Of 290 retired pending states, 2 carry a terminal record; 193 distinct dispatches left a stop-failure diagnostic.
- Per day the dominant stop-failure code moved: 10-27/10-28 the final-JSON/shape contract and an unavailable registry (SDC-AUTHORITY-UNAVAILABLE, a consequence); from 10-30 `NATIVE-HOST-COMMIT-DIFF-CHECK` (4, then 11 on 10-31, 1 on 11-01).
- `NATIVE-HOST-COMMIT-DIFF-CHECK` is `git diff --cached --check` in `lib/agy-host-commit-execution.mjs`. A held patch stores every blank context line as a single space, which git reports as trailing whitespace. Every Goldfish whose deliverable is a `.patch` file fails the check, no commit and no terminal record happen, and the member stays `armed`.
- Probe (temp repository, staged files): six committed held patches and a synthetic one all exit 2 with "trailing whitespace"; a plain notes file exits 0.
- Then `heal` (routine-repair) moves the settled pending files, the native-goldfish namespace drifts under the still-armed member, `healDrift` keeps its strict refusal for a bound armed member, and only `move-aside` clears it.

## What

`agy-host-commit-execution.mjs`: the check runs as `git diff --cached --check -- . ':(exclude,glob)**/*.patch' ':(exclude,glob)**/*.diff'`. Only those two extensions are exempt; every other staged path is checked exactly as before.

`agy-host-commit-execution.test.mjs`: AHE14 (a `.patch` and a `.diff` with blank context lines commit and leave a clean tree) and AHE15 (trailing whitespace in another file is still refused with `AGY-HOST-COMMIT-DIFF-CHECK`, with a patch file beside it; nothing is committed). Corpus count 13 -> 15.

## Evidence

- Targeted run in the clone: the suite 15/15; with the native host-commit, finalizer, finalizer-regression and case-completion suites together 88/88.
- Mutation: reverting the production line turns AHE14 red (14/15), AHE15 stays green because it pins the retained rule.
- No pinned count moves (the case-completion suite is green with the patch).

## Not covered

- Other endings that also leave a member armed stay: a plain-text stop without changes, a `checkpoint` hand-back (commits nothing by design), a hand commit by the Elephant, a cancel. A per-member abandon transition for settled slices is the remaining structural gap; this patch removes the dominant current cause only.
- No Full Verify, no native Windows run, no Critic. Pending: batch Critic, native runs, PO acceptance.
