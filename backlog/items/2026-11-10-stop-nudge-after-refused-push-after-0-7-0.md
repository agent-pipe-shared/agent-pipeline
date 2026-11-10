---
schema: pipeline.backlog-item.v1
id: pipeline.stop-nudge-after-refused-push
type: workflow-improvement
owner: pipeline
status: open
created: 2026-11-10
source: Greenfield finding F37 and the PO tile of 2026-11-10 placing it after 0.7.0
sprint: alfred
done_when: manual
---

# Stop hook nudge after a refused push (F37)

## Description

After a refused push a run can end its turn without saying that the push did not land. The PO decided on 2026-11-10 to take this up after 0.7.0.

## Scope

- At turn end, a refused push attempt that has no later successful push produces one short notice with the refusal code.
- The notice comes from the push attempt record, so the three runners share one source.

## Done when

A test covers a refused push followed by turn end, and the PO accepts the wording.
