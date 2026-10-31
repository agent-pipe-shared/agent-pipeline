# w8-gitleaks-fingerprints-for-117-reviewed-false-positives (held patch, not applied)

Cause of the red `security-scan` Verify step: the scan reads a snapshot of the tracked tree (git-ignored files never enter it), and 117 findings in tracked files had no entry in
`.gitleaksignore`. Measured with the adapter's own `normalizeCandidateFindingPath` and `gitleaksContentAuthorityLine` against the clone: 152 tracked findings, 35 already covered, 117 unresolved.

PO decision (2026-10-31): individual fingerprints, no change of `.gitleaks.toml`, no new allowlist, PF-99 and the "no allowlist" pins stay true. (A first proposal named the
`gitleaks-repair-ignore.mjs` two-phase gate; that gate accepts only a domain name as reviewed value and is for repairing a moved line, so it does not apply. The entries are generated the way
the 35 existing ones were: with the adapter's exported `gitleaksContentAuthorityLine()` from the normalized real findings.)

Review: classified by shape and location, code lines inspected directly. Frozen evidence and implementation records under `specs/` carry bare SHA-256 or SHA-1 digests and archived checkpoint copies of
source files; test lines are deterministic synthetic identifiers and tokens that self-describe as fake; `po-human-approval.mjs:1728` is a string constant that detects an unencrypted key file;
`project/pipeline-state.json` carries state digests. No value is quoted in the patch or in the comment block.

Change: one comment block and 117 `content-v1` lines appended to `.gitleaksignore`. Each binds exact path, rule, line, column and the SHA-256 of the matched value; nothing is widened.

Evidence (clone): the unresolved-findings tool reports tracked covered 152, unresolved 0; `gitleaks.test.mjs` 24/24; `security-scan.test.mjs` exit 0. Line-bound by design: an edit above one of these lines
makes its entry stale (the near-miss diagnostic and `gitleaks-repair-ignore.mjs` handle that case). This patch must apply last in the bundle, after every patch that moves a line in the files it names, and
after the final rebaseline; re-run the unresolved-findings measurement on the applied tree before relying on it.
