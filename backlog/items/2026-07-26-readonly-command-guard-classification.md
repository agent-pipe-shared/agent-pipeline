---
schema: pipeline.backlog-item.v1
id: pipeline.readonly-command-guard-classification
type: workflow-improvement
owner: pipeline
status: closed
created: 2026-07-26
source: Phoenix close self-retro; specs/sprint-phoenix-epic/RECOVERY.md R-02
closed_at: "2026-08-19"
closure_repository: "self"
closure_commit: "6a58725b485a0721cd3d7aa55a821f761ae49d43"
closure_evidence: "backlog/items/2026-07-26-readonly-command-guard-classification.md"
---

# Classify design-close operations without weakening plan or root protection

## Description

The lifecycle-ready guard repeatedly rejected composed local read-only
inspections as possible cross-root mutation. The Dev-Plan gate also treated the
mandatory root-level History and telemetry close records as implementation
while the plan correctly remained unapproved. These false-positive classes
increase ceremony and can deadlock a design-phase close before its Product
Owner gate.

This is a workflow-improvement input, not permission to change the guard before
the normal plan and implementation gates. Phoenix already owns the sanitized
rejected-route audit contract; this item does not expand the reviewed Phoenix
product scope.

## Triggering situation

The sanitized recurrence is recorded in the Phoenix recovery record, R-02.
Every rejected command stopped before execution and no guard was bypassed.

## Affected artifact

Lifecycle-ready command classification, Dev-Plan design-close classification,
and their focused tests.

## Proposal

Add closed command-shape fixtures that distinguish repository-local read-only
composition from cross-root writes. Preserve fail-closed handling for unknown
shell structure, mutation, pipeline-source access, marketplace mutation, and
plugin installation. Add a closed, non-implementation close-artifact inventory
or sanctioned writer so mandatory History and telemetry records can be written
before plan approval without exempting product files.

## Triage — 2026-08-18

- **Decision:** accept-open, still unfixed.
- **Rationale:** The false-positive class this item describes reproduced again during this same session's own read-only investigation work (composed local Bash calls rejected by `guard-lifecycle-ready.mjs` with `GUARD-PARSE-UNSUPPORTED`/`GUARD-OPERATOR-UNAPPROVED`/`GUARD-REDIRECT-UNAPPROVED`), and `specs/sprint-phoenix-epic/RECOVERY.md` R-02 shows it recurring across multiple prior sessions since filing. No command-shape fixtures distinguishing safe local read-only composition, and no sanctioned close-artifact writer for History/telemetry records, exist in the current guard or Dev-Plan gate code. Nova has no equivalent fix under this or a related name.
- **Assignment (if accepted):** A bounded Goldfish dispatch, scoped exactly per this item's own Proposal (fixtures + sanctioned writer, preserving fail-closed handling for unknown structure/mutation/pipeline-source/marketplace/plugin-install), through the normal plan gate — not a freehand guard edit.
- **Date:** 2026-08-18

## Triage — closed 2026-08-19

- **Decision:** closed — resolved.
- **Rationale:** `guard-lifecycle-ready.mjs`'s new `isBoundedGrepPipeline()` (commit `6a58725b`) extends the bounded-pipeline exception family to grep-to-grep/grep-to-head shapes, wired into both `isReadOnlyDiagnosticCommand` and `isForbiddenCrossRepositoryMutation`; `guard-devplan.mjs`'s sanctioned-close-artifact writer landed in the same commit. 46/46 and 49/49 tests pass respectively.
- **Date:** 2026-08-19
