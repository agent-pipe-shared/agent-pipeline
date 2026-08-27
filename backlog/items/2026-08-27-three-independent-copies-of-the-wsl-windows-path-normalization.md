---
schema: pipeline.backlog-item.v1
id: pipeline.three-independent-copies-of-the-wsl-windows-path-normalization
type: defect
owner: pipeline
status: open
created: 2026-08-27
sprint: alfred
source: "Noted while fixing the third instance of the WSL/Windows path-identity defect, commit d96e14c5, 2026-08-27."
---

# The WSL/Windows path normalization exists as three independent copies

## Description

The rule that decides whether two spellings of a path denote the same repository
— the WSL `/home/...` form versus the Windows `\\wsl.localhost\...` /
`D:\...` form — is implemented three separate times in this plugin. The third
copy was added deliberately in `d96e14c5` (`repoPathIdentity` /
`repoFingerprint` in `lib/guard-maintenance-window.mjs`), documented in-code as a
mirror rather than an import, to avoid a module cycle.

That was the right local call and the wrong global one. Three copies of a
predicate whose whole purpose is that two things are *equal* can disagree, and
the failure mode when they do is silent: a fingerprint matches in one guard and
not in another, and the session sees an unexplained drift refusal.

This defect class has now been fixed three times in three places. That is the
signal — not the individual bug.

## Why this matters

The Pipeline's own position is that a rule which needs enforcing needs one
mechanism, not repeated prose or repeated code. The same reasoning that moved
`MUTATING_ONBOARDING_ARGV_SHAPES` into a single declaration
(`lib/onboarding-argv-shapes.mjs`, NVA-INTAKEARGV-1, after the hand-written copy
drifted and deadlocked a greenfield onboarding) applies here with more force,
because path identity decides whether a *guard* fires.

## Affected artifact

- `plugins/pipeline-core/lib/guard-maintenance-window.mjs` (`repoPathIdentity`,
  `repoFingerprint`, `repoFingerprintLegacy`, `repoFingerprintMatches`)
- the two pre-existing copies (locate them from `d96e14c5`'s own in-code note,
  which names why it did not import them)

## Proposal

Not designed here. Two shapes worth weighing:

1. Extract the normalization into a dependency-free `lib/` module all three
   import — the same move `onboarding-argv-shapes.mjs` and
   `onboarding-staging-authoring.mjs` already made, both of which existed
   precisely because a cycle blocked the obvious import.
2. If a genuine cycle survives that, keep the copies but add a test that holds
   all three against the same input table, so a divergence fails loudly instead
   of silently.

Option 2 is the cheap floor and should be done even if option 1 is chosen later.

## Acceptance

- Either one implementation with three importers, or three implementations with
  a single shared test table that fails on any divergence.
- The test covers the notations that actually occur: `/home/...`,
  `\\wsl.localhost\...`, `D:\...`, and mixed separators.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
