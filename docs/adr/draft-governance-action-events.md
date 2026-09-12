# ADR-{{NNNN}}: Non-dispatch governance actions use a separate closed payload in the lifecycle stream

> Agent-Pipeline · Sprint Nova-B · as of 2026-09-12

**Status:** proposed — Option B selected for implementation planning; numbered
only when accepted into the trunk under
[ADR-0069](0069-adr-numbers-are-allocated-at-acceptance.md). Until then this
record is `docs/adr/draft-governance-action-events.md` and is referenced by
slug.

**Basis:**
`backlog/items/2026-08-17-lifecycle-event-schema-has-no-non-dispatch-correlation-shape.md`
and
`backlog/evidence/NVA-B-LIFECYCLE-NONDISPATCH-DESIGN-1.md`.

**Refines:** [ADR-0071](0071-governance-event-kernel.md) and
[ADR-0044](0044-control-execution-boundary.md). It does not change the human
authority boundaries in [ADR-0059](0059-signed-human-guard-override.md), the
Verify candidate binding in [ADR-0050](0050-candidate-bound-verify-run-journal.md)
or [ADR-0081](0081-boundary-aware-impacted-verify.md), or the Critic contract.

**Governs:** governance/schemas/lifecycle-governance-event.schema.json,
governance/schemas/governance-action-event.schema.json,
governance/schemas/governance-event-envelope.schema.json,
governance/artifact-topology.json,
plugins/pipeline-core/lib/lifecycle-governance-events.mjs,
plugins/pipeline-core/lib/governance-event.mjs,
plugins/pipeline-core/lib/governance-event-store.mjs,
plugins/pipeline-core/lib/governance-event-projection.mjs,
plugins/pipeline-core/lib/governance-replay.mjs,
plugins/pipeline-core/lib/governance-replay-view.mjs,
plugins/pipeline-core/lib/governance-replay-view-renderer.mjs,
plugins/pipeline-core/scripts/governance-replay.mjs,
plugins/pipeline-core/scripts/governance-replay-viewer.mjs,
the terminal producer boundaries listed below, their focused tests,
docs/governance-events.md, docs/governance-replay.md, and governance/README.md.

The implementation may add a dedicated action-event module when this draft is
accepted, but an absent future source file is not part of this draft's current
`Governs:` set.

## Context

The lifecycle payload currently lists eight kinds but has exactly one
correlation grammar: package, dispatch, attempt, worker, correlation and queue
revision. That grammar is truthful for the two implemented control/execution
events, `dispatch` and `status`. It is also the right family for a future
candidate invalidation or cancelled status, once the continuity state machine
can actually observe those transitions.

It is not truthful for five other listed kinds. A Verify completion, Critic
completion, gate result, recovery, or reconciliation may be candidate-,
request-, session- or repository-scoped. None inherently owns the identity of
a dispatched worker. Supplying nearby dispatch values would attribute one
action to an execution that did not perform it.

The mismatch already reaches the consumers. Governance replay groups every
payload by `correlation.dispatchId`; its view validates the same six fields and
derives package/worker/attempt topology. Adding a second correlation shape to
the existing payload would therefore make every dispatch-only reader a union
reader.

There is also a current contract defect to repair before adding another payload
family. The runtime validator and its L-AC-02 test require `correlationId` and
`queueRevision`, while the published
`governance/schemas/lifecycle-governance-event.schema.json` requires only the
four older fields. A schema wave that ignores this drift cannot make a credible
compatibility claim.

## Decision

### D1 — A separate action payload, in the existing lifecycle stream

Add `pipeline.governance-action-event.v1` as a second payload schema admitted
for envelope origin `lifecycle`, authority class `non-authoritative`, and
stream `lifecycle`.

Do not add a fourth stream, origin, authority class, store, lock or capture
policy. ADR-0071's immutable event files, stream chain, idempotency, append
lock, checkpoint and source-last projection remain the shared mechanism.

