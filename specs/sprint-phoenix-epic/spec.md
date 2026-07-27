# Spec PHX: Governance Sprint Phoenix

| Field | Value |
| --- | --- |
| Rigor level | 2 (spec-anchored core contracts) |
| Risk class | high |
| Status | draft |
| Date | 2026-07-26 |
| Profile / phase | epic / design |
| Readiness check | design revision in progress; bounded Advisor input un-attested; fresh fixed-candidate Critic pending |
| Product gate | [prd_phoenix-epic.md](prd_phoenix-epic.md) |
| Normative acceptance | [acceptance.md](acceptance.md) |
| Design | [design/architecture.md](design/architecture.md) |
| Scope validation | [design/scope-validation.md](design/scope-validation.md) |
| Live issue coverage | [design/issue-coverage.md](design/issue-coverage.md) |
| Governance conformance | [design/governance-conformance.md](design/governance-conformance.md) |
| Readiness audit | [design/readiness-audit.md](design/readiness-audit.md) |
| Related | GitHub #5, #9, #17, #23, #24, #30, #31, #32 · ADR-0043/0044/0045/0046 |

## 1. The problem

Agent Pipeline has candidate-bound verification, approval state, specialized
receipts, lifecycle events, and repository artifact topology, but it does not
yet provide one coherent governance data plane. Human authority history is
fragmented across mutable state and specialized logs. Material agent
assumptions and recovery choices are not durably distinguished from human
decisions. Lifecycle events cannot yet be replayed as one privacy-safe view,
and enterprise projections risk becoming provider-coupled or accidental
authority.

The 0.4.6 bootstrap also exposed a trust-root defect: marketplace freshness
assumes a Claude project file and consumer Git `HEAD`, even though a valid
Codex-only consumer can be pre-HEAD and already has native plugin registry
authority. A governance system cannot make reliable audit claims while its own
loaded ruleset identity is runner-dependent or falsely unavailable.

Phoenix must solve these problems as one architecture without creating one
ambiguous mega-log, capturing hidden reasoning, exporting private data, or
depending on unpublished Nova, Cyborg, or Nightwing work.

## 2. Goals

1. Make every supported human authority transition reconstructable from one
   repository-bound, append-only, tamper-evident ledger.
2. Record only material declared agent assumptions/selections in a separate,
   non-authoritative and privacy-minimized journal.
3. Provide a bounded lifecycle event model and local replay that preserves
   origin, assurance, candidate validity, and missing evidence.
4. Add organization policy packs with explicit conflict semantics and portable
   signed audit bundles.
5. Render a local accessible Evidence Viewer from validated canonical sources.
6. Define safe provider-neutral traceability/document and ITSM contracts.
7. Export sanitized governance events through neutral, one-way, independently
   queued destinations.
8. Make ruleset source/freshness independent of a runner-specific project path
   and valid for pre-HEAD consumers.
9. Make every Pipeline-known external command/script offer, recovery, and
   workaround trajectory auditable without persisting private machine details,
   raw command content, or raw reasoning, and without converting an offer or
   assertion into an execution-success claim.
10. Preserve immutable PRD/Spec authority across a legitimate active-design
    revision through a dedicated, decision-bound lifecycle transition, never a
    generic CAS or hand-edited State workaround.

## 3. Non-goals

- Capturing hidden chain-of-thought, scratchpads, complete prompts,
  conversations, terminal history, or unrestricted tool output.
- Treating an agent, mutable state, Git history, viewer, audit bundle, issue,
  wiki, ITSM status, SIEM alert, or transport acknowledgement as human
  Pipeline authority.
- Making an external system, vendor, collector, or hosted service mandatory.
- Building Nova's executor, scheduler, remote worker pool, or isolation model.
- Reopening completed Sentinel/0.4.6 recovery work because old status documents
  are stale.
- General Nightwing onboarding/front-door/documentation redesign.
- Committing credentials, endpoints, tenant coordinates, private actor
  mappings, signing keys, private paths, or machine-local queue state.
- Claiming exactly-once delivery, trusted time, verified legal identity,
  regulatory retention, analyst review, or legal compliance without separate
  evidence.
- Executing implementation before the Product Owner gives the literal
  `approved` against the readable PRD and this bound Spec.

## 4. Technical plan

### 4.1 Trust root

Introduce a normalized `pipeline.ruleset-source.v1` observation. Runner
adapters own native discovery; the common freshness service owns validation and
comparison. Codex uses native plugin-list readback, Claude uses its native
registry, self-application binds the loaded plugin root to the checkout, and
local development remains an explicit source class.

The common service does not require `.claude/settings.json`, `.codex` project
files, or consumer `HEAD`. Network freshness uses the selected
network-open/read-only host transport. All output is sanitized.

### 4.2 Governance event kernel

Create one small common event envelope plus separate closed payload schemas for
human decisions, agent declarations, deterministic lifecycle events, and
runner observations.

