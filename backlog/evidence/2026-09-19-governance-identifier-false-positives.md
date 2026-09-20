# Governance identifier false positives

Scope: exactly two public deterministic GMW revoke decision identifiers. The entries are content-v1 authorities generated from normalized real findings; they bind content, rule, repository-relative path, line, and column.

- Producer: `plugins/pipeline-core/lib/guard-authority-ledger-intake.mjs` (`revokeDecisionId`, `buildAppendIntent`).
- Scanner: trusted gitleaks executable identified only by SHA-256 in the JSON evidence.
- Original isolated scan: two retained findings. Corrected isolated scan: zero retained, two ignored.
- Negative controls: synthetic identifiers retain two findings; an unlisted-path copy retains one finding while the two originals remain ignored.

The JSON companion is machine-generated from the real isolated scans. This is not native Security, full Security/Verify, publication, or signing acceptance.
