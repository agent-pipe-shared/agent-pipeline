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

- has one parent and ADDS (status `A`) nothing but `evidence/dispatch-critic-addendum-<task>.json` files and markdown files under
  `evidence/` or `backlog/evidence/`;
- each addendum validates through the existing `validateCriticDispositionAddendum` against the immutable dispatch record it names
  (`evidence/dispatch-record-<task>.json`, regular blob at that commit, digest equal to `recordSha256`) and its file name task id
  equals its `taskId`;
- the evidence file each addendum references exists at the commit and its bytes hash to the digest in the addendum;
- every added markdown file is referenced by an added addendum.

A deleted, modified, extra or unreferenced file, a source change in the same commit, a record digest mismatch or a foreign task
name ends the classification, and the range stays unreviewed content. Whether the addendum binds the right Critic round is still
checked where it always was (the close planner), not here.

Test: `critic-verify-lifecycle.test.mjs` (already registered, unpinned): the good commit carries; six forged variants are refused;
counters unchanged without the option. Confirmed red before the change with exactly the consumer's error.

## Not in this patch (candidate 16)

The second half of the consumer report: a dispatch record WITH an addendum counts as covered and is no longer an admission target for
a further review round (`CDP-REVIEW-ADMISSION` with no reason). It needs the admission/close ordering decision, tracked in the
candidate 16 intake.
