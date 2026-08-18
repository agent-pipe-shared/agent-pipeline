---
schema: pipeline.backlog-item.v1
id: pipeline.fresh-repo-onboarding-intake-first-transaction
type: workflow-improvement
owner: pipeline
status: open
created: 2026-08-18
source: "Rune happy-path handover report, greenfield test of pipeline 0.6.0+codex.20260818162535.96cf805, test repo Rune_Test1_Codex_060_52 (external, not this checkout): docs/pipeline-greenfield-happy-path-handover.md, Section 9, item P0-0 (priority P0)"
---

# Recut fresh-repo onboarding as an intake-first transaction

## Description

Onboarding currently creates provisional project, kickoff, and lifecycle
authority before the concrete PO input has been fully and durably captured.
The later, normal processing of that input then invalidates the
self-created pre-state and triggers an unnecessary repair cascade. The
onboarding flow needs to be reordered so that authority is only bound
after the input is durably captured, not before.

## Triggering situation

From a greenfield happy-path test report on pipeline version
0.6.0+codex.20260818162535.96cf805, test repo Rune_Test1_Codex_060_52; full
report at docs/pipeline-greenfield-happy-path-handover.md in that test
repo, Section 9, item P0-0.

## Affected artifact

project-onboarding-v3.mjs, kickoff promotion, resume hint, pipeline-state
initialization, authority binding, restart barrier, and greenfield guards.

## Proposal

Introduce a dedicated atomic bootstrap-from-intake coordinator for fresh
repositories, structured as: (1) capture pipeline consent and any
still-missing required values once; (2) losslessly save already-delivered
material input into a private intake checkpoint; (3) ask any open design
questions in one bundled round and add the answers to the same checkpoint;
(4) from that checkpoint, generate the durable design source plus initial
PRD/spec in a single transaction; (5) only then bind the finally-generated
artifacts as authority and publish the lifecycle; (6) either avoid
provisional kickoff artifacts entirely, or keep them strictly as unbound,
replaceable staging data. Runtime setup and a technically necessary
restart may occur within this transaction, but not before a lossless
checkpoint exists and not with any publicly effective partial binding.

Acceptance test: an empty repository receives at least 10 KB of
requirements in the first message; after consent, one bundled intake
answer, and a forced restart, exactly one durable design source and one
consistent initial authority state are produced; there must be no generic
kickoff commits, no repeated mandatory questions, no reopen/rebind, no
HGO, and no continuity repair.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
