---
schema: pipeline.backlog-item.v1
id: pipeline.the-opus-critic-admission-needs-a-word-the-template-does-not-carry
type: defect
owner: pipeline
status: open
created: 2026-10-20
source: "Ordinal-2 Critic dispatch, 2026-10-20: a template-faithful fill was refused with DISPATCH-OPUS-NO-BATCH-RATIONALE"
sprint: none
done_when: manual
---

# The Opus Critic admission needs a word the template does not carry

## Description

`lib/dispatch-policy.mjs` (`DISPATCH-OPUS-NO-BATCH-RATIONALE`, near line 299) admits a
design-tier Critic only when one prompt line contains the word `rationale` or `justification`
together with `critical` and `architecture` or `security`. The `Criticality → model (MP-07)`
example in `templates/prompts/critic-review.md` names "genuinely critical architecture or security
change" but contains neither word. So a briefing filled faithfully from the template is refused.
The dispatcher then has to add the word, which is a freehand edit of a template-built briefing.

## Acceptance

- A briefing filled from the template's own example passes the Opus admission, or the template
  names the exact phrase the guard checks. A test covers the template example.
