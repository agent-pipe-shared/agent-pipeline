# w42 — addendum commits read an untracked dispatch record from the working tree (15h close hotfix)

Found by the second real consumer close right after 15g (w41) was installed: the Critic carry-forward still refused its addenda commits with
`VEP-CVL-CARRY-CONTENT-CHANGED`. Its diagnostic run of `classifyRegisteredEvidenceOnlyCommits` showed the four registration/export commits
recognised and exactly the two addenda commits (a removal commit and a re-add commit) not recognised.

## Cause (confirmed by the consumer's own evidence)

That repository keeps `evidence/dispatch-record-*.json` out of Git (its ignore file lists the directory); the close planner and the record
writer read the records from the working tree. `criticAddendumOnlyCommit` validated each addendum against the record read from the
commit's Git tree, found no blob, and the surrounding `try/catch` swallowed the error, so the commit stayed a "correction" with no reason in
the output. My own test (w41) had committed the record, so it never exercised this layout. That is the same blind spot as the earlier close
hotfixes: the chain test used the producer's layout, not a real consumer's.

## Change

`lib/critic-course-admission.mjs`: `dispatchRecordBytes(root, at, recordPath)` reads the record from the commit when Git tracks it and from
the working tree when it does not (regular file only; a symbolic link, a non-regular file or a path whose real path differs is refused). The
binding does not weaken: `validateCriticDispositionAddendum` still compares the record bytes with the addendum's own `recordSha256`, so a
changed, foreign or missing file ends the classification.

Test (`critic-verify-lifecycle.test.mjs`, already registered, unpinned): an ignored record directory, the addendum commit carries; changed
record bytes and a missing record end it. Red before the change with the consumer's exact error.

## Still open (candidate 16)

The order trap: a dispatch record WITH an addendum counts as covered and is no longer an admission target for a further review round.
