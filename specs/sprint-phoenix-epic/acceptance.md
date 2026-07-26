# Sprint Phoenix acceptance matrix

Status: draft

Rigor: 2

Risk: high
Parent specification: [spec.md](spec.md)

Every criterion uses an EARS-style trigger and observable result. This matrix
is normative and is summarized by the Epic criteria in `spec.md`. A package
cannot claim completion from prose review alone; each criterion must map to a
named test or deterministic Verify step and exact candidate evidence.

## Normative interpretation of Spec §§4.4–4.5

For every Phoenix stream, package, briefing, and implementation, Spec §4.4's
“independently configured” retention/access statement means independent
capture eligibility and downstream projection/export decisions within a
selected storage profile. It does not mean independent physical ACLs or
retention for files committed to one Git repository: every portable record
shares the repository's complete access population and durable-history
boundary. A narrower requirement selects `restricted-machine-local` or fails
closed before persistence.

Spec §4.5's “sole read boundary” means that the query/projection service is the
only sanctioned semantic input for replay, viewer, bundle, adapter, ITSM, and
export consumers. It is not the only physically possible filesystem or Git
read and is not a confidentiality control against repository readers. Portable
admission therefore SHALL make direct clone/read exposure safe before the
first durable byte. This interpretation is normative and cannot be weakened by
architecture prose or an implementation briefing.

## PX0 — Runner-neutral ruleset source and freshness

- **PX0-AC-01:** WHEN bootstrap resolves a loaded Pipeline distribution, THE
  SYSTEM SHALL emit one closed runner-neutral source observation containing
  runner, selected plugin, version, source class, and the strongest available
  loaded/installed identity.
- **PX0-AC-02:** WHEN a valid Codex-only consumer has no
  `.claude/settings.json`, THE SYSTEM SHALL resolve marketplace source through
  the native Codex registry without reporting `marketplace-unavailable`.
- **PX0-AC-03:** WHEN a valid consumer repository is pre-HEAD, THE SYSTEM SHALL
  compare the loaded plugin identity rather than requiring consumer `HEAD`.
- **PX0-AC-04:** WHEN Claude, Codex, self-application, or local-development
  supplies a source observation, THE SYSTEM SHALL validate it through the same
  common closed contract before freshness evaluation.
- **PX0-AC-05:** IF loaded, installed, source, or remote identity is missing or
  disagrees, THEN THE SYSTEM SHALL return a distinct typed status and SHALL NOT
  infer equality.
- **PX0-AC-06:** WHEN remote freshness needs networking on a host with a known
  network-denied workspace sandbox, THE SYSTEM SHALL use the selected
  network-open/read-only host transport without consuming a known-failing
  sandbox attempt.
- **PX0-AC-07:** WHEN source/freshness diagnostics are rendered or persisted,
  THE SYSTEM SHALL omit tokens, credentials, home paths, cache paths, private
  remotes, SSH key paths, and account coordinates.
- **PX0-AC-08:** WHEN the ruleset source is private or local, THE SYSTEM SHALL
  preserve its classification without exporting its coordinates.
- **PX0-AC-09:** WHEN source equality is claimed, THE SYSTEM SHALL bind the
  claim to the exact loaded identity and exact observed public remote identity.
- **PX0-AC-10:** IF a runner adapter emits unknown keys, ambiguous selectors, or
  more than one selected Pipeline plugin, THEN THE SYSTEM SHALL fail closed.

## K — Governance event kernel

- **K-AC-01:** WHEN a governance event is submitted, THE SYSTEM SHALL validate
  one closed envelope, one origin-specific payload schema, the physical target
  repository, effective policy, and size/classification limits before writing.
- **K-AC-02:** WHEN the same canonical request and idempotency key are replayed,
  THE SYSTEM SHALL return the existing event with zero write.
- **K-AC-03:** IF an idempotency key is reused with different content, THEN THE
  SYSTEM SHALL fail closed without adding an event.
- **K-AC-04:** WHEN an event is published, THE SYSTEM SHALL create one immutable
  canonical file, compute its domain-separated event digest over canonical
  bytes with exactly the `eventDigest` field omitted, bind its previous digest
  and sequence, atomically read it back, emit an independently retainable
  checkpoint witness, and update only replaceable indexes source-last.
