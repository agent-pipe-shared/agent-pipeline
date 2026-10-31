# w8-case-completion-policies-follow-the-declared-cases (held patch, not applied)

Cause of twenty red Verify steps that pass when the file is run alone (`slice-queue-tests`, `slice-queue-cli-tests`, `agy-host-commit-admission-tests`, `agy-final-return-tests`,
`stop-fanout-tests`, `runner-profile-migration-v3-tests`, `project-authority-tests`, `commit-message-policy-tests`, `dispatch-policy-tests`, `dispatch-record-tests`,
`guard-dispatch-tests`, `windows-private-state-tests`, `governance-action-artifact-tests`, `antigravity-native-dispatch-coordinator-tests`,
`antigravity-native-dispatch-pretool-tests`, `dispatch-record-write-tests`, `dispatch-budget-binding-tests`, `dispatch-record-strip-for-critic-tests`,
`critic-dispatch-preflight-tests`, `critic-course-admission-tests`): Verify hands a suite that registers its cases an inherited completion descriptor and refuses any run whose declared
case ids differ from the registered policy. The suites grew (guard-dispatch 43 to 81 cases, dispatch-record-write 19 to 40, the two Critic suites 46 to 78 and 18 to 82) without the
policy following, so each step failed within milliseconds. Reproduced by running each file the way Verify does (descriptor 3 on a file, the signal variable set) and comparing the
declared ids with the effective policy.

Change: `harness/scripts/verify.mjs` stays untouched (QG-02). Each suite's effective policy is extended through `harness/config/verify-case-completion-augmentations.v1.json`, the
route that exists for this: a strict monotone extension that binds the exact base policy by `previousPolicySha256` (unbound only where the suite has no base policy). Two suites that
were registered for Verify by the registration patch, `guard-grep-max-count-read-tests` and `security-scan-large-inventory-tests`, get their completion-registry rows
(`legacy-process-only`, same backlog reason as every other process-only row); the registry test's pinned counts (registry 388, the post-R5 exclusion list, the newly counted list) follow.

Evidence (clean clone): `check-verify-case-completion.mjs` reports the registry valid (388 entries); the registry suite 32/32, the augmentation suite 19/19 and the augmentation policy suite 8/8.
Applies to the repository HEAD. Whether every Verify step is green is only established by the next Full Verify.
