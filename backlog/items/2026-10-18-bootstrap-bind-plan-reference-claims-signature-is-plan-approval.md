---
schema: pipeline.backlog-item.v1
id: pipeline.bootstrap-bind-plan-reference-claims-signature-is-plan-approval
type: workflow-improvement
owner: pipeline
status: open
created: 2026-10-18
source: "real greenfield project report 2026-10-18 (PF-11)"
sprint: none
done_when: manual
---

# Reference says the signature at binding is the plan approval; the command does not work that way

## Description

`references/intake-generate-design.md` describes the signature at binding as the plan
approval. In practice `bootstrap-bind-plan` asks for no PO confirmation, binds only in phase
`design`, and the approval follows later through `submit-plan` and `present-plan`.

## Triggering situation

The flow after `intake-spec-marker-apply` in a real greenfield project.

## Proposal

Correct the reference so it separates binding from plan approval and names the commands that
carry each.

## Acceptance

- The reference no longer equates the binding signature with plan approval.
- It lists the order: bind, then `submit-plan`, then `present-plan`.
