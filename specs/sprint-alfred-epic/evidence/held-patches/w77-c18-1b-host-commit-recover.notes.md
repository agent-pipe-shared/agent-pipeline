# W77 / C18-1B held patch: a host-commit recover command lands an uncommitted Goldfish result as one orchestrator commit

Patch: `w77-c18-1b-host-commit-recover.patch` (git diff --binary against c9a73fb80). `git apply --check` against the repository HEAD: exit 0. Criterion: AC-164 is the closest existing accepted criterion (fresh bounded attempt under its unchanged Spec text); the PRD and the Spec are unchanged.

## What
- New `plugins/pipeline-core/scripts/goldfish-host-commit-recover.mjs` with two verbs.
  - `plan --root <root> [--dispatch-id <id>] [--allowed-path <p>]... [--path <p>]...` is read-only and prints `pipeline.goldfish-host-commit-recover-plan.v1`: status `ready|refused`, code, dispatchId, candidateCommit, `stopFailure {file, code}` (or null with a note that the stop left no diagnostic), the exact paths, the refusals (each with its next step) and, when ready, the exact `apply` argv with `--expect-sha256 <planSha256>`.
  - `apply` takes the same flags plus the digest, recomputes the plan and commits only if the digest still matches. It writes `scratch/commit-msg/<dispatch id>.txt`, gives new files an intent-to-add entry by exact pathspec, and runs `git commit -F <file> -- <exact paths>` (hooks enabled, never `add -A`). Trailers, last paragraph, consecutive: `AI-Assisted: true`, `Dispatch: <id> (goldfish)`, `Commit-Act: orchestrator`; the body names the stop-failure record by file name and code. A failed commit undoes the intent-to-add entries.
  - Sources: the pending host-commit state while it exists (dispatchId, candidateCommit, allowedPaths), else `--dispatch-id` plus `--allowed-path`. `--path` claims the changed paths; without it the changed allowed paths come from the tree. Absolute and relative spellings are both accepted.
  - Typed refusals, zero effect: `GHCR-HEAD-MOVED`, `GHCR-STAGED`, `GHCR-PATH-OUTSIDE-ALLOWED`, `GHCR-PATH-UNCHANGED`, `GHCR-NO-CHANGES`, `GHCR-NO-SOURCE`, `GHCR-PENDING-AMBIGUOUS`, `GHCR-EXPECT-SHA256-REQUIRED`, `GHCR-PLAN-DIGEST-MISMATCH`, `GHCR-COMMIT-FAILED`.
- `plugins/pipeline-core/lib/guard/command-catalogue.mjs`: one entry like its sibling `routine-repair` admits exactly `plan --root <root> ...` and `apply --root <root> ... --expect-sha256 <64 hex>` (digest refused for plan, required for apply, no dot segment or leading dash in paths).
- `plugins/pipeline-core/scripts/goldfish-host-commit-recover.test.mjs` (new suite, 10 cases): ready plan with zero effect, apply creates one commit with the trailers and the pointer, no stop failure, HEAD moved, staged path, path outside allowed paths, no source, explicit flags with absolute and relative paths, digest mismatch and missing digest, and guard admission of the plain plan command.

## Why
Consumer run: 9 of 9 Goldfish host commits did not land and each result was committed by hand, so the task-to-commit link hung on a hand-written trailer alone. A live case in this repository also had a valid result with the pending state and no stop-failure record. This is the sanctioned last step; slice w76 (other dispatch) makes the failing code say why.

## Tests
- RED first against the absent script: 10 of 10 failed. GREEN: `goldfish-host-commit-recover.test.mjs` tests 10, pass 10, fail 0; `dispatch-recovery-admission.test.mjs` 2/2; `check-consumer-safe-paths.test.mjs` 9/9; `guard-lifecycle-ready.test.mjs` was started but its result against the final catalogue is not yet confirmed (see Not proven). The admission case also covers an upper-case dispatch id (the briefed form); the catalogue entry has its own id pattern, not the lower-case-only one of dispatch-recovery. Finding while testing: `git commit -- <untracked path>` refuses, hence the exact-pathspec intent-to-add step.

## Not changed
The host-commit transaction, the SubagentStop hook, the stop-failure schema, any existing script, `harness/verify-suites.json` and the capability inventory (the new suite needs registration in a consolidated slice).

## Not proven
`guard-lifecycle-ready.test.mjs` has no confirmed result at the final state of the catalogue; the Coordinator runs it once against the applied patch.
The pending state is read tolerantly as plain JSON (binding.dispatchId, candidateCommit, allowedPaths) because no exported helper enumerates pending states without a session and tool-use id; it is not authenticated, which is acceptable since apply only runs ordinary hook-guarded git on paths the explicit binding or flags bound. The newest stop-failure record is matched to the dispatch by dispatchId only. Not run against a real consumer stop failure; fixtures mirror the finalizer shapes. Critic review and Full Verify remain with the Coordinator.

## Operator flow
`git apply`, commit as the PO (protected plugin source), stamp, install, register the suite.
