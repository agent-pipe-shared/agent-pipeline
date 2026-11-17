# w30i3 — a session with a bound session-cleanup binding completes the two advancing State entries end to end (candidate 30i, dispatch C30I-S2B)

Order: apply the 30h chain plus the skill split and the agent fields (the slice clone's fifth base), then this patch. It is the delta of a slice clone started from that state and edits the same lines of `onboarding-continuity.mjs` and
`pipeline-state-revocation.test.mjs` as w30f1/w30f1b, so it does not apply to the real checkout before that chain (an `apply --check` against the real HEAD is expected to fail; against the chain base it exits 0).
Criterion binding: AC-108 is the closest existing accepted criterion; the PRD and the Spec are unchanged. The Critic is suspended for candidates of this repository: this change is covered by tests only, no Critic review was run.

## What was found (reproduced first, then fixed)

- Failing-first: the two new bound-session cases (cancel-submitted-plan, cancel-mixed-plan-state, driven through the real CLI with the controlled runtime fixture and `bindOnboardingSessionCleanup`) were RED against the original code with the
  `C30F-G1B` refusal (`not admitted while a session cleanup binding is held`).
- With the refusal switched off in the clone (temporary, not in the patch) the write ran and the registry refused AFTER it with `SDC-AUTHORITY-CAS: state-legacy-operation-effects`, as observed once before.
- Cause: the KEY, not the digest. `readBaseline` keys the bound session's legacy lifetime by `continuitySharedStateLogicalLegacyKey`, which hashes the whole cleanup identity including `continuity.revision`. After the +1 advance the lookup missed and a
  fresh legacy handle was minted with `bindingSha256` = the new key, so the post observation was a different operation. Normalizing the digest alone (design option A as worded) could not have helped: the handle itself differed. The fix keeps the
  digest and the registry check untouched, which confirms it: the same handle before and after makes the digests equal.
- Premise corrected: a bound session always has exactly ONE live member (the bind creates it). The old guard (`members.length > 0`) therefore refused every bound session, not only unusual ones.

## What it changes (design option B, shaped as the briefing suggested)

All in `lib/onboarding-continuity.mjs`:

- `continuityObserveSharedStateWrite`: for an advancing entry of a bound session it records a PENDING ADVANCE on the port data (`data.pendingAdvance = {identity (prepared cleanup identity), tuple, key (the prepared legacy key)}`); every other observe
  sets it to `null`. `continuityVerifySharedStateWrite` clears it right after its legacy digest comparison (which still runs and still compares). It lives on the port data of one in-process write and is never persisted.
- `readBaseline`: when no handle exists for the computed key, `continuityLegacyHandleAcrossAdvance` returns the SAME legacy handle and stores it under the new key, only if ALL hold: a pending advance exists; the current cleanup identity equals
  `continuityAdvancedIdentity(pending.identity)` exactly (revision + 1, the writer's resume, native continuation null, every other field byte-equal); the tuple is the pending one; and the key recomputed from the PREPARED identity with the CURRENT non-selected
  source facts still equals the prepared key (so no other fact changed). Otherwise a different lifetime is minted, the observation differs, and `state-legacy-operation-effects` fails as before. Same pattern as the companion path (`data.legacy.set(key, operation handle)`).
- `continuityLegacyKeyOf` is the old key computation split out (the bytes of the key are unchanged, so nothing on disk or in memory written by the previous code stops verifying); `continuitySharedStateLogicalLegacyKey` and
  `continuityLegacyHandleAcrossAdvance` are exported for the tests, like `continuityAssertStateWriteIdentity`.
- The `C30F-G1B` refusal is restated to fire only for what is genuinely not admissible, before the write: a binding of ANOTHER session (the current requester from `inspectSourceOwnedCurrentAuthorityContext` is not the bound tuple, or cannot be resolved:
  fail closed), more than one live member, or a live member with no binding (a bind in flight). Its text, `continuityAdvanceRefusalReason`, names BOTH routes (`reopen-design --by <name>`, restored from the first slice G1 text; and
  `session-cleanup.mjs plan-recovery`) and no longer applies to the ordinary bound case. An orphan binding and a released/terminal member were already refused before the write by the generic check above it; that now-dead orphan clause of the old
  guard is removed.

In `scripts/pipeline-state-revocation.test.mjs` (the only test file changed):

- The case that pinned `not admitted while a session is bound` is restated (QG-04, the rule really changed) as two end-to-end cases: a bound session completes cancel-submitted-plan (submission withdrawn, `planCancellation` bound to the digest, State
  advanced by exactly one, an exact replay is a zero write, the same session is still bound and releases against the advanced State) and cancel-mixed-plan-state (same checks).
- A bound session of ANOTHER runtime (a second controlled fixture) is refused before any write (exit 2, State bytes unchanged, both routes named, no `state-legacy-operation-effects`).
- Decision-level cases on `continuityLegacyHandleAcrossAdvance` with synthetic snapshots: the exact +1 advance with a changed SELECTED State follows the handle; revision + 2, another resume reason, a changed activeFeatureId, a changed private binding, a changed
  or removed non-selected source fact (the tampered legacy operation), another session's tuple, and no write in flight are each NOT followed (nothing stored under the new key).
- The refusal text fits the 240 characters `describeStateAuthorityRefusal` prints, for both entries.
- The existing `continuityAssertStateWriteIdentity` cases (revision + 2, revision - 1, other entries refused) are unchanged and green.

## Not changed

- `session-authority-registry.mjs`: the check `state-legacy-operation-effects` is untouched and strict; the registry needed no change. No versioned schema id and no on-disk digest changed. No widening of what a session may write to State; the entry sets are unchanged.
- The non-advancing entries, the companion path, the unbound path (byte-for-byte unchanged), and the other suites of the write list (not edited).
- `submit-plan` while bound is refused with `SDC-AUTHORITY-HELD: state-operation-in-flight` (probed once, independent of this change: it is the companion path). A second consecutive advance on one bound session therefore cannot be driven through the CLI (it needs a
  new submission); only the single advance, its replay and the decision cases cover the chain. This is an adjacent finding for the coordinator, not repaired.

## Not proven

- An orphan binding is not driven end to end: it needs a State without the active continuity, which the cancel writers refuse before the authority; the generic orphan refusal above the restated guard is relied on, not newly tested.
- A tampered legacy operation is tested at the decision function (a changed non-selected fact is not followed, so a different lifetime would be minted), not by changing a file between the registry's pre and post reads (no seam exists for that); the registry
  comparison itself is unchanged.
- The current-session test uses the controlled runtime fixture; a live Claude or Codex run, where the requester of the State write is resolved from the real session, was not run. If it cannot be resolved there, the write is refused before it with both routes named (fail closed), which equals today's behaviour.
- Full Verify, the other suites naming the write list (registry, session-cleanup-binding and the others) and a Critic review were not run here; only `pipeline-state-revocation.test.mjs`, `onboarding-continuity.test.mjs` and `continuity-state.test.mjs` as named in the briefing.
- Test-first: the two end-to-end cases were run RED before the production edit; the decision and refusal-text cases were written with the implementation.