- **K-AC-05:** IF two records fork from one predecessor or claim one sequence,
  THEN THE SYSTEM SHALL mark the stream invalid until an explicit governed
  disposition is appended through the sanctioned recovery operation; recovery
  SHALL never delete or rewrite either published record.
- **K-AC-06:** IF a canonical record is truncated, reordered, changed,
  duplicated, symlinked, path-substituted, or bound to another repository, THEN
  offline verification against the required candidate-bound or independently
  retained checkpoint SHALL fail. Without such a checkpoint, verification may
  report only `prefix-valid`/completeness `unknown` and SHALL NOT satisfy an
  authority, bundle, viewer, migration, or release gate.
- **K-AC-07:** WHEN an index/head is absent or stale but canonical records form
  one valid chain up to the required checkpoint, THE SYSTEM SHALL rebuild the
  projection only through `governance-event recover` with exact preimage,
  checkpoint, idempotency, write-ahead, and readback binding, without changing
  canonical records.
- **K-AC-08:** IF a head/index asserts a canonical record that is absent or
  invalid, THEN THE SYSTEM SHALL fail closed rather than trusting the
  projection.
- **K-AC-09:** WHEN a record contains an unknown, unavailable, omitted,
  redacted, invalid, or not-applicable value, THE SYSTEM SHALL preserve the
  exact typed state.
- **K-AC-10:** WHEN any consumer queries multiple streams, THE SYSTEM SHALL
  preserve each record's origin, authority class, integrity, and assurance.

## H — Human Governance Decision Ledger (#30)

- **H-AC-01:** WHEN a supported human decision changes Pipeline authority, THE
  SYSTEM SHALL durably append and read back one exact repository/scope-bound
  decision before making the transition effective.
- **H-AC-02:** IF mutable state claims human authority without a matching valid
  ledger decision, THEN THE SYSTEM SHALL reject the authority claim.
- **H-AC-03:** WHEN approval is requested, granted, denied, cancelled, consumed,
  revoked, expired, corrected, or superseded, THE SYSTEM SHALL use distinct
  linked event types.
- **H-AC-04:** WHEN policy requires candidate, package, artifact, environment,
  action, rule, validity, or single-use binding, THE SYSTEM SHALL reject a
  decision missing or mismatching any required dimension.
- **H-AC-05:** WHEN identity or time is locally attributed rather than
  independently attested, THE SYSTEM SHALL record the lower assurance class and
  SHALL NOT claim verified identity or trusted time. A portable repository
  record SHALL contain only the non-identifying authority/actor class and
  assurance; any natural-person attribution or joinable pseudonymous reference
  SHALL remain in the separately protected, erasable machine-local profile.
- **H-AC-06:** WHEN a `repository-public-safe` authority decision is consumed,
  revoked, expired, or superseded, THE SYSTEM SHALL leave the original event
  unchanged and append the new disposition. This append-only requirement
  applies only to portable repository records. A `restricted-machine-local`
  record SHALL instead follow its authorized expiry, erase, and key-destruction
  policy under H-AC-11/H-AC-13; after the proved erasure boundary, only a
  non-correlating sanitized operation receipt MAY remain, and dependent
  authority SHALL fail closed rather than reconstructing the erased content.
- **H-AC-07:** IF a decision from one repository is presented in another, THEN
  THE SYSTEM SHALL reject it before state or external mutation.
- **H-AC-08:** WHEN a legacy approval/override/deploy record cannot prove its
  original authority tuple, THE SYSTEM SHALL import it only as an unverified
  observation that cannot satisfy a gate.
- **H-AC-09:** WHEN cross-repository guarded work is authorized, THE SYSTEM
  SHALL bind evaluation, token consumption, ledger placement, and target
  repository to one physical target and SHALL NOT copy private coordinates
  into the coordinator repository.
- **H-AC-10:** WHEN a PO authorizes bounded direct Elephant implementation or
  another role exception, THE SYSTEM SHALL record exact scope, reason, expiry,
  constraints, and mandatory follow-up review; it SHALL NOT create a standing
  implicit bypass.
- **H-AC-11:** WHEN a reviewer reconstructs a human decision, THE SYSTEM SHALL
  expose request, actor/authority class and assurance, time and assurance,
  exact scope, stable reason code, policy and rule digests, evidence, outcome,
  consumption, revocation, expiry, correction, and supersession. A
  natural-person attribution or free-form rationale MAY be exposed only from
  a separately protected machine-local decision record to an authorized local
  query. That restricted record SHALL have no portable counterpart or join
  handle and SHALL NOT be persisted in, bundled from, or inferred by a
  repository record.
