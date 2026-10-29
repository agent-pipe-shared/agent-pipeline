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

- **Decision:** D125 (PO tiles, 2026-10-22): ADR-0085 supersedes the Advisor-plus-readiness design course for this item.
- **Rationale:** the acceptance named a child Advisor course that ADR-0085 (one review, one signature) retired, so the acceptance is restated against the single-review route instead of being built on the retired course.
- **Assignment (if accepted):** none recorded by D125 beyond the restatement; the pin for a single-step revision on the present-plan review-receipt route is not located yet.
- **Date:** 2026-10-23

### Blocker analysis 2026-10-22

Read-only survey of the open clauses that the delivery remeasure assigned to native-host, verify-wsl, po-decision or po-signature (evidence: `specs/sprint-alfred-epic/evidence/blocker-analysis-2026-10-22/`). Status key: LINUX-RUN and WINDOWS-INTEROP-RUN are runs an agent can do from the WSL host; HOST-SESSION-NEEDED, PO-DECISION and PO-SIGNATURE are not agent work.

- **PO-DECISION** (decided: D125) — Decide whether acceptance bullet 1 is superseded by the ADR-0085 retirement or must be re-targeted to the present-plan review-receipt route
  Item acceptance bullet 1 (Spec 21.5 R5-6/R5-8, one revision step rebinding sources) refers to an Advisor-course route that ADR-0085 may have retired; only the PO can say whether the bullet is dead or moves.

## Reconciled 2026-10-23

Text sweep K60-BACKLOG-TEXT-SWEEP-4. The Description, Acceptance and Blocker analysis above stay as history; these
sentences are superseded:

- Blocker analysis "Decide whether acceptance bullet 1 is superseded ... or must be re-targeted" (open question): decided.
  D125 (2026-10-22, `specs/sprint-alfred-epic/plans/po-decisions-2026-10-18.md`): ADR-0085
  (`docs/adr/0085-one-review-one-signature-design-approval.md`) supersedes the Advisor-plus-readiness design course for
  this item, and its acceptance is restated against the single-review route; fallback evidence goes to the present-plan
  review-receipt route. Telemetry stays deferred (D121).
- Acceptance bullets 1 to 3 (a design revision rebinds the sources in one step; a native revision opens a child Advisor
  course bound to the registered authoring dispatch; an interrupted export re-run is byte-identical) and the Description
  bullets about `coordinateInitialDesignAdvisory`, `DAC2-COURSE-ALREADY-EXISTS` and `DESIGN-COURSE-INITIAL-CONTEXT-BINDING`
  describe the Advisor course that D125 retires for this item. They are not the acceptance to build against any more.
  Correction 2026-10-29: the pin for a single-step revision with zero PO interactions and zero overrides on the
  replacement route is committed (`b02abaa78`): case `(v)` in
  `plugins/pipeline-core/lib/pins/revised-native-design-cannot-reach-a-new-advisor-course.test.mjs`, with the real-guard
  walk `A10` in `plugins/pipeline-core/lib/pins/design-course-run-v2-refuses-its-own-documented-routes.test.mjs`. The
  earlier sentence that it was not written yet is stale.
- The empty Triage block: filled above from D125.
