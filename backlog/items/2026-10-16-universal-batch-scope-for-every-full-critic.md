---
schema: pipeline.backlog-item.v1
id: pipeline.universal-batch-scope-for-every-full-critic
type: workflow-improvement
owner: pipeline
status: open
created: 2026-10-16
source: "PO decision #32, 2026-10-16: a universal 'batch scope required for every full Critic' duty with the needed fixture updates is a backlog item after 0.7.0; the re-critic marker goes into the Critic dispatch template now."
sprint: none
done_when: manual
---

# Batch scope required for every full Critic dispatch

## Description

Today the dispatch policy requires a non-empty batch scope only for a dispatch
that declares itself a re-critic. A full Critic dispatch is not checked for it.
The PO decided on 2026-10-16 that the batch-scope duty becomes universal for
every full Critic, which also needs updates to existing dispatch fixtures that
currently omit it. The re-critic marker itself is added to the Critic dispatch
template now and is not part of this item.

## Proposal

Extend the dispatch policy so a full Critic prompt without a non-empty
`Batch scope (MP-07)` field produces a typed finding, then update every fixture
and template path that builds a full Critic prompt so it supplies the field.

## Acceptance

- When a full Critic dispatch lacks a non-empty `Batch scope (MP-07)` field, the dispatch policy shall return a typed finding.
- When a full Critic dispatch carries a non-empty `Batch scope (MP-07)` field, the dispatch policy shall return no batch-scope finding.
- The existing fixtures that build full Critic prompts shall supply the field, with no fixture weakened to avoid the check.
- The existing re-critic checks shall keep their current results.

## Open questions for the PO

- None recorded.

Source: PO decision #32, 2026-10-16
