fix(verify): record the in-place case-list extension of 4c37267c1

The suite history check refused the commit that added NGHS09 to an existing
registry row. Record it as one more commit-bound, unsigned rewrite entry; the
witness re-derives the extension from the registry bytes.

AI-Assisted: true
Dispatch: stage-0 (elephant)
