# W7-N14 -- notes (state: HELD, built by the Elephant in a scratch clone under the D192 exception)

Candidate `92bbe5c2c`, stacked on `w7-d199-critic-rounds-uncapped-in-batch-and-after-pass` (disjoint files; the chain applies in order, apply-check exit 0). Patch: `w7-n14-registration-refusal-names-the-failing-field.patch` (4 paths). Backlog item: `2026-10-29-a-new-item-course-is-refused-with-cac-registration-invalid-and-no-reason` (Toolbox N14).

## What it delivers

`CAC-REGISTRATION-INVALID` stood for nine different checks of one condition in `readAcceptedDeliveryContract` and said which one failed nowhere. Now:

- `scripts/pipeline-state.mjs`: new `acceptedRegistrationFault` names the first failing check in the original order (resolver status, `featureId`, `manifest`, `path`, `sha256`, `class`, `authority`, `mutability`, `retention`) with the observed and the required value (digests shortened to 12 characters). The reader returns it as `detail`; `observeCurrentPlanApprovalForCalibration` carries it as a third argument of `unavailable(...)` (the frozen result gains `detail` only when there is one, so existing shapes are unchanged).
- `lib/native-goldfish-host-state.mjs`: the item-course refusal appends the detail to its `reason`, and `staleApprovalRepair('CAC-REGISTRATION-INVALID')` names `register-feature-package.mjs` (registers the envelope, prints the paths to commit) instead of the generic "read inspect" line.
- `lib/feature-package-registration.mjs`: the five `FPR-REGISTRATION-NOT-RESOLVED` refusals and `FPR-ENVELOPE-UNAVAILABLE` carry `readerDetail` next to `readerCode`.
- Test: the existing pin "(a) before registration the first item course is refused CAC-REGISTRATION-INVALID" now also asserts that the reason names the failing field and the repair names the registration script.

## Checks (scratch clone)

- `lib/pins/consumer-approved-plan-reaches-the-first-item-host-commit.test.mjs`, `scripts/repair-map.test.mjs` (it greps the literal `code:"CAC-REGISTRATION-INVALID"`, kept), `lib/pins/stale-approval-repair-names-rebind-approval.test.mjs`: exit 0. The broader suites (`feature-package-registration`, `native-goldfish-host-state`, `critic-accepted-contract`, `pipeline-state`) are listed in the candidate notes.

## NOT in this patch / open

- Not reproduced on the consumer's repository state (the exact steps are in the consumer's handover list, owed). The pin reproduces the fresh-consumer variant only; the Toolbox variant ("`inspect` shows the approval valid") may fail on a different field, which this patch will now name.
- `inspect` does not yet run the registration reader, so it can still show a valid approval while the reader refuses (the second wanted point of the item).
- Full Verify, batch Critic and PO acceptance remain pending. Kernel paths: the PO applies the patch in the same ceremony.
