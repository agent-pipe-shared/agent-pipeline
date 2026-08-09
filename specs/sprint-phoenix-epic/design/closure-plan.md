# Sprint Phoenix — closure design

Status: design

Date: 2026-08-09

Parent specification: [../spec.md](../spec.md) · Measurement: [../evidence/acceptance-evidence-map-20260809.md](../evidence/acceptance-evidence-map-20260809.md)

## What this design is for

The measurement established that 70 of 157 acceptance criteria are not
`implemented` and that no issue is closeable. It did not say how any of them closes. This
document does, and it is generated from the same verdict data as the measurement, so the two
cannot drift apart.

The central design claim is that the remainder is **not one backlog**. It is five populations
with different costs, different owners, and different blocking properties, and treating them as
one list is what has made the epic look larger and more uniform than it is.

| class | criteria | what closing one actually costs |
|---|---|---|
| A — assertion missing | 11 | one named test case in an already-registered, unprotected suite |
| D — documentation missing | 7 | one document section set; no code, no gate |
| S — seam missing | 6 | a connector between two packages that already work |
| B — capability missing | 41 | real implementation plus its tests |
| P — not code | 5 | a human gate, a sanctioned authority revision, or a proved impossibility |
| **total** | **70** | |

**The distribution is the finding.** The largest class by a wide margin is Class A: criteria
whose behaviour is built, shipped and green, and which fail only because no assertion names the
clause the criterion actually states. That is not implementation debt. It is the direct
consequence of the Spec's own bar — `spec.md:673` demands that *every* criterion map to a named
test, not that its theme be covered — and it means a large fraction of the epic closes through
test authorship in files that no maintenance window protects.

## The gating slice — built, one gate left

P-AC-08 is the one criterion whose position in the sequence is fixed by the acceptance matrix
itself: it declares the feature-package writer the mandatory first slice of PHX-0, and forbids
PHX-0's ruleset-trust-root slice and PHX-1 from starting until it passes. Everything below was
sequenced behind it for that reason and no other. It no longer is: the design below is built,
and this section is now a record of what shipped rather than a proposal.

**What was already there.** `feature-package-inspect|status|plan|apply|recover` were built,
registered and green before this pass. `apply` carried two plan kinds — `bootstrap` for an
absent manifest and `transition` for a state change — each with a recomputed-preview digest
check that fails closed on manifest, proposal or target-state drift, a MAC-authenticated
recovery journal, and a readback before the journal is retired.

**What this pass built (`PHX-WP-GATE`, commit 92b21ed).** The criterion additionally requires
reconciling an inherited `draft` manifest's stale PRD, Spec, acceptance, architecture and Result
digests — through an existing-manifest preview, an exact PO-bound apply and a readback, **with
no lifecycle-state, artifact-set, candidate or other authority-byte change**. Neither existing
plan kind could express that: `transition` exists to change state, which this operation must
not do, and `bootstrap` applies only when the manifest is absent. `planFeaturePackageReconcile`
now exists in `lib/feature-package-topology.mjs`, and `feature-package-reconcile` now exists as
an apply mode in `pipeline-state.mjs`.

### As built: the third plan kind, `reconcile`

The reconciliation is a **digest-only** transaction, and the no-drift property is structural
rather than a promise the implementation is trusted to keep:

1. **Preview.** `planFeaturePackageReconcile(root, manifestPath, resultAuthority)` recomputes
   each declared artifact digest from the bytes on disk and returns the preimage manifest, the
   postimage manifest, and the per-artifact old/new digest pairs, in the same plan-object shape
   the other two kinds return — so `--plan-sha256` binding is inherited, not reimplemented. The
   third parameter is one deviation from the original design sketch, added because the Result
   fence (below) has to be checked on the plan itself and needs Continuity State's binding to do
   it — reported by the dispatch rather than built in silently.
