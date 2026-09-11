# Dispatch-budget runner-support verification — 2026-09-11

## Scope

The Goldfish and Critic briefing templates previously said that no automated
per-subagent counter existed. That statement had become false after the Claude
hook was repaired and the runner-neutral policy core was extracted. The four
canonical and vendored templates now state the measured support boundary:

- Claude Code counts authenticated subagent calls through its installed hook
  and restricts over-cap calls to closing acts.
- Codex and Antigravity have no authenticated live-call adapters yet. Their
  briefing cap remains a behavioral duty; the shared policy core alone is not
  presented as enforcement.

This package does not claim native Codex sandbox or App-Server acceptance.
Those host-specific checks are deferred to the dedicated native-Windows work
package.

## Focused verification

- `node --test plugins/pipeline-core/hooks/guard-dispatch-budget.test.mjs plugins/pipeline-core/lib/dispatch-budget-core.test.mjs` — 45 passed, 0 failed (host-bound because the WSL workspace sandbox blocks the suite's child processes).
- `node plugins/pipeline-core/scripts/check-vendored-template-sync.test.mjs` — 4 passed, 0 failed.
- `node plugins/pipeline-core/scripts/codex-isolated-critic-protected-preimage.test.mjs` — 4 passed, 0 failed after re-pinning the changed Critic contract.
- `node harness/scripts/check-doc-contracts.mjs` — valid.
- `node harness/scripts/check-critic-contract-citations.mjs` — 8 classes green.
- `git diff --check` — clean.

The two open Nova B budget items remain open because cross-runner live adapters
and estimate calibration are separate implementation work.
