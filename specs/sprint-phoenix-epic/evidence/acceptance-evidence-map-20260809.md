# Sprint Phoenix — acceptance evidence map and issue reconciliation

Status: measurement

Date: 2026-08-09

Parent specification: [../spec.md](../spec.md) · Acceptance matrix: [../acceptance.md](../acceptance.md)

## What this document is

One durable record answering two questions the Product Owner asked together: what evidence
exists for each of the 157 Phoenix acceptance criteria, and what remains open when those
verdicts are reconciled against the 105 live acceptance bullets of the eight open
`sprint:phoenix` issues.

It supersedes `acceptance-evidence-map-20260805.md` as the current measurement. It is generated
by its own generator, `acceptance-evidence-map.mjs` in this directory, which carries the verdict
map, the evidence pointers and
the bullet-to-criterion map as auditable data rather than prose — regenerate it after any
re-measurement instead of hand-editing this file.

**Candidate.** Measured at `de69756` on `sprint_phoenix`. The gate evidence belongs to `3387065`
(`evidence/verify-latest.json`: `exitCode 0`, `status passed`, 368 registered suites, 368
terminal receipts, `binding: "exact"`, tree clean at start and finish); the two commits between
that candidate and the measured HEAD touch `docs/` and `backlog/` only, so no product surface
moved. Security: `pipeline.security-verdict.v2`, `blocking: false`, `cap.sast` pass,
`cap.secrets` pass.

**Evidence base.** Four read-only measurements, each dispatched to a fresh context and each
adjudicating from the tree rather than from the handover:

| tag | measurement | scope |
|---|---|---|
| C | `PHX-COVERAGE`, 2026-08-08 | all 157 criteria, first full pass |
| J | `PHX-ADJ2`, 2026-08-08 | the ten criteria the first pass could not adjudicate |
| A | `PHX-FIN-A`, 2026-08-09 | the 13 PX0/P criteria moved by later product commits |
| B | `PHX-FIN-B`, 2026-08-09 | the 10 A/H/EPIC criteria moved by later product commits |

The `A` and `B` runs re-measured, and did not inherit, every row they touched. Their run output
lives under `evidence/` and is git-ignored by QG-03, which is why the operative content is
reproduced here rather than referenced.

## The direct answer

**Phoenix cannot claim complete.** 87 of 157 criteria carry a named assertion in a
gate-registered suite; 70 do not. EPIC-AC-05 forbids a completion claim while any
criterion remains unimplemented or unverified, and it currently bites. No issue is closeable on
its own live acceptance bullets.

The shape of the remainder has not changed since the first pass and is worth stating plainly:
Phoenix built the libraries and left the integration. Most non-implemented rows are not absent
features but unpinned sub-clauses of features that exist — and a smaller, harder set is the
seams between packages that are each individually implemented and mutually unaware.

Closure rule applied verbatim from `specs/sprint-phoenix-epic/design/issue-coverage.md:201-204`:
an issue remains open if any mapped criterion is unimplemented, unverified, dependent on
unpublished sibling work, or deferred without explicit PO disposition, owner and expiry.
A bullet is therefore BLOCKED unless every criterion mapped to it is `implemented`.

## Criterion verdict totals

| verdict | count |
|---|---|
| implemented | 87 |
| partial | 53 |
| designed-only | 1 |
| not-started | 15 |
| constraint | 1 |
| **total** | **157** |

## Per criterion — verdict and evidence

