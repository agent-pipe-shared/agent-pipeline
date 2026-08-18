---
schema: pipeline.backlog-item.v1
id: pipeline.po-key-trust-anchor-onboarding
type: workflow-improvement
owner: pipeline
status: open
created: 2026-08-18
source: "Rune happy-path handover report, greenfield test of pipeline 0.6.0+codex.20260818162535.96cf805, test repo Rune_Test1_Codex_060_52 (external, not this checkout): docs/pipeline-greenfield-happy-path-handover.md, Section 9, item P1-7 (priority P1)"
---

# PO key and trust anchor as one-time machine onboarding task

## Description

In the feature-plan gate, two keys had to be created, an identity
corrected, and a trust anchor manually committed. This forced manual
setup work into what should be a routine plan-approval flow.

## Triggering situation

Greenfield happy-path test report, pipeline version
0.6.0+codex.20260818162535.96cf805, test repo Rune_Test1_Codex_060_52; see
docs/pipeline-greenfield-happy-path-handover.md in that test repo,
Section 9, item P1-7.

## Affected artifact

PO key setup flow, trust anchor materialization, plan-approval gate.

## Proposal

When signature mode is active, the first pipeline onboarding should check
early whether a machine-wide configured PO authority already exists. If
it exists, its public anchor is materialized in a controlled way. If it
does not exist, there is exactly one separate setup ceremony with an
explicit name prompt. Local, reversible plan approvals must not
unnecessarily depend on this push infrastructure.

Acceptance test: the first real push requires only the passphrase; no key
setup and no manual JSON/git step occurs during the feature flow.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
