---
schema: "pipeline.backlog-item.v1"
id: "pipeline.close-spec-retention-and-consent"
type: "workflow-improvement"
owner: "pipeline"
status: "closed"
created: "2026-07-21"
source: "2026-07-21 full-close retro: Spec-retention authority drift and durable advisor-export consent readback"
closed_at: "2026-08-06"
closure_repository: "self"
closure_commit: "00fcc336cfd163d85fed20aa0a7ec2dbcfb6c31a"
closure_evidence: "backlog/evidence/2026-08-06-third-reconciliation-pass.md"
---

# Bind retention and consent readback before delivery

## Description

The final close found that an approved authority correction can leave a retained
archive digest stale until the close-pre gate runs. The same block also needed a
durable, public-safe readback that advisor-export consent is approved without
exposing export material.

## Triggering situation

The 2026-07-21 close-pre checks found a byte mismatch between the active Sentinel
PRD and its retained archive. The setup quickfix then added an explicit approved
and disabled status readback for repository-scoped advisor export consent.

## Affected artifact

The close-block retention extension, setup consent status, and delivery checklist.

## Proposal

Make authority/archive digest reconciliation and consent-status readback explicit
in the pre-delivery checklist, with machine-readable evidence and no raw
question, answer, credential, or environment data.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted, delivered, closed.
- **Rationale:** both halves independently confirmed resolved by different,
  already-tested-and-green code paths, 2026-08-06 night:
  **Archive-digest reconciliation** — `check-spec-retention.mjs` (created
  `00fcc33`, "feat(sentinel): bind recovery and retention gates") implements
  a fail-closed check (existence, byte-identity via SHA-256, manifest shape)
  registered twice in `verify.mjs` (`spec-retention-tests`,
  `spec-retention-check`). Re-run live: `node
  plugins/pipeline-core/scripts/check-spec-retention.mjs` →
  "Spec retention authority and archive bindings are valid."; its own test
  suite's `SR03 rejects archive byte drift` is exactly the byte-mismatch
  case this item's Triggering situation describes, and passes. This is the
  same mechanism `backlog/items/2026-07-20-spec-retention-on-close.md`
  tracks in more detail (that item stays open for its own, narrower,
  residual transfer-classification gap — this item's specific ask is fully
  covered by what already exists).
  **Advisor-export consent readback** — `plugins/pipeline-core/lib/
  advisory-coordinator.mjs` implements a durable, public-safe
  `advisorExport: { consent: "approved" | "declined" }` field and a typed
  `advisory_disabled_no_consent` result code, with no raw question/answer/
  credential/environment data exposed — exactly this item's Proposal.
  Re-run live: `node plugins/pipeline-core/lib/advisory-coordinator.test.mjs`
  → 7/7 pass, including "only an explicit declined advisor export consent
  disables advisory before dispatch."
  Full evidence: `backlog/evidence/2026-08-06-third-reconciliation-pass.md`.
- **Assignment (if accepted):** delivered across the Sentinel-recovery and
  advisory-coordinator work; re-verified and closed 2026-08-06.
- **Date:** 2026-08-06
