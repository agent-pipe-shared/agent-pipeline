# ADR-0038: Runner-neutral advisory duty v3

**Status:** accepted route registry; session-trigger and mandatory-receipt
semantics superseded by ADR-0047 · **Date:** 2026-07-19

**Governs:** plugins/pipeline-core/config/runner-profiles-v3.json, plugins/pipeline-core/lib/runner-profiles-v3.mjs, plugins/pipeline-core/lib/runner-profiles-v3.test.mjs, plugins/pipeline-core/lib/advisory-receipt.mjs, plugins/pipeline-core/lib/advisory-receipt.test.mjs, plugins/pipeline-core/scripts/advisory-receipt.schema.json, plugins/pipeline-core/lib/advisory-coordinator.mjs, plugins/pipeline-core/lib/advisory-coordinator.test.mjs, plugins/pipeline-core/scripts/advisory-host-bridge.mjs, plugins/pipeline-core/scripts/advisory-host-bridge.test.mjs, plugins/pipeline-core/agents/consult-advisor.md, plugins/pipeline-core/scripts/pipeline-user-v3.schema.json, plugins/pipeline-core/config/runtime-projection-v3-owned-keys.json, plugins/pipeline-core/lib/runtime-projection-v3.mjs, plugins/pipeline-core/lib/runtime-projection-v3.test.mjs, plugins/pipeline-core/lib/runner-profile-migration-v3.mjs, plugins/pipeline-core/lib/runner-profile-migration-v3.test.mjs, plugins/pipeline-core/scripts/runner-profile-migration-v3.mjs, plugins/pipeline-core/lib/critic-export-policy.mjs, plugins/pipeline-core/lib/critic-export-policy.test.mjs, plugins/pipeline-core/scripts/critic-export-receipt.schema.json

## Context

The unactivated V2 bridge preserved the legacy profile cell
`design.advisor: off`. Activating it would therefore suppress the advisory
capability that Batman had already selected. It also mixed a runner capability
with a work profile and did not define one common evidence contract for native
and consult adapters.

## Decision

V2 is not activated. A one-way V3 migration replaces it:

- the profiles are `epic`, `feature`, and `mini`; legacy `design` maps once to
  `epic`;
- advisory is a runner-neutral duty, required for Epic and Feature and disabled
  for Mini;
- Claude uses native Fable, then the explicit same-runner native Opus fallback
  after bounded repeated Fable failure, then a fresh read-only same-runner
  consult if the native adapters fail;
- Codex uses a fresh read-only Sol consult as its primary adapter; no native
  Codex advisor is invented;
- no adapter may silently switch runner, main model, role, or fallback order;
- every attempt returns the common sanitized
  `pipeline.advisory-receipt.v1`; raw questions, answers, prompts, traces, and
  errors are not persisted;
- an executable stdio host bridge drives the coordinator's registered sequence,
  binds observed provider, model and effort to the configured route, consumes
  its raw temporary input before dispatch and persists only the sanitized
  receipt;
- V3 source and owned runtime projections are changed only by an explicit,
  digest-bound `apply --activate`, with runtime written before source.
- V3 also owns a closed Critic-export allowlist and projects only its digest and
  visible external-gate boundary. A pure pre-export check binds policy, packet,
  candidate, provider and assurance; it never suppresses host/provider gates.

## Consequences

ADR-0036 remains the historical V2 record but is not an activation authority.
The V3 route/fallback registry remains frozen. ADR-0047 supersedes the
requirement for fresh sessions to execute that route or require a consultation
receipt before writable work. Fresh sessions instead produce model-free
capability evidence; only a concrete demand may execute the V3 route.

## Discarded alternatives

- Reinterpreting V2 in place was rejected because it would change a frozen
  contract without a version boundary.
- Setting the legacy Design advisor to `off` was rejected because it would
  bypass the accepted Batman capability.
- A fabricated native Codex advisor or a cross-runner fallback was rejected
  because neither has an attested host capability or stable trust boundary.

## Resubmission

Revisit only when a runner adds a newly attested native advisory capability or
when the receipt/fallback trust boundary materially changes. Such a change
requires a new versioned decision and migration.

The public details and acceptance boundary are fixed by the
[decision above](#decision); no separate private migration design is required
to interpret this ADR.
