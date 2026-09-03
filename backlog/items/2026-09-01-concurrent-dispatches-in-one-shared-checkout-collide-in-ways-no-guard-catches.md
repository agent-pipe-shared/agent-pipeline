---
schema: pipeline.backlog-item.v1
id: pipeline.concurrent-dispatches-in-one-shared-checkout-collide-in-ways-no-guard-catches
type: defect
owner: pipeline
status: open
created: 2026-09-01
source: "Direct measurement, 2026-09-01: two dispatches independently fixed the same file, a third spent budget confirming a fix already committed by another agent, and a full verify.mjs run failed on candidate-binding drift because the orchestrator committed mid-run."
sprint: nova-b
done_when: manual
---

# Concurrent dispatches in one shared checkout collide in ways no guard catches

## Description

Four separate first-hand observations from 2026-09-01, in one shared
checkout with several dispatches active concurrently:

1. Two dispatches were briefed on disjoint-sounding scopes, but both ended
   up editing `harness/scripts/print-verify-failures.mjs`, producing two
   separate commits (`8fbb4ed7` and `58fe2d4b`) attempting the same gitleaks
   fix.
2. A third dispatch was briefed to add an `EXCLUSIONS` entry and found the
   entry already present and committed by another agent (`c84d2f44`) —
   correctly making no edit, but only after spending its own tool budget
   discovering that the work was already done.
3. A full `verify.mjs` run launched from inside one dispatch failed with
   `candidate-binding=1` / `VERIFY-CANDIDATE-DRIFT`, because the orchestrator
   committed while the run was in progress — every one of the other 504
   steps in that run reported 0 (never executed, not passed).
4. One dispatch's completion report stated "Changed files: None" for work
   that had, in fact, been committed under its own `Dispatch:` trailer —
   the report and the actual committed state disagreed.

## Distinction the evidence actually supports

Parallel dispatches themselves are not the defect. What the evidence shows
failing is narrower: **overlapping FILE scopes across concurrently briefed
dispatches**, and **any commit landing while a full `verify.mjs` run is in
progress**. The full verify run is the serialization point — its
candidate-binding check depends on HEAD staying fixed for the run's
duration, and nothing currently prevents another agent from committing
during that window.

## Relationship to the existing worktree-isolation item

`backlog/items/2026-08-25-workflow-tool-isolation-worktree-never-created-a-worktree-this-session.md`
is the closest existing item and was read in full before filing this one.
It documents a DIFFERENT failure: `isolation: "worktree"` was REQUESTED for
three dispatches and silently produced no separate worktree at all (`git
worktree list` showed a single entry), so dispatches that believed they had
isolation did not, and a self-heal step written for a genuinely isolated
worktree then detached the dispatcher's own shared HEAD.

This item's evidence is different in kind, not merely in date: none of the
four observations above involve a failed isolation grant or a `checkout
--detach`. They are collisions that occur precisely WHEN dispatches are, by
design or necessity, sharing one checkout (as CLAUDE.md's own current
fallback for unconfirmed worktree isolation already prescribes: "serialize
the remaining work through the shared tree"). The 2026-08-25 item is about
isolation not being granted when requested; this item is about what still
goes wrong even in a shared checkout used deliberately and knowingly, once
concurrent dispatches' file scopes overlap or a full verify run overlaps
with another agent's commit. Filing this as a new item rather than folding
it into the 2026-08-25 item, because the 2026-08-25 item's own proposal
section (its point 2) already treats "serialize dispatches in the shared
checkout" as the interim mitigation for its own failure mode — this item's
evidence shows that mitigation is itself incomplete, which is a distinct
finding, not a restatement of the same root cause.

## Affected artifact

No single guard currently covers this. Candidates for where a check could
live: `harness/scripts/verify.mjs` (candidate-binding logic already exists
there and already detects the drift after the fact); dispatch briefing
process (`templates/prompts/goldfish-task.md`); no existing file-scope-lease
or verify-run-lock mechanism was found.

## Proposal — options only, no decision made here

1. **A lease or claim mechanism over file paths for concurrent dispatches**,
   so a dispatch briefed against a path already claimed by another live
   dispatch is refused or flagged before it starts editing, rather than
   discovered only when two commits collide.
2. **A verify-in-progress marker that refuses commits while a run is
   bound** — since `verify.mjs` already binds to a candidate HEAD and
   already detects the resulting drift (`VERIFY-CANDIDATE-DRIFT`), the gap
   is that detection happens only after the run has already been wasted;
   a marker other agents' commit paths check first would prevent the
   collision rather than merely reporting it.
3. **Briefing-time scope-overlap detection across live dispatches** — before
   dispatching, compare the new briefing's stated file scope against any
   other currently-open dispatch's stated scope and flag an overlap for the
   dispatcher to resolve, rather than relying on each dispatch's own
   completion report to reveal the collision after the fact.

None of these three is recommended over another here.

## Triage

### Predicate note, 2026-09-03 — manual, and why

`done_when: manual`. The three proposed remedies (a file-scope lease/claim
mechanism, a verify-in-progress commit lock, and briefing-time scope-overlap
detection) touch three disjoint candidate surfaces — no existing file-scope
lease or verify-run-lock mechanism was found anywhere in the repository, and
the item explicitly declines to rank the three — so there is no single
change surface a `contains`/`script-exit-zero` predicate could name without
also silently pre-deciding which of the three remedies is chosen, which is
exactly the design decision this item leaves open. No `Decision:` value is
set here; that choice belongs to whoever triages this item next.
