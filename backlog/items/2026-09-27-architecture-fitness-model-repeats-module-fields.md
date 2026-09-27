---
schema: pipeline.backlog-item.v1
id: pipeline.architecture-fitness-model-repeats-module-fields
type: workflow-improvement
owner: pipeline
status: open
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

