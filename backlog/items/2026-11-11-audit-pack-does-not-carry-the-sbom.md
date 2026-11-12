---
schema: pipeline.backlog-item.v1
id: pipeline.audit-pack-does-not-carry-the-sbom
type: workflow-improvement
owner: pipeline
status: open
created: 2026-11-11
source: Candidate 28c design; ADR-0091 wires the SBOM into the feature close and its audit bundle only
sprint: alfred
done_when: manual
---

# The portable audit pack does not carry the SBOM record

## Description

Since candidate 28c the feature close writes `specs/<feature>/evidence/sbom/` and the audit bundle (`audit-bundle.mjs`) carries the record and both documents, re-checked by the offline verifier. The separate portable auditor pack (`audit-pack.mjs`) has a closed key set and a closed list of source kinds, and names no SBOM, so a pack built from a closed feature leaves it out. The pack is a different artifact with its own schema, so extending it was not folded into the close change.

## Done when

`planAuditPack` accepts the feature's SBOM record as one more source kind with its two documents, the pack manifest and verifier bind them by digest, a missing or damaged one is a typed finding, and a test builds and verifies a pack that carries it.
