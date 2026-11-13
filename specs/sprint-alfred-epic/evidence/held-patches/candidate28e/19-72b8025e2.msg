fix(design): name an uncommitted design source before the approval request exists

Codex test run 2026-11-12: the trust policy project/critical-human-proof.json
was in the working tree but not in the commit the approval request
binds. present-plan handed over the signing step; approve-plan then read
the policy from the signed commit and refused with a bare
CAC-SOURCE-UNAVAILABLE, no path. The repair needed a commit, a new request
and a second PO signature.

- pipeline-state.mjs beforeSignatureEntryGate: new check
  `candidate-sources` after `design-package`; every file the accepted
  delivery contract later reads from the request's commit (the approval
  policy -- critical-human-proof.json, or pipeline.user.yaml in chat
  mode -- the PRD, the Spec, the companions and the review receipts)
  must be in that commit and byte-equal to the working tree.
  DAB-CANDIDATE-FILE-MISSING / DAB-CANDIDATE-FILE-DRIFT name the path
  and the repair (git add -- <path>, commit, present-plan again); no
  request is written. Skipped when the candidate commit is unresolvable
  (the existing checks own that case).
- approve-plan: a request signed by an older build that still meets
  this state names the file and says that the commit needs a new
  request and signature, instead of the bare code.

Tests: design-approval-route e2e DABX013 (policy left out of the commit:
present-plan exits 2 naming the path and the git add repair, no signing
command, no request written); the committed case is route 1/2. 19/19.
The approve-plan message for an older request has no test of its own.

AI-Assisted: true
Dispatch: stage-0 (elephant)
