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

The replacements still need the independent batch Critic, Full Verify, the native Windows run and
PO acceptance. `w7-skill-evidence-route-c2.patch` re-baselines a protected Critic policy preimage.
