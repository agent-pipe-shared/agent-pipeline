# Neutral findings registry — NVA-B-READCONTAIN-2

Source: T1 Critic review (opus, max; functional-equivalent-read-only) of
commits `e183632fb154711cac2cb5fbde5a8ae0973863dc`,
`3cbb7d2a292b6285bb184023689817bff241d6f4`. Full report:
`scratch/dispatch/readcontain2-6c83f150/` (report durability write failed —
`GUARD-CROSS-REPO-MUTATION` refused the Critic's own scratch write; the
returned report text is the durable record here instead).

**Verdict: PASS.** Both findings are `minor`; neither blocks. No correction
round required.

- **F1**: the doc comment above `sessionReadScopeRoots()`/
  `claudeSessionTranscriptFilePath()` asserts the transcript root is
  "admitted as an EXACT single-file match only — never a directory-prefix
  admission," but the containment check does not structurally enforce that:
  `isRealpathedWithinBoundary("<transcriptFile>/foo", transcriptFile)`
  returns `true` (the ancestor-walk climbs from the nonexistent child back
  up to the file itself, which equals the boundary). Not exploitable today
  — a regular file has no children, so the real shell read fails `ENOTDIR`
  — but the code does not hold the invariant the comment claims, and no
  test covers this specific shape.
- **F2**: this read-boundary decision (two new exception roots; the `/tmp`
  task-output exclusion) has no ADR yet and no threat-model pointer —
  already known and tracked (this item's own acceptance criteria, and the
  originating backlog item's EL-04 obligation); not a new gap, an owed
  follow-up now due.

## Disclosed process issue (not a finding against the diff)

**The dispatch prompt this Critic reviewed against was contaminated** by
the Elephant: Phase A categories 6 and 8 carried added "In particular:
trace what happens when..." hypothesis clauses (rather than the template's
verbatim category text), plus an "expected-conclusion" aside pre-judging
how to weigh a missing RED/predicate-before evidence artifact, and a
parenthetical characterizing which of the two commits was "substantive"
vs. "evidence-only." The Critic explicitly disclosed all of this under its
own "Briefing violations observed" section, named F1 as traced back to one
of the steered categories, and stated it verified F1 independently from
source rather than accepting the hint. Given the independent verification
and the minor severity of both resulting findings, this round's PASS
verdict is treated as usable rather than requiring a fresh, uncontaminated
re-run — but the contamination itself is recorded here rather than
silently absorbed into a clean-looking PASS.
