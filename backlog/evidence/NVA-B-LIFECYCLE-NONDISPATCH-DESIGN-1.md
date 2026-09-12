# NVA-B-LIFECYCLE-NONDISPATCH-DESIGN-1

## Decision brief

Date: 2026-09-12  
Inspected commit: `21cf930cacebf26b3d2ceb8c6ebe55ed787c017e`  
Scope: runner-neutral schema and repository integration only. Native Codex
Sandbox/App Server behavior under WSL is deferred and is not evidence for this
decision.

**Recommendation: choose B — add a separate closed governance-action payload
schema, while retaining the existing `lifecycle` origin and stream.** Keep
`pipeline.lifecycle-governance-event.v1` dispatch-correlated and keep its three
queue-family kinds (`dispatch`, `status`, `candidate-invalidation`). Give the
five non-dispatch facts (`verification`, `review`, `gate`, `recovery`,
`reconciliation`) a new `pipeline.governance-action-event.v1` payload and a
separate action replay projection. This adds one validator/router but avoids
making every dispatch replay consumer conditional on two unrelated correlation
grammars.

This is the smallest coherent option because ADR-0071's common envelope,
append-only store, `lifecycle` stream, capture policy, locking, idempotency and
checkpoint machinery can all remain. A fourth stream or authority class is not
needed. Human approval remains authoritative only in its existing signed
ledger; the new record is a non-authoritative observation that the governed
action reached a defined durable boundary.

For compatibility, the v1 reader must continue accepting its currently
published five action-kind spellings if old records exist. The portable append
path should reject new v1 records for those spellings once the action schema is
available. That makes them legacy-read-only rather than silently changing the
meaning of a v1 payload or allowing two writable encodings for one fact.

## Current-source re-verification

The inherited defect is still present.

- `validateLifecycleGovernanceEvent()` in
  `plugins/pipeline-core/lib/lifecycle-governance-events.mjs:77-94` accepts all
  eight current kinds but requires every one to carry the six-field dispatch
  tuple at line 84: `packageId`, `dispatchId`, `attemptId`, `workerId`,
  `correlationId`, `queueRevision`.
- `buildLifecycleDispatchEvent()` and `buildLifecycleStatusEvent()` in
  `plugins/pipeline-core/lib/control-execution-lifecycle-event.mjs` are honest
  queue projections. Their shared `projectLifecycleEvent()` copies the tuple
  from a validated control/execution exchange at lines 135-175.
- `planDispatchLifecycleEvent()` and `planStatusLifecycleEvent()` in
  `plugins/pipeline-core/scripts/pipeline-state.mjs:2501-2615` are the two real
  producer plans. They prevalidate a target and source identity, then emit only
  after the corresponding State transaction is durable.
- `projectGovernanceReplay()` in
  `plugins/pipeline-core/lib/governance-replay.mjs` keys every event by
  `payload.correlation.dispatchId`, applies candidate-drift rules within that
  dispatch, and returns only `pipeline.governance-replay.v1` dispatch
  timelines. `buildGovernanceReplayViewModel()` repeats the six-field check and
  constructs package/worker/attempt topology. The renderer labels all eight
  kinds but still renders each as a row in a dispatch timeline.
- The common envelope already has a non-dispatch-capable correlation shape:
  `governance-event-envelope.schema.json` uses typed unavailable/not-applicable
  states for `featureId`, `packageId`, `requestId`, `sessionId`, `dispatchId`
  and `traceId`. The restriction comes from the lifecycle payload validator and
  replay, not the generic envelope or store.
- `governance-event.mjs:170-175` and
  `governance-event-store.mjs:461-469` currently admit exactly one payload
  schema for the `lifecycle` origin and always call
  `validateLifecycleGovernanceEvent()`. These are the central routing points a
  second payload schema must extend.

There is also pre-existing published-contract drift that must be corrected in
the same schema wave, not hidden by it. The runtime validator and its L-AC-02
test require six correlation fields, while
`governance/schemas/lifecycle-governance-event.schema.json:24` publishes only
four required fields and omits `correlationId` and `queueRevision`. No current
test validates JSON-schema/runtime-validator parity.

## Taxonomy: two existing, two queue gaps, five action facts

