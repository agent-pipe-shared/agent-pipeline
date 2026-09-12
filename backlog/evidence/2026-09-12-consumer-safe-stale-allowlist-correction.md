# Consumer-safe stale allowlist correction

Task: `NVA-B-CONSUMER-SAFE-STALE-ALLOWLIST-1`

## Pre-existing state

At candidate baseline `f6d2222b79c8f3507ab3d1ecd6ef3004d43da5ac`,
`harness/scripts/check-consumer-safe-paths.mjs` contains the allowlist match
`against \`harness/review-protocol.md\` §2.1's`, while
`plugins/pipeline-core/roles/goldfish.md` contains neither that match nor any
reference to `harness/review-protocol.md`. The same mismatch exists at
`f413cc82^`, proving it predates the mid-task-authentication package.

Commands used for the read-only comparison:

- `git show f6d2222b79c8f3507ab3d1ecd6ef3004d43da5ac:harness/scripts/check-consumer-safe-paths.mjs`
- `git show f6d2222b79c8f3507ab3d1ecd6ef3004d43da5ac:plugins/pipeline-core/roles/goldfish.md`
- `git show f413cc82^:harness/scripts/check-consumer-safe-paths.mjs`
- `git show f413cc82^:plugins/pipeline-core/roles/goldfish.md`

## Correction and checks

Only the stale allowlist entry was removed. The checker logic and its test file
were not changed.

- `node harness/scripts/check-consumer-safe-paths.mjs` — exit 0; 1,153 tracked
  plugin files checked and all 143 remaining allowlist entries used.
- `node --test harness/scripts/check-consumer-safe-paths.test.mjs` — exit 0.
- `git diff --check` — exit 0.
