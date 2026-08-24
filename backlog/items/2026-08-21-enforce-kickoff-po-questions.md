---
schema: pipeline.backlog-item.v1
id: pipeline.enforce-kickoff-po-questions
type: workflow-improvement
owner: pipeline
status: open
created: 2026-08-21
source: Manual observation during sprint_agy kickoff testing (Rune_Test1_Agy_060_59)
---

# Move kickoff PO questions (language, profile) to technical enforcement

## Description

The `pipeline-start` skill currently relies on the instruction layer to ensure the agent stops and asks the Product Owner (PO) for the project's language and profile (`Ask the PO once now for both... Never default or invent a value.`). While GPT-4o and Claude 3.5 usually obey this, less strictly aligned models (e.g., Gemini running in Antigravity) may hallucinate these values (e.g., `--language de`, `--profile feature`) and pass them directly into `kickoff plan` without asking the human. 

## Triggering situation

During the `sprint_agy` integration testing, the Antigravity agent invoked `kickoff plan` with hallucinated `language` and `profile` arguments. The technical enforcement layer (`guard-lifecycle-ready.mjs`) validated that the `--language` flag was present, but did not (and currently cannot) validate whether the agent actually obtained this value interactively from the user.

## Affected artifact

`plugins/pipeline-core/skills/pipeline-start/SKILL.md`, `plugins/pipeline-core/scripts/project-onboarding-v3.mjs`, and potentially `guard-lifecycle-ready.mjs`

## Proposal

Move the collection of these critical PO parameters from the prompt layer to the technical enforcement layer. Instead of allowing the agent to provide `--language` and `--profile` as CLI arguments, the `kickoff plan` script could halt and interactively prompt the user on the console, or `guard-lifecycle-ready.mjs` could require the agent to run a specific typed interaction tool (`ask_po_input`) before allowing the execution of `kickoff plan`.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** deferred
- **Rationale:** The proposal is a new technical-enforcement primitive (an
  `ask_po_input`-style interaction gate, or a script-level interactive halt)
  distinguishing "the agent asked the human" from "the agent typed a value"
  — genuine guardrail/architecture impact and design latitude, not a small
  fix. Per `docs/operating-model.md` §7 triage rule 4, scope like this is a
  PO decision, not the Elephant's alone. No PO input on this specific item
  has been given yet.
- **Assignment (if accepted):** pending PO scoping decision on the
  enforcement mechanism shape before any implementation is planned.
- **Date:** 2026-08-24
