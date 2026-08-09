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

**Phoenix cannot claim complete.** 108 of 157 criteria carry a named assertion in a
gate-registered suite; 49 do not. EPIC-AC-05 forbids a completion claim while any
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
| implemented | 108 |
| partial | 35 |
| designed-only | 1 |
| not-started | 12 |
| constraint | 1 |
| **total** | **157** |

## Per criterion — verdict and evidence

`src`: **C** = the 2026-08-08 baseline measurement, **J** = its ten-row adjudication follow-up,
**A**/**B** = the 2026-08-09 delta re-measurement. For `implemented`, the pointer names the
gate-registered suite that pins the operative clause; for every other verdict it names the exact
clause that is not pinned or not built.

### PX0 — Lifecycle-authority revision and runner-neutral ruleset source (13/17 implemented)

| ID | verdict | src | evidence / named gap |
|---|---|---|---|
| PX0-AC-01 | implemented | WP-PX0 | pipeline-state-tests AR01a-d (PHX-WP-PX0, break-proofed, TP-5 window): a generic continuity-cas rewriting authority.prd or authority.spec is refused (CS-PROTECTED-AUTHORITY), zero mutation, both proved |
| PX0-AC-02 | implemented | A | continuity-authority-revision-plan emits the closed request; pinned in pipeline-state.test.mjs (registered) |
| PX0-AC-03 | partial | WP-PX0 | pipeline-state-tests AR03a-g (PHX-WP-PX0): apply rechecks both the next-authority artifact (AR03c) and its own fresh State preimage against a concurrent unrelated mutation (AR03e-g, new). One named axis remains unpinned: active-feature phase != design -> AR-DECISION-SCOPE, reachable in production but needing a full plan-approval fixture the dispatch's budget did not cover |
| PX0-AC-04 | implemented | WP-PX0 | pipeline-state-tests AR04a-i (PHX-WP-PX0, measurement correction -- already fully covered pre-dispatch): feature/revision/prestate/old-and-next-authority/expiry/candidate/decision-scope/idempotency-reuse all pinned; no new test needed |
| PX0-AC-05 | not-started | WP-PX0 | CONFIRMED ABSENT (PHX-WP-PX0, full command-path read): the authority-revision receipt is only ever printed once to apply's stdout or embedded in the retired-on-success private journal -- no durable retention exists anywhere |
| PX0-AC-06 | not-started | WP-PX0 | CONFIRMED ABSENT (PHX-WP-PX0, full command-path read): recover has exactly three outcome classes (clean, recovered-postimage x2, diverged) -- no recovered-preimage success outcome exists anywhere |
| PX0-AC-07 | implemented | WP-PX0 | pipeline-state-tests AR07a-b (PHX-WP-PX0, measurement correction -- already fully covered pre-dispatch): exact zero-write replay (AR07a) and a second/conflicting writer failing closed with State preserved (AR07b) both pinned, reinforced incidentally by the new AR03e-g |
| PX0-AC-08 | implemented | WP-PX0AC08 | pipeline-start-preflight-tests (PHX-WP-PX0AC08, break-proofed): observePipelineStartPreflight emits a closed rulesetSource observation on every bootstrap run that resolves a loaded distribution -- real content-hash identity for self-application/dev-checkout, honest {status:"unavailable"} elsewhere, both validated against ruleset-source.mjs's own closed schema |
| PX0-AC-09 | implemented | A | bootstrap-source-attestation-acceptance-tests (verify.mjs:333) — Codex-only marketplace resolution |
| PX0-AC-10 | implemented | A | bootstrap-source-attestation-acceptance-tests — pre-HEAD consumer compares loaded plugin identity |
| PX0-AC-11 | implemented | A | bootstrap-source-attestation-acceptance-tests — one common closed contract across the four source classes |
| PX0-AC-12 | implemented | C | ruleset-source-tests: source/loaded/installed/mismatch/remote unavailable each typed distinctly |
| PX0-AC-13 | partial | J | ruleset-freshness-host.mjs selects the host transport correctly, but no suite exercises it and bootstrap does not wire it |
| PX0-AC-14 | implemented | C | ruleset-source-tests: private-coordinate-rejected, private-remote-rejected |
| PX0-AC-15 | implemented | C | ruleset-source-tests: private-classification-preserved, local-classification-preserved |
| PX0-AC-16 | implemented | A | bootstrap-source-attestation-acceptance-tests — equality bound to exact loaded and observed public remote identity |
| PX0-AC-17 | implemented | A | bootstrap-source-attestation-acceptance-tests — unknown keys, ambiguous selectors, more than one selected plugin all fail closed |

### K — Governance event kernel (9/10 implemented)

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
| K-AC-10 | implemented | WP-K-AC10 | governance-event-store-tests (PHX-WP-K-AC10): queryPortableGovernanceStreams queries the human/agent/lifecycle streams in one call, keyed by streamId, proven to return exactly what the singular query would for each stream (origin/authorityClass/timeAssurance per event, integrity/completeness per stream) unflattened |

### H — Human Governance Decision Ledger (#30) (11/15 implemented)

| ID | verdict | src | evidence / named gap |
|---|---|---|---|
| H-AC-01 | implemented | C | human-governance-ledger-tests: closed portable grant, single-use consumption under the canonical stream lock |
| H-AC-02 | implemented | C | governance-authority-resolver-tests + guard-push consumption receipt |
| H-AC-03 | implemented | C | human-governance-ledger-tests: one event-specific link and outcome per authority disposition |
| H-AC-04 | implemented | C | human-governance-ledger-tests: repository/candidate drift, expiry, consuming disposition all fail closed |
| H-AC-05 | implemented | C | human-governance-ledger-tests: detached proof verified without upgrading to human identity; no attribution field admitted |
| H-AC-06 | implemented | C | human-governance-ledger-tests: append-only consumption disposition; restricted-store erasure pinned separately |
| H-AC-07 | implemented | C | human-governance-ledger-tests: cross-repository decision rejected before mutation |
| H-AC-08 | partial | WP-HAC08 | agent-decision-journal-tests (PHX-WP-HAC08): a third, independent event kind `legacy-import-observation` (closed legacySourceClass/authorityProofStatus/sourceReference shape, non-authoritative by construction via the existing origin==="agent" binding) is now representable, drift-tested. Still no production caller: CONFIRMED ABSENT (repo-wide search) that any code path imports/migrates a legacy record at all |
| H-AC-09 | not-started | J | NO CARRIER: external-push-ledger is scoped to single-repo push proofs; nothing binds cross-repository guarded work to one physical target. RECLASSIFIED Class S -> Class P 2026-08-09 (PO-confirmed): the clause's own subject -- authorizing guarded work IN another repository -- is exactly the capability CLAUDE.md's Sprint-0 hard rule currently forbids outright ("Read-only toward the three project repos ... never a write ... until an explicitly approved Phase-4 migration"). There is no design to scope: building a cross-repository binding mechanism for a write capability this repo is not yet authorized to exercise would be building ahead of its own governing policy, not closing a gap. Closes only if/when a Phase-4 migration lifts the restriction, or the PO narrows the clause's scope by amendment (the same route H-AC-11 already used) -- either way, not a code task available now |
| H-AC-10 | implemented | C | five named assertions covering scope, reason, expiry, constraints, follow-up review, no standing bypass |
| H-AC-11 | partial | C | portable reconstruction surface pinned; the no-join-handle clause is proved UNSATISFIABLE for the GMW half (acceptance.md amendment, tracked as O-4) |
| H-AC-12 | partial | C | guard-push/guard-devplan/change-control validate the decision reference; the DUAL-EVALUATION during migration with shared owner and expiry has no carrier |
| H-AC-13 | implemented | C | human-governance-ledger-tests + store admission: prohibited content rejected before any temporary file exists |
| H-AC-14 | implemented | WP-DOC | docs/governance-events.md (PHX-WP-DOC-1 + PHX-WP-DOC-3): all eight named parts present -- migration/retention/recovery/operator-guidance and schema/taxonomy/authority-trust-model were already solid, and a dedicated "Human ledger: threat model" section now covers eight scenarios each tied to an HGL-* code and, where one exists, an H-AC-15 test |
| H-AC-15 | implemented | WP-H | human-governance-ledger-tests (PHX-WP-H): all thirteen named scenarios pinned (grant/consumption/expiry/redaction pre-existing; denial/revocation/correction/retry/concurrency/interruption/tampering/stale-candidate/cross-repository-binding new and break-proofed) |

### A — Agent Decision and Assumption Journal (#31) (8/16 implemented)

| ID | verdict | src | evidence / named gap |
|---|---|---|---|
| A-AC-01 | partial | C | record shape pinned; nothing enforces recording BEFORE dependent action where policy requires |
| A-AC-02 | implemented | WP-A | agent-decision-journal-tests (PHX-WP-A): all five lifecycle transitions (verified/contradicted/expired/invalidated/superseded) accept a linked follow-up event, exercised end-to-end through the store with the original proven byte-for-byte unchanged |
| A-AC-03 | not-started | C | NO CARRIER: no revalidation/invalidation path identifies objects affected by a changed assumption |
| A-AC-04 | implemented | WP-AAC04FIX3 | CORRECTED AGAIN 2026-08-09 (Elephant, direct code read): a second, real, production-wired carrier exists that the first correction missed -- guard-git.mjs's Phoenix override path (consumePhoenixOverrideAuthority, guard-git.mjs:697-728) correlates an agent's override reference to the real human ledger via governance-authority.mjs, binds it to the exact repository/candidate/rule/artifact-digest tuple, and single-use-consumes it; guard-git-phoenix.test.mjs proves refuse-without-reference, one-time-allow, and refuse-on-replay end to end (1/1, independently re-run). The correlate-and-cannot-replay half of the clause is proven, not absent. What is still missing, narrowly: no production entry point ever CREATES a granted human-governance-decision -- appendHumanGovernanceDecision, createExternalHumanGovernanceIntent and verifyExternalHumanGovernanceProof (human-governance-ledger.mjs:150,73,101) are each called only from tests (repo-wide grep confirms), so a PO has no CLI to actually grant this authority today; governance-authority.mjs's own CLI only ever consumes an existing grant, never creates one. See design/class-s-scoping.md's 2026-08-09 correction for the exact three-function wiring this needs -- no new schema or cryptography, the trust anchor at project/critical-human-proof.json already covers the same PO key. CLOSED 2026-08-09 (PHX-WP-AAC04-FIX3, commit 0022d13): the missing create-half was built (human-authority-grant.mjs, a prepare/external-sign/install ceremony), survived an independent round-3 Critic PASS after two prior FAIL rounds closed a blocker, a major, and five other findings, and its final three minor findings (a docstring overclaim, runPrepare reading the wrong root, missing command/exit-code evidence headers) are also closed and independently re-verified (14/14 unit, 1/1 e2e, 25/25 regression). Both halves of the clause are now real, tested, and production-wired |
| A-AC-05 | partial | WP-AAC05 | agent-decision-journal-tests (PHX-WP-AAC05): the observational shape now carries an optional identity array (dimension/value/provenance/assurance, closed enums, 1-7 entries, no duplicate dimension) on selection/escalation/fallback only, rejected elsewhere via ADJ-IDENTITY-SCOPE, schema/validator drift-tested. Still no production caller: CONFIRMED ABSENT (repo-wide search) that any code path emits a selection/escalation/fallback event at all |
| A-AC-06 | implemented | C | agent-decision-journal-tests: free text, authority-shaped fields and unbound supersession rejected |
| A-AC-07 | not-started | WP-A | CONFIRMED ABSENT (PHX-WP-A, repo-wide search): no per-event-class "mandatory" capture concept exists anywhere in the journal, the shared store, or capture-policy.json -- five of the seven named event classes are not even representable as a journal `kind` |
| A-AC-08 | not-started | C | NO CARRIER: no detector for missing dispatch provenance; the Dispatch: trailer is convention only |
| A-AC-09 | designed-only | J | materiality is documented as design intent only; no code enforces or measures it |
| A-AC-10 | partial | C | the offer path fails closed on unavailable journaling; no per-event-class fail-open/fail-closed policy exists |
| A-AC-11 | implemented | B | agent-decision-event.schema.json:14 assumptionState enumerates exactly the seven required epistemic states (landed 5d0fc6a) |
| A-AC-12 | implemented | WP-A2 | agent-decision-journal-tests (PHX-WP-A + PHX-WP-A2): downstream export/projection policy is independently configurable from capture eligibility and structurally cannot weaken it; the portable path fails closed for any narrower-than-repository-public-safe stream, and the restricted profile is confirmed owner-authenticated and outside the repository |
| A-AC-13 | implemented | WP-A2 | agent-decision-journal-tests (PHX-WP-A + PHX-WP-A2): the duplicate-submission clause is pinned, and agent-kind fixtures now mirror the generic store's interrupted/concurrent/out-of-order guarantees directly rather than relying on them by implication |
| A-AC-14 | partial | C | 11 of 13 named conformance scenarios now have dedicated coverage (PHX-WP-A + PHX-WP-A2); "decomposition" is confirmed not representable in the current `kind` enum; "tampering" stays gapped -- needs store-generic digest-recompute verification, correctly left unattempted rather than guessed at |
| A-AC-15 | implemented | WP-DOC | docs/agent-decision-journal.md (PHX-WP-DOC-1 + PHX-WP-DOC-3): all eight named parts present -- taxonomy/materiality/trust/retention/recovery/operator docs, plus Schema (grounded in agent-decision-event.schema.json) and Privacy threat model (grounded in the R-AC-05 test and assertPortablePayload) closing the two the original briefing accidentally omitted |
| A-AC-16 | implemented | C | agent-decision-journal-tests: a journal event cannot present as approval |

### L — Lifecycle stream and replay (#17) (5/8 implemented)

| ID | verdict | src | evidence / named gap |
|---|---|---|---|
| L-AC-01 | partial | C | the closed lifecycle schema and validator are pinned; NO PRODUCER exists — no Pipeline path emits a lifecycle event |
| L-AC-02 | partial | J | six of the eight #10 exchange identities are retained; queueRevision and a distinct correlationId are absent |
| L-AC-03 | implemented | C | lifecycle-governance-events-tests: registered namespace only, no credential-carrying namespace, no opaque digest |
| L-AC-04 | implemented | WP-L-AC04 | governance-replay-view-tests (PHX-WP-L-AC04): the 9 verified lifecycle kinds now render with one of four distinct value-record-<class> CSS classes (human/agent/deterministic/runner-observed) instead of the shared "fact" default, proven by per-class tests plus a cross-class distinctness assertion within one rendered view |
| L-AC-05 | implemented | C | lifecycle-governance-events-tests: candidate invalidation visible, duplicate sequences fail closed |
| L-AC-06 | implemented | C | replay rejects extra event data instead of exposing raw lifecycle bodies |
| L-AC-07 | implemented | WP-L | governance-replay-core-tests: serial/parallel/retry/cancellation/recovery fixtures replay to identical bounded output on repeat, and a malicious duplicate-sequence fixture is rejected deterministically (PHX-WP-L, break-proofed twice) |
| L-AC-08 | partial | J | docs/governance-replay.md "Traceability" (PHX-WP-DOC-3): 8 of 9 lifecycle-governance-events.mjs kinds traced to a stated user/audit need; the `cancellation` kind is honestly flagged unclear -- no structural distinction from `status: "cancelled"` exists in the code, so no confident justification could be constructed |

### P — Policy packs and signed audit bundles (#9) (7/13 implemented)

| ID | verdict | src | evidence / named gap |
|---|---|---|---|
| P-AC-01 | partial | C | CONFIRMED ABSENT (PHX-WP-P): schema/compatibility/merge pinned; provenance, dependency and signature-policy validation have no corresponding field anywhere in the pack schema, no test was written around the gap |
| P-AC-02 | implemented | C | organization-policy-tests: floor weakening, unknown rule, single-owner conflict all rejected |
| P-AC-03 | partial | C | CONFIRMED ABSENT (PHX-WP-P): planOrganizationPolicyActivation pinned; newly-required artifacts, external effects and backfill range have no corresponding field anywhere in the activation-plan schema, no test was written around the gap |
| P-AC-04 | implemented | C | organization-policy-activation-tests: activation only after a bound authority readback; stale plan preimage rejected |
| P-AC-05 | implemented | C | organization-policy-tests: credential, endpoint, coordinate, actor-mapping and signing-key fields refused at every level |
| P-AC-06 | partial | WP-P | audit-bundle-core-tests: missing, misplaced, illegally-mutable, stale and truncated each pinned (PHX-WP-P, break-proofed). legacy and orphaned remain unpinned: the legacy classification exists (feature-package-topology.mjs:78) but no rejection path consults it, and no code checks a package file is referenced by an artifact |
| P-AC-07 | implemented | C | audit-bundle-tests: signs and verifies only an unchanged manifest, without identity or authority claims |
| P-AC-08 | partial | ELEPHANT | CORRECTED 2026-08-09 (independent Critic FAIL, F3): the reconcile transaction is built and gate-registered (444/444, harness/scripts/pipeline-state.test.mjs), but no shipped entry point ever supplies deps.featurePackageReconcileApproval -- pipeline-state.mjs:5644 has no default (`??`) fallback, unlike its sibling deps, and both CLI entry points call run() with none. Only the test file ever provides the resolver. The command as shipped cannot be invoked by any real operator or agent -- structurally identical to the "interface built, no caller" gap this session found and disclosed for A-AC-04, just not caught here until independent review |
| P-AC-09 | not-started | C | NO CARRIER: no export-backfill preview or explicit consent path exists |
| P-AC-10 | implemented | WP-P | organization-policy-core-tests + audit-bundle-core-tests: pack-side compliance-claim rejection and signed-bundle no-identity-claim shape both pinned (PHX-WP-P, break-proofed). Log/viewer halves were out of the dispatched carrier scope and remain unevaluated either way |
| P-AC-11 | partial | WP-P | organization-policy-core-tests: mode (closed reference-only/projection/controlled-publication set) and approval (union, no downgrade) pinned (PHX-WP-P, break-proofed). Target class/binding, owned fields/sections, lifecycle event, preview, retention and revision readback remain unpinned: documentClasses is closed to exactly class/mode/approvalRequired, no field exists for the rest |
| P-AC-12 | implemented | C | audit-bundle-tests: tampered or missing bundle bytes detected; signature invalidated when the manifest changes |
| P-AC-13 | implemented | WP-DOC | docs/organization-policy-packs.md + docs/audit-bundles.md (PHX-WP-DOC-2): threat model, pack/schema/activation policy, bundle policy, and compatibility/migration/versioning policy all present and grounded -- the compatibility section honestly states no pack-schema migration mechanism exists (only v1 is accepted; revision is a content digest, not a version number) |

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

### X — Traceability and documentation adapters (#23) (15/15 implemented)

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
| X-AC-11 | implemented | WP-XAC11 | external-reference-adapter-tests (PHX-WP-XAC11, break-proofed): planExternalReferenceWrite consults an injected organizationPolicy for a governed documentClass, failing closed on no policy / no covering class / mode mismatch / outstanding approval; approval-binding itself is a named open follow-on, not built here |
| X-AC-12 | implemented | WP-X | external-reference-adapter-tests: plan->apply->reconcile proven identical across synthetic issue-tracker, knowledge-base, document-store and secondary-forge profiles, and every cross-profile capability mismatch rejected (PHX-WP-X, break-proofed) |
| X-AC-13 | implemented | C | external-reference-adapter-tests: defaults to reference-only or projection, never last-write-wins |
| X-AC-14 | implemented | WP-XAC14 | external-reference-adapter-tests (PHX-WP-XAC14, break-proofed): both inspect() call sites now catch a thrown/rejected inspect and return the typed reconciliation-required/external-unreachable shape instead of an uncaught rejection; backlog item pipeline.external-reference-adapter-has-no-typed-response-to-an-unreachable-external-system closed |
| X-AC-15 | implemented | WP-DOC | docs/external-traceability.md (PHX-WP-DOC-2): threat model, ownership/lifecycle mapping, publication guide, recovery procedure, and conformance suite added and grounded; the recovery procedure names the adapter's uncaught-inspect()-rejection gap and its backlog item explicitly rather than describing a graceful path that does not exist |

### C — ITSM change control (#24) (9/13 implemented)

| ID | verdict | src | evidence / named gap |
|---|---|---|---|
| C-AC-01 | implemented | C | change-control-tests: profile validation plus the exact bound tuple for mandatory promotion |
| C-AC-02 | partial | WP-C-AC02 | change-control-tests (PHX-WP-C-AC02): "standard" is pinned as a distinct changeClass paired with mandatory authority, alongside emergency and not-required, AND now carries its own required standardTemplate {templateId, revision} field (null for every other class), closing the standard-vs-normal field-level distinction per issue #24 §5. Any anti-class-shopping check remains absent -- no concept anywhere in the module supports detecting a class picked solely to avoid approval |
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
| C-AC-13 | implemented | WP-DOC | docs/change-control.md (PHX-WP-DOC-1): threat model, policy precedence, migration, operator runbook, and failure/rollback/recovery procedures all present and grounded in change-control.mjs; migration section honestly states no migration tooling exists |

### E — Governance event export (#32) (16/21 implemented)

| ID | verdict | src | evidence / named gap |
|---|---|---|---|
| E-AC-01 | implemented | C | governance-export-adapter-tests: one validated source mapped deterministically with stable identity |
| E-AC-02 | implemented | WP-E-AC02 | governance-export-adapter-tests (PHX-WP-E-AC02): deterministic mapping was already pinned; loss is now computed per call -- RFC 5424 names every EXPORT_FIELDS key it drops (proven with a full eight-key and a minimal-key fixture), CloudEvents/OTLP/NDJSON proven to stay loss:[] under the same full-key fixture |
| E-AC-03 | implemented | C | governance-export-adapter-tests: policy-less exports denied, only explicitly allowed fields projected |
| E-AC-04 | partial | WP-E | governance-export-adapter-tests (PHX-WP-E, break-proofed): default omission of rationale/summary is pinned; CONFIRMED ABSENT: the "policy allows and redacts" path -- EXPORT_FIELDS is a closed, non-configurable constant (adapter.mjs:15), no policy can ever admit the field |
| E-AC-05 | implemented | C | governance-export-outbox-tests: independent destination queues, idempotent enqueue, retryable and quarantined entries preserved |
| E-AC-06 | implemented | WP-A2 | governance-export-delivery-tests (PHX-WP-E + PHX-WP-A2): stable idempotency and at-least-once redelivery are pinned; the receipt's closed enums carry no exactly-once wording and structurally cannot ever admit one -- the SHALL-NOT-claim-exactly-once negative is now pinned directly |
| E-AC-07 | implemented | C | governance-export-delivery-tests: only the safely acknowledged prefix advances after partial delivery |
| E-AC-08 | partial | WP-E-AC08 | governance-export-outbox-tests (PHX-WP-E-AC08): 7 of 8 detections pinned (destination-mismatch/forged-ack/event-gap/schema-downgrade pre-existing, cursor-bound/source-fork/invalid-hash new, each with its own typed code); outbox truncation (a cross-state comparison this module has no capability for) remains absent |
| E-AC-09 | partial | WP-E | governance-export-delivery-tests (PHX-WP-E, break-proofed): lag exposed on a failed acknowledgement is pinned; CONFIRMED ABSENT: the "advisory destination" concept itself -- no such distinction exists anywhere in scope, so "canonical governance continues under an unavailable advisory destination" is not representable |
| E-AC-10 | not-started | C | NO CARRIER: no named lifecycle boundary blocks only the exact unacknowledged source range |
| E-AC-11 | implemented | WP-E-AC11 | governance-export-delivery-tests (PHX-WP-E-AC11): the closed 10-field receipt schema is pinned, rejecting any retention/immutability/analyst-review/compliance-implying extension, AND now carries a projectionDigest alongside policyRevision -- deterministic over batch content, proven to change when batch content changes |
| E-AC-12 | implemented | C | governance-export-adapter-tests: profile and acknowledgements are closed, non-authoritative and deduplicated |
| E-AC-13 | implemented | C | governance-export-outbox-tests: destination queues, cursors and failure domains stay independent |
| E-AC-14 | implemented | WP-EAC14 | governance-export-delivery-tests (PHX-WP-EAC14, break-proofed): all five named fixture classes individually evidenced -- in-memory/local-file/OTLP-profile/syslog (pre-existing) plus a genuine failure-injection fixture (new): a rejected adapter.deliver() call leaves the outbox untouched and a later retry recovers cleanly. Corrects the prior partial verdict, which had leaned on CAS-conflict/forged-ack tests that direct re-examination found to be validation assertions, not simulated transport failure |
| E-AC-15 | implemented | C | governance-export-adapter-tests: allowlisting/redaction completed before every persistence boundary |
| E-AC-16 | implemented | C | nine named assertions: batching bound, compression, payload bound, rate limit, retry budget, backpressure, flush, restart resume, replay |
| E-AC-17 | implemented | C | governance-export-outbox-tests: duplicate delivery preserves one canonical source history |
| E-AC-18 | implemented | C | governance-export-adapter-tests: destination secrets excluded from every portable export record |
| E-AC-19 | implemented | C | evidence-viewer-tests: export lag and receipts rendered as a separate non-authoritative observation |
| E-AC-20 | not-started | J | NO CARRIER: audit-bundle carries nothing from the export package, and the export modules never reference the bundle |
| E-AC-21 | implemented | WP-DOC | docs/governance-event-export.md (PHX-WP-DOC-2): threat model, data-flow diagram, mapping/loss guide, retention guidance, operator runbook, and incident/recovery procedures all present and grounded; the loss guide names the known loss:[] gap explicitly, the retention section reports no pruning/archival/expiry function exists anywhere in the outbox modules |

### R — External command offer, workaround and recovery audit profile (6/13 implemented)

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
| R-AC-12 | implemented | WP-R-AC12 | external-command-offer-tests (PHX-WP-R-AC12): the motivating Phoenix bootstrap trajectory is now encoded end to end -- a rejected guard-bypass attempt, an attended local repair through the sanctioned non-authoritative channel, an unchanged public-privacy boundary, a verified readback, and digest-only targets that never embed a machine-specific value |
| R-AC-13 | partial | WP-R | external-command-offer-tests (PHX-WP-R): 9 of 11 required fixture classes now named (7 pre-existing + secret/malicious command rejection + governed-script identity); approval-without-run and duplicate/retry are confirmed structurally unreachable, each pinned by a dedicated test showing the gap rather than left silently missing |

### EPIC — Epic integration and release (1/6 implemented)

| ID | verdict | src | evidence / named gap |
|---|---|---|---|
| EPIC-AC-01 | partial | C | the issue-to-criterion mapping exists; no independent closure status exists for any of the eight issues |
| EPIC-AC-02 | not-started | J | NO CARRIER: planParallelSprintIntegration has no concept of "unpublished" and is called only from its own test file |
| EPIC-AC-03 | partial | C | an outstanding deviation is recorded (the bound Spec section 7 inventory omits six implemented modules) and is not yet repaired through the sanctioned route |
| EPIC-AC-04 | partial | C | Full Verify and blocking Security pass only on the last PUSHED candidate (`3387065`), not the integrated one measured here (see the gates table below). An independent high-risk Critic on the integrated candidate is no longer absent -- it ran 2026-08-09 and returned FAIL (5 major, 2 minor); privacy review and explicit PO acceptance remain absent |
| EPIC-AC-05 | constraint | C | a prohibition, and it currently bites -- see the summary count above for the exact figure; deliberately not hardcoded here after an independent Critic FAIL found this line stale against the generated total more than once (F4, 2026-08-09) |
| EPIC-AC-06 | implemented | C | the PRD header records the PO approval binding the first implementation dispatch |

## Per issue

### #5 — Generate a local human-readable Evidence Viewer

5 of 6 live acceptance bullets fully carried; **1 blocked**.

| # | live acceptance bullet | blocking criteria (verdict) |
|---|---|---|
| 1 | Accessibility and mobile/desktop readability | V-AC-06 (partial) |

### #9 — Introduce organization policy packs and signed audit bundles

3 of 11 live acceptance bullets fully carried; **8 blocked**.

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

### #17 — Define a sanitized multi-agent event model and local replay view

5 of 6 live acceptance bullets fully carried; **1 blocked**.

| # | live acceptance bullet | blocking criteria (verdict) |
|---|---|---|
| 1 | Design is driven by user/audit needs, not competitor parity | L-AC-08 (partial) |

### #23 — Define external work-system and knowledge-base traceability adapters

16 of 16 live acceptance bullets fully carried; **0 blocked**.

No blocking criterion. Closeable subject to the epic-level gates (EPIC-AC-01..06).

### #24 — Add policy-governed ITSM change control to release and promotion

9 of 12 live acceptance bullets fully carried; **3 blocked**.

| # | live acceptance bullet | blocking criteria (verdict) |
|---|---|---|
| 1 | Environment selects no control or exactly one effective profile | C-AC-09 (not-started) |
| 2 | Standard/normal/emergency/not-required have distinct behavior | C-AC-02 (partial) |
| 3 | Advisory/mandatory offline and unavailable behavior is explicit | C-AC-12 (partial) |

### #30 — Add a repository-scoped tamper-evident human governance decision ledger

9 of 17 live acceptance bullets fully carried; **8 blocked**.

| # | live acceptance bullet | blocking criteria (verdict) |
|---|---|---|
| 1 | Every human authority transition records a decision first | H-AC-12 (partial) |
| 2 | Full decision lifecycle is reconstructable | H-AC-11 (partial) |
| 3 | Cross-repository writes/consumption are rejected | H-AC-09 (not-started) |
| 4 | Interrupted/concurrent append recovers without silent split authority | K-AC-05 (partial) |
| 5 | Truncation/reorder/change/fork/path/hash failures verify offline | K-AC-05 (partial) |
| 6 | Guard/plan/release/deploy/override paths reference decision IDs | H-AC-12 (partial) |
| 7 | Unverified legacy material cannot satisfy a current gate | H-AC-08 (partial) |
| 8 | #9 bundles verified ledger records/integrity | P-AC-06 (partial) |

### #31 — Add a privacy-preserving agent decision and assumption journal

10 of 17 live acceptance bullets fully carried; **7 blocked**.

| # | live acceptance bullet | blocking criteria (verdict) |
|---|---|---|
| 1 | Closed schema/materiality policy selects journaled events | A-AC-01 (partial) |
| 2 | Changed assumptions invalidate/revalidate affected work | A-AC-03 (not-started) |
| 3 | Runner/model/profile/role/capability carries assurance | A-AC-05 (partial) |
| 4 | Mandatory material events are never sampled/discarded silently | A-AC-07 (not-started) |
| 5 | Offline verification detects mutation/gaps/forks/path/repository errors | K-AC-05 (partial) |
| 6 | #5 shows uncertainty/status/decision with evidence | V-AC-02 (partial) |
| 7 | Complete assumption/selection/failure/privacy fixture set | A-AC-14 (partial) |

### #32 — Add provider-neutral governance event export for SIEM and audit platforms

15 of 20 live acceptance bullets fully carried; **5 blocked**.

| # | live acceptance bullet | blocking criteria (verdict) |
|---|---|---|
| 1 | Free-form rationale is explicit-policy-only and redacted | E-AC-04 (partial) |
| 2 | Cursor/gap/fork/hash/schema/ack failures are typed | E-AC-08 (partial) |
| 3 | Advisory failure preserves canonical operation | E-AC-09 (partial) |
| 4 | Required mode blocks only exact named boundary/range | E-AC-10 (not-started) |
| 5 | #9 bundles sanitized export-policy/delivery metadata | E-AC-20 (not-started) |

## Summary

| issue | bullets | carried | blocked | closeable |
|---|---|---|---|---|
| #5 | 6 | 5 | 1 | **no** |
| #9 | 11 | 3 | 8 | **no** |
| #17 | 6 | 5 | 1 | **no** |
| #23 | 16 | 16 | 0 | yes |
| #24 | 12 | 9 | 3 | **no** |
| #30 | 17 | 9 | 8 | **no** |
| #31 | 17 | 10 | 7 | **no** |
| #32 | 20 | 15 | 5 | **no** |

Issues closeable on their own live acceptance bullets: **1 of 8**.

## The blocking set, ranked

25 distinct criteria block at least one live acceptance bullet.

| criterion | verdict | live bullets blocked |
|---|---|---|
| P-AC-11 | partial | 4 |
| K-AC-05 | partial | 3 |
| P-AC-06 | partial | 3 |
| H-AC-12 | partial | 2 |
| A-AC-01 | partial | 1 |
| A-AC-03 | not-started | 1 |
| A-AC-05 | partial | 1 |
| A-AC-07 | not-started | 1 |
| A-AC-14 | partial | 1 |
| C-AC-02 | partial | 1 |
| C-AC-09 | not-started | 1 |
| C-AC-12 | partial | 1 |
| E-AC-04 | partial | 1 |
| E-AC-08 | partial | 1 |
| E-AC-09 | partial | 1 |
| E-AC-10 | not-started | 1 |
| E-AC-20 | not-started | 1 |
| H-AC-08 | partial | 1 |
| H-AC-09 | not-started | 1 |
| H-AC-11 | partial | 1 |
| L-AC-08 | partial | 1 |
| P-AC-01 | partial | 1 |
| P-AC-03 | partial | 1 |
| V-AC-02 | partial | 1 |
| V-AC-06 | partial | 1 |

## Criteria not mapped to any live issue bullet

53 of 157 criteria are Phoenix's own stricter contract rather than a live issue obligation.
They block no issue, but EPIC-AC-05 still forbids an epic completion claim while any of them is not `implemented`.
24 of those 53 are currently not `implemented` and are listed below; the rest are omitted because they are done.

| criterion | verdict |
|---|---|
| A-AC-08 | not-started |
| A-AC-09 | designed-only |
| A-AC-10 | partial |
| C-AC-07 | partial |
| EPIC-AC-01 | partial |
| EPIC-AC-02 | not-started |
| EPIC-AC-03 | partial |
| EPIC-AC-04 | partial |
| EPIC-AC-05 | constraint |
| L-AC-01 | partial |
| L-AC-02 | partial |
| P-AC-08 | partial |
| P-AC-09 | not-started |
| PX0-AC-03 | partial |
| PX0-AC-05 | not-started |
| PX0-AC-06 | not-started |
| PX0-AC-13 | partial |
| R-AC-02 | not-started |
| R-AC-04 | partial |
| R-AC-08 | partial |
| R-AC-09 | partial |
| R-AC-10 | partial |
| R-AC-11 | partial |
| R-AC-13 | partial |

## The epic gates, one by one

EPIC-AC-04 names seven gates for a completion claim. Their current state, so that the remaining
work is not mistaken for paperwork:

| gate | state | evidence |
|---|---|---|
| Focused package checks | **partial** | per-package suites are green; the signed TP-3+TP-5 window was used and the reconcile suite is now gate-registered (444/444), but an independent Critic FAIL (2026-08-09, F3) found no shipped entry point ever supplies the required approval resolver -- the command is built and tested but structurally unreachable by any real caller |
| Full Verify | **not verifiable for the integrated candidate** | `evidence/verify-latest.json` binds `3387065`, an ancestor of the whole reviewed range -- an independent Critic (2026-08-09, F5) found no full-gate Verify run is bound to the current candidate; per-suite reruns are not a substitute |
| Blocking Security | **passed (as of `3387065`, not re-run against the integrated candidate)** | `pipeline.security-verdict.v2` — `blocking: false`, `cap.sast` pass, `cap.secrets` pass |
| Privacy review | **absent** | no privacy-review artifact exists for the integrated candidate |
| Independent high-risk Critic | **FAIL, 2026-08-09** | one full-range Critic dispatch reviewed all 57 commits from the epic-wide measurement through this correction; verdict FAIL, 5 major + 2 minor findings; F1/F3/F4/F5 addressed in this same correction, F2/F6 filed as disclosed defects (see backlog) |
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

