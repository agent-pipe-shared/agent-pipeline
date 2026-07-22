# Stateful design contract — implementation plan

## Scope

Implement a fail-closed documentation contract for
`pipeline.stateful-design-contract-template`. The contract checks the two
canonical stateful-design surfaces, `templates/spec.md` and
`roles/elephant.md`, for the nine Sentinel checklist requirements: authority
issuer/replay, durable storage/atomicity, resource/phase crash-state matrix,
mutation and kernel/controller enforcement, bootstrap/self-update,
candidate/evidence binding, exact pre/post bytes, sole recovery authority, and
self-reference audit.

The checker must reject an absent required surface and checklist text hidden in
non-operative Markdown regions. Generic fixture repositories that do not
identify as the pipeline repository remain outside this repository-specific
contract.

## Non-goals

This package does not change runtime enforcement, Backlog item status,
transitions, release state, or Sentinel closure. It does not claim that an
individual future Spec is complete; it enforces only the template and Elephant
contract surfaces.

## Evidence and rest gates

The candidate must pass the focused documentation-contract tests, the
registered `doc-contract-tests` and `doc-contract-check` Verify steps, the
full Verify/security evidence, and an independent Critic review. A future
item transition additionally requires AC-level candidate evidence and a
sanctioned Ledger transition; neither follows from this package alone.

## Rollback

The change is reversible without migration or external side effects: revert
the package commits that modify `harness/scripts/check-doc-contracts.mjs` and
`harness/scripts/check-doc-contracts.test.mjs`, then run the registered
documentation-contract tests and Full Verify on the reverted candidate. No
feature flag, persistent state, or production migration is involved.
