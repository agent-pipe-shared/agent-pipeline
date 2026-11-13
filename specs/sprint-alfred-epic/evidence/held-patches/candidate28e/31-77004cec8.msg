feat(design): add the Spec addendum's one definition (ADR-0095)

The header grammar, the criterion rule, the approved subject, the
committed approval record and the reader every consumer uses, in one
module, so the signing terminal, the recording step and the readers
cannot disagree about what was approved.

- lib/spec-addendum.mjs: specs/<feature>/spec-addendum-<NN>.md; three
  strict header lines (base Spec path and digest, Critic packet,
  CRF-<packet>-<n> finding ids); SPEC-ADDENDUM-CRITERIA when the
  addendum names a criterion id the base Spec does not (names the PO's
  reopen-design); buildSpecAddendumSubject derives the subject from HEAD
  (addendum committed and unedited, the package's approved Spec
  byte-identical, a consumed packet whose candidate is an ancestor, its
  finding ids, the next number); specAddendumApprovalBytes;
  readSpecAddenda (registered pairs only, digest-checked, numbered
  without a gap; another base digest is "superseded" history)

Tests: lib/spec-addendum.test.mjs SA-01..SA-06, 6/6.

AI-Assisted: true
Dispatch: stage-0 (elephant)
