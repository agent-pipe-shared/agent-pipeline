# Findings registry — round K

Review object: `a4786d52a82483bfcc4e8953f6e722f7b8ec3c73`, `7d56917c37344fb3750877c4e16787b0adb30943`.

Neutral statements of what was found. No rationale, no implementor prose, no verdict about how a correction should be judged.

## F1 — major

`GIT_TREEISH_PATHSPEC_VERBS` in `plugins/pipeline-core/lib/protected-test-paths.mjs` contains only `checkout`. Requirement 3 of the spec names `checkout` **and** `restore`, and requires that a revision such as `HEAD` is never treated as a pathspec. `restore` takes the unchanged whole-post-verb `operands()` walk.

Measured against the reviewed code:

- `git restore --source HEAD -- scratch/x.txt` → candidates `["HEAD", "scratch/x.txt"]`
- `git restore --source=HEAD -- scratch/x.txt` → candidates `["scratch/x.txt"]`

`restore` is named neither in the commit message, nor in the new code comments, nor in the claims record's `deviations` list, which does name `reset`, `switch`, `merge`, `cherry-pick` and `revert`.

## F2 — major

`gitWriteTargetOperands()` returns `[]` for every `rebase` invocation (`plugins/pipeline-core/lib/protected-test-paths.mjs:373`). Before the change, the payload token of `git rebase --exec '<command>'` was a candidate and was tested by `ruleForCandidate()` against end-anchored, non-start-anchored patterns, so a payload string ending in a protected test path matched and was refused. It is now admitted at this layer.

Measured against the reviewed code:

- `git rebase --exec "sed -i s/a/b/ scratch/dir/target.mjs" main` → candidates `[]`

Both consumers of the extraction — the protected-test-path shell lane and `GUARD-DEVPLAN-SHELL` — are affected. Requirement 4 of the spec lists `exec` among the shapes that must stay refused. The change is undisclosed and untested.

Scope limit stated by the reviewer: the classifier output was verified; no end-to-end guard verdict was executed, and the pre-fix behaviour was read off the diff, where `operands()` is unchanged.

## F3 — major

Only the repository-root `docs/push-release-flow.md` was updated for the new `push-init` argument contract. Two shipped copies still document the pre-fix invocation, ending in `[--base <ref>]` with no `--candidate`:

- `plugins/pipeline-core/skills/pipeline-start/references/push-approval.md:25`
- `plugins/pipeline-core/docs/push-release-flow.md:43`, and its summary table at `:507`

The plugin-side copies are the ones a hosted session reads under the plugin root. The driver fails loudly with `status: "candidate-required"` and an explicit remedy string, so the observable cost is a retry plus divergent canon. No suite in the same verify run flagged the divergence.

## F4 — major

The spec's acceptance conditions require a new local candidate through the normal cachebuster/install/reload procedure and a readback confirming the loaded plugin version contains the fix. Neither dispatch record nor `evidence/claims-NVA-B-ROUND-K.json` carries an install or readback check.

Measured: the guard executing in the reviewing dispatch resolves to a machine-local marketplace install whose `plugins/pipeline-core/lib/protected-test-paths.mjs` contains `GIT_WRITE_VERBS`/`extractShellWriteTargets` but no `GIT_NO_PATHSPEC_VERBS`, `GIT_TREEISH_PATHSPEC_VERBS` or `gitVerbIndex`.

## Trajectory

Consistent. One qualification recorded: no clean-candidate verify exists for either commit — `VERIFY-CANDIDATE-DRIFT` fired because HEAD moved from `a4786d52` to `7d56917c` mid-run, so the full-verify result is evidenced per-suite only, never as a clean gate pass.

## Dispatch-side defects recorded against the round itself

1. The `Criticality → model` metadata row carried a summary of what each commit changes, beyond the matrix row itself. That is an implementation summary in a metadata field, which the fail-closed reference boundary names explicitly.
2. The dispatch pre-authorized continuing without a required reference. The boundary resolves a missing reference as a stop, not a continuation. It did not fire; both stripped references resolved.
3. The stated ruleset SHA was also one of the two reviewed commits, so the measuring stick and the artifact were the same commit.
