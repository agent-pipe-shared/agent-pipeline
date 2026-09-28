---
schema: pipeline.backlog-item.v1
id: pipeline.codex-compact-sessionstart-json-rejects-measurement-fields
type: defect
owner: pipeline
status: open
created: 2026-09-28
source: "Repeated PO report after Codex Compact; strict wire-contract reproduction and committed bounded recovery in f9ebdd5b6c7b123b39ebdb2aae60acc54bead1b6."
sprint: alfred
done_when: manual
---

# Codex Compact forwards unsupported SessionStart measurement fields

The Compact branch of `codex-session-start-hint.mjs` forwarded the generic
reground payload unchanged. Four local measurement fields inside
`hookSpecificOutput` violate the strict Codex SessionStart wire contract.
The PO repeatedly observed `hook returned invalid session start JSON output`.
The supported nested fields are `hookEventName` and `additionalContext`.
Primary contract: https://github.com/openai/codex/blob/main/codex-rs/hooks/src/schema.rs.

The bounded recovery already committed in `f9ebdd5b` projects the payload at
the Codex transport boundary and preserves context and local measurements.
The PO installed that recovery. This item remains open until the permanent
regression and candidate qualification are complete.

## Evidence

`scratch/codex-compact-session-output-20260928/evidence.json` records the
strict-wire baseline failures (0/3) and corrected canonical and S2 proposals
(3/3 each). These are public-input subprocess/shape checks, not an actual
Codex parser replay. The frozen evidence SHA-256 is
`bb4c6aad3c106ca6ea0074a6e8d00058216c53dad486fb3d2988bace6bbfcb6c`.

## Acceptance

- Register a permanent Source regression covering stopped and ready continuity
  plus actual hook subprocess stdout, without a module-loader override.
- Retain the activation/hook-scope correction when combining S2 and recovery.
- Preserve rendered context, state bytes, refusal semantics and local metrics;
  Compact must not create a fresh onboarding or approval ceremony.
- Bind the checks to the integrated candidate and distinguish an installed
  Compact observation from synthetic contract checks.

## Triage

- **Decision:** Confirmed, urgent for 0.7; correction partially delivered.
- **Assignment:** S2 integration and permanent Codex transport regression.
- **Date:** 2026-09-28.
