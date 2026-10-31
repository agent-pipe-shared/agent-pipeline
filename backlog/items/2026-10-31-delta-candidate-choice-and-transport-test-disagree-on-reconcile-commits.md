---
schema: pipeline.backlog-item.v1
id: pipeline.delta-candidate-choice-and-transport-test-disagree-on-reconcile-commits
type: defect
owner: pipeline
status: open
done_when: manual
release: 0.7.1
created: 2026-10-31
sprint: alfred
source: "Toolbox finding N38 (2026-10-31): register-feature-package --add-delta-request refused with FPR-DELTA-TRANSPORT after a PO-signed feature-package-reconcile commit, although the evidence and the delta input were correct."
---

# The delta verb picks its candidate with a different "evidence-only" test than the transport check uses

## What happened

`register-feature-package.mjs --add-delta-request` refused with `FPR-DELTA-TRANSPORT` ("HEAD must be reachable from the candidate through
evidence-only commits only"). HEAD was an evidence commit that followed a PO-signed `feature-package-reconcile` commit. Diagnostic evidence and the
delta input were correct. The refusal did not name the candidate the verb had chosen, so the cause had to be found by reading code.

## Cause (read from the code by the reporting session)

`lib/feature-package-registration.mjs` (about lines 642-651) picks as candidate the newest first-parent commit that is NOT evidence-only, where
evidence-only means: changes only the manifest and `specs/<feature>/evidence/`. The reconcile commit changes only `lifecycle.json`, so it counts
as evidence-only and is skipped; the candidate became the commit before it. The later transport check (`lib/critic-course-admission.mjs`,
function `transport`, about lines 629-635) sees that the reconcile changes the manifest CORE (core before differs from core after) and refuses with
`CCA-TRANSPORT`, which the registration reports as `FPR-DELTA-TRANSPORT`. The two predicates for "evidence-only" differ.

## Workaround that worked

A real non-evidence commit after the reconcile (a documentation update that was due anyway) became the candidate; Verify and the diagnostic were
produced again for it.

## Proposed direction

One predicate for both places: either the candidate choice treats a commit that changes the manifest core (a reconcile) as not evidence-only and
takes it as the candidate, or the transport check accepts it. In both cases the refusal must name the candidate the verb chose, so the deviation
is visible. Add a test that runs the verb with a PO-signed reconcile commit between the candidate and HEAD.
