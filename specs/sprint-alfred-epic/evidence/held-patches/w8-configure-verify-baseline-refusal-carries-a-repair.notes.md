# w8-configure-verify-baseline-refusal-carries-a-repair (held patch, not applied)

Cause of the three red cases of `pins/configure-verify-names-the-unmet-approval-condition` (AC-150, ALF-G1-CONFIGURE-VERIFY-CAUSE): the typed codes already reach the
caller (the first half of that defect is fixed), but the refusal printed on the "requires exact committed baseline or this command's verify-field delta" branch of
`configure-verify` ended at "zero calibration write." with no repair, so each unmet approval condition named its code and still told the user nothing to do.

Change: that branch appends `; repair: <configureVerifyRepair(code)>`, the same helper the commit-route branch already uses. `configureVerifyRepair` also maps
`CAC-SOURCE-BINDING-MISMATCH` (an approved companion source vanished after approval) to the existing "restore the approved source file" repair.

Evidence (clean clone): the pin 6/6 (it was 3 of 6) and the sibling `configure-verify-output-lacks-a-walkable-commit-route` pin 8/8. No other file prints or matches
this refusal line. Applies to the repository HEAD.
