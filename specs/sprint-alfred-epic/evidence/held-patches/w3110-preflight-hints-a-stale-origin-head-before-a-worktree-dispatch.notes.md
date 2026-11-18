# w3110 — the preflight hints a stale `refs/remotes/origin/HEAD` before a worktree dispatch (candidate 31, lane L19, slice C31-B10)

Applies AFTER the base clone of candidate 31 (it edits the same preflight files); the patch is the delta on that base and does not apply to a checkout that lacks it.
Binding: AC-112 is the closest existing accepted criterion (fresh bounded attempt under its unchanged Spec text); the PRD and the Spec are unchanged.
PO decision 2026-11-19: a read-only, non-blocking notice, no new gate.

## What it adds

- `observeOriginHeadNotice({ rootDir, run })` in `scripts/pipeline-start-preflight.mjs`: two read-only `git rev-parse --verify --quiet` calls (`refs/remotes/origin/HEAD^{commit}` and `HEAD^{commit}`), the same git call shape and 10 s timeout as `observeUnseenPushToRemote`.
  It returns one sentence only when the ref exists and resolves to another commit than HEAD; otherwise `null`.
  The sentence names the ref (with both short commits), says worktree-isolated dispatches start from it and not from HEAD, and names the repair `git symbolic-ref refs/remotes/origin/HEAD refs/remotes/origin/<branch>` or `git remote set-head origin <branch>`. The repair is never run and no ref is changed.
- `main` adds the sentence to the printed envelope as the optional key `originHeadNotice`, only when it is not `null` (the same mechanism as the other optional keys such as `agyStartHint`). The key is added before the printed-payload measurement, so `printedPayload.withinBudget` covers it; the sentence is about 330 bytes against a 45,000-byte budget.
- Absent ref (no origin remote, measured by the consumer probe: the worktree then starts from the current HEAD without error), equal commit, a non-git directory and any git failure (non-zero exit, timeout, throw) print nothing. No status code, exit code, gate or stored record changes.
- Tests in `scripts/pipeline-start-preflight.test.mjs` (written first, RED 3 of 110 against the original code, then GREEN 110 of 110): stale ref yields the notice with ref, worktree start and both repairs and changes no ref; equal ref, no origin, non-git directory, `run` returning `null` and `run` throwing yield `null`; the real process line in a stale, an equal and an origin-less fixture repository carries the key only in the stale one, the three statuses are identical and `printedPayload.withinBudget` holds. `runPreflightProcess` gained an optional `{ cwd }` argument (default unchanged).

## Checks

- `pipeline-start-preflight.test.mjs` 110 of 110 pass; `bootstrap-payload-budget.test.mjs` 10 of 10 pass (the budget module is unchanged).
- The Critic is suspended by the PO for candidates of this repository and no Full Verify ran: tests only.

## Not changed / not proven

- `lib/bootstrap-payload-budget.mjs` and its test are unchanged: no separate notice budget was needed.
- The `<branch>` in the repair is a literal placeholder; the notice does not guess which remote branch the PO wants.
- Not changed: the skill text of `pipeline-start` (outside the write list) does not yet mention the new key; the dispatch reference `workflow-dispatch.md` is untouched.
- Not proven: a real Claude `isolation: "worktree"` run (the attended probe of L19 is separate).