2. **The no-drift invariant is checked on the plan, not on intent** (`reconcileNoDriftOk`,
   exported). The postimage is rejected unless it is byte-identical to the preimage after the
   digest fields alone are substituted: same lifecycle state, same artifact set and order, same
   candidate, same schema, same every other byte. Four staged cases (`RGb`..`RGb4`) each change
   one more field — state, candidate, artifact order — and each is refused.
3. **Apply is PO-bound.** It consumes the same critical-action proof shape the other
   authority-changing writers use, bound to the exact candidate and to the plan digest. Cases
   `RGe` prove zero mutation on both the no-approval-function and the rejected-approval path.
4. **Manual digest replacement is refused** (case `RGf`) — the exact workaround P-AC-08 names
   and forbids as a substitute for the transaction.
5. **Readback.** The written manifest is re-read and re-validated through
   `validateFeaturePackage` before the journal is retired (case `RGc`, DoD 7) — the existing
   apply path already did this and the reconcile path reuses it rather than adding a second one.

### As built: the Result fence

The criterion admits a Result reconciliation only under two conditions and refuses a
metadata-only refresh outright. All three are plan preconditions (`checkResultReconciliationFence`),
so a refused case never reaches a writer, and each carries its own typed code so evidence can
tell the refusals apart (cases `RGg1`..`RGg4`):

- **`reconcile-result-unbound`** — the current Result is not the one Continuity State binds. A
  Result the State does not name cannot be reconciled, whatever its digest says.
- **`reconcile-result-metadata-only`** — no canonical fence marker is present at all: refused by
  name, distinguishably from a drift refusal, exactly as the criterion requires.
- **`reconcile-result-fence-mismatch`** — a fence marker is present but the preserved prefix does
  not hash to the stale manifest digest: a Result that was rewritten, not one that legitimately
  grew.
- The positive case (`RGg4`) admits only when the prefix genuinely hashes to the stale digest
  **and** the Result is Continuity-bound — both conditions, not either.

**One thing this design deliberately does not repair.** The reconciliation the criterion was
written for was already performed by hand in `ece6041`, by the exact route P-AC-08 forbids. The
capability is still required and was still built; its original subject is gone, and the audit
trail for that specific repair will never exist. The PO accepted that as a recorded deviation.
Building the transaction was therefore about the next reconciliation, not that one.

### Where P-AC-08 still meets a hard boundary

The implementation lives in `plugins/pipeline-core/scripts/pipeline-state.mjs` and
`lib/feature-package-topology.mjs`, both unprotected, and both are now committed. **Its tests
are not landed yet, and they cannot be without a human act.** The 26 cases proving the above are
staged in `evidence/phx-wp-gate-cases.mjs` — re-run independently rather than accepted from the
dispatch report: **26/26 pass**. Registering them touches
`harness/scripts/pipeline-state.test.mjs` (TP-5-protected) and, to add the suite entry,
`harness/scripts/verify.mjs` (TP-3-protected). The protected suite itself was re-run
independently to confirm no regression from the new code: **418/418, unmodified**.

Both protected files are liftable in **one** signed maintenance window
(`--scope TP-3,TP-5`), whose TTL is four hours — the established pattern this design already
named, now with the implementation and the staged cases both sitting ready behind it. The window
is the PO's act and is the one hard gate P-AC-08 has left.

## The parallel partition

Spec §4.6 admits parallel work only where file ownership does not overlap. The partition below
is by module family, which makes the disjointness checkable rather than asserted:

