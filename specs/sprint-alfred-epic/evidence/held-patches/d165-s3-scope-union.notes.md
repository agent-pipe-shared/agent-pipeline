# D165 S3 held patch: brownfield migration scope covers the class 9 inputs

Dispatch W6-D165-S3B-SCOPEUNION-C1-20261026 (continuation of W6-D165-S3-SCOPEUNION-20261026). Backlog item
2026-10-26-brownfield-architecture-gate-never-passes, D2. Criterion AC-127. Targeted delivery: green; batch Critic,
full Verify and PO acceptance pending. Held patch: `d165-s3-scope-union.patch` (git diff --binary against repository HEAD
4832448b8d4804431bcbf9d5291f22bf492fe71c), nothing under plugins/ was edited in the repository.

## Cause

A legacy deferred adoption carries a user-chosen scope (for example `src/`). The D162 migration built its `prepare --scope`
arguments from that scope alone, so the approved-scoped adoption never covered the class 9 inputs
(`architecture/map`, `pipeline.user.yaml`, `project/pipeline.json`) and the architecture gate could not pass.

## Change (six patch-internal paths, all under plugins/pipeline-core/)

- `lib/architecture-adoption-authority.mjs` (after `scopeValue`): `export const CLASS9_REQUIRED_SCOPE` (frozen, the three
  paths above) and `export function withClass9RequiredScope(scope)` returning the sorted, exact-string de-duplicated union of
  the given scope (array, single value, or empty/undefined) with the constant.
- `scripts/architecture-adoption.mjs`: import `withClass9RequiredScope`; the migration `prepare` args use
  `withClass9RequiredScope(legacyScope)`. `proposal.migration.scope` stays the legacy scope by design.
- `lib/architecture-entry-readiness.mjs`: import `withClass9RequiredScope`; the prepare scope loop iterates
  `withClass9RequiredScope(scopeEntries.map(String))`.
- Tests: `scripts/architecture-adoption.test.mjs` (3 D165-S3 cases + namespace import `class9Authority`),
  `lib/architecture-entry-readiness.test.mjs` (1 case), `scripts/architecture-fitness.test.mjs` (1 case).

## Changed existing case (with justification)

`scripts/architecture-adoption.test.mjs`, "D162 S2: a legacy deferred record yields a proposal that names scope and the
three migration steps": the expected prepare args changed from `--scope lib/ --scope src/` to the sorted union
`--scope architecture/map --scope lib/ --scope pipeline.user.yaml --scope project/pipeline.json --scope src/`. This is
exactly the AC-127 / D2 requirement (migration scope always covers the class 9 inputs); the legacy-scope assertions on
`proposal.migration.scope` are untouched.

## Preimage SHA-256 (HEAD blobs, before the patch)

- plugins/pipeline-core/lib/architecture-adoption-authority.mjs eb43c302e078d9b1e24b579b2859e86923b010110e41cf5b38f56b1f57098905
- plugins/pipeline-core/lib/architecture-entry-readiness.mjs 21dafd8451c1d3957ca9e6a338a410fb03b7379da912657556e4bab8a7b4e496
- plugins/pipeline-core/lib/architecture-entry-readiness.test.mjs 6e012c4dfba57a28755ea293ba46d5ae03ea4b13f7ae8e21e364194f9e06b3ea
- plugins/pipeline-core/scripts/architecture-adoption.mjs 65345a377e382d8c5dd9409d55ca04710c78dacdf171e8b60c13ce18b02ddc10
- plugins/pipeline-core/scripts/architecture-adoption.test.mjs 5d66e15da1c26129cd512c2f3bb5d840f7680a6f6360c77dfb9dc8c8c848a74b
- plugins/pipeline-core/scripts/architecture-fitness.test.mjs 7826f4aa1e5da2c1370a465dfefa81a3585a99ee6156fdb39e4970a5dfda4868

## Evidence (scratch clone, driver `node --test`)

RED (before production edits): adoption 55 tests / 52 pass / 3 fail; entry-readiness 38 / 37 / 1; fitness 59 / 58 / 1.
GREEN (after): adoption 55/55; entry-readiness 38/38; fitness 59/59; brownfield pin 14/14; kernel-closure 1/1; all exit 0.
Apply check: `git apply --check` of the patch on a fresh clone of HEAD exit 0. Patch: 11257 bytes, 6 files, 70 insertions, 3 deletions.

## Proposed commit message

`fix(architecture): widen the brownfield migration scope to the class 9 inputs`

## Operator flow

1. Apply the diff: `git apply specs/sprint-alfred-epic/evidence/held-patches/d165-s3-scope-union.patch`
2. `git add -u`
3. Commit with `--no-verify` (plugin source is stamped after the commit).
4. Stamp, then install.
