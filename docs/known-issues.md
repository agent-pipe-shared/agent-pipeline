# Known Issues

## V3 foundation transfer — 2026-07-20

The V3 Public Core transfer is recorded under an explicit PO course exception.
It is a transfer disposition, not a Critic PASS and not a release approval.
No push was performed.

| Issue | Scope | Required follow-up |
| --- | --- | --- |
| Recovery-preview callback attestation can accept a no-op callback in the migration library. | V3 migration recovery path | Bind the preview callback to a non-empty, attested delivery before treating a recovery result as successful. |
| Formal review/dispatch aborts can force broad repeat runs without a new domain finding. | Review workflow | Implement a narrower, evidence-bound retry path and retain prior valid receipts. |
| The full verification aggregate contains legacy/self-application assumptions that do not yet hold for the fresh Public-Core branch. | Public verification packaging | Reconcile the aggregate's root assets, PO receipt precondition, runtime-profile expectations, and fixture handling. |
| Gitleaks reports seven high-severity generic-key matches in test fixtures. | Security verification | Review each fixture, remove any real secret, and otherwise use a narrowly justified false-positive treatment. |
