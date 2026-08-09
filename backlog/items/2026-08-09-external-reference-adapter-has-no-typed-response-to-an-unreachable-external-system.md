---
schema: pipeline.backlog-item.v1
id: pipeline.external-reference-adapter-has-no-typed-response-to-an-unreachable-external-system
type: defect
owner: pipeline
status: open
created: 2026-08-09
source: "Found while closing X-AC-14 under dispatch PHX-WP-X (2026-08-09), part of the Sprint Phoenix closure design's Class A wave. Confirmed at source by reading plugins/pipeline-core/lib/external-reference-adapter.mjs in full."
due: 2026-09-08
---

# The external-reference adapter has no typed response to an unreachable external system

## Description

X-AC-14 requires: "IF an external system is offline or unavailable, THEN THE
SYSTEM SHALL preserve canonical local operation and authority and expose the
external observation/reconciliation gap." No code path in
`plugins/pipeline-core/lib/external-reference-adapter.mjs` converts a
transport failure into that typed gap.

`planExternalReferenceWrite` (`:61`) and `reconcileExternalReference` (`:72`)
both call the caller-injected `inspect(...)` directly with no `try/catch`:

```js
const target = await inspect(frozen({ adapterProfile: ref.adapterProfile, objectId: ref.objectId }));
```

Every other failure mode this module handles — an invalid inspection result,
a revision conflict, a capability mismatch — is caught and returned as one of
the module's typed statuses (`rejected`, `conflict`,
`reconciliation-required`). A **transport failure** (the injected `inspect`
rejecting or throwing, which is exactly what an offline/unreachable external
system produces) is the one failure mode with no typed status: it propagates
as an uncaught rejection out of both exported functions.

The module never claims canonical authority is lost when this happens — it
simply never returns at all, so no caller can observe or handle the case
without also catching a generic rejection at every call site, which the
adapter's own typed-result contract exists to avoid.

## Triggering situation

An external issue tracker, knowledge base, document store, or secondary forge
is temporarily unreachable (network partition, provider outage, expired
credential) while a Pipeline session calls `planExternalReferenceWrite` or
`reconcileExternalReference` against it.

## Affected artifact

`plugins/pipeline-core/lib/external-reference-adapter.mjs` — both `inspect`
call sites (`:61`, `:72`); `plugins/pipeline-core/lib/external-reference-adapter.test.mjs`
carries no fixture for it either, confirmed while searching for one under
PHX-WP-X.

## Proposal

Wrap both `inspect(...)` calls in a `try/catch`; on catch, return the same
`pipeline.external-reference-write-plan.v1` / `pipeline.external-reference-reconciliation.v1`
shape with a new typed reason (e.g. `"external-unreachable"`, distinct from
the existing `"invalid-inspection"`, since an unreachable system and a system
that answered with garbage are different observations worth telling apart).
Not implemented here: PHX-WP-X was scoped to test authorship only and was
explicitly forbidden from editing production modules; this is real
production work, not a missing assertion.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
