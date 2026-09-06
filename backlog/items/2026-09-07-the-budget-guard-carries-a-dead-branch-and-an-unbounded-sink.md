---
schema: pipeline.backlog-item.v1
id: pipeline.the-budget-guard-carries-a-dead-branch-and-an-unbounded-sink
type: defect
owner: pipeline
status: open
created: 2026-09-07
source: "T1 Critic round 2 on NVA-B-BUDGETVIS-1 (PASS, two minor findings F-A and F-B), recorded in backlog/evidence/2026-09-06-nva-b-guardfix-critic-round1.md; plus one inconsistency the reworking dispatch disclosed about its own change"
sprint: nova-b
done_when: manual
---

# The budget guard carries a dead branch and an unbounded sink

## Description

Three residues around `guard-dispatch-budget.mjs`'s identity handling, all
minor, none blocking, all left open when the two-round Critic limit for that
package was spent. They belong together because they are the same seam.

**A dead branch that still documents a promise.** The guard's
`evaluateDispatchBudgetGuard` still has an `identity.kind === "invalid-identity"`
branch. Nothing can produce that kind any more: the identity step returns only
`subagent`, `unresolved` or `orchestrator`. The branch carries the named
invariant `pipeline.dispatch-budget-invalid-identity-fails-closed`
(NVA-R7-INVALIDIDENTITY, 2026-08-29) and a rationale block describing behaviour
that can no longer occur, so a maintainer reads a documented fail-closed
posture the guard cannot deliver.

**An unbounded sink next to a deliberately bounded one.** `recordUnresolved()`
appends one line per call to `unresolved.jsonl` with no cap and no rotation.
That branch was unreachable in production until the visibility fix made it
reachable, so the property was never exercised. Its sibling in the same guard,
`recordOrchestratorObservation()`, is deliberately bounded to one write per
session and pinned by two tests (NVA-BUDGETROOT-1). Under exactly the host or
runner variation the visibility fix exists for — a payload carrying
`agent_type` without a usable `agent_id` — the condition is systematic rather
than sporadic: every tool call of every dispatch would append a record.

**An inconsistency the implementing dispatch disclosed about itself.**
`agent_id: null` is classified as a present-but-invalid key and recorded, while
the same file's `subagentIdentity()` treats `transcript_path: null` as
legitimate absence (NVA-CF-NULLTID). Defensible, because the measured
orchestrator payload carries no `agent_id` key at all and a null-valued one is
unmeasured. But if a host is ever measured emitting it routinely, it lands in
the unbounded sink above.

## Triggering situation

The visibility fix (`0903b5d5`, `1c03ab9c`) closed a major finding: an
unattributable payload was silently exempt from the budget and left no record.
Round 2 passed it and reported these two residues; the reworking dispatch had
already disclosed the third. None of them changes what the guard allows or
refuses.

## Affected artifact

- `plugins/pipeline-core/hooks/guard-dispatch-budget.mjs` — the dead branch
  around line 517, the sink at 363–373 reached via 510–515, the bounded
  sibling at 503–508, and the reason ladder around 464–484.
- `plugins/pipeline-core/hooks/guard-dispatch-budget.test.mjs` — where a bound,
  once added, needs pinning the way NVA-BUDGETROOT-1 pins the sibling.

## Proposal

Take them together in one small package, because they are one seam and each
alone is too small to brief.

Remove the dead branch, or make it reachable if the class it describes is
still wanted — but do not leave a documented posture the code cannot deliver.
Removing it means retiring a named invariant, so say so explicitly in the
commit rather than letting it vanish.

Give the unresolved sink the same bound its sibling has, and pin the bound in a
test. One record per session per reason carries the same diagnostic value as
one per call and cannot grow without limit.

Then decide the `agent_id: null` case deliberately: either it is legitimate
absence, like a null transcript path, or it is an invalid key. Whichever it is,
one sentence in the guard's own doc block should say which, so the next reader
does not have to derive it from two functions that disagree.

**Related, from the same round and left open on purpose:** the protected
test-path entry for the pipeline-state suite matches
`harness/scripts/pipeline-state.test.mjs` while the suite that guards the close
writer lives at `plugins/pipeline-core/scripts/pipeline-state.test.mjs`
(round-1 F2). And the close-collision fix has no pre-fix red artifact, only the
post-fix green one (round-1 F3). Both are recorded in the same findings
registry.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
