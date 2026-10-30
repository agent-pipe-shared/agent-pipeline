---
schema: pipeline.backlog-item.v1
id: pipeline.follow-up-round-lineage-fails-in-session-mode
type: defect
owner: pipeline
status: open
created: 2026-10-30
priority: P1
release: 0.7.0
sprint: alfred
source: "Consumer handover 2026-10-30 (finding N20, not retested on c23df26); PO 2026-10-30: major, into candidate 11"
done_when: manual
---

# Follow-up round lineage fails in session mode

## Evidence

`register-feature-package.mjs --add-review-lineage --packet <round 3>` refused with `FPR-LINEAGE-COMPILE`,
`compileCode: CRL-HISTORY-CHAIN`. The repair text recommended exactly what had been done (round superseded,
run as a delta from the last registered round). `CRL-HISTORY-CHAIN` comes from
`lib/critic-review-lineage-core.mjs` `transitionCode(parent, current)` when the parent link or record digest
differs, the review ID repeats, `lane.freshFromReviewId` differs from the parent, or `lane.laneId` or
`lane.contextSha256` equals the parent's.

Consumer hypothesis (unverified): every round ran in one Elephant session with the
`session-functional-equivalent` adapter and `finalize --allow-caller-authored-fallback`; round 1 had no parent,
so `transitionCode` never ran. If lane ID and context digest are constant in one session, a follow-up round in
session mode can never be registered. The gate passed only because it read the rounds from the private
lifecycle store, not from the registration.

## Wanted

1. Reproduce: two rounds in session mode, the second as a delta with a parent; find which condition fires and
   where `input.lane` is built.
2. Fix at the source: a follow-up round gets its own lane and context digest, or the independence rule is
   checked in the way that fits that adapter. The decision and its reason go into the notes.
3. `CRL-HISTORY-CHAIN` names the condition that failed.
4. Test: the two-round session-mode chain registers both rounds; each failing condition is pinned once.
