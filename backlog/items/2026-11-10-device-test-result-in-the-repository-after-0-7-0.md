---
schema: pipeline.backlog-item.v1
id: pipeline.device-test-result-in-the-repository-after-0-7-0
type: workflow-improvement
owner: pipeline
status: open
created: 2026-11-10
source: Claude greenfield report, section 6.2; PO tile 2026-11-10 places it after 0.7.0
sprint: alfred
done_when: manual
---

# A real device test is recorded only as a chat answer

## Description

The acceptance record holds the open check and the literal answer of the human. A real device test has no structured result in the repository: device, version, steps, outcome.

## Decision

PO tile 2026-11-10: after 0.7.0.

## Done when

The PO decides what a device test records and where, and that decision is carried out.
