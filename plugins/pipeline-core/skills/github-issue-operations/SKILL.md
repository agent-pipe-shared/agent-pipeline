---
name: github-issue-operations
description: Perform explicit, project-scoped GitHub issue reads, creates, and narrow edits with local gh authentication, exact previews, confirmation, and readback. Use when a consuming project asks the pipeline to work with that project's GitHub Issues.
---

# Project-scoped GitHub issue operations

This skill is separate from Public observation capture. It may target only the
repository the user explicitly selected or the validated project remote after
showing the resolved `owner/repo`. It never widens the fixed Public observation
repository allowlist.

## Required sequence

1. Resolve one target repository. Prefer an explicit user selection; otherwise
   read the consuming project's configured remote and resolve it through `gh
   repo view`. Do not infer a target from the pipeline repository or an
   unvalidated URL.
2. Verify local authentication with `gh auth status` and issue/metadata access
   with read-only `gh api` calls. Never request, print, store, or commit a PAT.
   A missing login, target mismatch, or insufficient permission is a typed
   setup failure.
3. Construct the exact mutation through
   `scripts/github-issue-operations.mjs`: create or edit only title, body, and
   labels. Delete, transfer, close, reopen, milestones, projects, assignees,
   permissions, and repository settings are not supported by this skill.
4. Show the resolved repository, operation, issue number (or create marker),
   all changed fields, and labels. Require explicit confirmation for this exact
   preview; a changed preview requires a new confirmation.
5. Execute the confirmed `gh api` mutation with structured arguments. Keep the
   authentication in the local `gh` credential store; it must not appear in the
   command text, issue body, logs, or evidence.
6. Read the issue back from the exact target and validate it with the helper.
   Require the expected issue number, stable URL, target repository, and exact
   changed fields. A failed or mismatched readback is `publish-unverified`, not
   success.

The current setup and PAT guidance is documented in
[`docs/github-issue-operations.md`](../../../../docs/github-issue-operations.md).
