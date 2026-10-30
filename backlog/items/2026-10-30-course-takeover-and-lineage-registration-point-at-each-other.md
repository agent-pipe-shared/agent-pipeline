---
schema: pipeline.backlog-item.v1
id: pipeline.course-takeover-and-lineage-registration-point-at-each-other
type: defect
owner: pipeline
status: open
created: 2026-10-30
sprint: alfred
priority: P0
release: 0.7.0
source: "Consumer report relayed by the PO 2026-10-30 (installed 0.7.0 candidate, after the hook refresh)"
done_when: manual
---

# The course takeover and the lineage registration point at each other

## Evidence (consumer report)

1. Critic admission refuses with `CGB-BUDGET`: round 2 is reserved for the old packet, the new packet carries
   other digests. Its repair says to finish the old packet, i.e. register the lineage of round 2.
2. `register-feature-package.mjs --add-review-lineage` refuses with `FPR-LINEAGE-TRANSPORT`, because a commit
   (the consumer's own backlog commit) already follows the round candidate. Its repair says to retire the old
   batch with `inspect-course-takeover` and `supersede-course-takeover`.
3. The takeover refuses with `CGB-TAKEOVER-COURSE` (same course key). Its repair says to register the lineage
   before the next correction commit, i.e. step 2.

Steps 2 and 3 name each other and both refuse; there is no route out without a Pipeline change.

## Source reading (2026-10-30, branch head b6c7d3f2c)

- `plugins/pipeline-core/lib/feature-package-registration.mjs` lines 529 and 562: both `FPR-LINEAGE-TRANSPORT`
  texts send the operator to the takeover verbs.
- `plugins/pipeline-core/lib/critic-generic-batch.mjs` line 786: `takeoverState` refuses every batch whose origin
  is the same course key, before any consumed or history check; `TAKEOVER_REPAIR["CGB-TAKEOVER-COURSE"]` (line
  743) sends the operator back to the registration. The c19 patch (PF-94) only opened the takeover for an
  EARLIER course key; the same-key case stayed closed.
- No held patch and no other item addresses the same-key case.

## Wanted

- A same-key round whose packets are all consumed and whose lineage can no longer be registered (a commit
  follows the round candidate) is admissible for the takeover: retire that round's batch (audited, nothing
  deleted) and rerun the round on the course path. The PO accepted a rerun of a Critic round as the price
  (PF-94 decision).
- Rounds whose lineage is already registered stay; only the unregistrable round is retired.
- Every refusal text in the three steps names a route that admits; a test walks the consumer's sequence end to
  end and asserts that it terminates.

## Open facts

The consumer's `inspect-course-takeover` output (packet ids, `allPacketsConsumed`, `courseHistoryRegistered`)
is not yet in hand; it decides whether round 1 has registered history.
