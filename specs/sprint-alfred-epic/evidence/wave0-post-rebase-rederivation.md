# Wave 0 post-rebase re-derivation

This note records the facts used to freeze A1 after the Nova rebase. The
public `refs/heads/main` observation supplied for Wave 0 was
`6262d408aa616651232b46ab8ecbfd88ce4055b0`. In this checkout the direct
ref name is not present, so the object was verified by identity rather than
inventing a ref. The exact command
`git merge-base HEAD 6262d408aa616651232b46ab8ecbfd88ce4055b0` returned
`6262d408aa616651232b46ab8ecbfd88ce4055b0`. The local repair bridge
`da641265966d711a401880f8ced818c998e5764b` has parent
`6262d408aa616651232b46ab8ecbfd88ce4055b0`, verified with
`git rev-list --parents -n 1 da641265966d711a401880f8ced818c998e5764b`.

## Re-derived onboarding review-lens target set

The comparison `a50c8093..6262d408aa616651232b46ab8ecbfd88ce4055b0` was
re-derived after the rebase. Changed onboarding-focused tests are:

- `plugins/pipeline-core/lib/onboarding-continuity.test.mjs`
- `plugins/pipeline-core/lib/project-onboarding-ready-gate.test.mjs`
- `plugins/pipeline-core/lib/project-onboarding-v3.test.mjs`
- `plugins/pipeline-core/scripts/onboarding-init.test.mjs`
- `plugins/pipeline-core/scripts/project-onboarding-e2e.test.mjs`
- `plugins/pipeline-core/scripts/project-onboarding-v3-argv-closure.test.mjs`
- `plugins/pipeline-core/scripts/project-onboarding-v3-pre-push-hook-offer.test.mjs`
- `plugins/pipeline-core/scripts/project-onboarding-v3-unborn-head.test.mjs`

These are distinguished from the many generic changed files in the same
comparison (documentation, backlog, guards, state, and unrelated suites).
AC-16's success-contract review lens applies if a later Alfred change touches
one of the eight paths; rejection-only coverage is allowed only for an
explicitly unsupported layout. A1 currently plans no onboarding-test edit,
so it adds no AC-16 implementation change.

## Wave-0 consequence

The rebase facts are reproducible and A1 remains runner-neutral: the probe
records measured differences instead of forking implementation. The stale
`hooks.json` assertion remains a TP-4 PO follow-up, and Verify registration
remains a later TP-3 PO maintenance act. No production implementation or
protected file is changed by this re-derivation note.
