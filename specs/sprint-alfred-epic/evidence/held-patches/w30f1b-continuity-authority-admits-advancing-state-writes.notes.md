# w30f1b — the continuity authority admits the two State writes that advance the continuity revision by exactly one, where it can be proven (candidate 30f, dispatch C30F-G1B)

Order: apply the 30e chain, then the held patch w30f1 (C30F-G1), then this one. It is the delta `273787853..HEAD` of a slice clone started from the chain plus C30F-G1 and edits the same lines of
`onboarding-continuity.mjs` and `pipeline-state-revocation.test.mjs` as w30f1, so it does not apply to the real checkout (nor to the 30e chain alone) before both. Criterion binding: AC-108 is the closest existing accepted
criterion; the PRD and the Spec are unchanged.

## Result first (read this before applying)

The admission works for a State with NO session cleanup binding and no live member (proven through the real CLI). It does NOT work, and cannot be made to work inside this brief, for a State with a BOUND session:

- Observed (RED, with the first version of this patch, bound session built with the controlled runtime fixture and `bindOnboardingSessionCleanup`): `cancel-submitted-plan` WROTE the State (submission withdrawn, continuity revision 2 to 3) and
  was then refused by the registry with `SDC-AUTHORITY-CAS: state-legacy-operation-effects`, reporting "no success". That is worse than the clean refusal G1 gave.
- Cause (read, then observed): a bound session has a legacy lifetime keyed by `continuitySharedStateLogicalLegacyKey`, which digests the WHOLE cleanup identity (revision and continuity object included). The advance changes the key, so the
  registry check `pre[i].legacyOperationsSha256 !== post[i].legacyOperationsSha256` (`session-authority-registry.mjs`, `executeSourceOwnedSessionAuthorityStateWrite`) fires after the write. Fixing it needs a change to that key (baseline handling) or to
  the registry check; both are forbidden by this brief.
- What the patch does about it: `continuityObserveSharedStateWrite` refuses an advancing entry BEFORE the write, with a typed reason, whenever a session cleanup binding, an orphan binding or a live member exists. The case "refused cleanly while a
  session-cleanup binding is held" pins that (exit 2, typed text, State bytes unchanged). So bound sessions keep a clean refusal; they are not fixed.
