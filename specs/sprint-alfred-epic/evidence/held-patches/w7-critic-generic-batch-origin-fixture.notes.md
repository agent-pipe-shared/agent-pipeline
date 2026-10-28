# Held patch: critic-generic-batch review helper gets the caller-authored fallback opt-in

Slice W7-CRITIC-GENERIC-BATCH-ORIGIN-FIXTURE-C1-20261027, candidate 72d9bdca14a6eba29ae812e70b32cfe638db8bfb.
Patch: `w7-critic-generic-batch-origin-fixture.patch` (git diff --binary from a scratch clone, written from Node). Nothing committed.

## Cause

`review()` in `plugins/pipeline-core/lib/critic-generic-batch.test.mjs` (lines 38-52) calls `finalizeSessionCriticReview` with options lacking `allowCallerAuthoredFallback`. `originGate` (`plugins/pipeline-core/scripts/session-critic-finalizer.mjs` lines 98-106, re-verified) finds no original-source record (default reader always fails) and, without `options.allowCallerAuthoredFallback === true` (line 102), throws `SCF-ORIGINAL-SOURCE-UNAVAILABLE` (line 105). Class: fixture stale against the origin gate. Recon spelling fix: the finalizer is under `plugins/pipeline-core/scripts/`, not `scripts/`. The recon's cited lines otherwise matched.

## Changed line (test only, one line, line 44)

`genericBatchRef:{...member.batchRef,memberSha256:member.memberSha256}};` became `genericBatchRef:{...member.batchRef,memberSha256:member.memberSha256},allowCallerAuthoredFallback:true};`

The key goes in the shared `options` object, so admit and finalize both receive it; admit accepted it (GREEN run).

## Results (whole file, `node plugins/pipeline-core/lib/critic-generic-batch.test.mjs`, reporter not TAP; counts from log lines)

| Run | tests | pass | fail | failing names |
|---|---|---|---|---|
| clone2 baseline (unchanged candidate) | 26 | 24 | 2 | CGB002, CGB003 |
| clone RED (unchanged, before edit) | 26 | 24 | 2 | CGB002, CGB003 (SCF-ORIGINAL-SOURCE-UNAVAILABLE at the review() frame) |
| clone GREEN (patched) | 26 | 26 | 0 | none |

Baseline versus patched failing-name sets: {CGB002, CGB003} versus {}. No other case failed in either run.

## Apply check

`git apply --check` of the patch in clone2 at the candidate: exit 0. Diff stat: 1 file, 1 insertion, 1 deletion.

## Deviations

No new case was written: the briefing names the existing CGB002 and CGB003 as the RED/GREEN pair. No existing case was weakened, skipped or deleted.

## NOT done

- The repository tree is untouched; `critic-generic-batch.test.mjs` stays red there (CGB002, CGB003) until the operator applies this held patch.
- No Full Verify, no independent Critic review (parent-owned batch gate), no PO acceptance.
- The sanctioned opt-in reference (`session-critic-finalizer.test.mjs` lines 683-685) was not re-read: the path given in the briefing did not resolve under the read guard. The semantics were confirmed from `originGate` itself and by the GREEN run.

## Protected-path classification

`plugins/pipeline-core/lib/critic-generic-batch.test.mjs` matches none of TP-1..TP-13 (agent-obligations section 2); ordinarily editable.

## Proposed commit message

`test(critic): give the generic batch review helper the caller-authored fallback opt-in`

## Operator flow

1. Apply the diff: `git apply specs/sprint-alfred-epic/evidence/held-patches/w7-critic-generic-batch-origin-fixture.patch`
2. `git add -u -- plugins/pipeline-core/lib/critic-generic-batch.test.mjs`
3. Commit with `--no-verify` (operator's route for held patches) using the message above.
4. Stamp, then install.
