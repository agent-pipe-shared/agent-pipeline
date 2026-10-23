# K67-K1D-E-DISCARD-CALL protected notes

Protected diff: `scratch/agent-out/k67-protected.diff` (only `plugins/pipeline-core/scripts/pipeline-state.mjs`, +14 lines, `git apply --check` clean from the main checkout).

## What changed
discard-feature applies the orphan release inside `writeState`'s `afterCommit`, i.e. under the State lock (`stateLockHeld: true`), so `applyOrphanSessionCleanupBindingRelease` stops at `receipt-committed` and never reaches the member-first finish step. The diff imports `finishOrphanSessionCleanupBindingRelease` and, right after `writeState` returns ok (State lock released), calls it when `releasePlan.status === "ready"` and `written.afterCommit.release.status === "receipt-committed"`. A throw prints the existing `orphan-cleanup-required (<code>)` message and returns 2 (public State is already committed; the advertised `release-orphan-binding` replay completes it, replay-safe: the member step returns `none`). The call is overridable through `deps.finishOrphanSessionCleanupBindingReleaseFn` like the plan/apply deps. The `not-needed` path and stubbed applies (status other than `receipt-committed`) are untouched.

## Measured (strictly one suite at a time, TMPDIR under the main checkout's gitignored `scratch/`; a TMPDIR under /tmp fails every registry fixture with `domain-ancestor-unsafe`, world-writable ancestor)
| suite | before | after the call |
|---|---|---|
| `scripts/pipeline-state-discard-feature.test.mjs` | 11/11 | 11/11 |
| `lib/session-cleanup-recovery.test.mjs` | 39/39 | 39/39 |
| `scripts/session-cleanup-binding.test.mjs` | 66/67 | 66/67 (K72, two quiet full runs, 591 s and 583 s; the only red is case C below; 'multiple empty legacy orphans ...' green with and without the call) |
| `lib/session-cleanup-lost-binding.test.mjs` (with new E5b) | 7/7 | 8/8 (new case included) |
| `harness/scripts/check-consumer-safe-paths.test.mjs` | - | 9/9 |

Gap: no existing test drives the real `discard-feature` verb through a live binding with a registry member; the 11/11 shows no regression, the new call itself is exercised only by reading. A protected-path end-to-end test would need the signed sitting.

## Case C
'neutral coordinator-close release is private, byte-stable, and replayable': baseline red (before the call). First failing assertion: `SessionAuthorityError onboarding-continuity:namespace-drift` (SDC-AUTHORITY-CAS) thrown from `reserveSessionAuthorityMember` (onboarding-continuity.mjs ~9576) during a later bound start, a member in flight (armed) while the namespace changed outside the registry. This case uses the `release-closed-feature` route, not the orphan route, so the discard call cannot reach it. Verdict after the call (K72): still red, unrelated to the call; diagnosis in `scratch/agent-out/k72-notes.md`. Not fixed (outside this briefing's scope).

## Architecture ratchets (not raised)
With the diff applied: `pipeline-state.mjs` 13833 lines against the accepted 13819 (+14). Raising `architecture/boundary-policy.json` to 13833 belongs to the sitting. The E5b test went into the small `lib/session-cleanup-lost-binding.test.mjs` (384 lines) so `session-cleanup-binding.test.mjs` stays at its accepted 3138.

## Proposed commit message (operator commit of the protected part)
```
fix(state): finish the orphan binding release after discard-feature's State lock (D73 E)

- discard-feature applies the orphan release under writeState's State lock, so
  the apply stops at receipt-committed.
- After writeState returns, call finishOrphanSessionCleanupBindingRelease: the
  registry member is released first, the private binding deleted second, the
  registry healed and read back strictly.
- A failing finish reports orphan-cleanup-required with its code; the rerun of
  release-orphan-binding is replay-safe.

AI-Assisted: true
Dispatch: K67-K1D-E-DISCARD-CALL (goldfish)
```
