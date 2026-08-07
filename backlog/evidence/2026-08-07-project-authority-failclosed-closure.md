# Closure evidence: pipeline.project-authority-dual-state-repair-and-failclosed-gate

**Closed:** 2026-08-07 · **Commit:** `1f070c91743b7340c59ea5836286cd632bb0eba8` (`sprint_phoenix`)

## What was done

`po-gate-authority.mjs`'s `activeFeatureState` now returns a dedicated
`"unavailable"` status for any non-`"ready"` `resolveProjectAuthorityPaths`
result (mixed, missing, unsafe, migration-required), mapped to
`PO-GATE-STATE-AUTHORITY-UNAVAILABLE` in `validatePoGateAuthority`. The
`"ready"` path is unchanged. Permanent regression coverage added in
`po-gate-authority.test.mjs`.

Produced by a Goldfish-deep dispatch (`WP1-po-gate-failclosed`) in an
isolated worktree (commit `f8121a5`), then cherry-picked onto `sprint_phoenix`
as `1f070c9` after verifying the touched files were byte-identical between
the worktree's base and `sprint_phoenix`'s tip.

## Verification

- `node plugins/pipeline-core/lib/po-gate-authority.test.mjs` → 39/39 passed, exit 0
- `node plugins/pipeline-core/lib/project-authority.test.mjs` → 25/25 passed, exit 0 (confirms this file was NOT touched)

## Companion finding

Investigated whether Phoenix's separate dual-state repair tool (formerly in
`project-authority.mjs`) is still needed: **no** — main's
`project-authority.mjs` already has an equivalent
(`planProjectAuthorityMigration`/`applyProjectAuthorityMigration`) covering
both the `"migration-required"` and `"mixed"` cases with the same
durable-journal/transaction-recovery discipline. No repair tool was built;
none is needed.
