# w39 — the feature close reads a residual-accepted Critic/Verify lifecycle, and the package plan prints its digest (candidate 15e, close hotfix)

Found by the first real consumer run of the audit route (Toolbox, 2026-11-01, build 15d): steps Verify, register, `verifying`, `completed` passed; `close-coordinator.mjs plan-transition --phase feature-close-prepared` then refused
`CVL-CRITIC-FAILED` ("feature close requires the exact private Critic/Verify lifecycle receipt"). Built by the Elephant under the PO's exception for the close topic; held until the PO applies it.

## Cause

The Verify producer loads the PO's residual acceptance (`loadResidualAcceptanceDepsForPacket`) and records it in the lifecycle receipt. The three close-side readers (`close-coordinator.mjs` `auditLifecycleReadback`, its apply-time read, and `pipeline-state.mjs` `close-feature`) call
`readCriticVerifyLifecycle` with no residual deps. `readBoundConsumedCriticReceipt` then sees a failed Critic receipt (`reviewPass` false) without an acceptance and throws `CVL-CRITIC-FAILED`, so any receipt accepted through a residual acceptance could be produced but never closed.
The 15d chain test used a passing Critic receipt and so never exercised this.

## What

1. `lib/critic-verify-lifecycle.mjs` `readCriticVerifyLifecycle`: when the stored receipt records a residual acceptance and the caller passed none, it loads the acceptance for that receipt's packet from the private record (`loadResidualAcceptanceDepsForPacket`, no import cycle) and uses it for the carry-forward inspection and the bound receipt read. Caller-supplied deps always win; a passing receipt is untouched.
   The loader still re-verifies the acceptance NOW, so an expired or revoked acceptance refuses. This follows the PO's answer on N36 (keep the check): the signature window (about six hours) must therefore cover the close read too, not only the Verify run.
2. `lib/review-admission-read.mjs`: when an acceptance is on record but no longer verifies, `CVL-CRITIC-FAILED` now says so and names `approve-residual-acceptance --by <name> --critic-packet <id>`; without a recorded acceptance the text is unchanged (the code is the same, so no caller changes).
3. `close-coordinator.mjs`: the generic "requires the exact private Critic/Verify lifecycle receipt" refusal now appends the underlying message.
4. `pipeline-state.mjs`: `feature-package-plan` prints `planSha256` on a previewed transition (the digest of the plan object that `feature-package-apply --plan-sha256` recomputes). A consumer had to derive it from `lib/governance-event.mjs`.

## Tests

`lib/critic-verify-lifecycle.test.mjs`: new case "candidate 16" (name kept from the build; this is 15e): a failed receipt with a private acceptance record is recorded, then read with NO residual deps and succeeds (same receipt digest); an acceptance that no longer authorizes refuses with the new text; another common dir has no receipt.
Red before the fix (`Critic findings remain unresolved; Verify cannot attest this candidate`). `scripts/pipeline-state-rebind-mutable.test.mjs`: the chain case now takes the digest from the plan output and asserts it equals the recomputed one.
Targeted run on the clone: lifecycle, readiness, rebind-mutable chain, close coordinator audit lifecycle, verify-evidence-producer, kernel closure, course admission, case completion 215/215.

## Not done

The close coordinator is not driven end to end with a residual-accepted receipt in a fixture (the reader the coordinator calls is). The first real run is the Toolbox's `plan-transition`. Not a Full Verify, no Critic (paused), no native Windows run, no PO acceptance.
