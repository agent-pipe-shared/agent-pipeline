---
schema: pipeline.backlog-item.v1
id: pipeline.architecture-fitness-model-repeats-module-fields
type: workflow-improvement
owner: pipeline
status: closed
closed_at: 2026-10-07
closure_repository: self
closure_commit: 26fef9e7d26be3d59b7e609c1dad9dd04c747b4d
closure_evidence: specs/sprint-alfred-epic/plans/backlog-triage-2026-10-07.md
created: 2026-09-27
source: "Claude/Windows greenfield review F-08, 2026-09-27; architecture-design.mjs source inspection confirms module and fitness-model fields are compared for identical values."
sprint: none
done_when: manual
---

# Architecture fitness model repeats module declarations

## Description

Greenfield architecture input requires authors to repeat module owned paths,
allowed dependencies, authority effects and verification entry points in
`fitnessModel.modules`. Source validation rejects mismatches, so these copies
carry no independent decision but add editing cost and error opportunities.
The consumer also reports boilerplate baseline and repository-kind fields.

## Affected artifact

`lib/architecture-design.mjs`, the architecture design schema, templates and
generator, and fitness-model output.

## Proposal

Derive redundant fitness fields from canonical module declarations. Preserve
explicit fitness checks or exceptions only where they express an independent
constraint. Derive greenfield baseline metadata when repository evidence makes
it unambiguous.

## Acceptance

- A representative greenfield design requires each module fact once, with no
  loss of fitness validation or materialized output.
- Conflicting explicit exceptions are rejected with a field-specific error.
- Before/after authoring bytes and correction steps are measured.

## Triage

- **Decision:** closed — fixed in source
- **Rationale:** fixed at 26fef9e7d: lib/architecture-design.mjs derives fitnessModel.modules and baseline; test: architecture-design.test.mjs 'compact greenfield package derives redundant fitness rows and zero baseline'.
- **Assignment (if accepted):** n/a
- **Date:** 2026-10-07