- **H-AC-12:** WHEN an existing guard, plan, release, deployment, or override
  path grants or consumes human authority, including `guard-devplan`,
  `guard-push`, `pipeline-state`, release planning, deploy approval/consumption,
  and Git-guard override consumption, THE SYSTEM SHALL reference and validate
  the canonical decision ID before the transition becomes effective. Every
  direct reader SHALL dual-evaluate during migration, fail on disagreement,
  and carry the shared compatibility owner and expiry.
- **H-AC-13:** IF a proposed portable ledger entry contains a secret, raw
  prompt, complete transcript, unrestricted command/output, private path, or
  private coordinate, natural-person identifier, joinable pseudonym,
  free-form rationale, or any data whose policy requires selective access,
  finite erasure, correction in place, or a retention period shorter than the
  repository's, THEN THE SYSTEM SHALL reject portable persistence before any
  temporary or final file exists. Deterministic redaction MAY produce a new
  public-safe request only when the result is classified for the repository's
  single access/retention trust zone.
- **H-AC-14:** WHEN the human-ledger package is declared complete, THE SYSTEM
  SHALL provide maintained schemas, event taxonomy, authority/trust model,
  threat model, migration, retention, recovery, and operator guidance.
- **H-AC-15:** WHEN the human-ledger conformance suite runs, THE SYSTEM SHALL
  cover grant, denial, consumption, expiry, revocation, correction, retry,
  concurrency, interruption, tampering, stale candidate, cross-repository
  binding, and redaction.

## A — Agent Decision and Assumption Journal (#31)

- **A-AC-01:** WHEN an agent declares a material assumption or selection, THE
  SYSTEM SHALL record its domain, status, selected option, stable reason codes,
  evidence basis/gaps, and revalidation trigger before dependent action where
  policy requires.
- **A-AC-02:** WHEN an assumption becomes verified, contradicted, expired,
  invalidated, or superseded, THE SYSTEM SHALL append a linked event without
  rewriting the original.
- **A-AC-03:** IF a changed material assumption affects a package, candidate,
  decision, or evidence result, THEN THE SYSTEM SHALL identify the affected
  objects and invoke the governed revalidation/invalidation path.
- **A-AC-04:** WHEN an agent asks for human authority, THE SYSTEM SHALL correlate
  the request to the human ledger and SHALL NOT self-confirm it.
- **A-AC-05:** WHEN runner, model, effort, profile, role, adapter, or capability
  identity is recorded, THE SYSTEM SHALL include its provenance and assurance.
- **A-AC-06:** IF a journal request contains hidden reasoning, raw prompts,
  complete transcripts, secrets, private paths, unrestricted commands/output,
  or duplicated artifact bodies, THEN THE SYSTEM SHALL reject or
  deterministically remove the prohibited content before persistence.
- **A-AC-07:** WHEN capture policy marks a security, privacy, authority,
  candidate, external-side-effect, recovery, or verification-scope event
  mandatory, THE SYSTEM SHALL NOT silently sample or discard it.
- **A-AC-08:** WHEN delivered work originated from a dispatch, THE SYSTEM SHALL
  retain a matching public-safe dispatch reference and detect missing required
  provenance.
- **A-AC-09:** WHEN routine low-impact activity is not material, THE SYSTEM
  SHALL avoid producing exhaustive reasoning or token-level telemetry.
- **A-AC-10:** IF agent journaling is unavailable, THEN THE SYSTEM SHALL apply
  the event class's explicit fail-open/fail-closed policy and expose the gap.
- **A-AC-11:** WHEN an assumption state is recorded, THE SYSTEM SHALL preserve
  `assumed`, `inferred`, `observed`, `verified`, `contradicted`,
  `unavailable`, and `unknown` as distinct typed states.
