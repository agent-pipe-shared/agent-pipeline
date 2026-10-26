# D161 held patch: the push-approval record is folded at push close

Patch: `d161-push-close-fold.patch` (git diff against repository HEAD 92c8ccc35, three files).
Reason held: `plugins/pipeline-core/scripts/push-prepare.mjs` is a never-liftable kernel path.
The test-file changes travel only in this patch; the repository copy of
`push-prepare.test.mjs` is unchanged.

## Change

- `push-prepare.mjs`: exported `remoteCommit(dir, remote, destination, deps)` (bounded
  `git ls-remote -- <remote> <destination>`, 15 s timeout, exact ref match, 40/64-hex check, any
  failure returns null); `foldPendingPushApprovalWrite(dir, deps, {close})` admits
  `forCommit === HEAD` only when `deps.remoteCommit` returns exactly `forCommit`; `pushCloseReport`
  and the sole-argument `--close` CLI, printing one JSON `{schema, folded, reason}`.
- `push-prepare.test.mjs`: nine `D161` tests.
- `docs/push-release-flow.md`: step-table row 5c and the trailing-write passage name
  `push-prepare.mjs --close` as the last step after a signed push; "commit nothing between
  approve-push and the push" kept.

## Preimage SHA-256 (HEAD 92c8ccc35)

- `docs/push-release-flow.md` b1616441e07f773e35e239851744b828a1e6dc70817b2673fe698ecf14c2c816
- `plugins/pipeline-core/scripts/push-prepare.mjs` b0dfd5eff37410d1b2eda5358416b10118bfeb7a221cab1033786ddc84881d1e
- `plugins/pipeline-core/scripts/push-prepare.test.mjs` 1418010edf02689d4d2f5403036fd7c07b2107357e10d8fe74258b7b7f1095b9

## Counts (in a real clone, not the repository)

- New D161 tests RED against the original code: 9 tests, 3 pass, 6 fail (the three passing ones
  hold today's behaviour).
- Whole `push-prepare.test.mjs` after: tests 84, pass 84, fail 0.
- `harness/scripts/check-consumer-safe-paths.test.mjs`: "fixture and repository checks passed".
- `plugins/pipeline-core/hooks/guard-push.test.mjs`: fails identically on a pristine clone of HEAD
  (tests 1, pass 0, fail 1; first line `candidate-bound independent review and Verify are
  unavailable (verify-evidence-not-exact-green)`), so it is pre-existing in a clone and unrelated.
  The patch does not touch `guard-push` or `pipeline-state`.

## Landed check, and why not the tracking ref

The close option requires a live `git ls-remote` answer equal to `forCommit` for the record's
remote and destination. This repository's origin fetch configuration is defective, so a
remote-tracking ref only moves on a fetch and is not evidence that a push landed. A missing,
different, ambiguous, malformed or failed read refuses the fold with nothing written.

## Safety

- Never folds before the push is proven landed.
- No network write: `ls-remote` only, no fetch, no ref update, `GIT_TERMINAL_PROMPT=0`.
- Without the close option behaviour is unchanged (every existing fold case keeps its result).
- Dirty tree beyond the state file still refuses `other-dirty-paths`.
- The fold commit stays unpushed until the next signed push. No guard change.

## Stack check

A second fresh clone of HEAD applied, in order, the thirteen C29 patches from the C29 list and then
this patch: all fourteen applied (`git apply --index`).

## Overlap

Touches the same three files only in `push-prepare.*` and one `docs/push-release-flow.md` region;
no C29 patch conflicted in the stack check. The PO applies it in the bundled ceremony.

## Proposed commit message

```
feat(push-prepare): fold the push-approval record at push close (D161)

Add `push-prepare.mjs --close`, run after a signed push: it folds the pending
approval record into one local commit once a bounded ls-remote shows the remote
holds the signed commit. Without it the fold still happens at the next run.

AI-Assisted: true
Dispatch: W4-D161-PUSH-CLOSE-FOLD-C2-20261026 (goldfish)
```
