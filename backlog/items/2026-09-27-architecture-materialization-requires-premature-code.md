---
schema: pipeline.backlog-item.v1
id: pipeline.architecture-materialization-requires-premature-code
type: defect
owner: pipeline
status: open
created: 2026-09-27
source: "Claude/Windows greenfield review F-07, 2026-09-27; predicted blocker, not reached live. Source confirms nonempty contract and verification files are required by architecture-design.mjs before materialization."
sprint: alfred
done_when: manual
---

# Architecture materialization requires contract and test files before dispatch

## Description

`architecture-design.mjs` requires every declared public contract and
verification entry point to exist with nonempty bytes before it returns
`materialization-required`. In a fresh project those files are implementation
or test surfaces, while the consumer's binding phase reportedly permits only
PRD and Spec authoring. The Claude run stopped earlier, so this is a
source-confirmed sequencing risk, not an observed second deadlock.

## Affected artifact

Architecture design readiness/materialization, lifecycle write admission,
Elephant/Goldfish ownership, and greenfield dispatch sequence.

## Proposal

Make the sequence executable: either materialize design before those files
exist and validate them after an authorized implementation dispatch, or provide
a narrowly scoped contract/test-scaffold dispatch before the check. Keep
empty stubs from falsely satisfying the final contract gate.

## Acceptance

- A fresh greenfield project with no product files can move from approved
  design through architecture materialization and an authorized dispatch.
- Contract and verification contents are checked at the stage where their
  owning worker can produce them.
- A real replay establishes whether this was a live blocker and records the
  exact phase/admission result.

## Triage

