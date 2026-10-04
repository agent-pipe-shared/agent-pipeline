---
schema: pipeline.backlog-item.v1
id: pipeline.revised-native-design-cannot-reach-a-new-advisor-course
type: defect
owner: pipeline
status: open
created: 2026-10-04
source: "Live observation, Agent-Pipeline Claude/Windows session 2026-10-03/04: the Alfred design had to be revised after a not-ready readiness verdict, and no command path led to an Advisor stage bound to the revised sources."
sprint: alfred
done_when: manual
---

# A revised Claude/Antigravity design cannot reach a new Advisor course

## Description

Findings register rows K5-7 and K3-15. After a design revision on a native runner (Claude,
Antigravity), the design course cannot produce an Advisor stage for the revised sources:

- `design-advisory-coordinator-v2.mjs` (`coordinateInitialDesignAdvisory`) opens a child course
  only when a caller passes `newCourseParentId` and `observeInitialCourseDecision`. No production
  caller does; only tests do. Every later Advisor run returns `DAC2-COURSE-ALREADY-EXISTS`.
- The existing terminal course stays bound to the old authoring dispatch and the old
  `design-input.md` digest. `design-course-session.mjs` then refuses the preparation with
  `DESIGN-COURSE-INITIAL-CONTEXT-BINDING`.
- The unavailable-path revision chain (`design-workflow-package-v2.mjs:45-56`) requires every
  revision to keep `design-input.md` byte-identical and to be a direct child commit of the previous
  candidate. A revision that records new PO input in `design-input.md` can never be chained.
- Archiving the old course is not a recovery: the course store resolves the current course
  through `index-NNNN` files, so a moved course directory yields `DACS-CORRUPT`.
- K3-15: after a crash between course creation and artifact export, a re-run returned the terminal
  course without re-exporting (fixed on the installed copy by operator hotfix 4).

Operator hotfix 8 (`scratch/hotfix-child-course/`, installed copy only) lets the native Advisor
producer open a child course when the current terminal course belongs to a different authoring
dispatch. The decision is derived from the continuity registration of the new authoring dispatch.

## Acceptance

- Spec §21.5 R5-6/R5-8: one design revision after an Advisor or readiness finding is one emitted
  step that rebinds the sources, needs zero PO interactions and zero overrides, and does not loop.
- A native-runner revision opens a child course whose decision is bound to the registered
  authoring dispatch; reusing a decision reference is refused.
- An interrupted export re-run yields byte-identical artifacts; a second re-run is a no-op (R4-7).

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
