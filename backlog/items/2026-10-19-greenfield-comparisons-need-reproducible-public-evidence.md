---
schema: pipeline.backlog-item.v1
id: pipeline.greenfield-comparisons-need-reproducible-public-evidence
type: improvement
owner: pipeline
status: open
created: 2026-10-19
source: "PO decision D21 (2026-10-18): moves after 0.7.0; the Alfred inventory had no public original for this item (AC-190)"
sprint: none
done_when: manual
---

# Greenfield comparisons need reproducible public evidence

## Description

Greenfield runs across runners (Claude, Codex, Antigravity) are compared from private notes
and session reports. A reader of the public repository cannot reproduce or check those
comparisons. The Alfred inventory listed this item (AC-190) but found no public original for
it. PO decision D21 moved it after 0.7.0; this file is its public home.

## Triggering situation

A release or retro that claims one runner's greenfield course is faster, cheaper or more
reliable than another's.

## Proposal

Publish each compared greenfield run as sanitised, counted evidence (runner, Pipeline version,
phases reached, measured durations, refusals and their codes), and make comparisons cite only
such evidence.

## Acceptance

- A comparison between greenfield runs cites public evidence files only.
- Each evidence file names the Pipeline version, the runner and the measured values, and
  contains no private identifiers or machine paths.
- AC-190 of the Alfred epic is recorded as deferred by D21, not delivered.
