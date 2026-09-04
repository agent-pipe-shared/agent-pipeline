---
schema: pipeline.backlog-item.v1
id: pipeline.a-critic-has-no-writable-location-for-its-own-report
type: defect
owner: pipeline
status: closed
closed_at: 2026-09-04
closure_repository: self
closure_commit: b72e22b2cccfb49a9d4b74131b7b3f55518befca
closure_evidence: backlog/evidence/2026-09-04-nva-b-criticwrite-1-closure-verification.md
created: 2026-09-01
sprint: nova-b
done_when: manual
source: "Reported independently by both Critic rounds dispatched 2026-09-01 (NVA-CR-D and NVA-CR-E). Each disclosed under CR-06-D that report persistence was unavailable and emitted its findings directly instead."
---

# A Critic has no writable location for its own report, so review findings exist only in a task notification

## What both rounds reported

Two Critic dispatches on 2026-09-01 independently hit the same wall and disclosed
it in the same terms:

- The session scratchpad lies outside the repository. Writing there is refused by
  `guard-lifecycle-ready.mjs` with `GUARD-CROSS-REPO-MUTATION` — "a governed
  consumer session may write only inside its own physical project root".
- Writing inside the repository is a state change the read-only Critic role
  forbids.
- No admitted shell shape writes file content: redirects are
  `GUARD-REDIRECT-UNAPPROVED`, and `echo` reaches stdout only.
- The role holds no write tool.

Both fell back to CR-06-D and emitted the report directly. One of them created an
empty directory inside the repository before establishing it could not write into
it, and disclosed that too.

## Why this is a durability defect and not an inconvenience

Every constraint above is individually correct. The Critic SHOULD be read-only;
the containment guard SHOULD refuse writes outside the project root. The
composition is what fails: there is no location that is simultaneously inside the
project root, writable by a read-only role, and not a tracked state change.

The consequence is that a review's findings exist only in the dispatch's return
message. If the orchestrating session compacts, crashes, or simply moves on
without transcribing them, evidence-gated findings that cost a
higher-capability-model round are gone. On 2026-09-01 both rounds' findings
survived only because the Elephant hand-wrote them into
`scratch/findings-registry-round-D.md` and `-E.md` afterwards — a manual step with
no mechanism behind it, performed under time pressure, and gitignored at that.

This matters more than an ordinary lost artifact because the review system's whole
premise is that findings are durable and auditable. `ADR-0014`'s Critic contract
and the QG-13 cycle cap both assume a findings record exists to re-review against.

## Directions, none pre-selected

1. Grant the Critic a single narrow write capability scoped to one review-output
   path, accepting a bounded exception to role read-onlyness.
2. Have the guard admit the session scratchpad for this role, so the write lands
   outside the repository as originally designed.
3. Make the orchestrator's transcription an enforced step rather than a habit —
   the dispatch is not complete until the findings registry exists at a named
   path. Cheapest, and it keeps both existing constraints intact, but it moves
   the durability guarantee onto the party with the least incentive to honour it.

## Second, smaller finding from the same rounds

Both Critics were supplied the implementor's dispatch record as authorship
evidence, and both had to read the implementor's completion-report prose in its
`report` field to reach it. Both disclosed this and re-derived every technical
claim from source instead, which is the contract working — but the exposure is
avoidable. A dispatch could supply the record with `report` elided, so the
authorship chain is available without the narrative the fail-closed boundary
otherwise excludes.

## Closure

Closed 2026-09-04 against `b72e22b2` (NVA-B-CRITICWRITE-1). Verification is in
`backlog/evidence/2026-09-04-nva-b-criticwrite-1-closure-verification.md`,
including an independent re-run of the write probe, not just acceptance of the
dispatch's own claim.

Direction chosen: document the proven `node -e` write shape in `roles/critic.md`
CR-06-D §5.5, rather than widening a guard admission or granting a new write
capability — the cheapest of the item's three named directions that actually
closes the gap, since the authorization already existed and only a working
command shape was missing.

The second, smaller finding above is **not closed by this** and is not
duplicated: it is the same defect as
`backlog/items/2026-09-04-a-dispatch-record-carries-implementor-prose-into-a-critic-that-must-not-read-it.md`,
which stays open.
