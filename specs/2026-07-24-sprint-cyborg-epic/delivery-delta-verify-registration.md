# Cyborg Verify-registration delivery delta

## Scope

This delivery delta registers the already-delivered CYB-2, CYB-5, CYB-8, and
CYB-9 contract suites in the common Verify gate and binds those phases to the
product capability inventory. It does not alter the contracts themselves or
weaken any existing gate.

## Recovery

If the registration causes a reproducible Verify regression, revert the two
registration commits in reverse order:

1. `212f183` — removes the capability-inventory bindings.
2. `6c597b1` — removes the five Verify registrations.

Keep `70e3608` in place: it replaces the obsolete CYB-2 fixture placeholder
with the real evaluator and is independently covered by its focused contract.

After a rollback, run `node harness/scripts/verify.mjs` and confirm that the
machine-written Verify and Security receipts bind the resulting clean
candidate. Re-introduce the registrations only with a corrected inventory
binding, fresh exact evidence, and a diff-scoped Critic review.