| Group | Kinds / trigger | Current fact | Design consequence |
|---|---|---|---|
| Existing queue events | `dispatch`, `status` | Real continuity producers and a real six-field tuple exist. | Preserve the v1 shape and replay semantics. |
| Queue-family gaps | candidate invalidation, cancellation status variant | `projectLifecycleEvent()` explicitly refuses an invalidated exchange; `planInvalidation` has no assigning producer. `LIFECYCLE_TERMINAL_STATUS` maps only `succeeded` and `failed`, although the pure terminal projection covers `cancelled`. | Solve later in the continuity state machine. Do not move these into the action schema. |
| Non-dispatch action facts | `verification`, `review`, `gate`, `recovery`, `reconciliation` | Their durable source records are candidate-, request-, session- or repository-scoped. None inherently owns an attempt/worker/dispatch tuple. | Give them an action correlation contract and action replay. |

Candidate invalidation and cancellation are therefore outside this decision's
implementation slice. A new action schema would not create either missing
state transition.

## Alternatives

### A. Turn the lifecycle payload into a discriminated union

Version the payload and discriminate `correlation` by kind: queue kinds retain
the six-field tuple; the five actions receive a smaller branch.

Advantages:

- one payload-schema name and one top-level lifecycle validator;
- no change to the envelope's current origin-to-payload-schema cardinality;
- existing `eventType = lifecycle.<kind>` naming can remain.

Costs and risks:

- the existing schema cannot be changed in place without making v1 mean two
  shapes; a real union requires v2 or an untracked breaking change;
- replay is structurally per-dispatch, so `projectGovernanceReplay()`, its
  readback, view model, topology and renderer all become unions too;
- candidate invalidation links, dispatch candidate-drift checks and action
  supersession would share one validator despite different invariants;
- every consumer that only needs dispatch history must learn the action branch;
- rollback cannot restore the old reader after the first action-shaped event is
  appended.

This option is smaller by file count but larger in semantic blast radius.

### B. Add a governance-action payload beside lifecycle v1

Add `pipeline.governance-action-event.v1`, admit it under origin/stream
`lifecycle`, route it independently in the store, and project it into action
timelines. Existing lifecycle v1 bytes and dispatch replay stay valid.

Advantages:

- no fabricated dispatch identity and no weakening of queue-event validation;
- action correlation, exact candidate binding and action-specific rules can be
  closed independently;
- dispatch replay and package/worker/attempt topology stay simple;
- producers and tests can land kind by kind after readers support the schema;
- write rollback can stop new action events while retaining permanent read
  compatibility.

Costs:

- the envelope's lifecycle origin must allow two payload schemas;
- store and replay need an explicit payload-schema router;
- a mixed lifecycle stream requires reader-first deployment: an old reader
  encountering a new action payload fails closed;
- documentation and export fixtures must describe both payload families.

### Rejected expansion: a fourth stream

A separate `governance-action` stream would keep old lifecycle readers from
seeing new events, but it changes ADR-0071's three-stream topology, registry,
capture policy, heads, export policy and operational setup. The facts are still
non-authoritative lifecycle observations, so a new stream buys too little for
that migration cost.

## Recommended closed payload boundary

The implementation design should pin the following minimum before coding:

- exact top-level fields: `eventId`, `kind`, `status`, `reasonCode`,
  `correlation`, `candidate`;
- `kind` is exactly the five action kinds;
- `correlation` contains `actionId`, `featureId`, `requestId` and `sessionId`.
  Only feature/session may use exactly `not-applicable`; it contains no worker,
  attempt, dispatch or queue revision;
- every action requires exact `{commit, tree}` compatible with the current
  portable store. Recovery/reconciliation retain the HEAD/tree observed during
  event planning or refuse before source mutation;
- status/reason combinations are exactly the matrix in
  `docs/adr/draft-governance-action-events.md` D3. No arbitrary regex-only
  reason is accepted;
- `eventType` is `lifecycle.action.<kind>` so it cannot collide with legacy
  lifecycle-v1 kind names;
- action events are append-only terminal facts and carry no supersession or
  invalidation link. Candidate invalidation remains owned by lifecycle v1;
