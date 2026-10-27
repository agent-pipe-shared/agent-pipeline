# Superseded partial held patches (2026-10-27)

Each pair below was committed as an honest partial state. It is replaced by the named complete patch
and must NOT be applied. Apply only the replacement.

| Partial (do not apply) | Replacement (apply this) | Why the partial is incomplete |
| --- | --- | --- |
| `w7-budget-ceiling-70-c2.patch` | `w7-budget-ceiling-70-c4.patch` | maxTurns 76 only; four test files still pinned the old figure 50 |
| `w7-budget-ceiling-70-c3.patch` | `w7-budget-ceiling-70-c4.patch` | one calibration case still asserted the old working cap 35 |
| `w7-skill-evidence-route.patch` | `w7-skill-evidence-route-c2.patch` | the new guard case compared first occurrences and failed |
| `w7-d47-gitattributes-onboarding.patch` | `w7-d47-gitattributes-onboarding-c3.patch` | five failing cases and no production code |
| `w7-d47-gitattributes-onboarding-c2.patch` | `w7-d47-gitattributes-onboarding-c3.patch` | production code without a held run result; c3 is the same content, verified |
| `w7-pf83-stop-failure-removed-on-success.patch` | `w7-pf83-stop-failure-removed-c2.patch` | test half only (NGHF14-16), no production change and no run; c2 holds the same cases plus the fix |
| `w7-g18-readiness-aggregate.patch` | `w7-g18-readiness-aggregate-c2.patch` | module and cases without a clean RED run (the RED run overlapped writing the module); c2 has RED 4 fail, GREEN 48/48, baseline 44/44 |
| `w7-elephant-context-guard-dispatch.patch` | `w7-elephant-context-guard-dispatch-c2.patch` | test half only (GD67-GD72), no production edit and no run |

The replacements still need the independent batch Critic, Full Verify, the native Windows run and
PO acceptance. `w7-skill-evidence-route-c2.patch` re-baselines a protected Critic policy preimage.
