# w8-backlog-state-fixtures-track-their-closure-evidence (held patch, not applied)

Cause of the red `backlog-state` suite (BS06, BS12, BS09; the run also crashed at the BS12-dependent BS13 and never reached the later cases): the checker now refuses a
closed item whose cited `closure_evidence` file exists but is not tracked by Git (BS24, "the citation resolves only in this working tree"). Four older fixtures write
their evidence files into a plain directory and never track them, so the checker found the new finding where the fixture expected a valid closure.

Change (test-side drift, no product change): each of those fixtures runs `git init` and `git add` for the evidence files it cites, exactly as BS24 does. BS06 tracks
`specs/result.md`; BS12 and BS14 track `specs/old-result.md` and `specs/current-result.md`; BS09 tracks `specs/result.md`. No assertion is weakened.

Evidence (clean clone, with the D222 patch applied beside it): `backlog-state.test.mjs` 64/64 (it was a crash after 29 passes). Applies to the repository HEAD.
