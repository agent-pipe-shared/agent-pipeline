# GitHub Actions token permissions

Repository and organization defaults are not a security boundary: a workflow must declare its token permissions explicitly, even when those defaults currently look restrictive.

Workflows use `contents: read` at workflow level and disable checkout credential persistence. A job that genuinely publishes may request a narrow write scope only through the sole policy authority, `governance/github-actions-permissions.json`, with an owner, justification, and unexpired date. The checker rejects broad/root writes, wildcard entries, and unused policy entries. No write or persisted-credential exception is permitted in an untrusted `pull_request` workflow.

Run `node harness/scripts/check-github-actions-permissions.mjs` to inspect every workflow deterministically. Tests may pass `--date YYYY-MM-DD` to avoid clock-dependent fixtures.
