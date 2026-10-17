# Critic C6g2 FULL — result (partial review)

- Briefing: [C6g2-full.md](C6g2-full.md)
- Review object: 3f0ef3f1c, a90869af9, fc56a4d5f, 4776fcfd4, 58f6ae820, 3a97d3cbd, 724e9db87, 418dd753a, 979e5dc70, 9e075f96d, ff4007a49
- Requested route: claude-sonnet-5-5 at high; effective identity claude-sonnet-5-5 (direct same-dispatch runtime prompt)
- Assurance: functional-equivalent-read-only; OS isolation not asserted
- Outcome: **pass/fail withheld — partial review** (80 % checkpoint at call 40 of 50). F1 major stands on the examined material.
- Trajectory: not verifiable (no dispatch records, no tracked run artifacts). Caveats: 3f0ef3f1c carries `Dispatch: stage-0 (elephant)` for a 3-file change attributed to the PO; 58f6ae820 carries one Dispatch trailer for a pin authored under another dispatch id.
- Briefing violations: none.

## Findings (as reported)

| ID | Severity | Commit | Gap | Evidence |
|---|---|---|---|---|
| F1 | major | 3f0ef3f1c | `claudeBackgroundOnly` lets an item-governed Claude dispatch continue with a stderr WARNING instead of BLOCKED on `NGHS-CLAUDE-FOREGROUND-REQUIRED`; the code fires for any `run_in_background` not exactly `false` (absent or `true`), broader than the comment; no test for the new branch (QG-11). | hooks/guard-dispatch.mjs:669-676; lib/native-goldfish-host-state.mjs:152 |
| F2 | minor | 58f6ae820 | Header comment lists DISCLOSED gaps of the commit-scoped override course without owner or expiry (QG-06). | pre-commit-hook-install.mjs ~141-146 |
| F3 | minor | 4776fcfd4 | The commit replaced the whole AC-270 pin (restored later by 74b2c01c5, outside the batch); its new tail assertion is a tautology. | pin hunk @@ -1,199 +1,26 @@ |
| F4 | minor | 418dd753a | OWN-5/OWN-6 win32 skip names no owner or due date; `secureDirectory` in lib/guard/dispatch-record-lane.mjs has no win32 branch. | pin HOST_LIMIT; dispatch-record-lane.mjs:265-270 |
| F5 | minor | a90869af9 | One-line bugfix without a test; `normal()` in protected-baseline.mjs:30 replaces only double backslashes, so `matches()` and `protectedBaselineRuleFor` still see single backslashes. | lib/protected-baseline.mjs:30, :33, :48, :176 |

## Coordinator disposition

- F1: correction Goldfish ALF-C-C6G2-CORR (hooks/guard-dispatch.mjs is not on the protected list): narrow the branch to the documented case, or refuse; add the missing branch tests.
- F2, F4: owner and due date added in the same correction (F4 source gap: lib/guard/dispatch-record-lane.mjs is protected → noted, patch only if within budget).
- F3: tip state already restored by 74b2c01c5; the tautological assertion is removed in the correction.
- F5: lib/protected-baseline.mjs is protected → signature-bound patch plus a regression case, in the correction.