| work package | open criteria | owns |
|---|---|---|
| WP-K | 2 | plugins/pipeline-core/lib/governance-event-store.test.mjs, plugins/pipeline-core/lib/governance-event.test.mjs |
| WP-P | 5 | plugins/pipeline-core/lib/audit-bundle*.mjs, plugins/pipeline-core/lib/organization-policy*.mjs |
| WP-V | 2 | plugins/pipeline-core/lib/evidence-view-model*.mjs, plugins/pipeline-core/lib/evidence-view-renderer*.mjs |
| WP-X | 2 | plugins/pipeline-core/lib/external-reference-adapter*.mjs |
| WP-C | 4 | plugins/pipeline-core/lib/change-control*.mjs |
| WP-E | 9 | plugins/pipeline-core/lib/governance-export-*.mjs |
| WP-A | 11 | plugins/pipeline-core/lib/agent-decision-journal*.mjs, governance/schemas/agent-decision-event.schema.json |
| WP-L | 3 | plugins/pipeline-core/lib/lifecycle-governance-events*.mjs, plugins/pipeline-core/lib/governance-replay*.mjs |
| WP-H | 3 | plugins/pipeline-core/lib/human-governance-ledger*.mjs, plugins/pipeline-core/lib/governance-authority-resolver*.mjs, plugins/pipeline-core/lib/external-push-ledger*.mjs |
| WP-R | 8 | plugins/pipeline-core/lib/external-command-offer*.mjs |
| WP-PX0 | 8 | plugins/pipeline-core/lib/ruleset-source*.mjs, plugins/pipeline-core/scripts/ruleset-freshness-host.mjs, plugins/pipeline-core/lib/continuity-state.mjs |
| WP-EPIC | 1 | plugins/pipeline-core/lib/parallel-sprint-integration*.mjs |
| WP-DOC | 7 | docs/*.md (one section set per package) |
| WP-PO | 5 | none - human gates and recorded deviations |

Concurrency is bounded at **2**, not by preference but by the recorded capacity: the continuity
block reserves one Critic slot and one recovery slot out of four, and the project calibration
sets `wipLimit: 3`. Two is the tighter of the two and therefore the one that governs.

## Sequence

1. **WP-GATE** alone, because P-AC-08 forbids the rest of PHX-0 and PHX-1 from starting. Its
   window is the first PO gate.
2. **Class A and Class D packages in pairs**, highest blocked-bullet yield first. These need no
   window and no gate: the suites are registered and unprotected, and the documents are ordinary
   files. This is where most of the remaining count moves.
3. **Class S**, the five seams. Each is a connector between two working packages and each needs
   a design decision about which side owns the reference — deliberately sequenced after Class A
   so the packages being connected are fully pinned first.
4. **Class B**, the absent capabilities, ordered by whether anything else waits on them.
   `L-AC-01` leads: no Pipeline path emits a lifecycle event at all, which is the single
   structural gap behind the epic's "libraries built, integration left" shape.
5. **Class P** last, because most of it only becomes answerable once the rest is done.

## Exit criteria

This design is finished when every Class A, D, S and B row above is `implemented` under the
unchanged measurement definition — a named assertion in a gate-registered suite — and the
measurement is regenerated to prove it. It cannot close Class P, and it does not try:
EPIC-AC-04 needs a privacy review, an integrated-candidate Critic and the PO's acceptance;
EPIC-AC-03 needs the sanctioned authority revision that only just became executable; and
H-AC-11's GMW half is a proved impossibility that closes by amendment or not at all.

## Per criterion

### Class A — the behaviour exists, the assertion does not (11)

| ID | verdict | package | what closes it |
|---|---|---|---|
| A-AC-12 | partial | WP-A | agent-decision-journal-tests (PHX-WP-A): downstream export/projection policy (governance-event-projection.mjs) is independently configurable from capture eligibility and structurally cannot weaken it; the restricted-machine-local boundary mapping, "sole read boundary" language, and a literal human-ledger side-by-side remain unaddressed |
| A-AC-13 | partial | WP-A | agent-decision-journal-tests (PHX-WP-A): the duplicate-submission clause is pinned -- exact duplicate is a deterministic idempotent-replay no-write, conflicting duplicate fails closed (GES-IDEMPOTENCY-CONFLICT); concurrent/interrupted/out-of-order for agent-kind events remain covered only by the store's generic tests, not newly pinned |
| A-AC-14 | partial | WP-A | 5 of 13 named conformance scenarios have thin/generic (non-dedicated) coverage, 8 have zero coverage; "decomposition" is not representable in the current `kind` enum at all (PHX-WP-A, not padded) |
| E-AC-06 | partial | WP-E | governance-export-delivery-tests (PHX-WP-E, break-proofed): stable idempotency (pre-existing) and at-least-once redelivery (new) are pinned; the explicit "SHALL NOT claim exactly-once" structural assertion was dropped for tool-budget reasons -- not confirmed absent by search, just not written this pass |
| E-AC-14 | partial | WP-E | in-memory, local-file, OTLP-profile and syslog fixtures are each individually cited (PHX-WP-E); dedicated failure-injection coverage was judged sufficient by indirect citation (CAS-conflict, forged-ack tests) rather than confirmed absent by search -- no new test added, budget-limited not capability-limited |
| PX0-AC-01 | partial | WP-PX0 | continuity-state.mjs binds dispatch/intent to prdSha256/specSha256; no assertion names a REJECTED generic CAS authority change. GATE: the carrier suite is harness/scripts/pipeline-state.test.mjs (TP-5) -- closing this needs a signed TP-5 maintenance window, the same class of act P-AC-08 needed, not an ordinary dispatch |
| PX0-AC-03 | partial | WP-PX0 | apply exists and rechecks under the writer lock; the recheck breadth the criterion enumerates is not fully pinned. GATE: carrier is harness/scripts/pipeline-state.test.mjs (TP-5), same as PX0-AC-01 |
| PX0-AC-04 | partial | WP-PX0 | proof half fails closed and is pinned; the State-side preimage/revision/idempotency recheck is only partly asserted. GATE: carrier is harness/scripts/pipeline-state.test.mjs (TP-5), same as PX0-AC-01 |
| PX0-AC-05 | partial | WP-PX0 | continuity-authority-revision-receipt.v1 now has an emitter; durable retention of the receipt is not pinned. GATE: carrier is harness/scripts/pipeline-state.test.mjs (TP-5), same as PX0-AC-01 |
| PX0-AC-06 | partial | WP-PX0 | recover replays frozen journal bytes only; the recovered-preimage outcome class is not pinned. GATE: carrier is harness/scripts/pipeline-state.test.mjs (TP-5), same as PX0-AC-01 |
| PX0-AC-07 | partial | WP-PX0 | zero-write replay implemented; the conflicting-replay/second-writer half is not pinned. GATE: carrier is harness/scripts/pipeline-state.test.mjs (TP-5), same as PX0-AC-01 |

### Class D — the gap is a documentation section the criterion enumerates (7)

| ID | verdict | package | what closes it |
|---|---|---|---|
| A-AC-15 | partial | WP-DOC | agent-decision-journal.md carries one section; no taxonomy, materiality policy, trust model, retention or recovery doc |
| C-AC-13 | partial | WP-DOC | change-control.md is a stub; no threat model, precedence, migration, runbook or rollback procedure |
| E-AC-21 | partial | WP-DOC | governance-event-export.md carries two sections; no data-flow diagram, mapping/loss guide, retention guidance, runbook or incident procedure |
| H-AC-14 | partial | WP-DOC | governance-events.md + po-human-approval.md + threat model exist; no migration, retention or recovery section for the ledger package |
| L-AC-08 | partial | WP-DOC | no artifact traces each retained element to a stated user or audit need |
| P-AC-13 | partial | WP-DOC | organization-policy-packs.md and audit-bundles.md are stubs; no migration/versioning policy, no pack threat model |
| X-AC-15 | partial | WP-DOC | external-traceability.md carries three sections; no threat model, publication guide or recovery procedure |

### Class S — two implemented packages, mutually unaware (6)

| ID | verdict | package | what closes it |
|---|---|---|---|
| A-AC-04 | partial | WP-A | self-confirmation is prevented; no correlation path to the human ledger is implemented |
| A-AC-05 | not-started | WP-A | NO CARRIER: neither event shape carries a runner/model/effort/profile/role/adapter field at all |
| E-AC-20 | not-started | WP-E | NO CARRIER: audit-bundle carries nothing from the export package, and the export modules never reference the bundle |
| H-AC-08 | not-started | WP-H | NO CARRIER: no path imports a legacy approval/override/deploy record as an unverified observation |
| H-AC-09 | not-started | WP-H | NO CARRIER: external-push-ledger is scoped to single-repo push proofs; nothing binds cross-repository guarded work to one physical target |
| X-AC-11 | not-started | WP-X | NO CARRIER: the adapter never references organization policy, and the policy modules never reference the adapter |

### Class B — an absent capability (41)

| ID | verdict | package | what closes it |
|---|---|---|---|
| A-AC-01 | partial | WP-A | record shape pinned; nothing enforces recording BEFORE dependent action where policy requires |
| A-AC-03 | not-started | WP-A | NO CARRIER: no revalidation/invalidation path identifies objects affected by a changed assumption |
| A-AC-07 | not-started | WP-A | CONFIRMED ABSENT (PHX-WP-A, repo-wide search): no per-event-class "mandatory" capture concept exists anywhere in the journal, the shared store, or capture-policy.json -- five of the seven named event classes are not even representable as a journal `kind` |
| A-AC-08 | not-started | WP-A | NO CARRIER: no detector for missing dispatch provenance; the Dispatch: trailer is convention only |
| A-AC-09 | designed-only | WP-A | materiality is documented as design intent only; no code enforces or measures it |
| A-AC-10 | partial | WP-A | the offer path fails closed on unavailable journaling; no per-event-class fail-open/fail-closed policy exists |
| C-AC-02 | partial | WP-C | change-control-tests (PHX-WP-C, break-proofed): "standard" is pinned as a distinct changeClass paired with mandatory authority, alongside emergency and not-required; the required-field-level distinction between standard and normal, and any anti-class-shopping check, remain absent -- validateChangeControlProfile requires the identical fixed key set for every class |
| C-AC-07 | partial | WP-C | change-control-tests (PHX-WP-C, break-proofed): explicit emergency authority and bounded-scope rejection of a scope mismatch are pinned; retrospective evidence proving the emergency was real or reviewed is not -- the journal binding does not even carry changeClass, so nothing is gated on it |
| C-AC-09 | not-started | WP-C | CONFIRMED ABSENT (PHX-WP-C, repo-wide search): no resolver over multiple candidate change-control profiles exists anywhere in this module or its CLI -- there is no data shape representing "release configuration for an environment" as a set of candidates, so nothing exists to test |
| C-AC-12 | partial | WP-C | change-control-tests (PHX-WP-C, break-proofed): unavailable external state blocks via C-AC-04, and the distinct "external-unavailable" gate reason is now pinned by name; the explicit advisory-vs-mandatory policy distinction remains absent -- mandatory:false is only representable together with changeClass:"not-required", which short-circuits before ITSM availability is ever inspected |
| E-AC-02 | partial | WP-E | CONFIRMED ABSENT (PHX-WP-E): deterministic mapping is pinned (pre-existing); mapGovernanceExportProjection always returns loss:freeze([]) even though rfc5424() drops eventId/correlation/candidate/repositoryFingerprint/eventDigest/policyDigest -- governance-export-adapter.mjs:85,98, no lossy conversion is ever declared |
| E-AC-04 | partial | WP-E | governance-export-adapter-tests (PHX-WP-E, break-proofed): default omission of rationale/summary is pinned; CONFIRMED ABSENT: the "policy allows and redacts" path -- EXPORT_FIELDS is a closed, non-configurable constant (adapter.mjs:15), no policy can ever admit the field |
| E-AC-08 | partial | WP-E | governance-export-outbox-tests (PHX-WP-E, break-proofed): 4 of 8 detections pinned (destination-mismatch/forged-ack pre-existing, event-gap/schema-downgrade new); CONFIRMED ABSENT: cursor rollback, outbox truncation, source fork, invalid hash -- no bound on cursor vs entries.length or hash-chain check anywhere in outbox.mjs:6-11 |
| E-AC-09 | partial | WP-E | governance-export-delivery-tests (PHX-WP-E, break-proofed): lag exposed on a failed acknowledgement is pinned; CONFIRMED ABSENT: the "advisory destination" concept itself -- no such distinction exists anywhere in scope, so "canonical governance continues under an unavailable advisory destination" is not representable |
| E-AC-10 | not-started | WP-E | NO CARRIER: no named lifecycle boundary blocks only the exact unacknowledged source range |
| E-AC-11 | partial | WP-E | governance-export-delivery-tests (PHX-WP-E, break-proofed): the closed 9-field receipt schema is pinned, rejecting any retention/immutability/analyst-review/compliance-implying extension; CONFIRMED ABSENT: a per-projection/mapping digest field -- only policyRevision exists (governance-event-projection.mjs:22-24) |
| EPIC-AC-02 | not-started | WP-EPIC | NO CARRIER: planParallelSprintIntegration has no concept of "unpublished" and is called only from its own test file |
| H-AC-12 | partial | WP-H | guard-push/guard-devplan/change-control validate the decision reference; the DUAL-EVALUATION during migration with shared owner and expiry has no carrier |
| K-AC-05 | partial | WP-K | governance-event-store-tests: fork detection now proven to also block append and recovery, not only verify/query (PHX-WP-K, break-proofed). Still absent: no disposition operation exists anywhere in the module -- "governed disposition appended through the sanctioned recovery operation" has no code to test against |
| K-AC-10 | not-started | WP-K | NO CARRIER, confirmed by repo-wide search (PHX-WP-K): queryPortableGovernanceStream, the governance-event CLI and governance-replay.mjs all accept exactly one streamId; no function anywhere queries more than one stream, so per-record provenance preservation across streams has no code to test |
| L-AC-01 | partial | WP-L | the closed lifecycle schema and validator are pinned; NO PRODUCER exists — no Pipeline path emits a lifecycle event |
| L-AC-02 | partial | WP-L | six of the eight #10 exchange identities are retained; queueRevision and a distinct correlationId are absent |
| L-AC-04 | partial | WP-L | semantic classes pinned; the VISUAL class remains confirmed absent (PHX-WP-L): the renderer has no origin field to key a visual marker off and gives every event kind the same CSS class -- a renderer change, not a missing test |
| P-AC-01 | partial | WP-P | CONFIRMED ABSENT (PHX-WP-P): schema/compatibility/merge pinned; provenance, dependency and signature-policy validation have no corresponding field anywhere in the pack schema, no test was written around the gap |
| P-AC-03 | partial | WP-P | CONFIRMED ABSENT (PHX-WP-P): planOrganizationPolicyActivation pinned; newly-required artifacts, external effects and backfill range have no corresponding field anywhere in the activation-plan schema, no test was written around the gap |
| P-AC-06 | partial | WP-P | audit-bundle-core-tests: missing, misplaced, illegally-mutable, stale and truncated each pinned (PHX-WP-P, break-proofed). legacy and orphaned remain unpinned: the legacy classification exists (feature-package-topology.mjs:78) but no rejection path consults it, and no code checks a package file is referenced by an artifact |
| P-AC-09 | not-started | WP-P | NO CARRIER: no export-backfill preview or explicit consent path exists |
| P-AC-11 | partial | WP-P | organization-policy-core-tests: mode (closed reference-only/projection/controlled-publication set) and approval (union, no downgrade) pinned (PHX-WP-P, break-proofed). Target class/binding, owned fields/sections, lifecycle event, preview, retention and revision readback remain unpinned: documentClasses is closed to exactly class/mode/approvalRequired, no field exists for the rest |
| PX0-AC-08 | partial | WP-PX0 | ruleset-source.mjs closed contract pinned by ruleset-source-tests; whether bootstrap actually EMITS one observation is unpinned |
| PX0-AC-13 | partial | WP-PX0 | ruleset-freshness-host.mjs selects the host transport correctly, but no suite exercises it and bootstrap does not wire it |
| R-AC-02 | not-started | WP-R | CONFIRMED ABSENT (PHX-WP-R): recovery-proposed/recovered states exist in the schema but are unreachable through any exported function -- no capability correlates a rejected path, alternatives, or selected recovery to the offer |
| R-AC-04 | partial | WP-R | external-command-offer-tests (PHX-WP-R): operation class, target, exact pre/post digests, and recoverability are bound and validated together; a distinct "required cleanup/readback" field beyond the recoverability enum does not exist |
| R-AC-08 | partial | WP-R | external-command-offer-tests (PHX-WP-R): a readback lifecycle event appends exactly once and never rewrites the original offer; rollback/cleanup as *occurred* events are absent -- no such state exists at all, only prospective values inside recoverability |
| R-AC-09 | partial | WP-R | external-command-offer-tests (PHX-WP-R): missing offer link, contradictory outcome evidence, and cross-repository/cross-scope substitution all fail closed (never successful); stale and duplicate detection remain absent -- no timestamp field, no supersession semantics for command-offer events |
| R-AC-10 | partial | WP-R | fail-closed on the append is pinned; the policy-defined typed non-material exception is absent |
| R-AC-11 | partial | WP-R | external-command-offer-tests (PHX-WP-R): a mandatory public-safe typed omission is pinned; "sanctioned machine-local state" storage and a distinct "commitment" field are absent from this module (it stores nothing by design; commitment only exists in the unrelated document-lifecycle.mjs) |
| R-AC-12 | not-started | WP-R | NO CARRIER: no Phoenix bootstrap-trajectory fixture exists |
| R-AC-13 | partial | WP-R | external-command-offer-tests (PHX-WP-R): 9 of 11 required fixture classes now named (7 pre-existing + secret/malicious command rejection + governed-script identity); approval-without-run and duplicate/retry are confirmed structurally unreachable, each pinned by a dedicated test showing the gap rather than left silently missing |
| V-AC-02 | partial | WP-V | evidence-view-renderer-tests: fact, unknown, unavailable, redacted, invalid and not-applicable each labelled visibly, six of nine (PHX-WP-V, break-proofed). estimate, assumption and human decision remain unpinned: zero occurrences anywhere in the view-model, renderer or CLI modules -- no field carries them at all |
| V-AC-06 | partial | WP-V | evidence-view-renderer-tests: exact CSP directive value, skip-link keyboard focus target, and landmark/table accessibility structure all pinned (PHX-WP-V, break-proofed). Mobile/desktop snapshot checks remain absent: a viewport meta tag and one CSS breakpoint exist but no test or tooling captures a deterministic snapshot of either, and this repo has no headless-render/visual-regression infrastructure at all |
| X-AC-14 | partial | WP-X | confirmed absent (PHX-WP-X): neither inspect() call site (external-reference-adapter.mjs:61,72) has a try/catch, so an unreachable external system throws uncaught instead of producing a typed observation -- filed as pipeline.external-reference-adapter-has-no-typed-response-to-an-unreachable-external-system, a production fix not a missing test |

### Class P — not closeable by writing code (5)

| ID | verdict | package | what closes it |
|---|---|---|---|
| EPIC-AC-01 | partial | WP-PO | the issue-to-criterion mapping exists; no independent closure status exists for any of the eight issues |
| EPIC-AC-03 | partial | WP-PO | an outstanding deviation is recorded (the bound Spec section 7 inventory omits six implemented modules) and is not yet repaired through the sanctioned route |
| EPIC-AC-04 | partial | WP-PO | Full Verify and blocking Security pass on the pushed candidate; privacy review, an independent high-risk Critic on the integrated candidate, and explicit PO acceptance are absent |
| EPIC-AC-05 | constraint | WP-PO | a prohibition, and it currently bites: 79 criteria are not implemented |
| H-AC-11 | partial | WP-PO | portable reconstruction surface pinned; the no-join-handle clause is proved UNSATISFIABLE for the GMW half (acceptance.md amendment, tracked as O-4) |

