# Three update channels on the published main line

**Status:** proposed (PO topology instruction, 2026-09-29; exact ADR acceptance pending)

**Date:** 2026-09-29

**Supersedes on acceptance:** ADR-0078, distribution channels on main.

**Affected contracts:** `ruleset-freshness.mjs`, `pipeline-update-channel.mjs`,
`release-version-plan.mjs`, release promotion, and `SETUP.md`.

## Context

ADR-0078 made stable select final tags, left beta inactive with a planned
prerelease-tag mechanism, and selected alpha from a configured branch. The PO
now wants three simple channels on the published `main` line. The currently
persisted alpha-ref field must not silently continue selecting another branch.

## Decision

1. **Alpha** selects `refs/heads/main`. It is the current branch tip, including
   commits that have not yet received a beta or final tag. A legacy configured
   alpha ref has no effect on channel resolution.
2. **Beta** selects the highest valid `vX.Y.Z-beta.N` tag, then verifies that
   its commit is reachable from the observed `main` tip. An absent tag,
   unavailable main, ambiguous tag observation, or unprovable or false
   ancestry yields a typed unknown result. A final tag does not substitute
   for a beta tag.
3. **Stable** selects the highest final `vX.Y.Z` release tag, then verifies
   that its commit is reachable from `main`. A candidate can become stable
   only through the ordinary release ceremony.
4. All three channels observe exact remote object IDs. Reading a channel never
   changes the project, Git refs, or plugin installation. A channel comparison
   that cannot establish the source or object relation reports unknown.
5. Historical prerelease and final tags remain immutable. A published beta
   uses the prerelease-tag release plan; no separate pinned channel is added.

## Consequences

An untagged commit on `main` is visible to Alpha. Beta advances only when a
prerelease tag is published. Stable advances only when a final release tag is
published. The release process must leave room for Alpha commits on `main`
before tagging when an Alpha test window is desired. Legacy alpha-ref settings
can be retired after consumers have observed the new resolver.
