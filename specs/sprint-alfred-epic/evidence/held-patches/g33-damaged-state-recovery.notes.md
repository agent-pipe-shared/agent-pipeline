# G33 damaged-State recovery: post-close push-audit updatedAt drift (held kernel patch)

Slice W3-G33-DAMAGED-STATE-RECOVERY-C2-20261026. Criterion AC-115 (a lifecycle State must not refuse its own recovery), RV-7 (Spec 20.1 level 1 intrinsic known-shape repair, ADR-0082).
Patch: `g33-damaged-state-recovery.patch` (13269 bytes, sha256 `789dd4e4dcd45be2ed08f3bc91a0fbfb5296c5a182ed5c25ad32fcf4a9971727`). Touches two files; the kernel file is NEVER_LIFTABLE, so the PO applies it in the bundled signed ceremony.

## Preimages and apply check

| File | Preimage SHA-256 |
|---|---|
| `plugins/pipeline-core/lib/onboarding-continuity.mjs` | `5735a27fabf6e91969362bb57d30bcbae44e7627f890244f5a72862ce52c415b` |
| `plugins/pipeline-core/lib/onboarding-continuity.test.mjs` | `007ef835af25f2e150065cf5da93b9755b35159cf93076ca68cc5927d43b18b5` |

`node scripts/pack-held-patch.mjs 35e93ec928837d2d7b36f383b1931c702ef0832c ...`: `git apply --check` status 0 for both files.

## What the patch does

A fifth bounded repair on the existing route (shape of `normalizedContinuity` / `repairedSharedCloseEvidenceState`):

- Diagnosis code `CONTINUITY-POST-CLOSE-AUDIT-TIMESTAMP-DRIFT`, emitted where a damaged inactive State is classified, only when the shared-close-evidence diagnosis is not repairable and there are no other drifts.
- Admitted only if a `structuredClone` with `updatedAt` set to the last lifecycle timestamp passes `validClosedTransitionState` or `validDiscardedTransitionState` unchanged otherwise, with exactly one such candidate (a closed+discarded tie is refused), AND the drifted `updatedAt` is provably a push-audit timestamp recorded in the State itself and later than the lifecycle timestamp: equal to `pushApproval.lastApproved.approvedAt`, or to a `criticalProofConsumption` entry of kind `push` `consumedAt`, or (with a well-formed `pendingPushChallenge`) not past that challenge's `expiresAt`.
- Repair proposal (`repair-post-close-audit-timestamp-drift`) sets `updatedAt` back to the lifecycle timestamp and changes nothing else; approval and challenge records stay byte-equal.

## Safety reasoning

- `validClosedTransitionState`, `validDiscardedTransitionState` and every existing refusal are unchanged; the strict validators are reused as the admission test.
- Only `updatedAt` changes; no audit record is dropped or rewritten.
- Provenance must be in the State itself; an unexplained drift stays unsupported.
- Six refusal controls (tests): no push audit record at all; drift matching neither approval time nor a consumption; pending challenge whose drift is not later than the lifecycle timestamp; malformed closed entry; active feature; ambiguous closed+discarded tie.

## Counts

Work copy under `scratch/agent-out/w3-g33/work` (scratch is untracked; evidence captured with `capture-evidence.mjs`).

| Run | tests | pass | fail | Evidence |
|---|---|---|---|---|
| RED, original lib + 10 injected cases | 318 | 313 | 5 (OBC309-OBC312, OBC264) | `ev-red.txt` |
| GREEN round 1, patched lib | 318 | 315 | 3 (OBC264, OBC311, OBC312) | `ev-green-continuity.txt` |
| GREEN round 2, patched lib + fixture fix | 318 | 317 | 1 (OBC264 only) | `ev-green2-continuity.txt` |

Round-1 failures OBC311/OBC312: a defect in my own new discarded fixture, not the implementation. It carried a prior `closedFeatures` entry plus a discard, which is identical in shape to the "ambiguous closed and discarded tie" refusal case, so the implementation correctly refused it. Fix (justified by AC-115 and the tie control, no weakening): the discarded fixture no longer contains `closedFeatures`.

Pipeline-state suite in the work copy: not verifiable. `pipeline-state.test.mjs` aborts at fixture setup (`prepareCalibrationArchitectureFixture`, `ARCHITECTURE-ENTRY-ALIAS-OR-NONFILE`, 'blocked' !== 'ready') because the scratch work tree symlinks root entries. `scripts/pipeline-state.mjs` is not touched by this patch, so that suite is unaffected by it (`ev-green-pipeline-state.txt`).

## OBC264: pre-existing, unrelated

`OBC264 planOnboardingBootstrapBind: mechanical markers stay mandatory while feature and epic defer acknowledgement` fails identically on the unmodified lib: `KickoffError BOOTSTRAP-BIND-DESIGN-AUTHORING-REQUIRED`, "author the generated PRD and Spec before binding their bytes", thrown by `buildCoordinatorSourcedPromotionPlan` (~5793) via `planOnboardingBootstrapBind` (~7794), test line ~4443. Not touched.

## Writers of `updatedAt` in `scripts/pipeline-state.mjs` (survey)

- `approve-push` challenge (~12332) and final approval (~12436): fixed by 9ed1a2800 (inactiveLifecycleTransitionTimestamp). This patch repairs States written before it.
- `approve-deploy` (~13132), `consume-deploy` (~13177), `clear-deploy` (~13214): set `updatedAt` on a possibly inactive State and CAN produce the same damage. Follow-up, NOT fixed here (the diagnosis here only proves push-audit provenance, so deploy-shaped drift stays refused).
- evidence repin (~10497): unverified.
- `close-feature` (~12812) and `discard-feature` (~12923): correct (they are the lifecycle transitions).
- Other writers act on active States.

## Overlap with other held patches

`k64-onboarding-continuity-staging-banner.patch` (hunk near line 6961) and `k80-closed-release-member-step-protected.patch` (hunks near lines 3262-3409 and 9267-9355) touch the same lib file; this patch's hunks sit in the ~427-500 and ~1500-1760 regions, so no hunk overlaps (line offsets shift only). The ref-Git and HGO patches touch other files. The test file is touched by no other held patch.

## Proposed commit message

`fix(continuity): repair post-close push-audit updatedAt drift`
