# V3 legacy-consumer migration repair

**Status:** PO-authorized corrective package, 2026-07-24
**Scope:** Public V0/V1/V2 consumer migration only

## Problem

`docs/v3-consumer-onboarding.md` promises a preview-first migration for a valid legacy consumer with no generated `.claude/**` or `.codex/**` projections. On `main` at `290e999`, `inspect` correctly classifies a partial V2 consumer as ready, but `plan` fails with `invalid-baseline` when any of `.claude/settings.json`, `.claude/pipeline.json`, or `.claude/pipeline.yaml` is absent. The closed #53 documentation change therefore describes behavior that the migration does not provide.

## Decision

Add explicit, in-memory **legacy** seeds for the three absent Claude runtime targets. `.claude/settings.json` and `.claude/pipeline.json` use empty JSON objects. `.claude/pipeline.yaml` contains the minimum top-level `language` and `modelRouting` blocks required by the V3 renderer. The seeds exist only in the authenticated migration plan; a plan remains read-only and the existing recoverable transaction remains the only writer.

## Acceptance criteria

- V0, V1, and V2 consumer sources plan and apply successfully when any nonempty subset of the three Claude runtime targets is absent.
- The resulting files contain ordinary V3 projections; absent targets are not created before explicit `apply --activate`.
- Present runtime files remain byte-preserving outside their declared V3-owned fields.
- Current V3 consumers without projections remain fail-closed; this repair does not widen the Slim Private Overlay path.
- Focused migration tests, the exact partial-V2 reproduction, Full Verify, and Security pass on the final candidate.

## Non-goals

- Changing `runtime-projection-v3-owned-keys.json`.
- Changing `SLIM_V3_RUNTIME_SEEDS`, private-overlay activation, or any private authority contract.
- Reopening or publishing a public observation before the repaired candidate has been independently retested by the reporting consumer.
