# w111 - restate four pins for the candidate 18 changes

## What

Four pins that were green at the candidate 17 base and red after candidate 18, each because a candidate 18 behaviour changed on purpose. Every restatement keeps the intent and carries a QG-04 comment:

- `plan-submission-must-not-require-separate-po-approval.test.mjs` (AC1): a project without a verify command now gets one informational line naming `configure-verify` (C18-2); the clean-submission pin allows exactly that line on stderr and nothing else.
- `consumer-spec-criterion-binds-the-first-item-delivery.test.mjs`: a content hash of the loaded plugin root is a deterministic identity and is reported through `rulesetIdentitySource`, no longer as a `DBG-RULESET-FALLBACK` warning (C18-9); only the lesser installed identity still warns (pinned beside it).
- `measure-tofu-push-e2e.test.mjs`: the signing step refuses before the passphrase prompt when `pipeline.user.yaml` differs from HEAD (A18-M2), so the typed stop of the walk is `PO-SIGN-APPROVAL-MODE-UNCOMMITTED` (or `PO-KEY-UNENCRYPTED` with a committed file). Product note for the greenfield tests: a fresh onboarding leaves that file untracked at the plan-acknowledgement signature, so the PO meets this refusal there; it names its repair.
- `agy-final-return.test.mjs` (AFR18): the host-commit drift refusal now names `detail.conditions` (C18-1a); the pin carries the exact detail.

## Why

Found by the Full Verify of candidate 18; each was green alone at the base and red alone after the chain, so they are candidate-caused, not load.

## Verification (orchestrator, in a clone at the applied candidate 18 tree)

`plan-submission` pin 21/21, `consumer-spec` pin 30/30, `measure-tofu-push-e2e` 9/9, `agy-final-return` 18 tests (16 pass, 2 todo as before). Patch applies to HEAD (`apply --check` exit 0).

## Apply order

After w110.

## Not proven

Whether the untracked `pipeline.user.yaml` at the plan-acknowledgement signature is acceptable for a first-time PO (candidate 19 item if the greenfield test hits it).
