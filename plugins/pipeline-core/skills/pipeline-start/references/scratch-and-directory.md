# Scratch and repository directory contract

Use the repository's own `scratch/` for temporary files, probes, held notes and
throwaway fixtures. The containment and dev-plan guards admit that directory
in every phase, including `draft`, `intake-required` and
`intake-design-questions-required`. A refusal is a typed defect to diagnose;
never guess an external host-temp path or use `.git/agent-pipeline/**` as
agent scratch. Pipeline-owned private runtime state belongs there instead.

A session needing disciplined cleanup (bind at start, release at close,
retire a crashed session's orphan on a later bootstrap) uses
`bindScratchDescriptor`/`releaseScratchDescriptor`/`retireOrphanScratchDescriptors`
in `plugins/pipeline-core/lib/session-cleanup-recovery.mjs`; an ad hoc file
needing no lifecycle can be written directly under `scratch/`.

Onboarding writes a `.gitignore` ignoring `/scratch/`, `/evidence/`, and
`/project/pipeline-state.json` when the project has none. A project that
already owns one is never touched. Add those three entries yourself if you
want these files kept out of history. `/evidence/` matters beyond tidiness:
`security-scan.mjs` refuses a dirty working tree, so tracked evidence
artifacts can make the security gate unsatisfiable.

**Directory contract, beyond scratch (ADR-0063):** normative canon stays in
its existing location (`docs/`, `roles/`, `guardrails/`, `policies/`); decision
records live in `docs/adr/`; specifications live in `specs/<feature-id>/`
(ADR-0045); evidence a gate or backlog `closure_evidence` field cites lives
in tracked `backlog/evidence/` or `specs/*/evidence/`; machine-regenerated
evidence lives in ignored root `evidence/`; agent-authored temporary material
lives in ignored `scratch/`; plugin-owned private runtime state lives under
`.git/agent-pipeline/**` and declared `.claude/` paths. See
`docs/adr/0063-repository-directory-contract.md`'s directory-kinds table
before adding any new top-level directory.
