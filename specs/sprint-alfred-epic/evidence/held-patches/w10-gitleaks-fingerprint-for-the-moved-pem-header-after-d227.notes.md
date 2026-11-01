# w10-gitleaks-fingerprint-for-the-moved-pem-header-after-d227 (held patch, not applied)

Follow-up to `w8-gitleaks-fingerprint-for-the-moved-pem-header-constant`. The Full Verify `fv10` of the stamped candidate 15b (1144 steps, HEAD `9d880df34`) had exactly one red step, `security-scan`:
gitleaks reported 1 unresolved finding (151 suppressed by fingerprint), the rule `private-key` in `plugins/pipeline-core/scripts/po-human-approval.mjs` at line 1680, column 22.

Review: the line is `if (pem.includes("-----BEGIN PRIVATE KEY-----")) return "unencrypted";` in `classifyPoPrivateKeyArmor`, a PEM header literal in a detection check, not a key. The D227 patch added two lines before it, so
the line-bound entry for line 1678 went stale. The adapter itself recomputed the new entry (diagnostic text of the red step); nothing is widened and the stale entry stays as a harmless record.

Change: one comment block and one `content-v1` line appended to `.gitleaksignore`.

Evidence: in a throwaway clone at HEAD `f45ef4529` with the entry committed, `node plugins/pipeline-core/scripts/security-scan.mjs` exits 0: gitleaks PASS (0 findings, 152 suppressed), osv-scanner SKIPPED, semgrep PASS, license-check PASS, candidate clean.

Caveat: the entry is bound to line 1680; any later edit of `po-human-approval.mjs` above that line moves it again. Apply after the D227 patch and before any further change of that file.
