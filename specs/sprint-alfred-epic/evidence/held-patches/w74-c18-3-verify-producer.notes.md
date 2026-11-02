# W74 / C18-3 held patch: the candidate Verify producer no longer poisons its own run

Patch: `w74-c18-3-verify-producer.patch` (git diff --binary against c9a73fb80). `git apply --check` against the repository HEAD: exit 0. Criterion: AC-140.

## What
- `plugins/pipeline-core/scripts/verify-evidence-producer.mjs`
  - `candidateIdentity(root, ownOutputs)` reads `git status --porcelain=v1 --untracked-files=all` and does not count the producer's own output target(s) (`--out` and the canonical path) or a `specs/<feature>/slice-queue.json` as dirty. Any other path still makes the candidate dirty. All four call sites pass the targets.
  - New `invalidatePriorOutputs`: an output not tracked at HEAD is removed as before (stale green never consumable). A TRACKED output is no longer removed at the start of a run; if an earlier aborted run deleted it, it is restored from HEAD. `writeEvidence` removes and rewrites the file only on success (and for the explicit dirty-rejection record). The named-commit lane uses the same helper.
- `plugins/pipeline-core/scripts/verify-evidence-producer.test.mjs`: five new `C18-3` cases (queue not dirty; queue plus another file still dirty; two runs in a row and a run after a leftover output; tracked output deleted earlier; SIGTERM half-way leaves the tracked output and a clean tree).

## Why
Consumer run: five consecutive `status: dirty`. (1) the untracked slice-queue.json; (2) the cleanliness check ran before the producer removed its own previous output, so a failed attempt's untracked output poisoned every later run; (4) a run aborted with TaskStop left the tracked output deleted. Measured finding while testing: removing a tracked output at run start also made the run's own `baseline-repository` suite fail (`unreadable-tracked-text` on the missing file), so a tracked output path could never pass; keeping the tracked file in place until success fixes both.

## Tests
- RED against the original producer: 4 of the 5 new cases failed (dirty instead of passed x3; tracked output deleted after SIGTERM), 53 passed (the fifth, the negative guard, is green by design).
- GREEN with the patch: verify-evidence-producer.test.mjs `tests 57, pass 57, fail 0` (exit 0); check-consumer-safe-paths.test.mjs `tests 9, pass 9, fail 0` (exit 0); the held-patch check test run by `node --test` (see report).

## Not changed
Windows authority handling (WIN-AUTH-OPEN, item 3); evidence schema, exit codes and the public output path; lib/consumer-verify.mjs and verify.mjs. No signal handlers were added.

## Not proven
The consumer defect was not reproduced on this machine; the fixes are shown against fixtures that mimic it. A SIGKILL that lands between rmSync of an untracked output and its rewrite leaves it removed (harmless: not consumable). Exempting slice-queue.json means a candidate can be reported clean while that queue is uncommitted; the push gate still binds committed content only. Critic review and Full Verify remain with the Coordinator.

## Operator flow
`git apply`, commit as the PO (protected plugin source), stamp, install.
