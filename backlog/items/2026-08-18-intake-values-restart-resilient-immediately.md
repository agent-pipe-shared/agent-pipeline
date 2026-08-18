---
schema: pipeline.backlog-item.v1
id: pipeline.intake-values-restart-resilient-immediately
type: workflow-improvement
owner: pipeline
status: open
created: 2026-08-18
source: "Rune happy-path handover report, greenfield test of pipeline 0.6.0+codex.20260818162535.96cf805, test repo Rune_Test1_Codex_060_52 (external, not this checkout): docs/pipeline-greenfield-happy-path-handover.md, Section 9, item P1-4 (priority P1)"
---

# Make intake values (git author, language, profile) restart-resilient immediately after being answered

## Description

Git author, language, and profile were answered by the PO before a
restart, but were asked again after the restart. The proposed change is
to persist the PO's answers into a private, restart-resilient intake
state as soon as the PO responds. Git identity can either be set
immediately at the repository-local level, or held safely in this state
until the first commit.

## Triggering situation

From a greenfield happy-path test report for pipeline version
0.6.0+codex.20260818162535.96cf805, test repo Rune_Test1_Codex_060_52,
full report at docs/pipeline-greenfield-happy-path-handover.md in that
test repo. Section 9, item P1-4.

## Affected artifact

intake flow; project-onboarding-v3.mjs; restart barrier.

## Proposal

Persist each PO-answered intake value (git author, language, profile)
into a private, restart-resilient intake state as soon as it is answered,
with git identity either set immediately repository-locally or held
safely in this state until the first commit.

Acceptance test: no mandatory question that has already been answered is
asked again after a restart.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
