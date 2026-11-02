# w70 — the runner capability table is one JSON source, and the suites added by w61, w65 and w70 are registered (candidate 17)

Applies LAST, after w69 and before the derived-files commit: it edits `harness/verify-suites.json` and `docs/product-capability-inventory.json`, which the derived-files refresh then reads.

## Two things in one patch

1. **Suite registration, a defect in the earlier slices.** `harness/scripts/check-verify-suite-registration.test.mjs` fails on the applied chain: `lib/root-argument.test.mjs` (w61, extended by w69) and
   `lib/pins/happy-path-guide-names-only-existing-scripts.test.mjs` (w65) are `*.test.mjs` files under a registered root with no registration entry, and the early inventory check wants each registered suite assigned to
   exactly one capability. The slice rehearsals never ran that check, because it needs the whole chain. Found by running it on the fully applied rehearsal clone. This patch adds the suite entries to
   `verify-suites.json` and assigns the three surfaces (the two above plus the new capability suite) to the same capability that already lists the neighbouring suites, in sorted position.
2. **The capability table as one machine-readable source.** `config/runner-capabilities.json` holds the per-runner table that w68 put in the happy-path guide, one row per topic with a cell per runner and an owner;
   `scripts/runner-capabilities.mjs [--runner <runner>]` prints it read-only. It is deliberately NOT part of the start preflight envelope: that readback is pinned and size-budgeted for all three runners, and the
   cells are not measured on Codex or Antigravity. The suite checks the schema, that owners that name plugin files ship, the CLI, and that the guide table is the row-for-row projection of the JSON, so the two cannot drift.
   The guide gets one sentence pointing at the script.

## Checks

- Registration check passes on the chain with this patch; the new suite, the guide pin and the helper test pass (10 tests), plus the start-skill suite. Mutation: changing one JSON cell turned the projection case red; restored.

## Not changed / not proven

- Not wired into the preflight readback (see above); that stays a PO decision.
- Cells are unchanged from w68 and carry the same limits: sourced from held patches and shipped documents, not from runs on Codex or Antigravity.
- The full Verify run was not made; only the registration, inventory-assignment and the touched suites were run.
