# D52 checkpoint-commit route: COMPLETE held patch (c2)

Slice W7-D52-CHECKPOINT-COMMIT-ROUTE-C2-C1-20261027. Candidate a5e87f59b (plugins/ tree identical to 0378839c2, where the clones were built). Targeted delivery: **green**. Batch Critic, Full Verify and PO acceptance stay parent-owned and pending.

Proposed commit message: `feat(commit): add a sanctioned checkpoint-commit route for the Elephant`

The partial patch `w7-d52-checkpoint-commit-route.patch` is **superseded** by `w7-d52-checkpoint-commit-route-c2.patch` (6 files, +410/-1, `git diff --binary` from Node).

## Changed lines (in the patch)
- `scripts/dispatch-authorship-verify.mjs` (+55): `CHECKPOINT_ALLOWLIST`, `isCheckpointPath`, `Checkpoint-Act` branch in `verifyCommit` (PASS `elephant-checkpoint`; FAIL malformed / empty / outside-allowlist).
- `scripts/dispatch-authorship-verify.test.mjs` (+55): D52-1..D52-5.
- `scripts/checkpoint-commit.mjs` (NEW, 126): `runCheckpointCommit({repoRoot,messageFile,dryRun},deps)`; CLI `--repo-root --message-file [--dry-run]`; codes MESSAGE-FILE-INVALID, MESSAGE-HAS-PROVENANCE, MESSAGE-CORRELATION, INDEX-OUTSIDE-ALLOWLIST, PATH-OUTSIDE-ALLOWLIST, EMPTY (plus CHECKPOINT-GIT-FAILED for git errors). Uses `status --porcelain=v1 -z -uall`, `git add -- paths`, `git commit -F -` via stdin, never `--no-verify`; refusals stage nothing.
- `scripts/checkpoint-commit.test.mjs` (NEW, 147): cases (i)-(v), (viii), real pre-commit hook marker.
- `lib/commit-message-policy.mjs` (+9/-1): `checkpointPair` (exactly two trailers: `AI-Assisted: true` and `Checkpoint-Act: elephant`, either order) skips the Dispatch requirement. Path-neutral by design.
- `lib/commit-message-policy.test.mjs` (+19): CMP041 (pair admitted), CMP042 (second Checkpoint-Act, wrong value, missing marker, extra trailer, `Dispatch: not-admitted` stay refused). Note: a pair plus a valid `Dispatch: stage-0 (elephant)` was already accepted before this change (valid Dispatch + marker), so it is not a refusal case; the verifier (D52-3) refuses Checkpoint-Act together with Dispatch.

## RED then GREEN
- RED (before production edits): `checkpoint-commit.test.mjs` failed to load (ERR_MODULE_NOT_FOUND); verifier D52-1..D52-4 failed (D52-5 passes by design); policy CMP041 and CMP042 failed (CMP042 was first written with a `Dispatch: stage-0` case that was already accepted pre-change; replaced by `Dispatch: not-admitted` before implementing, i.e. a test-authoring correction in the same slice, not a weakening).
- GREEN (clone, final state): checkpoint-commit 6/6 pass; dispatch-authorship-verify 73/73 pass; commit-message-policy 42/42 pass.
- Baseline (clone2, unchanged): dispatch-authorship-verify 68/68, commit-message-policy 40/40. Failing-name sets: empty in both, so identical; only new cases added (5 verifier, 2 policy).
- One test correction after implementing: case (viii) first used `Co-Authored-By: Some Model <...>`, which the unchanged policy does not classify as a provider co-author (needs a vendor token); changed to `Claude <noreply@anthropic.com>` so it exercises the real correlation rule. Ties to the criterion (correlation text refused); no behaviour weakened.
- Apply check: `git apply --check` exit 0 in clone2 and in the repository root (read-only check).
- Logs: scratch/agent-out/w7qw/both-final-*.log (untracked; clones deleted).

## NOT done
- `scripts/checkpoint-commit.test.mjs` is not registered in the Verify suite list (`harness/scripts/verify.mjs` / `harness/verify-suites.json` are protected, TP-3/TP-13): needs registration.
- `hooks/guard-git.mjs` (~line 1069, `requireDispatch: markerMode !== "off"`) needs the same pair admission only if an agent-issued `git commit` carries the trailer directly; the script's inner commit is not seen by PreToolUse. Not touched (guard file out of scope).
- After install: `refresh-mandatory-hooks.mjs --root <repo>` so installed commit-msg snapshots carry the new policy.
- Independent Critic review: parent-owned batch gate.

## Toolbox use
Write `scratch/commit-msg/<x>.txt` (subject and body, no trailers), run `node plugins/pipeline-core/scripts/checkpoint-commit.mjs --repo-root . --message-file scratch/commit-msg/<x>.txt --dry-run`, then without `--dry-run`.

## Choices the PO may shrink
Allowlist: `docs/state.md`, `project/pipeline-state.json`, `specs/<id>/slice-queue.json`, `specs/<id>/evidence/**` (executable extensions refused). No `project/*.json` glob (would admit gate-strength files). Verdict is PASS with its own classification; switching to UNVERIFIABLE is a one-line change. The script also refuses any other untracked file in the tree (e.g. other `scratch/` files), which is stricter than needed.

## Operator flow
Apply the diff, `git add -u` with a path limit, `--no-verify` commit (hooks not yet refreshed), stamp, install, refresh-mandatory-hooks. Protected-path classification observed: none of the six patch files match TP-1..TP-13.
