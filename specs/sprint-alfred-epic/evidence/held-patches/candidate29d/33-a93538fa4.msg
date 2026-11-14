feat(calibration): let the configure-verify transition take a signed replacement

ADR-0100 (PO tile 3, 28d finding C6): the commit transition accepted
only a first configuration from the baseline-only seed.
- transition() takes an optional replacement member (previous
  command, subject digest, proof digest, mode); a configured previous
  command is accepted only with it (CVCT-REPLACEMENT), and the facts
  carry it so the record names the replacement.
- prepare takes the member (refused at phase entry); complete and
  inspect recompute with it; inspect reads the ready records of a
  configured command to find the replacement members.
- calibrationVerifyReplacementImages returns the committed command and
  the exact post-images of both mirrors (CVCT-NOT-CONFIGURED,
  CVCT-SAME-COMMAND), for the one subject builder.

AI-Assisted: true
Dispatch: stage-0 (elephant)
