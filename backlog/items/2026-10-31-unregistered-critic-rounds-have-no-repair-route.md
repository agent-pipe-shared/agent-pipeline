---
schema: pipeline.backlog-item.v1
id: pipeline.unregistered-critic-rounds-have-no-repair-route
type: defect
owner: pipeline
status: open
done_when: manual
release: 0.7.1
created: 2026-10-31
sprint: alfred
source: "Toolbox finding N37 (2026-10-31): a multi-round Critic course whose rounds 2-4 were finalized before candidate 15's automatic lineage."
---

# A Critic course whose later rounds were never registered cannot be repaired afterwards

## What happened

A feature ran four Critic rounds. Its manifest (`lifecycle.json`) holds exactly one critic-lineage entry (round 1). The exported receipt
directories for rounds 2-4 exist under `evidence/critic/`, but neither a lineage file nor a manifest entry was ever written for them, so both were
missing. A later `register-feature-package --add-review-lineage` refuses with FPR-LINEAGE-TRANSPORT / CCA-TRANSPORT-SOURCE-DRIFT and writes
nothing.

## Cause

Before the D223 slice 1 change the lineage was a manual step after each round. Candidate 15 writes it when the round finishes and guards the
commit path (CRL-LINEAGE-UNREGISTERED), so no new course reaches this state. A course already in this state has no route back.

## Needed

A repair route for an existing course: derive the missing lineage entries from the exported receipts, verify each against the packet digests,
and register them, or refuse with a typed reason that names what is missing. The refusal text should say why the transport check fails
(source drift against which bytes) instead of only naming the code. Out of scope for candidate 15.
