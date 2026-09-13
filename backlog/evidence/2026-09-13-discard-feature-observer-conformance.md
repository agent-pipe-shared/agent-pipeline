# ALF-A5-II-OBSERVER-CONFORMANCE — writer/observer conformance verification suite and discard-feature closure

Evidence artifact for the closure of backlog item `2026-08-27-discard-feature-writes-a-state-the-cleanup-observer-rejects-and-strands-the-session.md` per PRD §7 AC-3 and WP-A5(ii).

## 1. Incident Summary

On 2026-08-27, executing an epic switch (`discard-feature` followed by `set-feature`) produced a stranded session:
1. `discard-feature` succeeded, leaving a state with `discardedFeatures[]` and no `activeFeature` or `continuity`.
2. While `classifyOnboardingContinuity` classified this state as `valid` (via `validDiscardedTransitionState`), `observeSessionCleanupState` failed with `SESSION-CLEANUP-STATE-MALFORMED` because it only recognized `validClosedTransitionState` and `validDesignTransitionState`.
3. The resulting readiness status `partial` caused `guard-lifecycle-ready` to block all commands except its recovery lane, stranding the session because `set-feature` was blocked.

## 2. Observer Fix & Conformance Hardening

The call-site fix in `observeSessionCleanupState` (`plugins/pipeline-core/lib/onboarding-continuity.mjs`) ensures that `validDiscardedTransitionState` is accepted alongside `validClosedTransitionState`:
```js
if (!validClosedTransitionState(observed.root, state) && !validDiscardedTransitionState(observed.root, state)) {
  fail("SESSION-CLEANUP-STATE-MALFORMED", "Pipeline machine state cannot prove a cleanup descriptor");
}
```
Additionally, `observeSessionCleanupState` is exported from `plugins/pipeline-core/lib/onboarding-continuity.mjs` to enable direct testing and continuous conformance observation.

To prevent regression across the entire lifecycle rather than only for the discard instance, an exhaustive observer conformance test suite is established:
`plugins/pipeline-core/scripts/pipeline-state-observer-conformance.test.mjs`.

## 3. Conformance Verification Suite

The conformance suite asserts that all sanctioned `pipeline-state.mjs` transition verbs:
- `init` (kickoff initialization & `continuity-init` subcommand)
- `set-feature`
- `submit-plan`
- `approve-plan`
- `set-phase`
- `close-feature` (both design close and continuity close)
- `discard-feature` (with and without prior closed features)

produce machine states accepted without error by BOTH:
1. `classifyOnboardingContinuity` (`status === "valid"`)
2. `observeSessionCleanupState` (returns without throwing `SESSION-CLEANUP-STATE-MALFORMED` or any other error)

Specifically, after `discard-feature` (from an active feature with null Result), `observeSessionCleanupState` does NOT throw `SESSION-CLEANUP-STATE-MALFORMED` and `classifyOnboardingContinuity` classifies the state as `valid`. Additionally, the subsequent `set-feature` succeeds and also produces a state accepted by both observers, confirming that the session is unstranded.

## 4. Test Execution & Verification

- Test suite: `node --test plugins/pipeline-core/scripts/pipeline-state-observer-conformance.test.mjs` passed.
- Backlog consistency: `node plugins/pipeline-core/scripts/check-backlog-state.mjs` passed.
- Suite registration: registered under `harness/scripts/verify.mjs` (`pipeline-state-observer-conformance-tests`).
- Capability inventory: registered in `docs/product-capability-inventory.json`.
