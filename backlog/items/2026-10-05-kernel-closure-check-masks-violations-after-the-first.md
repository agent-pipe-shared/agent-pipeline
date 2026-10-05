---
schema: pipeline.backlog-item.v1
id: pipeline.kernel-closure-check-masks-violations-after-the-first
type: defect
owner: pipeline
status: open
created: 2026-10-05
source: "Live observation, Agent-Pipeline Claude/Windows session 2026-10-05: ratchet GMWKC01 found red and a repair prepared."
sprint: alfred
done_when: manual
---

# Kernel closure check masks violations after the first

## Description

`GMWKC01` was red since commit 1bd1d7bf6 (2026-10-03: a fourth dynamic import in
`scripts/commit-msg-hook-install.mjs` without a `DYNAMIC_IMPORT_EDGES` update). Because
the check stops at the first violation, it masked 12 further kernel-to-liftable import
edges to 9 files outside `NEVER_LIFTABLE_KERNEL_PATHS`.

Security class. Repair prepared as a signed package (kernel list +9, closure test table,
threat-model doc).

## Acceptance

- The check reports ALL violations per run, not only the first.
- A red ratchet blocks the candidate stamp.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