- **A-AC-12:** WHEN journal retention, access, or integrity policy is resolved,
  THE SYSTEM SHALL keep capture eligibility and downstream projection/export
  policy independently configurable from the human ledger without permitting
  either policy to weaken the other's authority boundary. Portable records in
  one Git repository SHALL share that repository's access and retention
  boundary; a stream requiring a narrower boundary SHALL use the separately
  protected machine-local profile or fail closed before persistence. This is
  the normative interpretation of Spec §§4.4–4.5: “independently configured”
  means independent capture eligibility and downstream projection/export
  decisions within the selected storage profile, not per-stream physical ACL
  or retention inside one Git repository; “sole read boundary” means the sole
  sanctioned semantic consumer interface for the listed projections, not an
  exclusive filesystem/Git read or confidentiality boundary. Direct repository
  reads are assumed possible and SHALL be safe from restricted or erasable
  content by pre-durability admission.
- **A-AC-13:** WHEN interrupted, concurrent, duplicate, or out-of-order journal
  submissions occur, THE SYSTEM SHALL produce deterministic typed outcomes and
  preserve one valid canonical history or a fail-closed fork state.
- **A-AC-14:** WHEN the journal conformance suite runs, THE SYSTEM SHALL cover
  unverified assumptions, later confirmation, contradiction, candidate
  invalidation, route selection, decomposition, verification-scope change,
  escalation, fallback, redaction, tampering, retry, and missing journal
  availability.
- **A-AC-15:** WHEN the agent-journal package is declared complete, THE SYSTEM
  SHALL provide maintained schema, taxonomy, materiality policy, trust model,
  privacy threat model, retention, recovery, and operator documentation.
- **A-AC-16:** IF an agent-journal event is presented as approval, waiver, risk
  acceptance, release/deployment authority, destructive-operation authority,
  or deterministic evidence, THEN THE SYSTEM SHALL reject that use and require
  the corresponding human-ledger decision or canonical evidence.

## L — Lifecycle stream and replay (#17)

- **L-AC-01:** WHEN dispatch, status, cancellation, candidate change,
  verification, review, gate, recovery, or reconciliation produces a material
  event, THE SYSTEM SHALL project it through a closed lifecycle schema.
- **L-AC-02:** WHEN an event derives from the #10 control/execution exchange,
  THE SYSTEM SHALL retain package, dispatch, attempt, queue, candidate, worker,
  correlation, and invalidation identity.
- **L-AC-03:** WHEN runner-specific detail is retained, THE SYSTEM SHALL place it
  under a registered namespaced extension and reject unknown namespaces.
- **L-AC-04:** WHEN replay correlates human, agent, deterministic, and
  runner-observed records, THE SYSTEM SHALL preserve their distinct semantic
  and visual classes.
- **L-AC-05:** IF stream sequence, correlation, candidate, or authority binding
  is broken, THEN THE SYSTEM SHALL render the gap/invalidation and SHALL NOT
  invent a total order or successful completion.
- **L-AC-06:** WHEN replay is generated, THE SYSTEM SHALL exclude raw prompts,
  messages, credentials, private paths, and unrestricted logs by default.
- **L-AC-07:** WHEN serial, parallel, retry, cancellation, recovery, or malicious
  event fixtures are replayed, THE SYSTEM SHALL produce deterministic bounded
  output.
- **L-AC-08:** WHEN lifecycle event classes, fields, or views are selected, THE
  SYSTEM SHALL trace each retained element to a stated user or audit need and
  SHALL NOT justify it only through competitor or provider parity.

## P — Policy packs and signed audit bundles (#9)

- **P-AC-01:** WHEN an organization pack is inspected, THE SYSTEM SHALL validate
  schema, provenance, compatibility, dependencies, signature policy, and every
  field's merge strategy before activation.
- **P-AC-02:** IF a pack attempts to weaken an immutable Core floor, widen a set
  intersection, introduce an unknown rule, or conflict with a single-owner
  value, THEN THE SYSTEM SHALL reject activation.
- **P-AC-03:** WHEN a policy transition is proposed, THE SYSTEM SHALL show a
  deterministic preview of origin, prior/effective value, conflict, newly
  required artifacts, external effects, and historical backfill range.
- **P-AC-04:** WHEN a pack is activated, THE SYSTEM SHALL use a recoverable,
  source-last transaction and exact readback; generated runner projections
  SHALL NOT become authority.
- **P-AC-05:** WHEN portable policy is stored, THE SYSTEM SHALL exclude
  credentials, endpoints, private tenant/project coordinates, private actor
  mappings, and private signing keys.
