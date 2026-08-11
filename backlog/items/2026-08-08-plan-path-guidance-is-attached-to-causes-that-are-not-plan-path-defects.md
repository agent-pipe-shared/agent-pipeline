---
schema: pipeline.backlog-item.v1
id: pipeline.plan-path-guidance-attached-to-unlike-causes
type: defect
owner: pipeline
status: closed
closed_at: 2026-08-11
closure_repository: self
closure_commit: 5415923bb6336a7a816d2cbd8fe2cbe75554c424
closure_evidence: specs/sprint-nova-epic/evidence/backlog/2026-08-11-pareto-triage-report.md
created: 2026-08-08
due: 2026-08-22
source: "Established while re-signposting the PO-language mismatch (commit b094cb5); the enumeration was produced by that dispatch and the remaining sites were deliberately left alone."
---

# One repair string is attached to three unlike causes

## What was established

`PRD_REPAIR` — *"Repair activeFeature.planPath and the active feature directory;
do not create child PRDs"* — is attached at thirteen call sites in
`plugins/pipeline-core/lib/po-gate-authority.mjs`, covering three kinds of cause:

1. **Genuine plan-path defects**, where the string is correct:
   `PO-GATE-FEATURE-PATH-INVALID` (×3), `PO-GATE-PRD-CARDINALITY` (×2),
   `PO-GATE-PLAN-PATH-MISMATCH`, `PO-GATE-ACTIVE-FEATURE-INVALID`.
2. **Snapshot staleness**: `PO-GATE-PLAN-DIGEST-STALE` (×2). Arguably adjacent —
   the remedy is to re-read, not to repair a path.
3. **Document-content causes that have nothing to do with `planPath`**:
   `PO-GATE-PRD-SPEC-MISMATCH` (×3) and the UTF-8 decode half of
   `PO-GATE-PRD-LANGUAGE-MISMATCH`.

Commit `b094cb5` gave the language *marker* check its own guidance, naming the
route that actually resolves it. The other sites in group 3 were deliberately not
touched: each needs guidance of its own, and inventing three strings inside a
signposting fix would have been the same mistake at larger scale.

## Why it matters more than it used to

The seeded `dev-plan` gate now blocks rather than warns. A refusal that names the
wrong remedy used to cost a confused minute on top of a warning that let the write
through; it now stands between the operator and every implementation write. The
message is load-bearing.

There is a second-order cost worth naming: an operator who follows plan-path
guidance for a spec-marker drift will edit `activeFeature.planPath` — touching
authority state to fix a document. The wrong remedy is not merely unhelpful here;
it invites a change in the wrong place.

## Direction, not a design

1. **Give each cause the remedy that resolves it.** `PO-GATE-PRD-SPEC-MISMATCH`
   points at the neighbouring `spec.md` digest binding, not at a path. The UTF-8
   decode failure points at the file's encoding. Neither is a plan-path repair.
2. **Decide what `PO-GATE-PLAN-DIGEST-STALE` should say.** Re-reading and
   re-submitting is the actual remedy; whether that is close enough to the existing
   string to leave alone is a judgement, not an oversight.
3. **Consider whether the code and the remedy should be coupled at all.** Thirteen
   sites sharing one constant is how three unlike causes came to share one
   sentence. A table from code to remedy would make the mismatch visible the next
   time a code is added.

## Triggering situation

Enumerated at commit `b094cb5` while fixing the one site the PO-language backlog
item named. Not independently reproduced for the remaining sites — the
enumeration is from the source, and each site's user-visible behaviour should be
confirmed before it is changed.

## Related

- `2026-08-08-po-language-is-set-without-asking-and-cannot-be-changed.md` — the
  item whose fix produced this enumeration.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
