fix(calibration): bind a replacement record to its stored approval at commit and close

ADR-0100 follow-up (advisor review of the first series):
- The commit check and the "commit them alone" readiness read count a
  ready record's replacement member only when this device's store
  holds the approval of exactly that subject digest and proof digest
  (replacementApprovalStored); the close readback applies the same
  rule, so signed or unsigned follows the stored approval, not the
  record's own mode word.
- inspectCurrentCalibrationVerifyReady takes the ready replacement of
  a configured command, so the hook's own-commit repair works for it;
  the hook's subject hint names both subjects.
- The test seam is forceStrictCriticalProof: it can only force the
  strict proof path, never waive one.
- Tests: the consumer leg stages both mirrors and runs the hook's own
  predicate (CVCT-COMMIT-READY; with the approval store moved aside,
  CVCT-RECORD); drift, tracked-dirty and moved-HEAD cases of the test
  run; ADR-0097 Decision 4 amendment red->green (a green receipt under
  a replaced command does not count; counter-probe red without it).
- ADR-0100 records the guard measurement on the installed 29c guard.

AI-Assisted: true
Dispatch: stage-0 (elephant)
