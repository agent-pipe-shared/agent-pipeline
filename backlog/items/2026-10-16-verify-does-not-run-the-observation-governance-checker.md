---
schema: pipeline.backlog-item.v1
id: pipeline.verify-does-not-run-the-observation-governance-checker
type: workflow-improvement
owner: pipeline
status: open
created: 2026-10-16
source: "PO decision 2026-10-16 (AC-198 D1 tile): hook-only governance classification of staged documents is accepted for 0.7.0; a Verify second line is a backlog item after 0.7.0. Evidence: ALF-C-P1-11B."
sprint: none
done_when: manual
---

# Verify does not run the observation-governance checker on the repository

## Description

The governance classification of staged documents (for example a handover
document) runs only in the installed pre-commit hook
(`plugins/pipeline-core/scripts/pre-commit-hook-install.mjs`, the
`checkStagedObservationDocumentation` call). A clone without the hook
commits an unclassified document with exit 0. `harness/scripts/verify.mjs`
runs only the checker's own tests and the bootstrap tests, not the checker
against the repository, so the only later catch is the session-start
observation-governance bootstrap (failure case F6).

## Proposal

Add a Verify step that runs `harness/scripts/check-observation-governance.mjs`
against the repository tree and fails on an unclassified governed document.
`verify.mjs` is protected, so this is a signature-bound change; first measure
whether existing documents would fail it.

## Acceptance

- A full Verify on a tree with an unclassified governed document fails with
  the checker's typed code; a classified tree passes.
- The hook-only behaviour accepted for 0.7.0 stays unchanged until then.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
