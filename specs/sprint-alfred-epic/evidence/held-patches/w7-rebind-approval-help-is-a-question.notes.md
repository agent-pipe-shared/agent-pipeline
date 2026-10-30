# rebind-approval --help is a question (PO exception: Elephant builds small items, 2026-10-30)

Held patch `w7-rebind-approval-help-is-a-question.patch`, built by the Elephant in a scratch clone at 463fa9a14. Nothing applied.

## Behaviour

`pipeline-state.mjs rebind-approval --help` executed the rebind and wrote a device-local receipt. Now `--help` and
`-h` print the verb's usage and exit 0 without running anything; any other argument is refused with exit 2 ("takes
no argument"), since the verb takes none.

## Evidence

- New case R7-5g in `scripts/rebind-approval.test.mjs`: both flags exit 0 with usage and no rebind result; `--by
  someone` exits 2; State bytes unchanged; no receipt written.
- Suite: 10 pass, 1 todo (the pre-existing inspect todo). Revert proof: R7-5g fails without the fix.
- Stack check: applies cleanly after D195, D196-on-D195 and the vendored refresh.

## Related, not in this patch

The stale-approval repair texts already name `rebind-approval` (`native-goldfish-host-state.mjs` staleApprovalRepair,
`calibration-verify-commit-transition.mjs`); the matrix reason is stale on that point. Offering rebind-approval
next to reopen-design in onboarding `inspect` stays open: its test is a todo because the throwaway-clone fixture never
reaches the ready branch.

## Not verified

Full Verify, Critic, native Windows, PO acceptance.
