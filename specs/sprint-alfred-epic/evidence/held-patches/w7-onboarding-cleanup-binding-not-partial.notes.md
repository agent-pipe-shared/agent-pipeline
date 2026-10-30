# Onboarding no longer ends partial when cleanup recovery only lacks a session-power-controlled invocation (AC-160, D48)

Held patch `w7-onboarding-cleanup-binding-not-partial.patch`, built in a scratch clone at candidate d901a2ab1. Nothing applied.

## Behaviour

- `KickoffError` takes an optional `reason` option (was: only `committed`). The refusal in `bindOnboardingSessionCleanup` keeps its code and message and carries `reason: 'continuity-invocation-unbound'`.
- `partialCleanupRecoveryResultCore`: when the auto-applied recovery throws code `SDC-AUTHORITY-UNAVAILABLE` with that reason (typed, never message text) and an observation is carried, a `cleanup_recovery_deferred` warning (severity warning, path `$.authority.sessionCleanup`, no nextAction) is added to the observation warnings and the recovery is treated as not pending. Every other apply failure is unchanged.
- Without an observation (legacy callers) the refusal still yields today's partial result.

## Evidence

- RED before production edit: new case in "runtime-current bootstrap exposes cleanup recovery..." failed `'partial' !== 'ready'`.
- Clone: project-onboarding-v3.flap 15/15, same failing-name set as baseline for project-onboarding-v3.test.mjs (5 pre-existing failures: push gate, NVA-R40-PROJDRIFT, SECGATE-1, configure verify codex/antigravity) and session-cleanup-binding.test.mjs (36 pass / 32 fail in both). The new case is green.
- Revert proof: with production reverted the new case fails again; restored byte-equal. Apply-check on the plain candidate exit 0.

## Not verified

Full Verify, Critic, PO acceptance. The test file fails at file level in both clone and baseline because of the 5 pre-existing failures.
