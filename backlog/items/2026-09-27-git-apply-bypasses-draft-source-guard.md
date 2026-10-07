---
schema: pipeline.backlog-item.v1
id: pipeline.git-apply-bypasses-draft-source-guard
type: defect
owner: pipeline
status: closed
closed_at: 2026-10-07
closure_repository: self
closure_commit: 1d7c76581504f9e6b1bc797773d501aeab29c970
closure_evidence: specs/sprint-alfred-epic/plans/backlog-triage-2026-10-07.md
created: 2026-09-27
sprint: alfred
done_when: manual
source: "Live Alfred Design/Draft readback, 2026-09-27: git apply wrote two protected plugin source files without HGO; an equivalent apply_patch action was denied by guard-testpath and guard-devplan."
---

# `git apply` bypasses the draft source guard

In the active Alfred Design/Draft state, `git apply` successfully changed
`plugins/pipeline-core/scripts/pipeline-state.mjs` and its test from a prepared
patch. The same source edit through `apply_patch` was refused under
`PB-SANCTIONED-WRITER` and `GUARD-DEVPLAN`, with Pipeline Author Repair offered.
The `git apply` changes were immediately reversed; readback showed a clean
worktree. This is a live guard coverage gap, not an authorized repair path.

## Required behavior

- Classify `git apply` and its relevant options as a potential multi-file
  writer. Parse the patch and evaluate every target through the same
  protected-path and lifecycle decisions as `apply_patch`.
- Refuse opaque patch sources or unsupported flags without executing the
  write. Keep a read-only applicability check available before human signing.
- An exact authorized repair may apply only its reviewed paths and bytes;
  no shell spelling or patch transport may silently lift a guard.

## Acceptance

With a Design/Draft fixture, the same protected two-file patch is denied via
`git apply` and `apply_patch` absent authorization. A contained `scratch/`
patch remains preparable and checkable. Signed author repair admits only the
exact requested action; stale preimages fail. Normal unprotected patch use
remains available.

## Triage

- **Decision:** closed — fixed in source
- **Rationale:** fixed at 1d7c76581: lib/protected-test-paths.mjs (mutating git apply has unbound patch targets); test: protected-test-paths.test.mjs 'mutating git apply cannot masquerade as a scratch-only write'.
- **Assignment (if accepted):** n/a
- **Date:** 2026-10-07