- **P-AC-06:** WHEN a bundle is built, THE SYSTEM SHALL inventory artifacts
  through a valid `pipeline.feature-package.v1` manifest and the #22 topology
  validator, bind exact source digests, policy versions, independently retained
  event-chain checkpoints, candidate/release identity, and verification
  results, and fail on legacy, missing, orphaned, misplaced, stale, truncated,
  or illegally mutable required artifacts.
- **P-AC-07:** WHEN a bundle is signed, THE SYSTEM SHALL use an external key
  interface and declare signature/key/time assurance without implying trusted
  identity, custody, retention, or compliance beyond the evidence.
- **P-AC-08:** WHEN a normative PRD/Spec/acceptance/result is required at Close,
  THE SYSTEM SHALL retain it at a durable topology path under a valid lifecycle
  manifest or require an explicit human disposition; initial manifest creation
  and every lifecycle transition SHALL use an exact preview, authority class,
  candidate/evidence binding, transactional writer, and readback. Handover
  prose SHALL NOT substitute for it.
- **P-AC-09:** WHEN historical events would become exportable after a policy or
  destination change, THE SYSTEM SHALL require exact preview and explicit
  backfill consent.
- **P-AC-10:** IF an adopting system is not separately assessed against a legal
  or regulatory regime, THEN THE SYSTEM SHALL NOT claim compliance from a
  policy pack, log, viewer, or signed bundle.
- **P-AC-11:** WHEN policy requires a governed document or external
  publication, THE SYSTEM SHALL remain provider-neutral and scope permission by
  document class, target class/binding, mode, owned fields/sections, lifecycle
  event, preview, approval, retention, conflict policy, and revision readback.
- **P-AC-12:** WHEN a bundle is verified offline, THE SYSTEM SHALL validate its
  manifest, artifact digests, event-chain references, topology, optional
  signature profile, and declared omissions and SHALL visibly reject
  tampering.
- **P-AC-13:** WHEN the policy/bundle package is declared complete, THE SYSTEM
  SHALL provide a maintained threat model plus explicit pack, schema,
  activation, bundle, and compatibility migration/versioning policy.

## V — Human-readable Evidence Viewer (#5)

- **V-AC-01:** WHEN a completed or in-progress governed package is selected, THE
  SYSTEM SHALL generate one offline static report from validated canonical
  artifacts and streams.
- **V-AC-02:** WHEN the report renders a fact, estimate, assumption, human
  decision, unknown, unavailable, redacted, invalid, or not-applicable value,
  THE SYSTEM SHALL label the exact class visibly.
- **V-AC-03:** WHEN the report renders approval, exception, review, check, or
  release state, THE SYSTEM SHALL link the claim to its canonical source
  record/evidence and exact candidate.
- **V-AC-04:** IF any source digest, topology, chain, candidate, or policy
  binding is invalid, THEN THE SYSTEM SHALL mark the affected view invalid and
  SHALL NOT render a pass/approval claim.
- **V-AC-05:** WHEN redacted sharing is requested, THE SYSTEM SHALL produce a
  deterministic policy-bound projection without raw prompts, logs,
  credentials, private paths, or coordinates.
- **V-AC-06:** WHEN report fixtures are rendered, THE SYSTEM SHALL pass
  accessibility structure, keyboard/navigation, content-security-policy, and
  representative mobile/desktop snapshot checks.
- **V-AC-07:** IF a viewer file or UI state is modified, THEN THE SYSTEM SHALL
  remain unable to alter canonical authority.
- **V-AC-08:** WHEN canonical lifecycle state marks an artifact proposed,
  active, completed, superseded, abandoned, or retained, THE SYSTEM SHALL
  represent that exact state or a typed invalid/unavailable result.
- **V-AC-09:** WHEN the viewer conformance suite runs, THE SYSTEM SHALL include
  pass, fail, unknown, tampered, misplaced, orphaned, and legacy-layout
  fixtures with deterministic snapshots.
- **V-AC-10:** WHEN a viewer report is opened, THE SYSTEM SHALL display the
  exact candidate binding prominently before any derived pass, approval, or
  release summary.

## X — Traceability and documentation adapters (#23)

- **X-AC-01:** WHEN an external link is recorded, THE SYSTEM SHALL bind system
  class, adapter/profile, object ID, relation, authority direction, Pipeline
  artifact digest, external revision, mode, and freshness.
