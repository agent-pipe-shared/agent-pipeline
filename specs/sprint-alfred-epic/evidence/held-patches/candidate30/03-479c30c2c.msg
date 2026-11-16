feat(verify): tests and Verify clean up the folders they leave in the home folder (C30-5)

- One shared removal (test-home-cleanup.mjs): makes a fixture's unreadable
  folders removable, never follows a link, never throws; the keep switch is
  PIPELINE_KEEP_TEST_HOMES=1.
- run-quiet removes a green suite's private TMPDIR, keeps a red one for the
  diagnosis and sweeps label folders older than 12 h at the start (33.7 GB
  of them had piled up).
- full-verify removes its private home after a green run, keeps it after a
  red one (the red-suite reruns use it), sweeps the home-level leftovers at
  the end, and fails when a run leaves a new unlisted fixture-shaped folder.
- clean-test-leftovers gains sweepLeftovers and the opt-in --verify-homes
  <days> for old .fv and fvc children; .fv and fvc are never touched without
  the flag.
- The signing-disclosure-sweep and existing-public-anchor suites and the
  design-route transcript fixture remove what they create.
- Tests: removal of an unreadable tree, the age guard, the allowlist and the
  live-state names that must stay, the opt-in verify homes, the leak rule.

AI-Assisted: true
Dispatch: stage-0 (elephant)
