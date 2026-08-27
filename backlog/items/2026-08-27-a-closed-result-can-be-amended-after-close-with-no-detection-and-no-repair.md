---
schema: pipeline.backlog-item.v1
id: pipeline.a-closed-result-can-be-amended-after-close-with-no-detection-and-no-repair
type: defect
owner: pipeline
status: open
created: 2026-08-27
sprint: alfred
source: "Hit live, 2026-08-27, in the Alfred clone: the sprint-nova-epic discard exposed a 2026-07-31 post-close amendment to the 0.4.7-hotfix Result that had been invisible for four weeks. Full incident narrative: scratch/incident-report.md of that session; durable facts restated here in full."
---

# A closed Result can be amended after close; nothing detects it until an unrelated lifecycle transition, and then no bounded repair exists

## What happened, measured

`closedFeatures[2]` (`agent-pipeline-0.4.7-hotfix`, closed 2026-07-31T12:06Z)
pins its Result at `d2367448…`. Commit `d545ae4a` (2026-07-31 22:25, Phoenix
line — ten hours AFTER the close) appended a three-line amendment to that same
`specs/2026-07-27-agent-pipeline-0.4.7-hotfix/result.md` (owner + review date
for the deferred worker-pool gap in #21). The 2026-08-26 Phoenix merge carried
the amended file onto this branch while the state kept the pre-amendment pin.

For four weeks nothing noticed, because the continuity classifier's ACTIVE
branch never hash-checks `closedFeatures` bindings. The moment
`discard-feature` removed the active feature (2026-08-27), the inactive branch
(`validDiscardedTransitionState` → `validateClosedArtifact`,
`plugins/pipeline-core/lib/onboarding-continuity.mjs:2153`) validated every
closed entry, found the mismatch, and classified continuity as `damaged`.

At that point no sanctioned route existed:

- `closedFeatures` is append-only; no writer amends an entry
  (`plugins/pipeline-core/scripts/pipeline-state.mjs:8221`).
- `continuity-result-rebind` requires an ACTIVE continuity, which the discard
  had just removed.
- `project-onboarding-v3 plan-repair` answered honestly:
  `continuity_repair_unavailable` — "damaged continuity has no bounded
  automatic repair".

Recovery required the PO restoring the closed bytes by hand
(`git checkout d545ae4a^ -- <result.md>`), verified against the pin.

## Three separable defects in one incident

1. **Write-time:** nothing prevents or flags an edit to a Result bound in a
   `closedFeatures` entry. The lifecycle.json artifact class for a Result says
   `mutability: append-only` — but nothing enforces even that, and the state
   pin means append-only is still drift.
2. **Detection-time:** the binding is checked only on the state-shape branch
   that happens to read it — an active feature masks the drift indefinitely.
   Detection at the merge (or at the write) would have cost minutes; detection
   at the discard cost a blocked session and a hand repair.
3. **Repair-time:** when detected, the only offered plan is
   `repair-unavailable`. A typed "restore the pinned bytes from history /
   re-pin to the amended bytes with PO authority" recovery does not exist.

## Why this is Alfred material

This is control integrity in its purest form: closure evidence is the thing a
later session trusts INSTEAD of re-verifying, and it is silently mutable.
GitHub issue #102 protects APPROVED design authority from implementation-time
writes; this is the same protection owed to CLOSED evidence — the same shape
one lifecycle stage later. Any Alfred protected-surface baseline (#101) should
count closed-evidence bindings among its protected surfaces.

## Affected artifact

- `plugins/pipeline-core/lib/onboarding-continuity.mjs`
  (`validateClosedArtifact` and the classifier branches that do/do not call it)
- `plugins/pipeline-core/scripts/pipeline-state.mjs` (`closedFeatures`
  append-only writers; absence of any re-pin/repair verb)
- `specs/*/result.md` + `specs/*/lifecycle.json` (`mutability` claims with no
  enforcement)

## Proposal

Not designed here; direction constraints from the incident:

1. Closed-evidence paths belong on the protected-surface baseline the moment
   their entry lands (write-time, not classification-time).
2. Every state-shape branch that reads `closedFeatures` should verify bindings
   identically — a mask that depends on which feature is active is not a
   detection policy.
3. A typed, PO-gated repair for a detected drift: restore-from-history or
   re-pin-with-authority, both leaving an audit record. "No bounded repair"
   converts a three-line prose amendment into a session-blocking incident.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
