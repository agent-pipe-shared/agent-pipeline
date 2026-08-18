# Spec §7 revision draft — EPIC-AC-03 (2026-08-17)

Draft only. NOT applied to `spec.md`. For the Elephant's review before use as
`--next-spec` input material for the authority-revision ceremony.

## Independently re-derived module count: 6 high-confidence, 2 uncertain

Cross-checked every `.mjs` filename `acceptance-evidence-map.mjs` cites as a
criterion's real producer against every path named in `spec.md` §7.1–§7.11,
then confirmed each candidate's creation commit + date with `git log
--diff-filter=A --follow`. The already-recorded "six" figure independently
reproduces, but not necessarily the same six — I did not have the original
list to compare name-for-name, only the count.

**High confidence (real creation commit found, genuinely Phoenix-scoped, cited
as a criterion's producer):**

1. `plugins/pipeline-core/lib/parallel-sprint-integration.mjs` — created
   2026-07-31 (`d3593e23`). Producer for EPIC-AC-02.
2. `plugins/pipeline-core/lib/organization-policy-backfill-export.mjs` —
   created 2026-08-17, TODAY (PHX-WP-PAC09). Producer for P-AC-09.
3. `plugins/pipeline-core/lib/control-execution-lifecycle-event.mjs` —
   created 2026-08-17, TODAY (`fd57d390`, PHX-WP-LAC01). Producer for L-AC-01.
4. `plugins/pipeline-core/scripts/check-artifact-topology.mjs` — created
   2026-07-24 (`898b9819`). Producer/validator for P-AC-06.
5. `plugins/pipeline-core/scripts/migrate-backlog-state.mjs` — created
   2026-07-20 (`8ae6567e`). Investigated as H-AC-08's one real (now-closed)
   legacy-import path.
6. `plugins/pipeline-core/scripts/reconcile-backlog-ledger.mjs` — created
   2026-08-06 (`2dc95116`). Used by L-AC-08's backlog reconciliation.

**IMPORTANT caveat, not present in the prior "six" framing:** two of these six
(#2, #3) were created TODAY, during the same session that is drafting this
proposal. This list is a moving target — every further Class-B dispatch this
epic runs is likely to add another undocumented module. Signing THIS exact
proposal only closes the deviation as of right now; it does not prevent the
deviation from reopening on the next dispatch. Consider whether this ceremony
is better run once, near epic close, than repeatedly mid-epic.

**Lower confidence, not included in the count above (git log found no clean
"added" commit via `--follow`, likely renamed/moved rather than newly
authored, or may be pre-existing general Pipeline infrastructure rather than
Phoenix-specific work):** `plugins/pipeline-core/scripts/gate-estimate.mjs`,
`plugins/pipeline-core/scripts/continuity-host-adapter.mjs`. Also explicitly
EXCLUDED: `guard-devplan.mjs`, `release-version-plan.mjs`,
`critical-action-authorization.mjs`, `guard-push.mjs` — these are H-AC-12's
*still-outstanding* readers (future work, not yet built), not omitted
documentation of something already shipped.

## Proposed additions

### 7.1 Existing authority and topology files to modify

Add one row:

| File | Change | Rationale |
| --- | --- | --- |
| `plugins/pipeline-core/scripts/check-artifact-topology.mjs` | create the feature-package artifact-topology validator CLI (missing/misplaced/stale/truncated/illegally-mutable detection) | Give `validateFeaturePackage` an operator-facing surface distinct from the library it wraps. |

### 7.5 Agent journal and lifecycle replay

Add one row (near `lifecycle-governance-events.mjs`):

| File | Change | Rationale |
| --- | --- | --- |
| `plugins/pipeline-core/lib/control-execution-lifecycle-event.mjs` | create the shared dispatch/status lifecycle-event projection body (`projectLifecycleEvent`) both `buildLifecycleDispatchEvent` and `buildLifecycleStatusEvent` share | Give L-AC-01's continuity-cas/continuity-integrate-final producers one non-duplicated projection instead of two independent copies. |

### 7.6 Organization policy and audit bundle

Add one row:

| File | Change | Rationale |
| --- | --- | --- |
| `plugins/pipeline-core/lib/organization-policy-backfill-export.mjs` | create the consented-backfill export trigger, reusing the existing `queryPortableGovernanceStream → projectGovernanceEvent → enqueueGovernanceExport → deliverGovernanceExportBatch` pipeline | Let P-AC-09's distinct backfill-consent grant actually deliver the historical events it was consented to, without a parallel export mechanism. |

### 7.10 Phoenix package and integration documentation

Add two rows:

| File | Change | Rationale |
| --- | --- | --- |
| `plugins/pipeline-core/lib/parallel-sprint-integration.mjs` | create the unpublished-sibling-Epic-commit consumption gate (`checkUnpublishedSiblingSprintConsumption`) | EPIC-AC-02: fail Phoenix verification when a package's bound candidate consumes an unpublished Nova/Cyborg/Nightwing commit. |
| `plugins/pipeline-core/scripts/migrate-backlog-state.mjs` | create the one-time backlog-state migration importer, permanently self-closing once `backlog/transitions.ndjson` exists | Investigated as H-AC-08's real candidate legacy-import path; confirmed closed and semantically distinct from an H-AC-08 import (refuses authority-bearing records rather than importing them as observations). |
| `plugins/pipeline-core/scripts/reconcile-backlog-ledger.mjs` | create the backlog ledger reconciliation CLI | Used by L-AC-08's backlog-item filing/reconciliation step. |

## Design-phase precondition — CONFIRMED REQUIRED, not just script caution

`buildAuthorityRevisionPlan` (`plugins/pipeline-core/scripts/pipeline-state.mjs:3531`)
itself enforces `state.activeFeature.phase !== "design" → AR-DECISION-SCOPE`
refusal — this is the underlying writer's own precondition, not merely
`make-authority-revision-proposal.mjs` being cautious. There is no way to
hand-construct a request that skips it; the check runs again inside
`-apply` too (`buildAuthorityRevisionPlan` is re-invoked there for the
TOCTOU-closing re-derivation).

**Reopening design is NOT a narrow/free action.** `reopen-design` (`pipeline-state.mjs:6434`,
backed by `reopenPlanDesign` in `plugins/pipeline-core/lib/plan-spec-state-v2.mjs:636`)
sets `activeFeature.phase = "design"`, `planApproved = false`, and writes a
`planInvalidation` record for the CURRENTLY approved implementation plan.
Returning to implementation afterward is a full plan-approval cycle again
(re-submit, PO re-approve) — not a quick toggle back. Also blocked while
continuity is "busy" (`buildAuthorityRevisionPlan` refuses `AR-CONTINUITY-BUSY`
if `queueHead.dispatch`/`blocker`/`decisionTxn`/`closeTransition`/`recovery`/
`acknowledgedFinal` are non-null) — the continuity queue must be idle first.

**Recommendation for the Elephant to weigh, not decided here:** running this
ceremony now costs a real plan-invalidate/re-approve cycle in the middle of
active Class-B dispatch work, and the module list will likely be stale again
before the epic closes. Running it once near epic close (after Class B is
exhausted, when no more producer modules are expected) would need this same
document regenerated but pay the phase-reopen cost only once. Either choice
is legitimate; this is a sequencing question, not a blocker.

## Command sequence (PO's own terminal, NOT this session)

Directory: no prior `--directory` value found anywhere in `docs/state.md` for
this specific ceremony (it has never been run before) — `setup-authority-key.sh`
itself suggests `~/.phoenix-authority`; any directory OUTSIDE the repo works
equally, substitute your own if you prefer.

```bash
# 0. One-time key setup — SKIP if ~/.phoenix-authority/po-private.pem already
#    exists (the script refuses to overwrite; safe to attempt regardless).
bash specs/sprint-phoenix-epic/evidence/setup-authority-key.sh ~/.phoenix-authority

