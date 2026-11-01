# Held patch notes — the architecture push refusal test pins the stale contract and concept map paths (N25, candidate 15c)

Patch: `w29-architecture-push-refusal-test-pins-the-stale-contract-and-concept-map-paths-n25.patch`. Test only, one file (`hooks/guard-push-architecture.test.mjs`), independent of the other 15c patches. Item 2 (last clause) of `pipeline.candidate11-follow-ups`: the case pinned only the refusal header, not the named contract paths.

## What

The existing header assertion is extended in place (no new `assert.` occurrence, so no pinned count moves): the strict-push refusal must name the header, then the stale public contract (`src/contract.mjs`), then the concept map that declares it (`architecture/map/core.md`), in that order.

## Evidence

- guard-push-architecture case and the case-completion suite: 33/33.
- Mutation: replacing the formatted refusal lines in `guard-push.mjs` with nothing turns the case red (the output is only the header line).

## Not covered

- The other halves of item 2 (the currency check as a Verify phase, an early refusal of an unverifiable adopted map) need the protected `harness/scripts/verify.mjs` and stay open.