`pipeline.lifecycle-governance-event.v1` remains the dispatch-correlated
payload. Its writable vocabulary is `dispatch`, `status`, and
`candidate-invalidation`. The five historical action-kind spellings remain
readable as legacy v1 records if such a record exists, but the portable append
path refuses a new v1 write for them after the action schema is available.
There must never be two writable encodings for the same action.

### D2 — Candidate invalidation and cancellation stay with continuity

Candidate invalidation and the cancelled status variant are not governance
actions. They remain lifecycle-v1 queue concepts and are not acceptance
criteria for this ADR's action producers.

No implementation may emit either until a real continuity transition supplies
its source identity and terminal state. A translator test covering
`cancelled` does not prove a producer when `LIFECYCLE_TERMINAL_STATUS` can only
observe `succeeded` and `failed`.

### D3 — The action payload is terminal, exact, and free of runner identity

The v1 action payload has exactly these fields:

- `eventId` — deterministic identifier for this retained fact;
- `kind` — one of `verification`, `review`, `gate`, `recovery`,
  `reconciliation`;
- `status` — one of `completed`, `failed`, `unknown`, `unavailable`;
- `reasonCode` — exactly one value admitted for that kind/status pair by the
  matrix below, never an arbitrary regex-admitted string;
- `correlation` — exact object containing `actionId`, `featureId`, `requestId`,
  and `sessionId`. `actionId` and `requestId` are non-empty closed IDs;
  `featureId` and `sessionId` are either source-validated IDs or exactly
  `{state: "not-applicable"}`;
- `candidate` — exact `{commit, tree}`. Typed candidate states are not admitted
  by the action payload.

There is no dispatch, attempt, worker, provider, model, runner, path, command,
prompt, rationale, person, signer, key reference, timestamp, free-form message,
invalidation link or supersession link in the payload. Append order already
retains history. A later event does not erase an earlier observation.

`requestId` is copied from the validated source identifier in the table below
or is that source receipt's lowercase SHA-256 digest. `actionId` is the
lowercase SHA-256 digest of canonical JSON with exactly
`{domain: "pipeline.governance-action-event.v1:action-id", kind, requestId}`.
`eventId` is the lowercase SHA-256 digest of canonical JSON with exactly
`{domain: "pipeline.governance-action-event.v1:event-id", kind, status,
reasonCode, correlation, candidate}`. In that input, `correlation.actionId` is
the already-derived `actionId`; `eventId` itself is absent. Consequently
`actionId` and `eventId` are deliberately distinct: the former is the stable
idempotency identity of the source action, while the latter identifies its
single terminal retained fact. Clock values and host details are not identity
inputs. The envelope carries observation time and repository identity.

The complete v1 kind/status/reason/candidate matrix is:

| Kind | Status | Reason code | Candidate |
|---|---|---|---|
| `verification` | `completed` | `VERIFICATION_PASSED` | exact commit/tree |
| `verification` | `failed` | `VERIFICATION_FAILED` | exact commit/tree |
| `verification` | `unknown` | `VERIFICATION_UNKNOWN` | exact commit/tree |
| `verification` | `unavailable` | `VERIFICATION_UNAVAILABLE` | exact commit/tree |
| `review` | `completed` | `REVIEW_PASSED` or `REVIEW_FINDINGS` | exact commit/tree |
| `gate` | `completed` | `PUSH_APPROVED` or `DEPLOY_APPROVED`; `HGO_CONSUMED` only after the independent register decision | exact commit/tree |
| `recovery` | `completed` | `RECOVERY_COMPLETED` | exact commit/tree |
| `reconciliation` | `completed` | `RECONCILIATION_COMPLETED` | exact commit/tree |

Every combination not listed is invalid. In particular, a failed or unavailable
review/gate/recovery/reconciliation operation without a durable accepted source
receipt emits no action event; its own source error remains the evidence.

### D4 — Candidate requirements vary only by closed kind

