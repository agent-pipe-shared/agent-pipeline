# Sprint Phoenix — closure design

Status: design

Date: 2026-08-09 (class table and per-criterion rows CORRECTED 2026-08-17 — see note below)

Parent specification: [../spec.md](../spec.md) · Measurement: [../evidence/acceptance-evidence-map-20260817.md](../evidence/acceptance-evidence-map-20260817.md)

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
snapshot:** [`../evidence/acceptance-evidence-map-20260817.md`](../evidence/acceptance-evidence-map-20260817.md).

## What this design is for

The measurement established that **26 of 157** acceptance criteria are not
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
| D — documentation missing | 0 | (prior member L-AC-08 reclassified to P — see below) |
| S — seam missing | 0 | (prior member E-AC-20 closed 2026-08-10) |
| B — capability missing | 14 | real implementation plus its tests |
| P — not code | 12 | a human gate, a sanctioned authority revision, or a proved impossibility |
| **total** | **26** | |

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
A-AC-14/PX0-AC-03 (Class A) landed 2026-08-09/2026-08-11; L-AC-08 (Class D) is reclassified to P
below (its remaining gap is a naming/design ambiguity, not a missing document section — more
prose cannot close it); E-AC-20 (Class S) landed 2026-08-10. Full per-row evidence for every
`implemented` criterion, including these, is in
[`../evidence/acceptance-evidence-map-20260817.md`](../evidence/acceptance-evidence-map-20260817.md)
— not repeated here, since this document's job is the OPEN set.

### Class B — an absent capability (14)

| ID | verdict | package | what closes it |
|---|---|---|---|
| A-AC-01 | partial | WP-A | record shape pinned; nothing enforces recording BEFORE dependent action where policy requires |
| A-AC-03 | not-started | WP-A | NO CARRIER: no revalidation/invalidation path identifies objects affected by a changed assumption |
| A-AC-05 | partial | WP-AAC05 | the observational shape (identity array, dimension/value/provenance/assurance) is pinned on selection/escalation/fallback. Still no production caller: CONFIRMED ABSENT that any code path emits a selection/escalation/fallback event at all — wiring `advisory-decision-event.mjs`'s translator into the real `advisory-coordinator.mjs` flow is real architecture work, deliberately deferred to a session with PO input available (design/agent-decision-identity-scoping.md) |
| A-AC-09 | partial | WP-A | `assertMandatoryCaptureNotSkipped` (governance-event-store.mjs) lets a caller avoid persisting a non-mandatory event, tested; nothing computes "routine/low-impact" itself — the caller still decides |
| A-AC-10 | partial | WP-A | the offer path fails closed on unavailable journaling; no per-event-class fail-open/fail-closed policy exists |
| EPIC-AC-02 | not-started | WP-EPIC | NO CARRIER: planParallelSprintIntegration has no concept of "unpublished" and is called only from its own test file (reconfirmed 2026-08-17 by independent re-verification, zero hits for "unpublished"/"Nova"/"Cyborg"/"Nightwing") |
| H-AC-08 | partial | WP-HAC08 | `legacy-import-observation` kind is representable, drift-tested. Still no production caller: CONFIRMED ABSENT that any code path imports/migrates a legacy record at all |
| L-AC-01 | partial | WP-L | UPDATE 2026-08-17 (PHX-WP-LAC01, commit `fd57d390`): first real producer landed — `continuity-cas` now durably persists a schema-valid `dispatch`-kind lifecycle event via a new translator, independently re-verified (unit + call-site + 506/506 gated regression + e2e readback). 1 of 9 named kinds done; `candidate-invalidation` recommended next (the translator already refuses invalidated exchanges by name). Registering the new call-site suite into `harness/scripts/verify.mjs` is blocked by the same installed-plugin TP-3 gap as the other four parked reds |
| P-AC-06 | partial | WP-P | missing, misplaced, illegally-mutable, stale and truncated each pinned. legacy and orphaned remain unpinned: the legacy classification exists (feature-package-topology.mjs:78) but no rejection path consults it |
| P-AC-09 | partial | WP-P | RETRACTS "no carrier" (2026-08-17): `computeBackfillRange` (organization-policy-activation.mjs) already covers the preview half, shared with P-AC-03. Narrower remainder: `activateOrganizationPolicy`'s `authorize()` is one generic activation grant, not a distinct "explicit backfill consent" scoped to the identified historical range, and no code exports/backfills the historical events themselves |
| R-AC-08 | partial | WP-R | a readback lifecycle event appends exactly once and never rewrites the original offer; rollback/cleanup as *occurred* events are absent — no such state exists, only prospective values inside recoverability |
| R-AC-09 | partial | WP-R | missing offer link, contradictory outcome evidence, cross-repository/cross-scope substitution, and now `occurredAtEpochMs` (closed 2026-08-10, commit `8d8996bc`) are pinned. Duplicate detection deliberately not rebuilt here — it lives at the store layer (`idempotencyKey`, governance-event-store.mjs) by design, not an absence |
| R-AC-13 | partial | WP-R | 9 of 11 required fixture classes now named; approval-without-run and duplicate/retry are confirmed structurally unreachable, each pinned by a dedicated test showing the gap rather than left silently missing |
| V-AC-02 | partial | WP-V | seven of nine now labelled (fact/unknown/unavailable/redacted/invalid/not-applicable/human-decision, the last closed 2026-08-1x and missed by this document until the 2026-08-17 correction). estimate and assumption remain unpinned: zero occurrences anywhere in the view-model, renderer or CLI modules |