- **X-AC-02:** WHEN a field or document section is synchronized, THE SYSTEM
  SHALL require one ownership class: Pipeline-owned, external-owned,
  projection-only, independently maintained, or unsupported.
- **X-AC-03:** WHEN an external write is proposed, THE SYSTEM SHALL perform
  inspect, exact preview, authority confirmation, idempotent apply, revision
  readback, and sanitized receipt against one target.
- **X-AC-04:** IF the target revision changed, ownership conflicts, readback
  differs, or the adapter lacks a required capability, THEN THE SYSTEM SHALL
  report conflict/partial/reconciliation-required rather than success.
- **X-AC-05:** WHEN external state changes, THE SYSTEM SHALL treat it as a typed
  observation or review request and SHALL NOT execute a Pipeline transition
  from ordinary text/status.
- **X-AC-06:** WHEN an external object is stale, deleted, moved, merged,
  duplicated, inaccessible, or observed out of order, THE SYSTEM SHALL preserve
  a deterministic typed state.
- **X-AC-07:** WHEN an adapter handles credentials or private coordinates, THE
  SYSTEM SHALL keep them in approved machine-local storage and exclude them
  from portable evidence and diagnostics.
- **X-AC-08:** WHEN provider-specific capability or mapping is needed, THE
  SYSTEM SHALL confine its name/fields to the adapter profile and SHALL NOT add
  them to normative core schemas.
- **X-AC-09:** IF external content contains commands, prompts, or malicious
  structured data, THEN THE SYSTEM SHALL treat it as untrusted data and prevent
  execution/authority injection.
- **X-AC-10:** WHEN a Pipeline artifact is linked or published, THE SYSTEM SHALL
  resolve its sole canonical identity and lifecycle through #22 rather than a
  repository-specific path guess.
- **X-AC-11:** WHEN organization policy governs a mandatory document class or
  external write, THE SYSTEM SHALL consume the effective #9 policy and SHALL
  NOT create a parallel adapter authority.
- **X-AC-12:** WHEN adapter conformance is evaluated, THE SYSTEM SHALL prove one
  provider-neutral core contract with synthetic issue-tracker, knowledge-base,
  document-store, and secondary-forge profiles.
- **X-AC-13:** WHEN an adapter profile does not explicitly enable a narrower
  synchronized field/section, THE SYSTEM SHALL default to reference-only or
  outbound-projection behavior and reject generic last-write-wins.
- **X-AC-14:** IF an external system is offline or unavailable, THEN THE SYSTEM
  SHALL preserve canonical local operation and authority and expose the
  external observation/reconciliation gap.
- **X-AC-15:** WHEN the adapter package is declared complete, THE SYSTEM SHALL
  provide maintained contract, threat model, ownership and lifecycle mapping,
  publication guide, recovery procedure, and conformance suite.

## C — ITSM change control (#24)

- **C-AC-01:** WHEN change control is enabled for an environment, THE SYSTEM
  SHALL bind policy, change class, immutable artifact, environment, scope,
  required external state, schedule, freshness, and update obligations.
- **C-AC-02:** WHEN standard, normal, emergency, or not-required classification
  is selected, THE SYSTEM SHALL apply distinct validated inputs and SHALL NOT
  permit class selection solely to avoid approval.
- **C-AC-03:** WHEN promotion is evaluated, THE SYSTEM SHALL independently
  validate Pipeline authority and authenticated external change authority
  against the same artifact/environment/scope/window tuple.
- **C-AC-04:** IF external state is draft, stale, rejected, expired,
  conflicting, unknown, outside its window, unauthenticated, or bound to
  another artifact/environment, THEN THE SYSTEM SHALL block mandatory
  promotion.
- **C-AC-05:** WHEN deployment begins, validates, fails, or rolls back, THE
  SYSTEM SHALL publish the corresponding external update only after the local
  event and SHALL preserve failed attempts.
- **C-AC-06:** IF deployment succeeds but an external update/readback fails,
  THEN THE SYSTEM SHALL retain deployment evidence and enter
  `reconciliation-required` without claiming completed change control.
- **C-AC-07:** WHEN emergency change policy is used, THE SYSTEM SHALL require
  its explicit human authority, bounded scope, and retrospective evidence; it
  SHALL NOT act as a generic bypass.
