---
schema: pipeline.backlog-item.v1
id: pipeline.dispatch-briefing-build-cannot-read-a-spec-addendum-as-a-criterion
type: defect
owner: pipeline
status: open
created: 2026-10-29
priority: P2
release: 0.7.0
sprint: alfred
source: "Toolbox consumer finding N16 (PO relay, 2026-10-29, from the consumer's handover list of 2026-10-27); not yet reproduced here"
done_when: manual
---

# dispatch-briefing build cannot read a spec addendum as a criterion

## Evidence

A Toolbox consumer amended its Spec with an addendum (a later section that adds or changes an acceptance criterion) and `dispatch-briefing.mjs build` could not resolve that criterion: the generator reads the criterion and its byte span from the Spec's Acceptance table (`--criterion`, `DBG-CRITERION-ID`, the locator work in `lib/dispatch-briefing-build.mjs`), and an addendum written outside that table is not found, so a dispatch for the addendum's work cannot be briefed from the template.

## Wanted

- A documented, supported way to bind a dispatch to a criterion that lives in a Spec addendum: either the generator accepts the addendum's location (a section or a second table in the same Spec, or a named addendum file bound by digest), or the Spec template says that amendments are made as new rows of the Acceptance table.
- The refusal names the form the generator did read and where it looked.

## Acceptance

- A fixture Spec with an addendum criterion is briefed by `build` without hand edits, and the briefing carries the criterion's exact byte span from the addendum.
- A criterion id that is not found says which sections and tables were searched.
- The generator is a kernel-adjacent script (`scripts/dispatch-briefing.mjs`, `lib/dispatch-briefing-build.mjs`): held patch.