Every portable action requires an exact candidate matching the common envelope,
because the current portable event store and its checkpoints require concrete
commit/tree identity. Verification, review and push/deploy approval reuse their
existing candidate binding. Recovery and reconciliation must observe HEAD and
its tree while planning the requested event and retain that pre-action binding.
If a producer cannot observe a valid exact candidate, requesting an event is a
preflight refusal with zero source mutation; it does not substitute a typed
candidate or relax the store.

An HGO consumption event is eligible only for an exact-candidate capability
and only if the register explicitly accepts its public-safe projection. Global
plugin installation and other candidate-less HGO modes remain in the private
authenticated HGO audit ledger.

### D4a — Payload and envelope are bound by exact equalities

For an action event intent the common envelope must satisfy all of these rules:

- `origin === "lifecycle"`, `authorityClass === "non-authoritative"`,
  `streamId === "lifecycle"`, and
  `payloadSchema === "pipeline.governance-action-event.v1"`;
- `eventId === payload.eventId`;
- `idempotencyKey === payload.correlation.actionId`;
- `eventType === "lifecycle.action." + payload.kind`;
- `candidate` is deep-equal to `payload.candidate`;
- envelope `correlation.featureId`, `requestId`, and `sessionId` are deep-equal
  to the same payload fields;
- envelope `correlation.packageId` and `dispatchId` are exactly
  `{state: "not-applicable"}`;
- envelope `correlation.traceId === payload.correlation.actionId`.

No fallback, omission or alternate placement is admitted. The store checks
these equalities after selecting the validator by `payloadSchema`, before any
append. The duplicate `actionId` in `traceId` is the common-envelope correlation
handle; it does not claim distributed tracing. The builder or store also
recomputes both identifier digests defined in D3 and rejects a mismatched
`actionId` or `eventId` before append. A retry of the same terminal source fact
therefore repeats both identifiers; a different terminal fact reusing an
`actionId` reaches the existing idempotency conflict rather than silently
replacing the first event.

The payload correlation sources are also closed:

| Kind | `requestId` source | `featureId` / `sessionId` |
|---|---|---|
| `verification` | terminal Verify run ID or its domain-separated receipt digest | copy a validated source ID, otherwise `not-applicable` |
| `review` | accepted candidate packet ID | copy a validated source ID, otherwise `not-applicable` |
| `gate` | verified approval request/subject ID | copy a validated source ID, otherwise `not-applicable` |
| `recovery` | verified recovery plan digest | copy a validated source ID, otherwise `not-applicable` |
| `reconciliation` | verified reconciliation plan/baseline digest | copy a validated source ID, otherwise `not-applicable` |

### D5 — The portable payload cannot become an information channel

The new JSON schema and runtime validator are both closed and must agree. All
typed-state objects use an enum. All reason codes use enumerated values per
kind. Identifiers are copied from already validated source receipts or derived
from their canonical digest; producers do not accept arbitrary descriptive
identifiers solely for event construction.

The portable HGO projection, if accepted, contains only the fact
`HGO_CONSUMED`, its candidate and a digest-derived action identifier. It omits
reason, signer, key, selected paths, command, tool input, mode and author source
root. The private HMAC ledger remains the detailed authority audit.

Export projection continues to exclude payload bodies unless a later export
policy explicitly admits a closed field. No existing allowlist is widened by
this ADR.

### D6 — Producers expose an explicit artifact boundary

Follow the existing pipeline-state lifecycle pattern. A source command offers
an explicit action-event output argument. It validates the target, source
receipt and complete event before its source mutation; it writes the event only
after the source result is durable. Without the argument, existing behavior is
byte-for-byte unchanged.

The producer writes a validated event artifact. It does not append secretly to
`governance/events`. The governance event store remains the only canonical
append boundary and owns its current policy, lock, idempotency and readback.

If a requested event write fails after the source action became durable, the
command returns a typed `source-complete/event-unavailable` result and does not
claim full success. It must preserve enough closed source binding for an
idempotent event-only retry. It must not attempt to roll back a human approval,
completed Verify, accepted review, or already applied recovery merely because
the observational write failed.

