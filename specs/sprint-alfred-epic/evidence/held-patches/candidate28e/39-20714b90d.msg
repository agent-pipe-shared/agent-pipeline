fix(design): skip a candidate source that is in neither the commit nor the tree

The present-plan gate of 72b8025e2 named every file the accepted
delivery contract may read as DAB-CANDIDATE-FILE-MISSING when the
request's commit lacks it, also when the file does not exist in the
working tree either. The defect it was built for is an uncommitted
file (the Codex run: the proof policy lay in the tree, not in the
commit). A project without a proof policy, as in the po-gate-authority
fixture, was refused at present-plan before the checks that own that
case could answer.

- designCandidateSourceGaps skips a path that is absent from both.
- po-gate-authority.test.mjs passes again; design-approval-route e2e
  (DABX013, the policy in the tree but not committed) still refuses.

AI-Assisted: true
Dispatch: stage-0 (elephant)
