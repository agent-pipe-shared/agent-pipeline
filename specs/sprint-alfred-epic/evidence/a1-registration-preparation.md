# A1/C1 Verify registration preparation

Status: preparation only. This file proposes a later PO TP-3 maintenance act;
it does not edit `harness/scripts/verify.mjs`, the capability inventory, or
any exclusion table.

The accepted A1 option-1 suite-plus-capability coupling remains standing.
C1 is additional required registration scope in the same proposed maintenance
change; no specific combined payload is claimed PO-approved or performed.
The act remains open. No new design choice is requested by this handoff.

Current readback on 2026-09-06, at source candidate
`a87677726d7d451862585b8e4870ddebb1325c4d`: the authoritative command
`node harness/scripts/check-verify-suite-registration.mjs` exits 2 with
exactly two unregistered suites (A1 and C1), four honoured exclusions, zero
malformed exclusions, and zero expired exclusions
(`evidence/alfred-registration-current.log`). The capability reachability command
`node harness/scripts/check-product-capability-inventory.mjs --check-reachability`
exits 0 (`evidence/alfred-capability-readback.log`). The earlier schema-revision-2
readback had one unregistered suite (A1), four honoured exclusions and zero
malformed/expired exclusions; those are historical counts. Full Verify at the
exact clean source candidate above exits 2 solely for suite registration:
506 steps, other 505 including security exit 0. See
[C1 evidence](c1-core-verification.md) for binding and logs; this is historical
source evidence, not verification of the later documentation HEAD.

## Proposed registration

Exact proposed `TEST_SUITES` entries, using the existing directory bindings:

```js
{ name: "enforcement-conformance-tests", file: join(pluginScriptsDir, "enforcement-conformance.test.mjs") },
{ name: "interruption-receipts-tests", file: join(libDir, "interruption-receipts.test.mjs") },
```

The repository's `verifyMembers()` discovery uses the suite name verbatim.
Therefore the exact derived product surfaces are:

`verify-phase:harness/scripts/verify.mjs:enforcement-conformance-tests`

`verify-phase:harness/scripts/verify.mjs:interruption-receipts-tests`

The honest existing owner is capability `deterministic-verification` in
`docs/product-capability-inventory.json`; it already owns the Verify-phase
surface family and should receive both `surfaceIds` in the same PO maintenance
change. Read-only inspection found neither proposed suite name nor derived
surface already present. The mapping is proposed, not applied or accepted here. If the PO
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
`apply-pending-protected-edits.mjs` does not currently contain an A1/C1 payload,
and its `PREVIEWABLE` set excludes the `verify` key. Consequently,
`--preview --only=verify` would silently preview no A1/Verify step and must
not be used as evidence. Its `--check --only=verify` mode checks only that
script's current registration payload; it does not check A1.

```text
node harness/scripts/apply-pending-protected-edits.mjs --check --only=verify
```

Before mutation, an attended operator must review and incorporate the exact
A1/C1 payload into a sanctioned TP-3 mechanism (the existing batch script after
its payload is explicitly extended, or another sanctioned exact-byte route).
The precondition/readback is mechanical: the proposed transformed
`verify.mjs` bytes must contain exactly both entries shown above, and the
capability inventory change must contain both exact `surfaceIds` above under
`deterministic-verification`, before
any protected file is written. A missing, duplicate, or merely described
entry aborts the act. This preparation has not modified the current payload.

After the PO act, run and read back:

```text
node --test plugins/pipeline-core/scripts/enforcement-conformance.test.mjs
node --test plugins/pipeline-core/lib/interruption-receipts.test.mjs
node harness/scripts/check-verify-suite-registration.mjs
node plugins/pipeline-core/scripts/check-suite-registration.mjs --json
node harness/scripts/check-product-capability-inventory.mjs --check-reachability
node harness/scripts/check-doc-contracts.mjs --root .
```

Finally run the full Verify gate against the exact unchanged candidate and
confirm its evidence binds that candidate. No signing command is invented or
executed here.

## Debt distinction and rollback

The current Alfred debt comprises
`plugins/pipeline-core/scripts/enforcement-conformance.test.mjs` and
`plugins/pipeline-core/lib/interruption-receipts.test.mjs`.
Historically, the authoritative harness checker declared seven expiring
exclusions with reason, owner, and expiry; the legacy standalone scanner still
reported four unregistered baseline paths at that earlier checkpoint. Those baseline paths are
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
