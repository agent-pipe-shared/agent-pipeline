---
schema: pipeline.backlog-item.v1
id: pipeline.goldfish-quick-field-has-no-emitter
type: workflow-improvement
owner: pipeline
status: open
created: 2026-10-16
source: "PO decision #27, 2026-10-16: an emitter/consumer for the Goldfish briefing 'quick' field is a backlog item after 0.7.0; the template field is the 0.7.0 delivery."
sprint: none
done_when: manual
---

# The Goldfish briefing "quick" field has no emitter or consumer

## Description

The Goldfish briefing template carries a "quick" check field, delivered for
0.7.0. Nothing yet produces a value for it and nothing yet reads it: the
dispatch builder renders it as missing, so no quick PASS can exist. The PO
decided on 2026-10-16 that the emitter and consumer follow after 0.7.0.

## Proposal

Add an emitter that derives the quick check command from the declared item
checks when a bounded one exists, and a consumer that reads the field back from
the briefing and reports its result separately from the full verify. Where no
quick check is derivable, the emitter writes an explicit "missing" value.

## Acceptance

- When a briefing is built for an item with a bounded declared check, the dispatch builder shall emit that command in the quick field.
- When no bounded check is derivable, the dispatch builder shall emit an explicit missing value and shall not invent a command.
- When a Goldfish report is processed, the consumer shall read the quick field from the briefing and record its result apart from the full verify result.
- The quick result shall not substitute for the final integrated verify.

## Open questions for the PO

- None recorded.

Source: PO decision #27, 2026-10-16
