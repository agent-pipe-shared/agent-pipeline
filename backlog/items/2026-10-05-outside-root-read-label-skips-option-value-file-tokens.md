---
schema: pipeline.backlog-item.v1
id: pipeline.outside-root-read-label-skips-option-value-file-tokens
type: defect
owner: pipeline
status: open
created: 2026-10-05
source: "Round-2/3 review of the read-target fixes in the signed bundle commit 866be2139, left over from finding F-2; Alfred session 2026-10-05."
sprint: alfred
done_when: manual
---

# Outside-root read label does not verify option-value file tokens

## Description

The outside-root read label does not verify the value tokens of
`rg --ignore-file` and `grep --exclude-from` as read targets. This is left over
from finding F-2: when the F-2 fix excluded pattern tokens and option-value
tokens from read-target classification, these two options, whose values are
real file reads, fell out of the check with them.

## Proposal

Decide which option values are real file reads (at least `rg --ignore-file`
and `grep --exclude-from`), classify them as read targets, and add a test for
each.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
