---
schema: pipeline.backlog-item.v1
id: pipeline.readonly-command-guard-classification
type: workflow-improvement
owner: pipeline
status: open
created: 2026-07-26
source: Phoenix close self-retro; specs/sprint-phoenix-epic/RECOVERY.md R-02
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

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
