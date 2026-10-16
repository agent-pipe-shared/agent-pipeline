---
schema: pipeline.backlog-item.v1
id: pipeline.architecture-deferral-records-no-net-new-baseline
type: workflow-improvement
owner: pipeline
status: open
created: 2026-10-16
source: "PO decision #14, 2026-10-16 (AC-119): recording the net-new baseline commit in the architecture deferral record is a backlog item after 0.7.0."
sprint: none
done_when: manual
---

# Architecture deferral record does not carry the net-new baseline commit

## Description

An architecture adoption deferral is recorded without the commit that marks the
net-new baseline. Without it, a later reader cannot tell which code existed at
the time of the deferral and which is net-new since. The PO decided on
2026-10-16 (acceptance criterion AC-119) that recording this baseline commit in
the deferral record follows after 0.7.0.

## Proposal

Extend the architecture deferral record with a baseline commit field, written
when the deferral is recorded, and have the readiness projection read it to
separate pre-deferral findings from net-new ones.

## Acceptance

- When an architecture deferral is recorded, the record shall include the baseline commit at that moment.
- If a deferral record lacks the baseline commit, then the readiness projection shall report the baseline as unrecorded and shall not guess one.
- When the readiness projection reads a deferral with a baseline commit, it shall distinguish findings present at that commit from net-new findings.

## Open questions for the PO

- Whether deferral records created before this change get a back-filled baseline or stay unrecorded is not covered by the decision.

Source: PO decision #14, 2026-10-16 (AC-119)
