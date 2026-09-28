---
schema: pipeline.backlog-item.v1
id: pipeline.advisor-question-contract-and-final-source-binding-conflict
type: defect
owner: pipeline
status: open
created: 2026-09-28
source: "Code-level comparison of the actual design advisory coordinator with the final design-workflow package validator during the PO's Advisor loop inquiry."
sprint: none
done_when: manual
---

# Align initial Advisor consultation with final design disposition

## Verified source conflict

`design-advisory-coordinator.mjs:99`-104 builds the executed question from
raw initial design bytes; its executed branch uses this question at :314.
For an answered receipt, `design-workflow-package.mjs:245`-254 instead
derives a prefixed question from all five final source references. Its
validator at :340-351 requires the exact final candidate and that different
question digest. These producers do not share one question contract.

Even after aligning the question format, revising design in response to
advice changes final source/candidate bindings. Requiring the initial advice
to have been dispatched against those future revised bytes can force
consultation, revision and consultation again. The existing typed no-child
exception branch has a separate question contract; it does not prove the
executed answered route works. No live answered Advisor result or infinite
loop is claimed here.

## Correction and acceptance

- Share one canonical initial question/evidence contract between coordinator,
  host producer and independent package validator.
- Preserve the actual initial candidate/source/receipt binding; never relabel
  an earlier answer as dispatched against a later candidate.
- Bind explicit proposal disposition and revision provenance from that
  initial consultation to the final five sources. Independent readiness and
  the final PO decision bind the revised final candidate.
- Require a new consultation only for an explicit new substantive course,
  consistent with the course-budget item, rather than routine packaging or
  incorporation of the advice itself.
- Exercise the real coordinator-to-package answered path, unchanged sources,
  actual revision after advice, wrong question, unrelated initial candidate,
  forged disposition/revision chain, and both chat/signature approval modes.
- Keep unavailable/no-child evidence and proposed PO exception honest and
  separately validated. They cannot mask a broken answered route.

This item records confirmed source-contract divergence and a derived loop
risk, not a productive correction, release qualification or manual closure.
