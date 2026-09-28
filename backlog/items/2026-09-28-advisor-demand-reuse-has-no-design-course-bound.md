---
schema: pipeline.backlog-item.v1
id: pipeline.advisor-demand-reuse-has-no-design-course-bound
type: optimization
owner: pipeline
status: open
created: 2026-09-28
source: "PO question about repeated Advisor calls; current and prepared-source analysis confirms per-demand limits without a design-course limit."
sprint: none
done_when: manual
---

# Bound Advisor consultation across one design course

## Confirmed boundary

Individual calls and fallback chains are bounded, and an identical persisted
demand returns reuse-no-repeat. `advisory-lifecycle-v2.mjs:367`-397 includes
the whole dispatch (ID, revision and candidate), question, evidence and route
digests in reuseKeySha256. A changed dispatch or candidate can therefore
produce another consultation even when the substantive question is unchanged.
`advisoryConsultationDisposition` has no course-level counter. Readiness
itself does not automatically invoke an Advisor; a surrounding design driver
can still repeat consultation while refreezing or revising packages.

The prepared 49-path correction does not address this limit. No infinite
running model process or actual repeated model call is claimed by this intake.
This session's canonical Advisor observations have no child and no answer.

## Proposed course rule and acceptance

- One Advisor consultation cycle per explicitly identified design course;
  applicable governed fallback attempts remain finite inside that cycle.
- Record the immutable initial question/evidence and actual route outcome.
- Elephant disposition and design revision proceed to independent readiness;
  pure packaging commits and readiness corrections cannot implicitly start
  another consultation cycle.
- A materially new substantive question requires an explicitly new course,
  with its reason and prior-course relation recorded. A new dispatch ID alone
  is not that decision.
- Persist and validate the course budget across restarts and runtime re-entry;
  refusals remain truthful and cannot invent an Advisor PASS.
- Keep export consent, route admission and exact binding checks for every
  admitted attempt. A limit is not permission to bypass a missing gate.
- Test same-question new-dispatch/new-candidate reuse, revision after advice,
  exhausted fallback, restart continuity and explicit new-course admission.

The proposal requires integration and source-bound verification before manual
closure. It is not a currently enforced guarantee or a new PO approval.
