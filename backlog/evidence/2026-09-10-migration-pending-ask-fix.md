# Migration pending-ask driver evidence

`NVA-MIGRATION-PENDING-ASK-FIX-1` corrects the migration-specific ready return
in `onboarding-init.mjs`. Before the correction, an in-memory four-step
migration route ended `outcome: "ready"` even though the re-anchored V4 result
published `nextAction.kind: "collect-input"` for `verifyCommand`.

After migration activation, a required collect-input action now follows the
normal driver path. An optional handover command remains terminal to the
migration receipt; a valid pending ask attached to that command remains
visible rather than being skipped. Action-free ready remains unchanged.

`node --test plugins/pipeline-core/scripts/onboarding-init.test.mjs` passed
26/26, including all three cases. The red reproduction was an in-memory
driver responder only; no live onboarding, model, or provider execution is
claimed.