Portable canonical events are immutable files under `governance/events/`.
Each stream has repository-bound genesis, monotonic sequence, previous digest,
canonical bytes, and event digest. Generated heads/indexes are replaceable
projections.

One writer performs policy validation, redaction, locking, idempotency,
same-directory temporary write, file/directory durability, atomic publication,
exact readback, and source-last index update. Offline verification detects
truncation, reordering, modification, duplication, forks, unsafe paths, and
cross-repository writes.

### 4.3 Authority separation

The human ledger is the only historical source for human authority. Existing
state/guard/release/deploy readers migrate to require a valid decision
reference before an authority transition becomes effective.

The agent journal and lifecycle stream remain observational. They can request
or reference a human decision but cannot grant it. An external ITSM
observation is validated independently and composed with Pipeline authority at
the existing release boundary.

### 4.4 Policy and privacy

Public Core safety floors, neutral project policy, activated organization
packs, and machine-local bindings are resolved through per-field merge
strategies. No generic last-write-wins precedence exists.

Default disclosure is deny. Redaction happens before canonical persistence or
machine-local outbox persistence. Retention and access are independently
configured for human, agent, and lifecycle streams.

### 4.5 Projections

A validated query/projection service is the sole read boundary for:

- local timeline/topology replay;
- static Evidence Viewer;
- signed audit bundles;
- traceability/document adapters;
- ITSM change-control observations and projections;
- CloudEvents/OTLP/NDJSON/syslog export.

Every projection carries source digests, policy revision, integrity, origin,
authority class, and typed loss/omission. No projection is accepted by the
authority resolver.

### 4.6 Package sequence

Implementation follows the dependency graph in
[design/architecture.md](design/architecture.md):

1. PHX-0 lifecycle-authority revision writer and runner-neutral ruleset trust root;
2. PHX-1 governance event kernel and topology;
3. PHX-2 human decision ledger;
4. PHX-3 lifecycle stream/replay and organization policy foundation;
5. PHX-4 agent journal and traceability adapters;
6. PHX-5 Evidence Viewer, signed bundle, ITSM, and governance export;
7. PHX-6 migration, integrated security/privacy, documentation, and Epic close.

The physical WIP limit remains one writing implementation package. Review and
test work may run independently only when file ownership and evidence identity
do not overlap.

## 5. Stateful guard/control pre-readiness checklist

This section is mandatory because Phoenix changes durable authority, replay,
recovery, external mutations, and lifecycle gates.

### 5.1 Authority issuers and replay rules

- Human authority issuer: the sanctioned human-ledger writer, acting on a
  human-attributed request under effective policy.
- Agent issuer: sanctioned journal writer; always non-authoritative.
- Lifecycle issuer: deterministic control component or typed runner boundary;
  always non-authoritative unless it references a separately valid human
  decision.
- Policy authority: Core floor plus explicit neutral project/organization
  activation; machine-local binding supplies no portable rule authority.
- Replay: exact idempotency tuple returns the existing record with zero write;
  conflicting replay fails closed.

### 5.2 Durable storage and atomicity

- Canonical event: new immutable file, atomically published and read back.
- Stream projection: source-last, rebuildable, never authority.
- Organization policy activation: journaled, recoverable, source-last.
- External outbox/cursor: machine-local per destination, not authority.
- Adapter/ITSM mutation: remote operation plus exact revision readback; no
  cross-system atomicity claim.
- Audit bundle: content-addressed manifest first, optional detached signature
  second.

### 5.3 Crash-state matrix

