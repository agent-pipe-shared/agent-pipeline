# FIX-WAVE-COHORT-REGISTRATION — inert-clone handoff

Targeted delivery: **green**. The owned clone was based on committed `31db7853a71d3b9e72c864f5aced91a69a0ecee9`. I imported the exact K156 cumulative, G22 dependency, and G19 preflight Source patches in that order through `node scripts/apply-diff.mjs <absolute patch path>`. The [owned overlay](owned-registration.patch) is relative to that complete fixture and contains exactly five paths:

1. `harness/verify-suites.json` — append the two new suite rows with KCR001–011 and WAR001–009 required case policies at the existing 65536-byte budget.
2. `harness/config/verify-case-completion.v1.json` — add two sorted `required` classifications.
3. `docs/product-capability-inventory.json` — assign both new Verify surfaces exactly once to `deterministic-verification`.
4. `plugins/pipeline-core/scripts/pipeline-state-calibration-recovery.test.mjs` — add the standard KCR001–011 recording wrapper.
5. `plugins/pipeline-core/lib/windows-authority-readiness.test.mjs` — add the standard WAR001–009 recording wrapper.

The 20 original assertion bodies and case order are unchanged. Existing changed test modules had no adopted required policy needing a monotone extension, so `harness/config/verify-case-completion-augmentations.v1.json` was untouched. Prior fix-wave registrations and policies remain intact; no exclusion, old row rewrite or budget reduction was made.

## Machine-written checks

Every check ran from the composed clone at the preflight-required host boundary through `node plugins/pipeline-core/scripts/capture-evidence.mjs --out scratch/agent-out/fix-wave-cohort-registration/<capture> --label <label> -- <command>`. Captures record the exact command and actual exit.

| Exact wrapped command | Exit | Capture |
|---|---:|---|
| `node --test plugins/pipeline-core/lib/guard-maintenance-window-kernel-closure.test.mjs` | 0 | `kernel-composed-before.json` |
| `node harness/scripts/check-verify-suite-registration.mjs` | 0 | `registration.json` |
| `node harness/scripts/check-verify-case-completion.mjs` | 0 | `completion.json` |
| `node harness/scripts/check-verify-suite-append.mjs` | 0 | `append-history.json` |
| `node --test harness/scripts/check-consumer-safe-paths.test.mjs` | 0 | `consumer-safe.json` |
| `node --test plugins/pipeline-core/scripts/pipeline-state-calibration-recovery.test.mjs plugins/pipeline-core/lib/windows-authority-readiness.test.mjs` | 0; KCR001–011 and WAR001–009 passed | `cohort-witnesses.json` |

Composed kernel closure passed before the metadata edits; it did not report a missing G22 helper, so no GMW inventory or threat-model addition was warranted. The focused witness run completed in the foreground. Earlier registration phases had an initial sandbox `spawnSync node EPERM` and successful host reruns; this cohort used the host boundary from its first Node and Git calls. No separate quick route exists.

## Deliberately unchanged and open

Nothing committed. Main, imported product Source, real account or `.apsp` state, assertions, historical policies, and GMW inventory were untouched by this overlay. Integrated Full Verify, independent batch review, native qualification, and PO acceptance remain pending with the parent.
