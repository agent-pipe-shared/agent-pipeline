# Held patch w8-d215-mini-plan-acknowledgement-is-the-first-approval (Elephant-built)

D215 (PO decision 2026-10-31): for profile mini the plan acknowledgement asked early (before the bootstrap bind, because the staging PRD/Spec pair must carry
its marker before it can become bindable authority) is the one signed plan decision. It counts as the first of the two per-feature approvals of the happy path;
the push approval is the second. It is never a third.

Change (text and pin comment only, no behavior): the plan-approval row of `docs/human-authorization-inventory.md` carries the Mini clause; the inventory in
`lib/pins/three-runner-happy-path-with-two-po-approvals.test.mjs` carries a comment next to the `plan-approval` entry (the extra-entry case below it already
refuses a separate acknowledgement entry, so the count stays two).

Suites green in the clone: the two-approvals pin (21 pass, 1 skipped for the native-host evidence) and `check-auth-gate-inventory-drift.test.mjs` (35). The apply script runs
the inventory rebaseline and the Reader-input sync afterwards. Applies on candidate commit 57d171279 (`git apply --check` exit 0).
