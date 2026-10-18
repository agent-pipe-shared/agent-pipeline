---
schema: pipeline.backlog-item.v1
id: pipeline.fitness-denial-names-no-finding-and-inspect-recommends-the-refused-transition
type: defect
owner: pipeline
status: open
created: 2026-10-18
source: "real greenfield project report 2026-10-18 (unnumbered finding from the same run)"
sprint: none
done_when: manual
---

# The fitness denial names no finding, and `inspect` recommends the refused transition

## Description

`GUARD-ARCHITECTURE-FITNESS-NON-GREEN` names only remedy ids
(`verification-locality:localize-contract`, `navigation-currency:restore-navigation-bundle`),
with no finding, path or evidence location. `project-onboarding-v3.mjs inspect` and
`pipeline-state inspect` both return `set-phase --phase implementation` as `nextAction` even
though the guard refuses exactly that, and neither shows the fitness findings. The PO needed a
separate manual diagnosis.

## Triggering situation

`set-phase --phase implementation` after materialization in a real greenfield project. The
navigation-currency cause in that run was fixed by commit f1b458978.

## Proposal

Include the failing findings (check, path, evidence location) in the denial, and make both
`inspect` commands either surface the fitness result or stop recommending a transition the
guard will refuse.

## Acceptance

- The denial text carries at least one finding with a path per non-green check.
- `inspect` does not return `set-phase --phase implementation` as `nextAction` while fitness
  is non-green, and shows the findings.
- Tests pin both behaviors.
