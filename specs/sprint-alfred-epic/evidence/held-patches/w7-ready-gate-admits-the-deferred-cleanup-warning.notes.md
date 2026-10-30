# w7-ready-gate-admits-the-deferred-cleanup-warning (Elephant, PO exception 2026-10-30)

Live in a consumer on 0.7.0+claude.20261030111002.c53327c: every governed write (`git add`, `routine-repair.mjs list`)
was refused as GUARD-LIFECYCLE-NOT-READY / PORG-INVALID-OBSERVATION although `inspect --intent session` reported ready.

Root cause: candidate 8 block 3 (`w7-onboarding-cleanup-binding-not-partial`, D48) made `project-onboarding-v3.mjs`
return `status: ready` with one `cleanup_recovery_deferred` warning when the cleanup recovery apply fails only with
SDC-AUTHORITY-UNAVAILABLE / continuity-invocation-unbound. The ready gate (`validReadyDiagnostics`) admitted only
`cleanup_residue_foreign`, so the producer's own ready result failed the gate's shape check. The repair verbs are gated
too, so the consumer had no way out.

Why no test saw it: the producer test asserted the warning shape, the gate test used hand-built diagnostics; no test
passed the producer's ready result through the gate.

Fix (PO 2026-10-30: close the whole class in this patch):
- Producer: `READY_RESULT_WARNING_CODES` (closed list) and `pushReadyWarning`, the only path onto a ready result's
  warnings; it throws on a code outside the list. The deferred message and guidance are exported constants.
- Gate: one validator per admitted code (`READY_WARNING_VALIDATORS`); `cleanup_recovery_deferred` is admitted at most
  once, with exact keys, path, severity, message and guidance. `READY_GATE_WARNING_CODES` is exported.

Tests:
- gate: the exact deferred warning alone and next to foreign residue passes; doubled, other message/guidance/path,
  error or missing severity, extra key are PORG-INVALID-OBSERVATION.
- class: gate codes equal producer codes; the producer source has exactly one `.warnings.push(` (inside
  pushReadyWarning); every admitted code is still produced.
- producer-to-gate contract: the D48 `deferred` result in project-onboarding-v3.test.mjs passes `requireProjectOnboardingReady`.

Evidence (clone at cf630cbdd): ready-gate test 30/30; project-onboarding-v3.test.mjs exit 0; foreign-residue unit,
integration and host-crash pin 11/11. Revert of the two production files: the gate test file fails (exit 1; it imports
the new exports), restored byte-equal. Patch 4 files +104/-6, apply-check 0, stacks with the PF-70 patch on cf630cbdd.
Open: Full Verify, Critic, native Windows, live recheck in the consumer, PO acceptance.
