test(verify): register the two Spec addendum suites

The rehearsal of the candidate 28e chain ran the registration check on
the applied tree: spec-addendum.test.mjs and
spec-addendum-registration.test.mjs were suites under a registered root
with no verify.mjs entry, so Full Verify would not have run them.

- harness/verify-suites.json: two entries appended (no existing entry
  changed).
- docs/product-capability-inventory.json: both surfaces categorized in
  the capability that holds the Critic course and close suites.

check-verify-suite-registration: 1219 registered, 0 unregistered.
check-verify-case-completion: valid.

AI-Assisted: true
Dispatch: stage-0 (elephant)
