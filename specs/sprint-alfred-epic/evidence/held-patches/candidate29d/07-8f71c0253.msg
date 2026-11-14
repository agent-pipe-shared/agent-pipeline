test(security-scan): the close postimage check blocks exactly when the full scan does (C2)

Candidate 29c added scanClosePostimages, the secret check of the close's
own generated files before the irreversible State close, but nothing
pinned its verdict against the full post-freeze scan. A new parity block
runs both on the same root, manifest and gitleaks binary, in the real
close order (postimage check on the uncommitted outputs, full scan on
the close commit): for gate modes blocking, warn and off and a finding,
clean and crashing scanner, plus a missing scanner, the postimage check
blocks exactly when the full scan exits 2, and its result never carries
a matched value. scanClosePostimages takes the same optional
assessTrustedExecutablePath seam as runSecurityScan so a fixture binary
can run; the production default is unchanged.

AI-Assisted: true
Dispatch: stage-0 (elephant)
