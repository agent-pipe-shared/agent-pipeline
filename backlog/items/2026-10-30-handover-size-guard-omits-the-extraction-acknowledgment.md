---
schema: pipeline.backlog-item.v1
id: pipeline.handover-size-guard-omits-the-extraction-acknowledgment
type: defect
owner: pipeline
status: open
created: 2026-10-30
priority: P2
release: 0.7.1
sprint: alfred
source: "Consumer handover 2026-10-30 (finding N28); PO 2026-10-30: minor, filed after 0.7.0"
done_when: manual
---

# The handover size guard omits the extraction acknowledgment

## Evidence

`guard-handover-size` refuses writes to `docs/state.md` above 30000 bytes (`HANDOVER-ROTATION-REQUIRED`) and
points at `handover-rotate.mjs`, which refuses with `HANDOVER-EXTRACTION-NOT-ACKNOWLEDGED` until the section
is acknowledged (ADR-0066 Decision 7). Both are intended, but the first text does not mention the second step.

## Wanted

The size-guard text names the `--acknowledge-extraction-done` step (as deliberate review work, not a formality)
or lists which sections are already acknowledged.
