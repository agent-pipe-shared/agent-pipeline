# Critic record — R7-6 signing readiness, round 1 (full, partial)

- Route: requested claude-opus-5-5 at max; effective identity claude-opus-5-5 (observed); lane functional-equivalent-read-only, OS isolation not asserted.
- Review object: cbeec939f, efb735421, 11b8f5cc4, b365c009a, 9a54c453f, b6e529fd0.
- Verdict: **withheld — partial review** (budget checkpoint; `evidence/r7-6-f-after.txt` exits 1 and the failing cases were not identifiable from the artifact; baseline also exits 1). Trajectory: not verifiable.
- F1 major: §22.6 only partly delivered — prepare-for-signature probe, read-only readiness-check hand-over, install/update and bootstrap reporting, neutral-directory hand-over text have no code or test in the object.
- F2 major: typed repair `set-po-key-directory` has `executable`/`argv` null (`po-human-approval.mjs` ~855) — not agent-runnable; gap only in a code comment (QG-06).
- F3 minor: `setup --directory` still writes the per-repository store (~1655); test PO-KEYDIR-01(A) pins it (T14: stored outside every repository).
- F4 minor: an environment-variable tier sits between legacy and absent (~748; §22.6 T14 order explicit → machine → legacy → absent).
- F5 minor: with zero committed anchors sign-intent opens the private key before reporting `key-anchor-mismatch` (~1005; "never opens the private key file").
- F6 minor: probe cwd falls back to `os.tmpdir()` (~917); no-safe-directory and local I/O failures are classified `openssl-no-ed25519` with a replace-OpenSSL repair (~920, ~943).
- F7 minor: on win32 the probe runs from the home directory — not covered by PO decision R or the residual item; decoy test plants nothing in the probe cwd.
- F8 minor: `PATH_REDACTION` (~825) stops at whitespace; paths with spaces are partly redacted.
- Not reached: per-test baseline/after comparison; what `persistExplicitDirectoryPointers` writes; anchor source in `readCriticalHumanProofPolicy`; guardrail files.
- Disposition: F1/F2 → protected parts in the signed package plus the R7-7-F3 prepare-for-signature gate (in flight). F5, F6, F8 → test-only then fix. F3, F4, F7 → PO question (they change setup/env behaviour or residual scope). One delta Critic remains (decision A), with a per-test failure list supplied as a separate small artifact.
