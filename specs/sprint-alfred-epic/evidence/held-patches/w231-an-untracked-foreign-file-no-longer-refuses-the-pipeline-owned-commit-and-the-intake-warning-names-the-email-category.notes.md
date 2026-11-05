# w231: an untracked foreign file no longer refuses the pipeline-owned commit, and the intake warning names the e-mail category

Elephant-built small items (PO exception for small items). The patch is a delta on w225 to w228. Criterion binding: AC-108 is the closest existing accepted criterion; the PRD and the Spec are unchanged.

## What it changes

- `scripts/commit-pipeline-owned.mjs`. Found live on the Windows consumer, 2026-11-05: the PO's untracked forensic report refused the commit of the queue with `CPO-FOREIGN-CHANGES`, and the peer had to exclude it locally to go on. `git add` and `git commit` name only the owned paths, so an untracked file can never enter the commit. Such a file is now listed in `untouched` and does not refuse. A modified, staged or deleted tracked file still refuses with the same code and reason, because the clean-tree checks this command serves would refuse it anyway.
- `lib/onboarding-continuity.test.mjs`, OBC242 extended (E5 rest): the intake warning reports the e-mail category by its own name, matched case-insensitively and between word boundaries as `derivePatterns` builds an address, and the warning never carries the value. The fixture feeds the category a whole word of the generated text, because the generated text holds no address.

## Checks

- `commit-pipeline-owned.test.mjs`: 4 of 4 pass, two new cases (untracked listed and the owned path committed by its own pathspec; a modified tracked file still refuses with the untracked one named apart).
- `onboarding-continuity.test.mjs`: 327 of 327 pass. The first run failed in OBC242 because a 12-character slice ended inside a word, which the e-mail boundary does not match; the fixture now takes a whole word.

## Not changed / not proven

- The clean-tree checks of push-prepare, push-init and the PO approval are unchanged: an untracked file still makes those refuse, as before.
- `docs/push-release-flow.md` still says the command refuses when anything else is dirty. That line changes together with the queue split (w229), which rewrites the same paragraph.
- The e-mail category is fed through a local pattern of that category. A real `user.email` read through git is not exercised, because the generated text holds no address.
- No full Verify run, no independent Critic review, no Windows run.
