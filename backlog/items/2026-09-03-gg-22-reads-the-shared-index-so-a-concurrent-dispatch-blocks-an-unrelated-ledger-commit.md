---
schema: pipeline.backlog-item.v1
id: pipeline.gg-22-reads-the-shared-index-so-a-concurrent-dispatch-blocks-an-unrelated-ledger-commit
type: defect
owner: pipeline
status: open
created: 2026-09-03
sprint: nova-b
done_when: "contains plugins/pipeline-core/hooks/guard-git.mjs pipeline.gg-22-scopes-debt-check-to-the-commit-pathspec"
tracking: "Nova B — GG-22's disallowed-path check reads `git diff --cached`, the shared index, rather than the paths the blocked commit actually names. Under parallel dispatch that makes an unrelated agent's staged work block a correct ledger commit, with a denial text that names neither the real cause nor a route forward."
source: "Measured live 2026-09-03 during the autonomous Nova-B run: the dispatcher's ledger commit for the scope-relay closure (573df491) was refused by GG-22 while a concurrent goldfish dispatch held harness/scripts/check-product-capability-inventory.{mjs,test.mjs} staged in the shared index."
---

# GG-22 reads the shared git index, so one dispatch's staged files block another agent's ledger commit

## What happens

`guard-git.mjs`'s GG-22 branch decides whether a commit is admitted while
status-flip debt is outstanding by reading the **index**, not the commit:

```js
const stagedRun = run(["diff", "--cached", "--name-only"]);
// ...
const disallowed = stagedPaths.filter((path) =>
  !path.startsWith("backlog/items/") && !LEDGER_PATHS.has(path));
```

A commit that names its paths explicitly — `git commit -F <msg> -- backlog/STATUS.md
backlog/index.json backlog/transitions.ndjson` — stages nothing and touches
nothing else. GG-22 nevertheless refuses it if *any* unrelated path is sitting in
the index at that moment, because the index is shared by every agent working in
the same checkout.

## Measured instance

Sequence, all in one checkout on 2026-09-03:

1. The dispatcher committed a backlog item's closure as `573df491` (item file
   only, explicit pathspec).
2. `reconcile-backlog-ledger.mjs --activate` recorded two transitions; the three
   ledger files became modified in the working tree.
3. A concurrent `goldfish-implementor` dispatch, working on an unrelated task,
   had `harness/scripts/check-product-capability-inventory.mjs` and its test file
   staged in the index — its own normal, correct working state.
4. The dispatcher's ledger commit, naming only the three ledger files, was
   refused:

       BLOCKED (git-guard GG-22): an earlier commit changed
       backlog/items/2026-08-26-sendmessage-mid-task-scope-relay-rule-has-no-durable-home.md's
       status without a matching ledger reconciliation since 8d5551a1...

The reconciliation had in fact already run. The remediation the denial prescribes
was already complete; what blocked the commit was another agent's unrelated
staged work.

## It is a deadlock, not a delay

The first analysis of this incident assumed the dispatcher merely had to wait for
the concurrent dispatch to commit. It does not resolve that way. The block is
symmetric:

- The dispatcher's ledger commit is refused because the other agent's files are
  in the shared index.
- The other agent's commit is refused by the same rule, because the dispatcher's
  status flip in `573df491` has no committed reconciliation yet — which is
  precisely the commit the first refusal is blocking.

Both refusals are GG-22, and each one's remediation is the action the other
refusal forbids. Waiting cannot clear it, because neither party can move first.
The concurrent dispatch reached the same conclusion independently and reported
the commit as blocked, correctly declining to touch the ledger itself since
reconciliation was outside its briefed scope.

The only exits are outside the guard's prescribed remediation: unstage the other
agent's files (`git restore --staged`, non-destructive — the working tree keeps
the content, and safe only because that dispatch had finished), or `git reset`,
which would have discarded them had it still been running. A guard whose stated
remediation is unreachable, and whose reachable workarounds are both outside its
own text, is refusing correct work rather than preventing incorrect work.

The measured cost here was small only because the dispatch had already finished
and reported. Had it still been running, the two exits would have been "wait
forever" and "destroy its staged work".

## Why the denial text makes this worse

The message names the ledger debt and prescribes the exact remediation order —
commit items, reconcile, commit ledger last. A dispatcher who has just performed
those three steps in that order reads a denial asserting they were not performed.
Nothing in the text mentions the index, the staged paths, or the concurrency, so
the natural next hypothesis is that the reconciler failed or the order was wrong.
Re-running the reconciler returns "nothing to reconcile", which reads as a
contradiction rather than as a clue.

The obvious workaround is also the dangerous one: `git reset` to clear the index
would discard a concurrently-running dispatch's staged work. A guard whose
denial pushes toward destroying another agent's in-flight state is worse than
one that simply refuses.

## The narrow fix

Scope the disallowed-path check to the paths the refused commit actually names.
Git supplies them: when the command carries an explicit pathspec, that pathspec
is the commit's content, and the index is irrelevant to it. Only when the commit
carries no pathspec (`git commit` against whatever is staged) is
`git diff --cached` the right question.

Failing that, the denial must at minimum name the staged paths it objected to,
so the reader can tell "your reconciliation is missing" from "somebody else's
files are in the index" — and it must not leave `git reset` as the only visible
route forward.

## Scope note

This is the third distinct way the shared git index has produced a cross-dispatch
collision in this repository, after `git add -A` sweeping another dispatch's
files into an unrelated commit, and the verify-candidate drift a concurrent
commit causes. It belongs with
`backlog/items/2026-09-01-concurrent-dispatches-in-one-shared-checkout-collide-in-ways-no-guard-catches.md`,
which is the general item; this one is a specific, reproducible instance with a
named fix, and should be resolvable without waiting for the general question.
