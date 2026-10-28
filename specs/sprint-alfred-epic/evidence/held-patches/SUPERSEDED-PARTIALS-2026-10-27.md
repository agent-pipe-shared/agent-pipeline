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
| `w7-d56-binding-assurance.patch` | `w7-d56-binding-assurance-c3.patch` | tests only (CPPA-1 to CPPA-3), no production edit |
| `w7-d56-binding-assurance-c2.patch` | `w7-d56-binding-assurance-c3.patch` | CPP09 count pin red and no generic-batch kind cases; c3 is complete against the same stack base (D56 slice 4/5 c2 first) |
| `w7-d56-admit-attested-record.patch` | `w7-d56-admit-attested-record-c2.patch` | CSC-A1 to A5 fixtures were rejected by the real validator (empty log) and no baseline run; c2 is complete and applies at the candidate alone |
| `w7-pf86-scan-outside-registry-lock.patch` | `w7-pf86-registry-read-api-c6.patch` | interim scan move, superseded by the lock-free read API |
| `w7-pf86-registry-read-api.patch` | `w7-pf86-registry-read-api-c6.patch` | NGHS46 red |
| `w7-pf86-registry-read-api-c3.patch` | `w7-pf86-registry-read-api-c6.patch` | duplicate case ids (TCC-CASE-DUPLICATE) and NGHS45 red |
| `w7-pf86-registry-read-api-c4.patch` | `w7-pf86-registry-read-api-c6.patch` | NGHS45 fixture defect (SQ-OVERLAP), not run to green |
| `w7-pf86-registry-read-api-c5.patch` | `w7-pf86-registry-read-api-c6.patch` | NGHS45 fixture fix applied but whole-file run missing; c6 holds 56/56 and eight green importer suites |
| `w7-preflight-scanner-findings.patch` | `w7-preflight-scanner-findings-c2.patch` | interim; c2 is 49/49 against 44/44 |
| `w7-phoenix-reopen-design-dry-run.patch` | `w7-phoenix-reopen-design-dry-run-c4.patch` | the observer-conformance fixture repository had no commit |
| `w7-d52-checkpoint-commit-route.patch` | `w7-d52-checkpoint-commit-route-c2.patch` | RED test file without the script; c2 is complete (6/6, 73/73, 42/42) |
| `w7-d31-briefing-checkpoint-return.patch` | `w7-d31-briefing-checkpoint-return-c2.patch` | interim; c2 is complete (pin file 17/17 against 13/13, apply check green) |
| `w7-d56-chain-test-and-refusal-text.patch` | `w7-d56-chain-test-and-refusal-text-c3.patch` | interim; c3 is complete (17/17, 48/48, 31/31) |
| `w7-d56-chain-test-and-refusal-text-c2.patch` | `w7-d56-chain-test-and-refusal-text-c3.patch` | CPPA-4 untrailered half still asserted the CLI string absent (preflight 15/17); c3 fixes that assertion |
| `w7-d31-budget-notice-checkpoint.patch` | `w7-d31-budget-notice-checkpoint-c2.patch` | RED cases only, no production edit; c2 is complete (grant notice 16/16, budget guard 125 pass) |
| `w7-round2-bundle-2026-10-28.patch` | `w7-round2-bundle-v3-2026-10-28.patch` | v1 holds 13 patches; v3 is the same plus the byte-identical rebind, the PowerShell repair lane, the recorded `pathRebind` and the present-plan remap. Apply only one. |
| `w7-round2-bundle-v2-2026-10-28.patch` | `w7-round2-bundle-v3-2026-10-28.patch` | v2 holds 15 patches; v3 adds the recorded `pathRebind` and the present-plan remap. Apply only one. |
| `w7-present-plan-after-folder-rebind-pin.patch` | `w7-present-plan-after-folder-rebind-pin-c3.patch` | four test cases only, no production remap and no run |
| `w7-present-plan-after-folder-rebind-pin-c2.patch` | `w7-present-plan-after-folder-rebind-pin-c3.patch` | remap and cases without a clean green run, one case expectation open, no apply check; c3 is 18/18 with the apply check green |
| `w7-pipeline-state-neutral-only-fixture.patch` | `w7-pipeline-state-neutral-only-fixture-c3.patch` | fixed only the neutral-only case; the file then aborted in the partial calibration block |
| `w7-pipeline-state-neutral-only-fixture-c2.patch` | `w7-pipeline-state-neutral-only-fixture-c3.patch` | fixed the partial calibration block too; the file then aborted in the verify deadlock block |
| `w7-guard-dispatch-test-fixtures.patch` | `w7-guard-dispatch-test-fixtures-c2.patch` | c1 took the file from 53 to 59 of 75; c2 includes it and completes the Workflow Explore check (60 of 75). 15 reds remain in both: generated-briefing fixtures (10) and the group B order question (5) |
The replacements still need the independent batch Critic, Full Verify, the native Windows run and
PO acceptance. `w7-skill-evidence-route-c2.patch` re-baselines a protected Critic policy preimage.
