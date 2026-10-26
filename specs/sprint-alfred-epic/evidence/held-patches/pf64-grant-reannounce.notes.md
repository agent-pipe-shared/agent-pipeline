# Held patch: PF-64 cause 2, a budget grant notice survives a denied first call

Patch: `pf64-grant-reannounce.patch` (git diff against the C29 stack commit; apply with `git apply --index`).
Apply AFTER C29 item 14 (`d161-push-close-fold.patch`), i.e. as the 15th patch of `scratch/wave3/c29-order-14.txt` plus this one.
Reason it is held: `plugins/pipeline-core/hooks/guard-dispatch-budget.mjs` is a NEVER_LIFTABLE kernel path.

## Cause

`grantNoticeContext` wrote the `grants/<agentId>.announced` marker before the notice reached the model. Claude Code drops a
PreToolUse allow `additionalContext` when another PreToolUse hook denies the same call (for example a grammar refusal), so the
marker said "announced" although the child never saw it, and the grant was never shown again.

## Fix

Marker content becomes `${digest} ${firstCount}\n` (firstCount = counted call that first carried the notice). The notice rides
every budget-allowed call while the marker is absent, unreadable, holds another digest, or holds this digest with
count < firstCount + 3, so at most three consecutive counted calls carry it. The marker is written only when the digest is new or
the marker is absent/unreadable; repeats never move firstCount. A legacy marker holding only `${digest}` stays silent as before.

Three-call bound: one dropped announcement is recoverable, while a second or third repeat keeps the notice from becoming
permanent noise. No PostToolUse route: there is no PostToolUse budget hook, and `hooks/hooks.json` is protected (not touched).

## Touched files and preimage SHA-256 (measured on the stacked clone, i.e. after C29 item 14)

- `plugins/pipeline-core/hooks/guard-dispatch-budget.mjs` `a0011bb32ea15ae230e20a640decb54ce786e26f6c5da5270d535c5d2532d121`
- `plugins/pipeline-core/hooks/guard-dispatch-budget-grant-notice.test.mjs` `0f6f740ce86a7d1edf2a555f62fdcb1280bc1ffe820fc0597c31802be625837c`
- `plugins/pipeline-core/hooks/guard-dispatch-budget-checkpoint.test.mjs` `da525f2029a40ce2fee23c8bdb13abaa4052402eb9de4b879e75468c0debae39`

## Counts (in the stacked clone, final state)

- RED before the fix (four new tests): grant-notice suite 13 tests, 10 pass, 3 fail ((a), (b), (d)); (c) legacy-silent passed already.
- guard-dispatch-budget-grant-notice.test.mjs: 13 tests, 13 pass, 0 fail.
- guard-dispatch-budget.test.mjs: 127 tests, 125 pass, 0 fail, 2 skipped, 0 todo.
- guard-dispatch-budget-checkpoint.test.mjs: 15 tests, 15 pass, 0 fail.
- lib/pins/budget-checkpoint-fires-below-the-briefed-cap.test.mjs: 11 tests, 11 pass, 0 fail.
- harness/scripts/check-consumer-safe-paths.test.mjs: 9 tests, 9 pass, 0 fail.
- Stack check on a fresh clone of repository HEAD c6cd3a6d7: the 14 C29 patches in order, then this one, all apply.

## Changed existing assertions (each tied to the new behaviour; nothing weakened beyond the named ones)

1. grant-notice test "announced once ... naming agent, sequence" (~135): second call formerly `{0, "", ""}` (silent); now equals the first context with "counted call 22". Marker formerly `${digest}\n`; now `${digest} 21\n`. Justified: the notice repeats on the next counted call and the marker records the first count.
2. "grant and checkpoint together" (~150): second call formerly silent; now exactly one line, the grant notice for counted call 25 (no checkpoint due). Justified: grant repeats on call 25.
3. "marker equal to digest keeps silent; older digest announces again" (~161), last assertion only: expected replacement marker `${digest} 21\n` instead of `${digest}\n`. The same-digest silent branch is byte-unchanged.
4. New test (a): the fourth-call assertion is a `doesNotMatch` on the grant-notice prefix only, not full silence, because counted call 24 is also the checkpoint threshold (6 of 30 remain) and legitimately carries the checkpoint notice (accepted by the Coordinator).
5. Coordinator decision, `guard-dispatch-budget-checkpoint.test.mjs` GDBC11 (~380): the single assertion "the grant is announced once" (status 0, stdout and stderr empty) now asserts status 0, empty stderr, a JSON allow whose additionalContext starts with `DISPATCH-BUDGET-GRANT:` and contains `(counted call 22)`, message "PF-64 cause 2: the grant repeats on the next counted call". Nothing else in that file changes.

New tests (prefix "PF-64 cause 2"): (a) three calls carry it, the fourth none, marker `${digest} 21\n`; (b) marker `${digest} 21\n` at counter 22 announces again, marker unchanged; (c) legacy marker stays silent and unchanged; (d) older-digest marker replaced by `${newDigest} <count>\n`, notice shown.

## Proposed commit message

```
fix(budget): repeat a budget grant notice on the first three counted calls

The .announced marker was written before the notice reached the model; when another
PreToolUse hook denied that call, Claude Code dropped the allow context and the grant
was never shown again (PF-64 cause 2). The marker now records the first counted call and
the notice rides up to three consecutive counted calls.
```
