---
schema: pipeline.backlog-item.v1
id: pipeline.brownfield-architecture-deferral-blocks-implementation-entry
type: defect
owner: pipeline
status: open
created: 2026-10-26
priority: P1
release: 0.7.0
source: "PO observation in a consumer repository, relayed in chat 2026-10-26: a brownfield project could defer architecture adoption at onboarding, but the switch to implementation then demanded it and forced reopen-design; PO direction D162"
done_when: manual
---

# Brownfield architecture deferral blocks the implementation entry

## Observation

In a brownfield consumer repository the onboarding offered the architecture adoption decision
`deferred` and accepted it. At the switch to implementation the architecture was demanded
anyway, and the only way forward was `pipeline-state reopen-design`. The deferral promised
something the implementation entry does not honour.

## Likely mechanism (code reading, 2026-10-26; to be confirmed by reproduction)

- `scripts/architecture-adoption.mjs` admits `deferred` as a disposition next to
  `approved-scoped` and `partial`; `checkPlanningAdoptionDisposition` returns `ok` for it.
- `lib/architecture-entry-readiness.mjs` (about lines 434-467) honours the deferral only for
  paths that already exist on disk. The net-new ratchet (PO decision 2026-10-16 #5) gives every
  net-new implementation path the full fitness check. A brownfield feature that adds files
  therefore meets an un-adopted architecture and fails `ARCHITECTURE-FITNESS-NOT-READY` at the
  implementation entry, which routes back to design.
- The same code records a known limitation (owner Coordinator, due 2026-10-31): "existed" is
  judged by on-disk existence at entry time, because the deferral record carries no baseline.

Both files are NEVER_LIFTABLE kernel paths: the fix lands as a held patch.

## Decision

D162 (PO, 2026-10-26): remove the `deferred` option for brownfield onboarding and perform the
architecture adoption right away, as a migration step of onboarding, so the implementation
entry finds an adopted (scoped) architecture.

## Open design points (for the implementing slice and, where marked, the PO)

- What the migration produces: an `approved-scoped` adoption of the observed modules (a
  measured baseline map) or a `partial` adoption whose scope covers the paths the first feature
  touches. Default proposal: `approved-scoped` over the measured map, recorded with its
  baseline commit so the net-new ratchet has a real baseline.
- Existing consumer repositories that already recorded `deferred`: the migration converts them
  on the next onboarding inspect or implementation entry, with one disclosed PO confirmation,
  instead of forcing `reopen-design`. Decided by the PO on 2026-10-26 (D162 addendum): migration
  on contact, disclosed, one PO confirmation.
- Whether `deferred` stays readable for old records (read-only, migrated on contact) or is
  refused outright.
- Relation to D66 ("established with ratchet" state, signed with AC-9 under D142 for after
  0.7.0): the baseline commit captured here is the same ingredient.

## Acceptance

- A fresh brownfield onboarding never offers `deferred`; it ends with an adopted architecture.
- The first feature of such a project switches to implementation without `reopen-design` when
  its new paths fit the adopted map.
- A repository holding an old `deferred` record is migrated through the disclosed route, never
  silently and never by forcing `reopen-design`.
- A reproduction fixture of the reported sequence is red before and green after.
