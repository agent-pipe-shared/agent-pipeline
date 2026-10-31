# w8-scanner-fixtures-have-a-push-remote-and-a-host-independent-verdict (held patch, not applied)

Causes of the red `security-scan` and `security-scanner-diagnostics` suites (test-side drift, no product change):

- `security-scanner-diagnostics` G13D020 and G13D021: the producer fixture's repository had no remote. Since G32-SECURITY-REMOTE the scan binds the candidate snapshot to the
  effective push remote, so the missing-tool and synthetic-Semgrep cases ended in `ERROR` (`remote-missing`) instead of `SKIPPED` / a clean v1. The fixture now adds an
  `example.invalid` `origin`, like the other security fixtures.
- `security-scan` CLI smoke: it expected `Verdict: INCOMPLETE` for a bare root with a blank `PATH` and empty `HOME`, but a scanner installed in a standard system location
  (here gitleaks in `/usr/local/bin`) is found regardless of `PATH`, so the product correctly prints `PARTIAL`. The assertion is now exact for what ran: `PARTIAL` when any
  scanner line reads `OK [success]`, otherwise `INCOMPLETE`; it still never accepts a clean verdict. The summary-level cases above it pin both exact verdicts.

Measured with a short private `TMPDIR` outside every repository, as `scripts/full-verify.mjs` provides; inside a repository a bare fixture directory sees that repository's remotes
(`remote-ambiguous`), which is not the Verify condition.

Evidence (clean clone): `security-scan` 170/170 (169 of 170 before), `security-scanner-diagnostics` 32/32, `security-scan-v2-integration` 9/9, `security-scan-snapshot` 4/4,
`security-scan-large-inventory` 1/1, `security-scanner-failure-provenance` 13/13. Applies to the repository HEAD.
