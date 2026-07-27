# Sprint Phoenix governance architecture

Status: draft design authority input

Date: 2026-07-26
Related: issues #5, #9, #17, #23, #24, #30, #31, #32

## 1. Architectural outcome

Phoenix adds a repository-owned governance data plane with three deliberately
separate canonical streams:

1. a **Human Governance Decision Ledger** for authority-changing human
   decisions;
2. an **Agent Decision and Assumption Journal** for material, explicitly
   declared, non-authoritative choices and assumptions; and
3. a **Lifecycle Event Stream** for deterministic and runner-observed
   coordination events.

The streams share a small envelope and correlation vocabulary. They do not
share payload schemas, retention defaults, or authority semantics.

Everything else in Phoenix is a consumer:

- organization policy packs constrain capture, retention, disclosure, external
  writes, and boundary gates;
- the Evidence Viewer renders a local human-readable projection;
- signed audit bundles package a bounded offline projection;
- traceability/document adapters project or reconcile explicitly owned fields;
- ITSM contributes a separate authenticated gate observation;
- the governance exporter produces sanitized one-way telemetry.

No projection can approve, waive, release, deploy, revoke, or repair Pipeline
authority.

```mermaid
flowchart LR
    CORE[Public Core safety floor] --> POLICY[Effective policy resolver]
    PROJECT[Neutral project authority] --> POLICY
    ORG[Activated organization policy packs] --> POLICY
    LOCAL[Machine-local bindings and secrets] --> POLICY

    POLICY --> HW[Human ledger writer]
    POLICY --> AW[Agent journal writer]
    POLICY --> LW[Lifecycle event writer]

    HW --> H[(Human decision stream<br/>authority-bearing)]
    AW --> A[(Agent journal stream<br/>non-authoritative)]
    LW --> L[(Lifecycle stream<br/>non-authoritative)]

    H --> AUTH[Authority resolver]
    H --> QUERY[Validated query/projection service]
    A --> QUERY
    L --> QUERY

    QUERY --> VIEW[Offline Evidence Viewer]
    QUERY --> BUNDLE[Signed audit bundle]
    QUERY --> LINK[Traceability/document adapters]
    QUERY --> EXPORT[Governance event exporter]

    ITSM[External ITSM authority observation] --> COMPOSE[Composed release gate]
    AUTH --> COMPOSE
    COMPOSE --> RELEASE[Existing release/deploy control plane]

    LINK -. cannot grant authority .-> AUTH
    EXPORT -. cannot grant authority .-> AUTH
    VIEW -. cannot grant authority .-> AUTH
    BUNDLE -. cannot grant authority .-> AUTH
```

Mermaid check: passed.

## 2. Binding invariants

### G-1 — One authority source per decision class

Only a valid human-ledger event can create a Pipeline human authority
transition. Mutable lifecycle state, an agent event, a viewer page, an audit
bundle, a delivery receipt, or an external status is insufficient.

External ITSM authority remains external. A composed gate proves both the
Pipeline decision and the separately authenticated external observation against
one immutable tuple; it does not copy one authority into the other.

### G-2 — Origin cannot be projected away

Every event has exactly one origin class:

- `human-decision`;
- `agent-declaration`;
- `deterministic-control`;
- `runner-observation`.

Destination mappings preserve origin and authority class. A lossy destination
must declare the loss and may be refused by policy.

### G-3 — Repository and candidate binding are explicit

Each portable event binds the repository authority root and, when material, the
feature, package, candidate commit/tree, artifact digest, environment, action,
rule, and validity window. Unknown or not-applicable values are typed; they are
never filled from ambient Git state after the event.

### G-4 — Portable append-only means new records

For immutable `repository-public-safe` records, correction, contradiction,
expiry, revocation, supersession, compensation, and recovery append new
records. They never edit an earlier portable event. A
`restricted-machine-local` record is outside that portable history and follows
its authorized expiry, erase, and key-destruction policy; a sanitized
non-correlating operation receipt may describe only the proved store boundary,
and dependent authority fails closed after content or key destruction.

### G-5 — Privacy precedes durability

Allowlisting, classification, size limits, and deterministic redaction happen
before portable persistence, outbox persistence, dead-letter storage,
diagnostics, metrics, preview, or export.

The Git repository is one coarse access and retention trust zone, not a
per-stream confidentiality boundary. Portable persistence is allowed only
when the complete record is classified `repository-public-safe`, contains no
natural-person identifier, joinable pseudonym, or free-form rationale, and has
no erasure/access/retention requirement stricter than the repository itself.
Uncertain classification fails closed. Data that needs narrower access or
finite erasure uses the separately protected machine-local profile and never
enters Git history.

### G-6 — Operational state is not authority

Stream heads, query indexes, exporter cursors, adapter checkpoints, caches,
delivery queues, and search indexes are replaceable projections. Validators
reconstruct authority from immutable canonical records.

### G-7 — Unknown and unavailable are not success

Every boundary uses closed states. `unknown`, `unavailable`,
`omitted-by-policy`, `redacted`, `invalid`, and `not-applicable` remain distinct.
No adapter, replay, or UI maps one of them to a successful decision.

### G-8 — No hidden sibling dependency

Phoenix consumes #10 and #22 from the accepted base. It does not consume
unpublished Nova, Cyborg, or Nightwing commits. A later shared contract enters
only through a separately approved public integration.

## 3. Shared governance event envelope

The common envelope is intentionally smaller than any issue's proposed union of
fields. Payload schemas own domain-specific data.

### 3.1 Required core

