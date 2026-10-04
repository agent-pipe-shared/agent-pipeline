---
schema: pipeline.backlog-item.v1
id: pipeline.design-course-run-v2-refuses-its-own-documented-routes
type: defect
owner: pipeline
status: open
created: 2026-10-04
source: "Live observation, Agent-Pipeline Claude/Windows session 2026-10-03/04 while walking the Alfred design course; confirmed in source."
sprint: alfred
done_when: manual
---

# `design-course-session --run-v2` refuses its own documented routes

## Description

Findings register rows K5-8, K5-9, K5-11 and K3-16, plus the dispatch-supersede gap found on the
revision path:

- K5-9: without `--advisor-result`, `--run-v2` refuses `DESIGN-COURSE-OUTPUT-COLLISION` whenever the
  preparation, receipt or package path starts with `<output-prefix>.`
  (`design-course-session.mjs:561-563`). The guard admits only exactly those prefixed paths
  (`guard-lifecycle-ready.mjs:5196-5199`), so the simpler documented route can never run.
- K5-8: the Claude route requires an agent-authored exception rationale under `evidence/`. In
  `awaiting-approval` the dev-plan gate refuses that write, so only the PO can place it.
- K5-11: a readiness failure after preparation leaves `<prefix>.preparation.json` behind. The next
  run refuses `DESIGN-COURSE-PREPARATION-EXISTS`; there is no resume.
- K3-16: the Advisor host fixture cannot build its temporary repository on native Windows
  (`CRHS-INPUT`), so Advisor re-run/re-export behaviour is untestable there.
- Revision path: `submit-plan` needs idle continuity (`plan-spec-state-v2.mjs:700-709`), but a
  registered stage-0 authoring dispatch can only be cleared by `integrate-final` (which leaves an
  acknowledgement that also blocks `submit-plan`) or by a generic `continuity-cas` that is not in the
  guard's sanctioned argv list and needs a signed override.

## Acceptance

- Spec §21.5 R5-6/R5-8 and §21.1 R1-1: every course step, including a revision with a new authoring
  dispatch, runs from emitted commands that the guard admits, with zero overrides. A failed stage
  resumes idempotently. The course's own evidence outputs are writable by the agent in design phases.
- The Advisor host fixture runs on native Windows (R4-8).

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
