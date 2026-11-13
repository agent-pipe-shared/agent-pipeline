fix(design): render the Critic review unit anew when the approved Spec names other criterion ids

PO decision 2026-11-13. A re-approved Spec that added or dropped a
criterion id met the review unit generated for the earlier approval:
registration kept it as found, so the Critic batch refused the dropped
id (CGB-REVIEW-UNIT-BINDING) and a new id went unreviewed.

- lib/feature-package-registration.mjs: a found unit of the generated
  shape (independent-delivery, one logical work id = the feature) whose
  criterion ids or Spec path differ from the approved Spec is rendered
  anew and replaces the file through a temporary file; the rollback
  writes the found bytes back; reviewUnit.status "re-rendered" names the
  previous and the new ids. A unit of any other shape (hand-written,
  several work items) is registered as found, as before.

Tests: architecture-baseline.test.mjs 7.13d (a stale generated unit is
re-rendered and the manifest binds the new bytes, no temporary file
left; a multi-item unit is kept byte-identical). Red on the pre-fix
code ('found' instead of 're-rendered'); 7.13* 5/5.

AI-Assisted: true
Dispatch: stage-0 (elephant)
