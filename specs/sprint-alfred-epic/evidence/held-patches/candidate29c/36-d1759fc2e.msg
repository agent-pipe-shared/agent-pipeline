feat(close): derive the proof of every gate-definition change in the feature range

- ADR-0096 (D248): lib/gate-definition-changes.mjs walks the first-parent
  history of the feature range (featureRangeBase) for the gate-definition set
  (GS-1..5, 7, 10..14, 16, 17), skips a pipeline.user.yaml edit of exempt
  fields only, and derives per change: first appearance, trust-anchor
  bootstrap, committed materialization (GS-17), configure-verify record
  (labelled "confirmed via runner prompt, not signed"), a consumed override
  for its next change of the path, or the PO acknowledgement of the range
  ("acknowledged after the fact"); anything else is unproven.
- human-guard-override.mjs readConsumedOverrideCapabilities: read-only,
  MAC-checked facts of consumed capabilities, no directory or key created.
- Tests on real git histories (7/7): first creation free, change/deletion/
  re-creation unproven, exempt-field edit not listed, materialization,
  configure-verify, one override one change, acknowledgement coverage,
  merge against its first parent, no range = unavailable.

AI-Assisted: true
Dispatch: stage-0 (elephant)
