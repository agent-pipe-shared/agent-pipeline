# D52 checkpoint-commit route: PARTIAL held patch (budget checkpoint reached)

Slice W7-D52-CHECKPOINT-COMMIT-ROUTE-C1-20261027. Candidate 0378839c2. Targeted delivery: **blocked** (partial). Batch Critic, Full Verify and PO acceptance stay parent-owned and pending.

Proposed commit message (for the finished patch): `feat(commit): add a sanctioned checkpoint-commit route for the Elephant`

## What the patch contains (PARTIAL, do NOT apply as final)
The `.patch` carries three files against the candidate:
1. `plugins/pipeline-core/scripts/dispatch-authorship-verify.mjs` (+55): exported `CHECKPOINT_ALLOWLIST` and `isCheckpointPath()`; in `verifyCommit`, before the `parseDispatchTrailer` early return, a `Checkpoint-Act` branch: exactly one `Checkpoint-Act: elephant` and no `Dispatch:` trailer, else FAIL `elephant-checkpoint-malformed`; zero paths FAIL `elephant-checkpoint-empty`; any path outside the allowlist FAIL `elephant-checkpoint-outside-allowlist` (with `outside` list); all inside: PASS `elephant-checkpoint`, `assurance: "checkpoint-elephant"`.
2. `plugins/pipeline-core/scripts/dispatch-authorship-verify.test.mjs` (+55): cases D52-1..D52-5 (vi, vii) plus namespace import `verifierNs`.
3. `plugins/pipeline-core/scripts/checkpoint-commit.test.mjs` (+147, NEW, RED): cases (i)-(v) and (viii). It imports `./checkpoint-commit.mjs`, which is NOT written yet, so this file fails to load. **Needs registration in the Verify suite list (`harness/scripts/verify.mjs`, outside my files) once complete.**

## NOT done (remaining)
- `plugins/pipeline-core/scripts/checkpoint-commit.mjs` is not written. Intended API (pinned by the test file): `runCheckpointCommit({repoRoot, messageFile, dryRun}, deps = {git(args, {cwd, input})})` returning `{ok:false, code, detail, paths}` or `{ok:true, receipt}`; CLI `--repo-root --message-file [--dry-run]` printing one JSON receipt `{schema:"pipeline.checkpoint-commit-receipt.v1", dryRun, committed, commit, paths, trailers:["AI-Assisted: true","Checkpoint-Act: elephant"]}` with no absolute path. Codes: `CHECKPOINT-MESSAGE-FILE-INVALID` (must be repo-relative under `scratch/`, no `..`), `CHECKPOINT-MESSAGE-HAS-PROVENANCE` (final block already has Dispatch/AI-Assisted/Checkpoint-Act), `CHECKPOINT-MESSAGE-CORRELATION` (use `finishedCommitMessageFindings` from `lib/commit-message-policy.mjs` with no flags), `CHECKPOINT-INDEX-OUTSIDE-ALLOWLIST` (checked first), `CHECKPOINT-PATH-OUTSIDE-ALLOWLIST`, `CHECKPOINT-EMPTY`. Enumerate with `git status --porcelain=v1 -z -uall`, exclude only the message file itself, use `isCheckpointPath`; stage with `git add -- <paths>`, commit with `git commit -F -` (stdin), never `--no-verify`; refused runs stage nothing.
- GREEN run of the new cases, whole-file comparison of `dispatch-authorship-verify.test.mjs` in clone and clone2 after the script exists, and `git apply --check` in clone2 against the final patch.

## Evidence so far (machine-written logs under scratch/agent-out/w7qw/, untracked)
- Command: `node scratch/agent-out/w7qw/driver.mjs run both-red <files>` (exit 0).
- Baseline (clone2, unchanged) `dispatch-authorship-verify.test.mjs`: 68 tests, 68 pass, 0 fail.
- RED in clone (cases added, no production edit yet): `checkpoint-commit.test.mjs` fails to load (`ERR_MODULE_NOT_FOUND`); `dispatch-authorship-verify.test.mjs` failing names: D52-1, D52-2, D52-3, D52-4 (D52-5 passes by design: it pins unchanged stage-0/design/undeclared behaviour).
- GREEN: NOT run (verifier edits were made after the last run; unverified). Apply check: NOT run.

## Re-verified recon claims
`ELEPHANT_STAGE0_ID` is at line 146, `ELEPHANT_STAGE0_MAX_PATHS` at 153 (=10), enforcement at ~393/398: the recon's ":146-149" is line drift, not a contradiction.

## Hook/guard follow-ups needed (STOP item, files outside my scope)
`AI-Assisted: true` plus `Checkpoint-Act: elephant` cannot pass the commit-msg backstop in a repo with hooks installed: `lib/commit-message-policy.mjs` (`PROVENANCE_SIGNAL` line 86, `finishedCommitMessageFindings` lines 171-182) reports `GIT-03-DISPATCH-MISSING` for a block with no `Dispatch:` entry, and `admittedDispatchValue` (85-98) is a closed list. Needed change in that file: an exact-pair admission (`AI-Assisted: true` then `Checkpoint-Act: elephant`, no `Dispatch:`) that stays path-neutral (path enforcement is the verifier's and script's). `hooks/guard-git.mjs` line 1069 (`requireDispatch: markerMode !== "off"`) needs the same admission only if an agent-issued `git commit` carries the trailer directly; the script's inner `git commit` is not seen by PreToolUse. Afterwards run `refresh-mandatory-hooks.mjs --root <repo>` (installed snapshots go stale). The unit tests do not exercise installed hooks beyond a pre-commit marker hook in a temp repo.

## Choices the PO may shrink
Allowlist (`CHECKPOINT_ALLOWLIST`): `docs/state.md`, `project/pipeline-state.json`, `specs/<id>/slice-queue.json`, `specs/<id>/evidence/**` (executable extensions refused). The briefing's "project/*.json runtime files named by the recon": the recon names none besides pipeline-state; a `project/*.json` glob would admit gate-strength files, so it is not used. No detached/protected-branch refusal is built: `guardrails/git.md` has no commit-time rule (only branch deletion at line 102). Verdict choice: PASS with a distinct classification (mirrors administrative); switching to UNVERIFIABLE like the D56 attested class is a one-line change.

## Toolbox use (once finished)
Write the message to `scratch/commit-msg/<x>.txt`, run `node plugins/pipeline-core/scripts/checkpoint-commit.mjs --repo-root . --message-file scratch/commit-msg/<x>.txt --dry-run`, then without `--dry-run`.

## Operator flow for the final patch
apply-diff, `git add -u` with a path limit, `--no-verify` commit is NOT used by me (the host commits), stamp, install. Protected-path classification observed: none of the four patch files match TP-1..TP-13 or GS rules. An independent Critic review stays a parent-owned batch gate.

CONTINUATION CARD -- done: verifier branch + allowlist, all RED cases, RED run logged; remaining: write checkpoint-commit.mjs, GREEN run, whole-file clone/clone2 comparison, re-run driver patch, apply check, update this note; next step: reuse the kept clones under scratch/agent-out/w7qw/ (driver.mjs modes run/patch/check/cleanup).