### D7 — Reader-first migration and permanent read compatibility

Deployment order is mandatory:

1. Correct the published lifecycle-v1 four-versus-six-field drift and add a
   JSON-schema/runtime parity test.
2. Add the action schema/validator, envelope equality binding and store routing, legacy-v1
   read/new-write policy, with no producer enabled.
3. Add mixed-stream replay and viewer support. Dispatch timelines and
   package/worker/attempt topology remain unchanged; action timelines are a
   separate collection and section.
4. Enable one producer kind per independently tested slice.

Replay/readback changes are versioned. A v1 replay artifact remains readable.
A v2 readback carries separate dispatch and action timeline collections rather
than a union array whose members require shape guessing.

Once the first action event enters the append-only stream, rollback may disable
producers but must retain the new validator, store router and reader forever.
Removing read support would strand a valid stream prefix.

## Producer boundaries

- **Verification:** one aggregate terminal event after candidate stability and
  terminal Verify evidence persistence. Per-suite events remain suite receipts.
  `writeVerifyEvidencePair()` currently fsyncs and renames but does not read
  back; a producer must not claim physical readback until it performs one.
- **Review:** the accepted durable Critic receipt, after
  `consumeCandidatePacket()`, never raw model output. Runner adapters converge
  on this source contract; runner identity is not retained.
- **Gate:** successful `approve-push` or `approve-deploy` State readback.
  Approval authority remains the signed proof/State contract. An optional HGO
  consumption projection follows D4/D5.
- **Recovery:** successful `applySessionCleanupRecovery()` readback, plus an
  exact pre-action candidate observed during event planning. HGO audit
  repair is a later producer only if its public event vocabulary is accepted.
- **Reconciliation:** a successful `applyBacklogReconciliation()` transaction,
  plus an exact pre-action candidate observed during event planning;
  backlog-delivery apply/recovery joins only when its source receipt meets the
  same binding.

## Consequences

- Dispatch validation and topology remain strict and simple.
- Five action kinds gain honest correlation without fabricated workers.
- One extra payload validator and explicit router are required in the common
  envelope/store/replay path.
- An old reader fails closed on a newly introduced payload schema. Reader-first
  rollout is therefore a compatibility requirement, not deployment advice.
- Terminal-only events avoid a second mutable action state machine. The source
  system remains authoritative for in-progress state.
- Explicit output keeps event capture observable and makes failure/retry
  semantics testable without coupling successful governance actions to a
  hidden repository mutation.

## Rejected alternatives

### A single discriminated lifecycle union

Rejected. It saves one schema filename but forces correlation, candidate,
invalidation and replay unions into every dispatch consumer. It also either
changes v1 meaning in place or requires a lifecycle v2 while still leaving the
old mixed vocabulary readable.

### Fabricated dispatch identity

Rejected. A nearby worker identity is not the identity of a push approval,
Verify, recovery or reconciliation.

### A fourth governance-action stream

Rejected. It changes ADR-0071's registry, capture policy, heads and operational
topology although these records remain lifecycle observations.

### Automatic store append from every source command

Rejected for v1. It creates hidden tracked writes and an unresolved distributed
transaction between source State/evidence and the append-only governance
stream. The explicit artifact plus canonical append boundary is recoverable and
matches the existing lifecycle producer pattern.

## Acceptance slices

The executable acceptance criteria are maintained in the source backlog item.
They are ordered `LND-0` through `LND-8`; no producer slice may precede the
reader slices. Native Codex Sandbox/App Server execution under WSL is excluded
from every slice and is neither blocker nor evidence.

## Remaining register decisions

1. Accept and number this draft. Number allocation and the `docs/adr/README.md`
   row occur only in that acceptance commit under ADR-0069.
2. Decide whether exact-candidate HGO consumption receives the minimal portable
   projection in D5. Until explicitly accepted, HGO remains private-only and
   does not block the other four producer families.

No new PO gate is required for implementing the remaining accepted slices.