The normative matrix is in
[design/architecture.md §4.3](design/architecture.md#43-crash-and-fork-matrix).
Implementation packages add focused matrices for:

- policy activation before/after source and projection commit;
- human decision append before/after state projection;
- outbox enqueue/send/partial acknowledgement/checkpoint;
- external preview/apply/readback/reconciliation;
- signed manifest/signature publication;
- migration inventory/event/state projection.

No package may defer its matrix to implementation prose.

### 5.4 Exact mutation and enforcement points

- Event mutation: governance event writer only.
- Authority effectiveness: authority resolver under the existing state/release
  writer lock, after ledger readback.
- Policy mutation: sanctioned activation writer only.
- External write: adapter controller only after preview and exact human
  authorization.
- Export send: exporter only from already-sanitized outbox bytes.
- Enforcement: existing guard, state, release, Close, and deployment entry
  points call typed validators; documentation alone is insufficient.

### 5.5 Bootstrap and self-update

PHX-0 lands before other packages depend on new event claims. Its mandatory
slice A adds the sanctioned continuity-authority revision writer: a legitimate
active-design PRD/Spec change stays blocked from generic CAS and can advance
only through one exact scoped human decision, pre/post artifact bindings,
atomic State readback, and public-safe audit record. Slice B then binds
bootstrap readback to the loaded ruleset source through the normalized
contract. Self-application and installed-plugin paths use the same shape. A
plugin update cannot rewrite or reinterpret an existing v1 governance event.

### 5.6 Binary candidate/evidence binding

Every package result, Verify receipt, Critic verdict, migration, viewer, bundle,
adapter write, ITSM observation, and export boundary receipt binds exact
candidate commit/tree and relevant source digests. Uncommitted or changed
inputs invalidate the claim.

### 5.7 Exact pre/post bytes

Writers bind canonical request bytes, observed preimage digest, canonical final
bytes, and exact readback digest. External systems bind preview content,
expected external revision, submitted digest, and read-back revision/content
digest where supported.

### 5.8 Sole recovery authority

- Canonical stream recovery: governance event writer recovery command.
- Human authority/state projection recovery: the state writer consuming the
  committed decision ID.
- Policy activation recovery: policy activation journal.
- Export recovery: destination-specific outbox controller.
- External write recovery: adapter reconciliation command.
- Cross-component recovery that changes authority requires a human-ledger
  decision.

No generic cleanup script or model-written file edit may substitute.

### 5.9 Self-reference audit

- `heads.json` cannot authenticate event records.
- mutable state cannot authenticate its own approval.
- an audit bundle cannot authenticate its source repository without source
  digests/signature policy.
- a delivery receipt cannot authenticate destination retention.
- an external status cannot authenticate Pipeline authority.
- a signature cannot authenticate legal identity, key custody, or trusted time
  beyond its validated policy.
- a viewer cannot authenticate the records it renders.
- the event exporter cannot consume its own projection as a source.

## 6. Contract surfaces

### 6.1 Schemas

The v1 schema family is closed:

- `pipeline.ruleset-source.v1`
- `pipeline.governance-event-envelope.v1`
- `pipeline.human-governance-decision.v1`
- `pipeline.agent-decision-event.v1`
- `pipeline.lifecycle-governance-event.v1`
- `pipeline.governance-stream-registry.v1`
- `pipeline.governance-event-receipt.v1`
- `pipeline.governance-capture-policy.v1`
- `pipeline.organization-policy-pack.v1`
- `pipeline.effective-policy.v1`
- `pipeline.audit-bundle-manifest.v1`
- `pipeline.external-reference.v1`
- `pipeline.external-adapter-capabilities.v1`
- `pipeline.change-control-profile.v1`
- `pipeline.change-control-receipt.v1`
- `pipeline.governance-export-policy.v1`
- `pipeline.governance-delivery-receipt.v1`

Unknown fields fail validation. Version upgrades require explicit migration and
cannot silently reinterpret v1.

### 6.2 Writer/query operations

The public-neutral service boundaries are:

```text
ruleset-source observe|freshness
governance-event preview|append|verify|query
governance-authority resolve|reconcile
organization-policy inspect|plan|activate|status
audit-bundle plan|build|verify|sign|verify-signature
evidence-viewer build
external-reference inspect|preview|apply|readback|reconcile
change-control status|prepare|observe|gate|reconcile
governance-export preview|enable|status|drain|replay|disable
```

These are interface names, not permission grants. Every mutating operation has
an exact preview/plan, explicit authority requirement, idempotency key, and
readback.

### 6.3 Standard profiles

- Event interchange: CloudEvents 1.0 semantics, pinned source release 1.0.2.
- Collector mapping: OpenTelemetry specification 1.59.0 stable Logs Data Model
  plus a separately pinned tested OTLP/protobuf mapping.
- Legacy event mapping: RFC 5424 with explicit loss declaration.
- Offline event projection: canonical NDJSON.
- JSON canonicalization: RFC 8785-compatible closed profile.
- Trace correlation: W3C Trace Context identifiers where applicable.
- Optional signed bundle: DSSE 1.0.2 envelope and in-toto Attestation
  Framework 1.2.0 Statement v1 profile.

Standards define interchange, not Pipeline authority or compliance.

## 7. Detailed implementation inventory

The inventory below is the intended Epic file contract. A package briefing
selects a bounded subset. A new implementation file outside this inventory
requires the Elephant to update the Spec before dispatch; generated evidence
files are excepted only when their path is already declared here.

### 7.1 Existing authority and topology files to modify

| File | Change | Rationale |
| --- | --- | --- |
| `governance/artifact-topology.json` | add governance event/policy/bundle classes and canonical roots | Extend #22 without path guessing. |
| `docs/artifact-topology.md` | document new classes, retention, and projections | Keep the human contract synchronized. |
| `docs/adr/README.md` | register Phoenix ADRs | Maintain ADR discovery. |
| `docs/product-capability-inventory.json` | register new public capabilities/surfaces | Preserve capability governance. |
| `.claude/pipeline.yaml` | register new Verify/security/governance paths only through its authoritative source workflow | Make new contracts enforceable without direct generated-file edits. |
| `harness/scripts/verify.mjs` | add scoped Phoenix suite registrations | One Verify gate must cover every package. |
| `harness/scripts/security-scan.mjs` | preserve exact source-candidate identity across its detached scan worktree; distinguish stable repository identity from worktree-local configuration and fail closed on actual source/tree/inventory drift | Make blocking Security evidence reproducible and honest. |
| `harness/scripts/security-scan.test.mjs` | add detached-worktree identity, clean-before/after, real-drift, and false-clean regression fixtures | Prove a zero-finding scan can reach a truthful exit-0 verdict only on its exact candidate. |
| `harness/definition-of-done.md` | add governance-stream/privacy/external-projection closure checks | Make Epic completion auditable. |

### 7.2 Ruleset-source trust root

| File | Change | Rationale |
| --- | --- | --- |
| `plugins/pipeline-core/schemas/ruleset-source.schema.json` | create normalized closed schema | Runner-neutral authority. |
| `plugins/pipeline-core/lib/ruleset-source.mjs` | create validator/normalizer | Common contract. |
| `plugins/pipeline-core/lib/ruleset-source.test.mjs` | create adapter-neutral tests | Contract conformance. |
| `plugins/pipeline-core/lib/codex-host-plugin-list.mjs` | expose sanitized source/loaded/installed identity | Stop discarding native Codex authority. |
| `plugins/pipeline-core/lib/codex-host-plugin-list.test.mjs` | add Codex-only/pre-HEAD/privacy fixtures | Prevent regression. |
| `plugins/pipeline-core/hooks/staleness-check.mjs` | separate Claude adapter from common source contract | Remove runner-specific common dependency. |
| `plugins/pipeline-core/hooks/staleness-check.test.mjs` | add Claude adapter contract tests | Retain Claude behavior. |
| `plugins/pipeline-core/scripts/ruleset-freshness.mjs` | consume normalized source and selected host boundary | Truthful freshness. |
| `plugins/pipeline-core/scripts/ruleset-freshness.test.mjs` | cover Codex-only, Claude, pre-HEAD, self/local, network and privacy states | Binary PX0 evidence. |
| `plugins/pipeline-core/scripts/pipeline-start-preflight.mjs` | return/bind normalized source observation | Bootstrap trust root. |
| `plugins/pipeline-core/scripts/pipeline-start-preflight.test.mjs` | validate loaded/installed/source mismatch behavior | Prevent false readiness. |

### 7.3 Governance event kernel

| File | Change | Rationale |
| --- | --- | --- |
| `governance/schemas/governance-event-envelope.schema.json` | create shared envelope schema | Common correlation without authority collapse. |
| `governance/schemas/governance-stream-registry.schema.json` | create registry/genesis schema | Bind streams to repository and algorithms. |
| `governance/schemas/governance-event-receipt.schema.json` | create sanitized receipt schema | Exact append/readback evidence. |
| `governance/schemas/governance-capture-policy.schema.json` | create materiality/privacy policy schema | Deterministic capture and redaction. |
| `governance/events/registry.json` | create initial stream registry | Portable stream authority. |
| `plugins/pipeline-core/lib/governance-event.mjs` | create envelope/canonicalization/validation primitives | Shared safe event representation. |
| `plugins/pipeline-core/lib/governance-event.test.mjs` | create canonicalization, schema, size, Unicode, unknown-field tests | Kernel correctness. |
| `plugins/pipeline-core/lib/governance-event-store.mjs` | create physical stream writer/query/verify/recovery | Sole canonical storage service. |
| `plugins/pipeline-core/lib/governance-event-store.test.mjs` | create crash, concurrency, fork, symlink, idempotency, cross-repo tests | Stateful assurance. |
| `plugins/pipeline-core/scripts/governance-event.mjs` | create preview/append/verify/query CLI | Sanctioned operator/consumer surface. |
| `plugins/pipeline-core/scripts/governance-event.test.mjs` | create CLI and sanitized-output tests | End-to-end boundary. |
| `docs/governance-events.md` | create model, operator, retention, recovery guide | Maintained contract. |
| `docs/adr/0047-governance-event-kernel.md` | create architectural decision | Durable rationale and rejected options. |

### 7.4 Human ledger and authority integration

| File | Change | Rationale |
| --- | --- | --- |
| `governance/schemas/human-governance-decision.schema.json` | create decision taxonomy/payload | Only human authority stream. |
| `plugins/pipeline-core/lib/human-governance-ledger.mjs` | create preview/append/query/resolution | Canonical history. |
| `plugins/pipeline-core/lib/human-governance-ledger.test.mjs` | create decision lifecycle/assurance/repository tests | #30 acceptance. |
| `plugins/pipeline-core/lib/governance-authority-resolver.mjs` | create effective authority resolver | Decouple state projection from history. |
| `plugins/pipeline-core/lib/governance-authority-resolver.test.mjs` | cover expiry, consumption, revocation, stale candidate, cross-repo | Fail-closed gates. |
| `harness/scripts/pipeline-state.mjs` | require/reference valid decision IDs for human authority transitions and recovery | Integrate existing state writer. |
| `harness/scripts/pipeline-state.test.mjs` | add ledger-backed transition/reconciliation tests | Preserve writer guarantees. |
| `plugins/pipeline-core/hooks/guard-git.mjs` | bind override decisions/ledger to physical target repository | Close cross-repository override gap. |
| `plugins/pipeline-core/hooks/guard-git.test.mjs` | add coordinator/target/privacy/replay cases | Backlog regression. |
| `docs/human-governance-ledger.md` | create taxonomy, assurance, migration, operator guide | Human/auditor contract. |
| `docs/adr/0048-human-governance-authority.md` | create authority decision | Prevent future authority collapse. |

### 7.5 Agent journal and lifecycle replay

| File | Change | Rationale |
| --- | --- | --- |
| `governance/schemas/agent-decision-event.schema.json` | create material assumption/selection payload | #31 closed contract. |
| `governance/schemas/lifecycle-governance-event.schema.json` | create deterministic/runner event payload | #17 closed contract. |
| `plugins/pipeline-core/lib/agent-decision-journal.mjs` | create materiality/redaction/lifecycle service | Privacy-safe agent record. |
| `plugins/pipeline-core/lib/agent-decision-journal.test.mjs` | cover assumption lifecycle, prohibited content, provenance, fail policy | #31 acceptance. |
| `plugins/pipeline-core/lib/lifecycle-governance-events.mjs` | map #10 and existing receipts to events | Reuse accepted control boundary. |
| `plugins/pipeline-core/lib/lifecycle-governance-events.test.mjs` | cover serial/parallel/retry/cancel/malicious inputs | #17 acceptance. |
| `plugins/pipeline-core/lib/governance-replay.mjs` | create validated correlation/timeline projection | Local replay. |
| `plugins/pipeline-core/lib/governance-replay.test.mjs` | cover gaps, forks, invalidation, unknown ordering, privacy | Honest replay. |
| `plugins/pipeline-core/scripts/governance-replay.mjs` | create local replay CLI | Human-operable read surface. |
| `plugins/pipeline-core/scripts/governance-replay.test.mjs` | create deterministic output tests | Stable view. |
| `plugins/pipeline-core/config/runner-profiles-v3.json` | register capture duties only if routing contract requires it | Bind material route declarations. |
| `plugins/pipeline-core/config/control-execution-extension-namespaces.json` | add only reviewed Phoenix event extensions if necessary | Reject provider injection. |
| `templates/prompts/goldfish-task.md` | require dispatch provenance handoff | Close durable provenance gap. |
| `plugins/pipeline-core/skills/close-block/SKILL.md` | verify dispatch/exception/recovery records at close | Make audit omissions visible. |
| `docs/agent-decision-journal.md` | create materiality/privacy/operator guide | Prevent hidden-reasoning scope creep. |
| `docs/governance-replay.md` | create replay semantics and limitations | Non-authoritative view contract. |

### 7.6 Organization policy and audit bundle

| File | Change | Rationale |
| --- | --- | --- |
| `governance/schemas/organization-policy-pack.schema.json` | create closed portable pack schema | #9 policy contract. |
| `governance/schemas/effective-policy.schema.json` | create resolved projection schema | Inspectable values/conflicts. |
| `governance/schemas/audit-bundle-manifest.schema.json` | create bounded bundle manifest | Offline assurance. |
| `plugins/pipeline-core/lib/organization-policy.mjs` | create merge/validation/preview logic | No last-write-wins weakening. |
| `plugins/pipeline-core/lib/organization-policy.test.mjs` | cover floors/intersections/conflicts/signatures/private fields | Policy safety. |
| `plugins/pipeline-core/lib/organization-policy-activation.mjs` | create transactional activation/status/recovery | Sanctioned writer. |
| `plugins/pipeline-core/lib/organization-policy-activation.test.mjs` | create crash/replay/projection tests | Stateful assurance. |
| `plugins/pipeline-core/lib/audit-bundle.mjs` | create inventory/build/verify/signature-interface logic | #9 bundle service. |
| `plugins/pipeline-core/lib/audit-bundle.test.mjs` | cover topology, tampering, omitted artifacts, signatures, privacy | Offline evidence. |
| `plugins/pipeline-core/scripts/organization-policy.mjs` | create inspect/plan/activate/status CLI | Explicit policy operation. |
| `plugins/pipeline-core/scripts/organization-policy.test.mjs` | create CLI/readback tests | Operator boundary. |
| `plugins/pipeline-core/scripts/audit-bundle.mjs` | create plan/build/verify/sign CLI | Portable bundle operation. |
| `plugins/pipeline-core/scripts/audit-bundle.test.mjs` | create deterministic bundle fixtures | #9 acceptance. |
| `docs/organization-policy-packs.md` | create precedence/activation/migration guide | Maintained user contract. |
| `docs/audit-bundles.md` | create assurance/signing/retention guide | Prevent signature overclaim. |
| `docs/adr/0049-policy-and-audit-bundles.md` | create policy/bundle decision | Durable architecture. |

### 7.7 Evidence Viewer

| File | Change | Rationale |
| --- | --- | --- |
| `plugins/pipeline-core/lib/evidence-view-model.mjs` | create validated neutral view model | Separate data from HTML. |
| `plugins/pipeline-core/lib/evidence-view-model.test.mjs` | cover states, links, invalid sources, redaction | #5 semantics. |
| `plugins/pipeline-core/lib/evidence-view-renderer.mjs` | create static accessible HTML renderer | Offline human-readable output. |
| `plugins/pipeline-core/lib/evidence-view-renderer.test.mjs` | create snapshots, CSP, accessibility structure, mobile/desktop fixtures | Viewer quality. |
| `plugins/pipeline-core/scripts/evidence-viewer.mjs` | create build CLI | One-command local report. |
| `plugins/pipeline-core/scripts/evidence-viewer.test.mjs` | create E2E build/tamper tests | #5 acceptance. |
| `plugins/pipeline-core/assets/evidence-viewer.css` | create self-contained accessible styles | No network dependency. |
| `docs/evidence-viewer.md` | create usage, sharing, trust limitations | Prevent UI authority claim. |

### 7.8 External adapters and ITSM

| File | Change | Rationale |
| --- | --- | --- |
| `governance/schemas/external-reference.schema.json` | create relation/ownership/revision schema | #23 neutral link. |
| `governance/schemas/external-adapter-capabilities.schema.json` | create capability declaration | Fail on unsupported operations. |
| `governance/schemas/change-control-profile.schema.json` | create policy/environment/change schema | #24 semantics. |
| `governance/schemas/change-control-receipt.schema.json` | create sanitized observation/receipt | Candidate-bound evidence. |
| `plugins/pipeline-core/lib/external-reference-adapter.mjs` | create inspect/preview/apply/readback/reconcile controller | Safe provider-neutral writes. |
| `plugins/pipeline-core/lib/external-reference-adapter.test.mjs` | create synthetic issue/wiki/document/forge tests | #23 conformance. |
| `plugins/pipeline-core/lib/change-control.mjs` | create typed lifecycle/composed gate | #24 authority separation. |
| `plugins/pipeline-core/lib/change-control.test.mjs` | cover classes, stale/unknown, deploy/rollback/reconciliation | #24 acceptance. |
| `plugins/pipeline-core/scripts/external-reference.mjs` | create explicit adapter CLI | Operator control. |
| `plugins/pipeline-core/scripts/external-reference.test.mjs` | create preview/readback/privacy tests | External safety. |
| `plugins/pipeline-core/scripts/change-control.mjs` | create status/prepare/observe/gate/reconcile CLI | Release integration. |
| `plugins/pipeline-core/scripts/change-control.test.mjs` | create E2E synthetic lifecycle tests | #24 evidence. |
| `docs/external-traceability.md` | create ownership/mapping/publication guide | #23 maintained contract. |
| `docs/change-control.md` | create policy/lifecycle/runbook/recovery guide | #24 maintained contract. |
| `docs/adr/0050-external-authority-composition.md` | create adapter/ITSM authority decision | Prevent external bypass. |

### 7.9 Governance event export

| File | Change | Rationale |
| --- | --- | --- |
| `governance/schemas/governance-export-policy.schema.json` | create projection/destination/failure policy | #32 default-deny contract. |
| `governance/schemas/governance-delivery-receipt.schema.json` | create sanitized delivery evidence | Honest acknowledgement. |
| `plugins/pipeline-core/lib/governance-event-projection.mjs` | create deterministic allowlist/redaction/mappings | Sanitize before queue. |
| `plugins/pipeline-core/lib/governance-event-projection.test.mjs` | cover CloudEvents/OTLP/NDJSON/syslog and loss | Standards conformance. |
| `plugins/pipeline-core/lib/governance-export-outbox.mjs` | create per-destination durable local queue/cursor | Reliable non-authority state. |
| `plugins/pipeline-core/lib/governance-export-outbox.test.mjs` | cover interruption, duplicates, gaps, corruption, partial acceptance | Delivery integrity. |
| `plugins/pipeline-core/lib/governance-export-adapter.mjs` | create capability/health/send/ack interface | Provider neutrality. |
| `plugins/pipeline-core/lib/governance-export-adapter.test.mjs` | create memory/file/OTLP/syslog conformance fixtures | No commercial dependency. |
| `plugins/pipeline-core/scripts/governance-export.mjs` | create preview/enable/status/drain/replay/disable CLI | Explicit lifecycle. |
| `plugins/pipeline-core/scripts/governance-export.test.mjs` | create E2E policy/failure/readback tests | #32 acceptance. |
| `docs/governance-event-export.md` | create mapping, retention, runbook, incident/recovery guide | #32 operator contract. |
| `docs/adr/0051-governance-event-export.md` | create outbox/export decision | Durable rationale. |

### 7.10 Phoenix package and integration documentation

| File | Change | Rationale |
| --- | --- | --- |
| `specs/sprint-phoenix-epic/prd_phoenix-epic.md` | maintain PO-facing product authority | PO gate. |
| `specs/sprint-phoenix-epic/spec.md` | maintain this rigor-2 contract | Implementation authority. |
| `specs/sprint-phoenix-epic/acceptance.md` | maintain issue-to-test criteria | Binary completeness. |
| `specs/sprint-phoenix-epic/design/architecture.md` | maintain architecture and standards mapping | Shared design. |
| `specs/sprint-phoenix-epic/design/scope-validation.md` | maintain inclusion/exclusion rationale | Prevent scope drift. |
| `specs/sprint-phoenix-epic/design/issue-coverage.md` | map every live issue acceptance bullet to normative criteria | Make issue completeness independently auditable. |
| `specs/sprint-phoenix-epic/design/governance-conformance.md` | maintain guideline/policy disposition and review prerequisites | Make governance readiness explicit. |
| `specs/sprint-phoenix-epic/design/readiness-audit.md` | maintain requirement-level design readiness and remaining gates | Prevent partial evidence from becoming a broad readiness claim. |
| `specs/sprint-phoenix-epic/RECOVERY.md` | create design/implementation recovery authority | Audit and rollback. |
| `specs/sprint-phoenix-epic/result.md` | create append-only package results during implementation | Durable outcome. |
| `specs/sprint-phoenix-epic/lifecycle.json` | create/update through #22 lifecycle writer | Canonical package state. |
| `docs/phoenix-governance-threat-model.md` | create the integrated trust-boundary, abuse-case, privacy, and recovery threat model | Satisfy the maintained project threat-model obligation. |
| `docs/state.md` | update only at governed handover/close boundaries | Cross-session continuity. |
| `CHANGELOG.md` | update only at an approved release boundary | Public release communication. |

## 8. Epic acceptance criteria

The detailed binary matrix is [acceptance.md](acceptance.md). The Epic-level
criteria are:

- **PHX-AC-01:** WHEN a human authority transition is supported, THE SYSTEM
  SHALL require one valid repository/scope-bound human-ledger decision before
  the transition becomes effective.
- **PHX-AC-02:** WHEN human, agent, lifecycle, external, and delivery records
  are correlated or projected, THE SYSTEM SHALL preserve origin, authority,
  assurance, privacy, integrity, and candidate binding.
- **PHX-AC-03:** IF any projection, external status, agent event, mutable state,
  or transport acknowledgement is offered as human authority, THEN THE SYSTEM
  SHALL reject it.
- **PHX-AC-04:** WHEN a governance record is persisted or exported, THE SYSTEM
  SHALL apply allowlisting/redaction before the first durable boundary and
  SHALL exclude all prohibited private/raw content.
- **PHX-AC-05:** IF canonical event history is modified, truncated, reordered,
  forked, duplicated, unsafe, or cross-repository, THEN offline verification
  and every dependent authority claim SHALL fail.
- **PHX-AC-06:** WHEN ruleset freshness runs in a Codex-only or pre-HEAD
  consumer, THE SYSTEM SHALL resolve native loaded source authority without a
  `.claude` dependency or false unavailable state.
- **PHX-AC-07:** WHEN external traceability, ITSM, or export is configured, THE
  SYSTEM SHALL preserve local offline authority and keep credentials/private
  coordinates machine-local.
- **PHX-AC-08:** WHEN THE PIPELINE knowingly offers an external command or
  script for execution, including a Pipeline-initiated offer and a
  user-requested, Pipeline-supplied offer, THE SYSTEM SHALL append a
  privacy-safe correlated offer before presentation or initiation; it SHALL
  keep offer, authority, attempt, observed outcome, user assertion, readback,
  rollback, and cleanup distinct, require exact human authority only for a
  policy-gated/authority-changing/guard-bypassing/destructive action, and
  SHALL NOT store prohibited raw or derived private command details or claim
  execution/success without bounded evidence.
- **PHX-AC-09:** WHEN Phoenix claims complete, THE SYSTEM SHALL satisfy every
  issue and acceptance row or carry an explicit PO-approved residual with
  owner/expiry and no false completion claim.
- **PHX-AC-10:** IF an implementation package depends on unpublished Nova,
  Cyborg, or Nightwing work, THEN Verify SHALL reject Phoenix independence.

## 9. Verification and evidence plan

Each package must provide:

1. red-before/green-after focused fixtures where an existing defect is fixed;
2. schema and pure-function tests;
3. filesystem transaction, crash, concurrency, symlink/path, idempotency, and
   cross-repository tests for stateful components;
4. privacy tests that seed credentials, paths, prompts, commands, personal
   fields, and malicious external content and prove absence from every durable
   output;
5. platform capability fixtures for Linux, macOS, Windows, WSL-native, and
   unavailable states without overclaiming native assurance;
6. conformance fixtures that require no named commercial service;
7. package-scoped Verify evidence bound to exact commit/tree;
8. blocking Security and independent review where the package changes
   authority, external writes, secret boundaries, or parsers;
9. a fresh high-risk Critic on the integrated candidate;
10. exact branch push and fetch/readback only after separate PO authorization.

Full Verify is not run during design bootstrap. It becomes mandatory on every
implementation candidate named by the roadmap and on final integration.

## 10. Migration and compatibility

1. Inventory existing authority/state/override/deploy/release records through a
   read-only preview.
2. Classify each record as provable decision, unverified observation, duplicate
   projection, or unsupported.
3. Activate new streams without changing existing gate behavior.
4. Dual-read legacy and new decision references for a bounded compatibility
   window; new writes go only through the ledger.
5. Migrate one authority path at a time with red/green reconciliation tests.
6. Reject mutable state that claims authority absent in the ledger after its
   migration gate turns blocking.
7. Preserve old `artifactLifecycle.v1`, event, receipt, and Result schemas as
   immutable historical formats.
8. Remove compatibility only through a separately approved, evidenced
   transition.

No migration fabricates historical decisions or deletes legacy evidence.

## 11. Risks and controls

| Risk | Control |
| --- | --- |
| A mega-ledger makes agent telemetry authority | Separate stream/payload schemas and an authority resolver that reads only human decisions. |
| Audit capture leaks private information | Default-deny schemas, pre-persistence redaction, prohibited-content tests, separate local bindings. |
| Hash chain is mistaken for identity/trusted time | Explicit assurance fields and documentation; optional external signature/time references only. |
| Git concurrency creates split-brain history | New immutable event files, per-stream lock, sequence/previous digest, fork detection and human disposition. |
| Policy precedence becomes a weakening channel | Per-field merge strategies and immutable Core floors. |
| External system becomes required or authoritative | Offline canonical operation, adapter capability contracts, separate composed gate, advisory default. |
| Export queues become a second source | Machine-local sanitized outbox; no authority reader consumes it. |
| Standards drift changes semantics silently | Pin tested profile versions; explicit migrations only. |
| Epic size hides incomplete issues | Issue/AC matrix, package-level closure, final integrated gate. |
| Parallel Sprint contamination | Dedicated branch, accepted common base, no unpublished sibling dependency, diff/readback checks. |
| Old 0.4.6 documentation is misread as open work | PO disposition recorded in scope validation; only explicit Phoenix mappings enter scope. |

## 12. Alternatives considered

| Alternative | Rejected because |
| --- | --- |
| Implement each GitHub issue independently | Duplicates envelopes/policy/adapter logic and creates contradictory authority boundaries. |
| One audit/event schema and stream | Erases the critical human/agent/deterministic/runner distinction. |
| Reuse mutable pipeline state as history | Cannot preserve denial, revocation, expiry, correction, or supersession. |
| Make the Evidence Viewer canonical | A mutable UI/projection cannot be authority. |
| Let policy packs override any Core value | Organization configuration could silently weaken security/governance floors. |
| Direct vendor integrations in Core | Couples credentials, object models, failure semantics, and roadmap to products. |
| Export raw records and redact downstream | Leaks before the first controlled boundary. |
| Depend on Nova #14 for #17 | Violates independent Sprint closure; #10 is sufficient. |
| Fix only the observed Codex path | Repeats runner-specific drift; the source contract must be runner-neutral. |
| Treat external-handoff/workaround audit as free-form command logging | Leaks private data and recreates hidden-reasoning/transcript retention risk. |

## 13. Definition of Done

- Every criterion in `acceptance.md` maps to a named automated test or Verify
  step and exact evidence.
- Every public issue #5/#9/#17/#23/#24/#30/#31/#32 has a complete, independently
  reviewable closure mapping.
- PHX-0 continuity-authority revision behavior is verified for generic-CAS
  rejection, exact decision/preimage/candidate binding, success/readback,
  conflicting replay, concurrent writer, crash recovery, and public-safe
  receipt fixtures; its trust-root behavior is verified on Codex, Claude,
  self-application, local-development, pre-HEAD, offline, stale, and ambiguous
  fixtures.
- Stateful package crash/recovery matrices are implemented and tested.
- External command-offer fixtures prove both offer origins, no-offer/no-display
  fail-closed behavior for material actions, privacy rejection, and the
  distinction between offer, authority, attempt, user assertion, and verified
  readback.
- Security fixtures prove detached-worktree equivalence, exact clean
  before/after candidate binding, and fail-closed source/tree/inventory drift;
  a zero-finding scanner report with unverified candidate binding is not clean.
- Privacy/security threat model and prohibited-content matrix pass before any
  external live test.
- Full Verify, blocking Security, and high-risk Critic pass on the exact
  integrated candidate.
- The final package remains independent of unpublished Nova, Cyborg, and
  Nightwing commits.
- The Product Owner separately authorizes push/merge/release and accepts the
  final Epic; PRD approval alone authorizes only the first implementation
  dispatch.
- Any residual limitation is explicit, non-misleading, owned, expiring, and
  approved; otherwise Phoenix does not claim complete.
