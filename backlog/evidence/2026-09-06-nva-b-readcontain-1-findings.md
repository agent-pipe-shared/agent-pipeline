# Neutral findings registry — NVA-B-READCONTAIN-1, T1 Critic round 1

Source: T1 Critic review (opus, max; functional-equivalent-read-only) of commit
`cbc30756252ff1573b53ab2ada34ae2f02569f8d`. Full report:
`scratch/dispatch/critic-64989fd0/critic-notes.md`. This registry lists what
must be fixed, not how or why — the fix-verification input contract
(`templates/prompts/critic-review.md`, "Input contract for
fix-verification/rework dispatches").

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
