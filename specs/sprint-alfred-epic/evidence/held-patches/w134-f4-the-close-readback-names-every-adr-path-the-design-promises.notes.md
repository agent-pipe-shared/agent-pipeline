# w134 — the close quality readback names every ADR path the design promises (candidate 19, F4)

Applies on top of the chain at w133. Criterion binding: AC-108 is the closest existing accepted criterion; the PRD and the Spec are unchanged.

## What it adds

- `lib/close-quality-readback.mjs`: a new injected reader `promisedAdrPaths()` (array of repository-relative ADR paths the design names, or null). Row rule for `adr-decision`, checked before the typed impact:
  - non-empty array and every path exists (via `exists`): `present`, evidence lists the checked paths;
  - non-empty array and any path absent: `missing`, remedy lists the missing paths and names the `architecture-decision` skill, even when the typed impact is `not-applicable`;
  - reader absent, throwing, null, or an empty array: the previous behaviour from the typed impact, unchanged (no new `unknown`).
  The header rule list and reader contract carry the new rule. The readback stays report-only; it never blocks the close.
- `scripts/close-coordinator.mjs` (`readQualityRows`): the real reader loads the module map (`loadMapBundle`, `architecture/map/*.md`), where each module records `adrReferences`, and returns the sorted unique safe relative paths named there; null when the map cannot be loaded.
- `lib/close-quality-readback.test.mjs`: the existing adr-decision case is extended (no new `test(` case): all present with a not-applicable impact, one missing path (remedy names the path and the skill), and absent/throwing/null/empty reader leaving every impact outcome unchanged.

## Checks

- `close-quality-readback.test.mjs`: 8 of 8 pass (the extended case was red before the production edit).
- `close-coordinator.test.mjs` run alone in the clone: see the dispatch report.

## Not changed / not proven

- The design package schema and the `adrReferences` field shape are untouched. The reader takes `adrReferences` from the materialized module map, not from the PRD prose; a project without a loadable map gets today's behaviour.
- No coordinator-level case drives the real reader against a map on disk; the reader is a thin wrapper over the existing loader.
- If `exists` throws for a promised path the row falls back to the impact-based outcome.
- The full Verify run was not made.
