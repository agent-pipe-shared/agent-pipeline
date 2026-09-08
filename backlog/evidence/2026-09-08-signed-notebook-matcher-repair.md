# Signed notebook matcher repair evidence

Signed consent was already armed by the parent through the sanctioned
`authorize-by-signature` flow. This dispatch did not perform another signing,
approval, dry run, or capability-state edit.

- Target before admission: SHA-256
  `51927ba50677a88b7aa9b080e78386381173923467a2d09bed3fb92401025856`.
- Signed patch: SHA-256
  `7753fa20f27f6879ffff26f10cd322da661424397f90a60d50bd6abaf4e0f123`.
- Required pre-admission HEAD:
  `4d1f0b9acfa2666a60bcb3c1d36f16a16d931461`.
- Actual admission: the exact `apply_patch` request was accepted; its returned
  outcome was `{}`.
- Verification: `node --test plugins/pipeline-core/hooks/notebook-write-coverage.test.mjs harness/scripts/check-consumer-safe-paths.test.mjs` exited 0. Its sanitized, machine-written capture is
  `scratch/NVA-B-NOTEBOOK-SIGNED-REPAIR-1/notebook-and-consumer-verify.txt`.

The capture records all eight NB01–NB08 notebook checks and nine consumer-path
tests passing. This scoped repair makes no `globalcandidatePASS` claim.

## Parent audit readback

The official installed HGO verifier reports a valid audit chain. This exact
request has denial at sequence1398, signature-verified authorization at1399,
and one-use consumption at1401 (2026-09-08T04:42:59.368Z). The consumed
plan matches the signed plan. Public readback is preserved at
`scratch/notebook-signature-consumption-20260908.json`. No private key was
read by the agent. The commit hold is released after this actual consumption.
