# Known Issues

## V3 foundation transfer — 2026-07-20

The V3 Public Core transfer is recorded under an explicit PO course exception.
That earlier exception was not and is not a Critic PASS. It remains a transfer
disposition, not a review verdict or release approval.
No push was performed.

The public marketplace URL, its self-application assertions, the current
PO-language failure text, the standing-approved push-gate assertion, the public
inventory baseline, and the three reproduced documentation links were
reconciled on 2026-07-20. The inventory baseline now resolves to the committed
Public V3 Foundation candidate.

| Issue | Scope | Required follow-up |
| --- | --- | --- |
| Recovery-preview callback attestation can accept a no-op callback in the migration library. | V3 migration recovery path | Prioritized design item: [attest recovery-preview callback delivery](../backlog/items/2026-07-20-recovery-preview-callback-attestation.md). |
| Formal review/dispatch aborts can force broad repeat runs without a new domain finding. | Review workflow | Prioritized design item: [bound review retries to valid evidence](../backlog/items/2026-07-20-evidence-bound-review-retry-economics.md). |
| The portable verification aggregate still invokes the machine-local PO-gate-authority CLI. | Public verification packaging | Remove only that aggregate entry, retain the CLI's unit/runtime fail-closed behavior, and then remove its inventory verify-phase mapping. The protected verifier was not bypassed during this stabilization. |
| Direct-history Gitleaks reports exactly three `generic-api-key` findings, all deterministic idempotency fixtures in `harness/scripts/pipeline-state.test.mjs`; the earlier count of seven is obsolete. | Security verification | Replace the three secret-like fixture strings with non-secret deterministic identifiers, remove only their obsolete exact suppressions, and require a clean direct-history rescan. The protected test was not bypassed and no broad suppression was added. |