- `requestId` is the validated source ID or its receipt digest; `actionId` is
  the canonical SHA-256 of the action-ID domain, kind and request ID; `eventId`
  is the canonical SHA-256 of the event-ID domain, kind, status, reason,
  correlation and exact candidate. They are distinct by design and neither
  uses caller descriptions, clocks or runner/provider names.

The envelope binding is now exact: envelope and payload event IDs and candidates
must match; idempotency key and trace ID equal the payload action ID; feature,
request and session correlations match field for field; package and dispatch
are exactly `not-applicable`; event type is `lifecycle.action.<kind>`. The
builder or store recomputes both canonical identifier digests before append,
so a payload cannot assert an unrelated action or event identity.

The producer should follow the existing pipeline-state pattern: validate the
event plan before mutation, establish the source transaction's durable
readback, then write the prevalidated event artifact. The governance store
continues to own canonical append, idempotency and stream locking. A producer
must not silently mutate `governance/events` as a side effect of an otherwise
clean command unless the new ADR explicitly chooses that transaction boundary.

## Producer blast radius

The five kinds need one shared pure action-event builder plus adapters at these
existing durable boundaries:

| Kind | Recommended source boundary | Production paths / symbols | Focused tests |
|---|---|---|---|
| verification | terminal Verify evidence after candidate-stability check and `writeVerifyEvidencePair(..., phase: "terminal")`; the current helper fsyncs and renames but does not physically read back, so the event adapter must not claim readback until it adds one | `harness/scripts/verify.mjs`; `harness/scripts/verify-evidence-writer.mjs::writeVerifyEvidencePair`; consuming-project route `plugins/pipeline-core/scripts/verify-evidence-producer.mjs::produceVerifyEvidence` | `verify-evidence-writer.test.mjs`, `verify-evidence-producer.test.mjs`, new terminal pass/fail/unknown action fixtures |
| review | accepted, durable Critic receipt, never raw model output | `critic-packet-preflight.mjs::consumeCandidatePacket`; adapters `critic-claude-host.mjs::finalizeClaudePacketReview` and `codex-critic-selected-host.mjs::runSelectedCriticHost`; future runners attach at the same receipt boundary | `critic-packet-preflight.test.mjs`, `critic-claude-host.test.mjs`, `codex-critic-selected-host.test.mjs`; runner-neutral builder tests. Native WSL execution tests excluded |
| gate | successful push/deploy State readback or consumed HGO capability; the action event is not the approval authority | `pipeline-state.mjs` cases `approve-push` and `approve-deploy`; `human-guard-override.mjs::consumeHumanGuardOverride` | push/deploy focused pipeline-state suites; `human-guard-override.test.mjs`; tests that no raw reason, path or signer data enters the portable payload |
| recovery | successful recovery apply readback | `session-cleanup-recovery.mjs::applySessionCleanupRecovery`; HGO audit recovery `human-guard-override.mjs::repairHumanGuardOverrideAudit` if included in the first vocabulary | `session-cleanup-recovery.test.mjs`, `human-guard-override.test.mjs`; idempotent replay and failed-readback non-emission |
| reconciliation | completed transaction with projection readback | `reconcile-backlog-ledger.mjs::applyBacklogReconciliation`; delivery paths `reconcile-backlog-delivery.mjs::applyBacklogDelivery` and `recoverBacklogDelivery` when explicitly in scope | their existing focused suites plus event-before/after failure injection and idempotency tests |

Do not wire every listed site independently to storage. Add one runner-neutral
builder and one append/output adapter, then make each source boundary supply a
closed source receipt. This keeps Claude, Codex and Antigravity out of the
schema and confines runner-specific review handling to receipt production.

## Consumer and contract blast radius

Required core changes:

- new `governance/schemas/governance-action-event.schema.json`;
- new `plugins/pipeline-core/lib/governance-action-events.mjs` and focused test;
- `governance/schemas/governance-event-envelope.schema.json` and
  `plugins/pipeline-core/lib/governance-event.mjs` plus tests: admit the second
  lifecycle-origin payload schema;
- `plugins/pipeline-core/lib/governance-event-store.mjs` plus tests: select the
  validator by `payloadSchema` and bind action correlation/candidate/eventType
  to the envelope;
