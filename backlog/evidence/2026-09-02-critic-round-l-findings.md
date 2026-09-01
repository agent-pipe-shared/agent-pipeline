# Findings registry — round L

Review object: `9a7c309b2ba6051fbe0e8f987b0ccad600c542f3`, `8db2c988f89eb07fa9e99febd502bc915a3d7a07`, `e066a1b775901b797fd2b4df7edfe81a16f71b27`, `3f92cae8cdf5f75c75f6a223645e96481b40f174`.

Neutral statements of what was found. No rationale, no implementor prose, no verdict about how a correction should be judged.

## F1 — major

`GIT_SHELL_PAYLOAD_OPTIONS` (`plugins/pipeline-core/lib/protected-test-paths.mjs:226-228`) keys on the literal strings `--exec` and `-x`, and `gitShellPayloads()` matches by exact equality or `startsWith` against those literals (`:428-437`). `GIT_NO_PATHSPEC_VERBS` gives `rebase` zero operand candidates (`:210`), so a spelling that misses the table produces no candidate at all.

git's `parse-options` accepts unambiguous long-option prefixes, and `--exe` is unique among `rebase`'s long options. `git rebase --exe "<a write command naming a protected path>" main`, and the `--exe=<cmd>` form, are executed by git as `--exec` and classified as carrying no candidates. Both the protected-path shell lane and `GUARD-DEVPLAN-SHELL` admit them.

This is also a regression against the behaviour before `a4786d52`, where the payload was a whole-string candidate that matched when it ended in a protected path.

The docblock at `:418-420` asserts the opposite: "All three spellings git accepts are covered … `--exec <cmd>`, `--exec=<cmd>`, `-x <cmd>` and the glued short form `-x<cmd>`."

Scope limit stated by the reviewer: the "only byte-identical spellings match" half is proven from the code; the "git accepts `--exe`" half rests on git's documented unique-prefix behaviour (`gitcli(7)`), not on an executed command.

Spec reference: Requirement 4 and negative test case 3.

## F2 — major, and the reviewer's spec reference is stale

The reviewer read `backlog/items/2026-09-01-three-onboarding-suites-pass-locally-and-fail-in-ci.md` as establishing `openssl` as the measured missing binary for `trust-anchor-bootstrap-circularity-repro-tests` and `onboarding-init-tests`, and recorded acceptance criterion 1 as unaddressed because neither `.github/workflows/verify.yml` nor `po-human-approval.mjs` appears in the diff.

Measured against CI after the item was written: commit `705b7cf3` added `openssl` to the workflow's synthetic PATH, and in run `33551001455` on commit `266d691f` `trust-anchor-bootstrap-circularity-repro-tests` reported `=0`. That suite is green and is not one of the three currently failing. The three failing in that run were `project-onboarding-v3-tests`, `codex-onboarding-capabilities-tests` and `onboarding-init-tests`; in a second execution of the same commit (job `100022146240`), `codex-onboarding-capabilities-tests` reported `=0`.

What survives from this finding is the second half, which is not about `openssl`: no CI run at `9a7c309b` or later is evidenced anywhere. The only CI runs cited predate all four commits.

## F3 — major

Routing `git rebase --exec` payload tokens onto the existing `opaque-interpreter-code` lane inherits that lane's literal-basename matching, which fires on a mention of a protected path rather than on a write to it.

`git rebase --exec "node --test <a protected suite>" main` is therefore refused, which contradicts the guard's own emitted denial text: "Reading and RUNNING the suite are unaffected: `node --test`, `node <suite>`, `cat`, `rg`, `git add/commit/diff/log/show` on this path are all admitted. Only a detected write is refused." The refusal offers no override route.

Observed first-hand by the reviewer: a `node -e` call writing plain prose into its own scratch notes was denied with `GUARD-TESTPATH-SHELL: TP-3 … lane: opaque-interpreter-code` solely because the prose contained a protected basename; the identical call with the token broken up succeeded.

The new guard test `TPSHELL-REBASE-EXEC` asserts the refuse direction for `sed -i`/`rm` payloads and the non-claim direction only for a payload naming an unprotected path (`scratch/other.test.mjs`). No test asserts that a read-only payload naming a protected path is admitted.

## F4 — major

`ownsPublishedOutput()` is wired into one call site (`plugins/pipeline-core/lib/project-onboarding-v3.mjs:3196`). Three further sites still gate `fs.unlinkSync` on `sameIdentity` alone: `:726-731` (`cleanupRuntimeProbe`), `:4987-4995` (`rollback`, which unlinks files it recorded as created), and `:3817`.

The commit's own docblock at `:590-603` states why `{dev, ino}` alone is insufficient for a delete.

The residual is recorded only in `evidence/claims-NVA-B-ROUND-L.json` `deviations[2]`, a gitignored machine-regenerated artifact, with no owner, no expiry date and no backlog item. Spec reference: QG-06.

## F5 — major

The spec's acceptance conditions require a new local candidate through the normal cachebuster/install/reload procedure and a readback confirming the loaded plugin version contains the fix. Neither dispatch record carries an install or readback step.

Measured first-hand: every guard denial in the reviewing dispatch was emitted by a marketplace install outside this repository, and the round-K registry measured that installed copy lacking `GIT_NO_PATHSPEC_VERBS`, `GIT_TREEISH_PATHSPEC_VERBS` and `gitVerbIndex`.

## F6 — major

No clean-candidate `harness/scripts/verify.mjs` result exists for any of the four commits. Per-suite green is not a gate pass, and the `main` ruleset requires the `verify` status check.

## F7 — minor

In `harness/scripts/print-verify-failures.mjs`, the byte-truncation branch (`:149-153`) runs before the failure-line recovery block (`:155-163`), which then prepends a header plus up to 20 recovered lines and recomputes `keptBytes` rather than re-enforcing the bound. The docblock at `:124-125` still states the old contract.

`FAILURE_LINE_RE` contains an unanchored `AssertionError` alternative, so a long assertion-diff line matches, and it also matches passing-test names and stack frames. Twenty such lines can push one suite past the 20 000-byte per-suite cap; the inflated `keptBytes` is what the global gate at `:284` consumes, so one suite can exhaust `MAX_TOTAL_BYTES` and cause later failing suites' tails to be omitted entirely (`:287`).

`!keptText.includes(line)` at `:158` is a substring test rather than line equality, so a short failure line contained in any kept line is treated as already present.

## Trajectory

Consistent, with two qualifications: no clean-candidate verify gate result exists for any of the four commits, and no CI run at any of these commits is evidenced anywhere — the only CI runs cited predate them.

## Dispatch-side defects recorded against the round itself

1. A raw backlog-item path was named as a spec reference instead of a stripped copy. The item carries a Triage section, which is forbidden prior-verdict prose. The reviewer established the violation from a structural heading probe, read only the lines preceding that section, and recorded the inconsistency rather than stopping.
2. The stated ruleset SHA was echoed but never independently resolved to an object.
3. Two of the three specs and the findings registry live in gitignored `scratch/`, so the measuring stick for this round cannot be recovered from any commit.
