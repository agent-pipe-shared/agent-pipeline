---
schema: "pipeline.backlog-item.v1"
id: "pipeline.spec-retention-on-close"
type: "defect"
owner: "pipeline"
status: "open"
created: "2026-07-20"
source: "Sentinel recovery audit after Public close/transfer"
due: "2026-07-27"
expires: "2026-08-03"
---

# Preserve normative PRD and Spec artifacts across Close and transfer

## Problem

A Public close left a next-session setup prompt and handover in the reachable
branch while the normative Sentinel PRD, technical Spec, acceptance matrix, and
transfer rationale were absent from the Public checkout. The files remained
recoverable only from a local review worktree. This makes the next session
unable to reconstruct the approved Epic authority and causes the PO gate to
report a missing active plan.

## Evidence

- Recovered local review snapshot:
  `specs/2026-07-19-sprint-sentinel-epic/`
- Public handover still references the remaining Sentinel work and the fourteen
  queued GitHub observations.
- Close cleanup is scoped to registered scratch resources; it must not remove
  normative `specs/` files.
- The Public/Private transfer classified Spec/provenance paths as blocked
  without leaving a durable archive or an explicit PO disposition.

## Required correction

1. Every active Epic/Feature PRD, technical Spec, acceptance matrix, and
   decision-bound design input must remain versioned or be copied byte-for-byte
   into a named append-only archive before Close.
2. Transfer classification must fail closed when a normative Spec would be
   omitted without a durable destination and explicit PO disposition.
3. Close must verify that the handover and next-session documents link to the
   normative Spec, not substitute for it.
4. Recovery must preserve provenance and hashes; it must never recreate a plan
   from memory or infer completion from implementation files.
5. Public-safe and private-only artifacts must be separated explicitly, with
   the public record retaining the scope, acceptance criteria, and disposition
   index even when private evidence is excluded.

## Acceptance criteria

- A regression test proves Close cannot report success when the active
  PRD/Spec set has no durable destination.
- A regression test proves transfer omission of a normative Spec is a typed
  blocked result.
- The Sentinel recovery directory contains the Public-safe PRD, Spec,
  acceptance matrix, reconciliation design, and recovery record.
- `docs/state.md` points to the recovered normative Spec and records the
  retention defect.
- The fourteen GitHub observation publications remain a separate follow-up
  feature and are not confused with SNT-A or Epic completion.

## Triage

- **Decision:** Substantially delivered; stays open, narrowed to acceptance
  criterion 2 only. Note: `expires: 2026-08-03` above has passed
  (re-triaged 2026-08-06) — administrative follow-up needed regardless of
  the technical disposition below.
- **Rationale (re-verified 2026-08-06 night):** `governance/spec-retention.json`
  (schema `pipeline.spec-retention.v2`) binds the Sentinel PRD/Spec/
  acceptance/design/recovery/platform-support files to an archive manifest
  at `docs/spec-archive/2026-07-20-sentinel-recovery/manifest.json`, and
  `check-spec-retention.mjs` (created `00fcc33`) enforces it fail-closed —
  registered twice in `verify.mjs` (`spec-retention-tests`,
  `spec-retention-check`). Re-run live: `node
  plugins/pipeline-core/scripts/check-spec-retention.mjs` → valid;
  `node plugins/pipeline-core/scripts/check-spec-retention.test.mjs` → SR01-SR05
  pass, including `SR02 rejects omitted active Spec even when an archive copy
  remains` and `SR03 rejects archive byte drift` — this satisfies acceptance
  criterion 1 directly. `docs/state.md:2166-2189` links the recovered files,
  satisfying criteria 3 and 4. Criterion 5 (public/private separation) is
  satisfied by the same archive's Public-safe scoping.
  **Criterion 2 remains genuinely open:** no dedicated Public/Private
  transfer-classification module exists (searched for
  `classifyTransfer`/`transfer-classification`/similar — no hits;
  `close-block/SKILL.md` has no "retention"/"consent" step naming transfer
  time specifically). Retention is enforced only at Verify time via the
  check above, not as an explicit typed-blocked decision at the moment of
  Public/Private transfer itself, which is what criterion 2 asks for.
- **Assignment:** delivered (criteria 1, 3, 4, 5), `00fcc33` and the Sentinel
  recovery work. Criterion 2 (transfer-time typed-blocked classification)
  unassigned.
- **Date:** 2026-08-06

AI-Assisted: true
