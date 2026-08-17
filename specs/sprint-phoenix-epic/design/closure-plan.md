# Sprint Phoenix — closure design

Status: design

Date: 2026-08-09 (class table and per-criterion rows CORRECTED 2026-08-17 — see note below)

Parent specification: [../spec.md](../spec.md) · Measurement: [../evidence/acceptance-evidence-map-20260817f.md](../evidence/acceptance-evidence-map-20260817f.md)

**CORRECTION, 2026-08-17.** This document's original "48 of 157" claim (below) had gone stale:
between 2026-08-09 and 2026-08-16, real work landed on 22 of those 48 rows — 20 flipped to
`implemented` and never got reflected back here, and 2 more (K-AC-05, and one further criterion
found while re-verifying) were also already closed. Verified two ways before correcting: (1) the
acceptance-evidence-map.mjs generator's own live `VERDICTS` table already had the correct,
current value for most of them — running the generator fresh (`node
specs/sprint-phoenix-epic/evidence/acceptance-evidence-map.mjs`) was sufficient; (2) five parallel
re-verification passes independently re-checked every one of the original 48 rows directly
against current code/tests (not against this document's prose), confirming the generator's live
state and additionally catching one the generator itself had missed (E-AC-08, closed by commit
`8956d770` the same night, verified independently by re-running its test file: 7/7 pass). The
class table and per-criterion tables below are corrected to match. **Current authoritative
snapshot:** [`../evidence/acceptance-evidence-map-20260817f.md`](../evidence/acceptance-evidence-map-20260817f.md).

**UPDATE, same day (PHX-WP-POAMEND, commit `e9054995`).** Four PO-decided amendments landed in
one docs-only commit: A-AC-14 (accept 12/13, closing it — moved out of Class P entirely, verdict
now `implemented`), H-AC-11 (O-4 scoping decided, stays open — the restricted-profile intake path
is still unbuilt), H-AC-12 (release-planning/deploy-consumption closure now formally landed, 2 of
6 readers, stays open), PX0-AC-13 (clause 1's disposition upgraded to structurally unreachable
in-process, stays open — the upgrade settles the disposition, not the exit). Every claim
independently re-verified against current source before accepting (see
`../evidence/acceptance-evidence-map.mjs`'s A-AC-14/H-AC-11/H-AC-12/PX0-AC-13 pointer text). Open
count: **25 of 157** (was 26; only A-AC-14 flipped verdict). Class P: **11** (was 12).

**UPDATE, same day (PHX-WP-LAC08, commits `20014aab`/`b4f059f9`).** The `cancellation`
lifecycle-event kind — genuinely undistinguishable from `status: "cancelled"`, per L-AC-08's own
text — is removed from both hand-duplicated `KINDS` sets and the renderer's classification
map, not merely re-documented. L-AC-08 closes: `implemented`. acceptance.md's L-AC-01 amended
append-only to record the encoding change; L-AC-01 itself stays `partial` (1 of 9 named triggers
has a real producer). One residual duplicate found and left out of scope, filed as its own
backlog item: `governance/schemas/lifecycle-governance-event.schema.json:11` still enumerates
`cancellation` in a third hand-duplicated copy of the same kind vocabulary — nothing reads it
today. 20/20 affected tests pass, independently re-run. Open count: **24 of 157** (was 25).
Class P: **10** (was 11).

**UPDATE, same day (Elephant, measurement correction, no code change).** R-AC-13 re-read against
the actual test titles in `external-command-offer.test.mjs` (36/36 pass, independently re-run):
all 11 required fixture classes are named, not 9 — the prior count excluded
`approval-without-run` and `duplicate/retry` because their fixtures pin delegated/unreachable
behavior rather than a positive success path, but R-AC-13's own text requires providing a
fixture, not preventing the scenario, and both fixtures exist (`external-command-offer.test.mjs:168,175`).
**R-AC-13 closes: `implemented`.** Moves out of Class B entirely (13 remain, was 14). Open count:
**23 of 157** (was 24).

**UPDATE, same day (Elephant, landing a PO decision recorded 2026-08-11).** P-AC-06's two open
trigger words closed the same way R-AC-13 did — by proof, not new code.
`design/p-ac-06-clause-disposition-proposal.md` already investigated both, the PO already decided
(2026-08-11: strike/treat-as-satisfied), and the exact amendment text was drafted and ready; it
was never landed because staging it exposed the SAME `FTP-ARTIFACT-2` acceptance.md-digest
blocker this session already accepted twice tonight (POAMEND, LAC08) — not a new one. Landed
append-only (matching this session's stricter convention rather than the proposal's own
edit-the-enumeration draft): "legacy" is proved structurally unreachable as an input to this
criterion's validator (`packageRelative` confines every path; a package only reaches validation
with a manifest present, which excludes it from the legacy classification by definition);
"orphaned" has no structural predicate the manifest schema can enforce (curatorial, not a file
property — re-verified live: `specs/sprint-nova-epic/lifecycle.json` lists 10 `nova-b` paths, 0
`nova-a` paths, both directories real). **P-AC-06 closes: `implemented`.** Moves out of Class B
entirely (12 remain, was 13). Open count: **22 of 157** (was 23).

**UPDATE, 2026-08-17 (PHX-WP-HAC08 investigation-only dispatch, NO CARRIER — no code change, no
commit).** Dispatched to find a real legacy-record source or rule one out. It found a real source
(`project/guard-override.log.jsonl`, git-tracked, 5 pre-Phoenix override records) but correctly
did not build a producer: that file is the guard's live token-consumption ledger, not a dormant
record awaiting migration, and the one real legacy-import activity in this repo
(`migrate-backlog-state.mjs`) is permanently closed and semantically refuses the records H-AC-08
would import. `design/agent-decision-journal-production-producer.md` sec.5 already rules building
a producer here the same anti-pattern reverted once before (`cc43a182`) and names this a PO
amendment decision, deliberately not taken by a dispatch — the same shape as H-AC-09's own
reclassification. **H-AC-08 reclassified Class B → Class P** (stays `partial`, no verdict
change). Class B: **11** (was 12). Class P: **11** (was 10). Open count unchanged: **22 of 157**.

**UPDATE, 2026-08-17 (PHX-WP-AAC10, commit `8800f8d4`, independently re-verified).** A-AC-10's
missing per-event-class fail-open/fail-closed policy is built: `JOURNALING_UNAVAILABLE_DISPOSITIONS`
(`agent-decision-journal.mjs`) is a closed table, total over all 7 `EVENT_CLASSES`, checked
complete at import; `resolveJournalingUnavailability()` exposes a typed, observable
`pipeline.agent-journaling-gap.v1` gap record on both directions. R-AC-10's existing exception
path (`acknowledgeNonMaterialOfferWithoutJournal`) confirmed byte-for-byte unchanged (zero-context
diff against the pre-commit version); the new path's fail-open set is a proven strict subset.
`agent-decision-journal-tests` 49/49, `external-command-offer-tests` 39/39, both independently
re-run at the exact commit. **A-AC-10 closes: `implemented`.** Moves out of Class B entirely (10
remain, was 11). Open count: **21 of 157** (was 22).

**UPDATE, 2026-08-17 (PHX-WP-PAC09, commit `6b9a656e`, independently re-verified).** P-AC-09's two
remaining gaps (preview already covered by P-AC-03) are built. `activateOrganizationPolicy` now
requires a distinct `backfillGranted`/`backfillDecisionId`/`backfillSubjectSha256` consent,
digest-bound to the plan's own preview window, refused by name (`OPA-BACKFILL-CONSENT`) when a
backfill-implying activation supplies only the ordinary activation grant — proven with a refusal
test that re-confirms the prior policy stays active. New module
`organization-policy-backfill-export.mjs` exports a consented `backfillRange` by reusing (not
duplicating) the real pipeline — `queryPortableGovernanceStream` → `projectGovernanceEvent` →
`enqueueGovernanceExport` → `deliverGovernanceExportBatch` — proven end-to-end with real appended
events and a real delivered disposition. 80/80 across the full affected regression set,
independently re-run at the exact commit. **P-AC-09 closes: `implemented`.** Moves out of Class B
entirely (9 remain, was 10). Open count: **20 of 157** (was 21).

**UPDATE, 2026-08-17 (PO amendment, `acceptance.md`, both append-only, no code change).** H-AC-08
and H-AC-09 both close, satisfied by construction rather than a live path. H-AC-08: its
WHEN-antecedent (a legacy record import) has no live trigger anywhere in this repo (confirmed
twice, 2026-08-09 and 2026-08-17), and the one representable shape a future import could ever take
(`legacy-import-observation`) is non-authoritative by construction, so the guarantee holds
regardless of whether the antecedent ever fires. H-AC-09: its WHEN-antecedent (cross-repository
guarded work being authorized) cannot fire under CLAUDE.md's Sprint-0 hard rule — confirmed no
Phase-4 migration roadmap exists anywhere in this repo — so it is vacuously and permanently
satisfied under current policy, reopening only if a future Phase-4 migration authorizes such work.
**Both close: `implemented`.** Move out of Class P entirely (9 remain, was 11). Open count:
**18 of 157** (was 20).

**UPDATE, 2026-08-17 (PHX-WP-VAC02/EPICAC02/RAC09, commits `8325f2d0`/`77d2d8d5`/`5c05a117`,
independently re-verified).** Three more Class-B dispatches land. V-AC-02: `assumption` genuinely
labelled (governance-export delivery observation was mislabelled `fact` with no digest binding);
`estimate` confirmed absent-by-design, stays partial (8/9). EPIC-AC-02:
`checkUnpublishedSiblingSprintConsumption` built — real, non-invented, tested, already registered
as a blocking suite — but no live `verify.mjs` check calls it against real manifests yet
(TP-3-protected registration line); stays partial. **R-AC-09 closes: `implemented`** — the prior
"duplicate detection lives at the store layer" reasoning was corrected, not just narrowed: the
store's `idempotencyKey` covers a different identity than the lifecycle `eventId` offers/outcomes
actually correlate through; `projectCommandOfferReplay` now closes the real gap, unconditionally,
proven with real appended records. All six R-AC-09 trigger words now close. Moves out of Class B
entirely (8 remain, was 9). Open count: **17 of 157** (was 18).

## What this design is for

The measurement established that **17 of 157** acceptance criteria are not
`implemented` and that no issue is closeable. It did not say how any of them closes. This
document does, and it is generated from the same verdict data as the measurement, so the two
cannot drift apart — provided it is regenerated when the verdict data moves, which is the exact
step that was skipped for a week and is corrected here.

The central design claim is that the remainder is **not one backlog**. It is five populations
with different costs, different owners, and different blocking properties, and treating them as
one list is what has made the epic look larger and more uniform than it is.

| class | criteria | what closing one actually costs |
|---|---|---|
| A — assertion missing | 0 | (both prior members, A-AC-14/PX0-AC-03, closed — see below) |
| D — documentation missing | 0 | (prior member L-AC-08 reclassified to P 2026-08-17, then closed the same day — see below) |
| S — seam missing | 0 | (prior member E-AC-20 closed 2026-08-10) |
| B — capability missing | 8 | real implementation plus its tests |
| P — not code | 9 | a human gate, a sanctioned authority revision, or a proved impossibility |
| **total** | **17** | |

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
| WP-K | 1 | plugins/pipeline-core/lib/governance-event-store.test.mjs, plugins/pipeline-core/lib/governance-event.test.mjs |
| WP-P | 5 | plugins/pipeline-core/lib/audit-bundle*.mjs, plugins/pipeline-core/lib/organization-policy*.mjs |
| WP-V | 2 | plugins/pipeline-core/lib/evidence-view-model*.mjs, plugins/pipeline-core/lib/evidence-view-renderer*.mjs |
| WP-C | 4 | plugins/pipeline-core/lib/change-control*.mjs |
| WP-E | 5 | plugins/pipeline-core/lib/governance-export-*.mjs |
| WP-A | 7 | plugins/pipeline-core/lib/agent-decision-journal*.mjs, governance/schemas/agent-decision-event.schema.json |
| WP-L | 1 | plugins/pipeline-core/lib/lifecycle-governance-events*.mjs, plugins/pipeline-core/lib/governance-replay*.mjs |
| WP-H | 1 | plugins/pipeline-core/lib/human-governance-ledger*.mjs, plugins/pipeline-core/lib/governance-authority-resolver*.mjs, plugins/pipeline-core/lib/external-push-ledger*.mjs |
| WP-R | 7 | plugins/pipeline-core/lib/external-command-offer*.mjs |
| WP-PX0 | 4 | plugins/pipeline-core/lib/ruleset-source*.mjs, plugins/pipeline-core/scripts/ruleset-freshness-host.mjs, plugins/pipeline-core/lib/continuity-state.mjs |
| WP-EPIC | 1 | plugins/pipeline-core/lib/parallel-sprint-integration*.mjs |
| WP-DOC | 1 | docs/*.md (one section set per package) |
| WP-PO | 6 | none - human gates and recorded deviations |

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

Classes A, D and S are empty as of the 2026-08-17 correction — every prior member closed:
PX0-AC-03 (Class A) landed 2026-08-11; A-AC-14 was reclassified B → P the same day and closed
2026-08-17 through the P route (acceptance.md amendment, PHX-WP-POAMEND, commit `e9054995`), not
as a Class A member; L-AC-08 (Class D) was reclassified to P the same day, then closed through
the P route the same day too (PHX-WP-LAC08, commit `20014aab`: the undistinguishable
`cancellation` kind removed, not merely re-documented — the naming/design ambiguity this row
originally named no longer exists), not as a Class D member either; E-AC-20 (Class S) landed
2026-08-10. Full per-row evidence for every `implemented` criterion, including
these, is in
[`../evidence/acceptance-evidence-map-20260817f.md`](../evidence/acceptance-evidence-map-20260817f.md)
— not repeated here, since this document's job is the OPEN set.

### Class B — an absent capability (8)

| ID | verdict | package | what closes it |
|---|---|---|---|
| A-AC-01 | partial | WP-A | record shape pinned; nothing enforces recording BEFORE dependent action where policy requires |
| A-AC-03 | not-started | WP-A | NO CARRIER: no revalidation/invalidation path identifies objects affected by a changed assumption |
| A-AC-05 | partial | WP-AAC05 | the observational shape (identity array, dimension/value/provenance/assurance) is pinned on selection/escalation/fallback. Still no production caller: CONFIRMED ABSENT that any code path emits a selection/escalation/fallback event at all — wiring `advisory-decision-event.mjs`'s translator into the real `advisory-coordinator.mjs` flow is real architecture work, deliberately deferred to a session with PO input available (design/agent-decision-identity-scoping.md) |
| A-AC-09 | partial | WP-A | `assertMandatoryCaptureNotSkipped` (governance-event-store.mjs) lets a caller avoid persisting a non-mandatory event, tested; nothing computes "routine/low-impact" itself — the caller still decides |
| EPIC-AC-02 | partial | WP-EPIC | UPDATE 2026-08-17 (PHX-WP-EPICAC02, commit `77d2d8d5`, independently re-verified): `checkUnpublishedSiblingSprintConsumption` built — a real, non-invented, caller-observation-driven gate, tested (25/25), already registered as a blocking suite in `verify.mjs:405`. Stays open: no live `verify.mjs` check yet calls it against real `specs/*/lifecycle.json` manifests — that registration line is TP-3-protected |
| L-AC-01 | partial | WP-L | UPDATE 2026-08-17 (PHX-WP-LAC01, commit `fd57d390`): first real producer landed — `continuity-cas` now durably persists a schema-valid `dispatch`-kind lifecycle event via a new translator, independently re-verified (unit + call-site + 506/506 gated regression + e2e readback). UPDATE 2026-08-17 (PHX-WP-LAC01B, commit `8e4be420`): second real producer landed — `continuity-integrate-final` now durably persists a `status`-kind event via a sibling translator, independently re-verified (unit + call-site tests green, gated regression 504/506 — the 2 failures are the same pre-existing FTP-ARTIFACT-2 acceptance.md-digest-staleness cause, confirmed pre-existing by re-running the identical suite at the prior commit). Honest count: **2 of 9** — NOT status+cancellation as hoped: the real continuity outcome vocabulary only ever observes succeeded/failed, so cancellation stays unreached despite the projection covering it. `candidate-invalidation` also confirmed to have no real caller (invalidation is always constructed `{state:"valid"}`; zero non-test producers of an invalidated state anywhere). Remaining 7 kinds all need a source vocabulary to exist before a producer can — a capability gap now, not a translator-authoring gap. Registering the new call-site suites into `harness/scripts/verify.mjs` is blocked by the same installed-plugin TP-3 gap as the other four parked reds |
| R-AC-08 | partial | WP-R | a readback lifecycle event appends exactly once and never rewrites the original offer; rollback/cleanup as *occurred* events are absent — no such state exists, only prospective values inside recoverability |
| V-AC-02 | partial | WP-V | eight of nine now labelled. UPDATE 2026-08-17 (PHX-WP-VAC02, commit `8325f2d0`, independently re-verified): `assumption` genuinely labelled — the governance-export delivery observation was previously mislabelled `fact` with no digest/canonical-source binding. `estimate` stays unpinned, confirmed absent by design: the one real estimate in this repo belongs to a different report entirely and has no path into the Evidence Viewer today |

### Class P — not closeable by writing code (9)

| ID | verdict | package | what closes it |
|---|---|---|---|
| EPIC-AC-01 | partial | WP-PO | the issue-to-criterion mapping exists; no independent closure status exists for any of the eight issues |
| EPIC-AC-03 | partial | WP-PO | an outstanding deviation is recorded (the bound Spec section 7 inventory omits six implemented modules) and is not yet repaired through the sanctioned route. INVESTIGATED 2026-08-17: the route is `plugins/pipeline-core/scripts/phoenix-authority-revision.mjs`, a proof-gated wrapper around `pipeline-state.mjs`'s `continuity-authority-revision-plan`/`-apply` — it requires an external Ed25519 proof directory (`phoenix-authority-approval.mjs verify`) before either `plan` or `apply` will run. Not agent-executable without that external signature; an agent can draft the proposal content (the six missing modules for the Spec §7 inventory) so the PO's own action is limited to signing |
| EPIC-AC-04 | partial | WP-PO | privacy review, an integrated-candidate Critic pass, and explicit PO acceptance remain absent |
| EPIC-AC-05 | constraint | WP-PO | a prohibition, and it currently bites — auto-clears once the rest of this table is empty |
| H-AC-11 | partial | WP-PO | portable reconstruction surface pinned; the no-join-handle clause is proved UNSATISFIABLE for the GMW half. UPDATE 2026-08-17 (PHX-WP-POAMEND, commit `e9054995`): O-4 decided by amendment — the clause is scoped to the restricted machine-local record, not a producer's own enforcement material. Stays open: the restricted-profile intake path itself is still unbuilt (design §9, increment 2/D-1) |
| H-AC-12 | partial | WP-PO | the shared dual-evaluation primitive exists and closes 2 of ~6 named readers (guard-devplan.mjs, change-control.mjs). UPDATE 2026-08-17 (PHX-WP-POAMEND, commit `e9054995`): the 2026-08-11 PO decision for release-planning/deploy-consumption now landed as an acceptance.md amendment — closes those 2 readers formally, bringing the closed set to 4 of ~6. Stays open: guard-push.mjs, pipeline-state.mjs (TP-5/GMW-blocked), and Git-guard override consumption remain, not pending more code for those two |
| P-AC-11 | partial | WP-PO | four of five remaining dimensions given representation and one (ownedSections) genuinely enforced (2026-08-16, PHX-WP-PAC11-ENFORCE/FIX). A delta Critic re-review of the fix range has not run: QG-01 forbids handing a diff to the Critic while deterministic gates are red, and Verify cannot go fully green until the installed-plugin GMW/HGO v3-anchor gap is fixed (see `docs/state.md`'s 2026-08-16 checkpoint / the corresponding backlog item) — a structural block on the re-review, not a code task available now |
| PX0-AC-05 | partial | WP-PO | the positive half (durable retention) is implemented and tested. A prior fix's commit-tree needs a PO-side correction (a disclosed commit-attribution swap, prepared fix at `6c889079`/`cd38619e`, docs/state.md 2026-08-12) before a fresh Critic re-review can run — the PO's own terminal or a GG-07 double-confirmation override, not agent-dispatchable |
| PX0-AC-13 | partial | WP-PO | clause 2 (fail-closed under `host-authorized-wsl`) is satisfied (`createWslHostFailClosedSpawn`, acceptance.md amended 2026-08-12). Clause 1 stays open by PO-acknowledged design: real host delegation needs a caller-supplied host-transport executor that does not exist yet anywhere in this codebase (design/codex-wsl-freshness-host-action-family.md §13, still open) — not resolvable by more autonomous dispatch work without that design question answered first. UPDATE 2026-08-17 (PHX-WP-POAMEND, commit `e9054995`): clause 1's disposition upgraded from "designed but unbuilt" to structurally unreachable in-process (re-verified: the CLI never threads `networkPreflight`/`hostTransport` into the freshness inspector, and no legitimate `expectedControlIdentitySha256` is reachable without a live external daemon observation). Settles the disposition, not the exit — §13's design question is still the remaining blocker |

## Sequence, corrected

With Classes A/D/S empty, the sequence collapses to: **Class B first** (8 items, real code, no PO
gate — L-AC-01 leads, since it is the one structural gap several other rows describe as their own
missing half), **Class P last** (9 items, nine different PO actions, several already queued and
waiting only on the PO's own terminal or a design answer — not parallelizable with agent work).

