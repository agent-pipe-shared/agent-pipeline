---
schema: pipeline.backlog-item.v1
id: pipeline.governance-scope-proposal-loses-enrollment-with-stale-worktree
type: defect
owner: pipeline
status: closed
closed_at: 2026-10-07
closure_repository: self
closure_commit: 26fef9e7d26be3d59b7e609c1dad9dd04c747b4d
closure_evidence: backlog/evidence/2026-10-07-close-out-governance-scope-stale-worktree.md
created: 2026-09-28
source: "Pre-integration verification of the S1 Governance Scope proposal in a network-off disposable Git fixture. An enrolled repository becomes inactive solely after deleting an unrelated registered worktree directory. Terminal 58232a, exit 0."
sprint: alfred
done_when: manual
---

# Stale unrelated worktree hides an enrolled repository in the S1 proposal

This finding concerns the prepared S1 proposal, not the currently installed
recovery. `physicalContext` maps every discovered worktree through
`realpathSync` before selecting the worktree containing the requested path.
An unrelated missing directory throws before a context is established.
`observe` then reports `inactive`, `requiresEnforcement: false`, a null root
and `GS-UNAVAILABLE`, although the explicit enrollment record is unchanged.
An explicit decline plan also fails with ENOENT.

The isolated reproduction enrolls a disposable repository through the actual
proposal controller, creates a second registered worktree, removes only that
second directory, and observes the original repository again. Before: active
with enforcement. After: inactive without enforcement. No Source, real Git
topology, installed runtime or global configuration was changed.

Evidence: `scratch/0.7-governance-stale-worktree-reproduction-20260928.mjs`
and its `.terminal.txt` readback. The observed proposal is included in the
frozen S3 dependency tree; the shared S1 correction must precede integration.

## Acceptance

- Unrelated missing/prunable worktree directories cannot change an enrolled
  or declined current repository's governance disposition.
- Resolve and physically validate the relevant scope before deriving its
  authority; do not require every unrelated worktree to remain present.
- Preserve alias, changed root/common identity and relevant topology refusal;
  unreadable active authority must not become inactive admission.
- Add an actual Git regression for active and declined scopes with stale
  unrelated records, plus meaningful relevant-path negative cases.
- Rebind S1/S2/S3/S4 proposal dependency digests and rerun only affected scope
  acceptance after the shared helper correction.

## Triage

- **Decision:** Confirmed security and liveness defect in the proposed S1
  correction; must be resolved before it is included in the local candidate.
- **Assignment:** Shared Governance Scope observer; keep historical failed
  fixture results distinct from installed-runtime claims.
- **Date:** 2026-09-28.

## Closure (2026-10-07)

- **Decision:** closed — fixed in source at 26fef9e7d.
- **Rationale:** regression test `plugins/pipeline-core/lib/governance-scope.test.mjs`, case 'closest containing nested linked worktree keeps its own decision despite a stale sibling' (enrolled and declined scopes with a removed unrelated registered worktree) passes; evidence `evidence/close-a-governance-scope-stale-worktree.txt`, exit 0.
