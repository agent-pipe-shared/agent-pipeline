# A1 Verify registration preparation

Status: preparation only. This file proposes a later PO TP-3 maintenance act;
it does not edit `harness/scripts/verify.mjs`, the capability inventory, or
any exclusion table.

## Proposed registration

Exact `TEST_SUITES` entry:

```js
{ name: "enforcement-conformance-tests", file: join(pluginScriptsDir, "enforcement-conformance.test.mjs") },
```

The repository's `verifyMembers()` discovery uses the suite name verbatim.
Therefore the exact derived product surface is:

`verify-phase:harness/scripts/verify.mjs:enforcement-conformance-tests`

The honest existing owner is capability `deterministic-verification` in
`docs/product-capability-inventory.json`; it already owns the Verify-phase
surface family and should receive this surface in the same PO maintenance
change. The mapping is proposed, not applied or accepted here. If the PO
does not accept that ownership, a mapping decision is required before
registration; leaving the surface uncategorized is not a valid green state.

## Preview, readback, and verification commands

Before the maintenance act, inspect the exact source and derived surface:

```text
node --check harness/scripts/verify.mjs
node plugins/pipeline-core/scripts/check-suite-registration.mjs --json
node harness/scripts/check-product-capability-inventory.mjs --print-discovered
```

The attended TP-3 operator route must preview the pending registration and
read back the resulting source before applying it. The existing
`apply-pending-protected-edits.mjs` does not currently contain an A1 payload,
and its `PREVIEWABLE` set excludes the `verify` key. Consequently,
`--preview --only=verify` would silently preview no A1/Verify step and must
not be used as evidence. Its `--check --only=verify` mode checks only that
script's current registration payload; it does not check A1.

```text
node harness/scripts/apply-pending-protected-edits.mjs --check --only=verify
```

Before mutation, an attended operator must review and incorporate the exact
A1 payload into a sanctioned TP-3 mechanism (the existing batch script after
its payload is explicitly extended, or another sanctioned exact-byte route).
The precondition/readback is mechanical: the proposed transformed
`verify.mjs` bytes must contain exactly the entry shown above, and the
capability inventory change must contain exactly
`verify-phase:harness/scripts/verify.mjs:enforcement-conformance-tests`, before
any protected file is written. A missing, duplicate, or merely described
entry aborts the act. This preparation has not modified the current payload.

After the PO act, run and read back:

```text
node --test plugins/pipeline-core/scripts/enforcement-conformance.test.mjs
node plugins/pipeline-core/scripts/check-suite-registration.mjs --json
node harness/scripts/check-product-capability-inventory.mjs --check-reachability
node harness/scripts/check-doc-contracts.mjs --root .
```

Finally run the full Verify gate against the exact unchanged candidate and
confirm its evidence binds that candidate. No signing command is invented or
executed here.

## Debt distinction and rollback

The fresh A1 debt is only `plugins/pipeline-core/scripts/enforcement-conformance.test.mjs`.
The authoritative harness checker separately declares seven expiring
exclusions with reason, owner, and expiry; the legacy standalone scanner still
reports four currently unregistered baseline paths. Those baseline paths are
pre-existing and are not Alfred-created. A1 must not be hidden by editing
either list or by adding an undated exclusion.

Rollback triggers are a missing/duplicate suite name, a derived surface that
does not equal the proposed ID, an uncategorized capability surface, a failed
direct suite, candidate drift, or any Verify evidence not bound exactly to the
reviewed candidate. The PO/operator reverts the exact maintenance commit (or
restores the pre-act bytes through the attended protected-edit mechanism),
then re-runs syntax, registration, capability reachability, the direct suite,
and full Verify before reconsidering registration. A1-2 must stabilize before
this act is performed.
