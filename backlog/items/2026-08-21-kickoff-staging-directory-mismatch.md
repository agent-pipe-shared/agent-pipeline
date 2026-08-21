---
schema: pipeline.backlog-item.v1
id: pipeline.kickoff-staging-directory-mismatch
type: defect
owner: pipeline
status: open
created: 2026-08-21
source: Manual observation during sprint_agy kickoff testing (Rune_Test1_Agy_060_59)
---

# Kickoff provisional files path mismatch in code vs documentation

## Description

The pipeline documentation (`plugins/pipeline-core/skills/pipeline-start/references/kickoff-design.md`) states that provisional kickoff PRDs and specifications are generated under the `specs/kickoff-*` directory. However, the technical implementation in `project-onboarding-v3.mjs` and `onboarding-continuity.mjs` (line 5442) hardcodes `export const INTAKE_STAGING_DIRNAME = "project/.onboarding-staging";`. This causes the script to place the provisional files in `project/.onboarding-staging/` instead of `specs/`.

## Triggering situation

During the `sprint_agy` integration testing, the Antigravity agent ran the `project-onboarding-v3.mjs kickoff plan` command correctly. The script placed the files in `project/.onboarding-staging/`, leading the user to correctly point out that the directory structure was wrong compared to what other runners document/produce based on the instruction layer.

## Affected artifact

`plugins/pipeline-core/skills/pipeline-start/references/kickoff-design.md` and `plugins/pipeline-core/lib/onboarding-continuity.mjs`

## Proposal

Reconcile the documentation and the code. Either update `kickoff-design.md` to reflect the new staging directory (`project/.onboarding-staging/`), or update the constants in `onboarding-continuity.mjs` to map to `specs/`. Since `project/.onboarding-staging/` is explicitly typed as an onboarding artifact, updating the markdown reference is likely the correct technical path.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** 
- **Rationale:** 
- **Assignment (if accepted):** 
- **Date:**