`pipeline.governance-event-envelope.v1` contains:

- schema/version and payload schema;
- globally unique event ID and stable idempotency key;
- origin and authority class;
- event type;
- occurrence and observation time plus time-assurance class;
- repository fingerprint and public-safe source URI;
- stream ID, monotonically assigned sequence, previous event digest, and event
  digest;
- feature, package, request, session, dispatch, and trace correlation where
  available;
- candidate commit/tree and governed artifact references where material;
- policy, configuration, capture-policy, and redaction-policy digests;
- data classification, storage profile, retention compatibility, and
  disclosure class;
- payload digest and payload object.

Actor, agent, transport, approval, assumption, external-object, and delivery
fields belong to closed payload schemas, not the envelope.

### 3.2 Serialization and hashes

Portable records use UTF-8 JSON with:

- a closed JSON subset;
- duplicate-key rejection;
- Unicode scalar validation;
- integer-only numeric fields where possible;
- deterministic canonical serialization compatible with
  [RFC 8785 JSON Canonicalization Scheme](https://www.rfc-editor.org/rfc/rfc8785.html);
- SHA-256 for v1 record and chain digests.

The v1 digest preimage is exact and non-recursive:

```text
payloadDigest = SHA-256(JCS(payload))
eventDigest = SHA-256(
  UTF8("pipeline.governance-event.v1\0")
  || JCS(envelope with exactly eventDigest omitted)
)
```

The closed schema requires `eventDigest` in a persisted record, but the
verifier reconstructs the digest preimage by omitting only that named field.
It never hashes a placeholder, a mutable head, filesystem metadata, or an
implementation-dependent JSON representation.

The schema stores the algorithm and canonicalization profile so a future
version can migrate without reinterpreting v1 bytes. Signing does not reuse the
hash chain as proof of actor identity or trusted time.

### 3.3 Correlation

Repository, feature, package, request, dispatch, candidate, and evidence
identifiers are first-class. W3C trace identifiers may be carried only when
their provenance and privacy class are known. Phoenix aligns their representation
with the [W3C Trace Context Recommendation](https://www.w3.org/TR/trace-context/)
but does not require HTTP propagation or accept `tracestate` as governance
authority.

## 4. Canonical storage and writer

### 4.1 Physical topology

Phoenix extends ADR-0045 with a dedicated `governance-event` artifact class.
The proposed portable root is one repository-wide public-safe trust zone:

```text
governance/events/
  registry.json
  human/<stream-id>/<sequence>-<event-id>.json
  agent/<stream-id>/<sequence>-<event-id>.json
  lifecycle/<stream-id>/<sequence>-<event-id>.json
```

Each event is a new immutable file. A generated `heads.json` or query index may
exist, but it is explicitly a replaceable projection and cannot authenticate
itself.

Every repository reader or clone can read every byte in this portable root.
Phoenix therefore does not claim that file layout, the query service, stream
metadata, or projection policy creates per-stream ACLs or shorter retention.
The repository's access population and durable-history policy apply to all
portable events. A stream policy may independently decide capture eligibility
and downstream projection/export, but it may not promise confidentiality or
deletion that Git cannot enforce.

The closed storage profiles are:

| Profile | Location and controls | Admitted content | Retention/deletion behavior |
| --- | --- | --- | --- |
| `repository-public-safe` | immutable files under the portable root; repository-wide access and retention | closed non-personal fields, non-identifying actor/authority class, stable reason codes, public-safe evidence references | append-only; an event is rejected before persistence if its policy requires erasure, correction in place, selective access, or earlier expiry |
| `restricted-machine-local` | outside the repository/Git common history; owner-only per-stream root, no symlink/reparse traversal, encryption at rest with a separately protected key, exact ACL/owner readback | the complete canonical decision/event when it contains natural-person attribution, a joinable pseudonym, free-form rationale, or other policy-classified restricted data | explicit record expiry/erase and key-destruction operations with preimage, authorization, readback, and sanitized receipt |

The restricted profile is not portable authority, is excluded from Git,
bundles, viewer assets, diagnostics, and ordinary export, and cannot make an
otherwise invalid portable decision valid. It stores the whole restricted
event, not an identity sidecar keyed by a portable event. There is no portable
counterpart, event-ID mapping, digest, or join handle from which a repository
reader can correlate that event. A privileged local query may read the
restricted event only for an authorized operator; sanitized operational
receipts never expose its subject, content, or correlation.

A restricted human decision can satisfy only a local action evaluated against
that same physically authenticated restricted store and policy. It cannot be
transferred to another clone, repository, bundle, or external gate. If that
store is unavailable, expired, erased, or no longer decryptable, the dependent
local authority fails closed; no portable projection recreates it.

A hash chain proves internal prefix integrity, not completeness. Every
authority, bundle, viewer, migration, and release evaluation therefore requires
an expected stream checkpoint `{repositoryFingerprint, streamId, sequence,
eventDigest, candidateCommit, candidateTree}` from an exact candidate-bound
evidence artifact, retained human decision, or separately validated signed
bundle. A head may locate that checkpoint but cannot supply it. With no
independently retained checkpoint, an offline verifier returns
`prefix-valid`/completeness `unknown`; it never returns a gate-capable pass.

This shape is chosen over a single mutable NDJSON ledger because:

- an earlier event is not rewritten by an append;
- Git merge conflicts and same-sequence forks are detectable rather than
  silently line-merged;
- individual events can carry capture/projection metadata while admission
  rejects any requirement incompatible with repository-wide access/retention;
- canonical records can be referenced by path and digest without byte-range
  ambiguity.

Offline NDJSON remains an export format, not the canonical repository format.

### 4.2 Writer transaction

One sanctioned writer performs:

1. resolve physical repository authority and stream registry;
2. validate the request and effective policy;
3. classify and redact the payload in memory;
4. lock the exact stream head;
5. re-read repository, policy, previous event, and candidate preconditions;
6. allocate sequence and event ID;
7. compute the payload and event digests from the exact §3.2 preimages;
8. write a mode-safe same-directory temporary file;
9. fsync the file, atomically publish it, and fsync the directory where
   supported;
10. read back and revalidate exact bytes and chain;
11. update the replaceable head/index source-last;
12. return a sanitized receipt containing the exact checkpoint witness for
    independent candidate-bound retention.

A concurrent writer either observes the new head and retries with the same
idempotency key or fails typed. It never creates a second valid event for the
same idempotency key.

### 4.3 Crash and fork matrix

| Observed state | Meaning | Sole recovery |
| --- | --- | --- |
| no final event, temporary present | pre-publication interruption | writer-owned cleanup after physical identity and age checks |
| final event valid, head stale | event committed; projection interrupted | rebuild/advance head after full chain validation |
| head names missing/invalid event | projection corruption | fail closed; reconstruct only to an independently retained checkpoint and record the recovery receipt |
| two events claim one previous digest/sequence | concurrent or Git-merge fork | fail closed; human disposition plus compensating/superseding record |
| event exists with wrong repository fingerprint | cross-repository write | quarantine as invalid evidence; never consume |
| chain truncated/reordered/modified | tampering or incomplete checkout | fail verification against the required checkpoint and all dependent authority claims |
| idempotency replay matches exact event | safe retry | return existing receipt with zero write |
| idempotency replay conflicts | ambiguous duplicate | fail closed |

The writer never deletes a published canonical event as recovery.

### 4.4 Verification and recovery command

The normative public service surface is
`governance-event preview|append|verify|query|recover`. The shorter inventory in
the bound Spec is not permission to omit `recover`; `K-AC-05..07` and this
section are the stricter acceptance contract.

`recover` accepts one closed
`pipeline.governance-event-recovery-request.v1` with:

- physical repository fingerprint and stream ID;
- expected candidate commit/tree and retained checkpoint;
- observed registry, head, chain, fork, temporary-file, and journal digests;
- exact recovery kind: `resume-publication`, `rebuild-projection`, or
  `append-disposition`;
- idempotency key, expected preimage digest, and requested postimage digest;
- a valid human-ledger decision reference for any action that changes
  canonical interpretation or authority.

The command writes through the same stream lock and writer journal, validates
the checkpoint before mutation, publishes source-last, reseals exact
postimages, and returns a candidate-bound recovery receipt after readback.
Projection rebuild needs no new human decision only when it reproduces the
single valid chain exactly to the retained checkpoint. A fork or canonical
interpretation change requires an appended compensating/superseding decision;
the command can never delete or rewrite a published event.

### 4.5 Read, retention, and restricted-data operations

The query service is the sole sanctioned semantic source for replay, viewers,
bundles, adapters, ITSM, and export. It validates records and disclosure
policy; it is not an operating-system or Git confidentiality boundary. Direct
repository reads remain possible and safe only because the portable admission
contract excludes restricted or erasable data before the first durable byte.

The existing Spec-listed `governance-event` CLI owns the closed machine-local
subsurface:
`restricted plan-put|put|query|plan-erase|erase|plan-destroy-key|destroy-key|status`.
Every mutation binds physical store identity, data class, purpose, retention
deadline, expected preimage, authorization class, and idempotency key. `erase`
proves the exact record is gone from the active encrypted store; `destroy-key`
proves the named per-stream/key-generation material is unavailable after
readback. Receipts contain only operation class, counts, pre/post digests,
outcome, and explicit limitations. They never claim deletion from copies or
backups outside the proved store boundary.

No expiry, correction, appended disposition, portable redaction, Git removal,
or key destruction is described as satisfying a legal erasure obligation
beyond the exact observed store. Backup/clone retention remains an adopting
organization responsibility and cannot be inferred as successful.

## 5. Human Governance Decision Ledger

### 5.1 Authority model

The human stream is the historical source for:

- plan and feature approval/revocation;
- push, merge, release, promotion, and deployment consent;
- guard or policy exception, suspension, restoration, and consumption;
- risk acceptance/rejection/review/expiry;
- destructive or high-impact action consent;
- emergency and ITSM-related Pipeline decisions;
- correction, supersession, and migration observations.

A request and a decision are separate events. The authority resolver consumes
only valid authority-bearing outcomes and verifies their scope, assurance,
expiry, consumption, revocation, and policy binding.

### 5.2 Honest attribution

The payload carries:

- non-identifying actor/authority class;
- attribution source;
- identity-assurance class;
- timestamp and time-assurance class;
- authorization source;
- outcome and stable reason code;
- exact scope tuple and evidence references;
- single-use, expiry, consumes, revokes, supersedes, and compensates links.

A natural-person label, joinable pseudonym, and free-form rationale are not
portable v1 payload fields. When an adopting organization needs them, the
restricted machine-local profile stores and erases the complete decision event
under its own purpose, ACL, encryption, and retention policy. It creates no
portable counterpart or join. A privileged local query may display that
separately authorized restricted event; portable authority resolution depends
only on independently valid non-identifying portable decisions.
Signature and trusted-time references are optional, separately verified
assurance and never legal-identity proof.

### 5.3 Migration

Existing approval state, override ledgers, deploy approvals, release records,
and receipts are inventoried. A legacy record becomes:

- a verified imported decision only when its original scope and authority can
  be proven; or
- an explicitly unverified migration observation.

No historical actor, time, rationale, or approval is reconstructed from chat or
mutable state.

The direct-reader inventory is mandatory rather than illustrative:

| Authority surface | Direct consumer to migrate | Dual-read obligation |
| --- | --- | --- |
| plan approval | `plugins/pipeline-core/hooks/guard-devplan.mjs` | compare mutable projection with the exact live ledger decision and deny disagreement |
| push, deploy, and promotion approval | `plugins/pipeline-core/hooks/guard-push.mjs` | validate decision scope, consumption, candidate/artifact/environment, and expiry |
| plan/push/deploy writers and recovery | `harness/scripts/pipeline-state.mjs` | append/read back the decision before projecting mutable state |
| Git guard override | `plugins/pipeline-core/hooks/guard-git.mjs` and its override ledger | bind decision, target repository, single use, restoration, and consumption |
| release planning | `plugins/pipeline-core/scripts/release-version-plan.mjs` and release gate callers | validate the candidate/release decision before transition |

The Phoenix integration-package owner owns this compatibility migration. The
window expires at the earlier of Phoenix integration close or 2026-10-31.
Before expiry, every migrated reader dual-evaluates and fails closed on
disagreement; all new authority writes are ledger-first. At expiry, any
unmigrated direct reader or unresolved disagreement blocks Phoenix completion,
release, and compatibility removal. Extending the date requires a new human
decision with owner, reason, bounded replacement date, and fresh review.

## 6. Agent Decision and Assumption Journal

### 6.1 Materiality

An agent event is required when a declared assumption or selection can affect:

- an authority request or policy interpretation;
- security/privacy posture;
- repository, artifact, or candidate identity;
- external side effects;
- runner/model/profile/role routing;
- work decomposition or package boundaries;
- verification or review scope;
- recovery/fallback or an external command/script offer;
- release readiness or resulting implementation.

Formatting choices, token-level reasoning, routine reads, and repeated
unchanged status observations are not journal events.

### 6.2 Prohibited content

The schema rejects:

- hidden reasoning, scratchpads, or chain-of-thought;
- raw prompts or complete conversations;
- unrestricted terminal/tool logs or environment dumps;
- credentials, tokens, account details, and private paths;
- source/document bodies already available as governed artifacts;
- speculation about a person's identity or intent.

The preferred representation is stable reason codes, selected option IDs,
bounded alternatives, evidence references, uncertainty state, revalidation
trigger, and expected/observed effect.

### 6.3 Assumption lifecycle

`assumed`, `inferred`, `observed`, `verified`, `contradicted`, `unavailable`,
and `unknown` are distinct. Verification, contradiction, expiry,
invalidation, or supersession creates a linked event. A material change
identifies affected packages/candidates and invokes the existing invalidation
control rather than rewriting history.

## 7. Lifecycle event stream and replay

The lifecycle stream normalizes only governance-significant events:

- dispatch admission/rejection/status/cancellation;
- candidate and authority change/invalidation;
- verification and independent review outcomes;
- gate request/decision references;
- external command/script offer, Pipeline initiation, attempt, observed
  outcome, user assertion, and independently verified readback;
- recovery proposal/rejection/apply/readback/rollback/cleanup;
- external projection and reconciliation outcomes.

It consumes `pipeline.control-execution-exchange.v1` for the minimum
control/execution identity. Runner-specific data appears only in registered
namespaced extensions.

The local replay:

- validates every source event before rendering;
- orders within each stream and uses correlation edges across streams;
- never invents a total order where clocks/streams cannot prove one;
- highlights gaps, forks, invalidated candidates, and unavailable observations;
- links to human decisions and agent declarations while preserving their
  classes;
- is a view, never a state writer.

## 8. Effective policy plane

### 8.1 Sources

Effective policy is assembled from:

1. Public Core safety floors and schema capabilities;
2. the neutral project authority layer;
3. explicitly activated, versioned organization packs;
4. machine-local endpoint/credential bindings.

Generated `.claude/**` and `.codex/**` files remain projections. Private
bindings do not become portable policy.

### 8.2 Merge strategies

There is no generic last-writer-wins precedence. Each policy field declares one
strategy:

- `immutable-floor` — lower layers cannot weaken it;
- `set-intersection` — effective permissions are the intersection;
- `most-restrictive` — retention/export/failure mode tightens;
- `single-owner` — exactly one layer owns the value;
- `authority-gated-exception` — only a core-declared exception class plus a
  matching human-ledger decision may change the effective value.

Unknown fields, incompatible schema versions, conflicting single-owner values,
invalid signatures, missing dependencies, or unsupported rules fail
activation. A deterministic preview shows source, effective value, conflict,
and change impact before apply.

### 8.3 Portable versus local

Policy packs may contain portable rules, mappings, required document classes,
retention classes, adapter capability requirements, and public-safe binding
IDs. Endpoints, tenant/project coordinates, credentials, private actor
resolution, client certificates, and signing keys remain machine/operator
managed.

## 9. Evidence Viewer and audit bundles

### 9.1 Evidence Viewer

One offline command builds static HTML from validated #22 artifacts and
governance streams. It renders:

- package/candidate identity;
- plan/spec/result and lifecycle state;
- human decision timeline;
- agent assumptions and verification state;
- checks, Critic outcomes, exceptions, and blockers;
- export/publication/reconciliation status;
- provenance links and integrity failures.

Rendered status labels distinguish fact, estimate, assumption, human decision,
unknown, unavailable, redacted, invalid, and not-applicable. The report has a
content security policy, no active network dependency, accessible structure,
and responsive layout.

### 9.2 Signed audit bundles

A bundle contains a closed manifest of exact source paths/digests, schema and
policy versions, candidate/release binding, integrity-chain heads, selected
sanitized records, and verification results.

Signing is optional and uses an external/operator-managed key interface.
Phoenix defines a detached-signature profile and may use the pinned
[DSSE v1.0.2 envelope](https://github.com/secure-systems-lab/dsse/blob/v1.0.2/envelope.md)
with the pinned
[in-toto Attestation Framework v1.2.0 Statement v1](https://github.com/in-toto/attestation/blob/v1.2.0/spec/v1/statement.md)
as interchange profiles. DSSE/in-toto do not provide key custody, trusted
time, legal identity, retention, or regulatory compliance by themselves.

The unsigned manifest remains offline-verifiable for content integrity. A
signature adds only the assurance proven by its key and verification policy.

## 10. External traceability and governed publication

### 10.1 Adapter contract

Every adapter declares:

- profile and conformance version;
- supported object types, relations, fields, and operations;
- ownership modes (`pipeline-owned`, `external-owned`, `projection-only`,
  `independent`, `unsupported`);
- target revision/readback capability;
- idempotency, retry, ordering, rate-limit, and conflict behavior;
- payload/response limits and authentication profile reference;
- privacy, residency, and retention metadata where known.

The operation sequence is `inspect -> preview -> authorize -> apply ->
readback`. Unknown capability, target drift, revision conflict, partial write,
or readback mismatch cannot be reported as success.

### 10.2 Authority boundary

Default mode is reference-only or outbound projection. Bidirectional fields
require explicit ownership and deterministic conflict handling. Human approval,
Critic verdict, release authority, security disposition, and candidate evidence
cannot be imported from ordinary external text/status fields.

External content and webhooks are untrusted data and never executable
instructions.

## 11. ITSM change control

The change-control contract consumes the generic adapter for mechanics but owns
its own typed lifecycle:

`not-required -> draft -> submitted -> assessment -> awaiting-approval ->
approved -> scheduled -> implementing -> validation -> completed`

and terminal/exception states:

`rejected | cancelled | expired | failed | unknown | conflict |
reconciliation-required`.

Standard, normal, emergency, and not-required classes are distinct policies.
Classification cannot be selected solely to avoid approval.

Promotion requires two separately validated inputs:

1. the existing Pipeline release authority and candidate-bound evidence;
2. the authenticated external change observation, revision, artifact,
   environment, scope, schedule, and validity.

```mermaid
sequenceDiagram
    participant P as Pipeline control plane
    participant A as Traceability adapter
    participant I as External ITSM
    participant D as Existing deploy adapter

    P->>A: inspect + preview exact change projection
    A->>I: create/update with idempotency and revision
    I-->>A: revision/readback
    A-->>P: sanitized external-state observation
    P->>P: validate Pipeline decision + external gate tuple
    alt both gates valid
        P->>D: deploy immutable artifact
        D-->>P: deploy/health/rollback evidence
        P->>A: publish validation and closure projection
        A->>I: update exact revision
        I-->>A: closure readback
    else any gate stale or unknown
        P-->>P: block promotion with typed recovery
    end
```

Mermaid check: passed.

A successful deploy followed by an external update failure becomes
`reconciliation-required`; it does not erase the deploy and cannot claim fully
closed change control.

## 12. Governance event export

### 12.1 Projection boundary

The exporter reads only validated canonical events through the query service.
It applies a destination-specific, default-deny export policy before an entry
enters any queue.

The neutral envelope aligns with:

- [CloudEvents 1.0.2](https://github.com/cloudevents/spec/blob/v1.0.2/cloudevents/spec.md)
  for interoperable event identity/source/type/subject/time/data schema;
- the stable, pinned
  [OpenTelemetry 1.59.0 Logs Data Model](https://github.com/open-telemetry/opentelemetry-specification/blob/v1.59.0/specification/logs/data-model.md)
  and a pinned OTLP mapping for structured collector delivery;
- [RFC 5424](https://www.rfc-editor.org/rfc/rfc5424.html) for an explicitly
  lossy legacy syslog profile;
- canonical NDJSON for offline transfer and fixtures.

As of 2026-07-26 the referenced CloudEvents and OpenTelemetry versions are the
verified immutable source profiles. Phoenix pins their tested OTLP/protobuf and
adapter mappings in manifests; it never follows a moving specification branch
implicitly.

### 12.2 Machine-local durable outbox

Per-destination queue/cursor state lives under the physical Git common
directory or another sanctioned machine-local root. It is not committed and
not authority.

Only already-sanitized projections enter the outbox. Each destination has an
independent queue, cursor, policy digest, retry budget, health state, and
dead-letter area.

Delivery is at-least-once with stable source/event idempotency. Ordering is
claimed only within one canonical stream when the adapter supports it. Partial
acknowledgement advances only accepted events.

### 12.3 Failure modes

Destinations support:

- `disabled`;
- `advisory` (default);
- `required-at-boundary`;
- `required-continuous` only under explicit organization policy.

A required boundary names the exact event range and lifecycle boundary. A
generic destination outage does not freeze unrelated local work. Delivery
acknowledgements prove only the adapter's declared acknowledgement semantics,
not retention, immutability, analyst review, or compliance.

## 13. Runner-neutral ruleset source

Phoenix introduces `pipeline.ruleset-source.v1`, a normalized observation used
by bootstrap and freshness checks.

### 13.1 Runner adapters

- **Codex:** native `codex plugin list --json` readback supplies selected plugin
  name, version, loaded/installed identity, and sanitized marketplace source.
- **Claude:** its native installed-plugin and marketplace registries supply the
  equivalent observation.
- **Self-application:** the loaded plugin root is matched to the current Public
  checkout and exact Git/content identity.
- **Local development:** a registry-validated local source is explicit and not
  misclassified as stale remote content.

The common resolver never requires `.claude/settings.json`, `.codex` project
files, or consumer `HEAD` merely to identify the loaded plugin.

### 13.2 Freshness

The common freshness service receives the normalized loaded source and uses the
selected host network-open/read-only boundary to observe the public remote.
It distinguishes:

- loaded identity unavailable;
- installed identity unavailable;
- marketplace source unavailable;
- remote/network unavailable;
- equal, ahead, behind, diverged;
- loaded/installed mismatch;
- self-application and local-development.

A pre-HEAD consumer is valid. Diagnostics expose no token, private registry
path, home directory, private remote, or account coordinate. A private
marketplace source is classified but not exported.

## 14. External command offer, workaround, and recovery audit profile

PX-B defines a correlation profile, not a fourth authority store. Its event
boundary is the moment the Pipeline knowingly offers a command or script for
execution, whether it selected the handoff itself or supplied it in response to
a user request. The event is appended before presentation or initiation; a
displayed/copyable handoff without a required offer event is refused for a
material action.

`command-offer` is an agent-journal declaration, never an authority or an
execution receipt. It carries only origin (`pipeline-initiated` or
`user-requested/pipeline-supplied`), stable operation/tool/script class and
version, public-safe target/candidate binding, side-effect/authority class,
policy and redaction digests, selected alternative/reason codes, decision
reference or `not-required`, execution-assurance requirement, and typed
omissions. A public script may be named through an independently governed
artifact identity; arbitrary raw command/script bytes and a digest derived from
them are prohibited because they can disclose or become a join handle for
private content.

| Required fact | Canonical record |
| --- | --- |
| Pipeline-known command/script offer before presentation | agent journal `command-offer` |
| offer origin, operation class, public-safe artifact/target/candidate and policy binding | agent journal |
| trigger and evidence gap | agent journal |
| original sanctioned path and typed rejection | agent journal + lifecycle event |
| proposed alternatives and selection | agent journal |
| human exception/authorization, only when policy/authority requires it | human ledger |
| Pipeline initiation/attempt, observed result, or independently verified readback | lifecycle event |
| user assertion or copy acknowledgement | agent journal; never execution evidence |
| mutation operation class and public-safe target binding | lifecycle event |
| preimage/postimage digests and candidate binding | governed evidence reference |
| private-data boundary and omitted fields | redaction-policy digest + typed omissions |
| rollback/recovery authority | human decision or existing policy reference |
| applied/read-back/rolled-back/cleaned-up result | lifecycle event |

The state progression is deliberately non-collapsing:

`offered → authorized? → attempted? → observed-completed? → readback-verified?`

An offer, preview, approval, generated script, copy action, or user assertion
does not advance to `attempted`, `observed-completed`, or
`readback-verified`. A user-executed command remains
`execution-unobserved` unless an allowed independent evidence interface proves
otherwise. Failure, partial, cancelled, unknown, unavailable, and
readback-mismatch are terminal typed facts, not aliases for success. Missing or
contradictory correlation invalidates dependent replay rather than filling a
gap.

For the bootstrap recovery that motivated this requirement, the portable audit
record may say that a protected lifecycle repair was rejected, a human
performed a bounded local restoration, exact public-safe files were restored,
the repository was re-read as ready, and no remote write occurred. It must not
retain a home-directory prefix, raw shell history, SSH key path, token,
private configuration content, or unrestricted console output.

## 15. Security and privacy posture

Threats include:

- forged or replayed human decisions;
- agent events interpreted as approval;
- stream truncation/fork/reordering;
- repository/path substitution and unsafe symlinks;
- compromised adapters or destinations;
- forged acknowledgements and schema downgrade;
- external-content prompt/command injection;
- secrets in errors, previews, metrics, queues, or dead letters;
- malicious high-cardinality fields and resource exhaustion;
- cross-repository/private-coordinate leakage;
- direct repository/clone reads bypassing a projection policy;
- personal or erasable content entering immutable Git history;
- machine-local restricted records surviving expiry or key rotation;
- mutable projections authenticating themselves.

Controls include closed schemas, repository/candidate binding, canonical bytes,
hash chains, idempotency, size/count limits, allowlisted fields, redaction
before persistence, physical-path checks, endpoint scheme/allowlists, TLS
requirements, repository-wide portable admission, restricted-store
owner/ACL/encryption checks, explicit erase/key-destruction readback, least
privilege, source-last projections, exact readback, and separate authority
resolution.

Regulatory references guide controls without becoming product claims:

- [NIST SP 800-53 Rev. 5](https://csrc.nist.gov/pubs/sp/800/53/r5/final)
  Audit and Accountability controls;
- [GDPR Article 5](https://eur-lex.europa.eu/eli/reg/2016/679/2016-05-04/eng)
  purpose limitation, data minimization, storage limitation, and integrity;
- [Regulation (EU) 2024/1689](https://eur-lex.europa.eu/eli/reg/2024/1689/oj?locale=en)
  traceability, technical documentation, and logging concepts when an adopting
  system is actually in scope.

Phoenix documentation must state that technical support does not establish
legal applicability or compliance.

The design-stage data inventory, purposes, minimization rules, retention/access
boundaries, external-flow checks, and sign-off criteria are maintained in
[privacy-review.md](privacy-review.md). It is a blocking independent review,
not a self-attestation by this architecture.

## 16. Dependency graph and delivery waves

```mermaid
flowchart TD
    BASE[#10 exchange + #22 topology/preview + ADR-0046] --> PX0A[PHX-0 slice A: lifecycle writer closure]
    PX0A --> PX0B[PHX-0 slice B: ruleset-source trust root]
    PX0B --> K[PHX-1 governance event kernel]
    K --> H[#30 human decision ledger]
    K --> L[#17 lifecycle stream and replay]
    K --> P[#9 policy packs and bundle foundation]
    K --> V[#5 Evidence Viewer foundation]
    H --> A[#31 agent decision journal]
    L --> A
    P --> X[#23 traceability/document adapters]
    P --> B[#9 signed audit bundle completion]
    H --> V
    L --> V
    A --> V
    P --> V
    P --> C[#24 ITSM change control]
    X --> C
    H --> E[#32 governance event export]
    L --> E
    A --> E
    P --> E
    PX0B --> G[Phoenix integration gates]
    B --> G
    V --> G
    C --> G
    E --> G
```

Mermaid check: passed.

Delivery waves:

1. **PHX-0, then kernel:** create the reviewed Phoenix lifecycle manifest now.
   PHX-0 remains implementation package 1 exactly as bound Spec §4.6 requires.
   Its blocking slice A first delivers the transactional feature-package
   manifest writer and narrow continuity-authority revision writer through the
   already inventoried Pipeline state writer; only after slice A passes focused
   Verify and Critic may PHX-0 slice B deliver the runner-neutral ruleset trust
   root. PHX-1 then
   delivers the shared envelope, event store, checkpoint verifier, recovery command,
   repository-public-safe admission, the restricted machine-local storage
   profile within the same Spec-listed kernel, policy hooks, and topology
   extension.
2. **Canonical streams:** #30, #17, and #9 foundation; #5 begins with base
   artifacts.
3. **Dependent records/adapters:** #31 and #23.
4. **Enterprise consumers:** #24, #32, signed bundle completion, and full #5.
5. **Migration and integration:** existing authority paths, backlog regression
   inputs, privacy/security matrix, end-to-end Verify, Critic, and operator
   documentation.

Repository WIP remains one implementation package at a time. Parallelism is
limited to independent read-only review or testing; no two writers own the same
files or event stream.

The initial checked-in Phoenix `lifecycle.json` is a reviewed design artifact,
not evidence that the missing production writer exists. Before any later
package or consumer creates or transitions a manifest, Phoenix implements a
single transactional writer with closed preview, expected-manifest digest,
required authority class, same-directory durable replacement, exact readback,
candidate/evidence binding, and idempotent replay. Until that writer passes
Verify and Critic, no bundle, viewer, adapter, or Close path may infer
lifecycle authority from a hand-written or legacy package.

The phrase `#22 lifecycle writer` in bound Spec §7.10 names a missing
capability over the accepted #22 topology validator and transition planner; it
does not prove that #22 already shipped a mutating implementation or authorize
new files. Phoenix closes that capability only through files already listed in
bound Spec §§7.1 and 7.4. The existing #22
`feature-package-topology.mjs` remains an unmodified dependency: it validates
the closed manifest and returns a non-mutating transition plan.

The sanctioned `pipeline-state.mjs` module already owns repository lifecycle
state mutations, exact preimages, authority checks, continuity/publication
transactions, and readback. Feature-package manifest transitions and the
narrow active-design authority revision are the same lifecycle-state
responsibility, not event-stream storage, so this placement preserves the
single-writer boundary without expanding the governance event kernel. PHX-0
slice A owns this exact closed inventory:

| File | Contract |
| --- | --- |
| `harness/scripts/pipeline-state.mjs` | add `feature-package-inspect`, `feature-package-plan`, `feature-package-apply`, `feature-package-status`, `feature-package-recover`, plus closed `continuity-authority-revision-plan`, `continuity-authority-revision-apply`, and `continuity-authority-revision-recover`; consume the accepted #22 validator/planner; validate repo-relative package and authority artifacts, closed requests, exact preimages, legal transition, decision, candidate/evidence bindings, idempotency and recovery journal; publish by exclusive same-directory transaction and exact readback |
| `harness/scripts/pipeline-state.test.mjs` | cover absent/existing manifests, draft bootstrap, noop/conflicting replay, request/manifest and continuity-authority drift, illegal transitions, wrong or stale decision, missing candidate/evidence, symlink/case/path/cross-repository rejection, concurrent writers, every crash seam, bounded recovery, sanitized output, and proof that preview/chat/handover cannot become write authority |
| `governance/artifact-topology.json` | register the lifecycle request, transaction journal, sanitized receipt and candidate-evidence classes at their sole canonical roots without making temporary journals portable authority |
| `docs/artifact-topology.md` | document discovery, state/authority mapping, bootstrap limitation, transaction/recovery sequence, retention and the prohibition on legacy/path-guess authority |
| `harness/scripts/verify.mjs` | register the focused writer/recovery suite and the topology validator in the single repository Verify gate |

`feature-package-plan` is read-only and emits a closed
`pipeline.feature-package-transition-request.v1` plus its SHA-256. The request
binds package ID/path, exact manifest preimage (`absent` or digest), source and
target state, complete proposed bytes, #22 validation receipt, artifact-set
digest, candidate/evidence tuple where required, authority class and decision
reference, idempotency key, and expiry. `feature-package-apply` accepts only
that repo-relative request plus its exact digest and expected current preimage;
it never accepts free-form manifest bytes.

Apply obtains one package-local exclusive lock, writes a closed recovery
journal before the first replace, writes and syncs a same-directory temporary
file, rechecks the preimage and authority under the lock, atomically replaces
the manifest, syncs the directory where supported, validates the complete
postimage through #22, writes a sanitized receipt, and only then clears the
journal. A retry with the same idempotency key and identical postimage is a
verified noop; a reused key with different intent fails. An interrupted
transaction remains `recovery-required`, never success.
`feature-package-recover` consumes a separately previewed, digest-bound
recovery request and may only finish the exact intended postimage or restore
the exact retained preimage; it cannot select a new state, delete authority
artifacts, or infer success from a temporary file.

The matching `continuity-authority-revision-plan` is also read-only. It emits
a closed request binding active feature/design phase, exact continuity revision
and current authority, old and proposed PRD/Spec bytes, scoped human decision
reference, candidate/evidence tuple, idempotency key, and expiry. Generic
`continuity-cas` continues to reject PRD/Spec mutation. Its dedicated apply
locks the existing State writer, rechecks every binding, atomically publishes
and reads back only the proposed authority pair, and emits a public-safe
correlated receipt. Interrupted State remains recovery-required; recovery can
only restore the retained preimage or finish the exact retained postimage. No
current design document or human assertion is itself authority to rewrite
State.

The bootstrap manifest remains `draft` through the Product Owner design gate:
it inventories the reviewed design but is not itself approval authority.
Literal plan approval remains in the existing repository-scoped PO gate. Once
the approved PHX-0 package has delivered and verified its mandatory slice A,
the writer consumes that exact approval and candidate evidence to perform the
first sanctioned lifecycle transition. Slice B remains part of the same PHX-0
package and WIP record; it cannot start before slice A passes. PHX-1 through
PHX-6 cannot start before all of PHX-0 passes. No separate pre-PHX-0 package,
parallel writer package, or hand-written state change may bridge the bootstrap
gap.

The kernel package implements the restricted-data profile exclusively through
the files already authorized by bound Spec §§7.3–7.4. Architecture narrows
their responsibilities here; it does not authorize another implementation
file:

| File | Contract |
| --- | --- |
| `governance/schemas/governance-event-envelope.schema.json` | add the closed storage-profile discriminator and common restricted-envelope limits without a portable join field |
| `governance/schemas/governance-capture-policy.schema.json` | add purpose, personal/contextual-identifiability, storage-profile, retention, disclosure, encryption-generation request, and sanitized receipt policy shapes |
| `governance/schemas/human-governance-decision.schema.json` | permit personal attribution/free-form rationale only for a complete `restricted-machine-local` decision and prohibit those fields for `repository-public-safe` |
| `plugins/pipeline-core/lib/governance-event-store.mjs` | implement both closed physical strategies: portable stream writer/query/verify/recovery and owner-only restricted storage with ACL/reparse, encryption, expiry, exact erase, and key-destruction readback |
| `plugins/pipeline-core/lib/governance-event-store.test.mjs` | reject Git/repository restricted roots, unsafe permissions, portable joins, replay/drift, expired records, incomplete erase, and unverifiable key destruction in addition to the portable crash/fork matrix |
| `plugins/pipeline-core/scripts/governance-event.mjs` | expose the public operations in §4.4 plus the closed `restricted …` operation namespace in §4.5 with sanitized output |
| `plugins/pipeline-core/scripts/governance-event.test.mjs` | prove confirmation, authorization, preimage, idempotency, crash recovery, backup-limit disclosure, and no-false-erasure claims |
| `docs/governance-events.md` and `docs/human-governance-ledger.md` | document profile selection, operator authorization, retention/erasure limits, recovery, and the absence of portable correlation |

## 17. Rejected architecture alternatives

| Alternative | Rejected because |
| --- | --- |
| One generic audit log for all events | It allows observations or agent records to be confused with human authority and forces one unsafe retention policy. |
| Store only mutable current state | It cannot reconstruct request, decision, consumption, revocation, expiry, or supersession. |
| Use Git history alone as the ledger | Commits do not provide the closed decision taxonomy, scope, assurance, or idempotency semantics. |
| Make an issue tracker, wiki, ITSM, or SIEM canonical | External status/text would become an authority bypass and offline operation would fail. |
| One provider-specific enterprise integration | It puts product names and proprietary semantics in core schemas and couples credentials/failures. |
| Bidirectional last-write-wins sync | It destroys field ownership and can overwrite authority-bearing content. |
| Export raw source records then redact at the collector | Secrets and private data would already exist in queues, logs, dead letters, and transports. |
| One mutable NDJSON file per stream | Concurrent Git writers and interrupted appends create ambiguous merge/recovery semantics. |
| Exactly-once delivery claim | The supported destinations cannot prove it uniformly; stable idempotency plus at-least-once is honest. |
| Use `.claude/settings.json` as common marketplace authority | A runner-specific project file is absent in valid Codex-only and pre-HEAD consumers. |
| Depend on Nova's unpublished executor/replay work | ADR-0043 requires independent Sprint closure; #10 is the accepted minimum exchange. |
