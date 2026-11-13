fix(critic): a Spec addendum is never close evidence (ADR-0095)

criticCloseCommit admitted every path under specs/<feature>/ as close
evidence, so a commit that adds a Spec addendum after the last Critic
round would have carried that round forward without a review of the
correction it describes. A commit that adds or changes
specs/<feature>/spec-addendum-<NN>.md now stays a correction. The
administration path set already treats the addendum as content.

Tests: critic-verify-lifecycle.test.mjs, the refused close-commit list
gains the addendum case (30/30).

AI-Assisted: true
Dispatch: stage-0 (elephant)
