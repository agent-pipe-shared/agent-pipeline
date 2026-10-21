---
schema: pipeline.backlog-item.v1
id: pipeline.a-divergent-adr-body-is-invisible-to-the-parity-comparison-while-unadopted
type: defect
owner: pipeline
status: open
created: 2026-10-21
source: "PO decision D81 (2026-10-21, K3 c): file an item, no 0.7.0 change"
sprint: none
done_when: manual
---

# A divergent ADR body is invisible to the parity comparison while unadopted

## Description

In the advisory projection of `inspectEffectiveArchitectureDecisions`
(`lib/architecture-effective-decisions.mjs`), accepted ADRs the retained
aggregate-design authority does not list are filtered out of `decisions`, so
their digests do not reach `compareEffectiveArchitectureDecisions` (AC-19
parity). Two runner sessions that read different ADR bodies for the same
unadopted record therefore compare as equal until the project adopts it.

The gap only exists for repositories that have not adopted their ADRs. It puts
no candidate at risk; the PO decided (D81, K3 c) to track it instead of
changing the projector in 0.7.0.

## Acceptance

- The advisory projection keeps a bounded, digest-only record of each
  unadopted accepted ADR (id, path, digest), without making it effective.
- The parity comparison reports a divergence between two projections whose
  unadopted ADR digests differ.
- A RED pin for the divergent-body case exists before the change (QG-04/QG-07).
