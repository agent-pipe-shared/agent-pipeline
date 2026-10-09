# Shared agent capacity and existing-consumer migration

## Status

Proposed, 2026-10-09. The PO explicitly directed a permanent shared pool for
all consumer repositories and raised Codex to ten spawned agents. Those human
instructions authorize preparing this change. This digest-bound proposal is
pending the final review/signature package; it does not approve itself, rewrite
ADR-0048, or declare the candidate qualified.

## Context

ADR-0048's capacity section subtracts idle Elephant/Verify/Critic reservations
and one recovery place. Several continuity seeds, schemas, review admission and
supervisor controls repeat that rule. Fixed idle holds reduce usable capacity
even when those roles are inactive. Updating source defaults alone also leaves
existing consumers with old serialized capacity objects.

The bounded source observations are recorded in
`specs/sprint-alfred-epic/evidence/wsl-intake-2026-10-09/consumer-capacity-diagnostic.txt`.
The existing host now offers eleven total threads: one primary and ten spawned
agents. A configured value alone is not evidence of host capacity.

## Decision proposed for the final package

Implementation, review and recovery use the same available places. There are
no permanent idle role reservations. An actually running control/recovery task
occupies one ordinary place, deduplicated by stable task/dispatch identity across
coordinator and supervisor observations. Unresolved execution remains occupied
until its disposition is known. Host counters that already exclude the primary
thread must not subtract it a second time.

Admission remains bounded by configured/operator limits, certified/observed host
capacity, pressure and workload limits. Unknown required bounds still refuse
parallel admission. Write ownership, conflict checks, full-wave admission,
serial fallback, retry budgets, independent review and real recovery execution
availability remain in force. Simultaneous tier/test limits govern running
workloads; they are not idle places withheld from other work.

The canonical continuity capacity object is closed:
`{concurrencyLimit, allocation: "shared", fallbackPolicy}`. The numeric limit
retains the existing range 2..64; fallback remains `defer` or
`pre-authorized-mapped-fallback`. A limit is an operator ceiling, never a claim
that the host supplies that many places. New consumer enrollment must expose
this ceiling as configurable and use the actual runner limit. Codex's current
ten-agent setting is not imposed on Claude or other hosts.

Exact legacy objects with `concurrencyLimit`, `reservedCriticSlots: 1`,
`reservedRecoverySlots: 1` and the existing fallback are readable. A pure
`normalizeContinuityCapacity` reader returns the canonical shared object while
preserving the declared ceiling and fallback; it never mutates caller input or
the serialized State. Legacy role fields do not subtract idle capacity.
Unknown keys, malformed/mixed shapes and invalid limits/fallbacks still refuse.

Existing consumers receive a dedicated sanctioned plan/apply migration, exposed
through onboarding repair after plugin update. The plan binds physical State
path, exact raw digest, feature and expected revision. Apply uses the existing
writer lock/CAS/readback route, changes only capacity, increments revision once
and preserves authority, approval, Result, history and retry data. Active
dispatch defers persisted migration because its identity binds queue revision;
compatible reads continue. A ceiling change is explicit plan input, never an
inferred rewrite of an existing operator limit. Update-channel selection alone
does not write State.

## Consequences

Free places can serve whichever role is needed. Existing approval remains valid
during plugin update. Compatibility does not silently rewrite user repositories.
Policy changes in protected writers/readers remain parked in the governed
signature tranche until the exact reviewed package is authorized.

## Affected contracts

ADR-0048 capacity and the supervisor threat model; local pool/supervisor and
parallel planner accounting; review admission; continuity validator/schema and
all enrollment/adoption seeds; workflow-writer preflight; launch defaults;
onboarding repair and the sanctioned State migration writer; fanout defaults
and consumer documentation. Supersession of historical authority is recorded
only when the final decision is actually adopted.