### Class P — not closeable by writing code (12)

| ID | verdict | package | what closes it |
|---|---|---|---|
| A-AC-14 | partial | WP-A | RECLASSIFIED B → P 2026-08-17: "decomposition" is confirmed not representable anywhere in `kind`, `state`, or any command-offer enum (investigated and settled by PHX-WP-A2, re-confirmed 2026-08-17). Building new representational capacity for a 13th scenario is a scope decision, not a quick test — closes by either a PO-approved schema extension or an acceptance.md amendment accepting 12/13, the same route H-AC-11 already used |
| L-AC-08 | partial | WP-DOC→WP-PO | RECLASSIFIED D → P 2026-08-17: docs/governance-replay.md's "Traceability" section already honestly documents that the `cancellation` kind has no structural distinction from `status: "cancelled"` — no confident justification could be constructed. More documentation cannot close this; it needs a design decision (fold `cancellation` into `status`, or build a real distinction) |
| EPIC-AC-01 | partial | WP-PO | the issue-to-criterion mapping exists; no independent closure status exists for any of the eight issues |
| EPIC-AC-03 | partial | WP-PO | an outstanding deviation is recorded (the bound Spec section 7 inventory omits six implemented modules) and is not yet repaired through the sanctioned route |
| EPIC-AC-04 | partial | WP-PO | privacy review, an integrated-candidate Critic pass, and explicit PO acceptance remain absent |
| EPIC-AC-05 | constraint | WP-PO | a prohibition, and it currently bites — auto-clears once the rest of this table is empty |
| H-AC-09 | not-started | WP-PO | NO CARRIER, and no design is available to build: authorizing guarded work in another repository is exactly the capability CLAUDE.md's Sprint-0 hard rule forbids outright. Closes only via a Phase-4 migration or a PO scope amendment |
| H-AC-11 | partial | WP-PO | portable reconstruction surface pinned; the no-join-handle clause is proved UNSATISFIABLE for the GMW half (acceptance.md amendment, tracked as O-4) |
| H-AC-12 | partial | WP-PO | the shared dual-evaluation primitive exists and closes 2 of ~6 named readers (guard-devplan.mjs, change-control.mjs). PO decided 2026-08-11 the existing alternate mechanisms satisfy intent for the rest — but landing that decision needs an acceptance.md amendment, the same blocked route as P-AC-06/H-AC-11-O-4; stays open pending that amendment, not pending more code |
| P-AC-11 | partial | WP-PO | four of five remaining dimensions given representation and one (ownedSections) genuinely enforced (2026-08-16, PHX-WP-PAC11-ENFORCE/FIX). A delta Critic re-review of the fix range has not run: QG-01 forbids handing a diff to the Critic while deterministic gates are red, and Verify cannot go fully green until the installed-plugin GMW/HGO v3-anchor gap is fixed (see `docs/state.md`'s 2026-08-16 checkpoint / the corresponding backlog item) — a structural block on the re-review, not a code task available now |
| PX0-AC-05 | partial | WP-PO | the positive half (durable retention) is implemented and tested. A prior fix's commit-tree needs a PO-side correction (a disclosed commit-attribution swap, prepared fix at `6c889079`/`cd38619e`, docs/state.md 2026-08-12) before a fresh Critic re-review can run — the PO's own terminal or a GG-07 double-confirmation override, not agent-dispatchable |
| PX0-AC-13 | partial | WP-PO | clause 2 (fail-closed under `host-authorized-wsl`) is satisfied (`createWslHostFailClosedSpawn`, acceptance.md amended 2026-08-12). Clause 1 stays open by PO-acknowledged design: real host delegation needs a caller-supplied host-transport executor that does not exist yet anywhere in this codebase (design/codex-wsl-freshness-host-action-family.md §13, still open) — not resolvable by more autonomous dispatch work without that design question answered first |

## Sequence, corrected

With Classes A/D/S empty, the sequence collapses to: **Class B first** (14 items, real code, no PO
gate — L-AC-01 leads, since it is the one structural gap several other rows describe as their own
missing half), **Class P last** (12 items, twelve different PO actions, several already queued and
waiting only on the PO's own terminal or a design answer — not parallelizable with agent work).
| H-AC-09 | not-started | WP-PO | NO CARRIER: external-push-ledger is scoped to single-repo push proofs; nothing binds cross-repository guarded work to one physical target. RECLASSIFIED Class S -> Class P 2026-08-09 (PO-confirmed): the clause's own subject -- authorizing guarded work IN another repository -- is exactly the capability CLAUDE.md's Sprint-0 hard rule currently forbids outright ("Read-only toward the three project repos ... never a write ... until an explicitly approved Phase-4 migration"). There is no design to scope: building a cross-repository binding mechanism for a write capability this repo is not yet authorized to exercise would be building ahead of its own governing policy, not closing a gap. Closes only if/when a Phase-4 migration lifts the restriction, or the PO narrows the clause's scope by amendment (the same route H-AC-11 already used) -- either way, not a code task available now |
| H-AC-11 | partial | WP-PO | portable reconstruction surface pinned; the no-join-handle clause is proved UNSATISFIABLE for the GMW half (acceptance.md amendment, tracked as O-4) |

