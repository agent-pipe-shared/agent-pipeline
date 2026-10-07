# Critic record — B-S1 hardened private temp root, round 1 (full)

- Route: requested claude-opus-5-5 at max; effective identity claude-opus-5-5 (observed); lane functional-equivalent-read-only, OS isolation not asserted.
- Review object: 891bbc39e, 156e68c6b.
- Verdict: **FAIL**. Trajectory: consistent.
- F1 major: `plugins/pipeline-core/lib/test-private-tmp.test.mjs` is not registered in Verify (`harness/scripts/verify.mjs`, `harness/verify-suites.json`; both protected TP-3/TP-13) — "an unregistered suite is a test that protects nothing" (`verify.mjs` ~443).
- F2 minor: exit cleanup (`test-private-tmp.mjs` ~84) and the refusal codes `PRIVATE_TMP_ROOT_NOT_SECURE`, `PRIVATE_TMP_ROOT_INSIDE_REPOSITORY`, `PRIVATE_TMP_PREFIX_INVALID`, `PRIVATE_TMP_PREFIX_ESCAPES_ROOT` have no test; the POSIX branch never ran.
- Disposition: F1 → the verify-registration slice of the signed package (P9 / Q11 / T33 list), together with every other new suite of the candidate: `lib/test-private-tmp.test.mjs`, `lib/scratch-retention.test.mjs`, `scripts/scratch-sweep.test.mjs`, `lib/design-consistency-check.test.mjs`, `lib/design-review-receipt.test.mjs` (and U3 when it lands), with the QG-08 capability-inventory mapping. F2 → test-only dispatch B-S1-T2. POSIX branch → the R7-11 F2 POSIX/WSL matrix run before the stamp.
