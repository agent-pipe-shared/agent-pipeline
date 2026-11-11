fix(security): bind the scan to the remote the current branch pushes to

A repository with several remotes refused the scan as remote-ambiguous, even
when the current branch named its remote, so a Full Verify on such a clone could
never go green. With no remote given, the scan now uses the remote Git would
push the branch to. Without one it still refuses, and the refusal names the two
ways past it. PO decision of 2026-11-10.

AI-Assisted: true
Dispatch: stage-0 (elephant)
