---
schema: pipeline.backlog-item.v1
id: pipeline.architecture-design-errors-omit-field-paths
type: defect
owner: pipeline
status: closed
closed_at: 2026-10-07
closure_repository: self
closure_commit: 26fef9e7d26be3d59b7e609c1dad9dd04c747b4d
closure_evidence: specs/sprint-alfred-epic/plans/backlog-triage-2026-10-07.md
created: 2026-09-27
source: "Codex/WSL greenfield review B7; source verification of architecture-design.mjs error sites on 2026-09-27."
sprint: none
done_when: manual
---

# Architecture design validation errors omit the offending field path

## Description

`architecture-design.mjs` can return `ARCHITECTURE-DESIGN-PATH-INVALID` or
`ARCHITECTURE-DESIGN-DISPOSITION-INVALID` without naming the specific JSON
field or rejected value. The greenfield run reports repeated manual edits
after confusing `tests/**` with `tests/`. The error codes are typed but do
not give enough information for a one-step repair.

## Triggering situation

The 2026-09-27 Codex/WSL architecture disposition during initial design.

## Affected artifact

`architecture-design.mjs`, its CLI/Driver error projection, and architecture
design schema examples.

## Proposal

Return a bounded field path, safe rejected value, expected shape and next
action with each validation code. Add positive and negative examples for
scope and owned-path forms.

## Acceptance

- Fixtures for invalid disposition scope, owned paths, public contracts and
  verification entry points each identify the exact field and expected form.
- The diagnostic remains bounded and does not echo unrelated design content.
- A Greenfield retry can repair the reported `tests/**` versus `tests/`
  mistake from one error response.

## Triage

- **Decision:** closed — fixed in source
- **Rationale:** fixed at 26fef9e7d: lib/architecture-design.mjs field-bearing errors (e.g. modules[i].ownedPaths[j]); test: architecture-design.test.mjs 'field-local diagnostics identify the single invalid architecture input'.
- **Assignment (if accepted):** n/a
- **Date:** 2026-10-07
