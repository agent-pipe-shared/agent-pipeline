---
schema: pipeline.backlog-item.v1
id: pipeline.lossless-pre-restart-checkpoint
type: workflow-improvement
owner: pipeline
status: open
created: 2026-08-18
source: "Rune happy-path handover report, greenfield test of pipeline 0.6.0+codex.20260818162535.96cf805, test repo Rune_Test1_Codex_060_52 (external, not this checkout): docs/pipeline-greenfield-happy-path-handover.md, Section 9, item P0-1 (priority P0)"
---

# Lossless pre-restart checkpoint for material intake input

## Description

Material input is currently only compressed into a strongly limited
resume card before a forced restart. This means substantive user-supplied
input can be lost or degraded across a restart boundary, since the resume
card is not designed to carry it losslessly.

## Triggering situation

From a greenfield happy-path test report for pipeline version
0.6.0+codex.20260818162535.96cf805, test repo Rune_Test1_Codex_060_52; see
Section 9, item P0-1, full report at
docs/pipeline-greenfield-happy-path-handover.md in that test repo.

## Affected artifact

resume-hint.mjs, project-onboarding-v3.mjs, kickoff design flow, restart
barrier.

## Proposal

Before a restart barrier is activated, if material input is present, a
durable, sanitized source-evidence file must be written; the resume card
should thereafter reference only that file's path and SHA plus the intake
decisions already answered. Alternatively, a new private kickoff-intake
artifact with the same bindings could be introduced.

Acceptance test: a PO supplies at least 10 KB of structured input,
answers intake questions, and restarts; the following session must be
able to produce a complete, content-equivalent design-input.md without
the input being re-pasted, and language, profile, git author, and
already-answered design decisions must not be asked again.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
