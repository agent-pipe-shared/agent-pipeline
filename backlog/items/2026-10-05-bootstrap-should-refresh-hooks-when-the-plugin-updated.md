---
schema: pipeline.backlog-item.v1
id: pipeline.bootstrap-should-refresh-hooks-when-the-plugin-updated
type: defect
owner: pipeline
status: open
created: 2026-10-05
source: "PO statement 2026-10-05 (Alfred session), deferred from round 3 of the signed bundle commit 866be2139."
sprint: alfred
done_when: manual
---

# Bootstrap should refresh hooks when the plugin updated

## Description

The PO's position (verbatim, German): "das installieren der hooks sollte aber
eigentlich der agent im bootstrap machen wenn es updates gibt". In English:
installing the hooks should be done by the agent during bootstrap whenever
there are updates, not by the PO. There is also no agent-operable install
route overall.

## Proposal

- Bootstrap detects that the plugin updated and refreshes the installed hooks
  itself.
- Provide an agent-operable install route overall.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
