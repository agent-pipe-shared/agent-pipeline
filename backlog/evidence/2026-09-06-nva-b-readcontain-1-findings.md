# Neutral findings registry — NVA-B-READCONTAIN-1

Source: T1 Critic review (opus, max; functional-equivalent-read-only) of commit
`cbc30756252ff1573b53ab2ada34ae2f02569f8d`. Full report:
`scratch/dispatch/critic-64989fd0/critic-notes.md`. This registry lists what
must be fixed, not how or why — the fix-verification input contract
(`templates/prompts/critic-review.md`, "Input contract for
fix-verification/rework dispatches").

**Final status:** F1 resolved (round 1 correction, `bc00a861`). F2 resolved
for the direct-symlink shape (`bc00a861`); its remaining `..`-through-symlink
scope, reclassified as F4, resolved by the second correction (`177bf884`).
F5 resolved (`177bf884`). F3 stays open — disclosed, not attempted, tracked
separately, non-blocking for this package. Per `harness/review-protocol.md`'s
two-round cap, round 2 was the last allowed Critic round; F4/F5 were fixed
and then independently self-verified by the Elephant directly (full
regression 229/229, the three other DoD checks, authorship PASS on all
three commits) — no third Critic round.

- **F1**: the restored comment above `isOutsideRootBoundedDiagnosticRead`
  cites ADR-0059 Decision 6 as authority for classifying an outside-root read
  as `liftable-by-signature:cross-repository-target`; Decision 6 concerns
  cross-repository mutations, not reads, and the comment itself opens
  "Deliberately NOT the cross-repository-mutation family" while citing that
  family's own decision.
- **F2**: the read-scope containment introduced by this diff
  (`isApprovedSingleCommandReadArg`, `isApprovedCatPipelineReadPath`, and the
  `isBoundedGitPipeline` subargs check that reuses the first) resolves a
  target path lexically (`commandPath()` + `pathInside()`, no `realpathSync`)
  rather than through the realpath-resolving discipline
  `isPathWithinRealpathedRoot` already applies on the write lane in the same
  file — a symlink planted inside the project root pointing outside it
  satisfies the lexical check while the bytes actually read come from
  outside the root.
- **F3**: two command shapes that changed admission behaviour under this
  diff — a single read with a trailing `2>/dev/null` stderr suppressor
  targeting an outside-root path, and an `&&`-chained read of the same
  shape — lost their prior test coverage without replacement, and land on
  `GUARD-REDIRECT-UNAPPROVED`/`GUARD-OPERATOR-UNAPPROVED` rather than the
  true-reason `GUARD-READ-SCOPE-OUTSIDE-ROOT` code the rest of this
  restoration establishes for every other read-only shape.

## Round 2 findings (on correction commit `bc00a861`)

- **F4** (supersedes F2's remaining scope): the fix for F2 resolves a
  candidate argument via `commandPath()`, which calls `path.resolve(root,
  value)` — a purely lexical string operation that collapses `..` segments
  before any filesystem check. An argument shaped
  `<symlink-inside-root>/../<outside-dir>/<file>` therefore collapses to a
  string that reads as trivially inside the root, while the actual shell
  command is later resolved by the OS, which dereferences the symlink
  FIRST and applies `..` relative to its real target — landing outside the
  root. Reproduced live: the guard admits this shape while refusing the
  direct-symlink shape, and executing the admitted command reads content
  from outside the fixture's project root.
- **F5** (minor): `isRealpathedWithinBoundary`'s `dependencies` parameter is
  never supplied by any call site, and its `catch { return false; }`
  blocking path has no test exercising it.
