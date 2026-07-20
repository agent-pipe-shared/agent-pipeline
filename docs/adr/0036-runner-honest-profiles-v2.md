# ADR-0036: Runner-honest profiles and usage contracts v2

> Agent-Pipeline v0.3 candidate · 2026-07-17

**Status:** accepted (PO decisions of 2026-07-16; routing amendment of 2026-07-17)

## Context

Existing configuration and runtime surfaces describe Claude and Codex routes
differently. Shared profile names must therefore not imply identical
capabilities, model identities, or usage semantics. In particular, Terra is
registered as the exact requested Codex model ID `gpt-5.6-terra` with selector
kind `model-id`; an effective model identity can arise only from evidence of
the same dispatch or turn. Codex has no approved Advisor capability.

I0 freezes only the machine-readable contracts. The registry
`runner-profiles-v2.json` is the sole normative complete mapping; the schemas
`pipeline.user.v2`, `pipeline.runner-usage.v1`, and
`pipeline.usage-route-binding.v1` close their respective interfaces. Compiler,
projection, migration, usage adapter, and active configuration belong to later
packages and are not changed by this decision.

## Decision

The eleven approved product decisions are recorded as follows:

1. `design`, `feature`, and `mini` are shared stable profile IDs; their
   capabilities remain separate for each runner.
2. Claude Advisory in `feature` and `mini` is `opt-in`; it remains `off` in
   the `design` profile.
3. Approved Codex efforts remain `xhigh` for normal reviews and Readiness, and
   `max` for high-risk reviews.
4. Codex receives no Advisor substitute; its Advisory cells are `unavailable`
   and point to no other role.
5. Missing capability, route, or evidence defaults to `defer`. A fallback
   needs a separate decision and remains within the same runner and cell
   boundary.
6. Usage remains runner-native and receives only a source- and scope-labelled
   common projection without runner ranking.
7. The new project source is versioned as `pipeline.user.v2`; migration from
   the approved v0/v1 source forms is implemented separately.
8. “Iron Man” remains display-only metadata and affects no machine-readable ID
   or route.
9. Implementation proceeds in separate review packages; I0 alone owns schemas
   and the normative mapping.
10. Approved Codex execution cells use the exact requested model ID
    `gpt-5.6-terra` with `xhigh`, not the former local `high` setting.
11. New raw usage data receives no persistent store, upload, or retention plan.

The later PO amendment specifies Codex selectors: where a Codex capability is
available, Claude cells from the Fable or Opus family map to the exact Codex
model value `gpt-5.6-sol`. Claude cells from the Sonnet family map to the exact
requested Codex model ID `gpt-5.6-terra` with selector kind `model-id`. The
already approved Codex efforts do not change. Claude cells remain unchanged,
unavailable capabilities remain unavailable, and the registry never claims an
effective provider model for that requested model ID.

The usage envelope separates native numeric fields from `observed`,
`estimated`, `unknown`, `unavailable`, and `inapplicable` states. Missing values
are not converted to zero. The usage-binding contract adds dispatch, turn,
cell, candidate, and event correlation to an existing
`pipeline.route-receipt.v1`, without redefining its semantics or digests.

I4 accepts only registered, sanitized usage subobjects: Claude transcript
turn/session usage and the `usage` subobject of a `codex exec --json`
`turn.completed` event. It returns exactly one in-memory envelope to its
caller; there is no sink, upload, background job, or retention path. Codex
thread and turn values originate only from trusted app-server/wrapper
`sourceContext`, never from model text or the usage event. A `routeContext`
binds the event hash, dispatch, cell, candidate commit/tree, thread/turn, and
receipt. The receipt file is verified through its contained real path, regular
file type, whole-file hash, and matching result/evidence/route bindings. These
contexts require a trusted local caller but do not provide cryptographic
provider attestation. On a missing or broken binding, the route remains
`unbound` and the effective model remains `unknown`; only a complete
same-dispatch receipt may report it as `observed`.

## Consequences

- Equal profile names express work intent, not capability, quality, token,
  cache, or cost parity.
- Requested selector and observed effective model identity remain distinct; a
  `gpt-5.6-terra` request cannot produce an effective identity without matching
  run evidence.
- Codex Advisory fails closed as unavailable. Critic, Readiness, the parent
  session, or Claude are not silent substitutes.
- Usage has no durable sink or cross-runner ranking. Retention, upload,
  billing, or semantic comparability each need a new approved decision.
- Claude cache-creation/cache-read and Codex cached-input are distinct
  runner-native fields. `unavailable` makes no cache-equivalence claim; a
  missing field is `unknown` and an observed numeric zero remains zero.
- I4 makes no claim about live billing, provider telemetry, or local-wrapper
  honesty. Its threat model only limits which untrusted event data cannot
  become a bound route.
- Provider, authentication, and telemetry settings are not project overrides
  of the v2 contract.
- I0 changes neither live routing nor generated `.claude`/`.codex` files,
  setup defaults, roles, migration, or adapter behavior.

## Rejected alternatives

- A common runner-independent model field: rejected because it would invent
  capability and identity.
- A Codex Advisor by analogy to Critic or Readiness: rejected.
- Normalizing missing usage fields to null or numeric zero: rejected because it
  would pretend an observation.
- Treating requested model ID `gpt-5.6-terra` as an assumed effective model
  identity: rejected; only evidence of the same run may make that assertion.
- A new raw usage history: rejected because it creates unnecessary privacy and
  retention surface.
- Thread/turn values from Codex model text, or receipt lookup by model name
  alone: rejected because each bypasses dispatch binding.

## Follow-up

An extension requires new PO approval only if Codex gains a native Advisor
capability, new selector/effort pairs are registered, cross-runner usage
semantics are evidenced, or a persistent usage store is introduced.