- **C-AC-08:** WHEN no effective policy requires ITSM, THE SYSTEM SHALL keep the
  existing deploy adapter independently usable.
- **C-AC-09:** WHEN release configuration is evaluated for an environment, THE
  SYSTEM SHALL resolve exactly `not-required` or one effective change-control
  profile and reject ambiguous/multiple mandatory profiles.
- **C-AC-10:** WHEN an external change record or documentation projection is
  created automatically, THE SYSTEM SHALL retain it as draft/observation and
  SHALL NOT infer external approval.
- **C-AC-11:** WHEN a provider-specific ITSM capability or mapping is needed,
  THE SYSTEM SHALL confine product names and fields to adapter profiles and
  SHALL NOT modify the provider-neutral deploy or change-control core schema.
- **C-AC-12:** WHEN the external ITSM system is unavailable, THE SYSTEM SHALL
  apply the effective advisory or mandatory policy explicitly, preserving
  local evidence and an operator-visible recovery/reconciliation path.
- **C-AC-13:** WHEN the change-control package is declared complete, THE SYSTEM
  SHALL provide maintained threat model, policy precedence, migration,
  operator runbook, and failure/rollback/recovery procedures.

## E — Governance event export (#32)

- **E-AC-01:** WHEN an event is exported, THE SYSTEM SHALL map exactly one
  validated canonical source event to one stable destination-neutral event ID,
  source, type, time, schema, correlation, policy revision, and integrity
  reference.
- **E-AC-02:** WHEN CloudEvents, OTLP, NDJSON, or RFC 5424 profiles are used,
  THE SYSTEM SHALL use pinned deterministic mappings and declare every lossy
  field/semantic conversion.
- **E-AC-03:** WHEN an export policy is absent, THE SYSTEM SHALL deny every
  field and destination by default.
- **E-AC-04:** WHEN a free-form human rationale or agent summary exists, THE
  SYSTEM SHALL omit it unless an explicit destination policy allows and
  redacts it before outbox persistence.
- **E-AC-05:** WHEN a destination is enabled, THE SYSTEM SHALL maintain an
  independent sanitized outbox, cursor, retry budget, health state, and
  dead-letter area outside portable authority.
- **E-AC-06:** WHEN delivery is retried, THE SYSTEM SHALL use at-least-once
  semantics and stable source/event idempotency and SHALL NOT claim
  exactly-once.
- **E-AC-07:** WHEN a batch is partially accepted, THE SYSTEM SHALL advance
  only safely acknowledged events and leave every other event recoverable.
- **E-AC-08:** IF cursor rollback, outbox truncation, event gap, source fork,
  invalid hash, schema downgrade, forged acknowledgement, or destination
  mismatch is detected, THEN THE SYSTEM SHALL fail typed and preserve the
  canonical source.
- **E-AC-09:** WHEN a destination is advisory and unavailable, THE SYSTEM SHALL
  expose lag/failure while allowing canonical local governance to continue.
- **E-AC-10:** WHEN export is required at a named lifecycle boundary, THE
  SYSTEM SHALL block only that boundary and the exact unacknowledged source
  range with an operator-visible recovery.
- **E-AC-11:** WHEN a delivery receipt is generated, THE SYSTEM SHALL state
  adapter/profile, batch/events, attempt, acknowledgement class, counts,
  terminal disposition, cursor/lag, and policy/projection digests without
  implying retention, immutability, analyst review, or compliance.
- **E-AC-12:** IF an external destination emits an alert, command, approval, or
  status, THEN THE SYSTEM SHALL prevent it from changing Pipeline authority
  through the outbound export channel.
- **E-AC-13:** WHEN multiple destinations are configured, THE SYSTEM SHALL keep
  their policies, queues, cursors, credentials, health, and failure domains
  independent.
- **E-AC-14:** WHEN live destination tests are absent, THE SYSTEM SHALL still
  prove core conformance using in-memory, local-file, OTLP-profile, syslog, and
  failure-injection fixtures without requiring a commercial service.
- **E-AC-15:** WHEN an event is prepared for export, THE SYSTEM SHALL complete
  allowlisting/redaction before outbox, transport log, dead-letter, metric,
  diagnostic, or delivery-receipt persistence.
- **E-AC-16:** WHEN the exporter operates under retryable failures or shutdown,
  THE SYSTEM SHALL apply bounded batching, compression where enabled, rate
  limits, retry budget/backoff, backpressure, cancellation, flush, replay, and
  restart recovery according to the destination profile.
