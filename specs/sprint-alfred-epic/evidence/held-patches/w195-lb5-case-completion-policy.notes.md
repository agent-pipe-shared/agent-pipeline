# w195 — the onboarding continuity case-completion policy lists the three LB5 cases (candidate 19c)

Found by the first Full Verify of the whole 19c chain (`onboarding-continuity-tests`: all 327 cases green, exit 1 with `VERIFY-CASE-COMPLETION-DECLARATION`).

- w181 added three LB5 cases to `plugins/pipeline-core/lib/onboarding-continuity.test.mjs` and moved its corpus assertion from 324 to 327, but the declarative case-completion policy in `harness/config/verify-case-completion-augmentations.v1.json` still listed OBC001-OBC324. Verify compares the ids the suite declares with that policy, so the suite was red although no case failed.
- Fix: `OBC325`, `OBC326`, `OBC327` appended to the policy `caseIds` (a strictly monotone extension of the previous ordered set, so `previousPolicySha256` stays valid).
- Evidence: `check-verify-case-completion.test.mjs` (32 cases) and `check-verify-case-completion-augmentation-policy.test.mjs` (8 cases) green on the work clone; the suite alone, run without the Verify completion descriptor, was already green (327 of 327).
- Not run: the suite under the Verify runner with the completion descriptor (about 11 minutes); the policy extension is by construction, the ids are sequential.
