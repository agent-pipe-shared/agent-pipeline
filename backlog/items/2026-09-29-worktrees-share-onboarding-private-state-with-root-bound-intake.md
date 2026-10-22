---
schema: pipeline.backlog-item.v1
id: pipeline.worktrees-share-onboarding-private-state-with-root-bound-intake
type: defect
owner: pipeline
status: open
created: 2026-09-29
source: "Source-confirmed dependency of the approved re-enrollment correction: codex-onboarding-runtime.mjs local private-state resolver shares Git-common onboarding slots, while onboarding-continuity.mjs validates an exact physical intake root. No live cross-worktree corruption or real PO approval replay is asserted."
sprint: alfred
done_when: manual
---

# Separate selected-root onboarding ownership from shared Git storage

## Confirmed observation

`resolveOnboardingPrivateState` in
`plugins/pipeline-core/lib/codex-onboarding-runtime.mjs` resolves local state
to `<git-common>/agent-pipeline/onboarding` without a selected-root namespace.
`resolveIntakeCheckpointPaths` in `lib/onboarding-continuity.mjs` uses that
directory, while `validateIntakeCheckpoint` requires `value.root === root`.
Worktrees of the same Git repository therefore address the same intake slot
with different root identities. This is a source-confirmed ownership conflict;
no live destructive mutation or cross-worktree consent reuse was reproduced.

A retirement adapter cannot safely reset a selected worktree's consumed intake
by clearing these common slots. The existing owner must distinguish exact owned
legacy state from foreign-root state before retirement and fresh intake.

## Acceptance

- Canonical private-state ownership binds the selected physical root and Git
  common scope. Re-enrollment retires only that root's old intake and consent.
- Preserve foreign-worktree bytes and active valid legacy authority. Root-bound
  legacy fallback/migration uses the sanctioned owner, physical identity,
  locking and exact CAS; it cannot infer success from a copied receipt.
- Publish a durable declined barrier before migration/retirement, archive exact
  bounded history, and activate only the pending generation after fresh consent.
  Crash recovery, stale CAS, aliases and mixed ownership stay recoverable.
- A first enrollment with no history follows the canonical repository-capability
  route. Do not invent host-managed capability or a private storage root for a
  plain folder. Unverifiable retained history gets a concrete supported route.
- Meaningful disposable tests cover two worktrees, root-bound legacy migration,
  foreign history preservation, repeated active enrollment and interrupted
  generation publication. Preserve prior onboarding and uninstall behavior.

## Triage

- **Decision:** Include in the already approved activation/uninstall correction.
- **Assignment:** Canonical onboarding owner and enrollment retirement slice.
- **Date:** 2026-09-29.
- **Related:** `2026-09-28-no-uninstall-path-for-a-repository-that-once-opted-in.md`.
- **Status:** Inert implementation proposal in progress; Source delivery,
  integrated qualification and independent Critic remain pending.

### Blocker analysis 2026-10-22

Read-only survey of the open clauses that the delivery remeasure assigned to native-host, verify-wsl, po-decision or po-signature (evidence: `specs/sprint-alfred-epic/evidence/blocker-analysis-2026-10-22/`). Status key: LINUX-RUN and WINDOWS-INTEROP-RUN are runs an agent can do from the WSL host; HOST-SESSION-NEEDED, PO-DECISION and PO-SIGNATURE are not agent work.

- **LINUX-RUN** — The 'preserve prior onboarding and uninstall behavior' clause rests on the other onboarding suites being green in a Full Verify
  Run the other onboarding and uninstall suites (and the Verify journal) serially with a private TMPDIR on a Linux-home clone via scratch/run-in.mjs. Long but doable here; closes when all are green and the result is counted in a Full Verify receipt.