- **E-AC-17:** WHEN an exported event or batch is delivered more than once, THE
  SYSTEM SHALL preserve one canonical source history and SHALL NOT create
  duplicate governance authority.
- **E-AC-18:** WHEN portable export intent/evidence is written, THE SYSTEM SHALL
  exclude destination credentials, endpoints, certificates, tokens, and
  private organization coordinates while preserving typed local bindings.
- **E-AC-19:** WHEN export health is rendered by the Evidence Viewer, THE
  SYSTEM SHALL show destination profile, lag, failure/quarantine counts,
  integrity gaps, acknowledgement class, and recovery state without becoming
  an authorization source.
- **E-AC-20:** WHEN an audit bundle includes export metadata, THE SYSTEM SHALL
  include only policy/profile digests and sanitized delivery evidence required
  by bundle policy and SHALL NOT treat delivery as source authority.
- **E-AC-21:** WHEN the export package is declared complete, THE SYSTEM SHALL
  provide a maintained threat model, data-flow diagram, mapping/loss guide,
  retention guidance, operator runbook, and incident/recovery procedures.

## R — Workaround and recovery audit profile

- **R-AC-01:** WHEN a sanctioned path is rejected and an alternative recovery
  is considered, THE SYSTEM SHALL record the trigger, typed rejection,
  evidence gap, candidate alternatives, and selected recovery as an agent
  event.
- **R-AC-02:** WHEN recovery changes authority or bypasses a normal guard path,
  THE SYSTEM SHALL require and correlate an exact human-ledger decision before
  the mutation.
- **R-AC-03:** WHEN recovery mutates local state, THE SYSTEM SHALL record a
  stable operation class, public-safe target binding, exact pre/post evidence
  digests, recoverability, and required cleanup/readback.
- **R-AC-04:** IF a recovery record would expose a credential, token, account,
  SSH key, private path, private coordinate, raw command, transcript, prompt,
  or unrestricted output, THEN THE SYSTEM SHALL omit/redact it before any
  canonical or export persistence.
- **R-AC-05:** WHEN recovery apply, rollback, cleanup, or readback occurs, THE
  SYSTEM SHALL append a lifecycle event and SHALL NOT rewrite the original
  proposal or authorization.
- **R-AC-06:** IF recovery completion cannot be read back, THEN THE SYSTEM SHALL
  retain an indeterminate/partial state and SHALL NOT claim success.
- **R-AC-07:** WHEN a private-only recovery detail is necessary operationally,
  THE SYSTEM SHALL store it only in sanctioned machine-local state and expose
  a public-safe typed omission/commitment if policy permits.
- **R-AC-08:** WHEN the motivating Phoenix bootstrap trajectory is encoded as a
  fixture, THE SYSTEM SHALL demonstrate rejected guard path, attended local
  repair, unchanged public-privacy boundary, successful readback, and no remote
  write without embedding machine-specific values.

## Epic integration and release

- **EPIC-AC-01:** WHEN any issue package is delivered, THE SYSTEM SHALL retain
  its issue mapping, exact dependencies, valid lifecycle manifest, candidate
  evidence, and independent closure status within the single Phoenix Epic.
- **EPIC-AC-02:** IF a package consumes an unpublished Nova, Cyborg, or
  Nightwing commit, THEN Phoenix verification SHALL fail.
- **EPIC-AC-03:** WHEN implementation deviates from this rigor-2 specification,
  THE SYSTEM SHALL update the Spec and renew the affected approval before merge.
- **EPIC-AC-04:** WHEN Phoenix claims complete, THE SYSTEM SHALL pass focused
  package checks, Full Verify, blocking Security, privacy review, independent
  high-risk Critic, exact branch push/readback, and explicit PO acceptance.
- **EPIC-AC-05:** IF any Phoenix issue criterion remains unimplemented,
  unverified, deferred without owner/expiry, or dependent on unavailable
  external/private evidence, THEN the Epic SHALL NOT claim complete.
- **EPIC-AC-06:** WHEN the implementation is ready for the first dispatch, THE
  SYSTEM SHALL require the Product Owner's literal `approved` against the
  readable PRD and bound Spec; design work alone SHALL NOT authorize code.