- `plugins/pipeline-core/lib/governance-replay.mjs` and tests: route lifecycle
  payloads to unchanged dispatch timelines or new action timelines;
- `plugins/pipeline-core/scripts/governance-replay.mjs` and tests: preserve the
  payload-schema discriminator in its slim input and return a versioned
  readback containing both collections;
- `plugins/pipeline-core/lib/governance-replay-view.mjs`,
  `governance-replay-view-renderer.mjs`,
  `scripts/governance-replay-viewer.mjs` and their tests: render a separate
  Governance actions section; never fold action identifiers into worker
  topology;
- `plugins/pipeline-core/lib/governance-event-projection.mjs` and export tests:
  prove the existing envelope-only projection remains valid for the new
  payload family and still excludes payload bodies by default;
- `governance/artifact-topology.json`, `docs/governance-events.md`,
  `docs/governance-replay.md`, `governance/README.md`, and ADR-0071 or a
  successor ADR.

Also correct the lifecycle JSON-schema six-field correlation drift and add a
schema/runtime parity test. That correction is independent of action events,
but releasing another schema family while the published sibling contradicts
runtime would make compatibility claims unreliable.

## Compatibility, migration and rollback

1. **Reader-first:** add validators, envelope/store routing and replay/view v2
   support while emitting no action events. Retain read support for existing
   lifecycle-v1 events and v1 replay artifacts. Explicitly make the five old
   action-kind spellings legacy-read-only in the v1 append path.
2. **Parity correction:** align the published lifecycle-v1 correlation schema
   to the already-enforced runtime shape and pin it mechanically.
3. **Producer slices:** enable one action kind at a time behind explicit output
   arguments, beginning with verification because it has the clearest terminal
   candidate-bound receipt. Each slice includes success, failure,
   idempotent-replay and event-write-failure tests.
4. **Viewer last:** render action timelines only after mixed-stream replay is
   proven; keep the dispatch topology unchanged.

No canonical event is rewritten. After the first action event is appended,
rollback means disabling producers while retaining the new schema and read
router indefinitely. Removing reader support would strand an otherwise valid
append-only stream. If an event write is required materiality, source mutation
and event publication need a journal/outbox or explicit recoverable-partial
result; a post-mutation event failure must never be reported as full success.

## Falsifiers

Reconsider this recommendation if any of these is established with current
source evidence:

- all five action producers possess a real, stable dispatch/attempt/worker
  identity belonging to the action itself rather than a nearby worker;
- an external compatibility contract requires one payload schema and proves a
  versioned union can be adopted without forcing dispatch-only consumers to
  understand action correlation;
- the current portable store is changed in a separately accepted design to
  admit typed candidates. This ADR deliberately avoids that change; until then
  every action event remains exact-candidate-bound;
- the five actions have no coherent common action identity or status
  vocabulary. In that case use smaller per-domain payload schemas rather than
  weakening this proposed schema into a generic audit bag;
- a committed governance event must be atomic with each source mutation and no
  bounded journal/outbox can provide that property. Then the producer boundary
  must remain an explicit artifact/receipt handoff rather than automatic store
  append.

## Remaining register question

The one remaining architecture choice is not a PO product gate already defined
by the operating model: whether portable HGO consumption is acceptable after
removing reason, signer, path and command detail, or should remain only in the
authenticated private audit ledger.

Aggregate Verify is settled as one terminal event; per-suite results remain
receipts and do not produce lifecycle action events.

The candidate, status/reason and envelope-equality questions are no longer
open: the ADR requires exact candidates, enumerates the complete matrix and
defines every duplicate envelope binding.

Per the existing item triage, the schema choice requires an Elephant-recorded
ADR/state decision before implementation. It does not require a new ad hoc PO
approval merely to investigate or implement the already accepted Nova-B item.

## Decision-record promotion

The Option-B recommendation was promoted on 2026-09-12 into the unnumbered
`docs/adr/draft-governance-action-events.md`, following ADR-0069's rule that a
draft receives no number or index entry before acceptance. The source backlog
item now carries ordered acceptance slices LND-0 through LND-8. The draft
closes the general payload, migration, rollback, privacy, candidate and
producer-boundary choices; it leaves only formal ADR acceptance/numbering and
the optional public HGO projection as register decisions.
