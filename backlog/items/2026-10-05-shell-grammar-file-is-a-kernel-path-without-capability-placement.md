---
schema: pipeline.backlog-item.v1
id: pipeline.shell-grammar-file-is-a-kernel-path-without-capability-placement
type: defect
owner: pipeline
status: open
created: 2026-10-05
source: "RGGRAM, split out of the read-fix bundle (signed bundle commit 866be2139); Alfred session 2026-10-05."
sprint: alfred
done_when: manual
---

# The shell-grammar file is a kernel path without a capability placement

## Description

RGGRAM: the shell-grammar file is itself a kernel path, needs a capability
placement, and has a fixture issue. It was split out of the read-fix bundle
(commit `866be2139`) and not fixed there.

## Proposal

Give the shell-grammar file a capability placement and resolve its fixture
issue, as its own work item separate from the read-target fixes.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
