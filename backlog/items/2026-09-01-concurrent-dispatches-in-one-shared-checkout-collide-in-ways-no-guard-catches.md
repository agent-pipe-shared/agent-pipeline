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

### Additional evidence, 2026-09-04 — NVA-B-COLLIDE-1

Four further first-hand observations, 2026-09-04, from one shared checkout
with up to four concurrent dispatches active, tested against this item by
dispatch `NVA-B-COLLIDE-1` (given as facts to test the item's premise
against, not as a list to fix in that dispatch):

1. **A mutual GG-22 deadlock** (one session's ledger commit blocked by
   another dispatch's staged files, and that dispatch's own commit blocked
   in turn by the first session's unreconciled status flip). Already covered
   by `backlog/items/2026-09-03-gg-22-reads-the-shared-index-so-a-concurrent-dispatch-blocks-an-unrelated-ledger-commit.md`,
   which names a specific, narrow fix and already states its own
   relationship to this item under its "Scope note". Not duplicated here.
2. **A `git add -A` capture**: one dispatch's `git add -A` swept a
   concurrent dispatch's already-staged, unrelated file into its own commit.
   Falls within this item's own "overlapping FILE scopes" distinction above.
   No existing item or guard covers it — confirmed by inspection: no GG rule
   in `plugins/pipeline-core/hooks/guard-git.mjs` restricts `git add -A` or
   an unqualified `git commit`; `templates/prompts/agent-obligations.md` §6
   already forbids the practice as commit discipline, but nothing enforces
   it mechanically. Bounded, measured repro:
   `scratch/repro-addall-capture.mjs` (fixture built in an isolated
   throwaway repo under `scratch/`, never this checkout's own index);
   captured evidence
   `backlog/evidence/2026-09-04-nva-b-collide-1-addall-capture-red.txt` —
   RED: the capture reproduces, and `guard-git.mjs` admits the literal
   `git add -A` command (exit 0) when fed the same tool-input JSON Claude
   Code pipes to it. Every remedy this item's own Proposal section names for
   this class is either the reserved ranking decision (options 1/3) or
   names a change to `harness/scripts/verify.mjs`, a protected test path
   (TP-3, option 2) — so no code fix is made here; this is new evidence for
   the same open design decision, not a resolution of it.
3. **A shared evidence-slot race** (`evidence/verify-latest.json`, a bare
   `writeFileSync` with no run identity). Out of scope for this item — it is
   `backlog/items/2026-08-12-shared-verify-evidence-slot-corrupted-by-concurrent-dispatches.md`'s
   own defect, and a separate dispatch (`NVA-B-EVSLOT-1`) was reproducing
   and working it concurrently with this one.
4. **A dispatch reporting a coordinator message as inaccurate** because the
   tree had changed between the message being written and being delivered.
   Out of scope for this item: it fits neither of the two categories this
   item's own "Distinction the evidence actually supports" section names
   (overlapping file scopes; a commit landing during a full `verify.mjs`
   run) — it is message staleness against a moving tree, not a git-index or
   verify-candidate collision.
   `backlog/items/2026-09-03-a-dispatch-cannot-authenticate-a-mid-task-correction-from-its-dispatcher.md`
   is the nearest existing item but covers a different axis (whether a
   mid-task message's claimed IDENTITY can be authenticated, not whether its
   CONTENT stayed accurate against a moving tree) and does not claim this
   ground. Left here as an unfiled finding for the next triage pass, not
   filed as a new item by `NVA-B-COLLIDE-1` itself (a new item would need a
   ledger reconciliation that dispatch was not positioned to commit safely
   alongside the rest of its shared-checkout work).

No `status:` or `Decision:` value changed by this update. This item's own
text still declines to rank its three proposed remedies; that determination
remains open for whoever triages it next.

## Triage decision, 2026-09-04 — the three ranked, and a fourth the list does not name

Taken by the dispatching Elephant of the session that produced the four events
above, on the evidence they provide. The item stays **open**.

**A fourth remedy outranks all three, and it is the one the list misses.** The
`git add -A` capture (event 2) is not prevented by any of the three options. Its
actual cause is that `guard-git.mjs` **admits `git add -A`** — confirmed by
inspection and by a bounded repro under `NVA-B-COLLIDE-1`, exit 0, evidence in
`backlog/evidence/2026-09-04-nva-b-collide-1-addall-capture-red.txt`.

`templates/prompts/goldfish-task.md` already forbids it in those words: "NEVER
`git add -A` or `git add .` — in a shared working tree a wildcard add lets
another parallel goldfish's files ride along on your commit." So the rule exists,
is stated, and is enforced by nothing. That is this repository's own
best-understood failure class: a process rule no guard enforces, learned only by
the incident it was written to prevent.

Cost: a new rule in `guard-git.mjs` needs coverage in `guard-git.test.mjs`, which
is **TP-1-protected**. So it is a signature-window change, not a dispatch — the
same window that already carries the `verify.mjs` registration lines, the
`hooks.json` comment and the evidence-slot hardening. Recorded as a candidate for
that window rather than a commitment, because widening what a guard refuses is a
PO-level call.

**Ranking of the item's own three, by measured harm against cost:**

1. **Option 3, briefing-time scope-overlap detection — first.** Cheapest, needs
   no protected path, and it addresses what actually went wrong: overlapping file
   scopes assigned by hand across up to four concurrent dispatches. Every
   briefing already states its scope in field 4, so the input exists; comparing
   the new briefing's scope against live dispatches' scopes is dispatcher-side
   tooling with no guard surface. It also acts at the cheapest moment — before
   any work is done rather than after two commits collide.
2. **Option 2, a verify-in-progress marker — second.** Real and measured: this
   session bound a verify run to a HEAD, needed to commit, stopped the run; and
   separately committed after a completed run and voided its binding. But
   `verify.mjs` is TP-3, so it costs a signature, and the drift is already
   *detected* (`VERIFY-CANDIDATE-DRIFT`) — the gap is prevention, not blindness.
   Discipline covered it today; a marker would make the discipline unnecessary.
3. **Option 1, a file-path lease — last.** Disproportionate to the measured harm.
   It needs shared state, a lifecycle, and stale-lease recovery — a subsystem —
   to formalise something the dispatcher already does by hand in every field 4.
   Revisit only if option 3 lands and overlaps still occur.

**Event 4, coordinator-message staleness, is recorded here rather than filed
separately.** A dispatch reported a mid-task message from its dispatcher as
inaccurate; the message was true when written and false by the time it arrived,
because the dispatch had resumed work in between. That is a property of
concurrent work in one checkout, which is this item's own subject, so it belongs
here rather than in a fourth item. The nearest existing item
(`backlog/items/2026-09-03-a-dispatch-cannot-authenticate-a-mid-task-correction-from-its-dispatcher.md`)
covers message *identity*, not *staleness*, and the two should not be conflated.

The practical consequence is a dispatcher-side one and needs no mechanism: a
mid-task message must not assert present-tense facts about a shared tree. State
what was observed and when, not what is true now.