`src`: **C** = the 2026-08-08 baseline measurement, **J** = its ten-row adjudication follow-up,
**A**/**B** = the 2026-08-09 delta re-measurement. For `implemented`, the pointer names the
gate-registered suite that pins the operative clause; for every other verdict it names the exact
clause that is not pinned or not built.

### PX0 — Lifecycle-authority revision and runner-neutral ruleset source (9/17 implemented)

| ID | verdict | src | evidence / named gap |
|---|---|---|---|
| PX0-AC-01 | partial | C | continuity-state.mjs binds dispatch/intent to prdSha256/specSha256; no assertion names a REJECTED generic CAS authority change |
| PX0-AC-02 | implemented | A | continuity-authority-revision-plan emits the closed request; pinned in pipeline-state.test.mjs (registered) |
| PX0-AC-03 | partial | A | apply exists and rechecks under the writer lock; the recheck breadth the criterion enumerates is not fully pinned |
| PX0-AC-04 | partial | C | proof half fails closed and is pinned; the State-side preimage/revision/idempotency recheck is only partly asserted |
| PX0-AC-05 | partial | A | continuity-authority-revision-receipt.v1 now has an emitter; durable retention of the receipt is not pinned |
| PX0-AC-06 | partial | A | recover replays frozen journal bytes only; the recovered-preimage outcome class is not pinned |
| PX0-AC-07 | partial | A | zero-write replay implemented; the conflicting-replay/second-writer half is not pinned |
| PX0-AC-08 | partial | C | ruleset-source.mjs closed contract pinned by ruleset-source-tests; whether bootstrap actually EMITS one observation is unpinned |
| PX0-AC-09 | implemented | A | bootstrap-source-attestation-acceptance-tests (verify.mjs:333) — Codex-only marketplace resolution |
| PX0-AC-10 | implemented | A | bootstrap-source-attestation-acceptance-tests — pre-HEAD consumer compares loaded plugin identity |
| PX0-AC-11 | implemented | A | bootstrap-source-attestation-acceptance-tests — one common closed contract across the four source classes |
| PX0-AC-12 | implemented | C | ruleset-source-tests: source/loaded/installed/mismatch/remote unavailable each typed distinctly |
| PX0-AC-13 | partial | J | ruleset-freshness-host.mjs selects the host transport correctly, but no suite exercises it and bootstrap does not wire it |
| PX0-AC-14 | implemented | C | ruleset-source-tests: private-coordinate-rejected, private-remote-rejected |
| PX0-AC-15 | implemented | C | ruleset-source-tests: private-classification-preserved, local-classification-preserved |
| PX0-AC-16 | implemented | A | bootstrap-source-attestation-acceptance-tests — equality bound to exact loaded and observed public remote identity |
| PX0-AC-17 | implemented | A | bootstrap-source-attestation-acceptance-tests — unknown keys, ambiguous selectors, more than one selected plugin all fail closed |

### K — Governance event kernel (8/10 implemented)

| ID | verdict | src | evidence / named gap |
|---|---|---|---|
| K-AC-01 | implemented | C | governance-event-core/store-tests: closed envelope, origin payload, physical target, policy, size limits |
| K-AC-02 | implemented | C | governance-event-store-tests: exact idempotency is a zero-write replay |
| K-AC-03 | implemented | C | same assertion, conflicting-key half |
| K-AC-04 | implemented | C | governance-event-store-tests: canonical bytes, readback checkpoint, source-last head, RFC 8785 canonicalization |
| K-AC-05 | partial | C | governance-event-store-tests: fork detection now proven to also block append and recovery, not only verify/query (PHX-WP-K, break-proofed). Still absent: no disposition operation exists anywhere in the module -- "governed disposition appended through the sanctioned recovery operation" has no code to test against |
| K-AC-06 | implemented | C | governance-event-store-tests: checkpoint-aware verification; symlink and cross-repository rejection |
| K-AC-07 | implemented | C | governance-event-store-tests: projection recovery requires a retained checkpoint |
| K-AC-08 | implemented | WP-K | governance-event-store-tests: governance-event-store.mjs:673 (GES-CHECKPOINT) rejects a head/index checkpoint asserting an absent or digest-mismatched canonical record, for both verify and query (PHX-WP-K, break-proofed) |
| K-AC-09 | implemented | C | governance-event-core-tests: six exact typed absence states preserved |
| K-AC-10 | not-started | WP-K | NO CARRIER, confirmed by repo-wide search (PHX-WP-K): queryPortableGovernanceStream, the governance-event CLI and governance-replay.mjs all accept exactly one streamId; no function anywhere queries more than one stream, so per-record provenance preservation across streams has no code to test |

### H — Human Governance Decision Ledger (#30) (10/15 implemented)

| ID | verdict | src | evidence / named gap |
|---|---|---|---|
| H-AC-01 | implemented | C | human-governance-ledger-tests: closed portable grant, single-use consumption under the canonical stream lock |
| H-AC-02 | implemented | C | governance-authority-resolver-tests + guard-push consumption receipt |
| H-AC-03 | implemented | C | human-governance-ledger-tests: one event-specific link and outcome per authority disposition |
| H-AC-04 | implemented | C | human-governance-ledger-tests: repository/candidate drift, expiry, consuming disposition all fail closed |
| H-AC-05 | implemented | C | human-governance-ledger-tests: detached proof verified without upgrading to human identity; no attribution field admitted |
| H-AC-06 | implemented | C | human-governance-ledger-tests: append-only consumption disposition; restricted-store erasure pinned separately |
| H-AC-07 | implemented | C | human-governance-ledger-tests: cross-repository decision rejected before mutation |
| H-AC-08 | not-started | J | NO CARRIER: no path imports a legacy approval/override/deploy record as an unverified observation |
| H-AC-09 | not-started | J | NO CARRIER: external-push-ledger is scoped to single-repo push proofs; nothing binds cross-repository guarded work to one physical target |
| H-AC-10 | implemented | C | five named assertions covering scope, reason, expiry, constraints, follow-up review, no standing bypass |
| H-AC-11 | partial | C | portable reconstruction surface pinned; the no-join-handle clause is proved UNSATISFIABLE for the GMW half (acceptance.md amendment, tracked as O-4) |
| H-AC-12 | partial | C | guard-push/guard-devplan/change-control validate the decision reference; the DUAL-EVALUATION during migration with shared owner and expiry has no carrier |
| H-AC-13 | implemented | C | human-governance-ledger-tests + store admission: prohibited content rejected before any temporary file exists |
| H-AC-14 | partial | C | governance-events.md + po-human-approval.md + threat model exist; no migration, retention or recovery section for the ledger package |
| H-AC-15 | implemented | WP-H | human-governance-ledger-tests (PHX-WP-H): all thirteen named scenarios pinned (grant/consumption/expiry/redaction pre-existing; denial/revocation/correction/retry/concurrency/interruption/tampering/stale-candidate/cross-repository-binding new and break-proofed) |

### A — Agent Decision and Assumption Journal (#31) (4/16 implemented)

| ID | verdict | src | evidence / named gap |
|---|---|---|---|
| A-AC-01 | partial | C | record shape pinned; nothing enforces recording BEFORE dependent action where policy requires |
| A-AC-02 | implemented | WP-A | agent-decision-journal-tests (PHX-WP-A): all five lifecycle transitions (verified/contradicted/expired/invalidated/superseded) accept a linked follow-up event, exercised end-to-end through the store with the original proven byte-for-byte unchanged |
| A-AC-03 | not-started | C | NO CARRIER: no revalidation/invalidation path identifies objects affected by a changed assumption |
| A-AC-04 | partial | C | self-confirmation is prevented; no correlation path to the human ledger is implemented |
| A-AC-05 | not-started | J | NO CARRIER: neither event shape carries a runner/model/effort/profile/role/adapter field at all |
| A-AC-06 | implemented | C | agent-decision-journal-tests: free text, authority-shaped fields and unbound supersession rejected |
| A-AC-07 | not-started | WP-A | CONFIRMED ABSENT (PHX-WP-A, repo-wide search): no per-event-class "mandatory" capture concept exists anywhere in the journal, the shared store, or capture-policy.json -- five of the seven named event classes are not even representable as a journal `kind` |
| A-AC-08 | not-started | C | NO CARRIER: no detector for missing dispatch provenance; the Dispatch: trailer is convention only |
| A-AC-09 | designed-only | J | materiality is documented as design intent only; no code enforces or measures it |
| A-AC-10 | partial | C | the offer path fails closed on unavailable journaling; no per-event-class fail-open/fail-closed policy exists |
| A-AC-11 | implemented | B | agent-decision-event.schema.json:14 assumptionState enumerates exactly the seven required epistemic states (landed 5d0fc6a) |
| A-AC-12 | partial | C | agent-decision-journal-tests (PHX-WP-A): downstream export/projection policy (governance-event-projection.mjs) is independently configurable from capture eligibility and structurally cannot weaken it; the restricted-machine-local boundary mapping, "sole read boundary" language, and a literal human-ledger side-by-side remain unaddressed |
| A-AC-13 | partial | C | agent-decision-journal-tests (PHX-WP-A): the duplicate-submission clause is pinned -- exact duplicate is a deterministic idempotent-replay no-write, conflicting duplicate fails closed (GES-IDEMPOTENCY-CONFLICT); concurrent/interrupted/out-of-order for agent-kind events remain covered only by the store's generic tests, not newly pinned |
| A-AC-14 | partial | C | 5 of 13 named conformance scenarios have thin/generic (non-dedicated) coverage, 8 have zero coverage; "decomposition" is not representable in the current `kind` enum at all (PHX-WP-A, not padded) |
| A-AC-15 | partial | C | agent-decision-journal.md carries one section; no taxonomy, materiality policy, trust model, retention or recovery doc |
| A-AC-16 | implemented | C | agent-decision-journal-tests: a journal event cannot present as approval |

### L — Lifecycle stream and replay (#17) (4/8 implemented)

| ID | verdict | src | evidence / named gap |
|---|---|---|---|
| L-AC-01 | partial | C | the closed lifecycle schema and validator are pinned; NO PRODUCER exists — no Pipeline path emits a lifecycle event |
| L-AC-02 | partial | J | six of the eight #10 exchange identities are retained; queueRevision and a distinct correlationId are absent |
| L-AC-03 | implemented | C | lifecycle-governance-events-tests: registered namespace only, no credential-carrying namespace, no opaque digest |
| L-AC-04 | partial | C | semantic classes pinned; the VISUAL class remains confirmed absent (PHX-WP-L): the renderer has no origin field to key a visual marker off and gives every event kind the same CSS class -- a renderer change, not a missing test |
| L-AC-05 | implemented | C | lifecycle-governance-events-tests: candidate invalidation visible, duplicate sequences fail closed |
| L-AC-06 | implemented | C | replay rejects extra event data instead of exposing raw lifecycle bodies |
| L-AC-07 | implemented | WP-L | governance-replay-core-tests: serial/parallel/retry/cancellation/recovery fixtures replay to identical bounded output on repeat, and a malicious duplicate-sequence fixture is rejected deterministically (PHX-WP-L, break-proofed twice) |
| L-AC-08 | partial | J | no artifact traces each retained element to a stated user or audit need |

### P — Policy packs and signed audit bundles (#9) (7/13 implemented)

| ID | verdict | src | evidence / named gap |
|---|---|---|---|
| P-AC-01 | partial | C | schema/compatibility/merge pinned; provenance, dependency and signature-policy validation are not named |
| P-AC-02 | implemented | C | organization-policy-tests: floor weakening, unknown rule, single-owner conflict all rejected |
| P-AC-03 | partial | C | planOrganizationPolicyActivation pinned; newly-required artifacts, external effects and backfill range are not |
| P-AC-04 | implemented | C | organization-policy-activation-tests: activation only after a bound authority readback; stale plan preimage rejected |
| P-AC-05 | implemented | C | organization-policy-tests: credential, endpoint, coordinate, actor-mapping and signing-key fields refused at every level |
| P-AC-06 | partial | WP-P | audit-bundle-core-tests: missing, misplaced, illegally-mutable, stale and truncated each pinned (PHX-WP-P, break-proofed). legacy and orphaned remain unpinned: the legacy classification exists (feature-package-topology.mjs:78) but no rejection path consults it, and no code checks a package file is referenced by an artifact |
| P-AC-07 | implemented | C | audit-bundle-tests: signs and verifies only an unchanged manifest, without identity or authority claims |
| P-AC-08 | implemented | ELEPHANT | harness/scripts/pipeline-state.test.mjs (PHX-WP-GATE built it, Elephant registered it under the signed TP-3+TP-5 window): all three plan kinds (bootstrap, transition, reconcile) and the Result-reconciliation fence are built and now gate-registered, 444/444 including the 26 reconcile cases, re-run independently |
| P-AC-09 | not-started | C | NO CARRIER: no export-backfill preview or explicit consent path exists |
| P-AC-10 | implemented | WP-P | organization-policy-core-tests + audit-bundle-core-tests: pack-side compliance-claim rejection and signed-bundle no-identity-claim shape both pinned (PHX-WP-P, break-proofed). Log/viewer halves were out of the dispatched carrier scope and remain unevaluated either way |
| P-AC-11 | partial | WP-P | organization-policy-core-tests: mode (closed reference-only/projection/controlled-publication set) and approval (union, no downgrade) pinned (PHX-WP-P, break-proofed). Target class/binding, owned fields/sections, lifecycle event, preview, retention and revision readback remain unpinned: documentClasses is closed to exactly class/mode/approvalRequired, no field exists for the rest |
| P-AC-12 | implemented | C | audit-bundle-tests: tampered or missing bundle bytes detected; signature invalidated when the manifest changes |
| P-AC-13 | partial | C | organization-policy-packs.md and audit-bundles.md are stubs; no migration/versioning policy, no pack threat model |

### V — Human-readable Evidence Viewer (#5) (8/10 implemented)

| ID | verdict | src | evidence / named gap |
|---|---|---|---|
| V-AC-01 | implemented | C | evidence-view-model-tests: offline report with source links and a candidate-bound receipt |
| V-AC-02 | partial | C | evidence-view-renderer-tests: fact, unknown, unavailable, redacted, invalid and not-applicable each labelled visibly, six of nine (PHX-WP-V, break-proofed). estimate, assumption and human decision remain unpinned: zero occurrences anywhere in the view-model, renderer or CLI modules -- no field carries them at all |
| V-AC-03 | implemented | C | evidence-view-model-tests: claims linked to canonical source record and exact candidate |
| V-AC-04 | implemented | C | evidence-view-model-tests: invalid topology yields an invalid view with no candidate or artifact leak |
| V-AC-05 | implemented | C | evidence-view-renderer-tests: deterministic redacted projection withholding artifact paths |
| V-AC-06 | partial | C | evidence-view-renderer-tests: exact CSP directive value, skip-link keyboard focus target, and landmark/table accessibility structure all pinned (PHX-WP-V, break-proofed). Mobile/desktop snapshot checks remain absent: a viewport meta tag and one CSS breakpoint exist but no test or tooling captures a deterministic snapshot of either, and this repo has no headless-render/visual-regression infrastructure at all |
| V-AC-07 | implemented | WP-V | evidence-viewer-tests: input-side rejection was already pinned; a new assertion tampers the generated viewer file and proves canonical authority stays unchanged and re-derivation never yields a pass claim (PHX-WP-V, break-proofed) |
| V-AC-08 | implemented | C | evidence-view-model-tests: exact canonical lifecycle state or a typed unavailable result |
| V-AC-09 | implemented | WP-V | evidence-view-renderer-tests: all seven required fixtures now covered -- pass/fail/unknown pre-existing, tampered/misplaced/orphaned/legacy-layout added with deterministic snapshots (PHX-WP-V, break-proofed) |
| V-AC-10 | implemented | C | evidence-viewer-tests: candidate binding rendered before any derived summary |

### X — Traceability and documentation adapters (#23) (12/15 implemented)

| ID | verdict | src | evidence / named gap |
|---|---|---|---|
| X-AC-01 | implemented | C | external-reference-adapter-tests: unclosed references rejected, non-pipeline-owned writes blocked |
| X-AC-02 | implemented | C | external-reference-adapter-tests: one ownership class per synchronized field/section |
| X-AC-03 | implemented | C | external-reference-adapter-tests: inspect, exact preview, authority, idempotent apply, matching readback |
| X-AC-04 | implemented | C | external-reference-adapter-tests: no success reported for revision, capability, authority or readback conflict |
| X-AC-05 | implemented | C | external-reference-adapter-tests: external observations reconciled without importing them as authority |
| X-AC-06 | implemented | C | external-reference-adapter-tests: deterministic typed state for every abnormal external observation |
| X-AC-07 | implemented | C | external-reference-adapter-tests: credentials and private coordinates kept out of every portable record |
| X-AC-08 | implemented | C | external-reference-adapter-tests: provider names and fields kept out of the normative core schemas |
| X-AC-09 | implemented | C | external-reference-adapter-tests: external content treated as untrusted data, no execution or authority injection |
| X-AC-10 | implemented | C | external-reference-adapter-tests: identity resolved through the feature package, not a path guess |
| X-AC-11 | not-started | J | NO CARRIER: the adapter never references organization policy, and the policy modules never reference the adapter |
| X-AC-12 | implemented | WP-X | external-reference-adapter-tests: plan->apply->reconcile proven identical across synthetic issue-tracker, knowledge-base, document-store and secondary-forge profiles, and every cross-profile capability mismatch rejected (PHX-WP-X, break-proofed) |
| X-AC-13 | implemented | C | external-reference-adapter-tests: defaults to reference-only or projection, never last-write-wins |
| X-AC-14 | partial | C | confirmed absent (PHX-WP-X): neither inspect() call site (external-reference-adapter.mjs:61,72) has a try/catch, so an unreachable external system throws uncaught instead of producing a typed observation -- filed as pipeline.external-reference-adapter-has-no-typed-response-to-an-unreachable-external-system, a production fix not a missing test |
| X-AC-15 | partial | C | external-traceability.md carries three sections; no threat model, publication guide or recovery procedure |

### C — ITSM change control (#24) (8/13 implemented)

| ID | verdict | src | evidence / named gap |
|---|---|---|---|
| C-AC-01 | implemented | C | change-control-tests: profile validation plus the exact bound tuple for mandatory promotion |
| C-AC-02 | partial | WP-C | change-control-tests (PHX-WP-C, break-proofed): "standard" is pinned as a distinct changeClass paired with mandatory authority, alongside emergency and not-required; the required-field-level distinction between standard and normal, and any anti-class-shopping check, remain absent -- validateChangeControlProfile requires the identical fixed key set for every class |
| C-AC-03 | implemented | C | change-control-tests: Pipeline and external authority validated independently against the same tuple |
| C-AC-04 | implemented | C | change-control-tests: stale, unauthenticated, mismatched, unavailable and outside-window state all block |
| C-AC-05 | implemented | C | change-control-tests: external update published only after the local deployment event; failed attempts preserved |
| C-AC-06 | implemented | C | change-control-tests: reconciliation-required entered instead of claiming completed change control |
| C-AC-07 | partial | WP-C | change-control-tests (PHX-WP-C, break-proofed): explicit emergency authority and bounded-scope rejection of a scope mismatch are pinned; retrospective evidence proving the emergency was real or reviewed is not -- the journal binding does not even carry changeClass, so nothing is gated on it |
| C-AC-08 | implemented | C | change-control-tests: the deploy adapter stays independently usable when not-required |
| C-AC-09 | not-started | WP-C | CONFIRMED ABSENT (PHX-WP-C, repo-wide search): no resolver over multiple candidate change-control profiles exists anywhere in this module or its CLI -- there is no data shape representing "release configuration for an environment" as a set of candidates, so nothing exists to test |
| C-AC-10 | implemented | C | change-control-tests: an automatically created external record stays draft or observation |
| C-AC-11 | implemented | C | change-control-tests: provider names and fields kept out of the provider-neutral core schema |
| C-AC-12 | partial | WP-C | change-control-tests (PHX-WP-C, break-proofed): unavailable external state blocks via C-AC-04, and the distinct "external-unavailable" gate reason is now pinned by name; the explicit advisory-vs-mandatory policy distinction remains absent -- mandatory:false is only representable together with changeClass:"not-required", which short-circuits before ITSM availability is ever inspected |
| C-AC-13 | partial | C | change-control.md is a stub; no threat model, precedence, migration, runbook or rollback procedure |

### E — Governance event export (#32) (11/21 implemented)

| ID | verdict | src | evidence / named gap |
|---|---|---|---|
| E-AC-01 | implemented | C | governance-export-adapter-tests: one validated source mapped deterministically with stable identity |
| E-AC-02 | partial | C | profiles implemented and documented; DECLARING every lossy field/semantic conversion is not pinned |
| E-AC-03 | implemented | C | governance-export-adapter-tests: policy-less exports denied, only explicitly allowed fields projected |
| E-AC-04 | partial | C | no assertion covers free-form rationale omission-unless-permitted-and-redacted |
| E-AC-05 | implemented | C | governance-export-outbox-tests: independent destination queues, idempotent enqueue, retryable and quarantined entries preserved |
| E-AC-06 | partial | C | at-least-once behaviour is exercised by the retry tests; the explicit no-exactly-once claim is documentation only |
| E-AC-07 | implemented | C | governance-export-delivery-tests: only the safely acknowledged prefix advances after partial delivery |
| E-AC-08 | partial | C | two of the eight enumerated detections are pinned; cursor rollback, outbox truncation, event gap, source fork, invalid hash and schema downgrade are not |
| E-AC-09 | partial | C | viewer renders lag; no assertion shows canonical governance continuing under an unavailable advisory destination |
| E-AC-10 | not-started | C | NO CARRIER: no named lifecycle boundary blocks only the exact unacknowledged source range |
| E-AC-11 | partial | C | the privacy half is pinned; attempt, counts, cursor/lag and policy digests are not each pinned |
| E-AC-12 | implemented | C | governance-export-adapter-tests: profile and acknowledgements are closed, non-authoritative and deduplicated |
| E-AC-13 | implemented | C | governance-export-outbox-tests: destination queues, cursors and failure domains stay independent |
| E-AC-14 | partial | C | the in-memory collector is pinned; local-file, syslog and failure-injection fixtures are not named |
| E-AC-15 | implemented | C | governance-export-adapter-tests: allowlisting/redaction completed before every persistence boundary |
| E-AC-16 | implemented | C | nine named assertions: batching bound, compression, payload bound, rate limit, retry budget, backpressure, flush, restart resume, replay |
| E-AC-17 | implemented | C | governance-export-outbox-tests: duplicate delivery preserves one canonical source history |
| E-AC-18 | implemented | C | governance-export-adapter-tests: destination secrets excluded from every portable export record |
| E-AC-19 | implemented | C | evidence-viewer-tests: export lag and receipts rendered as a separate non-authoritative observation |
| E-AC-20 | not-started | J | NO CARRIER: audit-bundle carries nothing from the export package, and the export modules never reference the bundle |
| E-AC-21 | partial | C | governance-event-export.md carries two sections; no data-flow diagram, mapping/loss guide, retention guidance, runbook or incident procedure |

### R — External command offer, workaround and recovery audit profile (5/13 implemented)

| ID | verdict | src | evidence / named gap |
|---|---|---|---|
| R-AC-01 | implemented | C | external-command-offer-tests: public-safe offer recorded before presentation, verified append readback required |
| R-AC-02 | not-started | WP-R | CONFIRMED ABSENT (PHX-WP-R): recovery-proposed/recovered states exist in the schema but are unreachable through any exported function -- no capability correlates a rejected path, alternatives, or selected recovery to the offer |
| R-AC-03 | implemented | C | external-command-offer-tests: a bound human decision is required for destructive attempts and appended before execution |
| R-AC-04 | partial | WP-R | external-command-offer-tests (PHX-WP-R): operation class, target, exact pre/post digests, and recoverability are bound and validated together; a distinct "required cleanup/readback" field beyond the recoverability enum does not exist |
| R-AC-05 | implemented | C | agent-decision-journal-tests: every enumerated private field and every untyped digest refused at both journal boundaries |
| R-AC-06 | implemented | C | external-command-offer-tests: user execution stays unobserved; completion admitted only with bounded evidence |
| R-AC-07 | implemented | C | external-command-offer-tests: failed, partial, cancelled, mismatch and unknown outcomes retained distinctly |
| R-AC-08 | partial | WP-R | external-command-offer-tests (PHX-WP-R): a readback lifecycle event appends exactly once and never rewrites the original offer; rollback/cleanup as *occurred* events are absent -- no such state exists at all, only prospective values inside recoverability |
| R-AC-09 | partial | WP-R | external-command-offer-tests (PHX-WP-R): missing offer link, contradictory outcome evidence, and cross-repository/cross-scope substitution all fail closed (never successful); stale and duplicate detection remain absent -- no timestamp field, no supersession semantics for command-offer events |
| R-AC-10 | partial | C | fail-closed on the append is pinned; the policy-defined typed non-material exception is absent |
| R-AC-11 | partial | WP-R | external-command-offer-tests (PHX-WP-R): a mandatory public-safe typed omission is pinned; "sanctioned machine-local state" storage and a distinct "commitment" field are absent from this module (it stores nothing by design; commitment only exists in the unrelated document-lifecycle.mjs) |
| R-AC-12 | not-started | C | NO CARRIER: no Phoenix bootstrap-trajectory fixture exists |
| R-AC-13 | partial | WP-R | external-command-offer-tests (PHX-WP-R): 9 of 11 required fixture classes now named (7 pre-existing + secret/malicious command rejection + governed-script identity); approval-without-run and duplicate/retry are confirmed structurally unreachable, each pinned by a dedicated test showing the gap rather than left silently missing |

### EPIC — Epic integration and release (1/6 implemented)

| ID | verdict | src | evidence / named gap |
|---|---|---|---|
| EPIC-AC-01 | partial | C | the issue-to-criterion mapping exists; no independent closure status exists for any of the eight issues |
| EPIC-AC-02 | not-started | J | NO CARRIER: planParallelSprintIntegration has no concept of "unpublished" and is called only from its own test file |
| EPIC-AC-03 | partial | C | an outstanding deviation is recorded (the bound Spec section 7 inventory omits six implemented modules) and is not yet repaired through the sanctioned route |
| EPIC-AC-04 | partial | C | Full Verify and blocking Security pass on the pushed candidate; privacy review, an independent high-risk Critic on the integrated candidate, and explicit PO acceptance are absent |
| EPIC-AC-05 | constraint | C | a prohibition, and it currently bites: 79 criteria are not implemented |
| EPIC-AC-06 | implemented | C | the PRD header records the PO approval binding the first implementation dispatch |

## Per issue

### #5 — Generate a local human-readable Evidence Viewer

5 of 6 live acceptance bullets fully carried; **1 blocked**.

| # | live acceptance bullet | blocking criteria (verdict) |
|---|---|---|
| 1 | Accessibility and mobile/desktop readability | V-AC-06 (partial) |

### #9 — Introduce organization policy packs and signed audit bundles

2 of 11 live acceptance bullets fully carried; **9 blocked**.

| # | live acceptance bullet | blocking criteria (verdict) |
|---|---|---|
| 1 | Policy origin and effective value are inspectable | P-AC-03 (partial) |
| 2 | Conflicting/incompatible packs cannot activate silently | P-AC-01 (partial) |
| 3 | Required documentation stays provider-neutral | P-AC-11 (partial) |
| 4 | External permission is scoped by class/target/mode/ownership/event/approval | P-AC-11 (partial) |
| 5 | Policy cannot grant unrestricted edits or import prose authority | P-AC-11 (partial) |
| 6 | Publications require preview, source digest, revision readback, reconciliation | P-AC-11 (partial) |
| 7 | Bundle artifacts resolve through canonical inventory | P-AC-06 (partial) |
| 8 | Invalid/misplaced/orphaned/unreconciled artifacts cannot enter silently | P-AC-06 (partial) |
| 9 | Threat model and migration/versioning are documented | P-AC-13 (partial) |

### #17 — Define a sanitized multi-agent event model and local replay view

4 of 6 live acceptance bullets fully carried; **2 blocked**.

| # | live acceptance bullet | blocking criteria (verdict) |
|---|---|---|
| 1 | Replay is non-authoritative and links canonical evidence | L-AC-04 (partial) |
| 2 | Design is driven by user/audit needs, not competitor parity | L-AC-08 (partial) |

### #23 — Define external work-system and knowledge-base traceability adapters

13 of 16 live acceptance bullets fully carried; **3 blocked**.

| # | live acceptance bullet | blocking criteria (verdict) |
|---|---|---|
| 1 | #9 governs mandatory documents and external writes | X-AC-11 (not-started) |
| 2 | External outage cannot erase local authority | X-AC-14 (partial) |
| 3 | Contract/threat/mapping/publication/conformance docs exist | X-AC-15 (partial) |

### #24 — Add policy-governed ITSM change control to release and promotion

8 of 12 live acceptance bullets fully carried; **4 blocked**.

| # | live acceptance bullet | blocking criteria (verdict) |
|---|---|---|
| 1 | Environment selects no control or exactly one effective profile | C-AC-09 (not-started) |
| 2 | Standard/normal/emergency/not-required have distinct behavior | C-AC-02 (partial) |
| 3 | Advisory/mandatory offline and unavailable behavior is explicit | C-AC-12 (partial) |
| 4 | Threat/policy/migration/runbook/recovery docs exist | C-AC-13 (partial) |

### #30 — Add a repository-scoped tamper-evident human governance decision ledger

8 of 17 live acceptance bullets fully carried; **9 blocked**.

| # | live acceptance bullet | blocking criteria (verdict) |
|---|---|---|
| 1 | Every human authority transition records a decision first | H-AC-12 (partial) |
| 2 | Full decision lifecycle is reconstructable | H-AC-11 (partial) |
| 3 | Cross-repository writes/consumption are rejected | H-AC-09 (not-started) |
| 4 | Interrupted/concurrent append recovers without silent split authority | K-AC-05 (partial) |
| 5 | Truncation/reorder/change/fork/path/hash failures verify offline | K-AC-05 (partial) |
| 6 | Guard/plan/release/deploy/override paths reference decision IDs | H-AC-12 (partial) |
| 7 | Unverified legacy material cannot satisfy a current gate | H-AC-08 (not-started) |
| 8 | #9 bundles verified ledger records/integrity | P-AC-06 (partial) |
| 9 | Schema/taxonomy/authority/threat/migration/retention/recovery docs exist | H-AC-14 (partial) |

### #31 — Add a privacy-preserving agent decision and assumption journal

5 of 17 live acceptance bullets fully carried; **12 blocked**.

| # | live acceptance bullet | blocking criteria (verdict) |
|---|---|---|
| 1 | Closed schema/materiality policy selects journaled events | A-AC-01 (partial) |
| 2 | Changed assumptions invalidate/revalidate affected work | A-AC-03 (not-started) |
| 3 | Human confirmation correlates to #30; only #30 grants authority | A-AC-04 (partial) |
| 4 | Runner/model/profile/role/capability carries assurance | A-AC-05 (not-started) |
| 5 | Mandatory material events are never sampled/discarded silently | A-AC-07 (not-started) |
| 6 | Retention/access/integrity is independent of human ledger | A-AC-12 (partial) |
| 7 | Interrupted/concurrent/duplicate/out-of-order behavior is deterministic | A-AC-13 (partial) |
| 8 | Offline verification detects mutation/gaps/forks/path/repository errors | K-AC-05 (partial) |
| 9 | #17 replays all origins without authority collapse | L-AC-04 (partial) |
| 10 | #5 shows uncertainty/status/decision with evidence | V-AC-02 (partial) |
| 11 | Complete assumption/selection/failure/privacy fixture set | A-AC-14 (partial) |
| 12 | Schema/taxonomy/materiality/trust/privacy/retention/recovery docs exist | A-AC-15 (partial) |

### #32 — Add provider-neutral governance event export for SIEM and audit platforms

9 of 20 live acceptance bullets fully carried; **11 blocked**.

| # | live acceptance bullet | blocking criteria (verdict) |
|---|---|---|
| 1 | Human/agent/lifecycle origin and authority survive export | K-AC-10 (not-started) |
| 2 | CloudEvents/OTLP/NDJSON/RFC 5424 mappings are deterministic/loss-declared | E-AC-02 (partial) |
| 3 | Free-form rationale is explicit-policy-only and redacted | E-AC-04 (partial) |
| 4 | At-least-once/idempotency/order/retry/rate/backpressure/replay/restart tested | E-AC-06 (partial) |
| 5 | Cursor/gap/fork/hash/schema/ack failures are typed | E-AC-08 (partial) |
| 6 | Advisory failure preserves canonical operation | E-AC-09 (partial) |
| 7 | Required mode blocks only exact named boundary/range | E-AC-10 (not-started) |
| 8 | Receipts state exact acknowledgement without retention/review claims | E-AC-11 (partial) |
| 9 | External event correlates to sources/candidate/evidence/policy/chain | K-AC-10 (not-started) |
| 10 | #9 bundles sanitized export-policy/delivery metadata | E-AC-20 (not-started) |
| 11 | Threat/data-flow/mapping/retention/runbook/recovery docs exist | E-AC-21 (partial) |

## Summary

| issue | bullets | carried | blocked | closeable |
|---|---|---|---|---|
| #5 | 6 | 5 | 1 | **no** |
| #9 | 11 | 2 | 9 | **no** |
| #17 | 6 | 4 | 2 | **no** |
| #23 | 16 | 13 | 3 | **no** |
| #24 | 12 | 8 | 4 | **no** |
| #30 | 17 | 8 | 9 | **no** |
| #31 | 17 | 5 | 12 | **no** |
| #32 | 20 | 9 | 11 | **no** |

Issues closeable on their own live acceptance bullets: **0 of 8**.

## The blocking set, ranked

41 distinct criteria block at least one live acceptance bullet.

| criterion | verdict | live bullets blocked |
|---|---|---|
| P-AC-11 | partial | 4 |
| K-AC-05 | partial | 3 |
| P-AC-06 | partial | 3 |
| H-AC-12 | partial | 2 |
| K-AC-10 | not-started | 2 |
| L-AC-04 | partial | 2 |
| A-AC-01 | partial | 1 |
| A-AC-03 | not-started | 1 |
| A-AC-04 | partial | 1 |
| A-AC-05 | not-started | 1 |
| A-AC-07 | not-started | 1 |
| A-AC-12 | partial | 1 |
| A-AC-13 | partial | 1 |
| A-AC-14 | partial | 1 |
| A-AC-15 | partial | 1 |
| C-AC-02 | partial | 1 |
| C-AC-09 | not-started | 1 |
| C-AC-12 | partial | 1 |
| C-AC-13 | partial | 1 |
| E-AC-02 | partial | 1 |
| E-AC-04 | partial | 1 |
| E-AC-06 | partial | 1 |
| E-AC-08 | partial | 1 |
| E-AC-09 | partial | 1 |
| E-AC-10 | not-started | 1 |
| E-AC-11 | partial | 1 |
| E-AC-20 | not-started | 1 |
| E-AC-21 | partial | 1 |
| H-AC-08 | not-started | 1 |
| H-AC-09 | not-started | 1 |
| H-AC-11 | partial | 1 |
| H-AC-14 | partial | 1 |
| L-AC-08 | partial | 1 |
| P-AC-01 | partial | 1 |
| P-AC-03 | partial | 1 |
| P-AC-13 | partial | 1 |
| V-AC-02 | partial | 1 |
| V-AC-06 | partial | 1 |
| X-AC-11 | not-started | 1 |
| X-AC-14 | partial | 1 |
| X-AC-15 | partial | 1 |

## Criteria not mapped to any live issue bullet

53 of 157 criteria are Phoenix's own stricter contract rather than a live issue obligation.
They block no issue, but EPIC-AC-05 still forbids an epic completion claim while any of them is not `implemented`.
29 of those 53 are currently not `implemented` and are listed below; the rest are omitted because they are done.

| criterion | verdict |
|---|---|
| A-AC-08 | not-started |
| A-AC-09 | designed-only |
| A-AC-10 | partial |
| C-AC-07 | partial |
| E-AC-14 | partial |
| EPIC-AC-01 | partial |
| EPIC-AC-02 | not-started |
| EPIC-AC-03 | partial |
| EPIC-AC-04 | partial |
| EPIC-AC-05 | constraint |
| L-AC-01 | partial |
| L-AC-02 | partial |
| P-AC-09 | not-started |
| PX0-AC-01 | partial |
| PX0-AC-03 | partial |
| PX0-AC-04 | partial |
| PX0-AC-05 | partial |
| PX0-AC-06 | partial |
| PX0-AC-07 | partial |
| PX0-AC-08 | partial |
| PX0-AC-13 | partial |
| R-AC-02 | not-started |
| R-AC-04 | partial |
| R-AC-08 | partial |
| R-AC-09 | partial |
| R-AC-10 | partial |
| R-AC-11 | partial |
| R-AC-12 | not-started |
| R-AC-13 | partial |

## The epic gates, one by one

EPIC-AC-04 names seven gates for a completion claim. Their current state, so that the remaining
work is not mistaken for paperwork:

| gate | state | evidence |
|---|---|---|
| Focused package checks | **partial** | per-package suites are green; P-AC-08 declares the feature-package writer the gating first slice, and it is now fully built (26/26 staged cases, independently re-run) but not yet registered in the gate-registered suite the criterion names by path -- one signed TP-3+TP-5 window away |
| Full Verify | **passed** | `evidence/verify-latest.json` — exit 0, 368/368, exact binding on `3387065`, clean at start and finish |
| Blocking Security | **passed** | `pipeline.security-verdict.v2` — `blocking: false`, `cap.sast` pass, `cap.secrets` pass |
| Privacy review | **absent** | no privacy-review artifact exists for the integrated candidate |
| Independent high-risk Critic | **absent for the integrated candidate** | Critic rounds exist per work package; none reviews Phoenix as one integrated candidate |
| Exact branch push and readback | **passed** | `origin/sprint_phoenix = 3387065`, readback OID equality confirmed, approval bound to that exact commit |
| Explicit PO acceptance | **absent** | the only recorded PO approval binds the first implementation dispatch (EPIC-AC-06), not completion |

Two epic criteria are open for reasons that are not implementation debt and cannot be closed by
writing code:

- **EPIC-AC-03** — a deviation is recorded and unrepaired: the bound Spec §7 inventory omits six
  already-implemented Phoenix modules. The criterion requires the Spec updated and the affected
  approval renewed; the sanctioned route is the continuity-authority revision writer, which now
  exists (PX0-AC-02 implemented), so this is executable where it previously was not.
- **H-AC-11** — its own PO amendment records that Increment 1 does **not** satisfy the
  no-join-handle clause for the GMW half, as a proved impossibility rather than an unfinished
  implementation. It closes only by a separately reviewed amendment scoping the clause, or by
  changing GMW's machine-local storage. Tracked as O-4.

