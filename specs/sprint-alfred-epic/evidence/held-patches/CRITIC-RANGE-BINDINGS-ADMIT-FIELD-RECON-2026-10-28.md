# Critic range bindings: the admit and finalize request carries no field for the bindings file (recon, 2026-10-28)

Follows `CRITIC-RANGE-BINDINGS-BUNDLE-VERIFY-2026-10-28.md`. The bundle was applied (operator commit bc522bc7b) and stamped. A consumer then ran the real
route and was refused at `session-critic-finalizer.mjs admit`: the preflight now says `CDP-CORRECTION-INPUT-REQUIRED ... pass its file as
correctionInputBindings`, but the admit request has no such field, so the operator cannot comply. This note is model output: re-verify every cited line.

## What the walk of the whole path shows

1. `derive` (done, tested) writes the bindings file under `scratch/`.
2. `session-critic-finalizer.mjs admit|finalize --root --request <file>`: `validateCliRequest` (plugins/pipeline-core/scripts/session-critic-finalizer.mjs,
   around line 280) accepts a closed request. `REVIEW_KEYS` (line ~122) is `base, candidate, specPath, guardrailPaths, evidencePaths, priorCriticEvidencePath`;
   v2 adds `courseContext`, v3 adds `genericBatchRef`. There is no field for the bindings.
3. The CLI builds `common.preflightInput` (line ~910) from those keys only and calls `preflightCriticDispatch(options.preflightInput)` in `admitSessionCriticReview`
   (line ~441) and in `finalizeSessionCriticReview` (line ~599). The preflight itself already accepts `correctionInputBindings`
   (plugins/pipeline-core/scripts/critic-dispatch-preflight.mjs line ~291) and echoes `{path, digestSha256}` in its result.
4. `admit` hashes the whole preflight result (`preflightSha256 = sha256(canonicalJson(preflight))`, line ~451) into the packet's `sessionBinding`, so the echoed
   bindings digest is bound into the packet digest as soon as the field is passed through. `finalize` recomputes the preflight with the same request and must
   see the same hash, so the same field must be passed there (the file under `scratch/` must still exist and match; otherwise `CDP-CORRECTION-INPUT-STALE`).
5. The CLI reports a `CriticDispatchPreflightError` as `code: SCF-INTERNAL` with the real code as the prefix of `detail` (that is how the consumer saw
   `CDP-CORRECTION-INPUT-REQUIRED`). Leave that mapping alone: other cases pin it.
6. Not affected (checked): `verify-evidence-producer.mjs` and the Verify/push path read consumed Critic receipts and do not call the preflight;
   `push-prepare.mjs` only prints a hint that recommends running `critic-dispatch-preflight.mjs`.

## The change (smallest honest)

- An OPTIONAL key `correctionInputBindings` inside `review` for all three request versions (v1, v2, v3), handled like the existing optional
  `signedQualityImportAnchor` (present or absent; exact-key checking must accept both shapes and nothing else). Value: a non-empty string (the preflight
  validates the path and content). Absent means exactly the old behaviour, byte for byte (no default key is added to `preflightInput`).
- `common.preflightInput` carries `correctionInputBindings` only when the request has it.
- `admit` and `finalize` need no other change; the digest binding follows from `preflightSha256`.

## The walk-through test (the acceptance test of this slice)

Through the real CLI (`runSessionCriticFinalizerCli` or the spawned script, as the neighbouring CLI cases do), in a fixture repository whose calibration names
`docs/state.md` as the handover file and whose range changes `docs/state.md`:

1. `admit` without the field is refused with a detail containing `CDP-CORRECTION-INPUT-REQUIRED` and `critic-correction-input-bindings.mjs derive`.
2. `derive` (the real command, spawned) writes the file under `scratch/`.
3. `admit` with `review.correctionInputBindings` set is admitted; the admission result differs from an admit of the same range whose bindings digest differs
   (or assert that the stored packet's `sessionBinding.preflightSha256` equals the hash of a preflight that echoes the bindings).
4. `finalize` with the same request and a valid verdict completes.
5. A stale file (derived for another head) is refused at `admit` with `CDP-CORRECTION-INPUT-STALE`.
6. v2 (feature course) and v3 (generic batch) requests both accept the field: if a feature-course CLI fixture is expensive, assert acceptance and
   passthrough with the `preflightCriticDispatchFn` seam of `deps` for v2, and run the full path for v3.

## Out of scope for this slice (next slice D2)

Operator text: the course-continuation order in the skills and docs (derive step, the exact field name `review.correctionInputBindings` for admit and finalize,
the flag `--correction-input-bindings` for the preflight CLI), the hint in `push-prepare.mjs`, and the "rerun critic-dispatch-preflight.mjs" hints printed by
`register-feature-package.mjs` and `critic-diagnostic-evidence.mjs`.
