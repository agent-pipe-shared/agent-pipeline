---
schema: pipeline.backlog-item.v1
id: pipeline.residual-acceptance-has-no-printed-ceremony
type: workflow-improvement
owner: pipeline
status: open
created: 2026-11-10
source: Greenfield transcript finding F33; PO tile 2026-11-10 places it after 0.7.0
sprint: alfred
done_when: manual
---

# The residual acceptance has no printed, chain-tested ceremony

## Description

A run that accepts remaining minor findings has to put the acceptance command together from its usage text. Candidate 24 added the usage form and a clearer wording, but no step prints the exact command for the open round, and no test runs that route from the refusal through the acceptance to the next gate.

## Decision

PO tile 2026-11-10: after 0.7.0. It is not part of the 0.7.0 scope. Since candidate 25 a round holding only minor findings counts as passed, so this route is needed less often.

## Done when

The refusal or the course report prints the exact acceptance command for the open round, and a chain test runs it through to the next gate.
