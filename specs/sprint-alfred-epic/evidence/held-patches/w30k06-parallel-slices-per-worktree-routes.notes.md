# w30k06 — analysis: parallel Goldfish slices per worktree against the clone-slice route (candidate 30k, C30K-K6)

Adds one analysis document only: `specs/sprint-alfred-epic/plans/parallel-slices-per-worktree-routes-2026-11-18.md`. No code, no test and no registry change. Criterion binding: AC-112 is the closest existing accepted criterion (fresh bounded attempt under its unchanged Spec text; it is the Coordinator's binding, not a content match); the PRD and the Spec are unchanged. The patch is a delta on the integrated 30j tree (the clone int30j): apply that tree first, then this patch (it does not apply to the real checkout alone; `apply --check` on the integrated 30j clone was exit 0).

## What it adds

What the clone-slice route does today in eleven steps, split into the clone layer, the shared-tree host-commit layer and the recovery layer; what a worktree route needs from the host (isolation, expected path and SHA, commit surface, registry namespace, guard view, cleanup) with the Claude and Antigravity state; the failure modes of the shared tree, the clone and the worktree with the 30j incidents; a comparison table with a verdict per row; the smallest first stage; the closing sections Recommendation, What stays unchanged (DO-NOT-DO), Staged plan and Open decisions for the PO.

## Why

The PO asked for an analysis before any code (candidate 30k plan): fewer duplicated states and rules, no new gate.

## Findings that correct the briefing

- Admission, the baseline-dirty refusal, the sibling-commit exception and the admission budget are steps of the shared-tree host commit, not of the clone route; a clone lane's deliverables go through them too. A worktree would not remove them.
- The admission budget in code is 300000 ms with a 5000 ms margin; "250 s" is the observation in queue C30-23.
- The mechanism behind the four `native-concurrent-unowned-head` failures is readable in `native-goldfish-host-state.mjs` (lines 848, 878-885, 963-977 of the integrated tree) but which raise site fired is not readable from the repository.

## Not changed / not proven

- Analysis only, no test run: every statement is labelled PROVEN (read) or INFERRED (reasoned) with a file and line. Nothing was executed.
- Not measured: the raise site of the four incidents, whether a recovery commit releases the recovered lane's member, the Claude guard view of a worktree, the Claude host commit under a worktree, Windows worktrees, any Codex worktree route.
- Briefing defect: the DoD text says the patch "applies to the real HEAD", while the Coordinator facts say it does not and the check must not run `git apply`. The check follows the facts: exists, non-empty, touches only the one document.
- The check file is a plain `node:test` file; it needs registration in the Verify suite list if it should run in Verify.
