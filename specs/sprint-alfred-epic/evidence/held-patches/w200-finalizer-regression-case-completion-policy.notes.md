# w200 — the finalizer regression case-completion policy lists NGHF08 (candidate 19c)

Found by re-reading the red excerpt of `native-goldfish-host-finalizer-regression-tests` from the first Full Verify of the whole chain. It had been classified as "red only under load" because the suite is green alone; the excerpt says otherwise: `fail 0` and `VERIFY-CASE-COMPLETION-DECLARATION`, the same class as w195.

- w165 added case `NGHF08` (the pending-unavailable stop failure names its cause and the recover helper) to `native-goldfish-host-finalizer-regression.test.mjs`, so the suite declares NGHF05-NGHF08, but `harness/config/verify-case-completion-augmentations.v1.json` listed NGHF05-NGHF07.
- Fix: `NGHF08` appended to the `caseIds` (a strictly monotone extension; `previousPolicySha256` stays valid).
- Evidence on a work clone: `check-verify-case-completion.test.mjs` 32/32, `check-verify-case-completion-augmentation-policy.test.mjs` 8/8, the suite alone 4/4.
