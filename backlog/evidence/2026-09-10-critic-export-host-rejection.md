# Critic export host rejection and bounded consent work

Candidate `916bcf1442d175ac32448be0a6cda5ea4d4bee1d`, tree
`d847b47293ef0554984f709e01abdc1e2a559e62`, passed all 517 full Verify steps,
with zero reuse and security exit 0. The main-checkout receipt is
`evidence/verify-1789033786332-8be34ac219bab71f.json`.

The native nineteen-artifact review started successfully after a passing
same-host native read/write-denial probe. Attempt
`scratch/NVA-INVENTORY-CLEAN-INPUT-1/attempt-1789034035652-f4e464226d6adb77ed620b8c`
returned `child-timeout` at the 1,200,000 ms absolute cap. Its model turn did
not complete, no verdict was returned, and its terminal receipt reports
`SIGTERM` and `cleanupStatus: incomplete`. This is not a passing or substantive
failing review. The receipt does not prove that an orphan process remains.

Two prepared bounded packets partition the same nineteen artifacts into eight
inventory/public-claim artifacts and eleven reader-integration/regression
artifacts. Their scopes have no overlap or omission; their source bytes and
Verify evidence were already in the original submission. The local mechanical
readback is `scratch/NVA-INVENTORY-CLEAN-INPUT-1/bounded-scope-readback.json`.
It proves scope equality, not human consent or network endpoint identity.

Automatic host approval review rejected both starts because the action can
transfer private repository content to the configured Codex/model service.
The host reviewer did not accept the recorded standing-consent pointer or
the already-submitted-source comparison as explicit authorization for that
transfer. The subsequent reconsideration was rejected on the same ground.
No run marker or result exists for either bounded packet after those refusals.
No alternate transport or execution tool was used to perform the denied export.

The PO rejected Full Access as the solution and explicitly requested a
one-time project/service-bound consent workflow with a direct follow-up test:

> okay baue das so ein und dann versuchen wir es direkt damit! ich ändere jetzt nicht auf full access

Implementation task `NVA-STANDING-REVIEW-EXPORT-CONSENT-1` adds attributed,
bounded reusable consent and per-invocation disclosure to the existing export
contract. New candidate commits and fresh selected evidence inside the approved
areas must reuse the same decision. Changed project, recipient, purpose or
data areas require a scope decision; revocation must remain effective. A local
record is not cryptographic human proof and never grants host approval.

The direct follow-up must use the supported approval mechanism and disclose
the actual project, declared recipient and selected input paths. A further
host rejection stays visible and must not be bypassed. Full Access, weaker
sandbox controls, fabricated consent, automatic PASS, publication and installed
plugin replacement are not part of this repair.
