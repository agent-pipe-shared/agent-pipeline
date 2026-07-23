## What & Why

<!-- Briefly describe the change and the motivation behind it. -->

> The CLA process is active. `NOTICE` identifies André Twachtmann as legal
> rightsholder for Agent-Pipeline project-authored content and CLA contracting
> party, excluding inventoried third-party material, and records the named human
> rightsholder-review approval dated 2026-07-23. Merge still requires both the
> DCO sign-off and the Contributor's own checked, current-version CLA acceptance
> below. No private address, email address, or private-account link is required.

## Checklist

- [ ] `node harness/scripts/verify.mjs` passes locally
- [ ] All commits are signed off (`git commit -s`) per the DCO
- [ ] **CLA acceptance — Agent-Pipeline CLA v1.0 (SHA-256: `d2fe49f26b6609e367e915ae484131dde3c66f7a78af97952513a9188a6fc21b`) — I, @REPLACE_WITH_PR_AUTHOR_LOGIN, have read and expressly accept this CLA for every contribution in this pull request and confirm that I have the rights needed to make its grants.**
- [ ] Commits are small and atomic, using Conventional Commits messages
- [ ] Documentation updated where relevant
- [ ] No secrets, tokens, or machine-specific paths included

Replace the login placeholder with the exact pull-request author login and
personally change only `[ ]` to `[x]`. The checked, versioned, digest-bound CLA
item is the acceptance record for this pull request. The `contributor-gates`
check fails for a missing, unchecked, malformed, differently bound, or stale
record; changing the CLA invalidates earlier acceptance. A maintainer, bot, or
submission automation must not check or rewrite it on the Contributor's behalf.
After every `synchronize` or `reopened` event, the pull-request author must
personally uncheck the CLA item and save the body, then re-check it and save
again on the current head. Maintainers, bots, and submission automation cannot
perform that refresh for the Contributor.
