# w108 - register the four new suites and refresh the vendored operating-model copy

## What

The candidate 18 patches added four suites that no verify list knows: `agy-native-implementation-admission-tests` (w84),
`close-quality-readback-tests` (w98), `session-authority-registry-fsync-tests` (w81) and `goldfish-host-commit-recover-tests` (w77).
This delta adds them to `harness/verify-suites.json` (end of the suites array), adds their four ids to the verify-phase list of
`docs/product-capability-inventory.json` in sorted position, and regenerates the vendored `plugins/pipeline-core/docs/operating-model.md`
(`generate-vendored-canon.mjs`).

## Why

The registration checker (`check-verify-suite-registration.mjs`) and the vendored-canon check are part of Full Verify; without this delta
four suites are unregistered. Each held patch stays self-contained and does not touch the shared lists.

## Verification (orchestrator, in a clone at the chain end)

`check-verify-suite-registration.mjs`: 1150 registered, 0 declared exclusions, 0 unregistered. `generate-vendored-canon.mjs --check`: passed.
`check-product-capability-inventory.mjs` fails in the clone until the sourceBaseline is refreshed: that is the last step of the apply script
(`scripts/refresh-derived-files.mjs`, a documented derived-files step), not a defect of this delta.

## Apply order

Last patch of the chain (after w104). Patch applies to the chain end (`apply --check` exit 0).

## Not proven

The sourceBaseline-dependent inventory check passes only after the derived-files refresh; it is part of the rehearsal and the Full Verify.
