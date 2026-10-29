---
schema: pipeline.backlog-item.v1
id: pipeline.scan-exception-commits-spend-the-critic-correction-budget
type: workflow-improvement
owner: pipeline
status: open
created: 2026-10-29
priority: P2
release: 0.7.1
sprint: alfred
source: "Consumer handover (PF-99 part d), 2026-10-29; Elephant triage 2026-10-29"
done_when: manual
---

# A scan-exception commit counts as a Critic correction commit and can exhaust the course budget

## Evidence

`lib/critic-course-admission.mjs` counts every non-evidence commit after a consumed round as a correction commit, cumulatively, and refuses further review with `CCA-REVIEW-BUDGET-EXHAUSTED` once `CRITIC_DISPATCH_LIMITS.correctionCommits` (3) is reached. A commit that only adds a reviewed scanner exception (for example a `.gitleaksignore` entry) is a non-evidence commit and spends one of the three, although it changes no reviewed behaviour. The order of scan, correction budget and evidence commits is not described anywhere.

## Wanted

Either such commits do not count (a closed, typed class with its own proof), or the intended order (scan exceptions after the last review round) is documented where a consumer meets it. Design latitude, 0.7.1, PO design review first. Not a hard blocker for 0.7.0: the consumer can commit the exceptions after the last round.

## Not covered here

The gitleaks course-key exemption is done separately; the osv waiver and consumer-defined exceptions have their own items.
