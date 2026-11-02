# w113 - restate four pins that predate candidate 18

## What

Four test-only restatements (QG-04 comments, intent kept) for reds that were already present at the candidate 17 base, so not caused by candidate 18 but real in the main tree:

- `pipeline-state.test.mjs` (`PS54p`, `WRa`, `WRd`, `WRe`, `WRi`): a printed `feature-package-plan` preview carries its own `planSha256` (digest of the plan without that field, line `sha256CanonicalJson(plan)` in `pipeline-state.mjs`); the test hashed the parsed output including the field, so every apply of a printed preview was refused. The helper now takes the printed digest, and `PS54p` expects the field.
- `pipeline-start-preflight-antigravity-hard-enforcement.test.mjs`: the Codex preflight key list gains `runnerCapabilities`, which the sibling `pipeline-start-preflight.test.mjs` already pins for every runner.
- `check-backlog-state.test.mjs` (`CBS16`): the two D222 lost-reconciliation exceptions (events 2356, 2358) are reported only on a checkout that lacks those commits; the accepted set must be a subset of the two and nothing else.
- `orphan-descriptor-recovery-never-offers-the-running-session.test.mjs` (AC-203): since `b9fb54aad` the requester's descriptor is derived for the invoking runner, and Claude is recognised by `CLAUDECODE=1`; the injected env now carries it.

## Why

Found by the Full Verify of candidate 18 (all four files red at the candidate 17 base clone and on the main tree).

## Verification (orchestrator, in a clone at the applied candidate 18 tree)

`pipeline-state.test.mjs` all PASS (no FAIL line), antigravity hard-enforcement 23/23, `check-backlog-state.test.mjs` 1/1, AC-203 pin 7/7. Patch applies to HEAD (`apply --check` exit 0).

## Apply order

After w112 (last of the fix patches).

## Not proven

`codex-isolated-critic-protected-preimage-tests` stays red on purpose: its pinned hash of `plugins/pipeline-core/skills/critic-review/SKILL.md` is a trust anchor of the autonomous Critic, and re-pinning it is the PO's decision (class A of the greenfield findings, "C28 re-pin step"), not an agent fix.
