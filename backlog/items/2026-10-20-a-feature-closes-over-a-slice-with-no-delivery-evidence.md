---
schema: pipeline.backlog-item.v1
id: pipeline.a-feature-closes-over-a-slice-with-no-delivery-evidence
type: defect
owner: pipeline
status: open
created: 2026-10-20
source: "Elephant observation while building D27/D55 (Q1), 2026-10-20: the close route's authorship classification names slices with neither a dispatch record nor commit evidence, and does not gate them"
sprint: none
done_when: manual
---

# A feature closes over a slice with no delivery evidence

## Description

`feature-close-prepared` classifies each delivery-course slice by the record that carries its
authorship (`lib/close-authorship-record.mjs`): a dispatch record, a `Dispatch: <slice>
(goldfish)` commit, or neither. A slice with neither is not gated, because a held, deferred or
blocked slice legitimately has nothing behind it. A `ready` slice with neither, however, is work
the course still names as deliverable, and the feature can be closed over it without any
refusal or report.

## Status

2026-10-20, after the ordinal-2 Critic (F-D): the `feature-close-prepared` plan now reports the
classification as `courseAuthorship`, so an `unrecorded` slice is named, no longer passed silently.
Whether a `ready` one refuses the close is still open.

## Acceptance

- The close names each `ready` slice with no delivery evidence, and either refuses until it is
  delivered, cancelled or deferred, or records it as an explicit open item of the Result. Which
  of the two is a PO decision.