- Route loss: for a bound session the refusal of `cancel-submitted-plan` now names the `plan-recovery` repair, where C30F-G1 alone named `reopen-design --by <name>` (an admitted entry that voids the submission). First follow-up: one production
  line (the route for that entry in the guard's reason), one assertion, both suites again.
- Scope of the guard: only the continuity producer's legacy lifetime is guarded. The observations of other producers under an advancing write ran only in the unbound fixture.
- Open question for the coordinator: whether the Codex report's session was bound. If it was, this patch does not clear that report; the follow-up is a decision to change the legacy key (or the registry check) so it is stable across a continuity
  advance of exactly one, which is a change to the CAS/baseline handling and needs its own brief.

## What was found (read from the code, observed through the real CLI)

`continuityVerifySharedStateWrite` required the cleanup identity (`continuitySharedStateCleanupIdentity`) to be equal before and after the write. The writers of `cancel-submitted-plan` and `cancel-mixed-plan-state` pass
`allowContinuityAdvance`. Their transitions (`cancelSubmittedPlan`, `cancelMixedPlanState` in `plan-spec-state-v2.mjs`) change exactly three things of the continuity object: `revision` to `revision + 1`, `nativeContinuation`
to `null` and `resume` to `{mode: "immediate", sourceRevision: <new revision>, reasonCode: "active-turn"}`. `writeState` (`pipeline-state.mjs`) accepts that advance only as `expectedRevision + 1`. In the identity, `revision` and
`continuity` are the only fields that move; the new case asserts the rest of the continuity object is byte-equal after the write.

## What it changes

- `lib/onboarding-continuity.mjs`
  - `continuityAdvancingStateEntries`: a second closed literal set, exactly `state.cancel-submitted-plan` and `state.cancel-mixed-plan-state`. The set of five non-advancing entries is unchanged.
  - `continuityStateEntryRefusalReason(entry)` (exported): `null` for an entry of either set, otherwise the typed G1 reason. `continuityObserveSharedStateWrite` uses it, so the two entries pass the entry check; `set-feature` and
    `set-phase-with-calibration` keep the typed refusal.
  - The bound-session guard described above (advancing entries only).
  - `continuityAssertStateWriteIdentity(entry, prepared, current)` (exported, called by `continuityVerifySharedStateWrite` in place of the plain equality): the identity must equal the prepared one (an exact replay writes nothing and leaves it
    unchanged). For an entry of the advancing set only, it may also equal `continuityAdvancedIdentity(prepared)`: the prepared identity with `revision` and `continuity.revision` + 1, `continuity.nativeContinuation` null and the resume above, every
    other field (root, path, neutral, mode, activeFeatureId, sessionCleanup, orphanBinding, discardedEntry, release proof and receipt, privateBinding, closedFeatures, discardedFeatures, cleanupReleases, binding, release, all other continuity fields)
    byte-equal. A prepared identity without a numeric revision, or at `MAX_SAFE_INTEGER` (the writers refuse it too), admits no advance. The CAS checks (selected-path postimage, non-selected namespaces, producer record, live members, legacy
    operation digest) are untouched and still run. Note: the allowance also covers `nativeContinuation` to null, which the brief did not name but the writers perform.
  - The G1 refusal text no longer lists the admitted entries: seven names do not fit the 240 characters `describeStateAuthorityRefusal` prints (the longest refused entry already used 237 of them with five). The reason names the entry,
    `nothing written` and the repair. The per-entry route of `cancel-submitted-plan` (`reopen-design`) is gone with the entry.
- `scripts/pipeline-state-revocation.test.mjs`
  - `neutralCatalogueFixture`: the approved-course fixture with its three authority files moved to the neutral tier (`project/pipeline.yaml`, `project/pipeline.json`, `project/pipeline-state.json`), reopened to design, registry initialised
    with the real observer ports. Nothing mocked; the existing fixture helper is not changed.
  - cancel-submitted-plan through the real CLI (unbound session): refused before the change (RED: `state.cancel-submitted-plan is not admitted`), succeeds after it; submission withdrawn, `planCancellation` bound to the submission digest,
    revision + 1, resume and null native continuation, the rest of the continuity object byte-equal, an exact replay is a zero write and admitted, and a second `submit-plan` works.
  - cancel-mixed-plan-state through the real CLI (unbound session): the mixed record is built from the real retained approval of the earlier design plus the real invalidation `reopen-design` wrote; succeeds, replay is a zero write.
  - Bound session: the clean refusal above.
  - `continuityAssertStateWriteIdentity` cases (decision function, synthetic identity): for both advancing entries the advance and the unchanged identity pass; revision + 2, revision - 1, a different resume reason or source revision, a kept native
    continuation, a changed queue head, continuity feature, activeFeatureId, closedFeatures, discardedFeatures, cleanupReleases, sessionCleanup, privateBinding, mode, path, binding, release and a top-level revision that does not follow the
    continuity revision are each refused with `SDC-AUTHORITY-CAS`. For the five non-advancing entries the unchanged identity passes and the advance is refused; `set-feature` and `set-phase-with-calibration` get no allowance.
  - G1 test restated (QG-04, the rule changed): its two driven CLI refusals are now admissions. The typed reason of the refused entries and the null reason of the seven admitted ones are asserted on `continuityStateEntryRefusalReason`; a
    control keeps that the reopen-design and the two advancing entries pass the entry check in the legacy-path fixture (they are refused later by the neutral-State check).

## Not changed

- The CAS checks, the snapshot, baseline and witness handling, the five non-advancing entries and their exact equality, `pipeline-state.mjs`, `session-authority-registry.mjs`, `onboarding-continuity.test.mjs`.
- No existing helper derives the advance (searched `allowContinuityAdvance`, `continuity-state.mjs`, `plan-spec-state-v2.mjs`: each writer inlines `continuity.revision + 1` and the resume shape). The allowance therefore restates the writer's rule once,
  in `continuityAdvancedIdentity`; the real-CLI cases bind it to the writers (a drift between them turns those cases red).

## Not proven

- A bound session is not fixed (see above). The Codex case is cleared only if its session was unbound.
- The two refused entries cannot be driven through the CLI to the entry check: `set-feature` refuses on an active continuity before its writer, `set-phase` with a calibration refuses on the calibration tiers (probed in the neutral and the legacy
  fixture). Their typed reason is tested where it is built, not through a run, so the `fail(..., {reason})` wiring of the refusal is no longer tested end to end for them (the bound-session case does test it end to end for the advancing entries).
- The refusals of changed identity fields are tested on the decision function with a synthetic identity, not by making a real writer produce them (no seam lets a test change State between the write and its verification).
- `cancel-mixed-plan-state` is shown on a mixed record assembled in the test from real parts, not produced by a live run. A live Codex run, the full Verify and a Critic review are not done.
- Two new exports (`continuityStateEntryRefusalReason`, `continuityAssertStateWriteIdentity`) exist for the tests; a public-surface or export inventory check, if any, is not run here.
- Test-first: only the cancel-submitted-plan case was run RED before the production edit; the other new cases were written after it.
