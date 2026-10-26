# D165 PF-75 slice A: optional declarationCommit for the shared review-unit reader (held patch)

Dispatch W6-D165-PF75-A-20261026, candidate 29ab5be070129a1bd8e0827becdc0e0b1e629cf1. Patch: `d165-pf75-a-declaration-commit.patch` (git diff --binary against HEAD; touches only the two files below).

## Cause
`reviewUnitSource` read the review-unit declaration, the blob comparison and the spec text at `d.baseCommit`, so a unit declared after the review base could never be bound.

## Change (lib/critic-generic-batch.mjs, function reviewUnitSource and export readCriticReviewUnit)
- New optional input `declarationCommit` (full 40/64-hex OID, default `d.baseCommit`). Not-OID, non-commit or missing object fails CGB-REVIEW-UNIT-BINDING.
- The reference lookup (was line 273), `git show` of the declaration (was 277) and the spec text (was 285) read at `declarationCommit`; the blob comparison (275) compares declarationCommit vs candidate.
- New ancestor check declarationCommit -> candidate placed before the unchanged base-ancestor check (was 295); a non-ancestor fails CGB-REVIEW-UNIT-BINDING (the briefing named no code; this one was chosen).
- `readCriticReviewUnit` shape accepts the key `declarationCommit` only when present. Returned range base and the line-295 check are unchanged; with the option absent behaviour and error codes are unchanged.
- Tests: five cases CGB018-CGB022 (prefix D165-PF75A) appended after CGB017 so existing case ids are not renumbered; the completion id list gained CGB018..CGB022 and the import gained readCriticReviewUnit.

## Preimage SHA-256 (at HEAD)
- `plugins/pipeline-core/lib/critic-generic-batch.mjs`: fa78dee5e74e4a0c90645f6165f38cf8ec9f5ac41ffe00adae36062b986b3b0b
- `plugins/pipeline-core/lib/critic-generic-batch.test.mjs`: 93b02120b36bb8afed4f964a54b8363ad35dddceeba68230517541c6dc63a10b

## Diff stat
```
plugins/pipeline-core/lib/critic-generic-batch.mjs | 15 ++++--
 .../lib/critic-generic-batch.test.mjs              | 56 +++++++++++++++++++++-
 2 files changed, 65 insertions(+), 6 deletions(-)
```

## Counts (clone, after the change)
- critic-generic-batch.test.mjs: ℹ tests 22; ℹ pass 22; ℹ fail 0 (before the change: 17 pass; RED run: 17 pass, 5 new fail)
- guard-maintenance-window-kernel-closure.test.mjs: guard-maintenance-window-kernel-closure: 11 passed, 0 failed
- git apply --check in a fresh clone of HEAD: exit 0

## Proposed commit message
feat(critic): accept an optional declaration commit in the review-unit reader

Co-located note: case ids CGB018-CGB022 are new; the suite registration lists cases by position, so a suite count pinned elsewhere may need the same update.
