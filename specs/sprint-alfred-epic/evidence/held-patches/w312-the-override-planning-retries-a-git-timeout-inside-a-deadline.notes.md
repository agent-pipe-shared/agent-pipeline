# w312 — override planning retries a git ETIMEDOUT once inside a per-planning deadline (candidate 31, C31-C2, lane L16)

Chained patch: a delta on the base clone of candidate 31 (the already delivered held patch of the base clone). It does NOT apply to the real checkout until that base is applied first; it edits only `plugins/pipeline-core/lib/human-guard-override.mjs` and its test. Protected guard library: applied through the PO's protected-source route.
Criterion binding: AC-112 is the closest existing accepted criterion (fresh bounded attempt under its unchanged Spec text). The PRD and the Spec are unchanged.

## What

- In a consumer run a hook's `git rev-parse --show-toplevel` ended `ETIMEDOUT` under parallel load (`HGO-GIT`). The helper `git()` had one fixed 5 s attempt; the failure became an external-operator card (a human hand-over) and the identical call succeeded at once afterwards.
- `git(root, args, spawn, deadline = null)` now retries the same call ONCE when, and only when, the first attempt returned `error.code === "ETIMEDOUT"` and a deadline object is passed and leaves at least 2 s; the retry's timeout is `min(5000, remaining)`. The first attempt is unchanged (5000 ms). No other error (non-zero exit, `EPERM`, a signal) is retried.
- `topology()` is the first call of every override planning. It creates the deadline (`{ startMs, budgetMs }`, started at its first git call) and passes the same object to its two git calls. The budget is a parameter `deadlineMs` with the default `PLANNING_DEADLINE_MS = 9000`, below the 10 s hook limit that most hook entries carry.
- Every other caller of the helper passes no deadline and is byte-for-byte unchanged (single attempt). The error text on a final timeout is unchanged: the card of two timeouts equals today's (`operation=rev-parse---show-toplevel, outcome=ETIMEDOUT`).
- Tests (`human-guard-override.test.mjs`, `L16-1` to `L16-4`, real fixture repository, the injected `spawn` times out the first `rev-parse --show-toplevel`, `Date.now` mocked): first timeout then success plans (spawn ran twice); two timeouts give the same HGO-GIT card (twice, never a third attempt); `EPERM` is not retried (once); a spent deadline (first attempt consumed 8.5 s of 9 s) is not retried (once). Red before the change: L16-1 and L16-2 failed (L16-3 and L16-4 are guard cases that already held and pin the new code's limits).

## Checks

- `human-guard-override.test.mjs --name L16`: 4 of 4 pass (red 2 failing before the production edit, evidence in the dispatch report).
- Whole `human-guard-override.test.mjs` run (private TMPDIR): 193 tests, 192 pass, 0 fail, 1 skipped (a pre-existing skip). With the default `/tmp` TMPDIR case Q9 is red for `domain-ancestor-unsafe` (a world-writable ancestor, environmental, unrelated to this change).
- The Critic is suspended by the PO for candidates of this repository and no Full Verify ran: tests only.

## Not changed / not proven

- No stored status, record shape, digest or key byte changed; no gate, signature, approval or time-based expiry touched. No refusal text changed.
- Not routed through the deadline (optional rider of the recon note, left out): `repositoryObservation`'s four helper calls, the cross-repository probe, the reconcile window and the three direct 5000 ms spawns (`symbolic-ref`, `rev-parse --verify`, `worktree list`). A timeout there is still one unretried attempt.
- The note's optional wording rider (append a runnable "retry once" step to the final HGO-GIT text) was NOT built: the briefing says the card must not change when the retry also times out.
- Not measured: what a hook host does when a hook overruns its limit; the real clock on a loaded machine (the tests mock `Date.now`).
- The retry covers `--git-common-dir` (the second topology call) by the same code; no dedicated case for it.
