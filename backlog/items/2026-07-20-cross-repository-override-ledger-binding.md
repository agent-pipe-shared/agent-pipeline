---
type: workflow-improvement
status: new
created: 2026-07-20
source: Public V3 Foundation close residue review
owner: Pipeline Elephant
due: 2026-07-27
expires: 2026-08-03
---

# Bind guard-override audit storage to the target repository

## Description

A guarded cross-repository Git operation can resolve its command target correctly
while the one-time override ledger still binds to the coordinator checkout. The
override remains auditable, but the wrong repository may receive command text or
target coordinates that do not belong in its committed boundary.

## Triggering situation

The Public V3 Foundation close used a PO-confirmed, one-time override for a
normal private-overlay `main` fast-forward. The command reached the intended
target, while the local ledger was initially created in the coordinating Public
checkout. The entry was detected before staging and preserved only in the
private target's ignored local runtime area; no private value entered Public
history.

## Affected artifact

The Git guard's cross-repository target resolution, override-ledger placement,
sanitization boundary, and deterministic tests.

## Proposal

Make the override mechanism derive its ledger root from the same normalized and
validated repository binding used for the guarded Git operation. The package
must:

- bind command evaluation, token consumption, and ledger append to one physical
  target repository;
- fail closed before the operation when the target ledger cannot be written;
- avoid copying raw cross-repository command text, local paths, remotes, or
  private coordinates into a coordinating Public checkout;
- retain one-time token semantics and a sanitized public-safe disposition; and
- add positive and negative tests for ordinary commands, absolute and relative
  `git -C` targets, mismatched coordinator and target roots, missing target
  ledgers, and replayed tokens.

No test or remediation may weaken protected-ref rules or make an override
implicit. The existing double-confirmation contract remains mandatory.

## Ownership and expiry

The next Pipeline Elephant owns triage and an accepted implementation package.
The triage due date is **2026-07-27**. If no decision is recorded by
**2026-08-03**, this item expires and must be renewed with current Public
evidence rather than silently retained.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
