---
schema: pipeline.backlog-item.v1
id: pipeline.reconcile-lock-reuse-lexical-path-comparison
type: defect
owner: pipeline
status: open
created: 2026-08-11
source: "Independent Critic review, 2026-08-11, commit 3e1a727e (single-commit delta review), Finding 1. specs/sprint-phoenix-epic/evidence/pac08-f1-critic-review-3e1a727e.md"
---

# `defaultFeaturePackageReconcileApproval`'s lock-reuse check compares `resolve()` paths, not real (symlink-resolved) paths

## Description

`PHX-WP-PAC08-LOCK-REENTRANCY` (commit `3e1a727e`) fixed a self-deadlock in
`feature-package-reconcile`'s mandated self-governing topology (governing
session directory === `--root`) by having the approval closure reuse the
caller's already-held continuity lock instead of acquiring a second,
colliding one. The reuse decision compares
`resolve(continuityLockPath(dir)) === resolve(continuityLockPath(holderRoot))`
(`plugins/pipeline-core/scripts/pipeline-state.mjs:6020-6021`). `resolve()`
normalizes lexically and does not resolve symlinks. If `--root` is reached
through a symlinked path while `dir` (`projectDir()`/`process.cwd()`)
resolves to the same directory via its real (symlink-resolved) path, the two
comparison values differ even though they name the identical directory
(identical lock file, identical inode) — reuse is declined, `writeState`
falls back to acquiring a second lock on the same path, and the original
`PS-CONTINUITY-LOCKED` self-collision (`FTP-RECONCILE-APPROVAL-REJECTED` to
the operator) returns for that one path spelling.

The failure mode is fail-closed (refusal, zero mutation, no corruption) — an
availability/diagnosability gap, not a safety gap. Not currently known to
affect this repository's own real invocations (no symlinked checkout root in
normal use), but is a real latent gap in a general-purpose CLI capability.

## Triggering situation

Independent Critic review of `3e1a727e` (the F1 fix itself, dispatched to
close a prior FAIL), verdict PASS with this one minor, non-blocking finding.
Full report: `specs/sprint-phoenix-epic/evidence/pac08-f1-critic-review-3e1a727e.md`,
Finding 1.

## Affected artifact

`plugins/pipeline-core/scripts/pipeline-state.mjs` —
`defaultFeaturePackageReconcileApproval`'s `reuseLock` computation
(~line 6020) and the `writeState`/`acquireContinuityLock` primitives it
depends on.

## Proposal

Per the Critic's own suggestion: compare using the authoritative
`holderLock.path` (already returned by `acquireContinuityLock`, see
`plugins/pipeline-core/scripts/pipeline-state.mjs:811`) via `realpathSync`,
mirroring the pattern already used elsewhere in this same file for
path-identity checks (`safeRequestFile`, `:926-927`, `:962-963`) — rather
than recomputing `continuityLockPath(holderRoot)` and comparing lexically.
This also closes a second, related, pre-existing (not introduced by
`3e1a727e`) property the same review noted but did not flag as a finding
against this diff: the recomputed path could in principle diverge from the
path actually locked, since `statePath()` is existence-dependent. A small,
well-scoped follow-up fix plus a regression test (a symlinked `--root`
resolving to the same real directory as `projectDir()`) closes both at once.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
