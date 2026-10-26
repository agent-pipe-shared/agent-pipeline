# C29 bundle follow-up: fixture and kernel-list fixes

Applies AFTER the ten C29 patches (order as in `po-ceremonies-pending.md`), as patch 11:
`c29-bundle-fixture-followup.patch`. Verified: `git apply --check` and `git apply` succeed in a fresh
clone of HEAD 3e8310a99 after the ten patches (driver `followup`, printed `FOLLOWUP-APPLIES-OK`).

Measured with `node --test <file>` per file, timeout 300 s, in real clones. A = unpatched HEAD,
B = HEAD plus the ten patches as one base commit, Bfix = B plus this follow-up. Raw data: scratch
`results.json` (untracked). Counts are pass/fail.

## Per-file table (40 files)

| File | A | B | B after fix |
|---|---|---|---|
| hooks/guard-lifecycle-ready.test.mjs | 391/0 | 392/0 | - |
| lib/critic-generic-batch.test.mjs | 15/0 | 17/0 | - |
| lib/onboarding-continuity.test.mjs | 307/1 | 317/1 | - (pre-existing fail) |
| lib/pins/claude-background-goldfish-is-host-committed-at-subagent-stop.test.mjs | 7/0 | 0/12 | 12/0 |
| lib/pins/read-only-guard-admits-execution-and-output-options.test.mjs | 74/0 | 74/0 | - |
| scripts/dispatch-briefing.test.mjs | 78/1 | 89/1 | - (pre-existing fail) |
| scripts/guard-human-override.test.mjs | 28/0 | 33/0 | - |
| scripts/onboarding-init-intake-author.test.mjs | 6/0 | 6/0 | - |
| scripts/onboarding-init.test.mjs | 56/0 | 56/0 | - |
| scripts/session-authority-repair.test.mjs | 11/0 | 14/0 | - |
| lib/pins/consumer-approved-plan-reaches-the-first-item-host-commit.test.mjs | 8/0 | 5/3 | 8/0 |
| lib/human-guard-override.test.mjs | 176/1 | 176/1 | - (pre-existing fail) |
| lib/native-goldfish-host-finalizer-regression.test.mjs | 3/0 | 3/0 | - |
| lib/native-goldfish-host-finalizer.test.mjs | 15/0 | 15/0 | - |
| lib/native-goldfish-host-state.test.mjs | no summary | no summary | - (counts not parsed in A or B; not a regression signal) |
| lib/pins/consumer-spec-criterion-binds-the-first-item-delivery.test.mjs | 30/0 | 30/0 | - |
| hooks/guard-gate-strength.test.mjs | 1/0 | 1/0 | - |
| lib/agy-item-delivery.test.mjs | 6/0 | 6/0 | - |
| lib/architecture-prospective-companion.test.mjs | 3/0 | 3/0 | - |
| lib/guard-maintenance-window-kernel-closure.test.mjs | 1/0 | 0/1 | 1/0 |
| lib/pins/parallel-work-in-one-checkout-is-unsafe.test.mjs | 14/5 | 14/5 | - (pre-existing fail) |
| lib/pins/three-runner-happy-path-with-two-po-approvals.test.mjs | 21/0 | 21/0 | - |
| lib/project-onboarding-v3.test.mjs | 0/1 | 0/1 | - (pre-existing fail) |
| lib/session-cleanup-lost-binding.test.mjs | 1/7 | 1/7 | - (pre-existing fail) |
| scripts/design-approval-route.e2e.test.mjs | 14/0 | 14/0 | - |
| scripts/pipeline-state-approve-push-chat-catalogue-repair.test.mjs | 1/0 | 1/0 | - |
| scripts/pipeline-state-result-bootstrap.test.mjs | 16/0 | 16/0 | - |
| scripts/po-human-approval.test.mjs | 185/0 | 185/0 | - |
| scripts/session-cleanup-binding.test.mjs | 36/32 | 36/32 | - (pre-existing fail) |
| harness/scripts/check-product-capability-inventory.test.mjs | 30/0 | 30/0 | - |
| hooks/codex-pretool-guard.test.mjs | 0/1 | 0/1 | - (pre-existing fail) |
| hooks/guard-gate-strength-ledger.test.mjs | 2/0 | 2/0 | - |
| hooks/guard-testpath-override.test.mjs | 1/0 | 1/0 | - |
| lib/agy-final-return.test.mjs | 16/0 | 16/0 | - |
| lib/darwin-requester-integration.test.mjs | 6/0 | 6/0 | - |
| lib/human-guard-override-capability-scan.test.mjs | 3/0 | 3/0 | - |
| lib/human-guard-override-disjoint-isolation.test.mjs | 38/0 | 38/0 | - |
| lib/human-guard-override-disjoint.test.mjs | 35/0 | 35/0 | - |
| lib/model-family-host-store.test.mjs | no summary | no summary | - (counts not parsed in A or B) |
| lib/model-family-invocation.test.mjs | 14/0 | 14/0 | - |

