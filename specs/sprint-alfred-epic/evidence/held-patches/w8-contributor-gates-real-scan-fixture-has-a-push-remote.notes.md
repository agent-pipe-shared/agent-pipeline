# w8-contributor-gates-real-scan-fixture-has-a-push-remote (held patch, not applied)

Cause of the red `check-pr-contributor-gates` suite (the two N2 cases): since G32-SECURITY-REMOTE (537d5c85d) the security scan binds the candidate snapshot to the
effective push remote, so a project with no remote yields `ERROR`/`candidate_snapshot` (`remote-missing`) for every scanner before any adapter runs. The suite's
`realScanFixture` built its repository with no remote, so the clean-scanner case could not reach `ok:true` and the absent-osv case failed with the wrong outcome.

Change (test-side drift, no product change): the fixture repository gets an `origin` remote with an `example.invalid` URL, the same way the other security fixtures do.

Evidence (clean clone): the suite 20/20 (the two N2 cases were red). Separately measured while running it: the suite and several others leave their `mkdtemp` directories
behind, which is part of what exhausted the inodes of `/tmp` during this work; that is recorded in the Full Verify analysis, not changed here. Applies to the repository HEAD.
