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

- **Decision:** superseded in its acceptance by D125 (2026-10-22): ADR-0085 supersedes the Advisor-plus-readiness design course for this item.
- **Rationale:** D125 restates the acceptance against the single-review route (fallback evidence goes to the present-plan review-receipt route); the `--run-v2` course now refuses with the typed retirement `DESIGN-COURSE-RETIRED`, so the documented-route defects no longer describe a live path. See "Reconciled 2026-10-23".
- **Assignment (if accepted):** none for the retired course; any remaining revision-path check is judged against the single-review route.
- **Date:** 2026-10-23 (filled from D125 of 2026-10-22)

### Blocker analysis 2026-10-22

Read-only survey of the open clauses that the delivery remeasure assigned to native-host, verify-wsl, po-decision or po-signature (evidence: `specs/sprint-alfred-epic/evidence/blocker-analysis-2026-10-22/`). Status key: LINUX-RUN and WINDOWS-INTEROP-RUN are runs an agent can do from the WSL host; HOST-SESSION-NEEDED, PO-DECISION and PO-SIGNATURE are not agent work.

- **PO-DECISION** (decided: D125) — Decide whether retiring the course resolves the item (moot) or the revision path still needs a zero-override test
  Question: is the design course retired for 0.7.0 so the item is moot, or must the revision path (new authoring dispatch, resume after failed stage, Advisor fixture on Windows) still run with zero overrides?

## Reconciled 2026-10-23

Text sweep K58-BACKLOG-TEXT-SWEEP-2. Superseded sentences above, kept as history:

- Description (K5-9, K5-8, K5-11, K3-16 and the revision-path gap) and Acceptance ("every course step ... runs from
  emitted commands that the guard admits, with zero overrides"; "The Advisor host fixture runs on native Windows"): they
  read as a live `--run-v2` defect. ADR-0085 (`docs/adr/0085-one-review-one-signature-design-approval.md`) retired the
  Advisor-plus-readiness course behaviorally: `runDesignCourseV2` and the `--run-v2` CLI return the typed
  `DESIGN-COURSE-RETIRED` (`plugins/pipeline-core/lib/retired-design-codes.mjs`) before parsing, state access, dispatch
  or publication, so none of the listed refusals can occur. Evidence: the retargeted cases in
  `plugins/pipeline-core/scripts/design-course-session.test.mjs` (`deepEqual(..., RETIRED)` for the function and the CLI)
  and the sibling pins that name the same code.
- Blocker-analysis question ("is the design course retired for 0.7.0 so the item is moot, or must the revision path ...
  still run with zero overrides?"): answered by PO decision D125 (2026-10-22), which supersedes the design course for this
  item and restates its acceptance against the single-review route. The Triage block is filled from D125 today.
- Not decided here: whether the single-review route needs its own zero-override revision test; that is judged under the
  restated acceptance, not under the retired course. No status change is made here.