(Paths are relative to `plugins/pipeline-core/` except the `harness/scripts` row.)

Only three files had a higher fail count in B than in A; all three are fixed and now match A or better.
Every other file is equal or greener in B.

## Fixes (all in B only; shipped as the follow-up patch)

1. `lib/pins/claude-background-goldfish-is-host-committed-at-subagent-stop.test.mjs`: add
   `"--effort-escalation", "MP-05"` after `"--agent-type", "goldfish-deep"` in the briefing-binding argv.
   Justification: patch 3 adds the refusal DBG-EFFORT-ROUTE-CONTRADICTION (route duty.deep selects effort
   medium, agents/goldfish-deep.md pins xhigh); the escalation flag is the sanctioned declaration. No
   assertion about host-commit behaviour changed. B 0/12 -> 12/0 (A 7/0; the file gained cases from patch 9/10).
2. `lib/pins/consumer-approved-plan-reaches-the-first-item-host-commit.test.mjs`: the same one-flag fix on
   its `--agent-type goldfish-deep` argv. B 5/3 -> 8/0 (A 8/0). The SDC-AUTHORITY-UNAVAILABLE failure did
   not remain after the fix.
3. `lib/guard-maintenance-window.mjs` (production-adjacent, allowed by the briefing): add
   `plugins/pipeline-core/lib/pipeline-actor-assignment.mjs` to NEVER_LIFTABLE_KERNEL_PATHS next to
   onboarding-init.mjs; and `docs/guard-maintenance-window-threat-model.md`: add the same path to the
   Protected-assets list (checked by GMWKC03). Justification: patch 6 makes `scripts/onboarding-init.mjs`
   (a kernel file) import this lib, which closure test GMWKC01 reports as the single violation. B 0/1 -> 1/0
   (A 1/0), which also shows the lib imports nothing outside the kernel set (no further violation).

## Unfixed regressions

None among the 40 files run.

## Pre-existing failures (fail identically in A; not caused by the bundle)

onboarding-continuity (1, OBC264), dispatch-briefing (1, public --help), human-guard-override (1, Q9 D55),
parallel-work-in-one-checkout-is-unsafe (5), project-onboarding-v3 (1), session-cleanup-lost-binding (7),
session-cleanup-binding (32), codex-pretool-guard (1). First failing lines are in `results.json` (scratch).

## Not run

The suite cap was 40 files; 160 importer files qualified and 130 were cut, so these were NOT run in A or B
(coverage gap; recommend a post-sitting run of the full Verify). They are all `*.test.mjs` that name one of
the touched non-test modules, among them: lib/guard-maintenance-window.test.mjs,
lib/worktree-lifecycle.test.mjs, lib/protected-baseline.test.mjs, scripts/pipeline-state.test.mjs,
scripts/pipeline-start-preflight.test.mjs, scripts/session-power.test.mjs, hooks/guard-testpath.test.mjs,
hooks/guard-dispatch.test.mjs, lib/native-goldfish-host-state-regression.test.mjs, lib/session-cleanup-recovery.test.mjs,
lib/project-onboarding-v3-answers-file.test.mjs, harness/scripts/shell-grammar-capability-placement.test.mjs,
plus about 118 more (pins, guard, scripts). The complete list is `cut` in the scratch `setup.json`.

## Preimage SHA-256 (file in B base = HEAD plus ten patches)

- docs/guard-maintenance-window-threat-model.md c9f8ec4718a8d278fca790b34c10e25dcf36ae6a553605d587170afcb25f876c
- plugins/pipeline-core/lib/guard-maintenance-window.mjs c523ef11a2671de263ec4e273d05bf242caf6f23971731a04885def90f003d66
- plugins/pipeline-core/lib/pins/claude-background-goldfish-is-host-committed-at-subagent-stop.test.mjs 63fbfee6a07a419df93c830d67d966e9084e79acd70c18e2eb782d908bc0f78c
- plugins/pipeline-core/lib/pins/consumer-approved-plan-reaches-the-first-item-host-commit.test.mjs 4079de8a59b2c39e4be20cb5fa74fe15e545cbfcf505daf423b3adf1dd9a0323

## Proposed commit message

```
test(bundle): declare MP-05 escalation in goldfish-deep pin fixtures and add the actor-assignment kernel path

Patch 3 refuses a goldfish-deep briefing whose pinned effort differs from the configured route
unless an effort escalation is declared; two pin fixtures build such a briefing. Patch 6 makes
onboarding-init.mjs import pipeline-actor-assignment.mjs, which the kernel closure test requires
in NEVER_LIFTABLE_KERNEL_PATHS and the threat-model Protected-assets list.
```

## Caveat

The pin test file named in the dispatch write scope was deliberately NOT edited in the checkout: at HEAD
(without patch 3) the flag change would not be verifiable there, and it is carried by the follow-up patch.
