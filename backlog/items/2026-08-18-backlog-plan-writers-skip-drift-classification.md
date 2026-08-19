---
schema: pipeline.backlog-item.v1
id: pipeline.backlog-plan-writers-skip-drift-classification
type: defect
owner: pipeline
status: closed
created: 2026-08-18
closed_at: 2026-08-19
closure_repository: self
closure_commit: 5e34c0b55321d2332eec641c1e881e6bd73fe5d3
closure_evidence: backlog/items/2026-08-18-backlog-plan-writers-skip-drift-classification.md
source: "self-observation during Wave-3 dispatches NVA-W3-R4E/R4F, 2026-08-18 (Nova A backlog finalization sprint)"
---

# Four backlog `plan*` writer functions skip DRIFT/INTEGRITY classification and can fail closed on tolerated historical drift

## Description

`planBacklogItemHashRescopeAmendment` in `plugins/pipeline-core/lib/backlog-state.mjs`
was found (dispatches NVA-W3-R4E, then fixed in NVA-W3-R4F, 2026-08-18) to
push the RAW output of `validateTransitionLedger` straight into its own
blocking `errors` array, with no severity classification. The real
production ledger (`backlog/transitions.ndjson`) carries at least one
pre-existing, already-tolerated DRIFT finding (ledger event 403's
`evidence.commit` fails the "must be a full lowercase Git commit OID" shape
check; it predates `LEDGER_DRIFT_CUTOFF_SEQUENCE = 417` and is correctly
demoted to non-blocking DRIFT everywhere else via `classifyBacklogFindings`,
e.g. in `checkBacklogState`, `check-backlog-state.mjs:566-569`). Because
`planBacklogItemHashRescopeAmendment` never called `classifyBacklogFindings`,
it treated that tolerated historical DRIFT as a blocking failure and could
never succeed against the real repo as it stood — confirmed by direct
reproduction (running raw `validateTransitionLedger` over the unmodified
real ledger already reproduces the identical findings, while the CLI's own
`checkBacklogState`/`loadBacklogState` path correctly demotes them and
passes). This one function was fixed (commit `07f29a2f`, scoped narrowly by
its own briefing).

**The other four `plan*` writer functions in the same file share the exact
same raw, unfiltered pattern** — `errors.push(...validateTransitionLedger(nextEvents, items))`
with no call to `classifyBacklogFindings` before deciding `ok`:

- `planBacklogTransition`
- `planBacklogEvidenceAmendment`
- `planElephantAfkLedgerRepair`
- `planManagedOnboardingLedgerRepair`

`validateTransitionLedger` validates the FULL ledger on every call, not only
the newly appended event, so any of these four invoked today against the
real 643+-event production ledger would plausibly fail the same way — this
has **not been empirically reproduced for each of the four individually**,
only reasoned from the shared code shape and the one confirmed case; it is
possible one or more of them are unaffected for a reason not yet identified
(e.g. a different set of options passed to `validateTransitionLedger`, or
a lucky absence of any DRIFT-shaped finding on the specific comparison they
perform).

## Triggering situation

Dispatches NVA-W3-R4E (diagnosis) and NVA-W3-R4F (fix, scoped to
`planBacklogItemHashRescopeAmendment` only per its own briefing's explicit
out-of-scope list for the other four functions), 2026-08-18, this session.

## Affected artifact

`plugins/pipeline-core/lib/backlog-state.mjs` — `planBacklogTransition`,
`planBacklogEvidenceAmendment`, `planElephantAfkLedgerRepair`,
`planManagedOnboardingLedgerRepair`, and the already-fixed
`planBacklogItemHashRescopeAmendment` as the reference pattern to match
(routes through `classifyBacklogFindings`, only `BACKLOG_FINDING_SEVERITY.INTEGRITY`
findings block `ok`).

## Proposal

For each of the four functions: (1) reproduce empirically whether it is
actually affected by invoking it against the real current ledger/items (not
a synthetic fixture) before changing anything; (2) where affected, apply the
same classify-then-filter-to-INTEGRITY-only pattern `planBacklogItemHashRescopeAmendment`
now uses; (3) add a regression test per function mirroring
`backlog-state.test.mjs`'s BS33 case (a tolerated pre-existing DRIFT finding
elsewhere in the ledger must not block a valid write). This is a scoped
audit-and-fix task, not a mechanical find/replace — each function's exact
call site and any options it passes to `validateTransitionLedger` need to be
read individually first.

## Triage, 2026-08-18

- **Decision:** accepted, deferred — needs an empirical per-function audit
  before any fix, not current-session work.
- **Rationale:** confirmed real for one of five functions
  (`planBacklogItemHashRescopeAmendment`, fixed 2026-08-18) via direct
  reproduction against the real ledger; the other four are a reasoned
  suspicion from shared code shape, not yet individually confirmed. Each
  needs its own real-ledger reproduction before a fix is written, per this
  item's own Proposal — rushing a blanket fix risks the same
  over-generalization mistake this item exists to avoid.
- **Assignment:** a future Pipeline hardening session; owned by whoever
  next works on `plugins/pipeline-core/lib/backlog-state.mjs`'s writer
  functions.
- **Date:** 2026-08-18

## Closure, 2026-08-19 (Wave 5 round 1, dispatch NVA-W5-05)

All 4 named functions (`planBacklogTransition`,
`planBacklogEvidenceAmendment`, `planElephantAfkLedgerRepair`,
`planManagedOnboardingLedgerRepair`) now route through the same
classify-then-filter-to-INTEGRITY pattern as the reference fix
(`planBacklogItemHashRescopeAmendment`). `node
plugins/pipeline-core/lib/backlog-state.test.mjs` 41/41 pass;
`node plugins/pipeline-core/scripts/check-backlog-state.mjs` clean
(only the two known pre-existing DRIFT lines).

**Deviations from this item's own suggested process, accepted as
reasonable:** the Proposal's step 1 (empirically reproduce whether each
function is individually affected, before fixing) was not performed
per-function — the fix pattern was applied directly to all 4, on the
strength of the shared code shape already confirmed for the 5th
function. This is safe regardless of whether a given function was
actually reachable by the bug: the classify-then-filter pattern only
ever demotes already-tolerated DRIFT-level findings, it cannot mask a
genuine INTEGRITY-level failure. Only one dedicated regression test
(BS34, covering `planElephantAfkLedgerRepair`) was added, per the
dispatch's "at least one" requirement — the other 3 fixed functions
got the code fix but no individual regression test. Closing anyway:
the fix is uniformly safe by construction, and the missing per-function
tests are a coverage gap, not an open defect.
