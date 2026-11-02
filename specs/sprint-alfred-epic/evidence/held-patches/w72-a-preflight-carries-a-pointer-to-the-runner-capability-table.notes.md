# w72 — the start preflight carries a pointer to the runner capability table (candidate 17)

Applies after w71 (needs w70, which ships `scripts/runner-capabilities.mjs`) and before the derived-files commit.

## What it changes

- `scripts/pipeline-start-preflight.mjs`: the ready envelope gains one small field, `runnerCapabilities: { schema: "pipeline.runner-capabilities.v1", read: "scripts/runner-capabilities.mjs" }`.
  It is a pointer only. The table stays in `config/runner-capabilities.json` and is read on demand, so the pinned and size-budgeted readback does not grow by the table and no unmeasured Codex or
  Antigravity cell is pinned into it. PO decision of 2026-11-02 (pointer line, not the table).
- `scripts/pipeline-start-preflight.test.mjs`: the exact envelope key list gains `runnerCapabilities`, and the effective-decisions case asserts the pointer on all three runners and that the named reader ships.

## Checks

- Preflight suite, payload-budget suite, start-skill suite and the capability suite: 112 of 112 pass in the slice clone built on the w71 state.
- No other file mirrors the envelope fields (searched the plugin, harness and docs for `effectiveDecisions`).

## Not changed / not proven

- The field carries no cell values, so it states nothing about Codex or Antigravity behaviour.
- The full Verify run was not made.
