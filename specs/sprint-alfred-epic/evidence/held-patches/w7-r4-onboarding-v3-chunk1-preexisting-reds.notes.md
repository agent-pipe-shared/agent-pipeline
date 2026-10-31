# W7-R4 project-onboarding-v3: the four chunk-1 cases that are already red on plain HEAD

Slice W7-R4-ONBOARDING-V3-CHUNK1-PREEXISTING-REDS-20261031. Targeted delivery: green. The patch (6572 bytes, two files,
`plugins/pipeline-core/lib/project-onboarding-v3.mjs` and `.test.mjs`) applies on the candidate (`git apply --check` exit 0, driver
`patch` mode). It is cut against candidate f62f1649a plus the fourteen candidate-13 patches and applies after them.
Batch Critic, final Verify and PO acceptance stay pending.

## Result per case (cause, deciding commit, decision)

Red proof: probe of the four cases on the unedited clone: 6, 45, 90, 92 all fail (messages as in the briefing); the baseline run
`base1` (clone2, no change) lists the same four by name. Green proof: same probe on the final clone state: 6, 45, 90, 92 pass.

1. Case 6, orphaned descriptor repaired through the top-level bootstrap inspection: **(b) code regression, fixed in code.**
   Turned red by ee9416a25 (D48 deferral). `partialCleanupRecoveryResultCore` now returns `null` after pushing
   `cleanup_recovery_deferred`, and the wrapper `partialCleanupRecoveryResult` returned `null` straight away, so the
   ALFRED-RDY-20261005 downgrade (0b9af703a: a FOREIGN zero-authority descriptor is one typed `cleanup_residue_foreign` warning carrying
   the digest-bound archive actions, never a binding) was never computed. The case still states that contract and its fixture is a
   real foreign orphan, so the assertions are kept untouched. Fix: when the core returned `null` for a `session` inspection and added the
   deferred warning in this call, the wrapper also pushes `foreignDescriptorResidueWarning(...)` through `pushReadyWarning` (so the
   closed code list is respected). Both warnings are true and the ready gate admits both
   (`validReadyDiagnostics`: at most one deferred plus any number of foreign).
   - The new branch (`result === null`) and the existing downgrade (`result !== null`) are mutually exclusive, so a doubled
     `cleanup_residue_foreign` cannot occur.
   - The D48 case in "runtime-current bootstrap exposes cleanup recovery..." pins `deferred.diagnostics.length === 1`. It stays green
     only because its fixture has no descriptor on disk (`classifyActiveSessionDescriptors` finds no foreign one), so no foreign
     warning is added. That dependency is real and is not weakened.
2. Case 45, five-wrapper pending-asks single-helper source pin: **(a) stale fixture.** 4ea7a86b7 (the 0.7.0 held-patch bundle)
   inserted `withPendingProjectAttributesGapAsk` into the chain, which is now six wrappers long and still spelled out exactly once
   (inside `withAllPendingOnboardingAsksAttached`). Only the pinned spelling was updated; the intent (one named helper, never a
   second hand-copied chain) is unchanged. The case keeps its name ("five-wrapper") so no name pin moves.
3. Case 90, PRD language at promotion: **(a) fixture order, restated; deciding commit not isolated.** `submit-plan` requires the
   governed architecture design package (ARCHITECTURE-FITNESS-NOT-READY; fitness enforcement for net-new paths arrived with
   a6641cce4 / 9ce6c2361, not bisected). The fixture materialized the package BEFORE promotion; promotion then rewrites
   `pipeline.user.yaml` (the language correction), which is inside the disposition scope, and the decision subject binds the
   repository candidate commit and tree (`buildAdoptionSubject`). Evidence is the order change alone: moving
   `materializeArchitectureDesignFixture` to after promotion and before `submit-plan`, the order the sibling cases at kickoff use,
   makes the case pass with every assertion unchanged. The causal link to the candidate binding is a reading of the code, not
   separately bisected. (bf8c28986 only introduced the call in its old position.)
4. Case 92, coordinator-sourced bind: **(a) stale fixture.** 5e939278b introduced `stagingDesignNeedsAuthoring` and
   BOOTSTRAP-BIND-DESIGN-AUTHORING-REQUIRED ("author the generated PRD and Spec before binding their bytes"); the precedent fix is
   29c87679f (OBC264 marker case). The fixture now finishes the generated draft with the file's own
   `completeGeneratedStagingDraft` before applying the po-language mismatch. Assertions are unchanged.

No case was weakened, skipped or deleted; no `test(` was added or removed (240 cases), so no pinned count moves.

## Evidence (finished logs in scratch/agent-out/w7r4, machine-written by the driver)

- `c1.project-onboarding-v3.test.mjs.log` (clone): "240 cases across 2 sequential chunks of 6 shards, 2 shards failed"; failing
  names are exactly the R3 STOP pair (seeded push gate; SECGATE-1), chunk 0 shards 3 and 4. All chunk-1 shards green.
- `base1.project-onboarding-v3.test.mjs.log` (clone2): "5 shards failed": the same pair plus the four cases of this slice.
- onboarding-init.test: c1 58 pass 0 fail; base1 58 pass 0 fail.
- project-onboarding-e2e.test: c1 and base1 both fail the same single case ("in-process driver follows returned actions and preserves
  the Codex legacy-advisory approval boundary", deepStrictEqual), baseline-identical.
- check-verify-case-completion.test: c1 32 pass 0 fail; base1 32 pass 0 fail. No pinned count moved.
- Side suites on the final production state (`c1side.*` logs): project-onboarding-ready-gate.test 30 pass 0 fail (includes the
  pin that the gate admits exactly the producer's warning codes); the host-crash pin test for `foreignDescriptorResidueWarning` 7 pass 0 fail.
- Revert proof for the production change (driver `revert`, log `revert.probe.mjs_a_real_orphaned_descriptor.log`): with
  `project-onboarding-v3.mjs` reverted to the candidate, case 6 fails again with the same `cleanup_recovery_deferred`-only diagnostic
  list; the file was restored byte-equal. Cases 45, 90 and 92 are fixture restatements: their red state without the patch is proven
  by the `base1` failing names and the plain-HEAD probe, not by the driver revert.
- Comment-only edit after the full runs: the case-90 explanatory comment was reworded after `c1` had started (no code change);
  the four cases were re-probed green on the final state and the patch was cut after that.

## Downstream sweep (production change)

`partialCleanupRecoveryResult` is module-private. Three call sites in `project-onboarding-v3.mjs`: the ready-lifecycle result (passes an
`observation`, affected, covered by the full onboarding-v3 suite), and two legacy partial-authority paths that pass no
`observation` (the new branch cannot fire; unchanged). `partialCleanupRecoveryResultCore` and `foreignDescriptorResidueWarning` are
untouched. The function has no runner branch, so the behavior is identical for claude, codex and antigravity. No other file in
`plugins/pipeline-core` or `scripts` calls it; the pin test that names it only exercises `foreignDescriptorResidueWarning`.

## Not changed / open

- The R3 STOP pair (seeded push gate, SECGATE-1) stays red and is outside this slice.
- Cases 46 and 54 (G15) are not part of this slice.
- Pre-existing reds elsewhere (guard-push-v2, guard-push-scratch-advisory, guard-gate-strength GST33, the e2e architecture-authoring case) untouched.
