fix(verify): the browser smoke dispatcher says why a project command under the reserved id was taken over

The id browser-smoke is reserved and its command runs only behind the Playwright and Chromium preflight. A project that already declared that id for a command of another tool got a red suite that asked for Playwright and never said the id had been taken over; only docs/usage.md did.

The not-ready output carries one more line: the id is reserved for a Playwright and Chromium smoke test and a project command of another tool under it must be renamed. It is a note, not a human step, so the one-step count of the output is unchanged, and nothing about when the suite passes or fails changes. The calibration and authority checks that the generic configured-command dispatcher runs before a command are not mirrored here: the baseline-calibration suite of the same Verify run fails on exactly those states, and mirroring them would duplicate that code into a second dispatcher. That and an opt-in id are left to the PO and candidate 32.

AI-Assisted: true
Dispatch: stage-0 (elephant)
