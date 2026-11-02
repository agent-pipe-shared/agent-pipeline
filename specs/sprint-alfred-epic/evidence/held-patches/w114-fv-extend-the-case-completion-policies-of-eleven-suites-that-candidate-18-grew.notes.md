# w114: extend the case-completion policies of eleven suites that candidate 18 grew

Finding of the Full Verify 3 (home-directory clone, `f2fadf330` plus the second apply script): 11 suites were red in the full run in both Full Verify runs and green when run alone.

## Cause

The Full Verify runs a suite as plain `node <file>` with descriptor 3 open (`PIPELINE_VERIFY_CASE_COMPLETION_FD`) and rejects it (`VERIFY-CASE-COMPLETION-DECLARATION`, exit code forced to 1) when the suite DECLARES case ids its registered policy does not list. Run alone (`node --test <file>`), no descriptor is announced, so nothing is checked and the suite is green. Candidate 18 added cases to these suites without extending their policies:

| Suite | Policy ids before | Declared |
| --- | --- | --- |
| agy-host-commit-admission-tests | 8 | 16 |
| agy-host-commit-execution-tests | 13 (inline) | 15 |
| commit-message-policy-tests | 42 | 43 |
| dispatch-record-write-tests | 40 | 46 |
| native-goldfish-host-return-tests | 9 | 11 |
| claude-intake-prompt-capture-tests | 3 (verify-suites.json) | 6 |
| po-human-approval-signing-handoff-tests | 5 | 6 |
| guard-dispatch-tests | 81 | 82 |
| critic-course-admission-tests | 82 | 85 |
| critic-dispatch-preflight-tests | 89 | 91 |
| native-goldfish-host-finalizer-tests | 31 | 48 |

The Full Verify keeps no failure output of a red suite, so the cause was found by running each suite the Full Verify way and validating the stream with the clone's own `parseVerifyCaseCompletion`.

## Change

Only `harness/config/verify-case-completion-augmentations.v1.json`, following the existing precedent: a source policy (inline in `harness/scripts/verify.mjs` or in `harness/verify-suites.json`) is never edited. An existing augmentation row gets the full declared id list (strict ordered extension); a suite without a row (`agy-host-commit-execution-tests`, `claude-intake-prompt-capture-tests`) gets a new row bound to the sha256 of its source policy (`previousPolicySha256`). `maxBytes` is unchanged.

## Verified in the fix clone

Each of the 11 suites accepted by the parser against the new policy (checked individually for three, produced from the declared streams for all); `check-verify-case-completion-augmentation-policy` 8/8, `verify-case-completion-augmentation` 19/19, `check-verify-case-completion` (VCR01) 32/32, suite registration 1150 registered, 0 unregistered. The proof that the full run is green is the next Full Verify.

## Follow-up (candidate 19)

The tool that produced the change is a scratch helper (it runs a suite the Full Verify way and extends its policy). Because every candidate that grows a suite needs it, it belongs in tracked `scripts/` with a header and a line in `docs/operating-tools.md`.
