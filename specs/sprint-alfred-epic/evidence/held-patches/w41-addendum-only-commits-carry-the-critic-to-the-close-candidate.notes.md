# w41 — addendum-only commits carry the Critic to the close candidate (15g close hotfix)

Found by the second real consumer close (an epic with a multi-round Critic course): the feature close needs a Critic
disposition addendum per Critic-required dispatch record, and each addendum names the LAST Critic round (its packet id and
reviewed candidate), so it can only be committed AFTER that round. The audit route then needs a Critic/Verify lifecycle for the
exact close candidate (HEAD), which carries the Critic forward from the reviewed candidate. The carry-forward classifier accepted
only exact manifest-registration commits and Critic-export commits as evidence-only, so the addendum commit counted as an
unreviewed correction: `VEP-CVL-CARRY-CONTENT-CHANGED` ("Critic carry-forward range contains unreviewed content"). A fixed point
with no way out.

## Change

`lib/critic-course-admission.mjs`: new `criticAddendumOnlyCommit(root, commit)`, admitted by `classifyRegisteredEvidenceOnlyCommits`
under the same `admitCriticExports` option the Critic carry-forward already passes (course counters keep the default and still count
such a commit). A commit qualifies only when it:

- has one parent and adds, replaces or removes (status `A`, `M`, `D`) nothing but `evidence/dispatch-critic-addendum-<task>.json`
  files and markdown files under `evidence/` or `backlog/evidence/`;
- each addendum (the new version in the commit, or the removed one as it stood in the parent) validates through the existing
  `validateCriticDispositionAddendum` against the immutable dispatch record it names (`evidence/dispatch-record-<task>.json`, regular
  blob, digest equal to `recordSha256`) and its file name task id equals its `taskId`;
- the evidence file each addendum references exists in the same tree and its bytes hash to the digest in the addendum;
- every added or replaced markdown file is referenced by an added or replaced addendum, every removed one by a removed addendum.

Removal and replacement exist because a later Critic round retires the addenda of the earlier one (they name its packet): the second
real consumer repository removed four files in one commit and added three new addenda in the next. Any other path (the dispatch
record, source, a manifest), an extra or unreferenced file, a source change in the same commit, a record digest mismatch or a foreign
task name ends the classification, and the range stays unreviewed content. Whether an addendum binds the right Critic round is still
checked where it always was (the close planner), not here.

Test: `critic-verify-lifecycle.test.mjs` (already registered, unpinned): the good commit carries; six forged variants are refused;
counters unchanged without the option; removal and in-place replacement are evidence-only; remove-then-add carries through the
carry-forward; removing only the evidence, the dispatch record or a source file with the addendum is refused. Confirmed red before
the change with exactly the consumer's error. A range whose net change is empty (an addendum added and removed again) is refused by
the existing `CCA-RANGE-PATHS` rule and is not affected by this patch.

## Not in this patch (candidate 16)

The second half of the consumer report: a dispatch record WITH an addendum counts as covered and is no longer an admission target for
a further review round (`CDP-REVIEW-ADMISSION` with no reason). It needs the admission/close ordering decision, tracked in the
candidate 16 intake.
