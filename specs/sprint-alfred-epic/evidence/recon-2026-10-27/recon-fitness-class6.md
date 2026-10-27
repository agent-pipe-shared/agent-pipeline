# Recon: fitness class 6 and documentation modules (not yet packaged)

Read 2026-10-27 while dispatch was blocked.

- Class 6 is `evaluateVerificationLocality` in `plugins/pipeline-core/scripts/architecture-fitness.mjs` (lines 537-595). Zero
  entry points yields `missing-verification-entry-point` with target `none`.
- The design contract rejects the same shape earlier: `plugins/pipeline-core/lib/architecture-design.mjs` line 85 requires
  `verificationEntryPoints.length > 0` for a module to be valid, and `architecture-design.test.mjs` line 63 pins that an
  empty list is refused. Exempting documentation modules in class 6 alone would leave the design validator refusing the
  module first, so the fix touches both places.
- The module schema has no field that marks a module as documentation-only. Two ways exist: a declared field (schema
  change, signed adoption hash changes) or a mechanical derivation (every ownedPath resolves to non-executable files such
  as `*.md`, `docs/**`). The derivation is a PO design choice, because it decides what counts as "no executable code".

Not a safe slice until the PO picks the marker (tile for the next PO round): declared `kind: documentation` field versus
derived from owned paths. Second question from the backlog item (does an entry-point-only change invalidate the signed
adoption) stays open and costs a signature per correction.