# 1. Reopen design (REQUIRED by buildAuthorityRevisionPlan; invalidates the
#    current plan approval — see caveat above before running this).
node plugins/pipeline-core/scripts/pipeline-state.mjs reopen-design --by "<your name>"

# 2. Generate the proposal request from the FINAL, Elephant-reviewed
#    spec.md (after the additions above are actually applied to spec.md by
#    the Elephant — this script reads spec.md's live bytes, so the file must
#    already contain the agreed changes before this step).
node specs/sprint-phoenix-epic/evidence/make-authority-revision-proposal.mjs --next-spec specs/sprint-phoenix-epic/spec.md

# 3. Prepare, approve (prompts for your Ed25519 key passphrase — needs a REAL
#    terminal, not this session's '!' prefix), then verify. <generated> is
#    the exact path step 2 printed as "proposal".
node plugins/pipeline-core/scripts/phoenix-authority-approval.mjs prepare --repo-root "$PWD" --directory ~/.phoenix-authority --proposal <generated>
node plugins/pipeline-core/scripts/phoenix-authority-approval.mjs approve --repo-root "$PWD" --directory ~/.phoenix-authority --proposal <generated>
node plugins/pipeline-core/scripts/phoenix-authority-approval.mjs verify  --repo-root "$PWD" --directory ~/.phoenix-authority --proposal <generated>

# 4. Hand the verified proof back to the Elephant's session — it runs
#    `continuity-authority-revision-plan`/`-apply` (the actual State write)
#    from inside the repo using the request/proof files step 3 produced.
#    Nothing further for you to run here.

# 5. AFTER the revision applies: re-submit and re-approve the implementation
#    plan to leave design phase again (submit-plan / approve-plan — the
#    Elephant drafts the resubmission; you approve).
```

Step 4's exact `phoenix-authority-revision.mjs plan|apply` invocation is
intentionally left to the Elephant, not the PO — it runs inside the repo
against the request/proof step 3 produces, needs no further human signature
beyond the proof already captured, and its exact `--request-file`/
`--request-sha256`/`--lock-token` values depend on live State at run time.
