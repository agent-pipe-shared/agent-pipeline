---
schema: pipeline.backlog-item.v1
id: pipeline.critic-course-lineage-files-stop-every-delta-round-on-a-briefing-violation
type: defect
owner: pipeline
status: open
created: 2026-10-29
priority: P1
release: 0.7.0
sprint: alfred
source: "Glossover consumer handover PF-98, relayed by the PO 2026-10-29"
done_when: manual
---

# The lineage and delta-request files of a Critic course stop every Delta round on a briefing violation (PF-98)

## Evidence

`RETAINED_PATTERN` in `lib/critic-correction-input-bindings.mjs` did not recognise the `critic-lineage-<sha256>.json` and `critic-delta-request-<sha256>.json` files the course registration writes beside `evidence/critic/`. The Delta range always contains them, so every Delta round's Critic dispatch stopped on a briefing violation.

## Delivered

Commit 6a9b517eb: the pattern classifies both files as retained prior results; case CCI (2b) and the lineage-aware PF94 ROUND2 cases. In the stamped candidate 0b10cc602; not installed.

## Open

Real retest in the consumer; native Windows run.
