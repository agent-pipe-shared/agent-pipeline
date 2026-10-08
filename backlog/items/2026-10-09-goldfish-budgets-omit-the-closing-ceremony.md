---
schema: pipeline.backlog-item.v1
id: pipeline.goldfish-budgets-omit-the-closing-ceremony
type: workflow-improvement
owner: pipeline
status: open
created: 2026-10-09
source: "toil log 2026-10-06-07, row T86"
sprint: alfred
done_when: manual
due: 2026-10-31
---

# Goldfish budgets omit the closing ceremony

## Description

Goldfish tool budgets are sized for the edit, not for the closing ceremony (evidence capture, consumer-safe check,
commit, dispatch record). A mid-run budget extension via message is correctly refused: only a fresh briefing changes
the budget.

## Triggering situation

Toil row T86 (2026-10-08 late): R4-S1b (15), R5-F3b (15), R5-F4 (35) and TOILRES-D2 (45) all stopped after the content
work with evidence capture, commit and record undone. Slow WSL suites were pushed to the background and then polled
(R5-F4: about 8 calls of polling). A `git commit` hitting a parallel `index.lock` cost the last call. Cost: 4
continuation dispatches.

## Affected artifact

The Goldfish dispatch template and the commit producer.

## Proposal

The dispatch template adds a fixed closing allowance (capture + consumer-safe + commit + record, about 6 calls) on top
of the work budget. Long suites run in the foreground with a long timeout, never background plus poll. The commit
producer retries `index.lock` once internally.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
