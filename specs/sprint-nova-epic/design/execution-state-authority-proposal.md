# Nova execution/state authority proposal

## Status

This is the PO-approved D1 decision record for feature-branch live testing.
It authorizes the bounded implementation and test paths described below, but
not production promotion without final native evidence.

Nova A execution, scheduling and selected-sandbox work remains synthetic or
in-memory. It may emit immutable feature-package evidence but creates no new
generic repository-local or machine-local authority.

## Decision required before B1-I/B2-I

The separately approved ADR must close all of these choices:

| Surface | Required decision |
| --- | --- |
| authority | which records are portable repository authority, machine-local runtime state, external-provider observation and immutable evidence |
| root | exact machine-local root/path templates; `.agent-pipeline/`, `.git`, user home, global Git state and shared caches are forbidden defaults |
| identity | pool/job/attempt/worker/lease IDs and binding to repository fingerprint, candidate, dispatch and authority digests |
| storage | record schemas, maximum sizes, permissions, regular-file/symlink/hard-link rules and encryption expectations |
| concurrency | lock primitive, owner identity, lease/heartbeat, stale-owner proof and contention behavior |
| durability | file and directory sync policy per supported platform and the exact weaker-assurance state when directory durability is unavailable |
| recovery | crash points, replay/idempotency, corrupt state, orphan ownership proof, cancellation race and partial result import |
| secrets | external broker, ephemeral delivery channel, redaction, egress, revocation and incident boundary; secret bytes never enter portable evidence |
| retention | expiry, cleanup owner, bounded diagnostics, operator recovery and proof that unrelated processes/files are untouched |
| migration | schema evolution, downgrade/restart compatibility and removal of obsolete state |
| adapters | local supervisor, external transport and provider-specific boundaries; the frozen synthetic workflow boundary is not widened |
| verification | synthetic fault corpus, platform/native observations, canary denials, Full Verify/Security registration and support-matrix readback |

## Entry and stop rules

The ADR is considered only after the Nova A increment is accepted. It must
bind the exact accepted Nova A product candidate, current ADR-0044 and ADR-0046
digests, the final state schemas and an exact source/test/path manifest.

Before a concrete runtime adapter is activated, it must satisfy this record:

- concrete platform roots, ACLs, quota and retention are declared in its exact
  adapter manifest; absent lawful root is `unavailable`, never a fallback;
- feature-branch live testing records only observed capability/evidence and
  never promotes a provider acknowledgement to Pipeline acceptance;
- onboarding and `pipeline-start` publish typed, idempotent repair plans,
  serialize concurrent repair as `busy`, and prove interrupted repair resume,
  stale-owner recovery, repair readback and repeated-start idempotence; and
- OS isolation remains unclaimed without native evidence.

## D1 ADR draft decision matrix

The eventual serialized D1 ADR uses one shared machine-local authority core.
It may activate B1-I only after PO acceptance; B2-I additionally requires its
remote/broker clause and a separate live-pilot approval. It does not modify or
grant I/O authority to the pure B1-C/B2-C reducers.

| Decision | Draft constraint |
| --- | --- |
| authority/root | Keep portable repository authority, machine-local mutable state, external provider observations, external broker authority and sanitized immutable evidence disjoint. Use only an approved versioned per-repository root; `.agent-pipeline/`, `.git`, generic home paths, shared caches and undeclared temporary paths are forbidden. Missing lawful root is `unavailable`. |
| binding/ownership | Bind repository fingerprint, accepted base/candidate/tree, dispatch/subject, queue/attempt, ADR/schema digests and boot/time epoch. Process ownership requires nonce, PID, process-start token and privacy-safe boot digest; PID alone is insufficient. |
| locking/durability | One exclusive lock/CAS/prepared-journal/atomic-rename/readback protocol per pool/job/lease. Record actual directory durability; unavailable directory sync is only `process-crash-only`. Unknown schema or downgrade fails closed. |
| recovery/cleanup | Scan exact manifest paths only. Stop admission and cancel/remove only after complete workspace/process ownership proof; otherwise remain `recovery-required` or `blocked`. Never use globs, prefix deletion, broad process killing or unrelated Git cleanup. |
| broker/secrets | Select one external broker and provider transport for the first pilot. Secret bytes never enter repository, local state, argv, logs, evidence or environment dumps; durable data is a secret-free lease receipt only. |
| verification | Bind accepted Nova A candidate, exact source/test/runtime-path manifest, fault injection, ownership/replay/contention/path canaries, B1 N+1 capacity measurement, B2 provider-race and redaction/revocation canaries, and native durability observations. |

The PO must select the concrete platform roots, ACL/retention/quota and
durability cells; the provider, broker, authentication and ephemeral channel;
egress and credential/revocation scopes; the incident owner; and the exact
B2 live-pilot boundary. Absence of OS evidence remains observed
process/workspace separation, never an OS-isolation claim.
