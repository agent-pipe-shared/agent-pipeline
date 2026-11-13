fix(design): keep a review unit bound to a running Critic course instead of rendering it anew

Follow-up to the re-render. Once a Critic round of the feature is
retained, the course is bound to the review unit's bytes: the
declaration commit is the first commit that lists the unit
(CCA-REVIEW-UNIT-BINDING, CGB-REVIEW-UNIT-BINDING compare its blob with
the candidate's), and every later round must carry the parent's
acceptance ids (CRL-V2-CARRY-COVERAGE). A unit rendered anew mid-course
would refuse the next round on all three. The earlier commit's stated
cause (the batch refusing a dropped id) also only holds when the
declaration commit already carries the new Spec, since the batch reads
the Spec at that commit.

- lib/feature-package-registration.mjs: the re-render applies only
  while no critic-lineage evidence is retained in the superseded
  manifest; with a retained round the unit is kept byte-identical and
  reviewUnit.status "stale-bound-to-course" names the course's ids, the
  approved ids and the way on (a new rigor-1 feature for added criteria,
  or the PO); the code comment states the corrected cause

Tests: architecture-baseline.test.mjs 7.13d gains the retained-round
case (kept byte-identical, manifest binds the found bytes, status and
reason reported); 7.13* 5/5.

AI-Assisted: true
Dispatch: stage-0 (elephant)
