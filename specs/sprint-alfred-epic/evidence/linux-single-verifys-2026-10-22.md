# Linux single verifys, 2026-10-22 (counted runs on Linux/WSL)

Every run below is a plain run of the named file through the isolated runner (`scratch/run-parallel.mjs`: own clone, private HOME and TMPDIR, at most 3 workers) or, for the onboarding controller, the orchestrator itself with a private TMPDIR. Host: Linux/WSL2, Node 24. None of them is a Full Verify, and none of them is an installed-host run. "HEAD" is the commit named per row.

| Suite | Result | HEAD |
|---|---|---|
| hooks/design-course-command-admission, pins/catalogue-admit-prescribed-lifecycle-verbs, pins/design-phase-d64-criterion-parser-and-sanitized-review-chain, plan-authority-staging-guard, design-approval-route.e2e, pipeline-state-rebind-runner, project-onboarding-e2e | 17/17, 19/19, 14/14, 11/11, 14/14, 18/18, 6 pass + 1 typed skip | 540e96f71 |
| pins/three-runner-happy-path-with-two-po-approvals | 21 pass, 1 typed skip | 540e96f71 |
| guard-maintenance-window-kernel-closure, guard-maintenance-window | 11 checks, 63 checks, 0 failed | 540e96f71 |
| dispatch-recovery, dispatch-recovery-admission, authority-restore, guard-split-contract | 8/8, 2/2, 9/9, 5/5 | 540e96f71 |
| hooks/guard-lifecycle-ready | 392 cases, 389 pass, 3 typed native-Windows skips, 0 fail | 540e96f71 |
| harness/scripts/check-consumer-safe-paths | 9/9 | 540e96f71 |
| pins/foreign-worktree-closes-the-implementation-gate (before K47) | 17 pass, 1 skip | 540e96f71 |
| pins/foreign-worktree-closes-the-implementation-gate (after K47, real /mnt DrvFs worktree) | 19/19, 0 skip | clone k47 f074de885 |
| pins/verify-on-a-wsl-mnt-drive-checkout-hides-its-reason | 7 pass, 1 skip | 540e96f71 |
| scripts/dispatch-briefing | 49/49 | f9ad83077 |
| pins/sign-intent-disclosure-scan-blocks-for-minutes | 7/7, 0 skip | f9ad83077 |
| governance-scope, governance-scope-retirement-retry, pins/governance-scope-rejects-readonly-host-git-control | 27/27, 19/19, 9/9 | f9ad83077 |
| model-family-invocation (alone) | 14/14 (one red MFI011 seen only with three workers side by side) | b041fb39b |
| model-family-host-store | 30 pass, 2 fail (MFHS023, MFHS028: `model-family-host:unowned-retained-member`, a reproducible cross-process ownership limit, D66(a), backlog item `a-member-reserved-by-another-process-is-refused-as-unowned`); typed pending by K48 | f9ad83077 |
| project-onboarding-v3 controller (216 cases, 12 shards) | 5 red cases at 8aac49b45 (K40 hand-off refusal on placeholder-Spec fixtures), 2 more in chunk 2 once chunk 1 passed; all repaired input-only by K49 (`7d26a0a41`); then 216 cases, 0 shards failed | 18495fe4e |
| 32 further test files that drive submit-plan or present-plan (K49 sweep) | all exit 0 | clone k49 7d26a0a41 |
| pins/partial-readiness-names-the-authority-restore-when-the-committed-bytes-match, authority-restore, rebind-runner, d64 pin, design-approval-route.e2e, three-runner pin, kernel-closure, guard-lifecycle-ready | 4/4, 9/9, 18/18, 14/14, 14/14, 21 pass + 1 skip, 11 checks, 389 pass + 3 skip | dress9 (block 3 rehearsal) |

Scope of the claim: Linux/WSL only. Native-Windows runs are out of scope by D133; installed-host and live-model clauses stay open until the candidate is stamped and installed. A green single run does not replace the Full Verify, the independent Critic read or PO acceptance.
