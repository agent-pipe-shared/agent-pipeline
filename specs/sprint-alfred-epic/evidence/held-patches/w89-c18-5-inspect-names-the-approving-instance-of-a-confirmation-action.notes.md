# w89 — inspect names the approving instance of a confirmation action and says two gates exist (candidate 18, C18-5)

Edits `plugins/pipeline-core/scripts/pipeline-state.mjs` (only `buildLateVerifyRecoveryAction` and one new constant beside it) and `plugins/pipeline-core/scripts/pipeline-state-late-verify.test.mjs`. Criterion binding: AC-140 is the closest existing accepted criterion (fresh bounded attempt under its unchanged Spec text); the PRD and the Spec are unchanged.

## What it adds

The late-verify recovery action that `inspect` returns for `configure-verify` now carries, on the action and on its `applyAction` (where `requiresConfirmation: true` lives):

- `approvingInstance: "human"`: who clears the confirmation (the PO or the runner permission prompt); never the pipeline itself.
- `gates`: a closed list of three sentences: the Pipeline asks for confirmation; the runner's permission layer may refuse the same call independently; if the runner refuses, ask the PO to allow that exact command once, do not retry the same call in a loop, do not edit calibration directly.
- the `guidance` text now mentions the human approver and both gates.

## Why

In a consumer run the runner's own auto-mode classifier refused the same call as a second, invisible gate; the follow-up took 361 minutes. The action now says up front that two gates exist and what to do.

## Unchanged

All existing keys and values, the codes, and the `applyAction` argv. The `configure-verify` handler is untouched.

## Tests

The new assertions were added to the existing happy-path case of `pipeline-state-late-verify.test.mjs` (no new test file, so no registration is needed). Written first and RED against the original code (`approvingInstance` undefined), then GREEN. No existing assertion moved or was weakened; no other test pins the action's JSON (searched for `requiresConfirmation` in plugin and harness tests).

## Checks

- `pipeline-state-late-verify.test.mjs` in the slice clone: 2 of 2 pass (RED before the edit, 1 fail).
- The patch applies to the real HEAD (`git apply --check` exit 0); the w89 check file pins that and the touched-file list.

## Not changed / not proven

- The settings allowlist merge scope is NOT widened. Follow-up: a pre-granted permission rule for this exact command needs a parser-proven closed scope in `settings-allowlist-merge.mjs`.
- The runner's refusal itself cannot be observed here; the full Verify and a consumer run were not made.
