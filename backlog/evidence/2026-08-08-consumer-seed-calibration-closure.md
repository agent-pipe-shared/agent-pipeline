# A fresh consumer project no longer receives the private overlay's calibration

Date: 2026-08-08
Closes: `pipeline.greenfield-seeded-with-private-overlay-calibration`
Closing commit: `43ab69fa4e468a48a084bdd11deffedc4716dd20` (dispatch SEEDINT-1)

## What changed, against the item's four-step direction

1. **Separated by intent, not by operation.** A new `overlayCalibration` parameter
   (default `true`) is threaded through `planRunnerProfileMigrationV3` →
   `runtimeBaselines` → `slimRuntimeSeed`. The two general runtime-operation call
   sites in `project-onboarding-v3.mjs` now pass `false` explicitly. The private
   overlay activation path is the sole caller that keeps the default, and it was
   not edited at all. This is the item's core complaint answered: the condition
   that reads like an overlay special case no longer decides the seed's content.
2. **The consumer path gets the honest placeholder.** A new `freshCalibrationBytes()`
   reuses the existing `UNCONFIGURED_VERIFY` contract, so the two tiers of a fresh
   project now agree that verify is unconfigured and must fail.
3. **Pinned in both directions.** One test compares `overlayCalibration` true
   against false on one fixture; a second covers the full portable-plus-runtime
   greenfield path and asserts the seeded verify exits non-zero and matches
   `/not configured/`. The pre-existing overlay-literal assertion stayed green
   untouched, which is the evidence that the overlay path is unchanged.

## Step 4: the open question, answered — latent only

The item asked whether any shipped reader resolves the legacy `.claude/` tier
ahead of the neutral `project/` tier today, since that determines whether the
defect was ever actively harmful.

**It was latent, not active.** Three findings support that:

- `project-authority.mjs`'s resolver (`authority()` / `resolveAuthorityArtifactPath`)
  always prefers the neutral tier when it is ready or present.
- The portable-seed step (`freshBaselines`) unconditionally writes
  `project/pipeline.json` *before* any runtime step can write `.claude/pipeline.json`,
  so the neutral tier is never absent at the moment the legacy one appears.
- The two calibration-specific ADR-0054 category-A readers,
  `check-claude-md-lines.mjs` and `check-doc-contracts.mjs`, are already routed
  through the resolver in this checkout.

**Scope limit, stated rather than implied:** this covers the resolver and its
already-routed callers. No exhaustive repository-wide audit of every non-resolver
reader was performed. The "latent" conclusion is therefore well-supported for the
paths examined and is not a proof about every possible reader.

## Suites

- `node --test plugins/pipeline-core/lib/runner-profile-migration-v3.test.mjs` — 42 passed, exit 0
- `node --test plugins/pipeline-core/lib/project-onboarding-v3.test.mjs` — 108 passed, exit 0
- Adjacent and unedited, run as a sanity check:
  `private-overlay-activation.test.mjs` 63 passed, exit 0;
  `v3-bootstrap-authority.test.mjs` 18 passed, exit 0

## Deliberately left alone

Two further `initializeMissingRuntimeForSlimV3: true` call sites
(`planProjectOnboardingSourceRecovery`, and `v4Inspection`'s "partial" branch)
keep the default. Both are read-only diagnostics whose output does not depend on
the seed's byte content and neither writes to disk. Recorded here rather than
silently skipped, so a later reader does not mistake them for missed sites.
